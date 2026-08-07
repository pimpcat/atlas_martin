/**
 * Cliente GroSIG Geography Context (opcional).
 * Solo se activa si GET /api/geography-context/health responde OK.
 */
import { apiUrl } from "./atlasConfig.js";

let _enabled = false;
let _probed = false;
let _health = null;
let _catalog = null;
let _catalogPromise = null;

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
  _catalog = null;
  _catalogPromise = null;
}

export async function fetchGeographyCatalog({ force = false } = {}) {
  if (!force && _catalog) return _catalog;
  if (!force && _catalogPromise) return _catalogPromise;
  _catalogPromise = (async () => {
    const res = await fetch(apiUrl("/api/geography-context/catalog"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`geography catalog HTTP ${res.status}`);
    const data = await res.json();
    _catalog = data?.catalog || null;
    return _catalog;
  })().finally(() => {
    _catalogPromise = null;
  });
  return _catalogPromise;
}

export function getGeographyCatalogCached() {
  return _catalog;
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
