/**
 * Carga y cache del catálogo data-driven del Visor geográfico.
 * Fuente: config/visor/catalog.json (estático) o GET /api/visor/catalog.
 */
import { apiUrl } from "./atlasConfig.js";

/** @type {object|null} */
let _catalog = null;
/** @type {Promise<object>|null} */
let _loadPromise = null;

async function fetchCatalogJson() {
  const staticUrl = new URL("../config/visor/catalog.json", import.meta.url);
  const res = await fetch(staticUrl, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`catalog.json estático: HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchCatalogApi() {
  const res = await fetch(apiUrl("/api/visor/catalog"), { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`API catalog: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body?.ok) {
    throw new Error(body?.message || "API catalog: respuesta no ok");
  }
  const { ok, ...rest } = body;
  if (rest.layer_by_id && rest.groups) {
    return {
      version: rest.version,
      groups: rest.groups,
      layers: rest.layer_by_id,
      search: rest.search,
      search_extras: rest.search_extras,
      analysis_catalog: rest.analysis_catalog,
    };
  }
  return rest;
}

/**
 * Carga el catálogo (idempotente).
 * @returns {Promise<object>}
 */
export function loadVisorCatalog() {
  if (_catalog) return Promise.resolve(_catalog);
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    let data;
    try {
      data = await fetchCatalogJson();
    } catch {
      data = await fetchCatalogApi();
    }
    if (!data?.layers) {
      throw new Error("Catálogo del visor inválido: falta 'layers'");
    }
    if (!data.analysis_catalog) {
      try {
        const acUrl = new URL("../config/visor/analysis_catalog.json", import.meta.url);
        const acRes = await fetch(acUrl, { cache: "no-cache" });
        if (acRes.ok) {
          data.analysis_catalog = await acRes.json();
        }
      } catch {
        /* opcional */
      }
    }
    _catalog = data;
    return data;
  })();
  return _loadPromise;
}

/** Catálogo ya cargado o null. */
export function getVisorCatalog() {
  return _catalog;
}

/** Fuerza recarga del catálogo (tras publicar capa desde admin). */
export function resetVisorCatalogCache() {
  _catalog = null;
  _loadPromise = null;
}

/** Lista ordenada de entradas de capa según grupos del catálogo. */
export function getOrderedVisorLayerEntries() {
  const cat = _catalog;
  if (!cat) return [];
  const layers = cat.layers || {};
  const ordered = [];
  const seen = new Set();
  for (const group of cat.groups || []) {
    for (const id of group.layers || []) {
      if (seen.has(id) || !layers[id]) continue;
      seen.add(id);
      ordered.push({ id, ...layers[id] });
    }
  }
  for (const id of Object.keys(layers)) {
    if (!seen.has(id)) ordered.push({ id, ...layers[id] });
  }
  return ordered;
}

export function getVisorCatalogGroups() {
  return _catalog?.groups || [];
}

export function getVisorLayerEntry(layerId) {
  return _catalog?.layers?.[layerId] ?? null;
}

/** Catálogo INV/ITER para análisis espacial (API o analysis_catalog.json). */
export function getAnalysisCatalog() {
  return _catalog?.analysis_catalog ?? null;
}

/** Capas DENUE declaradas en el catálogo (orden del grupo denue). */
export function getDenueLayerEntriesFromCatalog() {
  const denueGroup = (_catalog?.groups || []).find((g) => g.id === "denue");
  const ids =
    denueGroup?.layers ||
    Object.keys(_catalog?.layers || {}).filter((k) => k.startsWith("denue_"));
  return ids
    .map((id) => {
      const entry = _catalog.layers[id];
      if (!entry) return null;
      return { id, ...entry };
    })
    .filter(Boolean);
}
