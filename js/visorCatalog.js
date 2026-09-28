/**
 * Carga y cache del catálogo data-driven del Visor geográfico.
 * Fuente única en producción: GET /api/visor/catalog (VISOR_CATALOG_SOURCE=api).
 */
import { apiUrl } from "./atlasConfig.js";
import { getActiveCveEnt } from "./amigoDeployment.js";
import { getAdminToken } from "./visorAdminAuth.js";

/** @type {object|null} */
let _catalog = null;
/** @type {Promise<object>|null} */
let _loadPromise = null;
/** @type {string|null} */
let _catalogEnt = null;

function activeCatalogEnt() {
  try {
    return getActiveCveEnt() || "";
  } catch {
    return "";
  }
}

function catalogSourceMode() {
  if (typeof window !== "undefined" && window.VISOR_CATALOG_SOURCE) {
    return String(window.VISOR_CATALOG_SOURCE).trim().toLowerCase();
  }
  return "api";
}

async function fetchCatalogJson() {
  const staticUrl = new URL("../config/visor/catalog.json", import.meta.url);
  const res = await fetch(staticUrl, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`catalog.json estático: HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchCatalogApi() {
  const url = new URL(apiUrl("/api/visor/catalog"), window.location.href);
  try {
    const ent = getActiveCveEnt();
    if (ent) url.searchParams.set("cve_ent", ent);
  } catch {
    /* amigoDeployment no cargado */
  }
  const headers = {};
  const token = getAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-Atlas-Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url.toString(), { cache: "no-cache", headers });
  if (!res.ok) {
    throw new Error(`API catalog: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body?.ok) {
    throw new Error(body?.message || "API catalog: respuesta no ok");
  }
  if (body.instance_empty && body.empty_message) {
    console.info("[visor-catalog]", body.empty_message, body.package || {});
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

async function loadVisorCatalogData() {
  const mode = catalogSourceMode();
  if (mode === "static") {
    return fetchCatalogJson();
  }
  try {
    return await fetchCatalogApi();
  } catch (apiErr) {
    if (mode === "api") {
      throw apiErr;
    }
    return fetchCatalogJson();
  }
}

/**
 * Carga el catálogo (idempotente).
 * @returns {Promise<object>}
 */
export function loadVisorCatalog() {
  const ent = activeCatalogEnt();
  if (_catalog && _catalogEnt === ent) return Promise.resolve(_catalog);
  if (_loadPromise && _catalogEnt === ent) return _loadPromise;
  _catalog = null;
  _catalogEnt = ent;
  _loadPromise = (async () => {
    let data = await loadVisorCatalogData();
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
  _catalogEnt = null;
}

function layersById(cat = _catalog) {
  const raw = cat?.layers;
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out = {};
    for (const entry of raw) {
      if (entry?.id) out[entry.id] = entry;
    }
    return out;
  }
  return raw;
}

/** Lista ordenada de entradas de capa según grupos del catálogo. */
export function getOrderedVisorLayerEntries() {
  const cat = _catalog;
  if (!cat) return [];
  const layers = layersById(cat);
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
  if (!layerId) return null;
  const layers = layersById();
  return layers[layerId] ?? layers[String(layerId).toLowerCase()] ?? null;
}

/** Catálogo INV/ITER para análisis espacial (API o analysis_catalog.json). */
export function getAnalysisCatalog() {
  return _catalog?.analysis_catalog ?? null;
}

/** Capas DENUE declaradas en el catálogo (orden del grupo denue). */
export function getDenueLayerEntriesFromCatalog() {
  const layers = layersById();
  const denueGroup = (_catalog?.groups || []).find((g) => g.id === "denue");
  const ids =
    denueGroup?.layers ||
    Object.keys(layers).filter((k) => k.startsWith("denue_"));
  return ids
    .map((id) => {
      const entry = layers[id];
      if (!entry) return null;
      return { id, ...entry };
    })
    .filter(Boolean);
}
