/**
 * Iconos MapLibre para c_residuo_solido según el campo «tipo».
 */
import {
  atlasMapIconUrl,
  getSymbolIconRasterPx,
  loadSvgFileAsMapSymbol,
  symbolLayoutIconSize,
} from "./mapSvgIcons.js";

export const RESIDUO_ICON_DISPOSICION = "atlas-residuo-disposicion";
export const RESIDUO_ICON_RECOLECCION = "atlas-residuo-recoleccion";
export const RESIDUO_ICON_DEFAULT = "atlas-residuo-default";

const TIPO_DISPOSICION = "Sitio de disposición final de residuos";
const TIPO_RECOLECCION = "Prestador de Servicio de recolección de residuos";

const RESIDUO_TIPO_FIELD = ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""];

/** Selección de icono por valor de «tipo» (exacto + coincidencia parcial). */
export const RESIDUO_SOLIDO_ICON_IMAGE = [
  "case",
  [
    "any",
    ["==", RESIDUO_TIPO_FIELD, TIPO_DISPOSICION],
    [">=", ["index-of", "disposici", ["downcase", RESIDUO_TIPO_FIELD]], 0],
  ],
  RESIDUO_ICON_DISPOSICION,
  [
    "any",
    ["==", RESIDUO_TIPO_FIELD, TIPO_RECOLECCION],
    [">=", ["index-of", "recolecci", ["downcase", RESIDUO_TIPO_FIELD]], 0],
  ],
  RESIDUO_ICON_RECOLECCION,
  RESIDUO_ICON_DEFAULT,
];

const ICON_LOGICAL_PX = 32;
/** Máximo icon-size visual (debe coincidir con zoom 18). */
const ICON_MAX_SCALE = 3.5;
const ICON_SHARPNESS = 4;
const ICON_DISPLAY_BASE = ICON_LOGICAL_PX / 2;
const iconSz = (v) => symbolLayoutIconSize(v, ICON_MAX_SCALE, ICON_SHARPNESS);

export const RESIDUO_SOLIDO_SYMBOL_LAYOUT = {
  "icon-image": RESIDUO_SOLIDO_ICON_IMAGE,
  // Escala base ×3.5 (350 %) respecto al tamaño inicial.
  "icon-size": ["interpolate", ["linear"], ["zoom"], 6, iconSz(1.75), 10, iconSz(2.275), 14, iconSz(2.975), 18, iconSz(3.5)],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
  "icon-anchor": "bottom",
  "icon-offset": [0, 6],
};

export const RESIDUO_SOLIDO_SYMBOL_PAINT = {
  "icon-opacity": 0.96,
};

const ICON_RASTER_PX = getSymbolIconRasterPx(ICON_DISPLAY_BASE, ICON_MAX_SCALE, ICON_SHARPNESS);

const ICON_SPECS = [
  { id: RESIDUO_ICON_DISPOSICION, file: "residuo-disposicion.svg" },
  { id: RESIDUO_ICON_RECOLECCION, file: "residuo-recoleccion.svg" },
  { id: RESIDUO_ICON_DEFAULT, file: "residuo-default.svg" },
];

const RESIDUO_ICONS_VERSION = 4;

/** Registra iconos en el estilo MapLibre (idempotente). */
export async function ensureResiduoSolidoMapIcons(map) {
  if (!map) return;
  if (map.__atlasResiduoIconsVersion === RESIDUO_ICONS_VERSION) return;

  await Promise.all(
    ICON_SPECS.map(({ id, file }) => loadSvgFileAsMapSymbol(map, id, file, ICON_RASTER_PX)),
  );
  map.__atlasResiduoIconsVersion = RESIDUO_ICONS_VERSION;
}

export function residuoSolidoLayerUsesLegacyCircle(map) {
  if (!map?.getStyle?.()?.layers) return false;
  const layer = map.getStyle().layers.find((l) => l.id === "ly-residuoSolido");
  return layer?.type === "circle";
}

/** Entradas para la leyenda del visor geográfico. */
export const RESIDUO_SOLIDO_LEGEND_ITEMS = [
  {
    label: "Sitio de disposición final de residuos",
    icon: atlasMapIconUrl(ICON_SPECS[0].file),
  },
  {
    label: "Prestador de servicio de recolección",
    icon: atlasMapIconUrl(ICON_SPECS[1].file),
  },
  {
    label: "Otro punto de residuos sólidos",
    icon: atlasMapIconUrl(ICON_SPECS[2].file),
  },
];
