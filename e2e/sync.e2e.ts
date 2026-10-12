import { expect, test, type Page, type Route } from '@playwright/test';
import { openMenu, turnOnDebug } from './menu';
import {
	RoomStore,
	isRoomId,
	parsePutBody,
	writeTokenFrom,
	type BlobEntry,
	type Blobs
} from '../src/lib/server/store';

/*
 * Two browsers on one code, converging. M5's acceptance, and the one part of
 * sync a unit test cannot reach: the real client running in a real browser,
 * doing its own crypto with a key it derived itself, over its own fetch.
 *
 * Requests are intercepted and answered here in Node by the real `RoomStore` —
 * real validation, real version checks, real conflicts. The route module builds
 * its own store at import time, so it cannot be pointed at a fake from here;
 * `tests/route.spec.ts` is what pins the handlers to the contract answered
 * below, and the two together cover the path end to end.
 *
 * What none of it proves is that @vercel/blob behaves like the fake. Nothing
 * short of a deploy can.
 */

class FakeBlobs implements Blobs {
	files = new Map<string, { body: string; uploadedAt: Date }>();

	async get(pathname: string) {
		return this.files.get(pathname)?.body ?? null;
	}
	async put(pathname: string, body: string) {
		this.files.set(pathname, { body, uploadedAt: new Date() });
	}
	async list(prefix: string): Promise<BlobEntry[]> {
		return [...this.files.entries()]
			.filter(([path]) => path.startsWith(prefix))
			.map(([pathname, file]) => ({
				pathname,
				uploadedAt: file.uploadedAt,
				size: file.body.length
			}));
	}
	async del(pathname: string) {
		this.files.delete(pathname);
	}
}

/** One store behind both browsers, exactly as one Blob store would be. */
let blobs: FakeBlobs;
let store: RoomStore;
/** Every body that crossed the wire, so a test can look at what was sent. */
let sent: string[];

async function api(route: Route) {
	const request = route.request();
	const roomId = new URL(request.url()).pathname.replace('/api/room/', '');
	const headers = { 'cache-control': 'no-store' };

	if (!isRoomId(roomId)) return route.fulfill({ status: 404, headers });

	if (request.method() === 'GET') {
		const result = await store.read(roomId, request.headers()['if-none-match'] ?? null);

		if (result.status === 'missing') return route.fulfill({ status: 404, headers });
		if (result.status === 'unchanged') {
			return route.fulfill({ status: 304, headers: { ...headers, etag: result.etag } });
		}
		return route.fulfill({
			status: 200,
			headers: { ...headers, etag: result.etag, 'content-type': 'application/json' },
			body: JSON.stringify({ v: result.room.v, blob: result.room.blob })
		});
	}

	const raw = request.postData() ?? '';
	sent.push(raw);

	const body = parsePutBody(JSON.parse(raw));
	if (!body) return route.fulfill({ status: 400, headers });

	const token = writeTokenFrom(request.headers()['authorization'] ?? null);
	if (!token) return route.fulfill({ status: 401, headers });

	const result = await store.write(roomId, body, token);

	if (result.status === 'forbidden') return route.fulfill({ status: 403, headers });
	if (result.status === 'too-large') return route.fulfill({ status: 413, headers });
	if (result.status === 'conflict') {
		return route.fulfill({
			status: 409,
			headers: { ...headers, 'content-type': 'application/json' },
			body: JSON.stringify({ v: result.room.v, blob: result.room.blob })
		});
	}

	return route.fulfill({
		status: 200,
		headers: { ...headers, 'content-type': 'application/json' },
		body: JSON.stringify({ v: result.v })
	});
}

/**
 * A browser on `code`, with its own client id and its own derived key.
 *
 * The code is planted before the app loads rather than typed into JOIN, which
 * is what JOIN does to storage anyway. Doing it through the panel costs a
 * forced sync and then a ten-second cooldown before the test can sync again,
 * three times over; the join path has its own test below.
 */
async function device(page: Page, code: string) {
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(
		(value) => {
			localStorage.clear();
			localStorage.setItem('consumma:code', value);
		},
		code.replace(/\s/g, '')
	);
	await page.reload();

	await expect(page.getByRole('button', { name: 'Add a task' }).first()).toBeVisible();
}

async function addTask(page: Page, text: string) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

async function syncNow(page: Page) {
	await openMenu(page);
	const button = page.getByRole('button', { name: /^Sync now/ });
	// The cooldown is ten seconds and this is the same device twice over.
	await expect(button).toBeEnabled({ timeout: 15_000 });
	await button.click();
	await expect(page.getByText('Everything is synced.')).toBeVisible();
	await page.keyboard.press('Escape');
}

/* Each sync waits out the ten-second cooldown, so these are not quick. */
test.describe.configure({ timeout: 120_000 });

test.beforeEach(() => {
	blobs = new FakeBlobs();
	store = new RoomStore(blobs, { cacheMs: 0 });
	sent = [];
});

test('two browsers on one code end up with the same list', async ({ browser }) => {
	const code = '1234 5678 9abc';

	const one = await browser.newPage();
	const two = await browser.newPage();

	await device(one, code);
	await device(two, code);

	await addTask(one, 'Bread');
	await syncNow(one);

	// The second device has never seen this task.
	await expect(two.getByRole('checkbox', { name: 'Bread' })).toHaveCount(0);

	await syncNow(two);
	await expect(two.getByRole('checkbox', { name: 'Bread' })).toBeVisible();

	// And back the other way, on top of what is already there.
	await addTask(two, 'Milk');
	await syncNow(two);
	await syncNow(one);

	for (const page of [one, two]) {
		await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();
	}

	await one.close();
	await two.close();
});

test('what crosses the wire is ciphertext and nothing else', async ({ browser }) => {
	const code = 'fedc ba98 7654';

	const page = await browser.newPage();
	await device(page, code);
	await addTask(page, 'Something private');
	await syncNow(page);

	expect(sent.length).toBeGreaterThan(0);
	for (const body of sent) {
		expect(body).not.toContain('Something private');
		// The two fields the server is allowed to see, and no third.
		expect(Object.keys(JSON.parse(body)).sort()).toStrictEqual(['baseV', 'blob']);
	}

	// The code itself never leaves the browser, in any form.
	for (const body of sent) expect(body.replace(/\s/g, '')).not.toContain('fedcba987654');

	await page.close();
});

test('both edited apart, then both synced, and nothing is lost', async ({ browser }) => {
	const code = '0f0f 1e1e 2d2d';

	const one = await browser.newPage();
	const two = await browser.newPage();
	await device(one, code);
	await device(two, code);

	// Neither has seen the other's edit when they make it.
	await addTask(one, 'From one');
	await addTask(two, 'From two');

	await syncNow(one);
	await syncNow(two);
	await syncNow(one);

	for (const page of [one, two]) {
		await expect(page.getByRole('checkbox', { name: 'From one' })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'From two' })).toBeVisible();
	}

	await one.close();
	await two.close();
});

test('joining a list finishes, and says so by closing', async ({ page }) => {
	/*
	 * A regression test with a story. Completing a join used to throw
	 * effect_update_depth_exceeded — the mount effect wrote the state it read
	 * through `unsent`, and Svelte tore the tree's reactivity down. The sync
	 * itself worked, so the code changed and the status said "Everything is
	 * synced", but the panel stopped responding: it sat there with the code
	 * still typed in, no error, and no way to tell anything had happened.
	 *
	 * Nothing in the suite completed a join, so nothing caught it.
	 */
	const problems: string[] = [];
	page.on('pageerror', (error) => problems.push(error.message));

	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await openMenu(page);
	await page.getByRole('textbox', { name: 'Code' }).fill('1234 5678 9abc');
	await page.getByRole('button', { name: 'Join' }).click();

	// Closing is how a join reports success, so it is the whole assertion.
	await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
	expect(problems).toStrictEqual([]);

	// And the list it joined is the one it is now on.
	await openMenu(page);
	await expect(page.getByText('1234 5678 9abc')).toBeVisible();
});

test('joining and leaving the tasks behind keeps both lists', async ({ page }) => {
	/*
	 * "Leave them" used to mean discard: the open list was wiped and the joined
	 * one arrived in its place, so answering a question about a handful of
	 * tasks threw away the list they were on. The device holds as many lists as
	 * it likes, so the honest reading of leaving them behind is that they stay
	 * behind — the joined list arrives beside this one.
	 */
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	// A list on the server for the code below to be the address of.
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).first().click();
	const first = page.getByRole('textbox', { name: 'New task' });
	await first.fill('Bread');
	await first.press('Enter');
	await page.keyboard.press('Escape');

	await openMenu(page);
	await page.getByRole('textbox', { name: 'Code' }).fill('1234 5678 9abc');
	await page.getByRole('button', { name: 'Join' }).click();
	await page.getByRole('button', { name: 'Leave them' }).click();

	// On the joined list, which is empty: nothing was carried over.
	await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toHaveCount(0);

	/*
	 * And the list Bread is on is still here. It is the switcher appearing at
	 * all that says so — it earns its place on the page only once there is a
	 * choice to make.
	 */
	const pill = page.locator('.switcher .pill').first();
	await expect(pill).toBeVisible();
	await pill.dblclick();
	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
});

test('JOIN that cannot reach the list keeps the tasks already here, and says why', async ({
	page
}) => {
	/*
	 * The tasks used to go before the network was ever asked: `!keep` wiped
	 * the sheet, then the request that was meant to replace it with something
	 * real found nothing to reach. A join that fails must cost nothing.
	 */
	await page.route('**/api/room/**', (route) => route.abort());
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await addTask(page, 'Bread');

	await openMenu(page);
	await page.getByRole('textbox', { name: 'Code' }).fill('1234 5678 9abc');
	await page.getByRole('button', { name: 'Join' }).click();
	await page.getByRole('button', { name: 'Leave them' }).click();

	await expect(page.getByRole('alert')).toContainText('Couldn’t reach the list');

	// Still open on the code field, not silently moved on.
	await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
	await page.keyboard.press('Escape');

	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
});

test('JOIN on a code that decrypts to nothing sensible keeps the tasks already here, and says so', async ({
	page
}) => {
	/*
	 * A room that answers with something that is not this code's blob — the
	 * shape a mistyped or unrelated code takes. AES-GCM authenticates, so a
	 * key that does not match fails the read rather than producing rubbish
	 * that happens to parse.
	 */
	await page.route('**/api/room/**', (route) => {
		if (route.request().method() !== 'GET') return route.continue();
		return route.fulfill({
			status: 200,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
			body: JSON.stringify({ v: 1, blob: 'AQID' })
		});
	});
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await addTask(page, 'Bread');

	await openMenu(page);
	await page.getByRole('textbox', { name: 'Code' }).fill('1234 5678 9abc');
	await page.getByRole('button', { name: 'Join' }).click();
	await page.getByRole('button', { name: 'Leave them' }).click();

	await expect(page.getByRole('alert')).toContainText('doesn’t match a list');
	await page.keyboard.press('Escape');

	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
});

test('the debug log is off by default, and shows what a sync attempt did once turned on', async ({
	page
}) => {
	await page.route('**/api/room/**', (route) => route.abort());
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	// Something on the sheet first: a list carrying nothing but its opening
	// group cannot be synced at all, so there would be no attempt to log.
	await addTask(page, 'Bread');

	await openMenu(page);

	/*
	 * Off by default, and not on the panel at all while it is: debug is a tool
	 * for whoever is building the app rather than a state the app has, so a
	 * press on the burger is what turns it on and there is nothing to find
	 * otherwise.
	 */
	await expect(page.locator('[role="log"][aria-label="Debug log"]')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Debug/ })).toHaveCount(0);

	await turnOnDebug(page);
	await openMenu(page);
	await expect(page.getByRole('button', { name: 'Debug: On' })).toBeVisible();

	// Nothing has happened yet, so there is nothing to show or copy.
	await expect(page.locator('[role="log"][aria-label="Debug log"]')).toHaveCount(0);

	// A real attempt, offline, so there is something to see.
	await page.getByRole('button', { name: /^Sync now/ }).click();

	const log = page.locator('[role="log"][aria-label="Debug log"]');
	await expect(log).toBeVisible();
	await expect(log.locator('p').first()).not.toBeEmpty();

	// This device also got a code the moment Sync now was tapped, which
	// carries its own "Copy" button — the debug log's is the later one.
	await page.getByRole('button', { name: 'Copy', exact: true }).last().click();

	/*
	 * Turning it off clears what was kept, the same as every other thing here
	 * that takes something away — and takes the switch with it, since the whole
	 * section goes when it is off.
	 */
	await page.getByRole('button', { name: 'Debug: On' }).click();
	await expect(page.getByRole('button', { name: /^Debug/ })).toHaveCount(0);
	await expect(log).toHaveCount(0);

	// And the choice itself survives a reload.
	await turnOnDebug(page);
	await page.reload();
	await openMenu(page);
	await expect(page.getByRole('button', { name: 'Debug: On' })).toBeVisible();
});

test('the debug log shows what a push actually sent, and its result', async ({ page }) => {
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await turnOnDebug(page);

	await addTask(page, 'Bread');
	await openMenu(page);

	const button = page.getByRole('button', { name: /^Sync now/ });
	await expect(button).toBeEnabled();
	await button.click();
	await expect(page.getByText('Everything is synced.')).toBeVisible();

	// What was sent — the version it was based on and the size of the
	// ciphertext — travels on the same line as what came back.
	const lines = await page.locator('[role="log"][aria-label="Debug log"] p').allTextContents();
	expect(lines.some((line) => /^PUT baseV\d+ \d+b: 200, now v\d+$/.test(line))).toBe(true);
});

test('the code is typed into twelve places, one underline each', async ({ page }) => {
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => {
		localStorage.clear();
		// A device that has synced, so there is a code to compare the field against.
		localStorage.setItem('consumma:code', '123456789abc');
	});
	await page.reload();
	await openMenu(page);

	const field = page.locator('.field');
	// One place per character of the code, each with its own drawn rule.
	await expect(field.locator('.cell')).toHaveCount(12);
	await expect(field.locator('svg.under path')).toHaveCount(12);

	// The same face and size as the code it is compared against.
	const shown = await page.locator('.code').evaluate((el) => {
		const style = getComputedStyle(el);
		return [style.fontFamily, style.fontSize].join(' ');
	});
	const typed = await field
		.locator('.glyph')
		.first()
		.evaluate((el) => {
			const style = getComputedStyle(el);
			return [style.fontFamily, style.fontSize].join(' ');
		});
	expect(typed).toBe(shown);

	// Typed in capitals, because a code read aloud often is.
	await page.getByRole('textbox', { name: 'Code' }).fill('ED43 A066 78E0');

	/*
	 * Whitespace is not a place, and neither is case: shown in capitals, in CSS
	 * only, whatever case it was typed in — the same as the code it is compared
	 * against, which is shown the same way.
	 */
	const places = await field.locator('.glyph').allInnerTexts();
	expect(places.join('')).toBe('ED43A06678E0');
});

test('a while after a sync, the button offers one rather than counting', async ({ page }) => {
	await page.clock.install();
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => {
		localStorage.clear();
		localStorage.setItem('consumma:code', '123456789abc');
	});
	await page.reload();

	await page.getByRole('button', { name: /^Sync —/ }).click();
	// Nothing is waiting and it just synced, so there is nothing to offer.
	await expect(page.getByRole('button', { name: /^Sync —/ })).toHaveCount(0);

	/*
	 * Nothing syncs on its own, so a list left open all morning is exactly as
	 * old as when it was opened. Ten minutes on, the button comes back — as a
	 * circular arrow, because there is nothing to send, only something to fetch.
	 */
	await page.clock.fastForward('11:00');

	const offered = page.getByRole('button', { name: /^Sync —/ });
	await expect(offered).toBeVisible();
	await expect(offered).toHaveAttribute('aria-label', /not synced for a while/);
});

test('the corner sync button says when it could not sync', async ({ page }) => {
	/*
	 * The menu shows `sync.message` in an alert, but this button exists so that
	 * syncing does not need the menu — so a failure had nowhere to go. Tapping it
	 * against a dead server did nothing at all, which is how a broken deployment
	 * came to look like an idle one.
	 */
	await page.route('**/api/room/**', (route) => route.abort());
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	// Something to send, or there is no button: an untouched sheet has nothing
	// waiting and nowhere to fetch from.
	await addTask(page, 'Bread');
	await page.getByRole('button', { name: /^Sync —/ }).click();

	const toast = page.getByRole('status').filter({ hasText: /reach/i });
	await expect(toast).toBeVisible();

	// And nothing was lost saying so.
	await expect(page.getByRole('button', { name: 'Add a task' }).first()).toBeVisible();
});

test('the corner sync button says when it did sync', async ({ page }) => {
	/*
	 * The other half of the same problem. A button that only speaks up on
	 * failure is a button you cannot tell apart from a dead one on the run
	 * where everything worked.
	 */
	await device(page, 'aaaa bbbb cccc');
	await addTask(page, 'Bread');

	await page.getByRole('button', { name: /^Sync —/ }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Synced.' })).toBeVisible();

	// It went, so the button that was offering to send it has nothing left to do.
	await expect(page.getByRole('button', { name: /^Sync —/ })).toHaveCount(0);
});

test('the mark works while the sync is in flight, and goes out on a fade', async ({ page }) => {
	/*
	 * Syncing is the one thing here that takes long enough to wonder about, and
	 * the button went as still during it as it is when idle. Now it boils: the
	 * same mark drawn four times over and cycled, the way a hand-drawn line has
	 * always been made to look alive. Nothing is scaled or faded — that is a
	 * machine moving a picture of a line, and it was the one thing in this
	 * corner that never looked drawn.
	 */
	await device(page, 'aaaa bbbb cccc');
	await addTask(page, 'Bread');

	const button = page.getByRole('button', { name: /^Sync —/ });
	const mark = page.locator('.sync svg');

	const animation = () => mark.evaluate((el) => getComputedStyle(el).animationName);

	// Idle: one drawing, held, and nothing moving it.
	expect(await animation()).toBe('none');
	const idle = await mark.locator('path').getAttribute('d');

	// And solid, in full ink: a mark standing still is not doing anything.
	const resting = await mark.locator('path').evaluate((el) => {
		const style = getComputedStyle(el);
		return { dashes: style.strokeDasharray, stroke: style.stroke, opacity: style.opacity };
	});
	expect(resting.dashes).toBe('none');

	/*
	 * The same fake server, answering slowly. Registered over the one `device`
	 * put down, and calling it rather than continuing to the network — there is
	 * no network here, and a sync that is over before the first frame cannot be
	 * read off the button at all.
	 */
	await page.route('**/api/room/**', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 700));
		await api(route);
	});
	await button.click();

	/*
	 * Sampled across the whole sync rather than read once: which drawing is up
	 * at any instant is a race, but how many different ones went past is not.
	 */
	const seen = await page.evaluate(async () => {
		const drawings = new Set<string>();
		const animations = new Set<string>();
		const dots = new Set<string>();
		const inks = new Set<string>();

		for (let i = 0; i < 24; i++) {
			const svg = document.querySelector('.sync svg');
			const path = svg?.querySelector('path');
			if (path) {
				drawings.add(path.getAttribute('d') ?? '');
				const style = getComputedStyle(path);
				dots.add(`${style.strokeDasharray} @ ${style.strokeDashoffset}`);
				inks.add(`${style.stroke} @ ${style.opacity}`);
			}
			if (svg) animations.add(getComputedStyle(svg).animationName);
			await new Promise((resolve) => setTimeout(resolve, 40));
		}

		return {
			drawings: [...drawings],
			animations: [...animations],
			dots: [...dots],
			inks: [...inks]
		};
	});

	// More than one drawing went past, and never more than the four there are.
	expect(seen.drawings.length).toBeGreaterThan(1);
	expect(seen.drawings.length).toBeLessThanOrEqual(4);
	// Every one of them is the outbox arrow, which never turns.
	expect(seen.animations).toStrictEqual(['none']);
	// And the mark it rests on is the one it started from.
	expect(seen.drawings).toContain(idle);

	/*
	 * Every one of those drawings is dotted, and each carries a pattern of its
	 * own — one pattern held across all four would be a stencil laid over a
	 * wobbling line rather than a pen skipping somewhere new each redraw.
	 */
	expect(seen.dots.length).toBeGreaterThan(1);
	expect(seen.dots.length).toBeLessThanOrEqual(4);
	expect(seen.dots.some((dash) => dash.startsWith('none'))).toBe(false);

	/*
	 * The whole point of dotting: it is the ink laid down less often, not the
	 * ink faded. Fading it would be a grey, and there are no greys here — so
	 * the colour and the opacity are exactly what they are at rest.
	 */
	expect(seen.inks).toStrictEqual([`${resting.stroke} @ ${resting.opacity}`]);

	/*
	 * And then it leaves. The button vanishing is the only sign the corner gives
	 * that the sync landed, and a mark that blinks out is one you are never sure
	 * you saw — so it fades, and is gone once the fade ends.
	 */
	await expect(page.getByRole('status').filter({ hasText: 'Synced.' })).toBeVisible();
	await expect(button).toHaveCount(0);
});

test('a crossed circle when the list cannot be reached', async ({ page }) => {
	/*
	 * Offline had no mark at all. It is not an error — everything is safe on the
	 * device — but it is not nothing either, and it outranks both the outbox
	 * arrow and the stale refresh: there is no point offering to send when
	 * nothing can leave.
	 */
	await page.clock.install();
	await page.route('**/api/room/**', (route) => route.abort());
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await addTask(page, 'Bread');

	// One change to send, and no reason yet to think it will not go.
	const button = page.getByRole('button', { name: /^Sync —/ });
	await expect(button).toHaveAttribute('aria-label', /changes waiting to go/);
	const outbox = await button.locator('path.drawn').getAttribute('d');

	await button.click();
	await expect(button).toHaveAttribute('aria-label', /no connection last time/);

	// A different mark, and one path: the ring and its stroke are drawn together.
	await expect(button.locator('path.drawn')).toHaveCount(1);
	expect(await button.locator('path.drawn').getAttribute('d')).not.toBe(outbox);

	/*
	 * Still tappable once the cooldown is out. Being unreachable is a condition,
	 * not a locked door — the ten seconds after any attempt are what disable it,
	 * and that rule is the same whether the attempt worked or not.
	 */
	await expect(button).toBeDisabled();
	await page.clock.fastForward('00:15');
	await expect(button).toBeEnabled();

	// And the mark has not quietly reverted while it waited.
	await expect(button).toHaveAttribute('aria-label', /no connection last time/);
});

test('pasting the whole invitation into JOIN keeps the code and drops the link', async ({
	page
}) => {
	/*
	 * What someone actually does with a message containing both: select all,
	 * paste. The field caps at fourteen characters, so before this the paste
	 * truncated to the front of the URL — `https://consum` — and JOIN sat
	 * disabled with nothing to say why.
	 */
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await openMenu(page);

	const origin = new URL(page.url()).origin;
	const field = page.getByRole('textbox', { name: 'Code' });
	await field.focus();

	await page.evaluate((invitation) => {
		const data = new DataTransfer();
		data.setData('text/plain', invitation);
		document.activeElement!.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		);
	}, `${origin}\ned43 a066 78e0`);

	// Twelve places filled with the code, and no part of the link anywhere.
	const places = await page.locator('.field .glyph').allInnerTexts();
	expect(places.join('')).toBe('ED43A06678E0');

	await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeEnabled();
});

test('pasting a link on its own leaves the join field alone', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await openMenu(page);

	const field = page.getByRole('textbox', { name: 'Code' });
	await field.fill('ed43a066');

	await page.evaluate((origin) => {
		const data = new DataTransfer();
		data.setData('text/plain', origin);
		document
			.querySelector('.field input')!
			.dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
			);
	}, new URL(page.url()).origin);

	// There is no code in a bare link, so nothing replaces what was typed.
	const places = await page.locator('.field .glyph').allInnerTexts();
	expect(places.join('')).toBe('ED43A066');
});

test('the code is made by the first sync, not by arriving', async ({ page }) => {
	/*
	 * Where a code comes from. Nothing is written to the device until there is
	 * something on the sheet, and no code exists until that has been somewhere:
	 * a code is the address of a list on the server, and before a sync there is
	 * no list there to address.
	 */
	await page.route('**/api/room/**', api);
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	const stored = () => page.evaluate(() => localStorage.getItem('consumma:code'));
	expect(await stored()).toBeNull();

	await addTask(page, 'Bread');
	expect(await stored()).toBeNull();

	await openMenu(page);
	await expect(page.getByRole('dialog', { name: 'Menu' })).toContainText('Only on this device');

	await page.getByRole('button', { name: /^Sync now/ }).click();
	await expect(page.getByText('Everything is synced.')).toBeVisible();

	// Now there is a list at the other end, so there is an address for it.
	const code = await stored();
	expect(code).toMatch(/^[0-9a-f]{12}$/);
	/*
	 * `toHaveText` reads the node's own text, not what CSS renders it as, so
	 * this stays the bare lower-case code — see the `.code` innerText checks
	 * elsewhere in this suite for the capitalised, on-screen form.
	 */
	await expect(page.locator('.code')).toHaveText(code!.replace(/(.{4})/g, '$1 ').trim());
	await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();

	// And it survives a reload, because it is what the list is filed under now.
	await page.reload();
	expect(await stored()).toBe(code);
});
