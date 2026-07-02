/**
 * Fuentes del buscador geográfico derivadas del catálogo del visor.
 */
import { loadVisorCatalog, getVisorCatalog, getOrderedVisorLayerEntries } from "./visorCatalog.js";

/** @typedef {{ layer_id: string, table: string, tipo: string, scope: string, geom_mode: string }} VisorSearchSource */

let _searchReady = false;

function normalizeScope(raw) {
  const val = String(raw || "both").toLowerCase();
  if (val === "estatal" || val === "estatal_only" || val === "state") return "estatal";
  if (val === "municipio" || val === "municipio_only" || val === "mun") return "municipio";
  return "both";
}

function sourceFromExtra(extra) {
  if (!extra || extra.enabled === false) return null;
  if (!extra.table || !extra.name_column) return null;
  return {
    layer_id: extra.id || extra.table,
    table: String(extra.table).toLowerCase(),
    tipo: extra.tipo || extra.label || extra.table,
    scope: normalizeScope(extra.scope || "estatal"),
    geom_mode: extra.geom_mode || "polygon",
  };
}

function sourceFromLayer(entry) {
  const search = entry.search;
  if (!search?.enabled) return null;
  const table = entry.data?.table || entry.data?.gid_table;
  if (!table || !search.name_column) return null;
  return {
    layer_id: entry.id,
    table: String(table).toLowerCase(),
    tipo: search.tipo || entry.label || entry.id,
    scope: normalizeScope(search.scope),
    geom_mode: search.geom_mode || entry.geometry || "point",
  };
}

function buildSourcesFromCatalog(cat) {
  const sources = [];
  for (const extra of cat.search_extras || []) {
    const s = sourceFromExtra(extra);
    if (s) sources.push(s);
  }
  for (const entry of getOrderedVisorLayerEntries()) {
    const s = sourceFromLayer(entry);
    if (s) sources.push(s);
  }
  return sources;
}

/**
 * @returns {Promise<{ limit_per_source: number, sources: VisorSearchSource[] }>}
 */
export async function loadVisorSearchConfig() {
  await loadVisorCatalog();
  const cat = getVisorCatalog();
  const limit = Number(cat?.search?.limit_per_source) || 5;
  const sources =
    Array.isArray(cat?.search?.sources) && cat.search.sources.length
      ? cat.search.sources
      : buildSourcesFromCatalog(cat || {});
  return { limit_per_source: limit, sources };
}

export async function ensureVisorSearchConfig() {
  if (_searchReady) return loadVisorSearchConfig();
  const cfg = await loadVisorSearchConfig();
  _searchReady = true;
  return cfg;
}

/** Invalida caché tras publicar/editar capas en Visor Studio. */
export function resetVisorSearchConfig() {
  _searchReady = false;
}

/**
 * @param {string} table
 * @returns {import("./visorSearchCatalog.js").VisorSearchSource | null}
 */
export function findSearchSourceByTable(table) {
  const t = String(table || "").toLowerCase();
  if (!t) return null;
  const cat = getVisorCatalog();
  const sources =
    Array.isArray(cat?.search?.sources) && cat.search.sources.length
      ? cat.search.sources
      : buildSourcesFromCatalog(cat || {});
  return sources.find((s) => String(s.table || "").toLowerCase() === t) || null;
}

/** Indica si una fuente del catálogo debe dibujar contorno al seleccionar. */
export function isPolygonGeomMode(geomMode) {
  const mode = String(geomMode || "").toLowerCase();
  return mode === "polygon" || mode === "centroid";
}

/**
 * Texto de ayuda para el placeholder del buscador según fuentes activas.
 * @param {VisorSearchSource[]} sources
 * @param {{ stateWide?: boolean }} [opts]
 */
export function buildSearchPlaceholderHint(sources, opts = {}) {
  const stateWide = Boolean(opts.stateWide);
  const active = (sources || []).filter((s) => {
    const scope = String(s.scope || "both").toLowerCase();
    if (stateWide) return scope === "estatal" || scope === "both";
    return scope === "municipio" || scope === "both";
  });
  const tipos = [...new Set(active.map((s) => s.tipo).filter(Boolean))];
  if (!tipos.length) return "";
  if (tipos.length <= 4) return tipos.join(", ");
  return `${tipos.slice(0, 3).join(", ")}…`;
}
