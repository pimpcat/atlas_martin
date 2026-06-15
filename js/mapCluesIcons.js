/**
 * Icono MapLibre para establecimientos de salud (atlas.c_clues).
 */
import {
  getSymbolIconRasterPx,
  loadSvgAsMapSymbol,
  symbolLayoutIconSize,
} from "./mapSvgIcons.js";

export const CLUES_ICON = "atlas-clues-health";

const ICON_LOGICAL_PX = 32;
const ICON_MAX_SCALE = 2.63;
const ICON_SUPERSAMPLE = 3;
const ICON_DISPLAY_BASE = ICON_LOGICAL_PX / 2;
const iconSz = (v) => symbolLayoutIconSize(v, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

/** Misma escala base que localidades (c_loc_punto). */
export const CLUES_SYMBOL_LAYOUT = {
  "icon-image": CLUES_ICON,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 5, iconSz(0.9), 8, iconSz(1.38), 12, iconSz(1.8), 16, iconSz(2.25), 20, iconSz(2.63)],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
  "icon-anchor": "bottom",
  "icon-offset": [0, 8],
};

export const CLUES_SYMBOL_PAINT = {
  "icon-opacity": 0.96,
};

const HEALTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 2.5C10.75 2.5 6.5 6.75 6.5 12c0 6.75 9.5 16.5 9.5 16.5S25.5 18.75 25.5 12c0-5.25-4.25-9.5-9.5-9.5z" fill="#00897b" stroke="#ffffff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="13.6" y="8.2" width="4.8" height="11.2" rx="0.6" fill="#ffffff"/>
  <rect x="10.4" y="11.4" width="11.2" height="4.8" rx="0.6" fill="#ffffff"/>
</svg>`;

const ICON_RASTER_PX = getSymbolIconRasterPx(ICON_DISPLAY_BASE, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

const CLUES_ICONS_VERSION = 3;

/** Registra el icono en el estilo MapLibre (idempotente). */
export async function ensureCluesMapIcons(map) {
  if (!map) return;
  if (map.__atlasCluesIconsVersion === CLUES_ICONS_VERSION) return;
  await loadSvgAsMapSymbol(map, CLUES_ICON, HEALTH_SVG, ICON_RASTER_PX);
  map.__atlasCluesIconsVersion = CLUES_ICONS_VERSION;
}

export function cluesLayerUsesLegacyCircle(map) {
  if (!map?.getStyle?.()?.layers) return false;
  const layer = map.getStyle().layers.find((l) => l.id === "ly-clues");
  return layer?.type === "circle";
}

export const CLUES_LEGEND_ITEM = {
  label: "Establecimiento de salud",
  svg: HEALTH_SVG,
};
