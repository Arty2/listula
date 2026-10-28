/*
 * Every word the app says, in one place.
 *
 * Not a framework and not a runtime: this is one object of English, and `t` in
 * ./index.ts is a reference to it. There is no locale to select, no negotiation
 * with the browser, and nothing shipped to switch between catalogues — a second
 * language is a second file and a resolver written the day there is something to
 * put in it. Until then the indirection buys the two things that were actually
 * missing: every string can be read in one sitting, and none of them can be
 * changed in one component and left stale in another.
 *
 * Values are strings, or functions of a typed argument where a number or a name
 * has to go inside the sentence. A function rather than a template with holes
 * punched in it, because plural agreement is part of the sentence and not a
 * decoration on top of it — English needs the count to pick the words, and a
 * language with more forms than two needs it to pick more of them. `plural`
 * below is English's rule and English's alone; another catalogue brings its own.
 *
 * What is NOT here: anything the person typed. A task, a group title, a list
 * name and a code are content, and content is never translated — see
 * `doc.firstGroup`, which is the one place the two meet and is commented there.
 */

/** English has two forms and the boundary is one. Another language, another rule. */
function plural(count: number, one: string, many: string): string {
	return count === 1 ? one : many;
}

export const en = {
	/*
	 * Two strings that are written into the document rather than only drawn on
	 * the screen, which makes them the exception to everything above.
	 *
	 * `firstGroup` becomes a real group title the moment anything is written on
	 * a fresh sheet, and that title syncs, exports and merges like any other. So
	 * a phone in another language would put its own word on somebody else's
	 * list. That is the correct behaviour for a default — it is a name the
	 * person is free to change, not a label the app is insisting on — but it is
	 * worth knowing before a second catalogue exists.
	 *
	 * It is the app's own name, which is a little list and so is already the
	 * word for what the group is — and unlike everything else here, that makes
	 * it the one string a second catalogue does *not* leave alone. Every other
	 * leaf is a sentence the app is saying; this one is the app naming itself,
	 * the way a person opening their first list in Greek would call it
	 * Λιστούλα rather than Listula. A name is still not looked up or declined
	 * by anything that reads it — el.ts simply writes its own word here, once,
	 * the same as it writes every other leaf.
	 *
	 * `looseEnds` never syncs: it is assembled on read and is only ever an
	 * accessible name. See src/lib/doc/view.ts.
	 */
	doc: {
		firstGroup: 'Listula',
		looseEnds: 'Loose ends'
	},

	task: {
		/** The row's own delete, offered only once the task is done. */
		delete: 'Delete task',
		new: 'New task',
		add: 'Add a task'
	},

	group: {
		new: 'New group',
		add: 'Add a group',
		title: 'Group title',
		untitled: 'Untitled group',
		/*
		 * The same fact in the middle of a sentence rather than as a name, so it
		 * is lower case and reads as a phrase: "Deleted the untitled group."
		 * Two strings and not one, because a language that inflects would need
		 * two anyway and English only looks as though it does not.
		 *
		 * Unquoted, unlike `named` below, because it is a description and not a
		 * name — there is nothing here anybody typed to set apart.
		 */
		untitledInSentence: 'the untitled group',
		/*
		 * A title somebody typed, quoted, wherever it is dropped into a sentence
		 * the app is saying. Without the quotes a message reads "Deleted
		 * Weekend and 3 done" and the eye has to find where the name stopped —
		 * and a group called "and" or "done" makes a sentence out of nothing.
		 * Curly quotes, as everywhere else here.
		 */
		named: ({ title }: { title: string }) => `“${title}”`,
		expand: 'Expand group',
		collapse: 'Collapse group',
		/*
		 * One mark in the gutter, two things to call it. It removes the group
		 * once every task in it is done, and until then it clears the ones that
		 * are — so what it is named has to say which of the two a tap would do.
		 * It is not offered at all when it would do neither.
		 */
		delete: 'Delete group',
		clear: 'Clear done tasks'
	},

	sheet: {
		/** Over the hundred: what is there, against what fits. */
		over: ({ count, max }: { count: number; max: number }) => `${count} of ${max} — clear some`,
		movedToNewGroup: 'Moved to a new group.',
		/*
		 * Where a whole group went, for a screen reader. The toast beside it
		 * says the same thing on the paper — a group leaving the sheet
		 * altogether is the one move whose result cannot be looked at, since
		 * what it went to is not on this screen.
		 */
		movedToList: ({ list }: { list: string }) => `Moved to ${list}.`,
		movedToNewList: 'Moved to a new list.',
		movedWithin: ({ position, group }: { position: number; group: string }) =>
			`Moved to position ${position} in ${group}.`,
		movedTo: ({ group, position }: { group: string; position: number }) =>
			`Moved to ${group}, position ${position}.`,
		/** A long press on any one fold icon takes every group with it. */
		foldedAll: 'Every group folded.',
		unfoldedAll: 'Every group opened.'
	},

	toast: {
		deleted: 'Deleted.',
		/*
		 * The same verb a task's own message uses, and the same verb as the
		 * button that did it: the mark in the gutter reads DELETE GROUP, and a
		 * message answering it with "Removed" is a second word for one act. A
		 * task says only "Deleted." because there is nothing about it worth
		 * repeating; a group names itself, because what went with it is a whole
		 * heading and everything that was filed under it.
		 */
		deletedGroup: ({ what }: { what: string }) => `Deleted ${what}.`,
		/** A deleted group says how many finished tasks went with it. */
		deletedWithDone: ({ what, count }: { what: string; count: number }) =>
			`${what} and ${count} done`,
		/*
		 * And a group carried to the corner says how many tasks did, done or
		 * not. The header's mark is only ever drawn on a group with nothing left
		 * to do, so "and 3 done" is the whole truth there; the fold takes a group
		 * in whatever state it is in, and counting only the finished ones would
		 * report less than went.
		 */
		deletedWithTasks: ({ what, count }: { what: string; count: number }) =>
			`${what} and ${count} ${plural(count, 'task', 'tasks')}`,
		cleared: ({ count }: { count: number }) => `Cleared ${count}.`,
		/** A move is the one change a finger makes that it cannot see undone. */
		moved: 'Moved.',
		/*
		 * A group carried off this list and onto another one. Named, unlike
		 * every other move, because the thing that moved is no longer on the
		 * sheet to be seen: "Moved." alone would leave the reader looking for
		 * a group that is on a different list.
		 */
		movedToList: ({ what }: { what: string }) => `Moved to ${what}.`,
		movedToNewList: 'Moved to a new list.',
		/** Storage refused the list being sent to, so nothing moved. */
		couldNotMove: 'Couldn’t move it. This device wouldn’t store it.',
		/*
		 * A run of ticks, and the offer to sweep it. Not "UNDO?": the run is not
		 * a mistake to be taken back, it is work finished with, and what the
		 * message offers is to put it away.
		 */
		doneRun: ({ count }: { count: number }) => `${count} ${plural(count, 'thing', 'things')} done.`,
		clear: 'CLEAR?',
		copied: ({ count }: { count: number }) => `Copied ${count} ${plural(count, 'task', 'tasks')}.`,
		nothingToCopy: 'Nothing to copy yet.',
		couldNotCopy: 'Couldn’t copy.',
		added: ({ count }: { count: number }) => `Added ${count}.`,
		addedSkipped: ({ count, skipped }: { count: number; skipped: number }) =>
			`Added ${count}, skipped ${skipped} already there.`,
		left: 'Left this device.',
		/*
		 * The other half of the button that says LEAVE or DELETE. A list with no
		 * code was nowhere but here, so it was not left anywhere — it is gone,
		 * and the message may not soften that.
		 */
		deletedList: 'Deleted this list.',
		synced: 'Synced.',
		undo: 'UNDO?',
		/*
		 * Written from LIMITS rather than typed out, which two of these used not
		 * to be: the sheet interpolated the number and the page spelled it, so
		 * raising a limit moved one message and left the other lying.
		 */
		overTasks: ({ max }: { max: number }) => `That would go over ${max} tasks — clear some first.`,
		overGroups: ({ max }: { max: number }) => `That would go over ${max} groups.`
	},

	menu: {
		label: 'Menu',
		close: 'Close',
		syncing: 'Syncing…',
		syncNow: 'Sync now',
		syncCooling: ({ seconds }: { seconds: number }) => `Sync now (${seconds})`,
		thisList: 'This list',
		share: 'Share',
		copy: 'Copy',
		copied: 'Copied',
		codeIsShared: 'Anyone with this code can read and change the list.',
		neverSynced: 'Only on this device. Sync it to get a code you can share.',
		import: 'Import',
		export: 'Export',
		/*
		 * One button, two acts. With a code the list carries on without this
		 * device and can be come back to, which is leaving; without one this
		 * device is the only place it has ever been, and there is nothing to
		 * leave it to.
		 */
		leave: 'Leave',
		delete: 'Delete',
		joinList: 'Join list',
		code: 'Code',
		badCode: 'That doesn’t look like a code.',
		takeThem: 'Take them',
		leaveThem: 'Leave them',
		cancel: 'Cancel',
		join: 'Join',
		/*
		 * Joining with tasks already here is never decided silently — and
		 * leaving them behind leaves them where they are, on the list they are
		 * on, which stays on this device beside the one being joined. The
		 * question said "leave them behind" while the app discarded them; the
		 * words were right and the app was not.
		 */
		joinAsk: ({ count }: { count: number }) =>
			`You have ${count} ${plural(count, 'task', 'tasks')} here. Take them to the other list, or leave them on this one and keep both?`,
		/*
		 * "Debug" and not "Debug log": it now also outlines every box on the
		 * page, and a button that does two things cannot be named after one.
		 */
		debug: ({ on }: { on: boolean }) => `Debug: ${on ? 'On' : 'Off'}`,
		debugLog: 'Debug log',
		/**
		 * The debug picker's own accessible name — see language.svelte.ts. Only
		 * ever on screen with the log beside it, and gone the moment debug is.
		 */
		language: 'Language',
		credit: 'Dialectic Acheropoieton',
		/*
		 * A hard space before the last name, so the two authors are never split
		 * across a line break with one of them left hanging alone.
		 */
		creditOf: 'of Heracles Papatheodorou and\u00a0Claude',
		creditHome: 'heracl.es/listula'
	},

	lists: {
		label: 'Lists',
		new: 'New list',
		/** A list that has never left this device has no code to show. */
		localOnly: 'Local only, never synced',
		/*
		 * What the asterisk beside a list's name says. A group carried onto
		 * another list is the one change here that cannot then be looked at, so
		 * the mark stands until the tab is closed — and read aloud it has to be
		 * the fact rather than the punctuation.
		 */
		arrived: 'Something new arrived',
		/*
		 * A list's name, quoted, wherever the app says it back — the same rule
		 * a group's name follows, and for the same reason: a list is named
		 * after its first group, so it is a title somebody typed and the
		 * sentence has to say where it stops.
		 */
		named: ({ name }: { name: string }) => `“${name}”`
	},

	/*
	 * The guidance drawn over the page for somebody who arrived on an
	 * invitation, and the only words this app says about itself.
	 *
	 * Two of them are on the screen, one on each face. `join` stands at the far
	 * end of the arrow pointing at the burger, and it is word for word what
	 * `menu.joinList` says — it names the section the arrow leads to, so an
	 * arrow that promised anything else would send somebody looking for a
	 * heading the panel does not have. `paste` stands under the ring round the
	 * code field and says what a finger there will get, since an empty field
	 * pastes on a tap: the ring says which thing, and no arrow can say what to
	 * do with what it lands on.
	 *
	 * `said` is the whole of the same guidance for somebody who cannot see a
	 * red arrow, which is why it is a sentence: speech has no corner of the
	 * screen to point at. Announced once, on arrival, and never drawn.
	 */
	guide: {
		join: 'Join list',
		paste: 'Paste here',
		said: 'You were sent a list. Open the menu at the top right, then paste the code under Join list.'
	},

	theme: {
		dark: 'Theme — dark',
		light: 'Theme — light',
		system: 'Theme — following the phone',
		/*
		 * Three sentences rather than one with the choice interpolated into it.
		 * The old form put a raw enum value inside English — `Theme now dark.` —
		 * which reads only by luck and would not survive a translation at all.
		 */
		nowDark: 'Theme now dark.',
		nowLight: 'Theme now light.',
		nowSystem: 'Theme now follows the phone.'
	},

	sync: {
		nothingWaiting: 'Nothing is waiting to go.',
		everythingSynced: 'Everything is synced.',
		waiting: ({ count }: { count: number }) =>
			count === 1 ? '1 change is waiting to go.' : `${count} changes are waiting to go.`,
		/** Agrees with the count above it. One change is an "it". */
		unseen: ({ count }: { count: number }) =>
			count === 1
				? 'Nobody else can see it until you sync.'
				: 'Nobody else can see them until you sync.',
		refused: 'The list’s own server turned the last attempt away.',
		unreachable: 'The list could not be reached last time. Everything is safe on this device.',

		/** The corner button's accessible name, which is the whole of what it says. */
		buttonOffline: 'Sync — no connection last time',
		buttonStale: 'Sync — not synced for a while',
		buttonWaiting: ({ count }: { count: number }) =>
			count === 1 ? 'Sync — 1 change waiting to go' : `Sync — ${count} changes waiting to go`,

		/** What went wrong, when something did. */
		errorOffline: 'Couldn’t reach the list — your changes are saved here.',
		/*
		 * Naming the code is the point: it is the only thing that says whether
		 * the route is missing or its store is.
		 */
		errorRefused: ({ code }: { code: number }) =>
			`The list’s server answered ${code}. Nothing here was lost.`,
		errorWrongCode: 'That code doesn’t match a list.',
		errorDamaged: 'That list looks damaged.',
		errorTooLarge: 'This list is too big to send — clear some.',
		errorBusy: 'Couldn’t sync — try again in a moment.',
		errorOther: ({ message }: { message: string }) => `Something went wrong: ${message}`
	},

	import: {
		title: 'Import',
		field: 'Markdown to import',
		empty: 'Paste a list — one thing per line, or a markdown checklist.',
		fromClipboard: 'From your clipboard. Edit it here if anything is off.',
		/*
		 * Why it was turned away, when it was. A data file and a web page both
		 * come out of a line-by-line read as a heap of punctuation, so they are
		 * refused rather than imported — and saying which it was is the
		 * difference between a rule and a shrug.
		 */
		refusedJson: 'That looks like a data file, not a list.',
		refusedHtml: 'That looks like a web page, not a list.',
		refusedOther: 'That doesn’t look like a task list.',
		summary: ({ tasks, groups }: { tasks: number; groups: number }) =>
			`Add ${tasks} ${plural(tasks, 'task', 'tasks')} in ${groups} ${plural(groups, 'group', 'groups')}?`,
		replaceAll: 'Replace All',
		add: 'Add'
	},

	confirm: {
		cancel: 'Cancel',
		leaveTitle: 'Leave this list',
		leaveConfirm: 'Leave',
		/** The same two acts the button is named for — see `menu.delete`. */
		deleteTitle: 'Delete this list',
		deleteConfirm: 'Delete',
		leaveBody: ({ code }: { code: string }) =>
			`This leaves the list off this phone. Everyone else keeps it. To come back you'll need the code — ${code}. This is the last screen it exists on.`,
		leaveUnsent: ({ count }: { count: number }) =>
			`You have ${count} ${plural(count, 'change', 'changes')} that never reached anyone else; those go too.`,
		/*
		 * Never synced, so there is no code to write down and nobody else
		 * holding a copy. Offering one last look at a code would be offering
		 * nothing.
		 */
		leaveBodyNoCode:
			'This list has never been synced, so it is nowhere but here. Deleting takes all of it with it, and there is no code to come back with.'
	}
} as const;

/*
 * `as const` above is what lets every leaf be checked against the sentence
 * actually written — `toast.clear` is the literal type `'CLEAR?'`, not the
 * general `string`, so a stray edit to one spelling and not the other would
 * fail a comparison naming exactly which. That precision is wasted on a
 * second catalogue, which is a different sentence at every leaf on purpose:
 * held to `typeof en` directly, el.ts would fail to compile the moment it
 * wrote anything but 'CLEAR?' back. `Widen` throws away only the literal-ness
 * of a leaf, never its shape — a plain string stays a plain string, and a
 * function keeps its exact parameter types and has only its return value
 * widened, recursively, for the leaves that build a sentence from a bare
 * ternary rather than through `plural()` and so would otherwise still return
 * one of English's own two literal sentences. `Messages` still catches a
 * missing leaf, a renamed one, or an argument of the wrong shape, and only
 * that.
 */
type Widen<T> = T extends (...args: infer Args) => infer Return
	? (...args: Args) => Widen<Return>
	: T extends string
		? string
		: T extends object
			? { -readonly [K in keyof T]: Widen<T[K]> }
			: T;

/** The shape every catalogue has to have — see the comment above `Widen`. */
export type Messages = Widen<typeof en>;
