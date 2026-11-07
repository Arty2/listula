/**
 * A figure, set in Unicode's monospace letters and digits: `12,50€` comes out
 * `𝟷𝟸,𝟻𝟶€`, `500g` comes out `𝟻𝟶𝟶𝚐`.
 *
 * These are the MATHEMATICAL MONOSPACE characters (U+1D670–U+1D6A3 for the
 * letters, U+1D7F6–U+1D7FF for the digits), which every math face draws as a
 * fixed-width slab serif. Only digits and Latin letters have them; the
 * separators, `×`, `–` and the currency marks have no monospace twin and pass
 * through as they are.
 *
 * This is a drawing of the figure and nothing else: the text, the export, what
 * merge sees and what a screen reader hears all keep the plain characters,
 * since read aloud these come out as "mathematical monospace digit one".
 */
export function typewriter(text: string): string {
	let out = '';
	for (const ch of text) {
		const c = ch.codePointAt(0)!;
		if (c >= 0x30 && c <= 0x39) out += String.fromCodePoint(0x1d7f6 + c - 0x30);
		else if (c >= 0x41 && c <= 0x5a) out += String.fromCodePoint(0x1d670 + c - 0x41);
		else if (c >= 0x61 && c <= 0x7a) out += String.fromCodePoint(0x1d68a + c - 0x61);
		else out += ch;
	}
	return out;
}
