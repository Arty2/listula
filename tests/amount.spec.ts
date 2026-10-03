import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	amountsIn,
	countLabel,
	measureLabel,
	figures,
	format,
	line,
	styleOf,
	sum,
	type Money,
	type Style
} from '../src/lib/doc/amount';
import type { State } from '../src/lib/doc/types';

/*
 * The rule that carries the most weight here is that both `,` and `.` are
 * decimal separators — people write both, often in the same list — and that
 * thousands are still readable, because the digit pattern says which is which.
 * Get that wrong in one direction and a €5,08 tomato costs five hundred and
 * eight; wrong in the other and a 1,200 count of something becomes €12.
 */

const cost = (text: string) => amountsIn(text).money;
const cents = (text: string) => cost(text)?.cents ?? null;

describe('reading a price', () => {
	it('takes one or two digits behind the mark as a decimal point', () => {
		expect(cents('Tomatos 5,08')).toBe(508);
		expect(cents('Tomatos 5.08')).toBe(508);
		expect(cents('Tomatos 20.00')).toBe(2000);
		expect(cents('Tomatos 5.9')).toBe(590);
		expect(cents('Tomatos 5,9')).toBe(590);
	});

	it('takes exactly three behind the mark as a grouped thousand', () => {
		expect(cents('Beams 1,234')).toBe(123400);
		expect(cents('Beams 1.234')).toBe(123400);
		expect(cents('Beams 1.500')).toBe(150000);
	});

	it('lets the last mark decide when a number carries both', () => {
		expect(cents('Beams 1.234,56')).toBe(123456);
		expect(cents('Beams 1,234.56')).toBe(123456);
		expect(cents('Beams 1.234.567')).toBe(123456700);
	});

	it('refuses what is neither', () => {
		// Four digits behind the mark is not a decimal and not a thousand.
		expect(cost('Tomatos 5,0812')).toBeNull();
		// A grouped number leads with one to three digits, not five.
		expect(cost('Beams 12345,678')).toBeNull();
		// One mark cannot group and point at once.
		expect(cost('Beams 1,234,56')).toBeNull();
		expect(cost('Tomatos 5,')).toBeNull();
	});

	it('keeps a whole number whole', () => {
		const money = cost('Leeks 10');
		expect(money).toStrictEqual({ cents: 1000, separator: null, decimals: 0, currency: null });
	});

	it('remembers which mark was written, and how many places', () => {
		expect(cost('Onions 5,90')).toStrictEqual({
			cents: 590,
			separator: ',',
			decimals: 2,
			currency: null
		});
		expect(cost('Onions 5.9')).toStrictEqual({
			cents: 590,
			separator: '.',
			decimals: 1,
			currency: null
		});
	});

	it('is only a price at the end, behind a space', () => {
		expect(cost('5,08 tomatos')).toBeNull();
		expect(cost('Tomatos5,08')).toBeNull();
	});

	it('is a name when there is no name left over', () => {
		expect(cost('5,08')).toBeNull();
		expect(amountsIn('5,08').name).toBe('5,08');
	});
});

describe('a currency mark', () => {
	it('counts on either side of the number', () => {
		expect(cost('Bread €1.20')?.currency).toBe('€');
		expect(cost('Wine 8,50€')?.currency).toBe('€');
		expect(cost('Beer $4')?.currency).toBe('$');
		expect(cost('Tea 3£')?.currency).toBe('£');
	});

	it('is kept in the cost exactly as written', () => {
		expect(amountsIn('Bread €1.20').cost).toBe('€1.20');
		expect(amountsIn('Wine 8,50€').cost).toBe('8,50€');
	});

	it('does not count on both sides at once', () => {
		expect(cost('Bread €1.20€')).toBeNull();
	});
});

describe('reading a count', () => {
	it('takes a number at the front, with or without an x', () => {
		expect(amountsIn('2x Tomatos').amount).toBe('2x');
		expect(amountsIn('3 Potatos').amount).toBe('3');
		expect(amountsIn('2 x Tomatos').amount).toBe('2 x');
		expect(amountsIn('1.5x Milk').amount).toBe('1.5x');
		expect(amountsIn('2× Tomatos').amount).toBe('2×');
	});

	it('needs a space after it, so a word is left whole', () => {
		expect(amountsIn('2xTomatos').amount).toBeNull();
		expect(amountsIn('2x').amount).toBeNull();
	});

	it('reads a unit as a measure, not a count', () => {
		expect(amountsIn('500g Butter')).toMatchObject({
			amount: '500g',
			count: null,
			measure: { value: 500, unit: 'g' },
			name: 'Butter'
		});
		expect(amountsIn('2L Milk').measure).toStrictEqual({ value: 2, unit: 'L' });
		expect(amountsIn('1,5 kg Potatos').measure).toStrictEqual({ value: 1.5, unit: 'kg' });
		expect(amountsIn('250 ml Cream').measure).toStrictEqual({ value: 250, unit: 'ml' });
	});

	it('takes the short ways a unit is written', () => {
		expect(amountsIn('1k Sugar').measure).toStrictEqual({ value: 1, unit: 'kg' });
		expect(amountsIn('2K Sugar').measure).toStrictEqual({ value: 2, unit: 'kg' });
		expect(amountsIn('300gr Feta').measure).toStrictEqual({ value: 300, unit: 'g' });
		expect(amountsIn('300 G Feta').measure).toStrictEqual({ value: 300, unit: 'g' });
		expect(amountsIn('1lt Oil').measure).toStrictEqual({ value: 1, unit: 'L' });
		expect(amountsIn('1 l Oil').measure).toStrictEqual({ value: 1, unit: 'L' });
	});

	it('reads no unit that runs on into a word', () => {
		expect(amountsIn('2 lemons')).toMatchObject({ amount: '2', count: 2, measure: null });
		expect(amountsIn('3 grapefruits')).toMatchObject({ count: 3, measure: null });
		expect(amountsIn('500gButter').amount).toBeNull();
		expect(amountsIn('2 oz Ham').measure).toBeNull();
	});

	it('reads a bare leading number wherever it finds one', () => {
		// The cost of the rule being simple: this is a count of days off.
		expect(amountsIn('2 days off').amount).toBe('2');
	});
});

describe('a task with both', () => {
	it('splits into count, name and price', () => {
		expect(amountsIn('2x Tomatos 20.00')).toStrictEqual({
			amount: '2x',
			count: 2,
			measure: null,
			name: 'Tomatos',
			nameAt: 3,
			cost: '20.00',
			money: { cents: 2000, separator: '.', decimals: 2, currency: null }
		});
	});

	it('leaves a task with neither alone', () => {
		expect(amountsIn('Bread')).toStrictEqual({
			amount: null,
			count: null,
			measure: null,
			name: 'Bread',
			nameAt: 0,
			cost: null,
			money: null
		});
	});
});

describe('what a row comes to', () => {
	const cents = (text: string) => line(amountsIn(text))?.cents ?? null;

	it('takes the price as many times as the count says', () => {
		expect(cents('2x Tomatos 5,08')).toBe(1016);
		expect(cents('3 Potatos 20.00')).toBe(6000);
	});

	it('is the price itself when there is no count', () => {
		expect(cents('Onions 5,90')).toBe(590);
	});

	it('is the price itself when the amount is a weight', () => {
		// One pack of butter at 2,50, not five hundred of them.
		expect(cents('500g Butter 2,50')).toBe(250);
		expect(cents('1,5kg Potatos 3,00')).toBe(300);
	});

	it('is nothing when there is no price', () => {
		expect(line(amountsIn('2x Tomatos'))).toBeNull();
		expect(line(amountsIn('Bread'))).toBeNull();
	});

	it('rounds a fractional count to the cent', () => {
		// One and a half at 5,05 is 7,575, and there is no half cent to give back.
		expect(cents('1.5x Cheese 5,05')).toBe(758);
		expect(cents('1.5x Milk 2,00')).toBe(300);
	});

	it('leaves the price on the row exactly as it was typed', () => {
		// The row says what one costs; the multiplying is for the total.
		expect(amountsIn('2x Tomatos 5,08').cost).toBe('5,08');
	});
});

describe('the total', () => {
	const money = (text: string): Money => {
		const read = cost(text);
		if (read === null) throw new Error(`no price in ${text}`);
		return read;
	};

	const written = (...texts: string[]) => {
		const rows = texts.map(money);
		return format(sum(rows), styleOf(rows)!);
	};

	it('is nothing when nothing was priced', () => {
		expect(styleOf([])).toBeNull();
		expect(sum([])).toBe(0);
	});

	it('follows the mark the rows used most, and the dot on a tie', () => {
		expect(styleOf([money('a 1,00'), money('a 2,00'), money('a 3.00')])?.separator).toBe(',');
		expect(styleOf([money('a 1,00'), money('a 2.00')])?.separator).toBe('.');
		expect(styleOf([money('a 1'), money('a 2')])?.separator).toBe('.');
	});

	it('shows decimals only when a price had them', () => {
		expect(written('a 10', 'a 20')).toBe('30');
		expect(written('a 5,08', 'a 20')).toBe('25,08');
		expect(written('a 5,9', 'a 20')).toBe('25,90');
		expect(written('a 20.00', 'a 10')).toBe('30.00');
	});

	it('carries a currency mark the rows agree on, after the number', () => {
		expect(written('a €5,00', 'a €2,50')).toBe('7,50€');
		// Some wrote one and some did not; the ones that did agree.
		expect(written('a €5,00', 'a 2,50')).toBe('7,50€');
	});

	it('shows no mark when the rows disagree', () => {
		expect(written('a €5,00', 'a $2,50')).toBe('7,50');
	});

	it('does not drift over prices a float would round', () => {
		expect(written(...Array.from({ length: 10 }, () => 'a 0,10'))).toBe('1,00');
	});
});

describe('writing a count out', () => {
	const comma: Style = { separator: ',', decimals: 2, currency: null };
	const dot: Style = { separator: '.', decimals: 0, currency: null };

	it('always ends in one multiplication sign, never two', () => {
		expect(countLabel(amountsIn('2x Tomatos').count!, dot)).toBe('2×');
		expect(countLabel(amountsIn('2× Tomatos').count!, dot)).toBe('2×');
		expect(countLabel(amountsIn('3 Potatos').count!, dot)).toBe('3×');
		expect(countLabel(amountsIn('2 x Tomatos').count!, dot)).toBe('2×');
	});

	it('follows the group on a fraction, and pads nothing', () => {
		expect(countLabel(1.5, comma)).toBe('1,5×');
		expect(countLabel(1.5, dot)).toBe('1.5×');
		// Two decimal places on the prices does not make a count 2,00.
		expect(countLabel(2, comma)).toBe('2×');
	});

	it('falls back to the dot when the group writes no prices', () => {
		expect(countLabel(1.5, null)).toBe('1.5×');
	});
});

describe('writing a measure out', () => {
	const comma: Style = { separator: ',', decimals: 2, currency: null };
	const label = (text: string, style: Style | null = null) =>
		measureLabel(amountsIn(text).measure!, style);

	it('writes each unit one way, whichever way it was typed', () => {
		expect(label('1k Sugar')).toBe('1kg');
		expect(label('1 KG Sugar')).toBe('1kg');
		expect(label('300gr Feta')).toBe('300g');
		expect(label('1lt Oil')).toBe('1L');
		expect(label('250ML Cream')).toBe('250ml');
	});

	it('follows the group on a fraction, and pads nothing', () => {
		expect(label('1.5kg Potatos', comma)).toBe('1,5kg');
		expect(label('0,5 l Milk')).toBe('0.5L');
		expect(label('2kg Potatos', comma)).toBe('2kg');
	});
});

describe('a group', () => {
	const task = (text: string, state: State = 'todo') => ({ text, state });

	const note = [
		task('2x Tomatos 5,08'),
		task('3 Potatos 20.00'),
		task('Onions 5,90'),
		task('5 Leeks 10', 'done')
	];

	it('totals the sheet from the note, counts and all', () => {
		// 2 × 5,08 + 3 × 20,00 + 5,90, with the leeks already in the basket.
		expect(figures(note).total).toBe('76,06');
	});

	it('writes the whole group the way most of it was written', () => {
		// Two commas against one dot, and a price with decimals in it.
		expect(figures(note).style).toStrictEqual({
			separator: ',',
			decimals: 2,
			currency: null
		});
	});

	it('counts half in full and done not at all', () => {
		expect(figures([task('Bread 10'), task('Milk 20')]).total).toBe('30');
		expect(figures([task('Bread 10'), task('Milk 20', 'half')]).total).toBe('30');
		expect(figures([task('Bread 10'), task('Milk 20', 'done')]).total).toBe('10');
	});

	it('drops the whole line when a counted row is done', () => {
		// Not 4 × 5,00 less one: done takes its count with it.
		expect(figures([task('4x Bread 5,00'), task('2x Milk 1,50')]).total).toBe('23,00');
		expect(figures([task('4x Bread 5,00', 'done'), task('2x Milk 1,50')]).total).toBe('3,00');
	});

	it('shows nothing when there is nothing to total', () => {
		expect(figures([]).total).toBeNull();
		expect(figures([task('Bread'), task('Milk')]).total).toBeNull();
		expect(figures([task('Bread 10', 'done')]).total).toBeNull();
	});

	it('keeps writing the column one way when the only decimals are done', () => {
		// Nothing left to buy, so no total — but the row still reads 2,50.
		const group = [task('Milk 2,50', 'done')];
		expect(figures(group).total).toBeNull();
		expect(figures(group).style?.decimals).toBe(2);

		// And a done row's decimals still set the column for the rows above it.
		const mixed = [task('Bread 10'), task('Milk 2,50', 'done')];
		expect(figures(mixed).total).toBe('10,00');
	});
});

describe('writing a price out the group’s way', () => {
	const task = (text: string, state: State = 'todo') => ({ text, state });

	/** What one row shows: its own price, in the group's hand. */
	const shown = (group: { text: string; state: State }[], text: string) => {
		const style = figures(group).style!;
		return format(amountsIn(text).money!.cents, style);
	};

	it('pads a bare number when another row wrote decimals', () => {
		const group = [task('Bread 10'), task('Milk 2,50')];
		expect(shown(group, 'Bread 10')).toBe('10,00');
		expect(shown(group, 'Milk 2,50')).toBe('2,50');
	});

	it('rewrites the separator to the prevailing one', () => {
		const group = [task('a 5,08'), task('b 20.00'), task('c 5,90')];
		expect(shown(group, 'b 20.00')).toBe('20,00');
	});

	it('leaves a whole-number group whole', () => {
		const group = [task('Bread 10'), task('Milk 20')];
		expect(shown(group, 'Bread 10')).toBe('10');
	});

	it('gives the group’s mark to a row that wrote none', () => {
		const group = [task('Bread €10'), task('Milk 2,50')];
		expect(shown(group, 'Milk 2,50')).toBe('2,50€');
	});

	it('gives no mark at all when the rows disagree', () => {
		const group = [task('Bread €10'), task('Milk $2,50')];
		expect(shown(group, 'Bread €10')).toBe('10,00');
	});
});

/*
 * The two properties that matter. A total that depended on the order of the
 * rows would change when one was dragged, and a reading that dropped a
 * character would show the person something other than what they typed.
 */

const arbMoney: fc.Arbitrary<Money> = fc.record({
	cents: fc.integer({ min: 0, max: 10_000_000 }),
	separator: fc.constantFrom(',' as const, '.' as const, null),
	decimals: fc.constantFrom(0, 1, 2),
	currency: fc.constantFrom('€' as const, '$' as const, '£' as const, null)
});

describe('properties', () => {
	it('totals the same whatever order the rows are in', () => {
		const read = (rows: Money[]) => ({ style: styleOf(rows), cents: sum(rows) });

		fc.assert(
			fc.property(fc.array(arbMoney, { maxLength: 20 }), (rows) => {
				expect(read([...rows].reverse())).toStrictEqual(read(rows));
				// And a rotation, which reverse alone would not catch on a palindrome.
				expect(read([...rows.slice(1), ...rows.slice(0, 1)])).toStrictEqual(read(rows));
			}),
			{ numRuns: 300 }
		);
	});

	it('never loses a character of what was typed', () => {
		const arbAmount = fc.constantFrom('2x', '3', '1.5x', '2 x', '12×', '500g', '1,5 kg', '2L');
		const arbName = fc.constantFrom('Tomatos', 'Red onions', 'Bread', '5 a day');
		const arbCost = fc.constantFrom('5,08', '20.00', '10', '€1.20', '8,50€', '1.234,56');

		fc.assert(
			fc.property(
				fc.option(arbAmount, { nil: undefined }),
				arbName,
				fc.option(arbCost, { nil: undefined }),
				(amount, name, cost) => {
					const text = [amount, name, cost].filter((part) => part !== undefined).join(' ');
					const read = amountsIn(text);
					expect(
						[read.amount, read.name, read.cost].filter((part) => part !== null).join(' ')
					).toBe(text);
				}
			),
			{ numRuns: 300 }
		);
	});
});
