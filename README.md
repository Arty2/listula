# /listula

**Listula** is a shared checklist that runs in a web browser. It is
mostly used for groceries and small task lists. Two or more people share a
list by exchanging a short code. It has no accounts, tracking or
analytics. Lists are encrypted on the device, so the server stores only
data it cannot read. The app works offline and can be installed to a phone's
home screen.

The design is deliberately plain: black ink on white paper, set in a
handwritten typeface, with no labels, icons or help text. The only words on
the sheet are the ones its users wrote.

- Project page: [heracl.es/listula](https://heracl.es/listula)
- Demo: [listula.vercel.app](https://listula.vercel.app)
- Source: [github.com/arty2/listula](https://github.com/arty2/listula)

## Name

The name is the diminutive of _lista_, medieval Latin for "list", so it
means "a little list".

## Use

A list is a sheet of tasks arranged in groups. Tasks can be written, ticked
off, reordered or moved between groups. Whole groups can be folded away,
cleared or moved to another list. A quantity or price written into a task,
such as `2x apples` or `Bread 2,50`, is read from the text and totalled for
the group. The text itself is stored unchanged.

Because nothing on the sheet is labelled, every gesture the app responds to
is documented in [TECHNICAL.md](./TECHNICAL.md#gestures).

## Sharing

A list gets its code the first time it is synced, from the menu at the top
right. The code is twelve characters long. SHARE sends a link together with
the code, and COPY copies the code alone. The recipient enters the code
under JOIN. The code is never placed in a URL. The link only marks the
visitor as invited, which shows them once where to enter it.

Syncing is manual. Tapping SYNC sends local changes and fetches everyone
else's. Nothing is sent automatically.

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
- **Encryption does not protect against the host.** The encryption protects
  stored data. It cannot protect against whoever serves the app's code, and
  the server does not stop someone who knows a list's address from
  overwriting it.

## Typeface

The app uses one typeface, **Graphe**, drawn by the project's author. Graphe
Alpha is available under the [SIL Open Font License](https://heracl.es/graphe/).
Notes on substituting it are in [TECHNICAL.md](./TECHNICAL.md#the-typeface).

## Further reading

[TECHNICAL.md](./TECHNICAL.md) covers how to run, deploy and contribute to
the project. It also explains how the encryption works and lists every
gesture.

---

_Dialectic Acheropoieton_  
_of Heracles Papatheodorou and Claude_
