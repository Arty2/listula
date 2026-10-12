import { rng, seedFrom } from './rng.ts';

/**
 * Every mark in the app is one of these. There are no image files, no icon
 * fonts, and no CSS borders on anything drawn — a CSS border cannot wobble.
 */

export type Pt = {
	x: number;
	y: number;
	/**
	 * Bend the segment arriving here through this point instead of through a
	 * nudged midpoint. A corner being rounded is the only thing that sets it:
	 * curving towards the vertex is what makes an arc rather than a chamfer.
	 */
	via?: Pt;
};

export type HandOptions = {
	seed: number;
	/** Peak deviation of a control point from the true line, in user units. */
	wobble?: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns a list of points into a wobbly path.
 *
 * Each segment becomes a quadratic curve whose control point sits at the
 * midpoint, nudged perpendicular to the segment by a seeded amount. Nudging
 * perpendicular rather than in both axes is what makes it read as an unsteady
 * hand rather than as noise.
 */
export function handPath(points: readonly Pt[], options: HandOptions): string {
	if (points.length < 2) return '';

	const wobble = options.wobble ?? 1;
	const random = rng(options.seed);

	let d = `M ${round(points[0].x)} ${round(points[0].y)}`;

	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1];
		const to = points[i];

		// A corner names the point to bend through; a straight run works one out.
		if (to.via) {
			d += ` Q ${round(to.via.x)} ${round(to.via.y)} ${round(to.x)} ${round(to.y)}`;
			continue;
		}

		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const len = Math.hypot(dx, dy) || 1;

		// Unit normal to the segment.
		const nx = -dy / len;
		const ny = dx / len;
		const offset = (random() * 2 - 1) * wobble;

		const cx = (from.x + to.x) / 2 + nx * offset;
		const cy = (from.y + to.y) / 2 + ny * offset;

		d += ` Q ${round(cx)} ${round(cy)} ${round(to.x)} ${round(to.y)}`;
	}

	return d;
}

/**
 * Splits long runs into shorter ones.
 *
 * handPath nudges one control point per segment, so however long a segment is,
 * it bends exactly once. A 900px side drawn in one go is a single gentle bow —
 * which is to say a ruled line; the wobble has to recur along a stroke to read
 * as a hand. Short sides are left alone: a 22px checkbox needs no help, and
 * subdividing it would re-cut every box already drawn.
 */
function subdivide(points: readonly Pt[], every: number): Pt[] {
	const out: Pt[] = [points[0]];

	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1];
		const to = points[i];
		const steps = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / every));

		for (let step = 1; step <= steps; step++) {
			// The last one is the original point, so a corner keeps its `via`.
			if (step === steps) {
				out.push(to);
				break;
			}

			out.push({
				x: from.x + ((to.x - from.x) * step) / steps,
				y: from.y + ((to.y - from.y) * step) / steps
			});
		}
	}

	return out;
}

/**
 * Points along a circular arc, `from` to `to` in radians, sampled evenly.
 *
 * Twelve steps everywhere: handPath bends each segment once, so the sampling
 * rate is what decides how often a ring wobbles, and two rings sampled at
 * different rates do not read as the same hand.
 */
function arc(c: number, r: number, from: number, to: number, steps = 12): Pt[] {
	const points: Pt[] = [];

	for (let i = 0; i <= steps; i++) {
		const a = from + ((to - from) * i) / steps;
		points.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
	}

	return points;
}

/** A point `distance` along the way from `from` towards `towards`. */
function along(from: Pt, towards: Pt, distance: number): Pt {
	const dx = towards.x - from.x;
	const dy = towards.y - from.y;
	const len = Math.hypot(dx, dy) || 1;
	// Never past halfway, or two cuts on a short side would cross each other.
	const t = Math.min(distance, len / 2) / len;

	return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * Cuts every corner of a closed polygon back along both its edges.
 *
 * The short chord left across each corner is what rounds it: handPath curves
 * it, and `stroke-linejoin: round` closes what is left. At three pixels that
 * reads as a pen turning rather than as a chamfer.
 */
function roundCorners(corners: readonly Pt[], radius: number): Pt[] {
	const out: Pt[] = [];
	const n = corners.length;

	for (let i = 0; i < n; i++) {
		const here = corners[i];
		out.push(along(here, corners[(i - 1 + n) % n], radius));
		// The turn bends through the corner it just cut off.
		out.push({ ...along(here, corners[(i + 1) % n], radius), via: here });
	}

	return out;
}

/**
 * A rectangle drawn as one continuous stroke whose corners overshoot slightly,
 * the way a pen does when it does not stop exactly where it started.
 *
 * Long sides wobble along their length rather than bowing once, so a tall
 * panel's edge does not come out ruled.
 *
 * With a `radius` the corners are cut and the stroke closes on itself instead
 * of crossing — a box small enough to sit around a word has no room for an
 * overshoot, which at that size reads as a mistake rather than as a hand.
 */
export function handRect(
	width: number,
	height: number,
	options: HandOptions & { inset?: number; overshoot?: number; every?: number; radius?: number }
): string {
	const i = options.inset ?? 1;
	const over = options.overshoot ?? 2.5;
	const every = options.every ?? 90;
	const radius = options.radius ?? 0;
	const random = rng(options.seed ^ 0x9e3779b9);
	const jitter = () => (random() * 2 - 1) * over;

	const left = i;
	const top = i;
	const right = width - i;
	const bottom = height - i;

	if (radius > 0) {
		const corners = [
			{ x: left, y: top + jitter() * 0.3 },
			{ x: right + jitter() * 0.2, y: top },
			{ x: right, y: bottom + jitter() * 0.3 },
			{ x: left + jitter() * 0.2, y: bottom }
		];
		const rounded = roundCorners(corners, radius);

		// Back to where the pen started, rather than past it.
		return handPath(subdivide([...rounded, rounded[0]], every), options);
	}

	return handPath(
		subdivide(
			[
				{ x: left + over, y: top },
				{ x: right, y: top + jitter() },
				{ x: right + jitter() * 0.3, y: bottom },
				{ x: left, y: bottom + jitter() * 0.3 },
				// Past the start, so the corner closes with a crossing rather than a
				// join.
				{ x: left + jitter() * 0.3, y: top - over * 0.4 }
			],
			every
		),
		options
	);
}

/**
 * The rule under a group title.
 *
 * handPath bends each segment once, so a fixed number of points means a long
 * rule bends the same three times a short one does — and a 300px rule with
 * three gentle bows in it is a ruled line. The number of bends grows with the
 * width instead, and where they fall is seeded rather than even, because a
 * hand does not stop at regular intervals.
 */
export function handLine(
	width: number,
	options: HandOptions & { y?: number; every?: number }
): string {
	const y = options.y ?? 1;
	// Finer than the 90 handRect subdivides at: this is a stroke under a word,
	// not the side of a panel.
	const every = options.every ?? 34;
	const steps = Math.max(3, Math.round(width / every));
	const random = rng(options.seed ^ 0x7f4a7c15);

	const points: Pt[] = [{ x: 0, y }];

	for (let i = 1; i < steps; i++) {
		// Never enough to overtake its neighbour: a third of a step either way
		// leaves every point ahead of the one before it.
		const at = (i + (random() * 2 - 1) * 0.35) / steps;
		points.push({ x: width * at, y });
	}

	points.push({ x: width, y });

	return handPath(points, options);
}

/**
 * A paper tear, not a saw blade: irregular tooth widths and depths, stroked
 * across the full width.
 *
 * Drawn at the width it will be shown at — see TornEdge.svelte. Generating it
 * once and stretching it is what made the line weight uneven, because a stroke
 * under an anisotropic transform is thinner along the compressed axis.
 */
export function handTear(
	width: number,
	height: number,
	options: HandOptions & { teeth?: number }
): string {
	const teeth = options.teeth ?? 22;
	const random = rng(options.seed ^ 0x85ebca6b);
	const mid = height / 2;

	const points: Pt[] = [{ x: 0, y: mid }];
	let x = 0;
	let up = true;

	while (x < width) {
		// Tooth widths vary by half either way, so no two are alike.
		x += (width / teeth) * (0.45 + random() * 1.3);

		/*
		 * Three things stop this reading as a saw blade.
		 *
		 * A third of the teeth are shallow, so the depths are not all the same.
		 * The side flips only most of the time, so the tear sometimes runs twice
		 * on one side of the line the way torn paper does. And the baseline
		 * drifts, so the whole thing does not sit on a ruler.
		 */
		const shallow = random() < 0.25;
		const depth = (shallow ? 0.3 + random() * 0.28 : 0.78 + random() * 0.22) * mid;
		const drift = (random() * 2 - 1) * mid * 0.12;

		points.push({ x: Math.min(x, width), y: mid + drift + (up ? -depth : depth) });
		if (random() > 0.12) up = !up;
	}

	/*
	 * End on a full-width tooth.
	 *
	 * The loop stops once it passes the right edge, so its last tooth is clamped
	 * to `width` and can end up a sliver away from the one before it. Either
	 * that, or a midline point appended after a tooth already at the edge,
	 * leaves a short near-vertical hook that reads as a mistake rather than as
	 * paper. So: pull the final tooth out to the edge, then drop the one before
	 * it if the run between them is too short to be a tooth.
	 */
	const minimum = width / teeth / 4;
	points[points.length - 1].x = width;

	while (points.length > 2 && points[points.length - 1].x - points[points.length - 2].x < minimum) {
		points.splice(points.length - 2, 1);
	}

	return handPath(points, { ...options, wobble: options.wobble ?? 0.9 });
}

/** The tri-state checkbox glyphs: nothing, one diagonal, two crossed. */
export function handCheck(size: number, options: HandOptions): string {
	const random = rng(options.seed ^ 0xc2b2ae35);
	const pad = size * 0.22;
	const jitter = () => (random() * 2 - 1) * size * 0.06;

	return handPath(
		[
			{ x: pad + jitter(), y: size - pad + jitter() },
			{ x: size - pad + jitter(), y: pad + jitter() }
		],
		options
	);
}

export function handCheckBack(size: number, options: HandOptions): string {
	const random = rng(options.seed ^ 0x27d4eb2f);
	const pad = size * 0.22;
	const jitter = () => (random() * 2 - 1) * size * 0.06;

	return handPath(
		[
			{ x: pad + jitter(), y: pad + jitter() },
			{ x: size - pad + jitter(), y: size - pad + jitter() }
		],
		options
	);
}

/** The ✕ that closes a modal — putting something away, not taking it away. */
export function handCross(size: number, options: HandOptions): string {
	return `${handCheck(size, options)} ${handCheckBack(size, options)}`;
}

/**
 * The box every delete mark is drawn in, and the seed every one of them is
 * drawn from — so the mark that removes a task and the mark that clears a
 * group are not merely alike but the same drawing, made once.
 *
 * As tall as the checkbox across the row (`--glyph`), and narrower, because
 * the column it stands in is: `--gutter` is the paper's own margin and the
 * mark has to stay clear of the drawn edge at the end of it.
 *
 * This is where "seeded so it never re-jitters" is at its strictest: the seed
 * is the mark's own name rather than the row's, so a sheet of forty done tasks
 * shows one mark forty times instead of forty scribbles.
 */
export const SCRIBBLE = { w: 14, h: 22, seed: 'scribble' } as const;

/**
 * The mark that removes a task, and the one that clears or removes a group:
 * something scribbled out.
 *
 * It was a ✕ — the same two strokes the checkbox uses for done, at half the
 * size and a few millimetres away from them. Two marks made of the same
 * gesture, one meaning finished and one meaning gone, is a distinction the eye
 * has to be told about rather than one it can see. Crossing a thing out is
 * what a hand does to a line on paper it wants rid of, and nothing else on the
 * sheet is drawn that way.
 *
 * One stroke, never lifted: a scribble is the pen going back and forth without
 * leaving the paper, and drawing it as separate passes would make it hatching,
 * which is shading rather than deletion. So the points run right, left, right
 * across the box, dropping a little each time, and handPath bends every leg —
 * the turns at the ends come out round because a pen reversing has to.
 *
 * Width and height are asked for separately, which they did not use to be. The
 * mark stands as tall as the checkbox it answers to across the row, and the
 * column it stands in is narrower than that. The two paddings are different
 * fractions for the same reason: the legs run the width and are stacked down
 * the height, so what keeps a leg from lying flat is room above and below it,
 * not room either side — at one fraction for both, four legs in a tall box
 * came out three pixels apart and merged into one dark smudge.
 *
 * The ends fall short of the corners rather than reaching them, so the figure
 * keeps clear of whatever it is drawn beside.
 */
export function handScribble(width: number, height: number, options: HandOptions): string {
	const random = rng(options.seed ^ 0x165667b1);
	const padX = width * 0.2;
	const padY = height * 0.08;
	const spanX = width - padX * 2;
	const spanY = height - padY * 2;

	/*
	 * Four legs, which is the fewest that reads as a scribble rather than as a
	 * zigzag: three would be a `Z` and five in this much paper is a smudge.
	 */
	const legs = 4;
	const drop = spanY / legs;
	/** Down the page, so it is read against the height. */
	const jitter = (much: number) => (random() * 2 - 1) * height * much;
	/** Always inwards, so a turn never lands outside the box it is drawn in. */
	const pull = () => random() * width * 0.1;

	const points: Pt[] = [];
	for (let i = 0; i <= legs; i++) {
		/*
		 * Alternating ends, and each one pulled in by a different amount, so the
		 * turns do not stack up into a straight edge down either side — which is
		 * what makes a machine's zigzag look like one.
		 */
		const atRight = i % 2 === 1;
		const x = atRight ? padX + spanX - pull() : padX + pull();
		points.push({ x, y: padY + drop * i + jitter(0.05) });
	}

	return handPath(points, { ...options, wobble: options.wobble ?? 0.9 });
}

let scribbled: string | null = null;

/**
 * The delete mark itself. One drawing everywhere, so it is drawn once and every
 * row and header that shows it shares the path, rather than each redrawing the
 * same scribble from the same seed as it mounts.
 */
export function scribbleMark(): string {
	scribbled ??= handScribble(SCRIBBLE.w, SCRIBBLE.h, {
		seed: seedFrom(SCRIBBLE.seed),
		wobble: 0.7
	});
	return scribbled;
}

/**
 * A loop drawn round something, the way a hand rings a word on paper.
 *
 * Not a box. A box is a thing with corners and reads as a frame put round the
 * words; a loop is somebody's pen going round them once, which is what a place
 * to drop something in wants to say. It is tilted a little for the same reason
 * — a hand circling a word does not level the ellipse first.
 *
 * The pen carries on a little past where it started, because it does: closing
 * exactly on the first point is a shape, and crossing it is a gesture.
 */
export function handOval(
	width: number,
	height: number,
	options: HandOptions & { tilt?: number; jitter?: number; over?: number; steps?: number }
): string {
	const cx = width / 2;
	const cy = height / 2;
	const tilt = ((options.tilt ?? 0) * Math.PI) / 180;
	const cos = Math.cos(tilt);
	const sin = Math.sin(tilt);

	/*
	 * Twelve is enough for handPath's bends to read as a curve rather than as a
	 * polygon, and few enough that the wobble lands on the shape rather than
	 * sanding it smooth — at the size of a word, which is the size every loop
	 * in the app was drawn at until one was thrown round a whole row.
	 *
	 * It does not hold at any size. handPath bends each segment exactly once,
	 * about a control point at its midpoint, so a ring sampled this coarsely is
	 * a twelve-sided figure with slightly bowed sides; at ninety pixels across
	 * that is a ring and at three hundred it is plainly a polygon. The fix is
	 * more points, not more wobble — wobble bows the sides further and makes it
	 * a rounder polygon. Named rather than derived from the size, so no mark
	 * already drawn is re-cut by a rule about a mark that came later.
	 */
	const steps = options.steps ?? 12;
	/** How far past the start the pen goes, in steps. */
	const over = options.over ?? 0.7;

	/*
	 * How far each point is let off the true ellipse, as a fraction of the
	 * radius it sits on.
	 *
	 * `wobble` bends the line *between* two points; this moves the points
	 * themselves, and the two say different things. A wobbled ellipse is a
	 * true ellipse drawn by an unsteady hand — every radius still correct,
	 * which at any size above a glyph reads as traced. A ring somebody threw
	 * round a word is not an ellipse at all: it is fatter on one side, it runs
	 * out of room at the end and hurries, and no two of its radii agree. That
	 * is what this is for, and why it is off by default — the switcher's own
	 * loop is drawn at the size of a word, where there is no room for it to
	 * tell and the extra numbers would only be a second thing to keep in step.
	 */
	const jitter = options.jitter ?? 0;
	const loose = jitter > 0 ? rng(options.seed + 977) : null;

	const at = (turn: number): Pt => {
		const a = (turn / steps) * Math.PI * 2;
		/*
		 * Read off `turn` rather than off a counter, so the point the pen
		 * carries past the start to is let off by the same amount the start
		 * was — a crossing where the two ends disagree about the radius is two
		 * pens, not one going round twice.
		 */
		const off = loose ? 1 + (loose() * 2 - 1) * jitter : 1;
		const x = Math.cos(a) * (width / 2) * off;
		const y = Math.sin(a) * (height / 2) * off;
		return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
	};

	const points: Pt[] = [];
	for (let i = 0; i <= steps; i++) points.push(at(i));
	points.push(at(steps + over));

	return handPath(points, options);
}

/**
 * A bin, for the corner the paper folds away to show.
 *
 * Not the scribble, and that is the whole point of it. A scribble is what a
 * hand does to a line it wants rid of — it is a mark made *on* something, and
 * it belongs beside the thing it strikes out. The corner is not a mark; it is
 * a place, and what a place to be rid of things looks like is a bin. The two
 * never appear together, and neither could stand in for the other: a scribble
 * on an empty corner would be a mark with nothing under it, and a bin beside a
 * row would be a picture where every other mark on the sheet is a gesture.
 *
 * Four strokes, and one of them unlifted: a pen draws the body in a single
 * run down one wall, across the bottom and up the other, then rules the lid,
 * then the tab above it, then the ribs. The walls lean in and the ribs lean
 * with them, or the ribs read as bars in front of a box rather than as the
 * moulding of the thing.
 */
export function handBin(width: number, height: number, options: HandOptions): string {
	/** Where the lid sits, and so where the body starts. */
	const lid = height * 0.24;
	const inner = height - lid;

	const body = handPath(
		[
			{ x: width * 0.1, y: lid },
			{ x: width * 0.21, y: height },
			{ x: width * 0.79, y: height },
			{ x: width * 0.9, y: lid }
		],
		options
	);

	const rim = handPath(
		[
			{ x: 0, y: lid },
			{ x: width, y: lid }
		],
		{ ...options, seed: options.seed + 131 }
	);

	const tab = handPath(
		[
			{ x: width * 0.35, y: lid },
			{ x: width * 0.37, y: height * 0.05 },
			{ x: width * 0.63, y: height * 0.05 },
			{ x: width * 0.65, y: lid }
		],
		{ ...options, seed: options.seed + 271 }
	);

	/** Two, leaning the way the wall nearest each of them leans. */
	const ribs = [0.37, 0.63]
		.map((at, i) => {
			const lean = (at - 0.5) * 0.16;
			return handPath(
				[
					{ x: width * at, y: lid + inner * 0.14 },
					{ x: width * (at - lean), y: lid + inner * 0.86 }
				],
				{ ...options, seed: options.seed + 613 + i * 97 }
			);
		})
		.join(' ');

	return `${body} ${rim} ${tab} ${ribs}`;
}

/** The chevron on a group title. */
export function handChevron(size: number, collapsed: boolean, options: HandOptions): string {
	const w = size * 0.62;
	const h = size * 0.3;
	const x = (size - w) / 2;
	const y = (size - h) / 2;

	return handPath(
		collapsed
			? [
					{ x, y },
					{ x: x + w / 2, y: y + h },
					{ x: x + w, y }
				]
			: [
					{ x, y: y + h },
					{ x: x + w / 2, y },
					{ x: x + w, y: y + h }
				],
		options
	);
}

/**
 * The burger that opens the menu: three strokes, each seeded apart so they
 * wobble independently rather than reading as one shape stamped three times.
 *
 * The bars are unequal by a few percent, the way three pen strokes are.
 */
export function handBurger(size: number, options: HandOptions): string {
	return bars(size, options, false);
}

/**
 * The same three strokes with a mark put in front of each: the burger seen as
 * what it has always been a picture of, which is a list.
 *
 * It is the panel's own corner mark, where the sheet has the burger — the two
 * are the same button on the two sides of one piece of paper, so the second
 * has to be the first with something done to it rather than a different
 * drawing that happens to be three lines. Every proportion here is the
 * burger's; what is added is the short dash at the head of each row, and the
 * gap that parts it from the words.
 *
 * A list rather than an arrow back. An arrow says where a tap goes; this says
 * what is on the other side, which is the thing the tap is for — and the mark
 * a finger left from is the mark it comes back to.
 */
export function handList(size: number, options: HandOptions): string {
	return bars(size, options, true);
}

/**
 * Three rows across a square, bulleted or not.
 *
 * One function for both, because they are one mark: retuning the burger's gap
 * or the lean of its bars and leaving the list where it was would put two
 * different hands on the two faces of the same sheet.
 */
function bars(size: number, options: HandOptions, bulleted: boolean): string {
	const widths = [1, 0.88, 0.96];
	const gap = size * 0.3;
	const top = (size - gap * 2) / 2;

	/*
	 * How much of a row the dash takes, and how far it stands off the rest of
	 * it. Short enough to read as a mark beside the line rather than as a
	 * fourth bar broken in two, and parted by about its own length — closer and
	 * the round caps close the gap at this size, further and the dashes stop
	 * belonging to the rows they head.
	 */
	const DASH = 0.18;
	const PART = 0.14;

	return widths
		.flatMap((factor, i) => {
			const w = size * factor;
			const x = (size - w) / 2;
			const y = top + gap * i;
			const seed = options.seed + i * 977;

			if (!bulleted) {
				return handPath(
					[
						{ x, y },
						{ x: x + w * 0.45, y },
						{ x: x + w, y }
					],
					{ ...options, seed }
				);
			}

			const head = x + w * DASH;
			const from = x + w * (DASH + PART);

			return [
				handPath(
					[
						{ x, y },
						{ x: head, y }
					],
					{ ...options, seed }
				),
				handPath(
					[
						{ x: from, y },
						{ x: from + (x + w - from) * 0.45, y },
						{ x: x + w, y }
					],
					// Apart from its own dash, or the two wobble as one stroke cut
					// in half and the gap reads as a break rather than as a space.
					{ ...options, seed: seed + 313 }
				)
			];
		})
		.join(' ');
}

/**
 * The same button when something is waiting to go: an arrow up and to the
 * right. Not a status light — it is the outbox, pointing the way out.
 */
export function handArrow(size: number, options: HandOptions): string {
	const pad = size * 0.22;
	const from = { x: pad, y: size - pad };
	const to = { x: size - pad, y: pad };
	const head = size * 0.34;

	const shaft = handPath([from, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, to], options);

	// Two strokes off the point, drawn as one polyline so the corner joins.
	const barb = handPath([{ x: to.x - head, y: to.y }, to, { x: to.x, y: to.y + head }], {
		...options,
		seed: options.seed + 613
	});

	return `${shaft} ${barb}`;
}

/**
 * A long arrow bowed between two points, for the one thing in this app that
 * points at another: the guide drawn over the page when somebody arrives on an
 * invitation.
 *
 * `handArrow` is a glyph — a fixed diagonal inside its own square, saying
 * "out" on a button. This is the other kind of arrow entirely: a stroke drawn
 * across the page from where the hand is to the thing being named, so it has
 * to know both ends and it has to bow, because a hand reaching across a page
 * does not draw a ruler's line. The bow is perpendicular to the run and peaks
 * at the middle; its sign is the caller's, since which side an arrow sweeps
 * round is a fact about what it is going past.
 *
 * The barb is taken off the tangent at the head rather than off the straight
 * line between the ends — on a bowed stroke those differ by enough to read as
 * a barb stuck on at the wrong angle.
 */
export function handSwoop(from: Pt, to: Pt, options: HandOptions & { bow?: number }): string {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const span = Math.hypot(dx, dy) || 1;

	// Unit normal to the run, which is the way the bow goes.
	const nx = -dy / span;
	const ny = dx / span;
	const bow = (options.bow ?? 0.2) * span;

	/*
	 * Eight is enough for the bow to read as one sweep rather than as a bent
	 * line, and few enough that handPath's own wobble still lands on it. The
	 * stroke is long, so `subdivide` is not what is wanted here — its cuts are
	 * evenly spaced along a straight run and would flatten the curve.
	 */
	const steps = 8;
	const points: Pt[] = [];

	for (let i = 0; i <= steps; i++) {
		const s = i / steps;
		// A parabola through both ends, peaking at the middle.
		const lift = 4 * s * (1 - s) * bow;
		points.push({ x: from.x + dx * s + nx * lift, y: from.y + dy * s + ny * lift });
	}

	const shaft = handPath(points, options);

	const before = points[steps - 1];
	const heading = Math.atan2(to.y - before.y, to.x - before.x);
	/* Big enough to be seen across a page, and never bigger than the stroke. */
	const head = Math.min(span * 0.22, 34);
	/** How far each leg is swung back off the heading. */
	const spread = 0.44;

	const barb = handPath(
		[
			{
				x: to.x - Math.cos(heading - spread) * head,
				y: to.y - Math.sin(heading - spread) * head
			},
			to,
			{ x: to.x - Math.cos(heading + spread) * head, y: to.y - Math.sin(heading + spread) * head }
		],
		{ ...options, seed: options.seed + 409 }
	);

	return `${shaft} ${barb}`;
}

/**
 * A circle with a stroke through it: the list could not be reached.
 *
 * Not a warning triangle and not a crossed-out cloud — being offline is a
 * condition, not an error, and the same three glyphs have to read as one hand.
 * Closed, unlike handRefresh, so the two are never confused at 22px: one is a
 * stroke that came back round, this one is shut.
 *
 * The slash is seeded apart from the ring, so it does not inherit the same
 * wobble and come out looking stamped rather than drawn.
 */
export function handSlashedCircle(size: number, options: HandOptions): string {
	const r = size * 0.34;
	const c = size / 2;

	const ring = handPath(arc(c, r, 0, Math.PI * 2), options);

	/*
	 * One stroke, corner to corner through the middle, ending well clear of the
	 * ring at both ends the way a pen does when it strikes something out.
	 *
	 * The reach is what makes it read as a crossing rather than a chord. At a
	 * quarter past the radius the ends cleared the ring by about the width of
	 * the stroke itself, which at 22px is not a crossing — it is a line that
	 * stops where the circle is.
	 *
	 * Two points rather than three: handPath bends each segment once, so a
	 * middle point put a kink at the centre of what should be one fast stroke.
	 * Half the wobble, for the same reason — this is the most deliberate mark
	 * in the app.
	 */
	const reach = r * 0.98;
	const slash = handPath(
		[
			{ x: c - reach, y: c + reach },
			{ x: c + reach, y: c - reach }
		],
		{ ...options, seed: options.seed + 419, wobble: (options.wobble ?? 1) * 0.5 }
	);

	return `${ring} ${slash}`;
}

/**
 * One square bracket: a stem with a serif at each end, drawn in a single
 * stroke the way a hand makes one.
 *
 * `side` is which bracket it is — the left one turns its serifs to the right,
 * and the right one mirrors that. Graphe has no brackets of its own, so where
 * one has to be drawn rather than typed, this is it.
 */
export function handBracket(
	width: number,
	height: number,
	side: 'left' | 'right',
	options: HandOptions
): string {
	const stem = side === 'left' ? 0 : width;
	const serif = side === 'left' ? width : 0;

	return handPath(
		[
			{ x: serif, y: 0 },
			{ x: stem, y: 0 },
			{ x: stem, y: height / 2 },
			{ x: stem, y: height },
			{ x: serif, y: height }
		],
		options
	);
}

/**
 * A handful of short strokes radiating from the middle: the one flourish a
 * checkbox gets when it is ticked.
 *
 * Unequal lengths and uneven angles, because six identical spokes is an asterisk
 * and this is meant to read as a scribble of delight. Nothing here is animated —
 * the strokes are drawn, and CSS fades and grows them.
 */
export function handSparkle(size: number, options: HandOptions & { rays?: number }): string {
	const rays = options.rays ?? 6;
	const c = size / 2;
	const random = rng(options.seed ^ 0x2545f491);

	return Array.from({ length: rays }, (_, i) => {
		// Off the even spoke by up to a third of a step, so no two gaps match.
		const angle = ((i + (random() * 2 - 1) * 0.33) / rays) * Math.PI * 2;
		const from = c * (0.42 + random() * 0.12);
		const to = c * (0.72 + random() * 0.26);

		return handPath(
			[
				{ x: c + Math.cos(angle) * from, y: c + Math.sin(angle) * from },
				{ x: c + Math.cos(angle) * to, y: c + Math.sin(angle) * to }
			],
			{ ...options, seed: options.seed + i * 733 }
		);
	}).join(' ');
}

/**
 * The side of the sheet: a drawn line down its whole length.
 *
 * The torn edges close the paper top and bottom; without these it has no
 * sides, and reads as text on a page rather than as a strip of paper. Drawn at
 * the height it is shown at, like the tear — see TornEdge.svelte — so the
 * weight matches and nothing is stretched.
 */
export function handVertical(
	height: number,
	options: HandOptions & { x?: number; every?: number }
): string {
	const x = options.x ?? 1;
	// Defaults to the spacing handRect subdivides at, so long strokes wobble at
	// the same rate unless a caller wants a busier hand.
	const steps = Math.max(2, Math.round(height / (options.every ?? 90)));

	const points: Pt[] = [];
	for (let i = 0; i <= steps; i++) points.push({ x, y: (height * i) / steps });

	return handPath(points, options);
}

/**
 * A circular arrow: sync when nothing is waiting but the list has not been
 * looked at in a while.
 *
 * Open at the top, so it reads as a stroke someone came back round rather than
 * a closed ring, and it can never be mistaken for the status square.
 */
export function handRefresh(size: number, options: HandOptions): string {
	const r = size * 0.34;
	const c = size / 2;

	/*
	 * A wide gap, and the head built from the direction of travel.
	 *
	 * It used to close to within twenty-seven degrees and carry a barb made of
	 * fixed offsets that had nothing to do with where the stroke was going — so
	 * at 22px it read as a ring with a nick out of it and a tick inside. A
	 * quarter of the circle is open now, which is what says "came round" rather
	 * than "closed".
	 *
	 * The pen starts at the bottom right, sweeps three quarters the long way
	 * round, and finishes at the top right. That places the head where there is
	 * room for it: ending at the far right instead put a barb past the edge of
	 * the box.
	 */
	const start = -Math.PI * 1.75;
	const end = -Math.PI * 0.25;

	const points = arc(c, r, start, end);
	const ring = handPath(points, options);

	/*
	 * Two strokes off the end, opening back along the way the pen came. The
	 * tangent at that point is a quarter turn past the angle itself, because
	 * the stroke travels along the circle rather than out from its middle.
	 */
	const tip = points[points.length - 1];
	const tangent = end + Math.PI / 2;
	const head = size * 0.2;
	/*
	 * Wide, nearly across the end of the stroke rather than tucked back along
	 * it. A tight head is what an arrow has room for at a size you can see; at
	 * 22px the two barbs close up against the ring and the whole thing reads as
	 * a blob, where a flat one stays two strokes and a corner.
	 */
	const spread = Math.PI * 0.72;

	const barb = handPath(
		[
			{
				x: tip.x + Math.cos(tangent + spread) * head,
				y: tip.y + Math.sin(tangent + spread) * head
			},
			tip,
			{
				x: tip.x + Math.cos(tangent - spread) * head,
				y: tip.y + Math.sin(tangent - spread) * head
			}
		],
		{ ...options, seed: options.seed + 271 }
	);

	return `${ring} ${barb}`;
}

/**
 * A ring of short strokes struck outward from the middle: the light around a
 * sun, whichever body is standing in the middle of it.
 *
 * Unequal lengths and uneven angles, for the same reason handSparkle's are
 * unequal — eight even spokes is an asterisk, not a drawing of the sun.
 */
function corona(
	c: number,
	size: number,
	rays: number,
	inner: number,
	outer: number,
	options: HandOptions
): string {
	const random = rng(options.seed ^ 0x85ebca6b);

	return Array.from({ length: rays }, (_, i) => {
		// Off the even spoke by up to a third of a step, so no two gaps match.
		const angle = ((i + (random() * 2 - 1) * 0.3) / rays) * Math.PI * 2;
		/*
		 * Either side of the length asked for, rather than only ever longer.
		 * Jitter that adds is a margin the caller cannot see: it put the tip of
		 * the longest ray outside the box, which at 22px is a stroke clipped by
		 * the button rather than a hand that wavered.
		 */
		const from = size * inner * (0.96 + random() * 0.08);
		const to = size * outer * (0.94 + random() * 0.12);

		return handPath(
			[
				{ x: c + Math.cos(angle) * from, y: c + Math.sin(angle) * from },
				{ x: c + Math.cos(angle) * to, y: c + Math.sin(angle) * to }
			],
			{ ...options, seed: options.seed + i * 733 }
		);
	}).join(' ');
}

/**
 * The inner edge of a crescent: a bow between the two horns, curving back
 * across the disc.
 *
 * Sampled off the chord rather than struck as a second circle. A crescent is
 * properly two circles, one cutting the other, but the horns are then wherever
 * those two happen to meet — and at 22px the arc between them is three pixels
 * of a very large circle, which is to say a curve nobody can tell from this
 * one. This way the horns are given, so the limb and the edge begin and end in
 * the same two places by construction rather than by arithmetic.
 *
 * `waist` is how thick the crescent comes out across its middle, as a fraction
 * of the radius, and it is the whole glyph: too generous and this is a full
 * moon with a line drawn on it.
 */
function bow(c: number, r: number, facing: number, gap: number, waist: number, steps = 6): Pt[] {
	const from = { x: c + Math.cos(facing - gap) * r, y: c + Math.sin(facing - gap) * r };
	const to = { x: c + Math.cos(facing + gap) * r, y: c + Math.sin(facing + gap) * r };

	// Far enough past the chord that the apex lands `waist` short of the limb.
	const depth = Math.cos(gap) * r + r * (1 - waist);

	const points: Pt[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const push = Math.sin(Math.PI * t) * depth;

		points.push({
			x: from.x + (to.x - from.x) * t - Math.cos(facing) * push,
			y: from.y + (to.y - from.y) * t - Math.sin(facing) * push
		});
	}

	return points;
}

/**
 * A crescent in two strokes, seeded apart, so the horns close by hand rather
 * than by arithmetic — the limb and the edge are drawn to the same two points,
 * and what is left between them is the join a pen makes.
 */
function crescent(
	c: number,
	r: number,
	facing: number,
	gap: number,
	waist: number,
	options: HandOptions
): string {
	// The long way round: what is left open is the gap between the horns.
	const limb = handPath(arc(c, r, facing + gap, facing + Math.PI * 2 - gap), options);
	const edge = handPath(bow(c, r, facing, gap, waist), {
		...options,
		seed: options.seed + 337
	});

	return `${limb} ${edge}`;
}

/**
 * Up and to the right, for both bodies that have a side to face.
 *
 * This is not any particular night's moon. It faces that way because the horns
 * then sit clear of the corners of a square box, and the thick of it falls
 * down the left where there is room for it.
 */
const FACING = -Math.PI * 0.25;

/**
 * The one crescent both marks are cut from, drawn at two sizes.
 *
 * A generous waist and a narrow gap: a moon this app draws is a moon a few
 * nights off full, not a fingernail. Thinner, it came out as a stroke with a
 * bend in it — and the sliver that was left in the smaller of the two closed
 * up altogether once the corona was around it.
 */
const GAP = Math.PI * 0.26;
const WAIST = 0.68;

/** The theme is light: a sun, disc and all. */
export function handSun(size: number, options: HandOptions & { rays?: number }): string {
	const c = size / 2;

	/*
	 * A small disc for the box it sits in, because the light has to fit outside
	 * it. Drawn at the radius the other 22px glyphs use, a sun leaves its rays
	 * either past the edge of the button or lying on top of itself.
	 */
	const disc = handPath(arc(c, size * 0.19, 0, Math.PI * 2), options);

	return `${disc} ${corona(c, size, options.rays ?? 8, 0.29, 0.42, options)}`;
}

/** The theme is dark: a moon, and nothing else in the sky. */
export function handMoon(size: number, options: HandOptions): string {
	return crescent(size / 2, size * 0.32, FACING, GAP, WAIST, options);
}

/**
 * Both bodies at once: the theme is whatever the phone is doing.
 *
 * The moon standing in the sun's light — a crescent where the sun keeps its
 * disc, inside a corona the moon does not have. That is what makes three
 * glyphs out of two bodies: each of the others is this one with a piece taken
 * away, and none of the three is the crossed circle the sync button draws when
 * the list cannot be reached.
 *
 * The crescent is thinner and the corona sparser than either mark alone. This
 * one is carrying two things in the space the others carry one, and a full
 * eight rays around a crescent closes the gaps that say it is a crescent.
 */
export function handSunMoon(size: number, options: HandOptions): string {
	const c = size / 2;
	/*
	 * A smaller moon than handMoon draws, and the corona struck further out
	 * than the sun's, so there is a clear band of paper between the two. Sat
	 * closer they touched at 22px and the rays read as spines on the moon
	 * rather than as light behind it.
	 *
	 * The rays are shorter for it. That is the right thing to spend: their
	 * length says nothing, and the gap says these are two bodies.
	 */
	const moon = crescent(c, size * 0.23, FACING, GAP, WAIST, options);

	return `${moon} ${corona(c, size, 6, 0.37, 0.46, options)}`;
}

/**
 * The mark under a link, as a tile that repeats along a line of text.
 *
 * Every other drawn thing here is an inline `<svg>` measured to the box it
 * belongs to. A link cannot be: it is inline text, it wraps, and each of its
 * line boxes wants its own underline — which is precisely what a repeating
 * background does for free and what a single measured element cannot do at
 * all without re-measuring every line on every reflow.
 *
 * So this one returns a whole SVG document rather than a path, ready to be a
 * `url()`. It is still drawn by the same hand as the rest: one `handLine`,
 * seeded, wobbling on the same terms.
 *
 * The colour is baked because a data URI is its own document and cannot read
 * `--ink`. That is why this takes one — see app.css, where it is called once
 * for each of the two colours the sheet is ever drawn in.
 */
export function handUnderlineTile(
	width: number,
	height: number,
	ink: string,
	options: HandOptions
): string {
	// Two-thirds down the tile, so the stroke has room to wobble under the
	// baseline without being clipped by the edge of its own box.
	const d = handLine(width, { ...options, y: height * 0.55, every: 9 });

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="0 0 ${width} ${height}">` +
		`<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.4" ` +
		`stroke-linecap="round"/></svg>`;

	return svg;
}
