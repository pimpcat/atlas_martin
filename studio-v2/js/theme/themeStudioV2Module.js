/**
 * Theme Studio — módulo nativo en shell v2 (Fase D.7).
 */
import {
  applyCatalogTokens,
  loadThemeCatalog,
  readStoredTheme,
  resetThemeCatalogCache,
} from "../../../js/theme.js";
import { isMountStale, staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "theme";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Tema",
  subtitle: "Identidad de color (temas claro / oscuro)",
  navActiveId: "theme",
};

/** @type {typeof import("../../../js/themeStudioApp.js") | null} */
let _themeApp = null;

/**
 * Quita max-height:70vh legacy y deja el scroll al CSS v2 (#themeStudioEditor).
 * @param {HTMLElement} wrap
 */
function installThemeViewport(wrap) {
  const editor = wrap.querySelector("#themeStudioEditor");
  if (editor instanceof HTMLElement) {
    editor.removeAttribute("style");
  }
}

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountThemeStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  const res = await fetch("./theme-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel de Tema");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const row = doc.querySelector("#themeStudioDashboard .row.g-3");
  if (!row) throw new Error("Estructura de Theme Studio no encontrada");

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className =
    "gs2-studio-module gs2-studio-theme theme-studio-page visor-studio-page";
  const bar = doc.querySelector("#themeStudioDashboard .theme-studio-sections-bar");
  if (bar) wrap.appendChild(document.importNode(bar, true));
  wrap.appendChild(document.importNode(row, true));
  mountEl.appendChild(wrap);

  installThemeViewport(wrap);

  const mod = await loadStudioAppModule(
    "../../../js/themeStudioApp.js",
    [
      "bindThemeStudioUi",
      "enterThemeStudioDashboard",
      "updateThemePreview",
      "bumpThemeStudioSession",
      "resetThemeStudioUiRoot",
    ],
    import.meta,
  );
  staleCheck(mountToken);
  _themeApp = mod;
  mod.bindThemeStudioUi(wrap);
  mod.updateThemePreview();
  try {
    await mod.enterThemeStudioDashboard();
  } finally {
    if (!mountToken || !isMountStale(mountToken)) {
      mod.updateThemePreview();
    }
  }
  staleCheck(mountToken);
}

export function teardownThemeStudioV2() {
  _themeApp?.bumpThemeStudioSession?.();
  _themeApp?.resetThemeStudioUiRoot?.();
  _themeApp = null;
  resetThemeCatalogCache();
  const stored = readStoredTheme();
  document.documentElement.setAttribute("data-theme", stored);
  void Promise.resolve().then(async () => {
    const view = (new URLSearchParams(window.location.search).get("view") || "overview")
      .trim()
      .toLowerCase();
    if (view === "theme") return;
    await loadThemeCatalog(true);
    applyCatalogTokens(stored);
    window.dispatchEvent(
      new CustomEvent("atlasgro-themechange", { detail: { theme: stored } }),
    );
  });
}

