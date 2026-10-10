<script lang="ts">
	import { untrack } from 'svelte';
	import Counter from './Counter.svelte';
	import HandRect from './HandRect.svelte';
	import TriCheckbox from './TriCheckbox.svelte';
	import { amountsIn, countLabel, format, measureLabel, type Style } from '$lib/doc/amount';
	import { fromEnd, offsetIn, spotAt } from '$lib/doc/caret';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { hasLink, pieces } from '$lib/doc/links';
	import { spill, splitAt } from '$lib/doc/spill';
	import type { State, Task } from '$lib/doc/types';
	import { handScribble, SCRIBBLE } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, dragRow, type DropTarget } from '$lib/dnd/drag.svelte';
	import { DOUBLE_TAP_MS } from '$lib/dnd/longpress';
	import { swipeRow } from '$lib/dnd/swipe';
	import { finished, taken } from '$lib/feel';
	import { t } from '$lib/i18n';
	import { grow } from '$lib/grow';

	type Props = {
		task: Task;
		groupId: string;
		/** How this group writes its numbers, so this row writes them the same way. */
		style: Style | null;
		/** Asked for by the sheet: open this row's editor. */
		open: boolean;
		/** And put the caret here rather than at the end — see `onjoin`. */
		openAt: number | null;
		onstate: (state: State) => void;
		onedit: (text: string) => void;
		ondelete: () => void;
		/**
		 * Enter leaves the task and opens a fresh row — and so does running past
		 * the row's limit, which hands the new row what would not fit.
		 *
		 * `carried` is what comes down with it. `above` puts the fresh row on
		 * the other side, which is where a caret at the very start of a task
		 * asks for it. `atStart` leaves the caret at the front of what was
		 * carried rather than behind it: Enter in the middle of a line puts the
		 * caret at the head of the new line, where a row that has simply run out
		 * of room is still being typed at the end.
		 */
		onsplit: (next?: { carried?: string; above?: boolean; atStart?: boolean }) => void;
		/** Backspace on an emptied row: it goes, and the one above opens. */
		onback: () => void;
		/**
		 * Backspace at the very start of a row that still has something in it:
		 * the two tasks become one. Answers false when they will not fit, and
		 * then nothing happens at all — which is what backspace at the start of
		 * anything does when there is nowhere for it to go.
		 */
		onjoin: (text: string) => boolean;
		onopened: () => void;
		onmove: (direction: -1 | 1) => void;
		ondrop: (target: DropTarget) => void;
		onEnterGroup: (groupId: string) => void;
	};

	let {
		task,
		groupId,
		style,
		open,
		openAt,
		onstate,
		onedit,
		ondelete,
		onsplit,
		onback,
		onjoin,
		onopened,
		onmove,
		ondrop,
		onEnterGroup
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLTextAreaElement | null>(null);
	/** Set for the length of the pop, so the row leaves rather than vanishes. */
	let going = $state(false);
	let row = $state<HTMLLIElement | null>(null);
	/** How far the hand has pulled this row leftwards, in pixels. */
	let pull = $state(0);
	/** Set while the row is going back to where it was, and cleared by it. */
	let homing = $state(false);

	const lifted = $derived(drag.isLifted(task.id));

	/*
	 * The count at the front and the price at the back, read on the way to the
	 * screen and never written down — the text is one string and stays one.
	 *
	 * A row with neither is left exactly as it was: a text node in a button.
	 * Only a row that has something of its own to set apart becomes cells, so
	 * nothing about an ordinary list moves.
	 *
	 * The count is not a column. It sits in front of the words like the word it
	 * stands in for, and a row without one starts where its words start —
	 * reserving the space on every row indented half a list to line up numbers
	 * most of it does not have.
	 */
	const reading = $derived(amountsIn(task.text));
	const shaped = $derived(reading.amount !== null || reading.cost !== null);

	/*
	 * Whether this row has to give up being a button.
	 *
	 * Only a task naming an address does: a button cannot hold a link, and a
	 * link nobody can follow is not one. Every other row stays exactly what it
	 * was, keeps its accessible name, and keeps its place in the tab order —
	 * which is nearly every row, so nearly nothing changes.
	 */
	const linked = $derived(hasLink(task.text));

	/*
	 * The words as they are drawn, split from the words as they are stored.
	 * Read once here rather than in the markup and again for the caret, so the
	 * two are certainly the same list in the same order — which is what lets a
	 * point on the screen be found by walking the rendered children in step.
	 */
	const parts = $derived(pieces(shaped ? reading.name : task.text));

	/*
	 * Written out the way the group writes numbers rather than the way this line
	 * happened to be typed, so one column does not read `5,08`, `20.00` and `10`
	 * down its length. The stored text keeps every character of what was typed.
	 */
	const count = $derived(
		reading.measure !== null
			? measureLabel(reading.measure, style, reading.from)
			: reading.count === null
				? null
				: countLabel(reading.count, style, reading.from)
	);
	const cost = $derived(
		reading.money === null || style === null ? null : format(reading.money.cents, style)
	);
	/*
	 * Something scribbled out, not a ✕, and the same one everywhere.
	 *
	 * The ✕ here was the checkbox's own two strokes at half the size, a few
	 * millimetres from them — one gesture meaning finished and the same gesture
	 * meaning gone. Crossing a thing out is what a hand does to a line it wants
	 * rid of, and it is the only mark on the sheet drawn that way.
	 *
	 * Drawn from the mark's own name rather than this task's, so every delete
	 * mark on the sheet is one drawing rather than forty scribbles that happen
	 * to mean the same thing — see SCRIBBLE in draw/hand. It stands as tall as
	 * the checkbox at the other end of the row and no wider than the margin it
	 * stands in, which is what makes it an S struck through.
	 */
	const scribble = handScribble(SCRIBBLE.w, SCRIBBLE.h, {
		seed: seedFrom(SCRIBBLE.seed),
		wobble: 0.7
	});

	/*
	 * Negative infinity, not zero: `performance.now()` counts from the page
	 * loading, so a zero would make every tap in the first third of a second
	 * after load read as the second half of a double tap.
	 */
	let lastTap = -Infinity;
	/**
	 * How far up the ladder the finger has got, within the window.
	 *
	 * Nought means this run cannot climb at all — it began somewhere that
	 * plainly meant edit, and every tap of it is an edit.
	 */
	let taps = 0;
	/** The state to come back to when a tap turns out to be part of a run. */
	let beforeTap: State = untrack(() => task.state);

	/**
	 * How near the end of the words a tap can land and still plainly mean edit.
	 *
	 * Somebody reaching into the last few characters of a task is reaching for
	 * the end of it — to add to it, or to press Enter and start the next thing
	 * there. A run of taps that begins in that stretch never climbs the ladder,
	 * so tapping there twice by accident cannot tick the task off.
	 *
	 * Small: it is the end of the writing, not the last word.
	 */
	const EDIT_ZONE = 3;

	/**
	 * One tap opens the task, two mark it done, three mark it half.
	 *
	 * The tap that opens it is the common one — a list is read far more often
	 * than it is ticked in one go, and the row already has a checkbox beside it
	 * whose whole job is the tick. So the words answer the thing the words are
	 * for, and the ladder climbs from there.
	 *
	 * Taps two and three land on the textarea that tap one opened, not on the
	 * button they started on. The count therefore has to live out here in the
	 * component rather than on either element, and the handler is bound to both
	 * — the finger has not moved and does not know the element under it has.
	 *
	 * Optimistic, as the checkbox beside it is: each tap acts and the next takes
	 * it back. Holding every tap for a third of a second to see whether another
	 * is coming would put that lag on every single one of them.
	 */
	function ontap(event: MouseEvent) {
		// A link is its own business; tapping one goes where it says.
		if ((event.target as HTMLElement).closest('a')) return;

		const now = performance.now();
		const within = now - lastTap < DOUBLE_TAP_MS;
		lastTap = now;

		if (within) {
			climb();
			return;
		}

		// A fresh run, and where it begins decides what it is allowed to become.
		beforeTap = task.state;

		/*
		 * Begun inside the open field rather than on the words: this is somebody
		 * placing a caret, or double-tapping to select a word, and neither is a
		 * tick. The run is disarmed and the browser is left to do what a tap in
		 * a text field does — which also means the caret is not dragged to the
		 * end by the `startEditing` below.
		 */
		if (editing) {
			taps = 0;
			return;
		}

		const at = placeFrom(event);
		startEditing(at);
	}

	/** The second and third taps of a run that is allowed to have them. */
	function climb() {
		// Disarmed: this run began where a tap plainly meant edit.
		if (taps === 0) return;

		taps += 1;

		if (taps === 2) {
			closeWithoutCommitting();
			onstate('done');
		} else if (taps === 3) {
			onstate('half');
		} else {
			/*
			 * Past three a run has stopped meaning anything, so it goes back to
			 * where it started and becomes an edit again — which is the rung the
			 * ladder begins on.
			 */
			onstate(beforeTap);
			taps = 0;
			startEditing();
		}
	}

	/**
	 * Where in the task a tap landed, arming the run or disarming it.
	 *
	 * Null for a tap the row cannot place — a browser with neither caret API, or
	 * a point in nothing the row drew — and the caret then goes to the end,
	 * which is where it always used to go.
	 */
	function placeFrom(event: MouseEvent): number | null {
		taps = 1;

		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return null;

		const spot = spotAt(event.clientX, event.clientY);
		if (!spot) return null;

		/*
		 * The words are drawn inside `.name` on a row that has a count or a
		 * price and directly in the row's own element otherwise, and only the
		 * words go through `pieces` — so the offset is read against the element
		 * the pieces were rendered into, and then carried past whatever the
		 * count took off the front.
		 */
		const drawn = target.querySelector<HTMLElement>('.name') ?? target;
		const into = offsetIn(drawn, spot, parts);
		if (into === null) return null;

		// In the last few characters: this run is an edit and stays one.
		if (fromEnd(parts, into) <= EDIT_ZONE) taps = 0;

		return into + (shaped ? reading.nameAt : 0);
	}

	/**
	 * Out of the editor without writing anything.
	 *
	 * The second tap of a run marks the task done, and the field it lands on was
	 * opened by the first tap a moment earlier with nothing typed into it. Its
	 * blur would commit — harmlessly, since the draft is still the task's own
	 * text — but only by luck, and the field has to be gone before the state
	 * changes either way.
	 */
	function closeWithoutCommitting() {
		draft = task.text;
		editing = false;
	}

	/*
	 * The caret goes with the tap. Without this the button is swapped for an
	 * unfocused input, which never blurs, so the row never commits and never
	 * leaves edit mode — it simply sits there showing the raw string, which
	 * looks for all the world like the count and the price being lost.
	 *
	 * Where the finger landed, rather than at the end: a person reaching into
	 * the middle of a sentence is reaching for the middle of it, and this is the
	 * row that Enter now splits at the caret. `at` is null when the point cannot
	 * be placed — no caret API, or a tap on nothing the row drew — and the end
	 * is then both the old behaviour and the right one, since it is also what a
	 * backspace out of the row beneath expects to find.
	 */
	function startEditing(at: number | null = null) {
		draft = task.text;
		editing = true;

		const caret = at === null ? draft.length : Math.min(at, draft.length);

		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(caret, caret);
		});
	}

	/*
	 * Asked for from outside — the row beneath was backspaced away, or joined
	 * onto the end of this one, and `openAt` is then the seam rather than the
	 * end of the words.
	 */
	$effect(() => {
		if (!open || editing) return;
		startEditing(openAt);
		onopened();
	});

	function commit() {
		editing = false;
		const next = draft.trim();
		if (next !== '' && next !== task.text) onedit(next);
	}

	/*
	 * A row that has run out of room fills up and the rest starts the next one,
	 * the way a line fills up and the next word goes to the next line.
	 *
	 * It used to be `maxlength`, which on a phone is indistinguishable from the
	 * keyboard having died: the row simply stopped taking characters, in the
	 * middle of a sentence, with nothing said. Nothing is refused here and
	 * nothing is lost — the writing carries on one row down, with the caret,
	 * and the word that was being typed goes with it whole.
	 *
	 * Checked on input rather than on the key, so a paste spills by the same
	 * rule as typing does.
	 */
	function oninput() {
		const over = spill(draft, LIMITS.taskText);
		if (over === null) return;

		draft = over.head;
		commit();
		// Still being typed, so the caret goes behind what came down rather than
		// in front of it: the next character belongs after the last one.
		onsplit({ carried: over.tail });
	}

	/**
	 * Enter means "and the next one", and it now means it from where the caret
	 * is rather than only from the end.
	 *
	 * What is in front of the caret goes down to the row that opens beneath, the
	 * way Enter behaves in the middle of a line of writing anywhere else. It
	 * used to open an empty row wherever the caret stood, so splitting a task in
	 * two meant retyping the second half — and the row already knew how to carry
	 * text down, because running past the limit does exactly this (see
	 * `oninput`, and doc/spill.ts, which both cuts are named in).
	 *
	 * A caret at the very start is the one place this does nothing: the head
	 * would be empty, a task may not be, and pushing the whole text down would
	 * leave a blank row above it. The task stays whole and an empty row opens
	 * beneath, which is what Enter has always done here.
	 */
	function onsplitHere(field: HTMLTextAreaElement) {
		/*
		 * A caret truly at the start, and not a selection that merely begins
		 * there. Double-tapping a word selects it, which is somebody about to
		 * replace it — nothing like asking for a line above it — and both come
		 * back from `splitAt` with an empty head.
		 */
		const atStart = field.selectionStart === 0 && field.selectionEnd === 0;
		const { head, tail } = splitAt(draft, field.selectionStart, field.selectionEnd);

		/*
		 * Nothing behind the caret: the fresh row opens *above* this one instead,
		 * and the task keeps every character it had.
		 *
		 * Which is what Enter at the start of a line does anywhere else — the
		 * writing goes down a line and an empty one opens over it, with the
		 * caret. It used to open the empty row underneath, which is the same
		 * two rows in the other order and reads as the task staying put while
		 * something appears below it.
		 *
		 * Nothing moves in the document, either. The task is not rewritten and
		 * not restamped: an empty draft is simply drawn before it, which is a
		 * thing only a draft can be, since a task may not be empty.
		 */
		if (head.trim() === '') {
			commit();
			onsplit(atStart ? { above: true } : undefined);
			return;
		}

		draft = head;
		// Commit first: the blur handler would otherwise fire after the new row
		// is asked for and close it again.
		commit();
		onsplit({ carried: tail === '' ? undefined : tail, atStart: true });
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			onsplitHere(event.currentTarget as HTMLTextAreaElement);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			/*
			 * Put the text back before the field goes, because taking a focused
			 * field out of the document blurs it and the blur commits. Escape
			 * meant nothing while the field was never focused; now that it is,
			 * it has to actually discard.
			 */
			draft = task.text;
			editing = false;
		} else if (event.key === 'Backspace') {
			onbackspace(event);
		}
	}

	/**
	 * Backspace with nothing to delete in front of the caret.
	 *
	 * Two ways for that to be true, and they are the same idea at two lengths.
	 * An emptied row has nothing left at all: it goes, and the caret carries on
	 * at the end of the task above. A row with the caret at its very start has
	 * nothing *behind* the caret: the row joins onto the end of the one above
	 * and the caret waits at the seam, which is what backspace does at the
	 * start of a line in anything else that takes writing.
	 *
	 * The join is refused, and the key left to do nothing, when the two would
	 * not fit in one task — a row that filled up and spilled cannot be poured
	 * back into the row it came from.
	 */
	function onbackspace(event: KeyboardEvent) {
		const field = event.currentTarget as HTMLTextAreaElement;

		if (draft === '') {
			event.preventDefault();
			editing = false;
			onback();
			return;
		}

		if (field.selectionStart !== 0 || field.selectionEnd !== 0) return;

		event.preventDefault();
		if (!onjoin(draft)) return;

		// The row is about to go; the field must not commit on its way out.
		draft = task.text;
		editing = false;
	}

	/*
	 * A tick is the end of something, so the row goes out with a small pop
	 * rather than simply ceasing to be there. The delete waits for the animation
	 * so the row is still on the sheet while it plays; reduced motion skips
	 * straight to the deletion.
	 */
	const POP_MS = 180;

	function pop() {
		taken();

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			ondelete();
			return;
		}

		going = true;
		setTimeout(ondelete, POP_MS);
	}

	/*
	 * The row pulled leftwards, towards the box at the head of it.
	 *
	 * One pull ticks it off and the next takes it away — the same two things
	 * that stand at the two ends of a done row, reached from anywhere along it
	 * without having to aim at either. A half-done row is finished off, since
	 * that is what the box beside it does too.
	 *
	 * The second pull is offered on exactly the rows the delete mark is, and for
	 * the same reason: getting rid of a task is earned by the task being
	 * finished with. It does not stand in for that mark, which is still there
	 * through both pulls — this is the way to it for a hand already moving, and
	 * that is the way to it for one that is not.
	 *
	 * It goes out the way the mark sends it out, so the pop, the answer from the
	 * phone and the message with the way back are the delete that was already
	 * here rather than a second one written beside it.
	 *
	 * The buzz is the whole of what says either landed — it happens under a
	 * finger that is still moving, with nothing on the screen where the finger
	 * is to report it.
	 */
	function pulled() {
		if (task.state === 'done') {
			pop();
			return;
		}

		finished();
		onstate('done');
	}

	/*
	 * Written through the CSSOM rather than with a `style:` directive, because
	 * the sheet is prerendered and Svelte renders one as a literal `style="…"`
	 * attribute in the shipped HTML — which `style-src 'self'` refuses. The same
	 * route the paper's own angle takes, and what e2e/csp.e2e.ts is watching for.
	 */
	$effect(() => {
		row?.style.setProperty('--pull', `${pull}px`);
	});

	/*
	 * The row swings back to where it was, which is the paper's own answer to a
	 * drag that is over — see `.settling` on the sheet.
	 *
	 * Asked here rather than left to the stylesheet: `homing` is cleared by the
	 * animation ending, so a swing that were merely instant would never end and
	 * the row would stay out of place for good.
	 */
	function home() {
		/*
		 * Already on its way out, because the pull that just landed was the one
		 * that takes a done row away. It pops from where the hand left it: two
		 * animations on one element is one of them winning by the order they
		 * happen to be written in, and a row swinging back into place while it
		 * is being deleted is the wrong one to win.
		 */
		if (going) return;

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			pull = 0;
			return;
		}

		homing = true;
	}

	/*
	 * The swing home ending, and nothing else that ends on this row. The sparkle
	 * a tick throws out is drawn inside the checkbox and bubbles up through
	 * here, and the pop of a row on its way out ends here too — clearing the
	 * pull on that one would stand the row back up for the frame before it goes.
	 */
	function settled(event: AnimationEvent) {
		if (event.target !== row || !homing) return;

		homing = false;
		pull = 0;
	}

	function onrowkeydown(event: KeyboardEvent) {
		// The keyboard's way in, now that the words are no longer a button. The
		// same key that opens a group title for renaming.
		if (event.key === 'F2' && !editing) {
			event.preventDefault();
			startEditing();
			return;
		}

		if (!event.altKey) return;
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			onmove(-1);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			onmove(1);
		}
	}
</script>

{#snippet marks()}
	{#if shaped}
		{#if count !== null}
			<span class="num amount">{count}</span>
		{/if}
		<span class="name">{@render written()}</span>
		{#if cost !== null}
			<span class="num cost">{cost}</span>
		{/if}
	{:else}
		{@render written()}
	{/if}
{/snippet}

{#snippet written()}
	<!--
		The words, with any address in them shown as what it points at rather
		than as every character of how to get there. The text itself is
		untouched: this is a reading on the way to the screen, like the count
		and the price, and the export and what merge sees keep the whole URL.
	-->
	{#each parts as piece, at (at)}
		{#if piece.kind === 'link'}
			<!--
				Never an app route: `links.ts` allows three schemes and every one of
				them is absolute and off this origin, so there is nothing here for
				resolve() to resolve.

				Always a new tab, and never carrying anything with it. The list is
				held in this tab and lives on a key in this browser — navigating it
				away to follow a link written by whoever else is on the list is not
				a thing to make easy. `noopener` denies the opened page a handle on
				this one, `noreferrer` stops it being told where the visitor came
				from, and `nofollow` says this is somebody's shopping list rather
				than an endorsement.
			-->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				data-piece={at}
				href={piece.href}
				target="_blank"
				rel="noopener noreferrer nofollow"
				onclick={(event) => event.stopPropagation()}
			>
				{piece.label}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{:else}
			<!--
				A span around plain words, which they did not use to need.

				It carries which piece this is, so a tap can be traced from the
				node the browser reports back to a place in the task's own text.
				Counting the children instead would work only until a row had two
				pieces: an `{#each}` puts anchor comments among its output, so the
				nth child is not the nth piece. Inline, so nothing about how the
				words wrap or where they break changes.
			-->
			<span data-piece={at}>{piece.text}</span>
		{/if}
	{/each}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<li
	class="row"
	class:lifted
	class:going
	class:pulling={pull > 0 && !homing}
	class:homing
	data-task={task.id}
	bind:this={row}
	onkeydown={onrowkeydown}
	onanimationend={settled}
>
	{#if lifted}
		<!-- No shadow is available, so the lift is a dashed outline and a tilt. -->
		<HandRect seed={`lift${task.id}`} dashed wobble={1.2} />
	{/if}

	<Counter {draft} open={editing} />

	<TriCheckbox state={task.state} label={task.text} seed={task.id} onchange={onstate} />

	{#if editing}
		<!--
			A textarea, so a task that is drawn over two lines is edited over two
			lines. Tasks are still one string: `clean` turns any newline into a
			space at the boundary, and Enter never reaches the field as one.
		-->
		<!--
			The tap handler is on the field too, and that is the whole of what
			makes the ladder work. The second tap of a run lands here rather than
			on the button it started on — the first tap swapped one for the other
			under a finger that has not moved — so the field has to answer a tap
			the same way the words did. It never calls preventDefault, or the
			field would stop taking a caret from the tap that opened it.
		-->
		<textarea
			class="text caps"
			rows="1"
			lang={langOf(draft)}
			bind:this={input}
			bind:value={draft}
			onblur={commit}
			onclick={ontap}
			{oninput}
			{onkeydown}
			use:grow={draft}></textarea>
	{:else if linked}
		<!--
			A task that names an address is the one that cannot be a button, since
			a button cannot hold a link. It is a plain container instead, and what
			it gives up is only the keyboard's way in — which the row still has,
			on F2, and the checkbox still has for ticking. Nothing is unreachable.

			The handlers stay on the row: this element is not focusable and never
			will be, so a key handler here could not fire.
		-->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="text caps"
			class:shaped
			lang={langOf(task.text)}
			onclick={ontap}
			use:dragRow={{ taskId: task.id, groupId, onDrop: ondrop, onEnterGroup }}
			use:swipeRow={{ onpull: (px) => (pull = px), ontick: pulled, onhome: home }}
		>
			{@render marks()}
		</div>
	{:else}
		<!-- Everything right of the checkbox is drag territory. -->
		<!--
			A tap here ticks the task off and two taps open it — the button is
			named for the task and does the thing the task is for.

			The label is set explicitly because Chrome folds text-transform into
			the accessible name, and a screen reader should read what was written
			rather than shouting it.
		-->
		<button
			class="text caps"
			class:shaped
			type="button"
			lang={langOf(task.text)}
			aria-label={task.text}
			onclick={ontap}
			use:dragRow={{ taskId: task.id, groupId, onDrop: ondrop, onEnterGroup }}
			use:swipeRow={{ onpull: (px) => (pull = px), ontick: pulled, onhome: home }}
		>
			{@render marks()}
		</button>
	{/if}

	<!--
		A done task offers its own way out, and only a done task.
		
		It used to appear on focus or hover as well, which put a live delete
		button beside every row a finger passed over — and left it sitting there
		after a task was un-ticked, because the pointer had not moved away yet.
		Removing something is for things that are finished with.
	-->
	{#if task.state === 'done' && !editing && !drag.dragging}
		<button class="remove" type="button" onclick={pop} aria-label={t.task.delete}>
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
</li>

<style>
	/*
	 * Top-aligned, not centred.
	 *
	 * A task that wraps is still one task with one box, and the box belongs
	 * beside the line the task starts on — centred against the whole block it
	 * drifts down the page as the words do, until on three lines it is sitting
	 * beside the middle of a sentence with nothing to do with it.
	 *
	 * A one-line row looks exactly as it did: the box is a --touch square with
	 * its mark in the middle, and `.text` below pads its first line to the same
	 * middle, so the two agree on one line and go on agreeing on four.
	 */
	.row {
		position: relative;
		display: flex;
		font-size: var(--size-task);
		align-items: flex-start;
		gap: 0.25rem;
		min-height: var(--touch);
		list-style: none;
		/*
		 * The room the checkbox used to take as a flex item, now that it is
		 * positioned against this row instead — see `.box` in TriCheckbox, which
		 * reaches wider than its own mark. Exactly the target plus the gap that
		 * followed it, so the words start where they have always started.
		 */
		padding-left: calc(var(--touch) + 0.25rem);
		/*
		 * The price column ends level with the ink of the buttons in the corner
		 * above it, not with their boxes — see --corner-ink. It is out of the
		 * mark's way for free: it is positioned against this row's border box,
		 * which padding does not move, so the margin beyond the figures widens
		 * by exactly this much.
		 */
		padding-right: var(--corner-ink);
	}

	.lifted {
		transform: rotate(1.5deg);
	}

	/*
	 * The row giving under a hand pulling it towards its own checkbox.
	 *
	 * A `translate` rather than part of a transform, so it composes with the
	 * tilt a lift puts on the row without either having to know about the other
	 * — the same arrangement the paper uses for its slide.
	 *
	 * How far it may go is stated here rather than in the hand that pushes it,
	 * because it is a fact about the paper: the row stops where the margin the
	 * writing is held off the drawn edge by runs out, which is exactly the
	 * column every delete mark stands in. The hand goes on past that, and the
	 * rest of the pull is spent against a row that has nowhere left to go —
	 * which is what pushing a sheet that is already against something feels
	 * like, and what the tick then lands out of.
	 */
	.pulling {
		translate: calc(-1 * min(var(--pull, 0px), var(--paper-inset))) 0;
	}

	/*
	 * And coming back, which is the paper's own answer to a drag that is over.
	 * It reads `--pull` for its first frame, so there is no jump between the
	 * hand and the animation.
	 */
	.homing {
		animation: home var(--flip) var(--inertia) forwards;
	}

	@keyframes home {
		from {
			translate: calc(-1 * min(var(--pull, 0px), var(--paper-inset))) 0;
		}
		to {
			translate: 0 0;
		}
	}

	/* Out, not away: a short swell and then nothing. */
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

		/*
		 * Not `none`: `homing` is cleared by this animation ending, and a swing
		 * with nothing to end would leave the row standing out of place. The
		 * component never sets the class under reduced motion — this is only
		 * here so the global clamp cannot be the thing relied on.
		 */
		.homing {
			animation-duration: 1ms;
		}
	}

	.text {
		flex: 1 1 auto;
		min-width: 0;
		text-align: left;
		cursor: text;
		/*
		 * The page scrolls under a finger that starts on a task.
		 *
		 * This was `pan-x`, which told the browser the one direction it may not
		 * take is the one the page scrolls in — so a drag that began on any row
		 * (which is most of the sheet) moved nothing at all. The lift does not
		 * need the declaration: it only arms after the finger has held still
		 * for the press, and by then no scroll has begun, so the non-passive
		 * `touchmove` in dnd/drag can still call preventDefault and take the
		 * gesture over. Browsers latch touch-action at the start of a gesture,
		 * which is exactly why the block has to come from the handler and not
		 * from here.
		 */
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		/*
		 * Broken at a syllable with a hyphen where the word allows it, and only
		 * mid-letter where it does not: `anywhere` alone cut words wherever the
		 * column happened to run out, which on a narrow phone is most long
		 * words. The two compose — the browser takes a hyphenation point first
		 * and falls back to `anywhere` for what it cannot hyphenate.
		 *
		 * `<html lang="en">` is what tells it which dictionary to read; text
		 * marked Greek by `langOf` uses Greek's, or none if the browser has
		 * none, and wraps as it always did.
		 */
		overflow-wrap: anywhere;
		-webkit-hyphens: auto;
		hyphens: auto;
		/*
		 * The first line centred on the box beside it, whatever comes after.
		 * `1lh` is this element's own line box, so it follows --size-task and
		 * the face without being told either.
		 */
		padding-top: calc((var(--touch) - 1lh) / 2);
		padding-bottom: calc((var(--touch) - 1lh) / 2);
	}

	textarea.text {
		outline: none;
		touch-action: auto;
		user-select: text;
		-webkit-user-select: text;
		/* Sized by the grow action; never by a corner the user drags. */
		resize: none;
		overflow: hidden;
		/* A textarea is inline-block by default and sits on the text baseline. */
		display: block;
		line-height: inherit;
	}

	/*
	 * Three cells rather than a line of words, and only once there is something
	 * to line up. Baselines rather than boxes: the figures are set in a
	 * different face from the words beside them, and the baseline is what the
	 * two share.
	 */
	.text.shaped {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	/*
	 * `break-word` here, not the `anywhere` the plain row uses. They break the
	 * same words; the difference is that `anywhere` also shrinks the element's
	 * min-content width to one character, and a flex item sized from that gives
	 * the words a column two letters wide while the price sits in daylight.
	 */
	.name {
		flex: 1 1 auto;
		min-width: 0;
		overflow-wrap: break-word;
	}

	/* As wide as the count is, and no wider: it is a word, not a column. */
	.amount {
		flex: 0 0 auto;
	}

	/* Last in the row, so the prices end level down the right-hand edge. */
	.cost {
		flex: 0 0 auto;
	}

	/*
	 * Out in the sheet's own padding, and out of the row's flow.
	 *
	 * At the end of the row it took its width from the line, which shortened the
	 * price column on exactly the rows that were done — the column stopped being
	 * a column the moment anything was ticked. Here nothing moves when it
	 * appears, and it stands in the same place as the group's mark above it.
	 *
	 * It ends short of the page's own padding, so it never pushes the sheet
	 * sideways, and it starts at the row's edge, so it never covers the price
	 * beside it — tapping a price still opens the row.
	 */
	.remove {
		position: absolute;
		right: calc(-1 * var(--gutter));
		/*
		 * On the first line, beside the box — a task that wraps keeps its mark
		 * where the row starts rather than letting it slide down beside the
		 * middle of a sentence. The same reason the box is top-aligned.
		 */
		top: 0;
		width: var(--gutter);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/*
		 * Centred on the margin that can be seen, not on the box: the paper's
		 * visible edge is --edge-face inside its padding box, and measuring to
		 * the stroke's centre instead left the mark crowding the line.
		 */
		padding-right: var(--edge-face);
	}

	/*
	 * The mark alone steps in; the button does not. Translated rather than laid
	 * out, so the tap area stays out in the margin and the end of a price still
	 * belongs to the row — see --mark-step.
	 *
	 * It lifts by --cap-lift for the same reason the checkbox at the other end
	 * of the row does: both are centred in a --touch box that starts at the top
	 * of the row, but the checkbox is then lifted to sit level with the
	 * capitals, so a ✕ left on the box's own middle sat a few pixels below it.
	 * Two marks at either end of one line have to agree on where that line is.
	 */
	.remove svg {
		translate: calc(-1 * var(--mark-step)) calc(-1 * var(--cap-lift));
	}
</style>
