(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function autosizeTextarea(el) {
    el.style.height = "auto";
    el.style.height = Math.min(160, el.scrollHeight) + "px";
  }

  /* ================= Date helpers (for due dates / calendar) =================
     Dates are stored as plain "YYYY-MM-DD" strings (local calendar day,
     no time/timezone component) so a task's due date means the same
     day everywhere it's viewed. */
  function toISODate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function fromISODate(s) {
    const parts = String(s || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function isSameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /* ================= Data model =================
     A single flat list of tasks — this app IS the tasks feature, promoted
     out of Branchline's per-node "Tasks…" modal into the whole page.
     Same shape, same rules, plus an optional due date for the calendar
     view:
       task = { id, text, done, stars (0-1, single priority flag), due: "YYYY-MM-DD"|null,
                 subtasks: [{id, text, done}] }
     Stored as one JSON blob { tasks, updatedAt }, in a single
     "tasks.json" file in the person's own Google Drive — the same way
     Branchline mirrors each mind map. Sign-in is required, so this is
     the only copy; there's no local-only fallback. */
  // No local persistence: tasks live only in memory + the person's
  // Google Drive. There's no offline/guest mode, so nothing needs to
  // survive a reload except via Drive itself.
  let tasks = [];
  let dataUpdatedAt = 0;

  // Every edit funnels through here: stamp it, refresh the UI, and let
  // Drive know there's something new to push up.
  function persist() {
    dataUpdatedAt = Date.now();
    renderAll();
    DriveDB.markDirty();
  }

  /* ================= Task/subtask helpers =================
     Identical rules to Branchline's node-level task feature. */
  function getTaskStars(t) {
    return clamp(Math.round(t.stars) || 0, 0, 1);
  }
  // Priority stars no longer weight progress — every task/subtask
  // always counts as a single unit (1x), regardless of star count.
  function taskWeight(t) {
    return 1;
  }
  function getTaskSubtasks(t) {
    return (t && Array.isArray(t.subtasks)) ? t.subtasks : [];
  }
  function taskSubtaskProgress(t) {
    const subs = getTaskSubtasks(t);
    const total = subs.length;
    const done = subs.filter(s => s.done).length;
    return { done, total, pct: total ? done / total : 0 };
  }
  // Recomputes a task's own `done` from its subtasks (all done => task
  // done). No-op for tasks without any subtasks yet.
  function syncTaskDoneFromSubtasks(t) {
    const subs = getTaskSubtasks(t);
    if (subs.length) t.done = subs.every(s => s.done);
  }
  // Aggregate progress across the whole list — a task with subtasks
  // contributes their done/total counts (weighted); a plain task counts
  // as a single unit via its own checkbox.
  function overallProgress() {
    let total = 0, done = 0;
    tasks.forEach((t) => {
      const weight = taskWeight(t);
      const subs = getTaskSubtasks(t);
      if (subs.length) {
        total += subs.length * weight;
        done += subs.filter(s => s.done).length * weight;
      } else {
        total += weight;
        if (t.done) done += weight;
      }
    });
    return { done, total, pct: total ? done / total : 0 };
  }

  /* ================= Rendering ================= */
  const taskListEl = $("#task-list");
  const emptyStateEl = $("#empty-state");
  const progressFillEl = $("#progress-fill");
  const progressLabelEl = $("#progress-label");
  const newTaskInput = $("#new-task-input");
  const sortStarsBtn = $("#sort-stars-btn");
  const todaySortStarsBtn = $("#today-sort-stars-btn");
  const dayModalSortStarsBtn = $("#day-modal-sort-stars-btn");

  /* ---- View toggle (List / Calendar / Today) ---- */
  const viewListBtn = $("#view-list-btn");
  const viewCalendarBtn = $("#view-calendar-btn");
  const viewTodayBtn = $("#view-today-btn");
  const listViewEl = $("#list-view");
  const calendarViewEl = $("#calendar-view");
  const todayViewEl = $("#today-view");
  const calPrevBtn = $("#cal-prev-btn");
  const calNextBtn = $("#cal-next-btn");
  const calTodayBtn = $("#cal-today-btn");
  const calMonthLabelEl = $("#cal-month-label");
  const calWeekdaysEl = $("#calendar-weekdays");
  const calGridEl = $("#calendar-grid");
  const todayOverdueSectionEl = $("#today-overdue-section");
  const todayOverdueListEl = $("#today-overdue-list");
  const todayListEl = $("#today-list");
  const todayEmptyStateEl = $("#today-empty-state");
  const todayDateLabelEl = $("#today-date-label");
  const todayNewTaskInput = $("#today-new-task-input");

  /* ---- Day detail modal (opened by clicking a calendar day) ---- */
  const dayModalBackdropEl = $("#day-modal-backdrop");
  const dayModalEl = $("#day-modal");
  const dayModalTitleEl = $("#day-modal-title");
  const dayModalCloseBtn = $("#day-modal-close-btn");
  const dayModalNewTaskInput = $("#day-modal-new-task-input");
  const dayModalTaskListEl = $("#day-modal-task-list");
  const dayModalEmptyStateEl = $("#day-modal-empty-state");
  let dayModalDate = null; // "YYYY-MM-DD" of the day currently shown, or null when closed
  let currentView = "calendar"; // "list" | "calendar" | "today" — calendar is the default tab
  let calCursor = new Date();
  calCursor.setDate(1); // first of the currently-displayed month

  // Which tasks have their "add a subtask" input expanded, and which have
  // their subtask checklist explicitly collapsed — same as Branchline
  // (not persisted, resets on reload).
  const subtaskAddOpenFor = new Set();
  const collapsedSubtaskIds = new Set();

  function renderAll() {
    renderProgress();
    renderTaskList();
    if (currentView === "calendar") renderCalendar();
    else if (currentView === "today") renderTodayView();
    if (dayModalDate) renderDayModal();
  }

  function renderProgress() {
    const p = overallProgress();
    progressFillEl.style.width = (p.pct * 100).toFixed(1) + "%";
    progressLabelEl.textContent = `${p.done}/${p.total || 0}`;
  }

  function renderTaskList() {
    taskListEl.innerHTML = "";
    emptyStateEl.classList.toggle("hidden", tasks.length > 0);
    tasks.forEach((t) => taskListEl.appendChild(buildTaskRow(t)));
  }

  function buildTaskRow(t, opts) {
    const hideDue = !!(opts && opts.hideDue);
    const li = document.createElement("li");
    const subProg = taskSubtaskProgress(t);
    const subExpanded = (subProg.total > 0 || subtaskAddOpenFor.has(t.id)) && !collapsedSubtaskIds.has(t.id);
    const dueDate = t.due ? fromISODate(t.due) : null;
    const isOverdue = !!(dueDate && !t.done && dueDate < startOfToday());
    li.className = "task-row" + (t.done ? " done" : "") + (isOverdue ? " overdue" : "");

    // Drag-reorder (whole task, ⠿ handle).
    li.addEventListener("dragover", (e) => {
      if (taskDragState && taskDragState.taskId !== t.id) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = li.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        li.classList.toggle("drag-over-top", before);
        li.classList.toggle("drag-over-bottom", !before);
      } else if (subtaskDragState) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        li.classList.add("subtask-drop-target");
      }
    });
    li.addEventListener("dragleave", (e) => {
      if (e.relatedTarget && li.contains(e.relatedTarget)) return;
      li.classList.remove("drag-over-top", "drag-over-bottom", "subtask-drop-target");
    });
    li.addEventListener("drop", (e) => {
      if (taskDragState && taskDragState.taskId !== t.id) {
        e.preventDefault();
        const rect = li.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        li.classList.remove("drag-over-top", "drag-over-bottom");
        reorderTask(taskDragState.taskId, t.id, before);
      } else if (subtaskDragState) {
        e.preventDefault();
        li.classList.remove("subtask-drop-target");
        moveSubtask(subtaskDragState.taskId, subtaskDragState.subtaskId, t.id, null, false);
      }
    });

    const handle = document.createElement("span");
    handle.className = "task-drag-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";
    handle.draggable = true;
    handle.addEventListener("mousedown", (e) => e.stopPropagation());
    handle.addEventListener("dragstart", (e) => startTaskDrag(e, li, t.id));
    handle.addEventListener("dragend", () => endTaskDrag(li));

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "task-checkbox";
    cb.checked = !!t.done;
    cb.addEventListener("change", () => {
      pushEditMark();
      t.done = cb.checked;
      getTaskSubtasks(t).forEach(s => { s.done = cb.checked; });
      persist();
    });

    const main = document.createElement("div");
    main.className = "task-main";

    const top = document.createElement("div");
    top.className = "task-row-top";

    const text = document.createElement("div");
    text.className = "task-text";
    text.contentEditable = "false";
    text.spellcheck = false;
    text.textContent = t.text;
    text.addEventListener("dblclick", (e) => {
      e.preventDefault();
      text.contentEditable = "true";
      text.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(text);
      sel.removeAllRanges();
      sel.addRange(range);
    });
    text.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); text.blur(); }
      else if (e.key === "Escape") { e.preventDefault(); text.textContent = t.text; text.blur(); }
    });
    text.addEventListener("blur", () => {
      const v = text.textContent.trim();
      if (v && v !== t.text) { t.text = v; persist(); }
      else text.textContent = t.text;
      text.contentEditable = "false";
    });

    const stars = document.createElement("div");
    stars.className = "task-stars";
    const s = document.createElement("button");
    s.type = "button";
    s.className = "task-star" + (getTaskStars(t) >= 1 ? " filled" : "");
    s.textContent = "★";
    s.title = "Priority";
    s.addEventListener("click", (e) => {
      e.stopPropagation();
      t.stars = getTaskStars(t) >= 1 ? 0 : 1; // toggle priority on/off
      persist();
    });
    stars.appendChild(s);

    const dueWrap = document.createElement("label");
    dueWrap.className = "task-due-wrap" + (t.due ? " has-due" : "") + (isOverdue ? " overdue" : "");
    dueWrap.title = t.due ? "Due date (click to change)" : "Set a due date";
    const dueIcon = document.createElement("span");
    dueIcon.className = "task-due-icon";
    dueIcon.textContent = "📅";
    const dueInput = document.createElement("input");
    dueInput.type = "date";
    dueInput.className = "task-due-input";
    dueInput.value = t.due || "";
    dueInput.addEventListener("click", (e) => e.stopPropagation());
    dueInput.addEventListener("change", () => {
      t.due = dueInput.value || null;
      persist();
    });
    dueWrap.appendChild(dueIcon);
    dueWrap.appendChild(dueInput);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const addSubBtn = document.createElement("button");
    addSubBtn.type = "button";
    addSubBtn.className = "task-icon-btn task-add-sub";
    addSubBtn.title = "Add a subtask";
    addSubBtn.textContent = "+";
    addSubBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      collapsedSubtaskIds.delete(t.id);
      subtaskAddOpenFor.add(t.id);
      renderTaskList();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "task-icon-btn task-delete";
    delBtn.title = "Delete task";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${t.text || "this task"}"?`)) return;
      tasks = tasks.filter(x => x.id !== t.id);
      persist();
    });

    actions.appendChild(addSubBtn);
    actions.appendChild(delBtn);

    top.appendChild(cb);
    top.appendChild(text);
    top.appendChild(stars);
    if (!hideDue) top.appendChild(dueWrap);
    top.appendChild(actions);
    main.appendChild(top);

    if (subProg.total > 0) {
      const mini = document.createElement("div");
      mini.className = "task-progress-mini";
      const fill = document.createElement("div");
      fill.className = "task-progress-mini-fill";
      fill.style.width = (subProg.pct * 100).toFixed(1) + "%";
      mini.appendChild(fill);
      main.appendChild(mini);
    }

    if (subExpanded) main.appendChild(buildSubtaskPanel(t));
    else if (subtaskAddOpenFor.has(t.id)) main.appendChild(buildSubtaskAddRow(t));

    li.appendChild(handle);
    li.appendChild(main);
    return li;
  }

  function buildSubtaskPanel(t) {
    const wrap = document.createElement("div");
    const list = document.createElement("ul");
    list.className = "subtask-list";

    getTaskSubtasks(t).forEach((s) => {
      const row = document.createElement("li");
      row.className = "subtask-row" + (s.done ? " done" : "");

      row.addEventListener("dragover", (e) => {
        if (!subtaskDragState) return;
        if (subtaskDragState.taskId === t.id && subtaskDragState.subtaskId === s.id) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        row.classList.toggle("drag-over-top", before);
        row.classList.toggle("drag-over-bottom", !before);
      });
      row.addEventListener("dragleave", (e) => {
        if (e.relatedTarget && row.contains(e.relatedTarget)) return;
        row.classList.remove("drag-over-top", "drag-over-bottom");
      });
      row.addEventListener("drop", (e) => {
        if (!subtaskDragState) return;
        if (subtaskDragState.taskId === t.id && subtaskDragState.subtaskId === s.id) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = row.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        row.classList.remove("drag-over-top", "drag-over-bottom");
        moveSubtask(subtaskDragState.taskId, subtaskDragState.subtaskId, t.id, s.id, before);
      });

      const shandle = document.createElement("span");
      shandle.className = "task-drag-handle subtask-drag-handle";
      shandle.textContent = "⠿";
      shandle.title = "Drag to reorder";
      shandle.draggable = true;
      shandle.addEventListener("mousedown", (e) => e.stopPropagation());
      shandle.addEventListener("dragstart", (e) => startSubtaskDrag(e, row, t.id, s.id));
      shandle.addEventListener("dragend", () => endSubtaskDrag(row));

      const scb = document.createElement("input");
      scb.type = "checkbox";
      scb.className = "subtask-checkbox";
      scb.checked = !!s.done;
      scb.addEventListener("change", () => {
        s.done = scb.checked;
        syncTaskDoneFromSubtasks(t);
        persist();
      });

      const stext = document.createElement("span");
      stext.className = "subtask-text";
      stext.contentEditable = "false";
      stext.spellcheck = false;
      stext.textContent = s.text;
      stext.addEventListener("dblclick", (e) => {
        e.preventDefault();
        stext.contentEditable = "true";
        stext.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(stext);
        sel.removeAllRanges();
        sel.addRange(range);
      });
      stext.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); stext.blur(); }
        else if (e.key === "Escape") { e.preventDefault(); stext.textContent = s.text; stext.blur(); }
      });
      stext.addEventListener("blur", () => {
        const v = stext.textContent.trim();
        if (v && v !== s.text) { s.text = v; persist(); }
        else stext.textContent = s.text;
        stext.contentEditable = "false";
      });

      const scopy = document.createElement("button");
      scopy.type = "button";
      scopy.className = "subtask-copy";
      scopy.title = "Copy subtask text";
      scopy.textContent = "⧉";
      scopy.addEventListener("click", (e) => {
        e.stopPropagation();
        const finish = () => {
          scopy.classList.add("copied");
          scopy.textContent = "✓";
          setTimeout(() => { scopy.classList.remove("copied"); scopy.textContent = "⧉"; }, 1000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(s.text).then(finish).catch(finish);
        } else {
          const ta = document.createElement("textarea");
          ta.value = s.text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); } catch (err) {}
          document.body.removeChild(ta);
          finish();
        }
      });

      const sdel = document.createElement("button");
      sdel.type = "button";
      sdel.className = "subtask-delete";
      sdel.title = "Delete subtask";
      sdel.textContent = "×";
      sdel.addEventListener("click", () => {
        if (!confirm(`Delete the subtask "${s.text || "Untitled subtask"}"?`)) return;
        t.subtasks = getTaskSubtasks(t).filter(x => x !== s);
        syncTaskDoneFromSubtasks(t);
        persist();
      });

      row.appendChild(shandle);
      row.appendChild(scb);
      row.appendChild(stext);
      row.appendChild(scopy);
      row.appendChild(sdel);
      list.appendChild(row);
    });

    wrap.appendChild(list);
    if (subtaskAddOpenFor.has(t.id)) wrap.appendChild(buildSubtaskAddRow(t));
    return wrap;
  }

  function buildSubtaskAddRow(t) {
    const addRow = document.createElement("div");
    addRow.className = "subtask-add-row";
    const addInput = document.createElement("textarea");
    addInput.rows = 1;
    addInput.className = "subtask-new-input autosize-input";
    addInput.placeholder = "Add a subtask and press Enter…";
    addInput.spellcheck = false;
    addInput.addEventListener("click", (e) => e.stopPropagation());
    addInput.addEventListener("input", () => autosizeTextarea(addInput));
    addInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const v = addInput.value.trim();
        if (!v) return;
        if (!Array.isArray(t.subtasks)) t.subtasks = [];
        t.subtasks.push({ id: uid(), text: v, done: false });
        t.done = false; // a fresh, unchecked subtask means the parent can't be fully done anymore
        persist();
        requestAnimationFrame(() => {
          const el = taskListEl.querySelector(`.subtask-new-input`);
          if (el) el.focus();
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        addInput.blur();
      }
    });
    addInput.addEventListener("blur", () => {
      if (!addInput.value.trim()) {
        subtaskAddOpenFor.delete(t.id);
        renderTaskList();
      }
    });
    addRow.appendChild(addInput);
    requestAnimationFrame(() => addInput.focus());
    return addRow;
  }

  // Undo isn't implemented in this standalone app (no edit history to
  // manage) — this hook exists purely so a future undo feature has one
  // place to attach to.
  function pushEditMark() {}

  /* ================= Task drag-reorder ================= */
  let taskDragState = null;
  function startTaskDrag(e, li, taskId) {
    e.stopPropagation();
    taskDragState = { taskId };
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", ""); } catch (err) {}
    li.classList.add("task-dragging");
  }
  function endTaskDrag(li) {
    li.classList.remove("task-dragging");
    taskDragState = null;
    taskListEl.querySelectorAll(".task-row").forEach(r => r.classList.remove("drag-over-top", "drag-over-bottom"));
  }
  function reorderTask(sourceTaskId, targetTaskId, before) {
    if (sourceTaskId === targetTaskId) return;
    const list = tasks.slice();
    const fromIdx = list.findIndex(x => x.id === sourceTaskId);
    if (fromIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    const toIdx = list.findIndex(x => x.id === targetTaskId);
    if (toIdx === -1) list.push(moved);
    else list.splice(before ? toIdx : toIdx + 1, 0, moved);
    tasks = list;
    persist();
  }

  /* ================= Subtask drag-reorder ================= */
  let subtaskDragState = null;
  function startSubtaskDrag(e, row, taskId, subtaskId) {
    e.stopPropagation();
    subtaskDragState = { taskId, subtaskId };
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", ""); } catch (err) {}
    row.classList.add("task-dragging");
  }
  function endSubtaskDrag(row) {
    row.classList.remove("task-dragging");
    subtaskDragState = null;
    taskListEl.querySelectorAll(".subtask-row").forEach(r => r.classList.remove("drag-over-top", "drag-over-bottom"));
    taskListEl.querySelectorAll(".task-row.subtask-drop-target").forEach(r => r.classList.remove("subtask-drop-target"));
  }
  function moveSubtask(sourceTaskId, sourceSubtaskId, targetTaskId, targetSubtaskId, before) {
    if (sourceTaskId === targetTaskId && sourceSubtaskId === targetSubtaskId) return;
    const sourceTask = tasks.find(x => x.id === sourceTaskId);
    const targetTask = tasks.find(x => x.id === targetTaskId);
    if (!sourceTask || !targetTask) return;
    const sourceSubs = getTaskSubtasks(sourceTask).slice();
    const fromIdx = sourceSubs.findIndex(x => x.id === sourceSubtaskId);
    if (fromIdx === -1) return;
    const [moved] = sourceSubs.splice(fromIdx, 1);

    const sameTask = sourceTaskId === targetTaskId;
    const destSubs = sameTask ? sourceSubs : getTaskSubtasks(targetTask).slice();
    const toIdx = targetSubtaskId ? destSubs.findIndex(x => x.id === targetSubtaskId) : -1;
    if (toIdx === -1) destSubs.push(moved);
    else destSubs.splice(before ? toIdx : toIdx + 1, 0, moved);

    sourceTask.subtasks = sourceSubs;
    targetTask.subtasks = destSubs;
    if (!sameTask) {
      syncTaskDoneFromSubtasks(sourceTask);
      syncTaskDoneFromSubtasks(targetTask);
    }
    persist();
  }

  /* ================= Add task / sort by stars ================= */
  newTaskInput.addEventListener("input", () => autosizeTextarea(newTaskInput));
  newTaskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const v = newTaskInput.value.trim();
      if (!v) return;
      tasks.push({ id: uid(), text: v, done: false, stars: 0, due: null, subtasks: [] });
      newTaskInput.value = "";
      autosizeTextarea(newTaskInput);
      persist();
    }
  });

  // Same add-a-task flow as the list view, but tasks added from the
  // Today tab are automatically due today so they show up right where
  // you added them.
  todayNewTaskInput.addEventListener("input", () => autosizeTextarea(todayNewTaskInput));
  todayNewTaskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const v = todayNewTaskInput.value.trim();
      if (!v) return;
      tasks.push({ id: uid(), text: v, done: false, stars: 0, due: toISODate(new Date()), subtasks: [] });
      todayNewTaskInput.value = "";
      autosizeTextarea(todayNewTaskInput);
      persist();
    }
  });

  // Sorts the whole task list by priority (highest star count first).
  // Available from every list — List view, Today view, and the day
  // detail modal — since they're all just different lenses on the
  // same underlying `tasks` array.
  function sortTasksByStars() {
    if (tasks.length < 2) return;
    tasks = tasks.slice().sort((a, b) => getTaskStars(b) - getTaskStars(a));
    persist();
  }
  sortStarsBtn.addEventListener("click", sortTasksByStars);
  todaySortStarsBtn.addEventListener("click", sortTasksByStars);
  dayModalSortStarsBtn.addEventListener("click", sortTasksByStars);

  /* ================= Calendar view =================
     A simple, single month grid (like a stripped-down Google Calendar
     month view) sitting alongside the list view — same underlying
     `tasks` array, just a different lens on it. Tasks show up on
     whichever day their `due` date falls on; tapping a task pill
     toggles it done, tapping empty space on a day opens a quick-add
     input pre-set to that day. */
  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // Every due-item box for a day is always shown (no "+N more"
  // truncation) — instead the boxes shrink as the day gets busier.
  // Up to 8 items they stay full-size; beyond that each additional
  // item nudges the font-size down, clamped so boxes never get too
  // small to tap/read.
  function calendarBoxFontSize(count) {
    const base = 13, min = 6.5, step = 0.35, freeSlots = 8;
    const size = base - Math.max(0, count - freeSlots) * step;
    return Math.max(min, size).toFixed(2) + "px";
  }

  function switchView(view) {
    currentView = view;
    listViewEl.classList.toggle("hidden", view !== "list");
    calendarViewEl.classList.toggle("hidden", view !== "calendar");
    todayViewEl.classList.toggle("hidden", view !== "today");
    viewListBtn.classList.toggle("active", view === "list");
    viewCalendarBtn.classList.toggle("active", view === "calendar");
    viewTodayBtn.classList.toggle("active", view === "today");
    if (view === "calendar") renderCalendar();
    else if (view === "today") renderTodayView();
  }
  viewListBtn.addEventListener("click", () => switchView("list"));
  viewCalendarBtn.addEventListener("click", () => switchView("calendar"));
  viewTodayBtn.addEventListener("click", () => switchView("today"));

  calPrevBtn.addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
  calNextBtn.addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });
  calTodayBtn.addEventListener("click", () => { calCursor = new Date(); calCursor.setDate(1); renderCalendar(); });

  function renderCalendar() {
    calMonthLabelEl.textContent = `${MONTH_LABELS[calCursor.getMonth()]} ${calCursor.getFullYear()}`;

    if (!calWeekdaysEl.childElementCount) {
      WEEKDAY_LABELS.forEach((w) => {
        const el = document.createElement("div");
        el.className = "calendar-weekday";
        el.textContent = w;
        calWeekdaysEl.appendChild(el);
      });
    }

    calGridEl.innerHTML = "";
    const year = calCursor.getFullYear(), month = calCursor.getMonth();
    const startWeekday = new Date(year, month, 1).getDay();
    const gridStart = new Date(year, month, 1 - startWeekday);
    const today = new Date();

    const tasksByDate = {};
    tasks.forEach((t) => {
      if (t.due) (tasksByDate[t.due] = tasksByDate[t.due] || []).push(t);
    });

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const iso = toISODate(cellDate);
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      if (cellDate.getMonth() !== month) cell.classList.add("other-month");
      if (isSameDate(cellDate, today)) cell.classList.add("today");

      const dayHead = document.createElement("div");
      dayHead.className = "calendar-day-head";

      const dayNum = document.createElement("span");
      dayNum.className = "calendar-day-num";
      dayNum.textContent = cellDate.getDate();
      dayHead.appendChild(dayNum);

      const dayTasks = tasksByDate[iso] || [];
      const dayItems = calendarDayItems(dayTasks);
      if (dayItems.length) {
        const doneCount = dayItems.filter((it) => it.done).length;
        const counter = document.createElement("span");
        counter.className = "calendar-day-counter" + (doneCount === dayItems.length ? " all-done" : "");
        counter.textContent = `✓${doneCount}`;
        counter.title = `${doneCount} of ${dayItems.length} done`;
        dayHead.appendChild(counter);
      }

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "calendar-add-btn";
      addBtn.title = "Add task on this day";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openCalendarQuickAdd(cell, iso);
      });
      dayHead.appendChild(addBtn);

      cell.appendChild(dayHead);

      const tasksWrap = document.createElement("div");
      tasksWrap.className = "calendar-day-tasks";
      // Always render every box for the day — never truncate with a
      // "+N more" label. Instead, shrink the boxes as the count grows
      // so a busy day still fits in the cell.
      tasksWrap.style.fontSize = calendarBoxFontSize(dayItems.length);
      dayItems.forEach((it) => {
        const box = document.createElement("span");
        box.className = "calendar-task-box" + (it.done ? " done" : "") + (it.kind === "subtask" ? " calendar-subtask-box" : "");
        box.textContent = it.done ? "☑" : "☐";
        box.title = it.label || "Untitled task";
        // No click handler here on purpose — tapping a box (like
        // tapping anywhere else on the day) just opens that day's
        // full task list, where checking/editing happens instead.
        tasksWrap.appendChild(box);
      });
      cell.appendChild(tasksWrap);

      cell.addEventListener("click", () => openDayModal(iso));
      calGridEl.appendChild(cell);
    }
  }

  // A task with 2+ subtasks gets broken into one small box per subtask
  // (so you can see/tick each one from the calendar); a task with 0-1
  // subtasks stays a single box for the whole task, same as before.
  function calendarDayItems(dayTasks) {
    const items = [];
    dayTasks.forEach((t) => {
      const subs = getTaskSubtasks(t);
      if (subs.length >= 2) {
        subs.forEach((s) => {
          items.push({ kind: "subtask", task: t, subtask: s, done: !!s.done, label: `${t.text || "Untitled task"} — ${s.text || "Untitled subtask"}` });
        });
      } else {
        items.push({ kind: "task", task: t, done: !!t.done, label: t.text || "Untitled task" });
      }
    });
    return items;
  }

  function openCalendarQuickAdd(cell, iso) {
    if (cell.querySelector(".calendar-quick-add")) return;
    const input = document.createElement("textarea");
    input.rows = 1;
    input.className = "calendar-quick-add autosize-input";
    input.placeholder = "Add task…";
    input.spellcheck = false;
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("input", () => autosizeTextarea(input));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        tasks.push({ id: uid(), text: v, done: false, stars: 0, due: iso, subtasks: [] });
        persist();
      } else if (e.key === "Escape") {
        e.preventDefault();
        input.remove();
      }
    });
    input.addEventListener("blur", () => { if (!input.value.trim()) input.remove(); });
    cell.appendChild(input);
    requestAnimationFrame(() => input.focus());
  }

  /* ---- Day detail modal — clicking a day (outside the "+" quick-add
     button) opens a blurred-backdrop overlay showing that day's full
     task list, same rich rows as List/Today (checkbox, stars,
     subtasks, delete), plus its own add-a-task box. ---- */
  function openDayModal(iso) {
    dayModalDate = iso;
    renderDayModal();
    dayModalBackdropEl.classList.remove("hidden");
    // Deliberately not auto-focusing the add-task input here — doing so
    // pops the virtual keyboard open immediately on touch devices, which
    // isn't wanted just from tapping a day. The person can tap the box
    // themselves when they're ready to add a task.
  }
  function closeDayModal() {
    dayModalDate = null;
    dayModalBackdropEl.classList.add("hidden");
    dayModalNewTaskInput.value = "";
    autosizeTextarea(dayModalNewTaskInput);
  }
  function renderDayModal() {
    if (!dayModalDate) return;
    const d = fromISODate(dayModalDate);
    const today = new Date();
    dayModalTitleEl.textContent = isSameDate(d, today)
      ? `Today · ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`
      : `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    const dayTasks = tasks.filter((t) => t.due === dayModalDate);
    dayModalTaskListEl.innerHTML = "";
    dayTasks.forEach((t) => dayModalTaskListEl.appendChild(buildTaskRow(t, { hideDue: true })));
    dayModalEmptyStateEl.classList.toggle("hidden", dayTasks.length > 0);
  }

  dayModalCloseBtn.addEventListener("click", closeDayModal);
  dayModalBackdropEl.addEventListener("click", (e) => {
    if (e.target === dayModalBackdropEl) closeDayModal(); // click on the blurred backdrop itself, not the card
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dayModalDate) closeDayModal();
  });

  dayModalNewTaskInput.addEventListener("input", () => autosizeTextarea(dayModalNewTaskInput));
  dayModalNewTaskInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const v = dayModalNewTaskInput.value.trim();
      if (!v || !dayModalDate) return;
      tasks.push({ id: uid(), text: v, done: false, stars: 0, due: dayModalDate, subtasks: [] });
      dayModalNewTaskInput.value = "";
      autosizeTextarea(dayModalNewTaskInput);
      persist();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDayModal();
    }
  });

  /* ================= Today view =================
     A short worklist: whatever's overdue (past-due, unfinished) up
     top, then whatever's due today — same task rows as the list view
     (checkbox, stars, due date, subtasks, delete all still
     work here), just pre-filtered instead of showing everything. */
  function renderTodayView() {
    const today = new Date();
    todayDateLabelEl.textContent = `Today · ${MONTH_LABELS[today.getMonth()]} ${today.getDate()}`;

    const overdue = tasks.filter((t) => t.due && !t.done && fromISODate(t.due) < startOfToday());
    const dueToday = tasks.filter((t) => t.due && isSameDate(fromISODate(t.due), today));

    todayOverdueListEl.innerHTML = "";
    overdue.forEach((t) => todayOverdueListEl.appendChild(buildTaskRow(t)));
    todayOverdueSectionEl.classList.toggle("hidden", overdue.length === 0);

    todayListEl.innerHTML = "";
    dueToday.forEach((t) => todayListEl.appendChild(buildTaskRow(t)));
    todayEmptyStateEl.classList.toggle("hidden", dueToday.length > 0);
  }

  /* ================= Google Sign-In + Drive sync =================
     Mirrors the single tasks.json blob to the person's own Google Drive
     — same approach as Branchline's per-map sync, just for one file
     instead of many. Requires a Google Cloud OAuth Client ID — see the
     "Google Sign-In setup" section of the README. The client ID below
     is Branchline's existing one; since Google authorizes by *origin*
     (scheme+host, not the full path), it already covers this app too
     as long as it's hosted on the same GitHub Pages domain — no extra
     Cloud Console setup needed in that case. Replace it if you're
     hosting this somewhere else. */
  const GOOGLE_CLIENT_ID = "270018625814-4jfdor9fci625de9b4j7hjta15urcqoe.apps.googleusercontent.com";
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const DRIVE_FILE_NAME = "tasks.json";
  const DRIVE_TOKEN_CACHE_KEY = "todo_drive_token";
  const POLL_INTERVAL_MS = 20000;

  function saveCachedDriveToken(token, expiresAt) {
    try { localStorage.setItem(DRIVE_TOKEN_CACHE_KEY, JSON.stringify({ token, expiresAt })); } catch (e) {}
  }
  function loadCachedDriveToken() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRIVE_TOKEN_CACHE_KEY) || "null");
      if (parsed && parsed.token && parsed.expiresAt > Date.now() + 60000) return parsed;
    } catch (e) {}
    return null;
  }
  function clearCachedDriveToken() {
    try { localStorage.removeItem(DRIVE_TOKEN_CACHE_KEY); } catch (e) {}
  }

  function describeGisError(err) {
    const code = (err && err.type) || String(err || "");
    if (code === "popup_failed_to_open") return "Google's sign-in popup was blocked. Allow popups for this page and try again.";
    if (code === "popup_closed") return "The Google sign-in popup was closed before finishing.";
    return "Google sign-in failed (" + code + "). This usually means this page's exact origin isn't listed under \"Authorized JavaScript origins\" for this OAuth client in Google Cloud Console.";
  }

  const signinBtn = $("#signin-btn");
  const syncStatusEl = $("#sync-status");
  const authGateEl = $("#auth-gate");
  const authGateMessageEl = $("#auth-gate-message");
  const authGateSigninBtn = $("#auth-gate-signin-btn");
  const appContentEl = $("#app-content");

  const DriveDB = {
    tokenClient: null,
    accessToken: null,
    tokenExpiresAt: 0,
    signedIn: false,
    needsReauth: false,
    fileId: null,
    lastSyncedAt: 0,
    dirty: false,
    pushTimer: null,
    pollTimer: null,

    configured() {
      return !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith("PASTE_");
    },

    ensureTokenClient() {
      if (this.tokenClient) return true;
      if (!window.google || !google.accounts || !google.accounts.oauth2) return false;
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {}, // replaced per-request below
      });
      return true;
    },

    async signIn(silent) {
      if (!this.configured()) {
        alert("Google Sign-In isn't configured yet for this deployment — see the README's \"Google Sign-In setup\" section.");
        return;
      }
      const cached = loadCachedDriveToken();
      if (cached) {
        this.accessToken = cached.token;
        this.tokenExpiresAt = cached.expiresAt;
        this.signedIn = true;
        this.needsReauth = false;
        updateSyncUI();
        await this.afterSignIn();
        return;
      }
      if (!this.ensureTokenClient()) {
        setTimeout(() => this.signIn(silent), 300);
        return;
      }
      this.tokenClient.callback = (resp) => {
        if (resp.error) {
          this.needsReauth = true;
          updateSyncUI(describeGisError(resp));
          return;
        }
        const expiresAt = Date.now() + (resp.expires_in || 3500) * 1000;
        this.accessToken = resp.access_token;
        this.tokenExpiresAt = expiresAt;
        this.signedIn = true;
        this.needsReauth = false;
        saveCachedDriveToken(resp.access_token, expiresAt);
        updateSyncUI();
        this.afterSignIn();
      };
      this.tokenClient.error_callback = (err) => {
        updateSyncUI(describeGisError(err));
      };
      this.tokenClient.requestAccessToken({ prompt: silent ? "none" : "consent" });
    },

    signOut() {
      this.signedIn = false;
      this.accessToken = null;
      this.fileId = null;
      clearCachedDriveToken();
      this.stopPolling();
      updateSyncUI();
    },

    async afterSignIn() {
      startPolling();
      await this.pullThenPush();
    },

    authHeaders() {
      return { Authorization: "Bearer " + this.accessToken };
    },

    // Finds (or remembers) the id of our one tasks.json file in Drive.
    // drive.file scope only lets us see files this app itself created,
    // so a simple name-based search is safe here.
    async findFile() {
      if (this.fileId) return this.fileId;
      const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)`, { headers: this.authHeaders() });
      if (res.status === 401) { this.needsReauth = true; updateSyncUI("Google session expired"); return null; }
      const data = await res.json();
      if (data.files && data.files.length) { this.fileId = data.files[0].id; return this.fileId; }
      return null;
    },

    async downloadRemote() {
      const id = await this.findFile();
      if (!id) return null;
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: this.authHeaders() });
      if (!res.ok) return null;
      try { return await res.json(); } catch (e) { return null; }
    },

    async uploadRemote() {
      const body = JSON.stringify({ tasks, updatedAt: dataUpdatedAt });
      const metadata = { name: DRIVE_FILE_NAME, mimeType: "application/json" };
      const id = await this.findFile();
      const boundary = "-------todosync" + uid();
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(id ? {} : metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const url = id
        ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      const res = await fetch(url, {
        method: id ? "PATCH" : "POST",
        headers: { ...this.authHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
        body: multipart,
      });
      if (res.status === 401) { this.needsReauth = true; updateSyncUI("Google session expired"); return; }
      const data = await res.json().catch(() => null);
      if (data && data.id) this.fileId = data.id;
      this.lastSyncedAt = Date.now();
      updateSyncUI();
    },

    // Pull whatever's on Drive first, keep whichever copy (local vs
    // remote) has the more recent updatedAt — same last-write-wins merge
    // Branchline uses — then push the winning copy back up so both
    // sides agree.
    async pullThenPush() {
      try {
        const remote = await this.downloadRemote();
        if (remote && Array.isArray(remote.tasks) && (remote.updatedAt || 0) > dataUpdatedAt) {
          tasks = remote.tasks;
          dataUpdatedAt = remote.updatedAt;
          renderAll();
        }
        await this.uploadRemote();
      } catch (e) { /* offline or transient — next poll/edit will retry */ }
    },

    markDirty() {
      this.dirty = true;
      if (!this.signedIn) return;
      clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => { this.dirty = false; this.uploadRemote(); }, 1200);
    },

    startPolling() { this.startPollingImpl(); },
    startPollingImpl() {
      this.stopPolling();
      this.pollTimer = setInterval(async () => {
        if (!this.signedIn || this.dirty) return;
        try {
          const remote = await this.downloadRemote();
          if (remote && Array.isArray(remote.tasks) && (remote.updatedAt || 0) > dataUpdatedAt) {
            tasks = remote.tasks;
            dataUpdatedAt = remote.updatedAt;
            renderAll();
            this.lastSyncedAt = Date.now();
            updateSyncUI();
          }
        } catch (e) {}
      }, POLL_INTERVAL_MS);
    },
    stopPolling() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } },
  };
  function startPolling() { DriveDB.startPolling(); }

  function relTime(ms) {
    const diff = Date.now() - ms;
    if (diff < 45000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  }

  function updateSyncUI(overrideStatus) {
    if (overrideStatus) { syncStatusEl.textContent = overrideStatus; }
    else if (DriveDB.needsReauth) { syncStatusEl.textContent = "Google session expired"; }
    else if (DriveDB.signedIn) { syncStatusEl.textContent = DriveDB.lastSyncedAt ? "Synced " + relTime(DriveDB.lastSyncedAt) : "Synced to Google Drive"; }
    else { syncStatusEl.textContent = ""; }
    signinBtn.textContent = DriveDB.needsReauth ? "Reconnect Google" : (DriveDB.signedIn ? "Sign out" : "Sign in with Google");
    signinBtn.classList.toggle("signed-in", DriveDB.signedIn && !DriveDB.needsReauth);
    updateGate();
  }

  /* ================= Auth/online gate =================
     This app has no local-only mode: the task list, add-task row, and
     all editing are locked behind the auth-gate overlay unless the
     person is signed in to Google *and* currently online. This keeps
     Drive as the single source of truth — no editing happens that
     might not make it into a sync. */
  function isUnlocked() {
    return navigator.onLine && DriveDB.signedIn && !DriveDB.needsReauth;
  }
  function updateGate() {
    const unlocked = isUnlocked();
    appContentEl.classList.toggle("hidden", !unlocked);
    authGateEl.classList.toggle("hidden", unlocked);
    if (unlocked) return;
    if (!navigator.onLine) {
      authGateMessageEl.textContent = "You're offline. This app needs an internet connection to sync your tasks.";
    } else if (DriveDB.needsReauth) {
      authGateMessageEl.textContent = "Your Google session expired. Reconnect to keep using this app.";
    } else {
      authGateMessageEl.textContent = "Sign in with Google to use this app. Tasks are stored in your Google Drive — nothing works offline-only.";
    }
    authGateSigninBtn.textContent = DriveDB.needsReauth ? "Reconnect Google" : "Sign in with Google";
    authGateSigninBtn.classList.toggle("hidden", !navigator.onLine);
  }

  function handleSigninClick() {
    if (DriveDB.signedIn || DriveDB.needsReauth) DriveDB.signOut();
    else DriveDB.signIn(false);
  }
  signinBtn.addEventListener("click", handleSigninClick);
  authGateSigninBtn.addEventListener("click", () => DriveDB.signIn(false));

  window.addEventListener("online", updateGate);
  window.addEventListener("offline", updateGate);

  // Keeps the sync status text ("Synced 2m ago") fresh without needing
  // an actual sync to re-render it.
  setInterval(() => { if (DriveDB.signedIn) updateSyncUI(); }, 30000);

  /* ================= Init ================= */
  renderAll();
  updateSyncUI();
  // Try a silent (no-popup) sign-in on load if we still have a cached
  // token or the browser remembers this Google account from before.
  if (loadCachedDriveToken()) DriveDB.signIn(true);
})();
