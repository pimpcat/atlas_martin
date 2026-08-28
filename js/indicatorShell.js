/**
 * Shell único del dashboard de indicadores (Fase 10).
 * Título, meta, botones PNG/CSV/Excel y viz root salen del catálogo.
 */
import { createExportController } from "./chartExport.js";
import { runIndicatorView } from "./indicatorEngine.js";
import { getIndicatorById, loadIndicatorsCatalog } from "./indicatorCatalog.js";
import { loadCompareEnabledIds } from "./compareIndicators.js";
import {
  attachIndicatorCompareUi,
  isCompareEnabled,
  openIndicatorCompare,
} from "./comparisonView.js";
import { openCompareInAnalitica } from "./analiticaCompareNav.js";

const SHELL_IDS_KEEP = new Set([
  "dashboardHome",
  "dashboardNormal",
  "dashboardGeo",
  "dashboardVisor",
  "dashboardInvViv",
  "dashboardSitiosInteres",
  "dashboardAnalitica",
  "dashboardIndicator",
]);

/** @type {string|null} */
let _currentIndicatorId = null;
/** @type {object|null} */
let _exportController = null;
/** @type {{ cve_mun?: string, nomgeo?: string, cve_ent?: string }|null} */
let _lastSelected = null;
/** @type {boolean} */
let _compareUiBound = false;

function shellEls() {
  return {
    root: document.getElementById("dashboardIndicator"),
    title: document.getElementById("indicatorShellTitle"),
    meta: document.getElementById("indicatorShellMeta"),
    viz: document.getElementById("indicatorFullVizRoot"),
    main: document.getElementById("main"),
    metaBtn: document.getElementById("btnIndicatorMetadata"),
    metaPanel: document.getElementById("indicatorMetadataPanel"),
    metaTitle: document.getElementById("indicatorMetadataTitle"),
    metaBody: document.getElementById("indicatorMetadataBody"),
    metaClose: document.getElementById("btnIndicatorMetadataClose"),
  };
}

const META_PLACEHOLDER =
  "Pendiente de redacción en Indicators Studio.";

const META_FIELDS = [
  { key: "periodicidad", label: "Periodicidad" },
  { key: "unidad_medida", label: "Unidad de medida" },
  { key: "fuente", label: "Fuente" },
  { key: "nota_general", label: "Nota general" },
  { key: "fecha_inicial", label: "Fecha inicial" },
  { key: "fecha_final", label: "Fecha final" },
  { key: "ultima_actualizacion", label: "Última actualización" },
];

function metadataFieldVisible(md, key) {
  return md.show?.[key] !== false;
}

function stripMetaPrefix(text, prefix) {
  const t = (text || "").trim();
  if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
    return t.slice(prefix.length).trim();
  }
  return t;
}

function normalizeMetadata(ind) {
  const m = ind?.metadata || {};
  const fuente =
    (m.fuente || m.source || ind?.presentation?.footer || ind?.export?.footer || "").trim();
  const notaGeneral = (m.nota_general || m.summary || m.body || "").trim();
  let notas = Array.isArray(m.notas) ? m.notas.filter((n) => n && (n.texto || "").trim()) : [];
  if (!notas.length && (m.notes || "").trim()) {
    notas = [{ periodo: "", texto: stripMetaPrefix(m.notes, "Nota:") }];
  }
  const unit = (m.unidad_medida || ind?.unit || "").trim();
  return {
    enabled: m.enabled !== false,
    title: (m.title || ind?.label || "Metadatos").trim(),
    periodicidad: (m.periodicidad || "").trim(),
    unidad_medida: unit ? unit.charAt(0).toUpperCase() + unit.slice(1) : "",
    fuente: stripMetaPrefix(fuente, "Fuente:"),
    nota_general: notaGeneral,
    notas: notas.map((n) => ({
      periodo: (n.periodo || "").trim(),
      texto: (n.texto || "").trim(),
    })),
    fecha_inicial: (m.fecha_inicial || "").trim(),
    fecha_final: (m.fecha_final || "").trim(),
    ultima_actualizacion: (m.ultima_actualizacion || m.updated || "").trim(),
    show: { ...(m.show || {}) },
  };
}

function metaRow(label, value, isPlaceholder) {
  const row = document.createElement("div");
  row.className = "indicator-meta-row";
  const dt = document.createElement("div");
  dt.className = "indicator-meta-dt";
  dt.textContent = label;
  const dd = document.createElement("div");
  dd.className = "indicator-meta-dd";
  dd.textContent = value || META_PLACEHOLDER;
  if (!value || isPlaceholder) dd.classList.add("indicator-meta-placeholder");
  row.append(dt, dd);
  return row;
}

function metaNotasBlock(notas) {
  const block = document.createElement("div");
  block.className = "indicator-meta-row indicator-meta-row--notas";
  const dt = document.createElement("div");
  dt.className = "indicator-meta-dt";
  dt.textContent = "Nota";
  const dd = document.createElement("div");
  dd.className = "indicator-meta-dd";
  if (!notas.length) {
    const p = document.createElement("p");
    p.className = "indicator-meta-placeholder";
    p.textContent = META_PLACEHOLDER;
    dd.append(p);
  } else {
    const list = document.createElement("dl");
    list.className = "indicator-meta-notas";
    notas.forEach((n) => {
      const item = document.createElement("div");
      item.className = "indicator-meta-nota-item";
      const term = document.createElement("dt");
      term.textContent = n.periodo || "—";
      const desc = document.createElement("dd");
      desc.textContent = n.texto;
      item.append(term, desc);
      list.append(item);
    });
    dd.append(list);
  }
  block.append(dt, dd);
  return block;
}

function renderMetadataPanel(ind) {
  const { metaBtn, metaPanel, metaTitle, metaBody } = shellEls();
  if (!metaBtn || !metaPanel || !metaBody) return;
  const md = normalizeMetadata(ind);
  if (!md.enabled) {
    metaBtn.classList.add("d-none");
    closeMetadataPanel();
    return;
  }
  metaBtn.classList.remove("d-none");
  if (metaTitle) metaTitle.textContent = md.title;
  metaBody.innerHTML = "";
  const dl = document.createElement("div");
  dl.className = "indicator-meta-dl";
  META_FIELDS.forEach(({ key, label }) => {
    if (!metadataFieldVisible(md, key)) return;
    const val = md[key];
    dl.append(metaRow(label, val, !val));
  });
  if (metadataFieldVisible(md, "notas")) {
    dl.append(metaNotasBlock(md.notas));
  }
  metaBody.append(dl);
}

function openMetadataPanel() {
  const { metaBtn, metaPanel } = shellEls();
  if (!metaPanel || metaBtn?.classList.contains("d-none")) return;
  metaPanel.classList.remove("d-none");
  metaPanel.removeAttribute("hidden");
  metaBtn?.classList.add("is-open");
}

function closeMetadataPanel() {
  const { metaBtn, metaPanel } = shellEls();
  if (!metaPanel) return;
  metaPanel.classList.add("d-none");
  metaPanel.setAttribute("hidden", "");
  metaBtn?.classList.remove("is-open");
}

function toggleMetadataPanel() {
  const { metaPanel } = shellEls();
  if (!metaPanel) return;
  if (metaPanel.classList.contains("d-none")) openMetadataPanel();
  else closeMetadataPanel();
}

let _metaUiBound = false;
function bindMetadataUi() {
  if (_metaUiBound) return;
  _metaUiBound = true;
  const { metaBtn, metaClose } = shellEls();
  metaBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleMetadataPanel();
  });
  metaClose?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMetadataPanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMetadataPanel();
  });
}

/**
 * Muestra u oculta el shell único; oculta el resto de dashboards de indicadores.
 */
export function setIndicatorShellLayout(active) {
  const { root, main } = shellEls();
  if (!root || !main) return;

  document.querySelectorAll("[id^='dashboard']").forEach((el) => {
    if (SHELL_IDS_KEEP.has(el.id)) return;
    el.classList.add("d-none");
    el.setAttribute("aria-hidden", "true");
  });

  // Especiales siempre ocultos al entrar a un indicador tabular
  for (const id of ["dashboardNormal", "dashboardGeo", "dashboardVisor", "dashboardInvViv", "dashboardSitiosInteres", "dashboardAnalitica", "dashboardHome"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (active) {
      el.classList.add("d-none");
      el.setAttribute("aria-hidden", "true");
    }
  }

  if (active) {
    root.classList.remove("d-none");
    root.setAttribute("aria-hidden", "false");
    main.classList.add("indicator-shell-mode");
    main.classList.remove(
      "home-mode",
      "geo-mode",
      "visor-mode",
      "invviv-mode",
      "sitios-interes-mode",
      "analitica-mode"
    );
  } else {
    closeMetadataPanel();
    root.classList.add("d-none");
    root.setAttribute("aria-hidden", "true");
    main.classList.remove("indicator-shell-mode");
  }
}

export function isCatalogTabularIndicator(indicator) {
  if (!indicator?.id) return false;
  const ind = getIndicatorById(indicator.id);
  return Boolean(ind && ind.enabled !== false && ind.presentation?.template);
}

function ensureExportController() {
  if (_exportController) return _exportController;
  const backendExport = {
    get indicatorId() {
      return _currentIndicatorId;
    },
  };
  _exportController = createExportController({
    filenamePrefix: () => {
      const ind = _currentIndicatorId
        ? getIndicatorById(_currentIndicatorId)
        : null;
      return ind?.export?.filename_prefix || ind?.id || "indicador";
    },
    targetSelector: "#indicatorFullVizRoot",
    buttons: {
      png: "btnIndicatorExportPng",
      csv: "btnIndicatorExportCsv",
      xlsx: "btnIndicatorExportXlsx",
    },
    backendExport,
  });
  return _exportController;
}

/**
 * Activa shell, carga datos y pinta según catálogo.
 * @param {object} menuItem — ítem del menú (id = indicator.id)
 * @param {{ cve_mun?: string, nomgeo?: string }|null} selected
 */
function syncCompareButton() {
  const btn = document.getElementById("btnIndicatorCompare");
  if (!btn) return;
  const on = isCompareEnabled(_currentIndicatorId);
  btn.classList.toggle("d-none", !on);
  btn.disabled = !on;
  if (on) {
    btn.title = "Abrir comparador en Analítica (Shift+clic: modal hasta 5 municipios)";
  } else {
    btn.removeAttribute("title");
  }
}

export async function showCatalogIndicator(menuItem, selected) {
  await loadIndicatorsCatalog();
  await loadCompareEnabledIds();
  const ind = getIndicatorById(menuItem.id);
  const { title, meta, viz } = shellEls();
  if (!ind || !viz) {
    throw new Error(`Indicador no encontrado en catálogo: ${menuItem.id}`);
  }

  _currentIndicatorId = ind.id;
  _lastSelected = selected || null;
  bindMetadataUi();
  closeMetadataPanel();
  renderMetadataPanel(ind);
  syncCompareButton();
  if (title) title.textContent = ind.label || menuItem.title || ind.id;
  if (meta) {
    meta.textContent = selected?.nomgeo
      ? `Municipio seleccionado: ${selected.nomgeo} · ${ind.subtitle || ""}`.trim()
      : `Sin municipio seleccionado · ${ind.subtitle || ""}`.trim();
  }

  ensureExportController().attach();

  viz.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
  const { payload } = await runIndicatorView(ind.id, selected, viz);
  ensureExportController().setData(payload, selected);
  return { payload, indicator: ind };
}

export function attachIndicatorShellExport() {
  ensureExportController().attach();
  ensureExportController().setData(null, null);
  if (!_compareUiBound) {
    _compareUiBound = true;
    attachIndicatorCompareUi();
    document.getElementById("btnIndicatorCompare")?.addEventListener("click", (ev) => {
      if (ev.shiftKey) {
        void openIndicatorCompare(_currentIndicatorId, _lastSelected);
        return;
      }
      void openCompareInAnalitica({
        indicatorId: _currentIndicatorId,
        cve_ent: _lastSelected?.cve_ent,
        cve_mun: _lastSelected?.cve_mun,
        nomgeo: _lastSelected?.nomgeo || _lastSelected?.nom_mun,
      });
    });
  }
}

/** Evita respuestas fuera de orden al cambiar de municipio rápido. */
let _refreshSeq = 0;

/**
 * Recarga ligera: solo datos + meta (sin rearmar layout ni menú).
 * Usar al cambiar de municipio con un indicador tabular ya activo.
 */
export async function refreshCatalogIndicator(selected) {
  if (!_currentIndicatorId) return null;
  const ind = getIndicatorById(_currentIndicatorId);
  const { meta, viz } = shellEls();
  if (!ind || !viz) return null;

  _lastSelected = selected || null;
  syncCompareButton();

  const seq = ++_refreshSeq;
  if (meta) {
    meta.textContent = selected?.nomgeo
      ? `Municipio seleccionado: ${selected.nomgeo} · ${ind.subtitle || ""}`.trim()
      : `Sin municipio seleccionado · ${ind.subtitle || ""}`.trim();
  }

  viz.style.opacity = "0.55";
  viz.style.pointerEvents = "none";
  try {
    const { payload } = await runIndicatorView(ind.id, selected, viz);
    if (seq !== _refreshSeq) return null;
    ensureExportController().setData(payload, selected);
    return { payload, indicator: ind };
  } finally {
    if (seq === _refreshSeq) {
      viz.style.opacity = "";
      viz.style.pointerEvents = "";
    }
  }
}
