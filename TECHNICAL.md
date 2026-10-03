# Technical notes

The detail that didn't belong in the README: how to run and contribute to the
project, the full gesture reference for an app that labels nothing, the CI
pipeline and the gates it runs, how to stand up a second deployment, and a
couple of smaller implementation notes. See [README.md](./README.md) for what
the thing is.

## Running it

```
pnpm install
pnpm dev
```

| Command          | Does                                                |
| ---------------- | --------------------------------------------------- |
| `pnpm check`     | `svelte-check` against the strict tsconfig          |
| `pnpm lint`      | Prettier and ESLint                                 |
| `pnpm gates`     | Project rules a linter can't enforce — see below    |
| `pnpm quick`     | Gates, types and unit tests — no browser, no build  |
| `pnpm test:unit` | Vitest, including the merge property tests          |
| `pnpm test:e2e`  | Playwright against a production build on port 4173  |
| `pnpm test`      | Gates, unit tests and end-to-end tests in one go    |
| `pnpm build`     | Production build through `@sveltejs/adapter-vercel` |

`pnpm quick` is the one to run while working: it answers in about a quarter of
a minute because it never starts a browser. `pnpm test` is what to run before
asking for a change to land. Nothing deploys from Actions.

## Contributing

Open a pull request as a draft and leave it there while you work, then mark it
ready for review once you actually want it merged. That is what decides which
half of CI runs, and the full suite has to pass before anything lands on
`main`.

### CI

CI is two jobs, and which of them runs is decided by whether the pull request
is a draft.

|                              | Runs                                                                                          | Takes |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ----- |
| Draft pull request           | `check` — gates, types, lint, unit                                                            | ~40s  |
| Ready for review, and `main` | `check` **and** `full` — the above plus Playwright, the bundle budget and `pnpm audit --prod` | ~90s  |

A draft gets the short answer on every push, which is the one that catches the
ordinary mistake: a type error, a lint failure, a broken gate, a unit test.
Marking it ready is what runs the whole suite, before it can be merged.

Marking it ready is not optional politeness — `full` is the only thing that
runs Playwright, so a pull request that never leaves draft has never had its
end-to-end tests run. `main` always runs both, which is the net under all of
this.

The full suite can also be asked for by hand from the Actions tab
(`workflow_dispatch`) without marking anything ready.

Two more things decide whether CI runs at all. A commit touching only `.md`
files is skipped, since prose cannot break a build — so a README-only change
shows no checks, and that is correct rather than stuck. And a newer push
cancels the run still going for the older one, because it says everything the
older one did.

## The gates

`scripts/gates.sh` fails the build on things that would otherwise only be
written down: any route from a string to markup (`{@html}`, `innerHTML`,
`eval(`, and the rest), an API route importing from `src/lib/crypto`, a
`PUBLIC_` environment variable whose name looks like a secret, a committed
raster asset or non-woff2 font, and shadows, background-images or `<img>`
elements anywhere in `src`.

The PWA's raster icons are the one exception, and they are drawn by
`scripts/icons.ts` at build time from the same primitives as everything else
on the sheet. The gate exempts `static/icons` only while that directory is
gitignored — otherwise the exemption would become the place to hide an image.

## Gestures

Nothing on the sheet is labelled, so this is the whole of what it answers to.
Most of it is one tap doing the common thing; the rest is a long press —
about half a second — a second tap inside a third of one, or a pull sideways.

Everything below is a live record: if a gesture here disagrees with the app,
the app is right and this file is a bug. A change to any interaction is not
finished until this section says so, in the same commit.

### A task

| Where          | Gesture            | What happens                                              |
| -------------- | ------------------ | --------------------------------------------------------- |
| The checkbox   | Tap                | To-do ⇄ done                                              |
| The checkbox   | Two taps, or hold  | Half done. Holding a half-done task puts it back to to-do |
| The checkbox   | `Space` / `⇧Space` | The same two                                              |
| The words      | Tap                | Opens the row for editing, caret where you touched        |
| The words      | Two taps           | Marks it done                                             |
| The words      | Three taps         | Marks it half done                                        |
| The words      | Four taps          | Back to where it started, and open for editing again      |
| The words      | Pull it leftwards  | Marks it done                                             |
| A done task    | Pull it again      | Deletes it, with an undo                                  |
| The words      | Hold, then drag    | Picks the task up, including into another group           |
| The words      | `F2`               | Opens the row for editing                                 |
| A done task    | Tap the mark       | Deletes it, with an undo                                  |
| Anywhere on it | `Alt+↑` / `Alt+↓`  | Moves it, across group boundaries at the ends             |

Pulling a row leftwards pushes the words towards the box at the head of it,
and the box takes the tick. The row gives as far as the margin the writing is
held off the paper's drawn edge by and then stops; the hand carries on, and
the tick lands where it gets to — under the finger, with a buzz, rather than
waiting for it to come up. A half-done row is finished off, as tapping its box
would.

Pull a row that is already done and it goes, with the same ten-second `UNDO?`
the mark in the gutter leaves — the two ways out of a finished row, one for a
hand already moving and one for a hand that is not. Neither replaces the
other: the mark is there through both pulls. Nothing is offered on a row that
is not done, which is the rule the mark itself follows.

Rightwards is not any of this: that is the sheet turning over, and it only
takes hold on bare paper.

A run of taps that begins in the last few characters of a task never climbs
that ladder — reaching for the end of a line means adding to it, so two taps
there are two attempts at the same thing rather than a tick. A run that begins
inside an already-open field is left alone too, since that is a caret being
placed.

### While a row is open

| Gesture                     | What happens                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `Enter`                     | Cuts the task at the caret; the rest goes to a new row, caret at its head                      |
| `Enter` at the start        | The writing goes down a row and an empty one opens above it                                    |
| `Backspace` at the start    | Joins the task onto the end of the one above, caret at the seam                                |
| `Backspace` on an empty row | The row goes, caret to the end of the one above — or to the group's name, if it opened the row |
| `Escape`                    | Discards and closes                                                                            |
| Overflow                    | At 200 characters the row fills up and the rest starts the next one                            |

Nothing is ever refused mid-sentence. A word travels whole, and a paste spills
by the same rule as typing. A row that ran out of room is the one exception to
where the caret lands: it is still being typed at its end, so the caret stays
behind what came down rather than in front of it.

A row still being typed answers to all of this the same way a committed task
does — on the sheet they are the same thing, one line of writing with a box
beside it — except that it leaves without anything being deleted.

A join happens only if the two will fit in one task — a row that filled up and
spilled cannot be poured back into the row it came from, and then the key does
nothing at all. Joining takes nothing away, so there is no message and no undo:
the words are all still on the sheet, a line higher.

An open row's checkbox is drawn faintly while the row is empty, and in full ink
the moment there is something written in it.

### A group

| Where             | Gesture              | What happens                                                    |
| ----------------- | -------------------- | --------------------------------------------------------------- |
| The title         | Tap                  | Folds the group                                                 |
| The title         | Two taps, `F2`       | Opens the name, leaving the group folded as it found it         |
| The title         | Hold briefly         | Opens the name too — a buzz says when to let go                 |
| The title         | Hold on              | Picks the whole group up; everything folds while it is carried  |
| A carried group   | Over the list name   | Opens the lists it could go to                                  |
| A carried group   | Drop on a list       | Moves it to that list, with everything in it                    |
| A carried group   | Drop on `+ NEW LIST` | Makes a list on this device and puts it there                   |
| A carried group   | Drop on the fold     | Removes it, with everything in it                               |
| A carried group   | Over the corner      | The bin comes alive, so the fold says what letting go would do  |
| The `(…)` icon    | Tap                  | Folds the group, for anyone who would rather aim at it          |
| The `(…)` icon    | Hold                 | Folds **every** group — or opens them all, if none is left open |
| The name field    | `Enter`              | Commits — and on an empty group, opens its first task           |
| The new-group `…` | `Enter`              | Makes the group and opens its first task                        |

The title's press has two lengths in it, and a buzz at each: hold it and let
go at the first to open the name, or keep holding through the second to carry
the group. Nothing else on the sheet works that way — a task lifts at the
first — because nothing else has two things worth reaching by holding.

Folded, the icon reads `(1/3)`: what is still to do, out of what is hidden.
Half done counts as still to do. With nothing in the group done it reads `(3)`,
since both halves of the fraction would be the same number.

Enter on the name commits it. On a group with nothing in it yet it also opens
the first task, because naming a group and writing the first thing into it is
one motion; on a group that already has tasks it does not, because somebody
there came to change the name and is done. Backspace on that empty first row
goes back to the name, which is where it came from.

The mark out in the margin has two jobs and is never drawn without one. While
there is something in the group still to do it clears the finished tasks; once
there is nothing left to do it removes the group, tasks and all. Both leave an
undo. It is only offered with the group in hand — while the name is open, or
while the group is folded — so a list being read does not grow a column of
live deletes down its side.

The `…` under the last group makes a new one, and Enter there opens its first
task straight away — a group just made is certainly empty. Tapping away
instead just makes the group. A task dragged onto that row makes one on the
spot and becomes its first, arriving unnamed.

While a group is in hand the corner answers for it. The burger goes — it has
nothing to say to a group being carried — and the paper's top-right corner
turns down in its place, torn edge and all, showing a bin in the room it
clears. The bin comes alive under a group held over it, the way the sync mark
does while it works, and the phone taps once as the group reaches it, since
the corner is the one offer here that cannot answer by changing weight. Let
the group go there and it is removed, tasks and all, done or not — two beats
from the phone, and the usual ten-second `UNDO?`.

The list name stays, with a loop drawn round it: that is somewhere the group
can be put down too. Carry it there and the lists open under the name — one
row for every list but the one you are on, and `+ NEW LIST` last — and they
close again if the group is taken back to the sheet, so the column is never
lying across a list being carried over. The line under a row goes dashed when
the group is over it. Drop it on a list and the group moves there whole — its
tasks, their words, and their half-done ticks. Drop it on `+ NEW LIST` and a
list is made on this device with that group on it, named after the group, and
it stays on this device until it is synced. The switcher is there for this
even when there is only one list, since that is the device with most to gain
from a second; it is not offered while a sync is in flight.

A list a group has been carried onto wears an asterisk before its name, in the
switcher and on the pill, for as long as the tab stays open. It is the one
change here that cannot be looked at afterwards — the group is on a list that
is not on the screen — and the message saying where it went is gone in ten
seconds. It stays after you have been to look, and it is written nowhere, so a
reload clears it.

Undo puts things back the way they were, asterisk included. A group moved to a
list that already existed comes back here and leaves that list exactly as it
found it; a group moved to a list the drop invented brings the list back down
with it, and a device that had one list before has one list again.

### The sheet, and the back of it

| Where          | Gesture                | What happens                                               |
| -------------- | ---------------------- | ---------------------------------------------------------- |
| The sheet      | Drag rightwards        | Turns the paper over to the menu — from bare paper         |
| The menu       | Drag rightwards        | Turns it back, from anywhere on it, buttons included       |
| Top right      | Tap the burger         | The same turn, from either face — it is the same button    |
| Top right      | Hold the burger        | Turns the debug switch on and off — see below              |
| The code field | Tap it while empty     | Pastes the code from the clipboard, if there is one there  |
| Top right      | Tap the sync mark      | Syncs. It is only there when there is something to say     |
| Top left       | Tap the list name      | Opens the other lists under it, and `+ NEW LIST` last      |
| Top left       | Two taps on the name   | Straight to the next list, without opening anything        |
| The menu       | Tap the theme mark     | Theme: the opposite of the phone, then following it again  |
| A message      | Tap `UNDO?`            | Puts back what the message is about                        |
| A message      | Throw it up or right   | Dismisses it. Down is the sheet's scroll, left is the turn |
| A panel        | Drag down, `Esc`, or ✕ | Closes it                                                  |

The menu holds one button that takes something away, and it reads LEAVE where
the list has a code and DELETE where it has not: with a code the list carries
on without this device and can be come back to, and without one this device is
the only place it has ever been. Both stop and ask first, and both leave the
same ten-second `UNDO?` everything else here does — the list comes back with
its code, its folded groups and its place in the switcher.

JOIN asks what to do with the tasks already here, and neither answer throws
anything away. Take them and they go to the list being joined; leave them and
they stay on the list they are on, which stays on this device beside the one
arriving. The switcher then shows both.

Both sides of the paper carry the same row: the name of the list at the left,
where the writing starts, and the marks at the right. On the sheet those are
sync and the burger; on the back, the theme and the burger again — drawn there
with a dash at the head of each of its rows, which is the list it turns back
to. The name has the same room on either side, so turning the paper over does
not move it.

The theme lives on the back of the sheet — it and the name of the list are the
two things in the app that are about this device rather than about the
writing. Turning the paper to reach it shows the answer on the way back.

Nothing can be picked up off the paper while it is turning: a press held
through a swipe is refused, and picking a row up is something to do to a sheet
that is lying still.

The paper only ever spins one way, so a swipe rightwards turns it whichever
side is showing. On the sheet the drag has to start on bare paper, because
every control there already owns a press — the ones that lift a task and a
group. On the menu it can start anywhere: nothing in there owns a press, and a
drag that crossed a button does not press it.

### Arriving on an invitation

| Where              | Gesture                | What happens                                                      |
| ------------------ | ---------------------- | ----------------------------------------------------------------- |
| A link ending `?j` | Open it                | A red arrow points at the burger, with `JOIN LIST` at its far end |
| The burger         | Tap it                 | The paper turns, and the arrow follows it over                    |
| The panel          | —                      | It opens at the code field, ringed in red, `PASTE HERE` under it  |
| The code field     | Tap it while empty     | Pastes the code, and the marks go                                 |
| Anywhere else      | Tap it, or press `Esc` | The marks go. Nothing else changes                                |

SHARE hands over two lines: a link ending in `?j`, then the code. The flag is
one character and it says only that whoever follows the link was sent a list —
**the code is not in it**, and never is, in a query or a fragment or anywhere
else on a URL. What it buys is that the app on the other end opens knowing
somebody is holding a code, and can point at where it goes.

The pointing is the one time this app says anything about itself, and it is
drawn over the page rather than put into it — in red, because a mark in the ink
would be part of the drawing. One mark and one word on each face, never more.
On the sheet, an arrow to the burger with `JOIN LIST` written at the far end
of it — word for word the heading it leads to, so the arrow does not promise a
section the panel does not have.
Once the paper is over, a ring thrown round the twelve places the code is
written into, with `PASTE HERE` written under it and off to the left — the panel
opens at that field rather than where it was last left.

The panel has no arrow. One there had to end on a field a few millimetres of a
screen that is already a column of controls, so its head came out smaller than
the thing it was pointing at and read as a tick rather than as a direction. The
ring says which thing, exactly; the word says what a finger there will get,
since an empty field pastes on a tap. `PASTE HERE` stands to the left rather than
centred under the ring: two words at display size reach most of the way across
a phone, and the left is the side a phrase has room on.

It never takes a press — it points at controls, and anything it swallowed would
be the control it is pointing at. A press anywhere it is not pointing ends it,
the way somebody pointing over your shoulder stops when you start doing
something of your own; so does `Esc`, when no panel is open. Turning the paper
back over without a code puts it back on the burger rather than giving up. A
code reaching the field ends it for good.

None of it is written down: it is on screen for this reading of the app and no
other, and reloading the page — by then without the flag — arrives at an app
that says nothing. A screen reader hears one sentence on arrival instead, since
a red arrow says nothing out loud.

Tick three tasks inside five seconds and a message offers to clear exactly
those three. It is only ever an offer — nothing sweeps the sheet by itself —
and it is made once per run rather than once per tick after the third.

A message with `UNDO?` on it stands for ten seconds after anything that takes
something away — a deleted task, a cleared group, a removed group, a list left
or deleted — and after a move made with a finger, which is the one change that leaves no trace of
where the thing came from. A move made with `Alt+↑/↓` says where the task went
instead: it is exact, and a run of them would raise a message a step.

The menu holds one thing that is not about the list: a debug switch, which
outlines every box on the page in red and keeps a log of what each sync
attempt did. It is not on the panel at all until it is on — holding the burger
is what turns it on, with a buzz to say the press landed, and the button it
puts there is what turns it off again. Nothing about it syncs or leaves the
device.

With debug on, the panel also carries a language picker — one boxed button
per catalogue the app has, English and Greek today. It previews a
translation regardless of what the browser asked for; the app otherwise picks
its language from the browser's own on every load, matching by the primary
language tag (`el-GR` gets the Greek catalogue the same as `el`) and falling
back to English. The picker's own choice is not written anywhere and does not
survive a reload — it lives for as long as the tab does, the same way the
panel's own scroll position does — but it does survive turning debug back
off: only reaching the picker needs debug on, and a catalogue it already
switched to keeps showing once the switch is off again. The button for
whichever catalogue is
showing stands full ink; the others are drawn faint, the same weight-only
distinction the sheet uses between an empty add row and a written one.

### What the sheet reads

Counts and prices are read off the text and never stored beside it. A number
at the front of a task is how many (`2x apples`, `3 lemons`); a number at the
end is what it costs (`Bread 2,50`). Both `,` and `.` work as the decimal
mark, and a group writes the whole column the way most of it was written.

A number at the front with a unit on it is how much rather than how many —
`500g`, `1,5 kg`, `2L`, `250ml`. Grams, kilos, litres and millilitres, and
the short ways they get written: `k` for a kilo, `gr` for grams, `lt` for a
litre, in either case. Each is written back one way — `1k` reads `1kg`,
`300gr` reads `300g`. A weight is not a count, so the price beside it is
taken once: `500g Butter 2,50` is one pack.

The group total is what is **still to buy** — done does not count, half counts
in full, and a row counts as its count times its price. It stays while the
group is folded, which is when it is worth most.

An address in a task is drawn as what it points at rather than as every
character of how to get there, and opens in its own tab. Nothing about any of
this changes the text: what you typed is what is stored, synced and exported.

## The typeface

Graphe Alpha, the one face used everywhere in the app, is licensed under the
[SIL Open Font License](https://heracl.es/graphe/) — see that page for the
font file and the licence text. Being OFL, it can be embedded and
redistributed, forks included.

Swapping it for a different face is a two-line change: drop a woff2 into
`static/fonts`, point the single `@font-face` in `src/app.css` at it, and
update the preload in `src/app.html`. A stale preload fails the prerender
rather than shipping a dead link, so the second line can't be forgotten
quietly.

Expect to retune `size-adjust` in that `@font-face` too. It exists so a face
drawn on a different body can be dropped in without rewriting every size in
the stylesheet, and its current value is calibrated to Graphe.

Known gap: Graphe has no `[`, `]`, `\` or `Ϋ`. Those fall back to the generic
cursive stack. The first three reach the screen only in text a person types —
the markdown in the IMPORT box flips to a summary as soon as it parses — so
the visible case is a task titled something like `Deposit [urgent]`. `Ϋ` is
the capital of `ΰ`, so it appears only when a word containing that letter is
shown in caps.

## Greek capitalisation

The sheet is set in caps in CSS, and uppercasing Greek is language-dependent:
Greek drops the tonos in capitals — ΚΑΦΕΣ, not ΚΑΦΈΣ. Browsers apply that rule
only when told the text is Greek, so `src/lib/doc/lang.ts` marks any text
containing a Greek letter `lang="el"`.

Without it the result is not just unidiomatic but broken — Chrome renders
μαΐστρος as ΜΑΪ́ΣΤΡΟΣ, dialytika plus a stranded combining acute. The accents
themselves are untouched: what is stored, exported and read aloud keeps
exactly what was typed, as with the uppercase itself.

## Deployment

The Vercel side stands up in one sitting. What it needs:

1. **Import the repository** into a new Vercel project on the Hobby plan.
   Framework preset SvelteKit; the build command and output directory are
   detected. Production deploys from `main`, previews from pull requests.
2. **Create a Blob store** and connect it to the project. This injects
   `BLOB_READ_WRITE_TOKEN`. Keep the store **private** — the app reads and
   writes with `access: 'private'`, and nothing but the function ever needs
   to read it. A public store would leave the ciphertext one request away
   from anyone who can guess a room id, which is derived from the code.

   Preview and production should ideally get **separate stores**. If they
   share one, they are still isolated: `src/lib/server/env.ts` reads
   Vercel's own `VERCEL_ENV` and prefixes blob paths with `preview/` or
   `dev/`, leaving production unprefixed. Nothing to configure. Note that
   Vercel runs crons in production only, so preview blobs are never swept
   and accumulate — which is the argument for separate stores rather than
   against the prefix.

   **Check it before trusting it.** A deployment with no store connected
   fails in a way that reads as healthy from the outside — the app says it
   cannot reach the list, which sounds like a network problem, and a `GET`
   answers a perfectly ordinary 404. The write path is the one that tells the
   truth:

   ```
   ROOM=$(openssl rand -hex 16)
   curl -i https://<your-deployment>/api/room/$ROOM
   curl -i -X PUT https://<your-deployment>/api/room/$ROOM \
     -H 'Content-Type: application/json' -d '{"baseV":0,"blob":"AA=="}'
   ```

   Healthy is `404` then `200 {"v":1}`, both carrying `Cache-Control:
no-store`. `404` then `500` means the store is not connected. A `404`
   without the `no-store` header is Vercel's own not-found, not ours — the
   route did not deploy.

3. **Add `CRON_SECRET`** as a private environment variable, and only that
   one. Generate it with `openssl rand -hex 32` and add it under Project
   Settings → Environment Variables with exactly that name — Vercel looks
   for it by name and sends `Authorization: Bearer <value>` on every cron
   invocation. Until it is set, `/api/cron/sweep` returns 401 and the daily
   sweep deletes nothing.

   `BLOB_READ_WRITE_TOKEN` is not set by hand: connecting the Blob store in
   step 2 injects it. If you find yourself typing it in, the store is not
   connected.

   There are no `PUBLIC_` variables in this project, by design — the browser
   never learns the blob host, and `pnpm gates` fails the build if a
   secret-shaped one appears. See `.env.example`; for local development,
   `vercel link` then `vercel env pull .env.local`.

4. **Confirm the free-tier numbers** at `vercel.com/docs/limits` before
   relying on them. Hobby is personal, non-commercial use only; if this ever
   earns money it moves to Pro. Exceeding a Blob limit pauses Blob for about
   30 days rather than billing you.
5. **Protect `main`**: green CI required, squash merges, conventional commit
   titles.
6. **Check the deployed preview** for the things only a deploy can show: the
   response headers from `vercel.json` (asserted against the file in
   `tests/headers.spec.ts`, but not live until deployed), Lighthouse on
   mobile, and its installability audit.

The cron entry for the daily sweep is already in `vercel.json`; it needs
`CRON_SECRET` set before it will do anything but return 401. The sweep itself
(`/api/cron/sweep`, one run a day, guarded by a constant-time `CRON_SECRET`
check) removes lists that have gone six months without an edit.

## Known limits

- **Lose the code, lose the list.** No account, no email, no recovery.
  EXPORT is the only backup.
- **A shared code cannot be taken back.** Anyone holding it has full read and
  write access, and LEAVE only clears your own device.
- **An unsynced edit reaches nobody** and is lost with the device.
- **A list nobody edits for six months is removed from the server.**
- **End-to-end encryption protects the data at rest**, not against the
  origin serving the JavaScript.
- **Hobby is non-commercial.** The moment this has a paid tier or ads it
  moves to Pro.
- **The first paint is always English.** The page is prerendered and cannot
  read the browser it will end up in, so a phone set to Greek sees the sheet
  redraw in Greek the instant the page's own script runs, rather than opening
  in it.
