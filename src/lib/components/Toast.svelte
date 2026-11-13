<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { taken } from '$lib/feel';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * A message comes down from above the paper and goes back up the same way.
	 *
	 * It used to appear and disappear outright, which is the one thing on the
	 * sheet that happened rather than moved — and a message that blinks out is
	 * one you are never sure you saw. Coming from off the top also says what it
	 * is: not part of the list, but a note laid over the top of it.
	 *
	 * Asked in JS rather than left to the media query, as every animation here
	 * is: the node is taken away by its own `animationend`, and an animation
	 * that is merely switched off never ends — the toast would sit there for
	 * good, over the corner buttons, with nothing left to take it away.
	 */
	const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	/**
	 * How far a finger has carried the message, in pixels.
	 *
	 * Up or right, and only those. Down is the sheet's own scrolling and left is
	 * the way the paper turns, so neither is free; the two that are left both
	 * carry it off the paper and both mean the same thing — take this away.
	 */
	let carried = $state({ x: 0, y: 0 });
	let dragging = $state(false);
	let from: { x: number; y: number } | null = null;
	/** Whether this gesture moved at all, and so was not a press of UNDO. */
	let moved = false;

	/** Far enough to have meant it. A message is small, so this is not far. */
	const THROWN = 32;

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0 || ui.leaving) return;
		from = { x: event.clientX, y: event.clientY };
		moved = false;
	}

	function onpointermove(event: PointerEvent) {
		if (!from) return;

		// Let go off the message before it had been moved, where it could not
		// hear the release: nothing is being thrown, and nothing should follow.
		if (!moved && event.buttons === 0) {
			from = null;
			return;
		}

		const x = Math.max(0, event.clientX - from.x);
		const y = Math.min(0, event.clientY - from.y);
		if (x === 0 && y === 0) return;

		if (!moved) {
			moved = true;
			dragging = true;
			/*
			 * The gesture is the message's from here until the finger lifts.
			 * Without it a message carried out from under the pointer stops
			 * hearing the release, and hangs wherever it was let go.
			 */
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}

		carried = { x, y };
	}

	function onpointerup(event: PointerEvent) {
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		if (!from) return;
		from = null;

		const held = dragging;
		/*
		 * Read on whichever axis moved further, because up and right are one
		 * gesture said two ways.
		 */
		const thrown = Math.max(carried.x, -carried.y) >= THROWN;

		dragging = false;
		carried = { x: 0, y: 0 };

		if (!held) return;

		if (thrown) {
			taken();
			/*
			 * Gone outright rather than played back up. It went where it was
			 * sent; sliding it home first and then away again would be the
			 * message arguing with the hand that had just moved it.
			 */
			ui.gone();
		}
	}

	/*
	 * Nothing to wait for.
	 *
	 * The leaving animation is what says the message is off the screen, so with
	 * no animation to end there is nobody to say it — and the toast would sit
	 * over the corner buttons for good. Asked here rather than in the state,
	 * which has no business knowing what a screen is doing.
	 */
	$effect(() => {
		if (ui.leaving && still()) ui.gone();
	});
</script>

{#if ui.toast}
	<!--
		`role="status"` and not `alert`: this is what happened, said quietly, and
		it is never urgent enough to interrupt what is being read.
	-->
	<div
		class="toast"
		class:arriving={!ui.leaving}
		class:leaving={ui.leaving}
		class:dragging
		style:--carried-x="{carried.x}px"
		style:--carried-y="{carried.y}px"
		role="status"
		aria-live="polite"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={() => {
			from = null;
			dragging = false;
			carried = { x: 0, y: 0 };
		}}
		onclickcapture={(event) => {
			// A gesture that carried the message is not a press of UNDO.
			if (!moved) return;
			moved = false;
			event.preventDefault();
			event.stopPropagation();
		}}
		onanimationend={(event) => {
			/*
			 * Its own animation, and only when it is the leaving one.
			 *
			 * Asked by state rather than by name: Svelte scopes the keyframes a
			 * component declares, so `animationName` here reads
			 * `svelte-1cpok13-toast-leave` and never matches what the file says.
			 * The two rules on this element are the arrival and the leaving, so
			 * `ui.leaving` tells the two apart without guessing at a hash.
			 */
			if (event.target !== event.currentTarget) return;
			if (!ui.leaving) return;
			ui.gone();
		}}
	>
		<HandRect seed="toast" wobble={2} />
		<span class="caps">{ui.toast.text}</span>
		{#if ui.toast.action}
			<button type="button" class="caps" onclick={ui.toast.action.run}
				>{ui.toast.action.label}</button
			>
		{/if}
	</div>
{/if}

<style>
	/*
	 * On the corner row itself, standing all but exactly where the buttons do.
	 *
	 * It used to sit at the bottom, which is where a phone puts its keyboard —
	 * so the one message that most wants reading, the one offering to undo what
	 * just happened, was behind the keys that had just caused it. Every toast
	 * here follows an edit, and an edit is made with the keyboard up.
	 *
	 * It then sat a row below the buttons, to keep clear of them. Level with
	 * them now, and covering them for as long as it shows: the row is the one
	 * line at the top of the sheet that is not writing, so a message belongs
	 * on it rather than opening a third line under it.
	 *
	 * Covering them is the whole reason it takes the row's own width and
	 * height below rather than its old centred 24rem: a bar narrower than the
	 * row leaves a few pixels of sync mark showing at one end and burger at
	 * the other, which reads as a misplaced box rather than as a message
	 * standing in for the row. `--toast-lead` is the few pixels that keep its
	 * own drawn box off the burger's ink at the top.
	 */
	.toast {
		position: fixed;
		left: 50%;
		top: calc(var(--corner-y) + var(--toast-lead));
		/*
		 * The centring lives here and the movement lives in `transform`, so the
		 * two compose without either having to know about the other — the same
		 * arrangement the panel uses to stay centred while it turns.
		 */
		translate: -50% 0;
		/*
		 * Laid on the sheet by hand rather than set down square on it.
		 *
		 * Everything else at the top of the paper is ruled to the row — the
		 * marks, the writing, the tear — so a message that lined up with all of
		 * it read as another part of the page rather than as a note dropped over
		 * it. A degree is enough: the top right corner lifts by a few pixels and
		 * nothing else about the bar changes.
		 *
		 * About a point just inside its own left edge, which is where a hand
		 * holding a slip of paper would have it, so the far end is what moves.
		 * `rotate` rather than `transform`, because `transform` carries the
		 * arrival and the throw and the two must not have to know about each
		 * other.
		 */
		rotate: -1deg;
		transform-origin: 15% 50%;
		display: flex;
		align-items: center;
		/*
		 * The message keeps to the left, where the sheet's own writing starts,
		 * and UNDO goes to the far end. Huddled together they left most of a
		 * sheet-wide bar empty, which read as a box drawn round nothing.
		 */
		justify-content: space-between;
		gap: 1rem;
		/*
		 * The corner row's own box: the paper's width, capped, less the room
		 * the buttons themselves are held off the edges by. Written from
		 * `--corner-x` because that is the same number the buttons are placed
		 * with — the bar lands on them rather than near them.
		 */
		width: calc(min(100vw, var(--paper-width)) - 2 * var(--corner-x));
		min-height: var(--touch);
		padding: 0.5rem 1rem;
		/*
		 * Nothing here is text to keep. It is a note laid over the sheet for ten
		 * seconds, and it is dragged by hand — a press that starts on the words
		 * of a message being thrown out selected them instead, and left the
		 * phone's selection handles standing over the paper afterwards.
		 */
		user-select: none;
		-webkit-user-select: none;
		/* Over the sheet it covers, and under the panel, which is 10. */
		z-index: 5;
		/*
		 * The message owns every direction a finger can go on it. Two of them
		 * take it away and the other two would hand the gesture to the page
		 * underneath, which is a message being scrolled by something it is
		 * lying on top of.
		 */
		touch-action: none;
	}

	/* Down from above the paper, and back up the same way. */
	.arriving {
		animation: toast-arrive var(--toast-slide) ease-out;
	}

	.leaving {
		animation: toast-leave var(--toast-slide) ease-in forwards;
	}

	/*
	 * Under a finger it goes where the finger goes, and nothing is animating —
	 * the arrival has long finished and the leaving has not been asked for.
	 */
	.dragging {
		transform: translate(var(--carried-x, 0px), var(--carried-y, 0px));
	}

	/*
	 * Far enough up to clear its own drawn box and the room it stands in.
	 * `--corner-y` is how far down the row begins, so this carries it past the
	 * top of the screen whatever the notch and the tear come to.
	 */
	@keyframes toast-arrive {
		from {
			transform: translateY(calc(-100% - var(--corner-y)));
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes toast-leave {
		from {
			transform: translateY(0);
			opacity: 1;
		}
		to {
			transform: translateY(calc(-100% - var(--corner-y)));
			opacity: 0;
		}
	}

	/*
	 * The ground goes behind the ink, not behind the padding box.
	 *
	 * Every part of a drawn box is drawn outside its own edges: the corners
	 * jitter by up to `overshoot`, each segment bows by half the `wobble`, and
	 * the stroke straddles the path it follows — HandRect sets `overflow:
	 * visible` precisely so none of that is clipped. The box is then lifted by
	 * --cap-lift while the padding box is not. A ground that stops at the
	 * padding box therefore stops short of the ink on all four sides and a
	 * whole cap-lift short of it at the top, and the sheet shows through every
	 * gap the pen wandered into.
	 *
	 * So the paper takes the drawn box's geometry instead of the element's: the
	 * same lift, and a margin wider than the pen can reach.
	 *
	 * Absolutely positioned, so it is not a flex item; behind, because the
	 * translate above already makes this a stacking context and a positioned
	 * pseudo-element would otherwise paint over the words.
	 */
	.toast::before {
		content: '';
		position: absolute;
		inset: -0.3rem;
		translate: 0 calc(-1 * var(--cap-lift));
		background: var(--paper);
		z-index: -1;
	}

	/*
	 * The words sit on the middle of the box rather than the middle of their own
	 * line. Graphe's capitals ride high in their line box, so centring the box
	 * on the row left them above it — the same correction every drawn thing
	 * beside capitals makes, in the other direction.
	 */
	.toast :global(svg.rect) {
		translate: 0 calc(-1 * var(--cap-lift));
	}

	/*
	 * Nothing moves, and nothing waits for a movement to end.
	 *
	 * The leaving animation is what calls `ui.gone()`, so switching it off in
	 * CSS alone would leave the message on screen for ever. Asked here as well
	 * as in JS because the arrival is harmless either way and this is the
	 * cheaper half; the JS is what keeps the exit honest.
	 */
	@media (prefers-reduced-motion: reduce) {
		.arriving,
		.leaving {
			animation: none;
		}
	}
</style>
