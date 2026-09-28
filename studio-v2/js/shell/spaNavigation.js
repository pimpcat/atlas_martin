/**
 * Navegación SPA dentro del shell v2 (sin recarga ni re-validación JWT).
 * @param {(viewId: string) => void|Promise<void>} onViewChange
 */
export function initShellSpaNavigation(onViewChange) {
  const isV2StudioLink = (anchor) => {
    if (!anchor || anchor.target === "_blank") return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return /grosig-studio-v2\.html$/i.test(url.pathname);
    } catch {
      return false;
    }
  };

  document.addEventListener("click", (ev) => {
    const anchor = ev.target.closest("a[href]");
    if (!isV2StudioLink(anchor)) return;
    ev.preventDefault();
    const url = new URL(anchor.href, window.location.href);
    const view = (url.searchParams.get("view") || "overview").trim().toLowerCase();
    const next = new URL(window.location.href);
    next.searchParams.set("view", view);
    const ui = url.searchParams.get("ui") || next.searchParams.get("ui");
    if (ui) next.searchParams.set("ui", ui);
    history.pushState({ view }, "", next);
    void onViewChange(view);
  });

  window.addEventListener("popstate", () => {
    const view = new URLSearchParams(window.location.search).get("view") || "overview";
    void onViewChange(view.trim().toLowerCase());
  });
}
