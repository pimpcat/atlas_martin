/**
 * Iconos MapLibre para c_residuo_solido según el campo «tipo».
 */
import {
  getSymbolIconRasterPx,
  loadSvgAsMapSymbol,
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
  {
    id: RESIDUO_ICON_DISPOSICION,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#efebe9" stroke="#5d4037" stroke-width="1.2"/>
      <path d="M4 23h24" stroke="#4e342e" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M6 23 L10 16 L14 18 L18 12 L22 15 L26 23 Z" fill="#795548" stroke="#4e342e" stroke-width="0.9" stroke-linejoin="round"/>
      <rect x="12.5" y="8" width="7" height="8.5" rx="1.2" fill="#6d4c41" stroke="#ffffff" stroke-width="0.9"/>
      <path d="M13.5 9.5h5" stroke="#ffffff" stroke-width="1" stroke-linecap="round"/>
      <path d="M14 11.5h4" stroke="#d7ccc8" stroke-width="0.8" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: RESIDUO_ICON_RECOLECCION,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#e3f2fd" stroke="#1565c0" stroke-width="1.2"/>
      <rect x="5" y="13" width="12" height="8.5" rx="1.2" fill="#1976d2" stroke="#0d47a1" stroke-width="0.8"/>
      <path d="M17 14.5h6.5l4 3.2v3.8H17V14.5z" fill="#42a5f5" stroke="#1565c0" stroke-width="0.8" stroke-linejoin="round"/>
      <rect x="18.5" y="12" width="4.5" height="2.5" rx="0.6" fill="#90caf9" stroke="#1565c0" stroke-width="0.6"/>
      <circle cx="9.5" cy="23" r="2.2" fill="#263238"/>
      <circle cx="23.5" cy="23" r="2.2" fill="#263238"/>
      <circle cx="9.5" cy="23" r="0.9" fill="#eceff1"/>
      <circle cx="23.5" cy="23" r="0.9" fill="#eceff1"/>
    </svg>`,
  },
  {
    id: RESIDUO_ICON_DEFAULT,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#efebe9" stroke="#795548" stroke-width="1.2"/>
      <path d="M11 11.5V9.5h10v2" fill="none" stroke="#5d4037" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="10.5" y="11.5" width="11" height="12" rx="1.4" fill="#8d6e63" stroke="#5d4037" stroke-width="0.9"/>
      <path d="M13 14h6M13 17h6M13 20h4" stroke="#efebe9" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
];

function loadResiduoIcon(map, id, svg) {
  return loadSvgAsMapSymbol(map, id, svg, ICON_RASTER_PX);
}

const RESIDUO_ICONS_VERSION = 3;

/** Registra iconos en el estilo MapLibre (idempotente). */
export async function ensureResiduoSolidoMapIcons(map) {
  if (!map) return;
  if (map.__atlasResiduoIconsVersion === RESIDUO_ICONS_VERSION) return;

  await Promise.all(
    ICON_SPECS.map(({ id, svg }) => loadResiduoIcon(map, id, svg)),
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
    svg: ICON_SPECS[0].svg,
  },
  {
    label: "Prestador de servicio de recolección",
    svg: ICON_SPECS[1].svg,
  },
  {
    label: "Otro punto de residuos sólidos",
    svg: ICON_SPECS[2].svg,
  },
];
