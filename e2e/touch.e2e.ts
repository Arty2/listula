import { expect, test, type Page } from '@playwright/test';
import { menuButton, settle } from './menu';

/*
 * A finger, not a mouse.
 *
 * Every other drag in the suite is a mouse, and a mouse is never subject to
 * `touch-action` — so a panel that a finger could not turn back passed all of
 * them. These go through the DevTools protocol, which is a touchscreen as far
 * as the page can tell: Chrome decides whether the gesture is its own pan and,
 * if it is, cancels the pointer under the app.
 */

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const dialog = { name: 'Menu' } as const;

/** Drag a finger rightwards from (x, y), in steps, and lift it. */
async function swipe(page: Page, x: number, y: number, distance: number, steps: number) {
	const cdp = await page.context().newCDPSession(page);
	const point = (dx: number) => [{ x: x + dx, y, id: 1 }];
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0) });
	for (let i = 1; i <= steps; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: point((distance * i) / steps)
		});
		await page.waitForTimeout(16);
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
}

test.skip(({ browserName }) => browserName !== 'chromium', 'the DevTools protocol is Chromium’s');

test('a finger swiping the panel rightwards turns the sheet back', async ({ page }) => {
	await page.goto('/');
	await menuButton(page).click();
	await settle(page);

	/*
	 * Over the panel's writing, which is inside its own scroller. A scroller is
	 * where Chrome stops reading `touch-action` up the tree, so the panel's own
	 * `pan-y` never reached a finger here unless the scroller says it too.
	 */
	const box = (await page.getByRole('dialog', dialog).boundingBox())!;
	await swipe(page, box.x + 40, box.y + box.height / 2, 260, 14);
	await settle(page);

	await expect(page.getByRole('dialog', dialog)).toBeHidden();
});

test('every scroller on the panel keeps sideways for the turn and pinch for the reader', async ({
	page
}) => {
	await page.goto('/');
	await menuButton(page).click();
	await settle(page);

	/*
	 * A scroller is where the browser stops reading `touch-action` up the tree,
	 * so each one has to say it for itself: without `pan-y` a sideways finger is
	 * Chrome's pan and the paper never turns, and without `pinch-zoom` the panel
	 * cannot be enlarged. Read off whatever scrolls rather than a list of
	 * classes, so a scroller added later is held to it too.
	 */
	const values = await page
		.getByRole('dialog', dialog)
		.evaluate((panel) =>
			[panel, ...panel.querySelectorAll('*')]
				.filter((node) => node === panel || /auto|scroll/.test(getComputedStyle(node).overflowY))
				.map((node) => getComputedStyle(node).touchAction)
		);

	expect(values.length).toBeGreaterThan(1);
	for (const value of values) expect(value).toBe('pan-y pinch-zoom');
});
