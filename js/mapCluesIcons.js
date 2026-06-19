/**
 * Icono MapLibre para establecimientos de salud (atlas.c_clues).
 */
import {
  atlasMapIconUrl,
  getSymbolIconRasterPx,
  loadSvgFileAsMapSymbol,
  symbolLayoutIconSize,
} from "./mapSvgIcons.js";

export const CLUES_ICON = "atlas-clues-health";
const CLUES_ICON_FILE = "clues-health.svg";

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

const ICON_RASTER_PX = getSymbolIconRasterPx(ICON_DISPLAY_BASE, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

const CLUES_ICONS_VERSION = 4;

/** Registra el icono en el estilo MapLibre (idempotente). */
export async function ensureCluesMapIcons(map) {
  if (!map) return;
  if (map.__atlasCluesIconsVersion === CLUES_ICONS_VERSION) return;
  await loadSvgFileAsMapSymbol(map, CLUES_ICON, CLUES_ICON_FILE, ICON_RASTER_PX);
  map.__atlasCluesIconsVersion = CLUES_ICONS_VERSION;
}

export function cluesLayerUsesLegacyCircle(map) {
  if (!map?.getStyle?.()?.layers) return false;
  const layer = map.getStyle().layers.find((l) => l.id === "ly-clues");
  return layer?.type === "circle";
}

export const CLUES_LEGEND_ITEM = {
  label: "Establecimiento de salud",
  icon: atlasMapIconUrl(CLUES_ICON_FILE),
};
