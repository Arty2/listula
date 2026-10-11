import { describe, expect, it } from 'vitest';
import {
	handArrow,
	handBin,
	handBracket,
	handBurger,
	handCheck,
	handCross,
	handLine,
	handList,
	handMoon,
	handOval,
	handPath,
	handRect,
	handRefresh,
	handScribble,
	scribbleMark,
	SCRIBBLE,
	handSlashedCircle,
	handSun,
	handSwoop,
	handSunMoon,
	handTear,
	handVertical
} from '../src/lib/draw/hand';
import { rng, seedFrom } from '../src/lib/draw/rng';

/**
 * The endpoints a path actually passes through. A `Q` carries a control point
 * before its endpoint, so a naive number scrape reads the control points and
 * misses where the pen lands.
 */
function endpoints(d: string): { x: number; y: number }[] {
	const tokens = d.trim().split(/\s+/);
	const points: { x: number; y: number }[] = [];

	let i = 0;
	while (i < tokens.length) {
		const command = tokens[i++];
		if (command === 'M') {
			points.push({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
		} else if (command === 'Q') {
			i += 2; // the control point
			points.push({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
		} else {
			throw new Error(`unexpected path command: ${command}`);
		}
	}

	return points;
}

describe('rng', () => {
	it('is deterministic for a seed', () => {
		const a = rng(42);
		const b = rng(42);

		expect([a(), a(), a()]).toStrictEqual([b(), b(), b()]);
	});

	it('gives different sequences for different seeds', () => {
		expect(rng(1)()).not.toBe(rng(2)());
	});

	it('stays inside [0, 1)', () => {
		const next = rng(7);
		for (let i = 0; i < 1000; i++) {
			const value = next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it('hashes a stable string to a stable seed', () => {
		expect(seedFrom('task-abc')).toBe(seedFrom('task-abc'));
		expect(seedFrom('task-abc')).not.toBe(seedFrom('task-abd'));
	});
});

describe('hand', () => {
	/*
	 * The point of seeding is that a line does not move when the component
	 * re-renders. If these ever stop being equal, every box on the sheet will
	 * twitch on each keystroke.
	 */
	it('draws the same path from the same seed every time', () => {
		const options = { seed: seedFrom('t1'), wobble: 2 };

		expect(handRect(200, 44, options)).toBe(handRect(200, 44, options));
		expect(handTear(1000, 16, options)).toBe(handTear(1000, 16, options));
		expect(handCheck(22, options)).toBe(handCheck(22, options));
		expect(handLine(120, options)).toBe(handLine(120, options));
	});

	it('draws a different path from a different seed', () => {
		const a = handRect(200, 44, { seed: seedFrom('t1'), wobble: 2 });
		const b = handRect(200, 44, { seed: seedFrom('t2'), wobble: 2 });

		expect(a).not.toBe(b);
	});

	it('produces a path of quadratic curves, never straight lines', () => {
		const d = handPath(
			[
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 }
			],
			{ seed: 1, wobble: 1 }
		);

		expect(d.startsWith('M ')).toBe(true);
		expect(d.split('Q')).toHaveLength(3);
		expect(d).not.toContain('L');
	});

	it('refuses to draw with fewer than two points', () => {
		expect(handPath([], { seed: 1 })).toBe('');
		expect(handPath([{ x: 1, y: 1 }], { seed: 1 })).toBe('');
	});

	it('emits only finite numbers, so no path can be NaN', () => {
		const paths = [
			handRect(200, 44, { seed: 3, wobble: 2 }),
			handTear(800, 16, { seed: 3 }),
			handLine(120, { seed: 3 }),
			handCheck(22, { seed: 3 })
		];

		for (const d of paths) {
			expect(d).not.toMatch(/NaN|Infinity|undefined/);
		}
	});

	it('draws a tear that spans the full width', () => {
		const points = endpoints(handTear(1000, 16, { seed: 5 }));
		const xs = points.map((p) => p.x);

		expect(Math.min(...xs)).toBe(0);
		expect(Math.max(...xs)).toBe(1000);
		// It has to actually go up and down, not drift across.
		expect(Math.min(...points.map((p) => p.y))).toBeLessThan(8);
		expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(8);
	});

	it('never ends on a sliver, at any width or seed', () => {
		/*
		 * The loop stops once it passes the right edge, so without care its last
		 * tooth lands a sliver from the one before it and the tear finishes with
		 * a short near-vertical hook. A tooth can legitimately be 0.45 of the
		 * nominal width, so the bar is a quarter of one.
		 */
		for (const width of [200, 358, 544, 1000]) {
			for (const seed of [1, 5, 7, 11, 23, 99]) {
				const teeth = Math.max(8, Math.round(width / 16));
				const points = endpoints(handTear(width, 16, { seed, teeth }));
				const [last, previous] = [points.at(-1)!, points.at(-2)!];

				expect(last.x, `${width}/${seed}`).toBe(width);
				expect(last.x - previous.x, `${width}/${seed}`).toBeGreaterThan(width / teeth / 4);
			}
		}
	});

	it('tears with irregular teeth rather than a saw blade', () => {
		const points = endpoints(handTear(1000, 16, { seed: 11 }));
		const widths = points.slice(1).map((p, i) => p.x - points[i].x);
		const depths = points.slice(1, -1).map((p) => Math.abs(p.y - 8));

		// A saw blade has one width and one depth. A tear has neither.
		expect(new Set(widths.map((w) => Math.round(w))).size).toBeGreaterThan(6);
		expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(3);
	});

	it('tears deeply enough to read as torn paper', () => {
		/*
		 * §6 asks for roughly 12–16px of peak-to-trough variation. Making the
		 * teeth irregular is easy to overdo — the first attempt at the rule above
		 * flattened this to about 4px, which reads as a wavy line rather than a
		 * tear, and nothing failed.
		 */
		for (const seed of [1, 7, 11, 23, 99]) {
			const ys = endpoints(handTear(1000, 16, { seed })).map((p) => p.y);
			expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(11);
		}
	});

	it('overshoots the corner of a box, the way a pen does', () => {
		// The stroke starts past the corner and ends above the top edge, so the
		// corner closes with a crossing rather than a join.
		const points = endpoints(handRect(100, 40, { seed: 9, wobble: 0, overshoot: 3 }));

		expect(points[0].x).toBeGreaterThan(1);
		expect(points.at(-1)!.y).toBeLessThan(1);
	});

	it('breaks a long side up so it wobbles along its length', () => {
		// handPath bends a segment exactly once, so a tall panel's side drawn in
		// one go is a single gentle bow — a ruled line with extra steps.
		const tall = endpoints(handRect(380, 900, { seed: 9, wobble: 2 }));
		const gaps = tall.slice(1).map((p, i) => Math.hypot(p.x - tall[i].x, p.y - tall[i].y));

		expect(Math.max(...gaps)).toBeLessThan(140);
	});

	it('leaves a small box alone, so no checkbox already drawn changes', () => {
		// A 22px box needs no help, and subdividing it would re-cut every one.
		const points = endpoints(handRect(22, 22, { seed: 9, wobble: 1 }));

		expect(points).toHaveLength(5);
	});

	it('rounds its corners on request, and closes instead of crossing', () => {
		const r = 3;
		const points = endpoints(handRect(100, 44, { seed: 9, wobble: 0, radius: r }));

		// Four corners, two points each, and back to the first to close.
		expect(points).toHaveLength(9);
		expect(points[0].x).toBeCloseTo(points.at(-1)!.x, 5);
		expect(points[0].y).toBeCloseTo(points.at(-1)!.y, 5);

		// No point sits in a corner any more: each was cut back along its edges.
		for (const { x, y } of points) {
			const inCorner = (x < r - 0.5 || x > 100 - r + 0.5) && (y < r - 0.5 || y > 44 - r + 0.5);
			expect(inCorner, `${x},${y}`).toBe(false);
		}
	});

	it('bends a rounded corner through the corner, not across it', () => {
		/*
		 * A quadratic whose control point is the midpoint of its own chord is a
		 * straight line — which is a chamfer, not a radius. The turn has to reach
		 * for the vertex it cut off.
		 */
		const d = handRect(100, 44, { seed: 9, wobble: 0, radius: 3 });
		const first = d.split('Q')[1].trim().split(/\s+/).map(Number);
		const [cx, cy] = first;

		const start = endpoints(d)[0];
		const end = endpoints(d)[1];
		const midX = (start.x + end.x) / 2;
		const midY = (start.y + end.y) / 2;

		expect(Math.hypot(cx - midX, cy - midY)).toBeGreaterThan(0.5);
	});

	it('leaves every box already drawn exactly where it was', () => {
		// The radius is opt-in; nothing that does not ask for one may move.
		expect(handRect(200, 44, { seed: 5, wobble: 2 })).toBe(
			handRect(200, 44, { seed: 5, wobble: 2, radius: 0 })
		);
	});

	it('keeps a long side inside its box, so the frame is not clipped', () => {
		const points = endpoints(handRect(380, 900, { seed: 4, wobble: 2, overshoot: 2.5 }));

		for (const { x, y } of points) {
			expect(x).toBeGreaterThanOrEqual(-4);
			expect(x).toBeLessThanOrEqual(384);
			expect(y).toBeGreaterThanOrEqual(-4);
			expect(y).toBeLessThanOrEqual(904);
		}
	});
});

describe('handBurger', () => {
	const SIZE = 22;

	it('is three separate strokes, not one shape', () => {
		const d = handBurger(SIZE, { seed: seedFrom('menu') });

		expect(d.match(/M /g)).toHaveLength(3);
	});

	it('keeps every bar inside the box it is drawn in', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handBurger(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('stacks the bars in three distinct rows', () => {
		const rows = [...new Set(endpoints(handBurger(SIZE, { seed: 3 })).map((p) => p.y))];

		expect(rows).toHaveLength(3);
		// Evenly spaced, and in order down the box.
		const [a, b, c] = [...rows].sort((m, n) => m - n);
		expect(b - a).toBeCloseTo(c - b, 5);
	});

	it('wobbles each bar independently rather than repeating one', () => {
		// Three identical strokes would mean the seed was not varied per bar.
		const [first, second, third] = handBurger(SIZE, { seed: 5, wobble: 1.4 })
			.split('M ')
			.filter(Boolean);

		expect(second).not.toBe(first);
		expect(third).not.toBe(first);
	});

	it('is stable for a seed, so it never re-jitters on a render', () => {
		expect(handBurger(SIZE, { seed: 8 })).toBe(handBurger(SIZE, { seed: 8 }));
	});
});

describe('handOval', () => {
	const W = 90;
	const H = 40;

	/*
	 * The mark that says a carried group can be let go here. A loop rather than
	 * a box, because a box is a frame put round the words and a loop is
	 * somebody's pen going round them once.
	 */
	it('comes back to where it started, and a little past it', () => {
		const points = endpoints(handOval(W, H, { seed: 3, wobble: 0 }));
		const first = points[0];
		const last = points.at(-1)!;

		// Round, so the end is near the start — and past it, so the pen crosses
		// its own line the way a hand closing a loop does rather than stopping
		// dead on it.
		expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(W / 4);
		expect(last).not.toStrictEqual(first);
	});

	it('keeps to the box it is drawn in, give or take the tilt', () => {
		for (const seed of [1, 7, 99]) {
			for (const { x, y } of endpoints(handOval(W, H, { seed, wobble: 1, tilt: -3 }))) {
				// A tilted ellipse reaches past its own box at two corners, and
				// `overflow: visible` is what lets it — but only just.
				expect(x, `seed ${seed}`).toBeGreaterThan(-H / 4);
				expect(x, `seed ${seed}`).toBeLessThan(W + H / 4);
				expect(y, `seed ${seed}`).toBeGreaterThan(-W / 8);
				expect(y, `seed ${seed}`).toBeLessThan(H + W / 8);
			}
		}
	});

	it('is one unlifted stroke, because a hand does not lift to draw a ring', () => {
		expect(handOval(W, H, { seed: 5 }).match(/M /g)).toHaveLength(1);
	});

	it('is off level, and levelling it draws something else', () => {
		expect(handOval(W, H, { seed: 5, tilt: 0 })).not.toBe(handOval(W, H, { seed: 5, tilt: -3 }));
	});

	it('is stable for a seed, so it never re-jitters on a render', () => {
		expect(handOval(W, H, { seed: 8 })).toBe(handOval(W, H, { seed: 8 }));
	});

	/*
	 * `jitter` is what tells a ring somebody threw round something from an
	 * ellipse drawn unsteadily. `wobble` bends the line between two points and
	 * leaves every radius correct, which above the size of a word reads as
	 * traced; this lets the points themselves off the ellipse.
	 */
	describe('thrown rather than traced', () => {
		it('is off by default, so every loop already drawn is untouched', () => {
			expect(handOval(W, H, { seed: 3, wobble: 0, jitter: 0 })).toBe(
				handOval(W, H, { seed: 3, wobble: 0 })
			);
		});

		it('lets the points off the true ellipse', () => {
			const radii = (d: string) =>
				endpoints(d).map(({ x, y }) => Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)));

			/*
			 * Traced: every point sits on the ellipse it was sampled from, to
			 * the two decimals a path is written out with.
			 */
			for (const r of radii(handOval(W, H, { seed: 3, wobble: 0 }))) {
				expect(r).toBeCloseTo(1, 3);
			}

			// Thrown: no two of its radii agree, and none is far out.
			const loose = radii(handOval(W, H, { seed: 3, wobble: 0, jitter: 0.1 }));
			expect(new Set(loose.map((r) => r.toFixed(4))).size).toBeGreaterThan(loose.length / 2);
			for (const r of loose) {
				expect(r).toBeGreaterThan(0.85);
				expect(r).toBeLessThan(1.15);
			}
		});

		/*
		 * The pen going round twice, not two pens: the point it carries past
		 * the start to is let off by the same amount the start was, so the
		 * crossing does not disagree with itself about where the ring is.
		 */
		it('crosses its own start rather than stopping on it', () => {
			const points = endpoints(handOval(W, H, { seed: 3, wobble: 0, jitter: 0.1, over: 1.9 }));
			const first = points[0];
			const last = points.at(-1)!;

			expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(1);
			expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(W / 3);
		});

		it('is still one unlifted stroke, and still stable for a seed', () => {
			const ring = handOval(W, H, { seed: 8, jitter: 0.09, over: 1.9 });

			expect(ring.match(/M /g)).toHaveLength(1);
			expect(ring).toBe(handOval(W, H, { seed: 8, jitter: 0.09, over: 1.9 }));
		});
	});
});

describe('handBin', () => {
	const W = 22;
	const H = 26;

	/*
	 * The one delete in the app that is not the scribble, because the corner it
	 * stands in is a place rather than a mark. What has to hold about it is what
	 * has to hold about every drawn glyph: it stays in its box, it is one hand's
	 * work rather than one stroke repeated, and it comes back the same.
	 */
	it('stays inside the box it is drawn in', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handBin(W, H, { seed, wobble: 0.9 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(W);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(H);
			}
		}
	});

	it('is the body, the lid, the tab and two ribs — five strokes', () => {
		expect(handBin(W, H, { seed: seedFrom('bin') }).match(/M /g)).toHaveLength(5);
	});

	it('draws the body in one unlifted run down, across and up', () => {
		const body = handBin(W, H, { seed: 4, wobble: 0 }).split('M ')[1];
		const points = endpoints(`M ${body}`);

		expect(points).toHaveLength(4);
		// Down one wall, across the bottom, up the other.
		expect(points[1].y).toBeGreaterThan(points[0].y);
		expect(points[2].x).toBeGreaterThan(points[1].x);
		expect(points[3].y).toBeLessThan(points[2].y);
	});

	it('leans its walls in, so it is a bin rather than a box', () => {
		const points = endpoints(`M ${handBin(W, H, { seed: 4, wobble: 0 }).split('M ')[1]}`);

		// The foot is inside the shoulder on both sides.
		expect(points[1].x).toBeGreaterThan(points[0].x);
		expect(points[2].x).toBeLessThan(points[3].x);
	});

	it('wobbles each stroke independently rather than repeating one', () => {
		const strokes = handBin(W, H, { seed: 5, wobble: 1.2 }).split('M ').filter(Boolean);
		expect(new Set(strokes).size).toBe(strokes.length);
	});

	it('is stable for a seed, so it never re-jitters on a render', () => {
		expect(handBin(W, H, { seed: 8 })).toBe(handBin(W, H, { seed: 8 }));
	});
});

describe('handSwoop', () => {
	const FROM = { x: 40, y: 600 };
	const TO = { x: 340, y: 90 };

	it('starts and ends where it was told to', () => {
		const points = endpoints(handSwoop(FROM, TO, { seed: 3, wobble: 0 }));

		expect(points[0]).toStrictEqual(FROM);
		// The shaft's last point before the barb is the head itself.
		expect(points.some((p) => p.x === TO.x && p.y === TO.y)).toBe(true);
	});

	it('bows off the straight line between them', () => {
		const straight = endpoints(handSwoop(FROM, TO, { seed: 3, wobble: 0, bow: 0 }));
		const bowed = endpoints(handSwoop(FROM, TO, { seed: 3, wobble: 0, bow: 0.3 }));

		/*
		 * The middle of the run is what moves; the two ends are pinned. A hand
		 * reaching across a page does not draw a ruler's line, and a stroke that
		 * came out straight would be the one mark here that looked printed.
		 */
		const middle = Math.floor(straight.length / 4);
		expect(bowed[middle].x).not.toBe(straight[middle].x);
		expect(bowed[0]).toStrictEqual(straight[0]);
	});

	/*
	 * The barb is taken off the tangent at the head rather than off the straight
	 * line between the ends. On a bowed stroke those differ by enough to read as
	 * a barb stuck on at the wrong angle, so this is what says it followed the
	 * curve: both legs come back off the head, never past it.
	 */
	it('puts both legs of the head behind the point', () => {
		const points = endpoints(handSwoop(FROM, TO, { seed: 3, wobble: 0 }));
		/*
		 * The barb is its own `M`, so after the shaft's head the endpoints run
		 * leg, head again, leg — which is what makes it one polyline with a
		 * corner rather than two strokes that happen to meet.
		 */
		const at = points.findIndex((p) => p.x === TO.x && p.y === TO.y);
		const legs = [points[at + 1], points[at + 3]].filter(Boolean);

		expect(legs).toHaveLength(2);
		for (const leg of legs) {
			// The run goes up and to the right, so a leg lies below and behind it.
			expect(leg.y).toBeGreaterThan(TO.y);
		}
	});

	it('is stable for a seed, and different for another', () => {
		expect(handSwoop(FROM, TO, { seed: 8 })).toBe(handSwoop(FROM, TO, { seed: 8 }));
		expect(handSwoop(FROM, TO, { seed: 8 })).not.toBe(handSwoop(FROM, TO, { seed: 9 }));
	});
});

describe('handArrow', () => {
	const SIZE = 22;

	it('points up and to the right', () => {
		const points = endpoints(handArrow(SIZE, { seed: 2, wobble: 0 }));
		const [start] = points;
		// The shaft runs from bottom-left to top-right before the barb starts.
		const tip = points[2];

		expect(tip.x).toBeGreaterThan(start.x);
		expect(tip.y).toBeLessThan(start.y);
	});

	it('has a head that meets the point of the shaft', () => {
		const points = endpoints(handArrow(SIZE, { seed: 2, wobble: 0 }));
		const tip = points[2];
		// The barb is drawn through the same point the shaft ends at.
		expect(points.some((p, i) => i > 2 && p.x === tip.x && p.y === tip.y)).toBe(true);
	});

	it('stays inside its box, so the button never clips it', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handArrow(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('is stable for a seed', () => {
		expect(handArrow(SIZE, { seed: 4 })).toBe(handArrow(SIZE, { seed: 4 }));
	});

	it('is not the burger', () => {
		expect(handArrow(SIZE, { seed: 4 })).not.toBe(handBurger(SIZE, { seed: 4 }));
	});
});

describe('handList', () => {
	const SIZE = 22;

	it('is the burger with a dash at the head of each row', () => {
		const d = handList(SIZE, { seed: seedFrom('menu') });

		// Three rows, two strokes each: the dash and the line it heads.
		expect(d.match(/M /g)).toHaveLength(6);
	});

	it('stacks its rows the way the burger stacks its bars', () => {
		const rows = [...new Set(endpoints(handList(SIZE, { seed: 3 })).map((p) => p.y))];
		const bars = [...new Set(endpoints(handBurger(SIZE, { seed: 3 })).map((p) => p.y))];

		// The same three heights: it is the same mark with something added to it,
		// not a second drawing of three lines that happens to sit nearby.
		expect([...rows].sort()).toStrictEqual([...bars].sort());
	});

	it('parts each dash from its line, and never lets the two touch', () => {
		const rows = new Map<number, number[]>();
		for (const { x, y } of endpoints(handList(SIZE, { seed: 3, wobble: 0 }))) {
			rows.set(y, [...(rows.get(y) ?? []), x]);
		}

		expect(rows.size).toBe(3);
		for (const [y, xs] of rows) {
			const sorted = [...xs].sort((a, b) => a - b);
			// The dash ends before the line begins, by a readable amount.
			const gap = sorted[2] - sorted[1];
			expect(gap, `row ${y}`).toBeGreaterThan(1);
		}
	});

	it('keeps every stroke inside the box it is drawn in', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handList(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('wobbles each dash apart from the line it heads', () => {
		// Sharing a seed would draw the two as one stroke cut in half, and the
		// gap would read as a break rather than as a space.
		const strokes = handList(SIZE, { seed: 5, wobble: 1.4 }).split('M ').filter(Boolean);

		expect(new Set(strokes).size).toBe(strokes.length);
	});

	it('is stable for a seed, so it never re-jitters on a render', () => {
		expect(handList(SIZE, { seed: 8 })).toBe(handList(SIZE, { seed: 8 }));
	});

	it('is not the burger, which is the same rows without the dashes', () => {
		expect(handList(SIZE, { seed: 4 })).not.toBe(handBurger(SIZE, { seed: 4 }));
	});
});

describe('handVertical', () => {
	it('runs the full height it is given', () => {
		const points = endpoints(handVertical(600, { seed: 3, wobble: 1 }));
		const ys = points.map((p) => p.y);

		expect(Math.min(...ys)).toBe(0);
		expect(Math.max(...ys)).toBe(600);
	});

	it('wobbles along its length rather than bowing once', () => {
		// One segment would bend exactly once, which is a ruled line.
		const points = endpoints(handVertical(600, { seed: 3, wobble: 1 }));
		const gaps = points.slice(1).map((p, i) => p.y - points[i].y);

		expect(Math.max(...gaps)).toBeLessThan(140);
	});

	it('stays on its own side, so it never crosses the sheet', () => {
		for (const seed of [1, 7, 99]) {
			for (const { x } of endpoints(handVertical(900, { seed, wobble: 1.2, x: 2.5 }))) {
				expect(x, `seed ${seed}`).toBe(2.5);
			}
		}
	});

	it('is stable for a seed', () => {
		expect(handVertical(400, { seed: 6 })).toBe(handVertical(400, { seed: 6 }));
	});
});

describe('handRefresh', () => {
	const SIZE = 22;

	it('comes back round on itself without closing', () => {
		const points = endpoints(handRefresh(SIZE, { seed: 3, wobble: 0 }));
		const centre = { x: SIZE / 2, y: SIZE / 2 };
		const ring = points.slice(0, 11);

		// Every point of the ring sits at the same distance from the middle.
		const radii = ring.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y));
		expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);

		// And the ends do not meet, or it would be a circle with a spike.
		const gap = Math.hypot(ring[0].x - ring.at(-1)!.x, ring[0].y - ring.at(-1)!.y);
		expect(gap).toBeGreaterThan(1);
	});

	it('stays inside its box at any seed', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handRefresh(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('is stable for a seed, and is not the arrow', () => {
		expect(handRefresh(SIZE, { seed: 4 })).toBe(handRefresh(SIZE, { seed: 4 }));
		expect(handRefresh(SIZE, { seed: 4 })).not.toBe(handArrow(SIZE, { seed: 4 }));
	});
});

describe('handSlashedCircle', () => {
	const SIZE = 22;

	it('closes, unlike the refresh stroke it sits beside', () => {
		const points = endpoints(handSlashedCircle(SIZE, { seed: 3, wobble: 0 }));
		const centre = { x: SIZE / 2, y: SIZE / 2 };
		const ring = points.slice(0, 13);

		const radii = ring.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y));
		expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);

		// The whole point of the difference: this one comes back to where it
		// started, so at 22px it can never be read as the circular arrow.
		const gap = Math.hypot(ring[0].x - ring.at(-1)!.x, ring[0].y - ring.at(-1)!.y);
		expect(gap).toBeLessThan(0.01);
	});

	it('strikes clear through the ring, in one stroke', () => {
		const points = endpoints(handSlashedCircle(SIZE, { seed: 3, wobble: 0 }));
		const centre = { x: SIZE / 2, y: SIZE / 2 };
		const slash = points.slice(13);

		/*
		 * Two points, not three. handPath bends each segment once, so a middle
		 * point put a kink at the centre of what should be one fast stroke.
		 */
		expect(slash).toHaveLength(2);

		// It goes through the middle: the chord's midpoint is the centre.
		expect((slash[0].x + slash[1].x) / 2).toBeCloseTo(centre.x, 5);
		expect((slash[0].y + slash[1].y) / 2).toBeCloseTo(centre.y, 5);

		/*
		 * And well past the ring at both ends. Clearing it by about the width of
		 * the stroke is not a crossing — at 22px that reads as a line stopping
		 * where the circle is, which is what this glyph used to look like.
		 */
		const r = SIZE * 0.34;
		for (const end of slash) {
			expect(Math.hypot(end.x - centre.x, end.y - centre.y)).toBeGreaterThan(r * 1.25);
		}
	});

	it('stays inside its box at any seed', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handSlashedCircle(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('is stable for a seed, and is not the refresh', () => {
		expect(handSlashedCircle(SIZE, { seed: 4 })).toBe(handSlashedCircle(SIZE, { seed: 4 }));
		expect(handSlashedCircle(SIZE, { seed: 4 })).not.toBe(handRefresh(SIZE, { seed: 4 }));
	});
});

describe('handSun, handMoon and handSunMoon', () => {
	const SIZE = 22;
	/** --stroke in src/app.css: what every one of these is drawn with. */
	const STROKE = 1.4;
	const centre = { x: SIZE / 2, y: SIZE / 2 };
	const radius = (p: { x: number; y: number }) => Math.hypot(p.x - centre.x, p.y - centre.y);

	/*
	 * A crescent is a limb and an edge drawn to the same two horns, so the ends
	 * meet by construction rather than by arithmetic. The limb is 13 points and
	 * the edge is 7, laid down in that order.
	 */
	function horns(d: string) {
		const points = endpoints(d);
		const limb = points.slice(0, 13);
		const edge = points.slice(13, 20);

		return { limb, edge, rays: points.slice(20) };
	}

	it('draws the sun round, and the moon as a crescent', () => {
		const disc = endpoints(handSun(SIZE, { seed: 3, wobble: 0 })).slice(0, 13);

		const radii = disc.map(radius);
		expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);
		// Closed: a sun with a gap in it is just the moon again.
		expect(Math.hypot(disc[0].x - disc.at(-1)!.x, disc[0].y - disc.at(-1)!.y)).toBeLessThan(0.01);

		// The moon's limb is the same arc with a bite out of it, so it does not.
		const { limb } = horns(handMoon(SIZE, { seed: 3, wobble: 0 }));
		expect(Math.hypot(limb[0].x - limb.at(-1)!.x, limb[0].y - limb.at(-1)!.y)).toBeGreaterThan(1);
	});

	it('closes both crescents on their horns', () => {
		for (const d of [
			handMoon(SIZE, { seed: 9, wobble: 0 }),
			handSunMoon(SIZE, { seed: 9, wobble: 0 })
		]) {
			const { limb, edge } = horns(d);

			// The edge starts where the limb finished and finishes where it began.
			expect(Math.hypot(edge[0].x - limb.at(-1)!.x, edge[0].y - limb.at(-1)!.y)).toBeLessThan(0.02);
			expect(Math.hypot(edge.at(-1)!.x - limb[0].x, edge.at(-1)!.y - limb[0].y)).toBeLessThan(0.02);
		}
	});

	it('bows the edge back across the middle, or it is not a crescent', () => {
		const { edge } = horns(handMoon(SIZE, { seed: 9, wobble: 0 }));
		const facing = -Math.PI * 0.25;
		const apex = edge[3];

		/*
		 * How far the middle of the edge sits along the direction the crescent
		 * opens. Negative is past the centre, which is what leaves a thin waist
		 * rather than a full moon with a line drawn on it.
		 */
		const along = (apex.x - centre.x) * Math.cos(facing) + (apex.y - centre.y) * Math.sin(facing);
		expect(along).toBeLessThan(0);

		/*
		 * And far enough short of the limb to leave a moon between the two
		 * strokes rather than a bend in one. A hairline crescent at 22px is a
		 * stroke that changed its mind, so the waist has to clear the width it
		 * is drawn with by a good margin, not by a hair.
		 */
		const waist = SIZE * 0.32 - radius(apex);
		expect(waist).toBeGreaterThan(STROKE * 2);
	});

	it('strikes every ray clear of the body in the middle of it', () => {
		const sun = endpoints(handSun(SIZE, { seed: 5, wobble: 0 })).slice(13);
		expect(sun).toHaveLength(16);
		for (const p of sun) expect(radius(p)).toBeGreaterThan(SIZE * 0.19);

		/*
		 * Sparser, because the gaps in the corona are what say `crescent` — and
		 * struck clear of the limb by more than the stroke that draws them, or
		 * the rays read as spines on the moon rather than as light behind it.
		 */
		const both = horns(handSunMoon(SIZE, { seed: 5, wobble: 0 })).rays;
		expect(both).toHaveLength(12);
		for (const p of both) expect(radius(p)).toBeGreaterThan(SIZE * 0.23 + STROKE);
	});

	it('stays inside its box at any seed', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const draw of [handSun, handMoon, handSunMoon]) {
				for (const { x, y } of endpoints(draw(SIZE, { seed, wobble: 1 }))) {
					expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
					expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
					expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
					expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				}
			}
		}
	});

	/*
	 * Three states on one button, and a fourth glyph on the button beside it.
	 * Any two of them coming out the same is the whole control saying nothing.
	 */
	it('is stable for a seed, and is none of the glyphs it sits beside', () => {
		expect(handSun(SIZE, { seed: 4 })).toBe(handSun(SIZE, { seed: 4 }));
		expect(handMoon(SIZE, { seed: 4 })).toBe(handMoon(SIZE, { seed: 4 }));
		expect(handSunMoon(SIZE, { seed: 4 })).toBe(handSunMoon(SIZE, { seed: 4 }));

		const drawn = [handSun, handMoon, handSunMoon, handSlashedCircle, handRefresh].map((draw) =>
			draw(SIZE, { seed: 4 })
		);
		expect(new Set(drawn).size).toBe(drawn.length);
	});
});

describe('handBracket', () => {
	const W = 20;
	const H = 60;

	it('turns its serifs the way the bracket faces', () => {
		const left = endpoints(handBracket(W, H, 'left', { seed: 3, wobble: 0 }));
		const right = endpoints(handBracket(W, H, 'right', { seed: 3, wobble: 0 }));

		// A `[` keeps its stem on the left and reaches right at top and bottom.
		expect(left[0]).toStrictEqual({ x: W, y: 0 });
		expect(left[1].x).toBe(0);
		expect(left.at(-1)).toStrictEqual({ x: W, y: H });

		// A `]` is the same stroke mirrored.
		expect(right[0]).toStrictEqual({ x: 0, y: 0 });
		expect(right[1].x).toBe(W);
		expect(right.at(-1)).toStrictEqual({ x: 0, y: H });
	});

	it('runs the full height, so a pair frames what sits between them', () => {
		for (const side of ['left', 'right'] as const) {
			const points = endpoints(handBracket(W, H, side, { seed: 5, wobble: 0 }));
			const ys = points.map((p) => p.y);

			expect(Math.min(...ys)).toBe(0);
			expect(Math.max(...ys)).toBe(H);
		}
	});

	it('stays inside its box at any seed', () => {
		for (const seed of [1, 7, 99, 1234]) {
			for (const { x, y } of endpoints(handBracket(W, H, 'left', { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(W);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(H);
			}
		}
	});

	it('is stable for a seed, and the two sides differ', () => {
		expect(handBracket(W, H, 'left', { seed: 4 })).toBe(handBracket(W, H, 'left', { seed: 4 }));
		expect(handBracket(W, H, 'left', { seed: 4 })).not.toBe(
			handBracket(W, H, 'right', { seed: 4 })
		);
	});
});

describe('handLine', () => {
	it('starts and ends where it is asked to', () => {
		const points = endpoints(handLine(200, { seed: 3, wobble: 0, y: 2 }));

		expect(points[0]).toStrictEqual({ x: 0, y: 2 });
		expect(points.at(-1)).toStrictEqual({ x: 200, y: 2 });
	});

	it('bends more often the longer it is', () => {
		/*
		 * handPath bends each segment once, so a fixed number of points meant a
		 * long rule bent the same three times a short one did — and three gentle
		 * bows across 300px is a ruled line with extra steps.
		 */
		const short = endpoints(handLine(40, { seed: 3, wobble: 0 })).length;
		const long = endpoints(handLine(400, { seed: 3, wobble: 0 })).length;

		expect(long).toBeGreaterThan(short * 3);
	});

	it('keeps a short rule to the few bends it always had', () => {
		// A 14px cell under a code has no room to wander.
		expect(endpoints(handLine(14, { seed: 3, wobble: 0 }))).toHaveLength(4);
	});

	it('never doubles back on itself', () => {
		for (const width of [14, 64, 200, 400, 900]) {
			for (const seed of [1, 7, 99]) {
				const xs = endpoints(handLine(width, { seed, wobble: 1 })).map((p) => p.x);

				for (let i = 1; i < xs.length; i++) {
					expect(xs[i], `width ${width} seed ${seed}`).toBeGreaterThan(xs[i - 1]);
				}
			}
		}
	});

	it('is stable for a seed, and differs between them', () => {
		expect(handLine(200, { seed: 4 })).toBe(handLine(200, { seed: 4 }));
		expect(handLine(200, { seed: 4 })).not.toBe(handLine(200, { seed: 5 }));
	});
});

describe('handScribble', () => {
	/**
	 * The one box every scribble on the sheet is drawn in: as tall as the
	 * checkbox across the row, and narrower, because the column it stands in is.
	 */
	const W = 14;
	const H = 22;

	/*
	 * It replaced a ✕ that was the checkbox's own two strokes at half the size.
	 * Two marks made of one gesture, one meaning finished and one meaning gone,
	 * is a distinction the eye has to be told about rather than one it can see.
	 */
	it('is one stroke the pen never leaves the paper for', () => {
		const d = handScribble(W, H, { seed: 3 });

		// One `M` and nothing but curves after it: a scribble is a pen going back
		// and forth, and separate passes would be hatching, which is shading.
		expect(d.split('M')).toHaveLength(2);
		expect(endpoints(d).length).toBeGreaterThan(4);
	});

	it('goes back and forth rather than down one way', () => {
		const points = endpoints(handScribble(W, H, { seed: 3 }));

		/*
		 * Every turn is on the opposite side from the one before it. A run of
		 * two on the same side is a zigzag that has lost its way, and reads as a
		 * `Z` rather than as something crossed out.
		 */
		const sides = points.map((p) => p.x > W / 2);
		for (let i = 1; i < sides.length; i++) {
			expect(sides[i], `turn ${i}`).toBe(!sides[i - 1]);
		}

		// And it travels down the box as it goes, rather than retracing one line.
		for (let i = 1; i < points.length; i++) {
			expect(points[i].y).toBeGreaterThan(points[i - 1].y);
		}
	});

	it('crosses the middle of the box every time it turns', () => {
		const points = endpoints(handScribble(W, H, { seed: 9 }));

		// Four legs, so four crossings: fewer would be a tick, more a smudge.
		expect(points).toHaveLength(5);
	});

	it('stays inside its box at any seed', () => {
		for (let seed = 0; seed < 40; seed++) {
			for (const { x, y } of endpoints(handScribble(W, H, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(W);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(H);
			}
		}
	});

	/*
	 * Taller than it is wide, and it has to be read that way rather than
	 * squared off: the mark stands as tall as the checkbox and in a column
	 * narrower than the checkbox is, which is what turns a squat zigzag into an
	 * S struck through.
	 */
	it('fills a tall box rather than a square one', () => {
		const points = endpoints(handScribble(W, H, { seed: 3 }));
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);

		expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
	});

	it('is stable for a seed, and differs across them', () => {
		expect(handScribble(W, H, { seed: 4 })).toBe(handScribble(W, H, { seed: 4 }));
		expect(handScribble(W, H, { seed: 4 })).not.toBe(handScribble(W, H, { seed: 5 }));
	});

	it('is not the ✕ it replaced, which the modal still closes with', () => {
		expect(handScribble(W, H, { seed: 4 })).not.toBe(handCross(W, { seed: 4 }));
	});

	it('is one drawing, the same one every row and header shows', () => {
		const drawn = handScribble(SCRIBBLE.w, SCRIBBLE.h, {
			seed: seedFrom(SCRIBBLE.seed),
			wobble: 0.7
		});
		expect(scribbleMark()).toBe(drawn);
		expect(scribbleMark()).toBe(scribbleMark());
	});
});

describe('handCross', () => {
	const SIZE = 20;

	/* Still drawn: closing a modal is putting something away, not deleting it. */
	it('is the checkbox’s two diagonals, and both of them', () => {
		const d = handCross(SIZE, { seed: 3 });

		expect(d.split('M')).toHaveLength(3);
		expect(d).toContain(handCheck(SIZE, { seed: 3 }));
	});

	it('stays inside its box at any seed', () => {
		for (let seed = 0; seed < 40; seed++) {
			for (const { x, y } of endpoints(handCross(SIZE, { seed, wobble: 1 }))) {
				expect(x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(x, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
				expect(y, `seed ${seed}`).toBeGreaterThanOrEqual(0);
				expect(y, `seed ${seed}`).toBeLessThanOrEqual(SIZE);
			}
		}
	});

	it('is stable for a seed', () => {
		expect(handCross(SIZE, { seed: 4 })).toBe(handCross(SIZE, { seed: 4 }));
	});
});
