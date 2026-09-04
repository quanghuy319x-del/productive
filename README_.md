# Branchline — offline mind map app

A self-contained mind mapping tool that runs entirely in your browser, with
no server, no internet connection, and no account required.

## How to run it

1. Unzip this folder anywhere on your computer.
2. Double-click `index.html` (or right-click → Open with → your browser).
3. That's it — everything runs locally. Your maps are saved in the
   browser's built-in database (IndexedDB), tied to this file's location
   and the browser you use.

Works fully offline. No files are uploaded anywhere — unless you turn on
optional Google Drive sync (see below), which is the only thing that ever
sends your data outside your own browser.

## Google Drive sync setup (optional — syncs your maps across devices)

By default, each device/browser only has its own copy of your maps. To make
"Sign in with Google" in the sidebar actually work, a developer needs to do
a one-time setup in Google Cloud Console (free):

1. Go to https://console.cloud.google.com/ → create a project (or pick an
   existing one).
2. **APIs & Services → Library** → search "Google Drive API" → Enable it.
3. **APIs & Services → OAuth consent screen** → set it up (choose
   "External" unless this is for a Google Workspace org, fill in the
   required fields — app name, your email — and publish it; for personal
   use you can leave it in "Testing" mode and just add your own Google
   account as a test user).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Web application**.
5. Under **Authorized JavaScript origins**, add every URL you'll open the
   app from, e.g.:
   - `https://yourusername.github.io` (your GitHub Pages site — no
     trailing slash, no path after the domain)
   - `http://localhost` and `http://127.0.0.1` (for testing locally)
6. Save, then copy the **Client ID** it gives you (ends in
   `.apps.googleusercontent.com`).
7. Open `app.js`, find the line near the top that says:
   ```js
   const GOOGLE_CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE.apps.googleusercontent.com";
   ```
   and paste your Client ID in there instead.
8. Re-upload `app.js` to GitHub (or re-save it locally) and reload the app.
   The "Sign in with Google" button in the sidebar will now work — sign in
   on any device with the same Google account and your maps sync there too.

The app only requests Drive's restricted `drive.file` scope, meaning it can
only see files it created itself — never your other Drive files.

> Tip: for the most reliable autosave behavior, open it in the same
> browser each time rather than switching between Chrome/Firefox/Safari —
> each browser keeps its own separate local database.

## Features

- **Mind map list** — create, switch between, rename, and delete as many
  maps as you like from the left sidebar. Deleting a map moves it to the
  Trash (click "🗑 Trash" in the sidebar) instead of removing it right
  away — restore it from there, or delete it forever when you're sure.
- **Autosave** — every edit is saved automatically to the local database
  a fraction of a second after you stop typing (see the "Saved" indicator
  in the toolbar).
- **Keyboard-driven editing**, just like Mindomo/XMind/FreeMind:
  - `Tab` — add a child to the selected node
  - `Enter` — add a sibling after the selected node
  - `F2` / double-click — rename a node
  - `Delete` / `Backspace` — delete a branch
  - `Space` — collapse / expand a branch
  - `Ctrl/Cmd + Shift + X` — strikethrough / un-strike a node
  - Arrow keys — move the selection around
  - `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` — undo / redo
  - Scroll or pinch to zoom, drag empty canvas to pan
- **Color-coded visualization** — each main branch gets its own color.
  Node depth is also encoded visually: the central idea is a bold pill,
  first-level branches are solid-filled with plain black/white text for
  contrast, and every level below that — outlined second-level boxes and
  the boxless deeper nodes alike — has its text tinted with the branch
  color, so the hierarchy and its branch stay readable together at a
  glance without labels.
- **Text that fits** — nodes grow to fit what you type, wrapping onto
  extra lines instead of clipping. While editing, the box resizes live
  as you type.
- **Draggable nodes** — layout is automatic by default (like an outliner),
  but you can drag any node a little off its automatic spot to nudge the
  map into shape. Right-click a moved node → "Reset position" to snap it
  back.
- **Export / Import** — save any map out as a `.json` file (for backup or
  moving to another computer/browser) and import it back in.
- **Per-node tasks with visual progress** — right-click a node and choose
  "Add tasks…" to keep a simple checklist on it (handy for a day's
  to-dos). A small ring marker next to the node fills in — and turns
  into a checkmark at 100% — as you check items off, and a progress bar
  under the node's text does the same, so progress is visible right on
  the mindmap without opening anything. Click the ⏱ next to any task to
  start a 1-minute focus timer for it — click "+1m" any time to stack on
  more, it keeps running in the background even if you close the modal,
  chimes when time's up, and counts down right in the browser tab's
  title, naming the task (e.g. "⏱ 0:42 · Water the plants"), so you can
  see it without switching back to the tab. Click the ▸ button next to
  any task to open a small nested subtask checklist under it (with its
  own checkboxes and an "Add a subtask…" box); checking off every
  subtask marks the parent task done automatically, and checking or
  unchecking the parent's own box cascades to all its subtasks. Partial
  subtask progress counts toward the node's overall progress ring/bar
  too — a task 2 of 5 subtasks done contributes that fraction instead of
  waiting for all of them to finish. The "add a task" and "add a
  subtask" boxes grow taller as you type a longer line, so the whole
  paragraph stays visible instead of scrolling sideways.
- **Affirmation typing task** — inside the tasks list, click "⌨
  Affirmation" to add a special task built around a random line from an
  editable pool of quotes. It counts as done once you've retyped that
  exact line 20 times in the pop-up typing game — letters light up green
  live as you type each one correctly, and a mismatch shakes the box so
  you can try again. Click its progress pill (e.g. "⌨ 7/20") any time to
  reopen the game and keep going — progress is saved with the map like
  any other task. Click "✎ Edit lines" next to the Affirmation button to
  rename, remove, or add lines to the pool itself; edits are saved to
  the browser's local database and apply the next time you add an
  Affirmation task, on any map.
- **Per-node countdown timer** — right-click a node and choose "Add
  timer…" (or click its ⏱ badge once it has time logged) to open a
  countdown for that node: "Start" begins a 5‑minute countdown with
  pause/resume, "+1m" to stack on more time, and a chime when it hits
  zero. The node's total only grows for time the countdown was actually
  running (not while paused), and updates live — both in the popup and
  as the small "⏱ 45m" badge on the node itself — so it reflects time
  actually spent, not just time scheduled. A "log +1m to the total"
  link is still there for adding time after the fact without running
  the countdown live. The countdown keeps running in the background
  even if you close the popup or switch nodes/maps.
- **Photos from the clipboard** — with a node selected, paste
  (`Ctrl`/`Cmd` + `V`) an image straight from your clipboard to attach it
  as a photo — no need to save a screenshot to disk first and go through
  a file picker.
- **Photo tags** — open any photo (click its thumbnail) to view it full
  size, then type into the "Add tag…" box under the photo and press
  `Enter` to tag it (e.g. `#receipt`, `#before`, `#idea`). Tags show as
  small pill chips under the photo — click the ✕ on a chip to remove
  it. Tags stay with their photo even if you drag it onto another node,
  and are saved with the map like everything else.
- **Photo notes** — open any photo and click the 📝 button to open a
  note on just that photo, using the exact same rich note editor as a
  node's own notes (see "Multiple notes per node" below) — title, rich
  text body, `Alt`+Left/Right to page between several notes on the same
  photo, "+ New note" to add another, 🗑 to delete the one on screen.
  The 📝 button shows a small badge with the note count so you can see
  at a glance which photos have notes on them. Notes stay with their
  photo even if you drag it onto another node or crop/edit it, and are
  saved with the map like everything else.
- **Browse photos by tag** — click "🏷 Tags" in the sidebar to see every
  tag used anywhere in the current map, each with a count of how many
  photos carry it. Tap a tag to see all of those photos gathered
  together, regardless of which node they're on (even inside a
  collapsed branch) — then tap a photo there to jump straight to its
  node, which expands any collapsed branch in the way and opens the
  photo full-size.
- **Multiple notes per node** — right-click a node and choose "Add
  note…" to attach a longer, richly-formatted note, and repeat to attach
  as many as you like. Each note has an optional title on its own line
  at the top (press `Enter` to drop from the title into the body); the
  note-picker menus use that title when there is one, or a preview of
  the body text otherwise. Each note on a node gets its own small
  note-shaped marker (rather than one marker with a count) — click a
  marker to open that note, then use `Alt` +
  Left/Right inside the editor to page between them, "+ New note" to
  start another, and 🗑 to delete the one on screen.
  Right-clicking any note marker opens a quick list of every note on
  the node with its own ✕ to delete without opening the editor.
- **Drag markers onto another node** — a node's note icon, link icon
  (both shown alongside its photo thumbnails), task ring/progress bar,
  or any individual photo thumbnail can be
  dragged straight onto a different node to move that content there
  (existing content on the target is kept, not overwritten — it's added
  alongside). Each note marker drags just that one note, the same way
  an individual photo thumbnail does. Dragging the "+N" overflow badge on a photo
  strip moves the rest of that node's photos as one batch. Hold
  `Alt`/`Option` while dropping to copy instead of move.
- **Calendar** — click "📅 Calendar" in the toolbar for a month-grid view
  of every task, on every node in the current map, that has a due date
  (set one from a task's own 📅 icon in its "Add tasks…" list — click it
  again to change or clear the date). Works across collapsed branches
  too, so nothing due gets hidden just because its branch is folded.
  Each day shows a small "✓done" counter plus one checkbox icon per
  task due that day (a task with 2+ subtasks breaks into one box per
  subtask, same idea as the node's own progress ring); tap a day to open
  a popup listing everything due then, where you can check items off
  and tap a task's node-name pill to jump straight to it on the canvas.
  Navigate months with ‹ ›, or jump back with "Today".
- **Database folder (optional)** — click "Connect folder" in the sidebar
  (Chrome/Edge) to pick a folder on your computer. Every map is then
  mirrored there as a plain `.json` file alongside the browser's built-in
  database, so you have a real, visible, backup-able copy of your data —
  and on reload, anything newer in that folder is pulled back in.
- **Google Drive sync (optional, requires setup)** — click "Sign in with
  Google" in the sidebar to mirror every map to your own Google Drive,
  the same way "Connect folder" mirrors to a local folder. This is what
  actually syncs maps across *different* devices (a local folder only
  helps if that folder itself is synced by something like Dropbox).
  Needs a one-time developer setup — see "Google Drive sync setup" above.

## Notes

- Google Drive sync keeps whichever copy of a map has the most recent
  edit — if you change the same map on two devices while offline and
  both later sync, the newer edit wins and the older one is overwritten
  (no merge). Signing in also only lasts about an hour before the app
  quietly asks Google for a fresh token in the background; if that ever
  fails silently, just click "Sign in with Google" again.

- Text labels on photos have a small ⠿ grab handle at their top-left
  corner — drag that instead of the label body to move it, and it works
  even while the label is selected and mid-edit, so you don't have to
  fight with where the text caret lands.
- Right-click any node for a context menu (add child/sibling, rename,
  collapse, strikethrough, recolor the branch, reset a dragged position,
  delete).
- Without a connected folder, data lives only in your browser's local
  storage for this file. If you clear your browser's site data for this
  page, or move/rename the folder in a way your browser treats as a
  different origin, saved maps won't carry over automatically — use
  Export, or connect a database folder, beforehand if that matters to you.
- "Connect folder" needs a browser that supports the File System Access
  API (Chrome or Edge). In other browsers it's hidden/disabled and maps
  just autosave to the browser's built-in database as before.
- **If you host this on GitHub Pages** and re-upload a new `app.js` or
  `style.css`, people who already have the page open (or cached it) may
  keep seeing the old version for a while, since browsers cache `.js`/
  `.css` files by their exact URL. `index.html` loads both with a
  `?v=1` version number attached — bump that number (`?v=2`, `?v=3`, …)
  in `index.html` every time you upload a new `app.js`/`style.css`, and
  everyone's browser is forced to fetch the new file instead of reusing
  an old cached copy. It can take GitHub Pages itself up to a couple of
  minutes to actually publish a push — check the repo's **Actions** tab
  for a green "pages build and deployment" run before assuming the
  update didn't take.
