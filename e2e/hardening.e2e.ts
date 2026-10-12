import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fromMenu, menuButton, openMenu } from './menu';

/*
 * M7. The parts a browser can judge: accessibility, the installable shell, and
 * that nothing about a list ever reaches a cache.
 *
 * The response headers in vercel.json only exist on a deploy, so they are
 * asserted against the file rather than pretended to be live here; the same
 * goes for Lighthouse, which only a deployed preview can show.
 */

async function addTask(page: Page, text: string) {
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add a task' }).first().click();

	const input = page.getByRole('textbox', { name: 'New task' });
	await input.fill(text);
	await input.press('Enter');
	await page.keyboard.press('Escape');
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('the sheet has no accessibility violations', async ({ page }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee, the dark one');
	await page.getByRole('checkbox', { name: 'Bread' }).click();

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();

	expect(results.violations).toStrictEqual([]);
});

test('the modals have no accessibility violations either', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	const open = [() => openMenu(page), () => fromMenu(page, 'Import')];

	for (const [index, click] of open.entries()) {
		await click();
		await expect(page.getByRole('dialog')).toBeVisible();

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();

		expect(results.violations, `modal ${index}`).toStrictEqual([]);

		await page.keyboard.press('Escape');
	}
});

test('the sheet is reachable and operable with a keyboard alone', async ({ page }) => {
	await addTask(page, 'Bread');

	// The burger is the only way to anything that is not the list, so it has to
	// be reachable and operable without a pointer.
	const button = menuButton(page);
	await button.focus();
	await expect(button).toBeFocused();

	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(button).toBeFocused();
});

test('focus is visible, and drawn rather than coloured', async ({ page }) => {
	const first = menuButton(page);
	await first.focus();

	const outline = await first.evaluate((el) => getComputedStyle(el).outline);

	expect(outline).toContain('dashed');
	expect(outline).toContain('rgb(0, 0, 0)');
});

test('it is installable: a manifest, a theme colour, and drawn icons', async ({ page }) => {
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBe('/manifest.webmanifest');

	const manifest = await page.request.get('/manifest.webmanifest');
	expect(manifest.ok()).toBe(true);

	const parsed = await manifest.json();
	// No slash: that belongs to the address, not to the app on a home screen.
	expect(parsed.name).toBe('listula');
	expect(parsed.display).toBe('standalone');
	/*
	 * Black, and both of them.
	 *
	 * A manifest cannot ask what the phone is set to, so these are one colour
	 * for everybody, and black is the one to be wrong in: opening the app is
	 * the moment a white screen is least wanted and most likely to be followed
	 * by a black one. The page takes the tint over from the manifest as soon as
	 * it loads — see static/theme.js — so this governs the launch and nothing
	 * after it.
	 */
	expect(parsed.background_color).toBe('#000000');
	expect(parsed.theme_color).toBe('#000000');
	expect(parsed.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

	for (const icon of parsed.icons) {
		const response = await page.request.get(icon.src);
		expect(response.ok(), icon.src).toBe(true);
		expect(response.headers()['content-type']).toContain('image/png');
	}

	// iOS has no install prompt, so the touch icon has to be there.
	const apple = await page.request.get('/icons/apple-touch-icon.png');
	expect(apple.ok()).toBe(true);
});

test('the launch icon is drawn on black, and the home-screen ones are not', async ({ page }) => {
	/*
	 * The icon a launch screen puts on `background_color` has to be the same
	 * black as the screen behind it, or it is a white card in the middle of it.
	 * The tiles a phone cuts its home-screen icon from are the other way up:
	 * the mark on a home screen full of other apps is not the place to make a
	 * statement about the theme.
	 *
	 * Read off a canvas rather than trusted to the generator, because these are
	 * built by scripts/icons.ts at build time and never committed — so nothing
	 * else in the repository can say what colour they came out.
	 */
	const corner = (src: string) =>
		page.evaluate(async (src) => {
			const image = new Image();
			image.src = src;
			await image.decode();

			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;

			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);

			// Well inside the edge, and well outside the mark.
			const [r, g, b] = context.getImageData(4, 4, 1, 1).data;
			return [r, g, b];
		}, src);

	for (const src of ['/icons/icon-192.png', '/icons/icon-512.png']) {
		expect(await corner(src), src).toStrictEqual([0, 0, 0]);
	}

	for (const src of ['/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']) {
		expect(await corner(src), src).toStrictEqual([255, 255, 255]);
	}
});

test('the service worker caches the shell and never an API response', async ({ page }) => {
	await addTask(page, 'Bread');

	await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
		timeout: 10_000
	});

	const cached = await page.evaluate(async () => {
		const names = await caches.keys();
		const out: string[] = [];

		for (const name of names) {
			const cache = await caches.open(name);
			for (const request of await cache.keys()) out.push(new URL(request.url).pathname);
		}
		return out;
	});

	expect(cached.length).toBeGreaterThan(0);
	// A stale ciphertext served from a cache would look exactly like someone
	// else's edit vanishing.
	expect(cached.filter((path) => path.startsWith('/api/'))).toStrictEqual([]);
});

test('it opens offline, from what is on the device', async ({ page, context }) => {
	await addTask(page, 'Bread');
	await addTask(page, 'Coffee');

	await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
		timeout: 10_000
	});

	// A cold start with the aeroplane mode on.
	await context.setOffline(true);
	await page.reload();

	await expect(page.getByRole('checkbox', { name: 'Bread' })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Coffee' })).toBeVisible();

	// And it is still fully usable, not merely readable.
	await addTask(page, 'Milk');
	await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();

	await context.setOffline(false);
});
