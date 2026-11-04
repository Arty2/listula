import { describe, expect, it } from 'vitest';
import { clean, length, truncate } from '../src/lib/doc/clean';

/*
 * The characters under test are invisible by definition, so they are built
 * from escapes rather than pasted — a literal in a source file is impossible
 * to review and easy to lose to a reformat.
 */
const RLO = '\u202E'; // right-to-left override
const LRI = '\u2066'; // left-to-right isolate
const PDI = '\u2069'; // pop directional isolate
const ZWSP = '\u200B';
const ZWJ = '\u200D';
const BOM = '\uFEFF';

describe('clean', () => {
	it('normalises to NFC so the same word is the same string', () => {
		const decomposed = 'cafe\u0301';
		const composed = 'caf\u00E9';

		expect(clean(decomposed, 100)).toBe(composed);
		expect(length(clean(decomposed, 100))).toBe(4);
	});

	it('composes a letter and its mark once an invisible between them is gone', () => {
		expect(clean(`cafe${ZWSP}\u0301`, 100)).toBe('caf\u00E9');
	});

	it('strips the implicit bidi marks too', () => {
		expect(clean('a\u200Eb\u200Fc\u061Cd', 100)).toBe('abcd');
	});

	it('folds newlines and tabs into spaces rather than deleting them', () => {
		expect(clean('bread\nmilk', 100)).toBe('bread milk');
		expect(clean('bread\tmilk', 100)).toBe('bread milk');
	});

	it('collapses runs of whitespace and trims', () => {
		expect(clean('   bread     milk  ', 100)).toBe('bread milk');
	});

	it('strips bidi overrides and isolates', () => {
		// Without this, what renders is not what is stored — so what you tick is
		// not necessarily what the other person wrote.
		expect(clean(`a${RLO}b`, 100)).toBe('ab');
		expect(clean(`${LRI}a${PDI}`, 100)).toBe('a');
	});

	it('strips zero-width characters and the byte order mark', () => {
		expect(clean(`a${ZWSP}b${ZWJ}c${BOM}`, 100)).toBe('abc');
	});

	it('strips C0 and C1 controls', () => {
		expect(clean('a\u0007b\u0000c', 100)).toBe('a b c');
	});

	it('counts and truncates in code points, not UTF-16 units', () => {
		const emoji = '🍞🍞🍞';

		expect(length(emoji)).toBe(3);
		expect(emoji.length).toBe(6);
		expect(clean(emoji, 2)).toBe('🍞🍞');
		expect(truncate(emoji, 2)).toBe('🍞🍞');
	});

	it('never splits a surrogate pair', () => {
		expect([...clean('a🍞', 2)]).toStrictEqual(['a', '🍞']);
	});

	it('leaves ordinary text alone', () => {
		expect(clean('Coffee, the dark one', 100)).toBe('Coffee, the dark one');
	});

	it('keeps markdown syntax verbatim — the list is plain text', () => {
		expect(clean('**bold** <script>', 100)).toBe('**bold** <script>');
	});
});
