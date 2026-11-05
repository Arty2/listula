import { expect, test, type Page } from '@playwright/test';
import { fromMenu, menuButton, openMenu } from './menu';

/*
 * M6's acceptance, minus the two things a headless browser cannot judge: the
 * native share sheet on a real phone, and how it all looks.
 *
 * There is no server here — the dev preview has no blob store — so anything
 * that would reach the network is asserted through the UI's own reporting
 * rather than pretended to work. Sync against a real store is covered by
 * tests/sync.spec.ts, which drives the actual server module.
 */

async function addTask(page: Page, text: string, groupIndex = 0) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).nth(groupIndex).click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

function task(page: Page, text: string) {
	return page.getByRole('checkbox', { name: text });
}

/**
 * A device that has synced at least once, so it has a code to show.
 *
 * There is no store behind the preview, so the state a sync would leave is
 * planted instead. Where the code comes from in the first place is covered in
 * sync.e2e.ts, against the real server module.
 */
async function withCode(page: Page, code = 'ed43a06678e0') {
	await page.evaluate((value) => localStorage.setItem('consumma:code', value), code);
	await page.reload();
	return code;
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('no code until the list has been somewhere, and never in the URL', async ({ page }) => {
	await openMenu(page);

	/*
	 * A code is the address of something on the server, and nothing has been
	 * sent. Handing one over now would send someone to an empty sheet.
	 */
	await expect(page.locator('.code')).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Menu' })).toContainText('Only on this device');
	await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Close' }).click();
	const code = await withCode(page);
	await openMenu(page);

	// Twelve hex characters, shown in groups of four for reading aloud.
	const shown = (await page.locator('.code').first().innerText()).replace(/\s/g, '').toLowerCase();
	expect(shown).toMatch(/^[0-9a-f]{12}$/);

	expect(page.url()).not.toContain(code);
	expect(page.url()).toBe(new URL(page.url()).origin + '/');
});

test('arriving and leaving writes nothing to the device', async ({ page }) => {
	/*
	 * Opening the page used to make a code, write it down, write the opening
	 * group, the client id and the clock, and ask for persistent storage —
	 * before a single tap. Someone who looks and leaves should be
	 * indistinguishable from someone who never came.
	 */
	const keys = () => page.evaluate(() => Object.keys(localStorage).sort());
	expect(await keys()).toStrictEqual([]);

	await openMenu(page);
	await page.getByRole('button', { name: 'Close' }).click();
	expect(await keys()).toStrictEqual([]);

	/*
	 * And nothing is waiting to go, because nothing has been written. The sheet
	 * arrives with one group on it, but that is its empty shape rather than
	 * anyone's change — counting it announced a change to someone who had just
	 * walked in.
	 */
	await expect(page.getByRole('button', { name: /^Sync —/ })).toHaveCount(0);
	await openMenu(page);
	await expect(page.getByRole('dialog', { name: 'Menu' })).toContainText('Nothing is waiting');
	await page.getByRole('button', { name: 'Close' }).click();

	// The first thing written on the sheet is the first thing written down.
	await addTask(page, 'Bread');
	expect(await keys()).toStrictEqual(['consumma:clientId', 'consumma:doc', 'consumma:lastT']);

	// And still no code: nothing has been anywhere yet.
	await page.reload();
	await expect(task(page, 'Bread')).toBeVisible();
	expect(await keys()).not.toContain('consumma:code');
});

test('the page carries a burger, and a sync button only when there is a reason', async ({
	page
}) => {
	// Nothing else is on the paper.
	for (const gone of ['SYNC', 'SHARE', 'IMPORT', 'EXPORT', 'CLEAR', 'DELETE']) {
		await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
	}

	// The burger says nothing about syncing; that is the other button's job.
	await expect(menuButton(page)).toHaveAttribute('aria-label', 'Menu');

	const syncButton = page.getByRole('button', { name: /^Sync —/ });
	const waiting = async () => {
		const label = await syncButton.getAttribute('aria-label');
		return Number(label?.match(/(\d+) change/)?.[1] ?? 0);
	};

	/*
	 * A fresh sheet has nothing waiting: the group it arrives with is its empty
	 * shape, not a change. So there is no button at all until something is
	 * written — and then it counts that, and the group it went into.
	 */
	await expect(syncButton).toHaveCount(0);

	await addTask(page, 'Bread');
	expect(await waiting()).toBe(2);

	// It sits to the left of the burger, not in place of it.
	const sync = (await syncButton.boundingBox())!;
	const menu = (await menuButton(page).boundingBox())!;
	expect(sync.x).toBeLessThan(menu.x);

	// And what it counts is what the menu says.
	await openMenu(page);
	await expect(page.getByText('2 changes are waiting to go.')).toBeVisible();
});

test('the sync copy separates what is waiting from why it matters', async ({ page, context }) => {
	await addTask(page, 'Bread');
	await openMenu(page);

	// The count is the headline; the consequence is its own line.
	await expect(page.getByText(/\d+ changes? (is|are) waiting to go\./)).toBeVisible();
	await expect(page.getByText('Nobody else can see them until you sync.')).toBeVisible();

	await context.setOffline(true);
	await page.getByRole('button', { name: /Sync now|Syncing/ }).click();

	/*
	 * Being unreachable is a condition, not a failure — and it never swallows
	 * the count, which is exactly when someone wants to know it. The old copy
	 * replaced the whole line with "Offline.", which read as an error.
	 */
	await expect(page.getByText(/\d+ changes? (is|are) waiting to go\./)).toBeVisible();
	await expect(page.getByText(/safe on this device/)).toBeVisible();

	await context.setOffline(false);
});

test('COPY hands over the code and nothing else', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await withCode(page);
	await openMenu(page);

	const code = (await page.locator('.code').first().innerText()).replace(/\s/g, '').toLowerCase();
	await page.getByRole('button', { name: 'Copy', exact: true }).click();

	/*
	 * The button sits under the code, and what a button under a code copies is
	 * the code. SHARE is the way to hand over the whole invitation; this is for
	 * pasting into a message already being written, or into the other phone.
	 */
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied.replace(/\s/g, '')).toBe(code);
	expect(copied).not.toContain(new URL(page.url()).origin);
});

test('the invitation carries the link and the code together, and never the code in the link', async ({
	page
}) => {
	// The native sheet cannot be driven from a test, so it is stood in for and
	// the payload read back off it.
	await page.addInitScript(() => {
		(window as unknown as { shared: unknown[] }).shared = [];
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: (data: unknown) => {
				(window as unknown as { shared: unknown[] }).shared.push(data);
				return Promise.resolve();
			}
		});
	});
	await withCode(page);

	await openMenu(page);
	const code = (await page.locator('.code').first().innerText()).replace(/\s/g, '').toLowerCase();
	await page.getByRole('button', { name: 'Share', exact: true }).click();

	const shared = await page.evaluate(
		() => (window as unknown as { shared: { text: string; url?: string }[] }).shared
	);
	expect(shared).toHaveLength(1);

	// No `url` field: splitting it lets a target keep one half and drop the other.
	expect(shared[0].url).toBeUndefined();

	const origin = new URL(page.url()).origin;

	// Either half alone is useless, so one payload carries both.
	const lines = shared[0].text.split('\n').filter((l) => l.trim() !== '');
	expect(lines).toHaveLength(2);
	expect(lines[1].replace(/\s/g, '')).toBe(code);

	/*
	 * The link carries the flag that says somebody was sent a list, and that is
	 * the whole of what it carries: one parameter, no value, nothing about the
	 * list. What is being guarded here has not changed — the code is not in the
	 * URL, in the query, in a fragment or anywhere else on it, whatever else
	 * ends up on the link later.
	 */
	const link = new URL(lines[0]);
	expect(link.origin).toBe(origin);
	expect([...link.searchParams]).toStrictEqual([['j', '']]);
	expect(link.hash).toBe('');
	expect(lines[0]).not.toContain(code);
	// Nor in pieces: four hex characters of it are four too many.
	expect(lines[0]).not.toContain(code.slice(0, 4));
});

test('EXPORT copies the whole list and says how many', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await task(page, 'Bread').click();

	await fromMenu(page, 'Export');
	await expect(page.getByText('Copied 2 tasks.')).toBeVisible();

	// The first group has a name now, so the export carries its heading.
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe('## Listula\n\n- [x] Bread\n- [ ] Coffee\n');
});

test('EXPORT then IMPORT into an empty list reproduces everything', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	// Written on, so the ellipsis makes a second group rather than naming the first.
	await addTask(page, 'Salt');
	await page.getByRole('button', { name: 'Add a group' }).click();
	const title = page.getByRole('textbox', { name: 'New group' });
	await title.fill('Market');
	await title.press('Enter');

	await addTask(page, 'Bread', 1);
	await addTask(page, 'Coffee', 1);
	await task(page, 'Bread').click();

	await task(page, 'Coffee').focus();
	await page.keyboard.press('Shift+ ');

	await fromMenu(page, 'Export');
	const exported = await page.evaluate(() => navigator.clipboard.readText());

	// A fresh device with nothing on it.
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	await fromMenu(page, 'Import');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(task(page, 'Bread')).toHaveAttribute('aria-checked', 'true');
	await expect(task(page, 'Coffee')).toHaveAttribute('aria-checked', 'mixed');
	await expect(page.getByRole('button', { name: 'Market' })).toBeVisible();

	await fromMenu(page, 'Export');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exported);
});

test('IMPORT skips duplicates and says so', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await page.evaluate(() => navigator.clipboard.writeText('- [ ] Bread\n- [ ] Coffee\n'));

	await fromMenu(page, 'Import');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page.getByText('Added 1, skipped 1 already there.')).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
});

/*
 * The other half of IMPORT, and the half most people will actually meet.
 *
 * Firefox rejects a clipboard read outright and Safari raises a prompt, so on
 * those browsers the panel opens on an empty box and the list arrives by hand.
 * ImportModal calls that a first-class path rather than a fallback nobody
 * maintains — which is only true if something checks it, and until now the
 * tests only ever went in through the clipboard read.
 */
test('IMPORT takes a list pasted by hand, when the clipboard cannot be read', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	// A browser that refuses the read. Writing still works, which is how the
	// list gets onto the clipboard for the paste below.
	await context.addInitScript(() => {
		Object.defineProperty(navigator.clipboard, 'readText', {
			value: () => Promise.reject(new Error('denied')),
			configurable: true
		});
	});
	await page.reload();

	await page.evaluate(() => navigator.clipboard.writeText('Bread\nCoffee\nMilk'));
	await fromMenu(page, 'Import');

	// Nothing was read, so it opens on an empty box and says so.
	const field = page.getByRole('textbox', { name: 'Markdown to import' });
	await expect(field).toBeVisible();
	await expect(field).toHaveValue('');
	await expect(page.getByText(/Add \d+ task/)).toHaveCount(0);

	await field.focus();
	await page.keyboard.press('Control+V');

	// A real paste reaches the same parse a clipboard read would have.
	await expect(page.getByText('Add 3 tasks in 1 group?')).toBeVisible();

	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(3);
	await expect(task(page, 'Milk')).toBeVisible();
});

/*
 * A list repeats itself, and that is not a mistake.
 *
 * The preview used to be keyed by what each line said, so a second task
 * reading the same thing — or a second group with the same name — was a
 * duplicate key. Svelte throws on those, which took the whole preview down
 * and left a perfectly good list looking as though it had been refused, with
 * nothing on screen to say why.
 */
test('IMPORT takes a list that repeats itself, in a task and in a heading', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await page.evaluate(() =>
		navigator.clipboard.writeText(
			[
				'## Market',
				'',
				'- [ ] Milk',
				'- [x] Milk',
				'',
				'## Market',
				'',
				'- [~] Bread',
				'- [ ] Bread'
			].join('\n')
		)
	);

	await fromMenu(page, 'Import');

	// The parse reads every line, including the ones that say the same thing.
	await expect(page.getByText('Add 4 tasks in 2 groups?')).toBeVisible();

	/*
	 * What lands is deduplicated, which is a separate and deliberate rule —
	 * a re-import of the same list adds nothing, and it is counted out loud
	 * rather than silently doubling a list. Reading a line and keeping it are
	 * two different questions, and only the first was broken.
	 */
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(2);
	await expect(
		page.getByRole('status').filter({ hasText: /skipped 2 already there/ })
	).toBeVisible();
});

test('IMPORT refuses a data file and a web page, and says which', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await addTask(page, 'Bread');
	await page.evaluate(() => navigator.clipboard.writeText('{"tasks":[{"text":"Bread"}]}'));

	await fromMenu(page, 'Import');
	await expect(page.getByText('That looks like a data file, not a list.')).toBeVisible();

	// A web page is named too, rather than both getting the same shrug.
	const field = page.getByRole('textbox', { name: 'Markdown to import' });
	await field.fill('<ul><li>Bread</li><li>Milk</li></ul>');
	await expect(page.getByText('That looks like a web page, not a list.')).toBeVisible();

	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(1);
});

test('IMPORT takes plain lines, and counts what it will make of them', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	// A list as most people have one: lines in a note, no bullets anywhere.
	await page.evaluate(() => navigator.clipboard.writeText('Bread\nCoffee\nMilk'));
	await fromMenu(page, 'Import');

	/*
	 * A line with no bullet becomes a task, and the count is how the parse says
	 * so. There was a second box under this one for a while, showing the parsed
	 * list written back out in export notation — two boxes of nearly the same
	 * text, one of them editable, with nothing on screen saying which was
	 * which. What was pasted is on screen already, and it can be edited.
	 */
	await expect(page.getByText('Add 3 tasks in 1 group?')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Markdown to import' })).toHaveValue(
		'Bread\nCoffee\nMilk'
	);

	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(3);
});

test('clearing is beside the group now, not in the menu', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');
	await task(page, 'Bread').click();

	// It left the menu with its confirm: a tap in a panel is a long way from
	// the tasks it is about to take, and the mark on the group is not.
	await openMenu(page);
	await expect(
		page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Clear' })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Close' }).click();

	// The sheet's own title, not the switcher pill in the panel behind it,
	// which is named for the list it is showing and is still furling.
	await page.locator('section[data-group] .title').dblclick();
	await page.getByRole('button', { name: 'Clear done tasks' }).click();
	await expect(task(page, 'Bread')).toHaveCount(0);
	await expect(task(page, 'Coffee')).toBeVisible();

	// Nothing asked first, so the undo is what covers a change of mind.
	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('LEAVE shows the code one last time, then wipes only this device', async ({ page }) => {
	await withCode(page);
	await addTask(page, 'Bread');

	await openMenu(page);
	const code = (await page.locator('.code').first().innerText()).replace(/\s/g, '').toLowerCase();
	await page.getByRole('button', { name: 'Close' }).click();

	await fromMenu(page, 'Leave');

	const confirm = page.getByRole('dialog', { name: /Leave this list/ });
	await expect(confirm).toContainText('Everyone else keeps it');
	await expect(confirm).toContainText(code.replace(/(.{4})/g, '$1 ').trim());
	// It says plainly that unsent work goes too.
	await expect(confirm).toContainText('never reached anyone else');

	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	await fromMenu(page, 'Leave');
	await page.getByRole('button', { name: 'Leave', exact: true }).click();

	await expect(page.getByRole('checkbox')).toHaveCount(0);

	// No code at all: this device is back to never having synced, and the next
	// one is made when there is a list to put under it.
	await openMenu(page);
	await expect(page.locator('.code')).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('consumma:code'))).toBeNull();
	expect(code).toMatch(/^[0-9a-f]{12}$/);
});

test('leaving offers the list back, code and all', async ({ page }) => {
	await withCode(page);
	await addTask(page, 'Bread');

	await fromMenu(page, 'Leave');
	await page.getByRole('button', { name: 'Leave', exact: true }).click();
	await expect(page.getByRole('checkbox')).toHaveCount(0);

	/*
	 * The confirm stops the accident and the undo covers the change of mind,
	 * which is the arrangement every other removal here has. Nothing about
	 * this one is beyond recovery: leaving is local, the server was never
	 * told, and what went is five keys' worth of strings this device wrote.
	 */
	await page.getByRole('button', { name: 'UNDO?' }).click();
	await expect(task(page, 'Bread')).toBeVisible();

	// The code with it, or the list has come back as a different list.
	expect(await page.evaluate(() => localStorage.getItem('consumma:code'))).toMatch(
		/^[0-9a-f]{12}$/
	);

	await page.reload();
	await expect(task(page, 'Bread')).toBeVisible();
});

test('joining with tasks already here asks rather than deciding', async ({ page }) => {
	await addTask(page, 'Bread');

	await openMenu(page);
	await page.getByRole('textbox', { name: 'Code' }).fill('0123 4567 89ab');
	await page.getByRole('button', { name: 'Join' }).click();

	// Merge or discard is offered as a choice, never decided silently.
	await expect(page.getByRole('button', { name: 'Take them' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Leave them' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Menu' })).toContainText('1 task here');
});

test('a second sync tap inside the cooldown costs nothing', async ({ page }) => {
	let requests = 0;
	await page.route('**/api/room/**', (route) => {
		requests++;
		return route.abort();
	});

	await addTask(page, 'Bread');
	await openMenu(page);

	const button = page.getByRole('button', { name: /^Sync now/ });
	await button.click();

	// The cooldown is the whole reason a double tap is free.
	await expect(button).toBeDisabled();
	await expect(button).toContainText(/Sync now \(\d+\)/);

	const after = requests;
	await page.waitForTimeout(500);
	expect(requests).toBe(after);
});

test('a panel closes on Escape and returns focus to what opened it', async ({ page }) => {
	await openMenu(page);

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(menuButton(page)).toBeFocused();
});

/*
 * Focus does not stay inside a panel on its own. Pressing Sync now disables
 * that button while it cools, which blurs it to the body on the spot — and a
 * trap listening on the panel never sees a key pressed there, so Escape
 * reached nothing and the menu could not be closed by keyboard at all.
 *
 * It went unnoticed because the panel used to be a drawer down one side: the
 * sheet stayed clickable beside it, so a test that carried on tapping the list
 * with the menu still open never knew the difference.
 */
test('Escape closes the panel even when focus has fallen out of it', async ({ page }) => {
	await addTask(page, 'Bread');
	await openMenu(page);

	// Disables itself for the cooldown, taking focus with it.
	await page.getByRole('button', { name: /^Sync now/ }).click();
	await expect(page.getByRole('button', { name: /^Sync now/ })).toBeDisabled();
	expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// And the sheet behind it is reachable again.
	await expect(page.getByRole('button', { name: 'Add a task' }).first()).toBeVisible();
});

test('the menu reports being unable to reach the list, and keeps the tasks', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.route('**/api/room/**', (route) => route.abort());

	await openMenu(page);
	await page.getByRole('button', { name: /Sync now|Syncing/ }).click();

	await expect(page.getByRole('alert')).toContainText('Couldn’t reach the list');
	await page.keyboard.press('Escape');

	// The plain-language failure, and nothing lost.
	await expect(task(page, 'Bread')).toBeVisible();
});
