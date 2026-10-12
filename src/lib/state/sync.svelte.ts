import { derive, newCode, normaliseCode, type Room } from '$lib/crypto/derive';
import { canonical } from '$lib/doc/canonical';
import { merge } from '$lib/doc/merge';
import type { Doc } from '$lib/doc/types';
import { parseDoc } from '$lib/doc/validate';
import { t } from '$lib/i18n';
import { pull, syncNow, type SyncOutcome } from '$lib/sync/client';
import { errorText, trace } from '$lib/sync/trace';
import { sheet } from './doc.svelte';
import { keysFor, persist, read, remove, write, type ListKeySet } from './storage';

/**
 * What the corner button draws: nothing when synced, an outbox arrow when
 * edits are waiting, a crossed circle when the list could not be reached.
 *
 * `offline` outranks the other two — there is no point offering to send when
 * nothing can leave.
 */
export type SyncStatus = 'synced' | 'pending' | 'offline';

/** Long enough that a double tap costs one request, not two. */
export const COOLDOWN_MS = 10_000;

/**
 * Long enough since the last sync that offering one is worth the space.
 *
 * Nothing syncs on its own, so a list left open all morning is exactly as old
 * as when it was opened. This is the one nudge, and it is a button appearing —
 * not a banner, and not a sync happening.
 */
export const STALE_MS = 600_000;

export class SyncState {
	code = $state<string | null>(null);
	status = $state<SyncStatus>('pending');
	busy = $state(false);
	message = $state<string | null>(null);

	/** Set when a sync last completed, so the cooldown can be shown ticking down. */
	lastSyncAt = $state(0);
	now = $state(0);
	loaded = $state(false);

	/** Which list's keys this device is currently syncing. */
	#keys: ListKeySet = keysFor(null);
	#room: Room | null = null;
	#etag: string | null = null;
	/*
	 * Set when an attempt actually failed to reach the list, and cleared only by
	 * one that succeeded.
	 *
	 * `navigator.onLine` is not enough on its own: it says the device has a
	 * network, not that the list is at the end of it. A dead deployment on good
	 * wifi is online by that measure, so without this the mark would flip back
	 * to an outbox on the next edit — or on the next tick of the clock — and
	 * quietly unsay what the last attempt found out.
	 */
	#unreachable = $state(false);
	/*
	 * Reactive: `unsent` compares against this, so a sync that changes only the
	 * snapshot — and not the document — still has to update the mark.
	 */
	#lastSynced = $state.raw<Doc | null>(null);

	/**
	 * The count the SYNC panel shows. It is the honest version of the status
	 * mark: not "something changed" but "this many things have not left this
	 * device".
	 *
	 * A sheet nobody has written on has nothing waiting, whatever is drawn on
	 * it. The opening group is the shape of an empty sheet, and counting it told
	 * someone who had just arrived that a change of theirs was waiting to go.
	 */
	unsent: number = $derived(sheet.written ? countUnsent(sheet.doc, this.#lastSynced) : 0);

	/**
	 * Long enough that a double tap costs one request rather than two. `now` is
	 * ticked by whatever is showing the cooldown, so it clears on its own.
	 */
	cooling: boolean = $derived(this.now - this.lastSyncAt < COOLDOWN_MS);

	/** Whether it has been long enough to be worth offering a sync. */
	stale: boolean = $derived(this.now - this.lastSyncAt > STALE_MS);

	/** Seconds left, for the panel to show rather than leaving a dead button. */
	coolingFor: number = $derived(
		Math.max(0, Math.ceil((COOLDOWN_MS - (this.now - this.lastSyncAt)) / 1000))
	);

	/**
	 * Reads what is already here. It does not make a code.
	 *
	 * A list that has never been synced has no code, because a code is the
	 * address of something on the server and there is nothing there. Making one
	 * on arrival meant opening the page wrote a secret to the device and showed
	 * it, for someone who had not yet written a word.
	 */
	load(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.#loadFrom(keysFor(null));
	}

	/** Re-points sync at a different list's keys. Always runs, unlike `load()`. */
	switchTo(keys: ListKeySet): void {
		this.loaded = true;
		this.#loadFrom(keys);
	}

	#loadFrom(keys: ListKeySet): void {
		this.#keys = keys;

		const stored = read(keys.code);
		this.code = stored ? normaliseCode(stored) : null;

		this.#room = null;
		this.#etag = read(keys.version);
		this.#lastSynced = parseDoc(read(keys.synced) ?? '');
		this.#unreachable = false;
		this.message = null;
		this.refresh();
	}

	/**
	 * Recomputes the mark. Cheap, and called after every edit.
	 *
	 * It must not touch `now`. This runs inside an effect that depends on the
	 * document, and a `$state` setter reads the old value to compare — so
	 * writing the clock here made the effect both read and write `now`, and
	 * since `Date.now()` differs every time it never settled. Svelte tore the
	 * whole tree's reactivity down with effect_update_depth_exceeded, which is
	 * why a completed join left the menu sitting open, doing nothing.
	 *
	 * The clock belongs to whatever is showing the cooldown tick down.
	 */
	refresh(): void {
		const noNetwork = typeof navigator !== 'undefined' && navigator.onLine === false;

		if (noNetwork || this.#unreachable) {
			this.status = 'offline';
			return;
		}
		this.status = this.unsent === 0 && this.#lastSynced !== null ? 'synced' : 'pending';
	}

	/**
	 * Joins someone else's list. The caller decides first whether to carry the
	 * local tasks across or discard them — never silently.
	 *
	 * The code is fetched before anything local is touched: `keep: false` is
	 * a real discard, and doing that ahead of the request used to mean a
	 * code that was offline, wrong, or damaged still cost the tasks already
	 * on this device — the join failed and they were gone anyway. That one
	 * fetch is also the only one: it is handed straight to `#run()` as
	 * `prefetched` rather than pulled a second time, which would open its own
	 * window — this fetch succeeding and a second one failing afterwards,
	 * leaving a wiped local doc with nothing to replace it.
	 */
	async join(input: string, keep: boolean): Promise<SyncOutcome | null> {
		const code = normaliseCode(input);
		if (!code) return null;
		if (this.busy) return null;

		this.busy = true;
		this.message = null;
		trace(`join (${keep ? 'keep' : 'discard'})`);

		try {
			// Derived lazily: PBKDF2 at 300,000 iterations is deliberately slow, so
			// its cost lands on an explicit tap rather than on first paint.
			const room = await derive(code);
			const pulled = await pull({
				roomId: room.roomId,
				key: room.key,
				writeToken: room.writeToken,
				local: sheet.doc,
				etag: null,
				lastSynced: null
			});

			if (pulled.status !== 'ok') {
				this.#apply(pulled.outcome);
				return pulled.outcome;
			}

			this.code = code;
			write(this.#keys.code, code);

			this.#room = room;
			this.#etag = null;
			this.#lastSynced = null;
			remove(this.#keys.version);
			remove(this.#keys.synced);

			if (!keep) sheet.replace({ v: 1, groups: {}, tasks: {} });

			return await this.#run({ remote: pulled.remote, v: pulled.v });
		} catch (error) {
			// Whatever this is, it must not leave someone staring at a panel that
			// silently does nothing — see it, say it, same as every outcome above.
			const outcome: SyncOutcome = { status: 'error', message: errorText(error) };
			trace(`join threw: ${outcome.message}`);
			this.#apply(outcome);
			return outcome;
		} finally {
			this.busy = false;
			this.lastSyncAt = Date.now();
			this.now = Date.now();
		}
	}

	/**
	 * Whether there is anything here worth a code.
	 *
	 * A list nobody has written on is the opening group and nothing else —
	 * scaffolding, not a list. Syncing it would put an empty document on the
	 * server and mint a code for it, so a device that had done nothing but tap
	 * New list would be handing out an address to nothing. Having a code
	 * already is enough on its own: that list has been somewhere, and pulling
	 * what others have added to it is exactly what a sync is for.
	 */
	syncable: boolean = $derived(sheet.written || this.code !== null);

	/** Everything happens here, and only when someone asks for it. */
	async sync(options: { force?: boolean } = {}): Promise<SyncOutcome | null> {
		if (this.busy) return null;
		if (!options.force && this.cooling) return null;
		if (!this.syncable) return null;

		/*
		 * The first sync is where a code comes from. Written down before the
		 * request rather than after it: a PUT that lands while the confirming
		 * read fails leaves a list on the server, and forgetting the code it is
		 * under would strand it there with no way back to it.
		 */
		if (!this.code) {
			this.code = newCode();
			write(this.#keys.code, this.code);
			void persist();
		}

		this.busy = true;
		this.message = null;
		trace('sync');

		try {
			return await this.#run();
		} catch (error) {
			const outcome: SyncOutcome = { status: 'error', message: errorText(error) };
			trace(`sync threw: ${outcome.message}`);
			this.#apply(outcome);
			return outcome;
		} finally {
			this.busy = false;
			this.lastSyncAt = Date.now();
			this.now = Date.now();
		}
	}

	/**
	 * The network round trip alone. Callers own the busy flag, the cooldown
	 * clock, and — for `join()` — confirming the code is good before this
	 * ever runs.
	 */
	async #run(prefetched?: { remote: Doc | null; v: number }): Promise<SyncOutcome> {
		// Not derived again if join() already did: `??=` is a no-op once #room
		// is set, so the 300,000-iteration cost is never paid twice for one
		// join.
		this.#room ??= await derive(this.code!);

		// What went out. The sheet stays editable for the whole round trip, so
		// whatever is on it by the time the answer comes back may be more.
		const sent = sheet.doc;

		const outcome = await syncNow({
			roomId: this.#room.roomId,
			key: this.#room.key,
			writeToken: this.#room.writeToken,
			local: sent,
			etag: this.#etag,
			lastSynced: this.#lastSynced,
			prefetched
		});

		this.#apply(outcome, sent);
		return outcome;
	}

	/**
	 * DELETE: forgets the list, the code and the key. Touches nothing remote.
	 *
	 * Wipes whatever key-set is currently active — the legacy bare keys for a
	 * single-remembered-list device, or one list's own namespaced set once
	 * there is more than one. Reloading through the same keys afterwards
	 * leaves the sheet exactly where a first-ever visit does: one quiet,
	 * unwritten opening group.
	 */
	forget(): void {
		for (const key of [
			this.#keys.doc,
			this.#keys.code,
			this.#keys.version,
			this.#keys.synced,
			this.#keys.collapsed
		]) {
			remove(key);
		}

		this.#room = null;
		this.#etag = null;
		this.#lastSynced = null;
		this.#unreachable = false;
		// Back to a device that has never synced: no code until there is a list
		// and a sync to put it under.
		this.code = null;

		sheet.forget();
		sheet.switchTo(this.#keys);
		this.refresh();
	}

	#apply(outcome: SyncOutcome, sent?: Doc): void {
		if (outcome.status === 'synced') {
			/*
			 * A tick made while the request was out is not in what came back, and
			 * replacing the sheet with the answer took it away. Only the records
			 * touched since go on top — merging the whole sheet back in would put
			 * back the tombstones collection just dropped.
			 */
			const local = sheet.doc;
			sheet.replace(
				sent === undefined || local === sent
					? outcome.doc
					: merge(outcome.doc, changedSince(sent, local))
			);

			// Reaching it is the only thing that proves it can be reached.
			this.#unreachable = false;
			this.#lastSynced = outcome.doc;
			this.#etag = `"${outcome.v}"`;
			write(this.#keys.version, this.#etag);
			write(this.#keys.synced, canonical(outcome.doc));

			this.refresh();
			return;
		}

		this.#unreachable = outcome.status === 'offline';
		this.status = this.#unreachable ? 'offline' : 'pending';
		this.message = messageFor(outcome);
	}
}

function messageFor(outcome: SyncOutcome): string | null {
	switch (outcome.status) {
		case 'offline':
			return t.sync.errorOffline;
		case 'refused':
			// Naming the code is the point: it is the only thing that says whether
			// the route is missing or its store is.
			return t.sync.errorRefused({ code: outcome.code });
		case 'wrong-code':
			return t.sync.errorWrongCode;
		case 'damaged':
			return t.sync.errorDamaged;
		case 'too-large':
			return t.sync.errorTooLarge;
		case 'busy':
			return t.sync.errorBusy;
		case 'error':
			return t.sync.errorOther({ message: outcome.message });
		default:
			return null;
	}
}

/**
 * The records `now` holds that `then` did not, by identity: every op hands back
 * a new document sharing the records it left alone, so a record that is not
 * the same object is one that was written in between.
 */
export function changedSince(then: Doc, now: Doc): Doc {
	const pick = <T>(a: Record<string, T>, b: Record<string, T>) =>
		Object.fromEntries(Object.entries(b).filter(([id, record]) => a[id] !== record));

	return { v: 1, groups: pick(then.groups, now.groups), tasks: pick(then.tasks, now.tasks) };
}

/** How many records differ from the last version that reached the server. */
export function countUnsent(local: Doc, synced: Doc | null): number {
	if (!synced) {
		return (
			Object.values(local.tasks).filter((t) => !t.deleted).length +
			Object.values(local.groups).filter((g) => !g.deleted).length
		);
	}

	let count = 0;

	for (const [id, task] of Object.entries(local.tasks)) {
		if (canonical(task) !== canonical(synced.tasks[id])) count++;
	}
	for (const [id, group] of Object.entries(local.groups)) {
		if (canonical(group) !== canonical(synced.groups[id])) count++;
	}

	return count;
}

export const sync = new SyncState();
