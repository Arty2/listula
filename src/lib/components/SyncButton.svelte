<script lang="ts">
	import { browser } from '$app/environment';
	import { boil, boiling } from '$lib/draw/boil.svelte';
	import { handArrow, handRefresh, handSlashedCircle } from '$lib/draw/hand';
	import { tapped } from '$lib/feel';
	import { t } from '$lib/i18n';
	import { sync } from '$lib/state/sync.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * Sits to the left of the burger, and only when there is something to do.
	 *
	 * An arrow up and out when edits are waiting: an outbox that is not empty,
	 * not a warning light. A circular arrow when nothing is waiting but the list
	 * has not been looked at in ten minutes, because nothing syncs on its own and
	 * a list left open all morning is as old as when it was opened. A crossed
	 * circle when the list could not be reached, which outranks both — there is
	 * no point offering to send when nothing can leave.
	 *
	 * None of them is a nag. The button appearing is the whole of it — no banner,
	 * and nothing syncs until it is tapped.
	 */

	const SIZE = 22;

	/**
	 * Where the ink lands on each of the four drawings.
	 *
	 * A mark that is working reads lighter than one standing still, and the way
	 * to say that here is not opacity: the sheet has two colours, and a faded
	 * stroke is a grey. So the same black is laid down less often — the mark
	 * goes dotted while it works and comes back solid the moment it stops.
	 *
	 * The gap and the offset move frame to frame for the same reason the seed
	 * and the wobble do. One pattern held across all four would be a stencil
	 * sitting over a wobbling line; shifting it is a pen skipping somewhere new
	 * each time the mark is redrawn.
	 */
	const DOTS = [
		{ gap: 2.6, shift: 0 },
		{ gap: 3.1, shift: 1.4 },
		{ gap: 2.8, shift: 0.6 },
		{ gap: 3.4, shift: 2 }
	];

	/* The four drawings of each mark — see src/lib/draw/boil.svelte.ts. */
	const arrow = boil('arrow', (o) => handArrow(SIZE, o));
	const refresh = boil('refresh', (o) => handRefresh(SIZE, o));
	const slash = boil('offline', (o) => handSlashedCircle(SIZE, o));

	const waiting = $derived(sync.unsent > 0);
	const offline = $derived(sync.status === 'offline');

	/*
	 * Being unreachable is worth showing on its own. Everything is safe on the
	 * device either way, but "it did not go" is not something to find out later.
	 *
	 * `sync.syncable` is the same question the SYNC panel's own button asks:
	 * nothing written and no code means there is nothing to send and no list to
	 * fetch, so there is nothing to offer. Staleness alone would otherwise put
	 * this button on the page for someone who has just arrived, because a
	 * device that has never synced has been not-syncing since the epoch.
	 */
	const shown = $derived(sync.syncable && (offline || waiting || sync.stale));

	/*
	 * Asked in JS rather than left to a media query, as every animation here is:
	 * `leaving` is cleared by its own animationend, and a fade that is merely
	 * switched off in CSS never ends, so the button would sit invisible in the
	 * corner holding its place for good.
	 */
	const still = () => browser && matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** While a sync is actually in flight — from here or from the menu. */
	const working = $derived(sync.busy && !still());

	/* Which of the four drawings is on screen, and when. */
	const boiled = boiling(() => working);

	/*
	 * On its way out after a sync that left nothing to offer.
	 *
	 * Kept on the page for the length of the fade, because the button vanishing
	 * is the only sign the corner gives that the sync landed, and a mark that
	 * blinks out is one you are never sure you saw.
	 */
	let leaving = $state(false);
	let was = false;

	$effect(() => {
		const now = shown;
		if (now) leaving = false;
		else if (was && !still()) leaving = true;
		was = now;
	});

	const label = $derived(
		offline
			? t.sync.buttonOffline
			: waiting
				? t.sync.buttonWaiting({ count: sync.unsent })
				: t.sync.buttonStale
	);

	/*
	 * Says what happened, because nothing else here will.
	 *
	 * The menu shows `sync.message` in an alert, but this button is the way to
	 * sync without opening the menu — so a failure had no way of reaching anyone.
	 * Tapping it with the server unreachable did nothing at all, which is exactly
	 * how a broken deployment came to look like an idle one.
	 */
	async function syncNow() {
		tapped();
		const outcome = await sync.sync();

		// `null` means the cooldown or an in-flight sync swallowed it, or the list
		// was left while it was out — nothing to explain about the list open now.
		if (!outcome) return;

		// Both halves, or the quiet one is indistinguishable from a dead button.
		if (outcome.status === 'synced') ui.say(t.toast.synced);
		else if (sync.message) ui.say(sync.message);
	}

	/*
	 * Advances the clock the staleness derives from, and recomputes the mark so
	 * the crossed circle is not left behind by a connection that came or went.
	 * Nothing here syncs — this is not a poll and not a reconnect trigger.
	 *
	 * The interval callback runs outside the effect, so this writes `now` without
	 * ever reading it — an effect that does both never settles, and takes the
	 * tree down with it.
	 */
	$effect(() => {
		sync.now = Date.now();
		const tick = setInterval(() => {
			sync.now = Date.now();
			sync.refresh();
		}, 15_000);
		return () => clearInterval(tick);
	});
</script>

{#if shown || leaving}
	<button
		class="sync"
		class:leaving
		type="button"
		disabled={leaving || sync.busy || sync.cooling}
		onclick={syncNow}
		onanimationend={() => (leaving = false)}
		aria-label={label}
		title={label}
	>
		<svg
			class="mark"
			class:working
			class:turning={working && !offline && !waiting}
			viewBox="0 0 {SIZE} {SIZE}"
			width={SIZE}
			height={SIZE}
			aria-hidden="true"
		>
			<path
				d={(offline ? slash : waiting ? arrow : refresh)[boiled.frame]}
				class="drawn"
				class:drawn--dotted={working}
				style:--dot-gap={DOTS[boiled.frame].gap}
				style:--dot-shift={DOTS[boiled.frame].shift}
			/>
		</svg>
	</button>
{/if}

<style>
	.sync {
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	/*
	 * Not dimmed, unlike every other disabled control here.
	 *
	 * This one is a mark in the corner rather than a word in a panel, and it is
	 * disabled for ten seconds after every sync — so dimming it made the corner
	 * fade out and back for a third of the time anyone is looking at it, which
	 * reads as the mark going wrong rather than as a button resting. The SYNC
	 * button in the menu still dims, because it is a boxed action among other
	 * boxed actions and "not available" is worth saying there.
	 *
	 * The cursor still says so, and the button is genuinely disabled — this is
	 * only about what the ink does.
	 */
	.sync:disabled {
		cursor: default;
	}

	svg {
		overflow: visible;
	}

	/*
	 * One beat for every mark this button draws, so the corner reads as one
	 * thing working rather than as two different ideas about waiting.
	 *
	 * What every mark does while it works is boil — the same mark drawn four
	 * times over, cycled, the way hand-drawn animation has always made a line
	 * look alive. That is done in the markup rather than here, because it is a
	 * change of drawing rather than a change of shape, and CSS cannot swap one
	 * path for another. It replaced a pulse, which grew and faded the mark
	 * mechanically: the one thing on this sheet that never looked drawn.
	 *
	 * Each of those drawings is dotted, on a pattern of its own — see `DOTS`.
	 * That is how a working mark reads faint here, since fading it would put a
	 * grey on a sheet that has none.
	 *
	 * The circular arrow turns on top of it, because it is a stroke that came
	 * round and turning is what it already means. The outbox arrow cannot turn
	 * without pointing somewhere it does not mean, and the crossed circle
	 * turning would read as a mark being scribbled out — so those two boil and
	 * nothing more, on the same count.
	 */
	.working.turning {
		animation: turn 900ms linear infinite;
	}

	@keyframes turn {
		to {
			rotate: 360deg;
		}
	}

	/*
	 * Gone, and the last thing it does is say so. Cleared by its own
	 * animationend — see `still()` for why that is asked in JS.
	 */
	.leaving {
		animation: fade 260ms ease-out forwards;
		pointer-events: none;
	}

	@keyframes fade {
		to {
			opacity: 0;
			scale: 0.8;
		}
	}
</style>
