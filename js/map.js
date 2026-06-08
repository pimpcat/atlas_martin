/**
 * Mapa MapLibre GL del Atlas: bases XYZ, capas vectoriales Martin (PostGIS) y pick municipal.
 * Sustituye Leaflet + MapServer WMS.
 */

import { martinTileJson, martinTileUrl, apiUrl } from "./atlasConfig.js";
import {
  HOME_MUN_DISP_FILL_PAINT,
  HOME_MUN_DISP_LINE_HALO_PAINT,
  HOME_MUN_DISP_LINE_PAINT,
  COLONIAS_LABEL_LAYOUT,
  COLONIAS_LABEL_MIN_ZOOM,
  COLONIAS_LABEL_PAINT,
  COLONIAS_LABEL_PAINT_CLARO,
  LOCS_ATLAS_LABEL_LAYOUT,
  LOCS_ATLAS_LABEL_MIN_ZOOM,
  LOCS_ATLAS_LABEL_PAINT,
  LOCS_ATLAS_LABEL_PAINT_CLARO,
  LOCS_PUNTO_LABEL_LAYOUT,
  LOCS_PUNTO_LABEL_MIN_ZOOM,
  LOCS_PUNTO_LABEL_PAINT,
  LOCS_PUNTO_LABEL_PAINT_CLARO,
  MAPLIBRE_GLYPHS_URL,
  LAYER_PAINT,
  LINE_LAYOUT_SMOOTH,
  MARTIN_TABLES,
  MARTIN_USO_SUELO,
  curnivelMaestroFilter,
  martinSourceLayer,
} from "./martinLayerStyle.js";
import { bindAllOverlayTipHovers, refreshOverlayTipBindings } from "./mapOverlayTips.js";
import {
  ensureLocalBasemap,
  prefetchLocalBasemapCatalog,
  setLocalBasemapVisible,
} from "./localBasemap.js";
import {
  fitMapToFeatures,
  fitMapToMartinSource,
  fitMapToMunicipioExtent,
  fitToMunicipioWhenReady,
  findMunicipioFeature,
  getTurf,
} from "./mapGeo.js";
import {
  bindColoniasLabelsSync,
  clearColoniasLabels,
  coloniasLabelLayerIdForOverlay,
  ensureColoniasLabelLayer,
  scheduleColoniasLabelsSync,
} from "./mapColoniasLabels.js";
import {
  bindLocsAtlasLabelsSync,
  clearLocsAtlasLabels,
  ensureLocsAtlasLabelLayer,
  locsAtlasLabelLayerIdForOverlay,
  scheduleLocsAtlasLabelsSync,
} from "./mapLocsAtlasLabels.js";

const SRC_ENT = "src-c_ent";
const SRC_ENT_DISP = "src-c_ent-disp";
const SRC_MUN = "src-c_mun";
const SRC_MUN_DISP = "src-c_mun-disp";
const SL_ENT = () => martinSourceLayer(MARTIN_TABLES.entidad);
const SL_ENT_DISP = () => martinSourceLayer(MARTIN_TABLES.entidadDisp);
const SL_MUN = () => martinSourceLayer(MARTIN_TABLES.municipios);
const SL_MUN_DISP = () => martinSourceLayer(MARTIN_TABLES.municipiosDisp);

const OSM_TILES = [
  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
];
/** Mapa base topográfico INEGI MDM v6.1 vía proxy FastAPI (WMTS sin CORS directo). */
const INEGI_WMTS_TILES = [apiUrl("/api/inegi/wmts/tile?z={z}&x={x}&y={y}")];
const ESRI_SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** DPR del canvas MapLibre (afecta todo el mapa, no solo raster). */
function getMapPixelRatio() {
  if (typeof window === "undefined") return 1;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), 2.5);
}

/** MSAA WebGL + preferencia GPU — suaviza líneas/polígonos vectoriales (MapOptions.antialias). */
function atlasMapContextAttributes() {
  return {
    antialias: true,
    powerPreference: "high-performance",
  };
}

/** Opciones comunes del mapa Atlas (MapLibre). */
function buildAtlasMapOptions(containerEl, extra = {}) {
  return {
    container: containerEl,
    style: {
      version: 8,
      sources: {},
      layers: [],
      glyphs: MAPLIBRE_GLYPHS_URL,
    },
    pixelRatio: getMapPixelRatio(),
    antialias: true,
    canvasContextAttributes: atlasMapContextAttributes(),
    ...extra,
  };
}

/** Etiquetas fijas en capas del visor (localidades). */
const OVERLAY_LABEL_BY_KEY = {
  locsPunto: {
    minzoom: LOCS_PUNTO_LABEL_MIN_ZOOM,
    layout: LOCS_PUNTO_LABEL_LAYOUT,
    paint: LOCS_PUNTO_LABEL_PAINT,
    paintClaro: LOCS_PUNTO_LABEL_PAINT_CLARO,
  },
  locsAtlas: {
    minzoom: LOCS_ATLAS_LABEL_MIN_ZOOM,
    layout: LOCS_ATLAS_LABEL_LAYOUT,
    paint: LOCS_ATLAS_LABEL_PAINT,
    paintClaro: LOCS_ATLAS_LABEL_PAINT_CLARO,
  },
  colonias: {
    minzoom: COLONIAS_LABEL_MIN_ZOOM,
    layout: COLONIAS_LABEL_LAYOUT,
    paint: COLONIAS_LABEL_PAINT,
    paintClaro: COLONIAS_LABEL_PAINT_CLARO,
  },
};

function coloniasLabelsCtx() {
  return {
    homeMode: _homeMode,
    coloniasActive: !!_overlayActive.colonias,
    focusCve: _focusCve || "001",
  };
}

function ensureColoniasLabelsLayer(map) {
  const labelDef = OVERLAY_LABEL_BY_KEY.colonias;
  if (!labelDef || !map) return;
  ensureColoniasLabelLayer(map, labelDef, overlayLabelPaintForTheme);
  applyOverlayLabelSpec(map, "colonias");
}

function locsAtlasLabelsCtx() {
  return {
    homeMode: _homeMode,
    locsAtlasActive: !!_overlayActive.locsAtlas,
    focusCve: _focusCve || "001",
  };
}

function ensureLocsAtlasLabelsLayer(map) {
  const labelDef = OVERLAY_LABEL_BY_KEY.locsAtlas;
  if (!labelDef || !map) return;
  ensureLocsAtlasLabelLayer(map, labelDef, overlayLabelPaintForTheme);
  applyOverlayLabelSpec(map, "locsAtlas");
}

function overlayGeoLabelLayerIds() {
  return [coloniasLabelLayerIdForOverlay(), locsAtlasLabelLayerIdForOverlay()];
}

function isOverlayGeoLabelLayer(id) {
  return overlayGeoLabelLayerIds().includes(id);
}

function activateOverlayGeoLabels(map, overlayKey, cve) {
  const cveFocus = cve || _focusCve || "001";
  if (overlayKey === "colonias") {
    ensureColoniasLabelsLayer(map);
    try {
      if (map.getLayer(coloniasLabelLayerIdForOverlay())) {
        map.setFilter(coloniasLabelLayerIdForOverlay(), null);
      }
    } catch {
      /* noop */
    }
    scheduleColoniasLabelsSync(
      map,
      { ...coloniasLabelsCtx(), focusCve: cveFocus },
      munFilter,
      ensureColoniasLabelsLayer,
    );
    return;
  }
  if (overlayKey === "locsAtlas") {
    ensureLocsAtlasLabelsLayer(map);
    try {
      if (map.getLayer(locsAtlasLabelLayerIdForOverlay())) {
        map.setFilter(locsAtlasLabelLayerIdForOverlay(), null);
      }
    } catch {
      /* noop */
    }
    scheduleLocsAtlasLabelsSync(
      map,
      { ...locsAtlasLabelsCtx(), focusCve: cveFocus },
      munFilter,
      ensureLocsAtlasLabelsLayer,
    );
  }
}

function deactivateOverlayGeoLabels(map, overlayKey) {
  if (overlayKey === "colonias") clearColoniasLabels(map);
  if (overlayKey === "locsAtlas") clearLocsAtlasLabels(map);
}

function overlayLabelLayerId(layerId) {
  return `${layerId}-labels`;
}

function readDocumentTheme() {
  return document.documentElement.getAttribute("data-theme") === "claro" ? "claro" : "oscuro";
}

function overlayLabelPaintForTheme(labelDef) {
  return readDocumentTheme() === "claro" ? labelDef.paintClaro || labelDef.paint : labelDef.paint;
}

function applyOverlayLabelSpec(map, overlayKey) {
  const labelDef = OVERLAY_LABEL_BY_KEY[overlayKey];
  if (!labelDef || !map) return;
  const labelId = overlayLabelLayerId(`ly-${overlayKey}`);
  if (!map.getLayer(labelId)) return;
  for (const [prop, val] of Object.entries(labelDef.layout)) {
    if (prop === "visibility") continue;
    try {
      map.setLayoutProperty(labelId, prop, val);
    } catch {
      /* noop */
    }
  }
  const paint = overlayLabelPaintForTheme(labelDef);
  for (const [prop, val] of Object.entries(paint)) {
    try {
      map.setPaintProperty(labelId, prop, val);
    } catch {
      /* noop */
    }
  }
}

function applyOverlayLabelTheme(map) {
  if (!map) return;
  for (const key of Object.keys(OVERLAY_LABEL_BY_KEY)) {
    applyOverlayLabelSpec(map, key);
  }
}

function ensureMapGlyphs(map) {
  if (!map?.getStyle) return;
  const style = map.getStyle();
  if (style?.glyphs) return;
  try {
    map.setStyle({ ...style, glyphs: MAPLIBRE_GLYPHS_URL });
  } catch (e) {
    console.warn("[map] glyphs no disponibles; etiquetas symbol pueden fallar.", e);
  }
}

function overlayKeyFromLayerId(layerId) {
  if (!layerId.startsWith("ly-")) return null;
  const key = layerId.slice(3);
  return OVERLAY_LABEL_BY_KEY[key] ? key : null;
}

function ensureOverlayLabelLayer(map, def) {
  const labelDef = OVERLAY_LABEL_BY_KEY[def.key];
  if (!labelDef) return;
  ensureMapGlyphs(map);
  const layerId = `ly-${def.key}`;
  const labelId = overlayLabelLayerId(layerId);
  if (def.key === "colonias") {
    ensureColoniasLabelLayer(map, labelDef, overlayLabelPaintForTheme);
    applyOverlayLabelSpec(map, "colonias");
    return;
  }
  if (def.key === "locsAtlas") {
    ensureLocsAtlasLabelLayer(map, labelDef, overlayLabelPaintForTheme);
    applyOverlayLabelSpec(map, "locsAtlas");
    return;
  }
  const src = `src-${def.table}`;
  addMartinSource(map, src, def.table);
  if (map.getLayer(labelId)) {
    applyOverlayLabelSpec(map, def.key);
    return;
  }
  map.addLayer({
    id: labelId,
    type: "symbol",
    source: src,
    "source-layer": martinSourceLayer(def.table),
    minzoom: labelDef.minzoom,
    filter: munFilter("001"),
    layout: { ...labelDef.layout, visibility: "none" },
    paint: overlayLabelPaintForTheme(labelDef),
  });
}

/** Reaplica simbología vectorial estatal (tras hot reload o capas ya creadas). */
function applyHomeMunLinePaint(map) {
  if (!map) return;
  for (const [layerId, paint] of [
    [LAYER_IDS.munAllLineHalo, HOME_MUN_DISP_LINE_HALO_PAINT],
    [LAYER_IDS.munAllLine, HOME_MUN_DISP_LINE_PAINT],
  ]) {
    if (!map.getLayer(layerId)) continue;
    for (const [key, value] of Object.entries(paint)) {
      try {
        map.setPaintProperty(layerId, key, value);
      } catch {
        /* noop */
      }
    }
  }
}

function applyHomeVectorRenderQuality(map) {
  if (!map) return;
  const sets = [
    [LAYER_IDS.munAllFill, HOME_MUN_DISP_FILL_PAINT],
    [LAYER_IDS.entFill, LAYER_PAINT.entFill],
    [LAYER_IDS.marcoEntCasing, LAYER_PAINT.marcoEntLineCasing],
    [LAYER_IDS.marcoEntHalo, LAYER_PAINT.marcoEntLineHalo],
    [LAYER_IDS.marcoEnt, LAYER_PAINT.marcoEntLine],
  ];
  for (const [layerId, paint] of sets) {
    if (!map.getLayer(layerId)) continue;
    for (const [key, value] of Object.entries(paint)) {
      try {
        map.setPaintProperty(layerId, key, value);
      } catch {
        /* capa sin propiedad paint */
      }
    }
  }
  applyHomeMunLinePaint(map);
}

function applyGeoMacroVectorRenderQuality(map) {
  if (!map) return;
  const sets = [
    ["gm-mun-fill", LAYER_PAINT.munAllFill],
    ["gm-mun-line-halo", LAYER_PAINT.munAllLineHalo],
    ["gm-mun-line", LAYER_PAINT.munAllLine],
    ["gm-ent-fill", LAYER_PAINT.entFill],
    ["gm-ent-line-casing", LAYER_PAINT.marcoEntLineCasing],
    ["gm-ent-line-halo", LAYER_PAINT.marcoEntLineHalo],
    ["gm-ent-line", LAYER_PAINT.marcoEntLine],
  ];
  for (const [layerId, paint] of sets) {
    if (!map.getLayer(layerId)) continue;
    for (const [key, value] of Object.entries(paint)) {
      try {
        map.setPaintProperty(layerId, key, value);
      } catch {
        /* noop */
      }
    }
  }
}

/**
 * Fuente OSM optimizada para MapLibre (ver maplibre/maplibre-gl-js#1257):
 * - tileSize 256 en pantallas 1x (evita blur por default 512).
 * - tileSize 128 en HiDPI (pide z+1 → más píxeles reales por pantalla).
 */
function buildOsmRasterSourceSpec() {
  const dpr = getMapPixelRatio();
  return {
    type: "raster",
    tiles: OSM_TILES,
    tileSize: dpr >= 1.5 ? 128 : 256,
    maxzoom: 19,
    attribution: "© OpenStreetMap contributors",
  };
}

const RASTER_BASE_PAINT = {
  "raster-opacity": 1,
  "raster-fade-duration": 0,
};

/**
 * OSM: interpolación bilineal (linear). Evita el aspecto dentado de `nearest`.
 * @see maplibre style-spec paint-raster-raster-resampling
 */
const RASTER_OSM_PAINT = {
  ...RASTER_BASE_PAINT,
  "raster-resampling": "linear",
};

const BASE_LAYER_PAINT = {
  "base-osm": RASTER_OSM_PAINT,
  "base-inegi": RASTER_BASE_PAINT,
  "base-sat": RASTER_BASE_PAINT,
};

const BASE_LAYER_IDS = ["base-osm", "base-inegi", "base-sat"];

/** Respaldo WGS84 (Guerrero) si Martin aún no devolvió features. */
const MXSIG_BOUNDS = [
  [-102.18435117971923, 16.315952579781328],
  [-98.00727640026655, 18.88784678039839],
];

const HOME_MAP_FIT_PADDING = { top: 36, bottom: 36, left: 36, right: 36 };
let _baseLayerCtrl = null;
let _refocusCtrl = null;
let _navControlAdded = false;
const GEO_MACRO_FIT_PADDING = { top: 10, bottom: 10, left: 22, right: 22 };

export const MUNICIPIO_FOCUS_PROFILES = {
  geo: { padding: 56, maxZoom: 14, duration: 900 },
  visor: { padding: 28, maxZoom: 14, duration: 900 },
  inv: { padding: 28, maxZoom: 14, duration: 900 },
  default: { padding: 28, maxZoom: 14 },
};

/** Perfiles que muestran solo contorno municipal (sin relleno). */
export const OUTLINE_ONLY_PROFILES = new Set(["geo", "visor", "inv"]);

function isOutlineOnlyProfile(profile) {
  return OUTLINE_ONLY_PROFILES.has(profile);
}

let _map = null;
let _maplibregl = null;
let _activeBase = "osm";
let _homeMode = false;
let _homeHighlightCve = null;
let _interactionLocked = false;
let _focusCve = null;
let _lastFocusProfile = "default";
let _municipioFocusGen = 0;
let _homePickHandler = null;
const MUN_HIGHLIGHT_FILL = "#008b8b";
const MUN_HIGHLIGHT_LINE = "#004858";
const MUN_HIGHLIGHT_HALO = "#ffffff";
let _geoMacro = null;
let _geoMacroPendingCve = null;
let _geoMacroHiGen = 0;
let _atlasLayersReady = false;
const _styleReadyQueue = [];
let _pendingHomeMode = null;
const LAYER_IDS = {
  munAllFill: "atlas-mun-all-fill",
  munAllLineHalo: "atlas-mun-all-line-halo",
  munAllLine: "atlas-mun-all-line",
  munHiFill: "atlas-mun-hi-fill",
  munHiLineHalo: "atlas-mun-hi-line-halo",
  munHiLine: "atlas-mun-hi-line",
  marcoMun: "atlas-marco-mun-line",
  entFill: "atlas-ent-fill",
  marcoEntHalo: "atlas-marco-ent-line-halo",
  marcoEntCasing: "atlas-marco-ent-line-casing",
  marcoEnt: "atlas-marco-ent-line",
};

const OVERLAY_DEFS = [
  {
    key: "locsAtlas",
    table: MARTIN_TABLES.locsAtlas,
    type: "line",
    lineStack: true,
    fillHit: true,
    fillHitPaint: LAYER_PAINT.locsAtlasFillHit,
    paintHalo: LAYER_PAINT.locsAtlasHalo,
    paint: LAYER_PAINT.locsAtlas,
  },
  { key: "locsPunto", table: MARTIN_TABLES.locsPunto, type: "circle", paint: LAYER_PAINT.locsPunto },
  {
    key: "colonias",
    table: MARTIN_TABLES.colonias,
    type: "line",
    lineStack: true,
    fillHit: true,
    fillHitPaint: LAYER_PAINT.coloniasFillHit,
    paintHalo: LAYER_PAINT.coloniasHalo,
    paint: LAYER_PAINT.colonias,
  },
  {
    key: "agebUrbanas",
    table: MARTIN_TABLES.agebUrbanas,
    type: "line",
    lineStack: true,
    fillHit: true,
    fillHitPaint: LAYER_PAINT.agebUFillHit,
    paintHalo: LAYER_PAINT.agebUHalo,
    paint: LAYER_PAINT.agebU,
  },
  {
    key: "agebRurales",
    table: MARTIN_TABLES.agebRurales,
    type: "line",
    lineStack: true,
    fillHit: true,
    fillHitPaint: LAYER_PAINT.agebRFillHit,
    paintHalo: LAYER_PAINT.agebRHalo,
    paint: LAYER_PAINT.agebR,
  },
  {
    key: "manzanas",
    table: MARTIN_TABLES.manzanas,
    type: "fill",
    paint: LAYER_PAINT.manzanasFill,
    minzoom: 14,
  },
  {
    key: "vialidades",
    table: MARTIN_TABLES.vialidades,
    type: "line",
    lineStack: true,
    paintHalo: LAYER_PAINT.vialidadesHalo,
    paint: LAYER_PAINT.vialidades,
  },
  {
    key: "rnc",
    table: MARTIN_TABLES.rnc,
    type: "line",
    lineStack: true,
    paintHalo: LAYER_PAINT.rncHalo,
    paint: LAYER_PAINT.rnc,
  },
  { key: "saneamientoAgua", table: MARTIN_TABLES.saneamientoAgua, type: "circle", paint: LAYER_PAINT.saneamiento },
];

const _overlayActive = {};
const _overlayKeyGen = Object.create(null);
let _overlayOpGen = 0;
let _usoSueloOpGen = 0;
let _usoSueloActive = false;
let _relieveActive = false;
let _geoThematicGen = 0;

const CURNIVEL_LAYERS = {
  base: "ly-curnivel",
  master: "ly-curnivel-ma",
};

const HIDRO_CORRIENTES_ID = "ly-hidro";
const HIDRO_CUERPOS_ID = "ly-hcuerpos";

function pad3(cve) {
  const n = String(cve ?? "").replace(/\D/g, "");
  return n.length >= 3 ? n.slice(-3) : ("000" + n).slice(-3);
}

function munFilter(cve) {
  const p = pad3(cve || "001");
  const n = String(parseInt(p, 10));
  const cvegeo5 = `12${p}`;
  return [
    "any",
    ["==", ["to-string", ["get", "cve_mun"]], p],
    ["==", ["to-string", ["get", "cve_mun"]], n],
    ["==", ["to-string", ["get", "CVE_MUN"]], p],
    ["==", ["to-string", ["get", "CVE_MUN"]], n],
    ["==", ["to-string", ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""]], cvegeo5],
  ];
}

/** Expresión MapLibre: feature del municipio activo (misma lógica que munFilter). */
function munMatchExpr(cve) {
  const p = pad3(cve);
  const n = String(parseInt(p, 10));
  const cvegeo5 = `12${p}`;
  return [
    "any",
    ["==", ["to-string", ["get", "cve_mun"]], p],
    ["==", ["to-string", ["get", "cve_mun"]], n],
    ["==", ["to-string", ["get", "CVE_MUN"]], p],
    ["==", ["to-string", ["get", "CVE_MUN"]], n],
    ["==", ["to-string", ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""]], cvegeo5],
  ];
}

function hideLegacyMunHiLayers(map) {
  safeSetLayout(map, LAYER_IDS.munHiFill, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munHiLineHalo, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munHiLine, "visibility", "none");
}

const MUN_DISP_PAINT_IDS = {
  fill: LAYER_IDS.munAllFill,
  line: LAYER_IDS.munAllLine,
  lineHalo: LAYER_IDS.munAllLineHalo,
};

const GEO_MACRO_PAINT_IDS = {
  fill: "gm-mun-fill",
  line: "gm-mun-line",
  lineHalo: "gm-mun-line-halo",
};

function munDispBaseFill(layerIds) {
  if (layerIds === MUN_DISP_PAINT_IDS && _homeMode) return HOME_MUN_DISP_FILL_PAINT;
  return LAYER_PAINT.munAllFill;
}

function munDispBaseLine(layerIds) {
  if (layerIds === MUN_DISP_PAINT_IDS && _homeMode) return HOME_MUN_DISP_LINE_PAINT;
  return LAYER_PAINT.munAllLine;
}

function munDispBaseLineHalo(layerIds) {
  if (layerIds === MUN_DISP_PAINT_IDS && _homeMode) return HOME_MUN_DISP_LINE_HALO_PAINT;
  return LAYER_PAINT.munAllLineHalo;
}

/** MapLibre no permite ["zoom"] dentro de un branch de "case"; reescribe step/interpolate. */
function paintExprWithMunHighlight(match, highlightValue, baseExpr) {
  if (!Array.isArray(baseExpr)) {
    return ["case", match, highlightValue, baseExpr];
  }
  const head = baseExpr[0];
  if (head === "interpolate" || head === "step") {
    const input = baseExpr[1];
    const zoomInput = baseExpr[2];
    if (Array.isArray(zoomInput) && zoomInput[0] === "zoom") {
      const out = [head, input, zoomInput];
      for (let i = 3; i < baseExpr.length; i += 2) {
        out.push(baseExpr[i], ["case", match, highlightValue, baseExpr[i + 1]]);
      }
      return out;
    }
  }
  return ["case", match, highlightValue, baseExpr];
}

/** Resaltado instantáneo sobre v_c_mun_disp (explorador municipal y mini-mapa geo). */
function applyMunDispHighlightPaint(map, cve_mun, layerIds = MUN_DISP_PAINT_IDS) {
  const fillId = layerIds.fill;
  const lineId = layerIds.line;
  const haloId = layerIds.lineHalo;
  if (!map.getLayer(fillId)) return;
  const baseFill = munDispBaseFill(layerIds);
  const baseLine = munDispBaseLine(layerIds);
  const baseHalo = munDispBaseLineHalo(layerIds);
  if (!cve_mun) {
    map.setPaintProperty(fillId, "fill-color", baseFill["fill-color"]);
    map.setPaintProperty(fillId, "fill-opacity", baseFill["fill-opacity"]);
    if (map.getLayer(lineId)) {
      map.setPaintProperty(lineId, "line-color", baseLine["line-color"]);
      map.setPaintProperty(lineId, "line-opacity", baseLine["line-opacity"]);
    }
    if (map.getLayer(haloId)) {
      map.setPaintProperty(haloId, "line-color", baseHalo["line-color"]);
      map.setPaintProperty(haloId, "line-opacity", baseHalo["line-opacity"]);
    }
    if (layerIds === MUN_DISP_PAINT_IDS) hideLegacyMunHiLayers(map);
    if (layerIds === MUN_DISP_PAINT_IDS && _homeMode) applyHomeMunLinePaint(map);
    return;
  }
  const match = munMatchExpr(cve_mun);
  map.setPaintProperty(fillId, "fill-color", [
    "case",
    match,
    MUN_HIGHLIGHT_FILL,
    baseFill["fill-color"],
  ]);
  map.setPaintProperty(fillId, "fill-opacity", paintExprWithMunHighlight(match, 0.42, baseFill["fill-opacity"]));
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, "line-color", [
      "case",
      match,
      MUN_HIGHLIGHT_LINE,
      baseLine["line-color"],
    ]);
    map.setPaintProperty(lineId, "line-opacity", paintExprWithMunHighlight(match, 0.95, baseLine["line-opacity"]));
  }
  if (map.getLayer(haloId)) {
    map.setPaintProperty(haloId, "line-color", [
      "case",
      match,
      MUN_HIGHLIGHT_HALO,
      baseHalo["line-color"],
    ]);
    map.setPaintProperty(haloId, "line-opacity", paintExprWithMunHighlight(match, 0.65, baseHalo["line-opacity"]));
  }
  if (layerIds === MUN_DISP_PAINT_IDS) hideLegacyMunHiLayers(map);
  if (layerIds === MUN_DISP_PAINT_IDS && _homeMode) applyHomeMunLinePaint(map);
}

function applyMunAllHighlightPaint(map, cve_mun) {
  applyMunDispHighlightPaint(map, cve_mun, MUN_DISP_PAINT_IDS);
}

function getMaplibregl() {
  if (typeof maplibregl !== "undefined") return maplibregl;
  if (typeof window !== "undefined" && window.maplibregl) return window.maplibregl;
  return null;
}

export function getLeafletMap() {
  return _map;
}

function addMartinSource(map, id, table) {
  const tileUrl = martinTileUrl(table);
  const existing = map.getSource(id);
  if (existing) {
    try {
      const cur = existing.tiles?.[0] || "";
      if (cur !== tileUrl && typeof existing.setTiles === "function") {
        existing.setTiles([tileUrl]);
      }
    } catch (e) {
      console.warn("martin source update:", id, e);
    }
    return;
  }
  map.addSource(id, {
    type: "vector",
    tiles: [tileUrl],
    ...(table === MARTIN_TABLES.colonias || table === MARTIN_TABLES.locsAtlas
      ? { promoteId: { [martinSourceLayer(table)]: "gid" } }
      : {}),
  });
}

function flushStyleReadyQueue() {
  const q = _styleReadyQueue.splice(0, _styleReadyQueue.length);
  for (const fn of q) {
    try {
      fn();
    } catch (e) {
      console.warn("atlas map ready:", e);
    }
  }
  if (_map) bindAllOverlayTipHovers(_map, overlayLayerIds);
}

/** Ejecuta fn cuando el estilo y las capas base del Atlas están listos (evita "Style is not done loading"). */
export function whenAtlasMapReady(fn) {
  if (!_map) {
    const el = document.getElementById("mapFrame");
    if (!el) return;
    ensureMap(el);
  }
  if (_atlasLayersReady && _map.isStyleLoaded()) {
    fn(_map);
    return;
  }
  _styleReadyQueue.push(() => fn(_map));
}

function safeSetLayout(map, layerId, prop, value) {
  if (!map?.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, prop, value);
}

function fitToEntidad(map, opts = {}) {
  if (!getTurf()) {
    map.fitBounds(MXSIG_BOUNDS, { padding: opts.padding ?? 32, animate: false });
    return;
  }
  fitMapToMartinSource(map, SRC_ENT_DISP, SL_ENT_DISP(), {
    padding: opts.padding ?? HOME_MAP_FIT_PADDING,
    duration: opts.duration ?? 0,
    maxZoom: opts.maxZoom,
    fallbackBounds: MXSIG_BOUNDS,
  });
}

function fitToMunicipio(map, cve, opts = {}) {
  if (!cve) return Promise.resolve(false);
  const p = pad3(cve);
  return fitMapToMunicipioExtent(map, p, opts).then((ok) => {
    if (ok) return true;
    fitToMunicipioWhenReady(map, SRC_MUN, SL_MUN(), p, munFilter, {
      ...opts,
      fallbackBounds: MXSIG_BOUNDS,
    });
    return false;
  });
}

function setMunicipioHighlightVisible(map, cve, visible) {
  const f = visible && cve ? munFilter(cve) : ["literal", false];
  [LAYER_IDS.munHiFill, LAYER_IDS.munHiLineHalo, LAYER_IDS.munHiLine].forEach((id) => {
    if (!map.getLayer(id)) return;
    map.setFilter(id, f);
    safeSetLayout(map, id, "visibility", visible ? "visible" : "none");
  });
}

/** Solo contorno municipal (Datos geográficos, visor, inventario). */
function setMunicipioOutlineOnly(map, cve, visible) {
  setMunicipioHighlightVisible(map, null, false);
  if (!map.getLayer(LAYER_IDS.marcoMun)) return;
  if (visible && cve) {
    map.setFilter(LAYER_IDS.marcoMun, munFilter(cve));
    safeSetLayout(map, LAYER_IDS.marcoMun, "visibility", "visible");
  } else {
    map.setFilter(LAYER_IDS.marcoMun, ["literal", false]);
    safeSetLayout(map, LAYER_IDS.marcoMun, "visibility", "none");
  }
}

/** Quita bloqueo de zoom/pan del modo Inicio. */
export function clearMapViewConstraints() {
  if (!_map) return;
  _map.setMinZoom(0);
  _map.setMaxZoom(22);
  _map.setMaxBounds(null);
}

function ensureBaseLayerControl(map) {
  if (_baseLayerCtrl?.querySelector('[data-base="local"]')) return;
  if (_baseLayerCtrl) {
    _baseLayerCtrl.remove();
    _baseLayerCtrl = null;
  }
  const wrap = document.createElement("div");
  wrap.className = "atlas-basemap-ctrl maplibregl-ctrl";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Mapa base");

  const mkBtn = (label, kind, title) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "atlas-basemap-ctrl__btn";
    b.dataset.base = kind;
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-pressed", kind === _activeBase ? "true" : "false");
    if (kind === _activeBase) b.classList.add("is-active");
    b.addEventListener("click", () => {
      setMapBaseLayer(kind);
      wrap.querySelectorAll(".atlas-basemap-ctrl__btn").forEach((el) => {
        const on = el.dataset.base === kind;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
    return b;
  };

  wrap.append(
    mkBtn("OSM", "osm", "OpenStreetMap"),
    mkBtn("INEGI", "inegi", "Mapa base topográfico INEGI"),
    mkBtn("Satélite", "sat", "Imagen satelital Esri"),
    mkBtn("Local", "local", "Mapa base MBTiles local (OSM)"),
  );
  map.getContainer().appendChild(wrap);
  _baseLayerCtrl = wrap;
}

function syncBaseLayerButtons() {
  if (!_baseLayerCtrl) return;
  _baseLayerCtrl.querySelectorAll(".atlas-basemap-ctrl__btn").forEach((el) => {
    const kind = el.dataset.base || "osm";
    const on = kind === _activeBase;
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function addRasterBaseLayer(map, layerId, sourceId, visible, paint = RASTER_BASE_PAINT) {
  if (map.getLayer(layerId)) return;
  map.addLayer({
    id: layerId,
    type: "raster",
    source: sourceId,
    layout: { visibility: visible ? "visible" : "none" },
    paint,
  });
}

function recreateOsmBaseLayer(map) {
  const visible = _activeBase === "osm";
  if (map.getLayer("base-osm")) map.removeLayer("base-osm");
  if (map.getSource("base-osm")) map.removeSource("base-osm");
  map.addSource("base-osm", buildOsmRasterSourceSpec());
  addRasterBaseLayer(map, "base-osm", "base-osm", visible, RASTER_OSM_PAINT);
}

function ensureOsmBaseLayer(map) {
  const spec = buildOsmRasterSourceSpec();
  if (!map.getSource("base-osm")) {
    map.addSource("base-osm", spec);
    addRasterBaseLayer(map, "base-osm", "base-osm", _activeBase === "osm", RASTER_OSM_PAINT);
    return;
  }
  try {
    const src = map.getSource("base-osm");
    const resampling = map.getPaintProperty("base-osm", "raster-resampling");
    if (resampling === "nearest" || src.tileSize !== spec.tileSize) {
      recreateOsmBaseLayer(map);
    }
  } catch {
    recreateOsmBaseLayer(map);
  }
}

function ensureBaseLayers(map) {
  ensureOsmBaseLayer(map);
  if (!map.getSource("base-inegi")) {
    map.addSource("base-inegi", {
      type: "raster",
      tiles: INEGI_WMTS_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: "© INEGI",
    });
    addRasterBaseLayer(map, "base-inegi", "base-inegi", _activeBase === "inegi");
  } else {
    try {
      const cur = map.getSource("base-inegi").tiles?.[0] || "";
      if (
        cur.includes("gaiamapas") ||
        cur.includes("gaiamapas3") ||
        cur.includes("REQUEST=GetMap")
      ) {
        if (map.getLayer("base-inegi")) map.removeLayer("base-inegi");
        map.removeSource("base-inegi");
        map.addSource("base-inegi", {
          type: "raster",
          tiles: INEGI_WMTS_TILES,
          tileSize: 256,
          maxzoom: 19,
          attribution: "© INEGI",
        });
        addRasterBaseLayer(map, "base-inegi", "base-inegi", _activeBase === "inegi");
      }
    } catch {
      /* noop */
    }
  }
  if (!map.getSource("base-sat")) {
    map.addSource("base-sat", {
      type: "raster",
      tiles: [ESRI_SAT],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri",
    });
    addRasterBaseLayer(map, "base-sat", "base-sat", _activeBase === "sat");
  }
  void ensureLocalBasemap(map).then((ok) => {
    if (ok && _activeBase === "local") setLocalBasemapVisible(map, true);
  });
  BASE_LAYER_IDS.forEach((id) => {
    if (!map.getLayer(id)) return;
    const paint = BASE_LAYER_PAINT[id] || RASTER_BASE_PAINT;
    Object.entries(paint).forEach(([prop, val]) => {
      try {
        map.setPaintProperty(id, prop, val);
      } catch {
        /* capa legada */
      }
    });
  });
}

function syncRefocusControlVisibility() {
  if (!_refocusCtrl) return;
  const hideZoom = Boolean(_homeMode);
  _refocusCtrl.querySelectorAll("[data-zoom]").forEach((el) => {
    el.style.display = hideZoom ? "none" : "";
  });
}

function ensureRefocusControl(map) {
  if (_refocusCtrl) {
    syncRefocusControlVisibility();
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "atlas-refocus-ctrl maplibregl-ctrl";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Zoom y centrar municipio");

  const mkBtn = (label, title, opts, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "atlas-refocus-ctrl__btn";
    if (opts.zoom) b.dataset.zoom = "1";
    if (opts.center) b.dataset.center = "1";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
    return b;
  };

  wrap.append(
    mkBtn("−", "Alejar", { zoom: true }, () => map.zoomOut({ duration: 200 })),
    mkBtn("⊙", "Centrar municipio seleccionado", { center: true }, () => {
      void refocusActiveMunicipioView();
    }),
    mkBtn("+", "Acercar", { zoom: true }, () => map.zoomIn({ duration: 200 })),
  );
  map.getContainer().appendChild(wrap);
  _refocusCtrl = wrap;
  syncRefocusControlVisibility();
}

/** Vuelve al encuadre del municipio activo (Datos geográficos, visor, inicio, etc.). */
export async function refocusActiveMunicipioView(profile) {
  if (!_map || !_atlasLayersReady) return;
  if (_homeMode) {
    await refitHomeMapView();
    return;
  }
  if (!_focusCve) return;
  const p = profile || _lastFocusProfile || "default";
  const fitProfile = MUNICIPIO_FOCUS_PROFILES[p] || MUNICIPIO_FOCUS_PROFILES.default;
  await fitToMunicipio(_map, _focusCve, {
    ...fitProfile,
    animate: true,
    duration: fitProfile.duration ?? 700,
  });
}

function addHomeMunLineStack(map, visibility = "none") {
  const sl = SL_MUN();
  const layout = { visibility, ...LINE_LAYOUT_SMOOTH };
  map.addLayer({
    id: LAYER_IDS.munAllLineHalo,
    type: "line",
    source: SRC_MUN,
    "source-layer": sl,
    paint: HOME_MUN_DISP_LINE_HALO_PAINT,
    layout,
  });
  map.addLayer({
    id: LAYER_IDS.munAllLine,
    type: "line",
    source: SRC_MUN,
    "source-layer": sl,
    paint: HOME_MUN_DISP_LINE_PAINT,
    layout,
  });
}

/** Líneas municipales del Explorador deben usar c_mun (v_c_mun_disp no traza bien el contorno). */
function migrateHomeMunLineStackFromDisp(map) {
  const lineId = LAYER_IDS.munAllLine;
  if (!map.getLayer(lineId)) return;
  const styleLayer = map.getStyle()?.layers?.find((l) => l.id === lineId);
  if (styleLayer?.source === SRC_MUN) return;
  const vis =
    map.getLayoutProperty(LAYER_IDS.munAllLineHalo, "visibility") ||
    map.getLayoutProperty(lineId, "visibility") ||
    "none";
  if (map.getLayer(LAYER_IDS.munAllLineHalo)) map.removeLayer(LAYER_IDS.munAllLineHalo);
  map.removeLayer(lineId);
  addHomeMunLineStack(map, vis);
}

function addEntLineStack(map, visibility = "visible") {
  const layout = { visibility, ...LINE_LAYOUT_SMOOTH };
  if (!map.getLayer(LAYER_IDS.marcoEntCasing)) {
    map.addLayer({
      id: LAYER_IDS.marcoEntCasing,
      type: "line",
      source: SRC_ENT_DISP,
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.marcoEntLineCasing,
      layout,
    });
  }
  if (!map.getLayer(LAYER_IDS.marcoEntHalo)) {
    map.addLayer({
      id: LAYER_IDS.marcoEntHalo,
      type: "line",
      source: SRC_ENT_DISP,
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.marcoEntLineHalo,
      layout,
    });
  }
  if (!map.getLayer(LAYER_IDS.marcoEnt)) {
    map.addLayer({
      id: LAYER_IDS.marcoEnt,
      type: "line",
      source: SRC_ENT_DISP,
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.marcoEntLine,
      layout,
    });
  }
}

function ensureMarcoLayers(map) {
  const sl = SL_MUN();
  const slDisp = SL_MUN_DISP();
  addMartinSource(map, SRC_MUN, MARTIN_TABLES.municipios);
  addMartinSource(map, SRC_MUN_DISP, MARTIN_TABLES.municipiosDisp);

  if (map.getLayer(LAYER_IDS.munAllLine) && !map.getLayer(LAYER_IDS.munAllLineHalo)) {
    const vis = map.getLayoutProperty(LAYER_IDS.munAllLine, "visibility");
    map.removeLayer(LAYER_IDS.munAllLine);
    addHomeMunLineStack(map, vis);
  }

  migrateHomeMunLineStackFromDisp(map);

  if (!map.getLayer(LAYER_IDS.munAllFill)) {
    map.addLayer({
      id: LAYER_IDS.munAllFill,
      type: "fill",
      source: SRC_MUN_DISP,
      "source-layer": slDisp,
      paint: LAYER_PAINT.munAllFill,
      layout: { visibility: "none" },
    });
    addHomeMunLineStack(map, "none");
    map.addLayer({
      id: LAYER_IDS.munHiFill,
      type: "fill",
      source: SRC_MUN,
      "source-layer": sl,
      paint: LAYER_PAINT.munHighlightFill,
      filter: munFilter("001"),
      layout: { visibility: "none" },
    });
    map.addLayer({
      id: LAYER_IDS.munHiLineHalo,
      type: "line",
      source: SRC_MUN,
      "source-layer": sl,
      paint: LAYER_PAINT.munHighlightLineHalo,
      filter: munFilter("001"),
      layout: { visibility: "none", ...LINE_LAYOUT_SMOOTH },
    });
    map.addLayer({
      id: LAYER_IDS.munHiLine,
      type: "line",
      source: SRC_MUN,
      "source-layer": sl,
      paint: LAYER_PAINT.munHighlightLine,
      filter: munFilter("001"),
      layout: { visibility: "none", ...LINE_LAYOUT_SMOOTH },
    });
    map.addLayer({
      id: LAYER_IDS.marcoMun,
      type: "line",
      source: SRC_MUN,
      "source-layer": sl,
      paint: LAYER_PAINT.marcoMunLine,
      filter: munFilter("001"),
      layout: LINE_LAYOUT_SMOOTH,
    });
  }

  addMartinSource(map, SRC_ENT, MARTIN_TABLES.entidad);
  addMartinSource(map, SRC_ENT_DISP, MARTIN_TABLES.entidadDisp);

  if (!map.getLayer(LAYER_IDS.entFill)) {
    map.addLayer({
      id: LAYER_IDS.entFill,
      type: "fill",
      source: SRC_ENT_DISP,
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.entFill,
      layout: { visibility: "visible" },
    });
  }

  if (map.getLayer(LAYER_IDS.marcoEnt) && !map.getLayer(LAYER_IDS.marcoEntCasing)) {
    const vis =
      map.getLayoutProperty(LAYER_IDS.marcoEntHalo, "visibility") ||
      map.getLayoutProperty(LAYER_IDS.marcoEnt, "visibility") ||
      "visible";
    map.addLayer(
      {
        id: LAYER_IDS.marcoEntCasing,
        type: "line",
        source: SRC_ENT_DISP,
        "source-layer": SL_ENT_DISP(),
        paint: LAYER_PAINT.marcoEntLineCasing,
        layout: { visibility: vis, ...LINE_LAYOUT_SMOOTH },
      },
      LAYER_IDS.marcoEntHalo,
    );
  }

  if (map.getLayer(LAYER_IDS.marcoEnt) && !map.getLayer(LAYER_IDS.marcoEntHalo)) {
    const vis = map.getLayoutProperty(LAYER_IDS.marcoEnt, "visibility");
    map.removeLayer(LAYER_IDS.marcoEnt);
    addEntLineStack(map, vis);
  }

  if (!map.getLayer(LAYER_IDS.marcoEnt)) {
    addEntLineStack(map, "visible");
  }

  [LAYER_IDS.munAllLineHalo, LAYER_IDS.munAllLine, LAYER_IDS.marcoEntCasing, LAYER_IDS.marcoEntHalo, LAYER_IDS.marcoEnt].forEach((id) => {
    if (map.getLayer(id)) map.setLayerZoomRange(id, 0, 24);
  });
}

function bringMarcoEntToFront(map) {
  try {
    if (map.getLayer(LAYER_IDS.marcoEntCasing)) map.moveLayer(LAYER_IDS.marcoEntCasing);
    if (map.getLayer(LAYER_IDS.marcoEntHalo)) map.moveLayer(LAYER_IDS.marcoEntHalo);
    if (map.getLayer(LAYER_IDS.marcoEnt)) map.moveLayer(LAYER_IDS.marcoEnt);
  } catch {
    /* noop */
  }
}

/** Orden en Inicio: velo estatal → municipios (fill+line) → contorno estatal → resaltado. */
function stackHomeLayers(map) {
  const ids = [
    LAYER_IDS.entFill,
    LAYER_IDS.munAllFill,
    LAYER_IDS.munAllLineHalo,
    LAYER_IDS.munAllLine,
    LAYER_IDS.marcoEntCasing,
    LAYER_IDS.marcoEntHalo,
    LAYER_IDS.marcoEnt,
    LAYER_IDS.munHiFill,
    LAYER_IDS.munHiLineHalo,
    LAYER_IDS.munHiLine,
  ];
  for (const id of ids) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* capa aún no lista */
    }
  }
}

/** Cancela enfoques municipales pendientes (visor/geo/inv) al volver a Explorador. */
export function invalidateMunicipioMapFocus() {
  _municipioFocusGen += 1;
}

function lineLayerIds(baseId) {
  return [`${baseId}-halo`, baseId];
}

/** Todas las sub-capas MapLibre asociadas a un overlay (incl. huérfanas). */
function collectOverlayLayerIds(map, layerId) {
  const ids = new Set(overlayLayerIds(map, layerId));
  const style = map.getStyle?.();
  if (style?.layers) {
    for (const layer of style.layers) {
      if (layer.id === layerId || layer.id.startsWith(`${layerId}-`)) {
        ids.add(layer.id);
      }
    }
  }
  return [...ids];
}

function overlayLayerIds(map, layerId) {
  const ids = [];
  if (map.getLayer(`${layerId}-fill`)) ids.push(`${layerId}-fill`);
  if (map.getLayer(`${layerId}-halo`)) ids.push(...lineLayerIds(layerId));
  else if (map.getLayer(layerId)) ids.push(layerId);
  const labelsId = overlayLabelLayerId(layerId);
  if (map.getLayer(labelsId)) ids.push(labelsId);
  return ids;
}

function ensureOverlayFillHitLayer(map, def, layerId, spec) {
  const fillId = `${layerId}-fill`;
  if (map.getLayer(fillId) || !def.fillHit || !def.fillHitPaint) return;
  const beforeId = map.getLayer(`${layerId}-halo`)
    ? `${layerId}-halo`
    : map.getLayer(layerId)
      ? layerId
      : undefined;
  const fillSpec = {
    ...spec,
    id: fillId,
    type: "fill",
    paint: def.fillHitPaint,
    layout: { visibility: "none" },
  };
  if (beforeId) map.addLayer(fillSpec, beforeId);
  else map.addLayer(fillSpec);
}

function ensureOverlayLayer(map, def) {
  const src = `src-${def.table}`;
  const layerId = `ly-${def.key}`;
  addMartinSource(map, src, def.table);
  if (def.lineStack && map.getLayer(layerId) && !map.getLayer(`${layerId}-halo`)) {
    try {
      map.removeLayer(layerId);
    } catch {
      /* recrear stack doble línea */
    }
  }
  const spec = {
    source: src,
    "source-layer": martinSourceLayer(def.table),
    filter: munFilter("001"),
  };
  if (def.minzoom != null) spec.minzoom = def.minzoom;
  const lineLayout = { visibility: "none", ...LINE_LAYOUT_SMOOTH };

  ensureOverlayFillHitLayer(map, def, layerId, spec);

  if (def.lineStack && def.paintHalo) {
    if (map.getLayer(`${layerId}-halo`) && map.getLayer(layerId)) {
      ensureOverlayLabelLayer(map, def);
      return layerId;
    }
  } else if (map.getLayer(layerId)) {
    ensureOverlayLabelLayer(map, def);
    return layerId;
  }

  if (def.type === "circle") {
    map.addLayer({
      ...spec,
      id: layerId,
      layout: { visibility: "none" },
      type: "circle",
      paint: def.paint,
    });
  } else if (def.type === "fill") {
    map.addLayer({
      ...spec,
      id: layerId,
      layout: { visibility: "none" },
      type: "fill",
      paint: def.paint,
    });
  } else if (def.lineStack && def.paintHalo) {
    if (def.fillHit && def.fillHitPaint && !map.getLayer(`${layerId}-fill`)) {
      map.addLayer({
        ...spec,
        id: `${layerId}-fill`,
        type: "fill",
        paint: def.fillHitPaint,
        layout: { visibility: "none" },
      });
    }
    if (!map.getLayer(`${layerId}-halo`)) {
      map.addLayer({ ...spec, id: `${layerId}-halo`, type: "line", paint: def.paintHalo, layout: lineLayout });
    }
    if (!map.getLayer(layerId)) {
      map.addLayer({ ...spec, id: layerId, type: "line", paint: def.paint, layout: lineLayout });
    }
  } else {
    map.addLayer({ ...spec, id: layerId, type: "line", paint: def.paint, layout: lineLayout });
  }
  ensureOverlayLabelLayer(map, def);
  return layerId;
}

function hideVisorThematicLayersOnMap(map) {
  if (!map) return;
  ensureThematicMartinLayers(map);
  syncOverlayLayersFromState(map, null, { forceAllOff: true });
}

/** Alinea capas temáticas del visor con `_overlayActive` / `_usoSueloActive`. */
function syncOverlayLayersFromState(map, cve, options = {}) {
  if (!map) return;
  const forceAllOff = Boolean(options.forceAllOff);
  const mun = cve || _focusCve || "001";
  const emptyFilter = ["literal", false];

  for (const d of OVERLAY_DEFS) {
    const lid = `ly-${d.key}`;
    if (!collectOverlayLayerIds(map, lid).length) continue;
    const on = !forceAllOff && !!_overlayActive[d.key];
    setLayerVisible(map, lid, on, on ? mun : null);
  }

  if (map.getLayer(MARTIN_USO_SUELO.layerId)) {
    const onUso = !forceAllOff && _usoSueloActive;
    setLayerVisible(map, MARTIN_USO_SUELO.layerId, onUso, onUso ? mun : null);
  }

  if (forceAllOff) {
    const geoLabelIds = new Set(overlayGeoLabelLayerIds());
    for (const d of OVERLAY_DEFS) {
      const lid = `ly-${d.key}`;
      for (const id of collectOverlayLayerIds(map, lid)) {
        if (!map.getLayer(id)) continue;
        if (geoLabelIds.has(id)) continue;
        try {
          map.setFilter(id, emptyFilter);
        } catch {
          /* noop */
        }
      }
    }
  }
}

/** Re-sincroniza overlays del visor (p. ej. tras toggle en el panel). */
export function syncVisorOverlayLayersFromState() {
  if (!_map) return;
  const apply = (map) => syncOverlayLayersFromState(map, _focusCve);
  if (_atlasLayersReady && _map.isStyleLoaded()) {
    apply(_map);
    return;
  }
  whenAtlasMapReady(apply);
}

/** Apaga capas temáticas del visor (estado + mapa). Ignora callbacks async obsoletos. */
export function clearVisorThematicLayersOnMap() {
  _overlayOpGen += 1;
  _usoSueloOpGen += 1;
  _usoSueloActive = false;
  OVERLAY_DEFS.forEach((d) => {
    _overlayActive[d.key] = false;
    _overlayKeyGen[d.key] = (_overlayKeyGen[d.key] || 0) + 1;
  });
  if (_map && _atlasLayersReady && _map.isStyleLoaded()) {
    hideVisorThematicLayersOnMap(_map);
    return;
  }
  whenAtlasMapReady(hideVisorThematicLayersOnMap);
}

function setLayerVisible(map, layerId, visible, cve) {
  const ids = collectOverlayLayerIds(map, layerId);
  const emptyFilter = ["literal", false];
  ids.forEach((id) => {
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    if (visible && cve && !isOverlayGeoLabelLayer(id)) {
      map.setFilter(id, munFilter(cve));
    } else if (!visible && !isOverlayGeoLabelLayer(id)) {
      try {
        map.setFilter(id, emptyFilter);
      } catch {
        /* noop */
      }
    }
  });
  if (visible) {
    for (const id of ids) {
      try {
        if (map.getLayer(id)) map.moveLayer(id);
      } catch {
        /* capa aún no lista */
      }
    }
    const overlayKey = overlayKeyFromLayerId(layerId);
    if (overlayKey) {
      applyOverlayLabelSpec(map, overlayKey);
      if (overlayKey === "colonias" || overlayKey === "locsAtlas") {
        activateOverlayGeoLabels(map, overlayKey, cve);
      }
    }
  } else {
    const overlayKey = overlayKeyFromLayerId(layerId);
    if (overlayKey === "colonias" || overlayKey === "locsAtlas") {
      deactivateOverlayGeoLabels(map, overlayKey);
    }
  }
}

function ensureMap(containerEl) {
  if (_map) return _map;
  _maplibregl = getMaplibregl();
  if (!_maplibregl) throw new Error("maplibre-gl no está cargado (assets/maplibre-gl.js).");

  _map = new _maplibregl.Map(
    buildAtlasMapOptions(containerEl, {
      center: [-99.5, 17.55],
      zoom: 7,
      maxZoom: 22,
    }),
  );

  _map.on("load", () => {
    ensureMapGlyphs(_map);
    prefetchLocalBasemapCatalog();
    ensureBaseLayers(_map);
    ensureMarcoLayers(_map);
    applyHomeVectorRenderQuality(_map);
    ensureThematicMartinLayers(_map);
    OVERLAY_DEFS.forEach((d) => ensureOverlayLabelLayer(_map, d));
    bindColoniasLabelsSync(_map, coloniasLabelsCtx, munFilter, ensureColoniasLabelsLayer);
    bindLocsAtlasLabelsSync(_map, locsAtlasLabelsCtx, munFilter, ensureLocsAtlasLabelsLayer);
    applyOverlayLabelTheme(_map);
    bringMarcoEntToFront(_map);
    OVERLAY_DEFS.forEach((d) => ensureOverlayLayer(_map, d));
    _atlasLayersReady = true;
    flushStyleReadyQueue();
    if (_pendingHomeMode !== null) {
      const pending = _pendingHomeMode;
      _pendingHomeMode = null;
      applyHomeMapModeLayers(_map, pending);
      applyMapInteractionLock(pending);
      if (!pending && _focusCve && isOutlineOnlyProfile(_lastFocusProfile)) {
        setMunicipioOutlineOnly(_map, _focusCve, true);
      }
    }
    _map.once("idle", () => {
      _map.resize();
    });
    ensureBaseLayerControl(_map);
    bindMapClick();
    bindAllOverlayTipHovers(_map, overlayLayerIds);
    if (!_map.__overlayLabelThemeBound) {
      window.addEventListener("atlasgro-themechange", () => {
        if (_map) applyOverlayLabelTheme(_map);
      });
      _map.__overlayLabelThemeBound = true;
    }
  });

  return _map;
}

function bindMapClick() {
  if (!_map || _map.__atlasClickBound) return;
  _map.__atlasClickBound = true;
  _map.on("click", LAYER_IDS.munAllFill, (e) => {
    if (!_homeMode) return;
    if (_map.getLayoutProperty(LAYER_IDS.munAllFill, "visibility") !== "visible") return;
    if (typeof _homePickHandler !== "function") return;
    const f = e.features?.[0];
    if (!f?.properties) return;
    const cve = pad3(f.properties.cve_mun ?? f.properties.CVE_MUN);
    const nomgeo = f.properties.nomgeo || f.properties.NOMGEO || "";
    if (!cve) return;
    void Promise.resolve(_homePickHandler({ cve_mun: cve, nomgeo })).catch((err) => {
      console.warn("home municipio pick:", err);
    });
  });
  _map.on("mouseenter", LAYER_IDS.munAllFill, () => {
    if (_homeMode) _map.getCanvas().style.cursor = "pointer";
  });
  _map.on("mouseleave", LAYER_IDS.munAllFill, () => {
    _map.getCanvas().style.cursor = "";
  });
}

function ensureThematicMartinLayers(map) {
  const uso = MARTIN_USO_SUELO;
  if (map.getLayer("ly-usosuelo")) {
    try {
      map.removeLayer("ly-usosuelo");
    } catch {
      /* capa legada usosuelo */
    }
  }
  if (map.getSource("src-usosuelo")) {
    try {
      map.removeSource("src-usosuelo");
    } catch {
      /* fuente legada */
    }
  }
  addMartinSource(map, uso.sourceId, uso.martinPath);
  if (!map.getLayer(uso.layerId)) {
    map.addLayer({
      id: uso.layerId,
      type: "fill",
      source: uso.sourceId,
      "source-layer": uso.sourceLayer,
      paint: LAYER_PAINT.usoSuelo,
      filter: munFilter("001"),
      layout: { visibility: "none" },
    });
  }
  const slC = martinSourceLayer(MARTIN_TABLES.clima);
  addMartinSource(map, "src-clima", MARTIN_TABLES.clima);
  if (!map.getLayer("ly-clima")) {
    map.addLayer({
      id: "ly-clima",
      type: "fill",
      source: "src-clima",
      "source-layer": slC,
      paint: LAYER_PAINT.clima,
      filter: munFilter("001"),
      layout: { visibility: "none" },
    });
  }
  const slH = martinSourceLayer(MARTIN_TABLES.hcorrientes);
  addMartinSource(map, "src-hcorrientes", MARTIN_TABLES.hcorrientes);
  if (map.getLayer("ly-hidro") && !map.getLayer("ly-hidro-halo")) {
    try {
      map.removeLayer("ly-hidro");
    } catch {
      /* recrear hidrografía con doble línea */
    }
  }
  const hidroLayout = { visibility: "none", ...LINE_LAYOUT_SMOOTH };
  if (!map.getLayer("ly-hidro-halo")) {
    map.addLayer({
      id: "ly-hidro-halo",
      type: "line",
      source: "src-hcorrientes",
      "source-layer": slH,
      paint: LAYER_PAINT.hcorrientesHalo,
      filter: munFilter("001"),
      layout: hidroLayout,
    });
  }
  if (!map.getLayer("ly-hidro")) {
    map.addLayer({
      id: "ly-hidro",
      type: "line",
      source: "src-hcorrientes",
      "source-layer": slH,
      paint: LAYER_PAINT.hcorrientes,
      filter: munFilter("001"),
      layout: hidroLayout,
    });
  }

  const slHc = martinSourceLayer(MARTIN_TABLES.hcuerpos);
  addMartinSource(map, "src-hcuerpos", MARTIN_TABLES.hcuerpos);
  if (!map.getLayer(HIDRO_CUERPOS_ID)) {
    map.addLayer({
      id: HIDRO_CUERPOS_ID,
      type: "fill",
      source: "src-hcuerpos",
      "source-layer": slHc,
      paint: LAYER_PAINT.hcuerposFill,
      filter: munFilter("001"),
      layout: { visibility: "none" },
    });
  }

  const slCur = martinSourceLayer(MARTIN_TABLES.curnivel);
  addMartinSource(map, "src-curnivel", MARTIN_TABLES.curnivel);
  const curLayout = { visibility: "none", ...LINE_LAYOUT_SMOOTH };
  const curBase = CURNIVEL_LAYERS.base;
  const curMa = CURNIVEL_LAYERS.master;
  if (!map.getLayer(`${curBase}-halo`)) {
    map.addLayer({
      id: `${curBase}-halo`,
      type: "line",
      source: "src-curnivel",
      "source-layer": slCur,
      paint: LAYER_PAINT.curnivelHalo,
      filter: munFilter("001"),
      layout: curLayout,
    });
    map.addLayer({
      id: curBase,
      type: "line",
      source: "src-curnivel",
      "source-layer": slCur,
      paint: LAYER_PAINT.curnivel,
      filter: munFilter("001"),
      layout: curLayout,
    });
    map.addLayer({
      id: `${curMa}-halo`,
      type: "line",
      source: "src-curnivel",
      "source-layer": slCur,
      paint: LAYER_PAINT.curnivelMaestroHalo,
      filter: ["all", munFilter("001"), curnivelMaestroFilter()],
      layout: curLayout,
    });
    map.addLayer({
      id: curMa,
      type: "line",
      source: "src-curnivel",
      "source-layer": slCur,
      paint: LAYER_PAINT.curnivelMaestro,
      filter: ["all", munFilter("001"), curnivelMaestroFilter()],
      layout: curLayout,
    });
  }
}

function setCurnivelLayersVisible(map, visible, cve) {
  const v = visible ? "visible" : "none";
  const mun = munFilter(cve || "001");
  const ma = ["all", mun, curnivelMaestroFilter()];
  const groups = [
    { base: CURNIVEL_LAYERS.base, filter: mun },
    { base: CURNIVEL_LAYERS.master, filter: ma },
  ];
  for (const { base, filter } of groups) {
    const ids = lineLayerIds(base);
    ids.forEach((id) => {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, "visibility", v);
      if (visible) map.setFilter(id, filter);
    });
  }
}

function setHidroCorrientesVisible(map, visible, cve) {
  setLayerVisible(map, HIDRO_CORRIENTES_ID, visible, cve);
}

function setHidroCuerposVisible(map, visible, cve) {
  setLayerVisible(map, HIDRO_CUERPOS_ID, visible, cve);
}

function applyGeoThematicLayers(map, activeTab, cve, inGeo) {
  ensureThematicMartinLayers(map);
  const c = pad3(cve || _focusCve || "001");
  const on = (tabId) => Boolean(inGeo && activeTab === tabId);

  setLayerVisible(map, MARTIN_USO_SUELO.layerId, on("uso_suelo"), c);
  setLayerVisible(map, "ly-clima", on("clima"), c);
  setHidroCorrientesVisible(map, on("hidrografia"), c);
  setHidroCuerposVisible(map, on("hidrografia"), c);
  setCurnivelLayersVisible(map, on("relieve"), c);

  _relieveActive = on("relieve");
}

/** Una sola pasada: solo la pestaña activa de Datos geográficos (evita carreras async). */
export function syncGeoThematicLayers(activeTab, cve, inGeo) {
  const gen = ++_geoThematicGen;
  const run = (map) => {
    if (gen !== _geoThematicGen) return;
    applyGeoThematicLayers(map, activeTab, cve, inGeo);
  };
  if (_map && _atlasLayersReady && _map.isStyleLoaded()) {
    run(_map);
    return;
  }
  whenAtlasMapReady(run);
}

/** Apaga todas las capas temáticas de Datos geográficos. */
export function clearGeoThematicLayers() {
  syncGeoThematicLayers("", null, false);
}

/** Precarga teselas Martin al entrar a Datos geográficos (capas siguen ocultas). */
export function warmGeoThematicTiles(cve) {
  const c = pad3(cve || _focusCve || "001");
  const f = munFilter(c);
  whenAtlasMapReady((map) => {
    ensureThematicMartinLayers(map);
    const warm = (sourceId, sourceLayer) => {
      try {
        map.querySourceFeatures(sourceId, { sourceLayer, filter: f });
      } catch {
        /* fuente aún sin tiles */
      }
    };
    warm("src-hcorrientes", martinSourceLayer(MARTIN_TABLES.hcorrientes));
    warm("src-hcuerpos", martinSourceLayer(MARTIN_TABLES.hcuerpos));
    warm(MARTIN_USO_SUELO.sourceId, MARTIN_USO_SUELO.sourceLayer);
    warm("src-clima", martinSourceLayer(MARTIN_TABLES.clima));
    warm("src-curnivel", martinSourceLayer(MARTIN_TABLES.curnivel));
  });
}

export function setMapView(containerEl, viewParam) {
  const map = ensureMap(containerEl);
  if (!viewParam) return;
  try {
    const decoded = atob(viewParam);
    const parts = decoded.split(",").map((s) => s.trim());
    const obj = {};
    parts.forEach((p) => {
      const [k, v] = p.split(":");
      if (k && v !== undefined) obj[k.trim()] = v.trim();
    });
    const lat = Number(obj.lat);
    const lon = Number(obj.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.panTo([lon, lat], { animate: true });
    }
  } catch {
    /* noop */
  }
}

export async function setMunicipioMapFocus(containerEl, cve_mun, profile = "default") {
  const fitProfile = MUNICIPIO_FOCUS_PROFILES[profile] || MUNICIPIO_FOCUS_PROFILES.default;
  const map = ensureMap(containerEl);
  const gen = ++_municipioFocusGen;
  _focusCve = cve_mun ? pad3(cve_mun) : null;
  _lastFocusProfile = profile;

  const waitLoad = () =>
    new Promise((resolve) => {
      if (map.isStyleLoaded()) resolve();
      else map.once("load", resolve);
    });
  await waitLoad();
  if (!_atlasLayersReady) {
    await new Promise((resolve) => whenAtlasMapReady(resolve));
  }
  if (gen !== _municipioFocusGen) return;
  if (_homeMode) return;

  clearMapViewConstraints();

  if (!_focusCve) {
    map.setFilter(LAYER_IDS.marcoMun, ["literal", false]);
    setMunicipioHighlightVisible(map, null, false);
    setMunicipioOutlineOnly(map, null, false);
    safeSetLayout(map, LAYER_IDS.entFill, "visibility", "visible");
    safeSetLayout(map, LAYER_IDS.marcoEntHalo, "visibility", "visible");
    safeSetLayout(map, LAYER_IDS.marcoEnt, "visibility", "visible");
    fitToEntidad(map, { padding: 32, duration: 800 });
    syncOverlayCve(null);
    return;
  }

  map.setFilter(LAYER_IDS.marcoMun, munFilter(_focusCve));
  safeSetLayout(map, LAYER_IDS.entFill, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.marcoEntHalo, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.marcoEnt, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munAllFill, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munAllLineHalo, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munAllLine, "visibility", "none");

  if (gen !== _municipioFocusGen) return;

  map.resize();
  if (isOutlineOnlyProfile(profile)) {
    setMunicipioOutlineOnly(map, _focusCve, true);
  } else {
    setMunicipioOutlineOnly(map, null, false);
    setMunicipioHighlightVisible(map, _focusCve, false);
    safeSetLayout(map, LAYER_IDS.marcoMun, "visibility", "visible");
  }

  await fitToMunicipio(map, _focusCve, {
    padding: fitProfile.padding,
    maxZoom: fitProfile.maxZoom,
    duration: fitProfile.duration ?? 1200,
    animate: true,
  });
  syncOverlayLayersFromState(map, _focusCve);
}

function syncOverlayCve(cve) {
  syncOverlayLayersFromState(_map, cve);
}

export function scheduleMunicipioMapFocus(containerEl, cve_mun, profile) {
  if (!containerEl || !cve_mun) return;
  const run = () => setMunicipioMapFocus(containerEl, cve_mun, profile);
  void run();
  requestAnimationFrame(() => {
    invalidateMapSize();
    void run();
    setTimeout(() => void run(), 120);
    setTimeout(() => void run(), 320);
  });
}

function applyHomeMapModeLayers(map, homeMode) {
  const show = (id, on) => safeSetLayout(map, id, "visibility", on ? "visible" : "none");
  if (homeMode) {
    setMunicipioOutlineOnly(map, null, false);
    OVERLAY_DEFS.forEach((d) => {
      _overlayActive[d.key] = false;
    });
    hideVisorThematicLayersOnMap(map);
    show(LAYER_IDS.entFill, true);
    show(LAYER_IDS.marcoEntCasing, false);
    show(LAYER_IDS.marcoEntHalo, true);
    show(LAYER_IDS.marcoEnt, true);
    show(LAYER_IDS.marcoMun, false);
    show(LAYER_IDS.munAllFill, true);
    show(LAYER_IDS.munAllLineHalo, true);
    show(LAYER_IDS.munAllLine, true);
    stackHomeLayers(map);
    bringMarcoEntToFront(map);
    applyHomeVectorRenderQuality(map);
  } else {
    const preserveOutline = !_homeMode && _focusCve && isOutlineOnlyProfile(_lastFocusProfile);
    if (!preserveOutline) {
      setMunicipioOutlineOnly(map, null, false);
    }
    show(LAYER_IDS.munAllFill, false);
    show(LAYER_IDS.munAllLineHalo, false);
    show(LAYER_IDS.munAllLine, false);
    show(LAYER_IDS.entFill, false);
    show(LAYER_IDS.marcoEntCasing, false);
    show(LAYER_IDS.marcoEntHalo, false);
    show(LAYER_IDS.marcoEnt, false);
    if (!preserveOutline) {
      show(LAYER_IDS.marcoMun, false);
    }
    setHomeMunicipioHighlight(null);
    clearMapViewConstraints();
    if (preserveOutline) {
      setMunicipioOutlineOnly(map, _focusCve, true);
    }
  }
}

function applyMapInteractionLock(locked) {
  if (!_map || !_atlasLayersReady) return;
  _interactionLocked = Boolean(locked);
  const opts = [
    "dragPan",
    "scrollZoom",
    "boxZoom",
    "doubleClickZoom",
    "touchZoomRotate",
    "keyboard",
  ];
  opts.forEach((o) => {
    if (locked) _map[o]?.disable?.();
    else _map[o]?.enable?.();
  });
}

export function setHomeMapMode(active) {
  const map = ensureMap(document.getElementById("mapFrame"));
  const gen = ++_homeModeGen;
  const targetMode = Boolean(active);
  _homeMode = targetMode;
  if (_homeMode) invalidateMunicipioMapFocus();
  const el = map.getContainer();
  el.classList.toggle("atlas-map--home", _homeMode);
  el.classList.toggle("atlas-map--home-select", _homeMode);
  el.classList.toggle("atlas-map--home-lock", _homeMode);
  syncRefocusControlVisibility();

  const apply = () => {
    if (gen !== _homeModeGen) return;
    if (_homeMode !== targetMode) return;
    applyHomeMapModeLayers(map, targetMode);
    applyMapInteractionLock(targetMode);
    if (!targetMode && _focusCve && isOutlineOnlyProfile(_lastFocusProfile)) {
      setMunicipioOutlineOnly(map, _focusCve, true);
    }
  };

  if (!_atlasLayersReady || !map.isStyleLoaded()) {
    _pendingHomeMode = targetMode;
    whenAtlasMapReady(apply);
    return;
  }
  apply();
}

let _homeEnterGen = 0;
let _homeModeGen = 0;

function waitMapLayoutReady() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      invalidateMapSize();
      requestAnimationFrame(() => {
        if (_map) _map.resize();
        requestAnimationFrame(() => {
          if (_map) _map.resize();
          setTimeout(resolve, 50);
        });
      });
    });
  });
}

function finalizeHomeMapView(map, cve_mun) {
  if (!map || !_homeMode) return;
  applyHomeMapModeLayers(map, true);
  if (cve_mun) applyHomeMunicipioHighlight(map, cve_mun);
  else applyHomeMunicipioHighlight(map, null);
}

/** Explorador municipal: vista estatal + resaltado del municipio activo (un solo flujo). */
export async function enterExploradorMapView(cve_mun) {
  const gen = ++_homeEnterGen;
  invalidateMunicipioMapFocus();
  if (!_map) {
    const el = document.getElementById("mapFrame");
    if (el) ensureMap(el);
  }
  if (!_atlasLayersReady) {
    await new Promise((resolve) => whenAtlasMapReady(resolve));
  }
  if (gen !== _homeEnterGen) return;

  setHomeMapMode(true);
  await waitMapLayoutReady();
  if (gen !== _homeEnterGen) return;

  await refitHomeMapView();
  if (gen !== _homeEnterGen || !_homeMode) return;

  const cve = cve_mun ? pad3(cve_mun) : null;
  finalizeHomeMapView(_map, cve);
  _map.once("idle", () => {
    if (gen === _homeEnterGen && _homeMode) finalizeHomeMapView(_map, cve);
  });
}

function applyHomeMunicipioHighlight(map, cve_mun) {
  if (!map) return;
  const cve = cve_mun ? pad3(cve_mun) : null;
  _homeHighlightCve = cve;
  applyMunAllHighlightPaint(map, cve);
}

/** Tras cambiar mapa base en Explorador, restaurar resaltado municipal encima. */
export function refreshHomeMapAfterBasemapChange() {
  whenAtlasMapReady((map) => {
    if (!_homeMode) return;
    applyHomeMapModeLayers(map, true);
    applyHomeMunicipioHighlight(map, _homeHighlightCve);
  });
}

/** Sale del modo mapa Inicio (Explorador municipal). */
export function leaveHomeMapMode() {
  if (!_homeMode) return;
  setHomeMapMode(false);
}

export function setHomeMunicipioHighlight(cve_mun) {
  if (!_map) return;
  if (_atlasLayersReady && _map.isStyleLoaded()) {
    applyHomeMunicipioHighlight(_map, cve_mun);
    return;
  }
  whenAtlasMapReady((map) => applyHomeMunicipioHighlight(map, cve_mun));
}

export function setHomeMunicipioClickHandler(fn) {
  _homePickHandler = typeof fn === "function" ? fn : null;
}

export async function refitHomeMapView() {
  if (!_map || !_homeMode || !_atlasLayersReady) return;
  clearMapViewConstraints();
  setMunicipioOutlineOnly(_map, null, false);
  _map.resize();
  _map.fitBounds(MXSIG_BOUNDS, {
    padding: HOME_MAP_FIT_PADDING,
    maxZoom: 8,
    duration: 0,
    animate: false,
  });
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    _map.once("idle", finish);
    setTimeout(finish, 900);
  });
  if (!_map || !_homeMode) return;
  const b = _map.getBounds();
  const bounds = [
    [b.getWest(), b.getSouth()],
    [b.getEast(), b.getNorth()],
  ];
  const z = _map.getZoom();
  _map.setMinZoom(z);
  _map.setMaxZoom(z);
  _map.setMaxBounds(bounds);
}

export function setMapInteractionLocked(locked) {
  applyMapInteractionLock(locked);
}

export function restoreMapZoomControls() {
  if (!_map) return;
  whenAtlasMapReady((map) => {
    ensureBaseLayerControl(map);
    ensureRefocusControl(map);
    syncBaseLayerButtons();
    const ml = getMaplibregl();
    if (ml && !_navControlAdded) {
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      _navControlAdded = true;
    }
  });
}

export function setMapBaseLayer(kind) {
  if (!_map) return;
  _activeBase = kind === "sat" || kind === "inegi" || kind === "local" ? kind : "osm";
  whenAtlasMapReady((map) => {
    ensureBaseLayers(map);

    const applyVisibility = () => {
      BASE_LAYER_IDS.forEach((id) => {
        const on = id === `base-${_activeBase}`;
        safeSetLayout(map, id, "visibility", on ? "visible" : "none");
      });
      setLocalBasemapVisible(map, _activeBase === "local");
      syncBaseLayerButtons();
      refreshHomeMapAfterBasemapChange();
    };

    if (_activeBase === "local") {
      void ensureLocalBasemap(map).then((ok) => {
        if (!ok && _activeBase === "local") {
          console.warn("[local-basemap] MBTiles no disponible; usando OSM.");
          _activeBase = "osm";
        }
        applyVisibility();
      });
      return;
    }

    setLocalBasemapVisible(map, false);
    applyVisibility();
  });
}

/** Contorno municipal del municipio activo (no el límite estatal). */
export function setMarcoWmsVisible(visible) {
  if (!_map) return;
  const v = visible ? "visible" : "none";
  whenAtlasMapReady((map) => {
    safeSetLayout(map, LAYER_IDS.marcoMun, "visibility", v);
  });
}

export function getMarcoWmsVisible() {
  return Boolean(_map?.getLayer(LAYER_IDS.marcoMun) && _map.getLayoutProperty(LAYER_IDS.marcoMun, "visibility") === "visible");
}

export function getMapBaseUrl() {
  return martinTileJson(MARTIN_TABLES.municipios);
}

export function invalidateMapSize() {
  if (_map) {
    requestAnimationFrame(() => {
      _map.resize();
      setTimeout(() => _map.resize(), 120);
    });
  }
}

let _resizeTimer = null;
export function bindMapResizeHandler() {
  if (typeof window === "undefined" || window.__atlasMapResizeBound) return;
  window.__atlasMapResizeBound = true;
  window.addEventListener("resize", () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(invalidateMapSize, 200);
  });
}

function setOverlayActive(key, active, cve_mun) {
  const def = OVERLAY_DEFS.find((d) => d.key === key);
  if (!def) return;
  _overlayKeyGen[key] = (_overlayKeyGen[key] || 0) + 1;
  const keyGen = _overlayKeyGen[key];
  _overlayActive[key] = active;
  if (!_map) {
    whenAtlasMapReady((map) => {
      if (keyGen !== _overlayKeyGen[key]) return;
      ensureOverlayLayer(map, def);
      syncOverlayLayersFromState(map, cve_mun || _focusCve || "001");
    });
    return;
  }
  const opGen = _overlayOpGen;
  const cve = cve_mun || _focusCve || "001";

  const apply = (map) => {
    if (keyGen !== _overlayKeyGen[key]) return;
    if (opGen !== _overlayOpGen) return;
    ensureOverlayLayer(map, def);
    syncOverlayLayersFromState(map, cve);
    refreshOverlayTipBindings(map, overlayLayerIds);
  };

  if (_map && _atlasLayersReady && _map.isStyleLoaded()) {
    apply(_map);
    return;
  }
  whenAtlasMapReady(apply);
}

/** Zoom mínimo de una capa Martin del visor (p. ej. manzanas → 14). */
export function getOverlayMinZoom(key) {
  const def = OVERLAY_DEFS.find((d) => d.key === key);
  return def?.minzoom ?? null;
}

export function setLocsAtlasLayerActive(a, c) { setOverlayActive("locsAtlas", a, c); }
export function getLocsAtlasLayerActive() { return !!_overlayActive.locsAtlas; }
export function setLocsPuntoLayerActive(a, c) { setOverlayActive("locsPunto", a, c); }
export function getLocsPuntoLayerActive() { return !!_overlayActive.locsPunto; }
export function setColoniasLayerActive(a, c) { setOverlayActive("colonias", a, c); }
export function getColoniasLayerActive() { return !!_overlayActive.colonias; }
export function setAgebUrbanasLayerActive(a, c) { setOverlayActive("agebUrbanas", a, c); }
export function getAgebUrbanasLayerActive() { return !!_overlayActive.agebUrbanas; }
export function setAgebRuralesLayerActive(a, c) { setOverlayActive("agebRurales", a, c); }
export function getAgebRuralesLayerActive() { return !!_overlayActive.agebRurales; }
export function setManzanasLayerActive(a, c) { setOverlayActive("manzanas", a, c); }
export function getManzanasLayerActive() { return !!_overlayActive.manzanas; }
export function setVialidadesLayerActive(a, c) { setOverlayActive("vialidades", a, c); }
export function getVialidadesLayerActive() { return !!_overlayActive.vialidades; }
export function setRncLayerActive(a, c) { setOverlayActive("rnc", a, c); }
export function getRncLayerActive() { return !!_overlayActive.rnc; }
export function setSaneamientoAguaLayerActive(a, c) { setOverlayActive("saneamientoAgua", a, c); }
export function getSaneamientoAguaLayerActive() { return !!_overlayActive.saneamientoAgua; }

export function setRelieveLayerActive(active, cve_mun) {
  _relieveActive = Boolean(active);
  if (!active) {
    whenAtlasMapReady((map) => setCurnivelLayersVisible(map, false, cve_mun || _focusCve || "001"));
  }
}
export function getRelieveLayerActive() {
  return _relieveActive;
}
export function setClimaLayerActive(a, c) {
  if (!a) {
    whenAtlasMapReady((map) => setLayerVisible(map, "ly-clima", false, c || _focusCve || "001"));
  }
}
export function getClimaLayerActive() {
  return _map?.getLayer("ly-clima") && _map.getLayoutProperty("ly-clima", "visibility") === "visible";
}
export function setUsoSueloLayerActive(a, c) {
  _usoSueloActive = Boolean(a);
  const opGen = ++_usoSueloOpGen;
  const cve = c || _focusCve || "001";
  const apply = (map) => {
    if (opGen !== _usoSueloOpGen) return;
    ensureThematicMartinLayers(map);
    syncOverlayLayersFromState(map, cve);
  };
  if (_map && _atlasLayersReady && _map.isStyleLoaded()) {
    apply(_map);
    return;
  }
  whenAtlasMapReady(apply);
}
export function getUsoSueloLayerActive() {
  return _usoSueloActive;
}
export function setHidrograficaLayerActive(a, c) {
  whenAtlasMapReady((map) => {
    ensureThematicMartinLayers(map);
    setHidroCorrientesVisible(map, a, c || _focusCve || "001");
    setHidroCuerposVisible(map, a, c || _focusCve || "001");
  });
}
export function getHidrograficaLayerActive() {
  const cor = _map?.getLayer(HIDRO_CORRIENTES_ID) && _map.getLayoutProperty(HIDRO_CORRIENTES_ID, "visibility") === "visible";
  const cuer = _map?.getLayer(HIDRO_CUERPOS_ID) && _map.getLayoutProperty(HIDRO_CUERPOS_ID, "visibility") === "visible";
  return Boolean(cor || cuer);
}

export function ensureGeoMacroMap(containerEl, cve_mun = null) {
  const ml = getMaplibregl();
  if (!ml || !containerEl) return null;
  if (cve_mun) _geoMacroPendingCve = pad3(cve_mun);
  if (_geoMacro?.map && _geoMacro.container === containerEl) {
    let osmOk = false;
    try {
      const tiles = _geoMacro.map.getSource("gm-osm")?.tiles;
      osmOk = typeof tiles?.[0] === "string";
    } catch {
      osmOk = false;
    }
    const hiReady = Boolean(_geoMacro.map.getLayer("gm-mun-hi-fill"));
    if (!osmOk || !hiReady) destroyGeoMacroMap();
    else {
      return _geoMacro;
    }
  }

  destroyGeoMacroMap();
  const map = new ml.Map(
    buildAtlasMapOptions(containerEl, {
      bounds: MXSIG_BOUNDS,
      fitBoundsOptions: { padding: GEO_MACRO_FIT_PADDING, animate: false },
      interactive: false,
      attributionControl: true,
    }),
  );
  map.on("load", () => {
    map.addSource("gm-osm", buildOsmRasterSourceSpec());
    map.addLayer({
      id: "gm-osm",
      type: "raster",
      source: "gm-osm",
      paint: RASTER_OSM_PAINT,
    });
    addMartinSource(map, "gm-mun", MARTIN_TABLES.municipiosDisp);
    addMartinSource(map, "gm-ent", MARTIN_TABLES.entidadDisp);
    map.addLayer({
      id: "gm-mun-fill",
      type: "fill",
      source: "gm-mun",
      "source-layer": SL_MUN_DISP(),
      paint: LAYER_PAINT.munAllFill,
    });
    map.addLayer({
      id: "gm-mun-line-halo",
      type: "line",
      source: "gm-mun",
      "source-layer": SL_MUN_DISP(),
      paint: LAYER_PAINT.munAllLineHalo,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-mun-line",
      type: "line",
      source: "gm-mun",
      "source-layer": SL_MUN_DISP(),
      paint: LAYER_PAINT.munAllLine,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-ent-fill",
      type: "fill",
      source: "gm-ent",
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.entFill,
    });
    map.addLayer({
      id: "gm-ent-line-casing",
      type: "line",
      source: "gm-ent",
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.marcoEntLineCasing,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-ent-line-halo",
      type: "line",
      source: "gm-ent",
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.marcoEntLineHalo,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-ent-line",
      type: "line",
      source: "gm-ent",
      "source-layer": SL_ENT_DISP(),
      paint: LAYER_PAINT.marcoEntLine,
      layout: LINE_LAYOUT_SMOOTH,
    });
    addMartinSource(map, "gm-mun-sel", MARTIN_TABLES.municipios);
    const hiCve = _geoMacroPendingCve || "001";
    const hiFilter = munFilter(hiCve);
    const hiVis = _geoMacroPendingCve ? "visible" : "none";
    map.addLayer({
      id: "gm-mun-hi-fill",
      type: "fill",
      source: "gm-mun-sel",
      "source-layer": SL_MUN(),
      paint: LAYER_PAINT.munHighlightFill,
      filter: hiFilter,
      layout: { visibility: hiVis },
    });
    map.addLayer({
      id: "gm-mun-hi-line-halo",
      type: "line",
      source: "gm-mun-sel",
      "source-layer": SL_MUN(),
      paint: LAYER_PAINT.munHighlightLineHalo,
      filter: hiFilter,
      layout: { visibility: hiVis, ...LINE_LAYOUT_SMOOTH },
    });
    map.addLayer({
      id: "gm-mun-hi-line",
      type: "line",
      source: "gm-mun-sel",
      "source-layer": SL_MUN(),
      paint: LAYER_PAINT.munHighlightLine,
      filter: hiFilter,
      layout: { visibility: hiVis, ...LINE_LAYOUT_SMOOTH },
    });
    applyGeoMacroVectorRenderQuality(map);
    map.once("idle", () => {
      stackGeoMacroLayers(map);
      refitGeoMacroMap();
    });
  });
  containerEl.classList.add("geo-macro-maplibre", "atlas-map--home-lock");
  _geoMacro = { map, container: containerEl };
  return _geoMacro;
}

const GEO_MACRO_HI_LAYERS = ["gm-mun-hi-fill", "gm-mun-hi-line-halo", "gm-mun-hi-line"];

function stackGeoMacroLayers(map) {
  const order = [
    "gm-ent-fill",
    "gm-mun-fill",
    "gm-mun-line-halo",
    "gm-mun-line",
    "gm-mun-hi-fill",
    "gm-mun-hi-line-halo",
    "gm-mun-hi-line",
    "gm-ent-line-casing",
    "gm-ent-line-halo",
    "gm-ent-line",
  ];
  for (const id of order) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* capa aún no lista */
    }
  }
}

function applyGeoMacroHighlightNow() {
  if (!_geoMacro?.map) return;
  try {
    const map = _geoMacro.map;
    const cve = _geoMacroPendingCve;
    const f = cve ? munFilter(cve) : ["literal", false];
    const vis = cve ? "visible" : "none";
    let ready = false;
    for (const id of GEO_MACRO_HI_LAYERS) {
      if (!map.getLayer(id)) continue;
      ready = true;
      map.setFilter(id, f);
      map.setLayoutProperty(id, "visibility", vis);
    }
    if (!ready) return;
    stackGeoMacroLayers(map);
    if (map.getLayer("gm-mun-fill")) {
      applyMunDispHighlightPaint(map, cve, GEO_MACRO_PAINT_IDS);
    }
  } catch (err) {
    console.warn("[geo-macro] highlight:", err);
  }
}

/** Mini-mapa estatal: encuadre a Guerrero + resaltado del municipio activo. */
export function refitGeoMacroMap(cve_mun) {
  if (!_geoMacro?.map) return;
  if (cve_mun != null && String(cve_mun).trim() !== "") {
    _geoMacroPendingCve = pad3(cve_mun);
  }
  const gen = ++_geoMacroHiGen;
  const map = _geoMacro.map;

  const finishHighlight = () => {
    if (gen !== _geoMacroHiGen) return;
    applyGeoMacroHighlightNow();
  };

  const run = () => {
    if (gen !== _geoMacroHiGen) return;
    try {
      map.resize();
      fitMapToMartinSource(map, "gm-ent", SL_ENT_DISP(), {
        padding: GEO_MACRO_FIT_PADDING,
        duration: 0,
        fallbackBounds: MXSIG_BOUNDS,
      });
      const z = map.getZoom();
      if (Number.isFinite(z)) {
        map.setMinZoom(Math.max(5, z - 0.25));
        map.setMaxZoom(z + 0.25);
      }
      finishHighlight();
    } catch (err) {
      console.warn("[geo-macro] refit:", err);
      finishHighlight();
    }
  };

  if (map.isStyleLoaded()) {
    run();
    map.once("idle", finishHighlight);
  } else {
    map.once("load", run);
  }
}

export function setGeoMacroMunicipio(cve_mun) {
  if (!_geoMacro?.map) return;
  if (cve_mun != null && String(cve_mun).trim() !== "") {
    _geoMacroPendingCve = pad3(cve_mun);
  } else if (cve_mun === null) {
    _geoMacroPendingCve = null;
  }
  const gen = ++_geoMacroHiGen;
  const map = _geoMacro.map;

  const apply = () => {
    if (gen !== _geoMacroHiGen) return;
    const hasHi = GEO_MACRO_HI_LAYERS.some((id) => map.getLayer(id));
    if (!hasHi) {
      map.once("idle", apply);
      return;
    }
    applyGeoMacroHighlightNow();
  };

  if (!map.isStyleLoaded()) {
    map.once("load", apply);
    return;
  }
  apply();
}

export function destroyGeoMacroMap() {
  if (!_geoMacro) return;
  _geoMacroHiGen += 1;
  try {
    _geoMacro.map.remove();
  } catch {
    /* noop */
  }
  _geoMacro = null;
}

export function invalidateGeoMacroMapSize(cve_mun) {
  if (!_geoMacro?.map) return;
  _geoMacro.map.resize();
  refitGeoMacroMap(cve_mun ?? _geoMacroPendingCve ?? null);
}
