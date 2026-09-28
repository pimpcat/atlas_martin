/**
 * Explorer Studio — módulo nativo en shell v2 (Fase D.5).
 */
import { isMountStale, staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "explorer";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Explorador municipal",
  subtitle: "Estilos de líneas estatales, municipales y selección",
  navActiveId: "explorer",
};

/** @type {typeof import("../../../js/explorerStudioApp.js") | null} */
let _explorerApp = null;

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountExplorerStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  const res = await fetch("./explorer-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel del Explorador");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const row = doc.querySelector("#explorerStudioDashboard .row.g-3");
  if (!row) throw new Error("Estructura de Explorer Studio no encontrada");

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className =
    "gs2-studio-module gs2-studio-explorer indicators-studio-page visor-studio-page";
  wrap.appendChild(document.importNode(row, true));
  mountEl.appendChild(wrap);

  const mod = await loadStudioAppModule(
    "../../../js/explorerStudioApp.js",
    ["bindExplorerStudioUi", "enterExplorerStudioDashboard", "updateExplorerPreview"],
    import.meta,
  );
  staleCheck(mountToken);
  _explorerApp = mod;
  mod.bindExplorerStudioUi(wrap);
  mod.updateExplorerPreview();
  try {
    await mod.enterExplorerStudioDashboard();
  } finally {
    if (!mountToken || !isMountStale(mountToken)) {
      mod.updateExplorerPreview();
    }
  }
  staleCheck(mountToken);
}

export function teardownExplorerStudioV2() {
  _explorerApp?.resetExplorerStudioUiRoot?.();
  _explorerApp = null;
}
