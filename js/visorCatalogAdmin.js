/**
 * Asistente admin: publicar capa en el catálogo del visor (Fase 1).
 */
import { adminFetch, isVisorAdminLoggedIn, verifyAdminSession } from "./visorAdminAuth.js";
import { ensureVisorLayersHeaderToolbar } from "./visorLayersToolbar.js";
import { reloadVisorLayerCatalog } from "./visorLayers.js";
import { purgeOrphanModalBackdrops } from "./atlasModalCleanup.js";
import { renderAdminStylePreview } from "./visorAdminStylePreview.js";

let _publishBtn = null;
let _manageBtn = null;
let _modalEl = null;
let _meta = null;
let _attached = false;
let _wizardBusy = false;
let _modalFooterMode = "wizard";

const PUBLISH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const MANAGE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8"/>
  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2.07 2.07 0 0 1-2.93 2.93l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2.07 2.07 0 0 1-4.14 0v-.07a1.7 1.7 0 0 0-1.1-1.54 1.7 1.7 0 0 0-1.87.34l-.05.05a2.07 2.07 0 0 1-2.93-2.93l.05-.05a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.54-1H3a2.07 2.07 0 0 1 0-4.14h.09a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2.07 2.07 0 0 1 2.93-2.93l.05.05a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 9 3.09V3a2.07 2.07 0 0 1 4.14 0v.09a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.87-.34l.05-.05a2.07 2.07 0 0 1 2.93 2.93l-.05.05a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.54 1H21a2.07 2.07 0 0 1 0 4.14h-.09a1.7 1.7 0 0 0-1.54 1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
</svg>`;

/** Plantillas DENUE frecuentes (códigos SCIAN + icono sugerido). */
const DENUE_CATALOG_PRESETS = [
  { key: "denue_rastros", label: "Rastros (sacrificio de ganado)", codigo_act: [311611], icon_key: "denue_rastros" },
  { key: "denue_gasolinerias", label: "Gasolinerías", codigo_act: [468411], icon_key: "denue_gasolinerias" },
  { key: "denue_gaseras", label: "Gaseras", codigo_act: [468412], icon_key: "denue_gaseras" },
  {
    key: "denue_escuelas",
    label: "Escuelas",
    codigo_act: [
      611112, 611122, 611132, 611142, 611152, 611162, 611172, 611182,
      611212, 611312, 611422, 611432, 611512, 611612, 611622, 611632,
    ],
    icon_key: "denue_escuelas",
  },
  { key: "denue_hospitales", label: "Hospitales (DENUE)", codigo_act: [622112], icon_key: "denue_hospitales" },
  { key: "denue_museos", label: "Museos", codigo_act: [712112], icon_key: "denue_museos" },
  { key: "denue_cementerios", label: "Cementerios", codigo_act: [812322], icon_key: "denue_cementerios" },
  { key: "denue_iglesias", label: "Iglesias/Templos", codigo_act: [813210], icon_key: "denue_iglesias" },
];

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layerIdFromTable(table) {
  return String(table || "")
    .replace(/^c_/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

function slugGroupIdFromLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

async function refreshCatalogAfterGroupChange() {
  await loadMeta();
  await reloadVisorLayerCatalog();
  document.dispatchEvent(new CustomEvent("atlasgro-visor-layers-panel-refresh"));
}

function syncPublishButton() {
  if (!_publishBtn) return;
  const show = isVisorAdminLoggedIn();
  _publishBtn.classList.toggle("d-none", !show);
  _publishBtn.disabled = !show;
}

async function loadMeta() {
  const { res, data, networkError } = await adminFetch("/api/visor/admin/meta");
  if (networkError || !res?.ok) {
    throw new Error(apiErrorMessage(data, "No se pudo cargar metadatos del asistente"));
  }
  _meta = data;
  return data;
}

function ensureModal() {
  if (_modalEl) return _modalEl;
  const wrap = document.createElement("div");
  wrap.id = "visorCatalogAdminModal";
  wrap.className = "visor-admin-modal d-none";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "visorCatalogAdminTitle");
  wrap.innerHTML = `
    <div class="visor-admin-modal__backdrop"></div>
    <div class="visor-admin-modal__panel card shadow">
      <div class="card-header d-flex align-items-start justify-content-between gap-2 py-2">
        <div class="min-w-0 flex-grow-1">
          <div class="fw-semibold small" id="visorCatalogAdminTitle">Publicar capa en el visor</div>
          <nav id="visorAdminStepNav" class="visor-admin-step-nav" aria-label="Pasos del asistente"></nav>
        </div>
        <button type="button" class="btn-close btn-close-sm mt-1 flex-shrink-0" aria-label="Cerrar"></button>
      </div>
      <div class="card-body visor-admin-modal__body atlas-scroll"></div>
      <div class="card-footer d-flex justify-content-between gap-2 py-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-act="prev">Atrás</button>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-act="cancel">Cancelar</button>
          <button type="button" class="btn btn-sm btn-primary" data-act="next">Siguiente</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector(".visor-admin-modal__backdrop")?.addEventListener("click", closeModal);
  wrap.querySelector(".btn-close")?.addEventListener("click", closeModal);
  wrap.querySelector('[data-act="cancel"]')?.addEventListener("click", closeModal);
  _modalEl = wrap;
  bindWizardStepNavOnce();
  return wrap;
}

function bindWizardStepNavOnce() {
  const modal = _modalEl;
  if (!modal || modal.dataset.stepNavBound) return;
  modal.dataset.stepNavBound = "1";
  modal.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-wizard-step]");
    if (!btn || btn.disabled || modal.classList.contains("d-none")) return;
    const idx = Number(btn.getAttribute("data-wizard-step"));
    if (!Number.isFinite(idx)) return;
    await goToWizardStep(idx);
  });
}

function closeModal() {
  _modalEl?.classList.add("d-none");
  purgeOrphanModalBackdrops();
}

function setModalTitle(text) {
  const el = document.getElementById("visorCatalogAdminTitle");
  if (el) el.textContent = text;
}

function syncAdminButtons() {
  syncPublishButton();
  if (!_manageBtn) return;
  const show = isVisorAdminLoggedIn();
  _manageBtn.classList.toggle("d-none", !show);
  _manageBtn.disabled = !show;
}

const wizard = {
  mode: "create",
  editingLayerId: "",
  step: 0,
  table: "",
  label: "",
  group_id: "",
  geometry: "line",
  style_preset: "line_outline",
  color: "#8c5f37",
  icon_key: "",
  style_field: "",
  default_color: "#94a3b8",
  style_classes: [],
  denue_codigo_act: [],
  denue_use_template: true,
  denue_preset_key: "",
  martin_needs_restart: false,
  table_source: "martin",
  shp_uploaded: false,
  export_kml: true,
  export_shp: true,
  export_kml_name_field: "",
  mun_scope: "municipio",
  identify_fields: [],
  identify_title: "",
  labels_enabled: false,
  labels_field: "",
  labels_minzoom: 14,
  layer_minzoom_enabled: false,
  style_minzoom: 14,
  labels_above_icon: true,
  labels_color: "#2c3e50",
  export_columns: [],
  table_columns: [],
  columns_load_error: "",
  distinct_values: [],
  distinct_total: 0,
  distinct_truncated: false,
  search_enabled: false,
  search_tipo: "",
  search_name_column: "",
  search_id_column: "cvegeo",
  search_columns: [],
  style_opacity_pct: 92,
  style_width: 2,
  style_halo_width: 4,
  style_halo_color: "",
  style_outline_color: "#64748b",
  style_outline_width: 0,
  style_radius: 5,
  style_stroke_color: "#ffffff",
  style_stroke_width: 1,
  style_line_dash: "solid",
  style_icon_scale: 1,
  labels_offset_x: 0,
  labels_offset_y: 0,
  maxStepReached: 0,
  style_tab: "basic",
  data_filter_enabled: false,
  data_filter_field: "",
  data_filter_values: [],
  spatial_enabled: false,
  spatial_modo: "",
  spatial_fields: [],
  spatial_detail_table: false,
  spatial_detail_columns: [],
  spatial_ui_unidad: "",
  spatial_ui_empty_msg: "",
  tabular_enabled: false,
  tabular_columns: [],
  cluster_enabled: false,
  cluster_preset: "standard",
  table_column_defs: [],
};

/** @typedef {{ id: string, title: string, panel?: string }} WizardStepDef */

const WIZARD_STEP = {
  TABLES: "tables",
  LAYER: "layer",
  IDENTIFY: "identify",
  STYLE: "style",
  MAP: "map",
  REVIEW: "review",
};

/** @returns {WizardStepDef[]} */
function wizardSteps() {
  if (wizard.mode === "edit") {
    return [
      { id: WIZARD_STEP.LAYER, title: "Capa", panel: "layer" },
      { id: WIZARD_STEP.IDENTIFY, title: "Identificación", panel: "columns" },
      { id: WIZARD_STEP.STYLE, title: "Simbología", panel: "style" },
      { id: WIZARD_STEP.MAP, title: "Etiquetas y búsqueda", panel: "map" },
      { id: WIZARD_STEP.REVIEW, title: "Revisión", panel: "review" },
    ];
  }
  return [
    { id: WIZARD_STEP.TABLES, title: "Tabla", panel: "layer" },
    { id: WIZARD_STEP.LAYER, title: "Capa", panel: "layer" },
    { id: WIZARD_STEP.IDENTIFY, title: "Identificación", panel: "columns" },
    { id: WIZARD_STEP.STYLE, title: "Simbología", panel: "style" },
    { id: WIZARD_STEP.MAP, title: "Etiquetas y búsqueda", panel: "map" },
    { id: WIZARD_STEP.REVIEW, title: "Revisión", panel: "review" },
  ];
}

function wizardStepDef(stepIndex = wizard.step) {
  return wizardSteps()[stepIndex] || null;
}

function wizardMaxStep() {
  return Math.max(0, wizardSteps().length - 1);
}

function isMapStepSkipped() {
  return !wizard.labels_enabled && !wizard.search_enabled;
}

function isStepSkipped(stepDef) {
  return stepDef?.id === WIZARD_STEP.MAP && isMapStepSkipped();
}

function findWizardStepIndex(stepId) {
  return wizardSteps().findIndex((s) => s.id === stepId);
}

/** @param {number} fromIndex @param {number} delta */
function adjacentWizardStep(fromIndex, delta) {
  const steps = wizardSteps();
  let i = fromIndex + delta;
  while (i >= 0 && i < steps.length) {
    if (!isStepSkipped(steps[i])) return i;
    i += delta;
  }
  return fromIndex;
}

function isLastNavigableStep() {
  return adjacentWizardStep(wizard.step, 1) === wizard.step;
}

function canNavigateToStep(targetIndex) {
  const steps = wizardSteps();
  if (targetIndex < 0 || targetIndex >= steps.length) return false;
  if (targetIndex === wizard.step) return true;
  if (steps[targetIndex].id === WIZARD_STEP.MAP) return true;
  return targetIndex <= wizard.maxStepReached;
}

function validateWizardStep(stepId) {
  if (wizard.mode === "create" && stepId === WIZARD_STEP.TABLES) {
    if (wizard.table_source === "shp" && !wizard.shp_uploaded) {
      return "Importe el shapefile antes de continuar.";
    }
    if (!wizard.table) {
      return "Seleccione o importe una tabla.";
    }
  }
  if (stepId === WIZARD_STEP.STYLE && isByAttributePreset(wizard.style_preset)) {
    if (!wizard.style_field?.trim()) {
      return "Seleccione el campo de clasificación para el preset por atributo.";
    }
    if (!normalizeStyleClasses(wizard.style_classes).length) {
      return "Agregue al menos una clase valor/color o use Autoclasificar.";
    }
  }
  return null;
}

async function goToWizardStep(targetIndex) {
  const steps = wizardSteps();
  if (targetIndex < 0 || targetIndex >= steps.length) return;
  if (targetIndex === wizard.step) return;
  if (!canNavigateToStep(targetIndex)) return;

  const current = wizard.step;
  if (targetIndex > current) {
    if (current > 0 || wizard.mode === "edit") readStepFields();
    for (let i = current; i < targetIndex; i += 1) {
      const sid = steps[i]?.id;
      if (!sid) continue;
      const err = validateWizardStep(sid);
      if (err) {
        window.alert(err);
        return;
      }
    }
  } else {
    readStepFields();
  }

  wizard.step = targetIndex;
  wizard.maxStepReached = Math.max(wizard.maxStepReached, targetIndex);
  await renderWizardStep();
}

async function advanceWizardStep() {
  if (_wizardBusy) return;
  if (isLastNavigableStep()) {
    readStepFields();
    const err = validateWizardStep(wizardStepDef()?.id);
    if (err) {
      window.alert(err);
      return;
    }
    _wizardBusy = true;
    const btnNext = ensureModal().querySelector('[data-act="next"]');
    if (btnNext) btnNext.disabled = true;
    try {
      await saveLayer();
    } finally {
      _wizardBusy = false;
      if (btnNext) btnNext.disabled = false;
    }
    return;
  }
  if (wizard.step > 0 || wizard.mode === "edit") readStepFields();
  const err = validateWizardStep(wizardStepDef()?.id);
  if (err) {
    window.alert(err);
    return;
  }
  const next = adjacentWizardStep(wizard.step, 1);
  wizard.step = next;
  wizard.maxStepReached = Math.max(wizard.maxStepReached, next);
  await renderWizardStep();
}

async function retreatWizardStep() {
  if (wizard.step <= 0) return;
  readStepFields();
  wizard.step = adjacentWizardStep(wizard.step, -1);
  await renderWizardStep();
}

function renderWizardStepNav() {
  const nav = document.getElementById("visorAdminStepNav");
  if (!nav) return;
  const steps = wizardSteps();
  const cur = wizard.step;
  nav.innerHTML = `
    <ol class="visor-admin-step-nav__list mb-0">
      ${steps
        .map((s, i) => {
          const skipped = isStepSkipped(s);
          const locked = !canNavigateToStep(i) && i !== cur;
          const cls = [
            "visor-admin-step-nav__item",
            i === cur ? "is-current" : "",
            i < cur ? "is-done" : "",
            skipped ? "is-skipped" : "",
            locked ? "is-locked" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `
        <li class="${cls}">
          <button type="button" class="visor-admin-step-nav__btn" data-wizard-step="${i}" ${locked ? "disabled" : ""} aria-current="${i === cur ? "step" : "false"}" title="${skipped ? "Opcional (sin etiquetas ni buscador)" : escapeHtml(s.title)}">
            <span class="visor-admin-step-nav__num" aria-hidden="true">${i + 1}</span>
            <span class="visor-admin-step-nav__label">${escapeHtml(s.title)}${skipped ? '<span class="visor-admin-step-nav__opt"> (opc.)</span>' : ""}</span>
          </button>
        </li>`;
        })
        .join("")}
    </ol>`;
}

async function renderStepById(stepId, body) {
  switch (stepId) {
    case WIZARD_STEP.TABLES:
      await renderStepTables(body);
      break;
    case WIZARD_STEP.LAYER:
      renderStepDetails(body);
      break;
    case WIZARD_STEP.IDENTIFY:
      await renderStepIdentify(body);
      break;
    case WIZARD_STEP.STYLE:
      renderStepStyle(body);
      break;
    case WIZARD_STEP.MAP:
      await renderStepMap(body);
      break;
    case WIZARD_STEP.REVIEW:
      renderStepReview(body);
      break;
    default:
      body.innerHTML = `<p class="small text-danger mb-0">Paso desconocido.</p>`;
  }
}

function resetWizardForCreate() {
  wizard.mode = "create";
  wizard.editingLayerId = "";
  wizard.step = 0;
  wizard.table = "";
  wizard.label = "";
  wizard.group_id = _meta?.groups?.[0]?.id || "servicios";
  wizard.geometry = "line";
  wizard.style_preset = "line_outline";
  wizard.color = "#8c5f37";
  wizard.icon_key = "";
  wizard.style_field = "";
  wizard.default_color = "#94a3b8";
  wizard.style_classes = [];
  wizard.denue_codigo_act = [];
  wizard.denue_use_template = true;
  wizard.denue_preset_key = "";
  wizard.martin_needs_restart = false;
  wizard.export_kml = true;
  wizard.export_shp = true;
  wizard.export_kml_name_field = "";
  wizard.mun_scope = "municipio";
  wizard.identify_fields = [{ column: "gid", label: "Identificador" }];
  wizard.identify_title = "";
  wizard.labels_enabled = false;
  wizard.labels_field = "";
  wizard.labels_minzoom = 14;
  wizard.layer_minzoom_enabled = false;
  wizard.style_minzoom = 14;
  wizard.labels_above_icon = true;
  wizard.labels_color = "#2c3e50";
  wizard.export_columns = [];
  wizard.table_columns = [];
  wizard.columns_load_error = "";
  wizard.distinct_values = [];
  wizard.distinct_total = 0;
  wizard.distinct_truncated = false;
  wizard.search_enabled = false;
  wizard.search_tipo = "";
  wizard.search_name_column = "";
  wizard.search_id_column = "cvegeo";
  wizard.search_columns = [];
  wizard.style_opacity_pct = 92;
  wizard.style_width = 2;
  wizard.style_halo_width = 4;
  wizard.style_halo_color = "";
  wizard.style_outline_color = "#64748b";
  wizard.style_outline_width = 0;
  wizard.style_radius = 5;
  wizard.style_stroke_color = "#ffffff";
  wizard.style_stroke_width = 1;
  wizard.style_line_dash = "solid";
  wizard.style_icon_scale = 1;
  wizard.labels_offset_x = 0;
  wizard.labels_offset_y = 0;
  wizard.maxStepReached = 0;
  wizard.style_tab = "basic";
  wizard.data_filter_enabled = false;
  wizard.data_filter_field = "";
  wizard.data_filter_values = [];
  wizard.spatial_enabled = false;
  wizard.spatial_modo = "";
  wizard.spatial_fields = [];
  wizard.spatial_detail_table = false;
  wizard.spatial_detail_columns = [];
  wizard.spatial_ui_unidad = "";
  wizard.spatial_ui_empty_msg = "";
  wizard.tabular_enabled = false;
  wizard.tabular_columns = [];
  wizard.cluster_enabled = false;
  wizard.cluster_preset = "standard";
  wizard.table_column_defs = [];
}

const LINE_DASH_PRESETS = {
  solid: null,
  dashed: [4, 2],
  dotted: [1, 2.5],
  long: [8, 4],
};

function lineDashKeyFromArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return "solid";
  const key = JSON.stringify(arr);
  for (const [k, v] of Object.entries(LINE_DASH_PRESETS)) {
    if (v && JSON.stringify(v) === key) return k;
  }
  return "dashed";
}

function opacityToPercent(opacity) {
  const n = Number(opacity);
  if (!Number.isFinite(n)) return 92;
  return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

function percentToOpacity(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0.92;
  return Math.max(0, Math.min(100, n)) / 100;
}

function applyCatalogStyleToWizard(style = {}) {
  wizard.style_opacity_pct = opacityToPercent(style.opacity ?? 0.92);
  wizard.style_width = style.width ?? 2;
  wizard.style_halo_width = style.halo_width ?? 4;
  wizard.style_halo_color = style.halo_color || style.color || wizard.color;
  wizard.style_outline_color = style.outline_color || "#64748b";
  wizard.style_outline_width = style.outline_width ?? 0;
  wizard.style_radius = style.radius ?? 5;
  wizard.style_stroke_color = style.stroke_color || "#ffffff";
  wizard.style_stroke_width = style.stroke_width ?? 1;
  wizard.style_line_dash = lineDashKeyFromArray(style.line_dash);
  wizard.style_icon_scale = style.icon_scale ?? 1;
  if (style.minzoom != null && Number.isFinite(Number(style.minzoom))) {
    wizard.layer_minzoom_enabled = true;
    wizard.style_minzoom = Number(style.minzoom);
  } else {
    wizard.layer_minzoom_enabled = false;
    wizard.style_minzoom = defaultLayerMinzoom(wizard.geometry);
  }
  const cl = style.cluster || {};
  wizard.cluster_enabled = Boolean(cl.enabled);
  wizard.cluster_preset = cl.preset || "standard";
}

function readAdvancedStyleFromDom() {
  const op = document.getElementById("visorAdminStyleOpacity");
  if (op) wizard.style_opacity_pct = Number(op.value) || wizard.style_opacity_pct;
  const w = document.getElementById("visorAdminStyleWidth");
  if (w) wizard.style_width = Number(w.value) || wizard.style_width;
  const hw = document.getElementById("visorAdminStyleHaloWidth");
  if (hw) wizard.style_halo_width = Number(hw.value) || wizard.style_halo_width;
  const hc = document.getElementById("visorAdminStyleHaloColor");
  if (hc) wizard.style_halo_color = hc.value?.trim() || wizard.style_halo_color;
  const oc = document.getElementById("visorAdminStyleOutlineColor");
  if (oc) wizard.style_outline_color = oc.value?.trim() || wizard.style_outline_color;
  const ow = document.getElementById("visorAdminStyleOutlineWidth");
  if (ow) wizard.style_outline_width = Number(ow.value) || 0;
  const r = document.getElementById("visorAdminStyleRadius");
  if (r) wizard.style_radius = Number(r.value) || wizard.style_radius;
  const sc = document.getElementById("visorAdminStyleStrokeColor");
  if (sc) wizard.style_stroke_color = sc.value?.trim() || wizard.style_stroke_color;
  const sw = document.getElementById("visorAdminStyleStrokeWidth");
  if (sw) wizard.style_stroke_width = Number(sw.value) || wizard.style_stroke_width;
  const dash = document.getElementById("visorAdminStyleLineDash");
  if (dash) wizard.style_line_dash = dash.value || "solid";
  const iscale = document.getElementById("visorAdminStyleIconScale");
  if (iscale) wizard.style_icon_scale = Number(iscale.value) || 1;
}

function mergeAdvancedStyleIntoPayload(style, preset) {
  const opacity = percentToOpacity(wizard.style_opacity_pct);
  style.opacity = opacity;
  const p = preset || wizard.style_preset || "";
  const geom = wizard.geometry;
  const isAttr = isByAttributePreset(p);
  if (p === "point_default" || (isAttr && geom === "point" && p === "point_by_attribute")) {
    style.radius = Number(wizard.style_radius) || 5;
    style.stroke_color = wizard.style_stroke_color || "#ffffff";
    style.stroke_width = Number(wizard.style_stroke_width) || 1;
  }
  if (p === "point_symbol" || p === "point_symbol_by_attribute") {
    const scale = Number(wizard.style_icon_scale);
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) style.icon_scale = scale;
  }
  if (geom === "line" && (p === "line_simple" || p === "line_outline" || p === "line_by_attribute")) {
    style.width = Number(wizard.style_width) || 2;
    const dash = LINE_DASH_PRESETS[wizard.style_line_dash];
    if (dash) style.line_dash = [...dash];
    else if (style.line_dash) delete style.line_dash;
  }
  if (p === "line_outline") {
    style.halo_width = Number(wizard.style_halo_width) || 4;
    style.halo_color = wizard.style_halo_color || style.color || wizard.color;
  }
  if (geom === "polygon" && (p === "polygon_fill" || p === "polygon_by_attribute")) {
    style.outline_color = wizard.style_outline_color || style.outline_color || "#64748b";
    const ow = Number(wizard.style_outline_width);
    if (Number.isFinite(ow) && ow > 0) style.outline_width = ow;
    else if (style.outline_width) delete style.outline_width;
  }
  if (geom === "point" && wizard.cluster_enabled) {
    style.cluster = { enabled: true, preset: wizard.cluster_preset || "standard" };
  } else if (style.cluster) {
    delete style.cluster;
  }
  return style;
}

function styleAdvancedControlsHtml({ inTab = false } = {}) {
  const op = wizard.style_opacity_pct ?? 92;
  return `
    <div class="visor-admin-style-advanced ${inTab ? "" : "border rounded p-2 mt-2"}" id="visorAdminStyleAdvanced">
      ${inTab ? "" : '<div class="fw-semibold small mb-2">Apariencia avanzada</div>'}
      <div class="row g-2">
        <div class="col-sm-6" id="visorAdminStyleOpacityWrap">
          <label class="form-label small mb-1" for="visorAdminStyleOpacity">Opacidad (<span id="visorAdminStyleOpacityVal">${op}</span>%)</label>
          <input type="range" class="form-range" id="visorAdminStyleOpacity" min="0" max="100" step="5" value="${op}" />
        </div>
        <div class="col-sm-6 d-none" id="visorAdminStyleRadiusWrap">
          <label class="form-label small mb-1" for="visorAdminStyleRadius">Tamaño del punto (radio px)</label>
          <input type="number" class="form-control form-control-sm" id="visorAdminStyleRadius" min="2" max="24" step="0.5" value="${escapeHtml(String(wizard.style_radius ?? 5))}" />
        </div>
        <div class="col-sm-6 d-none" id="visorAdminStyleIconScaleWrap">
          <label class="form-label small mb-1" for="visorAdminStyleIconScale">Escala del icono</label>
          <input type="number" class="form-control form-control-sm" id="visorAdminStyleIconScale" min="0.4" max="3" step="0.1" value="${escapeHtml(String(wizard.style_icon_scale ?? 1))}" />
        </div>
        <div class="col-sm-4 d-none" id="visorAdminStyleWidthWrap">
          <label class="form-label small mb-1" for="visorAdminStyleWidth">Grosor de línea</label>
          <input type="number" class="form-control form-control-sm" id="visorAdminStyleWidth" min="0.5" max="12" step="0.5" value="${escapeHtml(String(wizard.style_width ?? 2))}" />
        </div>
        <div class="col-sm-4 d-none" id="visorAdminStyleHaloWidthWrap">
          <label class="form-label small mb-1" for="visorAdminStyleHaloWidth">Grosor contorno (halo)</label>
          <input type="number" class="form-control form-control-sm" id="visorAdminStyleHaloWidth" min="1" max="16" step="0.5" value="${escapeHtml(String(wizard.style_halo_width ?? 4))}" />
        </div>
        <div class="col-sm-4 d-none" id="visorAdminStyleHaloColorWrap">
          <label class="form-label small mb-1" for="visorAdminStyleHaloColor">Color contorno (halo)</label>
          <input type="color" class="form-control form-control-color form-control-sm w-100" id="visorAdminStyleHaloColor" value="${escapeHtml(wizard.style_halo_color || wizard.color || "#333333")}" />
        </div>
        <div class="col-sm-4 d-none" id="visorAdminStyleOutlineColorWrap">
          <label class="form-label small mb-1" for="visorAdminStyleOutlineColor">Color del contorno</label>
          <input type="color" class="form-control form-control-color form-control-sm w-100" id="visorAdminStyleOutlineColor" value="${escapeHtml(wizard.style_outline_color || "#64748b")}" />
        </div>
        <div class="col-sm-4 d-none" id="visorAdminStyleOutlineWidthWrap">
          <label class="form-label small mb-1" for="visorAdminStyleOutlineWidth">Grosor del contorno</label>
          <input type="number" class="form-control form-control-sm" id="visorAdminStyleOutlineWidth" min="0" max="8" step="0.5" value="${escapeHtml(String(wizard.style_outline_width ?? 0))}" />
          <div class="form-text">0 = solo borde fino del relleno</div>
        </div>
        <div class="col-sm-4 d-none" id="visorAdminStyleStrokeColorWrap">
          <label class="form-label small mb-1" for="visorAdminStyleStrokeColor">Color del borde (punto)</label>
          <input type="color" class="form-control form-control-color form-control-sm w-100" id="visorAdminStyleStrokeColor" value="${escapeHtml(wizard.style_stroke_color || "#ffffff")}" />
        </div>
        <div class="col-sm-4 d-none" id="visorAdminStyleStrokeWidthWrap">
          <label class="form-label small mb-1" for="visorAdminStyleStrokeWidth">Grosor del borde (punto)</label>
          <input type="number" class="form-control form-control-sm" id="visorAdminStyleStrokeWidth" min="0" max="6" step="0.5" value="${escapeHtml(String(wizard.style_stroke_width ?? 1))}" />
        </div>
        <div class="col-sm-6 d-none" id="visorAdminStyleLineDashWrap">
          <label class="form-label small mb-1" for="visorAdminStyleLineDash">Tipo de línea</label>
          <select class="form-select form-select-sm" id="visorAdminStyleLineDash">
            <option value="solid" ${wizard.style_line_dash === "solid" ? "selected" : ""}>Continua</option>
            <option value="dashed" ${wizard.style_line_dash === "dashed" ? "selected" : ""}>Punteada</option>
            <option value="dotted" ${wizard.style_line_dash === "dotted" ? "selected" : ""}>Puntos</option>
            <option value="long" ${wizard.style_line_dash === "long" ? "selected" : ""}>Guiones largos</option>
          </select>
        </div>
      </div>
    </div>`;
}

function syncStyleAdvancedUi() {
  const preset = document.getElementById("visorAdminPreset")?.value || wizard.style_preset;
  const geom = wizard.geometry;
  const show = (id, on) => document.getElementById(id)?.classList.toggle("d-none", !on);
  show("visorAdminStyleOpacityWrap", true);
  show("visorAdminStyleRadiusWrap", preset === "point_default" || preset === "point_by_attribute");
  show("visorAdminStyleIconScaleWrap", preset === "point_symbol" || preset === "point_symbol_by_attribute");
  show("visorAdminStyleWidthWrap", geom === "line");
  show("visorAdminStyleHaloWidthWrap", preset === "line_outline");
  show("visorAdminStyleHaloColorWrap", preset === "line_outline");
  show("visorAdminStyleOutlineColorWrap", geom === "polygon");
  show("visorAdminStyleOutlineWidthWrap", geom === "polygon");
  show("visorAdminStyleStrokeColorWrap", preset === "point_default");
  show("visorAdminStyleStrokeWidthWrap", preset === "point_default");
  show("visorAdminStyleLineDashWrap", geom === "line");
  const op = document.getElementById("visorAdminStyleOpacity");
  const opVal = document.getElementById("visorAdminStyleOpacityVal");
  if (op && opVal && !op.dataset.bound) {
    op.dataset.bound = "1";
    op.addEventListener("input", () => {
      opVal.textContent = String(op.value);
    });
  }
}

function defaultStyleTabForPreset(preset) {
  return isByAttributePreset(preset) ? "attribute" : "basic";
}

function defaultByAttributePresetForGeometry(geometry) {
  const geom = geometry || wizard.geometry || "line";
  const match = (_meta?.presets || []).find((p) => p.by_attribute && p.geometry === geom);
  return match?.id || null;
}

function byAttributePresetOptionsHtml(geometry) {
  const geom = geometry || wizard.geometry || "line";
  return (_meta?.presets || [])
    .filter((p) => p.by_attribute && p.geometry === geom)
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label || p.id)}</option>`,
    )
    .join("");
}

function syncStyleTabUi(root) {
  const preset =
    root?.querySelector("#visorAdminPreset")?.value ||
    root?.querySelector("#visorAdminPresetAttr")?.value ||
    wizard.style_preset;
  const isAttr = isByAttributePreset(preset);
  let tab = wizard.style_tab || "basic";

  if (tab === "attribute" && !isAttr) {
    const fallback = defaultByAttributePresetForGeometry(wizard.geometry);
    if (fallback) {
      wizard.style_preset = fallback;
      const presetEl = root?.querySelector("#visorAdminPreset");
      if (presetEl) presetEl.value = fallback;
      const attrPresetEl = root.querySelector("#visorAdminPresetAttr");
      if (attrPresetEl) attrPresetEl.value = fallback;
    } else {
      tab = "basic";
      wizard.style_tab = "basic";
    }
  }

  const tabs = root?.querySelectorAll("[data-style-tab]") || [];
  tabs.forEach((btn) => {
    const key = btn.getAttribute("data-style-tab");
    btn.classList.toggle("active", key === tab);
    btn.setAttribute("aria-selected", key === tab ? "true" : "false");
  });
  root?.querySelector("#visorAdminStyleTabBasic")?.classList.toggle("d-none", tab !== "basic");
  root?.querySelector("#visorAdminStyleTabAttr")?.classList.toggle("d-none", tab !== "attribute");
  root?.querySelector("#visorAdminStyleTabAdvanced")?.classList.toggle("d-none", tab !== "advanced");
  const attrHint = root?.querySelector("#visorAdminStyleAttrHint");
  if (attrHint) attrHint.classList.toggle("d-none", tab !== "attribute" || isAttr);
  const attrPanel = root?.querySelector("#visorAdminStyleAttrPanel");
  if (attrPanel) attrPanel.classList.toggle("d-none", tab !== "attribute" || !isAttr);
}

function refreshStyleTabChrome(root) {
  if (!root) return;
  syncStyleTabUi(root);
  syncStyleAdvancedUi();
  refreshStylePreview(root.querySelector("#visorAdminStylePreviewHost"));
}

function bindStyleTabUi(root, syncPresetUi) {
  root?.querySelectorAll("[data-style-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-style-tab") || "basic";
      if (key === "attribute" && !isByAttributePreset(wizard.style_preset)) {
        const next = defaultByAttributePresetForGeometry(wizard.geometry);
        if (next) {
          wizard.style_preset = next;
          const presetEl = root.querySelector("#visorAdminPreset");
          if (presetEl) presetEl.value = next;
          const attrPreset = root.querySelector("#visorAdminPresetAttr");
          if (attrPreset) attrPreset.value = next;
        }
      }
      wizard.style_tab = key;
      if (key === "attribute" && typeof syncPresetUi === "function") {
        void syncPresetUi();
      } else {
        refreshStyleTabChrome(root);
      }
    });
  });
}

function presetOptionsHtml() {
  const presets = _meta?.presets || [];
  const basic = presets.filter((p) => !p.by_attribute);
  const byAttr = presets.filter((p) => p.by_attribute);
  const render = (list) =>
    list
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}" data-geometry="${escapeHtml(p.geometry)}">${escapeHtml(p.label || p.id)}</option>`,
      )
      .join("");
  if (!byAttr.length) return render(presets);
  return `
    <optgroup label="Símbolo único">${render(basic)}</optgroup>
    <optgroup label="Por atributo (colores por campo)">${render(byAttr)}</optgroup>`;
}

function groupOptionsHtml() {
  return (_meta?.groups || [])
    .map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.label || g.id)}</option>`)
    .join("");
}

function iconOptionsHtml() {
  return (_meta?.icons || [])
    .map((i) => `<option value="${escapeHtml(i.key)}">${escapeHtml(i.label || i.key)}</option>`)
    .join("");
}

function presetMetaById(id) {
  return (_meta?.presets || []).find((p) => p.id === id);
}

function isByAttributePreset(presetId) {
  const meta = presetMetaById(presetId);
  return Boolean(meta?.by_attribute || String(presetId || "").endsWith("_by_attribute"));
}

function isDenueTable(table) {
  return String(table || "").toLowerCase() === "c_denue";
}

function defaultStyleClasses() {
  return [
    { value: "A", color: "#ef4444", label: "Clase A" },
    { value: "B", color: "#3b82f6", label: "Clase B" },
  ];
}

/** Paleta para autoclasificar (hasta 32 clases). */
const AUTO_CLASS_COLORS = [
  "#ef4444",
  "#f97316",
  "#ca8a04",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
  "#0d9488",
  "#dc2626",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

function normalizeStyleClasses(list) {
  return (list || [])
    .map((c) => ({
      value: String(c?.value ?? "").trim(),
      color: String(c?.color ?? "#94a3b8").trim(),
      label: String(c?.label ?? c?.value ?? "").trim(),
    }))
    .filter((c) => c.value);
}

function styleClassRowsHtml(classes, keepEmpty = false) {
  const rows = keepEmpty
    ? (classes || []).map((c) => ({
        value: String(c?.value ?? ""),
        color: String(c?.color ?? "#94a3b8").trim(),
        label: String(c?.label ?? c?.value ?? ""),
      }))
    : normalizeStyleClasses(classes);
  const list = rows.length ? rows : defaultStyleClasses();
  return list
    .map(
      (cls, idx) => `
      <div class="visor-admin-class-row" data-idx="${idx}">
        <input type="text" class="form-control form-control-sm visor-admin-cls-value" placeholder="Valor" value="${escapeHtml(cls.value)}" />
        <input type="color" class="form-control form-control-color form-control-sm visor-admin-cls-color" value="${escapeHtml(cls.color)}" />
        <input type="text" class="form-control form-control-sm visor-admin-cls-label" placeholder="Leyenda" value="${escapeHtml(cls.label || cls.value)}" />
        <button type="button" class="btn btn-sm btn-outline-danger visor-admin-cls-remove" title="Quitar">×</button>
      </div>`,
    )
    .join("");
}

function readStyleClassesFromDom(keepEmpty = false) {
  const root = document.getElementById("visorAdminStyleClasses");
  const attrPanel = document.getElementById("visorAdminStyleAttrPanel");
  if (!root || attrPanel?.classList.contains("d-none")) {
    return normalizeStyleClasses(wizard.style_classes);
  }
  const out = [];
  root.querySelectorAll(".visor-admin-class-row").forEach((row) => {
    const value = row.querySelector(".visor-admin-cls-value")?.value?.trim() ?? "";
    const color = row.querySelector(".visor-admin-cls-color")?.value?.trim() || "#94a3b8";
    const label = row.querySelector(".visor-admin-cls-label")?.value?.trim() || value;
    if (keepEmpty || value) out.push({ value, color, label });
  });
  return keepEmpty ? out : normalizeStyleClasses(out);
}

function bindStyleClassEditor(attrWrap, onChange) {
  if (!attrWrap) return;
  const listRoot = attrWrap.querySelector("#visorAdminStyleClasses");
  const sync = (keepEmpty = false) => {
    wizard.style_classes = readStyleClassesFromDom(keepEmpty);
    onChange?.();
  };
  if (!attrWrap.dataset.styleEditorBound) {
    attrWrap.dataset.styleEditorBound = "1";
    attrWrap.addEventListener("click", (ev) => {
      if (ev.target.closest("#visorAdminAddClass")) {
        ev.preventDefault();
        const rows = readStyleClassesFromDom(true);
        rows.push({ value: "", color: "#94a3b8", label: "" });
        wizard.style_classes = rows;
        if (listRoot) listRoot.innerHTML = styleClassRowsHtml(rows, true);
        onChange?.();
        return;
      }
      const removeBtn = ev.target.closest(".visor-admin-cls-remove");
      if (removeBtn) {
        removeBtn.closest(".visor-admin-class-row")?.remove();
        sync(true);
      }
    });
    attrWrap.addEventListener("input", (ev) => {
      if (
        ev.target.matches(
          ".visor-admin-cls-value, .visor-admin-cls-color, .visor-admin-cls-label",
        )
      ) {
        sync(true);
      }
    });
    attrWrap.addEventListener("change", (ev) => {
      if (
        ev.target.matches(
          ".visor-admin-cls-value, .visor-admin-cls-color, .visor-admin-cls-label",
        )
      ) {
        sync(true);
      }
    });
  }
}

function columnOptionsHtml(cols, selected) {
  const sel = String(selected || "").toLowerCase();
  return (cols || [])
    .map((col) => {
      const picked = col.toLowerCase() === sel ? "selected" : "";
      return `<option value="${escapeHtml(col)}" ${picked}>${escapeHtml(col)}</option>`;
    })
    .join("");
}

function denuePresetOptionsHtml(selectedKey) {
  const sel = String(selectedKey || "");
  const opts = DENUE_CATALOG_PRESETS.map(
    (p) =>
      `<option value="${escapeHtml(p.key)}" ${p.key === sel ? "selected" : ""}>${escapeHtml(p.label)}</option>`,
  ).join("");
  return `<option value="">— Personalizado —</option>${opts}`;
}

function applyDenuePreset(key) {
  const preset = DENUE_CATALOG_PRESETS.find((p) => p.key === key);
  if (!preset) return;
  wizard.denue_preset_key = preset.key;
  wizard.denue_codigo_act = [...preset.codigo_act];
  wizard.style_preset = "point_symbol";
  wizard.geometry = "point";
  wizard.icon_key = preset.icon_key;
  wizard.group_id = "denue";
  wizard.denue_use_template = true;
}

async function fetchTablePublishStatus(table) {
  const name = String(table || "").trim();
  if (!name) return null;
  try {
    const { res, data } = await adminFetch(
      `/api/visor/admin/tables/${encodeURIComponent(name)}/status`,
    );
    if (!res?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function renderMartinStatusBanner(container, status) {
  if (!container) return;
  if (!status?.needs_martin_restart) {
    container.innerHTML = "";
    container.classList.add("d-none");
    wizard.martin_needs_restart = false;
    return;
  }
  wizard.martin_needs_restart = true;
  container.classList.remove("d-none");
  container.innerHTML = `
    <div class="alert alert-warning py-2 px-2 small mb-2 visor-admin-martin-banner">
      <strong>Martin:</strong> esta tabla aún no aparece en tiles. Tras publicar, reinicie Martin una vez:
      <code>docker compose restart martin</code>
    </div>`;
}

function refreshStylePreview(container) {
  if (!container) return;
  const preset = document.getElementById("visorAdminPreset")?.value || wizard.style_preset;
  const byAttr = isByAttributePreset(preset);
  const iconKey =
    document.getElementById("visorAdminIcon")?.value?.trim() || wizard.icon_key || "";
  const iconMeta = (_meta?.icons || []).find((i) => i.key === iconKey);
  void renderAdminStylePreview(container, {
    geometry: wizard.geometry,
    preset,
    color: document.getElementById("visorAdminColor")?.value || wizard.color,
    classes: byAttr ? readStyleClassesFromDom() : [],
    defaultColor: document.getElementById("visorAdminDefaultColor")?.value || wizard.default_color,
    iconKey,
    iconVersion: iconMeta?.version,
  });
}

function apiErrorMessage(data, fallback) {
  const detail = data?.detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const loc = Array.isArray(first?.loc) ? first.loc.filter((p) => p !== "body").join(".") : "";
    const msg = first?.msg || first?.message;
    if (loc && msg) return `${loc}: ${msg}`;
    if (msg) return String(msg);
  }
  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string" && detail.message.includes("|")) {
      return detail.message.split("|")[0];
    }
    return detail.message || detail.error || fallback;
  }
  return data?.message || fallback;
}

async function fetchAdminTables(retries = 2) {
  let lastError = "No se pudo listar tablas de Martin";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { res, data, networkError } = await adminFetch("/api/visor/admin/tables");
    if (networkError || !res) {
      lastError = "No se pudo contactar al API. Verifique que el contenedor api_backend esté activo.";
    } else if (res.ok) {
      return data?.tables || [];
    } else {
      lastError = apiErrorMessage(data, lastError);
      const errCode = data?.detail?.error || "";
      if (res.status === 503 || errCode === "MARTIN_UNAVAILABLE") {
        lastError =
          "Martin aún no responde. Espere unos segundos y pulse Reintentar (no requiere municipio seleccionado).";
      }
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  const err = new Error(lastError);
  err.retryable = true;
  throw err;
}

async function uploadShpFromWizard(body) {
  const fileEl = body?.querySelector("#visorAdminShpFile");
  const statusEl = body?.querySelector("#visorAdminShpStatus");
  const tableHint = body?.querySelector("#visorAdminShpTable")?.value?.trim() || "";
  const file = fileEl?.files?.[0];
  if (!file) {
    if (statusEl) statusEl.textContent = "Seleccione un archivo .shp o .zip";
    return;
  }
  if (statusEl) statusEl.textContent = "Importando…";
  const form = new FormData();
  form.append("file", file);
  if (tableHint) form.append("table_name", tableHint);
  const { res, data } = await adminFetch("/api/visor/admin/upload/shp", { method: "POST", body: form });
  if (!res?.ok) {
    let msg = apiErrorMessage(data, "No se pudo importar el shapefile");
    if (res.status === 413) {
      msg =
        "Archivo demasiado grande para el servidor (máx. 80 MB). " +
        "Si el archivo es pequeño, reinicie nginx: docker compose restart nginx_proxy";
    }
    if (statusEl) statusEl.textContent = msg;
    return;
  }
  wizard.table = data.table || "";
  wizard.geometry = data.geometry || "point";
  wizard.table_columns = (data.columns || []).map((c) => String(c.name || "")).filter(Boolean);
  wizard.shp_uploaded = true;
  wizard.table_source = "shp";
  wizard.martin_needs_restart = true;
  if (statusEl) {
    statusEl.innerHTML = `Importado: <code>${escapeHtml(wizard.table)}</code> (${data.feature_count ?? "?"} features). ${escapeHtml(data.message || "")}`;
    statusEl.classList.remove("text-danger");
    statusEl.classList.add("text-success");
  }
  const okBox = body?.querySelector("#visorAdminShpOk");
  if (okBox) {
    okBox.classList.remove("d-none");
    okBox.innerHTML = `Tabla lista: <strong>${escapeHtml(wizard.table)}</strong> · geometría ${escapeHtml(wizard.geometry)}. Pulse <strong>Siguiente</strong>.`;
  }
}

async function analyzeSvgFileForMap(file) {
  const text = await file.text();
  const warnings = [];
  if (/potrace/i.test(text)) {
    warnings.push(
      "SVG tipo Potrace: el contorno suele verse muy delgado en el mapa. Mejor redibujar en 32×32 con trazo grueso o relleno.",
    );
  }
  if (/\bwidth\s*=\s*["'][\d.]+pt/i.test(text) || /\bheight\s*=\s*["'][\d.]+pt/i.test(text)) {
    warnings.push("Tiene width/height en puntos (pt); use viewBox cuadrado (p. ej. 0 0 32 32) sin medidas fijas.");
  }
  const vb = text.match(/viewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
  if (vb) {
    const w = Number(vb[1]);
    const h = Number(vb[2]);
    if (w > 0 && h > 0) {
      if (h > w * 1.25) {
        warnings.push("Proporción muy vertical; en mapa puede verse pequeño o con trazo fino. Prefiera viewBox cuadrado.");
      }
      if (w > 128 || h > 128) {
        warnings.push("viewBox muy grande; los iconos del catálogo usan ~32×32 para verse nítidos al rasterizar.");
      }
    }
  } else {
    warnings.push("Sin viewBox declarado; exporte el SVG con viewBox (recomendado 0 0 32 32).");
  }
  if (!warnings.length && !/fill\s*=|stroke-width/i.test(text)) {
    warnings.push("No se detectaron rellenos ni trazos gruesos; verifique que el icono sea visible al reducirlo.");
  }
  return warnings;
}

function bindIconUploadHints(root) {
  if (!root) return;
  const fileEl = root.querySelector("#visorAdminIconFile");
  const warnEl = root.querySelector("#visorAdminIconUploadWarn");
  fileEl?.addEventListener("change", () => {
    void (async () => {
      const file = fileEl.files?.[0];
      if (!warnEl) return;
      if (!file) {
        warnEl.innerHTML = "";
        return;
      }
      warnEl.innerHTML = '<span class="text-muted">Revisando SVG…</span>';
      try {
        const issues = await analyzeSvgFileForMap(file);
        if (!issues.length) {
          warnEl.innerHTML =
            '<span class="text-success">Revisión básica OK. Tras registrar, use Ctrl+F5 en el visor.</span>';
          return;
        }
        warnEl.innerHTML = `<div class="alert alert-warning py-2 px-2 small mb-0">${issues
          .map((w) => `<div>• ${escapeHtml(w)}</div>`)
          .join("")}</div>`;
      } catch {
        warnEl.innerHTML = "";
      }
    })();
  });
}

async function uploadIconFromStyleStep(body) {
  const statusEl = body?.querySelector("#visorAdminIconUploadStatus");
  const key = body?.querySelector("#visorAdminIconKey")?.value?.trim() || "";
  const label = body?.querySelector("#visorAdminIconLabel")?.value?.trim() || key;
  const file = body?.querySelector("#visorAdminIconFile")?.files?.[0];
  if (!key || !file) {
    if (statusEl) statusEl.textContent = "Indique clave e icono SVG";
    return;
  }
  if (statusEl) statusEl.textContent = "Subiendo…";
  const form = new FormData();
  form.append("file", file);
  form.append("icon_key", key);
  form.append("label", label);
  const { res, data } = await adminFetch("/api/visor/admin/upload/icon", { method: "POST", body: form });
  if (!res?.ok) {
    if (statusEl) statusEl.textContent = apiErrorMessage(data, "No se pudo registrar el icono");
    return;
  }
  await loadMeta();
  const iconEl = body?.querySelector("#visorAdminIcon");
  if (iconEl) {
    iconEl.innerHTML = iconOptionsHtml();
    iconEl.value = data.icon_key || key;
    wizard.icon_key = iconEl.value;
  }
  if (statusEl) {
    statusEl.textContent = data.message || "Icono registrado";
    statusEl.classList.add("text-success");
  }
  wizard.icon_key = data.icon_key || key;
  refreshStylePreview(body?.querySelector("#visorAdminStylePreviewHost"));
}

async function renderStepTables(body) {
  body.innerHTML = `
    <ul class="nav nav-tabs nav-tabs-sm mb-2 visor-admin-table-tabs" role="tablist">
      <li class="nav-item"><button type="button" class="nav-link ${wizard.table_source !== "shp" ? "active" : ""}" data-tab="martin">Tablas en Martin</button></li>
      <li class="nav-item"><button type="button" class="nav-link ${wizard.table_source === "shp" ? "active" : ""}" data-tab="shp">Subir shapefile</button></li>
    </ul>
    <div id="visorAdminTableTabMartin" class="${wizard.table_source === "shp" ? "d-none" : ""}"></div>
    <div id="visorAdminTableTabShp" class="${wizard.table_source === "shp" ? "" : "d-none"}">
      <p class="small text-muted">Importa <strong>.shp</strong> o <strong>.zip</strong> (con .shp, .dbf, .shx). Se crea tabla <code>c_*</code> en PostGIS (EPSG:3857).</p>
      <div class="mb-2">
        <label class="form-label small mb-1" for="visorAdminShpTable">Nombre de tabla (opcional)</label>
        <input type="text" class="form-control form-control-sm" id="visorAdminShpTable" placeholder="c_mi_capa" value="${escapeHtml(wizard.table && wizard.shp_uploaded ? wizard.table : "")}" />
      </div>
      <div class="mb-2">
        <label class="form-label small mb-1" for="visorAdminShpFile">Archivo</label>
        <input type="file" class="form-control form-control-sm" id="visorAdminShpFile" accept=".shp,.zip,application/zip,application/x-shapefile" />
      </div>
      <button type="button" class="btn btn-sm btn-primary" id="visorAdminShpUploadBtn">Importar a PostGIS</button>
      <div id="visorAdminShpStatus" class="small mt-2 text-muted"></div>
      <div id="visorAdminShpOk" class="alert alert-success py-2 px-2 small mt-2 ${wizard.shp_uploaded ? "" : "d-none"}">${wizard.shp_uploaded ? `Tabla lista: <strong>${escapeHtml(wizard.table)}</strong>` : ""}</div>
      <div class="alert alert-warning py-2 px-2 small mt-2">Tras importar: <code>docker compose restart martin</code> antes de publicar.</div>
    </div>`;

  body.querySelectorAll(".visor-admin-table-tabs [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wizard.table_source = btn.getAttribute("data-tab") === "shp" ? "shp" : "martin";
      void renderStepTables(body);
    });
  });
  body.querySelector("#visorAdminShpUploadBtn")?.addEventListener("click", () => void uploadShpFromWizard(body));

  if (wizard.table_source === "shp") return;

  const martinPane = body.querySelector("#visorAdminTableTabMartin");
  if (!martinPane) return;

  let tables = [];
  try {
    tables = await fetchAdminTables();
  } catch (err) {
    martinPane.innerHTML = `
      <p class="small text-danger mb-2">${escapeHtml(err?.message || "No se pudo listar tablas de Martin")}</p>
      <p class="small text-muted mb-2">Puede usar la pestaña <strong>Subir shapefile</strong> o reintentar cuando Martin responda.</p>
      <button type="button" class="btn btn-sm btn-outline-primary" data-act="retry-tables">Reintentar</button>`;
    martinPane.querySelector('[data-act="retry-tables"]')?.addEventListener("click", () => void renderStepTables(body));
    return;
  }
  if (!tables.length) {
    martinPane.innerHTML =
      '<p class="small text-muted mb-0">No hay tablas nuevas en Martin. Use <strong>Subir shapefile</strong> o cargue datos a PostGIS y reinicie Martin.</p>';
    return;
  }
  martinPane.innerHTML = `
    <p class="small text-muted">Seleccione la tabla publicada en Martin (o en PostGIS) que aún no está en el catálogo del visor.</p>
    <div id="visorAdminMartinBanner" class="d-none"></div>
    <select class="form-select form-select-sm" id="visorAdminTablePick">
      ${tables
        .map((t) => {
          const suffix = t.needs_martin_restart ? " · reiniciar Martin" : "";
          return `<option value="${escapeHtml(t.table)}">${escapeHtml(t.table)}${suffix}</option>`;
        })
        .join("")}
    </select>`;
  const pick = martinPane.querySelector("#visorAdminTablePick");
  const banner = martinPane.querySelector("#visorAdminMartinBanner");
  wizard.table = pick?.value || tables[0].table;
  wizard.shp_uploaded = false;
  const syncTablePick = async () => {
    wizard.table = pick?.value || wizard.table;
    wizard.table_source = "martin";
    if (isDenueTable(wizard.table)) {
      wizard.geometry = "point";
      wizard.group_id = "denue";
      wizard.style_preset = wizard.style_preset || "point_symbol";
    }
    const status = await fetchTablePublishStatus(wizard.table);
    renderMartinStatusBanner(banner, status);
  };
  pick?.addEventListener("change", () => void syncTablePick());
  await syncTablePick();
}

async function detectMunScope(table) {
  try {
    const { res, data } = await adminFetch(
      `/api/visor/admin/tables/${encodeURIComponent(table)}/columns`,
    );
    if (!res?.ok) return "municipio";
    const cols = (data?.columns || []).map((c) => String(c.name || "").toLowerCase());
    if (cols.includes("cve_mun") || cols.includes("cvegeo")) return "municipio";
    return "estatal";
  } catch {
    return "municipio";
  }
}

function renderStepDetails(body) {
  const lid =
    wizard.mode === "edit"
      ? wizard.editingLayerId
      : layerIdFromTable(wizard.table);
  const tableReadonly = wizard.mode === "edit";
  body.innerHTML = `
    <div class="visor-admin-step-layer">
    ${tableReadonly ? `<p class="small text-muted mb-2">Tabla: <code>${escapeHtml(wizard.table)}</code> (no editable)</p>` : ""}
    <div class="mb-2">
      <label class="form-label small mb-1">Etiqueta en el panel</label>
      <input type="text" class="form-control form-control-sm" id="visorAdminLabel" value="${escapeHtml(wizard.label || lid.replace(/_/g, " "))}" />
    </div>
    <div class="mb-2 ${tableReadonly ? "d-none" : ""}">
      <label class="form-label small mb-1">Id de capa (catálogo)</label>
      <input type="text" class="form-control form-control-sm" id="visorAdminLayerId" value="${escapeHtml(lid)}" ${tableReadonly ? "readonly" : ""} />
    </div>
    <div class="mb-2">
      <label class="form-label small mb-1">Grupo del panel</label>
      <select class="form-select form-select-sm" id="visorAdminGroup">${groupOptionsHtml()}</select>
    </div>
    <div class="mb-2">
      <label class="form-label small mb-1">Alcance territorial</label>
      <select class="form-select form-select-sm" id="visorAdminMunScope">
        <option value="municipio">Municipal (filtra por cve_mun del explorador)</option>
        <option value="estatal">Estatal (sin filtro municipal)</option>
      </select>
      <div class="form-text">Use <strong>Estatal</strong> si la tabla no tiene columna <code>cve_mun</code> (p. ej. contorno de entidad).</div>
    </div>
    <div class="mb-2">
      <label class="form-label small mb-1">Geometría</label>
      <select class="form-select form-select-sm" id="visorAdminGeometry">
        <option value="point">Punto</option>
        <option value="line">Línea</option>
        <option value="polygon">Polígono</option>
      </select>
    </div>
    <div class="visor-admin-export-formats border rounded p-2 mt-3">
      <div class="fw-semibold small mb-2">Exportación desde el visor</div>
      <div class="form-check form-check-inline mb-0">
        <input class="form-check-input" type="checkbox" id="visorAdminExpKml" ${wizard.export_kml ? "checked" : ""} />
        <label class="form-check-label small" for="visorAdminExpKml">Permitir KML</label>
      </div>
      <div class="form-check form-check-inline mb-0">
        <input class="form-check-input" type="checkbox" id="visorAdminExpShp" ${wizard.export_shp ? "checked" : ""} />
        <label class="form-check-label small" for="visorAdminExpShp">Permitir SHP</label>
      </div>
      <div id="visorAdminKmlNameWrap" class="mt-2 ${wizard.export_kml ? "" : "d-none"}">
        <label class="form-label small mb-1" for="visorAdminKmlNameField">Campo para etiqueta KML</label>
        <select class="form-select form-select-sm" id="visorAdminKmlNameField">
          <option value="">Cargando columnas…</option>
        </select>
        <p class="form-text mb-0">Nombre de cada elemento en Google Earth (etiqueta del pin). Por defecto se prefiere <code>nombre</code> u otros campos descriptivos.</p>
      </div>
      <div class="form-text mb-0 mt-1">Formatos disponibles al exportar elementos seleccionados en el mapa.</div>
    </div>
    <div class="visor-admin-data-filter border rounded p-2 mt-3" id="visorAdminDataFilterBlock">
      <div class="form-check form-check-sm mb-2">
        <input class="form-check-input" type="checkbox" id="visorAdminDataFilterEnabled" ${wizard.data_filter_enabled ? "checked" : ""} />
        <label class="form-check-label small fw-semibold" for="visorAdminDataFilterEnabled">Filtrar elementos por atributo</label>
      </div>
      <div id="visorAdminDataFilterOptions" class="${wizard.data_filter_enabled ? "" : "d-none"}">
        <p class="form-text mb-2">Solo se dibujan (y exportan) los registros cuyo campo coincida con alguno de los valores. Ej.: región <strong>Norte</strong>, tipo <strong>Carretera</strong>.</p>
        <div class="visor-admin-data-filter-grid">
          <div class="visor-admin-data-filter-field">
            <label class="form-label small mb-1" for="visorAdminDataFilterField">Campo</label>
            <select class="form-select form-select-sm" id="visorAdminDataFilterField" disabled>
              <option value="">Cargando columnas…</option>
            </select>
          </div>
          <div class="visor-admin-data-filter-values">
            <label class="form-label small mb-1" for="visorAdminDataFilterValues">Valores permitidos</label>
            <input type="text" class="form-control form-control-sm" id="visorAdminDataFilterValues" value="${escapeHtml((wizard.data_filter_values || []).join(", "))}" placeholder="Norte, Centro, Costa Chica" />
          </div>
        </div>
        <p class="form-text mb-2">Separados por coma. Coincidencia exacta (como en la tabla).</p>
        <div class="visor-admin-data-filter-actions d-flex flex-wrap gap-2 align-items-center">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="visorAdminDataFilterDistinctBtn" disabled>Ver valores en tabla</button>
          <span class="small text-muted" id="visorAdminDataFilterDistinctHint"></span>
        </div>
        <div id="visorAdminDataFilterDistinctChips" class="visor-admin-distinct-values atlas-scroll mt-1 d-none"></div>
      </div>
    </div>
    </div>`;
  body.querySelector("#visorAdminLabel")?.addEventListener("input", (ev) => {
    ev.target.dataset.touched = "1";
  });
  const geom = body.querySelector("#visorAdminGeometry");
  if (geom) geom.value = wizard.geometry;
  const grp = body.querySelector("#visorAdminGroup");
  if (grp && wizard.group_id) grp.value = wizard.group_id;
  const scope = body.querySelector("#visorAdminMunScope");
  if (scope) {
    scope.value = wizard.mun_scope;
    scope.addEventListener("change", () => {
      wizard.mun_scope = scope.value === "estatal" ? "estatal" : "municipio";
    });
  }
  void detectMunScope(wizard.table).then((detected) => {
    if (wizard.mode === "edit") return;
    wizard.mun_scope = detected;
    if (scope) scope.value = detected;
  });
  void bindDataFilterStepUi(body);
  bindKmlExportUi(body);
}

async function bindDataFilterStepUi(body) {
  const enabled = body.querySelector("#visorAdminDataFilterEnabled");
  const opts = body.querySelector("#visorAdminDataFilterOptions");
  const fieldEl = body.querySelector("#visorAdminDataFilterField");
  const distinctBtn = body.querySelector("#visorAdminDataFilterDistinctBtn");
  const chipsHost = body.querySelector("#visorAdminDataFilterDistinctChips");
  const hintEl = body.querySelector("#visorAdminDataFilterDistinctHint");
  if (!fieldEl) return;
  const syncEnabled = () => {
    opts?.classList.toggle("d-none", !enabled?.checked);
  };
  enabled?.addEventListener("change", syncEnabled);
  syncEnabled();
  if (!wizard.table) {
    fieldEl.innerHTML = `<option value="">— Seleccione tabla primero —</option>`;
    return;
  }
  try {
    await ensureTableColumnsLoaded();
    const cols = wizard.table_columns || [];
    fieldEl.disabled = false;
    fieldEl.innerHTML = `<option value="">— Seleccione —</option>${columnOptionsHtml(cols, wizard.data_filter_field)}`;
    if (wizard.data_filter_field) fieldEl.value = wizard.data_filter_field;
    distinctBtn.disabled = !fieldEl.value;
  } catch (err) {
    fieldEl.innerHTML = `<option value="">Error al cargar columnas</option>`;
    if (hintEl) hintEl.textContent = err?.message || "Error";
  }
  fieldEl.addEventListener("change", () => {
    distinctBtn.disabled = !fieldEl.value;
    if (chipsHost) {
      chipsHost.classList.add("d-none");
      chipsHost.innerHTML = "";
    }
    if (hintEl) hintEl.textContent = "";
  });
  distinctBtn?.addEventListener("click", async () => {
    const field = fieldEl.value?.trim();
    if (!field || !wizard.table) return;
    distinctBtn.disabled = true;
    if (hintEl) hintEl.textContent = "Consultando…";
    const { res, data } = await adminFetch(
      `/api/visor/admin/tables/${encodeURIComponent(wizard.table)}/columns/${encodeURIComponent(field)}/distinct?limit=80`,
    );
    distinctBtn.disabled = false;
    if (!res?.ok) {
      if (hintEl) hintEl.textContent = apiErrorMessage(data, "No se pudieron cargar valores");
      return;
    }
    const values = data?.values || [];
    if (hintEl) {
      hintEl.textContent = values.length
        ? `${values.length} valor(es) · clic para agregar al filtro`
        : "Sin valores";
    }
    if (!chipsHost) return;
    chipsHost.classList.toggle("d-none", !values.length);
    chipsHost.innerHTML = values
      .map(
        (v) =>
          `<button type="button" class="visor-admin-distinct-chip visor-admin-filter-chip" data-val="${escapeHtml(String(v))}">${escapeHtml(String(v))}</button>`,
      )
      .join("");
    chipsHost.querySelectorAll(".visor-admin-filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const val = chip.getAttribute("data-val") || "";
        const input = body.querySelector("#visorAdminDataFilterValues");
        if (!input || !val) return;
        const cur = input.value
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!cur.includes(val)) cur.push(val);
        input.value = cur.join(", ");
      });
    });
  });
}

function readDataFilterFromDom() {
  const enabledEl = document.getElementById("visorAdminDataFilterEnabled");
  if (!enabledEl) return;
  wizard.data_filter_enabled = Boolean(enabledEl.checked);
  if (!wizard.data_filter_enabled) return;
  wizard.data_filter_field = document.getElementById("visorAdminDataFilterField")?.value?.trim() || "";
  const raw = document.getElementById("visorAdminDataFilterValues")?.value || "";
  wizard.data_filter_values = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function loadTableColumns(table) {
  const name = String(table || "").trim();
  if (!name) return [];
  const { res, data } = await adminFetch(
    `/api/visor/admin/tables/${encodeURIComponent(name)}/columns`,
  );
  if (!res?.ok) throw new Error(apiErrorMessage(data, "No se pudieron cargar las columnas de la tabla"));
  const defs = (data?.columns || [])
    .map((c) => ({
      name: String(c.name || "").trim(),
      data_type: String(c.data_type || "").trim(),
      udt_name: String(c.udt_name || "").trim(),
    }))
    .filter((c) => c.name);
  wizard.table_column_defs = defs;
  wizard.table_columns = defs.map((c) => c.name);
  return wizard.table_columns;
}

/** Columnas disponibles: PostGIS + identify/export ya configurados en el asistente. */
function columnCandidatesForStyle() {
  const fromTable = wizard.table_columns || [];
  const fromIdentify = normalizeIdentifyFieldObjects(wizard.identify_fields).map((f) => f.column);
  const fromExport = wizard.export_columns || [];
  return [...new Set([...fromTable, ...fromIdentify, ...fromExport])].filter(Boolean);
}

async function ensureTableColumnsLoaded() {
  const table = String(wizard.table || "").trim();
  wizard.columns_load_error = "";
  if (!table) return columnCandidatesForStyle();
  if (!wizard.table_columns.length) {
    try {
      await loadTableColumns(table);
    } catch (err) {
      wizard.columns_load_error = err?.message || "Error al cargar columnas";
    }
  }
  return columnCandidatesForStyle();
}

function refreshStyleFieldSelect(root, selected) {
  const fieldEl =
    root?.querySelector("#visorAdminStyleField") || document.getElementById("visorAdminStyleField");
  const statusEl =
    root?.querySelector("#visorAdminStyleFieldStatus") ||
    document.getElementById("visorAdminStyleFieldStatus");
  if (!fieldEl) return;
  const cols = columnCandidatesForStyle();
  const sel = selected ?? wizard.style_field ?? "";
  if (!cols.length) {
    fieldEl.innerHTML = `<option value="">— Sin columnas —</option>`;
    if (statusEl) {
      statusEl.textContent = wizard.columns_load_error
        ? wizard.columns_load_error
        : wizard.table
          ? `No se encontraron columnas para ${wizard.table}. Verifique PostGIS.`
          : "Seleccione una tabla primero.";
      statusEl.classList.add("text-danger");
    }
    return;
  }
  fieldEl.innerHTML = `<option value="">— Seleccione —</option>${columnOptionsHtml(cols, sel)}`;
  if (sel && cols.some((c) => c.toLowerCase() === String(sel).toLowerCase())) {
    fieldEl.value = cols.find((c) => c.toLowerCase() === String(sel).toLowerCase()) || sel;
  }
  if (statusEl) {
    statusEl.textContent = wizard.columns_load_error || "";
    statusEl.classList.toggle("text-danger", Boolean(wizard.columns_load_error));
  }
}

async function fetchDistinctFieldValues(table, column) {
  const t = String(table || "").trim();
  const c = String(column || "").trim();
  if (!t || !c) return null;
  const { res, data } = await adminFetch(
    `/api/visor/admin/tables/${encodeURIComponent(t)}/columns/${encodeURIComponent(c)}/distinct?limit=32`,
  );
  if (!res?.ok) return { error: apiErrorMessage(data, "No se pudieron leer valores") };
  return data;
}

function buildClassesFromDistinctValues(values) {
  return (values || []).map((val, i) => {
    const text = String(val);
    return {
      value: text,
      color: AUTO_CLASS_COLORS[i % AUTO_CLASS_COLORS.length],
      label: text.length > 48 ? `${text.slice(0, 45)}…` : text,
    };
  });
}

function distinctValuesChipsHtml(values) {
  return (values || [])
    .map(
      (v) =>
        `<span class="visor-admin-distinct-chip" title="${escapeHtml(String(v))}">${escapeHtml(String(v))}</span>`,
    )
    .join("");
}

function applyStyleClassesToDom(body, classes, previewHost) {
  const attrWrap = body?.querySelector("#visorAdminStyleAttrPanel");
  const listRoot = body?.querySelector("#visorAdminStyleClasses");
  if (!listRoot || !attrWrap) return;
  delete attrWrap.dataset.styleEditorBound;
  wizard.style_classes = normalizeStyleClasses(classes);
  listRoot.innerHTML = styleClassRowsHtml(wizard.style_classes);
  bindStyleClassEditor(attrWrap, () => refreshStylePreview(previewHost));
  refreshStylePreview(previewHost);
}

async function loadDistinctFieldPanel(body, previewHost) {
  const fieldEl = body?.querySelector("#visorAdminStyleField");
  const field = fieldEl?.value?.trim() || "";
  const panel = body?.querySelector("#visorAdminDistinctPanel");
  const statusEl = body?.querySelector("#visorAdminDistinctStatus");
  const valuesEl = body?.querySelector("#visorAdminDistinctValues");
  const autoBtn = body?.querySelector("#visorAdminAutoclassifyBtn");
  if (!panel) return;
  if (!field) {
    panel.classList.add("d-none");
    return;
  }
  wizard.style_field = field;
  panel.classList.remove("d-none");
  if (statusEl) statusEl.textContent = "Consultando valores únicos en PostGIS…";
  if (valuesEl) valuesEl.innerHTML = "";
  if (autoBtn) autoBtn.disabled = true;

  const result = await fetchDistinctFieldValues(wizard.table, field);
  if (result?.error) {
    if (statusEl) {
      statusEl.textContent = result.error;
      statusEl.classList.add("text-danger");
    }
    return;
  }
  wizard.distinct_values = result?.values || [];
  wizard.distinct_total = result?.total_distinct ?? wizard.distinct_values.length;
  wizard.distinct_truncated = Boolean(result?.truncated);

  if (statusEl) {
    statusEl.classList.remove("text-danger");
    if (!wizard.distinct_values.length) {
      statusEl.textContent = "Sin valores distintos (columna vacía o nula).";
    } else if (wizard.distinct_truncated) {
      statusEl.textContent = `${wizard.distinct_total} valores distintos; mostrando ${wizard.distinct_values.length}. Puede editar clases manualmente.`;
    } else {
      statusEl.textContent = `${wizard.distinct_values.length} valor${wizard.distinct_values.length === 1 ? "" : "es"} distinto${wizard.distinct_values.length === 1 ? "" : "s"} en «${field}».`;
    }
  }
  if (valuesEl) {
    valuesEl.innerHTML = wizard.distinct_values.length
      ? distinctValuesChipsHtml(wizard.distinct_values)
      : '<span class="small text-muted">—</span>';
  }
  if (autoBtn) autoBtn.disabled = !wizard.distinct_values.length;
}

function runAutoclassify(body, previewHost) {
  if (!wizard.distinct_values.length) {
    window.alert("Seleccione un campo con valores en la tabla.");
    return;
  }
  const existing = normalizeStyleClasses(readStyleClassesFromDom());
  const hasReal =
    existing.length &&
    !(
      existing.length === 2 &&
      existing[0]?.value === "A" &&
      existing[1]?.value === "B"
    );
  if (
    hasReal &&
    !window.confirm(
      "¿Reemplazar las clases actuales por la autoclasificación sugerida?\n\nPodrá ajustar colores y etiquetas después.",
    )
  ) {
    return;
  }
  applyStyleClassesToDom(body, buildClassesFromDistinctValues(wizard.distinct_values), previewHost);
}

function defaultIdentifyFields(cols) {
  const preferred = ["gid", "cvegeo", "cve_mun", "cve_ent", "nomgeo", "nom_loc", "nom_mun", "nombre"];
  const picked = preferred.filter((p) => cols.map((c) => c.toLowerCase()).includes(p));
  return picked.length ? picked : cols.slice(0, Math.min(6, cols.length));
}

function defaultFieldLabel(col) {
  const key = String(col || "").toLowerCase();
  const defaults = {
    gid: "Identificador",
    nombre: "Nombre",
    nomgeo: "Nombre geoestadístico",
    nom_loc: "Localidad",
    nom_mun: "Municipio",
    cvegeo: "Clave geoestadística",
    cve_ent: "Clave entidad",
    cve_mun: "Clave municipio",
    cve_loc: "Clave localidad",
    tipo: "Tipo",
    ent: "Entidad",
  };
  if (defaults[key]) return defaults[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeIdentifyFieldObjects(fields) {
  const list = fields?.length ? fields : [{ column: "gid", label: defaultFieldLabel("gid") }];
  return list
    .map((f) => {
      if (typeof f === "string") {
        const col = f.trim();
        return col ? { column: col, label: defaultFieldLabel(col) } : null;
      }
      if (f && typeof f === "object") {
        const col = String(f.column || f.field || f.name || "").trim();
        if (!col) return null;
        const label = String(f.label || "").trim() || defaultFieldLabel(col);
        return { column: col, label };
      }
      return null;
    })
    .filter(Boolean);
}

/** @deprecated use normalizeIdentifyFieldObjects — solo nombres de columna. */
function normalizeIdentifyFieldNames(fields) {
  return normalizeIdentifyFieldObjects(fields).map((f) => f.column);
}

function identifyFieldsEditorHtml(cols, selected) {
  const map = new Map(normalizeIdentifyFieldObjects(selected).map((f) => [f.column.toLowerCase(), f]));
  return cols
    .map((col) => {
      const saved = map.get(col.toLowerCase());
      const checked = saved ? "checked" : "";
      const labelVal = escapeHtml(saved?.label || defaultFieldLabel(col));
      const disabled = saved ? "" : "disabled";
      return `<div class="visor-admin-identify-row">
        <div class="form-check form-check-sm mb-0">
          <input class="form-check-input visor-admin-idf-check" type="checkbox" id="idf_${escapeHtml(col)}" value="${escapeHtml(col)}" ${checked} />
          <label class="form-check-label small font-monospace" for="idf_${escapeHtml(col)}">${escapeHtml(col)}</label>
        </div>
        <input type="text" class="form-control form-control-sm visor-admin-idf-label" data-for="${escapeHtml(col)}" placeholder="Etiqueta visible" value="${labelVal}" ${disabled} />
      </div>`;
    })
    .join("");
}

function bindIdentifyFieldEditors(root) {
  if (!root) return;
  root.querySelectorAll(".visor-admin-idf-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".visor-admin-identify-row");
      const labelInput = row?.querySelector(".visor-admin-idf-label");
      if (!labelInput) return;
      labelInput.disabled = !cb.checked;
      if (cb.checked && !labelInput.value.trim()) {
        labelInput.value = defaultFieldLabel(cb.value);
      }
    });
  });
}

function readIdentifyFieldsFromDom() {
  const root = document.getElementById("visorAdminIdentifyCols");
  if (!root) return normalizeIdentifyFieldObjects(wizard.identify_fields);
  const out = [];
  root.querySelectorAll(".visor-admin-identify-row").forEach((row) => {
    const cb = row.querySelector(".visor-admin-idf-check");
    if (!cb?.checked) return;
    const col = cb.value;
    const labelInput = row.querySelector(".visor-admin-idf-label");
    const label = labelInput?.value?.trim() || defaultFieldLabel(col);
    out.push({ column: col, label });
  });
  return out;
}

function columnsCheckboxList(id, cols, selected) {
  const sel = new Set((selected || []).map((c) => String(c).toLowerCase()));
  return cols
    .map((col) => {
      const checked = sel.has(col.toLowerCase()) ? "checked" : "";
      return `<div class="form-check form-check-sm">
        <input class="form-check-input" type="checkbox" id="${id}_${escapeHtml(col)}" value="${escapeHtml(col)}" ${checked} />
        <label class="form-check-label small" for="${id}_${escapeHtml(col)}">${escapeHtml(col)}</label>
      </div>`;
    })
    .join("");
}

function readCheckedColumns(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return [];
  return [...root.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
}

const SPATIAL_EXCLUDE_COLS = new Set([
  "gid",
  "ogc_fid",
  "the_geom",
  "geom",
  "wkb_geometry",
  "cvegeo",
  "cve_mza",
  "cve_ent",
  "cve_loc",
  "cve_mun",
  "cve_ageb",
  "ambito",
  "tipomza",
  "nomgeo",
  "nom_ent",
  "nom_mun",
  "nom_loc",
  "nom_ageb",
]);

function defaultSpatialModo(geometry) {
  return geometry === "point" ? "conteo" : "agregacion";
}

function columnDefByName(name) {
  const lc = String(name || "").toLowerCase();
  return (wizard.table_column_defs || []).find((c) => c.name.toLowerCase() === lc);
}

function isAggregableColumn(colName, colDef) {
  const lc = String(colName || colDef?.name || "").toLowerCase();
  if (!lc || lc === "the_geom" || SPATIAL_EXCLUDE_COLS.has(lc)) return false;
  if (!/^[a-z][a-z0-9_]{0,62}$/i.test(lc)) return false;
  const type = String(colDef?.data_type || "").toLowerCase();
  if (["smallint", "integer", "bigint", "numeric", "double precision", "real"].includes(type)) {
    return true;
  }
  return ["character varying", "text", "character"].includes(type);
}

function inferSpatialAgg(colName, colDef) {
  const lc = String(colName || "").toLowerCase();
  const type = String(colDef?.data_type || "").toLowerCase();
  if (lc.startsWith("graproes") || ["numeric", "double precision", "real"].includes(type)) {
    return "avg";
  }
  return "sum";
}

function normalizeSpatialFieldObjects(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => {
      if (!f || typeof f !== "object") return null;
      const col = String(f.columna || f.column || "").trim();
      if (!col) return null;
      return {
        columna: col,
        etiqueta: String(f.etiqueta || f.label || defaultFieldLabel(col)).trim(),
        agregacion: f.agregacion === "avg" ? "avg" : "sum",
      };
    })
    .filter(Boolean);
}

function normalizeSpatialDetailColumns(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => {
      if (!f || typeof f !== "object") return null;
      const col = String(f.columna || f.column || "").trim();
      if (!col) return null;
      return {
        columna: col,
        etiqueta: String(f.etiqueta || f.label || defaultFieldLabel(col)).trim(),
      };
    })
    .filter(Boolean);
}

const INDEX_SQL_SCHEMA = "atlas";
let _indexPlanToken = 0;

function dbSchemaLabel() {
  return _meta?.db_schema || INDEX_SQL_SCHEMA;
}

function renderIndexHintsShell() {
  return `
    <details class="visor-admin-index-hints alert alert-info py-2 px-3 small mt-3 mb-0" id="visorAdminIndexHints" open>
      <summary class="fw-semibold">Índices PostgreSQL (informativo)</summary>
      <div id="visorAdminIndexHintsBody" class="mt-2">
        <p class="text-muted mb-2">Comprobando índices en <code>${escapeHtml(dbSchemaLabel())}</code>…</p>
      </div>
    </details>`;
}

function renderIndexPlanTable(plan) {
  const suggestions = plan?.suggestions || [];
  const existing = plan?.existing_indexes || [];
  if (!suggestions.length) {
    return '<p class="text-muted mb-0">No hay sugerencias para esta configuración.</p>';
  }

  const missing = suggestions.filter((s) => !s.exists);
  const rows = suggestions
    .map((s) => {
      const status = s.exists
        ? `<span class="badge text-bg-success">Existe</span>${s.existing_index ? `<br><code class="small visor-admin-index-existing-name">${escapeHtml(s.existing_index)}</code>` : ""}`
        : `<span class="badge text-bg-warning">Falta</span>`;
      const action = s.exists
        ? ""
        : `<button type="button" class="btn btn-outline-primary btn-sm visor-admin-index-create-one" data-column="${escapeHtml(s.column)}" data-method="${escapeHtml(s.method)}">Crear</button>`;
      return `<tr>
        <td><code>${escapeHtml(s.column)}</code> <span class="text-muted">(${escapeHtml(s.method)})</span></td>
        <td>${escapeHtml(s.reason)}</td>
        <td>${status}</td>
        <td class="text-end">${action}</td>
      </tr>`;
    })
    .join("");

  const existingBlock = existing.length
    ? `<details class="mb-2">
        <summary class="small fw-semibold">Índices actuales en la tabla (${existing.length})</summary>
        <ul class="small mb-0 mt-1 ps-3">
          ${existing
            .map(
              (idx) =>
                `<li><code>${escapeHtml(idx.index_name)}</code>${idx.columns?.length ? ` · ${escapeHtml(idx.columns.join(", "))}` : ""}${idx.method ? ` · ${escapeHtml(idx.method)}` : ""}</li>`,
            )
            .join("")}
        </ul>
      </details>`
    : `<p class="small text-muted mb-2">No se detectaron índices en esta tabla (además de la clave primaria).</p>`;

  const createMissingBtn =
    missing.length > 0
      ? `<button type="button" class="btn btn-primary btn-sm" id="visorAdminIndexCreateMissing">Crear ${missing.length} índice(s) faltante(s)</button>`
      : `<span class="badge text-bg-success">Todos los índices sugeridos ya existen</span>`;

  return `
    <p class="text-muted mb-2">Según la configuración de publicación, estas columnas se benefician de índices. Puede crearlos en caliente desde aquí (solo administradores).</p>
    ${existingBlock}
    <div class="table-responsive mb-2">
      <table class="table table-sm table-bordered align-middle mb-0 visor-admin-index-table">
        <thead>
          <tr>
            <th>Columna</th>
            <th>Motivo</th>
            <th>Estado</th>
            <th class="text-end">Acción</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      ${createMissingBtn}
      <button type="button" class="btn btn-outline-secondary btn-sm" id="visorAdminIndexRefresh">Actualizar</button>
    </div>
    <details class="small">
      <summary class="text-muted">Ver SQL sugerido</summary>
      <pre class="visor-admin-index-sql small mb-0 mt-1"><code>${escapeHtml(
        suggestions.map((s) => `-- ${s.reason}\n${s.sql}`).join("\n\n"),
      )}</code></pre>
    </details>
    <div id="visorAdminIndexStatus" class="small mt-2" hidden></div>`;
}

function bindIndexHintsEvents(host) {
  host.querySelector("#visorAdminIndexRefresh")?.addEventListener("click", () => {
    void refreshIndexHintsPanel();
  });
  host.querySelector("#visorAdminIndexCreateMissing")?.addEventListener("click", () => {
    void applyMissingIndexes(host);
  });
  host.querySelectorAll(".visor-admin-index-create-one").forEach((btn) => {
    btn.addEventListener("click", () => {
      void applyIndexItems(
        host,
        [
          {
            column: btn.dataset.column,
            method: btn.dataset.method,
          },
        ],
        btn,
      );
    });
  });
}

function setIndexHintsStatus(host, message, isError = false) {
  const el = host?.querySelector("#visorAdminIndexStatus");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("text-danger", "text-success");
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("text-danger", isError);
  el.classList.toggle("text-success", !isError);
}

async function fetchIndexPlan() {
  const table = String(wizard.table || "").trim();
  if (!table) return null;
  const payload = buildPayload();
  const { res, data, networkError } = await adminFetch(
    `/api/visor/admin/tables/${encodeURIComponent(table)}/indexes/plan`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (networkError || !res?.ok) {
    throw new Error(apiErrorMessage(data, "No se pudo consultar el plan de índices"));
  }
  return data;
}

async function applyIndexItems(host, items, triggerBtn = null) {
  const table = String(wizard.table || "").trim();
  if (!table || !items?.length) return;
  if (triggerBtn) triggerBtn.disabled = true;
  setIndexHintsStatus(host, "Creando índice(s)…");
  const { res, data, networkError } = await adminFetch(
    `/api/visor/admin/tables/${encodeURIComponent(table)}/indexes`,
    {
      method: "POST",
      body: JSON.stringify({ items, only_missing: true }),
    },
  );
  if (triggerBtn) triggerBtn.disabled = false;
  if (networkError || !res?.ok) {
    setIndexHintsStatus(host, apiErrorMessage(data, "No se pudieron crear los índices"), true);
    return;
  }
  const created = data?.created?.length || 0;
  const skipped = data?.skipped?.length || 0;
  const errors = data?.errors || [];
  if (errors.length) {
    const detail = errors.map((e) => `${e.column}: ${e.message}`).join("; ");
    setIndexHintsStatus(host, `${data?.message || "Error"} ${detail}`, true);
  } else {
    setIndexHintsStatus(host, data?.message || `Listo (${created} creado(s), ${skipped} omitido(s)).`, false);
  }
  await refreshIndexHintsPanel();
}

async function applyMissingIndexes(host) {
  const token = _indexPlanToken;
  let plan;
  try {
    plan = await fetchIndexPlan();
  } catch (err) {
    setIndexHintsStatus(host, err.message || String(err), true);
    return;
  }
  if (token !== _indexPlanToken) return;
  const items = (plan?.suggestions || [])
    .filter((s) => !s.exists)
    .map((s) => ({
      column: s.column,
      method: s.method,
      index_name: s.index_name,
      reason: s.reason,
    }));
  await applyIndexItems(host, items, host.querySelector("#visorAdminIndexCreateMissing"));
}

async function refreshIndexHintsPanel() {
  const root = document.getElementById("visorAdminIndexHints");
  const host = document.getElementById("visorAdminIndexHintsBody");
  if (!host) return;
  const token = ++_indexPlanToken;
  host.innerHTML = `<p class="text-muted mb-0">Comprobando índices en <code>${escapeHtml(dbSchemaLabel())}</code>…</p>`;
  const table = String(wizard.table || "").trim();
  if (!table) {
    host.innerHTML = '<p class="text-muted mb-0">Seleccione una tabla para ver índices sugeridos.</p>';
    return;
  }
  try {
    const plan = await fetchIndexPlan();
    if (token !== _indexPlanToken) return;
    host.innerHTML = renderIndexPlanTable(plan);
    bindIndexHintsEvents(host);
  } catch (err) {
    if (token !== _indexPlanToken) return;
    host.innerHTML = `<p class="text-danger mb-0">${escapeHtml(err.message || String(err))}</p>
      <button type="button" class="btn btn-outline-secondary btn-sm mt-2" id="visorAdminIndexRefresh">Reintentar</button>`;
    host.querySelector("#visorAdminIndexRefresh")?.addEventListener("click", () => {
      void refreshIndexHintsPanel();
    });
  }
  if (root && !root.open) root.open = true;
}

function spatialFieldsEditorHtml(colNames, selected) {
  const map = new Map(normalizeSpatialFieldObjects(selected).map((f) => [f.columna.toLowerCase(), f]));
  const aggregable = (colNames || []).filter((col) => isAggregableColumn(col, columnDefByName(col)));
  if (!aggregable.length) {
    return '<p class="small text-muted mb-0">No hay columnas numéricas agregables en esta tabla.</p>';
  }
  return aggregable
    .map((col) => {
      const saved = map.get(col.toLowerCase());
      const checked = saved ? "checked" : "";
      const labelVal = escapeHtml(saved?.etiqueta || defaultFieldLabel(col));
      const disabled = saved ? "" : "disabled";
      const agg = saved?.agregacion || inferSpatialAgg(col, columnDefByName(col));
      const avgSel = agg === "avg" ? "selected" : "";
      const sumSel = agg === "sum" ? "selected" : "";
      return `<div class="visor-admin-identify-row visor-admin-spatial-row">
        <div class="form-check form-check-sm mb-0">
          <input class="form-check-input visor-admin-spf-check" type="checkbox" id="spf_${escapeHtml(col)}" value="${escapeHtml(col)}" ${checked} />
          <label class="form-check-label small font-monospace" for="spf_${escapeHtml(col)}">${escapeHtml(col)}</label>
        </div>
        <input type="text" class="form-control form-control-sm visor-admin-spf-label" data-for="${escapeHtml(col)}" placeholder="Etiqueta en resultados" value="${labelVal}" ${disabled} />
        <select class="form-select form-select-sm visor-admin-spf-agg" data-for="${escapeHtml(col)}" ${disabled}>
          <option value="sum" ${sumSel}>Suma</option>
          <option value="avg" ${avgSel}>Promedio</option>
        </select>
      </div>`;
    })
    .join("");
}

function spatialDetailColumnsEditorHtml(colNames, selected) {
  const mapped = normalizeSpatialDetailColumns(selected).map((f) => ({
    column: f.columna,
    label: f.etiqueta,
  }));
  return identifyFieldsEditorHtml(colNames, mapped);
}

function bindSpatialFieldEditors(root) {
  if (!root) return;
  root.querySelectorAll(".visor-admin-spf-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".visor-admin-spatial-row");
      const labelInput = row?.querySelector(".visor-admin-spf-label");
      const aggSelect = row?.querySelector(".visor-admin-spf-agg");
      const on = cb.checked;
      if (labelInput) {
        labelInput.disabled = !on;
        if (on && !labelInput.value.trim()) labelInput.value = defaultFieldLabel(cb.value);
      }
      if (aggSelect) aggSelect.disabled = !on;
    });
  });
}

function readSpatialFieldsFromDom() {
  const root = document.getElementById("visorAdminSpatialFields");
  if (!root) return normalizeSpatialFieldObjects(wizard.spatial_fields);
  const out = [];
  root.querySelectorAll(".visor-admin-spatial-row").forEach((row) => {
    const cb = row.querySelector(".visor-admin-spf-check");
    if (!cb?.checked) return;
    const col = cb.value;
    const labelInput = row.querySelector(".visor-admin-spf-label");
    const aggSelect = row.querySelector(".visor-admin-spf-agg");
    out.push({
      columna: col,
      etiqueta: labelInput?.value?.trim() || defaultFieldLabel(col),
      agregacion: aggSelect?.value === "avg" ? "avg" : "sum",
    });
  });
  return out;
}

function readSpatialDetailColumnsFromDom() {
  const root = document.getElementById("visorAdminSpatialDetailCols");
  if (!root) return normalizeSpatialDetailColumns(wizard.spatial_detail_columns);
  const out = [];
  root.querySelectorAll(".visor-admin-identify-row").forEach((row) => {
    const cb = row.querySelector(".visor-admin-idf-check");
    if (!cb?.checked) return;
    const col = cb.value;
    const labelInput = row.querySelector(".visor-admin-idf-label");
    out.push({
      columna: col,
      etiqueta: labelInput?.value?.trim() || defaultFieldLabel(col),
    });
  });
  return out;
}

function normalizeTabularColumns(list) {
  return (list || [])
    .map((item) => {
      if (typeof item === "string") {
        const field = item.trim();
        return field ? { field, label: defaultFieldLabel(field) } : null;
      }
      const field = String(item?.field || item?.columna || item?.column || "").trim();
      if (!field) return null;
      return {
        field,
        label: String(item?.label || item?.etiqueta || defaultFieldLabel(field)).trim(),
      };
    })
    .filter(Boolean);
}

function tabularColumnsEditorHtml(colNames, selected) {
  const mapped = normalizeTabularColumns(selected).map((f) => ({
    column: f.field,
    label: f.label,
  }));
  return identifyFieldsEditorHtml(colNames, mapped);
}

function readTabularColumnsFromDom() {
  const root = document.getElementById("visorAdminTabularCols");
  if (!root) return normalizeTabularColumns(wizard.tabular_columns);
  const out = [];
  root.querySelectorAll(".visor-admin-identify-row").forEach((row) => {
    const cb = row.querySelector(".visor-admin-idf-check");
    if (!cb?.checked) return;
    const col = cb.value;
    const labelInput = row.querySelector(".visor-admin-idf-label");
    out.push({
      field: col,
      label: labelInput?.value?.trim() || defaultFieldLabel(col),
    });
  });
  return out;
}

function bindTabularStepUi(body) {
  const enabledEl = body.querySelector("#visorAdminTabularEnabled");
  const panel = body.querySelector("#visorAdminTabularPanel");
  enabledEl?.addEventListener("change", () => {
    panel?.classList.toggle("d-none", !enabledEl.checked);
  });
}

function clusterPresetOptionsHtml() {
  const presets = _meta?.cluster_presets || [
    { id: "standard", label: "Equilibrado" },
    { id: "compact", label: "Compacto" },
    { id: "wide", label: "Amplio" },
    { id: "sparse", label: "Discreto" },
  ];
  const sel = wizard.cluster_preset || "standard";
  return presets
    .map((p) => {
      const id = p.id || p.key || "";
      const hint = p.hint ? ` — ${p.hint}` : "";
      return `<option value="${escapeHtml(id)}"${id === sel ? " selected" : ""}>${escapeHtml(p.label || id)}${escapeHtml(hint)}</option>`;
    })
    .join("");
}

function clusterControlsHtml() {
  if (wizard.geometry !== "point") return "";
  const on = Boolean(wizard.cluster_enabled);
  return `
    <div class="visor-admin-cluster-block border rounded p-2 mb-3">
      <div class="form-check form-switch mb-2">
        <input class="form-check-input" type="checkbox" role="switch" id="visorAdminClusterEnabled" ${on ? "checked" : ""} />
        <label class="form-check-label small fw-semibold" for="visorAdminClusterEnabled">Agrupar puntos (clusters)</label>
      </div>
      <div id="visorAdminClusterPanel" class="${on ? "" : "d-none"}">
        <p class="small text-muted mb-2">Los puntos cercanos se agrupan en círculos con contador. Al acercar el mapa se muestran individuales. Los datos se cargan por municipio activo (<code>cve_mun</code>) o por todo el estado si el visor está en <strong>vista estatal</strong>.</p>
        <div class="mb-0">
          <label class="form-label small mb-1" for="visorAdminClusterPreset">Preset de agrupación</label>
          <select class="form-select form-select-sm" id="visorAdminClusterPreset">${clusterPresetOptionsHtml()}</select>
        </div>
        <p class="form-text mb-0 mt-2">Zoom alejado: clusters y puntos sueltos con la simbología del catálogo. Al acercar, los clusters se disuelven y la capa MVT toma el relevo con iconos vectoriales completos. Si activó <strong>etiquetas</strong> en el paso Mapa, se muestran en puntos sueltos y, al acercar, en todos los elementos.</p>
      </div>
    </div>`;
}

function bindClusterStepUi(body) {
  const enabledEl = body.querySelector("#visorAdminClusterEnabled");
  const panel = body.querySelector("#visorAdminClusterPanel");
  enabledEl?.addEventListener("change", () => {
    panel?.classList.toggle("d-none", !enabledEl.checked);
  });
  body.querySelector("#visorAdminClusterPreset")?.addEventListener("change", (ev) => {
    wizard.cluster_preset = ev.target.value || "standard";
  });
}

function bindSpatialStepUi(body) {
  const enabledEl = body.querySelector("#visorAdminSpatialEnabled");
  const panel = body.querySelector("#visorAdminSpatialPanel");
  const modoEl = body.querySelector("#visorAdminSpatialModo");
  const agregPanel = body.querySelector("#visorAdminSpatialAgregPanel");
  const detailCb = body.querySelector("#visorAdminSpatialDetailTable");
  const detailPanel = body.querySelector("#visorAdminSpatialDetailPanel");

  const syncPanels = () => {
    const on = Boolean(enabledEl?.checked);
    panel?.classList.toggle("d-none", !on);
    const modo = modoEl?.value || defaultSpatialModo(wizard.geometry);
    const isAgreg = modo === "agregacion";
    agregPanel?.classList.toggle("d-none", !isAgreg);
    detailPanel?.classList.toggle("d-none", !detailCb?.checked);
  };

  enabledEl?.addEventListener("change", () => {
    if (enabledEl.checked && !wizard.spatial_modo) {
      wizard.spatial_modo = defaultSpatialModo(wizard.geometry);
      if (modoEl) modoEl.value = wizard.spatial_modo;
    }
    syncPanels();
  });
  modoEl?.addEventListener("change", syncPanels);
  detailCb?.addEventListener("change", syncPanels);
  syncPanels();
}

function defaultLabelMinzoom(geometry) {
  return geometry === "line" ? 16 : 14;
}

/** Zoom mínimo sugerido para mostrar la geometría de la capa (aviso tipo Manzanas). */
function defaultLayerMinzoom(geometry) {
  if (geometry === "point") return 12;
  if (geometry === "line") return 12;
  return 14;
}

function readLayerMinzoomFromDom() {
  const enabledEl = document.getElementById("visorAdminLayerMinzoomEnabled");
  if (!enabledEl) return;
  wizard.layer_minzoom_enabled = Boolean(enabledEl.checked);
  if (!wizard.layer_minzoom_enabled) return;
  const minz = Number(document.getElementById("visorAdminLayerMinzoom")?.value);
  wizard.style_minzoom = Number.isFinite(minz)
    ? minz
    : defaultLayerMinzoom(wizard.geometry);
}

function bindLayerMinzoomUi(root) {
  if (!root) return;
  const enabled = root.querySelector("#visorAdminLayerMinzoomEnabled");
  const opts = root.querySelector("#visorAdminLayerMinzoomOptions");
  const sync = () => {
    const on = Boolean(enabled?.checked);
    opts?.classList.toggle("d-none", !on);
    wizard.layer_minzoom_enabled = on;
  };
  if (enabled) {
    enabled.addEventListener("change", sync);
    sync();
  }
}

function layerMinzoomControlsHtml() {
  const minz = wizard.style_minzoom ?? defaultLayerMinzoom(wizard.geometry);
  const enabled = Boolean(wizard.layer_minzoom_enabled);
  return `
    <div class="visor-admin-layer-minzoom border rounded p-2 mb-3">
      <div class="fw-semibold small mb-1">Visibilidad en el mapa</div>
      <div class="form-check form-check-sm mb-0">
        <input class="form-check-input" type="checkbox" id="visorAdminLayerMinzoomEnabled" ${enabled ? "checked" : ""} />
        <label class="form-check-label small" for="visorAdminLayerMinzoomEnabled">Visible solo desde un zoom mínimo</label>
      </div>
      <div id="visorAdminLayerMinzoomOptions" class="mt-2 ${enabled ? "" : "d-none"}">
        <div class="row g-2 align-items-end">
          <div class="col-sm-4">
            <label class="form-label small mb-1" for="visorAdminLayerMinzoom">Zoom mínimo de la capa</label>
            <input type="number" class="form-control form-control-sm" id="visorAdminLayerMinzoom" min="0" max="22" step="1" value="${escapeHtml(String(minz))}" />
          </div>
          <div class="col-sm-8">
            <p class="form-text mb-0">Aplica a la geometría de la capa (independiente de Básico, Por atributo o Avanzado). Si el mapa está más alejado, se muestra el aviso <em>«Acerca el mapa a zoom N+…»</em>.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function defaultKmlNameField(cols) {
  return defaultSearchNameColumn(cols || wizard.table_columns || []);
}

function kmlNameFieldOptionsHtml(cols, selected) {
  const list = cols?.length ? cols : wizard.table_columns || [];
  if (!list.length) {
    return '<option value="">— Cargando columnas —</option>';
  }
  const sel = String(selected || "").toLowerCase();
  const defaultCol = defaultKmlNameField(list);
  const chosen = sel || String(defaultCol || "").toLowerCase();
  return list
    .map((col) => {
      const lc = col.toLowerCase();
      return `<option value="${escapeHtml(col)}"${lc === chosen ? " selected" : ""}>${escapeHtml(col)}</option>`;
    })
    .join("");
}

async function refreshKmlNameFieldSelect(root) {
  const wrap = root?.querySelector("#visorAdminKmlNameWrap");
  const select = root?.querySelector("#visorAdminKmlNameField");
  if (!wrap || !select) return;
  const show = Boolean(root.querySelector("#visorAdminExpKml")?.checked);
  wrap.classList.toggle("d-none", !show);
  if (!show) return;
  if (!wizard.table_columns.length && wizard.table) {
    await ensureTableColumnsLoaded();
  }
  select.innerHTML = kmlNameFieldOptionsHtml(
    wizard.table_columns,
    wizard.export_kml_name_field || defaultKmlNameField(wizard.table_columns),
  );
  if (!wizard.export_kml_name_field && select.value) {
    wizard.export_kml_name_field = select.value;
  }
}

function bindKmlExportUi(root) {
  const kmlEl = root?.querySelector("#visorAdminExpKml");
  const sync = () => void refreshKmlNameFieldSelect(root);
  kmlEl?.addEventListener("change", sync);
  root?.querySelector("#visorAdminKmlNameField")?.addEventListener("change", (ev) => {
    wizard.export_kml_name_field = ev.target.value || "";
  });
  void sync();
}

const SEARCH_NAME_CANDIDATES = [
  "nombre",
  "nom_loc",
  "nomgeo",
  "nom_asen",
  "nom_estab",
  "nom_comer",
  "name",
];

function defaultSearchNameColumn(cols) {
  const lower = cols.map((c) => c.toLowerCase());
  for (const cand of SEARCH_NAME_CANDIDATES) {
    const idx = lower.indexOf(cand);
    if (idx >= 0) return cols[idx];
  }
  const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields);
  const skip = new Set(["gid", "cvegeo", "cve_ent", "cve_mun", "cve_loc"]);
  const fromId = idFields.find((f) => !skip.has(f.column.toLowerCase()));
  return fromId?.column || cols[0] || "";
}

function defaultSearchIdColumn(cols) {
  const lower = cols.map((c) => c.toLowerCase());
  const cveIdx = lower.indexOf("cvegeo");
  if (cveIdx >= 0) return cols[cveIdx];
  const gidIdx = lower.indexOf("gid");
  if (gidIdx >= 0) return cols[gidIdx];
  return "cvegeo";
}

function defaultSearchExtraColumns(cols, nameCol) {
  const nameLc = String(nameCol || "").toLowerCase();
  const fromIdentify = readIdentifyFieldsFromDom()
    .map((f) => f.column)
    .filter((col) => col && col.toLowerCase() !== nameLc);
  if (fromIdentify.length) return [...new Set(fromIdentify)];
  const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields)
    .map((f) => f.column)
    .filter((col) => col && col.toLowerCase() !== nameLc);
  return [...new Set(idFields)];
}

function searchExtraColumnsHtml(cols, nameCol, selected) {
  const nameLc = String(nameCol || "").toLowerCase();
  const extras = cols.filter((col) => col.toLowerCase() !== nameLc);
  if (!extras.length) {
    return '<p class="small text-muted mb-0">No hay columnas adicionales.</p>';
  }
  const sel = new Set((selected || []).map((c) => c.toLowerCase()));
  return extras
    .map((col) => {
      const id = `visorAdminSearchCol_${col}`;
      const checked = sel.has(col.toLowerCase()) ? "checked" : "";
      return `<div class="form-check form-check-sm">
        <input class="form-check-input" type="checkbox" id="${escapeHtml(id)}" value="${escapeHtml(col)}" ${checked} />
        <label class="form-check-label small" for="${escapeHtml(id)}">${escapeHtml(col)}</label>
      </div>`;
    })
    .join("");
}

function bindSearchStepUi(root, cols) {
  if (!root) return;
  const enabled = root.querySelector("#visorAdminSearchEnabled");
  const opts = root.querySelector("#visorAdminSearchOptions");
  const nameEl = root.querySelector("#visorAdminSearchNameColumn");
  const extraHost = root.querySelector("#visorAdminSearchExtraCols");
  const syncExtras = () => {
    if (!extraHost || !nameEl) return;
    const nameCol = nameEl.value || wizard.search_name_column;
    let kept = wizard.search_columns.filter(
      (c) => c.toLowerCase() !== String(nameCol || "").toLowerCase(),
    );
    if (!kept.length) {
      kept = defaultSearchExtraColumns(cols, nameCol);
    }
    extraHost.innerHTML = searchExtraColumnsHtml(cols, nameCol, kept);
  };
  const sync = () => {
    const on = Boolean(enabled?.checked);
    opts?.classList.toggle("d-none", !on);
    if (on) {
      const tipoEl = root.querySelector("#visorAdminSearchTipo");
      if (tipoEl && !tipoEl.value.trim()) {
        tipoEl.value = wizard.label || "";
      }
      if (nameEl && !nameEl.value) {
        nameEl.value = defaultSearchNameColumn(cols);
      }
      const idEl = root.querySelector("#visorAdminSearchIdColumn");
      if (idEl && !idEl.value) {
        idEl.value = defaultSearchIdColumn(cols);
      }
      syncExtras();
    }
    wizard.search_enabled = on;
    renderWizardStepNav();
  };
  if (enabled) {
    enabled.addEventListener("change", sync);
    sync();
  }
  nameEl?.addEventListener("change", syncExtras);
}

function readSearchFromDom() {
  const enabledEl = document.getElementById("visorAdminSearchEnabled");
  if (!enabledEl) return;
  wizard.search_enabled = Boolean(enabledEl.checked);
  if (!wizard.search_enabled) return;
  wizard.search_tipo =
    document.getElementById("visorAdminSearchTipo")?.value?.trim() || wizard.label || "";
  wizard.search_name_column =
    document.getElementById("visorAdminSearchNameColumn")?.value?.trim() || "";
  wizard.search_id_column =
    document.getElementById("visorAdminSearchIdColumn")?.value?.trim() || "cvegeo";
  const extras = readCheckedColumns("visorAdminSearchExtraCols");
  const cols = wizard.search_name_column
    ? [wizard.search_name_column, ...extras.filter((c) => c !== wizard.search_name_column)]
    : extras;
  wizard.search_columns = [...new Set(cols)];
}

function labelFieldOptionsHtml(cols, identifyFields, selected) {
  const fromIdentify = normalizeIdentifyFieldObjects(identifyFields).map((f) => f.column);
  const ordered = [...new Set([...fromIdentify, ...cols])];
  const sel = (selected || "").toLowerCase();
  return ordered
    .map((col) => {
      const picked = col.toLowerCase() === sel ? "selected" : "";
      return `<option value="${escapeHtml(col)}" ${picked}>${escapeHtml(col)}</option>`;
    })
    .join("");
}

function bindLabelsStepUi(root) {
  if (!root) return;
  const enabled = root.querySelector("#visorAdminLabelsEnabled");
  const opts = root.querySelector("#visorAdminLabelsOptions");
  const aboveWrap = root.querySelector("#visorAdminLabelsAboveWrap");
  const sync = () => {
    const on = Boolean(enabled?.checked);
    opts?.classList.toggle("d-none", !on);
    if (aboveWrap) {
      aboveWrap.classList.toggle("d-none", wizard.geometry !== "point");
    }
    if (on) {
      const fieldEl = root.querySelector("#visorAdminLabelsField");
      if (fieldEl && !fieldEl.value) {
        const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields);
        const pick =
          idFields.find((f) => f.column === "nombre")?.column ||
          idFields[0]?.column ||
          wizard.table_columns[0] ||
          "";
        if (pick) fieldEl.value = pick;
      }
    }
    wizard.labels_enabled = on;
    renderWizardStepNav();
  };
  if (enabled) {
    enabled.addEventListener("change", sync);
    sync();
  }
}

function readLabelsFromDom() {
  const enabledEl = document.getElementById("visorAdminLabelsEnabled");
  if (!enabledEl) return;
  wizard.labels_enabled = Boolean(enabledEl.checked);
  if (!wizard.labels_enabled) return;
  wizard.labels_field = document.getElementById("visorAdminLabelsField")?.value?.trim() || "";
  const minz = Number(document.getElementById("visorAdminLabelsMinzoom")?.value);
  wizard.labels_minzoom = Number.isFinite(minz) ? minz : defaultLabelMinzoom(wizard.geometry);
  wizard.labels_above_icon = Boolean(document.getElementById("visorAdminLabelsAboveIcon")?.checked);
  wizard.labels_color =
    document.getElementById("visorAdminLabelsColor")?.value?.trim() || wizard.labels_color;
  const ox = Number(document.getElementById("visorAdminLabelsOffsetX")?.value);
  const oy = Number(document.getElementById("visorAdminLabelsOffsetY")?.value);
  wizard.labels_offset_x = Number.isFinite(ox) ? ox : 0;
  wizard.labels_offset_y = Number.isFinite(oy) ? oy : 0;
}

async function prepareColumnsWizardDefaults() {
  if (!wizard.table_columns.length) {
    await loadTableColumns(wizard.table);
  }
  const cols = wizard.table_columns;
  if (!cols.length) {
    throw new Error("Sin columnas atributivas para esta tabla.");
  }
  if (!wizard.identify_fields.length) {
    wizard.identify_fields = defaultIdentifyFields(cols).map((col) => ({
      column: col,
      label: defaultFieldLabel(col),
    }));
  }
  if (!wizard.labels_field) {
    wizard.labels_field =
      normalizeIdentifyFieldObjects(wizard.identify_fields).find((f) => f.column === "nombre")?.column ||
      normalizeIdentifyFieldObjects(wizard.identify_fields)[0]?.column ||
      "";
  }
  if (!wizard.search_name_column) {
    wizard.search_name_column = defaultSearchNameColumn(cols);
  }
  if (!wizard.search_id_column) {
    wizard.search_id_column = defaultSearchIdColumn(cols);
  }
  if (!wizard.search_tipo) {
    wizard.search_tipo = wizard.label || "";
  }
  if (wizard.search_enabled && !wizard.search_columns.length && wizard.search_name_column) {
    wizard.search_columns = [
      wizard.search_name_column,
      ...defaultSearchExtraColumns(cols, wizard.search_name_column),
    ];
  }
  return cols;
}

async function renderStepIdentify(body) {
  body.innerHTML = '<p class="small text-muted mb-0">Cargando columnas…</p>';
  try {
    const cols = await prepareColumnsWizardDefaults();
    const idTitle = escapeHtml(wizard.identify_title || wizard.label || "");
    const spatialModo = wizard.spatial_modo || defaultSpatialModo(wizard.geometry);
    const spatialOn = Boolean(wizard.spatial_enabled);
    const detailOn = Boolean(wizard.spatial_detail_table);
    const tabularOn = Boolean(wizard.tabular_enabled);
    const unidad = escapeHtml(wizard.spatial_ui_unidad || "");
    const emptyMsg = escapeHtml(wizard.spatial_ui_empty_msg || "");
  body.innerHTML = `
      <div class="visor-admin-step-identify">
        <p class="small text-muted mb-2">Popup al hacer clic en el mapa, exportación KML/SHP y análisis espacial dentro de polígonos dibujados.</p>
        <div class="mb-3">
          <label class="form-label small mb-1" for="visorAdminIdentifyTitle">Título del popup (negrita)</label>
          <input type="text" class="form-control form-control-sm" id="visorAdminIdentifyTitle" value="${idTitle}" placeholder="Ej. Red Nacional de Caminos" />
          <div class="form-text">Si lo deja vacío, se usa la etiqueta de la capa en el panel.</div>
        </div>
        <div class="row g-3 visor-admin-cols-grid">
          <div class="col-lg-6 visor-admin-cols-pane">
            <div class="fw-semibold small mb-1">Identificación (clic en mapa)</div>
            <div class="form-text mb-1">Columna técnica → etiqueta visible antes de los dos puntos.</div>
            <div id="visorAdminIdentifyCols" class="visor-admin-cols-list atlas-scroll">${identifyFieldsEditorHtml(cols, wizard.identify_fields)}</div>
          </div>
          <div class="col-lg-6 visor-admin-cols-pane">
            <div class="fw-semibold small mb-1">Exportación KML / SHP</div>
            <div class="form-text mb-1">Si no marca ninguna, se exportan todas las columnas.</div>
            <div id="visorAdminExportCols" class="visor-admin-cols-list atlas-scroll">${columnsCheckboxList("exp", cols, wizard.export_columns)}</div>
          </div>
        </div>
        <hr class="my-3" />
        <div class="visor-admin-spatial-block">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" role="switch" id="visorAdminSpatialEnabled" ${spatialOn ? "checked" : ""} />
            <label class="form-check-label small fw-semibold" for="visorAdminSpatialEnabled">Disponible en análisis espacial</label>
          </div>
          <div id="visorAdminSpatialPanel" class="${spatialOn ? "" : "d-none"}">
            <p class="small text-muted mb-2">El usuario del visor podrá elegir esta capa al analizar un polígono. Configure indicadores agregados y, opcionalmente, una tabla con los elementos intersectados.</p>
            <div class="row g-2 mb-2">
              <div class="col-md-4">
                <label class="form-label small mb-1" for="visorAdminSpatialModo">Modo de análisis</label>
                <select class="form-select form-select-sm" id="visorAdminSpatialModo">
                  <option value="agregacion" ${spatialModo === "agregacion" ? "selected" : ""}>Agregación (suma / promedio)</option>
                  <option value="conteo" ${spatialModo === "conteo" ? "selected" : ""}>Conteo de elementos</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1" for="visorAdminSpatialUnidad">Unidad en resultados</label>
                <input type="text" class="form-control form-control-sm" id="visorAdminSpatialUnidad" value="${unidad}" placeholder="Ej. polígono(s), establecimiento(s)" />
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1" for="visorAdminSpatialEmptyMsg">Mensaje sin intersección</label>
                <input type="text" class="form-control form-control-sm" id="visorAdminSpatialEmptyMsg" value="${emptyMsg}" placeholder="Opcional" />
              </div>
            </div>
            <div id="visorAdminSpatialAgregPanel" class="${spatialModo === "agregacion" ? "" : "d-none"} mb-3">
              <div class="fw-semibold small mb-1">Indicadores del análisis</div>
              <div class="form-text mb-1">Marque columnas numéricas, alias visible y tipo de agregación.</div>
              <div id="visorAdminSpatialFields" class="visor-admin-cols-list atlas-scroll">${spatialFieldsEditorHtml(cols, wizard.spatial_fields)}</div>
            </div>
            <div class="form-check form-check-sm mb-2">
              <input class="form-check-input" type="checkbox" id="visorAdminSpatialDetailTable" ${detailOn ? "checked" : ""} />
              <label class="form-check-label small" for="visorAdminSpatialDetailTable">Incluir tabla de elementos intersectados en los resultados</label>
            </div>
            <div id="visorAdminSpatialDetailPanel" class="${detailOn ? "" : "d-none"}">
              <div class="form-text mb-1">Columnas y alias para cada fila de la tabla detalle.</div>
              <div id="visorAdminSpatialDetailCols" class="visor-admin-cols-list atlas-scroll">${spatialDetailColumnsEditorHtml(cols, wizard.spatial_detail_columns)}</div>
            </div>
          </div>
        </div>
        <hr class="my-3" />
        <div class="visor-admin-tabular-block">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" role="switch" id="visorAdminTabularEnabled" ${tabularOn ? "checked" : ""} />
            <label class="form-check-label small fw-semibold" for="visorAdminTabularEnabled">Disponible en consulta tabular</label>
          </div>
          <div id="visorAdminTabularPanel" class="${tabularOn ? "" : "d-none"}">
            <p class="small text-muted mb-2">Aparecerá en el botón <strong>Consulta tabular</strong> del panel Capas. Solo muestra registros del municipio seleccionado en el explorador (<code>cve_mun</code>), no del área dibujada.</p>
            ${wizard.mun_scope === "estatal" ? `<div class="alert alert-warning py-2 px-2 small mb-2">Esta capa tiene alcance estatal; la consulta tabular sigue filtrando por el municipio activo del explorador. Si la tabla no tiene <code>cve_mun</code>, desactive esta opción.</div>` : ""}
            <div class="fw-semibold small mb-1">Columnas de la tabla</div>
            <div class="form-text mb-1">Marque campos y alias visibles en la consulta y exportación Excel.</div>
            <div id="visorAdminTabularCols" class="visor-admin-cols-list atlas-scroll">${tabularColumnsEditorHtml(cols, wizard.tabular_columns)}</div>
          </div>
        </div>
      </div>`;
    bindIdentifyFieldEditors(body.querySelector("#visorAdminIdentifyCols"));
    bindIdentifyFieldEditors(body.querySelector("#visorAdminTabularCols"));
    bindSpatialFieldEditors(body.querySelector("#visorAdminSpatialFields"));
    bindIdentifyFieldEditors(body.querySelector("#visorAdminSpatialDetailCols"));
    bindSpatialStepUi(body);
    bindTabularStepUi(body);
  } catch (err) {
    body.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(err?.message || "Error al cargar columnas")}</p>`;
  }
}

async function renderStepMap(body) {
  body.innerHTML = '<p class="small text-muted mb-0">Cargando columnas…</p>';
  try {
    const cols = await prepareColumnsWizardDefaults();
    const labelMinz = wizard.labels_minzoom ?? defaultLabelMinzoom(wizard.geometry);
    const labelField = wizard.labels_field || cols[0] || "";
    const searchTipo = escapeHtml(wizard.search_tipo || wizard.label || "");
    const searchExtras = searchExtraColumnsHtml(
      cols,
      wizard.search_name_column,
      wizard.search_columns.filter((c) => c !== wizard.search_name_column),
    );
    body.innerHTML = `
      <div class="visor-admin-step-map">
        ${isMapStepSkipped() ? `<div class="alert alert-info py-2 px-2 small mb-2">Sin etiquetas ni buscador activos, este paso se <strong>omite</strong> al pulsar Siguiente. Actívelos aquí o vuelva después desde la barra de pasos.</div>` : ""}
        <p class="small text-muted mb-2">Texto sobre el mapa y participación en el buscador del visor (independiente del popup).</p>
        <div class="visor-admin-labels-block border rounded p-2 mb-3">
          <div class="form-check form-check-sm mb-2">
            <input class="form-check-input" type="checkbox" id="visorAdminLabelsEnabled" ${wizard.labels_enabled ? "checked" : ""} />
            <label class="form-check-label small fw-semibold" for="visorAdminLabelsEnabled">Etiquetas automáticas en el mapa</label>
          </div>
          <div id="visorAdminLabelsOptions" class="${wizard.labels_enabled ? "" : "d-none"}">
            <div class="row g-2 align-items-end">
              <div class="col-md-5">
                <label class="form-label small mb-1" for="visorAdminLabelsField">Campo del letrerito</label>
                <select class="form-select form-select-sm" id="visorAdminLabelsField">${labelFieldOptionsHtml(cols, wizard.identify_fields, labelField)}</select>
              </div>
              <div class="col-md-3">
                <label class="form-label small mb-1" for="visorAdminLabelsMinzoom">Zoom mínimo</label>
                <input type="number" class="form-control form-control-sm" id="visorAdminLabelsMinzoom" min="8" max="20" step="0.5" value="${escapeHtml(String(labelMinz))}" />
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1" for="visorAdminLabelsColor">Color del texto</label>
                <input type="color" class="form-control form-control-color form-control-sm w-100" id="visorAdminLabelsColor" value="${escapeHtml(wizard.labels_color || "#2c3e50")}" />
              </div>
            </div>
            <div class="row g-2 align-items-end mt-2">
              <div class="col-md-3">
                <label class="form-label small mb-1" for="visorAdminLabelsOffsetX">Desplazamiento X</label>
                <input type="number" class="form-control form-control-sm" id="visorAdminLabelsOffsetX" step="0.1" value="${escapeHtml(String(wizard.labels_offset_x ?? 0))}" />
              </div>
              <div class="col-md-3">
                <label class="form-label small mb-1" for="visorAdminLabelsOffsetY">Desplazamiento Y</label>
                <input type="number" class="form-control form-control-sm" id="visorAdminLabelsOffsetY" step="0.1" value="${escapeHtml(String(wizard.labels_offset_y ?? 0))}" />
              </div>
              <div class="col-md-6">
                <div class="form-text mb-0">Unidades em (MapLibre). Y negativo sube el texto. Con puntos e «encima del símbolo», 0/0 usa ajuste automático.</div>
              </div>
            </div>
            <div class="form-check form-check-sm mt-2 ${wizard.geometry === "point" ? "" : "d-none"}" id="visorAdminLabelsAboveWrap">
              <input class="form-check-input" type="checkbox" id="visorAdminLabelsAboveIcon" ${wizard.labels_above_icon !== false ? "checked" : ""} />
              <label class="form-check-label small" for="visorAdminLabelsAboveIcon">Mostrar encima del símbolo (puntos)</label>
            </div>
            <p class="form-text mb-0 mt-2">Las etiquetas se dibujan al superar el zoom mínimo.${wizard.geometry === "polygon" ? " En polígonos se usa un <strong>centroide</strong> (una etiqueta por elemento)." : ""}${wizard.geometry === "point" && wizard.cluster_enabled ? " Con <strong>clusters</strong>, en zoom alejado solo en puntos sueltos; al acercar, en todos los puntos vía MVT." : ""}</p>
          </div>
        </div>
        <div class="visor-admin-search-block border rounded p-2">
          <div class="form-check form-check-sm mb-2">
            <input class="form-check-input" type="checkbox" id="visorAdminSearchEnabled" ${wizard.search_enabled ? "checked" : ""} />
            <label class="form-check-label small fw-semibold" for="visorAdminSearchEnabled">Incluir en buscador del visor</label>
          </div>
          <div id="visorAdminSearchOptions" class="${wizard.search_enabled ? "" : "d-none"}">
            <p class="form-text mb-2">Los resultados usan el catálogo (<code>search</code>). El alcance municipal/estatal sigue el de la capa.</p>
            <div class="row g-2 align-items-end">
              <div class="col-md-4">
                <label class="form-label small mb-1" for="visorAdminSearchTipo">Tipo en resultados</label>
                <input type="text" class="form-control form-control-sm" id="visorAdminSearchTipo" value="${searchTipo}" placeholder="Ej. Localidad (RNC)" />
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1" for="visorAdminSearchNameColumn">Campo nombre</label>
                <select class="form-select form-select-sm" id="visorAdminSearchNameColumn">${labelFieldOptionsHtml(cols, wizard.identify_fields, wizard.search_name_column)}</select>
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1" for="visorAdminSearchIdColumn">Campo identificador</label>
                <select class="form-select form-select-sm" id="visorAdminSearchIdColumn">${labelFieldOptionsHtml(cols, wizard.identify_fields, wizard.search_id_column)}</select>
              </div>
            </div>
            <div class="mt-2">
              <div class="fw-semibold small mb-1">Columnas adicionales de búsqueda</div>
              <div class="form-text mb-1">Además del nombre, puede buscar por claves u otros atributos (ILIKE).</div>
              <div id="visorAdminSearchExtraCols" class="visor-admin-cols-list atlas-scroll">${searchExtras}</div>
            </div>
          </div>
        </div>
      </div>`;
    bindLabelsStepUi(body);
    bindSearchStepUi(body, cols);
  } catch (err) {
    body.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(err?.message || "Error al cargar columnas")}</p>`;
  }
}

function renderStepStyle(body) {
  const showDenue = isDenueTable(wizard.table);
  const classes = normalizeStyleClasses(wizard.style_classes);
  const styleTab = wizard.style_tab || defaultStyleTabForPreset(wizard.style_preset);
  wizard.style_tab = styleTab;
  body.innerHTML = `
    <div class="visor-admin-style-step">
      ${layerMinzoomControlsHtml()}
      ${clusterControlsHtml()}
      <ul class="nav nav-tabs nav-tabs-sm visor-admin-style-tabs mb-2" role="tablist">
        <li class="nav-item" role="presentation">
          <button type="button" class="nav-link ${styleTab === "basic" ? "active" : ""}" data-style-tab="basic" role="tab">Básico</button>
        </li>
        <li class="nav-item" role="presentation">
          <button type="button" class="nav-link ${styleTab === "attribute" ? "active" : ""}" data-style-tab="attribute" role="tab">Por atributo</button>
        </li>
        <li class="nav-item" role="presentation">
          <button type="button" class="nav-link ${styleTab === "advanced" ? "active" : ""}" data-style-tab="advanced" role="tab">Avanzado</button>
        </li>
      </ul>
      <div id="visorAdminStyleTabBasic" class="visor-admin-style-tab-pane ${styleTab !== "basic" ? "d-none" : ""}">
        <div class="mb-2">
          <label class="form-label small mb-1">Preset de simbología</label>
          <select class="form-select form-select-sm" id="visorAdminPreset">${presetOptionsHtml()}</select>
          <div class="form-text" id="visorAdminPresetHint">Para colorear por un campo de la tabla, elija un preset del grupo <strong>Por atributo</strong> o use la pestaña <strong>Por atributo</strong>.</div>
        </div>
        ${showDenue ? `
        <div class="visor-admin-denue-block border rounded p-2 mb-2">
          <div class="fw-semibold small mb-1">Capa DENUE (tabla c_denue)</div>
          <div class="mb-2">
            <label class="form-label small mb-1" for="visorAdminDenuePreset">Plantilla de actividad</label>
            <select class="form-select form-select-sm" id="visorAdminDenuePreset">${denuePresetOptionsHtml(wizard.denue_preset_key)}</select>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-1" for="visorAdminDenueCodigos">Códigos SCIAN (separados por coma)</label>
            <input type="text" class="form-control form-control-sm" id="visorAdminDenueCodigos" value="${escapeHtml((wizard.denue_codigo_act || []).join(", "))}" placeholder="468411, 468412" />
          </div>
          <div class="form-check form-check-sm mb-0">
            <input class="form-check-input" type="checkbox" id="visorAdminDenueTemplate" ${wizard.denue_use_template !== false ? "checked" : ""} />
            <label class="form-check-label small" for="visorAdminDenueTemplate">Popup con plantilla DENUE</label>
          </div>
        </div>` : ""}
        <div class="mb-2" id="visorAdminColorWrap">
          <label class="form-label small mb-1">Color</label>
          <input type="color" class="form-control form-control-color form-control-sm" id="visorAdminColor" value="${escapeHtml(wizard.color)}" />
        </div>
        <div class="mb-2 d-none" id="visorAdminIconWrap">
          <label class="form-label small mb-1">Icono</label>
          <select class="form-select form-select-sm" id="visorAdminIcon">${iconOptionsHtml()}</select>
          <div class="visor-admin-icon-upload border rounded p-2 mt-2">
            <div class="fw-semibold small mb-1">Subir icono SVG</div>
            <div class="alert alert-info py-2 px-2 small mb-2 visor-admin-icon-hint">
              <strong>Recomendado para mapa:</strong> SVG con <code>viewBox="0 0 32 32"</code>, trazo grueso o relleno sólido.
              Evite logos con línea muy fina o SVG de Potrace sin revisar — en el mapa se rasterizan pequeños y el contorno se adelgaza.
              <div class="mt-1">Catálogo de iconos del visor (referencia y reutilización):
                <a href="./assets/icons/map/" target="_blank" rel="noopener">assets/icons/map/</a>
                · registro en <code>config/visor/icons.json</code>
              </div>
            </div>
            <div class="row g-2">
              <div class="col-sm-4">
                <label class="form-label small mb-1" for="visorAdminIconKey">Clave (catálogo)</label>
                <input type="text" class="form-control form-control-sm" id="visorAdminIconKey" placeholder="mi_capa_icon" />
              </div>
              <div class="col-sm-4">
                <label class="form-label small mb-1" for="visorAdminIconLabel">Etiqueta</label>
                <input type="text" class="form-control form-control-sm" id="visorAdminIconLabel" placeholder="Mi icono" />
              </div>
              <div class="col-sm-4">
                <label class="form-label small mb-1" for="visorAdminIconFile">Archivo .svg</label>
                <input type="file" class="form-control form-control-sm" id="visorAdminIconFile" accept=".svg,image/svg+xml" />
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="visorAdminIconUploadBtn">Registrar icono</button>
            <div id="visorAdminIconUploadWarn" class="small mt-2"></div>
            <div id="visorAdminIconUploadStatus" class="small mt-1 text-muted"></div>
          </div>
        </div>
        <div class="visor-admin-style-preview border rounded p-1 mt-2">
          <div class="small text-muted px-1 pt-1">Vista previa</div>
          <div id="visorAdminStylePreviewHost"></div>
        </div>
      </div>
      <div id="visorAdminStyleTabAttr" class="visor-admin-style-tab-pane ${styleTab !== "attribute" ? "d-none" : ""}">
        <div id="visorAdminStyleAttrHint" class="alert alert-secondary py-2 px-2 small mb-2">
          Elija un preset por atributo y el campo de la tabla para clasificar colores en mapa y leyenda.
        </div>
        <div class="mb-2">
          <label class="form-label small mb-1" for="visorAdminPresetAttr">Preset por atributo</label>
          <select class="form-select form-select-sm" id="visorAdminPresetAttr">${byAttributePresetOptionsHtml(wizard.geometry)}</select>
        </div>
        <div id="visorAdminStyleAttrPanel" class="mb-2 d-none">
          <label class="form-label small mb-1" for="visorAdminStyleField">Campo de clasificación (MVT)</label>
          <select class="form-select form-select-sm" id="visorAdminStyleField" disabled>
            <option value="">Cargando columnas…</option>
          </select>
          <div id="visorAdminStyleFieldStatus" class="form-text">Consultando columnas de <code>${escapeHtml(wizard.table || "—")}</code>…</div>
          <div id="visorAdminDistinctPanel" class="visor-admin-distinct-panel border rounded p-2 mt-2 d-none">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
              <span class="small fw-semibold mb-0">Valores en la tabla</span>
              <button type="button" class="btn btn-sm btn-primary" id="visorAdminAutoclassifyBtn" disabled>Autoclasificar</button>
            </div>
            <div id="visorAdminDistinctStatus" class="small text-muted mb-1"></div>
            <div id="visorAdminDistinctValues" class="visor-admin-distinct-values atlas-scroll"></div>
          </div>
          <div class="form-text">Valores únicos del atributo → color en mapa y leyenda. Ajuste colores/etiquetas tras autoclasificar.</div>
          <div class="mt-2">
            <label class="form-label small mb-1">Color por defecto (otros valores)</label>
            <input type="color" class="form-control form-control-color form-control-sm" id="visorAdminDefaultColor" value="${escapeHtml(wizard.default_color || "#94a3b8")}" />
          </div>
          <div class="fw-semibold small mt-2 mb-1">Clases valor / color</div>
          <div id="visorAdminStyleClasses" class="visor-admin-class-list">${styleClassRowsHtml(classes)}</div>
          <button type="button" class="btn btn-sm btn-outline-secondary mt-1" id="visorAdminAddClass">+ Agregar clase</button>
        </div>
      </div>
      <div id="visorAdminStyleTabAdvanced" class="visor-admin-style-tab-pane ${styleTab !== "advanced" ? "d-none" : ""}">
        <p class="form-text mb-2">Opacidad, grosores, contornos, tipo de línea y escala de icono según el preset elegido en Básico.</p>
        ${styleAdvancedControlsHtml({ inTab: true })}
      </div>
    </div>`;
  const presetEl = body.querySelector("#visorAdminPreset");
  const previewHost = body.querySelector("#visorAdminStylePreviewHost");
  const attrWrap = body.querySelector("#visorAdminStyleAttrPanel");
  const syncPresetUi = async () => {
    const preset = presetEl?.value || wizard.style_preset;
    wizard.style_preset = preset;
    const isSymbol = preset === "point_symbol" || preset === "point_symbol_by_attribute";
    const isAttr = isByAttributePreset(preset);
    body.querySelector("#visorAdminIconWrap")?.classList.toggle("d-none", !isSymbol);
    body.querySelector("#visorAdminColorWrap")?.classList.toggle("d-none", isSymbol || isAttr);
    body.querySelector("#visorAdminPresetHint")?.classList.toggle("d-none", isAttr);
    if (attrWrap) attrWrap.classList.toggle("d-none", wizard.style_tab !== "attribute" || !isAttr);
    const opt = presetEl?.selectedOptions?.[0];
    if (opt?.dataset.geometry) {
      wizard.geometry = opt.dataset.geometry;
    }
    if (isAttr) {
      const attrPresetEl = body.querySelector("#visorAdminPresetAttr");
      if (attrPresetEl) attrPresetEl.value = preset;
      const fieldEl = body.querySelector("#visorAdminStyleField");
      if (fieldEl && !wizard.table_columns.length) {
        fieldEl.disabled = true;
        fieldEl.innerHTML = `<option value="">Cargando columnas…</option>`;
      }
      await ensureTableColumnsLoaded();
      if (fieldEl) fieldEl.disabled = false;
      refreshStyleFieldSelect(body, wizard.style_field);
      if (wizard.style_field) {
        await loadDistinctFieldPanel(body, previewHost);
      }
    }
    syncStyleTabUi(body);
    syncStyleAdvancedUi();
    refreshStylePreview(previewHost);
  };
  if (presetEl) {
    presetEl.value = wizard.style_preset;
    presetEl.addEventListener("change", () => void syncPresetUi());
  }
  const iconEl = body.querySelector("#visorAdminIcon");
  if (iconEl && wizard.icon_key) iconEl.value = wizard.icon_key;
  iconEl?.addEventListener("change", () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminColor")?.addEventListener("input", () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminDefaultColor")?.addEventListener("input", () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminStyleAdvanced")?.addEventListener("input", () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminStyleAdvanced")?.addEventListener("change", () => refreshStylePreview(previewHost));
  bindStyleClassEditor(attrWrap, () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminStyleField")?.addEventListener("change", () => {
    void loadDistinctFieldPanel(body, previewHost);
  });
  body.querySelector("#visorAdminAutoclassifyBtn")?.addEventListener("click", () => {
    runAutoclassify(body, previewHost);
  });
  body.querySelector("#visorAdminIconUploadBtn")?.addEventListener("click", () => void uploadIconFromStyleStep(body));
  bindIconUploadHints(body);
  body.querySelector("#visorAdminDenuePreset")?.addEventListener("change", (ev) => {
    const key = ev.target.value;
    if (key) applyDenuePreset(key);
    const codigosEl = body.querySelector("#visorAdminDenueCodigos");
    if (codigosEl) codigosEl.value = (wizard.denue_codigo_act || []).join(", ");
    if (presetEl) presetEl.value = wizard.style_preset;
    if (iconEl && wizard.icon_key) iconEl.value = wizard.icon_key;
    syncPresetUi();
  });
  bindStyleTabUi(body, syncPresetUi);
  const attrPresetEl = body.querySelector("#visorAdminPresetAttr");
  if (attrPresetEl) {
    const attrDefault = isByAttributePreset(wizard.style_preset)
      ? wizard.style_preset
      : defaultByAttributePresetForGeometry(wizard.geometry);
    if (attrDefault) attrPresetEl.value = attrDefault;
    attrPresetEl.addEventListener("change", () => {
      const next = attrPresetEl.value;
      if (!next) return;
      wizard.style_preset = next;
      if (presetEl) presetEl.value = next;
      void syncPresetUi();
    });
  }
  bindLayerMinzoomUi(body);
  bindClusterStepUi(body);
  void syncPresetUi();
}

function renderStepReview(body) {
  const exports = [];
  if (wizard.export_kml) exports.push("KML");
  if (wizard.export_shp) exports.push("SHP");
  const layerId =
    wizard.mode === "edit"
      ? wizard.editingLayerId
      : document.getElementById("visorAdminLayerId")?.value || layerIdFromTable(wizard.table);
  const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields);
  const idf =
    idFields.map((f) => (f.label !== f.column ? `${f.label} (${f.column})` : f.label)).join(", ") || "gid";
  const idTitle = (wizard.identify_title || wizard.label || "").trim();
  const exp =
    wizard.export_columns.length > 0 ? wizard.export_columns.join(", ") : "Todas las columnas";
  const kmlLabelField = wizard.export_kml
    ? wizard.export_kml_name_field || defaultKmlNameField(wizard.table_columns) || "—"
    : null;
  const labelsSummary = wizard.labels_enabled
    ? `${wizard.labels_field || "—"} (zoom ≥ ${wizard.labels_minzoom ?? defaultLabelMinzoom(wizard.geometry)}${wizard.labels_offset_x || wizard.labels_offset_y ? ` · offset ${wizard.labels_offset_x}, ${wizard.labels_offset_y}` : ""})`
    : "Desactivadas";
  const searchSummary = wizard.search_enabled
    ? `${wizard.search_tipo || wizard.label || "—"} · ${wizard.search_name_column || "—"}`
    : "No incluida";
  const filterSummary =
    wizard.data_filter_enabled && wizard.data_filter_field
      ? `${wizard.data_filter_field} ∈ ${(wizard.data_filter_values || []).join(", ") || "—"}`
      : "Sin filtro de atributo";
  const styleSummary = isByAttributePreset(wizard.style_preset)
    ? `${wizard.style_preset} · ${wizard.style_field || "—"} (${normalizeStyleClasses(wizard.style_classes).length} clases)`
    : document.getElementById("visorAdminPreset")?.value || wizard.style_preset;
  const layerMinzoomSummary = wizard.layer_minzoom_enabled
    ? `Zoom ≥ ${wizard.style_minzoom ?? defaultLayerMinzoom(wizard.geometry)} (aviso en mapa)`
    : "Sin límite (visible en cualquier zoom)";
  const denueSummary = isDenueTable(wizard.table)
    ? `${(wizard.denue_codigo_act || []).join(", ") || "—"}${wizard.denue_use_template !== false ? " · plantilla DENUE" : ""}`
    : null;
  const spatialFields = normalizeSpatialFieldObjects(wizard.spatial_fields);
  const spatialModo = wizard.spatial_modo || defaultSpatialModo(wizard.geometry);
  const spatialSummary = wizard.spatial_enabled
    ? spatialModo === "conteo"
      ? `Conteo de elementos${wizard.spatial_detail_table ? " · tabla detalle" : ""}`
      : `${spatialFields.length} indicador(es)${wizard.spatial_detail_table ? " · tabla detalle" : ""}`
    : "Desactivado";
  const tabularCols = normalizeTabularColumns(wizard.tabular_columns);
  const tabularSummary = wizard.tabular_enabled
    ? `${tabularCols.length} columna(s) · municipio activo`
    : "Desactivada";
  const clusterSummary =
    wizard.geometry === "point" && wizard.cluster_enabled
      ? `Activo · preset ${wizard.cluster_preset || "standard"}`
      : wizard.geometry === "point"
        ? "Desactivado"
        : "—";
  const mapSkipped = isMapStepSkipped();
  body.innerHTML = `
    <p class="small visor-admin-review-hint mb-2 mb-md-3">Resumen de la configuración. Para cambiar algo, pulse cualquier paso en la barra superior o use <strong>Atrás</strong>.</p>
    <dl class="small mb-2 visor-admin-review">
      <dt>Tabla</dt><dd>${escapeHtml(wizard.table)}</dd>
      <dt>Capa</dt><dd>${escapeHtml(layerId)}</dd>
      <dt>Etiqueta</dt><dd>${escapeHtml(document.getElementById("visorAdminLabel")?.value || wizard.label || "")}</dd>
      <dt>Preset</dt><dd>${escapeHtml(styleSummary)}</dd>
      <dt>Zoom capa</dt><dd>${escapeHtml(layerMinzoomSummary)}</dd>
      ${denueSummary ? `<dt>DENUE</dt><dd>${escapeHtml(denueSummary)}</dd>` : ""}
      <dt>Alcance</dt><dd>${wizard.mun_scope === "estatal" ? "Estatal" : "Municipal"}</dd>
      <dt>Título popup</dt><dd>${escapeHtml(idTitle || "—")}</dd>
      <dt>Identify</dt><dd>${escapeHtml(idf)}</dd>
      <dt>Etiquetas mapa</dt><dd>${escapeHtml(labelsSummary)}</dd>
      <dt>Buscador</dt><dd>${escapeHtml(searchSummary)}</dd>
      <dt>Filtro atributo</dt><dd>${escapeHtml(filterSummary)}</dd>
      <dt>Análisis espacial</dt><dd>${escapeHtml(spatialSummary)}</dd>
      <dt>Consulta tabular</dt><dd>${escapeHtml(tabularSummary)}</dd>
      <dt>Clusters</dt><dd>${escapeHtml(clusterSummary)}</dd>
      <dt>Export cols</dt><dd>${escapeHtml(exp)}</dd>
      <dt>Exportación</dt><dd>${exports.length ? exports.join(", ") : "Ninguna"}${kmlLabelField ? ` · KML etiqueta: ${escapeHtml(kmlLabelField)}` : ""}</dd>
    </dl>
    ${mapSkipped ? `<p class="small text-muted mb-2">Paso <strong>Etiquetas y búsqueda</strong> omitido. Puede configurarlo desde la barra de pasos antes de publicar.</p>` : ""}
    ${renderIndexHintsShell()}
    <div id="visorAdminStatus" class="small mt-2 text-danger" hidden></div>
    ${wizard.martin_needs_restart ? `<div class="alert alert-warning py-2 px-2 small mb-0">Recuerde reiniciar Martin si la tabla es nueva: <code>docker compose restart martin</code></div>` : ""}`;
  void refreshIndexHintsPanel();
}

function readStepFields() {
  wizard.label = document.getElementById("visorAdminLabel")?.value?.trim() || wizard.label;
  wizard.group_id = document.getElementById("visorAdminGroup")?.value || wizard.group_id;
  wizard.geometry = document.getElementById("visorAdminGeometry")?.value || wizard.geometry;
  wizard.style_preset = document.getElementById("visorAdminPreset")?.value || wizard.style_preset;
  wizard.color = document.getElementById("visorAdminColor")?.value || wizard.color;
  wizard.icon_key = document.getElementById("visorAdminIcon")?.value || wizard.icon_key;
  if (document.getElementById("visorAdminStyleField")) {
    wizard.style_field = document.getElementById("visorAdminStyleField")?.value?.trim() || "";
    wizard.default_color =
      document.getElementById("visorAdminDefaultColor")?.value?.trim() || wizard.default_color;
    wizard.style_classes = readStyleClassesFromDom();
  }
  if (document.getElementById("visorAdminDenueCodigos")) {
    const raw = document.getElementById("visorAdminDenueCodigos")?.value || "";
    wizard.denue_codigo_act = raw
      .split(/[,;\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    wizard.denue_use_template = Boolean(document.getElementById("visorAdminDenueTemplate")?.checked);
    wizard.denue_preset_key = document.getElementById("visorAdminDenuePreset")?.value || "";
  }
  if (document.getElementById("visorAdminStyleAdvanced")) {
    readAdvancedStyleFromDom();
  }
  readLayerMinzoomFromDom();
  const kmlEl = document.getElementById("visorAdminExpKml");
  if (kmlEl) wizard.export_kml = Boolean(kmlEl.checked);
  const kmlNameEl = document.getElementById("visorAdminKmlNameField");
  if (kmlNameEl) wizard.export_kml_name_field = kmlNameEl.value || "";
  const shpEl = document.getElementById("visorAdminExpShp");
  if (shpEl) wizard.export_shp = Boolean(shpEl.checked);
  const scopeEl = document.getElementById("visorAdminMunScope");
  if (scopeEl) wizard.mun_scope = scopeEl.value === "estatal" ? "estatal" : "municipio";
  if (document.getElementById("visorAdminIdentifyTitle")) {
    wizard.identify_title = document.getElementById("visorAdminIdentifyTitle")?.value?.trim() || "";
  }
  if (document.getElementById("visorAdminIdentifyCols")) {
    wizard.identify_fields = readIdentifyFieldsFromDom();
  }
  if (document.getElementById("visorAdminExportCols")) {
    wizard.export_columns = readCheckedColumns("visorAdminExportCols");
  }
  if (document.getElementById("visorAdminSpatialEnabled")) {
    wizard.spatial_enabled = Boolean(document.getElementById("visorAdminSpatialEnabled")?.checked);
    wizard.spatial_modo =
      document.getElementById("visorAdminSpatialModo")?.value || defaultSpatialModo(wizard.geometry);
    wizard.spatial_fields = readSpatialFieldsFromDom();
    wizard.spatial_detail_table = Boolean(
      document.getElementById("visorAdminSpatialDetailTable")?.checked,
    );
    wizard.spatial_detail_columns = readSpatialDetailColumnsFromDom();
    wizard.spatial_ui_unidad =
      document.getElementById("visorAdminSpatialUnidad")?.value?.trim() || "";
    wizard.spatial_ui_empty_msg =
      document.getElementById("visorAdminSpatialEmptyMsg")?.value?.trim() || "";
  }
  if (document.getElementById("visorAdminTabularEnabled")) {
    wizard.tabular_enabled = Boolean(document.getElementById("visorAdminTabularEnabled")?.checked);
    wizard.tabular_columns = readTabularColumnsFromDom();
  }
  if (document.getElementById("visorAdminClusterEnabled")) {
    wizard.cluster_enabled = Boolean(document.getElementById("visorAdminClusterEnabled")?.checked);
    wizard.cluster_preset = document.getElementById("visorAdminClusterPreset")?.value || "standard";
  }
  readLabelsFromDom();
  readSearchFromDom();
  readDataFilterFromDom();
}

function buildPayload() {
  readStepFields();
  const layerId =
    wizard.mode === "edit"
      ? wizard.editingLayerId
      : document.getElementById("visorAdminLayerId")?.value?.trim() || layerIdFromTable(wizard.table);
  const style = {};
  if (isByAttributePreset(wizard.style_preset)) {
    style.field = wizard.style_field;
    style.default_color = wizard.default_color || "#94a3b8";
    style.classes = normalizeStyleClasses(wizard.style_classes);
  } else if (wizard.style_preset === "point_symbol") {
    style.icon_key = wizard.icon_key || (_meta?.icons?.[0]?.key ?? "");
  } else if (wizard.style_preset === "line_outline") {
    style.color = wizard.color;
    style.halo_color = wizard.style_halo_color || wizard.color;
  } else if (wizard.style_preset === "line_simple") {
    style.color = wizard.color;
  } else if (wizard.style_preset === "polygon_fill") {
    style.color = wizard.color;
  } else {
    style.color = wizard.color;
  }
  mergeAdvancedStyleIntoPayload(style, wizard.style_preset);
  if (wizard.layer_minzoom_enabled) {
    const mz = Number(wizard.style_minzoom);
    if (Number.isFinite(mz) && mz >= 0) style.minzoom = mz;
  }
  const exportFormats = [];
  if (wizard.export_kml) exportFormats.push("kml");
  if (wizard.export_shp) exportFormats.push("shp");
  const data = {
    table: wizard.table,
    mun_filter: wizard.mun_scope === "estatal" ? false : "cve_mun",
  };
  if (wizard.data_filter_enabled && wizard.data_filter_field && wizard.data_filter_values.length) {
    data.filter = {
      field: wizard.data_filter_field,
      values: wizard.data_filter_values,
    };
  }
  if (wizard.export_columns.length) data.export_columns = wizard.export_columns;
  if (wizard.export_kml) {
    const kmlCols =
      wizard.export_columns.length > 0
        ? wizard.export_columns
        : wizard.table_columns.length
          ? wizard.table_columns
          : [];
    const kmlName = (
      wizard.export_kml_name_field ||
      defaultKmlNameField(kmlCols) ||
      ""
    ).trim();
    if (kmlName) {
      data.export = { ...(data.export || {}), kml_name_field: kmlName };
    }
  }
  const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields);
  const idTitle = (wizard.identify_title || wizard.label || layerId).trim();
  const spatialEnabled = Boolean(wizard.spatial_enabled);
  const tabularEnabled = Boolean(wizard.tabular_enabled);
  const payload = {
    layer_id: layerId,
    label: wizard.label || layerId,
    group_id: wizard.group_id || _meta?.groups?.[0]?.id || "servicios",
    geometry: wizard.geometry,
    style_preset: wizard.style_preset,
    style,
    data,
    capabilities: {
      export: exportFormats,
      tabular: tabularEnabled,
      spatial_analysis: spatialEnabled,
    },
  };
  const useDenueTemplate =
    isDenueTable(wizard.table) && wizard.denue_use_template !== false && wizard.denue_codigo_act.length;
  if (!useDenueTemplate) {
    payload.identify = {
      title: idTitle,
      fields: idFields.length ? idFields : [{ column: "gid", label: defaultFieldLabel("gid") }],
    };
  } else {
    payload.identify = { title: idTitle, fields: [] };
  }
  if (wizard.labels_enabled && wizard.labels_field) {
    payload.labels = {
      enabled: true,
      field: wizard.labels_field,
      minzoom: wizard.labels_minzoom ?? defaultLabelMinzoom(wizard.geometry),
      above_icon: wizard.labels_above_icon !== false,
      color: wizard.labels_color || "#2c3e50",
    };
    const ox = Number(wizard.labels_offset_x) || 0;
    const oy = Number(wizard.labels_offset_y) || 0;
    if (ox !== 0 || oy !== 0) {
      payload.labels.offset = [ox, oy];
    }
    if (wizard.geometry === "polygon") {
      payload.labels.source = "centroid";
    }
    const exportCols = new Set(data.export_columns || wizard.export_columns || []);
    exportCols.add(wizard.labels_field);
    data.export_columns = [...exportCols];
  }
  if (idFields.length) {
    const exportCols = new Set(data.export_columns || wizard.export_columns || []);
    for (const f of idFields) {
      if (f.column) exportCols.add(f.column);
    }
    if (exportCols.size) data.export_columns = [...exportCols];
  }
  if (isDenueTable(wizard.table) && wizard.denue_codigo_act.length) {
    payload.denue = {
      codigo_act: wizard.denue_codigo_act,
      use_template: wizard.denue_use_template !== false,
    };
  }
  if (wizard.search_enabled && wizard.search_name_column) {
    payload.search = {
      enabled: true,
      tipo: (wizard.search_tipo || wizard.label || layerId).trim(),
      name_column: wizard.search_name_column,
      id_column: wizard.search_id_column || "cvegeo",
      search_columns: wizard.search_columns.length
        ? wizard.search_columns
        : [wizard.search_name_column],
    };
  }
  if (wizard.style_preset === "point_symbol" && style.icon_key) {
    payload.legend = {
      iconItems: [{ icon_key: style.icon_key, label: (wizard.label || layerId).trim() }],
    };
    if (style.cluster?.enabled) {
      payload.legend.items = [
        {
          kind: "circle",
          color: style.color || style.default_color || "#0d9488",
          label: "Grupo de puntos (cluster)",
        },
      ];
    }
  }
  if (spatialEnabled) {
    const modo =
      wizard.spatial_modo || defaultSpatialModo(wizard.geometry);
    const spatial = {
      modo: isDenueTable(wizard.table) ? "conteo" : modo,
      geom_column: "the_geom",
      detail_table: Boolean(wizard.spatial_detail_table),
    };
    if (spatial.modo === "agregacion") {
      const fields = normalizeSpatialFieldObjects(wizard.spatial_fields);
      if (fields.length) {
        spatial.sections = [{ titulo: "Indicadores", campos: fields }];
      }
    }
    if (wizard.spatial_detail_table) {
      let detailCols = normalizeSpatialDetailColumns(wizard.spatial_detail_columns);
      if (!detailCols.length && tabularEnabled) {
        detailCols = normalizeTabularColumns(wizard.tabular_columns).map((c) => ({
          columna: c.field,
          etiqueta: c.label,
        }));
      }
      if (detailCols.length) spatial.detail_columns = detailCols;
    }
    const ui = {};
    if (wizard.spatial_ui_unidad) ui.unidad_registro = wizard.spatial_ui_unidad;
    if (wizard.spatial_ui_empty_msg) ui.empty_msg = wizard.spatial_ui_empty_msg;
    if (Object.keys(ui).length) spatial.ui = ui;
    if (!isDenueTable(wizard.table)) {
      spatial.grupo = "tematicas";
    }
    payload.spatial_analysis = spatial;
  }
  if (tabularEnabled) {
    const cols = normalizeTabularColumns(wizard.tabular_columns);
    if (cols.length) {
      payload.tabular = {
        columns: cols.map((c) => ({ field: c.field, label: c.label })),
      };
    }
  }
  return payload;
}

async function renderWizardStep() {
  const modal = ensureModal();
  const body = modal.querySelector(".visor-admin-modal__body");
  const panel = modal.querySelector(".visor-admin-modal__panel");
  const btnPrev = modal.querySelector('[data-act="prev"]');
  const btnNext = modal.querySelector('[data-act="next"]');
  if (!body || !btnPrev || !btnNext) return;

  const def = wizardStepDef();
  const panelKind = def?.panel || "layer";
  panel?.classList.toggle("visor-admin-modal__panel--wide", panelKind === "columns" || panelKind === "map");
  panel?.classList.toggle("visor-admin-modal__panel--layer", panelKind === "layer");
  panel?.classList.toggle("visor-admin-modal__panel--columns", panelKind === "columns");
  panel?.classList.toggle("visor-admin-modal__panel--map", panelKind === "map");
  panel?.classList.toggle("visor-admin-modal__panel--style", panelKind === "style");
  body?.classList.toggle("visor-admin-modal__body--columns", panelKind === "columns");
  btnPrev.classList.toggle("invisible", wizard.step === 0);
  btnNext.textContent = isLastNavigableStep()
    ? wizard.mode === "edit"
      ? "Guardar"
      : "Publicar"
    : "Siguiente";

  renderWizardStepNav();
  if (def?.title) {
    const base = wizard.mode === "edit" ? "Editar capa" : "Publicar capa";
    setModalTitle(`${base} · ${def.title}`);
  }

  await renderStepById(def?.id || WIZARD_STEP.REVIEW, body);
  modal.classList.remove("d-none");
}

async function saveLayer() {
  const payload = buildPayload();
  const status = document.getElementById("visorAdminStatus");
  const isEdit = wizard.mode === "edit";
  const url = isEdit
    ? `/api/visor/admin/layers/${encodeURIComponent(wizard.editingLayerId)}`
    : "/api/visor/admin/layers";
  const { res, data } = await adminFetch(url, {
    method: isEdit ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = apiErrorMessage(data, isEdit ? "No se pudo actualizar la capa" : "No se pudo publicar la capa");
    if (status) {
      status.hidden = false;
      status.textContent = String(msg);
    } else {
      window.alert(String(msg));
    }
    return;
  }
  closeModal();
  purgeOrphanModalBackdrops();
  await reloadVisorLayerCatalog();
  document.dispatchEvent(new CustomEvent("atlasgro-visor-layers-panel-refresh"));
  window.alert(data?.message || (isEdit ? "Capa actualizada. Recargue el visor (Ctrl+F5)." : "Capa publicada. Recargue el visor (Ctrl+F5)."));
  purgeOrphanModalBackdrops();
}

async function publishLayer() {
  await saveLayer();
}

async function ensureAdminSession() {
  if (!isVisorAdminLoggedIn()) {
    window.location.href = "./visor-studio.html";
    return false;
  }
  const user = await verifyAdminSession();
  if (!user) {
    window.alert(
      "No se pudo validar la sesión admin.\n\n" +
        "1) Reinicie nginx: docker compose restart nginx_proxy api_backend\n" +
        "2) Vuelva a entrar en visor-studio.html",
    );
    window.location.href = "./visor-studio.html";
    return false;
  }
  return true;
}

function onWizardFooterNextClick() {
  if (_modalFooterMode === "manage") {
    closeModal();
    return;
  }
  void advanceWizardStep();
}

function onWizardFooterPrevClick() {
  if (_modalFooterMode === "manage") return;
  void retreatWizardStep();
}

function bindWizardNav() {
  const modal = ensureModal();
  const btnNext = modal.querySelector('[data-act="next"]');
  const btnPrev = modal.querySelector('[data-act="prev"]');
  if (!btnNext || !btnPrev) return;
  _modalFooterMode = "wizard";
  if (!modal.dataset.wizardNavBound) {
    modal.dataset.wizardNavBound = "1";
    btnNext.addEventListener("click", onWizardFooterNextClick);
    btnPrev.addEventListener("click", onWizardFooterPrevClick);
  }
  btnNext.disabled = false;
  btnNext.onclick = null;
  btnPrev.onclick = null;
  btnPrev.classList.remove("invisible");
}

async function openWizard() {
  if (!(await ensureAdminSession())) return;
  try {
    await loadMeta();
    resetWizardForCreate();
    setModalTitle("Publicar capa en el visor");
    await renderWizardStep();
    bindWizardNav();
  } catch (err) {
    console.error("[visor-admin]", err);
    window.alert(err?.message || "No se pudo abrir el asistente");
  }
}

async function openEditWizard(layerId) {
  if (!(await ensureAdminSession())) return;
  try {
    await loadMeta();
    const { res, data } = await adminFetch(
      `/api/visor/admin/layers/${encodeURIComponent(layerId)}`,
    );
    if (!res?.ok) throw new Error(apiErrorMessage(data, "No se pudo cargar la capa"));
    wizard.mode = "edit";
    wizard.editingLayerId = data.layer_id;
    wizard.step = 0;
    wizard.table = data.data?.table || "";
    wizard.label = data.label || "";
    wizard.group_id = data.group_id || _meta?.groups?.[0]?.id || "servicios";
    wizard.geometry = data.geometry || "polygon";
    wizard.style_preset = data.style_preset || "line_outline";
    wizard.color = data.style?.color || "#8c5f37";
    applyCatalogStyleToWizard(data.style || {});
    wizard.icon_key = data.style?.icon_key || "";
    wizard.style_field = data.style?.field || "";
    wizard.default_color = data.style?.default_color || "#94a3b8";
    wizard.style_classes = normalizeStyleClasses(data.style?.classes);
    wizard.style_tab = defaultStyleTabForPreset(wizard.style_preset);
    wizard.maxStepReached = wizardMaxStep();
    const denue = data.denue || {};
    wizard.denue_codigo_act = [...(denue.codigo_act || [])];
    wizard.denue_use_template = denue.use_template !== false;
    wizard.denue_preset_key =
      DENUE_CATALOG_PRESETS.find(
        (p) => JSON.stringify(p.codigo_act) === JSON.stringify(wizard.denue_codigo_act),
      )?.key || "";
    const caps = data.capabilities?.export || [];
    wizard.export_kml = caps.includes("kml");
    wizard.export_shp = caps.includes("shp");
    wizard.export_kml_name_field =
      data.data?.export_kml_name_field || data.data?.export?.kml_name_field || "";
    wizard.mun_scope = data.data?.mun_filter === false ? "estatal" : "municipio";
    wizard.identify_fields = normalizeIdentifyFieldObjects(data.identify?.fields);
    wizard.identify_title = data.identify?.title || data.label || "";
    const lb = data.labels || {};
    wizard.labels_enabled = Boolean(lb.enabled && lb.field);
    wizard.labels_field = lb.field || "";
    wizard.labels_minzoom = lb.minzoom ?? defaultLabelMinzoom(data.geometry || "point");
    wizard.labels_above_icon = lb.above_icon !== false;
    wizard.labels_color = lb.color || "#2c3e50";
    const off = lb.offset;
    wizard.labels_offset_x = Array.isArray(off) ? Number(off[0]) || 0 : 0;
    wizard.labels_offset_y = Array.isArray(off) ? Number(off[1]) || 0 : 0;
    wizard.export_columns = [...(data.data?.export_columns || [])];
    const filt = data.data?.filter || {};
    wizard.data_filter_enabled = Boolean(filt.field && Array.isArray(filt.values) && filt.values.length);
    wizard.data_filter_field = filt.field || "";
    wizard.data_filter_values = [...(filt.values || [])];
    const search = data.search || {};
    wizard.search_enabled = Boolean(search.enabled);
    wizard.search_tipo = search.tipo || data.label || "";
    wizard.search_name_column = search.name_column || "";
    wizard.search_id_column = search.id_column || "cvegeo";
    wizard.search_columns = [...(search.search_columns || [])];
    const spatial = data.spatial_analysis || {};
    wizard.spatial_enabled = Boolean(data.capabilities?.spatial_analysis);
    wizard.spatial_modo = spatial.modo || defaultSpatialModo(data.geometry || "polygon");
    wizard.spatial_fields = [...(spatial.fields || [])];
    wizard.spatial_detail_table = Boolean(spatial.detail_table);
    wizard.spatial_detail_columns = [...(spatial.detail_columns || [])];
    wizard.spatial_ui_unidad = spatial.ui?.unidad_registro || "";
    wizard.spatial_ui_empty_msg = spatial.ui?.empty_msg || "";
    const tabular = data.tabular || {};
    wizard.tabular_enabled = Boolean(data.capabilities?.tabular);
    wizard.tabular_columns = normalizeTabularColumns(tabular.columns || []);
    if (
      wizard.spatial_detail_table &&
      !wizard.spatial_detail_columns.length &&
      wizard.tabular_columns.length
    ) {
      wizard.spatial_detail_columns = wizard.tabular_columns.map((c) => ({
        columna: c.field,
        etiqueta: c.label,
      }));
    }
    wizard.table_columns = [];
    wizard.columns_load_error = "";
    if (wizard.table) {
      await ensureTableColumnsLoaded();
    }
    await renderWizardStep();
    bindWizardNav();
  } catch (err) {
    console.error("[visor-admin]", err);
    window.alert(err?.message || "No se pudo abrir el editor");
  }
}

async function unpublishLayer(layerId, label) {
  if (
    !window.confirm(
      `¿Despublicar "${label}" del catálogo?\n\nLa capa dejará de aparecer en el visor.`,
    )
  ) {
    return;
  }
  const { res, data } = await adminFetch(
    `/api/visor/admin/layers/${encodeURIComponent(layerId)}`,
    { method: "DELETE" },
  );
  if (!res?.ok) {
    window.alert(apiErrorMessage(data, "No se pudo despublicar la capa"));
    return;
  }
  await reloadVisorLayerCatalog();
  document.dispatchEvent(new CustomEvent("atlasgro-visor-layers-panel-refresh"));
  const manageBody = document
    .getElementById("visorCatalogAdminModal")
    ?.querySelector(".visor-admin-modal__body");
  if (manageBody?.querySelector(".visor-admin-manage-panel")) {
    await refreshManagePanel(manageBody);
  }
  window.alert(data?.message || "Capa despublicada.");
}

function formatAuditWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

async function renderManageGroupsTab(host) {
  host.innerHTML = '<p class="small text-muted mb-0">Cargando grupos…</p>';
  const { res, data } = await adminFetch("/api/visor/admin/groups");
  if (!res?.ok) {
    host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(apiErrorMessage(data, "No se pudo listar grupos"))}</p>`;
    return;
  }
  const groups = data?.groups || [];
  host.innerHTML = `
    <p class="small text-muted mb-2">
      Los grupos organizan el panel <strong>Capas</strong> del visor. Solo puede eliminar un grupo si no tiene capas asignadas.
    </p>
    <form class="visor-admin-group-form border rounded p-2 mb-3" id="visorAdminCreateGroupForm">
      <div class="fw-semibold small mb-2">Nuevo grupo</div>
      <div class="row g-2 align-items-end">
        <div class="col-sm-5">
          <label class="form-label small mb-0" for="visorAdminGroupLabel">Nombre visible</label>
          <input type="text" class="form-control form-control-sm" id="visorAdminGroupLabel" maxlength="120" placeholder="Ej. Proyectos municipales" required>
        </div>
        <div class="col-sm-4">
          <label class="form-label small mb-0" for="visorAdminGroupId">Id técnico <span class="text-muted">(opcional)</span></label>
          <input type="text" class="form-control form-control-sm font-monospace" id="visorAdminGroupId" maxlength="64" placeholder="proyectos_municipales">
        </div>
        <div class="col-sm-3">
          <button type="submit" class="btn btn-sm btn-primary w-100">Crear grupo</button>
        </div>
      </div>
      <div class="form-text small mt-1">Si deja el id vacío, se genera a partir del nombre (minúsculas y guiones bajos).</div>
    </form>
    ${
      groups.length
        ? `<ul class="list-group list-group-flush visor-admin-manage-list">
      ${groups
        .map((group) => {
          const count = Number(group.layer_count) || 0;
          const canDelete = count === 0;
          return `
        <li class="list-group-item px-0 py-2 d-flex align-items-start justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold small">${escapeHtml(group.label)}</div>
            <div class="text-muted small">
              <code>${escapeHtml(group.id)}</code>
              · ${count} capa${count === 1 ? "" : "s"}
            </div>
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-rename-group="${escapeHtml(group.id)}" data-label="${escapeHtml(group.label)}">Renombrar</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-delete-group="${escapeHtml(group.id)}" data-label="${escapeHtml(group.label)}" ${
              canDelete ? "" : "disabled"
            } title="${canDelete ? "Eliminar grupo vacío" : "Mueva o quite las capas antes de eliminar"}">Eliminar</button>
          </div>
        </li>`;
        })
        .join("")}
    </ul>`
        : '<p class="small text-muted mb-0">No hay grupos en el catálogo.</p>'
    }`;

  const labelInput = host.querySelector("#visorAdminGroupLabel");
  const idInput = host.querySelector("#visorAdminGroupId");
  let idTouched = false;
  idInput?.addEventListener("input", () => {
    idTouched = true;
  });
  labelInput?.addEventListener("input", () => {
    if (!idInput || idTouched) return;
    idInput.value = slugGroupIdFromLabel(labelInput.value);
  });

  host.querySelector("#visorAdminCreateGroupForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const label = labelInput?.value?.trim() || "";
    const groupId = idInput?.value?.trim() || slugGroupIdFromLabel(label);
    if (label.length < 2) {
      window.alert("Indique un nombre de al menos 2 caracteres.");
      return;
    }
    const { res: createRes, data: createData } = await adminFetch("/api/visor/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, group_id: groupId || undefined }),
    });
    if (!createRes?.ok) {
      window.alert(apiErrorMessage(createData, "No se pudo crear el grupo"));
      return;
    }
    await refreshCatalogAfterGroupChange();
    await renderManageGroupsTab(host);
    window.alert(createData?.message || "Grupo creado.");
  });

  host.querySelectorAll("[data-rename-group]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const gid = btn.getAttribute("data-rename-group");
      const current = btn.getAttribute("data-label") || "";
      const next = window.prompt("Nuevo nombre del grupo:", current);
      if (next == null) return;
      const label = next.trim();
      if (label.length < 2) {
        window.alert("El nombre debe tener al menos 2 caracteres.");
        return;
      }
      const { res: patchRes, data: patchData } = await adminFetch(
        `/api/visor/admin/groups/${encodeURIComponent(gid)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        },
      );
      if (!patchRes?.ok) {
        window.alert(apiErrorMessage(patchData, "No se pudo renombrar el grupo"));
        return;
      }
      await refreshCatalogAfterGroupChange();
      await renderManageGroupsTab(host);
    });
  });

  host.querySelectorAll("[data-delete-group]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const gid = btn.getAttribute("data-delete-group");
      const label = btn.getAttribute("data-label") || gid;
      if (
        !window.confirm(
          `¿Eliminar el grupo «${label}»?\n\nSolo es posible si no tiene capas. Esta acción no borra capas del catálogo.`,
        )
      ) {
        return;
      }
      const { res: delRes, data: delData } = await adminFetch(
        `/api/visor/admin/groups/${encodeURIComponent(gid)}`,
        { method: "DELETE" },
      );
      if (!delRes?.ok) {
        window.alert(apiErrorMessage(delData, "No se pudo eliminar el grupo"));
        return;
      }
      await refreshCatalogAfterGroupChange();
      await renderManageGroupsTab(host);
      window.alert(delData?.message || "Grupo eliminado.");
    });
  });
}

async function renderManageLayersTab(host) {
  host.innerHTML = '<p class="small text-muted mb-0">Cargando capas…</p>';
  const { res, data } = await adminFetch("/api/visor/admin/layers");
  if (!res?.ok) {
    host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(apiErrorMessage(data, "No se pudo listar capas"))}</p>`;
    return;
  }
  const layers = data?.layers || [];
  if (!layers.length) {
    host.innerHTML =
      '<p class="small text-muted mb-0">No hay capas publicadas desde Visor Studio. Use el botón <strong>+</strong> para agregar una.</p>';
    return;
  }
  host.innerHTML = `
    <p class="small text-muted mb-2">Capas publicadas con Visor Studio. Solo estas se pueden editar o despublicar.</p>
    <ul class="list-group list-group-flush visor-admin-manage-list">
      ${layers
        .map(
          (layer) => `
        <li class="list-group-item px-0 py-2 d-flex align-items-start justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold small">${escapeHtml(layer.label)}</div>
            <div class="text-muted small"><code>${escapeHtml(layer.layer_id)}</code> · ${escapeHtml(layer.table || "")}</div>
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button type="button" class="btn btn-sm btn-outline-primary" data-edit="${escapeHtml(layer.layer_id)}">Editar</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-delete="${escapeHtml(layer.layer_id)}" data-label="${escapeHtml(layer.label)}">Quitar</button>
          </div>
        </li>`,
        )
        .join("")}
    </ul>`;
  host.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeModal();
      void openEditWizard(btn.getAttribute("data-edit"));
    });
  });
  host.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void unpublishLayer(btn.getAttribute("data-delete"), btn.getAttribute("data-label")).then(
        () => void openManageModal(),
      );
    });
  });
}

async function renderAuditLogTab(host) {
  host.innerHTML = '<p class="small text-muted mb-0">Cargando registro…</p>';
  const { res, data } = await adminFetch("/api/visor/admin/audit?limit=60");
  if (!res?.ok) {
    host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(apiErrorMessage(data, "No se pudo cargar la auditoría"))}</p>`;
    return;
  }
  const entries = data?.entries || [];
  if (!entries.length) {
    host.innerHTML =
      '<p class="small text-muted mb-0">Sin registros aún. Las acciones de publicar capa, importar SHP o crear índices quedarán aquí.</p>';
    return;
  }
  host.innerHTML = `
    <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
      <p class="small text-muted mb-0">Últimas ${entries.length} de ${data?.total ?? entries.length} acciones registradas.</p>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-audit-refresh>Actualizar</button>
    </div>
    <div class="table-responsive visor-admin-audit-table-wrap">
      <table class="table table-sm table-borderless visor-admin-audit-table mb-0">
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
              <td class="visor-admin-audit-col-date text-nowrap">${escapeHtml(formatAuditWhen(entry.created_at))}</td>
              <td class="visor-admin-audit-col-user">${escapeHtml(entry.display_name || entry.username || "—")}</td>
              <td class="visor-admin-audit-col-action">${escapeHtml(entry.action_label || entry.action || "—")}</td>
              <td class="visor-admin-audit-col-detail">${escapeHtml(entry.summary || entry.layer_id || "—")}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  host.querySelector("[data-audit-refresh]")?.addEventListener("click", () => void renderAuditLogTab(host));
}

async function refreshManagePanel(body, tab = "layers") {
  const activeTab = body.querySelector(`[data-manage-tab="${tab}"]`) ? tab : "layers";
  const tabHost = body.querySelector("#visorAdminManageTabContent");
  if (!tabHost) return;
  body.querySelectorAll("[data-manage-tab]").forEach((btn) => {
    const isActive = btn.getAttribute("data-manage-tab") === activeTab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  if (activeTab === "audit") await renderAuditLogTab(tabHost);
  else if (activeTab === "groups") await renderManageGroupsTab(tabHost);
  else await renderManageLayersTab(tabHost);
}

async function renderManagePanel(body) {
  body.innerHTML = `
    <div class="visor-admin-manage-panel">
      <div class="visor-admin-manage-tabs d-flex gap-1 mb-2 flex-wrap" role="tablist" aria-label="Gestionar catálogo">
        <button type="button" class="btn btn-sm btn-outline-secondary active" data-manage-tab="layers" role="tab" aria-selected="true">Capas</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-manage-tab="groups" role="tab" aria-selected="false">Grupos</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-manage-tab="audit" role="tab" aria-selected="false">Registro de actividad</button>
      </div>
      <div id="visorAdminManageTabContent" role="tabpanel"></div>
    </div>`;
  body.querySelectorAll("[data-manage-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void refreshManagePanel(body, btn.getAttribute("data-manage-tab") || "layers");
    });
  });
  await refreshManagePanel(body, "layers");
}

async function renderManageList(body) {
  await renderManagePanel(body);
}

async function openManageModal() {
  if (!(await ensureAdminSession())) return;
  try {
    await loadMeta();
    const modal = ensureModal();
    setModalTitle("Gestionar catálogo");
    modal.querySelector(".visor-admin-modal__panel")?.classList.remove(
      "visor-admin-modal__panel--wide",
      "visor-admin-modal__panel--layer",
      "visor-admin-modal__panel--columns",
      "visor-admin-modal__panel--map",
      "visor-admin-modal__panel--style",
    );
    _modalFooterMode = "manage";
    modal.querySelector('[data-act="prev"]')?.classList.add("invisible");
    const btnNext = modal.querySelector('[data-act="next"]');
    if (btnNext) {
      btnNext.textContent = "Cerrar";
      btnNext.disabled = false;
    }
    const body = modal.querySelector(".visor-admin-modal__body");
    if (body) await renderManagePanel(body);
    modal.classList.remove("d-none");
  } catch (err) {
    console.error("[visor-admin]", err);
    window.alert(err?.message || "No se pudo abrir el gestor");
  }
}

function ensureManageButton() {
  const toolbar = ensureVisorLayersHeaderToolbar();
  if (!toolbar) return null;
  let btn = toolbar.querySelector("#visorCatalogAdminManageBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "visorCatalogAdminManageBtn";
    btn.className = "btn btn-sm visor-admin-manage-btn d-none";
    btn.title = "Gestionar capas publicadas (admin)";
    btn.setAttribute("aria-label", "Gestionar capas del catálogo");
    btn.innerHTML = MANAGE_ICON;
    btn.addEventListener("click", () => void openManageModal());
    const publishBtn = toolbar.querySelector("#visorCatalogAdminPublishBtn");
    if (publishBtn?.nextSibling) toolbar.insertBefore(btn, publishBtn.nextSibling);
    else toolbar.appendChild(btn);
  }
  _manageBtn = btn;
  return btn;
}

function ensurePublishButton() {
  const toolbar = ensureVisorLayersHeaderToolbar();
  if (!toolbar) return null;
  let btn = toolbar.querySelector("#visorCatalogAdminPublishBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "visorCatalogAdminPublishBtn";
    btn.className = "btn btn-sm visor-admin-publish-btn d-none";
    btn.title = "Agregar capa al catálogo (admin)";
    btn.setAttribute("aria-label", "Agregar capa al visor");
    btn.innerHTML = PUBLISH_ICON;
    btn.addEventListener("click", () => void openWizard());
    const clearBtn = toolbar.querySelector("#visorClearLayersBtn");
    if (clearBtn) toolbar.insertBefore(btn, clearBtn);
    else toolbar.appendChild(btn);
  }
  _publishBtn = btn;
  syncPublishButton();
  return btn;
}

function onVisorLayersPanelRefresh() {
  refreshVisorCatalogAdmin();
}

function onVisorLayoutActive() {
  refreshVisorCatalogAdmin();
}

export function attachVisorCatalogAdmin() {
  if (_attached) {
    refreshVisorCatalogAdmin();
    return;
  }
  _attached = true;
  document.addEventListener("atlasgro-visor-layers-panel-refresh", onVisorLayersPanelRefresh);
  document.addEventListener("atlasgro-visor-layout-active", onVisorLayoutActive);
  document.addEventListener("atlasgro-visor-admin-auth-change", syncAdminButtons);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initAdminUi(), { once: true });
  } else {
    initAdminUi();
  }
}

function initAdminUi() {
  ensurePublishButton();
  ensureManageButton();
  syncAdminButtons();
}

export function refreshVisorCatalogAdmin() {
  ensurePublishButton();
  ensureManageButton();
  syncAdminButtons();
}

export function teardownVisorCatalogAdmin() {
  document.removeEventListener("atlasgro-visor-layers-panel-refresh", onVisorLayersPanelRefresh);
  document.removeEventListener("atlasgro-visor-layout-active", onVisorLayoutActive);
  document.removeEventListener("atlasgro-visor-admin-auth-change", syncAdminButtons);
  _attached = false;
  _publishBtn?.remove();
  _publishBtn = null;
  _manageBtn?.remove();
  _manageBtn = null;
  _modalEl?.remove();
  _modalEl = null;
}
