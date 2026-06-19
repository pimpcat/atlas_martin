/**
 * Iconos MapLibre para c_agua_sanea según el campo «tipo».
 */
import {
  atlasMapIconUrl,
  getSymbolIconRasterPx,
  loadSvgFileAsMapSymbol,
  symbolLayoutIconSize,
} from "./mapSvgIcons.js";

export const SANEAMIENTO_ICON_OBRA_TOMA = "atlas-agua-obra-toma";
export const SANEAMIENTO_ICON_POTABILIZACION = "atlas-agua-potabilizacion";
export const SANEAMIENTO_ICON_TRATAMIENTO = "atlas-agua-tratamiento";
export const SANEAMIENTO_ICON_PRESTADOR = "atlas-agua-prestador";
export const SANEAMIENTO_ICON_DESCARGA = "atlas-agua-descarga";
export const SANEAMIENTO_ICON_DEFAULT = "atlas-agua-default";

const TIPO_OBRA_TOMA = "Obra de toma para la captación de agua";
const TIPO_POTABILIZACION = "Planta de potabilización";
const TIPO_TRATAMIENTO = "Planta de tratamiento";
const TIPO_PRESTADOR = "Prestador de Servicio de agua potable";
const TIPO_DESCARGA = "Punto de descarga";

const TIPO_FIELD = ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""];

function matchTipo(exact, partial) {
  const clauses = [["==", TIPO_FIELD, exact]];
  if (partial) {
    clauses.push([">=", ["index-of", partial, ["downcase", TIPO_FIELD]], 0]);
  }
  return ["any", ...clauses];
}

/** Selección de icono por valor de «tipo». */
export const SANEAMIENTO_AGUA_ICON_IMAGE = [
  "case",
  matchTipo(TIPO_OBRA_TOMA, "obra de toma"),
  SANEAMIENTO_ICON_OBRA_TOMA,
  matchTipo(TIPO_POTABILIZACION, "potabiliz"),
  SANEAMIENTO_ICON_POTABILIZACION,
  matchTipo(TIPO_TRATAMIENTO, "planta de trat"),
  SANEAMIENTO_ICON_TRATAMIENTO,
  matchTipo(TIPO_PRESTADOR, "prestador"),
  SANEAMIENTO_ICON_PRESTADOR,
  matchTipo(TIPO_DESCARGA, "descarga"),
  SANEAMIENTO_ICON_DESCARGA,
  SANEAMIENTO_ICON_DEFAULT,
];

const ICON_LOGICAL_PX = 32;
const ICON_MAX_SCALE = 2.63;
const ICON_SUPERSAMPLE = 3;
const ICON_DISPLAY_BASE = ICON_LOGICAL_PX / 2;
const iconSz = (v) => symbolLayoutIconSize(v, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

export const SANEAMIENTO_AGUA_SYMBOL_LAYOUT = {
  "icon-image": SANEAMIENTO_AGUA_ICON_IMAGE,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 5, iconSz(0.9), 8, iconSz(1.38), 12, iconSz(1.8), 16, iconSz(2.25), 20, iconSz(2.63)],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
  "icon-anchor": "bottom",
  "icon-offset": [0, 8],
};

export const SANEAMIENTO_AGUA_SYMBOL_PAINT = {
  "icon-opacity": 0.96,
};

const ICON_RASTER_PX = getSymbolIconRasterPx(ICON_DISPLAY_BASE, ICON_MAX_SCALE, ICON_SUPERSAMPLE);

const ICON_SPECS = [
  { id: SANEAMIENTO_ICON_OBRA_TOMA, file: "agua-obra-toma.svg", label: "Obra de toma para la captación de agua" },
  { id: SANEAMIENTO_ICON_POTABILIZACION, file: "agua-potabilizacion.svg", label: "Planta de potabilización" },
  { id: SANEAMIENTO_ICON_TRATAMIENTO, file: "agua-tratamiento.svg", label: "Planta de tratamiento" },
  { id: SANEAMIENTO_ICON_PRESTADOR, file: "agua-prestador.svg", label: "Prestador de servicio de agua potable" },
  { id: SANEAMIENTO_ICON_DESCARGA, file: "agua-descarga.svg", label: "Punto de descarga" },
  { id: SANEAMIENTO_ICON_DEFAULT, file: "agua-default.svg", label: "Otro servicio de agua o saneamiento" },
];

const SANEAMIENTO_ICONS_VERSION = 1;

/** Registra iconos en el estilo MapLibre (idempotente). */
export async function ensureSaneamientoAguaMapIcons(map) {
  if (!map) return;
  if (map.__atlasSaneamientoIconsVersion === SANEAMIENTO_ICONS_VERSION) return;

  await Promise.all(
    ICON_SPECS.map(({ id, file }) => loadSvgFileAsMapSymbol(map, id, file, ICON_RASTER_PX)),
  );
  map.__atlasSaneamientoIconsVersion = SANEAMIENTO_ICONS_VERSION;
}

export function saneamientoAguaLayerUsesLegacyCircle(map) {
  if (!map?.getStyle?.()?.layers) return false;
  const layer = map.getStyle().layers.find((l) => l.id === "ly-saneamientoAgua");
  return layer?.type === "circle";
}

/** Entradas para la leyenda del visor geográfico. */
export const SANEAMIENTO_AGUA_LEGEND_ITEMS = ICON_SPECS.map(({ label, file }) => ({
  label,
  icon: atlasMapIconUrl(file),
}));
