import { handOff } from '$lib/doc/handoff';
import { isId, newId } from '$lib/doc/id';
import * as ops from '$lib/doc/ops';
import { between } from '$lib/doc/order';
import { createClock, latest, type Ctx } from '$lib/doc/stamp';
import { emptyDoc, type Doc, type State } from '$lib/doc/types';
import { parseDoc } from '$lib/doc/validate';
import { openCount, view, type ViewGroup } from '$lib/doc/view';
import { t } from '$lib/i18n';
import { KEYS, keysFor, persist, read, write, type ListKeySet } from './storage';

/**
 * What the first group is called until someone renames it.
 *
 * This one is written into the document, unlike every other string in the app:
 * it becomes a real group title the moment anything is put on a fresh sheet,
 * and from then on it syncs, exports and merges like a title anybody typed. See
 * the note beside `doc.firstGroup` in src/lib/i18n/en.ts.
 *
 * A function, and called at the point a group is actually created, rather
 * than a constant read once at import time — which language that is has not
 * necessarily been decided yet when this module is first evaluated, since
 * `language.load()` runs later, in an effect. Reading `t` fresh here is what
 * lets a phone that turns out to prefer Greek still get Λιστούλα rather than
 * whatever `t` happened to resolve to before anyone asked it.
 */
export function firstGroupTitle(): string {
	return t.doc.firstGroup;
}

/**
 * The document, in runes, backed by localStorage.
 *
 * Writes land locally first and always — the app is fully usable with no
 * network, and sync is something the person asks for rather than something
 * that happens to them (see src/lib/sync).
 */
export class Sheet {
	/*
	 * Raw rather than deeply proxied: the document is never mutated in place —
	 * every op hands back a new one that shares its unchanged records — so a
	 * proxy over it bought nothing but a wrapper on every read, and record
	 * identity is what sync uses to find what changed while it was out.
	 */
	doc = $state.raw<Doc>(emptyDoc());
	loaded = $state(false);
	/**
	 * Whether anything has ever been written on this sheet.
	 *
	 * A sheet arrives with one group on it, and that group is scaffolding — it
	 * is not something anyone put there, and counting it made the app tell a
	 * visitor who had done nothing that one change was waiting to go.
	 */
	written = $state(false);

	#ctx: Ctx | null = null;
	/** Which list's keys this sheet is currently reading and writing. */
	#keys: ListKeySet = keysFor(null);
	/*
	 * Set while the opening group is being put in place. A sheet arrives with
	 * one group already on it, and that is scaffolding rather than something
	 * anyone wrote — writing it to storage would mean opening the page left a
	 * trace on the device without a single tap.
	 */
	#quiet = false;
	/** Asked for once, the first time there is anything worth keeping. */
	#asked = false;

	groups: ViewGroup[] = $derived(view(this.doc));
	taskCount: number = $derived(ops.countTasks(this.doc));
	groupCount: number = $derived(ops.countGroups(this.doc));
	canAddTask: boolean = $derived(ops.canAddTask(this.doc));
	canAddGroup: boolean = $derived(ops.canAddGroup(this.doc));
	open: number = $derived(openCount(this.doc));

	/** Called once the browser exists. Until then the sheet is empty. */
	load(): void {
		if (this.loaded) return;
		this.#loadFrom(keysFor(null));
	}

	/**
	 * Re-points the sheet at a different list's keys — the switcher's whole
	 * job. Unlike `load()` this always runs: switching lists is not a thing
	 * that happens once.
	 */
	switchTo(keys: ListKeySet): void {
		this.#loadFrom(keys);
	}

	#loadFrom(keys: ListKeySet): void {
		this.#keys = keys;

		this.#ctx = {
			clientId: this.#clientId(),
			clock: createClock(Number(read(KEYS.lastT) ?? 0))
		};

		const stored = read(keys.doc);
		this.doc = parseDoc(stored ?? '') ?? emptyDoc();
		this.#ctx.clock.seed(latest(this.doc));
		this.written = stored !== null;
		this.loaded = true;

		/*
		 * A fresh sheet is one group holding one empty checkbox. Every task
		 * belongs to a group, so nothing else in the app has to special-case the
		 * empty state.
		 *
		 * Stored in sentence case and displayed in caps, like every other title:
		 * the uppercase is CSS only, so the markdown export reads "## Listula"
		 * rather than shouting.
		 *
		 * Quietly: it is the shape of an empty sheet, not something anyone put
		 * there. It reaches storage on the first real edit, along with everything
		 * else.
		 */
		if (ops.liveGroups(this.doc).length === 0) {
			this.#quiet = true;
			this.addGroup(firstGroupTitle());
			this.#quiet = false;
		}
	}

	/** Replaces the whole document — used by sync and by import's replace path. */
	replace(doc: Doc): void {
		// Stamped after whatever just arrived, or the next edit loses to it.
		this.#ctx?.clock.seed(latest(doc));
		this.doc = doc;
		this.#save();
	}

	get ctx(): Ctx | null {
		return this.#ctx;
	}

	// ── groups ──────────────────────────────────────────────────────────────

	addGroup(title: string): string | null {
		const id = newId();
		return this.#apply((doc, ctx) => ops.addGroup(doc, ctx, { id, title })) ? id : null;
	}

	renameGroup(id: string, title: string): void {
		this.#apply((doc, ctx) => ops.renameGroup(doc, ctx, id, title));
	}

	moveGroup(id: string, order: string): void {
		this.#apply((doc, ctx) => ops.moveGroup(doc, ctx, id, order));
	}

	/**
	 * Removes a group and its tasks. The header only offers it once every task
	 * in the group is done, so nothing anyone is still waiting on goes with it.
	 *
	 * Returns what went, so the toast can offer it back.
	 */
	deleteGroup(id: string): { id: string; tasks: { id: string; text: string }[] } | null {
		const group = this.doc.groups[id];
		if (!group || group.deleted) return null;

		const tasks = ops.liveTasks(this.doc, id).map((t) => ({ id: t.id, text: t.text }));
		this.#apply((doc, ctx) => ops.deleteGroup(doc, ctx, id));

		return { id, tasks };
	}

	/**
	 * A whole group, carried onto another list's document.
	 *
	 * Nothing is committed here. Both documents come back for the caller to
	 * write in the order it decides, because that order is the one thing about
	 * this that matters: the list being arrived at has to be written before the
	 * list being left. A group in two places is something a person can sort
	 * out; a group in neither is writing lost.
	 *
	 * `gone` is what went, in the shape `restoreGroup` takes, so the undo puts
	 * the group back here rather than fetching it from over there.
	 */
	carryGroup(
		id: string,
		to: Doc
	): {
		from: Doc;
		to: Doc;
		gone: { id: string; tasks: { id: string; text: string }[] };
		refused: 'groups' | 'tasks' | null;
	} | null {
		if (!this.#ctx) return null;

		const group = this.doc.groups[id];
		if (!group || group.deleted) return null;

		const gone = {
			id,
			tasks: ops.liveTasks(this.doc, id).map((t) => ({ id: t.id, text: t.text }))
		};

		// The list it lands on may hold stamps from a clock ahead of this one.
		this.#ctx.clock.seed(latest(to));
		const result = handOff(this.doc, to, this.#ctx, id);
		if (!result) return null;

		return { from: result.from, to: result.to, gone, refused: result.refused };
	}

	/** Undo for the above: the group first, then everything that was in it. */
	restoreGroup(entry: { id: string; tasks: readonly { id: string; text: string }[] }): void {
		this.#apply((doc, ctx) =>
			ops.restoreTasks(ops.restoreGroup(doc, ctx, entry.id), ctx, entry.tasks)
		);
	}

	// ── tasks ───────────────────────────────────────────────────────────────

	addTask(groupId: string, text: string): string | null {
		const id = newId();
		return this.#apply((doc, ctx) => ops.addTask(doc, ctx, { id, groupId, text })) ? id : null;
	}

	/**
	 * The same, at a position rather than on the end — Enter on a task opens a
	 * fresh one directly beneath it.
	 */
	addTaskAt(groupId: string, index: number, text: string): string | null {
		const id = newId();
		const order = this.orderAt(groupId, index);

		return this.#apply((doc, ctx) => ops.addTask(doc, ctx, { id, groupId, text, order }))
			? id
			: null;
	}

	editTask(id: string, text: string): void {
		this.#apply((doc, ctx) => ops.editTask(doc, ctx, id, text));
	}

	setState(id: string, state: State): void {
		this.#apply((doc, ctx) => ops.setTaskState(doc, ctx, id, state));
	}

	moveTask(id: string, groupId: string, order: string): void {
		this.#apply((doc, ctx) => ops.moveTask(doc, ctx, id, { groupId, order }));
	}

	deleteTask(id: string): { id: string; text: string } | null {
		const task = this.doc.tasks[id];
		if (!task || task.deleted) return null;

		const entry = { id, text: task.text };
		this.#apply((doc, ctx) => ops.deleteTask(doc, ctx, id));
		return entry;
	}

	/**
	 * Sweeps done tasks — a group's own, or a run just ticked off. Returns what
	 * went, so the toast can offer it back.
	 */
	clearDone(ids?: readonly string[]): { id: string; text: string }[] {
		if (!this.#ctx) return [];

		const { doc, cleared } = ops.clearDone(this.doc, this.#ctx, ids);
		if (cleared.length === 0) return [];

		this.doc = doc;
		this.#save();
		return cleared;
	}

	restore(entries: readonly { id: string; text: string }[]): void {
		this.#apply((doc, ctx) => ops.restoreTasks(doc, ctx, entries));
	}

	/** Wipes this device. Touches nothing on the server. */
	forget(): void {
		this.doc = emptyDoc();
		this.loaded = false;
		this.written = false;
		this.#ctx = null;
	}

	// ── ordering helpers ────────────────────────────────────────────────────

	/**
	 * The fractional index for dropping a task at `index` within a group,
	 * ignoring the task being moved so it does not compare against itself.
	 */
	orderAt(groupId: string, index: number, movingId?: string): string {
		const siblings = ops
			.liveTasks(this.doc, groupId)
			.filter((t) => t.id !== movingId)
			.map((t) => t.order);

		return at(siblings, index);
	}

	groupOrderAt(index: number, movingId?: string): string {
		const siblings = ops
			.liveGroups(this.doc)
			.filter((g) => g.id !== movingId)
			.map((g) => g.order);

		return at(siblings, index);
	}

	// ── internals ───────────────────────────────────────────────────────────

	#apply(fn: (doc: Doc, ctx: Ctx) => Doc): boolean {
		if (!this.#ctx) return false;

		const next = fn(this.doc, this.#ctx);
		if (next === this.doc) return false;

		this.doc = next;
		this.#save();
		return true;
	}

	/**
	 * The one place this device writes anything down.
	 *
	 * Nothing here runs until something has actually been written on the sheet:
	 * arriving at the page and leaving again has to be indistinguishable from
	 * never having come. The client id goes down with the first save rather
	 * than when it is made, for the same reason.
	 */
	#save(): void {
		if (this.#quiet) return;
		this.written = true;

		if (this.#ctx) {
			write(KEYS.clientId, this.#ctx.clientId);
			write(KEYS.lastT, String(this.#ctx.clock.last()));
		}
		write(this.#keys.doc, JSON.stringify(this.doc));

		// There is a list now, so it is worth asking not to be evicted.
		if (!this.#asked) {
			this.#asked = true;
			void persist();
		}
	}

	/** Not written down here — `#save` does that once there is a reason to. */
	#clientId(): string {
		const existing = read(KEYS.clientId);
		return existing && isId(existing) ? existing : newId();
	}
}

/**
 * The key that lands something at `index` among `siblings`, which are already
 * in order and already have whatever is being moved taken out of them.
 *
 * The clamp is the point. Off the end, `before` and `after` both came out null
 * and `between(null, null)` answers with the *first* key there is — so a drop
 * past the last row landed at the top of the group instead. The hit test no
 * longer counts that way (see `targetAt`), but a caller that is one out should
 * be one out, not inverted.
 */
function at(siblings: readonly string[], index: number): string {
	const where = Math.max(0, Math.min(index, siblings.length));

	const before = where > 0 ? (siblings[where - 1] ?? null) : null;
	const after = siblings[where] ?? null;
	return between(before, after);
}

export const sheet = new Sheet();
