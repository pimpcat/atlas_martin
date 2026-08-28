/**
 * Indicators Studio — wizard admin del catálogo de indicadores (Fase 11).
 * Reutiliza la sesión JWT de Visor Studio (studioShell).
 */
import { adminFetch } from "./visorAdminAuth.js";
import { resetIndicatorsCatalogCache } from "./indicatorCatalog.js";
import { resetPresentationPresetsCache } from "./presentationPresets.js";
import {
  createStudioShell,
  studioIdsFromPrefix,
} from "./studioShell.js";
import {
  INDICATORS_WIZARD_STEPS,
  createNumberedWizardController,
} from "./indicatorsWizardSteps.js";
import {
  addMetricRow,
  buildCoreContractFromForm,
  buildRefreshMold,
  coreContractFromBundle,
  emptyMetricRow,
  fieldsFromCoreMetrics,
  metricsFromCatalogEntry,
  metricsFromCoreBundle,
  renderMetricsEditor,
  syncMetricsFromDom,
  validateCoreContractStep,
} from "./indicatorsStudioCoreContract.js";

const $ = (id) => document.getElementById(id);

let _meta = null;
let _catalog = null;
let _editingId = null;
/** @type {Array<any>} */
let _coreList = [];
/** @type {"core"|"menu"} */
let _workspace = "core";
/** @type {string|null} */
let _editingCoreClave = null;
/** @type {any} */
let _pickedCoreBundle = null;

function publicationCoreKey(ind) {
  if (!ind || typeof ind !== "object") return "";
  const amigo = ind.amigo && typeof ind.amigo === "object" ? ind.amigo : {};
  const mold = ind.refresh_mold || amigo.mold || {};
  return String(
    ind.core_indicator_key ||
      ind.core_indicator_key ||
      amigo.core_clave ||
      amigo.core_clave ||
      mold.core_clave ||
      mold.core_clave ||
      ""
  ).trim();
}

function matchCoreClaveInList(candidates) {
  const list = _coreList || [];
  for (const raw of candidates || []) {
    const k = String(raw || "").trim();
    if (!k) continue;
    const hit = list.find((c) => c.clave === k);
    if (hit) return hit.clave;
  }
  return "";
}

function inferCoreClaveFromPublication(ind) {
  const id = String(ind?.id || $("fId")?.value || "").trim();
  const label = String(ind?.label || $("fLabel")?.value || "")
    .trim()
    .toLowerCase();
  const explicit = publicationCoreKey(ind);
  const stripped = id.replace(/^[a-z]+_/, "");
  const fromList = matchCoreClaveInList([explicit, id, stripped]);
  if (fromList) return fromList;
  if (explicit) return explicit;
  if (label) {
    const byName = (_coreList || []).find(
      (c) => String(c.nombre || "").trim().toLowerCase() === label
    );
    if (byName) return byName.clave;
  }
  return stripped || id || "";
}

async function resolveCoreClaveFromMoldSpec(templateId) {
  const tid = String(templateId || "").trim();
  if (!tid) return "";
  try {
    const { res, data } = await adminFetch(
      `/api/amigo/admin/mold-spec/${encodeURIComponent(tid)}`,
      { clearOn401: false }
    );
    if (!res?.ok) return "";
    return String(data?.spec?.core_clave || data?.core_clave || "").trim();
  } catch {
    return "";
  }
}

async function hydratePublicationCoreLink(ind) {
  const pub = ind || (_catalog?.indicators || []).find((x) => x.id === _editingId) || {
    id: $("fId")?.value || "",
    label: $("fLabel")?.value || "",
  };
  let key = inferCoreClaveFromPublication(pub);
  const listed = matchCoreClaveInList([key]);
  if (!listed && pub.id) {
    const fromSpec = await resolveCoreClaveFromMoldSpec(pub.id);
    if (fromSpec) key = fromSpec;
  }
  if (!key) return "";
  fillCorePickSelect(key);
  await refreshCorePickSummary();
  return key;
}

const wizardNav = createNumberedWizardController({
  steps: INDICATORS_WIZARD_STEPS,
  initialStep: 1,
});

function coreFormIds() {
  return {
    coreClave: $("fCoreClave"),
    nombre: $("fCoreNombre"),
    tema: $("fCoreTema"),
    descripcion: $("fCoreDescripcion"),
  };
}
/** Campos del formulario visibles según preset. */
const PRESET_FORM = {
  horizontal_bars: {
    fields: ["sort_by", "bar_metrics", "ranking", "ranking_size", "bar_colors", "bar_colors_series"],
    hint: "Barras horizontales por municipio. Elija N series (años) y el tamaño top/bottom del ranking.",
  },
  ranking_dual_bars: {
    fields: ["sort_by", "bar_metrics", "ranking", "ranking_size", "bar_colors", "bar_colors_series"],
    hint: "Igual que barras horizontales (alias). N series + ranking municipal configurable.",
  },
  ranking_with_rates_table: {
    fields: ["sort_by", "bar_metrics", "ranking_size", "bar_colors", "bar_colors_simple"],
    hint: "Barras a la izquierda y columnas de detalle a la derecha.",
  },
  entity_bars_municipal_table: {
    fields: ["sort_by", "ranking_size", "bar_colors", "bar_colors_simple"],
    hint: "Barras por entidad federativa y tabla de municipios.",
  },
  multi_column_table: {
    fields: ["sort_by", "ranking_size"],
    hint: "Tabla con varias columnas. «Ordenar el ranking por» define quién queda arriba.",
  },
  vertical_bars: {
    fields: ["chart_metrics", "y_series", "bar_colors", "bar_colors_grouped"],
    hint: "Eje X = categorías. Eje Y = país, estado y/o municipio (marque los que quiera).",
  },
  chartjs_grouped_bars: {
    fields: ["chart_metrics", "y_series", "bar_colors", "bar_colors_grouped"],
    hint: "Igual que barras verticales (alias).",
  },
  analfabetismo_composite: {
    fields: ["sort_by", "ranking_size", "bar_colors", "bar_colors_simple"],
    hint: "Vista de tres paneles (comparativo, entidades y municipios).",
  },
};

const PROFILE_LABELS = {
  ranking_municipal: "Solo ranking de municipios",
  ranking_with_national_state: "Ranking + fila nacional y estatal",
  ranking_with_states: "Barras por entidad + ranking municipal",
  ranking_entity_only: "Ranking con fila de la entidad",
  national_state_municipio: "Comparar nacional, estatal y municipio",
};

function applyPresetFormVisibility() {
  const preset = $("fPreset")?.value || "multi_column_table";
  const conf = PRESET_FORM[preset] || { fields: ["sort_by"], hint: "" };
  const show = new Set(conf.fields || []);
  document.querySelectorAll("[data-studio-field]").forEach((node) => {
    const key = node.getAttribute("data-studio-field");
    if (key === "handler") return;
    const on = show.has(key);
    node.classList.toggle("d-none", !on);
  });
  const hint = $("indStudioPresetHint");
  if (hint) hint.textContent = conf.hint || "Elija el diseño visual.";
  refreshFieldKeySelects(true);
  renderSeriesColorPickers();
  if (wizardNav.getStep() === 4) {
    document.querySelectorAll('[data-wizard-step="4"]').forEach((panel) => {
      if (panel.getAttribute("data-studio-field") === "bar_colors") return;
      panel.classList.remove("d-none");
    });
  }
}

function onEnterWizardStep(step) {
  if (step === 2) {
    const current = ($("fCorePick")?.value || "").trim();
    if (current) {
      fillCorePickSelect(current);
      void refreshCorePickSummary();
    } else {
      void hydratePublicationCoreLink();
    }
  }
  if (step === 4) {
    applyPresetFormVisibility();
    ensurePresetMetricDefaults();
  }
  if (step === 6) renderReviewSummary();
  if (step === 3) {
    syncFieldsTextareaFromEditor();
    renderFieldsEditor(parseFieldsText($("fFields")?.value || ""));
  }
}

function renderWizardChrome() {
  wizardNav.renderChrome({
    host: $("indStudioSteps"),
    hintEl: $("indStudioStepHint"),
    backBtn: $("indStudioWizardBack"),
    nextBtn: $("indStudioWizardNext"),
    onGoto: (target) => {
      wizardNav.tryGoTo(target, {
        validateStep: validateWizardStep,
        onBlocked: (err) => showErr($("indStudioFormError"), err),
        onClearError: () => showErr($("indStudioFormError")),
        onEnter: onEnterWizardStep,
      });
      renderWizardChrome();
    },
  });
}

function showWizardStep(step) {
  wizardNav.showStep(step, { onEnter: onEnterWizardStep });
  renderWizardChrome();
}

function readCompareBlockFromForm() {
  if (!$("fCompareEnabled")?.checked) {
    return { enabled: false };
  }
  const cmp = { enabled: true };
  const mode = ($("fCompareMode")?.value || "").trim();
  if (mode) cmp.mode = mode;
  if ($("fCompareTemporalEnable")?.checked) {
    const from = ($("fCompareTemporalFrom")?.value || "").trim();
    const to = ($("fCompareTemporalTo")?.value || "").trim();
    if (from && to) cmp.temporal = { from, to };
  }
  if ($("fCompareHabxpolFallback")?.checked) {
    cmp.habxpol_fallback = true;
  }
  return cmp;
}

function writeCompareBlockToForm(compare) {
  const c = compare && typeof compare === "object" ? compare : {};
  if ($("fCompareEnabled")) $("fCompareEnabled").checked = c.enabled === true;
  if ($("fCompareMode")) $("fCompareMode").value = c.mode || "";
  const temporal = c.temporal && typeof c.temporal === "object" ? c.temporal : {};
  const hasTemporal = Boolean(temporal.from && temporal.to);
  if ($("fCompareTemporalEnable")) $("fCompareTemporalEnable").checked = hasTemporal;
  if ($("fCompareHabxpolFallback")) {
    $("fCompareHabxpolFallback").checked = c.habxpol_fallback === true;
  }
  refreshFieldKeySelects(true);
  if ($("fCompareTemporalFrom") && temporal.from) {
    $("fCompareTemporalFrom").value = temporal.from;
  }
  if ($("fCompareTemporalTo") && temporal.to) {
    $("fCompareTemporalTo").value = temporal.to;
  }
  syncCompareAdvancedUi(Boolean(hasTemporal || c.mode || c.habxpol_fallback));
}

function syncCompareAdvancedUi(expandAdvanced = false) {
  const on = Boolean($("fCompareEnabled")?.checked);
  $("indStudioCompareAdvancedWrap")?.classList.toggle("d-none", !on);
  const temporalOn = Boolean($("fCompareTemporalEnable")?.checked);
  $("fCompareTemporalFromWrap")?.classList.toggle("d-none", !temporalOn);
  $("fCompareTemporalToWrap")?.classList.toggle("d-none", !temporalOn);
  const body = $("indStudioCompareAdvancedBody");
  const btn = $("fCompareAdvancedToggle");
  if (expandAdvanced && on && body) {
    body.classList.remove("d-none");
    btn?.setAttribute("aria-expanded", "true");
  }
}

function toggleCompareAdvancedPanel() {
  const body = $("indStudioCompareAdvancedBody");
  const btn = $("fCompareAdvancedToggle");
  if (!body || !btn) return;
  body.classList.toggle("d-none");
  btn.setAttribute("aria-expanded", String(!body.classList.contains("d-none")));
}

function compareAdvancedReviewHtml() {
  if (!$("fCompareEnabled")?.checked) return "No";
  const parts = ["Habilitado (Analítica)"];
  const mode = ($("fCompareMode")?.value || "").trim();
  if (mode) parts.push(`modo ${mode}`);
  if ($("fCompareTemporalEnable")?.checked) {
    const from = ($("fCompareTemporalFrom")?.value || "").trim();
    const to = ($("fCompareTemporalTo")?.value || "").trim();
    if (from && to) parts.push(`variación ${from} → ${to}`);
  }
  if ($("fCompareHabxpolFallback")?.checked) parts.push("fallback hab/policía");
  return escapeHtml(parts.join(" · "));
}

function validateWizardStep(step) {
  if (step === 1) {
    const id = $("fId")?.value?.trim() || "";
    if (!_editingId && !/^[a-z][a-z0-9_]*$/.test(id)) {
      return "Indique un identificador válido (minúsculas, números y _).";
    }
    if (!($("fLabel")?.value || "").trim()) return "Indique el nombre que ve el usuario.";
    if (!($("fGroup")?.value || "").trim()) return "Seleccione un grupo del menú.";
  }
  if (step === 2) {
    let key = ($("fCorePick")?.value || "").trim();
    if (!key) {
      key = inferCoreClaveFromPublication(
        (_catalog?.indicators || []).find((x) => x.id === _editingId)
      );
      if (key) fillCorePickSelect(key);
    }
    if (!key) return "Seleccione un indicador CORE. Créelo antes en Indicadores (CORE).";
    return "";
  }
  if (step === 3) {
    syncFieldsTextareaFromEditor();
    const fields = parseFieldsText($("fFields")?.value || "");
    if (!fields.length) return "Añada al menos un campo en el constructor (o use «Sincronizar → Datos»).";
  }
  if (step === 4) {
    if (!($("fPreset")?.value || "").trim()) return "Seleccione el tipo de gráfica o tabla.";
    const metrics = ensurePresetMetricDefaults();
    if (!metrics.ok) return metrics.error;
    if ($("fCompareEnabled")?.checked) {
      const sortBy = ($("fSortBy")?.value || "").trim();
      if (!sortBy) {
        return "Para el comparador municipal indique «Ordenar el ranking por» (métrica principal).";
      }
      const coreKey = ($("fCorePick")?.value || "").trim();
      if (!coreKey) {
        return "Para el comparador municipal seleccione un indicador CORE (paso Indicador).";
      }
      if ($("fCompareTemporalEnable")?.checked) {
        const from = ($("fCompareTemporalFrom")?.value || "").trim();
        const to = ($("fCompareTemporalTo")?.value || "").trim();
        if (!from || !to) {
          return "Indique métricas «desde» y «hasta» para la variación temporal del comparador.";
        }
        if (from === to) {
          return "Las métricas de variación temporal deben ser distintas.";
        }
      }
    }
  }
  if (step === 6 && $("fCompareEnabled")?.checked) {
    syncFieldsTextareaFromEditor();
    const fields = parseFieldsText($("fFields")?.value || "");
    if (!fields.length) {
      return "El comparador requiere al menos un campo de datos publicado.";
    }
  }
  return "";
}

function fillCorePickSelect(selected) {
  const sel = $("fCorePick");
  if (!sel) return;
  const cur = selected || sel.value || "";
  const items = [...(_coreList || [])].sort((a, b) =>
    String(a.clave || "").localeCompare(String(b.clave || ""), "es")
  );
  sel.innerHTML = '<option value="">— Elegir indicador CORE —</option>';
  for (const c of items) {
    const opt = document.createElement("option");
    opt.value = c.clave;
    const n = c.n_metricas != null ? ` (${c.n_metricas} métr.)` : "";
    opt.textContent = `${c.nombre || c.clave} — ${c.clave}${n}`;
    sel.append(opt);
  }
  if (cur && ![...sel.options].some((o) => o.value === cur)) {
    const opt = document.createElement("option");
    opt.value = cur;
    opt.textContent = `${cur} (vinculado a esta publicación)`;
    sel.append(opt);
  }
  if (cur) sel.value = cur;
}

function coreSummaryHtml(bundle) {
  const ind = bundle?.indicator || {};
  const rows = metricsFromCoreBundle(bundle);
  if (!ind.clave && !rows.length) {
    return "No se pudo leer el indicador CORE.";
  }
  const mList = rows
    .map(
      (m) =>
        `<li><code>${escapeHtml(m.clave)}</code> ${escapeHtml(m.nombre || "")} · ${(m.niveles || []).join(", ")}${
          m.periodo ? ` · ${escapeHtml(m.periodo)}` : ""
        }</li>`
    )
    .join("");
  return `<div><strong>${escapeHtml(ind.nombre || ind.clave || "")}</strong> · <code>${escapeHtml(
    ind.clave || ""
  )}</code> · ${rows.length} métrica(s)<ul class="mb-0 ps-3">${mList || "<li class='text-muted'>Sin métricas</li>"}</ul></div>`;
}

async function refreshCorePickSummary() {
  const host = $("indStudioCorePickSummary");
  const key = ($("fCorePick")?.value || "").trim();
  if (!host) return;
  if (!key) {
    _pickedCoreBundle = null;
    host.textContent = "Seleccione un indicador para ver sus métricas.";
    return;
  }
  host.textContent = "Cargando métricas…";
  const { res, data } = await adminFetch(`/api/amigo/admin/indicators/${encodeURIComponent(key)}`, {
    clearOn401: false,
  });
  if (!res?.ok) {
    _pickedCoreBundle = null;
    host.textContent = data?.detail?.message || `No hay indicador «${key}» en CORE.`;
    return;
  }
  _pickedCoreBundle = data;
  host.innerHTML = coreSummaryHtml(data);
}

function applyWorkspace() {
  const isCore = _workspace === "core";
  $("indStudioWsCore")?.classList.toggle("btn-primary", isCore);
  $("indStudioWsCore")?.classList.toggle("btn-outline-secondary", !isCore);
  $("indStudioWsMenu")?.classList.toggle("btn-primary", !isCore);
  $("indStudioWsMenu")?.classList.toggle("btn-outline-secondary", isCore);
  if ($("indStudioListTitle")) {
    $("indStudioListTitle").textContent = isCore ? "Indicadores" : "Publicaciones";
  }
  if ($("indStudioNewBtn")) {
    $("indStudioNewBtn").textContent = isCore ? "+ Nuevo indicador" : "+ Nueva publicación";
  }
  $("indStudioCopyBtn")?.classList.toggle("d-none", isCore || !_editingId);
  if (isCore) {
    $("indStudioForm")?.classList.add("d-none");
    const hasCore = Boolean(_editingCoreClave) || $("fCoreClave")?.value;
    const showingCore = !$("indStudioCoreForm")?.classList.contains("d-none");
    if (!showingCore && !hasCore) {
      $("indStudioCoreForm")?.classList.add("d-none");
      $("indStudioFormEmpty")?.classList.remove("d-none");
      if ($("indStudioFormEmpty")) {
        $("indStudioFormEmpty").textContent =
          "Seleccione un indicador CORE o cree uno nuevo. Las publicaciones del menú están en el otro espacio.";
      }
    }
  } else {
    $("indStudioCoreForm")?.classList.add("d-none");
    const showingPub = !$("indStudioForm")?.classList.contains("d-none");
    if (!showingPub) {
      $("indStudioFormEmpty")?.classList.remove("d-none");
      if ($("indStudioFormEmpty")) {
        $("indStudioFormEmpty").textContent =
          "Seleccione una publicación del menú o cree una nueva a partir de un indicador CORE.";
      }
    }
  }
  renderList();
}

function setWorkspace(mode) {
  _workspace = mode === "menu" ? "menu" : "core";
  applyWorkspace();
}

function showCoreEditor() {
  $("indStudioFormEmpty")?.classList.add("d-none");
  $("indStudioForm")?.classList.add("d-none");
  $("indStudioCoreForm")?.classList.remove("d-none");
  showErr($("indStudioCoreFormError"));
  showOk($("indStudioCoreFormOk"));
}

function hideEditors() {
  $("indStudioForm")?.classList.add("d-none");
  $("indStudioCoreForm")?.classList.add("d-none");
  $("indStudioFormEmpty")?.classList.remove("d-none");
}

function renderReviewSummary() {
  const host = $("indStudioReviewSummary");
  if (!host) return;
  syncFieldsTextareaFromEditor();
  syncMetricsFromDom();
  ensurePresetMetricDefaults();
  const fields = parseFieldsText($("fFields")?.value || "");
  const fieldList = fields
    .map((f) => `<li><code>${escapeHtml(f.key)}</code> → ${escapeHtml(f.label || f.key)} (${escapeHtml(f.type)})</li>`)
    .join("");
  const bars = getMultiSelectValues($("fBarMetrics"));
  const charts = getMultiSelectValues($("fChartMetrics"));
  let coreBlock = "<span class='text-muted'>Sin indicador CORE enlazado</span>";
  const pickKey = ($("fCorePick")?.value || "").trim();
  if (pickKey) {
    if (_pickedCoreBundle?.indicator) {
      coreBlock = coreSummaryHtml(_pickedCoreBundle);
    } else {
      coreBlock = `Clave <code>${escapeHtml(pickKey)}</code>`;
    }
  }
  host.innerHTML = `
    <dl class="row mb-0">
      <dt class="col-sm-3">Id menú</dt><dd class="col-sm-9"><code>${escapeHtml($("fId")?.value || "")}</code></dd>
      <dt class="col-sm-3">Etiqueta</dt><dd class="col-sm-9">${escapeHtml($("fLabel")?.value || "")}</dd>
      <dt class="col-sm-3">Grupo</dt><dd class="col-sm-9">${escapeHtml($("fGroup")?.value || "")}</dd>
      <dt class="col-sm-3">Visible</dt><dd class="col-sm-9">${$("fEnabled")?.value === "false" ? "No" : "Sí"}</dd>
      <dt class="col-sm-3">Indicador CORE</dt><dd class="col-sm-9">${coreBlock}</dd>
      <dt class="col-sm-3">Perfil</dt><dd class="col-sm-9">${escapeHtml($("fProfile")?.value || "")}</dd>
      <dt class="col-sm-3">Tabla</dt><dd class="col-sm-9">${escapeHtml($("fTable")?.value || "")}</dd>
      <dt class="col-sm-3">Preset</dt><dd class="col-sm-9">${escapeHtml($("fPreset")?.value || "")}</dd>
      <dt class="col-sm-3">Ordenar por</dt><dd class="col-sm-9">${escapeHtml($("fSortBy")?.value || "—")}</dd>
      <dt class="col-sm-3">Series barras</dt><dd class="col-sm-9">${bars.length ? escapeHtml(bars.join(", ")) : "—"}</dd>
      <dt class="col-sm-3">Eje X</dt><dd class="col-sm-9">${charts.length ? escapeHtml(charts.join(", ")) : "—"}</dd>
      <dt class="col-sm-3">Campos (${fields.length})</dt><dd class="col-sm-9"><ul class="mb-0 ps-3">${fieldList || "<li class='text-muted'>Ninguno</li>"}</ul></dd>
      <dt class="col-sm-3">Metadatos</dt><dd class="col-sm-9">${$("fMetaEnabled")?.value === "false" ? "Botón oculto" : "Botón visible"}</dd>
      <dt class="col-sm-3">Comparador</dt><dd class="col-sm-9">${compareAdvancedReviewHtml()}</dd>
    </dl>`;
}

function fieldsEditorHtml(fields) {
  const list = fields || [];
  if (!list.length) {
    return `<p class="small text-muted mb-0">Sin campos. Use «+ Campo» o «Ver columnas de la tabla».</p>`;
  }
  const typeOpts = (selected) =>
    ["float", "integer", "percent", "text"]
      .map((t) => `<option value="${t}" ${t === selected ? "selected" : ""}>${t}</option>`)
      .join("");
  return list
    .map((f, idx) => {
      const key = escapeHtml(f.key || "");
      const column = escapeHtml(f.column || f.key || "");
      const label = escapeHtml(f.label || "");
      const type = String(f.type || "float").toLowerCase();
      const typeNorm = type === "int" || type === "number" ? "integer" : type === "string" ? "text" : type;
      return `<div class="ind-studio-field-row border rounded p-2 mb-1" data-field-idx="${idx}">
        <div class="d-flex gap-1 align-items-start">
          <div class="ind-studio-field-move d-flex flex-column gap-1">
            <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1" data-field-move="up" title="Subir">▲</button>
            <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1" data-field-move="down" title="Bajar">▼</button>
          </div>
          <div class="row g-1 flex-grow-1">
            <div class="col-md-3">
              <label class="form-label small mb-0">Clave</label>
              <input type="text" class="form-control form-control-sm font-monospace" data-field-key value="${key}" />
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Columna BD</label>
              <input type="text" class="form-control form-control-sm font-monospace" data-field-column value="${column}" />
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-0">Etiqueta</label>
              <input type="text" class="form-control form-control-sm" data-field-label value="${label}" />
            </div>
            <div class="col-md-2">
              <label class="form-label small mb-0">Tipo</label>
              <select class="form-select form-select-sm" data-field-type>${typeOpts(typeNorm)}</select>
            </div>
          </div>
          <button type="button" class="btn btn-outline-danger btn-sm py-0" data-field-remove title="Quitar">×</button>
        </div>
      </div>`;
    })
    .join("");
}

function readFieldsFromEditorDom() {
  const host = $("indStudioFieldsEditor");
  if (!host) return parseFieldsText($("fFields")?.value || "");
  const defaultTable = $("fTable")?.value || "tab_municipal";
  const out = [];
  host.querySelectorAll(".ind-studio-field-row").forEach((row) => {
    const key = row.querySelector("[data-field-key]")?.value?.trim() || "";
    if (!key) return;
    const column = row.querySelector("[data-field-column]")?.value?.trim() || key;
    const label = row.querySelector("[data-field-label]")?.value?.trim() || humanizeColumnLabel(key);
    const type = row.querySelector("[data-field-type]")?.value?.trim() || "float";
    const field = { key, column, label, type, source_table: defaultTable };
    if (column !== key) field.column_aliases = [key];
    out.push(field);
  });
  return out;
}

function syncFieldsTextareaFromEditor() {
  const ta = $("fFields");
  if (!ta) return;
  const fields = readFieldsFromEditorDom();
  ta.value = fieldsToText(fields);
}

function renderFieldsEditor(fields) {
  const host = $("indStudioFieldsEditor");
  if (!host) return;
  host.innerHTML = fieldsEditorHtml(fields || []);
  host.querySelectorAll("[data-field-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".ind-studio-field-row");
      row?.remove();
      syncFieldsTextareaFromEditor();
      refreshFieldKeySelects(true);
      renderSeriesColorPickers();
      refreshColsPickerSelectedState();
    });
  });
  host.querySelectorAll("[data-field-move]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".ind-studio-field-row");
      if (!row || !host) return;
      const dir = btn.getAttribute("data-field-move");
      if (dir === "up" && row.previousElementSibling) {
        host.insertBefore(row, row.previousElementSibling);
      } else if (dir === "down" && row.nextElementSibling) {
        host.insertBefore(row.nextElementSibling, row);
      }
      syncFieldsTextareaFromEditor();
      refreshFieldKeySelects(true);
    });
  });
  host.querySelectorAll("[data-field-key], [data-field-column], [data-field-label], [data-field-type]").forEach((el) => {
    el.addEventListener("input", () => {
      syncFieldsTextareaFromEditor();
      refreshFieldKeySelects(true);
      renderSeriesColorPickers();
      refreshColsPickerSelectedState();
    });
    el.addEventListener("change", () => {
      syncFieldsTextareaFromEditor();
      refreshFieldKeySelects(true);
      renderSeriesColorPickers();
      refreshColsPickerSelectedState();
    });
  });
}

function addEmptyFieldRow() {
  const cur = readFieldsFromEditorDom();
  const n = cur.length + 1;
  cur.push({
    key: `campo_${n}`,
    column: `campo_${n}`,
    label: `Campo ${n}`,
    type: "float",
    source_table: $("fTable")?.value || "tab_municipal",
  });
  if ($("fFields")) $("fFields").value = fieldsToText(cur);
  renderFieldsEditor(cur);
  refreshFieldKeySelects(true);
  refreshColsPickerSelectedState();
}

function showErr(el, msg) {
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

function showOk(el, msg) {
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

async function loadMetaAndCatalog() {
  const metaRes = await adminFetch("/api/indicators/admin/meta");
  if (!metaRes.res?.ok) throw new Error(metaRes.data?.detail?.message || "No se pudo cargar meta");
  _meta = metaRes.data;

  const catRes = await adminFetch("/api/indicators/admin/catalog");
  if (!catRes.res?.ok) throw new Error(catRes.data?.detail?.message || "No se pudo cargar catálogo");
  _catalog = catRes.data.catalog;

  try {
    const coreRes = await adminFetch("/api/amigo/admin/indicators", {
      clearOn401: false,
    });
    if (coreRes.res?.ok) {
      _coreList = coreRes.data?.indicators || [];
    } else {
      _coreList = [];
    }
  } catch {
    _coreList = [];
  }

  fillSelects();
  applyWorkspace();
  void loadAuditLog();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAuditWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function loadAuditLog() {
  const host = $("indStudioAudit");
  if (!host) return;
  host.innerHTML = '<p class="small text-muted mb-0">Cargando registro…</p>';
  const { res, data } = await adminFetch("/api/indicators/admin/audit?limit=60");
  if (!res?.ok) {
    host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(
      data?.detail?.message || "No se pudo cargar la auditoría"
    )}</p>`;
    return;
  }
  const entries = data?.entries || [];
  if (!entries.length) {
    host.innerHTML =
      '<p class="small text-muted mb-0">Sin registros aún. Al publicar, editar o eliminar un indicador quedará aquí.</p>';
    return;
  }
  host.innerHTML = `
    <p class="small text-muted mb-2 px-1">Últimas ${entries.length} de ${data?.total ?? entries.length} acciones.</p>
    <div class="table-responsive ind-studio-audit-wrap">
      <table class="table table-sm table-borderless ind-studio-audit-table mb-0">
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Usuario</th>
            <th scope="col">Acción</th>
            <th scope="col">Detalle</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (entry) => `
            <tr>
              <td class="text-nowrap">${escapeHtml(formatAuditWhen(entry.created_at))}</td>
              <td>${escapeHtml(entry.display_name || entry.username || "—")}</td>
              <td>${escapeHtml(entry.action_label || entry.action || "—")}</td>
              <td title="${escapeHtml(entry.indicator_id || "")}">${escapeHtml(
                entry.summary || entry.indicator_id || "—"
              )}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function fillSelects() {
  const g = $("fGroup");
  g.innerHTML = "";
  for (const group of _meta.groups || []) {
    const opt = document.createElement("option");
    opt.value = group.id;
    opt.textContent = group.label || group.id;
    g.append(opt);
  }

  const p = $("fProfile");
  p.innerHTML = "";
  for (const prof of _meta.profiles || []) {
    const opt = document.createElement("option");
    opt.value = prof;
    opt.textContent = PROFILE_LABELS[prof] || prof;
    p.append(opt);
  }

  const h = $("fHandler");
  h.innerHTML = '<option value="">(ninguno)</option>';
  for (const hand of _meta.handlers || []) {
    const opt = document.createElement("option");
    opt.value = hand;
    opt.textContent = hand;
    h.append(opt);
  }

  const pr = $("fPreset");
  pr.innerHTML = "";
  for (const preset of _meta.presets || []) {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label || preset.id;
    pr.append(opt);
  }
}

function fieldKeysFromForm() {
  syncFieldsTextareaFromEditor();
  return parseFieldsText($("fFields")?.value).map((f) => f.key);
}

function setMultiSelectValues(sel, values) {
  if (!sel) return;
  const want = new Set(values || []);
  for (const opt of sel.options) {
    opt.selected = want.has(opt.value);
  }
}

function getMultiSelectValues(sel) {
  if (!sel) return [];
  return [...sel.selectedOptions].map((o) => o.value);
}

/**
 * Presets de barras/chart exigen métricas. Si el usuario no marcó ninguna
 * (Ctrl+clic poco intuitivo), usar todas las claves de fields.
 */
function ensurePresetMetricDefaults() {
  syncFieldsTextareaFromEditor();
  refreshFieldKeySelects(true);
  const template = $("fPreset")?.value || "";
  const presetUi = PRESET_FORM[template] || {};
  const fieldsUi = presetUi.fields || [];
  const keys = fieldKeysFromForm();
  if (!keys.length) return { ok: false, error: "Defina al menos un campo en Datos." };

  if (fieldsUi.includes("bar_metrics")) {
    let bars = getMultiSelectValues($("fBarMetrics"));
    if (!bars.length) {
      setMultiSelectValues($("fBarMetrics"), keys);
      bars = keys;
      renderSeriesColorPickers();
    }
    if (!bars.length) {
      return {
        ok: false,
        error:
          "Este preset exige series de barras. Marque al menos una en «Series / columnas de las barras» (Ctrl+clic).",
      };
    }
  }
  if (fieldsUi.includes("chart_metrics")) {
    let charts = getMultiSelectValues($("fChartMetrics"));
    if (!charts.length) {
      setMultiSelectValues($("fChartMetrics"), keys);
      charts = keys;
    }
    if (!charts.length) {
      return {
        ok: false,
        error: "Este preset exige categorías del eje X. Marque al menos una.",
      };
    }
  }
  if (fieldsUi.includes("sort_by") && !($("fSortBy")?.value || "").trim()) {
    if ($("fSortBy") && keys[0]) $("fSortBy").value = keys[0];
  }
  return { ok: true, error: "" };
}

function refreshFieldKeySelects(preserve = true) {
  const keys = fieldKeysFromForm();
  const sortPrev = preserve ? $("fSortBy")?.value : "";
  const barPrev = preserve ? getMultiSelectValues($("fBarMetrics")) : [];
  const chartPrev = preserve ? getMultiSelectValues($("fChartMetrics")) : [];
  const temporalFromPrev = preserve ? $("fCompareTemporalFrom")?.value : "";
  const temporalToPrev = preserve ? $("fCompareTemporalTo")?.value : "";

  const fillSingle = (sel, selected) => {
    if (!sel) return;
    sel.innerHTML = "";
    if (!keys.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(defina columnas arriba)";
      sel.append(opt);
      return;
    }
    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      sel.append(opt);
    }
    if (selected && keys.includes(selected)) sel.value = selected;
    else sel.value = keys[0];
  };

  const fillMulti = (sel, selected) => {
    if (!sel) return;
    sel.innerHTML = "";
    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      opt.selected = (selected || []).includes(k);
      sel.append(opt);
    }
  };

  fillSingle($("fSortBy"), sortPrev);
  fillMulti($("fBarMetrics"), barPrev);
  fillMulti($("fChartMetrics"), chartPrev);
  fillSingle($("fCompareTemporalFrom"), temporalFromPrev);
  fillSingle($("fCompareTemporalTo"), temporalToPrev);
}

function renderList() {
  const root = $("indStudioList");
  if (!root) return;
  root.innerHTML = "";

  if (_workspace === "core") {
    const items = [...(_coreList || [])].sort((a, b) =>
      String(a.clave || "").localeCompare(String(b.clave || ""), "es")
    );
    if (!items.length) {
      root.innerHTML =
        '<p class="small text-muted mb-0 px-1">Sin indicadores en CORE aún, o AMIGO no disponible.</p>';
      return;
    }
    for (const c of items) {
      const row = document.createElement("div");
      row.className = "d-flex gap-1 mb-1 align-items-stretch";
      const btn = document.createElement("button");
      btn.type = "button";
      const active = c.clave === _editingCoreClave;
      btn.className =
        "btn btn-sm flex-grow-1 text-start " +
        (active ? "btn-primary" : "btn-outline-secondary");
      const n = c.n_metricas != null ? ` · ${c.n_metricas} métr.` : "";
      btn.innerHTML = `<span class="badge text-bg-primary me-1">CORE</span>${escapeHtml(
        c.nombre || c.clave
      )}<span class="text-muted small"> (${escapeHtml(c.clave)}${escapeHtml(n)})</span>`;
      btn.title = c.clave;
      btn.addEventListener("click", () => void openCoreEditor(c.clave));
      row.append(btn);
      root.append(row);
    }
    return;
  }

  const items = [...(_catalog?.indicators || [])].sort((a, b) =>
    String(a.label || a.id).localeCompare(String(b.label || b.id), "es")
  );
  for (const ind of items) {
    const row = document.createElement("div");
    row.className = "d-flex gap-1 mb-1 align-items-stretch";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "btn btn-sm flex-grow-1 text-start " +
      (ind.id === _editingId ? "btn-primary" : "btn-outline-secondary");
    const coreKey =
      publicationCoreKey(ind) ||
      matchCoreClaveInList([ind.id, String(ind.id || "").replace(/^[a-z]+_/, "")]);
    const coreBadge = coreKey
      ? `<span class="badge text-bg-primary me-1" title="CORE ${escapeHtml(coreKey)}">AMIGO</span>`
      : "";
    btn.innerHTML = `${coreBadge}${ind.enabled === false ? "⏸ " : ""}${escapeHtml(
      ind.label || ind.id
    )}`;
    btn.title = ind.id;
    btn.addEventListener("click", () => openIndicator(ind.id));

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-sm btn-outline-secondary px-2";
    copyBtn.title = "Copiar como nuevo";
    copyBtn.setAttribute("aria-label", `Copiar ${ind.label || ind.id}`);
    copyBtn.textContent = "⧉";
    copyBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      copyIndicatorAsNew(ind.id);
    });

    row.append(btn, copyBtn);
    root.append(row);
  }
}

function suggestCopyId(baseId) {
  const base = String(baseId || "ind")
    .replace(/_copia\d*$/, "")
    .slice(0, 40);
  const existing = new Set((_catalog?.indicators || []).map((i) => i.id));
  let candidate = `${base}_copia`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_copia${n}`;
    n += 1;
  }
  return candidate;
}

function setCopyHint(msg) {
  const el = $("indStudioCopyHint");
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

function updateCopyButtonVisibility() {
  const canCopy = Boolean(_editingId);
  $("indStudioCopyBtn")?.classList.toggle("d-none", !canCopy);
  $("indStudioCopyBtnReview")?.classList.toggle("d-none", !canCopy);
}

/**
 * Duplica un indicador del catálogo como borrador nuevo (mismo espíritu que INV Studio).
 * Conserva fields, presentación, metadatos y perfil; el usuario revisa Id y publica.
 */
function copyIndicatorAsNew(sourceId) {
  const sid = sourceId || _editingId;
  const src = (_catalog?.indicators || []).find((x) => x.id === sid);
  if (!src) {
    showErr($("indStudioFormError"), "Seleccione un indicador para copiar.");
    return;
  }

  const clone = JSON.parse(JSON.stringify(src));
  const newId = suggestCopyId(src.id);
  clone.id = newId;
  clone.label = `${src.label || src.id} (copia)`;
  if (!clone.export || typeof clone.export !== "object") clone.export = {};
  clone.export.filename_prefix = newId;
  if (clone.api && typeof clone.api === "object") {
    delete clone.api.legacy_paths;
  }

  _editingId = null;
  fillForm(clone);
  $("fId").readOnly = false;
  setCopyHint(
    `Copia de «${src.label || src.id}». Id sugerido editable; fields, presentación y metadatos se conservaron. Publique cuando esté listo.`
  );
  showOk(
    $("indStudioFormOk"),
    "Borrador de copia listo: revise el Id y publique."
  );
  updateCopyButtonVisibility();
  renderList();
  $("fId")?.focus();
}

/**
 * Formatos admitidos (de corto a largo):
 *   clave
 *   clave|Etiqueta
 *   clave|Etiqueta|tipo
 *   clave|Etiqueta|tipo|tabla          (solo si el 4.º segmento es nombre de tabla)
 *   clave|columna_bd|Etiqueta|tipo
 *   clave|columna_bd|Etiqueta|tipo|tabla
 */
const SOURCE_TABLES = new Set(["tab_municipal", "tab_nacional", "c_mun"]);
const FIELD_TYPES = new Set(["float", "int", "integer", "percent", "string", "text", "number"]);

function isSourceTable(value) {
  return SOURCE_TABLES.has(String(value || "").trim());
}

function isFieldType(value) {
  return FIELD_TYPES.has(String(value || "").trim().toLowerCase());
}

function resolvePrimaryTableFromFields(fields, fallbackTable) {
  const tables = new Set((fields || []).map((f) => f.source_table).filter(Boolean));
  if (tables.has("tab_municipal") && tables.has("tab_nacional")) {
    return "atlas.tab_municipal+tab_nacional";
  }
  if (tables.has("tab_nacional")) return "atlas.tab_nacional";
  if (tables.has("c_mun")) return "atlas.c_mun";
  if (fallbackTable === "tab_nacional") return "atlas.tab_nacional";
  if (fallbackTable === "c_mun") return "atlas.c_mun";
  return "atlas.tab_municipal";
}

function parseFieldsText(text) {
  const defaultTable = $("fTable")?.value || "tab_municipal";
  const fields = [];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split("|").map((x) => x.trim());
    const key = parts[0];
    if (!key) continue;

    let column = key;
    let label = humanizeColumnLabel(key);
    let type = "float";
    let source_table = defaultTable;
    let explicitTable = false;

    if (parts.length === 2) {
      label = parts[1] || label;
    } else if (parts.length === 3) {
      // clave|Etiqueta|tipo  (caso habitual al clicar columnas)
      label = parts[1] || label;
      type = parts[2] || type;
    } else if (parts.length === 4) {
      if (isSourceTable(parts[3])) {
        // clave|Etiqueta|tipo|tabla
        label = parts[1] || label;
        type = parts[2] || type;
        source_table = parts[3];
        explicitTable = true;
      } else {
        // clave|columna|Etiqueta|tipo
        column = parts[1] || key;
        label = parts[2] || label;
        type = parts[3] || type;
      }
    } else if (parts.length >= 5) {
      // clave|columna|Etiqueta|tipo[|tabla]
      column = parts[1] || key;
      label = parts[2] || label;
      type = parts[3] || type;
      if (parts[4]) {
        source_table = parts[4];
        explicitTable = true;
      }
    }

    const field = { key, column, label, type, source_table };
    if (explicitTable) field._explicitTable = true;
    if (column !== key) field.column_aliases = [key];
    fields.push(field);
  }
  return fields;
}

/** Conserva column_aliases y metadatos de fields al republicar desde el textarea. */
function mergeFieldsWithExisting(newFields, existingFields) {
  const byKey = new Map((existingFields || []).map((f) => [f.key, f]));
  return (newFields || []).map((f) => {
    const prev = byKey.get(f.key);
    if (!prev) {
      const { _explicitTable, ...clean } = f;
      return clean;
    }
    const merged = { ...f };
    if (prev.source_table && !merged._explicitTable) {
      merged.source_table = prev.source_table;
    }
    if (prev.column && (merged.column !== prev.column || isSourceTable(merged.type))) {
      merged.column = prev.column;
    }
    if (prev.label && (isFieldType(merged.label) || merged.label === merged.type)) {
      merged.label = prev.label;
    }
    if (prev.type && (isSourceTable(merged.type) || !isFieldType(merged.type))) {
      merged.type = prev.type;
    }
    delete merged._explicitTable;
    const aliases = new Set([
      ...(prev.column_aliases || []),
      ...(merged.column_aliases || []),
    ]);
    if (prev.column && prev.column !== merged.column) aliases.add(prev.column);
    if (prev.key && prev.key !== merged.column) aliases.add(prev.key);
    aliases.delete(merged.column);
    aliases.delete(merged.key);
    if (aliases.size) merged.column_aliases = [...aliases];
    return merged;
  });
}

function preserveIndicatorConfig(existing, built) {
  if (!existing) return built;
  built.fields = mergeFieldsWithExisting(built.fields, existing.fields);
  if (existing.legacy?.menu_flag) {
    built.legacy = { menu_flag: existing.legacy.menu_flag };
  }
  if (existing.api?.legacy_paths?.length) {
    built.api.legacy_paths = [...existing.api.legacy_paths];
  }
  const pres = built.presentation || {};
  const prevPres = existing.presentation || {};
  for (const key of [
    "root_class",
    "legend_labels",
    "table_metrics",
    "table_title",
    "state_metric",
    "period_keys",
    "section_labels",
    "ranking",
    "ranking_size",
  ]) {
    if (prevPres[key] != null && pres[key] == null) pres[key] = prevPres[key];
  }
  delete pres.notes;
  built.presentation = pres;
  if (existing.computed_fields?.length) {
    built.computed_fields = existing.computed_fields;
  }
  if (existing.source?.primary_table) {
    built.source.primary_table = existing.source.primary_table;
  }
  if (existing.source?.scope && existing.source.scope !== "studio") {
    built.source.scope = existing.source.scope;
  }
  const exp = built.export || {};
  const prevExp = existing.export || {};
  if (prevExp.csv_columns?.length && !exp.csv_columns?.length) {
    exp.csv_columns = prevExp.csv_columns;
  }
  if (
    prevExp.target_selector &&
    (!exp.target_selector || exp.target_selector === "#indicatorFullVizRoot")
  ) {
    exp.target_selector = prevExp.target_selector;
  }
  built.export = exp;
  if (existing.compare && built.compare) {
    for (const key of ["temporal", "habxpol_fallback", "metric_keys", "mode", "sort_key"]) {
      if (existing.compare[key] != null && built.compare[key] == null) {
        built.compare[key] = existing.compare[key];
      }
    }
  } else if (existing.compare && !built.compare) {
    built.compare = existing.compare;
  }
  return built;
}

function fieldsToText(fields) {
  const tables = new Set((fields || []).map((f) => f.source_table).filter(Boolean));
  const multiTable = tables.size > 1;
  return (fields || [])
    .map((f) => {
      const key = f.key;
      const column = f.column || key;
      const label = f.label || humanizeColumnLabel(key);
      const type = f.type || "float";
      const table = f.source_table || "tab_municipal";
      if (column !== key || multiTable) {
        return [key, column, label, type, table].join("|");
      }
      return `${key}|${label}|${type}`;
    })
    .join("\n");
}

function stripMetaPrefix(text, prefix) {
  const t = (text || "").trim();
  if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
    return t.slice(prefix.length).trim();
  }
  return t;
}

function normalizeMetadataFromCatalog(md, ind) {
  const m = md || {};
  const fuente = (m.fuente || m.source || "").trim();
  const notaGeneral = (m.nota_general || m.summary || m.body || "").trim();
  let notas = Array.isArray(m.notas) ? m.notas : [];
  if (!notas.length && (m.notes || "").trim()) {
    notas = [{ periodo: "", texto: stripMetaPrefix(m.notes, "Nota:") }];
  }
  const unit = (m.unidad_medida || ind?.unit || "").trim();
  return {
    enabled: m.enabled !== false,
    title: m.title || ind?.label || "",
    periodicidad: m.periodicidad || "",
    unidad_medida: unit ? unit.charAt(0).toUpperCase() + unit.slice(1) : "",
    fuente: stripMetaPrefix(fuente, "Fuente:"),
    nota_general: notaGeneral,
    notas: notas.map((n) => ({
      periodo: (n?.periodo || "").trim(),
      texto: (n?.texto || "").trim(),
    })),
    fecha_inicial: m.fecha_inicial || "",
    fecha_final: m.fecha_final || "",
    ultima_actualizacion: m.ultima_actualizacion || m.updated || "",
    show: normalizeMetadataShow(m.show),
  };
}

const META_SHOW_DEFAULTS = {
  periodicidad: true,
  unidad_medida: true,
  ultima_actualizacion: true,
  fuente: true,
  nota_general: true,
  notas: true,
  fecha_inicial: true,
  fecha_final: true,
};

const META_SHOW_FIELDS = [
  { key: "periodicidad", label: "Periodicidad" },
  { key: "unidad_medida", label: "Unidad de medida" },
  { key: "ultima_actualizacion", label: "Última actualización" },
  { key: "fuente", label: "Fuente" },
  { key: "nota_general", label: "Nota general" },
  { key: "notas", label: "Notas por periodo" },
  { key: "fecha_inicial", label: "Fecha inicial" },
  { key: "fecha_final", label: "Fecha final" },
];

function normalizeMetadataShow(show) {
  const out = { ...META_SHOW_DEFAULTS };
  if (show && typeof show === "object") {
    for (const key of Object.keys(META_SHOW_DEFAULTS)) {
      if (show[key] === false) out[key] = false;
    }
  }
  return out;
}

function metadataShowForCatalog(show) {
  const norm = normalizeMetadataShow(show);
  const off = {};
  let anyOff = false;
  for (const [key, visible] of Object.entries(norm)) {
    if (!visible) {
      off[key] = false;
      anyOff = true;
    }
  }
  return anyOff ? off : undefined;
}

function readMetaShowFromForm() {
  const out = { ...META_SHOW_DEFAULTS };
  $("fMetaShowHost")?.querySelectorAll("[data-meta-show]").forEach((btn) => {
    const key = btn.dataset.metaShow;
    if (key in out) out[key] = btn.classList.contains("is-on");
  });
  return out;
}

function syncMetaFieldVisibility(show) {
  const norm = normalizeMetadataShow(show);
  document.querySelectorAll("[data-meta-field]").forEach((el) => {
    const key = el.dataset.metaField;
    el.classList.toggle("is-meta-field-off", norm[key] === false);
  });
}

function renderMetaShowToggles(show) {
  const host = $("fMetaShowHost");
  if (!host) return;
  const norm = normalizeMetadataShow(show);
  host.innerHTML = "";
  META_SHOW_FIELDS.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ind-studio-meta-chip${norm[key] ? " is-on" : ""}`;
    btn.dataset.metaShow = key;
    btn.textContent = label;
    btn.setAttribute("aria-pressed", norm[key] ? "true" : "false");
    btn.addEventListener("click", () => {
      const on = !btn.classList.contains("is-on");
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      syncMetaFieldVisibility(readMetaShowFromForm());
    });
    host.append(btn);
  });
  syncMetaFieldVisibility(norm);
}

function setAllMetaShow(visible) {
  $("fMetaShowHost")?.querySelectorAll("[data-meta-show]").forEach((btn) => {
    btn.classList.toggle("is-on", visible);
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
  });
  syncMetaFieldVisibility(readMetaShowFromForm());
}

function readMetaNotasFromForm() {
  const host = $("fMetaNotasHost");
  if (!host) return [];
  return [...host.querySelectorAll(".ind-studio-meta-nota")].map((row) => ({
    periodo: row.querySelector("[data-meta-periodo]")?.value.trim() || "",
    texto: row.querySelector("[data-meta-texto]")?.value.trim() || "",
  })).filter((n) => n.texto);
}

function renderMetaNotaRow(periodo = "", texto = "") {
  const row = document.createElement("div");
  row.className = "ind-studio-meta-nota border rounded p-2";
  row.innerHTML = `
    <div class="row g-2 align-items-start">
      <div class="col-md-3">
        <label class="form-label small mb-1">Periodo</label>
        <input type="text" class="form-control form-control-sm" data-meta-periodo placeholder="2010, 1995 -" value="${escapeHtmlAttr(periodo)}" />
      </div>
      <div class="col-md-8">
        <label class="form-label small mb-1">Texto</label>
        <textarea class="form-control form-control-sm" rows="2" data-meta-texto placeholder="Nota para este periodo…">${escapeHtml(texto)}</textarea>
      </div>
      <div class="col-md-1 d-flex align-items-end">
        <button type="button" class="btn btn-sm btn-outline-danger w-100" data-meta-remove title="Quitar nota">×</button>
      </div>
    </div>`;
  row.querySelector("[data-meta-remove]")?.addEventListener("click", () => row.remove());
  return row;
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function renderMetaNotasEditor(notas = []) {
  const host = $("fMetaNotasHost");
  if (!host) return;
  host.innerHTML = "";
  const items = notas.length ? notas : [];
  if (!items.length) {
    host.append(renderMetaNotaRow());
    return;
  }
  items.forEach((n) => host.append(renderMetaNotaRow(n.periodo, n.texto)));
}

function normalizeFooterInput(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/** Texto completo del pie de página tal como está en el catálogo. */
function resolveFooterText(ind) {
  return normalizeFooterInput(
    ind?.presentation?.footer || ind?.export?.footer || ""
  );
}

/** Extrae la línea Fuente: del pie para metadata.fuente (sin alterar el pie). */
function extractFuenteFromFooter(footerText) {
  const text = normalizeFooterInput(footerText);
  if (!text) return "";
  const fuenteLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^fuente:/i.test(l));
  if (fuenteLine) return stripMetaPrefix(fuenteLine, "Fuente:");
  if (!/^nota:/i.test(text)) return stripMetaPrefix(text, "Fuente:");
  return "";
}

const SERIES_COLOR_DEFAULTS_CLARO = [
  "#6342ff",
  "#d08200",
  "#d160c7",
  "#8906b5",
  "#2a9d96",
  "#1a4971",
  "#c0392b",
  "#27ae60",
];
const SERIES_COLOR_DEFAULTS_OSCURO = [
  "#1a4971",
  "#3dbdbd",
  "#8e44ad",
  "#5b2c83",
  "#2db3b3",
  "#6342ff",
  "#e74c3c",
  "#2ecc71",
];

/** @type {object|null} */
let _pendingColors = null;

function renderSeriesColorPickers() {
  const host = $("indStudioSeriesColorsHost");
  if (!host) return;
  const keys = getMultiSelectValues($("fBarMetrics"));
  const fields = parseFieldsText($("fFields")?.value || "");
  const labelOf = (key) => {
    const f = fields.find((x) => x.key === key);
    return (f && f.label) || key;
  };
  const prevClaro = [];
  const prevOscuro = [];
  host.querySelectorAll("input[data-serie-i][data-theme='claro']").forEach((inp) => {
    prevClaro[Number(inp.dataset.serieI)] = inp.value;
  });
  host.querySelectorAll("input[data-serie-i][data-theme='oscuro']").forEach((inp) => {
    prevOscuro[Number(inp.dataset.serieI)] = inp.value;
  });
  const pending = _pendingColors || {};
  const pClaro = pending.claro?.series || [
    pending.claro?.serie1,
    pending.claro?.serie2,
  ].filter(Boolean);
  const pOscuro = pending.oscuro?.series || [
    pending.oscuro?.serie1,
    pending.oscuro?.serie2,
  ].filter(Boolean);

  host.innerHTML = "";
  if (!keys.length) {
    host.innerHTML =
      '<div class="col-12 small text-muted">Elija primero las series de las barras.</div>';
    return;
  }
  keys.forEach((key, i) => {
    const wrap = document.createElement("div");
    wrap.className = "col-md-6 col-lg-4";
    const name = labelOf(key);
    const vClaro =
      prevClaro[i] ||
      pClaro[i] ||
      SERIES_COLOR_DEFAULTS_CLARO[i % SERIES_COLOR_DEFAULTS_CLARO.length];
    const vOscuro =
      prevOscuro[i] ||
      pOscuro[i] ||
      SERIES_COLOR_DEFAULTS_OSCURO[i % SERIES_COLOR_DEFAULTS_OSCURO.length];
    wrap.innerHTML = `
      <div class="small fw-semibold mb-1">${name}</div>
      <div class="d-flex gap-2 align-items-center">
        <label class="small text-muted mb-0">Claro
          <input type="color" class="form-control form-control-color form-control-sm"
            data-serie-i="${i}" data-theme="claro" value="${vClaro}" />
        </label>
        <label class="small text-muted mb-0">Oscuro
          <input type="color" class="form-control form-control-color form-control-sm"
            data-serie-i="${i}" data-theme="oscuro" value="${vOscuro}" />
        </label>
      </div>`;
    host.append(wrap);
  });
}

function readColorsFromForm(template) {
  const presetUi = PRESET_FORM[template] || {};
  const fields = presetUi.fields || [];
  const colors = { claro: {}, oscuro: {} };
  if (fields.includes("bar_colors_simple")) {
    colors.claro.barra = $("fColorBarClaro")?.value;
    colors.claro.barra_hl = $("fColorBarHlClaro")?.value;
    colors.oscuro.barra = $("fColorBarOscuro")?.value;
    colors.oscuro.barra_hl = $("fColorBarHlOscuro")?.value;
  }
  if (fields.includes("bar_colors_series")) {
    const seriesClaro = [];
    const seriesOscuro = [];
    const host = $("indStudioSeriesColorsHost");
    const n = getMultiSelectValues($("fBarMetrics")).length;
    for (let i = 0; i < n; i++) {
      const cInp = host?.querySelector(
        `input[data-serie-i="${i}"][data-theme="claro"]`
      );
      const oInp = host?.querySelector(
        `input[data-serie-i="${i}"][data-theme="oscuro"]`
      );
      seriesClaro.push(
        cInp?.value ||
          SERIES_COLOR_DEFAULTS_CLARO[i % SERIES_COLOR_DEFAULTS_CLARO.length]
      );
      seriesOscuro.push(
        oInp?.value ||
          SERIES_COLOR_DEFAULTS_OSCURO[i % SERIES_COLOR_DEFAULTS_OSCURO.length]
      );
    }
    colors.claro.series = seriesClaro;
    colors.oscuro.series = seriesOscuro;
    if (seriesClaro[0]) colors.claro.serie1 = seriesClaro[0];
    if (seriesClaro[1]) colors.claro.serie2 = seriesClaro[1];
    if (seriesOscuro[0]) colors.oscuro.serie1 = seriesOscuro[0];
    if (seriesOscuro[1]) colors.oscuro.serie2 = seriesOscuro[1];
  }
  if (fields.includes("bar_colors_grouped")) {
    colors.claro.nacional = $("fColorNatClaro")?.value;
    colors.claro.estatal = $("fColorEstClaro")?.value;
    colors.claro.municipio = $("fColorMunClaro")?.value;
    colors.oscuro.nacional = $("fColorNatOscuro")?.value;
    colors.oscuro.estatal = $("fColorEstOscuro")?.value;
    colors.oscuro.municipio = $("fColorMunOscuro")?.value;
  }
  const has =
    Object.values(colors.claro).some(Boolean) ||
    Object.values(colors.oscuro).some(Boolean);
  return has ? colors : null;
}

function writeColorsToForm(colors) {
  _pendingColors = colors || null;
  const c = colors?.claro || {};
  const o = colors?.oscuro || {};
  if ($("fColorBarClaro")) $("fColorBarClaro").value = c.barra || "#5b8def";
  if ($("fColorBarHlClaro")) $("fColorBarHlClaro").value = c.barra_hl || "#0d8a8a";
  if ($("fColorBarOscuro")) $("fColorBarOscuro").value = o.barra || "#5b8def";
  if ($("fColorBarHlOscuro")) $("fColorBarHlOscuro").value = o.barra_hl || "#2dbdb5";
  if ($("fColorNatClaro")) $("fColorNatClaro").value = c.nacional || "#00264d";
  if ($("fColorEstClaro")) $("fColorEstClaro").value = c.estatal || "#00756e";
  if ($("fColorMunClaro")) $("fColorMunClaro").value = c.municipio || "#4d535c";
  if ($("fColorNatOscuro")) $("fColorNatOscuro").value = o.nacional || "#2a6aaf";
  if ($("fColorEstOscuro")) $("fColorEstOscuro").value = o.estatal || "#2dbdb5";
  if ($("fColorMunOscuro")) $("fColorMunOscuro").value = o.municipio || "#9aa3ad";
  renderSeriesColorPickers();
}

function buildIndicatorFromForm() {
  syncFieldsTextareaFromEditor();
  const metricsReady = ensurePresetMetricDefaults();
  if (!metricsReady.ok) {
    throw new Error(metricsReady.error || "Revise presentación (métricas del preset).");
  }
  const id = $("fId").value.trim();
  const profile = $("fProfile").value;
  const handler = $("fHandler").value.trim();
  const template = $("fPreset").value;
  const sortBy = $("fSortBy").value.trim();
  const barMetrics = getMultiSelectValues($("fBarMetrics"));
  const chartMetrics = getMultiSelectValues($("fChartMetrics"));
  const fields = parseFieldsText($("fFields").value);
  const table = $("fTable").value;

  const existing = (_catalog?.indicators || []).find((x) => x.id === id);
  const prevStyle = existing?.presentation?.style || {};

  const presentation = {
    template,
    sort_by: sortBy || (fields[0] && fields[0].key) || id,
    sections: ["top5", "middle", "bottom5"],
  };
  const presetUi = PRESET_FORM[template] || {};
  const usesBars = (presetUi.fields || []).includes("bar_metrics");
  const usesChart = (presetUi.fields || []).includes("chart_metrics");
  if (usesBars && barMetrics.length) presentation.bar_metrics = barMetrics;
  if (usesChart && chartMetrics.length) presentation.chart_metrics = chartMetrics;
  if ($("fTitle").value.trim()) presentation.title = $("fTitle").value.trim();
  const footerText = normalizeFooterInput($("fFooter").value);
  if (footerText) presentation.footer = footerText;

  if ((presetUi.fields || []).includes("ranking")) {
    presentation.ranking = $("fRanking")?.value !== "false";
  }
  if ((presetUi.fields || []).includes("ranking_size")) {
    const n = parseInt($("fRankingSize")?.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 50) {
      presentation.ranking_size = n;
    }
  }
  if ((presetUi.fields || []).includes("y_series")) {
    const ySeries = [];
    if ($("fYNacional")?.checked) ySeries.push("nacional");
    if ($("fYEstatal")?.checked) ySeries.push("estatal");
    if ($("fYMunicipio")?.checked) ySeries.push("municipio");
    if (!ySeries.length) {
      throw new Error("Marque al menos una serie: país, estado o municipio.");
    }
    presentation.y_series = ySeries;
  }

  const colors = readColorsFromForm(template);
  const style = { ...prevStyle };
  if (colors) style.colors = colors;
  else delete style.colors;
  if (Object.keys(style).length) presentation.style = style;

  if (profile === "ranking_with_states") presentation.sections = ["states", "top5", "middle", "bottom5"];
  if (profile === "ranking_with_national_state") {
    presentation.sections = ["top5", "middle", "bottom5", "national", "state"];
  }
  if (profile === "national_state_municipio") {
    presentation.sections = ["national", "state", "municipio"];
  }

  const primary = resolvePrimaryTableFromFields(fields, table);

  const label = $("fLabel").value.trim();
  const metaFuente =
    $("fMetaFuente").value.trim() || extractFuenteFromFooter(footerText);
  const metaShow = metadataShowForCatalog(readMetaShowFromForm());

  const ind = {
    id,
    group_id: $("fGroup").value,
    label,
    subtitle: $("fSubtitle").value.trim(),
    unit: $("fUnit").value.trim(),
    enabled: $("fEnabled").value === "true",
    migration_status: "studio",
    source: { primary_table: primary, scope: "studio" },
    fields,
    presentation,
    metadata: {
      enabled: $("fMetaEnabled").value === "true",
      title: $("fMetaTitle").value.trim() || label,
      periodicidad: $("fMetaPeriodicidad").value.trim(),
      unidad_medida: $("fMetaUnidad").value.trim(),
      fuente: metaFuente,
      nota_general: $("fMetaNotaGeneral").value.trim(),
      notas: readMetaNotasFromForm(),
      fecha_inicial: $("fMetaFechaInicial").value.trim(),
      fecha_final: $("fMetaFechaFinal").value.trim(),
      ultima_actualizacion: $("fMetaUltimaAct").value.trim(),
      ...(metaShow ? { show: metaShow } : {}),
    },
    api: {
      path: `/api/indicators/${id}`,
      params: ["cve_mun", "nom_mun"],
      response_profile: profile,
    },
    export: {
      filename_prefix: $("fExportPrefix").value.trim() || id,
      formats: ["png", "csv", "xlsx"],
      target_selector: "#indicatorFullVizRoot",
      footer: presentation.footer || undefined,
    },
    legacy: {
      menu_flag:
        existing?.legacy?.menu_flag || id.replace(/[^a-zA-Z0-9]/g, "_"),
    },
  };
  if (handler) ind.api.handler = handler;
  if (existing?.api?.legacy_paths?.length) {
    ind.api.legacy_paths = [...existing.api.legacy_paths];
  }

  // Publicación: enlaza un indicador CORE ya guardado (no upsert de métricas).
  const coreKey = ($("fCorePick")?.value || "").trim();
  if (!coreKey) {
    throw new Error("Seleccione un indicador CORE (paso Indicador).");
  }
  let contract = _pickedCoreBundle ? coreContractFromBundle(_pickedCoreBundle) : null;
  if (!contract?.clave) {
    contract = { clave: coreKey, nombre: coreKey, metrics: [] };
  }
  ind.core_indicator_key = coreKey;
  ind.refresh_mold = contract.metrics?.length
    ? buildRefreshMold(contract)
    : existing?.refresh_mold;
  if (!ind.amigo || typeof ind.amigo !== "object") ind.amigo = {};
  ind.amigo.core_clave = coreKey;

  ind.compare = readCompareBlockFromForm();

  return preserveIndicatorConfig(existing, ind);
}

function fillForm(ind) {
  $("indStudioFormEmpty")?.classList.add("d-none");
  $("indStudioCoreForm")?.classList.add("d-none");
  $("indStudioForm")?.classList.remove("d-none");
  showErr($("indStudioFormError"));
  showOk($("indStudioFormOk"));
  $("indStudioPreview").classList.add("d-none");

  $("fId").value = ind.id || "";
  $("fId").readOnly = Boolean(_editingId);
  $("fGroup").value = ind.group_id || (_meta.groups[0] && _meta.groups[0].id) || "socio";
  $("fEnabled").value = ind.enabled === false ? "false" : "true";
  $("fLabel").value = ind.label || "";
  $("fSubtitle").value = ind.subtitle || "";
  $("fUnit").value = ind.unit || "";
  $("fProfile").value = ind.api?.response_profile || "ranking_municipal";
  $("fHandler").value = ind.api?.handler || "";
  $("fPreset").value = ind.presentation?.template || "ranking_dual_bars";
  $("fTitle").value = ind.presentation?.title || "";
  $("fFooter").value = resolveFooterText(ind);
  $("fExportPrefix").value = ind.export?.filename_prefix || ind.id || "";
  const st = ind.fields?.[0]?.source_table || "tab_municipal";
  $("fTable").value = st;
  $("fFields").value = fieldsToText(ind.fields || []);
  renderFieldsEditor(ind.fields || []);
  refreshFieldKeySelects(false);
  if (ind.presentation?.sort_by) $("fSortBy").value = ind.presentation.sort_by;
  setMultiSelectValues($("fBarMetrics"), ind.presentation?.bar_metrics || []);
  setMultiSelectValues($("fChartMetrics"), ind.presentation?.chart_metrics || []);
  if ($("fRanking")) {
    $("fRanking").value = ind.presentation?.ranking === false ? "false" : "true";
  }
  if ($("fRankingSize")) {
    $("fRankingSize").value = String(ind.presentation?.ranking_size ?? 5);
  }
  const ySeries = ind.presentation?.y_series || [
    "nacional",
    "estatal",
    "municipio",
  ];
  if ($("fYNacional")) $("fYNacional").checked = ySeries.includes("nacional");
  if ($("fYEstatal")) $("fYEstatal").checked = ySeries.includes("estatal");
  if ($("fYMunicipio")) $("fYMunicipio").checked = ySeries.includes("municipio");
  writeColorsToForm(ind.presentation?.style?.colors);
  applyPresetFormVisibility();
  if (ind.presentation?.sort_by) $("fSortBy").value = ind.presentation.sort_by;
  setMultiSelectValues($("fBarMetrics"), ind.presentation?.bar_metrics || []);
  setMultiSelectValues($("fChartMetrics"), ind.presentation?.chart_metrics || []);
  renderSeriesColorPickers();
  writeCompareBlockToForm(ind.compare);

  const md = normalizeMetadataFromCatalog(ind.metadata, ind);
  $("fMetaEnabled").value = md.enabled === false ? "false" : "true";
  $("fMetaTitle").value = md.title || "";
  $("fMetaPeriodicidad").value = md.periodicidad || "";
  $("fMetaUnidad").value = md.unidad_medida || "";
  $("fMetaFuente").value =
    md.fuente || extractFuenteFromFooter(resolveFooterText(ind));
  $("fMetaNotaGeneral").value = md.nota_general || "";
  $("fMetaFechaInicial").value = md.fecha_inicial || "";
  $("fMetaFechaFinal").value = md.fecha_final || "";
  $("fMetaUltimaAct").value = md.ultima_actualizacion || "";
  renderMetaNotasEditor(md.notas);
  renderMetaShowToggles(md.show);

  const coreKey = inferCoreClaveFromPublication(ind);
  fillCorePickSelect(coreKey);
  void refreshCorePickSummary();

  showWizardStep(1);
  updateCopyButtonVisibility();
}

function openNew() {
  if (_workspace === "menu") {
    openNewPublication();
    return;
  }
  openNewCore();
}

function openNewPublication() {
  _editingId = null;
  _workspace = "menu";
  setCopyHint("");
  fillForm({
    id: "",
    group_id: "socio",
    enabled: true,
    fields: [],
    presentation: { template: "ranking_dual_bars", sort_by: "" },
    metadata: {
      enabled: true,
      title: "",
      periodicidad: "",
      unidad_medida: "",
      fuente: "",
      nota_general: "",
      notas: [],
      fecha_inicial: "",
      fecha_final: "",
      ultima_actualizacion: "",
    },
    api: { response_profile: "ranking_municipal" },
    export: { filename_prefix: "" },
  });
  $("fId").readOnly = false;
  fillCorePickSelect("");
  void refreshCorePickSummary();
  updateCopyButtonVisibility();
  applyWorkspace();
}

function openNewCore() {
  _editingCoreClave = null;
  _workspace = "core";
  showCoreEditor();
  if ($("fCoreClave")) {
    $("fCoreClave").value = "";
    $("fCoreClave").readOnly = false;
  }
  if ($("fCoreNombre")) $("fCoreNombre").value = "";
  if ($("fCoreTema")) $("fCoreTema").value = "";
  if ($("fCoreDescripcion")) $("fCoreDescripcion").value = "";
  renderMetricsEditor($("indStudioMetricsHost"), {
    replaceState: [emptyMetricRow()],
  });
  if ($("indStudioCoreStatus")) {
    $("indStudioCoreStatus").textContent =
      "Al guardar se escribe solo CORE. Luego puede crear una publicación o cargar datos en Refresh.";
  }
  applyWorkspace();
}

async function openCoreEditor(clave) {
  const key = (clave || "").trim();
  if (!key) return;
  _workspace = "core";
  _editingCoreClave = key;
  showCoreEditor();
  if ($("indStudioCoreStatus")) $("indStudioCoreStatus").textContent = "Cargando…";
  const { res, data } = await adminFetch(
    `/api/amigo/admin/indicators/${encodeURIComponent(key)}`,
    { clearOn401: false }
  );
  if (!res?.ok) {
    showErr(
      $("indStudioCoreFormError"),
      data?.detail?.message || `No hay indicador «${key}» en CORE.`
    );
    applyWorkspace();
    return;
  }
  if ($("fCoreClave")) {
    $("fCoreClave").value = data.indicator?.clave || key;
    $("fCoreClave").readOnly = true;
  }
  if ($("fCoreNombre")) $("fCoreNombre").value = data.indicator?.nombre || "";
  if ($("fCoreTema")) $("fCoreTema").value = data.indicator?.tema || "";
  if ($("fCoreDescripcion")) $("fCoreDescripcion").value = data.indicator?.descripcion || "";
  const rows = metricsFromCoreBundle(data);
  renderMetricsEditor($("indStudioMetricsHost"), {
    replaceState: rows.length ? rows : [emptyMetricRow()],
  });
  if ($("indStudioCoreStatus")) {
    $("indStudioCoreStatus").textContent = `CORE «${key}»: ${rows.length} métrica(s).`;
  }
  applyWorkspace();
}

async function saveCoreIndicator() {
  showErr($("indStudioCoreFormError"));
  showOk($("indStudioCoreFormOk"));
  let contract;
  try {
    contract = buildCoreContractFromForm(coreFormIds());
  } catch (e) {
    showErr($("indStudioCoreFormError"), e.message || String(e));
    return;
  }
  const { res, data } = await adminFetch("/api/amigo/admin/indicators", {
    method: "POST",
    body: JSON.stringify(contract),
  });
  if (!res?.ok) {
    showErr(
      $("indStudioCoreFormError"),
      data?.detail?.message || data?.message || `Error HTTP ${res?.status}`
    );
    return;
  }
  _editingCoreClave = contract.clave;
  if ($("fCoreClave")) $("fCoreClave").readOnly = true;
  await loadMetaAndCatalog();
  await openCoreEditor(contract.clave);
  showOk(
    $("indStudioCoreFormOk"),
    `Indicador «${contract.clave}» guardado en CORE. Ya puede generar el molde en Data Refresh Studio o crear una publicación.`
  );
}

function startPublicationFromCore() {
  const key = ($("fCoreClave")?.value || _editingCoreClave || "").trim();
  if (!key) {
    showErr($("indStudioCoreFormError"), "Guarde el indicador CORE antes de publicar el menú.");
    return;
  }
  _workspace = "menu";
  const existing = (_catalog?.indicators || []).find(
    (x) =>
      x.id === key ||
      x.core_indicator_key === key ||
      x.amigo?.core_clave === key
  );
  if (existing) {
    openIndicator(existing.id);
    showWizardStep(2);
    return;
  }
  openNewPublication();
  if ($("fId")) $("fId").value = key;
  if ($("fLabel") && !$("fLabel").value) $("fLabel").value = $("fCoreNombre")?.value || key;
  fillCorePickSelect(key);
  void refreshCorePickSummary();
  showWizardStep(2);
}

function syncCoreMetricsToDataFields() {
  try {
    const bundle = _pickedCoreBundle;
    const cc = bundle
      ? coreContractFromBundle(bundle)
      : { clave: ($("fCorePick")?.value || "").trim(), metrics: [] };
    if (!cc.clave) throw new Error("Seleccione un indicador CORE.");
    if (!cc.metrics?.length) throw new Error("Ese indicador CORE no tiene métricas.");
    const table = $("fTable")?.value || "tab_municipal";
    const fields = fieldsFromCoreMetrics(cc, table);
    if ($("fFields")) $("fFields").value = fieldsToText(fields);
    renderFieldsEditor(fields);
    refreshFieldKeySelects(true);
    const sort = $("fSortBy");
    if (sort && fields[0]) sort.value = fields[0].key;
    setMultiSelectValues(
      $("fBarMetrics"),
      fields.map((f) => f.key)
    );
    showOk(
      $("indStudioFormOk"),
      `Sincronizados ${fields.length} campos desde métricas CORE. Revise el paso Datos.`
    );
    showWizardStep(3);
  } catch (e) {
    showErr($("indStudioFormError"), e.message || String(e));
  }
}

async function openIndicator(id) {
  const ind = (_catalog.indicators || []).find((x) => x.id === id);
  if (!ind) return;
  _editingId = id;
  _workspace = "menu";
  setCopyHint("");
  fillForm(ind);
  await hydratePublicationCoreLink(ind);
  updateCopyButtonVisibility();
  applyWorkspace();
}

async function onPublish(ev) {
  ev.preventDefault();
  showErr($("indStudioFormError"));
  showOk($("indStudioFormOk"));
  let ind;
  try {
    ind = buildIndicatorFromForm();
  } catch (e) {
    showErr($("indStudioFormError"), e.message || String(e));
    return;
  }
  const { res, data } = await adminFetch("/api/indicators/admin/indicators", {
    method: "POST",
    body: JSON.stringify({ indicator: ind }),
  });
  if (!res?.ok) {
    showErr(
      $("indStudioFormError"),
      data?.detail?.message || data?.message || `Error HTTP ${res?.status}`
    );
    return;
  }
  resetIndicatorsCatalogCache();
  resetPresentationPresetsCache();
  await loadMetaAndCatalog();
  _editingId = ind.id;
  openIndicator(ind.id);
  showOk(
    $("indStudioFormOk"),
    data?.core?.ok
      ? `Publicado «${ind.id}» en el menú, enlazado a CORE «${data.core.clave}». Siguiente: Data Refresh Studio → molde → cargar → Ctrl+F5 en el Atlas.`
      : data?.core_error
        ? `Publicado «${ind.id}» en el menú; aviso CORE: ${data.core_error}`
        : `Publicado «${ind.id}» en el menú. Recargue el Atlas (Ctrl+F5). Cargue valores en Data Refresh Studio.`
  );
}

async function onDelete() {
  if (!_editingId) return;
  if (!window.confirm(`¿Eliminar indicador «${_editingId}» del catálogo?`)) return;
  const { res, data } = await adminFetch(
    `/api/indicators/admin/indicators/${encodeURIComponent(_editingId)}`,
    { method: "DELETE" }
  );
  if (!res?.ok) {
    showErr($("indStudioFormError"), data?.detail?.message || "No se pudo eliminar");
    return;
  }
  resetIndicatorsCatalogCache();
  _editingId = null;
  $("indStudioForm").classList.add("d-none");
  $("indStudioFormEmpty").classList.remove("d-none");
  await loadMetaAndCatalog();
  showOk($("indStudioFormOk"), "Eliminado. Recargue el Atlas.");
}

async function onPreview() {
  const id = $("fId").value.trim() || _editingId;
  if (!id) {
    showErr($("indStudioFormError"), "Guarde el indicador antes de previsualizar, o indique un id existente.");
    return;
  }
  const { res, data } = await adminFetch("/api/indicators/admin/preview", {
    method: "POST",
    body: JSON.stringify({ indicator_id: id, cve_mun: "001" }),
  });
  const pre = $("indStudioPreview");
  pre.classList.remove("d-none");
  if (!res?.ok) {
    pre.textContent = JSON.stringify(data?.detail || data, null, 2);
    return;
  }
  pre.textContent = JSON.stringify(
    {
      ok: data.ok,
      indicator_id: data.indicator_id,
      response_profile: data.response_profile,
      handler: data.handler,
      top5: data.top5?.slice?.(0, 2),
      states: data.states?.slice?.(0, 2),
      keys: Object.keys(data),
    },
    null,
    2
  );
}

function mapDbTypeToFieldType(dataType) {
  const t = String(dataType || "").toLowerCase();
  if (
    t.includes("int") ||
    t === "smallint" ||
    t === "bigint" ||
    t === "serial" ||
    t === "bigserial"
  ) {
    return "integer";
  }
  if (
    t.includes("numeric") ||
    t.includes("decimal") ||
    t.includes("double") ||
    t.includes("real") ||
    t.includes("float")
  ) {
    return "float";
  }
  return "text";
}

function humanizeColumnLabel(name) {
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function existingFieldKeys() {
  return new Set(parseFieldsText($("fFields")?.value || "").map((f) => f.key));
}

function addFieldLineFromColumn(col) {
  const name = (col?.name || "").trim();
  if (!name) return;
  syncFieldsTextareaFromEditor();
  const keys = existingFieldKeys();
  if (keys.has(name)) {
    if ($("indStudioColsHint")) {
      $("indStudioColsHint").textContent = `«${name}» ya está en la lista.`;
    }
    return;
  }
  const type = mapDbTypeToFieldType(col.data_type);
  const label = humanizeColumnLabel(name);
  const fields = parseFieldsText($("fFields")?.value || "");
  fields.push({
    key: name,
    column: name,
    label,
    type,
    source_table: $("fTable")?.value || "tab_municipal",
  });
  if ($("fFields")) $("fFields").value = fieldsToText(fields);
  renderFieldsEditor(fields);
  refreshFieldKeySelects(true);
  renderSeriesColorPickers();
  refreshColsPickerSelectedState();
  if ($("indStudioColsHint")) {
    $("indStudioColsHint").textContent = `Añadida «${label}» (${name}). Clic en otra para seguir armando la lista.`;
  }
}

function refreshColsPickerSelectedState() {
  const host = $("indStudioColsPicker");
  if (!host) return;
  const keys = existingFieldKeys();
  host.querySelectorAll("[data-col-name]").forEach((btn) => {
    const name = btn.getAttribute("data-col-name");
    const on = keys.has(name);
    btn.classList.toggle("is-added", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on
      ? `${name} (ya en la lista)`
      : `Añadir ${name} a columnas de la vista`;
  });
}

function renderColsPicker(table, columns) {
  const host = $("indStudioColsPicker");
  const hint = $("indStudioColsHint");
  if (!host) return;
  if (!columns.length) {
    host.classList.add("d-none");
    host.innerHTML = "";
    if (hint) hint.textContent = `No hay columnas en ${table}.`;
    return;
  }
  host.classList.remove("d-none");
  host.innerHTML = "";
  const intro = document.createElement("p");
  intro.className = "small text-muted mb-2";
  intro.textContent = `Columnas en ${table} — haga clic para agregarlas a la lista:`;
  host.append(intro);
  const wrap = document.createElement("div");
  wrap.className = "ind-studio-cols-picker__list";
  for (const col of columns) {
    const name = col.name;
    if (!name) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm ind-studio-col-chip";
    btn.setAttribute("data-col-name", name);
    btn.textContent = name;
    btn.addEventListener("click", () => addFieldLineFromColumn(col));
    wrap.append(btn);
  }
  host.append(wrap);
  refreshColsPickerSelectedState();
  if (hint) {
    hint.textContent = `${columns.length} columnas. Clic para armar la lista.`;
  }
}

async function onLoadCols() {
  const table = $("fTable").value;
  const hint = $("indStudioColsHint");
  if (hint) hint.textContent = "Cargando columnas…";
  const { res, data } = await adminFetch(
    `/api/indicators/admin/tables/${encodeURIComponent(table)}/columns`
  );
  if (!res?.ok) {
    if (hint) {
      hint.textContent = data?.detail?.message || "Error al cargar columnas";
    }
    $("indStudioColsPicker")?.classList.add("d-none");
    return;
  }
  renderColsPicker(table, data.columns || []);
}

function bindForm() {
  $("indStudioForm")?.addEventListener("submit", onPublish);
  $("indStudioNewBtn")?.addEventListener("click", openNew);
  $("indStudioCopyBtn")?.addEventListener("click", () => {
    if (_editingId) copyIndicatorAsNew(_editingId);
  });
  $("indStudioCopyBtnReview")?.addEventListener("click", () => {
    if (_editingId) copyIndicatorAsNew(_editingId);
  });
  $("indStudioDeleteBtn")?.addEventListener("click", () => void onDelete());
  $("indStudioPreviewBtn")?.addEventListener("click", () => void onPreview());
  $("indStudioLoadColsBtn")?.addEventListener("click", () => void onLoadCols());
  $("indStudioAuditRefreshBtn")?.addEventListener("click", () => void loadAuditLog());
  $("indStudioFieldAddBtn")?.addEventListener("click", () => addEmptyFieldRow());
  $("indStudioMetricAddBtn")?.addEventListener("click", () =>
    addMetricRow($("indStudioMetricsHost"))
  );
  $("indStudioCoreSaveBtn")?.addEventListener("click", () => void saveCoreIndicator());
  $("indStudioCoreToPubBtn")?.addEventListener("click", () => startPublicationFromCore());
  $("indStudioCoreOpenEditorBtn")?.addEventListener("click", () => {
    const key = ($("fCorePick")?.value || "").trim();
    if (key) void openCoreEditor(key);
  });
  $("indStudioCoreSyncFieldsBtn")?.addEventListener("click", () =>
    syncCoreMetricsToDataFields()
  );
  $("indStudioWsCore")?.addEventListener("click", () => setWorkspace("core"));
  $("indStudioWsMenu")?.addEventListener("click", () => setWorkspace("menu"));
  $("fCorePick")?.addEventListener("change", () => void refreshCorePickSummary());
  $("indStudioWizardBack")?.addEventListener("click", () => {
    showErr($("indStudioFormError"));
    showWizardStep(wizardNav.getStep() - 1);
  });
  $("indStudioWizardNext")?.addEventListener("click", () => {
    const err = validateWizardStep(wizardNav.getStep());
    if (err) {
      showErr($("indStudioFormError"), err);
      return;
    }
    showErr($("indStudioFormError"));
    showWizardStep(wizardNav.getStep() + 1);
  });
  $("fPreset")?.addEventListener("change", () => applyPresetFormVisibility());
  $("fCompareEnabled")?.addEventListener("change", () => syncCompareAdvancedUi());
  $("fCompareTemporalEnable")?.addEventListener("change", () => syncCompareAdvancedUi());
  $("fCompareAdvancedToggle")?.addEventListener("click", () => toggleCompareAdvancedPanel());
  $("fTable")?.addEventListener("change", () => {
    $("indStudioColsPicker")?.classList.add("d-none");
    if ($("indStudioColsHint")) $("indStudioColsHint").textContent = "";
  });
  $("fBarMetrics")?.addEventListener("change", () => renderSeriesColorPickers());
  $("fMetaNotasAdd")?.addEventListener("click", () => {
    $("fMetaNotasHost")?.append(renderMetaNotaRow());
  });
  $("fMetaShowAll")?.addEventListener("click", () => setAllMetaShow(true));
  $("fMetaShowNone")?.addEventListener("click", () => setAllMetaShow(false));
  $("fUnit")?.addEventListener("input", () => {
    if (!$("fMetaUnidad").value.trim() && $("fUnit").value.trim()) {
      const u = $("fUnit").value.trim();
      $("fMetaUnidad").value = u.charAt(0).toUpperCase() + u.slice(1);
    }
  });
}

async function main() {
  const errBox = $("indStudioError");
  try {
    const shell = createStudioShell(
      studioIdsFromPrefix("indStudio", { loginError: "indStudioError" }),
      {
        activeNav: "indicators",
        onEnterDashboard: () => loadMetaAndCatalog(),
        onDashboardError: (err) =>
          showErr($("indStudioError"), err?.message || String(err)),
      }
    );
    await shell.boot();
  } catch (err) {
    console.error(err);
    if (errBox) {
      errBox.classList.remove("d-none");
      errBox.textContent = err?.message || String(err);
    }
  }
  try {
    bindForm();
  } catch (err) {
    console.error("bindForm", err);
  }
}

main();
