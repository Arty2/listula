<script lang="ts">
	import AddRow from './AddRow.svelte';
	import GroupHeader from './GroupHeader.svelte';
	import TaskRow from './TaskRow.svelte';
	import TextRule from './TextRule.svelte';
	import { figures } from '$lib/doc/amount';
	import { handBack } from '$lib/doc/handoff';
	import { langOf } from '$lib/doc/lang';
	import { length } from '$lib/doc/clean';
	import { LIMITS } from '$lib/doc/limits';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { taken } from '$lib/feel';
	import { drag, NEW_GROUP, NEW_LIST, type DropTarget, type GroupDrop } from '$lib/dnd/drag.svelte';
	import { emptyDoc, type State, type Task } from '$lib/doc/types';
	import { t } from '$lib/i18n';
	import { Burst } from '$lib/state/burst';
	import { sheet } from '$lib/state/doc.svelte';
	import { lists } from '$lib/state/lists.svelte';
	import { ui } from '$lib/state/ui.svelte';

	let newGroupOpen = $state(false);
	let newGroupDraft = $state('');
	let landingWidth = $state(0);

	/**
	 * Where an open, empty task row is sitting, if anywhere.
	 *
	 * Enter on a task puts one directly beneath it; Enter on a group title puts
	 * one at the top of the group. There is never more than one, because there
	 * is only one caret.
	 */
	let inserting = $state<{
		groupId: string;
		index: number;
		carried?: string;
		atStart?: boolean;
	} | null>(null);

	/**
	 * Which task's editor to open, when the caret is coming back up from a row
	 * that was backspaced away. Cleared as soon as the row reports it opened, so
	 * the same row can be reached again the next time.
	 */
	let opening = $state<{ id: string; at: number | null } | null>(null);

	/**
	 * Which group's name to open, when the caret is coming back up out of the
	 * row the name itself opened. Cleared as soon as the header reports it, the
	 * same way `opening` is.
	 */
	let openingGroup = $state<string | null>(null);

	const overLimit = $derived(sheet.taskCount > LIMITS.tasks);

	/*
	 * A sheet with nothing written on it yet, where the add row is the only row
	 * there is. Its empty box is shown rather than kept back then — there is no
	 * list for it to sit at the end of and be counted as part of, and it is the
	 * one thing on an empty sheet saying what a task here looks like.
	 *
	 * Both halves are needed. Loose ends is assembled from tasks, so with none
	 * there is exactly one group and exactly one add row; two empty groups would
	 * put up two of these, which is a list of nothing rather than an invitation.
	 */
	const lone = $derived(sheet.taskCount === 0 && sheet.groups.length === 1);

	/*
	 * Everything folds shut while a group is being carried, so the whole list is
	 * a handful of titles and there is somewhere visible to put it down. Nothing
	 * is written: this is a view of the drag, not a change to what is collapsed.
	 */
	const folded = $derived(drag.groupId !== null);

	/** The placeholder is a title one step earlier, so its rule follows it. */
	const newGroupShown = $derived(newGroupOpen ? newGroupDraft : '…');
	const landing = $derived(
		landingWidth > 0 ? handLine(landingWidth, { seed: seedFrom('landing'), wobble: 1.2, y: 2 }) : ''
	);

	/*
	 * Only offered once every task in the group is done, so nothing anyone is
	 * still waiting on goes with it — but the tasks do go, so it says how many.
	 *
	 * `finished` is what the header's own mark knows and the corner does not: a
	 * group carried to the fold goes whatever state it was in, so what went with
	 * it is a count of tasks rather than a count of done ones.
	 */
	function removeGroup(id: string, title: string, finished = true) {
		const gone = sheet.deleteGroup(id);
		if (!gone) return;

		const count = gone.tasks.length;
		const went = finished ? t.toast.deletedWithDone : t.toast.deletedWithTasks;
		const what = count === 0 ? named(title) : went({ what: named(title), count });

		// The confirm stops nothing here — the header only offers it on a finished
		// group — so the undo is what covers a change of mind.
		ui.say(
			t.toast.deletedGroup({ what }),
			undoing(() => sheet.restoreGroup(gone))
		);
	}

	/**
	 * The same mark on a group that still has something left to do: what is
	 * finished with goes, and the group stays.
	 *
	 * No confirm. The mark is only ever drawn where it has something to sweep,
	 * the sweep is named on the button, and the ten-second undo is what covers a
	 * change of mind — which is exactly how removing a group already works two
	 * lines up. CLEAR asked first because it lived in a menu, where a tap is a
	 * long way from the tasks it was about to take.
	 */
	function clearGroup(tasks: readonly Task[]) {
		const done = tasks.filter((task) => task.state === 'done').map((task) => task.id);
		const cleared = sheet.clearDone(done);
		if (cleared.length === 0) return;

		ui.say(
			t.toast.cleared({ count: cleared.length }),
			undoing(() => sheet.restore(cleared))
		);
	}

	/**
	 * A message with a way back, which is nearly every message that follows a
	 * change here. Written once because the undo always ends the same way: the
	 * change is undone, so the message describing it goes at once rather than
	 * sliding out over the change it was about.
	 */
	function undoing(run: () => void) {
		return {
			label: t.toast.undo,
			run: () => {
				run();
				ui.dismiss(true);
			}
		};
	}

	/*
	 * A run of ticks, watched in one place because every way of ticking a task
	 * comes through here — the checkbox, the ladder on the words, and the
	 * keyboard.
	 */
	const burst = new Burst();

	function setState(id: string, state: State) {
		sheet.setState(id, state);

		if (state !== 'done') {
			burst.forget();
			return;
		}

		const run = burst.note(id, performance.now());
		if (!run) return;

		/*
		 * Offered, never done: this is the app noticing what is going on and
		 * putting the tidying up within reach, and a message that swept three
		 * rows off the sheet by itself would be the app deciding.
		 */
		ui.say(t.toast.doneRun({ count: run.length }), {
			label: t.toast.clear,
			run: () => {
				const cleared = sheet.clearDone(run);
				if (cleared.length === 0) {
					ui.dismiss(true);
					return;
				}

				ui.say(
					t.toast.cleared({ count: cleared.length }),
					undoing(() => sheet.restore(cleared))
				);
			}
		});
	}

	/**
	 * A long press on any one fold icon folds the sheet — or opens it again,
	 * when there is nothing left folded to see the point of.
	 *
	 * Loose ends is not among them: it is a perforation rather than a heading,
	 * has no fold control of its own, and what is under it was never filed
	 * anywhere on purpose.
	 */
	function foldAll() {
		const ids = sheet.groups.filter((group) => !group.synthetic).map((group) => group.id);
		if (ids.length === 0) return;

		const shut = ids.every((id) => ui.isCollapsed(id));
		ui.foldAll(ids);
		ui.announce(shut ? t.sheet.unfoldedAll : t.sheet.foldedAll);
	}

	/**
	 * Puts a task in at a position rather than on the end, and moves the open
	 * row down past it so a run of Enters reads top to bottom.
	 */
	function insert(groupId: string, index: number, text: string): boolean {
		const id = sheet.addTaskAt(groupId, index, text);
		if (id === null) return false;

		inserting = { groupId, index: index + 1 };
		return true;
	}

	function remove(id: string) {
		const entry = sheet.deleteTask(id);
		if (!entry) return;

		ui.say(
			t.toast.deleted,
			undoing(() => sheet.restore([entry]))
		);
	}

	/**
	 * Backspace on a row with nothing left in it: the row goes, and the caret
	 * carries on at the end of the task above.
	 *
	 * `index` is where the empty row sits, so the task above it is the one
	 * before. First in its group and there is nobody above — the row simply
	 * closes, and nothing is deleted.
	 */
	function back(groupId: string, index: number, taskId?: string) {
		const above = sheet.groups.find((group) => group.id === groupId)?.tasks[index - 1];

		// A task that exists only goes if there is somewhere for the caret to go.
		if (taskId) {
			if (!above) return;
			remove(taskId);
		}

		inserting = null;

		if (above) {
			opening = { id: above.id, at: null };
			return;
		}

		/*
		 * Nothing above it in the group, so the caret goes up to the group's own
		 * name — which is where the row came from. Enter on an empty group's
		 * title opens the first task inside it; backspacing out of that row is
		 * the same motion in reverse, and it used to close the row and leave the
		 * caret nowhere at all, one keystroke into naming a list.
		 *
		 * Only for a row still being typed. A real first task emptied to nothing
		 * has already been refused above: deleting it would take the caret
		 * somewhere no task is, and the task itself with it.
		 */
		opening = null;
		openingGroup = groupId;
	}

	/**
	 * Backspace at the very start of a row that still has something in it: it
	 * joins onto the end of the one above, and the caret waits at the seam.
	 *
	 * A row being typed answers to this as well as a committed task does. On the
	 * sheet they are the same thing — one line of writing with a box beside it —
	 * and a key that works on the row above and not on the one under the finger
	 * reads as the app having lost its place. The only difference is that a
	 * draft has nothing to delete afterwards.
	 *
	 * Quietly, with no message. Nothing was taken away — the words are all still
	 * on the sheet, a line higher — so a toast saying "Deleted." would be a lie
	 * about the one thing it is there to report. The row above simply grew.
	 *
	 * Refused, and then the key does nothing at all, when the two will not fit
	 * in one task. That is the honest answer: a row that filled up and spilled
	 * cannot be poured back into the row it came from, and silently dropping
	 * the overflow to make it fit would lose writing.
	 */
	function join(groupId: string, index: number, text: string, taskId?: string): boolean {
		const above = sheet.groups.find((group) => group.id === groupId)?.tasks[index - 1];
		if (!above) return false;

		const seam = length(above.text);
		if (seam + length(text) > LIMITS.taskText) return false;

		sheet.editTask(above.id, above.text + text);
		// A row still being typed has no task of its own to take away; it simply
		// closes, which the row itself does on its way out.
		if (taskId) sheet.deleteTask(taskId);

		inserting = null;
		opening = { id: above.id, at: seam };
		return true;
	}

	/**
	 * Where a drag let go. The neighbours are never restamped.
	 *
	 * A drop is the one change a finger makes that leaves no trace of where the
	 * thing came from, so it is the one that most wants taking back — and where
	 * it came from is two strings, read off the task before it moves. Putting
	 * the old key back is an ordinary move stamped now, not a rewind, so the
	 * merge sees what it always sees.
	 *
	 * The keyboard's own move (`move`, below) says where the task went instead
	 * of offering this. It is announced because it cannot be seen, it is exact,
	 * and a run of Alt+↓ down a list would raise a message a step.
	 */
	function drop(taskId: string, target: DropTarget) {
		const was = sheet.doc.tasks[taskId];
		if (!was) return;

		const home = { groupId: was.groupId, order: was.order };
		const back = () => sheet.moveTask(taskId, home.groupId, home.order);

		/*
		 * Let go on the row that offers a new group: the group is made on the
		 * spot and the task is its first. It arrives unnamed, showing the same
		 * ellipsis an untitled group always shows — carrying a task somewhere new
		 * is one decision, and being made to name it before the finger comes up
		 * would be a second.
		 */
		if (target.groupId === NEW_GROUP) {
			if (!sheet.canAddGroup) {
				ui.say(t.toast.overGroups({ max: LIMITS.groups }));
				return;
			}

			const id = sheet.addGroup('');
			if (id === null) return;

			sheet.moveTask(taskId, id, sheet.orderAt(id, 0, taskId));
			ui.announce(t.sheet.movedToNewGroup);

			// The group was made by the drop, so undoing the drop unmakes it —
			// after the task is out of it, or it would go with the group.
			ui.say(
				t.toast.moved,
				undoing(() => {
					back();
					sheet.deleteGroup(id);
				})
			);
			return;
		}

		// Loose ends is assembled on read and cannot hold a task.
		if (sheet.groups.find((g) => g.id === target.groupId)?.synthetic) return;

		sheet.moveTask(taskId, target.groupId, sheet.orderAt(target.groupId, target.index, taskId));
		ui.say(t.toast.moved, undoing(back));
	}

	/**
	 * The same, for a whole group — which has three places to land rather than
	 * one, because while a group is in hand the corner answers for it too.
	 */
	function dropGroup(id: string, title: string, drop: GroupDrop) {
		if (drop.kind === 'order') {
			reorder(id, drop.index);
			return;
		}

		/*
		 * The turned-down corner. It takes the group and everything in it,
		 * finished or not — which is the one rule the header's own mark does not
		 * follow, and deliberately: that mark is drawn beside a list somebody may
		 * only be reading, where a live delete has to be earned, and this is a
		 * group already in hand, thrown at the one place that means gone.
		 */
		if (drop.kind === 'fold') {
			/*
			 * The same two beats a group struck out in the gutter answers with —
			 * dot dot, something is gone. Called here rather than left to
			 * `removeGroup`, because the header's own mark already says it at its
			 * own site and the corner is not a button: nothing else on the way in
			 * would say anything at all.
			 */
			taken();
			removeGroup(id, title, false);
			return;
		}

		/*
		 * The switcher itself, rather than one of the lists it opened to show.
		 * It answers a group arriving by unfolding, and there is nothing on the
		 * pill to let go of — the group stays where it is.
		 */
		if (drop.kind === 'switcher') return;

		sendTo(id, drop.listId);
	}

	/** A group carried among its siblings. The neighbours are never restamped. */
	function reorder(id: string, index: number) {
		const was = sheet.doc.groups[id];
		if (!was) return;

		const order = was.order;
		sheet.moveGroup(id, sheet.groupOrderAt(index, id));
		ui.say(
			t.toast.moved,
			undoing(() => sheet.moveGroup(id, order))
		);
	}

	/**
	 * A group carried off this list altogether, onto another one — or onto a
	 * list that does not exist yet, which the drop then makes.
	 *
	 * The undo is two ordinary changes rather than a rewind, and which two
	 * depends on what the drop did. Onto a list that was already there, the
	 * group is taken back out of it and put back here: that list may have a
	 * code, may have been synced since, and writing yesterday's bytes over it
	 * would take anything else that landed there with them. Onto a list the drop
	 * invented, there is nothing to preserve — it is unmade whole, after the
	 * group is out of it, exactly as an invented group is one level down.
	 */
	function sendTo(id: string, listId: string) {
		const ctx = sheet.ctx;
		if (!ctx) return;

		const made = listId === NEW_LIST;
		const target = made ? lists.adopt() : listId;
		if (target === null) return;

		/*
		 * Read before anything moves: it is the name of the list being sent to as
		 * it stands, and a list's name is its first group's title — which is a
		 * thing this very drop can change.
		 */
		const entry = lists.entries.find((candidate) => candidate.id === target);
		const name = entry ? lists.nameOf(entry) : '';

		const carried = sheet.carryGroup(id, lists.docOf(target) ?? emptyDoc());

		if (!carried || carried.refused !== null) {
			// Nothing moved, so a list minted to receive it has nothing to be.
			if (made) lists.forget(target);
			if (carried?.refused === 'groups') ui.say(t.toast.overGroups({ max: LIMITS.groups }));
			else if (carried?.refused === 'tasks') ui.say(t.toast.overTasks({ max: LIMITS.tasks }));
			return;
		}

		/*
		 * The list it is going to is written first, and only then is it taken off
		 * this one. Storage can refuse a write — a full quota is the ordinary way
		 * — and of the two ways that can go, a group on both lists is something a
		 * person can see and sort out, while a group on neither is writing gone.
		 */
		if (!lists.writeDoc(target, carried.to)) {
			if (made) lists.forget(target);
			// Said, or a drop that did nothing reads as a drop that is broken.
			ui.say(t.toast.couldNotMove);
			return;
		}
		sheet.replace(carried.from);

		/*
		 * And that list now has something on it nobody has looked at. The mark
		 * beside its name is the only thing left saying so once the message has
		 * gone — the group itself is off this sheet and onto one that is not on
		 * the screen.
		 */
		lists.arrived(target);

		ui.announce(made ? t.sheet.movedToNewList : t.sheet.movedToList({ list: name }));

		ui.say(
			made ? t.toast.movedToNewList : t.toast.movedToList({ what: t.lists.named({ name }) }),
			undoing(() => {
				lists.takenBack(target);

				if (made) {
					lists.forget(target);
				} else {
					/*
					 * Re-read rather than reusing the document written a moment ago,
					 * so anything that has landed on that list since is still there
					 * when the group leaves it again.
					 */
					const there = lists.docOf(target);
					if (there) lists.writeDoc(target, handBack(there, ctx, id));
				}

				sheet.restoreGroup(carried.gone);
			})
		);
	}

	/**
	 * Alt+↑ / Alt+↓, crossing group boundaries at the ends — the path that has
	 * to keep working without a finger.
	 */
	function move(groupIndex: number, taskIndex: number, direction: -1 | 1) {
		const group = sheet.groups[groupIndex];
		const task = group.tasks[taskIndex];
		if (!task) return;

		const target = taskIndex + direction;

		if (target >= 0 && target < group.tasks.length) {
			sheet.moveTask(task.id, group.id, sheet.orderAt(group.id, target, task.id));
			ui.announce(t.sheet.movedWithin({ position: target + 1, group: label(group.title) }));
			return;
		}

		// Off the end: step into the neighbouring group, skipping Loose ends,
		// which is assembled on read and cannot hold a task.
		const next = sheet.groups[groupIndex + direction];
		if (!next || next.synthetic) return;

		const position = direction === 1 ? 0 : next.tasks.length;
		sheet.moveTask(task.id, next.id, sheet.orderAt(next.id, position, task.id));
		ui.expand(next.id);
		ui.announce(t.sheet.movedTo({ group: label(next.title), position: position + 1 }));
	}

	/**
	 * A group's name as it goes into a message on the screen.
	 *
	 * Quoted, because it is the one part of the sentence somebody else wrote:
	 * "Removed “Weekend” and 3 done" says where the name stops, and "Removed
	 * Weekend and 3 done" leaves the reader to work it out — a group called
	 * "and" or "done" makes a sentence out of nothing at all. An untitled group
	 * has no name to quote and is described instead.
	 */
	function named(title: string) {
		return title === '' ? t.group.untitledInSentence : t.group.named({ title });
	}

	/**
	 * And as it goes into one that is read aloud, where a quotation mark is
	 * either noise or silence depending on the screen reader, and helps nobody
	 * either way.
	 */
	function label(title: string) {
		return title === '' ? t.group.untitledInSentence : title;
	}

	/**
	 * The row that makes a group, committed.
	 *
	 * `andOpen` is Enter rather than a tap somewhere else: a group that has just
	 * been made is certainly empty, so the next thing is certainly a task, and
	 * naming it and writing the first thing into it is one motion. It is the
	 * same rule Enter on an existing empty group's title follows — and this is
	 * the commoner way to reach an empty group by far, since making one is what
	 * empties it.
	 */
	function addGroup(andOpen = false) {
		const title = newGroupDraft.trim();
		newGroupDraft = '';
		newGroupOpen = false;
		if (title === '') return;

		const id = sheet.addGroup(title);
		if (andOpen && id !== null) inserting = { groupId: id, index: 0 };
	}

	function onNewGroupKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			/*
			 * Committed here rather than by blurring the field, which is what this
			 * used to do: the blur runs `addGroup` with nothing to add and closes
			 * the row that has just opened. The same reason a group title commits
			 * in its own keydown.
			 */
			addGroup(true);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			newGroupDraft = '';
			newGroupOpen = false;
		}
	}
</script>

{#snippet newGroup()}
	<!--
		Also where a carried task can be let go: `data-newgroup` is what the drag
		hit-tests for, and the dashed rule appears over it the way it does between
		two rows, so the offer is made in the same hand as every other landing.
	-->
	{#if drag.isLanding(NEW_GROUP, 0)}
		<div class="landing" aria-hidden="true">
			<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
				<path d={landing} class="drawn drawn--dashed" />
			</svg>
		</div>
	{/if}

	<!-- The same glyph in two type sizes: one more task, or one more group. -->
	<div class="new-group" data-newgroup>
		{#if newGroupOpen}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="caps"
				type="text"
				lang={langOf(newGroupDraft)}
				maxlength={LIMITS.groupTitle}
				aria-label={t.group.new}
				autofocus
				bind:value={newGroupDraft}
				onblur={() => addGroup()}
				onkeydown={onNewGroupKeydown}
			/>
		{:else}
			<button
				type="button"
				class="caps"
				disabled={!sheet.canAddGroup}
				aria-label={t.group.add}
				onclick={() => (newGroupOpen = true)}
			>
				…
			</button>
		{/if}

		<!--
			Faint while it is still an offer, ink as soon as it is being written in.
			The ellipsis and its rule are one mark in two media and cannot be set
			apart — but a title being typed is no longer a placeholder, and a full
			rule under it is what every other title on the sheet gets.
		-->
		<TextRule text={newGroupShown} seed="new-group" faint={!newGroupOpen} />
	</div>
{/snippet}

<!-- Measures the width the landing rule is drawn at. -->
<svg class="measure" bind:clientWidth={landingWidth} aria-hidden="true"></svg>

<div class="sheet">
	<!--
		Loose ends is always last and is never something anyone made. The way to
		make one belongs above it, among the groups it would sit beside — under
		the line it would read as a way to name what is already there.
	-->
	{#each sheet.groups as group, groupIndex (group.id)}
		{#if group.synthetic}
			{@render newGroup()}
		{/if}

		{#if drag.isGroupLanding(groupIndex)}
			<div class="landing" aria-hidden="true">
				<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
					<path d={landing} class="drawn drawn--dashed" />
				</svg>
			</div>
		{/if}

		<!-- Read once for the whole group: the rows write their numbers its way. -->
		{@const fig = figures(group.tasks)}

		<section class="group" data-group={group.id}>
			<!-- Every group gets a header, so one with no title is still nameable. -->
			<GroupHeader
				title={group.title}
				seed={group.id}
				collapsed={folded || ui.isCollapsed(group.id)}
				count={group.tasks.length}
				open={group.tasks.filter((task) => task.state !== 'done').length}
				done={group.tasks.filter((task) => task.state === 'done').length}
				finished={group.tasks.every((task) => task.state === 'done')}
				synthetic={group.synthetic}
				total={fig.total}
				naming={openingGroup === group.id}
				onnamed={() => (openingGroup = null)}
				ontoggle={() => ui.toggleCollapsed(group.id)}
				onfoldall={foldAll}
				onrename={(title) => sheet.renameGroup(group.id, title)}
				ondelete={() => removeGroup(group.id, group.title)}
				onclear={() => clearGroup(group.tasks)}
				onaddtask={() => (inserting = { groupId: group.id, index: 0 })}
				ondrop={(drop) => dropGroup(group.id, group.title, drop)}
			/>

			{#if !folded && !ui.isCollapsed(group.id)}
				<ul class="tasks">
					{#each group.tasks as task, taskIndex (task.id)}
						{#if !group.synthetic && inserting?.groupId === group.id && inserting.index === taskIndex}
							<AddRow
								seed={`${group.id}-at${taskIndex}`}
								disabled={!sheet.canAddTask}
								opened
								initial={inserting.carried ?? ''}
								atStart={inserting.atStart ?? false}
								onadd={(text) => insert(group.id, taskIndex, text)}
								onclose={() => (inserting = null)}
								onback={() => back(group.id, taskIndex)}
								onjoin={(text) => join(group.id, taskIndex, text)}
							/>
						{/if}

						{#if drag.isLanding(group.id, taskIndex)}
							<li class="landing" aria-hidden="true">
								<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
									<path d={landing} class="drawn drawn--dashed" />
								</svg>
							</li>
						{/if}

						<TaskRow
							{task}
							groupId={group.id}
							style={fig.style}
							open={opening?.id === task.id}
							openAt={opening?.id === task.id ? opening.at : null}
							onstate={(state) => setState(task.id, state)}
							onedit={(text) => sheet.editTask(task.id, text)}
							ondelete={() => remove(task.id)}
							onsplit={(next) =>
								group.synthetic ||
								(inserting = {
									groupId: group.id,
									// Above this row where the caret was at its very start, and
									// under it everywhere else.
									index: taskIndex + (next?.above ? 0 : 1),
									carried: next?.carried,
									atStart: next?.atStart
								})}
							onback={() => back(group.id, taskIndex, task.id)}
							onjoin={(text) => join(group.id, taskIndex, text, task.id)}
							onopened={() => (opening = null)}
							onmove={(direction) => move(groupIndex, taskIndex, direction)}
							ondrop={(target) => drop(task.id, target)}
							onEnterGroup={(id) => ui.expand(id)}
						/>
					{/each}

					{#if drag.isLanding(group.id, group.tasks.length)}
						<li class="landing" aria-hidden="true">
							<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
								<path d={landing} class="drawn drawn--dashed" />
							</svg>
						</li>
					{/if}

					{#if !group.synthetic && inserting?.groupId === group.id && inserting.index === group.tasks.length}
						<AddRow
							seed={`${group.id}-end`}
							disabled={!sheet.canAddTask}
							opened
							initial={inserting.carried ?? ''}
							atStart={inserting.atStart ?? false}
							onadd={(text) => insert(group.id, group.tasks.length, text)}
							onclose={() => (inserting = null)}
							onback={() => back(group.id, group.tasks.length)}
							onjoin={(text) => join(group.id, group.tasks.length, text)}
						/>
					{/if}

					<!--
						Real groups only. Nothing under Loose ends was put there on
						purpose — it is where two phones disagreeing leaves a task — so
						offering to write a new one into it would be offering to file
						something under the fact that a group went missing.
					-->
					{#if !group.synthetic}
						<AddRow
							seed={group.id}
							disabled={!sheet.canAddTask}
							{lone}
							onadd={(text) => sheet.addTask(group.id, text) !== null}
							onback={() => back(group.id, group.tasks.length)}
							onjoin={(text) => join(group.id, group.tasks.length, text)}
						/>
					{/if}
				</ul>
			{/if}
		</section>
	{/each}

	{#if drag.isGroupLanding(sheet.groups.length)}
		<div class="landing" aria-hidden="true">
			<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
				<path d={landing} class="drawn drawn--dashed" />
			</svg>
		</div>
	{/if}

	{#if !sheet.groups.some((group) => group.synthetic)}
		{@render newGroup()}
	{/if}

	{#if overLimit}
		<p class="over">{t.sheet.over({ count: sheet.taskCount, max: LIMITS.tasks })}</p>
	{/if}
</div>

<p class="sr-only" role="status" aria-live="polite">{ui.announcement}</p>

<style>
	.measure {
		display: block;
		width: 100%;
		height: 0;
	}

	.sheet {
		padding: 0 0 2rem;
	}

	/*
	 * No gap between groups. Every group ends with the add row, and the empty
	 * line it holds is already the space before the next title — a margin on top
	 * of it left a hole big enough to read as a missing group.
	 */
	.group {
		margin-bottom: 0;
	}

	/*
	 * The title needs the same air under it that the tasks have between them,
	 * or it sits on the first one.
	 *
	 * Measured rather than picked: a 44px row around ~13px of capitals leaves
	 * 31.5px of white between one task's ink and the next, and the drawn rule
	 * ended 10.3px above the first. This is the difference. Retune it if the
	 * row height or the face changes — both feed the number.
	 */
	.tasks {
		margin: 1.3rem 0 0;
		padding: 0;
	}

	/*
	 * Drawn in the gap between two rows rather than opening one.
	 *
	 * It used to be five pixels tall and in the flow, so every time the target
	 * changed, every row past it moved five pixels — six of those in one slow
	 * drag down a list of five, which is what the jerking under the finger
	 * actually was. Worse, the rows it moved are the rows the next hit test
	 * reads, so the drag was steering by a ruler it kept nudging.
	 *
	 * Zero height and an overflowing stroke: the mark is in the same place it
	 * always was, and nothing below it knows the mark exists.
	 */
	.landing {
		list-style: none;
		height: 0;
		margin: 0;
		overflow: visible;
	}

	.landing svg {
		display: block;
		/*
		 * Half above the boundary and half below, so it straddles rather than
		 * sitting on the row beneath.
		 *
		 * `translate` rather than a negative margin: the margin collapsed
		 * straight through the empty row and moved the row itself, which put
		 * two or three pixels of the same jerk back after taking five away.
		 * A translate is paint only and nothing in the flow can feel it.
		 */
		translate: 0 -2.5px;
		/* Never a thing the drag can hit-test against, only a thing it draws. */
		pointer-events: none;
	}

	.over {
		margin: 0 0 1rem var(--touch);
		opacity: 0.7;
		user-select: none;
		-webkit-user-select: none;
	}

	/* Flush with the real group titles: it is the same thing, one step earlier. */
	.new-group button,
	.new-group input {
		display: block;
		min-height: var(--touch);
		font-family: var(--hand);
		font-size: var(--size-title);
		text-align: left;
	}

	/* As faint as the rule under it: the two are one mark. */
	.new-group button {
		opacity: var(--faint);
	}

	.new-group input {
		outline: none;
		cursor: text;
	}

	.new-group button:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
