import { expect, test, type Page } from '@playwright/test';
import { fromMenu } from './menu';

/*
 * A shopping list already carries its numbers. These are the checks that they
 * are read rather than merely displayed: a count at the front, a price at the
 * back, a column that lines up, and a total on the group's own header that
 * says what is still to buy.
 *
 * The list is the one from the note, counted: 2 × 5,08 + 3 × 20,00 + 5,90 with
 * the leeks already in the basket, which comes to 76,06.
 */

async function addTask(page: Page, text: string) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).first().click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

function task(page: Page, text: string) {
	return page.getByRole('checkbox', { name: text });
}

function total(page: Page) {
	return page.locator('section .total');
}

async function theList(page: Page) {
	for (const text of ['2x Tomatos 5,08', '3 Potatos 20.00', 'Onions 5,90', '5 Leeks 10']) {
		await addTask(page, text);
	}
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('the group header says what the list still comes to', async ({ page }) => {
	await theList(page);

	// Everything is still to buy, and five leeks cost five times ten.
	await expect(total(page)).toHaveText('126,06');

	// The leeks go in the basket. Done is bought, so the whole line stops
	// counting — its count goes with it.
	await task(page, '5 Leeks 10').click();
	await expect(total(page)).toHaveText('76,06');
});

test('a count multiplies the price, and the row still shows what one costs', async ({ page }) => {
	await addTask(page, '2x Tomatos 5,08');
	await expect(total(page)).toHaveText('10,16');

	const row = page.getByRole('button', { name: '2x Tomatos 5,08', exact: true });
	await expect(row.locator('.cost')).toHaveText('5,08');

	// No count is one of the thing, not none of it.
	await addTask(page, 'Onions 5,90');
	await expect(total(page)).toHaveText('16,06');
});

test('a weight is written one way and is not a count', async ({ page }) => {
	await addTask(page, '1,5k Potatos 3,00');
	await addTask(page, '300gr Feta 4,20');

	// Written out in the one form each unit has, lowercase under the caps.
	const potatos = page.getByRole('button', { name: '1,5k Potatos 3,00', exact: true });
	await expect(potatos.locator('.amount')).toHaveText('1,5kg');
	expect(await potatos.locator('.amount').innerText()).toBe('1,5kg');
	const feta = page.getByRole('button', { name: '300gr Feta 4,20', exact: true });
	await expect(feta.locator('.amount')).toHaveText('300g');

	// One bag at 3,00 and one pack at 4,20, not three hundred of them.
	await expect(total(page)).toHaveText('7,20');
});

test('half counts in full, because half a task is still on the list', async ({ page }) => {
	await addTask(page, 'Bread 10');
	await addTask(page, 'Milk 20');
	await expect(total(page)).toHaveText('30');

	await task(page, 'Milk 20').focus();
	await page.keyboard.press('Shift+ ');
	await expect(task(page, 'Milk 20')).toHaveAttribute('aria-checked', 'mixed');
	await expect(total(page)).toHaveText('30');

	// And done stops counting from the same place.
	await task(page, 'Milk 20').click();
	await expect(task(page, 'Milk 20')).toHaveAttribute('aria-checked', 'true');
	await expect(total(page)).toHaveText('10');
});

test('a group with no prices in it has no total', async ({ page }) => {
	await addTask(page, 'Bread');
	await expect(total(page)).toHaveCount(0);

	await addTask(page, 'Milk 2,50');
	await expect(total(page)).toHaveText('2,50');
});

test('the total stays when the group is collapsed or being renamed', async ({ page }) => {
	await theList(page);

	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(page.getByRole('button', { name: 'Expand group' })).toBeVisible();
	await expect(total(page)).toHaveText('126,06');

	await page.getByRole('button', { name: 'Expand group' }).click();
	await page.getByRole('button', { name: 'Listula' }).dblclick();
	await expect(page.getByRole('textbox', { name: 'Group title' })).toBeVisible();
	await expect(total(page)).toHaveText('126,06');
});

test('a group writes its numbers one way, whatever way they were typed', async ({ page }) => {
	await theList(page);

	// Two rows wrote a comma against one dot, and one wrote no decimals at all.
	const shown = await page.evaluate(() =>
		[...document.querySelectorAll('.tasks li .cost')].map((el) => el.textContent)
	);
	expect(shown).toStrictEqual(['5,08', '20,00', '5,90', '10,00']);

	// The stored text is untouched: the accessible name is still what was typed.
	await expect(page.getByRole('button', { name: '3 Potatos 20.00', exact: true })).toHaveAttribute(
		'aria-label',
		'3 Potatos 20.00'
	);
});

test('a currency mark the group agrees on goes onto every row', async ({ page }) => {
	await addTask(page, 'Bread €10');
	await addTask(page, 'Milk 2,50');

	const shown = await page.evaluate(() =>
		[...document.querySelectorAll('.tasks li .cost')].map((el) => el.textContent)
	);
	expect(shown).toStrictEqual(['10,00€', '2,50€']);
	await expect(total(page)).toHaveText('12,50€');

	// Two marks that disagree, and neither is put in anyone's mouth.
	await addTask(page, 'Wine $8');
	const disagreed = await page.evaluate(() =>
		[...document.querySelectorAll('.tasks li .cost')].map((el) => el.textContent)
	);
	expect(disagreed).toStrictEqual(['10,00', '2,50', '8,00']);
	await expect(total(page)).toHaveText('20,50');
});

test('every ✕ on the sheet stands in one column, out of the way', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await theList(page);

	const priced = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('.tasks li .cost')].map((el) =>
				Math.round(el.getBoundingClientRect().right)
			)
		);

	const before = await priced();
	await task(page, '5 Leeks 10').click();

	// The row that gained a ✕ did not give up any of the price column for it.
	expect(await priced()).toStrictEqual(before);

	// The group's own ✕ appears while its name is being edited, in the same
	// place as the task's, and neither pushes the sheet sideways.
	await page.getByRole('button', { name: 'Listula' }).dblclick();
	const columns = await page.evaluate(() =>
		[...document.querySelectorAll('.remove')].map((el) =>
			Math.round(el.getBoundingClientRect().left)
		)
	);
	expect(columns).toHaveLength(2);
	expect(columns[0]).toBe(columns[1]);

	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		)
	).toBe(false);
});

test('the total stands directly over the prices it is the sum of', async ({ page }) => {
	await theList(page);

	const edges = await page.evaluate(() => {
		const right = (el: Element) => Math.round(el.getBoundingClientRect().right);
		return {
			total: right(document.querySelector('.total')!),
			prices: [...document.querySelectorAll('.tasks li .cost')].map(right)
		};
	});

	for (const price of edges.prices) expect(price).toBe(edges.total);
});

test('a title that wraps keeps its total on the last line, beside the fold icon', async ({
	page
}) => {
	// Narrow enough that the title has to wrap onto three lines.
	await page.setViewportSize({ width: 320, height: 700 });
	await theList(page);

	await page.locator('section .title').first().dblclick();
	await page.getByRole('textbox', { name: 'Group title' }).fill('Saturday morning market run');
	await page.getByRole('textbox', { name: 'Group title' }).press('Enter');
	await page.keyboard.press('Escape');

	const geo = await page.evaluate(() => {
		const mid = (el: Element) => {
			const r = el.getBoundingClientRect();
			return (r.top + r.bottom) / 2;
		};
		const header = document.querySelector('section .header')!.getBoundingClientRect();
		return {
			lines: Math.round(header.height / 44),
			icon: mid(document.querySelector('section .title-wrap .icon')!),
			total: mid(document.querySelector('.total')!),
			headerMid: (header.top + header.bottom) / 2
		};
	});

	// The title really did wrap — otherwise this proves nothing.
	expect(geo.lines).toBeGreaterThan(1);

	/*
	 * On the icon's line, not floating beside the middle of the block: the
	 * icon flows after the last word, and the sum belongs on the same line as
	 * the words it is the sum of.
	 */
	expect(Math.abs(geo.total - geo.icon)).toBeLessThan(6);
	expect(geo.total).toBeGreaterThan(geo.headerMid);
});

/*
 * And the column itself ends on the corner above it.
 *
 * The buttons up there are --touch squares with a --glyph drawn in the middle,
 * so their ink stops short of their boxes. The figures line up on the ink,
 * because the box is not a thing anybody can see — and stopping there is what
 * leaves the ✕ room to stand in the margin without touching either the last
 * digit or the drawn edge of the paper.
 */
test('the figures are set apart, and the words are not', async ({ page }) => {
	await theList(page);

	const row = page.getByRole('button', { name: '2x Tomatos 5,08', exact: true });
	const count = row.locator('.amount');
	const name = row.locator('.name');
	const price = row.locator('.cost');

	// Typed `2x`, written out with the one multiplication sign the column uses.
	await expect(count).toHaveText('2×');
	await expect(price).toHaveText('5,08');

	// The name keeps the casing it was typed in, and the caps stay CSS.
	await expect(name).toHaveText('Tomatos');
	expect(await name.innerText()).toBe('TOMATOS');

	for (const figure of [count, price, total(page)]) {
		const stack = await figure.evaluate((el) => getComputedStyle(el).fontFamily);
		expect(stack).toContain('ui-monospace');
		// A face of its own is difference enough; it does not need weight as well.
		await expect(figure).toHaveCSS('font-weight', '400');
		await expect(figure).toHaveCSS('font-variant-numeric', 'tabular-nums');
	}

	// The words beside them are still the one hand the sheet is written in.
	const words = await name.evaluate((el) => getComputedStyle(el).fontFamily);
	expect(words).toContain('Graphe');
});

test('the prices end level, and the counts are not a column', async ({ page }) => {
	await theList(page);

	const edges = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('.tasks li button.text')];
		return rows
			.filter((row) => row.querySelector('.cost'))
			.map((row) => ({
				words: row.querySelector('.name')!.textContent,
				name: Math.round(row.querySelector('.name')!.getBoundingClientRect().left),
				price: Math.round(row.querySelector('.cost')!.getBoundingClientRect().right)
			}));
	});

	expect(edges.length).toBe(4);

	// One column, at the right, and only one.
	for (const edge of edges) expect(edge.price).toBe(edges[0].price);

	/*
	 * "Onions" has no count in front of it, so it begins further left than the
	 * rows that do. A count is a word standing in for a word, not a column —
	 * keeping space for one on every row indents half a list to line up numbers
	 * most of it does not have.
	 */
	const onions = edges.find((edge) => edge.words === 'Onions')!;
	const tomatos = edges.find((edge) => edge.words === 'Tomatos')!;
	expect(onions.name).toBeLessThan(tomatos.name);
});

test('what is read is not what is stored', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await theList(page);

	// The accessible name is the whole line, as typed, in the casing it was
	// typed in — the split is for the eye only.
	const row = page.getByRole('button', { name: '2x Tomatos 5,08', exact: true });
	await expect(row).toHaveAttribute('aria-label', '2x Tomatos 5,08');

	await fromMenu(page, 'Export');
	const exported = await page.evaluate(() => navigator.clipboard.readText());
	expect(exported).toContain('- [ ] 2x Tomatos 5,08');
	expect(exported).toContain('- [ ] Onions 5,90');
	expect(exported).not.toContain('TOMATOS');
});

test('a long name with a price does not push the sheet sideways', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 720 });
	await addTask(page, '12x Something rather long that has to wrap on a phone 1.234,56');

	await expect(total(page)).toHaveText('14814,72');
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		)
	).toBe(false);
});
