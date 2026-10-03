# Decisions

What was settled, and why. Build to these; don't relitigate them.

Numbers in brackets are the section of the build plan a decision came from.

## Settled before the build

1. **DELETE removes the list from this device only.** No server call, no
   revocation. The confirm shows the code first, because that screen is the
   last place on the device it exists. [§12.1]
2. **Clearing sweeps `done` tasks and only those.** Half-done stays. It had a
   confirm _and_ a ten-second undo while it lived in the menu; it lives beside
   the group now and keeps the undo alone — see §88. [§12.2, §12.16]
3. **Tap toggles to-do and done; long-press sets half.** `Shift+Space` is the
   keyboard equivalent. [§12.3]
4. **Joining with local tasks asks whether to merge or discard.** Never
   silently. [§12.5]
5. **Reordering is long-press and drag, with no handle.** The checkbox keeps
   its own long-press, so the two gestures are separated by hit area rather
   than by timing. [§12.6]
6. **IMPORT and EXPORT are clipboard-only markdown**, `##` for groups. Import
   adds by default and offers replace; duplicates in the same group are
   skipped and counted. [§12.7]
7. **Labels are uppercased in CSS only.** A group typed as "Weekend jobs" still
   exports as "Weekend jobs". [§12.8]
8. **Limits: 200 characters per task, 100 tasks, 50 characters per group title,
   20 groups, 128 KB per blob.** Enforced on input, never by discarding in
   merge. The task limit was 100 and enforced with `maxlength`, which on a
   phone is indistinguishable from a dead keyboard; it is 200 now and a full
   row spills the rest onto the next one. [§12.9]
9. **Six-month expiry, swept by a daily cron.** Editing keeps a list alive;
   reading does not. [§12.10]
10. **Storage is one JSON file per list in Vercel Blob.** No database, no rate
    limiter, no atomic compare-and-set. [§12.12]
11. **Consummatum.** When the last open task is ticked, the toast reads
    _Consummatum_. Once, no animation, and never on an empty sheet. [§12.13]
12. **No chrome.** No app name on screen, no add buttons, no tooltips, no
    empty-state copy. Adding is an empty checkbox; a new group is an underlined
    `…` in header type. [§12.14]
13. **Installable, with icons drawn at build time** so no raster asset is ever
    committed. [§12.15]
14. ~~**The app opens scrolled** so the torn top edge sits at the viewport
    top.~~ [§12.17 — superseded by 21]
15. ~~**SHARE fires the native share sheet first**, then opens the modal.~~
    [§12.18 — superseded by 22; the bare URL survives]
16. **One hand-rolled modal component**: full-white panel, swipe-down to
    dismiss, `✕`, Escape. Never `window.confirm()`. [§12.19]

## Settled during the build

17. **`CODE_LENGTH = 12`, not 8.** Forty-eight bits. Everything goes through
    our own origin, but there is no rate limiter behind it, so guessing is
    bounded only by request rate and PBKDF2 cost — at 32 bits that is days of
    work for someone determined. Twelve characters make it roughly 65,000 times
    more. The salt stays frozen at `consumma:v1` — through the rename too;
    see §131. [reopened §12.20]

18. **Sync is entirely manual.** No poll interval, no visibility or reconnect
    triggers, no push debounce, no queue that flushes. One `syncNow()` on the
    SYNC tap, doing both directions, behind a ten-second cooldown.

    Polling was the expensive part — one blob operation every eight seconds per
    open tab, about 10,800 a day for a tab left visible — and pushing without
    being asked is what turns a shared list into something that happens to you.
    The cost is real and is stated rather than designed around: an edit nobody
    syncs reaches nobody and dies with the device. Three things already in the
    design carry it, and no fourth was added — the status mark is hollow
    whenever edits are unsent, the SYNC panel names how many, and the DELETE
    confirm says so.

19. **QR code in SHARE and a "move everyone to a new code" flow are out of
    scope.** A leaked code has no remedy but everyone joining a new one, and the
    README says so. [closed §12.21, §12.22]

20. **Markdown half-done is `- [~]` on export**; import also accepts `[/]` and
    `[-]`, which other apps use. [closed §12.23]

21. **There is no SYNC · SHARE row.** The status mark in the sheet's corner is
    the whole control: it reports what has not been sent, and opens the panel
    that sends it. A button that only opens a panel the mark already opens is
    a second name for the same thing.

    Three consequences. Sharing moved into that panel, next to the code it is
    about. The opening scroll is gone — it existed to put those two buttons out
    of sight above the fold, and with nothing above the sheet the page simply
    opens on the list. And the sheet no longer needs `min-height: 100dvh` to
    guarantee something to scroll.

22. **One invitation, carrying the link and the code together.** Either half
    alone is useless to someone who has neither: the link without the code
    opens an empty sheet, the code without the link is a string nobody can
    place. SHARE hands over both.

    COPY does not. It sits directly under the code, and what a button under a
    code copies is the code — into a message already being written, or into the
    other phone's JOIN field. Handing over the whole invitation is what SHARE
    is for, and the two buttons are next to each other.

    It all travels in `navigator.share`'s `text`, with no `url` field —
    splitting it lets a share target keep one and drop the other. The link
    itself stays bare, so §12.18's rule holds where it matters: the code is
    never a query parameter or a fragment, and never reaches history, a link
    preview, or whatever service renders the message.

    Two lines, and no title or sentence introducing the app. The code used to
    end a line beginning "Code: ", which meant selecting into the middle of a
    sentence to get at it; on a line of its own it is one thing to grab.
    Whoever receives this is already being told what it is by the person
    sending it.

23. **Task text is set in caps too**, not only the labels and titles. §6 had
    tasks staying as typed; on the sheet they read better matching everything
    else.

    The rule that matters is unchanged and now has a test: the uppercase is CSS
    only. What is stored, what the markdown export carries, and what a screen
    reader announces all keep the casing that was typed — the last of those
    needs an explicit `aria-label`, because Chrome folds `text-transform` into
    the accessible name and would otherwise shout.

24. **Every underline is drawn.** The rule under a group title, the one under
    the new-group `…`, and the one under the join field are all `handLine`
    paths rather than `text-decoration`. A CSS underline is a straight line in
    a sheet where nothing else is.

25. **One typeface, not two.** §6 had Patrick Hand for body and Caveat for
    display. The sheet is one hand's writing, so it is set in one hand: titles,
    code, tasks and labels all use `--hand`, and separate by size and caps
    instead. Caveat and its `@fontsource` package are gone.

    That leaves exactly one `@font-face` in `src/app.css` and one variable that
    names it, which is also what makes the face swappable cheaply.
    `e2e/design.e2e.ts` asserts `document.fonts` holds one family and that every
    computed `font-family` under `body` resolves to it, so a second face cannot
    creep back in unnoticed.

26. **The face is Graphe**, drawn by the owner, replacing the placeholder the
    single-face change was built against. It is not open-licensed, so the README
    says plainly that a fork must substitute its own.

    Three things followed from the file itself, none of them cosmetic.

    **The scale is corrected in the `@font-face`, not across the stylesheet.**
    Graphe is drawn on a much larger body — caps at 1.105em against the previous
    face's 0.661em, and glyphs 56% wider — so dropped in raw it overflows a
    320px screen. `size-adjust: 68%` puts that correction in one place, on the
    face it belongs to; rewriting every `--size-*` would have scattered it and
    left rem values that no longer mean anything. `ascent-override` and
    `descent-override` do the same for the 1.80em line box, which would
    otherwise space the sheet past what the drawn rules and 44px targets assume.

    68% rather than the 60% that matches cap height exactly: Graphe's x-height
    is small relative to its caps (0.57, against 0.71), a property of the face
    that no scaling changes. The app is nearly all caps, but the modals are
    sentence case, and 68% is where both read — caps slightly larger than
    before, prose legible.

    **Three printable ASCII glyphs are missing — `[`, `]`, `\`** — and they are
    allowed to fall back rather than be designed around. Rewriting the markdown
    tokens to characters Graphe has would have kept one face at the price of an
    export other apps can no longer read, which is the wrong trade. The exposure
    is smaller than it first looks: the IMPORT box flips to a summary as soon as
    the paste parses, so in practice this is only a task titled `[urgent]`.

    **`fsType` was 4** (Preview & Print embedding). Set to 0, Installable, which
    is what a self-hosted webfont should carry. Browsers ignore the field, but
    it is the file's own machine-readable statement of intent.

27. **Greek text declares its language, so capitals lose the tonos.** Greek
    drops the accent in capitals — ΚΑΦΕΣ, not ΚΑΦΈΣ — and a browser applies that
    rule only when told the text is Greek. `src/lib/doc/lang.ts` marks any text
    containing a Greek letter `lang="el"`, on the task rows, the group titles
    and the inputs behind them.

    This is a correctness fix, not a nicety. Left as English, Chrome renders
    μαΐστρος as ΜΑΪ́ΣΤΡΟΣ — dialytika plus a stranded combining acute.

    Transforming the text ourselves was never an option: decision 7 puts the
    uppercase in CSS precisely so that what is stored, exported and announced
    keeps the casing typed. Declaring the language is what lets that rule and
    correct Greek hold at once.

    One Greek letter marks the whole string, rather than a proportion of them.
    The casing rule only touches Greek letters, so "Bread ψωμί" as Greek fixes
    the Greek word and leaves the English one alone, where a majority test
    would leave it visibly miscased. The cost is that "Calculate π area" is
    Greek to a screen reader. Nothing is miscased either way, so the milder
    failure wins.

28. **The rule under a title is as wide as the title.** It was 45% of the row,
    which is a column rule rather than an underline; a pen underlines the word.
    `TextRule.svelte` sets the text a second time, hidden and out of flow, and
    draws to that width — CSS cannot ask for the width of a sibling's text, and
    the title has to keep filling its row because that row is the hit area for
    collapsing. The hidden copy carries the same caps and the same `lang`, since
    ΚΑΦΕΣ is not the width of ΚΑΦΈΣ.

    The new-group `…` gets the same treatment rather than keeping the old
    width, so the placeholder still reads as the same thing one step earlier —
    a short stub under three dots that grows as a title is typed.

29. **The app is named `/listula`**, in the manifest, the tab title and the
    iOS home-screen name. Nowhere on the sheet: §12.14's no-chrome rule is
    unchanged, and the name is still absent from the page itself. It was
    `/consumma` until §131 renamed it; where the old name survives in the code
    it is an address rather than a name, and §131 says which.

    The credit in the footer is the one exception to "the only words on the
    sheet are the ones someone wrote", and it sits below the torn edge rather
    than on the paper. The version comes from package.json through a Vite
    `define`, so a release cannot leave the sheet claiming an old one, and
    `e2e/design.e2e.ts` reads the same file to keep that binding honest. The
    dedication is set in italics, which with a single face means the browser's
    synthetic oblique.

    The break above it is three asterisks, and is the one separator in the app
    that is not a drawn path. Decision 24 is about rules — a line standing in
    for a border — and this is not one: it is punctuation, set in the same hand
    as the words around it.

30. **Everything that is not the list moved into a side menu.** The sheet had
    grown two rows of buttons and a footer beneath it; none of that is what
    someone wrote on the paper. One button sits in the corner — three strokes
    normally, an arrow up and out when something is waiting to go — and opens a
    panel holding sync, the code and sharing, joining, IMPORT/EXPORT, DELETE
    and the credit. CLEAR was in that list and left it again — see §88.

    The arrow replaces the hollow status mark, and is a better sign for the
    same fact: not a health light to be decoded, but an outbox that is not
    empty. What is waiting, and why, is spelt out in words the moment the panel
    opens. Decision 21 stands — the one control still opens the one panel — and
    the mark's three states collapse into two, because the third was explained
    every time anyway.

    The menu closes before any panel opens over it: two focus traps at once is
    a keyboard trap. `src/lib/a11y/trap.ts` is now shared rather than written
    twice, which is how the second copy would have drifted.

31. **The sync copy names two things separately.** `src/lib/sync/status.ts` is
    pure and tested: a headline saying how much is waiting, and a second line
    saying why it still is.

    The old single sentence conflated them. "Offline." replaced the whole line,
    so the count vanished at exactly the moment someone would want it, and it
    read as a failure rather than as a condition — which under manual sync it
    never is. Errors still go through `sync.message`, in an alert, where they
    belong.

32. **Long drawn sides are subdivided.** `handPath` bends a segment once,
    however long it is, so the menu's edge came out as a single gentle bow —
    a ruled line with extra steps. `handRect` now breaks runs longer than 90px
    into shorter ones, so a tall panel wobbles along its length. Short boxes
    are untouched, deliberately: subdividing a 22px checkbox would re-cut every
    one already drawn, and `e2e/design.e2e.ts` asserts a drawn line never moves.

33. **`--cap-lift` levels drawn marks with capitals.** Graphe's capitals reach
    15px on a 17px body while the face declares an ascent of 12, so a row that
    centres the line box leaves the capitals riding high — and the sheet is set
    entirely in capitals. Checkboxes and chevrons lift by that difference.

    The value is measured in a browser rather than derived, because
    `ascent-override` resolves against the size-adjusted em and the arithmetic
    that assumes otherwise is off by exactly the amount that looks wrong.

34. **The sheet has drawn sides.** The tears close the paper top and bottom;
    without sides it read as text on a page rather than as a strip of paper.
    `handVertical` draws each one at the height it is shown at, like the tear,
    so the weight matches exactly — a path drawn once and stretched comes out
    thinner along whichever axis was compressed.

    An `svg` is a replaced element, so `top: 0; bottom: 0` does not stretch it:
    `height: auto` resolves to its intrinsic 150px and the offsets are ignored.
    The first attempt stopped a third of the way down the sheet.

35. **The route is tested through its own handlers.** `tests/sync.spec.ts`
    drives the client against a hand-written `fetch` double that reproduces
    what the route should do — the right shape for testing a client, but it
    means the route and the double could disagree while both suites stayed
    green.

    `tests/route.spec.ts` imports the real `GET` and `PUT` and checks what the
    client leans on: status codes, the ETag round trip, the state that has to
    travel with a 409, the shared 404, and `no-store` on every answer. Only the
    blob backend is faked, because it is the one part that genuinely needs a
    network.

    What that still does not cover is `src/lib/server/blobs.ts` itself — the
    `@vercel/blob` calls — and no deployment exists yet, so nothing has run
    against a real store. That is the honest remaining gap.

36. **State that loads is untracked.** `+page.svelte` calls `sheet.load()`,
    `ui.load()` and `sync.load()` from an effect. `sync.load()` parses the last
    synced snapshot into `#lastSynced`, and `refresh()` reads it straight back
    through `unsent` — so tracked, the effect read and wrote one piece of state,
    and because each load parses a fresh object it never settled. Svelte gave up
    with `effect_update_depth_exceeded` and tore the tree's reactivity down.

    The symptom was remote: a completed join left the menu open with the code
    still typed, no error, and no sign anything had happened — while the sync
    itself had worked and the status read "Everything is synced". Nothing in the
    suite completed a join, so nothing caught it. `e2e/sync.e2e.ts` does now.

    Both effects are `untrack`ed around what they call. `refresh()` also no
    longer advances the clock: a `$state` setter reads the old value to compare,
    so writing `Date.now()` from inside an effect makes that effect depend on
    the very thing it writes. The clock belongs to whatever shows the cooldown.

37. **Two browsers, one code, in a real browser.** `e2e/sync.e2e.ts` is M5's
    acceptance and the one part of sync a unit test cannot reach: the real
    client doing its own crypto with a key it derived itself, over its own
    fetch. Requests are answered by the real `RoomStore`; the blob backend is
    the only thing faked, the same boundary `tests/route.spec.ts` draws.

    Setting up a device plants the code in storage rather than typing it into
    JOIN, because JOIN forces a sync and the ten-second cooldown then dominates
    the run. The join path has its own test.

38. **An answer from our own origin is not the same as no answer.**
    `src/lib/sync/api.ts` collapsed every non-OK response into `offline`, so a
    deployment whose blob store is not connected — which answers 500 to
    everything — told people their connection was down. That sends the one
    person who can fix it to look at their wifi.

    `refused` is now its own outcome and carries the status code, because the
    code is the one thing that says which: 404 is a route that was never
    deployed, 500 is a route that cannot reach its store. `offline` still means
    exactly what it says — nothing answered.

39. **Only a missing blob means an empty list.** `vercelBlobs.get()` caught
    every error and returned null, so a store that was not connected, or a
    token that was missing or expired, answered every read with "no list here".

    That is worse than failing. A `curl` against the API looked perfectly
    healthy — 404, `no-store`, the right headers, served by a real function —
    while the deployment could not read or write a thing. The only symptom was
    writes failing, which the client then reported as being offline. Two
    separate disguises over one misconfiguration.

    `BlobNotFoundError` is now the only failure treated as absence; everything
    else is rethrown and surfaces as a 500 the message names. `tests/blobs.spec.ts`
    is the first test this file has had, which is not a coincidence.

40. **Blobs are private, and read with `get()`.** The store was written with
    `access: 'public'` and read by fetching the public download URL — which a
    store set to private refuses outright, opaquely: the PUT is a 500 while
    reads answer an ordinary-looking 404.

    Private is what the README always asked for and what the design wants. The
    bytes are ciphertext either way, but the blob path is derived from the room
    id, so public access left that ciphertext one request from anyone holding
    one. `get(pathname, { access: 'private', useCache: false })` also replaces
    `head()` plus a fetch, halving the blob operations per read and returning
    null for a missing blob instead of throwing.

41. **Two buttons in the corner, not one that changes shape.** The burger
    reported sync state by becoming an arrow, which was two jobs on one
    control. The burger is now only a burger; a separate button sits to its
    left and appears only when there is a reason.

    An arrow up and out when edits are waiting. A circular arrow when nothing
    is waiting but it has been ten minutes — nothing syncs on its own, so a
    list left open all morning is exactly as old as when it was opened. The
    button appearing is the whole nudge: no banner, and nothing syncs until it
    is tapped. `page.clock` is what makes the ten minutes testable.

42. **The triangle collapses the group.** Tapping the title still does too, but
    the title is also where renaming starts, so the one thing on the row that
    does nothing else had to be tappable. It carries `aria-expanded`.

43. **A done task shows its own ✕.** It used to appear on hover or focus, which
    is nothing at all on a phone. Ticking something is usually the last thing
    you do to it, so the way out is there the moment it is done. Deleting is
    still local, immediate and undoable from the toast.

44. **The join field is twelve places, one rule each.** One dashed rule said
    "a string goes here"; twelve short ones say how long it is and how far
    along you are, which is what someone reading a code aloud is asking. Same
    face and size as the code above it, so the two can be compared.

    The input sits over the cells, transparent, holding the value and the
    keyboard — hiding it would take the field off the accessibility tree. Its
    caret is hidden too: it cannot line up with the places, and a caret in the
    wrong place reads worse than none. The solid rule moving along says where
    the next character lands.

45. **A failure reaches whoever caused it.** The corner sync button called
    `sync.sync()` and ignored the result, so tapping it against an unreachable
    server did nothing at all — the message existed, but only the menu rendered
    it, and the menu was not open. It says so in a toast now.

    That button is the way to sync without opening anything, which made it the
    way to be told nothing had happened. Same shape as the two storage bugs
    before it: a thing that fails and looks idle.

46. **A success is as worth saying as a failure.** The corner button toasted
    only when a sync failed, which left the run where everything worked
    indistinguishable from a dead button. It says "Synced." now. Both halves,
    or neither is trustworthy.

47. **Being unreachable is earned, and it sticks.** `refresh()` set `offline`
    from `navigator.onLine` and otherwise reset to `pending`. But `onLine` says
    the device has a network, not that the list is at the end of it — a dead
    deployment on good wifi is online by that measure. So the mark a failed
    attempt earned was thrown away by the next edit.

    `#unreachable` is set by an attempt that could not reach the list and
    cleared only by one that did. Reaching it is the only thing that proves it
    can be reached.

48. **The crossed circle outranks the arrow.** Three glyphs on one corner
    button: an outbox arrow when edits are waiting, a circular arrow when
    nothing is waiting but the list has not been looked at in ten minutes, and
    a closed ring struck through when it could not be reached. Offline wins,
    because there is no point offering to send when nothing can leave. It stays
    tappable — a condition, not a locked door.

    The ring is closed where `handRefresh` is open, so at 22px the two can
    never be confused.

    The 15-second tick in `SyncButton` recomputes the mark alongside the clock.
    That is not a poll and not a reconnect trigger: nothing there syncs, and
    decision 40 stands unchanged.

49. **The collapse control carries the count.** A drawn chevron, plus a
    `[ … 3 ]` line printed underneath it, said one thing twice. The control now
    reads `[3]` closed and `[…]` open — what is hidden and how much, in the one
    place someone is already looking. The line below is gone.

    The brackets fall back, as they do everywhere; the digit is Graphe's own.

50. **The menu's buttons are boxed, each in its own hand.** They were
    underlined and separated by middle dots, which is a link and a list of
    links — they are neither. Every one gets a drawn box seeded from its own
    name, so no two are the same rectangle; eleven copies of one shape would
    read as a stamp, which is the thing this app never does.

    A CSS border was not available: it is a ruled straight line, and nothing
    drawn here is ruled — which is also why the 3px corners are a `radius`
    option on `handRect` rather than a `border-radius`. The turn bends through
    the corner it cut off, because a quadratic whose control point is its own
    chord's midpoint draws a chamfer, not an arc.

    The box lifts by `--cap-lift` to sit on the word instead of under it. The
    button keeps its 44px where it is: the tap area is not what moved. The whole-document underline check in
    `e2e/design.e2e.ts` is what keeps this from creeping back — it used to scan
    the sheet only, which is how the menu kept eleven of them.

51. **The panel is set to be read.** Its prose and its credit were at body and
    small against a face already scaled down by `size-adjust`. Both are at
    `--size-title` now, the same size as the section headers, which are
    themselves group titles: same face, same caps, same drawn rule underneath.
    The panel is where someone goes to find out what is happening, so it is set
    at the size of something meant to be read rather than referred to.

52. **The ghost checkbox opens its row.** An empty box in a 44px target, beside
    a row that opens on a tap, that did nothing. It is a button now — out of the
    tab order and out of the accessibility tree, because the ellipsis beside it
    is the same action with a real label and two stops for one thing is worse
    than none.

53. **Arriving leaves no trace.** Opening the page used to write four keys and
    ask for persistent storage before a single tap: a client id, a clock, the
    opening group, and a freshly made code — which the menu then showed. Someone
    who looks and leaves should be indistinguishable from someone who never came.

    Nothing is written until something is written on the sheet. The opening
    group is added quietly, because it is the shape of an empty sheet rather
    than anyone's change; it is not counted as unsent either, which had the app
    announcing "1 change is waiting to go" to a visitor who had done nothing.

54. **A code comes from the first sync.** It is the address of a list on the
    server, and before a sync there is nothing there to address — handing one
    over early would send someone to an empty sheet and leave both of them
    wondering which had got it wrong. So the menu shows no code and no SHARE or
    COPY until a sync has happened, and the DELETE confirm says plainly that
    there is no code to come back with.

    It is written down before the request rather than after it. A PUT that
    lands while the confirming read fails leaves a list on the server, and
    forgetting the code it is filed under would strand it there — the next sync
    would make a second one, and so on.

    DELETE returns the device to exactly this state: no code, and no trace.

55. **Staleness needs somewhere to have been.** `lastSyncAt` starts at zero and
    is not persisted, so a device that has never synced has been not-syncing
    since the epoch and reads as stale the moment it loads. That is right for a
    returning list — it may well be old — and wrong for a sheet with nothing on
    it and nowhere to fetch from. The corner button is hidden outright while
    there is neither a written sheet nor a code.

56. **The group header is three controls, not one overloaded one.** The title
    used to collapse on a tap and rename on a double tap, so every rename began
    by collapsing the group and every collapse was one slip from an edit box.
    The title renames. The icon collapses. Neither does the other.

57. **A group goes only when nothing in it is left to do.** Removing one takes
    its tasks with it, so it is offered in the icon's place while the name is
    being edited, and it is disabled — drawn `--faint` — until every task in the
    group is done. An empty group counts as finished: there is nothing to lose.

58. **A task offers its ✕ only when it is done.** It used to appear on focus or
    hover too, which put a live delete button beside every row a finger passed
    over and left it sitting there after an un-tick, because the pointer had not
    moved away. The cost is that removing an unfinished task now means ticking
    it first; that is the right order for a sheet where the mark beside the
    group sweeps what is done.

59. **The click after a drop is swallowed.** A release still fires a click on
    whatever was held, and everything draggable here is a button — so dropping a
    task opened its editor. It was true before groups could be dragged; adding
    the group drag is what made it visible. `pressDrag` arms a capturing click
    handler on release and disarms it 400ms later, in case a touch produces no
    click at all.

60. **Enter means "and the next one".** On a task it commits and opens a fresh
    row directly beneath; on a group title it commits the name and opens one at
    the top of the group. A list is written by typing, and reaching for the add
    row at the bottom after every line is not typing.

    Both commit inside the keydown rather than letting blur do it. Blur fires
    after the new row has been asked for and would close it again.

61. **A double tap sets half.** The first tap's toggle has already happened by
    then and is simply overridden. The alternative is holding every single tap
    back for a third of a second to see whether a second is coming, which puts
    a delay between a finger and every tick on the sheet.

    The cost is that a quick tick-then-untick lands on half instead of to-do.
    The long press still sets half too; this is a second way to the same place,
    not a replacement.

62. **On the sheet, animation is opacity and scale.** A few drawn strokes
    thrown out from a checkbox when it is ticked, and a short swell as a done
    task leaves. No colour, no shadow, nothing that moves a row while it plays.

    Both ask `prefers-reduced-motion` in JavaScript rather than hiding in CSS.
    The sparkle is cleared by its own `animationend`, so one that is merely
    invisible never clears and its strokes stay in the document for good.

    This used to say "two animations", full stop, and the menu's turn (§82) is
    the third. The rule it was reaching for is narrower than the count it kept:
    a **mark** may not turn, because a drawn stroke that rotates stops meaning
    what it was drawn to mean. The **paper** may, because it has two sides.

63. **Everything folds shut while a group is carried.** The whole list becomes a
    handful of titles, so there is somewhere visible to put it down. Nothing is
    written: the fold is a view of the drag, not a change to what is collapsed,
    and collapsed state is local and stays that way.

64. **A bare line is a task.** Most lists people already have are lines of words
    in a note, and asking them to put a dash in front of each one is asking them
    to do the import by hand first. Bullets, markers, headings and fenced code
    all still mean what they meant; a line that is none of those is a to-do.

    The cost is that pasting prose makes tasks out of sentences. That is what
    the preview is for.

65. **Two things are refused outright, and named.** Something that parses as
    JSON is a data file; something that opens with a tag, or is riddled with
    them, is a web page. Read line by line either would arrive as a heap of
    tasks made of punctuation, and undoing that is one tap per line.

    A checklist may open with `[ ]`, which is a bracket and not JSON, and a
    sentence may contain one stray `<`. Neither is turned away.

66. **The import shows what it will do before it does it.** The parsed list,
    read back in the notation it would be exported in — not the text that was
    pasted. Once a line without a bullet becomes a task, the paste and the
    result are different documents, and only the second one is the answer to
    "what will this do".

    Written as text, never as markup. Nothing in this app renders HTML.

67. **Haptics are three lengths and live in one file.** A tap for something
    done, dot-dot for something taken away, dot-dot-dash for something
    finished — the last on the same beat the sparkle is drawn on.

    Nothing longer, and nothing with a rhythm: a pattern elaborate enough to be
    read as a message is a notification, and this app does not send those.
    `navigator.vibrate` is absent on desktop and refused by iOS Safari, and both
    are fine — it is the confirmation, never the message.

68. **Every pair of actions is boxed and centred**, wherever it appears — the
    menu, the two confirms, and the import. `.boxed` in app.css is the one
    definition. The middle dot is gone from all of them.

    In the import the buttons come before the preview. The decision is what the
    panel is for; the preview is evidence, and evidence can be as long as the
    list.

69. **The refresh glyph is an open loop with a real arrowhead.** It closed to
    within twenty-seven degrees and carried a barb built from fixed offsets
    that had nothing to do with the direction the stroke was travelling, so at
    22px it read as a ring with a nick in it and a tick inside.

    A quarter of the circle is open now, which is what says "came round" rather
    than "closed", and the head is two strokes off the tangent at the end of the
    stroke — computed from the direction of travel rather than from fixed
    offsets, which is what was wrong with it.

    They open wide, nearly across the end of the stroke. A tight arrowhead is
    what an arrow has room for at a size you can see; at 22px the barbs close up
    against the ring and it reads as a blob, where a flat one stays two strokes
    and a corner.

    The pen starts bottom right and finishes top right: ending at the far right
    instead put a barb outside the box, which the bounds test caught.

## Corrections to the build plan

Each of these is a deviation, recorded so it reads as deliberate rather than as
drift.

70. **The browser never talks to the blob host.** §5 says so; §3, §9 and §11
    still described reads coming straight from the CDN. §5 is right — it is what
    makes `connect-src 'self'` possible — so `PUBLIC_BLOB_BASE` and the
    `/api/room/[roomId]/version` route are both gone.

71. **Stamps come from a per-device monotonic clock**, `t = max(now, last + 1)`,
    persisted beside the client id. Without it, two edits from one device in the
    same millisecond collide on `(t, c)` and merge stops being commutative. The
    comparator also falls back to the value itself, which makes it total for any
    document, including a corrupt one.

72. **`merge` takes no clock.** Skew clamping (`clampStamps(doc, now)`) and
    tombstone collection (`gc(doc, now)`) are separate functions applied by the
    sync and write paths. Folding either into merge would destroy the algebra
    the property tests check.

73. **Every write is read back once.** Blob storage has no compare-and-set, so
    two writers can both pass the version check and the second one's bytes win.
    The loser cannot tell from the version number — it was told 2, the server
    holds 2, and its next conditional read returns 304 forever. The
    unconditional read-back is the only thing that catches it.
    `tests/sync.spec.ts` sets the race up deliberately; removing the read-back
    makes it fail.

74. **The ETag is the document's own version**, not the blob's upload time and
    size. The latter answers a conditional read without fetching the body, but
    two writes in the same millisecond whose JSON is the same length produce an
    identical token, and the second is reported as unchanged. A saved fetch is
    not worth a lost edit.

75. **The crypto envelope carries a version byte**: `base64(0x01 ‖ iv ‖
ciphertext)`, with the plaintext always deflate-raw. §3 called compression
    optional, but it cannot be past the first write — a reader cannot tell a
    compressed payload from an uncompressed one.

76. **`style-src` carries one pinned hash under `'unsafe-hashes'`.**
    SvelteKit's own `#svelte-announcer` has a hardcoded `style` attribute we do
    not author and cannot switch off. `'unsafe-hashes'` permits that exact
    string and nothing else; it is not `'unsafe-inline'`. `trusted-types` names
    two framework policies, `svelte-trusted-html` and `sveltekit-trusted-url`.
    `e2e/csp.e2e.ts` fails on any console error, so an upgrade that changes the
    string breaks CI rather than the policy.

77. **"Loose ends" has an id no document can hold**, and that is deliberate.
    `__loose__` fails the `/^[A-Za-z0-9]{1,24}$/` the validator enforces, which
    is what stops it ever being written to a document and then syncing to
    someone who has no such group. The cost is that anything which can name a
    group — a drag, a keyboard move — has to refuse it, and `moveTask` does, in
    the data layer rather than only in the UI. Do not widen the id pattern to
    accommodate it: a task pointed at `__loose__` makes the whole document fail
    validation, and the next load then discards the entire list.

78. **A price is read off the task, not stored beside it.** A shopping list
    already carries its numbers — `2x Tomatos 5,08` — and what it could not do
    was say what the trolley comes to. That could have been two new fields on a
    task, and it is not: a task is one string, and adding a `cost` to the
    document would mean a schema version, a merge rule for it, a stamp for it,
    and an export that no longer round-trips through another app. `amount.ts`
    reads the string on the way to the screen instead, the way `lang.ts` does,
    and `aria-label`, the markdown export and merge never see the difference.

    **Both `,` and `.` are decimal separators, and thousands are still
    readable.** Picking one mark and calling the other a grouping separator
    would have been simpler and wrong in half of Europe; picking by locale would
    make one person's list read differently on the other person's phone, which
    is the one thing a shared list cannot do. So the digit pattern decides: one
    or two digits behind the final mark makes it a decimal point, exactly three
    makes it a grouping mark, four is neither and the line has no price in it.
    `5,08` and `5.08` are the same money, `1,234` and `1.234` are the same
    thousand, and `1.234,56` and `1,234.56` both come to the same. Values are
    held in integer minor units, because ten prices at `0,10` have to come to
    `1,00` and floats do not.

    **A row counts as count × price, and the row still shows the price.** Three
    potatoes at 20,00 is 60,00 in the total, and the row goes on saying what one
    costs — because that is what gets checked against a shelf edge. Showing the
    line total on the row instead would mean the sheet displaying a number
    nobody typed, next to a checkbox. The total is the one place a derived
    number belongs, so it is the only place one appears.

    **A group writes its numbers one way, and it is not always the way they
    were typed.** Two people adding to one list write `5,08`, `20.00` and `10`
    down the same column, and a column of prices that cannot be read down is
    not a column. So the prevailing form wins — the separator most of them
    used, two decimals if any of them wrote any, and a currency mark when every
    price that wrote one wrote the same one — and every price in the group is
    written out in it, including the ones that wrote no mark at all. A count
    always ends in one `×` and is never padded with decimals; it counts things.

    The style is taken from every priced row, done ones included, so ticking
    the only price with decimals does not rewrite the column above it.

    **Only the prices are a column.** The counts were given one too at first —
    a reserved slot on every row of a group, empty where a row had no count, so
    the names started level. It lines four numbers up at the cost of indenting
    every row that has none, which on an ordinary list is most of them. A count
    reads as the word it stands in for and belongs in front of the words; the
    prices are what a column is for, because reading down them is the point.

    This is a change of position and worth saying so: the row used to show the
    price exactly as typed. What is inviolate is the text, not the rendering —
    `aria-label`, the markdown export and merge still see every character that
    was typed, which is where the promise actually lives.

    **Done does not count; half counts in full.** The total is what is still to
    buy, so a ticked task is already in the basket — and it takes its count with
    it, so four loaves ticked removes four loaves, not one. Half is not half the
    money: it is a task still on the list, and the tri-state was never a
    progress bar.

    **The total sits on the group header**, between the title and the `[…]`,
    because a group is what a total belongs to and the header is the one row
    that is not a task. It stays while the group is collapsed, which is when a
    number standing in for four hidden rows is worth the most.

    **The figures are set in a system monospace**, and that is the single
    exception to one typeface. A price is a figure rather than a word: it has to
    line down a column, and tabular digits in the hand would still not read as a
    different kind of thing from the words beside them. A system stack rather
    than a second `@font-face` keeps the exception cheap — no file, no request,
    nothing added to `connect-src`. `e2e/design.e2e.ts` names it by class
    instead of loosening the rule, so anything else leaving Graphe still fails.

    `--mono-scale` corrects for the mono being drawn on a larger body than
    Graphe, in one place and for the same reason `size-adjust` and `--cap-lift`
    exist. It is measured in a browser, not derived. Inside a row the words take
    `overflow-wrap: break-word` rather than the `anywhere` a plain row uses:
    both break the same words, but `anywhere` also shrinks the element's
    min-content width to a single character, and a flex item sized from that
    gives the words a column two letters wide while the price sits in daylight.

    **`--num-lift` is the other half of `--cap-lift`.** Two faces sharing a
    baseline is not the same as two faces looking level: Graphe's capitals are
    drawn riding high above their own baseline — a canvas puts their ink a pixel
    clear of it at 19px — so a mono digit sitting honestly on that baseline
    hangs low beside them. Measured, like its twin, and applied with `position:
relative` rather than a transform, which does not apply to an inline box.

    The figures carry no weight of their own. A face of its own is difference
    enough, and synthesised bold on a system mono beside a hand is two kinds of
    emphasis for one distinction.

79. **Every ✕ stands in one column, out in the margin.** There are two ways to
    delete something on the sheet — the one a done task offers, and the one a
    group offers while its name is being edited — and they used to sit in
    different places, each taking its width out of the row it was on. On a task
    that meant the price column stopped being a column the moment anything was
    ticked, which is most of what a shopping list does.

    Both now sit in `--gutter`, absolutely positioned out of the flow, so a ✕
    appearing moves nothing. The box starts at the row's own edge, so it never
    covers the price beside it and tapping a price still opens the row, and it
    stops half a rem short of the viewport, so it cannot push the sheet
    sideways at 320px. It overlaps the drawn paper edge, which was accepted:
    the alternative was a permanent 44px indent on every list, numbers or not.

    It is narrower than `--touch` across and keeps the full 44px of height.
    That is the price of the position, and the only place in the app that pays
    it.

    A consequence worth naming: **the group's collapse icon stays put while the
    name is being edited.** It used to give up its square to the delete; with
    the delete in the gutter there is nothing to give up. The icon also moved up
    beside the title, so the total is the last thing on the header row and
    stands directly over the prices it is the sum of.

80. **The caret goes with the tap, and Escape had to be taught to discard.**

    Tapping a task swapped its text for an edit field that was never focused.
    Nothing could be typed into it, and — because an unfocused field never blurs
    — the row never committed and never came out of edit mode. On a task with a
    count and a price in it, that reads exactly like the two being lost, which
    is how it was found.

    Focusing it exposed the second half. `onblur={commit}` plus an Escape that
    only set `editing = false` meant Escape _committed_: taking a focused field
    out of the document blurs it. It was invisible before because there was
    never anything in the field to keep. Escape now puts the text back before it
    drops the field, on the task row and the group title alike.

81. **Backspace is the other half of Enter.** Enter leaves a task and opens a
    fresh row beneath it; backspace on a row with nothing left in it closes that
    row and carries the caret back to the end of the task above. A task that has
    been emptied of its words goes the same way, through the ordinary delete, so
    the ordinary undo catches a slip. A row with nothing above it just closes,
    and nothing is deleted — there would be nowhere for the caret to land.

    Opening another row's editor is the one thing a `TaskRow` could not do from
    outside, and it is `Sheet` that knows which row is above which. So `Sheet`
    holds the id, as it already holds where an open empty row is sitting, and
    the row clears it as soon as it has taken the caret.

82. **The menu unfurls: the sheet turns over.** The panel had been laid out from
    the paper's own variables for some time — same width, same margins, same
    room above and below the tear — expressly so that it would land on the sheet
    rather than beside it. Both files said as much in their comments. But it
    appeared instantly, so the one claim the geometry existed to support was the
    one thing nobody ever saw. Now the sheet folds edge-on and the panel opens
    back out of the same line, half of `--flip` each.

    **About the middle of the paper, not an edge.** A receipt turned over is
    held in the middle and spun; hinged at a side it is a door, or a page in a
    book, which is a different object. The middle is also the only axis that
    does not favour a hand — the sheet narrows to the same line from both sides
    at once. It was built hinged on the right edge first, on the reasoning that
    the burger is there and the ✕ that replaces it is drawn at the same point,
    so the two would barely move while the paper turned around them. That is a
    real property and it is not worth the object it makes.

    **Two elements, not one turning through 180°.** The sheet is in flow and
    scrolls with the list; the panel is fixed to the viewport with its own
    scroller. Putting both in one `preserve-3d` box means laying the page out
    around the animation, and the page is the thing the animation is about.

    **Every half-turn is the same movement, and the paper only ever spins one
    way.** A hand pushing the paper rightwards sends the side under it back and
    brings the far side forward, the way a revolving door goes — so the face on
    its way out leads with its **left** edge and goes to edge-on (`0 → 90°`),
    and the face arriving settles out of its right (`-90° → 0`). Opening and
    closing are identical, because the paper does not know which side it is on —
    so a swipe rightwards always spins it the same way, and swiping again
    carries the rotation on rather than winding it back. A receipt spun in the
    hand keeps going round; it does not return along the arc it came by.

    It turned the other way for a while, which read as pulling the paper rather
    than pushing it: the side under the finger came towards the reader while the
    finger went the same way, which is not what a hand does to a sheet.

    That means a sign flip at each join: `.turning` leaves the sheet at `90°`
    and `turn-back` picks it up at `-90°`, a quarter further round rather than a
    quarter back down. Nothing is seen of it — both are edge-on, the sheet has
    no width at either, and the panel is over it at full width at that moment
    anyway. The near edge changes sides at the same join, because the panel's
    words are set to be read rather than mirrored, and that is invisible for the
    same reason. Nothing turns past a quarter, so no content is ever shown from
    behind.

    Three wrong turns on the way here, kept because each one's reasoning looked
    sound and was answering a question nobody had asked.

    The first folded the paper to edge-on and opened it back out along the arc
    it came in by, keeping one edge near throughout. Continuous to look at, but
    it is a sheet being folded shut and reopened rather than one being turned
    over.

    The second was the argument for it: on the right-edge hinge, the version
    that mirrors magnified its near edge to 411px on a 390px screen and cut off
    its own drawn frame. Real, and an artefact of hinging at an edge — about the
    middle the near half's magnification is paid for by the far half, and
    measured at 320, 390, 768 and 1280 no version leaves the paper. The
    measurement outlived the condition it was taken under.

    The third had the two halves mirroring each other, which is a true 180°
    flip and does turn the receipt over — but it reverses on the way back, so a
    second swipe the same way unwinds the first. Correct for a page in a book,
    where there is a spine to reverse about. There is no spine here.

    `transform-origin: 50% var(--eye)`. The Y half is not the axis — a `rotateY`
    is the same rotation wherever the origin sits vertically — it is the
    vanishing point, which `perspective()` takes from the transform-origin too.
    Left at the middle of the element, a sheet as tall as its list turns away
    towards a point a screen or more below the reader. `+page.svelte` writes the
    viewport's middle there at the tap, one rect read.

    The panel is in the document from the instant of the tap, with its trap
    armed and its focus taken; only the drawing waits, held edge-on by an
    animation delay. So nothing is held back for a keyboard or a screen reader.
    That delay is also why `prefers-reduced-motion` is asked in JavaScript here
    as everywhere else: the backstop in `app.css` shortens durations and says
    nothing about delays, and a panel left to it alone would hang edge-on and
    unreadable for exactly as long as the animation it was not playing.

    The drag that dismisses the panel turns it back now, instead of sliding it
    sideways. It used to translate along X and snap home, under a comment
    reading "Springs back", which nothing transitioned and which therefore did
    not. Sliding was also the wrong gesture for a panel that is the back of the
    sheet: there is nowhere beside the paper for it to go.

83. **The edge coming forward is drawn heavier as it comes.** A sheet turning about
    its middle brings one side towards the reader and sends the other away, and
    the transform says almost nothing about which. Worse than nothing: a vertical
    stroke's width is measured across the paper, so the rotation that ought to
    thicken the near edge compresses it instead, and both sides come out thinner
    than they started. Measured at 45°, a near edge magnified by perspective to
    1.13 and compressed by 0.71 lands at 0.8 of its own weight.

    So the weight is drawn rather than derived. `near-out`, `near-in` and
    `near-home` in app.css take the near edge to `--near-peak` times its own
    weight at the point it is nearest, and the far edge is not touched at all —
    the asymmetry is the whole signal, and thickening both would say only that
    something was happening.

    Two ways it was written and did not work, both silent. `--hand` was already
    the typeface, so naming the drag progress the same made every one of these
    declarations invalid at computed-value time and `stroke-width` fell back to
    its initial 1 — the panel's own left edge had been drawing at 1px rather
    than 1.4 at rest for the same reason. And with valid values it still
    stepped: `--stroke` is unitless, so `calc(var(--stroke) * 2)` stays a
    `calc()`, and two unresolved calcs do not interpolate. Multiplying through
    by `1px` resolves them. The timing is `linear` rather than eased, because
    the weight is a reading of how near the edge is and not of how far through
    the animation it is; easing both put nearly all of it into the last few
    degrees, where the paper is edge-on and there is nothing to see.

    **What `--near-peak` names is what reaches the screen, not what is drawn.**
    Three times the weight, drawn, arrives as rather less than three and by a
    different amount at every angle. So the wanted multiple is stated in what the
    reader sees and the geometry is divided back out: `cos` for the compression,
    and the square of the distance ratio for the perspective magnification, which
    needs half the paper's width — `--half`, measured in JavaScript because CSS
    cannot ask. Measured across a turn the on-screen weight now tracks the want
    exactly to about sixty degrees, and the drawn stroke stands at `--near-cap`
    by the quarter, where the paper is edge-on and there is nothing to see.

    It is written as a blend between one and the corrected peak, weighted by
    `--near`, rather than as the corrected want on its own. The difference is the
    far edge: with `--near` of nought the plain version still divided by the
    compression and came out at one over cosine, so the edge going _away_ from
    the reader thickened as the paper turned. Both ends of the blend are exact
    and the middle is within a fiftieth of what the geometry asks for.

    Which edge is near is not a state anything is told. It is the sign of the
    sine — `max(0, sin(--turn))` on the left, its negation on the right — which
    is why `--turn` is registered with `@property`: registered, it interpolates,
    so the transform becomes a plain rule reading the angle and everything that
    is a reading of the rotation falls out of that one number. Three keyframe
    blocks and a whole custom property went with it.

    `near-home` was separate from `near-in` and that was the point of it. A drag
    that stops short leaves the paper part-turned and its near edge part
    weighted, and springing home from the peak made the line grow heavier while
    the paper was straightening and the edge going away from the reader —
    backwards, and the wrong way round twice over.

    Which side is near is not decided in the keyframes; it is whichever side the
    selector points at, and that is the left one leaving and the right arriving,
    on both faces of the paper — the far side of a pushed sheet is the one that
    swings towards you. Under a finger the weight follows `--hand`, how
    far round the paper has been turned from nought to one, so the animation
    picks it up where the drag left it rather than starting again from flat.

    It is worth naming what this breaks: §62 says animation here is opacity and
    scale. A stroke gaining weight is neither, and it is not a colour or a shadow
    either — it is the line drawn heavier, which is what a nearer line looks like
    in a drawing. That is the same argument the turn itself won, and it is the
    last one of its kind: the mark is not moving or changing what it means, only
    being drawn with more of the pen.

84. **The far half of a turning sheet cannot be put out of focus, and it was
    tried.** A rotation gives an eye two cues about which way a surface faces,
    and the app has one of them: the near edge drawn heavier. Weight can only
    speak at an edge, and the surface between the edges says nothing. Depth of
    field is what would say it.

    It shipped for one commit and came straight back out. Two panes over the
    paper, masked to fade at the middle, blurring with `backdrop-filter` — and
    the result was a doubled ghost of the whole sheet, offset from the sheet
    itself. The cause is not tuning. `backdrop-filter` samples its backdrop at
    the backdrop root, in screen space, and the filtered image is then drawn
    through the element's own transform: inside a rotated element it is
    transformed a second time. Switching the panes off in the same paused frame
    made the ghost vanish, which is how it was pinned down rather than guessed
    at.

    A gradual blur of live content inside a 3D transform needs the content
    duplicated — one sharp copy and one blurred, masked against each other — and
    the content here is the whole list. A uniform `filter: blur()` on the paper
    would stay in register, because a filter applies before the transform rather
    than after it, but a sheet uniformly out of focus is not depth of field and
    says nothing about which half is further away.

    The other way that would work is to take the panes out of the rotation
    entirely — fixed to the viewport, over where the paper is drawn, driven by
    the same state — so the blur samples the already-rotated sheet in screen
    space. That is a real restructure, and it is written down here rather than
    half-built.

    It also settles a palette question by removing it: a blur of black on white
    is grey, and while the turn was the one place that might have earned the
    exception, nothing earns it while it is also broken.

85. **A drag rightwards turns the receipt over, from either face.** The sheet is
    dragged aside to bring the menu up, and the panel is dragged aside to put it
    back. One gesture on one object, whichever side happens to be showing —
    having it only on the panel made the turn something the paper did to you on
    the way in and something you did to it on the way out.

    `src/lib/turn.ts` holds the arithmetic both sides read: how far a drag has
    turned the paper, where it has pushed the axis, and whether letting go
    finishes the turn. Only the sign differs, because the two are halves of one
    rotation. It is a module with a test rather than a pair of near-identical
    handlers, which is the shape the second copy of anything here has always
    drifted into.

    **A sheet pushed sideways goes sideways first.** The paper slides before it
    begins to come round, and its near edge is unweighted for the whole of that,
    because a paper that is not turning has no near edge. A hand does not spin a
    receipt from the instant it touches it, and rotation that begins on the
    first pixel reads as a mechanism rather than as paper. The slide is a
    `translate` and the turn a `transform`, so the two compose without either
    having to know about the other.

    How far it may slide is not a constant: it is the room between the paper's
    own drawn edge and the screen, capped at `LEAD`. The paper never slides off.
    On a phone it is drawn almost to the edges, so the room is a few pixels and
    the slide is barely a nudge — running out of room is what starts it turning,
    which is the truer reading of the two. Measured off the side edge rather
    than off the element's box, because the box carries the paper's margin and
    it is the drawn line that must not leave the screen.

    **The two faces draw the line in different places.** On the panel the drag
    takes hold over the buttons as well. Nothing there owns a press — every
    button is a tap and nothing more — and most of the panel is buttons, so a
    gesture that only worked in the gaps between them was a gesture that mostly
    did not work. A drag that crossed a button is not a press of it, so the
    click is swallowed in the capture phase, which is what the sheet already
    does after a row is dropped. Text fields keep their own drag on both sides,
    which is selecting text.

    Both sides take `setPointerCapture` on the **first move**, not on the press.
    Capturing a pointer retargets the click that follows it to whatever holds
    the capture, so taking it on `pointerdown` stopped every button on the panel
    working — the click arrived at the panel instead of at the button under the
    finger. A press that never travels never captures, and so is still a press.

    On the sheet it takes hold on bare paper only. Everything on the sheet that
    can be pressed already owns a press — the long press that lifts a task, the
    one that lifts a group — and a receipt that turned over when someone meant
    to carry a row would be worse than one that only turns from the margins. It
    also gives the gesture up at the first sign of vertical movement, since the
    sheet is the thing that scrolls, and `touch-action: pan-y pinch-zoom` on
    `main` says the same to the browser. Pinch is spelt out because `pan-y`
    alone would take zoom away with it, and this is a sheet of words.

    Both sides take `setPointerCapture`. Turning the paper takes it out from
    under the hand — that is what turning it means — and without capture the
    events go to whatever is underneath, so the move stops being seen and the
    release is never heard, leaving the paper hung at the angle it reached.

    **The axis moves a little, and comes home first.** A sheet spun in the hand
    is not held in a vice: `--axis` drifts up to `DRIFT` percent off the middle
    with the push, and `recentre` in app.css brings it back under `--inertia`,
    which overshoots slightly and settles. It runs on a shorter clock than the
    turn — 60% of `--flip` — because an axis still wandering at the quarter
    would hand the other side of the receipt a turn about a line that is not its
    own. That means two animations on one element rather than one, since a
    single keyframe timeline can only be eased one way at a time, and it means
    both `animationend` handlers have to ignore `recentre`: it ends first, and
    the panel's handler is what unmounts the panel.

86. **The sheet is prerendered, so it may not carry a `style:` directive.**
    Svelte renders one as a literal `style="…"` attribute in the HTML that
    ships, and `style-src 'self'` refuses an inline style outright — the page
    hydrated with two console violations the moment `--turn` and `--axis` were
    bound that way. They go on through the CSSOM instead, the route `--eye`
    already took.

    The panel is free to use `style:` and still does. Nothing is open when the
    page is built, so it is never server-rendered and the attribute never
    reaches the HTML. The difference is not a rule about which directive is
    safe; it is a rule about which elements are prerendered.

    `e2e/csp.e2e.ts` caught it, which is the whole reason it watches the console
    rather than only reading the header back.

87. **The paper is torn, not drawn torn, and the teeth are what cuts.** On two
    colours the ground behind a tear is the same white as the paper in front of
    it, so nothing about a filled box is visible until something passes behind
    the teeth. In the panel something does — the writing scrolls — and it was
    cut along a straight line a tooth's height short of the teeth, which floated
    clear above it. A zigzag with a white rectangle doing its work.

    **The fill goes on the outer side.** `TornEdge` closes its zigzag along the
    top of its own box and fills that, so what is past the tear is not paper and
    anything travelling that way is cut tooth by tooth. The bottom tear is the
    same svg turned over, so its outer side is the room below. Nothing is filled
    on the inside: the paper's own ground is already there, and a second one
    painted over it is the rectangle this replaced.

    **The scroller runs the full height of the paper, tears included.** That is
    the other half, and neither half cuts anything alone. `.menu` pads by
    `--paper-top`/`--paper-bottom` and no more; the room the writing needs clear
    of the teeth is `.scroll`'s own `padding-block: var(--tear)`, held inside
    the scroll rather than outside it. A line therefore rests exactly where it
    always rested, and it is the room above it that scrolls away, carrying the
    line up behind the tear to be cut there.

    An earlier pass had the fill on the inside and the scroller stopping at the
    tear's inner edge. Both were wrong in the same direction and each hid the
    other: the inner fill was invisible against the panel's own ground, and the
    straight cut was blamed on the tear being drawn too high.

    **The sides run up into the tears and are cut back by the teeth.** They used
    to stop flush at each tear, which ends them on a clean horizontal — a sheet
    guillotined at three edges and torn at the fourth, and the one thing left
    saying the tear was a band laid on the paper rather than where the paper
    gives out. They overhang by a tear at each end now and the teeth take them
    back, which is the same cut the writing behind a tear gets.

    That only reads if both tears are painted over the sides, and the two faces
    reach it differently. The panel writes its sides before both tears and needs
    nothing more. The sheet cannot: its top tear is above the paper in the flow
    and its bottom tear below it, so whichever order the sides are written in,
    one tear is on the wrong side of them. Both are lifted instead — positioned,
    `z-index: 1` — which says it once for the pair.

    The ground closes a full tear **past** the box rather than flush at it. The
    box is `overflow: visible`, for the zigzag's own stroke, and the sides
    running up into it carry a round cap that reaches past their box too; closed
    at nought, that cap came out above the teeth as a stray tick of ink.

    **The tears stop on the two verticals rather than running past them.** The
    zigzag used to be drawn to the full width of the paper while the sides sit
    half a `--edge` in from it — that is where a side's stroke runs in its own
    box — so each tear overshot its corner by a few pixels and left a whisker of
    the paper's edge sticking out into the margin. Trimming both tears by that
    half gives the two marks one corner.

    Which puts the outer half of each vertical, and the cap on the end of it,
    outside the fill: the ground's own boundary is the line the tear starts on.
    So it carries a strip past each end — `PAD` further out, and down as far as
    the corner the zigzag made there and no further, because below the corner
    the side is the paper's own edge and has to be seen. The left corner is the
    midline, where every tear starts; the right one is wherever the last tooth
    landed, which the path is the only place that records.

    The strips are outside the tear's span and nowhere else. One rectangle
    across the whole width would be simpler and wrong: it would cut the paper
    straight along the midline wherever a tooth reached above it.

    The sides themselves are still not jagged, and that is right: paper running
    the last few pixels out to a straight drawn line is what a straight drawn
    line means. It is only their ends that the tear now owns.

88. **CLEAR left the menu for the group it sweeps.** It was a button in a panel
    with a confirm in front of it, which is a long way from the tasks it was
    about to take — and the confirm was there precisely because the tap was so
    far from them. The group's own mark does it now: the same scribble that
    removes a group, doing the other half of the same idea. While there is
    still something in the group to do it clears what is done; once there is
    not, it removes the group, which is what it always did.

    So the mark is drawn whenever it has a job and never when it has not,
    which is the rule a done task's own mark already follows. No confirm: the
    mark says which of the two it is, it is only ever there with something to
    sweep, and the ten-second undo covers the change of mind, exactly as it
    does for removing a group.

    Having a job is not enough to be offered, though. Two states put a group
    in hand rather than in a list — its name is open, or it is folded away —
    and the mark belongs to those. Drawn on every expanded group with a done
    task under it, the sheet grows a column of live deletes down a list
    somebody is only reading, which is the thing a task's own mark was taken
    off hover to avoid. A row's mark is different in kind: it sits on the one
    task it would remove.

89. **A run of ticks offers to sweep itself.** Three tasks ticked inside five
    seconds is somebody at the end of a shop going down the list, and what
    they want next is those rows gone. The message offers it and never does
    it — a sheet that cleared itself would be the app deciding — and it is
    offered once per run rather than once per tick after the third, because
    the second kind is nagging. The offer clears exactly the tasks in the run,
    checked against what is still done when it is tapped, so a tick taken back
    in the meantime is left alone.

90. **A drop leaves a message with a way back; a keyboard move does not.** A
    move is the one change a finger makes that leaves no trace of where the
    thing came from. Where it came from is two strings read off the task before
    it goes, and putting them back is an ordinary move stamped now, not a
    rewind. Alt+↑/↓ keeps its announcement instead: it is exact, it says where
    the task went, and a run of them down a list would raise a message a step.

91. **The checkbox gave the first word back.** Its target reached a third again
    past its own mark so that a finger going for the box and landing on the
    first word still ticked the task. What that cost was the first word or two,
    which then belonged to the checkbox: tapping them ticked instead of opening
    the row, and pressing them could not lift the task at all, because the lift
    lives on the words and the box was sitting on top of them. Two of the row's
    three gestures went missing at the one end of the row a finger goes to,
    which is dearer than the mis-tap it was buying. It is `--touch` across
    again, and still the full height of the row.

92. **One scribble, drawn once.** Every delete mark was seeded from the thing
    it would remove, so a sheet of done tasks showed a different scribble on
    every row — which is the "seeded so it never re-jitters" rule applied to
    the wrong noun. The seed is the mark's own name now (`SCRIBBLE` in
    draw/hand), so the mark on a task and the mark on a group header are the
    same drawing. It is as tall as the checkbox at the other end of the row and
    narrower than it is tall, because the column it stands in is narrower than
    the checkbox and the ink must keep clear of the paper's drawn edge.

    The shape is unchanged — four legs, alternating ends, one unlifted stroke.
    What the taller box did change is the padding: read as one fraction of
    both axes, four legs in a tall box land three pixels apart and merge into
    a smudge, so the two are now fractions of their own axis. What keeps a leg
    from lying flat is room above and below it, not room either side.

93. **A collapsed group says what is left, not how much is under it.** `[3]`
    answered the wrong question: a group is folded away because it is dealt
    with or because it is not yet, and a total says neither. `[1/3]` is what is
    still to do out of what is hidden, with half counting as still to do,
    because it is.

    Unless nothing in it is done, when both halves of the fraction are the same
    number and it says no more than the total does — so it goes back to being
    a total. A fraction is worth its second number only where there is a
    difference between them to report.

94. **A long press on the fold icon folds every group.** The icon is the fold
    control, so the bigger version of folding belongs to it — and on a long
    list it is the difference between a sheet and a scroll. It opens them all
    again when there is nothing left folded, so the gesture always has a way
    back. Nothing is written that the tap does not write: it is the same local,
    never-synced record, set for every group at once.

95. **A drop below the last task landed it first.** Below the last row there is
    no row to hit-test, only the group, and the group counted the row being
    carried among its own children — so the drop asked for a place one past the
    end of the list it was going into. Neither neighbour existed at that index,
    and a key between nothing and nothing is the first key there is. The count
    now leaves the carried row out, exactly as the row branch beside it always
    did, and `orderAt` clamps besides: a caller that is one out should be one
    out, not inverted.

    The same fault drew a landing rule where the row already was: the end of
    the group came back one higher than home, so the guard that refuses a
    no-op drop did not recognise it.

96. **The landing rule needed the shift the group's rule already had.** The hit
    test counts the rows with the carried one taken out, because that is the
    list it is going back into; the markup counts every row it draws. Below the
    row's own place the two are one apart, so the rule appeared directly under
    the row in the hand — an offer to put it back where it already was, beside
    a drop that would have done something else. `isGroupLanding` had this
    translation and its own docstring explaining why; `isLanding` now has both.

97. **The brackets are lifted onto Graphe's baseline.** Graphe has no `[` or
    `]`, and that is deliberate: they are what a markdown checkbox is written
    with, and swapping in characters the face does have would be changing the
    mark to suit the tool. So the platform substitutes a face of its own —
    Roboto on Android, whatever is to hand elsewhere — and that face sets its
    brackets on the true baseline, while Graphe's figures and capitals are
    drawn well above theirs. The brackets in the fold icon came out sitting low
    around the numbers they enclose.

    `--bracket-lift` is the correction, and it is the same fact as `--cap-lift`
    and `--num-lift` one face further out. Measured rather than derived: on a
    canvas at 24px a substituted `[` runs from 17 above the baseline to 3
    below, and Graphe's figures and capitals both run 19 above to 3 above —
    four pixels between the two middles. One number for every platform, which
    is the honest thing to have when the face at the other end is whatever the
    phone happens to own.

98. **Round brackets, which Graphe has.** The fold icon was set in square ones,
    which it has none of, so a substituted face drew them on the true baseline
    and they sat low around the figures they enclose. §97 corrected that with a
    measured lift, which worked and was a lot of machinery for a character the
    face has a proper answer to: Graphe's `(` runs 20 above the baseline to 1
    below against its figures' 19 above to 3 above, so it encloses what it
    holds and needs nothing. The lift and the span it hung on are gone.

    Not the markdown checkbox, which keeps its square brackets and its
    deliberate fallback: those are what other apps read, and the export has to
    stay readable by them.

99. **The group title's tap is optimistic after all.** It was held back for the
    double-tap window (§56 and the note beside it), on the reasoning that a
    whole list folding and unfolding under the thumb is a worse flicker than a
    third of a second of lag. The lag is what people actually notice, and they
    notice it most beside the fold icon two millimetres away, which has always
    answered at once — one control answering slower than its twin reads as the
    app being tired.

    So the tap folds, and the second tap puts the fold back before opening the
    name. Which click is the second is read off `event.detail`, the browser's
    own count of the run, and never off a timer: a window cannot tell the
    second click of one pair from the first click of the next, and two
    deliberate double taps a tenth of a second apart are a thing a test does
    routinely and a finger does eventually. That is not a hypothetical — it is
    what the suite did, and the group came out collapsed behind the field it
    had just opened.

100.  **Enter on a group title only opens a task when the group is empty**, and
      the row that makes a group counts. Naming a group and writing the first
      thing into it is one motion, and an empty group is the only time the next
      thing is certainly a task. On a group that already has tasks, somebody
      has come to change the name and Enter is how they say they are done with
      it; an empty row opening underneath put a caret in the middle of a list
      nobody was adding to, and closed it again on the next tap anywhere.

      The row that makes a group was left out at first, and it is the commoner
      way to reach an empty group by far — making one is what empties it. It
      committed by blurring its own field, and a blur cannot say whether Enter
      caused it, so it now commits in the keydown like every other row here.
      Tapping away still only makes the group: Enter alone means "and the next
      one", which is also why the blur handler has to be `() => addGroup()`
      rather than `addGroup`, or the event lands in the argument that decides.

101.  **A group's name is quoted where the app says it back.** "Deleted Weekend
      and 3 done" leaves the reader to work out where the name stopped, and a
      group called "and" or "done" makes a sentence out of nothing. Not in an
      announcement, where a quotation mark is noise or silence depending on the
      screen reader, and not around "the untitled group", which is a
      description rather than a name.

102.  **Joining never throws a list away.** "Leave them" meant discard: the open
      list was wiped and the joined one arrived in its place, so answering a
      question about a handful of tasks threw away the list they were on. The
      device holds as many lists as it likes, so the honest reading of leaving
      them behind is that they stay behind — the joined list arrives beside this
      one and the switcher shows both. The question said "leave them behind" the
      whole time; the words were right and the app was not.

      The new list is made before the pull, because it is the list the pull has
      to land in. If the code is wrong or the network is gone, the device goes
      back to the list it was on and the blank one is dropped as it is left,
      having written nothing — and `sync.message` is read before that switch,
      because switching re-points sync at the other list's key-set and clears
      what it had to say about the attempt.

103.  **The code field pastes on a tap.** A code arrives in a message, so it is
      on the clipboard nine times out of ten and the next move is always the
      same: long-press, wait for the menu, choose Paste. The field does it
      itself, on the tap, which is a gesture a browser will allow a clipboard
      read inside. Only into an empty field — a tap in a field with something
      in it is a caret being placed — and only when `codeFrom` finds a code,
      so a clipboard holding a shopping list puts nothing in it. A refused or
      empty clipboard says nothing: Firefox rejects a read outright and Safari
      asks first, and the keyboard was there either way.

104.  **LEAVE reads DELETE without a code.** They are two different acts wearing
      one button. With a code the list carries on without this device and can be
      come back to, which is leaving; without one this device is the only place
      it has ever been, and there is nothing to leave it to. The confirm agrees
      with the button that opened it.

105.  **Sync moved into "This list", and the import preview went.** A sync is
      the most this-list thing in the panel — it is this list going to the
      server and coming back — and it had the top to itself above the tear, so
      the panel opened on a sentence about a list it had not yet named. The
      section now reads down in the order the acts belong in: what is waiting,
      SYNC NOW, IMPORT/EXPORT, the code or the note saying there is none, and
      the button that ends it.

      The import modal had two boxes of nearly the same text, one editable and
      one not — the parsed list written back out in export notation, on the
      grounds that a line without a bullet becomes a task and only the parse can
      say so. The count above the buttons says that in a sentence, and the box
      that is left is the one you can fix a stray line in.

106.  **The switcher is level with the ✕.** The scroller begins a tear's depth
      inside the paper, so being flush with the top of it put the pill
      `--corner-lead` above the ✕ — near enough to read as one row and far
      enough out to read as a mistake in it. `--corner-y` is `--paper-top +
--tear + --corner-lead` and the scroller's own top is the first two, so
      the lead is exactly what was missing. The ✕ does not move: it is placed
      where every corner control in the app is placed.

107.  **Leaving has an undo, like everything else that takes something away.**
      It was the one change that offered nothing afterwards, on the reasoning
      that the confirm in front of it was enough. A confirm stops the accident;
      it does nothing for the change of mind, which is what an undo is for —
      and the tap that ends a list is exactly the tap somebody regrets a second
      later. §1 said DELETE removes the list from this device only, which is
      what makes this possible: nothing left the device, the server was never
      told, and what went is five keys' worth of strings this device wrote
      itself.

      So it is the one undo in the app that is an undelete rather than a change
      stamped forward. The forward rule exists because a device that already
      synced a deletion would otherwise win the next merge and re-delete
      everything; nothing here ever reached a merge, so the same bytes go back
      under the same keys and the list returns with its code, its folded groups
      and its place in the switcher.

      What is captured is the **whole index**, not the row that went. Removing a
      list rewrites what is left, and the rewrite can take the index away
      altogether — one list remaining under the bare keys needs none, so
      `#persist` drops it. Putting one row back into whatever that left behind
      restores the wrong shape: in the case that found it, the other list was
      still on the device and no longer reachable from the switcher.

108.  **Enter and Backspace at the very start are each other's inverse now.**
      Enter at the start used to leave the task whole and open an empty row
      _beneath_ it, on the grounds that the head would be empty and a task may
      not be. That is the same two rows in the other order, and it reads as the
      task staying put while something appears below it — where every other
      place that takes writing puts the line down and opens an empty one above
      it, with the caret. So the empty row opens above, and the document is not
      touched at all: nothing is rewritten and nothing is restamped, because a
      draft is the only row that may be empty and drawing one before the task
      is the whole of the change.

      Backspace at the start is the other direction: the task joins onto the end
      of the one above and the caret waits at the seam. Quietly — nothing was
      taken away, the words are a line higher, and a "Deleted." toast would be a
      lie about the one thing it is there to report — and refused outright when
      the two will not fit in one task, since dropping the overflow to make them
      fit would lose writing. Both read `selectionStart === selectionEnd === 0`
      rather than an empty head from `splitAt`: double-tapping a word selects
      it, which is somebody about to replace it, and that arrives looking
      identical.

      The caret after a cut also moved. It sat behind what came down, which is
      right for a row that ran out of room and is still being typed at its end,
      and wrong for a cut somebody asked for — Enter in the middle of a line
      puts the caret at the head of the new line. The two cases are told apart
      at the call site rather than guessed at from the payload.

      A row still being typed answers to the join too, which it did not at
      first: the key was written on the task row and the draft row was left
      with only its emptied-out case. On the sheet the two are the same thing —
      one line of writing with a box beside it — so a key that worked on the
      row above and not on the one under the finger read as the app having lost
      its place. The only real difference is that a draft leaves without
      anything being deleted, which is why the join takes the task to remove as
      an optional argument rather than assuming there is one.

      And a row with no task above it goes up to the group's own name, rather
      than closing and leaving the caret nowhere. Enter on an empty group's
      title is what puts that row there (§100); backspacing out of it is the
      same motion in reverse, and stopping dead one keystroke into naming a
      list is not an answer. Only for a row still being typed — a real first
      task emptied to nothing is already refused, because deleting it would
      take the caret somewhere no task is and the task with it.

109.  **An open add row's box takes the ink once something is written in it.**
      Empty, the row is still an offer, and its box is drawn as faintly as the
      ellipsis it replaced. The moment there is writing the row is a task — it
      becomes one as soon as the finger leaves — so the box stops being a
      suggestion and becomes the box that task is getting. Nothing moves; only
      the weight of the line changes, which is the difference between a thing
      offered and a thing there.

110.  **A lift is put down when the node holding it leaves.** The action's
      cleanup released its own capture and cleared its own timer, and left the
      shared drag exactly as it was. A node can go with a finger still on it —
      a group title swaps itself for its edit field, a row changes which element
      it draws — and once it has, no pointerup, pointercancel or
      lostpointercapture will ever reach those handlers again.

      Because the lift is one shared state rather than a flag on the row, what
      that left behind was not a stalled drag on one title: it was every group
      folded shut, a dashed outline round a name, and nothing anywhere on the
      sheet able to clear either. `destroy` resets the drag when this node was
      the one holding it, and `lostpointercapture` covers the other half — the
      browser taking the pointer away while the node stays.

      `stop()` clears `lifted` before releasing a capture rather than after,
      which is load-bearing: releasing fires `lostpointercapture` there and
      then, and a handler that could not tell that from a real interruption
      would reset the drag between `stop()` and the drop it was about to
      deliver, and no drop would ever land again.

111.  **The group title's press has two lengths in it.** Renaming was two taps
      and nothing else, which is a gesture you have to be told about — where a
      press is what a finger tries on anything it suspects of holding more. So
      holding briefly opens the name and holding on picks the group up, with a
      buzz at each threshold: the first says a release now will open the name,
      the second says the group is in hand. Twice the shorter press, so the two
      are told apart by feel rather than by counting.

      It answers on the release rather than at the threshold, and it has to.
      Nothing at a threshold can know whether the finger is going to stay down
      — and opening the name swaps the title for its own edit field, which
      takes the node out of the document, so a press that fired there would
      leave the longer one nothing to fire on. The buzz is what stands in for
      knowing.

      The click that follows either stage is swallowed, the same way the click
      after a drop already was, or the group folds underneath what the press
      has just done. It is armed before the hooks run rather than after,
      because the shorter press can take the node — and the listener that does
      the swallowing — out of the document.

      No other control has two presses. Everything else lifts at
      `LONG_PRESS_MS`, and can: a task's other gestures are taps, and the
      checkbox's press is its only one. Two lengths where one would do is a
      thing to be able to justify twice over.

112.  **The debug switch is not on the panel until it is on.** It is a tool for
      whoever is building the app rather than a state the app has — §12.14's
      "no chrome" is about exactly this — and a switch for it sitting in the
      menu says the opposite: it is the one thing in there that is not about
      this list, and it was the first thing under the last tear where anybody
      scrolling would meet it.

      A long press on the burger turns it on, because the switch lives in the
      menu and that is the menu. The press swallows the tap that would have
      opened the panel, the same swallow a drop uses, and `longPress` buzzes on
      the threshold itself — which is the whole of what says the press landed,
      since the panel is not open to show it. The button stays where it was,
      because something has to turn it off again, and it is only ever seen by
      somebody who has just turned it on.

      Nothing else changed: the log, what it keeps, and the fact that turning it
      off clears it are all as they were.

113.  **The two authors are held together by a hard space.** A line break
      between "and" and the last name leaves one of them hanging alone at the
      start of a line, which is the one place on the sheet where the typography
      is the point. Written as `\u00a0` in the catalogue rather than as an
      invisible character in the source.

114.  **A group in hand is offered the corner, and the corner alone changes to
      say so.** A group being carried has three places to go, and two of them
      are not on the sheet: another list, and away. Both belong in the corner,
      because the corner is where everything that is about the list rather than
      about the writing already lives.

      So the theme and the burger leave the moment a group is lifted. Neither
      has anything to say to a group in hand, both are a tap where the finger is
      already holding something, and between them they occupy the only place
      the answer could go. Nothing about the swap is animated: it happens under
      a finger that is already moving, and a control fading out while something
      is being carried over it would be the corner arguing with the hand.

      What appears in their place is the paper's own corner, turned down. It is
      drawn the way the tear is — the ground is closed past the fold and filled
      with paper, so the torn edge and the side edge are cut on the diagonal
      rather than drawn over. A corner is either turned down or it is not, so
      that too appears without an animation.

      **The corner brings its own edges over with it.** The paper's corner is
      reflected across the crease, and what the reflection carries is the two
      edges the sheet was cut with: the torn top edge arrives running down from
      the crease's top end, and the side edge arrives running in from its
      bottom one, drawn with the same `handTear` and `handVertical` the paper's
      own edges use. Left as a plain triangle it was a corner guillotined off
      and laid back down — the one thing this sheet has never been.

      **The mark on it is a bin, and it stands in the room the fold clears.**
      Every other delete in the app is the scribble, and this is the one place
      that would be wrong: a scribble is a mark made _on_ a thing and belongs
      beside the row it strikes out, where a corner with the paper off it is
      not a mark at all but a place. What a place to be rid of things looks
      like is a bin, and it sits past the crease, which is the one part of this
      sheet nothing can ever be written on. Faint while it is only an offer and
      full ink once the group is over it.

      The hit area is the fold's own square — the flap and the room it has
      cleared — stopping at the crease's two ends rather than at the box the
      fold is drawn in. The top of the list is directly under the corner, and
      that is as far as a delete may reach towards it.

      The fold takes a group whatever state it is in, which is the one rule the
      header's own mark does not follow. That mark is drawn beside a list
      somebody may only be reading, where a live delete has to be earned by the
      group being finished. This is a group already in hand, thrown at the one
      place that means gone, and it leaves the same ten-second undo.

115.  **A group carried onto the switcher moves lists, and the switcher unfolds
      to say where it can go.** The pill wears a dashed box while a group is in
      hand — that is what a dashed box means here, somewhere it can be put down
      — and carrying the group onto it opens a column: every list but the one
      the group is already on, and a row that makes a list on the spot. It is
      the same pair of offers a task already has one level down, where it can
      be dropped into a group or onto the row that invents one — `NEW_LIST` is
      a sentinel list id for exactly the reason `NEW_GROUP` is a sentinel group
      id.

      **The lists are not shown until the group reaches the switcher.** Open
      for the whole of a drag, the column lies across the sheet the group is
      being carried over: it covers the titles a drop between two groups is
      aimed at, and it answers the hit test before they do — a way of moving a
      group between lists that broke moving one within a list. So it opens the
      way a finger opens anything, by arriving, and shuts again the moment the
      group goes back to the sheet.

      That needs `data-switcher` on the column as well as on the wrap the pill
      is in. `elementsFromPoint` answers with the boxes under the point rather
      than with the chain of elements around it, so a column hanging below the
      pill is not the pill's ancestor as far as the hit test is concerned:
      without the second one, crossing from the pill into a gap between two
      rows read as leaving the switcher and the column shut under the finger on
      its way to a list.

      Letting go on the pill itself does nothing. The switcher answers a group
      by unfolding; only a list takes one.

      It is on the page for this even where there is only one list. Otherwise
      the way to a second one by carrying a group there would be missing from
      precisely the device that has never had one. It is withheld while a sync
      is in flight, because a list minted then could not be written to safely
      and a control that is not going to answer is better not offered.

      The column is out of the flow. A column that opened in it would move the
      list under the finger, and the finger is steering by what it can see —
      the same reason the landing rule has no height. It is the menu's own
      dropdown, rows and ground and all, because that is what a list of lists
      already looks like here; the row under the group is marked by its box
      going dashed, which is what the switcher above it is already wearing.
      Only the box changes — the name it holds has to stay legible either way,
      so this is not the dashed rule the sheet draws between two rows: a list
      is a place, not a boundary.

      **The undo is two ordinary changes, not a rewind.** Onto a list that was
      already there, the group is taken back out of it and put back here: that
      list may have a code, may have been synced since, and writing yesterday's
      bytes over it would take anything else that landed there with them.
      `lists.restore` may put a whole list back verbatim only because leaving
      never reached a merge; this is the opposite case. Onto a list the drop
      invented there is nothing to preserve, so it is unmade whole — after the
      group is out of it — which on a device that had one list before the drop
      takes the index away again and leaves exactly the shape it had.

      **Nothing is copied.** `handOff` in src/lib/doc/handoff.ts writes the
      group and its live tasks into the other document as fresh records —
      keeping every id, every word, and every half-done state — and deletes the
      group where it came from, tasks and all, through the ordinary path. The
      records are written fresh rather than moved because the destination may
      still hold tombstones under those ids from an earlier visit, and a record
      stamped now is what beats a tombstone stamped then. The task keys travel
      unchanged: a fractional index is only ever compared against its own
      siblings, and all of them are moving.

      The list being arrived at is written before the list being left. Storage
      can refuse a write, and of the two ways that can go, a group on both
      lists is something a person can see and sort out, while a group on
      neither is writing gone.

116.  **The sheet's turn gives way to anything picked up after it armed.** The
      turn arms on `pointerdown` and asks then whether something is already
      being carried — but a lift takes most of a second, so the press that
      becomes one is a press the turn has already accepted. A group title is
      the case that bites: it is a span with a button's role rather than a
      `<button>`, so it is not among the controls the turn stands aside for.

      What happened next was worse than a sheet turning by mistake. Taking the
      pointer capture over hands it to `main`, the title loses it mid-carry,
      and `lostpointercapture` puts the whole lift down — so a group dragged
      sideways went dead the moment it moved. It never showed while the only
      places to drop a group were above and below it; carrying one to the
      corner is a sideways drag by definition, and it showed at once. The
      question is asked again on the first move.

117.  **The theme moved to the back of the sheet.** It sat in the corner beside
      the burger on the reasoning that a control for how the sheet looks
      cannot be buried under a panel that covers the sheet. That reasoning
      described a drawer; the panel is the other side of the same piece of
      paper, and turning it over to reach the switch shows the answer on the
      way back.

      So it is beside the switcher, which is the other thing in the panel that
      is about this device rather than about the writing, and level with the ✕
      across from them. The sheet's own corner is left to the two things that
      are about the list: what is unsent, and the way in.

      It stays a glyph rather than gaining a drawn box. Every worded button in
      the menu is boxed; the three marks — the ✕, the switcher's pill and this
      — are not, because a box round a picture of the sun is a button round a
      drawing.

118.  **The switcher's column is what a tap opens too, and the modal is gone.**
      The sheet's pill opened a full-screen modal and the menu's opened a
      column in place, which is two answers to one question — and then a
      carried group opened a third. A modal is for something that has to be
      settled before anything else happens; choosing which list you are on is a
      glance at four names, and covering the sheet to show them made a decision
      out of it.

      One column now, in both homes and for both gestures. Escape and a tap
      outside close it, which is what the menu's copy always did: there is
      nothing in a list of names to hold Tab inside, and locking body scroll
      for four rows is a much bigger door than this needs.

      **Never wider than the paper.** It hangs from the pill's own left edge and
      the pill starts a sync mark's width into the row, so the cap is the row's
      width less that — and a name too long for what is left is cut with an
      ellipsis, exactly as the pill above it cuts one.

      The rows are shorter than they were and carry their own padding rather
      than a height floor: less at the sides than above and below, because the
      padding is what the line under a row rules off and a word wants more room
      over it than beside it.

119.  **The marks a drop offers are a loop and a dashed line.** Both were drawn
      boxes, and both were wrong for the same reason: a box is a frame put
      round something, and a frame round a name reads as the name having been
      selected rather than as a place to put something down.

      The switcher wears a loop instead — `handOval`, off level, which is
      somebody's pen going round a word once. A list says where a group would
      land by its own line going dashed: the rule under a name belongs to that
      name, and a dash is what says "here" everywhere else on the sheet.

      That also settled a hit-testing bug. The pill and the column it opens are
      two boxes with a corner of nothing between them — the column hangs below
      and is several times as wide — and a finger crossing diagonally from one
      to the other fell through that corner, shutting the column it was
      reaching into. The drag reads the two as one box round the pair now,
      measured rather than hit-tested.

120.  **The bin is ink, and it boils when a group is over it.** It was drawn
      faint until then, on the rule the add row's box follows — but that box is
      a suggestion of a task that is not there yet, where this is a bin that is
      there whether or not anything is going into it, and a faint one read as a
      control not yet available.

      What says a group is over it is the mark boiling: the same hand redrawing
      the same drawing four times over that the sync button works by. It is the
      one thing on this sheet that means _live under your finger_, which is
      exactly what a drop target wants to say and what a change of weight
      cannot. The technique moved into `src/lib/draw/boil.svelte.ts` in the
      same change — two marks drawing it twice is two techniques as soon as one
      of them is retuned.

      It is never dotted. The dots are the sync marks saying they are mid-flight;
      the bin is saying "here", which is a different sentence.

121.  **Nothing is picked up off a sheet that is moving.** A lift takes most of
      a second and a turn takes about the same, so a press held through a swipe
      came up carrying a row of a page that was edge-on or already face down —
      and steering by a hit test reading boxes off it mid-rotation.

      The page sets `drag.turning` for as long as the paper is turning, sliding
      or swinging home, and `pressDrag` refuses a press while it holds. Refused
      rather than swallowed: the release is still a tap, because a press that
      never became a lift never became anything else either.

122.  **The toast is laid on the sheet rather than set square on it.** A degree
      off level, about a point just inside its own left edge, so the far corner
      lifts. Everything else at the top of the paper is ruled to the row — the
      marks, the writing, the tear — and a message that lined up with all of it
      read as another part of the page rather than as a note dropped over it.

      In `rotate` rather than in `transform`, which carries the arrival and the
      throw: the two must not have to know about each other.

123.  **Both faces of the paper carry the same row.** The sheet's corner had one
      mark at each end — sync alone at the far left, the burger at the far
      right — with the name of the list squeezed between them. With the theme
      gone to the back there was a touch target of room going spare, and the
      obvious thing to do with it was give it to the only part of the row made
      of words.

      So the name goes first, where every other word on the paper starts, and
      both marks go to the end together. The back of the sheet is laid out to
      match: the name, then the theme, then the ✕. The panel reserves the ✕'s
      own column with a padding rather than letting the theme share it — the ✕
      is placed like every corner control at `right: var(--corner-x)`, which is
      exactly where the scroller's content stops, so anything laid out into
      that width ends up underneath it. The two pills come out the same width
      to the pixel, and turning the paper over does not move the name.

      **As wide as its words, not as wide as the room.** Filling the line was
      tried and is wrong twice over: the drop target's loop came out drawn
      round half a sheet of nothing, and the column of lists — which is at
      least as wide as the pill, so that everything under the pill is over the
      column — lay across the first two titles of the sheet, which are titles a
      carried group is aimed at.

      **And the row holds its own height now.** It was held up by whichever
      mark happened to be standing in it, the pill being an inline-flex box in
      a line box ten pixels shorter — so the row shrank the moment a group was
      lifted and both marks left, and the whole sheet stepped up ten pixels
      under the finger carrying it.

124.  **The drop target's loop is one size, whatever the list is called.** It
      was drawn round the pill's own bounds, which is what a box does and what
      `HandRect` had done there before it. On a name of three letters that came
      out a tight ring; on one that filled the line, a long flat ellipse a
      third of the width of the paper. Two lists, two different marks — and the
      whole reason for a loop rather than a box was that it is a gesture
      somebody makes, and a gesture does not resize itself to fit.

      So `--loop` is that gesture's own width, two and a half touch targets:
      about what a pen circling a word on paper draws every time, left to fall
      where it falls. Round a short name it has room to spare, round a long one
      it crosses a letter at either end, which is exactly what circling a long
      word with a pen looks like.

      **And the menu's column of lists hangs where the sheet's does.** The pill
      is a touch target tall standing in a line box the face's own strut
      decides, so it overhangs the box that holds it by five pixels. On the
      sheet nothing shows: the column is absolute and the pill is painted up by
      that same amount, so the two cancel. In the panel the column follows in
      flow, so it began five pixels above where it should — the first rule
      crossing the name it belongs to rather than sitting under it. Given back
      by hand on `.dropdown.menu`, and the first list now stands the same hair
      below the name on both faces.

125.  **The panel's corner is the burger, drawn as a list.** It has been three
      marks now. A ✕ first, which was wrong because a cross closes something
      laid on top of something else and nothing is laid on top here — the paper
      was turned over. Then an arrow pointing back, which was better and still
      wrong: it said _where the tap goes_, where every other mark in this app
      says _what a thing is_, and it left the corner a finger had just tapped
      showing a different drawing than the one it tapped.

      So it is the burger again, with a short dash at the head of each of its
      three rows — which is a burger read as what it has always been a picture
      of. The button does not change identity when the paper turns; it gains
      the marks that say the other side is the list. `handBurger` and
      `handList` are one function with a flag, because retuning the gap or the
      lean of the bars on one and not the other would put two different hands
      on the two faces of a single sheet.

      `handBack` went with the arrow. A drawing nothing draws is weight in the
      bundle and a second answer sitting there waiting to be picked by
      somebody who does not know why the first one lost.

126.  **The switcher's column is the lists you are not on.** It listed every
      list including the open one, marked selected. But the pill a centimetre
      above it is already the answer to "which list am I on" — so the column
      said it a second time, and said it as a row that looked exactly like the
      ones that go somewhere and did nothing at all when tapped. What a list of
      places is for is the places you are not.

      It follows that nothing in the column is ever selected now. That is
      written out rather than dropped, because the `option` role requires the
      attribute; a column where the answer is always "no" is a hint that this
      is closer to a menu than a listbox, and if it is ever given real
      arrow-key roving it should become one.

      **And `+ NEW LIST` is the last row rather than a button.** A drawn box
      round centred words made the one control in the column look like a
      control — which made the rows above it look like something else, when
      every one of them is the same kind of thing: somewhere to go. So it is a
      row, left where their names are and ruled off underneath like theirs. The
      `+` sits where the others have their first letter and is all the
      difference the row needs; it is `aria-hidden`, so what is read aloud
      stays the plain words.

      **The column's width is stated, not fitted — and what it is stated as is
      the full width of the writing.** Left to its contents, the column a tap
      opens and the column a carried group opens came out different widths, and
      even holding the same rows a code appearing would move the edge. A drop
      target that changes width under the finger steering at it is a worse
      thing than a long name losing its tail, and the pill above it already
      cuts one with the same ellipsis. Full width here means the paper's own
      width less the room the writing keeps inside its drawn edges — the same
      line every other line on either face begins and ends on.

      **The two faces hang it differently, and have to.** The sheet's is out of
      the flow, because it opens over a list a carried group is being steered
      across and a column that pushed would move the thing being aimed at. The
      panel's is in it. Both were tried the other way round: taken out of the
      flow on the panel, the column lay over the full-bleed perforation that
      rules the panel's sections off, cut the middle out of it and left its two
      ends sticking out either side, which reads as a rule somebody broke
      rather than as a column standing over one. Widening the column's _ground_
      to cover the perforation whole only moved the damage — at the paper's
      drawn width it painted over the paper's own side edges, so the sheet had
      a gap in its outline for as long as the column was open.

      In the flow it is wider than the box holding it, since the settings row
      keeps the ✕'s column in reserve and carries the theme mark, so it
      overflows the wrap to the right and nothing clips it. That is also why
      `.pill` is capped with `max-width` rather than stretched with `width`: a
      wrap sized to hold the column would have taken the pill with it, and the
      pill is the one thing on the panel that has to come out exactly as wide
      as it is on the sheet.

      One consequence, worth knowing rather than fixing: at this width the open
      column lies over the first group's title, and the hit test reads the pill
      and the column as one box — so taking a carried group "back to the sheet"
      now means below the column rather than merely off the pill.

127.  **A task is ticked off by pulling it leftwards, and the tick lands under
      the finger.** The sheet already had three ways to tick a row and every
      one of them asks the hand to be accurate: aim at a 44px box, or tap the
      same few characters twice without straying into the last three of them.
      A pull asks for nothing but a direction, which is what a thumb going down
      a shopping list can actually give — so it is the gesture for the thing
      the app is most often doing.

      **Leftwards, because the box is on the left.** The words are pushed
      towards the box at the head of the row and the box takes the tick, which
      is a sentence about this row rather than a convention borrowed from
      somewhere else. It also settles the collision for free: rightwards is
      already the paper turning over, and on a row that draws a link the two
      gestures begin on the same element — the words there are a plain
      container rather than a button, so they are not among the controls the
      turn stands aside for. `drag.swiping` is `drag.turning` the other way
      round, and it is the whole of what the two have to say to each other.

      **Nothing waits for the finger to come up.** The tick lands the moment
      the hand passes the reach, with the buzz that says so. Held back for the
      release it would put a wait on the one thing the gesture is for, and
      there would be nothing to wait for: past the reach there is no other
      thing the movement could still turn out to have been. The reach is a
      number of pixels rather than a fraction of the row, for the reason the
      flick that commits a turn is — a pull is a movement of the hand, and a
      hand does not know how wide the paper is.

      **One pull ticks it off and the next takes it away.** They are the two
      things standing at the two ends of a done row — the box at the head of it
      and the mark out in the gutter — reached from anywhere along the row
      without having to aim at either, which is the whole of what the gesture
      is for. A half-done row is finished off, which is what a tap on its box
      does too.

      The second pull is offered on exactly the rows the mark is: nothing on a
      row still to do, because getting rid of a task is earned by the task
      being finished with, and that rule is not this gesture's to relax. A pull
      that only ever ticked was the other option, with a pull on a done row
      putting it back to to-do; it was the tidier symmetry and the wrong one,
      because un-ticking is a rare correction that the box two centimetres away
      already answers, and taking a finished row off the sheet is the thing a
      hand going down a list actually wants next.

      **It does not stand in for the mark**, which is drawn through both pulls.
      The pull is the way to it for a hand already moving; the mark is the way
      for one that is not, and it is the only one of the two that can be seen.
      A gesture that quietly replaced a visible control would take the app's one
      discoverable delete away in exchange for one nobody can find.

      And it goes out through the same `pop()` the mark does, so the pop, the
      answer from the phone and the ten-second `UNDO?` are the delete that was
      already there rather than a second one written beside it. Two consequences
      worth naming: the swing home stands aside while the row is going, or two
      animations argue over one element and the row swings back into place while
      it is being deleted; and the handler that clears the pull answers only its
      own animation, or the pop ending stands the row back up for the frame
      before it goes.

      **The row gives, and how far is the paper's business.** It slides into
      the margin the writing is held off the drawn edge by — the column every
      delete mark stands in — and stops there, capped in the stylesheet rather
      than in the hand that pushes it, because it is a fact about the sheet.
      The hand carries on past that, and the last stretch of the pull is spent
      against a row with nowhere left to go, which is what pushing a sheet that
      is already against something feels like and what the tick then lands out
      of. Without the give a pull that stopped short said nothing at all, and a
      gesture that reports nothing until it reports everything reads as broken
      on every attempt that misses.

      **It shares nothing with the three presses on the same words.** A press
      is stillness and this is movement, so the press has already given the
      gesture up by the time the finger is eight pixels along; the taps are
      decided on release and this never gets there, because the click that
      would follow is swallowed in the capture phase the way a drop's is.
      Without that swallow every pull opened the row for editing behind the
      tick it had just made. It did cost `pressDrag` a correction: it released
      any capture on the pointer id it was holding, which took the pull's own
      capture away with it and killed any pull that began before the eighth
      pixel. It now releases only a capture it took itself.

      **And the direction is asked once**, when the movement first passes the
      slack. The sheet is what scrolls and the paper is what turns, so a
      gesture that begins as either of those stays that until the finger comes
      up — fighting over the answer every time a thumb wandered back across the
      diagonal would put a tick at the end of half the scrolls on the sheet.

128.  **A deleted group says "Deleted", not "Removed".** The mark in the gutter
      is named DELETE GROUP and the message that answered it said something
      else, which is two words for one act on one control — and the message a
      deleted task leaves has always been "Deleted." So the group's now reads
      "Deleted “Weekend” and 3 done." and the pair agree: whatever went, the
      sheet says the same thing about it, in the word the button used.

      The catalogue keys went with the wording. `toast.removed`,
      `removedWithDone` and `removedWithTasks` are `deletedGroup`,
      `deletedWithDone` and `deletedWithTasks`, which puts them beside
      `deletedList` under one verb — a key named after a word the app no longer
      says is the kind of thing that stays wrong for a year, and the catalogue
      is meant to be read in one sitting.

      Nothing about the act changed: the header's mark still only offers it on
      a group with nothing left to do, the corner fold still takes one in
      whatever state it is in and still counts tasks rather than done ones, and
      both still leave the ten-second `UNDO?`.

129.  **The corner buzzes when a group reaches it, and again when it takes
      one.** Every other offer on the sheet answers a finger arriving by
      changing weight under it — a rule going dashed, a line drawn heavier —
      and the corner is the one that cannot: what says a group is over the bin
      is the mark boiling, which is a change of drawing rather than of weight
      and is the slowest thing on the sheet to read. It is also the one target
      a finger reaches by leaving the writing entirely, so the eye is furthest
      from where the answer is. The phone says it instead: one tap on arrival,
      and `taken()` — dot dot, something is gone — on the drop.

      Neither is a new pattern. They are the first and second of the three
      lengths in `feel.ts`, and the two beats are exactly what a group struck
      out in the gutter already answers with, so the two ways of getting rid of
      a group now feel the same as well as reading the same.

      **On the edge, never on the state.** A finger held over the corner would
      otherwise buzz on every pointer move the browser reported, and a run of
      taps with a rhythm to it is a notification — which this app does not
      send. So `dragGroup`'s `move` reads `overFold` before and after and fires
      only where it turns true; carrying the group off and back says it again,
      because it is the arrival being told rather than the state.

      The drop's answer is called at the drop site rather than inside
      `removeGroup`, which the header's mark reaches through too: that mark
      says its own two beats at its own site, on the rule that every control
      answers explicitly rather than through one listener told where to stand
      aside. The corner is not a control — it is a place — so without a call of
      its own nothing on that path would have said anything at all.

130.  **A list a group was carried onto wears an asterisk until the tab is
      closed.** Sending a group to another list is the one change a person
      makes here that they cannot then look at: it is off this sheet and onto
      one that is not on the screen. The message says where it went and is gone
      in ten seconds, and after that nothing said which of four names now had
      something new under it — the switcher looked exactly as it had before the
      group moved.

      **Session state, written nowhere.** It is a fact about this reading of
      the app rather than about the list, so it belongs to the tab and dies
      with it — a mark saying "new" that survived a week of closing the browser
      would be saying something else. It is not the other devices' business
      either, which is the rule the collapsed groups and the theme already
      follow. An array of arrivals rather than a set of ids, because two groups
      can be sent to one list and taking one of them back does not mean nothing
      arrived; the undo removes one entry, and a list unmade by the undo of a
      drop that invented it loses its entries with the rest of itself.

      **It stays after you have been to look.** The alternative — clearing it
      on arrival at that list — was tempting and is a different promise: it
      would make the mark mean "unseen" rather than "something came here this
      session", and then a glance at the wrong list would spend it. The session
      is the boundary that was asked for and it is the one a person can state.

      **A character, and inside the name.** Graphe draws its own asterisk —
      measured, not assumed, the way `[` was found missing — so it needs no
      drawing, exactly as the `+` on the last row and the `¢` in the code
      column need none. It sits inside the name's own span rather than beside
      it: as a flex item of its own it takes the row's gap, which is the gap
      between two things at opposite ends of a row and is precisely what stood
      the `+` off in a column of its own before that row was tightened. Inside,
      it is a mark and a word with a space between them, it cannot be reached
      by the ellipsis, and one arrangement serves the pill and both columns.

      It pushes the name along rather than being given a column of its own on
      every row — the rule a task's count follows, and for the same reason:
      reserving the space would indent every list to line up a mark most of
      them do not have. Read aloud it is the fact and not the punctuation,
      which is what the code column does with its own mark two lines down.

131.  **The app is called listula, and two strings kept the old name on
      purpose.** _Listula_ is the diminutive of _lista_, the medieval Latin for
      a list: a little list, which is what this is. It was consumma, from
      _consummare_, to complete — a name about ticking the last thing off
      rather than about the thing being ticked, and the reading that fits the
      app is the list rather than the finishing of it. The name moved
      everywhere it is read: the manifest, the tab title, the iOS home-screen
      name, the project page and the source. The opening group moved with it
      and is now called Listula rather than "My list" — it is a name for a
      little list, so it is already the word for what that group is, and it is
      a default the person is free to type over.

      What did **not** move is the PBKDF2 salt, `consumma:v1`, and the
      `consumma:` prefix on every localStorage key. Both are addresses and not
      names. The salt was frozen the day the first list was created and §17
      says so: the code is the only shared secret, so the same code under a
      different salt derives a different roomId and every list already out
      there becomes unreachable — a rename would take away the lists of the
      people the rename was for. The storage prefix is the same fact on the
      device rather than on the server: renaming it does not move a list, it
      hides one, and the app opens on a blank sheet with the writing still on
      the disk under keys nothing reads. Either can change the day someone
      writes the migration that carries the data across — a v2 salt tried
      before v1, a read of the old keys and a write of the new — and not
      before. Both are commented where they are declared, so the next reader
      finds the reason before the inconsistency.

132.  **The app has a second catalogue, Greek, and picks between them by
      reading the browser rather than asking.** No language setting exists on
      the panel — there is nothing to ask, since the phone already knows and a
      question with an obvious answer is a tap nobody wanted to make. `el-GR`
      and `el-CY` both get the Greek catalogue; anything else falls back to
      English, which is both the default and, today, the only other catalogue
      there is.

      `Messages`, the type every catalogue is checked against, had to stop
      being `typeof en` directly and become a widened version of it (`Widen`
      in en.ts) — held to the literal English sentence at every leaf, a second
      catalogue could never compile anything but that same sentence back. The
      widening only drops literal-ness; a missing leaf, a renamed one, or a
      function called with the wrong shape still fails the build by name,
      which is the whole reason `Messages` is derived rather than declared
      twice.

      `doc.firstGroup` — see §131 — is translated after all, against what its
      own comment used to say. Every other leaf is a sentence the app is
      saying and stays out of a person's own words; this one is the app naming
      itself, and the point of naming your first list after the app stops
      landing the moment the name is one a reader cannot read. The Greek
      catalogue writes Λιστούλα there, once, the same as any other leaf.

      **A debug-only picker previews a translation without touching the
      browser's own answer.** One boxed button per catalogue, on the same
      panel the debug switch already unlocks — not a real setting, since a
      real one would need a place to live once debug is off and there would be
      nothing sensible for it to say. It is not written to storage and does
      not survive a reload, on the same reasoning the panel's own remembered
      scroll position is not. Debug only gates _reaching_ the picker, though,
      not what tapping it did: turning the switch back off leaves whichever
      catalogue was last picked on screen, rather than snapping back to the
      browser's own answer — a choice undone by putting away the control that
      made it is not a choice, and the point of a picker over a one-shot
      preview button is that it can be left somewhere.

      **Language names are never run through the catalogue that names them.**
      `LOCALE_NAMES` sits beside the list of supported locales rather than
      inside either catalogue: every phone that offers a choice of language
      shows each one in its own script, and a Greek reader choosing between
      "English" and "Greek" would be reading the language they came to get
      away from to find the one they want.

      **A prerendered page cannot know the browser's language before it is
      built**, so the initial paint is always English and — on a phone that
      prefers Greek — redraws in it the instant the page's own script runs.
      Known and accepted rather than solved, the same way the theme's own
      pre-paint flash was solved and this one is not: fixing it would mean
      deciding the catalogue at build time, which one static file cannot do
      per visitor.

133.  **An invitation's link carries one character, and the app points at where
      the code goes.** SHARE's two lines are now a link ending `?j` and the
      code under it. The flag is not the code and cannot become one: it has no
      value to carry, it says only that whoever followed this link was sent a
      list, and §17's rule stands untouched — the code never travels in a URL,
      as a query, as a fragment, or anywhere else. `codeFrom` was already
      dropping the whole word for its colon and slashes, and a test now says so
      of this shape too.

      What the flag buys is the thing the invitation could not do before. The
      recipient arrives holding a key, in front of a sheet where nothing is
      labelled — no help screen, no tooltip, no empty-state copy, all of which
      stays true (§12.14, decision 12). So the app does not explain itself: it
      points. One mark and one word on each face. On the sheet, an arrow to the
      burger with `JOIN LIST` at the far end of it — word for word the heading
      it leads to, so the arrow does not promise a section the panel does not
      have. On the panel, a ring thrown round the code field with `PASTE HERE`
      under it, and the panel opened at that field rather than where it was
      last left.

      **The panel gets no arrow, and that is the second thing tried rather than
      the first.** An arrow there had to end on a field a few millimetres of a
      screen that is already a column of controls, so its head came out smaller
      than the thing it was pointing at and read as a tick. The answer is not a
      bigger arrow: a ring says which thing, exactly, and an arrow cannot say
      what to do with what it lands on. The word does that — `paste` and not
      the field's name, because an empty field pastes on a tap, so the word
      names what a finger there will get. It sits to the left under the ring
      rather than centred: two words at display size reach most of the way
      across a phone, and the left is the side a phrase has room on.

      The ring is **thrown, not traced**. `handOval` gained `jitter`, which
      lets each sampled point off the true ellipse: `wobble` bends the line
      between two points and leaves every radius correct, which above the size
      of a word reads as a traced ellipse rather than as a hand. It gained
      `steps` for the same reason — handPath bends each segment once, so twelve
      samples is a ring at the width of a word and plainly a polygon at the
      width of the paper. Both default to what every loop already drawn uses,
      so the switcher's own is not re-cut by a rule about a mark that came
      later.

      **This is the second and last thing allowed to be red**, and it is the
      same argument the debug outline makes from the other side: what is drawn
      over the page must not be drawn in the ink, or it becomes part of the
      drawing. It is a biro mark on a printed page, and the whole of what makes
      that legible is that the biro is not the printing. The greyscale
      assertion in e2e/design.e2e.ts had to be told about it, which the debug
      outline never did — an outline is not a colour that test reads and this
      is — so the exemption is narrow, named (`[data-guide-ink]`), and paired
      with a second test saying nothing anywhere is red until somebody arrives
      on an invitation. That pair is the whole licence.

      The word is set in Graphe at display size rather than drawn as a path.
      Everything else in this app is a path because everything else is a mark;
      this is a word, and a word written in the app's own hand is the app
      saying it. The marks beside it are paths like every other: `handSwoop`,
      which is the one arrow here that knows both its ends, and `handOval`,
      which already loops the list name when a group is carried to it.

      **It writes nothing.** Arriving writes nothing (decision 121), and
      arriving on an invitation is still arriving: the flag is read, taken off
      the address with `replaceState` so a reload is not a second arrival, and
      the guidance lives in memory for this reading of the app alone — the rule
      the collapsed groups and `lists.arrivals` already follow. It never takes
      a press, since everything it points at is a control. It ends on a code,
      on `Esc`, or on a press anywhere it is not pointing, which is what
      somebody pointing over your shoulder does when you start doing something
      of your own; turning the paper back over without a code puts it back on
      the burger rather than spending it.

134.  **A weight at the front of a task is read, and it is not a count.**
      `500g`, `1,5 kg`, `2L`, `250ml` — a number with a metric unit on it — is
      set apart and written back the way `2x` is written `2×`: in the group's
      separator, never padded, and the unit in one form whichever way it was
      typed. Metric only, because that is what a shopping list here is written
      in; and only the short spellings people actually use on one — `k` for a
      kilo, `gr` for grams, `lt` for a litre — rather than every word for every
      unit, since a long table of abbreviations is a long table of words it
      could mistake for something else. The unit has to end at a space, which
      is what keeps `2 lemons` a count of two. **It does not multiply the
      price**: `500g Butter 2,50` is one pack at 2,50, and reading it as five
      hundred of them would make the total nonsense on exactly the rows it is
      most likely to appear on. A price per kilo is not guessed at either; the
      row counts once. A litre is written `L`, because `2l` in a mono face is a
      digit away from `21`.

## Known limits

- **Lose the code, lose the list.** No account, no email, no recovery. EXPORT
  is the only backup.
- **A shared code cannot be taken back.** Anyone holding it has full read and
  write access, and DELETE only clears your own device.
- **An unsynced edit reaches nobody** and is lost with the device.
- **A list nobody edits for six months is deleted.**
- **End-to-end encryption protects the data at rest**, not against the origin
  serving the JavaScript.
- **Hobby is non-commercial.** The moment this has a paid tier or ads it moves
  to Pro.
