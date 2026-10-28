import { newId } from '$lib/doc/id';
import { LIMITS } from '$lib/doc/limits';
import {
	addGroup,
	addTask,
	countGroups,
	countTasks,
	deleteGroup,
	deleteTask,
	liveGroups,
	liveTasks
} from '$lib/doc/ops';
import type { Ctx } from '$lib/doc/stamp';
import type { Doc } from '$lib/doc/types';
import type { Parsed } from './from';

/**
 * IMPORT adds by default and offers replace. Duplicates in the same group are
 * skipped and counted, so the toast can say "Added 9, skipped 3 already there"
 * rather than silently doubling a list.
 *
 * Checked before it commits, so it can refuse cleanly rather than leaving the
 * sheet over the limit.
 */

export type ImportResult = {
	doc: Doc;
	added: number;
	skipped: number;
	/** Set when the import would cross a count limit. Nothing was changed. */
	refused: 'tasks' | 'groups' | null;
};

export function applyImport(
	base: Doc,
	ctx: Ctx,
	parsed: Parsed,
	mode: 'add' | 'replace'
): ImportResult {
	let doc = mode === 'replace' ? cleared(base, ctx) : base;

	// Existing text per group, so a re-import of the same list adds nothing.
	const seen = new Map<string, Set<string>>();
	for (const group of liveGroups(doc)) {
		seen.set(group.title, new Set(liveTasks(doc, group.id).map((t) => t.text)));
	}

	const titles = new Map(liveGroups(doc).map((g) => [g.title, g.id]));

	const [first] = liveGroups(doc);

	/** Where a parsed group's tasks land: items above any heading join the first group. */
	const landing = (title: string) => (title === '' && first ? first.title : title);

	/*
	 * Counted by walking the import exactly as it will be applied, so a heading
	 * that appears twice is one new group, and a task under both is one task.
	 * Counted per parsed heading instead, two `## Fruit` sections were refused
	 * as two groups at the limit, although the second only reuses the first.
	 */
	const planned = new Map<string, Set<string>>();
	let wouldAdd = 0;
	let newGroups = 0;

	for (const group of parsed.groups) {
		const title = landing(group.title);
		let texts = planned.get(title);
		if (texts === undefined) {
			const known = seen.get(title);
			if (known === undefined) newGroups++;
			texts = new Set(known);
			planned.set(title, texts);
		}
		for (const task of group.tasks) {
			if (texts.has(task.text)) continue;
			texts.add(task.text);
			wouldAdd++;
		}
	}

	if (countTasks(doc) + wouldAdd > LIMITS.tasks) {
		return { doc: base, added: 0, skipped: 0, refused: 'tasks' };
	}
	if (countGroups(doc) + newGroups > LIMITS.groups) {
		return { doc: base, added: 0, skipped: 0, refused: 'groups' };
	}

	let added = 0;
	let skipped = 0;

	for (const group of parsed.groups) {
		/*
		 * Items above the first heading go into the group already on the sheet
		 * rather than into a new nameless one beside it. Pasting a plain list is
		 * the common case, and "here are your tasks, in an untitled group under
		 * the one you were looking at" is not what anyone means by it.
		 */
		let groupId = group.title === '' && first ? first.id : titles.get(group.title);

		if (groupId === undefined) {
			groupId = newId();
			doc = addGroup(doc, ctx, { id: groupId, title: group.title });
			titles.set(group.title, groupId);
			seen.set(group.title, new Set());
		}

		const existing = seen.get(landing(group.title)) ?? new Set<string>();

		for (const task of group.tasks) {
			if (existing.has(task.text)) {
				skipped++;
				continue;
			}

			const id = newId();
			const before = doc;
			doc = addTask(doc, ctx, { id, groupId, text: task.text });
			if (doc === before) continue;

			// addTask always starts a task as to-do; the marker sets the rest.
			if (task.state !== 'todo') {
				doc = {
					...doc,
					tasks: {
						...doc.tasks,
						[id]: {
							...doc.tasks[id],
							state: task.state,
							stamps: { ...doc.tasks[id].stamps, state: doc.tasks[id].stamps.state }
						}
					}
				};
			}

			existing.add(task.text);
			added++;
		}
	}

	return { doc, added, skipped, refused: null };
}

/**
 * Everything on the sheet, deleted through the ordinary path.
 *
 * Not an empty document: a list that has been synced still holds all of this
 * on the server, and records simply absent here would merge straight back on
 * the next sync. Tombstones are what say they went. Loose ends included, since
 * those belong to no group a group delete would reach.
 */
function cleared(doc: Doc, ctx: Ctx): Doc {
	let next = doc;
	for (const group of liveGroups(next)) next = deleteGroup(next, ctx, group.id);
	for (const task of liveTasks(next)) next = deleteTask(next, ctx, task.id);
	return next;
}
