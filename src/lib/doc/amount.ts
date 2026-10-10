/**
 * What a shopping list is already carrying: a count or a weight at the front
 * of a task and a price at the back.
 *
 * Nothing here is stored. A task is one string and stays one string — this
 * reads it on the way to the screen, the way `langOf` does, so the markdown
 * export and what a screen reader hears keep exactly what was typed.
 *
 * Both `,` and `.` are decimal separators, because both are written. Thousands
 * are told apart by the digit pattern rather than by the character: a separator
 * with one or two digits after it is a decimal point, one with exactly three is
 * a grouping mark. That is the whole rule, and it is why `5,08` and `5.08` are
 * the same price while `1,234` and `1.234` are the same count of things.
 */

import type { Task } from './types';

export type Currency = '€' | '$' | '£';

/** Metric and nothing else: what a shopping list in grams and litres writes. */
export type Unit = 'g' | 'kg' | 'ml' | 'L';

export type Measure = { value: number; unit: Unit };

export type Money = {
	/** Integer minor units, so a sum never drifts. */
	cents: number;
	/** Which mark was written for the decimal point, if one was. */
	separator: ',' | '.' | null;
	/** How many decimal places were written: 0, 1 or 2. */
	decimals: number;
	currency: Currency | null;
};

export type Reading = {
	/**
	 * The leading count or weight, exactly as typed — `2x`, `3`, `1.5x`, `500g`,
	 * `1,5 kg` — or nothing.
	 */
	amount: string | null;
	/**
	 * The same count as a number, so the price can be taken that many times.
	 * Of a range it is the top: `2-3 oranges` is budgeted at three, since what
	 * is still to buy is the most it may come to rather than the least.
	 */
	count: number | null;
	/**
	 * The bottom of a range — `2` of `2-3 oranges`, `200` of `200-300g` — or
	 * nothing when one number was written. The top is `count` or the measure's
	 * own value, whichever the range turned out to be.
	 */
	from: number | null;
	/**
	 * The same weight or volume, when the number carried a unit. Never a count:
	 * `500g Butter 2,50` is one pack at 2,50, not five hundred of them.
	 */
	measure: Measure | null;
	/** What is left in the middle. Never empty: it is the task. */
	name: string;
	/**
	 * Where the name begins in the text it was read out of.
	 *
	 * The row draws the name and not the string, so a point on the words is an
	 * offset into the name — and putting a caret where a finger landed means
	 * turning that back into a place in the task. Counted rather than searched
	 * for: `indexOf` would find the wrong one whenever the name repeats what the
	 * count or the price already said.
	 */
	nameAt: number;
	/** The trailing price, exactly as typed — `5,08`, `€1.20` — or nothing. */
	cost: string | null;
	/** The same price as a number, or null when there is no price. */
	money: Money | null;
};

/**
 * A number, optionally followed by `x` or a unit, and then whitespace — so
 * `2x TOMATOS`, `3 POTATOS` and `500g BUTTER` all lead with an amount and
 * `2xTOMATOS` does not. The unit has to end before the space too, which is
 * what keeps the `l` of `2 lemons` from being litres.
 *
 * The number may be a range — two numbers either side of a hyphen or a dash,
 * `2-3 oranges`, `2–3x`, `200 - 300g` — with the `x` or the unit written once,
 * after the second.
 */
const AMOUNT =
	/^(\d+(?:[.,]\d+)?)(?:\s?[-–]\s?(\d+(?:[.,]\d+)?))?(?:\s?([x×])|\s?(kg|k|gr|g|ml|lt|l))?(?=\s)/i;

/**
 * The short ways a unit gets written, and nothing longer: `k` is a kilo, `gr`
 * and `lt` are grams and litres. A litre is written `L`, because a lowercase
 * one beside a digit reads as a 1.
 */
const UNITS: Record<string, Unit> = {
	g: 'g',
	gr: 'g',
	k: 'kg',
	kg: 'kg',
	ml: 'ml',
	l: 'L',
	lt: 'L'
};

/**
 * A price sits at the end, behind a space, with at most one currency mark on
 * one side of it. The space is what guarantees a name is left over.
 */
const COST = /\s([€$£]?)(\d[\d.,]*)([€$£]?)$/;

const DIGITS = /^\d+(?:[.,]\d+)*$/;

/** Longer than this is not a price anyone wrote, and past what a float holds. */
const MAX_DIGITS = 12;

type Figure = { cents: number; separator: ',' | '.' | null; decimals: number };

function readNumber(raw: string): Figure | null {
	if (!DIGITS.test(raw)) return null;

	const seps = [...raw].filter((c): c is ',' | '.' => c === ',' || c === '.');
	const parts = raw.split(/[.,]/);

	if (seps.length === 0) {
		if (parts[0].length > MAX_DIGITS) return null;
		return { cents: Number(parts[0]) * 100, separator: null, decimals: 0 };
	}

	const last = parts[parts.length - 1];

	// One or two digits behind the final mark makes it a decimal point; exactly
	// three makes it another grouping mark. Four is neither, and not a price.
	const decimal = last.length <= 2;
	if (!decimal && last.length !== 3) return null;

	// Whatever is not the decimal point groups thousands, so it has to be one
	// mark used throughout, it cannot be the mark used for the decimal point,
	// and the runs it cuts have to be a lead of one to three and then threes.
	const grouping = decimal ? seps.slice(0, -1) : seps;
	const groups = decimal ? parts.slice(0, -1) : parts;

	if (grouping.length > 0) {
		if (grouping.some((mark) => mark !== grouping[0])) return null;
		if (decimal && grouping[0] === seps[seps.length - 1]) return null;
		if (groups[0].length > 3) return null;
		if (groups.slice(1).some((group) => group.length !== 3)) return null;
	}

	const digits = groups.join('');
	if (digits.length > MAX_DIGITS) return null;

	const places = decimal ? last : '';

	return {
		cents: Number(digits) * 100 + Number(places.padEnd(2, '0')),
		separator: decimal ? seps[seps.length - 1] : null,
		decimals: places.length
	};
}

/** The leading amount, or nothing when it is not one after all. */
function leadOf(text: string): RegExpExecArray | null {
	const lead = AMOUNT.exec(text);
	if (lead === null || lead[2] === undefined) return lead;

	// A range runs upwards. `3-2` or `2-2` is not a range anyone meant, and
	// reading it as one would put a number on the row that was never written.
	const low = readNumber(lead[1]);
	const high = readNumber(lead[2]);
	return low !== null && high !== null && low.cents < high.cents ? lead : null;
}

export function amountsIn(text: string): Reading {
	const lead = leadOf(text);
	const amount = lead ? lead[0] : null;
	const rest = lead ? text.slice(lead[0].length) : text;

	// The number reads by the same rules as the price, minus its x or its unit.
	// Of a range, the top: it is what the price is taken by.
	const figure = lead === null ? null : readNumber(lead[2] ?? lead[1]);
	const value = figure === null ? null : figure.cents / 100;
	const low = lead?.[2] === undefined ? null : readNumber(lead[1]);
	const from = low === null || value === null ? null : low.cents / 100;
	const unit = lead?.[4] === undefined ? null : UNITS[lead[4].toLowerCase()];
	const count = unit === null ? value : null;
	const measure = unit === null || value === null ? null : { value, unit };

	const tail = COST.exec(rest);
	const middle = tail ? rest.slice(0, tail.index) : rest;
	const name = middle.trim();

	/*
	 * Where the name starts in the original: past the count, and past whatever
	 * whitespace `trim` took off the front of what was left. Added rather than
	 * looked up, so `2x tea 2` puts the caret in the word and not in the count.
	 */
	const nameAt = (lead ? lead[0].length : 0) + (middle.length - middle.trimStart().length);

	// A task that is only a price is a name, not a price. So is one carrying a
	// currency mark on both sides of the number.
	if (tail && name !== '' && !(tail[1] !== '' && tail[3] !== '')) {
		const price = readNumber(tail[2]);
		if (price) {
			const mark = tail[1] || tail[3];
			return {
				amount,
				count,
				from,
				measure,
				name,
				nameAt,
				cost: tail[0].trim(),
				money: { ...price, currency: mark === '' ? null : (mark as Currency) }
			};
		}
	}

	/*
	 * No price after all — so the name is everything past the count, and the
	 * offset has to be recomputed against the whole of it rather than against
	 * the part before a price that turned out not to be one.
	 */
	return {
		amount,
		count,
		from,
		measure,
		name: rest.trim(),
		nameAt: (lead ? lead[0].length : 0) + (rest.length - rest.trimStart().length),
		cost: null,
		money: null
	};
}

/**
 * What one row comes to: the price taken as many times as the count says, so
 * `2x Tomatos 5,08` is 10,16 and not 5,08.
 *
 * The price stays on the row exactly as it was typed — it is what one of the
 * thing costs, which is what a person wrote down and what they will check
 * against a shelf. The multiplying happens here, on the way to the total.
 *
 * Rounded to the cent, because a count can have a fraction in it: one and a
 * half of something at 5,05 is 7,58 and there is no half cent to give back.
 */
export function line(reading: Reading): Money | null {
	if (reading.money === null) return null;
	if (reading.count === null) return reading.money;

	return { ...reading.money, cents: Math.round(reading.money.cents * reading.count) };
}

/**
 * How a group writes its numbers.
 *
 * One list, one hand: a group that reads `5,08`, `20.00` and `10` down the same
 * column is three people's habits in one place. The prevailing form wins, and
 * every price in the group is written out in it.
 *
 * The separator is whichever mark the prices used most, a tie or a silence
 * going to the dot. Decimals are two if any price wrote any, none if none did.
 * A currency mark carries when every price that wrote one wrote the same one —
 * onto the prices that wrote none as well, since the group is evidently
 * counting in it.
 */
export type Style = {
	separator: ',' | '.';
	decimals: number;
	currency: Currency | null;
};

export function styleOf(costs: readonly Money[]): Style | null {
	if (costs.length === 0) return null;

	let commas = 0;
	let dots = 0;
	const symbols = new Set<Currency>();

	for (const cost of costs) {
		if (cost.separator === ',') commas++;
		else if (cost.separator === '.') dots++;
		if (cost.currency !== null) symbols.add(cost.currency);
	}

	return {
		separator: commas > dots ? ',' : '.',
		decimals: costs.every((cost) => cost.decimals === 0) ? 0 : 2,
		currency: symbols.size === 1 ? [...symbols][0] : null
	};
}

export function sum(costs: readonly Money[]): number {
	return costs.reduce((running, cost) => running + cost.cents, 0);
}

/**
 * Written out. Ungrouped, deliberately: which mark groups a thousand is a
 * second guess on top of the first, and a list this size rarely gets there.
 */
export function format(cents: number, style: Style): string {
	const whole = Math.trunc(cents / 100);
	const places = cents % 100;

	const digits =
		style.decimals === 0
			? String(whole)
			: `${whole}${style.separator}${String(places).padStart(2, '0')}`;

	return style.currency === null ? digits : `${digits}${style.currency}`;
}

/**
 * A count, written out: `3×`, `1,5×`.
 *
 * Always one multiplication sign and never two, whatever was typed — `2x`, `2×`
 * and `2` all come out `2×`. A fraction follows the group's separator; nothing
 * is ever padded onto a count, because it counts things and is not money.
 */
export function countLabel(count: number, style: Style | null, from: number | null = null): string {
	return `${span(count, style, from)}×`;
}

/**
 * A weight or a volume, written out: `500g`, `1,5kg`, `2L`.
 *
 * The same rule as a count — the group's separator, nothing padded — with the
 * unit in its one written form in place of the `×`, whichever short way it was
 * typed: `1k`, `1 kg` and `1KG` all come out `1kg`.
 */
export function measureLabel(
	measure: Measure,
	style: Style | null,
	from: number | null = null
): string {
	return `${span(measure.value, style, from)}${measure.unit}`;
}

/**
 * One number, or two joined by an en dash — `2–3`, `200–300` — whichever
 * hyphen or dash was typed, and the `×` or the unit written once after both.
 */
function span(value: number, style: Style | null, from: number | null): string {
	return from === null ? digits(value, style) : `${digits(from, style)}–${digits(value, style)}`;
}

function digits(value: number, style: Style | null): string {
	return Number.isInteger(value)
		? String(value)
		: String(value).replace('.', style?.separator ?? '.');
}

export type Figures = {
	/** How this group writes its numbers, or nothing when it writes none. */
	style: Style | null;
	/** What is still to buy, written out, or nothing when there is nothing. */
	total: string | null;
};

/**
 * Everything the sheet needs to know about one group's numbers, read once.
 *
 * The style comes from every priced row, done ones included, so the column
 * stays written one way even when the only price with decimals has been ticked
 * off. The total comes from what is left: done does not count — it is bought,
 * not money still to spend — and half counts in full, because half a task is
 * one still on the list.
 *
 * Each row counts as its count times its price, so three potatoes at 20,00 is
 * 60,00, while the row itself goes on saying what one costs.
 */
export function figures(tasks: readonly Pick<Task, 'text' | 'state'>[]): Figures {
	const all: Money[] = [];
	const left: Money[] = [];

	for (const task of tasks) {
		const row = line(amountsIn(task.text));
		if (row === null) continue;

		all.push(row);
		if (task.state !== 'done') left.push(row);
	}

	const style = styleOf(all);

	return {
		style,
		total: style === null || left.length === 0 ? null : format(sum(left), style)
	};
}
