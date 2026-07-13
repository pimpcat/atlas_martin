/**
 * Carga y cache del catálogo data-driven de indicadores del dashboard.
 *
 * Fuentes (en orden):
 *   1. Estático servido por Apache: config/indicators/catalog.json.
 *   2. API validada: GET /api/indicators/catalog.
 *
 * Fase 1: expone accessors puros. El menú y las vistas legacy no se ven afectados
 * hasta la iteración siguiente (menú generado desde catálogo con compatibilidad dual).
 */
import { apiUrl } from "./atlasConfig.js";
import { knownTemplateIds, loadPresentationPresets } from "./presentationPresets.js";

/** @type {object|null} */
let _catalog = null;
/** @type {Promise<object>|null} */
let _loadPromise = null;

const FALLBACK_TEMPLATES = new Set([
  "ranking_dual_bars",
  "ranking_with_rates_table",
  "entity_bars_municipal_table",
  "multi_column_table",
  "chartjs_grouped_bars",
  "analfabetismo_composite",
  "national_state_municipal_bars",
  "external_links",
]);

async function fetchCatalogJson() {
  const staticUrl = new URL("../config/indicators/catalog.json", import.meta.url);
  const res = await fetch(staticUrl, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`catalog.json estático: HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchCatalogApi() {
  const res = await fetch(apiUrl("/api/indicators/catalog"), { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`API catalog: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body?.ok) {
    throw new Error(body?.message || "API catalog: respuesta no ok");
  }
  const { ok: _ok, ...rest } = body;
  return rest;
}

/** Validación defensiva en cliente (además de la del backend). */
function validateCatalog(data, knownTemplates) {
  if (!data || typeof data !== "object") {
    throw new Error("Catálogo de indicadores inválido: raíz no es objeto");
  }
  if (!Array.isArray(data.groups) || !data.groups.length) {
    throw new Error("Catálogo de indicadores inválido: falta 'groups'");
  }
  if (!Array.isArray(data.indicators) || !data.indicators.length) {
    throw new Error("Catálogo de indicadores inválido: falta 'indicators'");
  }
  const templates = knownTemplates?.size ? knownTemplates : FALLBACK_TEMPLATES;
  const seen = new Set();
  const groupIds = new Set(data.groups.map((g) => g?.id).filter(Boolean));
  for (const ind of data.indicators) {
    if (!ind?.id) throw new Error("Catálogo de indicadores inválido: indicador sin 'id'");
    if (seen.has(ind.id)) {
      throw new Error(`Catálogo de indicadores inválido: id duplicado '${ind.id}'`);
    }
    seen.add(ind.id);
    if (ind.group_id && !groupIds.has(ind.group_id)) {
      console.warn(
        `[indicators] '${ind.id}' referencia group_id inexistente '${ind.group_id}'`
      );
    }
    const tpl = ind.presentation?.template;
    if (tpl && !templates.has(tpl)) {
      console.warn(`[indicators] '${ind.id}' template desconocido: ${tpl}`);
    }
  }
}

/**
 * Carga el catálogo (idempotente).
 * @returns {Promise<object>}
 */
export function loadIndicatorsCatalog() {
  if (_catalog) return Promise.resolve(_catalog);
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    let known = FALLBACK_TEMPLATES;
    try {
      await loadPresentationPresets();
      known = knownTemplateIds();
    } catch (err) {
      console.warn("[indicators] Presets de presentación no cargados:", err);
    }
    let data;
    try {
      data = await fetchCatalogJson();
    } catch {
      data = await fetchCatalogApi();
    }
    validateCatalog(data, known);
    _catalog = data;
    return data;
  })();
  return _loadPromise;
}

/** Catálogo ya cargado o null. */
export function getIndicatorsCatalog() {
  return _catalog;
}

/** Fuerza recarga (p. ej. tras publicar cambios desde admin). */
export function resetIndicatorsCatalogCache() {
  _catalog = null;
  _loadPromise = null;
}

/** Lista de grupos ordenados por 'order' (o el orden del array si no se especifica). */
export function getIndicatorGroups() {
  const groups = _catalog?.groups || [];
  return [...groups].sort((a, b) => {
    const oa = Number.isFinite(a?.order) ? a.order : 999;
    const ob = Number.isFinite(b?.order) ? b.order : 999;
    return oa - ob;
  });
}

/** Indicadores en el orden del catálogo (todos, incluidos disabled). */
export function getAllIndicators() {
  return _catalog?.indicators || [];
}

/** Indicadores habilitados en el orden del catálogo. */
export function getEnabledIndicators() {
  return (_catalog?.indicators || []).filter((ind) => ind.enabled !== false);
}

/**
 * Indicadores agrupados por group_id, respetando el orden del catálogo.
 * @returns {Array<{ id: string, label: string, order?: number, items: object[] }>}
 */
export function getIndicatorsGrouped() {
  if (!_catalog) return [];
  const byGroup = new Map();
  for (const group of getIndicatorGroups()) {
    byGroup.set(group.id, { ...group, items: [] });
  }
  for (const ind of getEnabledIndicators()) {
    const bucket = byGroup.get(ind.group_id);
    if (bucket) bucket.items.push(ind);
  }
  return [...byGroup.values()].filter((g) => g.items.length > 0);
}

/** Busca un indicador por id. */
export function getIndicatorById(indicatorId) {
  if (!indicatorId) return null;
  return (
    (_catalog?.indicators || []).find((ind) => ind.id === indicatorId) || null
  );
}

/** Busca por menu_flag legacy (ayuda a puentear con app.js en la transición). */
export function getIndicatorByLegacyMenuFlag(flag) {
  if (!flag) return null;
  return (
    (_catalog?.indicators || []).find((ind) => ind?.legacy?.menu_flag === flag) ||
    null
  );
}

/** Precarga al arrancar (opcional). */
export function preloadIndicatorsCatalog() {
  return loadIndicatorsCatalog().catch((err) => {
    console.warn("[indicators] Precarga de catálogo:", err);
  });
}
