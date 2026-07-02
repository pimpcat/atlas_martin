/**
 * Zoom del mapa: formato y comparaciones alineadas con minzoom del catálogo.
 * El indicador usa truncado (no redondeo) para no mostrar "13" cuando el zoom real es 12.95.
 */

const ZOOM_SCALE = 10;
const ZOOM_EPS = 1e-6;

/** Zoom mostrado en UI (un decimal, truncado hacia abajo). */
export function formatVisorZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * ZOOM_SCALE + ZOOM_EPS) / ZOOM_SCALE;
}

/** ¿El zoom actual alcanza el mínimo configurado (p. ej. capa o etiqueta)? */
export function isMapZoomAtLeast(z, minZ) {
  const min = Number(minZ);
  if (!Number.isFinite(min)) return true;
  return formatVisorZoom(z) >= min;
}

/** Valor para layout.minzoom de MapLibre (inclusivo en el entero configurado). */
export function mapLibreLayoutMinzoom(minZ) {
  const min = Number(minZ);
  if (!Number.isFinite(min) || min <= 0) return minZ;
  return Math.max(0, min - 0.001);
}
