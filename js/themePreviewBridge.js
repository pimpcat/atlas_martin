/**
 * Portal dentro del Theme Studio (index.html?themePreview=1): recibe el borrador por postMessage.
 * Solo acepta mensajes del mismo origen y de la ventana padre; no guarda nada.
 */
import { applyPreviewCatalog } from "./theme.js";
import { applyPortalBranding } from "./portalBranding.js";

export function isThemePreviewMode() {
  return new URLSearchParams(window.location.search).has("themePreview") && window.parent !== window;
}

export function initThemePreviewBridge() {
  if (!isThemePreviewMode()) return;
  window.addEventListener("message", (ev) => {
    if (ev.origin !== window.location.origin || ev.source !== window.parent) return;
    const msg = ev.data;
    if (!msg || msg.type !== "grosig-theme-preview") return;
    if (msg.catalog?.themes) {
      applyPreviewCatalog(msg.catalog, msg.theme === "oscuro" ? "oscuro" : "claro");
    }
    if (msg.branding && typeof msg.branding === "object") applyPortalBranding(msg.branding);
  });
  window.parent.postMessage({ type: "grosig-theme-preview-ready" }, window.location.origin);
}
