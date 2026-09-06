# Branchline

A fast, offline-first mind-mapping app that runs entirely in the browser. Maps are stored locally by default, with optional Google Drive sync or a connected local folder for backup and syncing across devices — everything else (photos, notes, links, tasks) lives inline with the map, no external services required.

## Getting started

Branchline is a static site — no build step, no server-side code.

1. Open `index.html` in a browser (or serve the folder with any static file server).
2. Click **+ New map** to start, or **Sign in with Google** / **Connect folder** to sync/back up your maps.
3. Click **Shortcuts ?** in the sidebar at any time for the full in-app reference.

### Files

| File | Purpose |
|---|---|
| `index.html` | Page structure — toolbar, sidebar, and every modal (help, tasks, calendar, theme, etc.) |
| `app.js` | All application logic |
| `style.css` | All styling, including light/dark themes |
| `favicon.svg` | Browser tab icon |
| `task-check-icon.svg` | Icon used for completed tasks |

## Core mind-mapping

- **Nodes**: `Tab` adds a child, `Enter` adds a sibling, `F2`/double-click renames, `Delete`/`Backspace` removes a branch, `Space` collapses/expands children.
- **Layouts**: switch a map between **Mindmap**, **Logic chart**, and **Timeline** views from the toolbar dropdown.
- **Canvas**: scroll/pinch to zoom, drag empty space to pan, drag a node to nudge it off the automatic layout (right-click → *Reset position* to undo one, or **Auto-arrange** in the toolbar to reset every node at once).
- **Styling**: right-click a node for color, strikethrough, and collapse options; `Ctrl/⌘+Shift+X` toggles strikethrough on the selected node directly.
- **Undo/redo**: `Ctrl/⌘+Z` and `Ctrl/⌘+Shift+Z`, or the toolbar buttons.
- **Root node**: the map's center node always shows a live clock — current time, UTC/New York/UK world clocks, and today's Vietnamese weekday, date, and lunar date.

## Attachments per node

Right-click any node to attach any of the following (a node can carry several of each at once):

- **Notes** — a rich-text note with an optional title, embedded photos (click 🖼, or paste/drag-and-drop an image straight in), checklists (`☐`) and numbered lists via the note toolbar. Use `Alt` + arrow keys to page between a node's notes.
- **Photos** — attach one or more images; click a thumbnail to view full-size, step through multiples, crop (⛶), or add draggable/resizable text labels (Aa) baked permanently into the image on Apply. Photos can be tagged and later browsed by tag from **🏷 Tags** in the sidebar, across the whole map.
- **Links (URLs)** — attach one or more links (`Ctrl/⌘+K` or right-click → *Add URL…*). Clicking a YouTube link opens the built-in resumable video player (see below); any other link opens in its own sized, centered popup window. Right-click a link's 🔗 marker to edit it or leave a comment (shown on hover).
- **Tasks** — a per-node checklist with a progress ring/bar on the node itself. Each task can run a 1-minute focus timer (stacks with `+1m`, keeps running in the background, and counts down live in the browser tab's title).
- **Timer** — a simple manual running total ("⏱ 45m") for time spent on that node, incremented by hand with `+1m`.

Markers, photos, and task/note bundles can all be **dragged from one node to another** to move them (hold `Alt`/`⌥` while dropping to copy instead).

## The video popup

Clicking a YouTube link opens an in-app player rather than leaving the map:

- **Resumable** — playback position is remembered per video and picks up where you left off next time.
- **Resizable** — the ⤢ button cycles Normal → Large → Full width.
- **Minimizable** — the ─ button shrinks the player into a small frame docked in the top-right corner with no backdrop, so the mindmap underneath stays fully visible and clickable while the video keeps playing. Click again (⤢) to restore it.
- Comment box (when opened from a node's link) and an **Open on YouTube ↗** shortcut are included, and hidden automatically while minimized to keep the frame small.

## Popup windows for other links

- **🪟 Popup** toolbar button (or `Ctrl/⌘+Shift+O`) opens any URL you type/paste — auto-filled from your clipboard when possible — in its own sized, centered browser window, so you can keep a doc or reference open beside the map.
- **Quick-launch buttons** for YouTube, Google Docs, Google Sheets, and Google Photos do the same with one click.
- Right-clicking any link on a node or table cell offers the same 🪟 popup option directly.

Note: these are real, separate OS browser windows (via `window.open`), not part of the page itself — they can be sized/positioned when opened, but (unlike the in-app video player above) can't be docked or minimized into the mindmap.

## Calendar

**📅 Calendar** collects every task due date across the current map into a month view; click a day to see everything due on it.

## Themes

**🎨 Theme** lets you customize background, connector, and font colors for the current map, saved with it.

## Affirmations / quote banner

The scrolling banner across the top of the toolbar cycles through short affirmations you can edit, add to, or shuffle — click it to open the editor.

## Saving & sync

- **Browser storage** is the default — maps are saved locally with no setup.
- **Connect folder** mirrors maps to a folder on disk (via the File System Access API).
- **Sign in with Google** syncs maps to Google Drive, with an online/offline status indicator.
- **Export .json / Import .json** lets you back up or move a single map manually.
- **🗑 Trash** holds deleted maps for recovery before they're gone for good.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Tab` | Add a child to the selected node |
| `Enter` | Add a sibling after the selected node |
| `Shift+Enter` | New line while editing text |
| `F2` / double-click | Rename the selected node |
| `Esc` | Stop editing |
| `Delete` / `Backspace` | Delete the selected branch |
| `Space` | Collapse / expand children |
| `Ctrl/⌘+Shift+X` | Strikethrough the selected node |
| Arrow keys | Move selection between nodes |
| `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z` | Undo / redo |
| `Ctrl/⌘+K` | Add a URL to the selected node |
| `Ctrl/⌘+Shift+O` | Open the 🪟 Popup URL box |
| Scroll / pinch | Zoom the canvas |
| Drag empty canvas | Pan the canvas |

See **Shortcuts ?** in the app for the complete, always up-to-date list.

## Browser support notes

- Folder sync uses the File System Access API (Chromium-based browsers).
- Photos are embedded directly as data-URI images inside the note/map itself — nothing is uploaded anywhere, so exported `.json` files are fully self-contained.
- Clipboard auto-fill in the Popup box degrades silently if the browser denies clipboard read permission.
