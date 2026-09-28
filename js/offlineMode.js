/**
 * Modo sin internet (kit offline). Se activa con window.GROSIG_OFFLINE = true en js/deployConfig.js.
 * En modo online no cambia ningún comportamiento.
 */

export const OFFLINE_MODE = typeof window !== "undefined" && window.GROSIG_OFFLINE === true;

/** Mapas base que dependen de servidores externos (OSM, proxy INEGI, Esri). */
export const ONLINE_ONLY_BASEMAPS = new Set(["osm", "inegi", "sat"]);

/** @param {string} path ruta absoluta del portal, p. ej. "/atlas_gro/fonts/..." */
export function portalAssetUrl(path) {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}
