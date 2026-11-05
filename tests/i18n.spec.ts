import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../src/lib/i18n';
import { el } from '../src/lib/i18n/el';
import { en } from '../src/lib/i18n/en';
import { language } from '../src/lib/i18n/language.svelte';
import { isFirstGroupTitle } from '../src/lib/state/doc.svelte';

/*
 * The catalogue is data, so what is worth testing about it is that none of it
 * is missing and none of it is a lie — in either catalogue, not only the one
 * that existed first.
 *
 * Two rules. Every plain string says something. And every string that is a
 * function of a count has actually been called with both a one and a many —
 * which is the only way a plural is ever wrong, and the only kind of mistake
 * a type checker cannot see. The table below is what makes the second rule
 * bite: a function added to the catalogue without an entry here fails the
 * suite by name, rather than sitting untested until somebody reads `1 tasks`.
 */

type Node = string | ((arg: never) => string) | { [key: string]: Node };

/** Every leaf in a catalogue, as `section.name`. */
function walk(node: Node, path: string[] = []): { path: string; leaf: Node }[] {
	if (typeof node === 'string' || typeof node === 'function') {
		return [{ path: path.join('.'), leaf: node }];
	}

	return Object.entries(node).flatMap(([key, value]) => walk(value, [...path, key]));
}

/**
 * Every function in the catalogue, with arguments that exercise it — both ends
 * of a plural where there is one, so `1 task` and `2 tasks` are both read here
 * before anybody reads them on a phone. One table for both catalogues: the
 * shape a function is called with does not change between them, only the
 * words it hands back.
 */
const calls: Record<string, unknown[]> = {
	'sheet.over': [{ count: 101, max: 100 }],
	'sheet.movedWithin': [{ position: 2, group: 'Weekend' }],
	'sheet.movedTo': [{ group: 'Weekend', position: 1 }],
	'sheet.movedToList': [{ list: 'Weekend' }],
	'group.named': [{ title: 'Weekend' }],
	'lists.named': [{ name: 'Weekend' }],
	'toast.deletedGroup': [{ what: 'Weekend' }],
	'toast.deletedWithDone': [{ what: 'Weekend', count: 3 }],
	'toast.deletedWithTasks': [
		{ what: 'Weekend', count: 1 },
		{ what: 'Weekend', count: 3 }
	],
	'toast.movedToList': [{ what: '“Weekend”' }],
	'toast.cleared': [{ count: 1 }, { count: 4 }],
	'toast.doneRun': [{ count: 1 }, { count: 3 }],
	'toast.copied': [{ count: 1 }, { count: 2 }],
	'toast.added': [{ count: 1 }, { count: 3 }],
	'toast.addedSkipped': [{ count: 3, skipped: 1 }],
	'toast.overTasks': [{ max: 100 }],
	'toast.overGroups': [{ max: 20 }],
	'menu.syncCooling': [{ seconds: 7 }],
	'menu.joinAsk': [{ count: 1 }, { count: 2 }],
	'menu.debug': [{ on: true }, { on: false }],
	'sync.waiting': [{ count: 1 }, { count: 2 }],
	'sync.unseen': [{ count: 1 }, { count: 2 }],
	'sync.buttonWaiting': [{ count: 1 }, { count: 2 }],
	'sync.errorRefused': [{ code: 502 }],
	'sync.errorOther': [{ message: 'boom' }],
	'import.summary': [
		{ tasks: 1, groups: 1 },
		{ tasks: 2, groups: 2 }
	],
	'confirm.leaveBody': [{ code: '5e6b 7c1a 93f2' }],
	'confirm.leaveUnsent': [{ count: 1 }, { count: 2 }]
};

const catalogues = { en, el };

describe.each(Object.entries(catalogues))('the %s catalogue', (name, catalogue) => {
	const leaves = walk(catalogue as unknown as Node);

	it('says something everywhere it says anything', () => {
		const empty = leaves
			.filter(({ leaf }) => typeof leaf === 'string' && leaf.trim() === '')
			.map(({ path }) => path);

		expect(empty).toStrictEqual([]);
	});

	it('has a sample argument for every string that takes one', () => {
		const functions = leaves
			.filter(({ leaf }) => typeof leaf === 'function')
			.map(({ path }) => path);

		const untested = functions.filter((path) => !(path in calls));
		expect(untested, `add these to \`calls\` above (${name})`).toStrictEqual([]);

		// And nothing lingering in the table for a string that has since gone.
		const stale = Object.keys(calls).filter((path) => !functions.includes(path));
		expect(stale, `these are no longer in the catalogue (${name})`).toStrictEqual([]);
	});

	it('builds a sentence for every argument it is given', () => {
		for (const { path, leaf } of leaves) {
			if (typeof leaf !== 'function') continue;

			for (const argument of calls[path]) {
				const said = (leaf as (arg: unknown) => string)(argument);
				expect(typeof said, path).toBe('string');
				expect(said.trim(), path).not.toBe('');
			}
		}
	});
});

it('the two catalogues say the same set of things', () => {
	// Guaranteed by `Messages` at build time; checked again at runtime because
	// nothing stops a stray `as any` from quietly bypassing that.
	const paths = (catalogue: Node) =>
		walk(catalogue)
			.map(({ path }) => path)
			.sort();

	expect(paths(el as unknown as Node)).toStrictEqual(paths(en as unknown as Node));
});

describe('en agrees with itself about one and about many', () => {
	it('picks the right form of the noun', () => {
		expect(en.toast.copied({ count: 1 })).toContain('1 task.');
		expect(en.toast.copied({ count: 2 })).toContain('2 tasks.');
		expect(en.sync.waiting({ count: 1 })).toBe('1 change is waiting to go.');
		expect(en.sync.waiting({ count: 3 })).toBe('3 changes are waiting to go.');
		expect(en.import.summary({ tasks: 1, groups: 1 })).toBe('Add 1 task in 1 group?');
		expect(en.import.summary({ tasks: 2, groups: 3 })).toBe('Add 2 tasks in 3 groups?');
		expect(en.toast.deletedWithTasks({ what: 'x', count: 1 })).toBe('x and 1 task');
		expect(en.toast.deletedWithTasks({ what: 'x', count: 2 })).toBe('x and 2 tasks');
	});
});

describe('el agrees with itself about one and about many', () => {
	it('picks the right form of the noun, and of the verb beside it', () => {
		// Greek's passive verb agrees in number with what follows it, which
		// English's own "Copied"/"Cleared" does not have to.
		expect(el.toast.copied({ count: 1 })).toBe('Αντιγράφηκε 1 εργασία.');
		expect(el.toast.copied({ count: 2 })).toBe('Αντιγράφηκαν 2 εργασίες.');
		expect(el.toast.cleared({ count: 1 })).toBe('Καθαρίστηκε 1.');
		expect(el.toast.cleared({ count: 4 })).toBe('Καθαρίστηκαν 4.');
		expect(el.sync.waiting({ count: 1 })).toBe('1 αλλαγή είναι σε αναμονή.');
		expect(el.sync.waiting({ count: 3 })).toBe('3 αλλαγές είναι σε αναμονή.');
	});

	it('writes its own question mark', () => {
		expect(el.toast.clear).toBe('ΕΚΚΑΘΑΡΙΣΗ;');
		expect(el.toast.undo).toBe('ΑΝΑΙΡΕΣΗ;');
		expect(el.toast.clear).not.toContain('?');
	});
});

describe('t', () => {
	afterEach(() => {
		language.override = null;
	});

	it('reads through to the detected catalogue with no override set', () => {
		expect(t.task.delete).toBe(en.task.delete);
	});

	it('reads through to the override once one is set, whether or not debug still is', () => {
		language.override = 'el';
		expect(t.task.delete).toBe(el.task.delete);

		language.override = 'en';
		expect(t.task.delete).toBe(en.task.delete);
	});

	it('forwards a function leaf rather than copying it', () => {
		language.override = 'el';
		expect(t.group.named({ title: 'Weekend' })).toBe(el.group.named({ title: 'Weekend' }));
	});
});

describe('isFirstGroupTitle', () => {
	afterEach(() => {
		language.override = null;
	});

	it('knows the first group by the name any language gave it', () => {
		// A list made on a Greek phone is still unnamed when read in English.
		language.override = 'en';
		expect(isFirstGroupTitle(en.doc.firstGroup)).toBe(true);
		expect(isFirstGroupTitle(el.doc.firstGroup)).toBe(true);
		language.override = 'el';
		expect(isFirstGroupTitle(en.doc.firstGroup)).toBe(true);
	});

	it('does not mistake a name somebody typed for it', () => {
		expect(isFirstGroupTitle('Market')).toBe(false);
		expect(isFirstGroupTitle('')).toBe(false);
		expect(isFirstGroupTitle(en.doc.firstGroup.toLowerCase())).toBe(false);
	});
});
