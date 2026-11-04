/**
 * Every task and group title passes through here on the way in — from typing,
 * from paste, from import, and from a decrypted remote document (§13).
 *
 * Bidi stripping is not paranoia in a shared list: those characters let text
 * render in an order different from how it is stored, so what you tick is not
 * necessarily what the other person wrote. Strip them once, at the boundary,
 * and the rest of the app can treat text as text.
 */

/**
 * C0 and C1 controls, including newlines and tabs — tasks are single-line.
 *
 * The lint rule exists to catch control characters written by accident;
 * matching them is the whole job here.
 */
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Bidi overrides (U+202A–U+202E) and isolates (U+2066–U+2069), and the three
 * implicit marks — LRM, RLM and the Arabic letter mark — which reorder the
 * punctuation and digits around them just as quietly.
 */
const BIDI = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

/** Zero-width characters and the byte order mark. */
const INVISIBLE = /[\u200B-\u200D\uFEFF]/g;

export function clean(input: string, max: number): string {
	const collapsed = input
		// A space rather than nothing, so a newline between two words keeps them
		// as two words.
		.replace(CONTROLS, ' ')
		.replace(BIDI, '')
		.replace(INVISIBLE, '')
		.replace(/\s+/g, ' ')
		.trim()
		// Last, not first: taking out an invisible character can bring a letter
		// and its combining mark together, and only then do they compose.
		.normalize('NFC');

	return truncate(collapsed, max);
}

/** Length in code points, so an emoji costs one character rather than two. */
export function length(input: string): number {
	return [...input].length;
}

/** Slices by code point, so a truncation never splits a surrogate pair. */
export function truncate(input: string, max: number): string {
	const points = [...input];
	return points.length <= max ? input : points.slice(0, max).join('');
}
