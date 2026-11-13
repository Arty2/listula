<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { trap } from '$lib/a11y/trap';
	import { handCross, handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';
	import { t } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		seed: string;
		onclose: () => void;
		children: Snippet;
	};

	let { title, seed, onclose, children }: Props = $props();

	/*
	 * One component for SHARE, SYNC, IMPORT and the two confirms.
	 *
	 * Opaque white, full viewport, with a hand-drawn border inset from the edges.
	 * No scrim: dimming the page means grey, and grey does not exist here. The
	 * panel simply covers what is behind it. Escape closes it; there is no
	 * backdrop to click.
	 */

	const cross = $derived(handCross(20, { seed: seedFrom(`close${seed}`), wobble: 0.8 }));
	const grip = $derived(handLine(64, { seed: seedFrom(`grip${seed}`), wobble: 1.1, y: 2 }));

	let panel = $state<HTMLElement | null>(null);
	let offset = $state(0);
	let dragStart: { y: number; at: number } | null = null;

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		if ((event.target as HTMLElement).closest('input, textarea, button')) return;
		dragStart = { y: event.clientY, at: performance.now() };
	}

	/** Whether the drag has taken the pointer, so the release is heard anywhere. */
	let captured = false;

	function onpointermove(event: PointerEvent) {
		if (!dragStart) return;

		/*
		 * Let go where the panel could not hear it. Nothing held the pointer, so
		 * a mouse dragged off the panel and released out there left the drag
		 * armed — and the panel then followed the pointer about with no button
		 * down, until something happened to be clicked.
		 */
		if (event.buttons === 0) {
			dragStart = null;
			captured = false;
			offset = 0;
			return;
		}

		// Downwards only; the panel does not lift off the top of the screen.
		offset = Math.max(0, event.clientY - dragStart.y);

		// On the first move rather than the press, as everywhere else here:
		// capturing on the press retargets the click that follows it.
		if (!captured && offset > 0) {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			captured = true;
		}
	}

	function onpointerup(event: PointerEvent) {
		if (captured) (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		captured = false;
		if (!dragStart || !panel) return;

		const travelled = event.clientY - dragStart.y;
		const elapsed = performance.now() - dragStart.at;
		const flick = travelled > 40 && elapsed < 250;

		dragStart = null;

		if (flick || travelled > panel.clientHeight * 0.25) onclose();
		else offset = 0; // Springs back.
	}
</script>

<div
	class="panel"
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	bind:this={panel}
	style:--offset="{offset}px"
	use:trap={onclose}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={() => {
		dragStart = null;
		captured = false;
		offset = 0;
	}}
>
	<div class="frame" aria-hidden="true">
		<HandRect {seed} wobble={2.2} />
	</div>

	<div class="grip" aria-hidden="true">
		<svg viewBox="0 0 64 5" width="64" height="5">
			<path d={grip} class="drawn" />
		</svg>
	</div>

	<button
		class="close"
		type="button"
		onclick={() => {
			tapped();
			onclose();
		}}
		aria-label={t.menu.close}
	>
		<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
			<path d={cross} class="drawn" />
		</svg>
	</button>

	<div class="body">
		{@render children()}
	</div>
</div>

<style>
	.panel {
		position: fixed;
		inset: 0;
		z-index: 10;
		background: var(--paper);
		padding: calc(2rem + env(safe-area-inset-top)) 2rem calc(2rem + env(safe-area-inset-bottom));
		overflow-y: auto;
		outline: none;
		touch-action: pan-y;
		translate: 0 var(--offset, 0);
		/*
		 * Scrolling past the top or bottom of this panel must not chain to the
		 * page underneath — a rubber-band bounce past either end would open a
		 * gap and show the sheet's own paper through it, which is the outer
		 * page's colour showing at the edge of what is meant to cover it whole.
		 */
		overscroll-behavior: contain;
	}

	/* The border is inset from the edges rather than drawn along them. */
	.frame {
		position: absolute;
		inset: 0.75rem;
		pointer-events: none;
	}

	.grip {
		display: flex;
		justify-content: center;
		padding-bottom: 0.75rem;
	}

	.close {
		position: absolute;
		top: calc(1.1rem + env(safe-area-inset-top));
		right: 1.1rem;
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.body {
		max-width: 34rem;
		margin: 0 auto;
		padding-top: 1.5rem;
	}
</style>
