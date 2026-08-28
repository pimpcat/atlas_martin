/**
 * Motor data-driven de indicadores (Fases 3–8).
 *
 * - Carga definición desde catalog.json
 * - Obtiene datos vía GET /api/indicators/{id}
 * - Despacha al renderer del presentation.template
 */
import { apiUrl } from "./atlasConfig.js";
import {
  loadIndicatorsCatalog,
  getIndicatorById,
} from "./indicatorCatalog.js";
import {
  loadPresentationPresets,
  getPresetById,
} from "./presentationPresets.js";
import { renderRankingDualBars } from "./templates/rankingDualBars.js";
import { renderRankingWithRatesTable } from "./templates/rankingWithRatesTable.js";
import { renderEntityBarsMunicipalTable } from "./templates/entityBarsMunicipalTable.js";
import { renderMultiColumnTable } from "./templates/multiColumnTable.js";
import { renderChartjsGroupedBars } from "./templates/chartjsGroupedBars.js";
import { renderAnalfabetismoComposite } from "./templates/analfabetismoComposite.js";

/** Clases CSS por preset (también en presentation_presets.style.root_class). */
const ROOT_CLASS_BY_TEMPLATE = {
  ranking_dual_bars: "poblacion-viz",
  horizontal_bars: "poblacion-viz",
  ranking_with_rates_table: "crecimiento-viz",
  entity_bars_municipal_table: "nacimientos-viz ind-preset-entity-bars",
  multi_column_table: "ind-preset-mct",
  chartjs_grouped_bars: "viv-serv-viz ind-preset-grouped-bars",
  vertical_bars: "viv-serv-viz ind-preset-grouped-bars",
  analfabetismo_composite: "analfabetismo-viz",
};

const TEMPLATE_RENDERERS = {
  ranking_dual_bars: renderRankingDualBars,
  horizontal_bars: renderRankingDualBars,
  ranking_with_rates_table: renderRankingWithRatesTable,
  entity_bars_municipal_table: renderEntityBarsMunicipalTable,
  multi_column_table: renderMultiColumnTable,
  chartjs_grouped_bars: renderChartjsGroupedBars,
  vertical_bars: renderChartjsGroupedBars,
  analfabetismo_composite: renderAnalfabetismoComposite,
  national_state_municipal_bars: renderChartjsGroupedBars,
};

/** @deprecated usar hasTemplateRenderer */
export const PHASE3_PILOT_IDS = new Set(Object.keys(TEMPLATE_RENDERERS));

export function isPhase3Pilot(indicatorId) {
  return hasTemplateRenderer(indicatorId);
}

export function hasTemplateRenderer(templateOrId) {
  if (TEMPLATE_RENDERERS[templateOrId]) return true;
  return false;
}

/**
 * Fetch unificado: GET /api/indicators/{id}?cve_mun=&nom_mun=&cve_ent=
 */
export async function fetchIndicatorData(indicatorId, selected = null) {
  const url = new URL(
    apiUrl(`/api/indicators/${encodeURIComponent(indicatorId)}`),
    window.location.href
  );
  if (selected?.cve_mun) {
    url.searchParams.set("cve_mun", String(selected.cve_mun));
    if (selected.nomgeo) url.searchParams.set("nom_mun", String(selected.nomgeo));
  }
  const ent = selected?.cve_ent;
  if (ent) url.searchParams.set("cve_ent", String(ent));
  else {
    try {
      const { getActiveCveEnt } = await import("./amigoDeployment.js");
      url.searchParams.set("cve_ent", getActiveCveEnt());
    } catch {
      /* ignore */
    }
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const d = json && json.detail;
    const msg =
      (d && (d.message || d.error)) ||
      (json && (json.message || json.error)) ||
      `HTTP ${res.status}`;
    return { ok: false, message: String(msg) };
  }
  if (!json || json.ok !== true) {
    const msg =
      json && (json.message || json.error)
        ? String(json.message || json.error)
        : "Respuesta inválida";
    return { ok: false, message: msg };
  }
  return json;
}

/**
 * Config de render a partir de una entrada del catálogo.
 */
export function buildRenderConfig(ind) {
  if (!ind) return null;
  const pres = ind.presentation || {};
  const exp = ind.export || {};
  const fieldLabels = {};
  const fieldTypes = {};
  const fieldKeys = [];
  const fieldsByTable = { tab_nacional: [], tab_municipal: [], c_mun: [] };
  for (const f of ind.fields || []) {
    if (!f.key) continue;
    fieldKeys.push(f.key);
    fieldLabels[f.key] = f.label || f.key;
    fieldTypes[f.key] = f.type || "integer";
    const st = f.source_table || "tab_municipal";
    if (fieldsByTable[st]) fieldsByTable[st].push(f.key);
  }

  const barMetrics = pres.bar_metrics || [];
  const chartMetrics = pres.chart_metrics || [];
  const munKeys = fieldsByTable.tab_municipal.length
    ? fieldsByTable.tab_municipal
    : fieldKeys;
  const natKeys = fieldsByTable.tab_nacional;
  const tableMetrics =
    pres.table_metrics || munKeys.filter((k) => !barMetrics.includes(k));
  // Columnas de tabla municipal: explícitas o fields de tab_municipal.
  const tableColumns = pres.table_columns || munKeys;
  const sortBy = pres.sort_by || munKeys[0] || fieldKeys[0] || "";
  const natKey = natKeys[0] || sortBy;
  const munKey = munKeys[0] || sortBy;
  const template = pres.template;
  const preset = getPresetById(template);
  const style = {
    ...(preset?.style || {}),
    ...(pres.style || {}),
  };
  const rootClass =
    pres.root_class ||
    style.root_class ||
    preset?.css_root_default ||
    ROOT_CLASS_BY_TEMPLATE[template] ||
    "ind-dd-root";
  const sections = pres.sections || [];
  const metaFuente = (ind.metadata?.fuente || ind.metadata?.source || "").trim();
  let footer = (pres.footer || exp.footer || "").trim();
  if (!footer && metaFuente) {
    footer = /^fuente:/i.test(metaFuente) ? metaFuente : `Fuente: ${metaFuente}`;
  }

  return {
    indicatorId: ind.id,
    template,
    metrics: barMetrics,
    barMetrics,
    chartMetrics,
    tableMetrics,
    tableColumns,
    tableTitle: pres.table_title || "",
    sectionLabels: pres.section_labels || null,
    fieldKeys,
    fieldLabels,
    fieldTypes,
    legendLabels: pres.legend_labels || null,
    seriesLabels: pres.series_labels || null,
    title: pres.title || ind.label || "",
    footer,
    notes: [],
    rootClass,
    style,
    chartStyle: style.chart || {},
    sortBy,
    stateMetric: pres.state_metric || natKey,
    municipalMetric: pres.municipal_metric || munKey || sortBy,
    periodKeys: pres.period_keys || null,
    showEntityShare: pres.show_entity_share !== false,
    showNationalStateSummary:
      pres.show_national_state_summary === true ||
      sections.includes("national") ||
      sections.includes("state"),
    /** Barras horizontales: top/middle/bottom (default true). */
    ranking: pres.ranking !== false,
    /** Municipios en cada extremo del ranking (default 5). */
    rankingSize: (() => {
      const n = Number(pres.ranking_size);
      if (Number.isFinite(n) && n >= 1) return Math.min(50, Math.max(1, Math.floor(n)));
      return 5;
    })(),
    /**
     * Barras verticales: qué series incluir.
     * p. ej. ["nacional","estatal","municipio"]
     */
    ySeries: Array.isArray(pres.y_series) && pres.y_series.length
      ? pres.y_series
      : ["nacional", "estatal", "municipio"],
  };
}

export function renderIndicatorFromCatalog(root, payload, ind) {
  const config = buildRenderConfig(ind);
  if (!config?.template) {
    if (root) {
      root.innerHTML = "";
      const div = document.createElement("div");
      div.className = "poblacion-viz-error";
      div.textContent = "Indicador sin presentation.template en el catálogo.";
      root.append(div);
    }
    return;
  }
  const renderer = TEMPLATE_RENDERERS[config.template];
  if (!renderer) {
    if (root) {
      root.innerHTML = "";
      const div = document.createElement("div");
      div.className = "poblacion-viz-error";
      div.textContent = `Template no implementado: ${config.template}`;
      root.append(div);
    }
    return;
  }
  renderer(root, payload, config);
}

/** Alias estable para Fase 8+. */
export async function runIndicatorView(indicatorId, selected, root) {
  return runIndicatorPilot(indicatorId, selected, root);
}

/**
 * Carga catálogo + datos + pinta. Devuelve el payload (para export).
 */
export async function runIndicatorPilot(indicatorId, selected, root) {
  await loadIndicatorsCatalog();
  try {
    await loadPresentationPresets();
  } catch {
    /* presets opcionales: el motor usa defaults de ROOT_CLASS_BY_TEMPLATE */
  }
  const ind = getIndicatorById(indicatorId);
  if (!ind) {
    const payload = { ok: false, message: `Indicador desconocido: ${indicatorId}` };
    if (root) {
      root.innerHTML = "";
      const div = document.createElement("div");
      div.className = "poblacion-viz-error";
      div.textContent = payload.message;
      root.append(div);
    }
    return { payload, indicator: null };
  }
  const payload = await fetchIndicatorData(indicatorId, selected);
  renderIndicatorFromCatalog(root, payload, ind);
  return { payload, indicator: ind };
}
