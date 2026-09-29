/* Branchline Phase 2 layout domain — v341
   Extracted from app.js: layout engine, text measurement/wrapping,
   node box geometry, and branch-color resolution.
   The module owns no app state; app.js injects the live dependencies. */
(function (g) {
  "use strict";

  function create(deps) {
    if (!deps) throw new Error("BranchlineLayout.create requires dependencies");
    const {
      NODE_H,
      ROOT_H,
      SLOT_GAP,
      PALETTE,
      STRIP_OVERFLOW_CAP,
      state,
      clamp,
      gapFor,
      nodeIsTable,
      getNodeImages,
      getNodeNotes,
      getNodeUrls,
      nodeTaskNoteMarkerCount,
      nodeSubtaskBrainstormMarkerCount,
      nodeAffirmationWins,
      getNodeTimePlayed,
      brainstormPoints,
      stripBucketCount,
      nodeTaskProgress,
      isClockHidden
    } = deps;

  /* ---------------- layout engine ---------------- */

  const TIMELINE_ROOT_GAP = 34;  // gap from root down to the first branch's row
  const TIMELINE_ROW_GAP = 20;   // gap between one branch's row and the next

  // Shared depth/size measuring pass, used by every layout mode.
  function measureTree(node, depth) {
    node._depth = depth;
    computeNodeBox(node);
    if (node.collapsed || !node.children || node.children.length === 0) return;
    for (const c of node.children) measureTree(c, depth + 1);
  }

  // Shared bounding-box pass (including any manual drag offsets), used by
  // every layout mode once node._x/_y have been assigned.
  function computeBBox(root) {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    (function walk(n) {
      const w = n._w, h = n._h;
      const nx = nodeCenterX(n), ny = n._y + (n.oy || 0);
      minX = Math.min(minX, nx - w / 2);
      maxX = Math.max(maxX, nx + w / 2);
      minY = Math.min(minY, ny - h / 2);
      maxY = Math.max(maxY, ny + h / 2);
      if (!n.collapsed) (n.children || []).forEach(walk);
    })(root);
    return { minX, maxX, minY, maxY };
  }

  function layout(root) {
    const mode = (state.current && state.current.layout) || "mindmap";
    if (mode === "logic" || mode === "righty") layoutMindmap(root, false);
    else if (mode === "timeline") layoutTimeline(root);
    else layoutMindmap(root, true);
    // The layout passes above place every node at its automatic slot, then
    // manual drag offsets (ox/oy) are added on top at render time. Dragging
    // a node — or editing text so a box grows — can push it into a sibling
    // it wasn't overlapping before. Rather than only fixing that when the
    // user explicitly clicks "Auto-arrange" (which wipes every manual nudge
    // in the whole map), resolve any leftover overlaps here on every
    // render, so nodes never visually collide but manual positioning is
    // otherwise left alone.
    resolveOverlaps(root);
    return computeBBox(root);
  }

  // Nudges any two overlapping node boxes apart vertically (never
  // horizontally, so each node's depth column — and therefore the whole
  // branch/tree reading order — stays put) until nothing overlaps. Runs as
  // a handful of relaxation passes since separating one pair can introduce
  // a new overlap with a third node.
  function resolveOverlaps(root) {
    const nodes = [];
    // Track each node's parent (just for this pass) so we can tell ancestor
    // pairs apart from unrelated ones below, and so an overlap fix can carry
    // a node's whole subtree along with it instead of leaving children
    // behind at their old spot.
    const parentOf = new Map();
    (function collect(n, parent) {
      if (n !== root) nodes.push(n);
      if (parent) parentOf.set(n, parent);
      if (!n.collapsed) (n.children || []).forEach(c => collect(c, n));
    })(root, null);

    function isAncestor(a, b) {
      // true if `a` is an ancestor of `b` — an ancestor/descendant pair is
      // expected to sit close together (that's the whole point of the
      // connector between them) and pushing them apart would just detach
      // the child from its parent's column, so those pairs are skipped.
      let p = parentOf.get(b);
      while (p) {
        if (p === a) return true;
        p = parentOf.get(p);
      }
      return false;
    }

    // Moves a node AND everything under it by the same amount, so a node's
    // children stay put relative to their parent — i.e. each node's own
    // subtree keeps its internal vertical alignment — instead of the parent
    // drifting away from children left behind at their pre-push position
    // (which is what used to cause a moved branch's descendants to overlap
    // an unrelated neighboring branch).
    function shiftSubtree(n, dy) {
      n._y += dy;
      if (!n.collapsed) (n.children || []).forEach(c => shiftSubtree(c, dy));
    }

    const PAD = 10;
    const MAX_PASSES = 8;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          if (isAncestor(a, b) || isAncestor(b, a)) continue;
          const ax = nodeCenterX(a), ay = a._y + (a.oy || 0);
          const bx = nodeCenterX(b), by = b._y + (b.oy || 0);
          const overlapX = (a._w / 2 + b._w / 2 + PAD) - Math.abs(ax - bx);
          const overlapY = (a._h / 2 + b._h / 2 + PAD) - Math.abs(ay - by);
          if (overlapX > 0 && overlapY > 0) {
            moved = true;
            const push = overlapY / 2;
            if (ay <= by) { shiftSubtree(a, -push); shiftSubtree(b, push); }
            else { shiftSubtree(a, push); shiftSubtree(b, -push); }
          }
        }
      }
      if (!moved) break;
    }
  }

  // Classic radial mind map. With splitSides=true, top-level branches
  // alternate left/right of the root (the default "Mindmap" layout). With
  // splitSides=false, every branch fans out to the right only, stacked
  // top to bottom (the "Righty mindmap" layout).
  function layoutMindmap(root, splitSides) {
    const children = root.children || [];
    const right = [], left = [];
    if (splitSides) {
      // Each top-level branch keeps whatever side it was already assigned
      // (persisted on the node itself), so reordering siblings — or adding
      // a new one — never flips a side that wasn't the one actually being
      // dragged. Only a node that has never had a side (brand new, or from
      // a map saved before this existed) gets one now, balanced against
      // whatever's already assigned so a fresh map still fans out evenly.
      let rightCount = children.filter(c => c.side === "right").length;
      let leftCount = children.filter(c => c.side === "left").length;
      children.forEach(c => {
        if (c.side !== "left" && c.side !== "right") {
          if (leftCount < rightCount) { c.side = "left"; leftCount++; }
          else { c.side = "right"; rightCount++; }
        }
      });
      children.forEach(c => (c.side === "left" ? left : right).push(c));
    } else {
      children.forEach(c => right.push(c));
    }

    root._x = 0; root._y = 0; root._depth = 0;
    computeNodeBox(root);

    // How much vertical room a node's whole subtree needs to stack without
    // overlapping ITSELF — its own height, or the combined height of its
    // children (with gaps) if that's bigger. This is computed bottom-up and
    // is purely local to the node: it has no idea what any other branch, or
    // any node at the "same level" elsewhere in the tree, looks like. That's
    // what let's place() below give every node a private slot sized to its
    // own subtree, so alignment only ever has to work *inside* that node —
    // an unrelated node at the same depth in a different branch never needs
    // to line up with it, and can't be pushed into it either.
    function subtreeExtent(node) {
      if (node.collapsed || !node.children || node.children.length === 0) {
        return (node._subtreeH = node._h || NODE_H);
      }
      let total = 0;
      node.children.forEach((c, i) => {
        total += subtreeExtent(c);
        if (i > 0) total += SLOT_GAP;
      });
      return (node._subtreeH = Math.max(node._h || NODE_H, total));
    }

    // Places a node at vertical center `y`, inside the slot [y -
    // node._subtreeH/2, y + node._subtreeH/2] already reserved for its
    // whole subtree by the caller. Children are stacked and centered
    // entirely within that local slot, so a node's own layout never
    // depends on, or disturbs, anything outside its own subtree.
    function place(node, depth, sign, y, parentOffset) {
      // A node normally just inherits the direction its ancestor branch is
      // already fanning (the `sign` handed down from the caller). But if
      // this particular node has its own explicit left/right override
      // (set when the user drags it across the center line — see
      // maybeFlipSideOnDrop), that wins instead, and everything under it
      // switches to fan the same way, regardless of which side its parent
      // is on.
      // Only a top-level branch (depth 1, i.e. a direct child of root) is
      // allowed to pick its own side — that's what makes each branch fan
      // one direction only. A deeper node can still end up with a leftover
      // .side (e.g. from being dragged across its branch's local spine
      // while in Timeline mode), but Mindmap mode must ignore that here,
      // or a single branch would fan both left and right at once.
      // This whole override is also gated on splitSides: in the
      // one-direction layout (Righty mindmap, splitSides=false) every
      // top-level branch must fan the same way regardless of any leftover
      // .side a node picked up from a previous stint in real (two-sided)
      // Mindmap mode — otherwise a branch dragged left back when the map
      // was in Mindmap mode would keep sitting on the left forever after
      // switching to a right-only layout.
      const nodeSign = (splitSides && depth === 1 && (node.side === "left" || node.side === "right"))
        ? (node.side === "left" ? -1 : 1)
        : sign;
      // Distance out from the center builds up hop by hop from the parent's
      // own OUTER edge (not just its anchor point), so a wide parent node
      // — one whose text pushed its box wider than the default gap — still
      // leaves enough room before its child starts. A custom xGap on one
      // node (see gapFor) still shifts it and everything past it without
      // disturbing anything closer in; it's just measured from the actual
      // rendered edge now instead of a flat distance from the root.
      const offset = parentOffset + gapFor(node);
      node._x = nodeSign * offset;
      if (node.collapsed || !node.children || node.children.length === 0) {
        node._y = y;
        return;
      }
      let total = 0;
      node.children.forEach((c, i) => {
        total += c._subtreeH;
        if (i > 0) total += SLOT_GAP;
      });
      let cursor = y - total / 2;
      node.children.forEach(c => {
        const center = cursor + c._subtreeH / 2;
        place(c, depth + 1, nodeSign, center, offset + node._w);
        cursor += c._subtreeH + SLOT_GAP;
      });
      // center parent over its children
      const first = node.children[0]._y;
      const last = node.children[node.children.length - 1]._y;
      node._y = (first + last) / 2;
    }

    function layoutSide(list, sign) {
      if (list.length === 0) return;
      list.forEach(n => measureTree(n, 1));
      list.forEach(n => subtreeExtent(n));
      let total = 0;
      list.forEach((n, i) => {
        total += n._subtreeH;
        if (i > 0) total += SLOT_GAP;
      });
      let cursor = -total / 2;
      list.forEach(n => {
        const center = cursor + n._subtreeH / 2;
        // The root is centered on the spine (not anchored like everything
        // past it), so its "outer edge" toward this fan direction is half
        // its own width, not 0 — otherwise a wide root would suffer the
        // same too-close-to-its-child overlap that wide non-root nodes do.
        place(n, 1, sign, center, root._w / 2);
        cursor += n._subtreeH + SLOT_GAP;
      });
    }

    layoutSide(right, 1);
    layoutSide(left, -1);

    return computeBBox(root);
  }

  // Vertical "spine" layout: the root sits in the middle with each
  // top-level branch stacked along the spine above or below it. Each
  // branch's own descendants fan out sideways from that branch —
  // splitting between left and right (like a mini mind map hanging off
  // the spine) rather than being locked to a single side for the whole
  // branch, so a branch with a lot of children doesn't need to push way
  // out to one side while the other side sits empty.
  //
  // A branch normally sits below the root (the original, and still
  // default, arrangement), but dragging it above the root instead flips
  // an explicit node.vSide === "above" flag (see maybeFlipVSideOnDrop/
  // maybeFlipVSideDuringDrag) that sends it — and it alone, not its
  // siblings — up onto the other half of the spine. Only a top-level
  // branch has a vSide; it has no meaning at any other depth, so it's
  // left untouched everywhere else (same treatment as .side).
  function layoutTimeline(root) {
    const children = root.children || [];
    root._x = 0; root._y = 0; root._depth = 0;
    measureTree(root, 0);

    // Pass 1: lay out each branch's own subtree in isolation, centered on
    // its own local y=0 (not yet placed on the spine), and record how
    // tall that centered subtree actually is. This has to happen before
    // any row is positioned, because — see pass 2 below — a row needs to
    // know the height of the row AFTER it, not just its own, to leave a
    // clean gap on both sides.
    const laidOut = children.map((branch) => {
      branch._x = 0; // always sits directly on the spine

      // Split this branch's own direct children left/right, exactly like
      // the Mindmap layout splits the root's children — each child keeps
      // whatever side it was already assigned (persisted on the node
      // itself via maybeFlipSideOnDrop), and only a side-less child (brand
      // new, or from a map saved before this existed) gets balanced onto
      // whichever side currently has fewer. Crucially, that auto-balance
      // is NOT written back onto c.side: .side is a shared field that
      // Mindmap mode's own place() also reads for every node (not just
      // root's direct children), so persisting an auto-assigned side here
      // would leak into Mindmap mode and make that same node split away
      // from its branch there too. Only a genuinely user-dragged side
      // (already present on the node) is meant to carry across layouts —
      // an auto-balanced one is scoped to this Timeline render only.
      //
      // That auto-assigned side is still cached on the node (as _autoSide,
      // a runtime-only field, never saved) so it's STABLE across renders —
      // computed once per side-less child and reused after that. Without
      // this, the balance below is recomputed from scratch every layout
      // purely off the current left/right counts, so dragging one sibling
      // to explicitly flip its own side would shift those counts and could
      // flip a completely different, untouched sibling to the other side
      // too. Caching means only a node you actually drag ever changes side.
      const bChildren = branch.children || [];
      const right = [], left = [];
      if (bChildren.length) {
        let rightCount = bChildren.filter(c => c.side === "right" || (!c.side && c._autoSide === "right")).length;
        let leftCount = bChildren.filter(c => c.side === "left" || (!c.side && c._autoSide === "left")).length;
        bChildren.forEach(c => {
          if (c.side === "left") { left.push(c); return; }
          if (c.side === "right") { right.push(c); return; }
          if (c._autoSide === "left") { left.push(c); return; }
          if (c._autoSide === "right") { right.push(c); return; }
          if (leftCount < rightCount) { left.push(c); leftCount++; c._autoSide = "left"; }
          else { right.push(c); rightCount++; c._autoSide = "right"; }
        });
      }

      // Same local, bottom-up sizing idea as the Mindmap layout's
      // subtreeExtent(): how much vertical room a node's own subtree needs,
      // based only on itself and its own descendants — never on any other
      // branch or any node elsewhere at the "same level". That's what lets
      // each node's children be spaced purely relative to each other.
      function subtreeExtent(node) {
        if (node.collapsed || !node.children || node.children.length === 0) {
          return (node._subtreeH = node._h || NODE_H);
        }
        let total = 0;
        node.children.forEach((c, i) => {
          total += subtreeExtent(c);
          if (i > 0) total += SLOT_GAP;
        });
        return (node._subtreeH = Math.max(node._h || NODE_H, total));
      }

      // Same recursive placement as the Mindmap layout's place(): a node
      // normally inherits the direction its ancestor is already fanning,
      // but its own explicit side override (set by dragging it across the
      // spine) wins instead, and everything under it follows that instead.
      // `y` is the vertical center of the slot already reserved for this
      // node's whole subtree, so its children only ever need to fit inside
      // that local slot.
      function place(node, curSign, y, parentOffset) {
        const nodeSign = node.side === "left" ? -1 : node.side === "right" ? 1 : curSign;
        // Measured from the parent's own OUTER edge (not just its anchor
        // point), so a wide parent — one whose text pushed its box wider
        // than the default gap — still leaves enough room before its own
        // child starts, instead of the child's edge landing inside it.
        const offset = parentOffset + gapFor(node);
        node._x = nodeSign * offset;
        if (node.collapsed || !node.children || node.children.length === 0) {
          node._y = y;
          return;
        }
        let total = 0;
        node.children.forEach((c, i) => {
          total += c._subtreeH;
          if (i > 0) total += SLOT_GAP;
        });
        let cursor = y - total / 2;
        node.children.forEach(c => {
          const center = cursor + c._subtreeH / 2;
          place(c, nodeSign, center, offset + node._w);
          cursor += c._subtreeH + SLOT_GAP;
        });
        const first = node.children[0]._y;
        const last = node.children[node.children.length - 1]._y;
        node._y = (first + last) / 2;
      }

      // Lays out one side's subtree(s) stacked top-to-bottom and centered
      // on this branch's own local y=0 — same idea as the Mindmap layout's
      // layoutSide(), just scoped to one branch instead of the whole map.
      // Returns the side's total stacked height so the row height below can
      // be the TALLER of the two sides, not their sum.
      function layoutSide(list, sign) {
        if (list.length === 0) return 0;
        list.forEach(n => subtreeExtent(n));
        let total = 0;
        list.forEach((n, i) => {
          total += n._subtreeH;
          if (i > 0) total += SLOT_GAP;
        });
        let cursor = -total / 2;
        list.forEach(n => {
          const center = cursor + n._subtreeH / 2;
          // The branch itself sits centered on the spine (branch._x === 0,
          // same treatment as the root), so its outer edge toward this fan
          // direction is half its own width, not 0.
          place(n, sign, center, branch._w / 2);
          cursor += n._subtreeH + SLOT_GAP;
        });
        return total;
      }

      const rightHeight = layoutSide(right, 1);
      const leftHeight = layoutSide(left, -1);
      const localHeight = Math.max(branch._h || NODE_H, rightHeight, leftHeight);
      branch._y = 0; // both sides were just centered around this same baseline
      return { branch, localHeight };
    });

    // Split the rows into the two halves of the spine. A side-less branch
    // (no explicit vSide — every branch before this feature existed, and
    // every new one by default) goes below, exactly as before; only a
    // branch explicitly dragged above the root (vSide === "above") moves
    // to the top half. Relative order within each half is whatever order
    // those branches already have in the (single, shared) children array.
    const belowLaidOut = laidOut.filter(({ branch }) => branch.vSide !== "above");
    const aboveLaidOut = laidOut.filter(({ branch }) => branch.vSide === "above");

    // Place each row along the spine. Two branches can have very
    // different heights (especially now that each one's own children can
    // split across both sides instead of piling onto a single side), so
    // spacing rows by "previous branch's height + gap" alone isn't
    // enough — a short branch followed by a tall one would let the tall
    // one's top half creep up into the short one's row. Advancing by
    // HALF the previous row's height plus HALF the next row's height
    // (plus the fixed gap) instead guarantees the same clean gap between
    // every pair of rows regardless of how lopsided their heights are —
    // which is what keeps different branches' node boxes, and the
    // connector curves fanning off them, from ever overlapping.
    //
    // Below-the-root half: unchanged from the original single-direction
    // layout, just scoped to belowLaidOut instead of every branch.
    let spineCursor = (root._h || ROOT_H) / 2 + TIMELINE_ROOT_GAP + (belowLaidOut.length ? belowLaidOut[0].localHeight / 2 : 0);
    belowLaidOut.forEach(({ branch, localHeight }, i) => {
      if (i > 0) {
        spineCursor += belowLaidOut[i - 1].localHeight / 2 + TIMELINE_ROW_GAP + localHeight / 2;
      }
      const offset = spineCursor;
      (function shift(n) {
        n._y += offset;
        if (!n.collapsed) (n.children || []).forEach(shift);
      })(branch);
    });

    // Above-the-root half: the exact mirror image, growing upward
    // (negative y) instead of downward. Walked back-to-front so that the
    // branch LAST in the array sits closest to the root (directly above
    // it) and the branch FIRST in the array ends up furthest away — i.e.
    // reading the above group top-to-bottom on screen matches its order
    // in the array, just like the below group does.
    let spineCursorUp = -((root._h || ROOT_H) / 2 + TIMELINE_ROOT_GAP + (aboveLaidOut.length ? aboveLaidOut[aboveLaidOut.length - 1].localHeight / 2 : 0));
    for (let i = aboveLaidOut.length - 1; i >= 0; i--) {
      const { branch, localHeight } = aboveLaidOut[i];
      if (i < aboveLaidOut.length - 1) {
        spineCursorUp -= aboveLaidOut[i + 1].localHeight / 2 + TIMELINE_ROW_GAP + localHeight / 2;
      }
      const offset = spineCursorUp;
      (function shift(n) {
        n._y += offset;
        if (!n.collapsed) (n.children || []).forEach(shift);
      })(branch);
    }

    return computeBBox(root);
  }

  /* ---------------- text measuring / wrapping ---------------- */

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");

  function measureW(text) { return measureCtx.measureText(text).width; }

  function breakLongWord(word, maxW) {
    const parts = [];
    let cur = "";
    for (const ch of word) {
      const t = cur + ch;
      if (cur && measureW(t) > maxW) { parts.push(cur); cur = ch; }
      else cur = t;
    }
    if (cur) parts.push(cur);
    return parts;
  }

  function wrapParagraph(para, maxW) {
    if (!para) return [""];
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines = [];
    let cur = "";
    for (const word of words) {
      if (measureW(word) > maxW) {
        if (cur) { lines.push(cur); cur = ""; }
        const chunks = breakLongWord(word, maxW);
        for (let i = 0; i < chunks.length - 1; i++) lines.push(chunks[i]);
        cur = chunks[chunks.length - 1] || "";
        continue;
      }
      const test = cur ? cur + " " + word : word;
      if (measureW(test) <= maxW) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  function wrapText(text, maxW) {
    const paras = (text || "").split(/\n/);
    let lines = [];
    for (const p of paras) lines = lines.concat(wrapParagraph(p, maxW));
    return lines.length ? lines : [""];
  }

  // Computes and caches this node's rendered box size (node._w / node._h)
  // based on its current text, so long text wraps and grows the node
  // instead of being clipped or overflowing it.

  // Estimates the pixel size of a table node's grid (see nodeIsTable) by
  // wrapping each cell's text the same way computeNodeBox wraps a normal
  // node's label, then taking the widest cell in each column / tallest
  // cell in each row — the same shape of estimate as the text path below,
  // just per-cell instead of per-node. The per-column/row pixel widths it
  // returns are stashed on the node (see computeNodeBox) so renderNode can
  // build a real <table> whose <col>/<tr> sizes match this estimate
  // exactly, instead of the two drifting apart.
  const TABLE_CELL_PAD_X = 16;
  const TABLE_CELL_PAD_Y = 10;
  const TABLE_CELL_MIN_W = 44;
  const TABLE_CELL_MAX_W = 140;
  const TABLE_CELL_LINE_H = 16;
  const TABLE_CELL_MIN_H = 26;
  // Fixed strip reserved under every cell's text for its photo/note/link/
  // task icons + the "+" add button (see buildCellIconStrip) — always
  // reserved, even on an empty cell, so a cell's height doesn't jump
  // around as attachments are added/removed.
  // v400: cell attachment icons are overlaid compactly in the bottom-right
  // corner instead of consuming a permanent row under every cell.
  const TABLE_CELL_ICON_STRIP_H = 0;
  function computeTableBox(node) {
    measureCtx.font = `400 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Helvetica, Arial, sans-serif`;
    const cells = node.table.cells;
    const rows = cells.length;
    const cols = Math.max(1, ...cells.map(r => r.length));

    // v399: table cells are intentionally 2× wider. Make the layout engine
    // own that width instead of doubling only the rendered <col>, otherwise
    // the visual table becomes wider than node._w and spills through the
    // node border.
    const widthScale = 2;
    const colWidths = new Array(cols).fill(TABLE_CELL_MIN_W * widthScale);
    const rowHeights = new Array(rows).fill(TABLE_CELL_MIN_H + TABLE_CELL_ICON_STRIP_H);
    if (node.table.calendar) {
      if (rows > 0) rowHeights[0] = Math.max(rowHeights[0], 38);
      if (rows > 1) rowHeights[1] = Math.max(rowHeights[1], 22);
      for (let r = 2; r < rows; r++) rowHeights[r] = Math.max(rowHeights[r], 40);
    }
    const maxTextW = TABLE_CELL_MAX_W - TABLE_CELL_PAD_X;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellText = (cells[r] && cells[r][c]) || "";
        const lines = wrapText(cellText, maxTextW);
        const widest = Math.max(0, ...lines.map(l => measureW(l)));
        const baseW = clamp(Math.ceil(widest) + TABLE_CELL_PAD_X, TABLE_CELL_MIN_W, TABLE_CELL_MAX_W);
        const w = baseW * widthScale;
        const h = Math.max(TABLE_CELL_MIN_H, lines.length * TABLE_CELL_LINE_H + TABLE_CELL_PAD_Y) + TABLE_CELL_ICON_STRIP_H;
        colWidths[c] = Math.max(colWidths[c], w);
        rowHeights[r] = Math.max(rowHeights[r], h);
      }
    }

    if (node.table.calendar) {
      // Calendar uses border-collapse:separate, 4px border-spacing and 8px
      // table padding. Include those real CSS dimensions in node._w/_h.
      const SPACING = 4;
      const TABLE_PAD = 8;
      const tableW = colWidths.reduce((a, b) => a + b, 0) + (cols + 1) * SPACING + TABLE_PAD * 2;
      const tableH = rowHeights.reduce((a, b) => a + b, 0) + (rows + 1) * SPACING + TABLE_PAD * 2;
      return { tableW, tableH, colWidths, rowHeights };
    }

    const BORDER = 1;
    const tableW = colWidths.reduce((a, b) => a + b, 0) + (cols + 1) * BORDER;
    const tableH = rowHeights.reduce((a, b) => a + b, 0) + (rows + 1) * BORDER;
    return { tableW, tableH, colWidths, rowHeights };
  }

  function computeNodeBox(node) {
    const depth = node._depth || 0;
    const padX = depth === 0 ? 56 : 32;
    const vPad = depth === 0 ? 28 : 16;
    const baseH = depth === 0 ? ROOT_H : NODE_H;
    const minW = depth === 0 ? 130 : 56;

    let w, h, lines;
    if (nodeIsTable(node)) {
      const tbox = computeTableBox(node);
      node._tableColWidths = tbox.colWidths;
      node._tableRowHeights = tbox.rowHeights;
      // +6 mirrors the SAFETY buffer the text path below uses — a small
      // cushion so the outer box's own 2px border always fully encloses
      // the <table> built to these exact column/row pixel widths, instead
      // of clipping it by a couple of stray pixels.
      w = Math.max(tbox.tableW + padX + 6, minW);
      h = Math.max(tbox.tableH + vPad + 6, baseH);
      lines = [];
    } else {
    const baseFontWeight = depth === 0 ? 800 : depth === 1 ? 600 : depth === 2 ? 500 : 400;
    const fontWeight = node.bold ? (depth === 0 ? 900 : 800) : baseFontWeight;
    const fontSize = depth === 0 ? 21 : depth === 3 ? 12.5 : 13.5;
    measureCtx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Helvetica, Arial, sans-serif`;
    const rawText = node.text || "(untitled)";
    const text = node.allCaps ? rawText.toUpperCase() : rawText;
    // Small safety buffer so a slight mismatch between canvas-measured width
    // and actual rendered width never causes the CSS wrap to break a word
    // mid-letter (e.g. "Risk" -> "Ris"/"k").
    const SAFETY = 6;
    const maxBoxW = depth === 0 ? 340 : 230;
    const maxTextW = maxBoxW - padX;

    const oneLineW = Math.ceil(measureW(text)) + padX + SAFETY;
    if (oneLineW <= maxBoxW && !/\n/.test(text)) {
      w = clamp(oneLineW, minW, maxBoxW);
      lines = [text];
    } else {
      lines = wrapText(text, maxTextW);
      const widest = Math.max(...lines.map(l => measureW(l)));
      w = clamp(Math.ceil(widest) + padX + SAFETY, minW, maxBoxW);
    }

    const lineHeight = depth === 0 ? 24 : depth === 3 ? 16 : 17;
    h = Math.max(baseH, Math.ceil(lines.length * lineHeight + vPad));
    }

    // Reserve room inside the box for the combined note/link/photo strip,
    // which renders in normal flow below the text (see renderNode) instead
    // of floating outside the frame or overlapping the label. Matches the
    // sizing renderNode/CSS actually use so the box always fully encloses it.
    const nodeImages = getNodeImages(node);
    // The time-played total (see renderNode/openTimerModal) is now a
    // same-size trailing cell of this same strip rather than a wider
    // pill, so it counts toward itemCount just like a note/link icon.
    // Notes and links each collapse to a single stand-in cell past
    // STRIP_OVERFLOW_CAP too (see stripBucketCount/renderNode), so the
    // box reserves exactly as much room as actually gets drawn either way.
    const stripIconCountForBox =
      stripBucketCount(getNodeNotes(node).length)
      + stripBucketCount(getNodeUrls(node).length)
      + nodeTaskNoteMarkerCount(node)
      + nodeSubtaskBrainstormMarkerCount(node)
      + (nodeAffirmationWins(node) ? 1 : 0)
      + (getNodeTimePlayed(node) ? 1 : 0)
      + (brainstormPoints(node) > 0 ? 1 : 0);
    let stripW = 0, stripH = 0;
    if (stripIconCountForBox || nodeImages.length) {
      // Past STRIP_OVERFLOW_CAP photos, collapse down to a single cover
      // thumbnail with a count badge (see renderNode) instead of a wall
      // of thumbnails, so a node with dozens of photos still reads as
      // one compact cell.
      const overflow = nodeImages.length > STRIP_OVERFLOW_CAP;
      const shownCount = overflow ? 1 : nodeImages.length;
      const itemCount = stripIconCountForBox + shownCount;
      const large = itemCount <= 10;
      const thumb = large ? 18 : 13.5;
      const gap = 3;
      const cols = Math.min(itemCount, 5);
      const rows = Math.ceil(itemCount / 5);
      stripW = cols * thumb + (cols - 1) * gap;
      stripH = 5 /* margin-top */ + rows * thumb + (rows - 1) * gap;
    }

    // Reserve room for the task-progress bar + percentage label, which
    // render in normal flow below the text/photos (see renderNode) so the
    // box always fully encloses them instead of floating over the label.
    // A minimum width is enforced too, so the bar+label row always has
    // enough room to sit comfortably even on a short one-word node.
    const taskProgForBox = nodeTaskProgress(node);
    let barH = 0, barMinW = 0;
    if (taskProgForBox.total) {
      barH = 6 /* margin-top */ + 8 /* bar height */;
      barMinW = 56 /* track */ + 6 /* gap */ + 30 /* "100%" label */ + padX;
    }

    // Reserve room for the root node's live clock block (current time,
    // UTC/US/UK world clocks, weekday+date, lunar date — see
    // renderNode). Fixed dimensions since, unlike the text above, its
    // content never depends on anything the person typed.
    const ROOT_CLOCK_W = 300;
    const ROOT_CLOCK_H = 116;
    const clockW = depth === 0 && !isClockHidden() ? ROOT_CLOCK_W + padX : 0;
    const clockH = depth === 0 && !isClockHidden() ? ROOT_CLOCK_H : 0;

    node._w = Math.max(w, stripW + padX, barMinW, clockW);
    node._h = h + stripH + barH + clockH;
    node._lines = lines;
    return { w: node._w, h: node._h };
  }

  // A node's box is anchored on its `_x` layout position rather than
  // centered on it: nodes fanning right keep their LEFT edge fixed at
  // `_x` and grow rightward as their text does, nodes fanning left keep
  // their RIGHT edge fixed and grow leftward, and the root (which has no
  // single direction) stays centered as before. This is what makes every
  // sibling at a given depth/side line up on the same vertical edge no
  // matter how long each one's own text is, since `_x` (before any manual
  // drag offset) is identical across siblings by default.
  function nodeLeftX(node) {
    const base = node._x + (node.ox || 0);
    // Depth 0 (the root) and any node whose automatic `_x` is exactly 0
    // — e.g. a Timeline branch's own root, which sits centered on the
    // vertical spine rather than fanning left/right — stay centered like
    // before. Everything actually fanning out gets the anchored treatment.
    if (node._depth === 0 || node._x === 0) return base - node._w / 2;
    return node._x >= 0 ? base : base - node._w;
  }
  function nodeRightX(node) { return nodeLeftX(node) + node._w; }
  function nodeCenterX(node) { return nodeLeftX(node) + node._w / 2; }

  /* ---------------- branch color resolution ---------------- */

  function branchColorFor(root, node) {
    // find the top-level ancestor (depth 1) that node descends from
    if (node === root) return null;
    let color = null;
    (function find(n, top) {
      for (const c of n.children || []) {
        const t = top || c;
        if (c === node) { color = t.color; return; }
        find(c, t);
      }
    })(root, null);
    return color;
  }

  function assignBranchColors(root) {
    const children = root.children || [];
    // Colors are cached on each branch (c.color) so they stay stable across
    // re-renders/reorders. That caching is exactly why a naive `i %
    // PALETTE.length` goes wrong: once a branch is deleted or the list is
    // reordered, a *new* branch can land on the same index another branch
    // used earlier — and that other branch's cached color never moved, so
    // you'd get a repeat before all 10 palette colors were even used.
    // Instead, only fill in colors for branches that don't have one yet,
    // and actively skip whatever colors are already in use by siblings —
    // so every branch gets a distinct color until the palette itself runs
    // out (only then does it start repeating).
    const used = new Set(children.filter(c => c.color).map(c => c.color));
    let cursor = 0;
    children.forEach((c) => {
      if (c.color) return;
      let color = null;
      for (let k = 0; k < PALETTE.length; k++) {
        const candidate = PALETTE[(cursor + k) % PALETTE.length];
        if (!used.has(candidate)) { color = candidate; cursor = (cursor + k + 1) % PALETTE.length; break; }
      }
      if (!color) color = PALETTE[cursor % PALETTE.length]; // palette exhausted; a repeat is unavoidable
      c.color = color;
      used.add(color);
    });
  }


    return Object.freeze({
      layout,
      computeNodeBox,
      nodeLeftX,
      nodeRightX,
      nodeCenterX,
      branchColorFor,
      assignBranchColors
    });
  }

  g.BranchlineLayout = Object.freeze({ create });
})(window);
