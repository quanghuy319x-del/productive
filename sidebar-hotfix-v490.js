/* v490: sidebar is independent from app.js startup. */
(() => {
  const KEY = "branchline_sidebar_hidden";
  function init() {
    const app = document.getElementById("app");
    const button = document.getElementById("btn-toggle-sidebar");
    const sidebar = document.getElementById("sidebar");
    if (!app || !button || !sidebar || button.dataset.v490Sidebar === "1") return;
    button.dataset.v490Sidebar = "1";
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    const touch = matchMedia("(max-width: 640px), (pointer: coarse)").matches;
    if (saved === "1" || (saved === null && touch)) app.classList.add("sidebar-hidden");
    if (saved === "0") app.classList.remove("sidebar-hidden");
    const setHidden = (hidden) => {
      app.classList.toggle("sidebar-hidden", hidden);
      try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch (_) {}
    };
    button.addEventListener("click", e => {
      e.preventDefault(); e.stopImmediatePropagation();
      setHidden(!app.classList.contains("sidebar-hidden"));
    }, true);
    if (touch) document.addEventListener("pointerdown", e => {
      if (app.classList.contains("sidebar-hidden")) return;
      if (sidebar.contains(e.target) || button.contains(e.target)) return;
      setHidden(true);
    }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();
