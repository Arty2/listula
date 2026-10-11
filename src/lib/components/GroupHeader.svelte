<script lang="ts">
	import HandRect from './HandRect.svelte';
	import Perforation from './Perforation.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { scribbleMark, SCRIBBLE } from '$lib/draw/hand';
	import { drag, dragGroup, type GroupDrop } from '$lib/dnd/drag.svelte';
	import { longPress } from '$lib/dnd/longpress';
	import { taken, tapped } from '$lib/feel';
	import { t } from '$lib/i18n';
	import { grow } from '$lib/grow';

	type Props = {
		title: string;
		seed: string;
		collapsed: boolean;
		count: number;
		/** How many of them are still to do — half counts as still to do. */
		open: number;
		/** How many are done, which is what the mark would clear. */
		done: number;
		/** Whether every task in the group is done, so the group can go. */
		finished: boolean;
		/**
		 * Loose ends: assembled on read rather than stored, so there is no title
		 * to edit, nothing to delete, and no order to drag it into.
		 */
		synthetic: boolean;
		/** What the group's unfinished tasks come to, or nothing to total. */
		total: string | null;
		/**
		 * Asked for by the sheet: open the name for changing, caret at the end.
		 * `open` is taken — it is how many tasks in here are still to do.
		 *
		 * Backspace on the empty row Enter put inside this group comes back here,
		 * because the name is what opened it — see `back` in Sheet.
		 */
		naming: boolean;
		onnamed: () => void;
		ontoggle: () => void;
		/** A long press on the fold icon takes the whole sheet with it. */
		onfoldall: () => void;
		onrename: (title: string) => void;
		ondelete: () => void;
		/** The same mark, on a group that still has something left to do. */
		onclear: () => void;
		/** Enter leaves the name and opens a task at the top of the group. */
		onaddtask: () => void;
		/**
		 * Where the group was let go: among its siblings, on one of the lists the
		 * switcher unfolds into, or on the corner. The header does not care which
		 * — it only knows the group is in hand and where the finger came up.
		 */
		ondrop: (drop: GroupDrop) => void;
	};

	let {
		title,
		seed,
		collapsed,
		count,
		open,
		done,
		finished,
		synthetic,
		total,
		naming,
		onnamed,
		ontoggle,
		onfoldall,
		onrename,
		ondelete,
		onclear,
		onaddtask,
		ondrop
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let field = $state<HTMLTextAreaElement | null>(null);
	/** Set for the length of the pop, so the group leaves rather than vanishes. */
	let going = $state(false);

	const lifted = $derived(drag.isLiftedGroup(seed));

	/*
	 * Literally the same mark as the one on every done task below it — one
	 * drawing from one seed, not a second scribble at the same size. See
	 * SCRIBBLE in draw/hand.
	 */
	const scribble = scribbleMark();

	/**
	 * What the mark in the gutter would do, or nothing at all.
	 *
	 * A group with everything done can go, tasks and all — that is what the mark
	 * has always meant here. A group with something still to do cannot, but its
	 * finished tasks can, and that is the same gesture on the same mark: get rid
	 * of what is finished with. Which of the two it is, is not a mode anybody
	 * sets; it is a reading of the group.
	 *
	 * Nothing done and something still to do means it would do neither, and then
	 * it is not drawn at all — the rule a task's own mark follows.
	 */
	const job = $derived(finished ? 'delete' : done > 0 ? 'clear' : null);

	/**
	 * And whether it is offered at all, which is a separate question.
	 *
	 * Two states put a group in hand rather than in a list: its name is open, or
	 * it is folded away. Both are somebody attending to this group and not to
	 * what is on the sheet — and it is there that a way to get rid of it belongs.
	 * Drawn on every expanded group with a done task in it, the sheet grows a
	 * column of live deletes down a list somebody is only reading.
	 */
	const mark = $derived(editing || collapsed ? job : null);

	/**
	 * What the icon holds between its brackets.
	 *
	 * Folded, the fraction — unless nothing in the group is done, when both
	 * halves of it are the same number and it says no more than the total does.
	 * Open, the ellipsis that means "there is more here" everywhere else on the
	 * sheet.
	 */
	const shown = $derived(!collapsed ? '…' : done > 0 ? `${open}/${count}` : `${count}`);

	/*
	 * A tap folds the group, two taps open its name — the same pair a task row
	 * offers, so the sheet answers a finger the same way wherever it lands.
	 *
	 * Optimistic, exactly as the row beside it is: the tap acts and the second
	 * one takes it back. It used to be held back for the double-tap window,
	 * on the reasoning that a whole list folding and unfolding is a worse
	 * flicker than a third of a second of lag — but the lag is what people
	 * actually notice, and they notice it most beside the icon two
	 * millimetres away, which has always answered at once. One control
	 * answering slower than its twin reads as the app being tired.
	 *
	 * The real `dblclick` still does the second tap, so nothing here depends
	 * on pairing two clicks by their timing.
	 *
	 * Holding the title opens the name too, and holding it longer picks the
	 * group up. Two taps was the only way to a rename, and two taps is a
	 * gesture you have to be told about, where a press is the thing a finger
	 * tries on anything it suspects of holding more. The icon beside the name
	 * folds on one tap, for anyone who would rather aim at it, and folds the
	 * whole sheet on a long press.
	 */
	function ontap(event?: MouseEvent) {
		if (synthetic || editing) return;

		/*
		 * Only the first click of a pair folds. The second is on its way to
		 * `dblclick`, which puts the fold back and opens the name — and a
		 * browser sends both clicks before it, so acting on the second as well
		 * would fold, unfold and fold again, leaving a group collapsed behind
		 * the field it had just opened.
		 *
		 * `detail` is the browser's own count of the run, which is exact. The
		 * obvious alternative — was this within `DOUBLE_TAP_MS` of the last one
		 * — is not: it cannot tell the second click of one pair from the first
		 * click of the next, and two deliberate double taps a tenth of a second
		 * apart are a thing a test does routinely and a finger does eventually.
		 * The row beside this one counts its own taps because it has to climb a
		 * ladder of them; there is no ladder here, only a pair.
		 *
		 * No event at all is the keyboard's way in, which is never a pair.
		 */
		if (event && event.detail > 1) return;

		tapped();
		ontoggle();
	}

	function onsecondtap() {
		if (synthetic) return;

		// The first tap of this pair folded it. Put that back before opening the
		// name, so a rename leaves the group as it found it.
		ontoggle();
		startEditing();
	}

	/**
	 * Set by a long press and eaten by the click that follows it.
	 *
	 * The icon stays a real button, because that is also how a keyboard folds a
	 * group — and a button releases a click whether or not the finger was held.
	 * The same swallow the drag does after a drop, for the same reason: the
	 * press has already done something, and the tap must not undo it.
	 */
	let pressed = false;

	function foldAll() {
		pressed = true;
		onfoldall();
	}

	function fold() {
		if (pressed) {
			pressed = false;
			return;
		}

		tapped();
		ontoggle();
	}

	function startEditing() {
		if (synthetic) return;
		draft = title;
		editing = true;
	}

	/*
	 * Asked for from outside — the empty row inside this group was backspaced
	 * away, and the name is where it came from.
	 *
	 * The caret goes to the end of the name rather than wherever autofocus
	 * leaves it: the writing carries on where it stopped, which is the same
	 * thing backspacing out of a row into the task above does.
	 */
	$effect(() => {
		if (!naming || editing || synthetic) return;

		startEditing();
		queueMicrotask(() => {
			field?.focus();
			field?.setSelectionRange(draft.length, draft.length);
		});
		onnamed();
	});

	function commit() {
		editing = false;
		if (draft.trim() !== title) {
			onrename(draft.trim());
			tapped();
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			// Committing here rather than through blur, so the row that opens next
			// is not closed again by the blur that would follow.
			commit();

			/*
			 * Enter means "and the next one" on a group with nothing in it yet:
			 * naming a group and then writing the first thing into it is one
			 * motion, and it is the only time the next thing is certainly a task.
			 *
			 * On a group that already has tasks it means no such thing. Somebody
			 * there has come to change the name, and Enter is how you say you are
			 * done with it — opening an empty row underneath put a caret in the
			 * middle of a list nobody was adding to, and closed it again on the
			 * next tap anywhere.
			 */
			if (count === 0) onaddtask();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			// The name goes back before the field does: taking a focused field out
			// of the document blurs it, and the blur commits. Escape discards.
			draft = title;
			editing = false;
		}
	}

	/*
	 * Removing a group takes its tasks with it, so it is offered only once there
	 * is nothing in it anyone is still waiting on. An empty group counts as
	 * finished — there is nothing to lose.
	 */
	const POP_MS = 180;

	/** The mark in the gutter, doing whichever of its two jobs this group asks. */
	function strike() {
		if (mark === null) return;
		taken();

		if (mark === 'clear') {
			// The group stays exactly where it is; only what is finished with
			// leaves it, so there is nothing here to pop.
			onclear();
			return;
		}

		editing = false;

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			ondelete();
			return;
		}

		// The whole group goes out with it, so the pop is on the header and the
		// delete waits for it — see TaskRow, which does the same on one row.
		going = true;
		setTimeout(ondelete, POP_MS);
	}
</script>

{#if synthetic}
	<!--
		Not a heading — a perforation across the paper, between what has a heading
		and what has lost one.

		Loose ends only ever appears because two phones disagreed: a group deleted
		on one while a task was moved into it on the other. Nothing under it was put
		there on purpose, so there is nothing here to name, rename, delete, carry,
		collapse or add to — and every one of those is something a title row offers
		just by looking like one. A line offers none of them, the total included:
		there is no group here to be the sum of.

		Drawn like every other line on the receipt and dashed like the landing rule,
		full width across the paper rather than the width of a word. It is still
		called what it is called, for anyone who cannot see it.
	-->
	<div class="perforation" role="separator" aria-label={title}>
		<Perforation {seed} />
	</div>
{:else}
	<!--
		Collapsed it reads (1/3) — what is still to do, out of what is hidden.
		The bare total answered the wrong question: a group is folded away
		because it is dealt with or because it is not yet, and how many tasks
		are under there says neither. Half done counts as still to do, because
		it is. Nothing done at all and the fraction says nothing either, since
		both halves are the same number, so it goes back to being a total.
		Expanded it reads (…), the same ellipsis an untitled group and the add
		row use for "there is more here".

		Round brackets, and Graphe draws them itself: they run from 20 above
		the baseline to 1 below against its figures' 19 above to 3 above, so
		they enclose what they hold and need no correcting. Square ones it has
		none of, so the platform substituted a face that sets them on the true
		baseline and they sat visibly low around the numbers — and the fix for
		that was a measured lift, which is a lot of machinery for a character
		the face has a proper answer to. This is not the markdown checkbox,
		which keeps its square brackets and its deliberate fallback.

		One tap folds this group and a long press folds every group on the
		sheet — the icon is the fold control, so more of the gesture belongs to
		it. The press is what makes a long list navigable; the tap is unchanged.

		The mousedown guard matters while editing — a mousedown on the icon
		there must not steal focus from the field, or the blur it causes
		commits the row out from under the tap — and costs nothing in the
		display state, where there is no field to blur.
	-->
	{#snippet foldIcon()}
		<button
			class="icon"
			type="button"
			onclick={fold}
			onmousedown={(event) => event.preventDefault()}
			use:longPress={{ onpress: foldAll }}
			aria-expanded={!collapsed}
			aria-label={collapsed ? t.group.expand : t.group.collapse}
		>
			<span aria-hidden="true">({shown})</span>
		</button>
	{/snippet}

	<div class="header" class:lifted class:going>
		{#if lifted}
			<!-- No shadow is available, so the lift is a dashed outline and a tilt. -->
			<HandRect seed={`liftgroup${seed}`} dashed wobble={1.2} />
		{/if}

		{#if editing}
			<!-- svelte-ignore a11y_autofocus -->
			<textarea
				class="title caps"
				rows="1"
				lang={langOf(draft)}
				bind:this={field}
				bind:value={draft}
				use:grow={draft}
				maxlength={LIMITS.groupTitle}
				aria-label={t.group.title}
				autofocus
				onblur={commit}
				{onkeydown}></textarea>
			{@render foldIcon()}
		{:else}
			<!--
				The name and the fold control share one inline flow rather than
				sitting in the header's own flex row, so the icon lands right after
				the last line of a wrapped title instead of floating beside the
				middle of the block. Two elements with nothing between them in the
				markup — the gap the eye reads is margin on the icon, not a text
				node.

				One tap folds the group and two open the name for changing. So does
				holding it briefly — two taps is a gesture you have to be told
				about — and holding it longer picks the group up, the same
				gesture that lifts a task, on the same kind of row. The icon
				still folds on one tap, for anyone who would rather aim at it,
				and folds every group on a press.
			-->
			<!--
				A span with a role rather than a real <button>: Chromium keeps a
				button's background as one box painted once at the bottom of the
				whole element, even set to `display: inline`, because a button
				stays a replaced control internally regardless of what its own
				CSS display says — the underline never picked up a second
				fragment for a second line. A span has no such box of its own to
				defend, so the same background genuinely repeats per line.
			-->
			<span class="title-wrap">
				<span
					class="title caps"
					class:untitled={title === ''}
					role="button"
					tabindex="0"
					lang={langOf(title)}
					aria-label={title === '' ? t.group.untitled : title}
					onclick={ontap}
					ondblclick={onsecondtap}
					onkeydown={(event) => {
						if (event.key === 'F2') startEditing();
						else if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							ontap();
						}
					}}
					use:dragGroup={{
						groupId: seed,
						enabled: !synthetic,
						onEdit: startEditing,
						onDrop: ondrop
					}}>{title === '' ? '…' : title}</span
				>{@render foldIcon()}
			</span>
		{/if}

		<!--
			What the group still costs. Done tasks are bought and do not count; half
			ones are still on the list and count in full. It stays while the group is
			collapsed, which is when it is worth most.
		-->
		{#if total !== null}
			<span class="num total">{total}</span>
		{/if}

		{#if mark !== null}
			<!--
				Out in the gutter, in the same column as the mark on every done task
				below it, and the same drawing: getting rid of what is finished with
				is one gesture and it is made in one place.

				It used to appear only while the name was being edited, and only ever
				deleted. Now it is there whenever it has something to do — which is
				what a done task's own mark does — and it clears the group's finished
				tasks while there is still something left to do, then removes the
				whole group once there is not.
			-->
			<button
				class="remove"
				type="button"
				onclick={strike}
				onmousedown={(event) => event.preventDefault()}
				aria-label={mark === 'delete' ? t.group.delete : t.group.clear}
			>
				<svg
					viewBox="0 0 {SCRIBBLE.w} {SCRIBBLE.h}"
					width={SCRIBBLE.w}
					height={SCRIBBLE.h}
					aria-hidden="true"
				>
					<path d={scribble} class="drawn" />
				</svg>
			</button>
		{/if}
	</div>
{/if}

<style>
	/*
	 * Full bleed: the sheet's own side padding is taken back off, so the line
	 * runs to the drawn edges of the paper the way a perforation does, rather
	 * than stopping short of them like a word would.
	 */
	.perforation {
		margin: 0.7rem calc(-1 * var(--paper-inset)) 0.9rem;
	}

	.header {
		position: relative;
		display: flex;
		/*
		 * On the title's last line, not on the middle of the block it makes.
		 *
		 * The icon flows inline after the last word, so a title that wraps puts
		 * it on the last line — while the total, a flex item of this row, was
		 * centred against the whole block and ended up beside the middle of a
		 * three-line name, on a different line from the icon it belongs beside.
		 * `last baseline` sits it on the same line as the words it is the sum
		 * of. It stays in the price column: this changes which line it is on,
		 * never which column.
		 */
		align-items: last baseline;
		gap: 0.25rem;
		min-height: var(--touch);
		/* The total lands over the prices, so it stops where they stop. */
		padding-right: var(--corner-ink);
		/*
		 * The icon is --touch tall and now sits inline with the title text
		 * rather than beside it as a separate flex item, so it sets the shared
		 * line's height — taller than the text's own. That leaves the row's
		 * own box, and so the row after it, sitting below where the
		 * underline actually is. TextRule's rule pulled itself up by the same
		 * kind of fixed amount for the same reason; this is that pull, moved
		 * here now that the underline has no element of its own to carry it.
		 * Measured in a browser, not derived — retune it with the face.
		 */
		margin-bottom: -0.5rem;
	}

	.lifted {
		transform: rotate(1.5deg);
	}

	/* Out, not away — the same swell a task leaves on. */
	.going {
		animation: pop 180ms ease-in forwards;
		pointer-events: none;
	}

	@keyframes pop {
		from {
			opacity: 1;
			scale: 1;
		}
		40% {
			opacity: 1;
			scale: 1.04;
		}
		to {
			opacity: 0;
			scale: 0.9;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lifted {
			transform: none;
		}

		.going {
			animation: none;
		}
	}

	/* Hyphenated where the word allows it — see `.text` in TaskRow. */
	.title {
		font-family: var(--hand);
		font-size: var(--size-title);
		text-align: left;
		overflow-wrap: anywhere;
		-webkit-hyphens: auto;
		hyphens: auto;
	}

	/*
	 * Genuinely inline: a plain inline box is fragmented per line by the box
	 * model, which is what lets this be underlined the same way a link is —
	 * the one other place in the app that needs a mark repeating per line
	 * box rather than a single measured <svg> re-drawn on every reflow.
	 * `<span>` rather than `<button>` for the same reason (see the markup
	 * comment above): a button keeps its background painted once, whatever
	 * its own `display` says.
	 *
	 * Never narrower than a touch target, because an untitled group is one
	 * ellipsis and that still has to be tappable.
	 */
	span.title {
		display: inline;
		min-width: var(--touch);
		cursor: pointer;
		background-image: var(--underline);
		background-repeat: repeat-x;
		background-position: 0 100%;
		background-size: 44px 6px;
		padding-bottom: 3px;
		/* The drag owns vertical movement here, as it does on a task row. */
		touch-action: pan-x;
		user-select: none;
		-webkit-user-select: none;
	}

	/*
	 * The title and the icon flow as one inline unit, so the icon lands
	 * right after the title's own last wrapped line. Blockified anyway once
	 * it is a flex item of .header — the point is what it does to its
	 * children, not to itself.
	 */
	.title-wrap {
		display: inline;
		flex: 0 1 auto;
		min-width: 0;
	}

	/*
	 * Typing a title should look like the title it becomes: same face, same
	 * size, same caps, and — a textarea rather than a single-line field — the
	 * same wrap. The uppercase is CSS only, so the value keeps whatever
	 * casing was typed and the markdown export does too.
	 */
	/* Typing needs the row, so the field takes it back while it is open. */
	textarea.title {
		flex: 1 1 auto;
		min-width: 0;
		outline: none;
		cursor: text;
		user-select: text;
		-webkit-user-select: text;
		resize: none;
		overflow: hidden;
		display: block;
		line-height: inherit;
	}

	.untitled {
		opacity: var(--faint);
	}

	/*
	 * Set at task size rather than title size: it belongs to the rows under it,
	 * not to the name beside it, and a second thing in title type would read as
	 * a second title.
	 *
	 * Pushed to the end of the row so it stands directly above the prices it is
	 * the sum of — which is the whole reason the icon moved up beside the name.
	 */
	.total {
		flex: 0 0 auto;
		margin-left: auto;
		font-size: var(--size-task);
		user-select: none;
		-webkit-user-select: none;
	}

	.icon {
		flex: 0 0 auto;
		min-width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--hand);
		font-size: var(--size-title);
	}

	/*
	 * Inside .title-wrap the icon is an inline sibling of the title text
	 * rather than a flex item, so .header's own `gap` never reaches it —
	 * this is what stands in for that gap there.
	 */
	.title-wrap .icon {
		margin-left: 0.25rem;
	}

	/*
	 * The same column every delete mark on the sheet stands in — see `--gutter` in
	 * app.css. Out of the row's flow, so the total keeps its place whether the
	 * name is being edited or not.
	 */
	.remove {
		position: absolute;
		right: calc(-1 * var(--gutter));
		width: var(--gutter);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/*
		 * Centred on the margin that can be seen, not on the box: the paper's
		 * visible edge is --edge-face inside its padding box.
		 */
		padding-right: var(--edge-face);
	}

	/*
	 * The mark alone steps in; the button does not, so the tap area stays out
	 * in the margin — see --mark-step.
	 */
	.remove svg {
		translate: calc(-1 * var(--mark-step)) 0;
	}
</style>
