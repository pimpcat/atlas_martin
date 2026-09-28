/**
 * Data Refresh Studio — módulo nativo en shell v2 (Fase D.8).
 */
import { staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "data-refresh";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Actualización de datos",
  subtitle: "Capas espaciales, indicadores tabulares y contexto municipal",
  navActiveId: "data-refresh",
};

/**
 * Overlay de progreso (está fuera de #drDashboard en el HTML legacy).
 * @param {Document} doc
 */
function ensureBusyOverlay(doc) {
  if (document.getElementById("drBusyOverlay")) return;
  const overlay = doc.getElementById("drBusyOverlay");
  if (overlay) {
    document.body.appendChild(document.importNode(overlay, true));
  }
}

/**
 * Layout FHD: historial con scroll interno; versiones visibles abajo.
 * @param {HTMLElement} wrap
 */
function installDataRefreshViewport(wrap) {
  if (wrap.dataset.gs2Viewport === "1") return;
  wrap.dataset.gs2Viewport = "1";

  wrap.querySelector("#drHistoryTable")?.closest(".table-responsive")?.removeAttribute("style");
  wrap.querySelector("#drVersionsList")?.removeAttribute("style");
  wrap.querySelector("#drJobReport")?.removeAttribute("style");

  wrap.querySelector(".dr-refresh-lead")?.classList.add("gs2-scroll");
  wrap.querySelector(".col-lg-5 .table-responsive")?.classList.add("gs2-scroll");
  wrap.querySelector("#drVersionsList")?.classList.add("gs2-scroll");
  wrap.querySelector("#drPreviewCard > .card-body")?.classList.add("gs2-scroll");
  wrap.querySelector("#drContextoPanel > .card-body")?.classList.add("gs2-scroll");
}

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountDataRefreshStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  const res = await fetch("./data-refresh-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel de Actualización de datos");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const dashboard = doc.querySelector("#drDashboard");
  if (!dashboard) throw new Error("Estructura de Data Refresh Studio no encontrada");

  ensureBusyOverlay(doc);

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className =
    "gs2-studio-module gs2-studio-data-refresh indicators-studio-page visor-studio-page";

  const children = [...dashboard.children];
  for (let i = 2; i < children.length; i += 1) {
    wrap.appendChild(document.importNode(children[i], true));
  }
  mountEl.appendChild(wrap);

  installDataRefreshViewport(wrap);

  const mod = await loadStudioAppModule(
    "../../../js/dataRefreshStudioApp.js",
    ["bindDataRefreshStudioUi", "enterDataRefreshStudioDashboard"],
    import.meta,
  );
  staleCheck(mountToken);
  mod.bindDataRefreshStudioUi();
  await mod.enterDataRefreshStudioDashboard();
  staleCheck(mountToken);
}

export function teardownDataRefreshStudioV2() {
  setBusyUiSafe(false);
}

/** @param {boolean} on */
function setBusyUiSafe(on) {
  const overlay = document.getElementById("drBusyOverlay");
  if (overlay instanceof HTMLElement) overlay.hidden = !on;
  document.body.classList.toggle("dr-is-busy", !!on);
}

