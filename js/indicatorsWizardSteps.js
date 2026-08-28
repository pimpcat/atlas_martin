/**
 * Infra ligera de wizard numerado (Indicators Studio) — Fase 4.2 / H5.
 * Pasos/textos canónicos aquí; validación de dominio y side-effects van por callbacks.
 */

/** @typedef {{ id: number, title: string, hint: string }} NumberedWizardStep */

/** @type {NumberedWizardStep[]} */
export const INDICATORS_WIZARD_STEPS = [
  { id: 1, title: "Identidad", hint: "Nombre en el menú, grupo y visibilidad." },
  {
    id: 2,
    title: "Indicador",
    hint: "Elija el indicador CORE (métricas). No se editan aquí: use el espacio Indicadores.",
  },
  { id: 3, title: "Datos", hint: "Perfil, tabla y constructor de campos (puede sincronizarse desde métricas)." },
  { id: 4, title: "Presentación", hint: "Tipo de gráfica, ranking y colores." },
  { id: 5, title: "Metadatos", hint: "Fuente, notas y fechas (panel Metadatos del Atlas)." },
  {
    id: 6,
    title: "Revisar",
    hint: "Publicar la vista en el menú (enlaza un indicador CORE ya guardado).",
  },
];

/**
 * @param {number} n
 * @param {NumberedWizardStep[]} steps
 */
export function clampNumberedStep(n, steps) {
  const max = steps?.length || 1;
  return Math.max(1, Math.min(max, Number(n) || 1));
}

/**
 * @param {{
 *   steps?: NumberedWizardStep[],
 *   initialStep?: number,
 *   stepAttr?: string,
 * }} [opts]
 */
export function createNumberedWizardController(opts = {}) {
  const steps = opts.steps || INDICATORS_WIZARD_STEPS;
  const stepAttr = opts.stepAttr || "data-wizard-step";
  let current = clampNumberedStep(opts.initialStep ?? 1, steps);

  function getStep() {
    return current;
  }

  function getStepDef(id = current) {
    return steps.find((s) => s.id === id) || null;
  }

  function syncPanels(root = document) {
    root.querySelectorAll(`[${stepAttr}]`).forEach((panel) => {
      const id = Number(panel.getAttribute(stepAttr));
      panel.classList.toggle("d-none", id !== current);
    });
  }

  /**
   * @param {number} step
   * @param {{ onEnter?: (step: number) => void }} [hooks]
   */
  function showStep(step, hooks = {}) {
    current = clampNumberedStep(step, steps);
    syncPanels();
    if (typeof hooks.onEnter === "function") hooks.onEnter(current);
    return current;
  }

  /**
   * Navega a `target`; si avanza, valida cada paso intermedio (inclusive actual).
   * @param {number} target
   * @param {{
   *   validateStep?: (step: number) => string,
   *   onBlocked?: (err: string, step: number) => void,
   *   onClearError?: () => void,
   *   onEnter?: (step: number) => void,
   * }} [hooks]
   */
  function tryGoTo(target, hooks = {}) {
    const t = clampNumberedStep(target, steps);
    if (t > current) {
      for (let i = current; i < t; i++) {
        const err =
          typeof hooks.validateStep === "function" ? hooks.validateStep(i) : "";
        if (err) {
          if (typeof hooks.onBlocked === "function") hooks.onBlocked(err, i);
          showStep(i, { onEnter: hooks.onEnter });
          return { ok: false, error: err, step: i };
        }
      }
    }
    if (typeof hooks.onClearError === "function") hooks.onClearError();
    showStep(t, { onEnter: hooks.onEnter });
    return { ok: true, step: current };
  }

  /**
   * Markup de botones idéntico al chrome original de Indicators Studio.
   * @param {{
   *   host: HTMLElement | null,
   *   hintEl?: HTMLElement | null,
   *   backBtn?: HTMLButtonElement | null,
   *   nextBtn?: HTMLButtonElement | null,
   *   onGoto?: (target: number) => void,
   * }} ui
   */
  function renderChrome(ui) {
    const host = ui.host;
    if (!host) return;
    host.innerHTML = steps
      .map((s) => {
        const active = s.id === current;
        const done = s.id < current;
        const cls = active
          ? "btn btn-sm btn-primary"
          : done
            ? "btn btn-sm btn-outline-success"
            : "btn btn-sm btn-outline-secondary";
        return `<button type="button" class="${cls}" data-wizard-goto="${s.id}">${s.id}. ${s.title}</button>`;
      })
      .join("");
    host.querySelectorAll("[data-wizard-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = Number(btn.getAttribute("data-wizard-goto"));
        if (!Number.isFinite(target)) return;
        if (typeof ui.onGoto === "function") ui.onGoto(target);
      });
    });
    if (ui.hintEl) {
      const def = getStepDef();
      ui.hintEl.textContent = def?.hint || "";
    }
    if (ui.backBtn) ui.backBtn.classList.toggle("d-none", current <= 1);
    if (ui.nextBtn) {
      ui.nextBtn.classList.toggle("d-none", current >= steps.length);
    }
  }

  return {
    steps,
    getStep,
    getStepDef,
    showStep,
    tryGoTo,
    renderChrome,
    syncPanels,
    isLast: () => current >= steps.length,
  };
}
