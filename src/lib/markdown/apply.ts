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

	const landing = (title: string) =>
		title === '' && liveGroups(doc)[0] ? liveGroups(doc)[0].title : title;

	const wouldAdd = parsed.groups.reduce(
		(total, group) =>
			total + group.tasks.filter((t) => !seen.get(landing(group.title))?.has(t.text)).length,
		0
	);
	const newGroups = parsed.groups.filter((g) => !titles.has(landing(g.title))).length;

	if (countTasks(doc) + wouldAdd > LIMITS.tasks) {
		return { doc: base, added: 0, skipped: 0, refused: 'tasks' };
	}
	if (countGroups(doc) + newGroups > LIMITS.groups) {
		return { doc: base, added: 0, skipped: 0, refused: 'groups' };
	}

	let added = 0;
	let skipped = 0;

	const [first] = liveGroups(doc);

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
