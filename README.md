# /listula

**Listula** is a shared checklist that runs in a web browser, mostly used for
groceries and small task lists. People share a list by exchanging a short
code. There are no accounts, tracking or analytics. Lists are encrypted on
the device, so the server stores only data it cannot read. The app works
offline and can be installed to a phone's home screen.

The design is deliberately plain: black ink on white paper, in a handwritten
typeface, with no labels, icons or help text. The only words on the sheet are
the ones its users wrote.

- Project page: [heracl.es/listula](https://heracl.es/listula)
- Demo: [listula.vercel.app](https://listula.vercel.app)
- Source: [github.com/arty2/listula](https://github.com/arty2/listula)

## Name

The name is the diminutive of _lista_, medieval Latin for "list", so it
means "a little list".

## Use

A list is a sheet of tasks arranged in groups. Tasks can be written, ticked
off, reordered or moved between groups. Whole groups can be folded away,
cleared or moved to another list. Quantities and prices written into a task
are read from the text and totalled for the group, but the text itself is
stored unchanged.

## Sharing

A list gets its code the first time it is synced, from the menu at the top
right. The code is twelve characters long. SHARE sends a link and the code
together, and COPY copies the code alone. The recipient enters the code
under JOIN. Joining never discards anything: the device's existing tasks
either go into the joined list or stay where they are, as a separate list.

The code is never placed in a URL. The link ends in `?j`, which only tells
the app that the visitor was sent a list. On that one visit, red marks show
where the code goes. They disappear once the code is entered or the visitor
does anything else.

Syncing is manual. Tapping SYNC sends local changes and fetches everyone
else's. Nothing is sent automatically.

## Gestures

Nothing on the sheet is labelled, so this section is the complete list of
what the app responds to. A long press is about half a second, and a double
tap is two taps within about a third of a second.

If this section and the app ever disagree, the app is right and this section
is out of date.

### Tasks

| Where       | Gesture             | Result                                             |
| ----------- | ------------------- | -------------------------------------------------- |
| Checkbox    | Tap                 | To-do ⇄ done                                       |
| Checkbox    | Double tap, or hold | Half done; holding a half-done task resets it      |
| Checkbox    | `Space` / `⇧Space`  | The same two                                       |
| Words       | Tap                 | Opens the task for editing, with the caret there   |
| Words       | Double tap          | Done                                               |
| Words       | Triple tap          | Half done                                          |
| Words       | Fourth tap          | Back as it was, open for editing                   |
| Words       | Pull left           | Done                                               |
| A done task | Pull left again     | Deletes it, with an undo                           |
| A done task | Tap the scribble    | Deletes it, with an undo                           |
| Words       | Hold, then drag     | Picks the task up, also into another group         |
| Words       | `F2`                | Opens the task for editing                         |
| Any part    | `Alt+↑` / `Alt+↓`   | Moves it, crossing into the next group at the ends |

Tapping near the end of a task only opens it, because that is usually
someone about to add to it. Inside a task that is already open, taps just
place the caret.

### Editing a task

| Gesture                     | Result                                                            |
| --------------------------- | ----------------------------------------------------------------- |
| `Enter`                     | Splits the task at the caret; the rest moves to a new task        |
| `Enter` at the start        | Opens an empty task above                                         |
| `Backspace` at the start    | Joins the task onto the one above, if both fit in one task        |
| `Backspace` on an empty row | Removes the row and moves to the task above, or to the group name |
| `Escape`                    | Discards the edit                                                 |
| Typing past 200 characters  | The task fills up and the rest starts a new one                   |

A countdown of the characters left appears in the last ten.

### Groups

| Where         | Gesture               | Result                                              |
| ------------- | --------------------- | --------------------------------------------------- |
| Title         | Tap                   | Folds or unfolds the group                          |
| Title         | Double tap, or `F2`   | Opens the name for editing                          |
| Title         | Short hold            | Opens the name; a buzz says when to let go          |
| Title         | Long hold, then drag  | Picks up the whole group; all groups fold meanwhile |
| Fold icon     | Tap                   | Folds or unfolds the group                          |
| Fold icon     | Hold                  | Folds every group, or unfolds all if all are folded |
| Name field    | `Enter`               | Saves; on an empty group, also opens its first task |
| New-group `…` | `Enter`               | Creates the group and opens its first task          |
| Carried group | Drop on the list name | Opens the other lists; drop on one to move it there |
| Carried group | Drop on `+ NEW LIST`  | Creates a new list containing the group             |
| Carried group | Drop on the corner    | Deletes the group and its tasks, with an undo       |

A folded group's icon reads `(1/3)`: tasks still to do, out of the total.
With nothing done it reads `(3)`.

The scribble beside a group appears only while its name is open or the group
is folded. It clears the done tasks, or deletes the group once everything in
it is done. Dragging a task onto the new-group row creates a group for it.

A list that a group was moved to is marked with an asterisk until the tab is
closed.

### The sheet and the menu

| Where      | Gesture                  | Result                                                          |
| ---------- | ------------------------ | --------------------------------------------------------------- |
| Sheet      | Drag right on bare paper | Turns the paper over to the menu                                |
| Menu       | Drag right anywhere      | Turns it back                                                   |
| Burger     | Tap                      | Turns the paper over, from either side                          |
| Burger     | Hold                     | Turns debug mode on                                             |
| Sync mark  | Tap                      | Syncs; the mark appears only when there is something to report  |
| List name  | Tap                      | Shows the other lists and `+ NEW LIST`                          |
| List name  | Double tap               | Opens the next list directly                                    |
| Theme mark | Tap                      | Switches between the opposite of the phone's theme and the same |
| Code field | Tap while empty          | Pastes a code from the clipboard                                |
| A message  | Tap `UNDO?`              | Undoes what the message describes                               |
| A message  | Flick up or right        | Dismisses it                                                    |
| A panel    | Drag down, `Esc`, or ✕   | Closes it                                                       |

Anything that removes something leaves a message with an undo for ten
seconds, and so does moving something by hand. LEAVE removes a list that has a code
from this device only. The same button reads DELETE when the list has no
code, because this device is then its only copy. Both ask first and can be
undone.

Ticking three tasks within five seconds offers to clear those three. It is
only an offer and is made once per run.

Debug mode outlines every element in red, keeps a log of sync attempts and
adds a language picker. A button in the menu turns it off.

### What the sheet reads

A number at the start of a task is a count (`2x apples`, `3 lemons`). A
number with a metric unit is an amount (`500g`, `1,5 kg`, `2L`, `250ml`), and
its price is not multiplied. Either can be a rising range (`2-3 oranges`), and a
range is totalled at its top. A number at the end is a price (`Bread 2,50`).
Both `,` and `.` work as decimal marks.

The group total is what is still to buy: done tasks are left out, half-done
ones count in full, and each price is multiplied by its count. Web and email
addresses become links that open in a new tab. None of this changes the
stored text.

## Limitations

- **The code is the only key.** There are no accounts and no recovery. If
  the code is lost, so is the shared list. EXPORT copies the list as
  Markdown and is the only backup.
- **Access cannot be revoked.** Anyone with the code can read and change the
  list. LEAVE removes it only from one device. If a code leaks, everyone has
  to move to a new one.
- **Unsynced changes stay on the device.** They reach nobody else and are lost
  with the device. An arrow in the corner shows when changes are waiting.
- **Unused lists expire.** A list not edited for six months is deleted from
  the server. Reading it does not count.
- **Encryption does not protect against the host.** It protects stored data,
  not against whoever serves the app's code. The server also does not stop
  someone who knows a list's address from overwriting it.
- **The first screen is in English.** The page is built in advance, so a
  phone set to Greek briefly shows English before switching.

## Typeface

The app uses one typeface, **Graphe Alpha**, drawn by the project's author
and released under the [SIL Open Font License](https://heracl.es/graphe/).
It has no `[`, `]`, `\` or `Ϋ`, so those characters fall back to another
face. Greek text is marked as Greek so that capitals drop their accents, as
Greek spelling requires.

---

_Dialectic Acheropoieton_  
_of Heracles Papatheodorou and Claude_
