import type { Messages } from './en';

/*
 * The Greek catalogue. Same shape as en.ts, leaf for leaf — `Messages` is
 * derived from the English one, so a string missing here is a type error
 * naming exactly where, not a `???` reaching a phone.
 *
 * Two things every leaf here works around that en.ts's `plural` did not have
 * to. First, the Greek question mark is `;`, not `?` — every English "?"
 * below is that character, not a semicolon left behind by mistake. Second,
 * a passive verb agrees in number with what follows it ("Διαγράφηκε" one
 * thing, "Διαγράφηκαν" more than one), which English's own "Deleted" does
 * not, so several leaves below branch on `count` where the English original
 * did not need to.
 *
 * `doc.firstGroup` is the one leaf that is not a translated sentence but the
 * app naming itself — see the long comment beside it in en.ts.
 */

/** Greek's own rule: one form for exactly one, another for everything else. */
function plural(count: number, one: string, many: string): string {
	return count === 1 ? one : many;
}

export const el = {
	doc: {
		firstGroup: 'Λιστούλα',
		looseEnds: 'Σκόρπιες άκρες'
	},

	task: {
		delete: 'Διαγραφή εργασίας',
		new: 'Νέα εργασία',
		add: 'Προσθήκη εργασίας'
	},

	group: {
		new: 'Νέα ομάδα',
		add: 'Προσθήκη ομάδας',
		title: 'Τίτλος ομάδας',
		untitled: 'Ομάδα χωρίς τίτλο',
		untitledInSentence: 'η ομάδα χωρίς τίτλο',
		named: ({ title }: { title: string }) => `«${title}»`,
		expand: 'Ανάπτυξη ομάδας',
		collapse: 'Σύμπτυξη ομάδας',
		delete: 'Διαγραφή ομάδας',
		clear: 'Εκκαθάριση ολοκληρωμένων'
	},

	sheet: {
		over: ({ count, max }: { count: number; max: number }) =>
			`${count} από ${max} — καθαρίστε μερικά`,
		movedToNewGroup: 'Μετακινήθηκε σε νέα ομάδα.',
		movedToList: ({ list }: { list: string }) => `Μετακινήθηκε στη λίστα ${list}.`,
		movedToNewList: 'Μετακινήθηκε σε νέα λίστα.',
		movedWithin: ({ position, group }: { position: number; group: string }) =>
			`Μετακινήθηκε στη θέση ${position} στην ομάδα ${group}.`,
		movedTo: ({ group, position }: { group: string; position: number }) =>
			`Μετακινήθηκε στην ομάδα ${group}, θέση ${position}.`,
		foldedAll: 'Όλες οι ομάδες συμπτύχθηκαν.',
		unfoldedAll: 'Όλες οι ομάδες αναπτύχθηκαν.'
	},

	toast: {
		deleted: 'Διαγράφηκε.',
		deletedGroup: ({ what }: { what: string }) => `Διαγράφηκε ${what}.`,
		deletedWithDone: ({ what, count }: { what: string; count: number }) =>
			`${what} και ${count} ολοκληρωμένα`,
		deletedWithTasks: ({ what, count }: { what: string; count: number }) =>
			`${what} και ${count} ${plural(count, 'εργασία', 'εργασίες')}`,
		cleared: ({ count }: { count: number }) =>
			count === 1 ? `Καθαρίστηκε ${count}.` : `Καθαρίστηκαν ${count}.`,
		moved: 'Μετακινήθηκε.',
		movedToList: ({ what }: { what: string }) => `Μετακινήθηκε στη λίστα ${what}.`,
		movedToNewList: 'Μετακινήθηκε σε νέα λίστα.',
		couldNotMove: 'Δεν ήταν δυνατή η μετακίνηση. Η συσκευή δεν την αποθήκευσε.',
		doneRun: ({ count }: { count: number }) =>
			`${count} ${plural(count, 'πράγμα έγινε', 'πράγματα έγιναν')}.`,
		clear: 'ΕΚΚΑΘΑΡΙΣΗ;',
		copied: ({ count }: { count: number }) =>
			`${count === 1 ? 'Αντιγράφηκε' : 'Αντιγράφηκαν'} ${count} ${plural(count, 'εργασία', 'εργασίες')}.`,
		nothingToCopy: 'Δεν υπάρχει ακόμα τίποτα για αντιγραφή.',
		couldNotCopy: 'Δεν ήταν δυνατή η αντιγραφή.',
		added: ({ count }: { count: number }) =>
			count === 1 ? `Προστέθηκε ${count}.` : `Προστέθηκαν ${count}.`,
		addedSkipped: ({ count, skipped }: { count: number; skipped: number }) =>
			`${count === 1 ? 'Προστέθηκε' : 'Προστέθηκαν'} ${count}, παραλείφθηκαν ${skipped} που υπήρχαν ήδη.`,
		left: 'Έφυγε από αυτή τη συσκευή.',
		deletedList: 'Διαγράφηκε αυτή η λίστα.',
		synced: 'Συγχρονίστηκε.',
		undo: 'ΑΝΑΙΡΕΣΗ;',
		overTasks: ({ max }: { max: number }) =>
			`Αυτό θα ξεπερνούσε τις ${max} εργασίες — καθαρίστε μερικές πρώτα.`,
		overGroups: ({ max }: { max: number }) => `Αυτό θα ξεπερνούσε τις ${max} ομάδες.`
	},

	menu: {
		label: 'Μενού',
		close: 'Κλείσιμο',
		syncing: 'Συγχρονισμός…',
		syncNow: 'Συγχρονισμός τώρα',
		syncCooling: ({ seconds }: { seconds: number }) => `Συγχρονισμός τώρα (${seconds})`,
		thisList: 'Αυτή η λίστα',
		share: 'Κοινοποίηση',
		copy: 'Αντιγραφή',
		copied: 'Αντιγράφηκε',
		codeIsShared: 'Όποιος έχει αυτόν τον κωδικό μπορεί να διαβάσει και να αλλάξει τη λίστα.',
		neverSynced:
			'Μόνο σε αυτή τη συσκευή. Συγχρονίστε τη για να αποκτήσετε κωδικό που μπορείτε να μοιραστείτε.',
		import: 'Εισαγωγή',
		export: 'Εξαγωγή',
		leave: 'Αποχώρηση',
		delete: 'Διαγραφή',
		joinList: 'Συμμετοχή σε λίστα',
		code: 'Κωδικός',
		badCode: 'Αυτό δεν μοιάζει με κωδικό.',
		takeThem: 'Πάρτε τις',
		leaveThem: 'Αφήστε τις',
		cancel: 'Ακύρωση',
		join: 'Συμμετοχή',
		joinAsk: ({ count }: { count: number }) =>
			`Έχετε ${count} ${plural(count, 'εργασία', 'εργασίες')} εδώ. Να τις πάρετε στην άλλη λίστα, ή να τις αφήσετε σε αυτή και να κρατήσετε και τις δύο;`,
		debug: ({ on }: { on: boolean }) => `Debug: ${on ? 'Ενεργό' : 'Ανενεργό'}`,
		debugLog: 'Καταγραφή Debug',
		language: 'Γλώσσα',
		/*
		 * The credit is a title, not a sentence — see menu.credit in en.ts. A
		 * title is not translated, the same reasoning group and list names are
		 * content rather than words the app says.
		 */
		credit: 'Dialectic Acheropoieton',
		/*
		 * The names transliterate — Ηρακλής Παπαθεοδώρου is the Greek spelling
		 * heracl.es/Heracles Papatheodorou already comes from — but Claude does
		 * not, the same way Listula's own name is not run through the Latin
		 * alphabet's rules when it appears in an English sentence.
		 */
		creditOf: 'του Ηρακλή Παπαθεοδώρου και του Claude',
		creditHome: 'heracl.es/listula'
	},

	lists: {
		label: 'Λίστες',
		new: 'Νέα λίστα',
		localOnly: 'Μόνο τοπικά, ποτέ δεν συγχρονίστηκε',
		arrived: 'Ήρθε κάτι νέο',
		named: ({ name }: { name: string }) => `«${name}»`
	},

	/*
	 * `join` is not translated freely: it is the word written at the far end of
	 * the arrow pointing at the burger, and what it names is the section the
	 * arrow leads to — so it is word for word what `menu.joinList` says, or the
	 * arrow sends somebody to look for a heading the panel does not have.
	 *
	 * Set in caps by the stylesheet, never in JS, so the tonos drops on its own
	 * — the page's own `lang` is the catalogue's language (see +layout.svelte),
	 * and ΣΥΜΜΕΤΟΧΗ ΣΕ ΛΙΣΤΑ comes out right without a `lang` written here.
	 */
	guide: {
		join: 'Συμμετοχή σε λίστα',
		/*
		 * Under the ring, and an imperative the way the English is: it names
		 * what a finger on the empty field will get, not what the field is
		 * called. Singular — one person is being spoken to, and it is the
		 * same register the rest of this catalogue uses.
		 */
		paste: 'Επικόλληση εδώ',
		said: 'Σου έστειλαν μια λίστα. Άνοιξε το μενού πάνω δεξιά και επικόλλησε τον κωδικό κάτω από τη Συμμετοχή σε λίστα.'
	},

	theme: {
		dark: 'Θέμα — σκοτεινό',
		light: 'Θέμα — φωτεινό',
		system: 'Θέμα — ακολουθεί το κινητό',
		nowDark: 'Το θέμα είναι πλέον σκοτεινό.',
		nowLight: 'Το θέμα είναι πλέον φωτεινό.',
		nowSystem: 'Το θέμα ακολουθεί πλέον το κινητό.'
	},

	sync: {
		nothingWaiting: 'Δεν υπάρχει τίποτα σε αναμονή.',
		everythingSynced: 'Όλα είναι συγχρονισμένα.',
		waiting: ({ count }: { count: number }) =>
			count === 1 ? '1 αλλαγή είναι σε αναμονή.' : `${count} αλλαγές είναι σε αναμονή.`,
		unseen: ({ count }: { count: number }) =>
			count === 1
				? 'Κανείς άλλος δεν μπορεί να τη δει μέχρι να συγχρονίσετε.'
				: 'Κανείς άλλος δεν μπορεί να τις δει μέχρι να συγχρονίσετε.',
		refused: 'Ο διακομιστής της λίστας απέρριψε την τελευταία προσπάθεια.',
		unreachable:
			'Η λίστα δεν ήταν προσβάσιμη την τελευταία φορά. Όλα είναι ασφαλή σε αυτή τη συσκευή.',

		buttonOffline: 'Συγχρονισμός — καμία σύνδεση την τελευταία φορά',
		buttonStale: 'Συγχρονισμός — δεν έχει συγχρονιστεί εδώ και καιρό',
		buttonWaiting: ({ count }: { count: number }) =>
			count === 1
				? 'Συγχρονισμός — 1 αλλαγή σε αναμονή'
				: `Συγχρονισμός — ${count} αλλαγές σε αναμονή`,

		errorOffline: 'Δεν ήταν δυνατή η πρόσβαση στη λίστα — οι αλλαγές σας είναι αποθηκευμένες εδώ.',
		errorRefused: ({ code }: { code: number }) =>
			`Ο διακομιστής της λίστας απάντησε ${code}. Τίποτα δεν χάθηκε εδώ.`,
		errorWrongCode: 'Αυτός ο κωδικός δεν αντιστοιχεί σε καμία λίστα.',
		errorDamaged: 'Αυτή η λίστα φαίνεται κατεστραμμένη.',
		errorTooLarge: 'Αυτή η λίστα είναι πολύ μεγάλη για αποστολή — καθαρίστε μερικά.',
		errorBusy: 'Δεν ήταν δυνατός ο συγχρονισμός — δοκιμάστε ξανά σε λίγο.',
		errorOther: ({ message }: { message: string }) => `Κάτι πήγε στραβά: ${message}`
	},

	import: {
		title: 'Εισαγωγή',
		field: 'Markdown προς εισαγωγή',
		empty: 'Επικολλήστε μια λίστα — ένα πράγμα ανά γραμμή, ή λίστα ελέγχου markdown.',
		fromClipboard: 'Από το πρόχειρό σας. Επεξεργαστείτε το εδώ αν κάτι δεν είναι σωστό.',
		refusedJson: 'Αυτό μοιάζει με αρχείο δεδομένων, όχι λίστα.',
		refusedHtml: 'Αυτό μοιάζει με ιστοσελίδα, όχι λίστα.',
		refusedOther: 'Αυτό δεν μοιάζει με λίστα εργασιών.',
		summary: ({ tasks, groups }: { tasks: number; groups: number }) =>
			`Προσθήκη ${tasks} ${plural(tasks, 'εργασίας', 'εργασιών')} σε ${groups} ${plural(groups, 'ομάδα', 'ομάδες')};`,
		replaceAll: 'Αντικατάσταση όλων',
		add: 'Προσθήκη'
	},

	confirm: {
		cancel: 'Ακύρωση',
		leaveTitle: 'Αποχώρηση από αυτή τη λίστα',
		leaveConfirm: 'Αποχώρηση',
		deleteTitle: 'Διαγραφή αυτής της λίστας',
		deleteConfirm: 'Διαγραφή',
		leaveBody: ({ code }: { code: string }) =>
			`Αυτό αφαιρεί τη λίστα από αυτό το κινητό. Όλοι οι υπόλοιποι τη διατηρούν. Για να επιστρέψετε θα χρειαστείτε τον κωδικό — ${code}. Αυτή είναι η τελευταία οθόνη στην οποία υπάρχει.`,
		leaveUnsent: ({ count }: { count: number }) =>
			`Έχετε ${count} ${plural(count, 'αλλαγή', 'αλλαγές')} που δεν έφτασαν ποτέ σε κανέναν άλλον· φεύγουν κι αυτές.`,
		leaveBodyNoCode:
			'Αυτή η λίστα δεν έχει συγχρονιστεί ποτέ, οπότε δεν υπάρχει πουθενά αλλού. Η διαγραφή την παίρνει ολόκληρη μαζί της, και δεν υπάρχει κωδικός για να επιστρέψετε.'
	}
} satisfies Messages;
