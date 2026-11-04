import type { Action } from 'svelte/action';
import { buzz, LIFT_MS, LONG_PRESS_MS } from './longpress';

/**
 * Long-press the row text and drag. No handle.
 *
 * The checkbox keeps its own long-press for half-done, so the two gestures are
 * separated by hit area rather than by timing: a press that starts on the
 * checkbox never becomes a drag, and a press that starts on the text never
 * changes state. This action is only ever attached to the text.
 */

export type DropTarget = { groupId: string; index: number };

/**
 * Not a group — the row that offers to make one.
 *
 * A task carried onto it lands in a group that does not exist yet, so the drop
 * makes one and puts it there. It is a group id in the shape of the answer
 * rather than a second kind of target, because everything between here and the
 * drop already speaks in group ids.
 */
export const NEW_GROUP = '__newgroup__';

/**
 * Not a list — the row that offers to make one.
 *
 * The same shape as `NEW_GROUP` one level up, and for the same reason:
 * everything between the hit test and the drop already speaks in list ids, and
 * a second kind of target would have to be carried through every one of them.
 */
export const NEW_LIST = '__newlist__';

/**
 * Where a group being carried would land.
 *
 * Three answers rather than one, because the corner answers for a group too. A
 * place among its siblings is the one this has always had; a list is the
 * switcher, which unfolds into the lists this group could go to while one is in
 * hand; the fold is the paper's own turned-down corner, which takes it away.
 *
 * A discriminated union rather than a bare index, so nothing can read a corner
 * drop as a position — the landing rule between two groups is drawn off the
 * same field, and an index is exactly what it would have found there.
 */
export type GroupDrop =
	| { kind: 'order'; index: number }
	| { kind: 'switcher' }
	| { kind: 'list'; listId: string }
	| { kind: 'fold' };

const EDGE = 60;
const EDGE_SPEED = 12;

export class DragState {
	/** The task currently lifted, if any. */
	taskId = $state<string | null>(null);
	target = $state<DropTarget | null>(null);
	/**
	 * Where the lifted thing came from, so the places that would put it back
	 * exactly there can offer nothing.
	 *
	 * A landing rule drawn immediately above or immediately below the row being
	 * carried is a landing rule for the place it already occupies: letting go on
	 * either changes nothing, and the sheet spends most of a short drag showing
	 * two of them. Read once at the lift rather than derived, because the list
	 * moves under the finger as groups expand.
	 */
	from = $state<DropTarget | null>(null);

	/**
	 * The paper is turning, and nothing may be picked up off it while it is.
	 *
	 * A lift takes most of a second and the turn takes about the same, so a
	 * press held through a swipe came up holding a row of a sheet that was
	 * edge-on or already face down — and the hit test it then steered by was
	 * reading boxes off a page mid-rotation. Set by the page, which is the only
	 * thing that knows the paper is moving; asked at the press, because that is
	 * where a gesture can still be refused without taking anything back.
	 */
	turning = $state(false);

	/**
	 * A row is being pulled sideways to be ticked off, and the paper must hold
	 * still under it.
	 *
	 * The same arrangement as `turning`, the other way round. A pull and a turn
	 * are one movement of the hand told apart by which way it goes, and on a row
	 * that draws a link they begin on the same element — the words are a plain
	 * container there rather than a button, so they are not among the controls
	 * the turn already stands aside for. Without this, a pull that wandered back
	 * rightwards would start turning the paper out from under the row it was
	 * still holding.
	 *
	 * Not cleared by `reset`: that is called on every release, this one's
	 * included, and the pull owns it from the first move to the last.
	 */
	swiping = $state(false);

	/** The group currently lifted, if any. Never both at once. */
	groupId = $state<string | null>(null);
	groupTarget = $state<GroupDrop | null>(null);
	groupFrom = $state<number | null>(null);

	get dragging(): boolean {
		return this.taskId !== null || this.groupId !== null;
	}

	isLifted(taskId: string): boolean {
		return this.taskId === taskId;
	}

	isLiftedGroup(groupId: string): boolean {
		return this.groupId === groupId;
	}

	/**
	 * True where the dashed landing rule should be drawn.
	 *
	 * The index has to be translated on the way in, for the same reason
	 * `isGroupLanding` translates its own: the two sides count in different
	 * lists. `targetAt` skips the row being carried, because that is the list
	 * `orderAt` puts it back into; the markup counts with an `{#each}` that has
	 * every row in it, the carried one included.
	 *
	 * The two agree until the boundary passes the hole the carried row left,
	 * and from there they are one apart. So the rule was drawn a row short of
	 * where the row would actually land — and the row it was drawn under was
	 * usually the carried one itself, which is an offer to put it back where it
	 * already is next to a drop that would do something else.
	 */
	isLanding(groupId: string, index: number): boolean {
		if (this.target === null || this.target.groupId !== groupId) return false;

		const from = this.from;
		const shift =
			from !== null && from.groupId === groupId && this.target.index >= from.index ? 1 : 0;

		return this.target.index + shift === index;
	}

	/**
	 * The same, for a group being moved among its siblings.
	 *
	 * The index has to be translated on the way in, because the two sides count
	 * in different lists. `groupTargetAt` skips the group being carried — a
	 * group cannot land beside itself, and the order it is asked for is the
	 * order of the ones staying still, which is what `groupOrderAt` wants too.
	 * The markup counts with its own `{#each}`, which has every group in it,
	 * the carried one included.
	 *
	 * The two agree until the finger passes the hole the carried group left,
	 * and from there they are one apart: everything after the hole answers to
	 * an index one lower in the shorter list. So the rule was drawn a group
	 * short of where the group would actually land — the drop was right and
	 * the mark pointing at it was not, which is the worse way round.
	 */
	isGroupLanding(index: number): boolean {
		if (this.groupTarget?.kind !== 'order') return false;

		const at = this.groupTarget.index;
		const from = this.groupFrom;
		const shift = from !== null && at >= from ? 1 : 0;
		return at + shift === index;
	}

	/**
	 * The same offer, on one of the lists the switcher unfolds into while a
	 * group is in hand. No translation to do here: a list is a place, not a
	 * boundary between two things that shift when one of them is picked up.
	 */
	isListLanding(listId: string): boolean {
		return this.groupTarget?.kind === 'list' && this.groupTarget.listId === listId;
	}

	/** Over the corner, which is where a group goes to be got rid of. */
	get overFold(): boolean {
		return this.groupTarget?.kind === 'fold';
	}

	/**
	 * Over the switcher, or over one of the lists it has opened to show.
	 *
	 * The switcher is a drop target that answers by unfolding rather than by
	 * taking the group: letting go on the pill itself does nothing. The lists
	 * are only shown while this holds, because a column standing open for the
	 * whole of a drag covers the sheet the group is being carried across.
	 */
	get overSwitcher(): boolean {
		return this.groupTarget?.kind === 'switcher' || this.groupTarget?.kind === 'list';
	}

	reset(): void {
		this.taskId = null;
		this.target = null;
		this.from = null;
		this.groupId = null;
		this.groupTarget = null;
		this.groupFrom = null;
	}
}

export const drag = new DragState();

export type DragOptions = {
	taskId: string;
	groupId: string;
	onDrop: (target: DropTarget) => void;
	/** Dropping into a collapsed group expands it. */
	onEnterGroup?: (groupId: string) => void;
};

/**
 * Works out where the pointer would drop the row, by hit-testing the rows and
 * groups under it rather than tracking geometry we would have to keep in sync
 * with the DOM.
 */
function targetAt(x: number, y: number, movingId: string): DropTarget | null {
	const elements = document.elementsFromPoint(x, y);

	/*
	 * Asked first, because the row that offers a new group sits between the
	 * groups rather than inside one — neither branch below would find it, and
	 * the pointer would go on reporting the last group it was over.
	 */
	if (elements.some((el) => el instanceof HTMLElement && el.dataset.newgroup !== undefined)) {
		return { groupId: NEW_GROUP, index: 0 };
	}

	/*
	 * The dragged row is still in the DOM, just tilted, so hovering over its
	 * own former place would otherwise hit-test as itself — and, filtered out
	 * of its own siblings list, report the end of the group. There is no
	 * landing spot there, and nothing is drawn until the finger reaches a
	 * boundary between two other rows.
	 *
	 * The previous target used to stand instead. That kept a rule on the sheet
	 * through the whole of a short drag, and the rule it kept was almost always
	 * one of the two either side of the row itself — which is to say a rule
	 * offering to put the row back where it already was.
	 */
	if (elements.some((el) => el instanceof HTMLElement && el.dataset.task === movingId)) {
		return null;
	}

	const row = elements.find((el) => el instanceof HTMLElement && el.dataset.task) as
		HTMLElement | undefined;

	if (row) {
		const groupId = row.closest<HTMLElement>('[data-group]')?.dataset.group;
		if (!groupId) return null;

		const siblings = [
			...document.querySelectorAll<HTMLElement>(`[data-group="${groupId}"] [data-task]`)
		].filter((el) => el.dataset.task !== movingId);

		const index = siblings.indexOf(row);
		if (index === -1) return { groupId, index: siblings.length };

		// Top half means above this row, bottom half means below it.
		const box = row.getBoundingClientRect();
		return { groupId, index: y < box.top + box.height / 2 ? index : index + 1 };
	}

	const group = elements.find((el) => el instanceof HTMLElement && el.dataset.group) as
		HTMLElement | undefined;

	if (group?.dataset.group) {
		/*
		 * Counted without the row being carried, exactly as the branch above
		 * counts. This is the space `orderAt` works in, and it did not use to be
		 * the space this line answered in: a drop below the last task — which
		 * lands here, on the add row rather than on any task — reported one more
		 * than there were siblings, so `orderAt` found no neighbour on either
		 * side and `between(null, null)` handed back the *first* key there is.
		 * The task went to the top of the group, from the bottom of it.
		 *
		 * It was also the one place the no-op guard could not fire: a row already
		 * last in its group asked to be put after itself, and the count being one
		 * too high is what stopped `isHome` recognising it.
		 */
		const count = [...group.querySelectorAll<HTMLElement>('[data-task]')].filter(
			(el) => el.dataset.task !== movingId
		).length;
		return { groupId: group.dataset.group, index: count };
	}

	return null;
}

/**
 * The long press, the lift, the edge scroll and the tidying up — everything a
 * drag does that is not about what is being dragged.
 *
 * A task and a group are picked up the same way and differ only in where they
 * can land, so the gesture is written once and told what to do at each step.
 */
type Hooks = {
	/** False refuses the gesture outright: Loose ends cannot be moved. */
	enabled: () => boolean;
	/**
	 * The shorter of two presses, for a control that has two in it.
	 *
	 * Given, the press becomes two stages: this one at `LONG_PRESS_MS`, and the
	 * lift at `LIFT_MS`. It answers a release between the two rather than firing
	 * at the threshold itself, because nothing at the threshold can know whether
	 * the finger is going to stay down — the buzz there is what says a release
	 * now will do this rather than that.
	 */
	press?: () => void;
	lift: (x: number, y: number) => void;
	move: (x: number, y: number) => void;
	drop: () => void;
};

function pressDrag(node: HTMLElement, hooks: () => Hooks) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let start: { x: number; y: number } | null = null;
	let lifted = false;
	/** Past the shorter of two presses, and not yet past the longer. */
	let held = false;
	let pointerId: number | null = null;
	/**
	 * Whether the capture on this pointer is ours to let go of.
	 *
	 * The row's words carry a second gesture — the pull that ticks a task off —
	 * and it captures the same pointer on the same node the moment the finger
	 * moves. Released on the count of the id alone, the movement that ends this
	 * press would take that gesture's capture away with it, and a pull begun
	 * before the eighth pixel died on it.
	 */
	let captured = false;
	let scrolling: number | null = null;
	let edge = 0;
	/*
	 * A release after a press still fires a click on whatever was held, and what
	 * was held is a button — so dropping a task opened its editor, and dropping
	 * a group opened its name, and a press that opens a group's name would fold
	 * the group underneath it. The click after either is swallowed.
	 */
	let dropped = false;
	let settle: ReturnType<typeof setTimeout> | null = null;

	function autoScroll() {
		if (edge === 0) {
			scrolling = null;
			return;
		}
		window.scrollBy(0, edge);
		scrolling = requestAnimationFrame(autoScroll);
	}

	/*
	 * Non-passive, and attached for the whole lifetime rather than flipped mid
	 * gesture: browsers latch touch-action at gesture start, so switching it
	 * once a drag begins does nothing and the page scrolls under the finger.
	 */
	function ontouchmove(event: TouchEvent) {
		if (lifted) event.preventDefault();
	}

	function stop() {
		if (timer) clearTimeout(timer);
		timer = null;
		start = null;
		edge = 0;

		if (scrolling !== null) cancelAnimationFrame(scrolling);
		scrolling = null;

		/*
		 * Cleared before the release below rather than after it. Letting a
		 * capture go fires `lostpointercapture` there and then, and the handler
		 * for that has to be able to tell our own tidying up — where a drop is
		 * still to be delivered — from the browser taking the pointer away.
		 */
		lifted = false;
		held = false;

		if (captured && pointerId !== null && node.hasPointerCapture(pointerId)) {
			node.releasePointerCapture(pointerId);
		}
		captured = false;
		pointerId = null;
	}

	function onclick(event: MouseEvent) {
		if (!dropped) return;

		dropped = false;
		event.preventDefault();
		event.stopPropagation();
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		if (drag.turning) return;
		if (!hooks().enabled()) return;

		dropped = false;
		held = false;

		start = { x: event.clientX, y: event.clientY };
		pointerId = event.pointerId;

		function lift() {
			timer = null;
			/*
			 * The paper began turning after this press armed. Once the turn has
			 * the pointer this node hears no more moves, so the eight-pixel
			 * cancel below never fires — and a lift landing now would pick a row
			 * off a page that is edge-on and take the capture out from under the
			 * turn, leaving it stuck partway round.
			 */
			if (drag.turning) {
				stop();
				return;
			}
			lifted = true;
			buzz();

			if (pointerId !== null) {
				node.setPointerCapture(pointerId);
				captured = true;
			}
			hooks().lift(event.clientX, event.clientY);
		}

		/*
		 * One press or two. With a `press` hook the threshold below is only the
		 * first of them: it buzzes to say the gesture has stopped being a tap,
		 * and the lift waits the rest of the way to `LIFT_MS`. Letting go in
		 * between is what the shorter press means, and `onpointerup` answers it.
		 */
		timer = setTimeout(() => {
			if (drag.turning) {
				stop();
				return;
			}
			if (!hooks().press) {
				lift();
				return;
			}

			held = true;
			buzz();
			timer = setTimeout(lift, LIFT_MS - LONG_PRESS_MS);
		}, LONG_PRESS_MS);
	}

	function onpointermove(event: PointerEvent) {
		if (!lifted) {
			// Movement before the threshold means a scroll, not a drag.
			if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
				stop();
			}
			return;
		}

		hooks().move(event.clientX, event.clientY);

		edge =
			event.clientY < EDGE
				? -EDGE_SPEED
				: event.clientY > window.innerHeight - EDGE
					? EDGE_SPEED
					: 0;

		if (edge !== 0 && scrolling === null) scrolling = requestAnimationFrame(autoScroll);
	}

	function onpointerup() {
		const moved = lifted;
		// Past the shorter press and let go before the longer one: the release is
		// what the shorter press means.
		const briefly = held && !lifted;

		/*
		 * Armed before the hooks run, not after. The shorter press can take the
		 * node out of the document — a group title swaps itself for its own edit
		 * field — and the listener that swallows the click would go with it.
		 */
		dropped = moved || briefly;
		if (settle) clearTimeout(settle);
		settle = dropped ? setTimeout(() => (dropped = false), 400) : null;

		stop();

		if (moved) hooks().drop();
		else if (briefly) hooks().press?.();

		drag.reset();
	}

	/** A scroll won the race, or the gesture was interrupted. Put it back. */
	function oncancel() {
		stop();
		drag.reset();
	}

	/**
	 * The pointer was taken away rather than let go of.
	 *
	 * A capture can end without a `pointerup` ever arriving here — the browser
	 * hands the gesture to something else, or the OS interrupts it — and then
	 * nothing else would ever put the drag down. Guarded on `lifted`, which
	 * `stop` clears before it releases a capture of its own, so this never
	 * fires in the middle of delivering a drop.
	 */
	function onlost() {
		if (!lifted) return;
		stop();
		drag.reset();
	}

	node.addEventListener('click', onclick, { capture: true });
	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', oncancel);
	node.addEventListener('lostpointercapture', onlost);
	node.addEventListener('touchmove', ontouchmove, { passive: false });

	return () => {
		/*
		 * Put the shared drag down if this node was the one holding it.
		 *
		 * The node can leave the document with a finger still on it — a group
		 * title swapped for its own edit field, a row that changes which
		 * element it draws, a list switched out from under the gesture — and
		 * once it has, no pointerup, pointercancel or lostpointercapture will
		 * ever reach these handlers again. The lift is a single shared state, so
		 * what is left behind is not a stalled drag on one row: it is every
		 * group folded shut and a dashed outline round a title, for good, with
		 * nothing on the sheet able to clear it.
		 */
		const held = lifted;
		stop();
		if (held) drag.reset();

		if (settle) clearTimeout(settle);
		node.removeEventListener('click', onclick, { capture: true });
		node.removeEventListener('pointerdown', onpointerdown);
		node.removeEventListener('pointermove', onpointermove);
		node.removeEventListener('pointerup', onpointerup);
		node.removeEventListener('pointercancel', oncancel);
		node.removeEventListener('lostpointercapture', onlost);
		node.removeEventListener('touchmove', ontouchmove);
	};
}

/**
 * Where a row sits now, counted among its siblings including itself.
 *
 * That count is exactly the index that would put it back: taking a row out of
 * its own list shifts everything below it up by one, so inserting at the same
 * number in the shortened list lands it between the same two neighbours.
 */
function homeOf(taskId: string): DropTarget | null {
	const row = document.querySelector<HTMLElement>(`[data-task="${taskId}"]`);
	const groupId = row?.closest<HTMLElement>('[data-group]')?.dataset.group;
	if (!row || !groupId) return null;

	const siblings = [
		...document.querySelectorAll<HTMLElement>(`[data-group="${groupId}"] [data-task]`)
	];
	return { groupId, index: siblings.indexOf(row) };
}

/** Whether a target is the place the lifted row is already in. */
function isHome(target: DropTarget | null): boolean {
	return (
		target !== null &&
		drag.from !== null &&
		target.groupId === drag.from.groupId &&
		target.index === drag.from.index
	);
}

export const dragRow: Action<HTMLElement, DragOptions> = (node, initial) => {
	let options = initial;

	/** A target, unless it is the one that would change nothing. */
	function landing(x: number, y: number): DropTarget | null {
		const next = targetAt(x, y, options.taskId);
		return isHome(next) ? null : next;
	}

	const destroy = pressDrag(node, () => ({
		enabled: () => true,
		lift(x, y) {
			drag.taskId = options.taskId;
			drag.from = homeOf(options.taskId);
			drag.target = landing(x, y);
		},
		move(x, y) {
			/*
			 * Cleared rather than held. Over its own row, or at either boundary
			 * beside it, there is nothing to offer — and a rule left standing
			 * from a moment ago is a rule pointing at somewhere the finger has
			 * left.
			 */
			const next = landing(x, y);
			drag.target = next;
			if (!next) return;

			if (next.groupId !== options.groupId) options.onEnterGroup?.(next.groupId);
		},
		drop() {
			if (drag.target) options.onDrop(drag.target);
		}
	}));

	return {
		update(next: DragOptions) {
			options = next;
		},
		destroy
	};
};

export type GroupDragOptions = {
	groupId: string;
	/** Loose ends is assembled on read and cannot be moved. */
	enabled: boolean;
	/** The shorter press: it opens the name rather than picking the group up. */
	onEdit: () => void;
	onDrop: (drop: GroupDrop) => void;
};

/**
 * Where a group would land: its index among the others, by the same top-half /
 * bottom-half rule the rows use, read off the DOM rather than tracked.
 *
 * Null over the dragged group's own section — the same dead zone `targetAt`
 * refuses for a row, and for the same reason: it is still in the DOM, just
 * tilted, and offers no landing spot of its own.
 */
function groupTargetAt(x: number, y: number, movingId: string): GroupDrop | null {
	/*
	 * The corner is asked first, and the switcher's rows second, for the reason
	 * `targetAt` asks about the new-group row first: neither is in the groups'
	 * own flow, so the sweep below would never find them and the finger would
	 * go on reporting whichever group it was last over.
	 *
	 * `elementsFromPoint` hands back the whole stack rather than the topmost
	 * element, so a message sliding down over the corner does not cover the
	 * targets underneath it.
	 */
	const elements = document.elementsFromPoint(x, y);

	if (elements.some((el) => el instanceof HTMLElement && el.dataset.fold !== undefined)) {
		return { kind: 'fold' };
	}

	if (elements.some((el) => el instanceof HTMLElement && el.dataset.newlist !== undefined)) {
		return { kind: 'list', listId: NEW_LIST };
	}

	const row = elements.find((el) => el instanceof HTMLElement && el.dataset.list) as
		HTMLElement | undefined;

	if (row?.dataset.list) return { kind: 'list', listId: row.dataset.list };

	/*
	 * Asked after the rows it opens, because they are inside it: over a list the
	 * answer is that list, and anywhere else about the switcher the answer is
	 * the switcher itself, which is what keeps the column open while a finger
	 * crosses it.
	 *
	 * Measured rather than hit-tested, which is the one place here that is. The
	 * pill and the column it opens are two boxes with a corner of nothing
	 * between them — the column hangs below the pill and is several times as
	 * wide — and a finger going diagonally from one to the other passes through
	 * that corner. Hit-testing, the switcher was left for those few pixels and
	 * the column shut under the hand on its way to a list. One box round the
	 * two of them has no gap to fall through.
	 */
	if (overSwitcher(x, y)) return { kind: 'switcher' };

	const own = document.querySelector<HTMLElement>(`[data-group="${movingId}"]`);
	if (own) {
		const box = own.getBoundingClientRect();
		if (y >= box.top && y <= box.bottom) return null;
	}

	const sections = [...document.querySelectorAll<HTMLElement>('[data-group]')].filter(
		(el) => el.dataset.group !== movingId
	);

	for (let i = 0; i < sections.length; i++) {
		const box = sections[i].getBoundingClientRect();
		if (y < box.top + box.height / 2) return { kind: 'order', index: i };
	}

	return { kind: 'order', index: sections.length };
}

/**
 * Whether the pointer is on the switcher: on the pill, or on the column of
 * lists it opens.
 *
 * Measured rather than hit-tested, so that what is under the column — the
 * sheet's own titles — cannot answer for a point that is over it, and so that
 * the two parts are one target rather than two.
 *
 * One box round every part of it, rather than each part answering for itself.
 * The pill is as wide as its own words and the column below it is wider, so
 * the two leave a corner of nothing between them — and a finger going
 * diagonally from one into the other passed through that corner, shutting the
 * column it was reaching into.
 */
function overSwitcher(x: number, y: number): boolean {
	const parts = document.querySelectorAll<HTMLElement>('[data-switcher]');
	if (parts.length === 0) return false;

	let left = Infinity;
	let right = -Infinity;
	let top = Infinity;
	let bottom = -Infinity;

	for (const part of parts) {
		const box = part.getBoundingClientRect();
		left = Math.min(left, box.left);
		right = Math.max(right, box.right);
		top = Math.min(top, box.top);
		bottom = Math.max(bottom, box.bottom);
	}

	return x >= left && x <= right && y >= top && y <= bottom;
}

/** Where a group sits now, counted among its siblings including itself. */
function groupHomeOf(groupId: string): number | null {
	const sections = [...document.querySelectorAll<HTMLElement>('[data-group]')];
	const at = sections.findIndex((el) => el.dataset.group === groupId);
	return at === -1 ? null : at;
}

/**
 * The same press that lifts a row, in two stages on a group's name: the
 * shorter one opens it for changing and the longer one picks the group up.
 *
 * A group title had a press already and wanted a second. Renaming was two taps
 * and nothing else, which is a gesture you have to be told about — where a
 * press is the thing a finger tries on anything it suspects of holding more.
 * So holding briefly opens the name, and holding on carries the group.
 */
export const dragGroup: Action<HTMLElement, GroupDragOptions> = (node, initial) => {
	let options = initial;

	/**
	 * The same rule the rows follow: no landing where it already is.
	 *
	 * Only a place among its siblings can be the place it is already in. The
	 * list it is already on is never offered — the switcher leaves the open
	 * list out of the column it unfolds into — and the corner is never where
	 * anything already is.
	 */
	function landing(x: number, y: number): GroupDrop | null {
		const next = groupTargetAt(x, y, options.groupId);
		if (next?.kind === 'order' && next.index === drag.groupFrom) return null;
		return next;
	}

	const destroy = pressDrag(node, () => ({
		enabled: () => options.enabled,
		press: () => options.onEdit(),
		lift(x, y) {
			drag.groupId = options.groupId;
			drag.groupFrom = groupHomeOf(options.groupId);
			drag.groupTarget = landing(x, y);
		},
		move(x, y) {
			/*
			 * One tap as the group reaches the corner, and one only.
			 *
			 * Every other offer on the sheet answers a finger arriving by
			 * changing weight under it — a rule going dashed, a line going
			 * heavier — and the corner cannot: what says a group is over the bin
			 * is the mark boiling, which is a change of drawing rather than of
			 * weight and is the slowest thing on the sheet to read. So the phone
			 * says it as well, at the moment of arrival.
			 *
			 * On the edge and not on the state, or a finger held over the corner
			 * would buzz on every move the browser reported for as long as it
			 * stayed there, which is a rhythm, and a rhythm is a notification.
			 */
			const was = drag.overFold;
			drag.groupTarget = landing(x, y);
			if (drag.overFold && !was) buzz();
		},
		drop() {
			if (drag.groupTarget !== null) options.onDrop(drag.groupTarget);
		}
	}));

	return {
		update(next: GroupDragOptions) {
			options = next;
		},
		destroy
	};
};
