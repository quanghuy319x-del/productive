# Tasks — a standalone to-do app

The exact task feature from Branchline (subtasks, priority stars,
progress bar), promoted out of the mind map into its own
page — plus Google Sign-In to sync your list to your own Google Drive.
No server, no account system of its own — Google Drive is the only
place your data ever gets sent, and it's the only place it's stored.

**Sign-in required.** This app has no local-only mode: you must sign
in with Google and be online to add, edit, or view any tasks. There's
no guest/offline mode and no local browser storage of your task
content — the app is locked behind a "Sign in with Google" screen
until both conditions are met.

## How to run it

1. Unzip this folder anywhere on your computer.
2. Double-click `index.html` (or right-click → Open with → your browser).
3. Sign in with Google when prompted — the app is unusable until you do.

## Google Sign-In setup (required)

The Client ID already in `app.js` is Branchline's own — Google
authorizes by **origin** (scheme + host, not the full path), so if
you're hosting this on the **same GitHub Pages site** as Branchline
(e.g. `https://yourusername.github.io/...`), "Sign in with Google"
should already work with no extra setup.

If you're hosting this somewhere else (a different domain, or GitHub
Pages under a different username), you'll need your own Client ID:

1. Go to https://console.cloud.google.com/ → create a project (or pick
   an existing one).
2. **APIs & Services → Library** → search "Google Drive API" → Enable it.
3. **APIs & Services → OAuth consent screen** → set it up (choose
   "External" unless this is for a Google Workspace org; for personal
   use you can leave it in "Testing" mode and add your own Google
   account as a test user).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Web application**.
5. Under **Authorized JavaScript origins**, add every origin you'll open
   the app from, e.g. `https://yourusername.github.io`, plus
   `http://localhost` and `http://127.0.0.1` for local testing.
6. Save, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).
7. Open `app.js`, find the line near the top that says:
   ```js
   const GOOGLE_CLIENT_ID = "270018625814-4jfdor9fci625de9b4j7hjta15urcqoe.apps.googleusercontent.com";
   ```
   and paste your own Client ID in there instead.
8. Re-upload `app.js` (bump its `?v=` number in `index.html` so browsers
   fetch the new copy) and reload the app.

The app only requests Drive's restricted `drive.file` scope, meaning it
can only see the one `tasks.json` file it creates itself — never any of
your other Drive files.

> Signing in lasts about an hour before the app quietly asks Google for
> a fresh token in the background; if that ever fails silently, just
> click "Sign in with Google" again. If two devices edit while offline
> and both later sync, the copy with the more recent edit wins — there's
> no merge.

## Features

- **Add / check off / delete tasks** — type into the box at the top and
  press `Enter` to add. Double-click a task's text to rename it.
- **Priority star** — click the star to mark a task as priority; click
  it again to clear it. It doesn't reorder the list on its own and
  doesn't affect the progress bar — every task/subtask always counts
  as one unit. "★ Sort" (available in List, Today, and the day detail
  popup) moves starred tasks to the top of the list.
- **Subtasks** — click "▸+" on a task to add a small checklist under it.
  Checking every subtask marks the parent task done automatically, and
  checking/unchecking the parent cascades to all its subtasks. A small
  progress bar under the task shows subtask completion. Drag the ⠿
  handle to reorder subtasks — within the same task or onto a different
  one entirely. Double-click a subtask's text to rename it, ⧉ to copy
  its text, × to delete it.
- **Drag to reorder tasks** — drag the ⠿ handle on the left of any task.
- **Overall progress bar** — at the top; every task and subtask counts
  equally toward it, regardless of priority stars.
- **Autosave** — every edit syncs to your Google Drive `tasks.json`
  file automatically, a moment after you make it.
- **Due dates + Calendar & Today views** — click the 📅 on any task to
  give it a due date. "📅 Calendar" (the default tab) shows a simple
  month grid like Google Calendar: each day shows a "✓done" counter
  (yellow when everything's checked off — a quick read on how
  productive that day was) plus a row of small checkbox icons — one
  per task due that day, except a task with 2+ subtasks gets broken
  into one box per subtask instead. These icons are display-only —
  hover/tap one to see its text, but tapping anywhere on a day (icons
  included) opens that day's full task list in a blurred-backdrop
  popup, where you check things off, edit text, add subtasks, etc. —
  same rich rows as List/Today. That popup also has its own "add a
  task" box; press Esc or tap outside the card to close it. The ＋ in
  the corner of each day still opens a fast inline quick-add box right
  there in the grid (no popup) for jotting a task down without leaving
  the calendar. "☀ Today" shows a short worklist — anything overdue up
  top, then whatever's due today, with full task rows (checkbox,
  stars, subtasks, delete all still work there). Past-due,
  unfinished tasks show in red in the list view too. Navigate months
  in Calendar with ‹ ›, or jump back with "Today".

## Notes

- The app requires being signed in **and** online at all times — if
  your connection drops or your Google session expires, the task list
  locks again (a message on the sign-in screen tells you which) until
  you reconnect. Nothing is cached locally for offline editing.
- If you host this on GitHub Pages and re-upload `app.js` or
  `style.css`, bump the `?v=1` number in `index.html` to `?v=2` (etc.)
  each time, or people who already have the page open/cached may keep
  seeing the old version — browsers cache `.js`/`.css` files by their
  exact URL.
- Due dates sync as an extra `due` field on each task, so older synced
  data with no due dates just loads with everything undated — nothing
  to migrate.
