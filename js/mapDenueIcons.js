/**
 * Iconos MapLibre para capas temáticas DENUE (atlas.c_denue).
 */
import {
  atlasMapIconUrl,
  getSymbolIconRasterPx,
  loadSvgFileAsMapSymbol,
  symbolLayoutIconSize,
} from "./mapSvgIcons.js";

const ICON_LOGICAL_PX = 32;
const ICON_MAX_SCALE = 2.63;
const ICON_SUPERSAMPLE = 3;
const ICON_DISPLAY_BASE = ICON_LOGICAL_PX / 2;
const iconSz = (v) => symbolLayoutIconSize(v, ICON_MAX_SCALE, ICON_SUPERSAMPLE);
const ICON_RASTER_PX = getSymbolIconRasterPx(ICON_DISPLAY_BASE, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

const BASE_SYMBOL_LAYOUT = {
  "icon-size": ["interpolate", ["linear"], ["zoom"], 5, iconSz(0.9), 8, iconSz(1.38), 12, iconSz(1.8), 16, iconSz(2.25), 20, iconSz(2.63)],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
  "icon-anchor": "bottom",
  "icon-offset": [0, 8],
};

export const DENUE_SYMBOL_PAINT = { "icon-opacity": 0.96 };

/** @type {Record<string, string>} */
export const DENUE_ICON_BY_KEY = {
  denueRastros: "atlas-denue-rastro",
  denueGasolinerias: "atlas-denue-gasolinera",
  denueGaseras: "atlas-denue-gasera",
  denueEscuelas: "atlas-denue-escuela",
  denueHospitales: "atlas-denue-hospital",
  denueMuseos: "atlas-denue-museo",
  denueCementerios: "atlas-denue-cementerio",
  denueIglesias: "atlas-denue-iglesia",
};

const ICON_SPECS = [
  { key: "denueRastros", id: DENUE_ICON_BY_KEY.denueRastros, file: "denue-rastro.svg", label: "Rastro (sacrificio de ganado)" },
  { key: "denueGasolinerias", id: DENUE_ICON_BY_KEY.denueGasolinerias, file: "denue-gasolinera.svg", label: "Gasolinera" },
  { key: "denueGaseras", id: DENUE_ICON_BY_KEY.denueGaseras, file: "denue-gasera.svg", label: "Gasera" },
  { key: "denueEscuelas", id: DENUE_ICON_BY_KEY.denueEscuelas, file: "denue-escuela.svg", label: "Escuela" },
  { key: "denueHospitales", id: DENUE_ICON_BY_KEY.denueHospitales, file: "denue-hospital.svg", label: "Hospital (DENUE)" },
  { key: "denueMuseos", id: DENUE_ICON_BY_KEY.denueMuseos, file: "denue-museo.svg", label: "Museo" },
  { key: "denueCementerios", id: DENUE_ICON_BY_KEY.denueCementerios, file: "denue-cementerio.svg", label: "Cementerio" },
  { key: "denueIglesias", id: DENUE_ICON_BY_KEY.denueIglesias, file: "denue-iglesia.svg", label: "Iglesia o templo" },
];

/** @type {Record<string, object>} */
export const DENUE_SYMBOL_LAYOUT_BY_KEY = Object.fromEntries(
  ICON_SPECS.map(({ key, id }) => [
    key,
    { ...BASE_SYMBOL_LAYOUT, "icon-image": id },
  ]),
);

/** @type {Record<string, { label: string, icon: string }>} */
export const DENUE_LEGEND_BY_KEY = Object.fromEntries(
  ICON_SPECS.map(({ key, label, file }) => [key, { label, icon: atlasMapIconUrl(file) }]),
);

const DENUE_ICONS_VERSION = 2;

export async function ensureDenueMapIcons(map) {
  if (!map) return;
  if (map.__atlasDenueIconsVersion === DENUE_ICONS_VERSION) return;
  await Promise.all(
    ICON_SPECS.map(({ id, file }) => loadSvgFileAsMapSymbol(map, id, file, ICON_RASTER_PX)),
  );
  map.__atlasDenueIconsVersion = DENUE_ICONS_VERSION;
}

export function denueLayerUsesLegacyCircle(map, layerKey) {
  if (!map?.getStyle?.()?.layers) return false;
  const layer = map.getStyle().layers.find((l) => l.id === `ly-${layerKey}`);
  return layer?.type === "circle";
}
