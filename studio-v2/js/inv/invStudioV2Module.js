/**
 * INV Studio — módulo nativo en shell v2 (Fase D.4).
 * Reutiliza el panel legacy vía fetch + lógica de invStudioApp.js.
 */
import { staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "inv";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Inventario Nacional de Viviendas",
  subtitle: "Grupos, campos c_inv y simbología del panel INV",
  navActiveId: "inv",
};

/**
 * Layout FHD: listas y editor con scroll interno (como Indicadores).
 * @param {HTMLElement} wrap
 */
function installInvViewport(wrap) {
  if (wrap.dataset.gs2Viewport === "1") return;
  wrap.dataset.gs2Viewport = "1";

  const col8 = wrap.querySelector(".col-lg-8");
  if (col8 && !col8.querySelector(".gs2-inv-editor-scroll")) {
    const cards = [...col8.querySelectorAll(":scope > .card")];
    if (cards.length >= 2) {
      const scroll = document.createElement("div");
      scroll.className = "gs2-inv-editor-scroll";
      cards[0].insertAdjacentElement("afterend", scroll);
      cards.slice(1).forEach((card) => scroll.appendChild(card));
    }
  }
}

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountInvStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  const res = await fetch("./inv-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel INV");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const row = doc.querySelector("#invStudioDashboard .row.g-3");
  if (!row) throw new Error("Estructura de INV Studio no encontrada");

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className =
    "gs2-studio-module gs2-studio-inv indicators-studio-page visor-studio-page";
  wrap.appendChild(document.importNode(row, true));
  mountEl.appendChild(wrap);

  installInvViewport(wrap);

  const mod = await loadStudioAppModule(
    "../../../js/invStudioApp.js",
    ["bindInvStudioUi", "enterInvStudioDashboard"],
    import.meta,
  );
  staleCheck(mountToken);
  mod.bindInvStudioUi();
  await mod.enterInvStudioDashboard();
  staleCheck(mountToken);
}

export function teardownInvStudioV2() {
  /* estado global en invStudioApp.js — se reutiliza entre visitas */
}
