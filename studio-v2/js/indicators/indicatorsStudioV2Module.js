/**
 * Indicators Studio — módulo nativo en shell v2 (Fase D.3).
 * Reutiliza el panel legacy vía fetch + lógica de indicatorsStudioApp.js.
 */
import { staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "indicators";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Indicadores",
  subtitle: "Contratos CORE y publicaciones del menú Atlas",
  navActiveId: "indicators",
};

/**
 * Envuelve los pasos del wizard (p. ej. Presentación) en un contenedor con scroll interno.
 * @param {HTMLElement} wrap
 */
function installIndicatorsViewport(wrap) {
  if (wrap.dataset.gs2Viewport === "1") return;
  wrap.dataset.gs2Viewport = "1";

  const form = wrap.querySelector("#indStudioForm");
  if (form && !form.querySelector(".gs2-ind-wizard-scroll")) {
    const steps = [...form.querySelectorAll(":scope > [data-wizard-step]")];
    if (steps.length) {
      const scroll = document.createElement("div");
      scroll.className = "gs2-ind-wizard-scroll";
      const anchor = form.querySelector("#indStudioStepHint") || form.querySelector("#indStudioSteps");
      anchor?.insertAdjacentElement("afterend", scroll);
      steps.forEach((node) => scroll.appendChild(node));
    }
  }

  const coreForm = wrap.querySelector("#indStudioCoreForm");
  if (coreForm && !coreForm.querySelector(".gs2-ind-core-scroll")) {
    const scroll = document.createElement("div");
    scroll.className = "gs2-ind-core-scroll";
    const footer = coreForm.querySelector("#indStudioCoreSaveBtn")?.closest(".d-flex");
    const movable = [...coreForm.children].filter(
      (node) =>
        node !== footer &&
        node.id !== "indStudioCoreFormError" &&
        node.id !== "indStudioCoreFormOk",
    );
    if (movable.length && footer) {
      footer.before(scroll);
      movable.forEach((node) => scroll.appendChild(node));
    }
  }
}

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountIndicatorsStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  const res = await fetch("./indicators-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel de indicadores");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const row = doc.querySelector("#indStudioDashboard .row.g-3");
  if (!row) throw new Error("Estructura de Indicators Studio no encontrada");

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className = "gs2-studio-module gs2-studio-indicators indicators-studio-page";
  wrap.appendChild(document.importNode(row, true));
  mountEl.appendChild(wrap);

  installIndicatorsViewport(wrap);

  const mod = await loadStudioAppModule(
    "../../../js/indicatorsStudioApp.js",
    ["bindIndicatorsStudioUi", "enterIndicatorsStudioDashboard"],
    import.meta,
  );
  staleCheck(mountToken);
  mod.bindIndicatorsStudioUi();
  await mod.enterIndicatorsStudioDashboard();
  staleCheck(mountToken);
}

export function teardownIndicatorsStudioV2() {
  /* estado global en indicatorsStudioApp.js — se reutiliza entre visitas */
}
