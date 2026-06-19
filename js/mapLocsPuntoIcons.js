/**
 * Icono MapLibre para localidades (c_loc_punto) — chincheta de ubicación.
 */
import {
  atlasMapIconUrl,
  getSymbolIconRasterPx,
  loadSvgFileAsMapSymbol,
  symbolLayoutIconSize,
} from "./mapSvgIcons.js";

export const LOCS_PUNTO_ICON = "atlas-locs-punto-pin";
const LOCS_PUNTO_ICON_FILE = "locs-punto-pin.svg";

const ICON_LOGICAL_PX = 32;
const ICON_MAX_SCALE = 2.63;
const ICON_SUPERSAMPLE = 3;
const ICON_DISPLAY_BASE = ICON_LOGICAL_PX / 2;
const iconSz = (v) => symbolLayoutIconSize(v, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

export const LOCS_PUNTO_SYMBOL_LAYOUT = {
  "icon-image": LOCS_PUNTO_ICON,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 8, iconSz(1.38), 12, iconSz(1.8), 16, iconSz(2.25), 20, iconSz(2.63)],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
  "icon-anchor": "bottom",
  "icon-offset": [0, 8],
};

export const LOCS_PUNTO_SYMBOL_PAINT = {
  "icon-opacity": 0.96,
};

/** Tamaño lógico del viewBox SVG (32×32). */
const ICON_RASTER_PX = getSymbolIconRasterPx(ICON_DISPLAY_BASE, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

const LOCS_PUNTO_ICONS_VERSION = 6;

/** Registra la chincheta en el estilo MapLibre (idempotente). */
export async function ensureLocsPuntoMapIcons(map) {
  if (!map) return;
  if (map.__atlasLocsPuntoIconsVersion === LOCS_PUNTO_ICONS_VERSION) return;
  await loadSvgFileAsMapSymbol(map, LOCS_PUNTO_ICON, LOCS_PUNTO_ICON_FILE, ICON_RASTER_PX);
  map.__atlasLocsPuntoIconsVersion = LOCS_PUNTO_ICONS_VERSION;
}

export function locsPuntoLayerUsesLegacyCircle(map) {
  if (!map?.getStyle?.()?.layers) return false;
  const layer = map.getStyle().layers.find((l) => l.id === "ly-locsPunto");
  return layer?.type === "circle";
}

/** Entrada para la leyenda del visor geográfico. */
export const LOCS_PUNTO_LEGEND_ITEM = {
  label: "Localidad",
  icon: atlasMapIconUrl(LOCS_PUNTO_ICON_FILE),
};
