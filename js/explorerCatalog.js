/**
 * Catálogo de estilos del Explorador Municipal (Explorer Studio).
 * API → estático → defaults embebidos.
 */
import { apiUrl } from "./atlasConfig.js";

export const EXPLORER_STYLE_DEFAULTS = {
  version: 1,
  description: "Estilos visuales mínimos del Explorador Municipal",
  estado: { line_color: "#0f172a", line_width: 2.4 },
  municipios: { line_color: "#475569", line_width: 1.25 },
  municipio_seleccionado: { fill_color: "#008b8b", fill_opacity: 0.42 },
};

/** @type {typeof EXPLORER_STYLE_DEFAULTS} */
let _catalog = structuredClone
  ? structuredClone(EXPLORER_STYLE_DEFAULTS)
  : JSON.parse(JSON.stringify(EXPLORER_STYLE_DEFAULTS));
let _loadPromise = null;
let _loaded = false;

function normalizeCatalog(raw) {
  const base = EXPLORER_STYLE_DEFAULTS;
  const estado = raw?.estado || {};
  const mun = raw?.municipios || {};
  const sel = raw?.municipio_seleccionado || {};
  return {
    version: Number(raw?.version) || 1,
    description: raw?.description || base.description,
    estado: {
      line_color: String(estado.line_color || base.estado.line_color),
      line_width: Number(estado.line_width ?? base.estado.line_width),
    },
    municipios: {
      line_color: String(mun.line_color || base.municipios.line_color),
      line_width: Number(mun.line_width ?? base.municipios.line_width),
    },
    municipio_seleccionado: {
      fill_color: String(sel.fill_color || base.municipio_seleccionado.fill_color),
      fill_opacity: Number(
        sel.fill_opacity ?? base.municipio_seleccionado.fill_opacity
      ),
    },
  };
}

export function getExplorerStyleCached() {
  return _catalog;
}

export function resetExplorerCatalogCache() {
  _loaded = false;
  _loadPromise = null;
  _catalog = JSON.parse(JSON.stringify(EXPLORER_STYLE_DEFAULTS));
}

export async function loadExplorerCatalog({ force = false } = {}) {
  if (!force && _loaded) return _catalog;
  if (!force && _loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const urls = [apiUrl("/api/explorer/catalog"), "./config/explorer/catalog.json"];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: force ? "no-store" : "default",
        });
        if (!res.ok) continue;
        const data = await res.json();
        const cat = data?.catalog || data;
        if (cat?.estado && cat?.municipios) {
          _catalog = normalizeCatalog(cat);
          _loaded = true;
          return _catalog;
        }
      } catch {
        /* next */
      }
    }
    _catalog = JSON.parse(JSON.stringify(EXPLORER_STYLE_DEFAULTS));
    _loaded = true;
    return _catalog;
  })().finally(() => {
    _loadPromise = null;
  });

  return _loadPromise;
}
