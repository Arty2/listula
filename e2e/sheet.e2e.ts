import { expect, test, type Page } from '@playwright/test';

/*
 * M1's acceptance: add, edit, reorder, tri-state, group, collapse and delete
 * all work, and a reload preserves everything.
 */

async function addTask(page: Page, text: string, groupIndex = 0) {
	// Committing leaves the row open for the next one, so close any that is
	// already open before picking the group to add to.
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).nth(groupIndex).click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

/**
 * Long enough to pick a group up.
 *
 * A group title has two presses in it — the shorter one opens the name — so it
 * waits twice as long as a task does. See LIFT_MS in src/lib/dnd/longpress.ts.
 */
const CARRY_MS = 1100;

function task(page: Page, text: string) {
	return page.getByRole('checkbox', { name: text });
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('a fresh sheet is one named group, one empty box, and an ellipsis', async ({ page }) => {
	// Displayed in caps, stored in sentence case — the uppercase is CSS only.
	const title = page.getByRole('button', { name: 'Listula' });
	await expect(title).toBeVisible();
	await expect(title).toHaveCSS('text-transform', 'uppercase');
	expect(await title.innerText()).toBe('LISTULA');

	await expect(page.getByRole('button', { name: 'Add a task' })).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Add a group' })).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('a title being typed looks like the title it becomes', async ({ page }) => {
	await page.getByRole('button', { name: 'Listula' }).dblclick();

	const input = page.getByRole('textbox', { name: 'Group title' });
	await expect(input).toBeVisible();

	const title = page.getByRole('button', { name: 'Add a group' });
	const face = await title.evaluate((el) => getComputedStyle(el).fontFamily);

	await expect(input).toHaveCSS('text-transform', 'uppercase');
	await expect(input).toHaveCSS('font-family', face);

	// And what is stored keeps the casing that was typed.
	await input.fill('Weekend jobs');
	await input.press('Enter');

	const renamed = page.getByRole('button', { name: 'Weekend jobs' });
	expect(await renamed.innerText()).toBe('WEEKEND JOBS');
});

test('the new-group placeholder lines up with the group titles', async ({ page }) => {
	const title = await page.getByRole('button', { name: 'Listula' }).boundingBox();
	const placeholder = await page.getByRole('button', { name: 'Add a group' }).boundingBox();

	// Same left edge: it is the same thing, one step earlier.
	expect(placeholder!.x).toBeCloseTo(title!.x, 0);
});

test('committing leaves a fresh empty box beneath, so a burst is just typing', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill('Bread');
	await input.press('Enter');

	// Still open, still focused, and emptied ready for the next one.
	await expect(input).toBeFocused();
	await expect(input).toHaveValue('');

	await input.fill('Coffee');
	await input.press('Enter');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Coffee')).toBeVisible();
});

test('adds tasks in a burst and keeps them across a reload', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee, the dark one');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Coffee, the dark one')).toBeVisible();

	await page.reload();

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Coffee, the dark one')).toBeVisible();
});

test('a tap toggles to-do and done, and the state survives a reload', async ({ page }) => {
	await addTask(page, 'Bread');

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');

	await task(page, 'Bread').click();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');

	await page.reload();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');

	await task(page, 'Bread').click();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
});

test('shift+space sets the half state, which reports as mixed', async ({ page }) => {
	await addTask(page, 'Bread');

	await task(page, 'Bread').focus();
	await page.keyboard.press('Shift+ ');

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'mixed');

	// Half done again returns it to to-do.
	await page.keyboard.press('Shift+ ');
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
});

test('a long press on the checkbox sets half without a keyboard', async ({ page }) => {
	await addTask(page, 'Bread');

	const box = task(page, 'Bread');
	const at = await box.boundingBox();
	if (!at) throw new Error('no checkbox');

	await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(700);
	await page.mouse.up();

	await expect(box).toHaveAttribute('aria-checked', 'mixed');
});

test('edits a task in place', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	const input = page.getByRole('textbox').first();
	await input.fill('Sourdough');
	await input.press('Enter');

	await expect(task(page, 'Sourdough')).toBeVisible();
	await page.reload();
	await expect(task(page, 'Sourdough')).toBeVisible();
});

test('deletes a task and offers it back', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	// Only a done task offers a way out, so finish it before removing it.
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();

	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	await page.reload();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('the group mark sweeps its done tasks only, and half-done stays', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await addTask(page, 'Milk');

	await task(page, 'Bread').click();

	await task(page, 'Coffee').focus();
	await page.keyboard.press('Shift+ ');

	/*
	 * Clearing is no longer in the menu. The group's own mark does it while
	 * there is still something in the group to do, and removes the group once
	 * there is not — one mark, in the column every delete mark stands in. It
	 * is offered while the name is open, which is one of the two states that
	 * put a group in hand rather than in a list.
	 */
	await page.getByRole('button', { name: 'Listula' }).dblclick();
	await page.getByRole('button', { name: 'Clear done tasks' }).click();

	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);
	await expect(task(page, 'Coffee')).toBeVisible();
	await expect(task(page, 'Milk')).toBeVisible();

	// No confirm in front of it, so the undo is the whole of the way back.
	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('the group mark says which of its two jobs it would do', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	const clear = page.getByRole('button', { name: 'Clear done tasks' });
	const remove = page.getByRole('button', { name: 'Delete group' });

	// Folded is one of the two states that put a group in hand.
	await page.getByRole('button', { name: 'Collapse group' }).click();

	// Nothing done: the mark would do neither thing, so it is not drawn.
	await expect(clear).toHaveCount(0);
	await expect(remove).toHaveCount(0);

	await page.getByRole('button', { name: 'Expand group' }).click();
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(clear).toBeVisible();
	await expect(remove).toHaveCount(0);

	// Everything done, so what the mark offers is the group itself.
	await page.getByRole('button', { name: 'Expand group' }).click();
	await task(page, 'Coffee').click();
	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(clear).toHaveCount(0);
	await expect(remove).toBeVisible();
});

test('the group mark keeps out of a list being read', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await task(page, 'Bread').click();

	const clear = page.getByRole('button', { name: 'Clear done tasks' });

	/*
	 * Open and not being edited, the group is one heading in a list somebody is
	 * reading — and a live delete on every heading with a done task under it is
	 * a column of them down the sheet. The row's own mark is a different thing:
	 * it is on the task it would remove.
	 */
	await expect(clear).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Delete task' })).toBeVisible();

	// Attending to this group, either way, and it is there.
	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(clear).toBeVisible();

	await page.getByRole('button', { name: 'Expand group' }).click();
	await expect(clear).toHaveCount(0);

	await page.getByRole('button', { name: 'Listula' }).dblclick();
	await expect(clear).toBeVisible();
});

test('makes a group, collapses it, and remembers that locally', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const title = page.getByRole('textbox', { name: 'New group' });
	await title.fill('Market');
	await title.press('Enter');

	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	await addTask(page, 'Bread', 1);
	await expect(task(page, 'Bread')).toBeVisible();

	// The icon collapses; the title is for renaming and does not toggle.
	await page.getByRole('button', { name: 'Collapse group' }).nth(1).click();
	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);
	// Nothing in it is done, so both halves of a fraction would be the same
	// number and it says no more than the total does.
	await expect(page.getByRole('button', { name: 'Expand group' })).toHaveText('(1)');

	await page.reload();
	await expect(page.getByRole('button', { name: 'Expand group' })).toHaveText('(1)');

	await page.getByRole('button', { name: 'Expand group' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('moves a task with the keyboard and announces where it went', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	expect(await order()).toStrictEqual(['Bread', 'Coffee']);

	await task(page, 'Bread').focus();
	await page.keyboard.press('Alt+ArrowDown');

	expect(await order()).toStrictEqual(['Coffee', 'Bread']);
	await expect(page.getByRole('status').first()).toContainText('Moved to position 2');

	await page.reload();
	expect(await order()).toStrictEqual(['Coffee', 'Bread']);
});

/**
 * Pick something up: press, hold past the long press, and stay still while it
 * lifts. Movement before the threshold is a scroll and cancels the gesture.
 */
async function lift(page: Page, locator: ReturnType<Page['getByRole']>) {
	const box = (await locator.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
}

async function carryTo(page: Page, locator: ReturnType<Page['getByRole']>) {
	const box = (await locator.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
}

const order = (page: Page) =>
	page.getByRole('checkbox').evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

test('a task dropped below the last one lands last, not first', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await addTask(page, 'Milk');

	/*
	 * Below the last row there is no row to hit-test, only the group — and the
	 * group used to count the row being carried among its own children, so the
	 * drop asked for a place one past the end. Neither neighbour existed at
	 * that index, and a key between nothing and nothing is the first key there
	 * is: the task went to the top of the group from the bottom of it.
	 */
	await lift(page, page.getByRole('button', { name: 'Coffee', exact: true }));
	await carryTo(page, page.getByRole('button', { name: 'Add a task' }).first());
	await page.mouse.up();

	expect(await order(page)).toStrictEqual(['Bread', 'Milk', 'Coffee']);

	await page.reload();
	expect(await order(page)).toStrictEqual(['Bread', 'Milk', 'Coffee']);
});

test('a task already last is offered no landing below itself', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	// The same dead zone the row itself has: letting go here changes nothing,
	// so nothing is drawn offering to do it.
	await lift(page, page.getByRole('button', { name: 'Coffee', exact: true }));
	await carryTo(page, page.getByRole('button', { name: 'Add a task' }).first());

	await expect(page.locator('.landing')).toHaveCount(0);
	await page.mouse.up();

	expect(await order(page)).toStrictEqual(['Bread', 'Coffee']);
});

test('the landing rule is drawn where the row would land, not under itself', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await addTask(page, 'Milk');

	const coffee = (await page.getByRole('button', { name: 'Coffee', exact: true }).boundingBox())!;

	/*
	 * The lower half of Coffee means below Coffee. The hit test counts the rows
	 * with the carried one taken out and the sheet draws every row it has, so
	 * without translating between the two the rule appeared directly under the
	 * row in the hand — an offer to put it back where it already was, beside a
	 * drop that would have done something else.
	 */
	await lift(page, page.getByRole('button', { name: 'Bread', exact: true }));
	await page.mouse.move(coffee.x + coffee.width / 2, coffee.y + coffee.height - 3, { steps: 8 });

	const where = await page.evaluate(() => {
		const rule = document.querySelector('.landing')!.getBoundingClientRect();
		const rows = [...document.querySelectorAll('[data-task]')].map((el) =>
			el.getBoundingClientRect()
		);
		return { rule: rule.top, first: rows[0].bottom, second: rows[1].bottom };
	});

	expect(where.rule).toBeGreaterThan(where.first);
	expect(where.rule).toBeGreaterThanOrEqual(where.second - 3);

	await page.mouse.up();
	expect(await order(page)).toStrictEqual(['Coffee', 'Bread', 'Milk']);
});

test('a move can be taken back from the message it leaves', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await addTask(page, 'Milk');

	await lift(page, page.getByRole('button', { name: 'Bread', exact: true }));
	await carryTo(page, page.getByRole('button', { name: 'Add a task' }).first());
	await page.mouse.up();

	expect(await order(page)).toStrictEqual(['Coffee', 'Milk', 'Bread']);

	// A drop leaves no trace of where the thing came from, which is why it is
	// the one change a finger makes that most wants taking back.
	await page.getByRole('button', { name: 'UNDO?' }).click();
	expect(await order(page)).toStrictEqual(['Bread', 'Coffee', 'Milk']);
});

test('a run of ticks offers to clear itself', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await addTask(page, 'Milk');

	await task(page, 'Bread').click();
	await task(page, 'Coffee').click();

	// Two is a pair, which happens all day.
	await expect(page.getByRole('button', { name: 'CLEAR?' })).toHaveCount(0);

	await task(page, 'Milk').click();
	await expect(page.getByRole('status').filter({ hasText: '3 things done' })).toBeVisible();

	await page.getByRole('button', { name: 'CLEAR?' }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	// And the sweep is a change like any other, so it can be taken back.
	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(3);
});

test('a long press on the fold icon folds every group', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Add a group' }).click();
	const title = page.getByRole('textbox', { name: 'New group' });
	await title.fill('Market');
	await title.press('Enter');
	await addTask(page, 'Milk', 1);

	const icon = page.getByRole('button', { name: 'Collapse group' }).first();
	const box = (await icon.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await page.mouse.up();

	// Both, from one icon — and the tap that follows the press does not open
	// the group again underneath it.
	await expect(page.getByRole('button', { name: 'Expand group' })).toHaveCount(2);
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	// Nothing left folded to see the point of, so the press opens them again.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await page.mouse.up();

	await expect(page.getByRole('checkbox')).toHaveCount(2);
});

test('ticking a task to done draws the sparkle flourish, with no toast', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	await task(page, 'Bread').click();
	await task(page, 'Coffee').click();

	await expect(task(page, 'Coffee').locator('svg.sparkle')).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Consummatum' })).toHaveCount(0);

	/*
	 * And thrown out from the mark, not from the middle of the target.
	 *
	 * The flourish is centred on the box it is drawn in, and that box is the
	 * whole height of the row — so on a task over two lines its middle is a
	 * point with nothing drawn at it. Centred there, the sparkle came off a
	 * tick that was not where the ink was.
	 */
	const apart = await page.evaluate(() => {
		const row = document.querySelector('.tasks li:has(svg.sparkle)')!;
		const mark = row.querySelector('[role="checkbox"] svg:not(.sparkle)')!.getBoundingClientRect();
		const spark = row.querySelector('svg.sparkle')!.getBoundingClientRect();
		return {
			x: Math.abs(mark.left + mark.width / 2 - (spark.left + spark.width / 2)),
			y: Math.abs(mark.top + mark.height / 2 - (spark.top + spark.height / 2))
		};
	});

	// One point, within the rounding a drawn box costs.
	expect(apart.x).toBeLessThan(1);
	expect(apart.y).toBeLessThan(1);
});

test('the header control collapses and expands, and counts what it hides', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	// Expanded it offers to close, and says nothing about how much is there —
	// the tasks are on screen to be counted.
	const collapse = page.getByRole('button', { name: 'Collapse group' });
	await expect(collapse).toHaveAttribute('aria-expanded', 'true');
	await expect(collapse).toHaveText('(…)');

	await collapse.click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toHaveCount(0);

	// Closed, the number is the only account of what went away — and while
	// nothing in there is done, a total is the whole of what there is to say.
	const expand = page.getByRole('button', { name: 'Expand group' });
	await expect(expand).toHaveAttribute('aria-expanded', 'false');
	await expect(expand).toHaveText('(2)');

	// Once something is done, the fraction says the thing a total could not.
	await expand.click();
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(page.getByRole('button', { name: 'Expand group' })).toHaveText('(1/2)');

	await expand.click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
});

test('the ghost checkbox opens the row it sits on', async ({ page }) => {
	/*
	 * It is an empty box in a 44px target beside a row that opens on a tap.
	 * Leaving it inert made half the control dead, and which half was invisible.
	 */
	const ghost = page.locator('button.box').first();
	await ghost.click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await expect(input).toBeFocused();

	// And it really is the add row, not just a focused field.
	await input.fill('Bread');
	await input.press('Enter');
	await expect(task(page, 'Bread')).toBeVisible();
});

test('a done task offers its own way out, and the way back', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	/*
	 * Nothing to remove until something is done — no hover exists on a phone.
	 * The pointer has to be moved off first: adding tasks pushes the add row
	 * down, so it ends up resting on a task row, and the ✕ answers a hover.
	 */
	await page.mouse.move(0, 0);
	await expect(page.getByRole('button', { name: 'Delete task' })).toHaveCount(0);

	await page.getByRole('checkbox', { name: 'Bread' }).click();
	const remove = page.getByRole('button', { name: 'Delete task' });
	await expect(remove).toHaveCount(1);

	await remove.click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toHaveCount(0);

	// Deleting is local and immediate, so the way back is the toast.
	const toast = page.getByRole('status').filter({ hasText: /deleted/i });
	await expect(toast).toBeVisible();
	// Everything the sheet says is set in capitals.
	await expect(toast.locator('span').first()).toHaveCSS('text-transform', 'uppercase');

	await toast.getByRole('button', { name: 'Undo?' }).click();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
});

test('the title renames, the icon collapses, and neither does the other', async ({ page }) => {
	await addTask(page, 'Bread');

	/*
	 * They used to share the title: a tap collapsed and a double tap renamed, so
	 * every rename began by collapsing the group and every collapse was one slip
	 * away from an edit box.
	 */
	await page.getByRole('button', { name: 'Listula' }).dblclick();
	const field = page.getByRole('textbox', { name: 'Group title' });
	await expect(field).toBeFocused();

	// Editing did not collapse anything.
	await expect(task(page, 'Bread')).toBeVisible();

	await field.fill('Market');
	await field.press('Enter');
	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	// And the icon collapses without opening the name.
	await page.getByRole('button', { name: 'Collapse group' }).click();
	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Group title' })).toHaveCount(0);
});

test('a group can be removed only once nothing in it is left to do', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	const remove = page.getByRole('button', { name: 'Delete group' });
	const clear = page.getByRole('button', { name: 'Clear done tasks' });

	// With the name open, which is where the mark is offered.
	const open = () => page.locator('section[data-group] .title').dblclick();
	const shut = () => page.keyboard.press('Escape');

	/*
	 * The mark in the gutter is not a disabled delete waiting to be earned. It
	 * is drawn when it has something to do and named for whichever of its two
	 * jobs that is: nothing done, so nothing yet.
	 */
	await open();
	await expect(remove).toHaveCount(0);
	await expect(clear).toHaveCount(0);
	await shut();

	await task(page, 'Bread').click();
	// One still open, so the group cannot go — but what is done can.
	await open();
	await expect(remove).toHaveCount(0);
	await expect(clear).toBeVisible();
	await shut();

	await task(page, 'Milk').click();
	await open();
	await expect(clear).toHaveCount(0);
	await expect(remove).toBeEnabled();
	await remove.click();

	/*
	 * The group and everything in it, and a toast that says how much went — in
	 * the same word the button that did it uses, and the same word a task's own
	 * message uses.
	 */
	await expect(page.getByRole('button', { name: 'Listula' })).toHaveCount(0);
	await expect(page.getByRole('status').last()).toContainText('Deleted “Listula” and 2 done.');
});

test('a lift interrupted by the row leaving does not stick', async ({ page }) => {
	await addTask(page, 'Bread');

	const title = page.locator('section[data-group] .title');
	const box = (await title.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(CARRY_MS);
	await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 4 });

	// Carried, so everything is folded shut and the title is drawn lifted.
	await expect(page.locator('.lifted')).toHaveCount(1);
	await expect(page.locator('.tasks')).toHaveCount(0);

	/*
	 * The node leaves the document with the pointer still down. F2 is only the
	 * shortest way to make that happen — the title swaps itself for its own
	 * edit field — and the fault was never the key: once the element is gone,
	 * no pointerup, pointercancel or lostpointercapture reaches its handlers
	 * again, and the lift is a single shared state. What was left behind was
	 * every group folded shut and a dashed outline round a title, for good.
	 */
	await page.keyboard.press('F2');
	await page.mouse.up();

	await expect(page.locator('.lifted')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.locator('.tasks')).toHaveCount(1);
	await expect(task(page, 'Bread')).toBeVisible();
});

test('holding a group title briefly opens its name', async ({ page }) => {
	await addTask(page, 'Bread');

	const title = page.locator('section[data-group] .title');
	const box = (await title.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();

	/*
	 * Past the first threshold and let go before the second. Two taps was the
	 * only way to a rename, and two taps is a gesture you have to be told
	 * about, where a press is what a finger tries on anything it suspects of
	 * holding more.
	 */
	await page.waitForTimeout(650);
	await page.mouse.up();

	await expect(page.getByRole('textbox', { name: 'Group title' })).toBeVisible();

	// And the tap that follows the press does not fold the group underneath it.
	await expect(page.locator('.tasks')).toHaveCount(1);
});

test('a press too short for either does nothing but fold', async ({ page }) => {
	await addTask(page, 'Bread');

	const title = page.locator('section[data-group] .title');
	const box = (await title.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(250);
	await page.mouse.up();

	await expect(page.getByRole('textbox', { name: 'Group title' })).toHaveCount(0);
	await expect(page.locator('.tasks')).toHaveCount(0);
});

test('a long press on a group title picks the whole group up', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Add a group' }).click();
	const name = page.getByRole('textbox', { name: 'New group' });
	await name.fill('Market');
	await name.press('Enter');
	await addTask(page, 'Milk', 1);

	const order = () =>
		page
			.locator('section[data-group] .title')
			.evaluateAll((titles) => titles.map((t) => t.textContent!.trim()));

	expect(await order()).toStrictEqual(['Listula', 'Market']);

	// Held past both thresholds: holding briefly would open the name instead.
	const title = page.getByRole('button', { name: 'Market' });
	const from = (await title.boundingBox())!;
	const to = (await page.getByRole('button', { name: 'Listula' }).boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);

	// The lift is a dashed outline and a tilt, as it is for a task.
	await expect(page.locator('section[data-group] .header svg.rect path')).toHaveCount(1);

	await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 12 });
	await page.mouse.up();

	expect(await order()).toStrictEqual(['Market', 'Listula']);
	await page.reload();
	expect(await order()).toStrictEqual(['Market', 'Listula']);
});

test('dropping a task does not open it for editing', async ({ page }) => {
	/*
	 * The release after a drag still fires a click, and the thing being held is
	 * a button — so every drop landed the row in an edit box. It was there
	 * before groups could be dragged; the group drag is what made it obvious.
	 */
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	const row = page.getByRole('button', { name: 'Coffee', exact: true });
	const from = (await row.boundingBox())!;
	const to = (await page.getByRole('button', { name: 'Bread', exact: true }).boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(CARRY_MS);
	await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 12 });
	await page.mouse.up();

	await expect(page.getByRole('textbox')).toHaveCount(0);

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));
	expect(await order()).toStrictEqual(['Coffee', 'Bread']);
});

test('Enter on a task opens a fresh one directly beneath it', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	// Editing the first one and pressing Enter leaves it and opens a row below.
	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	// The edit field is the only textbox on the sheet while it is open.
	await page.getByRole('textbox').first().press('Enter');

	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toBeFocused();

	await fresh.fill('Butter');
	await fresh.press('Enter');

	/*
	 * `expect.poll` rather than `expect(await order())`: reading the rows is a
	 * one-shot evaluate, and a bare expect around one does not retry. The row
	 * commits and the next opens in the same keydown, so the assertion could
	 * land between the two and see the list mid-write — rarely, and only under
	 * enough load to matter, which is exactly what CI is.
	 */
	// Between the two, not on the end — and the next one carries on below it.
	await expect.poll(order).toStrictEqual(['Bread', 'Butter', 'Milk']);

	await fresh.fill('Jam');
	await fresh.press('Enter');
	await expect.poll(order).toStrictEqual(['Bread', 'Butter', 'Jam', 'Milk']);

	await page.keyboard.press('Escape');
	await page.reload();
	await expect.poll(order).toStrictEqual(['Bread', 'Butter', 'Jam', 'Milk']);
});

test('tapping a task takes the caret with it', async ({ page }) => {
	/*
	 * The field used to be swapped in unfocused, which meant it never blurred,
	 * so the row never committed and never came out of edit mode — it simply sat
	 * there showing the raw string. On a task with a count and a price in it,
	 * that reads exactly like the two being lost.
	 */
	await addTask(page, '2x Tomatos 5,08');
	await page.getByRole('button', { name: '2x Tomatos 5,08', exact: true }).click();

	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	/*
	 * Somewhere in the task, and inside the name rather than at either end of
	 * the string: the row draws `Tomatos` alone in the middle cell, and the
	 * offset has to be carried back past the count to reach the text itself.
	 * Tapped at the end of a word, so the exact character is not at the mercy
	 * of where in a glyph the click landed.
	 */
	const caret = await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
	expect(caret).toBeGreaterThan(2);
	expect(caret).toBeLessThanOrEqual(10);

	// And because it can blur, it commits, and the row goes back to being read.
	await page.keyboard.press('Escape');
	await expect(page.locator('.tasks li .cost').first()).toHaveText('5,08');

	/*
	 * The same on a task that is done — where this was first noticed.
	 *
	 * Clear of the tap window first. Two taps on one row inside 320ms are one
	 * run whatever happened between them, and the assertions above run in
	 * rather less than that — so without the wait this second tap climbs the
	 * first one's ladder instead of starting a run of its own.
	 */
	await page.waitForTimeout(450);
	await task(page, '2x Tomatos 5,08').click();
	await page.waitForTimeout(450);
	await page.getByRole('button', { name: '2x Tomatos 5,08', exact: true }).click();
	await expect(page.getByRole('textbox').first()).toBeFocused();
});

test('the caret lands where the finger did, not at the end', async ({ page }) => {
	const long = 'Bread and butter and jam and cheese and everything else besides';
	await addTask(page, long);

	const words = page.getByRole('button', { name: long, exact: true });
	const box = (await words.boundingBox())!;

	// A quarter of the way along the first line, which is nowhere near either end.
	await page.mouse.click(box.x + box.width * 0.25, box.y + 12);

	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	const caret = await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
	expect(caret).toBeGreaterThan(2);
	expect(caret).toBeLessThan(long.length - 4);
});

test('Backspace on an empty row takes the caret back to the one above', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	// Enter opens a fresh row; backspace on it closes it again and goes back.
	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	await page.getByRole('textbox').first().press('Enter');
	await expect(page.getByRole('textbox', { name: 'New task' })).toBeFocused();

	await page.keyboard.press('Backspace');
	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();
	await expect(field).toHaveValue('Bread');
	// With the caret at the end of it, so typing carries on where it left off.
	expect(await field.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(5);

	// Nothing was created and nothing was lost.
	expect(await order()).toStrictEqual(['Bread', 'Milk']);
});

test('Escape discards an edit rather than committing it', async ({ page }) => {
	/*
	 * It could not be told apart while the field was never focused: nothing was
	 * typed into it, so nothing was there to keep. Now that the caret goes with
	 * the tap, taking the field out of the document blurs it — and a blur
	 * commits, which would make Escape a slower Enter.
	 */
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	const field = page.getByRole('textbox').first();
	await field.fill('Sourdough');
	await field.press('Escape');

	await expect(task(page, 'Bread')).toBeVisible();
	await expect(task(page, 'Sourdough')).toHaveCount(0);

	// The same on a group title.
	await page.getByRole('button', { name: 'Listula' }).dblclick();
	const title = page.getByRole('textbox', { name: 'Group title' });
	await title.fill('Market');
	await title.press('Escape');

	await expect(page.getByRole('button', { name: 'Listula' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Market' })).toHaveCount(0);
});

test('Backspace on a task emptied of its words deletes it, and offers it back', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	await page.getByRole('button', { name: 'Milk', exact: true }).dblclick();
	const field = page.getByRole('textbox').first();
	await field.fill('');
	await field.press('Backspace');

	// Gone, and the caret is at the end of the task above it.
	expect(await order()).toStrictEqual(['Bread']);
	await expect(page.getByRole('textbox').first()).toHaveValue('Bread');

	// It goes through the ordinary delete, so the ordinary undo covers it.
	await page
		.getByRole('status')
		.filter({ hasText: /deleted/i })
		.getByRole('button', { name: 'Undo?' })
		.click();
	expect(await order()).toStrictEqual(['Bread', 'Milk']);
});

test('Backspace on the first task in a group deletes nothing', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).dblclick();
	const field = page.getByRole('textbox').first();
	await field.fill('');
	await field.press('Backspace');

	// There is nowhere above for the caret to go, so the task stays.
	await expect(task(page, 'Bread')).toBeVisible();
});

test('Enter on the row that makes a group opens its first task', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const made = page.getByRole('textbox', { name: 'New group' });
	await made.fill('Market');
	await made.press('Enter');

	/*
	 * A group that has just been made is certainly empty, so the next thing is
	 * certainly a task — the same rule Enter on an existing empty group's title
	 * follows, and by far the commoner way to reach an empty group, since
	 * making one is what empties it. This row used to commit by blurring
	 * itself, and a blur has no way to say Enter was what did it.
	 */
	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toBeFocused();

	await fresh.fill('Leeks');
	await fresh.press('Enter');
	await page.keyboard.press('Escape');

	const market = page.locator('section[data-group]').nth(1);
	await expect(market.getByRole('checkbox', { name: 'Leeks' })).toBeVisible();
});

test('tapping away from that row makes the group and nothing else', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a group' }).click();
	await page.getByRole('textbox', { name: 'New group' }).fill('Market');

	// Only Enter means "and the next one". A tap somewhere else is somebody
	// leaving the field, and it must not open a row they did not ask for.
	await page.locator('main').click({ position: { x: 200, y: 420 } });

	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New task' })).toHaveCount(0);
});

test('Enter on an empty group’s title opens a task inside it', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const made = page.getByRole('textbox', { name: 'New group' });
	await made.fill('Market');
	await made.press('Enter');

	const market = page.locator('section[data-group]').nth(1);
	await market.locator('.title').dblclick();
	const title = page.getByRole('textbox', { name: 'Group title' });
	await title.fill('Market stall');
	await title.press('Enter');

	/*
	 * Naming a group and writing the first thing into it is one motion, and an
	 * empty group is the only time the next thing is certainly a task.
	 */
	await expect(page.getByRole('button', { name: 'Market stall' })).toBeVisible();

	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toBeFocused();
	await fresh.fill('Milk');
	await fresh.press('Enter');
	await page.keyboard.press('Escape');

	await expect(market.getByRole('checkbox', { name: 'Milk' })).toBeVisible();
});

test('Backspace out of that first row goes back to the name', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const made = page.getByRole('textbox', { name: 'New group' });
	await made.fill('Market');
	await made.press('Enter');

	await page.locator('section[data-group]').nth(1).locator('.title').dblclick();
	await page.getByRole('textbox', { name: 'Group title' }).press('Enter');

	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toBeFocused();

	/*
	 * The name is where this row came from, so it is where the caret goes back
	 * to — the same motion in reverse. It used to close the row and leave the
	 * caret nowhere at all, one keystroke into naming a list.
	 */
	await fresh.press('Backspace');

	const title = page.getByRole('textbox', { name: 'Group title' });
	await expect(title).toBeFocused();
	await expect(title).toHaveValue('Market');
	// At the end of it, so the writing carries on where it stopped.
	expect(await title.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(6);
});

test('Backspace out of a row with a task above it goes to the task', async ({ page }) => {
	await addTask(page, 'Bread');

	// The row the add row left open, backspaced with nothing in it: the task
	// above wins, and the group's name is not reached for.
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const fresh = page.getByRole('textbox', { name: 'New task' });
	await fresh.press('Backspace');

	const above = page.getByRole('textbox').first();
	await expect(above).toBeFocused();
	await expect(above).toHaveValue('Bread');
	await expect(page.getByRole('textbox', { name: 'Group title' })).toHaveCount(0);
});

test('Enter on a group that has tasks in it only commits the name', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.locator('section[data-group] .title').dblclick();
	const title = page.getByRole('textbox', { name: 'Group title' });
	await title.fill('Market');
	await title.press('Enter');

	/*
	 * Somebody here has come to change the name, and Enter is how you say you
	 * are done with it. An empty row opening underneath put a caret in the
	 * middle of a list nobody was adding to, and closed it again on the next
	 * tap anywhere.
	 */
	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New task' })).toHaveCount(0);
	await expect(page.getByRole('checkbox')).toHaveCount(1);
});

test('a double tap sets half, and a single one still just ticks', async ({ page }) => {
	await addTask(page, 'Bread');
	const box = task(page, 'Bread');

	// One tap is a tick, and stays one.
	await box.click();
	await expect(box).toHaveAttribute('aria-checked', 'true');
	await page.waitForTimeout(400);

	await box.click();
	await expect(box).toHaveAttribute('aria-checked', 'false');
	await page.waitForTimeout(400);

	// Two inside the window land on half, whatever the first one did.
	await box.dblclick();
	await expect(box).toHaveAttribute('aria-checked', 'mixed');

	await page.reload();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'mixed');
});

test('removing a group offers it back, with everything that was in it', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');
	await task(page, 'Bread').click();
	await task(page, 'Milk').click();

	await page.getByRole('button', { name: 'Listula' }).dblclick();
	await page.getByRole('button', { name: 'Delete group' }).click();

	await expect(page.getByRole('button', { name: 'Listula' })).toHaveCount(0);
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await page.getByRole('button', { name: 'UNDO?' }).click();

	// The group, its name, and both tasks — not a pile under Loose ends.
	await expect(page.getByRole('button', { name: 'Listula' })).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
	await expect(page.getByText('Loose ends')).toHaveCount(0);

	await page.reload();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
});

test('carrying a group folds them all shut, and unfolds them after', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Add a group' }).click();
	const name = page.getByRole('textbox', { name: 'New group' });
	await name.fill('Market');
	await name.press('Enter');
	await addTask(page, 'Milk', 1);

	await expect(page.getByRole('checkbox')).toHaveCount(2);

	const title = page.getByRole('button', { name: 'Market' });
	const from = (await title.boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(CARRY_MS);

	/*
	 * Everything folds while one is being carried, so the whole list is a
	 * handful of titles and there is somewhere visible to put it down.
	 */
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await page.mouse.up();
	await expect(page.getByRole('checkbox')).toHaveCount(2);

	// And nothing about it was written down: the fold was a view of the drag.
	await page.reload();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
});

/**
 * Strands a task under a group that is not in the document, which is the only
 * way Loose ends comes about: a group deleted on another phone, or a list
 * imported with nothing above it.
 */
async function strand(page: Page, ...texts: string[]) {
	await addTask(page, 'Bread');
	await page.evaluate((stray) => {
		const doc = JSON.parse(localStorage.getItem('consumma:doc')!);
		const first = Object.values(doc.tasks)[0] as Record<string, unknown>;

		stray.forEach((text, i) => {
			const task = JSON.parse(JSON.stringify(first));
			task.id = `stranded${i}`;
			task.text = text;
			task.groupId = 'agroupthatisgone';
			doc.tasks[task.id] = task;
		});

		localStorage.setItem('consumma:doc', JSON.stringify(doc));
	}, texts);
	await page.reload();
}

test('what has lost its group is ruled off rather than headed', async ({ page }) => {
	await strand(page, 'Stray');

	/*
	 * Loose ends only ever appears because two phones disagreed. Nothing under
	 * it was put there on purpose, so there is nothing to name, rename, delete,
	 * carry, collapse or add to — and a title row offers every one of those just
	 * by looking like one. A perforation across the paper offers none.
	 */
	const line = page.getByRole('separator', { name: 'Loose ends' });
	await expect(line).toBeVisible();

	// Drawn and dashed, like the landing rule and the paper's own edges.
	const path = line.locator('path');
	await expect(path).toHaveClass(/drawn--dashed/);
	expect(await path.evaluate((el) => getComputedStyle(el).strokeWidth)).toBe(
		await page.evaluate(
			() => getComputedStyle(document.documentElement).getPropertyValue('--stroke').trim() + 'px'
		)
	);

	// Right across the paper, not the width of a word — the rules are not.
	const across = (await line.boundingBox())!.width;
	const sheet = (await page.locator('main').boundingBox())!.width;
	expect(across).toBeCloseTo(sheet, 0);

	// None of the things a heading offers.
	await expect(page.getByRole('button', { name: 'Loose ends' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add a task' })).toHaveCount(1);
	await expect(page.getByRole('button', { name: /^(Collapse|Expand) group/ })).toHaveCount(1);
	// The real group still carries its drawn underline; the perforation above
	// has nothing analogous, being a line rather than a title.
	expect(
		await page
			.locator('section.group .title')
			.evaluate((el) => getComputedStyle(el).backgroundImage)
	).not.toBe('none');

	/*
	 * And the way to make a group belongs above the line, among the ones anyone
	 * made. Under it, it would read as a way to name what is already there.
	 */
	const order = await page
		.locator('section.group, .new-group')
		.evaluateAll((els) => els.map((el) => (el.className.includes('new-group') ? 'new' : 'group')));
	expect(order).toStrictEqual(['group', 'new', 'group']);
});

test('a task carried onto the new-group row lands in one that did not exist', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Olives');
	await expect(page.locator('section.group')).toHaveCount(1);

	const row = page.getByRole('button', { name: 'Olives', exact: true });
	const from = (await row.boundingBox())!;
	const onto = (await page.locator('.new-group').boundingBox())!;

	await page.mouse.move(from.x + 30, from.y + from.height / 2);
	await page.mouse.down();
	// Long enough to lift: a shorter press is a tap and a moved one is a scroll.
	await page.waitForTimeout(600);
	await page.mouse.move(from.x + 30, from.y + 10, { steps: 4 });
	await page.mouse.move(onto.x + 30, onto.y + onto.height / 2, { steps: 12 });

	// The offer is made in the same hand as every other landing. The rule is
	// what shows; its row takes no room, so the row itself has no box at all.
	await expect(page.locator('.landing svg')).toBeVisible();

	await page.mouse.up();

	/*
	 * It arrives unnamed, showing the ellipsis an untitled group always shows.
	 * Carrying a task somewhere new is one decision; being made to name the
	 * place before the finger comes up would be a second.
	 */
	await expect(page.locator('section.group')).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Untitled group' })).toBeVisible();

	const perGroup = await page
		.locator('section.group')
		.evaluateAll((els) =>
			els.map((el) =>
				[...el.querySelectorAll('[data-task] .text')].map((t) => t.textContent!.trim())
			)
		);
	expect(perGroup).toStrictEqual([['Bread'], ['Olives']]);

	// And it survives being put down.
	await page.reload();
	await expect(page.locator('section.group')).toHaveCount(2);
});

test('the landing rule is drawn in the gap, and never moves the list', async ({ page }) => {
	/*
	 * It used to be five pixels tall and in the flow, so every time the target
	 * changed, every row past it moved five pixels — which is what the jerking
	 * under the finger was. Worse, the rows it moved are the rows the next hit
	 * test reads, so the drag was steering by a ruler it kept nudging.
	 */
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const input = page.getByRole('textbox', { name: 'New task' });
	for (const text of ['One', 'Two', 'Three', 'Four']) {
		await input.fill(text);
		await input.press('Enter');
	}
	await page.keyboard.press('Escape');

	const tops = () =>
		page
			.locator('[data-task]')
			.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));

	// The lifted row tilts, so its own box moves; the rest must not.
	const before = (await tops()).slice(1);

	const row = (await page.getByRole('button', { name: 'One', exact: true }).boundingBox())!;
	await page.mouse.move(row.x + 30, row.y + row.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await page.mouse.move(row.x + 30, row.y + 8, { steps: 3 });
	await page.mouse.move(row.x + 30, row.y + 120, { steps: 10 });

	const landing = page.locator('.landing');
	await expect(landing).toHaveCount(1);
	await expect(landing.locator('svg')).toBeVisible();

	// Drawn, but taking no room: the rule sits between two rows, not among them.
	expect(await landing.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(0);
	expect((await tops()).slice(1)).toStrictEqual(before);

	await page.mouse.up();
});

test('the phone answers back, and says different things for different acts', async ({ page }) => {
	/*
	 * `navigator.vibrate` is absent on desktop and refused outright by iOS
	 * Safari, so nothing about this can be seen by looking at the app. Stubbed
	 * and counted, because a confirmation nobody ever checks is a confirmation
	 * that quietly stopped working.
	 */
	await page.addInitScript(() => {
		(window as unknown as { buzzes: (number | number[])[] }).buzzes = [];
		Object.defineProperty(navigator, 'vibrate', {
			value: (pattern: number | number[]) => {
				(window as unknown as { buzzes: (number | number[])[] }).buzzes.push(pattern);
				return true;
			},
			configurable: true
		});
	});
	await page.reload();

	const buzzes = () =>
		page.evaluate(() => (window as unknown as { buzzes: (number | number[])[] }).buzzes);
	const clear = () =>
		page.evaluate(() => ((window as unknown as { buzzes: (number | number[])[] }).buzzes = []));

	await addTask(page, 'Bread');

	// A tick is something finished: dot dot dash.
	await clear();
	await task(page, 'Bread').click();
	expect(await buzzes()).toStrictEqual([[10, 50, 10, 50, 45]]);

	// A delete is something taken away: dot dot.
	await clear();
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	expect(await buzzes()).toStrictEqual([[10, 60, 10]]);

	// And a button is a thing done: one tap.
	await clear();
	await page.getByRole('button', { name: 'Menu' }).click();
	expect(await buzzes()).toStrictEqual([10]);
});

test('a message comes down from above and can be thrown back out', async ({ page }) => {
	/*
	 * It used to appear and disappear outright, which is the one thing on the
	 * sheet that happened rather than moved — and a message that blinks out is
	 * one you are never sure you saw.
	 */
	await addTask(page, 'Bread');
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();

	const toast = page.locator('.toast');
	await toast.waitFor();

	/*
	 * It arrives with a movement of its own, from off the top of the paper.
	 * Svelte scopes the keyframes a component declares, so the name on the page
	 * carries a hash in front of the one written in the file.
	 */
	const names = await toast.evaluate((el) =>
		el.getAnimations().map((a) => (a as CSSAnimation).animationName)
	);
	expect(names.some((name) => name.endsWith('toast-arrive'))).toBe(true);

	await toast.evaluate((el) =>
		Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined)
	);
	const landed = (await toast.boundingBox())!;
	expect(landed.y).toBeGreaterThan(0);

	// Carried upwards far enough, it goes — and takes the offer of undo with it.
	await page.mouse.move(landed.x + landed.width / 2, landed.y + landed.height / 2);
	await page.mouse.down();
	await page.mouse.move(landed.x + landed.width / 2, landed.y + landed.height / 2 - 60, {
		steps: 6
	});
	await page.mouse.up();

	await expect(toast).toHaveCount(0);
});

test('a message can be thrown out sideways too, and UNDO still works', async ({ page }) => {
	await addTask(page, 'Bread');
	await task(page, 'Bread').click();
	await page.getByRole('button', { name: 'Delete task' }).first().click();

	const toast = page.locator('.toast');
	await toast.waitFor();
	await toast.evaluate((el) =>
		Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined)
	);

	// A press that never travels is still a press: UNDO brings the task back.
	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
	await expect(toast).toHaveCount(0);

	/*
	 * And a carry rightwards takes the next one away. The undo put the task
	 * back exactly as it was, which is done — so it already offers its own way
	 * out and must not be ticked again.
	 */
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');
	await page.getByRole('button', { name: 'Delete task' }).first().click();
	await toast.waitFor();
	await toast.evaluate((el) =>
		Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined)
	);

	const box = (await toast.boundingBox())!;
	await page.mouse.move(box.x + 30, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + 30 + 70, box.y + box.height / 2, { steps: 6 });
	await page.mouse.up();

	await expect(toast).toHaveCount(0);
});

test('a lifted row is offered nowhere that would put it back', async ({ page }) => {
	/*
	 * The rule immediately above the row being carried and the rule immediately
	 * below it are the same rule: both put it back between the same two
	 * neighbours. A short drag used to spend the whole of itself showing one or
	 * other of them, which is an offer to do nothing dressed as a target.
	 */
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const input = page.getByRole('textbox', { name: 'New task' });
	for (const text of ['One', 'Two', 'Three', 'Four']) {
		await input.fill(text);
		await input.press('End');
		await input.press('Enter');
	}
	await page.keyboard.press('Escape');

	const order = () =>
		page
			.getByRole('checkbox')
			.evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')));

	const before = await order();
	const row = (await page.getByRole('button', { name: 'Two', exact: true }).boundingBox())!;

	// Lift the second row and hold it over its own place.
	await page.mouse.move(row.x + 30, row.y + row.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await page.mouse.move(row.x + 30, row.y + row.height / 2 + 4, { steps: 3 });

	// Nothing offered on its own row.
	await expect(page.locator('.landing')).toHaveCount(0);

	// Nor just above it, which is where it already begins.
	await page.mouse.move(row.x + 30, row.y - 4, { steps: 3 });
	await expect(page.locator('.landing')).toHaveCount(0);

	// Nor just below it, which is the same place said the other way round.
	await page.mouse.move(row.x + 30, row.y + row.height + 4, { steps: 3 });
	await expect(page.locator('.landing')).toHaveCount(0);

	// A real boundary two rows down does offer one.
	await page.mouse.move(row.x + 30, row.y + row.height * 2 + 4, { steps: 3 });
	await expect(page.locator('.landing')).toHaveCount(1);

	// And letting go back over its own place changes nothing at all.
	await page.mouse.move(row.x + 30, row.y + row.height / 2, { steps: 6 });
	await page.mouse.up();
	expect(await order()).toStrictEqual(before);
});

/*
 * One tap does the common thing and two open it for editing — on a task row
 * and on a group title alike, because it is one finger and one sheet.
 *
 * The two are built differently on purpose, and the difference is the point of
 * the pair of tests below: a row acts on the first tap and lets the second
 * take it back, a group title waits. See the note in GroupHeader.
 */

test('one tap opens a task, two mark it done, three mark it half', async ({ page }) => {
	await addTask(page, 'Bread and butter');

	const words = page.getByRole('button', { name: 'Bread and butter', exact: true });
	const box = (await words.boundingBox())!;
	/*
	 * Clear of the last few characters, where a run is an edit and stays one.
	 */
	const start = { x: box.x + 20, y: box.y + box.height / 2 };

	/*
	 * One tap opens it. A list is read far more often than it is ticked in one
	 * go, and the checkbox beside the words is the control whose whole job is
	 * the tick — so the words answer the thing the words are for.
	 */
	await page.mouse.click(start.x, start.y);
	await expect(page.getByRole('textbox').first()).toBeFocused();
	await expect(task(page, 'Bread and butter')).toHaveAttribute('aria-checked', 'false');

	/*
	 * Clear of the window before starting again, or the next tap climbs this
	 * run rather than beginning one. The window is 320ms; the wait is generous
	 * so a slow machine cannot make two deliberate taps read as one gesture.
	 */
	await page.keyboard.press('Escape');
	await page.waitForTimeout(450);

	// Two taps mark it done — the second lands on the field the first opened.
	await page.mouse.click(start.x, start.y);
	await page.mouse.click(start.x, start.y);
	await expect(task(page, 'Bread and butter')).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByRole('textbox')).toHaveCount(0);

	await page.waitForTimeout(450);

	// And three mark it half, which is the rung above done.
	await page.mouse.click(start.x, start.y);
	await page.mouse.click(start.x, start.y);
	await page.mouse.click(start.x, start.y);
	await expect(task(page, 'Bread and butter')).toHaveAttribute('aria-checked', 'mixed');
});

test('a run of taps at the end of the words never ticks the task', async ({ page }) => {
	/*
	 * A finger in the last few characters is reaching for the end of the task —
	 * to add to it, or to press Enter and start the next thing there. Two taps
	 * there are two attempts at the same thing, not a tick.
	 */
	await addTask(page, 'Bread');

	const words = page.getByRole('button', { name: 'Bread', exact: true });
	const box = (await words.boundingBox())!;
	// Just past the last letter, which is where somebody adding to it would aim.
	const end = { x: box.x + box.width - 4, y: box.y + box.height / 2 };

	await page.mouse.click(end.x, end.y);
	await page.mouse.click(end.x, end.y);
	await page.mouse.click(end.x, end.y);

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
	await expect(page.getByRole('textbox').first()).toBeFocused();
});

/**
 * Pull a row leftwards, the way a finger does: down on the words, across, up.
 *
 * It starts at the far end of the words so there is room to travel, and moves
 * in steps because the gesture is decided on the first move rather than on the
 * release — one jump straight to the end would say nothing about direction on
 * the way there.
 */
async function pull(page: Page, locator: ReturnType<Page['getByRole']>, by: number) {
	const box = (await locator.boundingBox())!;
	const from = { x: box.x + box.width - 8, y: box.y + box.height / 2 };

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x - by, from.y, { steps: 8 });
	await page.mouse.up();
}

test('a task pulled leftwards is ticked off, and pulling it again takes it away', async ({
	page
}) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	const words = page.getByRole('button', { name: 'Bread', exact: true });

	await pull(page, words, 120);
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');

	/*
	 * The second pull is offered on exactly the rows the delete mark is: getting
	 * rid of a task is earned by the task being finished with.
	 */
	await pull(page, words, 120);
	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);
	await expect(task(page, 'Coffee')).toBeVisible();

	await page.reload();
	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);
});

test('a task pulled away can be had back from the message it leaves', async ({ page }) => {
	await addTask(page, 'Bread');

	const words = page.getByRole('button', { name: 'Bread', exact: true });

	await pull(page, words, 120);
	await pull(page, words, 120);

	// The same way out the mark in the gutter takes, so it leaves the same
	// message with the same way back rather than a second delete beside it.
	const toast = page.getByRole('status').filter({ hasText: /deleted/i });
	await expect(toast).toBeVisible();
	await toast.getByRole('button', { name: 'Undo?' }).click();

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');

	await page.reload();
	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');
});

test('the mark that deletes a done task is there through both pulls', async ({ page }) => {
	/*
	 * The pull is the way to it for a hand already moving; the mark is the way
	 * for one that is not. Neither stands in for the other.
	 */
	await addTask(page, 'Bread');

	// Off the sheet first: adding tasks pushes the add row down under the
	// pointer, and a pointer resting on a row is not what this is about.
	await page.mouse.move(0, 0);

	const mark = page.getByRole('button', { name: 'Delete task' });
	await expect(mark).toHaveCount(0);

	await pull(page, page.getByRole('button', { name: 'Bread', exact: true }), 120);
	await expect(mark).toBeVisible();

	await mark.click();
	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);
});

test('a pull does not open the row it was made on', async ({ page }) => {
	/*
	 * The finger comes up on the very button the taps are counted on, so the
	 * click it fires has to go the way a drop's does — or every pull would open
	 * the row for editing behind the tick it had just made.
	 */
	await addTask(page, 'Bread');

	await pull(page, page.getByRole('button', { name: 'Bread', exact: true }), 120);

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('a pull that stops short gives, and then changes nothing', async ({ page }) => {
	await addTask(page, 'Bread');

	const words = page.getByRole('button', { name: 'Bread', exact: true });
	const box = (await words.boundingBox())!;
	const from = { x: box.x + box.width - 8, y: box.y + box.height / 2 };

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x - 24, from.y, { steps: 4 });

	// The row gives under the hand, as far as the margin the writing is held off
	// the paper's drawn edge by, and no further.
	const given = await page
		.locator('[data-task]')
		.first()
		.evaluate((el) => getComputedStyle(el).translate);
	expect(given).not.toBe('none');

	await page.mouse.up();

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
	await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('a finger going down the page scrolls it rather than ticking anything', async ({ page }) => {
	await addTask(page, 'Bread');

	const words = page.getByRole('button', { name: 'Bread', exact: true });
	const box = (await words.boundingBox())!;
	const from = { x: box.x + box.width - 8, y: box.y + box.height / 2 };

	/*
	 * Mostly down and a little across, which is what a thumb scrolling a list
	 * actually does. The direction is asked once, when the movement is first big
	 * enough to mean anything, and the answer holds for the rest of the gesture —
	 * so wandering sideways later cannot turn a scroll into a tick.
	 */
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x - 8, from.y + 60, { steps: 6 });
	await page.mouse.move(from.x - 200, from.y + 60, { steps: 6 });
	await page.mouse.up();

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'false');
});

test('one tap folds a group, and two open its name', async ({ page }) => {
	await addTask(page, 'Bread');

	const title = page.getByRole('button', { name: 'Listula' });
	const icon = page.getByRole('button', { name: /^(Collapse|Expand) group/ });

	await title.click();
	await expect(icon).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);

	// Clear of the tap window, or the next click reads as the second of a pair.
	await page.waitForTimeout(450);
	await title.click();
	await expect(icon).toHaveAttribute('aria-expanded', 'true');

	/*
	 * The tap acts at once and the second one takes it back, the same way the
	 * row beside it works: the fold happens and is put back before the name
	 * opens, so two taps leave the group exactly as they found it.
	 */
	await page.waitForTimeout(450);
	await title.dblclick();
	await expect(page.getByRole('textbox', { name: 'Group title' })).toBeVisible();
	await expect(icon).toHaveAttribute('aria-expanded', 'true');
});

test('a row that runs out of room fills up, and the rest starts the next one', async ({ page }) => {
	/*
	 * Never `maxlength`. On a phone a field that stops accepting characters is
	 * indistinguishable from a keyboard that has died, in the middle of a
	 * sentence, with nothing said. Nothing is refused and nothing is lost.
	 */
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });

	// Two hundred is the limit, so this runs ten characters past it, with a
	// space sitting exactly on the boundary.
	await field.fill(`${'A'.repeat(200)} SPILLOVER`);

	// The word travelled whole rather than being cut at the two hundredth
	// character, and it is in the row below with the caret after it, ready to
	// carry on. The row above kept its full complement.
	await expect(page.getByRole('textbox', { name: 'New task' })).toHaveValue('SPILLOVER');
	await expect(task(page, 'A'.repeat(200))).toBeVisible();

	await page.keyboard.press('Escape');
});

test('Enter carries what is in front of the caret down to a new task', async ({ page }) => {
	/*
	 * Enter means "and the next one", and it now means it from wherever the
	 * caret is. It used to open an empty row wherever the caret stood, so
	 * splitting a task in two meant retyping the second half.
	 */
	await addTask(page, 'Bread and butter');

	await page.getByRole('button', { name: 'Bread and butter', exact: true }).click();
	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	// Between the two things, which is where a person would break the line.
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 6));
	await field.press('Enter');

	// The row above kept what was behind the caret; the rest came down with it,
	// already in the row below and ready to be added to.
	await expect(task(page, 'Bread')).toBeVisible();
	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toHaveValue('and butter');

	// With the caret at the head of what came down, which is where the line was
	// cut — a row that has merely run out of room is still typed at its end.
	expect(await fresh.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(0);

	await fresh.press('Enter');
	await expect(task(page, 'and butter')).toBeVisible();
});

test('Enter at the very start opens the empty row above, with the caret', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: 'Bread', exact: true }).click();
	const field = page.getByRole('textbox').first();
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
	await field.press('Enter');

	/*
	 * The writing goes down a line and an empty one opens over it, with the
	 * caret — which is what Enter at the start of a line does anywhere else.
	 * The empty row used to open underneath, which is the same two rows in the
	 * other order and reads as the task staying put while something appears
	 * below it.
	 */
	const fresh = page.getByRole('textbox', { name: 'New task' });
	await expect(fresh).toBeFocused();
	await expect(fresh).toHaveValue('');
	await expect(task(page, 'Bread')).toBeVisible();

	// Above it, and nothing in the document moved to put it there.
	const rows = await page.evaluate(() =>
		[...document.querySelectorAll('.tasks li')]
			.map((li) =>
				li.querySelector('textarea')
					? '<draft>'
					: (li.querySelector('[role=checkbox]')?.getAttribute('aria-label') ?? '')
			)
			.filter(Boolean)
	);
	expect(rows).toStrictEqual(['<draft>', 'Bread']);
});

test('Backspace at the very start joins the task onto the one above', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Milk');

	await page.getByRole('button', { name: 'Milk', exact: true }).click();
	const field = page.getByRole('textbox').first();
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
	await field.press('Backspace');

	// The two become one, and no message: nothing was taken away, the words are
	// all still on the sheet a line higher.
	await expect(page.getByRole('checkbox')).toHaveCount(1);
	await expect(task(page, 'BreadMilk')).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: /deleted/i })).toHaveCount(0);

	// And the caret waits at the seam, where the join happened.
	const joined = page.getByRole('textbox').first();
	await expect(joined).toBeFocused();
	expect(await joined.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(5);
});

test('a row still being typed joins onto the one above too', async ({ page }) => {
	/*
	 * On the sheet a draft and a task are the same thing — one line of writing
	 * with a box beside it — so a key that worked on the row above and not on
	 * the one under the finger read as the app having lost its place. The only
	 * difference is that a draft leaves without anything being deleted.
	 */
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });
	await field.fill('Bread');
	await field.press('Enter');

	// Written into the row that stayed open, and never committed.
	await page.keyboard.type('Milk');
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
	await field.press('Backspace');

	await expect(page.getByRole('checkbox')).toHaveCount(1);
	await expect(task(page, 'BreadMilk')).toBeVisible();

	const joined = page.getByRole('textbox').first();
	await expect(joined).toBeFocused();
	expect(await joined.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(5);
});

test('a row being typed with nothing above it keeps what is in it', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });
	await field.fill('Milk');
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
	await field.press('Backspace');

	// Nowhere for it to go, so the key does nothing — and nothing is lost.
	await expect(field).toHaveValue('Milk');
	await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('a join that would not fit does not happen at all', async ({ page }) => {
	// A row that filled up and spilled cannot be poured back into the row it
	// came from, and dropping the overflow to make it fit would lose writing.
	await addTask(page, 'x'.repeat(150));
	await addTask(page, 'y'.repeat(100));

	await page.getByRole('button', { name: 'y'.repeat(100), exact: true }).click();
	const field = page.getByRole('textbox').first();
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
	await field.press('Backspace');

	await expect(page.getByRole('checkbox')).toHaveCount(2);
	await expect(field).toHaveValue('y'.repeat(100));
});

test('the count of what is left appears late, and under the checkbox', async ({ page }) => {
	// A phone, where a row long enough to be running out of room is several
	// lines tall — which is the shape the count is placed for.
	await page.setViewportSize({ width: 390, height: 760 });

	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const field = page.getByRole('textbox', { name: 'New task' });
	const counter = page.locator('.counter');

	// Quiet through the whole of a long task: there is nothing to do about it
	// until the very end, since the row goes on taking characters either way.
	await field.fill('A'.repeat(189));
	await expect(counter).toHaveCount(0);

	// Ten left, and counting down from there.
	await field.fill('A'.repeat(190));
	await expect(counter).toHaveText('10');
	await field.fill('A'.repeat(196));
	await expect(counter).toHaveText('4');

	/*
	 * Under the mark rather than out in the gutter beside the first line. The
	 * writing is being done at the foot of a long row, so the count belongs
	 * there — and it is in the checkbox's column, not the words'.
	 */
	const where = await page.evaluate(() => {
		const row = document.querySelector('.tasks li:has(.counter)')!.getBoundingClientRect();
		const mark = document.querySelector('.tasks li:has(.counter) svg')!.getBoundingClientRect();
		const count = document.querySelector('.counter')!.getBoundingClientRect();
		const field = document.querySelector('.tasks li:has(.counter) textarea')!;
		const style = getComputedStyle(field);
		return {
			rowBottom: row.bottom,
			rowLeft: row.left,
			markBottom: mark.bottom,
			count,
			fieldBottom: field.getBoundingClientRect().bottom,
			padBottom: parseFloat(style.paddingBottom),
			line: parseFloat(style.lineHeight)
		};
	});

	// Below the mark, and never right of the words.
	expect(where.count.top).toBeGreaterThan(where.markBottom);
	expect(where.count.left).toBeGreaterThanOrEqual(where.rowLeft - 1);

	/*
	 * And level with the line being typed, rather than with the foot of the
	 * row. The field pads itself by half a target less half a line at each end,
	 * so a one-line row is a --touch square with its writing in the middle —
	 * which leaves the last line's own middle sitting that same half-target
	 * above the bottom of the row. A count with no height of its own sat its
	 * digits on the floor of that padding instead, a good few pixels under the
	 * line it was counting.
	 */
	const lastLine = where.fieldBottom - where.padBottom - where.line / 2;
	const middle = where.count.top + where.count.height / 2;
	expect(Math.abs(middle - lastLine)).toBeLessThan(2);

	await page.keyboard.press('Escape');
});

test('the checkbox keeps to its own square, and the words are the row’s', async ({ page }) => {
	/*
	 * It used to reach a third again past its own mark, so that a finger going
	 * for the box and landing on the first word still ticked the task. What
	 * that cost was the first word or two: they belonged to the checkbox, so a
	 * tap there ticked instead of opening the row and a press there could not
	 * lift the task at all. Two of the row's three gestures went missing at the
	 * end of the row a finger naturally goes to.
	 */
	await addTask(page, 'Bread and butter and jam and cheese and everything else besides');

	const reach = await page.evaluate(() => {
		const box = document.querySelector('.tasks li [role="checkbox"]')!.getBoundingClientRect();
		const words = document.querySelector('.tasks li .text')!.getBoundingClientRect();
		const row = document.querySelector('.tasks li')!.getBoundingClientRect();
		return { box, wordsLeft: words.left, rowHeight: row.height, rowTop: row.top };
	});

	// The 44px target, and no wider — it stops before the writing starts.
	expect(reach.box.width).toBeLessThan(48);
	expect(reach.box.right).toBeLessThanOrEqual(reach.wordsLeft + 1);

	// Still the full height of the row: a task over three lines has three
	// lines of checkbox beside it, which is what a column of anything means.
	expect(Math.abs(reach.box.height - reach.rowHeight)).toBeLessThan(2);

	// And a tap on the first word opens the row rather than ticking it.
	await page.mouse.click(reach.wordsLeft + 6, reach.rowTop + reach.rowHeight / 2);
	await expect(page.getByRole('textbox').first()).toBeFocused();
	await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'false');
});

test('a task drawn over two lines is edited over two lines', async ({ page }) => {
	const long =
		'A rather long task that certainly runs onto a second line however wide the sheet is';
	await addTask(page, long);

	const words = page.getByRole('button', { name: long, exact: true });
	const read = (await words.boundingBox())!.height;

	await words.click();
	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();

	/*
	 * A single-line input would collapse the row to one line and hide the end
	 * of the task behind its own left edge, reflowing the sheet on every tap.
	 * The field is as tall as the words were, give or take the padding.
	 */
	const editing = (await field.boundingBox())!.height;
	expect(Math.abs(editing - read)).toBeLessThan(12);
	expect(await field.evaluate((el) => el.tagName)).toBe('TEXTAREA');
});

test('an address is shown short, and still goes where it says', async ({ page }) => {
	await addTask(page, 'Recipe https://heracl.es/projects/2024/listula tonight');

	const link = page.locator('.tasks a').first();

	// No protocol, and the middle of the path elided — what is wanted is which
	// site and which page, not every character of how to get there.
	await expect(link).toHaveText('heracl.es/…/listula');

	// The href keeps all of it: this is a reading, not an edit.
	await expect(link).toHaveAttribute('href', 'https://heracl.es/projects/2024/listula');

	// And the text was never touched, so the export still has the whole URL.
	const exported = await page.evaluate(() => JSON.stringify(localStorage.getItem('consumma:doc')));
	expect(exported).toContain('https://heracl.es/projects/2024/listula');
});

/*
 * The list is held in this tab and lives on a key in this browser, so a link
 * written by whoever else is on the list never navigates it away — and the
 * page it opens is told nothing about where it came from and given no handle
 * on the tab it came from.
 */
test('a link opens in its own tab, and carries nothing with it', async ({ page }) => {
	await addTask(page, 'Recipe https://heracl.es/listula tonight');

	const link = page.locator('.tasks a').first();
	await expect(link).toHaveAttribute('target', '_blank');

	const rel = (await link.getAttribute('rel'))!.split(/\s+/);
	expect(rel).toContain('noopener');
	expect(rel).toContain('noreferrer');
	expect(rel).toContain('nofollow');
});

test('only three schemes are ever drawn as a link', async ({ page }) => {
	// The app hands this string to an href, and two of these run code.
	await addTask(page, 'Nope javascript:alert(1) and blob:https://heracl.es/x either');

	await expect(page.locator('.tasks a')).toHaveCount(0);
});

/** Adds a named group with one task in it, and returns its title button. */
async function addGroup(page: Page, name: string, index: number) {
	await page.getByRole('button', { name: 'Add a group' }).click();
	const field = page.getByRole('textbox', { name: 'New group' });
	await field.fill(name);
	await field.press('Enter');
	await addTask(page, `${name} thing`, index);
	return page.getByRole('button', { name });
}

test('the rule a carried group is dropped on is drawn where it will land', async ({ page }) => {
	/*
	 * The landing rule and the drop were counted in two different lists. The
	 * hit test skips the group being carried, because a group cannot land
	 * beside itself — so its answer counts the groups that are staying still.
	 * The markup drew the rule by its own loop, which counts every group there
	 * is, the carried one included. The two agree until the finger passes the
	 * hole the carried group left, and from there the rule is drawn one group
	 * short of where the group actually goes.
	 */
	await addTask(page, 'Bread');
	await addGroup(page, 'Market', 1);
	await addGroup(page, 'Deli', 2);

	const title = page.getByRole('button', { name: 'Listula' });
	const from = (await title.boundingBox())!;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(CARRY_MS);

	// Everything folds while one is carried, so the titles are all there is.
	const deli = page.getByRole('button', { name: 'Deli' });
	const market = page.getByRole('button', { name: 'Market' });

	// Down past Market, into the gap between Market and Deli.
	const over = (await deli.boundingBox())!;
	await page.mouse.move(over.x + over.width / 2, over.y + 2);

	const rule = page.locator('.landing');
	await expect(rule).toHaveCount(1);

	// The rule is below Market and above Deli, which is the gap the finger is in.
	const drawn = (await rule.boundingBox())!;
	const above = (await market.boundingBox())!;
	const below = (await deli.boundingBox())!;
	expect(drawn.y).toBeGreaterThanOrEqual(above.y + above.height);
	expect(drawn.y).toBeLessThan(below.y);

	await page.mouse.up();

	// And that is where it went.
	const order = await page.getByRole('button', { name: /^(Listula|Market|Deli)$/ }).allInnerTexts();
	expect(order).toStrictEqual(['MARKET', 'LISTULA', 'DELI']);
});

test('nothing is picked up off a sheet that is still moving', async ({ page }) => {
	/*
	 * A lift takes most of a second and a turn takes about the same, so a press
	 * held through a swipe came up carrying a row of a page that was edge-on or
	 * already face down — and then steered by a hit test reading boxes off it
	 * mid-rotation.
	 *
	 * The paper's own clock, slowed, so the press lands squarely inside the
	 * movement rather than racing it. What is under test is the rule, not the
	 * hundred and fifty milliseconds it usually holds for. Set through the
	 * CSSOM rather than as a stylesheet, because `style-src 'self'` refuses one
	 * — the same reason the sheet writes its own turn that way.
	 */
	await page.evaluate(() => document.documentElement.style.setProperty('--flip', '1500ms'));
	await addTask(page, 'Bread');

	// A swipe rightwards that does not go far enough: the paper swings home,
	// and for the length of that swing it is still turning.
	const paper = (await page.locator('main').boundingBox())!;
	await page.mouse.move(paper.x + 30, paper.y + paper.height - 60);
	await page.mouse.down();
	await page.mouse.move(paper.x + 70, paper.y + paper.height - 60, { steps: 5 });
	await page.mouse.up();

	// A press held through it does nothing at all.
	const row = page.getByRole('button', { name: 'Bread', exact: true });
	const box = (await row.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await expect(page.locator('.lifted')).toHaveCount(0);
	await page.mouse.up();

	/*
	 * The press was refused, not swallowed: the release is still a tap, and a
	 * tap on the words opens the row. Close it before pressing again, or the
	 * second press lands on a field rather than on a task.
	 */
	await page.keyboard.press('Escape');

	// And the same press, once the paper has stopped, picks the row up.
	await page.waitForTimeout(1200);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	await expect(page.locator('.lifted')).toHaveCount(1);
	await page.mouse.up();
});

test('a full list keeps a task whole rather than cutting it in two', async ({ page }) => {
	/*
	 * With nowhere for a second half to go, Enter mid-task used to save the
	 * first half and hand the rest to a row that could not take it — gone the
	 * moment the row closed.
	 */
	await page.evaluate(() => {
		const s = { t: 1, c: 'seedseedseed' };
		const id = (n: number) => `t${String(n).padStart(11, '0')}`;
		const tasks: Record<string, unknown> = {};
		for (let i = 0; i < 100; i++) {
			tasks[id(i)] = {
				id: id(i),
				groupId: 'gseedseedsee',
				text: i === 0 ? 'Bread and butter' : `task ${i}`,
				state: 'todo',
				order: `a${String(i).padStart(3, '0')}`,
				deleted: false,
				stamps: { text: s, state: s, order: s, groupId: s, deleted: s }
			};
		}
		const doc = {
			v: 1,
			groups: {
				gseedseedsee: {
					id: 'gseedseedsee',
					title: 'Full',
					order: 'a',
					deleted: false,
					stamps: { title: s, order: s, deleted: s }
				}
			},
			tasks
		};
		localStorage.setItem('consumma:doc', JSON.stringify(doc));
	});
	await page.reload();
	await expect(task(page, 'task 99')).toBeVisible();

	await page.getByRole('button', { name: 'Bread and butter', exact: true }).click();
	const field = page.getByRole('textbox').first();
	await expect(field).toBeFocused();
	await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 6));
	await field.press('Enter');

	await expect(task(page, 'Bread and butter')).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveCount(0);
	await expect(page.getByRole('checkbox')).toHaveCount(100);
});
