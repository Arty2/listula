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
