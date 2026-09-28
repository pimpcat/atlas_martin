/**
 * Backup Studio — módulo nativo en shell v2 (Fase D.9).
 */
import { staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "backup";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Studio Respaldo",
  subtitle: "Dumps PostgreSQL, configuración y MBTiles opcional (ZIP local)",
  navActiveId: "backup",
};

/** @type {typeof import("../../../js/backupStudioApp.js") | null} */
let _backupApp = null;

/**
 * @param {HTMLElement} wrap
 */
function installBackupViewport(wrap) {
  if (wrap.dataset.gs2Viewport === "1") return;
  wrap.dataset.gs2Viewport = "1";

  wrap.querySelector("#bkList")?.removeAttribute("style");
  wrap.querySelector(".col-lg-5")?.classList.add("gs2-scroll");
  wrap.querySelector("#bkList")?.classList.add("gs2-scroll");
}

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountBackupStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  const res = await fetch("./backup-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel de Respaldo");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const row = doc.querySelector("#bkDashboard .row.g-3");
  if (!row) throw new Error("Estructura de Backup Studio no encontrada");

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className =
    "gs2-studio-module gs2-studio-backup visor-studio-page";
  wrap.appendChild(document.importNode(row, true));
  mountEl.appendChild(wrap);

  installBackupViewport(wrap);

  const mod = await loadStudioAppModule(
    "../../../js/backupStudioApp.js",
    [
      "bindBackupStudioUi",
      "enterBackupStudioDashboard",
      "stopBackupStudioPolling",
    ],
    import.meta,
  );
  staleCheck(mountToken);
  _backupApp = mod;
  mod.bindBackupStudioUi();
  await mod.enterBackupStudioDashboard();
  staleCheck(mountToken);
}

export function teardownBackupStudioV2() {
  _backupApp?.stopBackupStudioPolling?.();
  _backupApp = null;
}
