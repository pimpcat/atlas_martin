/**
 * Cliente GroSIG Geography Context (opcional).
 * Solo se activa si GET /api/geography-context/health responde OK.
 */
import { apiUrl } from "./atlasConfig.js";
import { getActiveCveEnt } from "./amigoDeployment.js";

let _enabled = false;
let _probed = false;
let _health = null;
let _catalogByEnt = new Map();
let _catalogPromiseByEnt = new Map();

function _entKey(cve_ent) {
  const d = String(cve_ent ?? "").replace(/\D/g, "");
  return d.length >= 2 ? d.slice(-2) : "";
}

function _resolveEnt(cve_ent) {
  if (cve_ent != null && String(cve_ent).trim() !== "") {
    return _entKey(cve_ent);
  }
  try {
    return _entKey(getActiveCveEnt());
  } catch {
    return "";
  }
}

export function isGeographyContextEnabled() {
  return _enabled;
}

export function getGeographyContextHealth() {
  return _health;
}

export async function probeGeographyContext() {
  if (_probed) return _enabled;
  _probed = true;
  try {
    const res = await fetch(apiUrl("/api/geography-context/health"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      _enabled = false;
      return false;
    }
    const data = await res.json();
    _health = data;
    _enabled =
      Boolean(data?.enabled) && data?.engine === "grosig-geography-context";
    return _enabled;
  } catch {
    _enabled = false;
    return false;
  }
}

/** Fuerza un nuevo probe (p. ej. tras cambiar flag). */
export function resetGeographyContextProbe() {
  _probed = false;
  _enabled = false;
  _health = null;
  _catalogByEnt.clear();
  _catalogPromiseByEnt.clear();
}

export async function fetchGeographyCatalog({ force = false, cve_ent = null } = {}) {
  const ent = _resolveEnt(cve_ent);
  const cacheKey = ent || "_";
  if (!force && _catalogByEnt.has(cacheKey)) {
    return _catalogByEnt.get(cacheKey);
  }
  if (!force && _catalogPromiseByEnt.has(cacheKey)) {
    return _catalogPromiseByEnt.get(cacheKey);
  }
  const promise = (async () => {
    const url = new URL(apiUrl("/api/geography-context/catalog"), window.location.href);
    if (ent) url.searchParams.set("cve_ent", ent);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`geography catalog HTTP ${res.status}`);
    const data = await res.json();
    const catalog = data?.catalog || null;
    _catalogByEnt.set(cacheKey, catalog);
    return catalog;
  })().finally(() => {
    _catalogPromiseByEnt.delete(cacheKey);
  });
  _catalogPromiseByEnt.set(cacheKey, promise);
  return promise;
}

export function getGeographyCatalogCached(cve_ent = null) {
  const ent = _resolveEnt(cve_ent);
  return _catalogByEnt.get(ent || "_") ?? null;
}

/** Limpia catálogo geography en memoria (p. ej. al cambiar entidad en explorador). */
export function invalidateGeographyCatalogCache(cve_ent = null) {
  if (cve_ent == null || cve_ent === "") {
    _catalogByEnt.clear();
    _catalogPromiseByEnt.clear();
    return;
  }
  const key = _entKey(cve_ent);
  _catalogByEnt.delete(key);
  _catalogPromiseByEnt.delete(key);
}

/**
 * Ítem de menú Datos Geográficos desde el catálogo (o null si el módulo está off).
 */
export function geographyMenuItemFromCatalog(catalog) {
  const menu = catalog?.menu || {};
  return {
    id: menu.id || "geo_datos_geo",
    title: menu.label || "Datos Geográficos",
    subtitle: menu.subtitle || "Ubicación, clima, relieve y más",
    unit: "",
    viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo3LGw6YzEwMA==",
    geoContext: true,
  };
}

export function geographySectionFromCatalog(catalog) {
  const menu = catalog?.menu || {};
  return {
    id: menu.section_id || "geo",
    title: menu.section_label || "Geografía",
    items: [geographyMenuItemFromCatalog(catalog)],
  };
}
