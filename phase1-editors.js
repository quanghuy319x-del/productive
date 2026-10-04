/* Branchline Phase 1 editor domain helpers — v325
   Brainstorm + Note + DRC. Pure helpers only: no storage/UI ownership.
   app.js keeps its existing public/global behavior and delegates here. */
(function (g) {
  "use strict";
  const api = {
    brainstorm: {
      get(host) { return host && host.brainstorm ? host.brainstorm : null; },
      text(host) { const b = api.brainstorm.get(host); return (b && b.text) || ""; },
      lineCount(host) { return api.brainstorm.text(host).split("\n").filter(l => l.trim().length > 0).length; },
      points(host) { return api.brainstorm.lineCount(host); },
      hasContent(host) { const b = api.brainstorm.get(host); return !!(b && ((b.text || "").trim() || (b.html || "").trim())); },
      isPrefix(text) { return /^brainstorm(?:\s|[:\-–—]|$)/i.test((text || "").trim()); }
    },
    note: {
      linesFromHtml(html) {
        if (!html) return [];
        const divChunks = html.match(/<div[^>]*>[\s\S]*?<\/div>/gi);
        const chunks = divChunks && divChunks.length ? divChunks : [html];
        return chunks.map(chunk => chunk
          .replace(/^<div[^>]*>/i, "").replace(/<\/div>$/i, "")
          .replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/gi, " ").trim());
      },
      isPlanText(text) { return (text || "").trim().toLowerCase() === "plan"; }
    },
    drc: {
      isNote(note) {
        if (!note) return false;
        if (note.kind === "drc") return true;
        const title = (note.title || "").trim();
        return /(?:^|\\s)DRC$/i.test(title);
      },
      isFilled(note, templateLines) {
        const labels = Array.isArray(templateLines) ? templateLines : [];
        const lines = api.note.linesFromHtml(note && note.html)
          .filter(l => !labels.some(lbl => String(lbl).toLowerCase() === l.toLowerCase()));
        const typedLines = lines.filter(l => l.length > 0);
        return typedLines.length > 1 || typedLines.join("").length >= 10;
      }
    }
  };
  // Stable namespace for later phases; do not rename without compatibility shim.
  g.BranchlineEditors = Object.freeze(api);
})(window);
