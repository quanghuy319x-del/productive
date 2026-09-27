/* Branchline Phase 3 timer domain — v342
   Extracted from app.js: per-node/table-cell Time Played countdown UI.
   The module owns its countdown/modal state; app.js injects app services. */
(function (g) {
  "use strict";

  function create(deps) {
    if (!deps) throw new Error("BranchlineTimer.create requires dependencies");
    const {
      $,
      resolveHost,
      commitEditIfActive,
      closeContextMenu,
      findNode,
      formatFocusTime,
      nodesLayer,
      persist,
      pushUndo,
      renderAll,
      sameTarget,
      startFocusChime,
      stopFocusChime,
      state,
      zoomModalClose,
      zoomModalOpen,
      getFocusTimer,
      markUnsaved
    } = deps;

  /* ---------------- node timer ("time played") ---------------- */
  // A per-node countdown timer. Start it and it ticks down like a normal
  // countdown (pause/resume, "+1m" to stack on more time, chimes when it
  // hits zero) — but the number that actually matters is the *total*
  // stored on the node (node.timePlayedSec): every second the countdown
  // is genuinely running (not paused) adds one second to that total, so
  // it reflects time actually played/worked, not just time scheduled.
  // That total is shown live both here and as the small "⏱ 45m" badge on
  // the node itself (see renderNode), and is saved with the map like
  // everything else.
  const NODE_TIMER_DEFAULT_SEC = 1 * 60; // default countdown length when starting fresh
  const NODE_TIMER_EXTEND_SEC = 60; // added per "+1m" click while running

  const timerModal = $("#timer-modal");
  const timerNodeLabel = $("#timer-node-label");
  const timerTotalDisplay = $("#timer-total-display");
  const timerResetBtn = $("#timer-reset-btn");
  const timerStartRow = $("#timer-start-row");
  const timerStartBtn = $("#timer-start-btn");
  const timerCountdownRow = $("#timer-countdown-row");
  const timerCountdownDisplay = $("#timer-countdown-display");
  const timerPauseBtn = $("#timer-pause-btn");
  const timerStopBtn = $("#timer-stop-btn");
  const timerExtendBtn = $("#timer-extend-btn");
  const timerDoneLabel = $("#timer-done-label");
  let timerEditingId = null; // {nodeId, r, c} — r/c omitted for a node-level timer, both given for a table-cell timer

  // Only one countdown can run at a time (mirrors the per-task focus
  // timer) but, like that one, it keeps running via setInterval even if
  // this modal is closed or a different node/map is opened, so switching
  // away doesn't quietly cancel a session that's in progress.
  let nodeTimer = null; // { target: {nodeId, r, c}, remaining, duration, paused, intervalId }
  let nodeTimerJustCompleted = null; // {nodeId, r, c}, shown briefly in the modal after a session finishes

  function getNodeTimePlayed(node) {
    return (node && typeof node.timePlayedSec === "number" && node.timePlayedSec > 0) ? node.timePlayedSec : 0;
  }

  // "45m", "1h", "1h 20m" — always whole minutes, so no seconds ever show.
  function formatTimePlayed(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
  }

  function openTimerModal(nodeId, r, c) {
    const host = resolveHost(nodeId, r, c);
    if (!host) return;
    commitEditIfActive();
    closeContextMenu();
    timerEditingId = { nodeId, r, c };
    renderTimerModal();
    zoomModalOpen(timerModal);
  }

  function closeTimerModal() {
    timerEditingId = null;
    renderAll();
    zoomModalClose(timerModal);
  }

  function renderTimerModal() {
    const t = timerEditingId;
    const host = t ? resolveHost(t.nodeId, t.r, t.c) : null;
    if (!host) { closeTimerModal(); return; }
    const node = findNode(t.nodeId);
    const cellText = (t.r != null && node && node.table && node.table.cells[t.r]) ? node.table.cells[t.r][t.c] : null;
    timerNodeLabel.textContent = t.r == null ? ((node && node.text) || "(untitled)") : (cellText || `Cell (row ${t.r + 1}, col ${t.c + 1})`);
    const total = getNodeTimePlayed(host);
    timerTotalDisplay.textContent = formatTimePlayed(total);
    timerResetBtn.style.visibility = total ? "visible" : "hidden";

    const runningHere = nodeTimer && sameTarget(nodeTimer.target, t);
    timerCountdownRow.classList.toggle("hidden", !runningHere);
    const justCompletedHere = nodeTimerJustCompleted && sameTarget(nodeTimerJustCompleted, t);
    timerDoneLabel.classList.toggle("hidden", !justCompletedHere);
    timerStartRow.style.display = (runningHere || justCompletedHere) ? "none" : "flex";

    if (runningHere) {
      timerCountdownDisplay.textContent = formatFocusTime(nodeTimer.remaining);
      timerCountdownDisplay.classList.toggle("paused", nodeTimer.paused);
      timerPauseBtn.textContent = nodeTimer.paused ? "▶" : "⏸";
      timerPauseBtn.title = nodeTimer.paused ? "Resume" : "Pause";
    }
  }

  // Cheap live update used on every tick: pushes the new total straight
  // into the node's (or table cell's) badge on the canvas — and this
  // modal, if open for the same target — without a full renderAll() — a
  // per-second re-layout of the whole map would be wasteful, especially
  // on a large mind map.
  function updateNodeTimerLiveUI(target) {
    if (!target) return;
    const host = resolveHost(target.nodeId, target.r, target.c);
    if (!host) return;
    const total = getNodeTimePlayed(host);
    const badgeLabel = target.r == null
      ? nodesLayer.querySelector(`.node[data-id="${target.nodeId}"] .node-timer-badge span`)
      : nodesLayer.querySelector(`.node[data-id="${target.nodeId}"] .node-table-cell[data-r="${target.r}"][data-c="${target.c}"] .node-table-cell-timer span`);
    if (badgeLabel) {
      badgeLabel.textContent = formatTimePlayed(total);
      badgeLabel.parentElement.title = `${formatTimePlayed(total)} logged — click to add more`;
    } else {
      const focusTimer = getFocusTimer();
      const activeCounter =
        (nodeTimer && sameTarget(nodeTimer.target, target)) ? nodeTimer :
        (focusTimer && sameTarget(focusTimer.target, target)) ? focusTimer : null;
      if (total && target.nodeId !== state.editingId && activeCounter && !activeCounter.badgeRenderAttempted) {
        // The badge doesn't exist yet because this target previously had no
        // logged time. Create it once for either the node timer OR Task List
        // focus timer, never once per second.
        activeCounter.badgeRenderAttempted = true;
        renderAll();
      }
    }
    if (timerEditingId && sameTarget(timerEditingId, target) && !timerModal.classList.contains("hidden")) {
      timerTotalDisplay.textContent = formatTimePlayed(total);
      timerResetBtn.style.visibility = total ? "visible" : "hidden";
    }
  }

  function startNodeTimer(target, durationSec = NODE_TIMER_DEFAULT_SEC) {
    const host = resolveHost(target.nodeId, target.r, target.c);
    if (!host) return;
    stopNodeTimerInterval();
    stopFocusChime();
    nodeTimerJustCompleted = null;
    pushUndo();
    nodeTimer = {
      target,
      remaining: durationSec,
      duration: durationSec,
      paused: false,
      ticksSincePersist: 0,
      intervalId: setInterval(nodeTimerTick, 1000),
    };
    renderTimerModal();
  }

  // How often the countdown writes its running total to disk while it's
  // actually ticking. This is a *cheap* in-memory update every second
  // (host.timePlayedSec++), but persist() triggers this app's full save
  // path — which re-embeds every photo's bytes into JSON for the folder
  // mirror/Drive upload — so calling it every single second would re-run
  // that heavy work once a second for as long as the timer runs and can
  // exhaust memory on a photo-heavy map. Saving every 10s instead (plus
  // on pause/stop/complete, and the existing flushPersist safety net on
  // tab-hide/close) keeps at most ~10s of countdown time at risk of loss
  // without hammering the save path.
  const NODE_TIMER_PERSIST_EVERY_SEC = 10;

  function nodeTimerTick() {
    if (!nodeTimer || nodeTimer.paused) return;
    nodeTimer.remaining--;
    const host = resolveHost(nodeTimer.target.nodeId, nodeTimer.target.r, nodeTimer.target.c);
    if (host) {
      host.timePlayedSec = getNodeTimePlayed(host) + 1;
      markUnsaved();
      nodeTimer.ticksSincePersist++;
      if (nodeTimer.ticksSincePersist >= NODE_TIMER_PERSIST_EVERY_SEC) {
        nodeTimer.ticksSincePersist = 0;
        persist();
      }
      updateNodeTimerLiveUI(nodeTimer.target);
    }
    if (nodeTimer.remaining <= 0) {
      nodeTimerComplete();
      return;
    }
    if (timerEditingId && sameTarget(timerEditingId, nodeTimer.target)) renderTimerModal();
  }

  function toggleNodeTimerPause() {
    if (!nodeTimer) return;
    nodeTimer.paused = !nodeTimer.paused;
    if (nodeTimer.paused) {
      nodeTimer.ticksSincePersist = 0;
      persist();
    }
    renderTimerModal();
  }

  function extendNodeTimer(seconds) {
    if (!nodeTimer) return;
    nodeTimer.remaining += seconds;
    nodeTimer.duration += seconds;
    renderTimerModal();
  }

  // Clears the interval only — used internally before starting a new
  // countdown, without touching the "just completed" flash state.
  function stopNodeTimerInterval() {
    if (nodeTimer && nodeTimer.intervalId) clearInterval(nodeTimer.intervalId);
    nodeTimer = null;
  }

  function stopNodeTimer() {
    const prev = nodeTimer;
    stopNodeTimerInterval();
    if (prev) {
      persist();
      updateNodeTimerLiveUI(prev.target);
      if (timerEditingId && sameTarget(timerEditingId, prev.target)) renderTimerModal();
    }
  }

  function nodeTimerComplete() {
    const finished = nodeTimer;
    stopNodeTimerInterval();
    if (!finished) return;
    persist();
    updateNodeTimerLiveUI(finished.target);
    startFocusChime();
    nodeTimerJustCompleted = finished.target;
    if (timerEditingId && sameTarget(timerEditingId, finished.target)) renderTimerModal();
    setTimeout(() => {
      if (nodeTimerJustCompleted && sameTarget(nodeTimerJustCompleted, finished.target)) {
        nodeTimerJustCompleted = null;
        if (timerEditingId && sameTarget(timerEditingId, finished.target)) renderTimerModal();
      }
    }, 4000);
  }

  function isNodeTimerCountingTarget(target) {
    return !!(nodeTimer && !nodeTimer.paused && target && sameTarget(nodeTimer.target, target));
  }

  timerStartBtn.addEventListener("click", () => {
    if (!timerEditingId) return;
    startNodeTimer(timerEditingId);
  });
  timerPauseBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleNodeTimerPause(); });
  timerStopBtn.addEventListener("click", (e) => { e.stopPropagation(); stopNodeTimer(); });
  timerExtendBtn.addEventListener("click", (e) => { e.stopPropagation(); extendNodeTimer(NODE_TIMER_EXTEND_SEC); });

  timerResetBtn.addEventListener("click", () => {
    const t = timerEditingId;
    if (!t) return;
    const host = resolveHost(t.nodeId, t.r, t.c);
    if (!host || !getNodeTimePlayed(host)) return;
    pushUndo();
    host.timePlayedSec = 0;
    persist();
    renderTimerModal();
    updateNodeTimerLiveUI(t);
  });

  $("#timer-back").addEventListener("click", closeTimerModal);
  timerModal.addEventListener("click", (e) => { if (e.target === timerModal) closeTimerModal(); });
  document.addEventListener("keydown", (e) => {
    if (timerModal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeTimerModal();
  });


    return Object.freeze({
      getNodeTimePlayed,
      formatTimePlayed,
      openTimerModal,
      updateNodeTimerLiveUI,
      isNodeTimerCountingTarget
    });
  }

  g.BranchlineTimer = Object.freeze({ create });
})(window);
