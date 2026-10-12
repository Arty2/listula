import { browser } from '$app/environment';

/**
 * Everything the app keeps on the device.
 *
 * The code lives here and nowhere else — never sessionStorage, never a cookie,
 * never a URL (§13, §14). Losing it loses the list, which is why EXPORT exists
 * and why the DELETE confirm shows the code one last time.
 *
 * The prefix is `consumma:`, which is what the app used to be called. It is an
 * address rather than a name — the same reasoning that froze the salt — and a
 * device that has been here before is holding its list under it. Renaming the
 * prefix does not move that list, it hides it: the app would open on a blank
 * sheet with the writing still on the disk under keys nothing reads. If it
 * ever has to change, it changes with a migration that reads the old keys and
 * writes the new ones, and not before.
 */
export const KEYS = {
	doc: 'consumma:doc',
	clientId: 'consumma:clientId',
	lastT: 'consumma:lastT',
	collapsed: 'consumma:collapsed',
	/*
	 * Written only once someone has picked one, and removed again when they go
	 * back to following the phone. static/theme.js reads this key by name
	 * before the app has loaded — see the note there, and the test that holds
	 * the two spellings together.
	 */
	theme: 'consumma:theme',
	code: 'consumma:code',
	version: 'consumma:version',
	synced: 'consumma:synced',
	/**
	 * The index of every remembered list, written only once a second one
	 * exists — see src/lib/state/lists.ts.
	 */
	lists: 'consumma:lists',
	/**
	 * Whether the debug log in the menu is on. Off by default and written
	 * only once someone turns it on — see src/lib/state/diagnostics.svelte.ts.
	 */
	diagnostics: 'consumma:diagnostics'
} as const;

/** The keys one list's own data lives under. */
export type ListKeySet = {
	doc: string;
	code: string;
	version: string;
	synced: string;
	collapsed: string;
};

/**
 * `null` is the first list anyone ever has: it keeps living under today's bare
 * keys forever, so a single-list device never gains a suffix it did not have
 * yesterday. Every later list gets its own id-suffixed set instead — see
 * src/lib/state/lists.ts for how the two are told apart.
 */
export function keysFor(id: string | null): ListKeySet {
	if (id === null) {
		return {
			doc: KEYS.doc,
			code: KEYS.code,
			version: KEYS.version,
			synced: KEYS.synced,
			collapsed: KEYS.collapsed
		};
	}

	return {
		doc: `consumma:doc:${id}`,
		code: `consumma:code:${id}`,
		version: `consumma:version:${id}`,
		synced: `consumma:synced:${id}`,
		collapsed: `consumma:collapsed:${id}`
	};
}

/**
 * Prerendering runs in Node, and a browser with storage disabled throws on
 * access rather than returning null. Every read and write goes through here so
 * neither case can take the app down.
 */
export function read(key: string): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** False when storage refused it, for the one caller that has to know. */
export function write(key: string, value: string): boolean {
	if (!browser) return false;
	try {
		localStorage.setItem(key, value);
		return true;
	} catch {
		// Quota or a blocked storage partition. The app stays usable for this
		// session; there is nothing useful to say about it on the sheet.
		return false;
	}
}

export function remove(key: string): void {
	if (!browser) return;
	try {
		localStorage.removeItem(key);
	} catch {
		// As above.
	}
}

export function readJson<T>(key: string, fallback: T): T {
	const raw = read(key);
	if (raw === null) return fallback;

	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function writeJson(key: string, value: unknown): void {
	write(key, JSON.stringify(value));
}

/**
 * Asks the browser to stop evicting us. Home-screen installs are usually
 * granted it; browser tabs often are not. Called once, after a list exists.
 */
export async function persist(): Promise<boolean> {
	if (!browser || !navigator.storage?.persist) return false;
	try {
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}
