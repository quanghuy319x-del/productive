/* v489 emergency startup isolation: sidebar must work even if app.js aborts. */
(() => {
  function initSidebarHotfix() {
    const app = document.getElementById("app");
    const button = document.getElementById("btn-toggle-sidebar");
    if (!app || !button || button.dataset.v489SidebarHotfix === "1") return;
    button.dataset.v489SidebarHotfix = "1";
    if (window.matchMedia("(max-width: 640px), (pointer: coarse)").matches) {
      app.classList.add("sidebar-hidden");
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      app.classList.toggle("sidebar-hidden");
    }, true);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSidebarHotfix, { once: true });
  } else {
    initSidebarHotfix();
  }
})();