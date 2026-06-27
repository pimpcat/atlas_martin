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
  RESIDUO_SOLIDO_LABEL_LAYOUT,
  RESIDUO_SOLIDO_LABEL_MIN_ZOOM,
  RESIDUO_SOLIDO_LABEL_PAINT,
  RESIDUO_SOLIDO_LABEL_PAINT_CLARO,
  SANEAMIENTO_AGUA_LABEL_LAYOUT,
  SANEAMIENTO_AGUA_LABEL_MIN_ZOOM,
  SANEAMIENTO_AGUA_LABEL_PAINT,
  SANEAMIENTO_AGUA_LABEL_PAINT_CLARO,
  CLUES_LABEL_LAYOUT,
  CLUES_LABEL_MIN_ZOOM,
  CLUES_LABEL_PAINT,
  CLUES_LABEL_PAINT_CLARO,
  HCORRIENTES_LABEL_LAYOUT,
  HCORRIENTES_LABEL_MIN_ZOOM,
  HCORRIENTES_LABEL_PAINT,
  HCORRIENTES_LABEL_PAINT_CLARO,
  HCUERPOS_LABEL_LAYOUT,
  HCUERPOS_LABEL_MIN_ZOOM,
  HCUERPOS_LABEL_PAINT,
  HCUERPOS_LABEL_PAINT_CLARO,
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
  RNC_DETAIL_MIN_ZOOM,
  RNC_TRONCAL_MIN_ZOOM,
  curnivelMaestroFilter,
  fieldValueMatchFilter,
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
import { locsPuntoLayerUsesLegacyCircle } from "./mapLocsPuntoIcons.js";
import { cluesLayerUsesLegacyCircle } from "./mapCluesIcons.js";
import {
  ensureAllVisorCatalogIconsOnMap,
  ensureVisorIconKeyOnMap,
  invalidateVisorIconRegistryOnMap,
} from "./visorIconRegistry.js";
import {
  buildDenueOverlayLabelByKey,
  codigoActFilter,
  isDenueOverlayKey,
} from "./denueLayers.js";

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
  residuoSolido: {
    minzoom: RESIDUO_SOLIDO_LABEL_MIN_ZOOM,
    layout: RESIDUO_SOLIDO_LABEL_LAYOUT,
    paint: RESIDUO_SOLIDO_LABEL_PAINT,
    paintClaro: RESIDUO_SOLIDO_LABEL_PAINT_CLARO,
  },
  saneamientoAgua: {
    minzoom: SANEAMIENTO_AGUA_LABEL_MIN_ZOOM,
    layout: SANEAMIENTO_AGUA_LABEL_LAYOUT,
    paint: SANEAMIENTO_AGUA_LABEL_PAINT,
    paintClaro: SANEAMIENTO_AGUA_LABEL_PAINT_CLARO,
  },
  clues: {
    minzoom: CLUES_LABEL_MIN_ZOOM,
    layout: CLUES_LABEL_LAYOUT,
    paint: CLUES_LABEL_PAINT,
    paintClaro: CLUES_LABEL_PAINT_CLARO,
  },
  ...buildDenueOverlayLabelByKey(),
};

/** Etiquetas declaradas en catalog.json (visorLabelRegistry). */
let _visorCatalogLabelByKey = {};

function getOverlayLabelDef(overlayKey) {
  return OVERLAY_LABEL_BY_KEY[overlayKey] || _visorCatalogLabelByKey[overlayKey] || null;
}

export function hasBuiltinOverlayLabel(overlayKey) {
  return Boolean(OVERLAY_LABEL_BY_KEY[overlayKey]);
}

export function hasOverlayLabelDef(overlayKey) {
  return Boolean(getOverlayLabelDef(overlayKey));
}

export function registerVisorCatalogLabelDefs(byKey) {
  _visorCatalogLabelByKey = byKey && typeof byKey === "object" ? { ...byKey } : {};
}

export function remountVisorCatalogLabelLayers() {
  const map = _map;
  if (!map?.isStyleLoaded?.()) return;
  for (const def of _visorDynamicOverlayDefs) {
    if (!getOverlayLabelDef(def.key)) continue;
    const labelId = overlayLabelLayerId(`ly-${def.key}`);
    try {
      if (map.getLayer(labelId)) map.removeLayer(labelId);
    } catch {
      /* noop */
    }
    ensureOverlayLabelLayer(map, def);
    if (_overlayActive[def.key]) {
      applyOverlayLabelSpec(map, def.key);
      const mainId = `ly-${def.key}`;
      if (map.getLayer(labelId)) {
        setLayerVisible(map, labelId, true, resolveVisorOverlayCve(_focusCve));
      }
    }
  }
}

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

function visorOnlyLabelPaintForTheme(spec) {
  return readDocumentTheme() === "claro" ? spec.paintClaro || spec.paint : spec.paint;
}

function applyVisorOnlyLabelSpec(map, layerKey) {
  const spec = VISOR_ONLY_LABEL_SPECS[layerKey];
  if (!spec || !map?.getLayer(spec.labelId)) return;
  clearVisorOpacityBaseCacheForLayer(spec.labelId);
  for (const [prop, val] of Object.entries(spec.layout)) {
    if (prop === "visibility") continue;
    try {
      map.setLayoutProperty(spec.labelId, prop, val);
    } catch {
      /* noop */
    }
  }
  const paint = visorOnlyLabelPaintForTheme(spec);
  for (const [prop, val] of Object.entries(paint)) {
    try {
      map.setPaintProperty(spec.labelId, prop, val);
    } catch {
      /* noop */
    }
  }
}

function ensureVisorOnlyLabelLayer(map, layerKey) {
  const spec = VISOR_ONLY_LABEL_SPECS[layerKey];
  if (!spec || !map) return;
  ensureMapGlyphs(map);
  addMartinSource(map, spec.sourceId, spec.table);
  if (map.getLayer(spec.labelId)) {
    applyVisorOnlyLabelSpec(map, layerKey);
    return;
  }
  map.addLayer({
    id: spec.labelId,
    type: "symbol",
    source: spec.sourceId,
    "source-layer": martinSourceLayer(spec.table),
    minzoom: spec.minzoom,
    filter: munFilter("001"),
    layout: { ...spec.layout, visibility: "none" },
    paint: visorOnlyLabelPaintForTheme(spec),
  });
}

function setVisorOnlyLabelVisible(map, layerKey, visible, cve) {
  const spec = VISOR_ONLY_LABEL_SPECS[layerKey];
  if (!spec || !map?.getLayer(spec.labelId)) return;
  const emptyFilter = ["literal", false];
  map.setLayoutProperty(spec.labelId, "visibility", visible ? "visible" : "none");
  if (visible && _visorStateWideMode) {
    try {
      map.setFilter(spec.labelId, null);
    } catch {
      /* noop */
    }
    applyVisorOnlyLabelSpec(map, layerKey);
  } else if (visible && cve) {
    map.setFilter(spec.labelId, munFilter(cve));
    applyVisorOnlyLabelSpec(map, layerKey);
  } else {
    try {
      map.setFilter(spec.labelId, emptyFilter);
    } catch {
      /* noop */
    }
  }
}

function hideVisorOnlyLabels(map) {
  if (!map) return;
  for (const key of Object.keys(VISOR_ONLY_LABEL_SPECS)) {
    setVisorOnlyLabelVisible(map, key, false, null);
  }
}

function syncVisorSharedThematicLayers(map, cve, forceAllOff = false) {
  if (!map) return;
  ensureThematicMartinLayers(map);
  const mun = resolveVisorOverlayCve(cve);
  const on = (key) => !forceAllOff && !!_visorSharedActive[key];

  setHidroCorrientesVisible(map, on("hidro_corrientes"), mun);
  setHidroCuerposVisible(map, on("hidro_cuerpos"), mun);
  setCurnivelLayersVisible(map, on("curvas_nivel"), mun);

  for (const key of Object.keys(VISOR_ONLY_LABEL_SPECS)) {
    ensureVisorOnlyLabelLayer(map, key);
    setVisorOnlyLabelVisible(map, key, on(key), mun);
  }
  if (forceAllOff) hideVisorOnlyLabels(map);
}

function applyOverlayLabelSpec(map, overlayKey) {
  const labelDef = getOverlayLabelDef(overlayKey);
  if (!labelDef || !map) return;
  const labelId = overlayLabelLayerId(`ly-${overlayKey}`);
  if (!map.getLayer(labelId)) return;
  clearVisorOpacityBaseCacheForLayer(labelId);
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
  const minZ = labelDef.minzoom ?? 0;
  try {
    map.setLayerZoomRange(labelId, minZ, 24);
  } catch {
    /* noop */
  }
  reapplyVisorThematicOpacityToMap(map);
}

function applyOverlayLabelTheme(map) {
  if (!map) return;
  const labelKeys = new Set([
    ...Object.keys(OVERLAY_LABEL_BY_KEY),
    ...Object.keys(_visorCatalogLabelByKey),
  ]);
  for (const key of labelKeys) {
    applyOverlayLabelSpec(map, key);
  }
  for (const key of Object.keys(VISOR_ONLY_LABEL_SPECS)) {
    applyVisorOnlyLabelSpec(map, key);
  }
  reapplyVisorThematicOpacityToMap(map);
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
  let key = layerId.slice(3);
  if (key.endsWith("-labels")) key = key.slice(0, -7);
  const tieredKey = resolveTieredOverlayKey(key);
  if (tieredKey) return tieredKey;
  if (isDenueOverlayKey(key)) return key;
  return hasOverlayLabelDef(key) ? key : null;
}

function overlayDefFromLayerId(layerId) {
  if (!layerId?.startsWith("ly-")) return null;
  let key = layerId.slice(3);
  if (key.endsWith("-labels")) key = key.slice(0, -7);
  if (key.endsWith("-halo")) key = key.replace(/-halo$/, "");
  if (key.endsWith("-fill")) key = key.replace(/-fill$/, "");
  return findOverlayDefByKey(key);
}

function ensureOverlayLabelLayer(map, def) {
  const labelDef = getOverlayLabelDef(def.key);
  if (!labelDef) return;
  ensureMapGlyphs(map);
  const layerId = `ly-${def.key}`;
  const labelId = overlayLabelLayerId(layerId);
  const active = !!_overlayActive[def.key];
  if (def.key === "colonias") {
    if (active) {
      ensureColoniasLabelLayer(map, labelDef, overlayLabelPaintForTheme);
      applyOverlayLabelSpec(map, "colonias");
    }
    return;
  }
  if (def.key === "locsAtlas") {
    if (active) {
      ensureLocsAtlasLabelLayer(map, labelDef, overlayLabelPaintForTheme);
      applyOverlayLabelSpec(map, "locsAtlas");
    }
    return;
  }
  const src = `src-${def.table}`;
  addMartinSource(map, src, def.table);
  if (map.getLayer(labelId)) {
    if (active) applyOverlayLabelSpec(map, def.key);
    return;
  }
  map.addLayer({
    id: labelId,
    type: "symbol",
    source: src,
    "source-layer": martinSourceLayer(def.table),
    minzoom: labelDef.minzoom ?? 0,
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

/** Vista estatal del visor: mismo aspecto que Explorador municipal (líneas finas, sin relleno municipal). */
function applyVisorStateWideRenderQuality(map) {
  applyHomeVectorRenderQuality(map);
  if (!map?.getLayer(LAYER_IDS.munAllFill)) return;
  try {
    map.setPaintProperty(LAYER_IDS.munAllFill, "fill-opacity", 0);
    map.setPaintProperty(LAYER_IDS.munAllFill, "fill-outline-color", "rgba(0, 0, 0, 0)");
  } catch {
    /* noop */
  }
}

let _visorStateWideFitGen = 0;

/** Encuadra Guerrero al activar vista estatal (misma lógica que refitHomeMapView). */
function refitVisorStateWideView(map) {
  if (!map || !_visorStateWideMode) return;
  const gen = ++_visorStateWideFitGen;
  clearMapViewConstraints();
  map.resize();
  map.fitBounds(MXSIG_BOUNDS, {
    padding: HOME_MAP_FIT_PADDING,
    maxZoom: 8,
    duration: 900,
    animate: true,
  });
  map.once("moveend", () => {
    if (gen !== _visorStateWideFitGen || !_visorStateWideMode) return;
    clearMapViewConstraints();
  });
}

function resetVisorThematicLayerFlags() {
  allOverlayDefs().forEach((d) => {
    _overlayActive[d.key] = false;
  });
  for (const key of Object.keys(_visorSharedActive)) {
    _visorSharedActive[key] = false;
  }
  _usoSueloActive = false;
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
    ["gm-mun-fill", HOME_MUN_DISP_FILL_PAINT],
    ["gm-mun-line-halo", HOME_MUN_DISP_LINE_HALO_PAINT],
    ["gm-mun-line", HOME_MUN_DISP_LINE_PAINT],
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

/** Opciones de mapa base disponibles en el visor (comparador y selector). */
export const VISOR_BASEMAP_CHOICES = [
  { key: "osm", label: "OpenStreetMap", short: "OSM" },
  { key: "inegi", label: "Mapa base INEGI", short: "INEGI" },
  { key: "sat", label: "Imagen satelital Esri", short: "Satélite" },
  { key: "local", label: "Mapa base local (MBTiles)", short: "Local" },
];

function normalizeBaseKind(kind) {
  return kind === "sat" || kind === "inegi" || kind === "local" ? kind : "osm";
}

function applyBaseVisibilityOnMap(map, kind) {
  if (!map) return;
  const normalized = normalizeBaseKind(kind);
  BASE_LAYER_IDS.forEach((id) => {
    const on = id === `base-${normalized}`;
    safeSetLayout(map, id, "visibility", on ? "visible" : "none");
  });
  setLocalBasemapVisible(map, normalized === "local");
}

/**
 * Aplica un mapa base en cualquier instancia MapLibre (p. ej. mapa del comparador).
 * No modifica `_activeBase` del mapa principal.
 * @param {import("maplibre-gl").Map} map
 * @param {string} kind
 * @returns {Promise<boolean>}
 */
export async function applyMapInstanceBaseLayer(map, kind) {
  if (!map) return false;
  const normalized = normalizeBaseKind(kind);
  ensureBaseLayers(map);

  if (normalized === "local") {
    const ok = await ensureLocalBasemap(map);
    if (!ok) {
      applyBaseVisibilityOnMap(map, "osm");
      return false;
    }
    // OSM Bright recarga sprite/glyphs y puede borrar iconos addImage de capas symbol.
    invalidateOverlaySymbolIconsOnMap(map);
  } else {
    setLocalBasemapVisible(map, false);
  }

  applyBaseVisibilityOnMap(map, normalized);
  return true;
}

export function getActiveMapBase() {
  return _activeBase;
}

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
let _geoViewLock = false;
let _homeHighlightCve = null;
let _interactionLocked = false;
let _focusCve = null;
let _lastFocusProfile = "default";
let _municipioFocusGen = 0;
/** Visor geográfico: sin filtro CVE_MUN (capas a nivel estatal). */
let _visorStateWideMode = false;
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

const OVERLAY_DEFS = [];

/** Overlays generados desde presets genéricos (fase C — visorStyleRegistry). */
let _visorDynamicOverlayDefs = [];
/** @type {Set<string>} */
let _visorPrevDynamicKeys = new Set();

function allOverlayDefs() {
  return OVERLAY_DEFS.concat(_visorDynamicOverlayDefs);
}

function resolveTieredOverlayKey(key) {
  const m = key.match(/^(.+)-(estatal|troncal|warm)$/);
  if (!m) return null;
  const def = allOverlayDefs().find((d) => d.key === m[1] && d.rncTiered);
  return def ? m[1] : null;
}

function findOverlayDefByKey(key) {
  const tiered = resolveTieredOverlayKey(key);
  if (tiered) return allOverlayDefs().find((d) => d.key === tiered) ?? null;
  return allOverlayDefs().find((d) => d.key === key) ?? null;
}

function removeOverlayMapLayersForKey(map, overlayKey) {
  if (!map) return;
  const lid = `ly-${overlayKey}`;
  for (const id of collectOverlayLayerIds(map, lid)) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* noop */
    }
  }
}

export function hasVisorOverlayDef(key) {
  return allOverlayDefs().some((d) => d.key === key);
}

export function isBuiltinOverlayKey(key) {
  return OVERLAY_DEFS.some((d) => d.key === key);
}

export function registerVisorDynamicOverlayDefs(defs) {
  const next = Array.isArray(defs) ? defs.slice() : [];
  const nextKeys = new Set(next.map((d) => d.key));
  if (_map?.isStyleLoaded?.()) {
    for (const oldKey of _visorPrevDynamicKeys) {
      if (!nextKeys.has(oldKey)) {
        forceOverlayGroupOff(_map, oldKey);
        removeOverlayMapLayersForKey(_map, oldKey);
        delete _overlayActive[oldKey];
      }
    }
  }
  _visorDynamicOverlayDefs = next;
  _visorPrevDynamicKeys = nextKeys;
}

export function remountVisorDynamicOverlayLayers() {
  const map = _map;
  if (!map?.isStyleLoaded?.()) return;
  for (const def of _visorDynamicOverlayDefs) {
    removeOverlayMapLayersForKey(map, def.key);
    if (!overlayNeedsIconBootstrap(def)) {
      ensureOverlayLayer(map, def);
    }
  }
  syncOverlayLayersFromState(map, resolveVisorOverlayCve(_focusCve));
}

function overlayNeedsIconBootstrap(def) {
  return def.type === "symbol";
}

function ensureOverlayLayersExceptSymbols(map) {
  for (const def of allOverlayDefs()) {
    if (!overlayNeedsIconBootstrap(def)) ensureOverlayLayer(map, def);
  }
}

function getTieredOverlayDefs() {
  return allOverlayDefs().filter((d) => d.rncTiered);
}

/** Capas composite por zoom (estatal / troncal / detalle). */
function tieredOverlayLayerIds(map, baseKey) {
  const out = [];
  for (const suffix of ["-estatal-halo", "-estatal", "-troncal-halo", "-troncal", "-warm", "-halo", ""]) {
    const id = suffix ? `ly-${baseKey}${suffix}` : `ly-${baseKey}`;
    if (map.getLayer(id)) out.push(id);
  }
  return out;
}

function tierSuffixFromLayerId(layerId, baseKey) {
  const prefix = `ly-${baseKey}`;
  if (layerId === `${prefix}-warm`) return "warm";
  if (layerId.startsWith(`${prefix}-estatal`)) return "-estatal";
  if (layerId.startsWith(`${prefix}-troncal`)) return "-troncal";
  if (layerId === prefix || layerId === `${prefix}-halo`) return "";
  return null;
}

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

/** Zoom mínimo para el letrerito del visor (solo si la geometría no se pinta antes). */
const VISOR_SHARED_LAYER_MIN_ZOOM = {
  hidro_cuerpos: HCUERPOS_LABEL_MIN_ZOOM,
};

const VISOR_ONLY_LABEL_SPECS = {
  hidro_corrientes: {
    labelId: "ly-hidro-visor-labels",
    sourceId: "src-hcorrientes",
    table: MARTIN_TABLES.hcorrientes,
    minzoom: HCORRIENTES_LABEL_MIN_ZOOM,
    layout: HCORRIENTES_LABEL_LAYOUT,
    paint: HCORRIENTES_LABEL_PAINT,
    paintClaro: HCORRIENTES_LABEL_PAINT_CLARO,
  },
  hidro_cuerpos: {
    labelId: "ly-hcuerpos-visor-labels",
    sourceId: "src-hcuerpos",
    table: MARTIN_TABLES.hcuerpos,
    minzoom: HCUERPOS_LABEL_MIN_ZOOM,
    layout: HCUERPOS_LABEL_LAYOUT,
    paint: HCUERPOS_LABEL_PAINT,
    paintClaro: HCUERPOS_LABEL_PAINT_CLARO,
  },
};

const _visorSharedActive = {
  hidro_corrientes: false,
  hidro_cuerpos: false,
  curvas_nivel: false,
};
const _visorSharedKeyGen = Object.create(null);

function pad3(cve) {
  const n = String(cve ?? "").replace(/\D/g, "");
  return n.length >= 3 ? n.slice(-3) : ("000" + n).slice(-3);
}

/** Expresión MapLibre: feature del municipio activo (cve_mun, cve_ent+cve_mun, cvegeo). */
function munFilterExpr(cve) {
  const p = pad3(cve || "001");
  const n = String(parseInt(p, 10));
  const nNum = parseInt(p, 10);
  const cvegeo5 = `12${p}`;
  const raw = ["coalesce", ["get", "cve_mun"], ["get", "CVE_MUN"]];
  const str = ["to-string", ["coalesce", raw, ""]];
  const munPad = [
    "concat",
    ["slice", "000", 0, ["max", 0, ["-", 3, ["length", str]]]],
    str,
  ];
  const entStr = ["to-string", ["coalesce", ["get", "cve_ent"], ["get", "CVE_ENT"], "12"]];
  return [
    "any",
    ["==", str, p],
    ["==", str, n],
    ["==", munPad, p],
    ["==", ["to-number", ["coalesce", raw, "-1"]], nNum],
    ["==", ["concat", entStr, munPad], cvegeo5],
    ["==", ["to-string", ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""]], cvegeo5],
  ];
}

function munFilter(cve) {
  return munFilterExpr(cve);
}

function resolveVisorOverlayCve(explicitCve) {
  if (_visorStateWideMode) return null;
  if (explicitCve != null && String(explicitCve).trim() !== "") return pad3(explicitCve);
  return _focusCve ? pad3(_focusCve) : "001";
}

function applyOverlayLayerMunFilter(map, layerId, visible, cve) {
  if (!map?.getLayer(layerId) || !visible || isOverlayGeoLabelLayer(layerId)) return;
  const def = overlayDefFromLayerId(layerId);
  if (def?.skipMunFilter) {
    map.setFilter(layerId, null);
    return;
  }
  if (def?.rncTiered) {
    const tierSuffix = tierSuffixFromLayerId(layerId, def.key);
    if (tierSuffix === "warm") {
      if (_visorStateWideMode) {
        map.setFilter(layerId, null);
      } else if (cve) {
        map.setFilter(layerId, munFilter(cve));
      }
      return;
    }
    if (tierSuffix != null) {
      const parts = [];
      if (!_visorStateWideMode && cve) parts.push(munFilter(cve));
      if (tierSuffix === "-estatal" || tierSuffix === "-troncal") {
        const tier = def.rncTiers?.find((t) => t.suffix === tierSuffix);
        if (tier?.filterValues?.length) {
          parts.push(
            fieldValueMatchFilter(def.rncFilterField || "tipo_vial", tier.filterValues),
          );
        }
      }
      if (!parts.length) {
        map.setFilter(layerId, null);
      } else if (parts.length === 1) {
        map.setFilter(layerId, parts[0]);
      } else {
        map.setFilter(layerId, ["all", ...parts]);
      }
      return;
    }
  }
  const defCodigo = def;
  try {
    if (defCodigo?.codigoAct?.length) {
      const parts = [];
      if (!_visorStateWideMode && cve) parts.push(munFilter(cve));
      parts.push(codigoActFilter(defCodigo.codigoAct));
      map.setFilter(layerId, parts.length === 1 ? parts[0] : ["all", ...parts]);
      return;
    }
    if (_visorStateWideMode) {
      map.setFilter(layerId, null);
    } else if (cve) {
      map.setFilter(layerId, munFilter(cve));
    }
  } catch {
    /* noop */
  }
}

export function getVisorStateWideMode() {
  return _visorStateWideMode;
}

function applyVisorStateWideChrome(map) {
  if (!map) return;
  if (_visorStateWideMode) {
    invalidateMunicipioMapFocus();
    setMunicipioOutlineOnly(map, null, false);
    setMunicipioHighlightVisible(map, null, false);
    hideLegacyMunHiLayers(map);
    safeSetLayout(map, LAYER_IDS.marcoMun, "visibility", "none");
    migrateHomeMunLineStackFromDisp(map);
    ensureHomeGeometryStack(map);
    safeSetLayout(map, LAYER_IDS.entFill, "visibility", "visible");
    safeSetLayout(map, LAYER_IDS.marcoEntCasing, "visibility", "none");
    safeSetLayout(map, LAYER_IDS.marcoEntHalo, "visibility", "visible");
    safeSetLayout(map, LAYER_IDS.marcoEnt, "visibility", "visible");
    safeSetLayout(map, LAYER_IDS.munAllFill, "visibility", "none");
    safeSetLayout(map, LAYER_IDS.munAllLineHalo, "visibility", "visible");
    safeSetLayout(map, LAYER_IDS.munAllLine, "visibility", "visible");
    stackHomeLayers(map);
    applyVisorStateWideRenderQuality(map);
    bringMarcoEntToFront(map);
    refitVisorStateWideView(map);
    return;
  }
  _visorStateWideFitGen += 1;
  safeSetLayout(map, LAYER_IDS.entFill, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.marcoEntCasing, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.marcoEntHalo, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.marcoEnt, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munAllFill, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munAllLineHalo, "visibility", "none");
  safeSetLayout(map, LAYER_IDS.munAllLine, "visibility", "none");
  if (!_focusCve) return;
  if (isOutlineOnlyProfile(_lastFocusProfile)) {
    setMunicipioOutlineOnly(map, _focusCve, true);
  } else {
    setMunicipioOutlineOnly(map, null, false);
    setMunicipioHighlightVisible(map, _focusCve, false);
    safeSetLayout(map, LAYER_IDS.marcoMun, "visibility", "visible");
  }
  const fitProfile = MUNICIPIO_FOCUS_PROFILES[_lastFocusProfile] || MUNICIPIO_FOCUS_PROFILES.visor;
  void fitToMunicipio(map, _focusCve, {
    padding: fitProfile.padding,
    maxZoom: fitProfile.maxZoom,
    duration: fitProfile.duration ?? 900,
    animate: true,
  });
}

/** Activa o desactiva la vista estatal del visor (sin filtro por municipio en capas temáticas). */
export function setVisorStateWideMode(active) {
  const on = Boolean(active);
  if (_visorStateWideMode === on) return;
  _visorStateWideMode = on;

  const apply = (map) => {
    resetVisorThematicLayerFlags();
    hideVisorThematicLayersOnMap(map);
    applyVisorStateWideChrome(map);
    syncOverlayLayersFromState(map, on ? null : resolveVisorOverlayCve(_focusCve));
    notifyVisorOverlaysChanged();
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("atlasgro-visor-statewide-change", { detail: { active: on } }),
      );
    }
  };

  if (_map && _atlasLayersReady && _map.isStyleLoaded()) {
    apply(_map);
    return;
  }
  whenAtlasMapReady(apply);
}

/** Expresión MapLibre: feature del municipio activo (misma lógica que munFilter). */
function munMatchExpr(cve) {
  return munFilterExpr(cve);
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

/**
 * Segundo mapa MapLibre para maplibre-gl-compare.
 * Por defecto usa estilo mínimo (más rápido y estable); las capas se sincronizan después.
 */
export function createCompareMapInstance(containerEl, styleSnapshot, viewState, options = {}) {
  const ml = getMaplibregl();
  if (!ml) throw new Error("maplibre-gl no está cargado.");
  const minimal = options.minimal === true;
  let style;
  if (!minimal && styleSnapshot && typeof styleSnapshot === "object") {
    style = { ...styleSnapshot };
    const glyphs = style.glyphs;
    if (
      typeof glyphs === "string" &&
      (glyphs.includes("/basemap/fonts") || glyphs === "{fontstack}/{range}.pbf")
    ) {
      style.glyphs = MAPLIBRE_GLYPHS_URL;
    }
  }
  const mapOptions = {
    center: viewState.center,
    zoom: viewState.zoom,
    bearing: viewState.bearing,
    pitch: viewState.pitch,
    maxZoom: 22,
    interactive: true,
    attributionControl: false,
  };
  if (style) mapOptions.style = style;
  return new ml.Map(buildAtlasMapOptions(containerEl, mapOptions));
}

/** Tooltips hover en cualquier instancia MapLibre (p. ej. mapa del comparador). */
export function bindAtlasOverlayTips(map) {
  if (!map) return;
  refreshOverlayTipBindings(map, overlayLayerIds);
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
  fitMapToMartinSource(map, SRC_ENT, SL_ENT(), {
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
  const hideZoom = Boolean(_homeMode || _geoViewLock);
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

/** Relleno municipal del Explorador: c_mun (misma fuente que líneas; v_c_mun_disp puede fallar tras restore). */
function migrateHomeMunFillFromDisp(map) {
  const fillId = LAYER_IDS.munAllFill;
  if (!map.getLayer(fillId)) return;
  const styleLayer = map.getStyle()?.layers?.find((l) => l.id === fillId);
  if (styleLayer?.source === SRC_MUN) return;
  const vis = map.getLayoutProperty(fillId, "visibility") || "none";
  const paint = _homeMode ? HOME_MUN_DISP_FILL_PAINT : LAYER_PAINT.munAllFill;
  const beforeId = map.getLayer(LAYER_IDS.munAllLineHalo)?.id;
  try {
    map.removeLayer(fillId);
  } catch {
    return;
  }
  const spec = {
    id: fillId,
    type: "fill",
    source: SRC_MUN,
    "source-layer": SL_MUN(),
    paint,
    layout: { visibility: vis },
  };
  if (beforeId) map.addLayer(spec, beforeId);
  else map.addLayer(spec);
}

function ensureHomeMunGeometryStack(map) {
  migrateHomeMunLineStackFromDisp(map);
  migrateHomeMunFillFromDisp(map);
}

/** Contorno estatal del Explorador: c_ent (v_c_ent_disp puede quedar vacía tras restore). */
function migrateHomeEntStackFromDisp(map) {
  const marcoId = LAYER_IDS.marcoEnt;
  if (!map.getLayer(marcoId)) return;
  const styleLayer = map.getStyle()?.layers?.find((l) => l.id === marcoId);
  if (styleLayer?.source === SRC_ENT) return;

  const entVis = map.getLayoutProperty(LAYER_IDS.entFill, "visibility") || "none";
  const marcoVis =
    map.getLayoutProperty(LAYER_IDS.marcoEntHalo, "visibility") ||
    map.getLayoutProperty(marcoId, "visibility") ||
    "visible";

  if (map.getLayer(LAYER_IDS.entFill)) map.removeLayer(LAYER_IDS.entFill);
  for (const id of [LAYER_IDS.marcoEntCasing, LAYER_IDS.marcoEntHalo, marcoId]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }

  const beforeMun = map.getLayer(LAYER_IDS.munAllFill)?.id;
  const entSpec = {
    id: LAYER_IDS.entFill,
    type: "fill",
    source: SRC_ENT,
    "source-layer": SL_ENT(),
    paint: LAYER_PAINT.entFill,
    layout: { visibility: entVis },
  };
  if (beforeMun) map.addLayer(entSpec, beforeMun);
  else map.addLayer(entSpec);

  addEntLineStack(map, marcoVis);
}

function ensureHomeEntGeometryStack(map) {
  migrateHomeEntStackFromDisp(map);
}

function ensureHomeGeometryStack(map) {
  ensureHomeMunGeometryStack(map);
  ensureHomeEntGeometryStack(map);
}

function addEntLineStack(map, visibility = "visible") {
  const layout = { visibility, ...LINE_LAYOUT_SMOOTH };
  if (!map.getLayer(LAYER_IDS.marcoEntCasing)) {
    map.addLayer({
      id: LAYER_IDS.marcoEntCasing,
      type: "line",
      source: SRC_ENT,
      "source-layer": SL_ENT(),
      paint: LAYER_PAINT.marcoEntLineCasing,
      layout,
    });
  }
  if (!map.getLayer(LAYER_IDS.marcoEntHalo)) {
    map.addLayer({
      id: LAYER_IDS.marcoEntHalo,
      type: "line",
      source: SRC_ENT,
      "source-layer": SL_ENT(),
      paint: LAYER_PAINT.marcoEntLineHalo,
      layout,
    });
  }
  if (!map.getLayer(LAYER_IDS.marcoEnt)) {
    map.addLayer({
      id: LAYER_IDS.marcoEnt,
      type: "line",
      source: SRC_ENT,
      "source-layer": SL_ENT(),
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
  migrateHomeMunFillFromDisp(map);
  migrateHomeEntStackFromDisp(map);

  if (!map.getLayer(LAYER_IDS.munAllFill)) {
    map.addLayer({
      id: LAYER_IDS.munAllFill,
      type: "fill",
      source: SRC_MUN,
      "source-layer": sl,
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
      source: SRC_ENT,
      "source-layer": SL_ENT(),
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
        source: SRC_ENT,
        "source-layer": SL_ENT(),
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
  const baseKey = layerId.startsWith("ly-") ? layerId.slice(3) : null;
  const tieredDef = baseKey ? findOverlayDefByKey(baseKey) : null;
  if (tieredDef?.rncTiered) {
    const ids = tieredOverlayLayerIds(map, tieredDef.key);
    if (ids.length) return ids;
  }
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

function overlayUsesLegacyCircle(def, map) {
  if (def.key === "locsPunto") return locsPuntoLayerUsesLegacyCircle(map);
  if (def.key === "clues") return cluesLayerUsesLegacyCircle(map);
  return false;
}

/** Tras cambio de tabla Martin, recrear capa/fuente CLUES y borrar fuentes huérfanas (p. ej. src-c_clues2). */
function migrateCluesSourceTable(map, def) {
  if (def.key !== "clues") return;
  const layerId = "ly-clues";
  const expectedSrc = `src-${def.table}`;
  const layer = map.getStyle()?.layers?.find((l) => l.id === layerId);

  if (layer && layer.source !== expectedSrc) {
    const oldSrc = layer.source;
    const labelId = overlayLabelLayerId(layerId);
    try {
      if (map.getLayer(labelId)) map.removeLayer(labelId);
    } catch {
      /* noop */
    }
    try {
      map.removeLayer(layerId);
    } catch {
      /* noop */
    }
    try {
      if (oldSrc && map.getSource(oldSrc)) map.removeSource(oldSrc);
    } catch {
      /* noop */
    }
  }

  for (const sid of ["src-c_clues2", "src-c_clues"]) {
    if (sid === expectedSrc) continue;
    const inUse = map.getStyle()?.layers?.some((l) => l.source === sid);
    if (!inUse && map.getSource(sid)) {
      try {
        map.removeSource(sid);
      } catch {
        /* noop */
      }
    }
  }
}

function overlaySymbolIconLoader(def) {
  if (def.visorIconKeys?.length) {
    const keys = def.visorIconKeys;
    return async (map) => {
      await Promise.all(keys.map((iconKey) => ensureVisorIconKeyOnMap(map, iconKey)));
    };
  }
  if (def.visorIconKey) {
    const iconKey = def.visorIconKey;
    return (map) => ensureVisorIconKeyOnMap(map, iconKey);
  }
  return async () => {};
}

/** Invalida caché de iconos symbol (p. ej. tras setSprite del mapa base local). */
export function invalidateOverlaySymbolIconsOnMap(map) {
  if (!map) return;
  invalidateVisorIconRegistryOnMap(map);
  delete map.__atlasDenueIconsVersion;
}

/** Vuelve a registrar iconos symbol tras invalidar (mapa local / comparador). */
export function rebootstrapOverlaySymbolIconsOnMap(map) {
  invalidateOverlaySymbolIconsOnMap(map);
  return ensureOverlaySymbolIconsOnMap(map);
}

/** Registra en el mapa los sprites SVG de overlays symbol (comparador, clon de estilo). */
function ensureOverlaySymbolIconsOnMap(map) {
  if (!map) return Promise.resolve();
  const loaders = new Set();
  for (const def of allOverlayDefs()) {
    if (!overlayNeedsIconBootstrap(def)) continue;
    loaders.add(overlaySymbolIconLoader(def));
  }
  return Promise.all(
    [...loaders].map((load) =>
      load(map).catch((err) => {
        console.warn("[map] iconos symbol en mapa secundario:", err);
      }),
    ),
  );
}

/** Quita capas symbol clonadas del estilo (el comparador las recrea con iconos propios). */
function stripClonedSymbolOverlayLayers(map) {
  if (!map || map === _map) return;
  for (const def of allOverlayDefs()) {
    if (!overlayNeedsIconBootstrap(def) || def.type !== "symbol") continue;
    const layerId = `ly-${def.key}`;
    for (const id of collectOverlayLayerIds(map, layerId)) {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch {
        /* noop */
      }
    }
  }
}

/** Recrea capas symbol en el mapa secundario (tras registrar iconos con addImage). */
function rebuildSymbolOverlayLayersOnMap(map) {
  if (!map || map === _map) return;
  for (const def of allOverlayDefs()) {
    if (!overlayNeedsIconBootstrap(def) || def.type !== "symbol") continue;
    const src = `src-${def.table}`;
    const layerId = `ly-${def.key}`;
    if (def.key === "clues") migrateCluesSourceTable(map, def);
    addMartinSource(map, src, def.table);
    const spec = {
      source: src,
      "source-layer": martinSourceLayer(def.table),
      filter: munFilter("001"),
    };
    if (def.minzoom != null) spec.minzoom = def.minzoom;
    if (map.getLayer(layerId)) continue;
    map.addLayer({
      ...spec,
      id: layerId,
      layout: { visibility: "none", ...(def.layout || {}) },
      type: "symbol",
      paint: def.paint || {},
    });
  }
}

function finishSymbolOverlayActivation(map, def, layerId, keyGenAtStart) {
  if (keyGenAtStart !== _overlayKeyGen[def.key]) return;
  if (!_overlayActive[def.key]) {
    forceOverlayGroupOff(map, def.key);
    return;
  }
  setLayerVisible(map, layerId, true, resolveVisorOverlayCve(_focusCve));
  ensureOverlayLabelLayer(map, def);
  if (map !== _map && _map?.isStyleLoaded?.()) {
    copyVisorOverlayRuntime(_map, map);
    reapplyVisorThematicOpacityToMap(map);
  }
  refreshOverlayTipBindings(map, overlayLayerIds);
  notifyVisorOverlaysChanged();
}

function ensureTieredOverlayLayers(map, def) {
  const src = `src-${def.table}`;
  const layerId = `ly-${def.key}`;
  const estatalId = `${layerId}-estatal`;
  const troncalId = `${layerId}-troncal`;
  const warmId = `${layerId}-warm`;
  const troncalMin = def.rncZoom?.troncalMin ?? RNC_TRONCAL_MIN_ZOOM;
  const detailMin = def.rncZoom?.detailMin ?? RNC_DETAIL_MIN_ZOOM;
  addMartinSource(map, src, def.table);
  const baseSpec = {
    source: src,
    "source-layer": martinSourceLayer(def.table),
  };
  const lineLayout = { visibility: "none", ...LINE_LAYOUT_SMOOTH };
  const estatalSpec = {
    ...baseSpec,
    minzoom: 0,
    maxzoom: troncalMin,
  };
  const troncalSpec = {
    ...baseSpec,
    minzoom: troncalMin,
    maxzoom: detailMin,
  };
  const detailSpec = {
    ...baseSpec,
    minzoom: detailMin,
  };

  const addLinePair = (id, spec) => {
    if (!map.getLayer(`${id}-halo`)) {
      map.addLayer({
        ...spec,
        id: `${id}-halo`,
        type: "line",
        paint: def.paintHalo,
        layout: lineLayout,
      });
    }
    if (!map.getLayer(id)) {
      map.addLayer({
        ...spec,
        id,
        type: "line",
        paint: def.paint,
        layout: lineLayout,
      });
    }
  };

  addLinePair(estatalId, estatalSpec);
  addLinePair(troncalId, troncalSpec);
  addLinePair(layerId, detailSpec);

  if (!map.getLayer(warmId)) {
    map.addLayer({
      ...baseSpec,
      id: warmId,
      type: "line",
      minzoom: 0,
      paint: { "line-opacity": 0, "line-width": 0.1 },
      layout: lineLayout,
    });
  }
  return layerId;
}

function ensureOverlayLayer(map, def) {
  const src = `src-${def.table}`;
  const layerId = `ly-${def.key}`;
  if (def.rncTiered) {
    return ensureTieredOverlayLayers(map, def);
  }
  if (def.key === "clues") migrateCluesSourceTable(map, def);
  if (overlayUsesLegacyCircle(def, map)) {
    try {
      map.removeLayer(layerId);
    } catch {
      /* capa aún no lista */
    }
  }
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
      if (_overlayActive[def.key]) ensureOverlayLabelLayer(map, def);
      return layerId;
    }
  } else if (map.getLayer(layerId)) {
    if (_overlayActive[def.key]) {
      ensureOverlayLabelLayer(map, def);
      if (overlayNeedsIconBootstrap(def)) {
        const keyGenAtStart = _overlayKeyGen[def.key] || 0;
        void overlaySymbolIconLoader(def)(map)
          .then(() => finishSymbolOverlayActivation(map, def, layerId, keyGenAtStart))
          .catch((err) => {
            console.warn("[map] iconos overlay", def.key, err);
          });
      }
    }
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
  } else if (def.type === "symbol") {
    const keyGenAtStart = _overlayKeyGen[def.key] || 0;
    void overlaySymbolIconLoader(def)(map)
      .then(() => {
        if (keyGenAtStart !== _overlayKeyGen[def.key]) {
          if (!_overlayActive[def.key]) forceOverlayGroupOff(map, def.key);
          return;
        }
        if (!map.getLayer(layerId)) {
          map.addLayer({
            ...spec,
            id: layerId,
            layout: { visibility: "none", ...(def.layout || {}) },
            type: "symbol",
            paint: def.paint || {},
          });
        }
        finishSymbolOverlayActivation(map, def, layerId, keyGenAtStart);
      })
      .catch((err) => {
        console.warn("[map] iconos overlay", def.key, err);
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
  if (_overlayActive[def.key]) ensureOverlayLabelLayer(map, def);
  return layerId;
}

function hideVisorThematicLayersOnMap(map) {
  if (!map) return;
  ensureThematicMartinLayers(map);
  syncOverlayLayersFromState(map, null, { forceAllOff: true });
  const c = pad3(_focusCve || "001");
  setLayerVisible(map, "ly-clima", false, c);
}

/** Apaga todas las sub-capas de un overlay temático. */
function forceOverlayGroupOff(map, overlayKey) {
  if (!map) return;
  const lid = `ly-${overlayKey}`;
  const emptyFilter = ["literal", false];
  for (const id of collectOverlayLayerIds(map, lid)) {
    if (!map.getLayer(id)) continue;
    try {
      map.setLayoutProperty(id, "visibility", "none");
      map.setFilter(id, emptyFilter);
    } catch {
      /* noop */
    }
  }
}

function forceLayerGroupOff(map, layerId) {
  if (!map) return;
  const emptyFilter = ["literal", false];
  for (const id of collectOverlayLayerIds(map, layerId)) {
    if (!map.getLayer(id)) continue;
    try {
      map.setLayoutProperty(id, "visibility", "none");
      map.setFilter(id, emptyFilter);
    } catch {
      /* noop */
    }
  }
}

function copyLayerGroupRuntime(fromMap, toMap, layerId, mun, emptyFilter) {
  for (const id of collectOverlayLayerIds(fromMap, layerId)) {
    if (!toMap.getLayer(id)) continue;
    try {
      const vis = fromMap.getLayoutProperty(id, "visibility") ?? "none";
      toMap.setLayoutProperty(id, "visibility", vis);
      if (vis === "visible") {
        const filter = fromMap.getFilter(id);
        if (filter != null) {
          toMap.setFilter(id, filter);
        } else if (mun) {
          toMap.setFilter(id, munFilter(mun));
        } else {
          try {
            toMap.setFilter(id, null);
          } catch {
            /* noop */
          }
        }
      } else {
        toMap.setFilter(id, emptyFilter);
      }
    } catch {
      /* noop */
    }
  }
}

/** Copia visibilidad/filtros runtime del mapa principal al clon del comparador. */
export function copyVisorOverlayRuntime(fromMap, toMap) {
  if (!fromMap || !toMap || fromMap === toMap) return;
  const emptyFilter = ["literal", false];
  const mun = resolveVisorOverlayCve(_focusCve);

  for (const d of allOverlayDefs()) {
    if (!_overlayActive[d.key]) {
      forceOverlayGroupOff(toMap, d.key);
      continue;
    }
    const lid = `ly-${d.key}`;
    for (const id of collectOverlayLayerIds(fromMap, lid)) {
      if (!toMap.getLayer(id)) continue;
      try {
        const vis = fromMap.getLayoutProperty(id, "visibility") ?? "none";
        toMap.setLayoutProperty(id, "visibility", vis);
        if (vis === "visible") {
          const filter = fromMap.getFilter(id);
          if (filter != null) {
            toMap.setFilter(id, filter);
          } else if (mun) {
            toMap.setFilter(id, munFilter(mun));
          } else {
            try {
              toMap.setFilter(id, null);
            } catch {
              /* noop */
            }
          }
        } else {
          toMap.setFilter(id, emptyFilter);
        }
      } catch {
        /* noop */
      }
    }
  }

  for (const key of Object.keys(_visorSharedActive)) {
    if (!_visorSharedActive[key]) {
      if (key === "hidro_corrientes") forceLayerGroupOff(toMap, HIDRO_CORRIENTES_ID);
      else if (key === "hidro_cuerpos") forceLayerGroupOff(toMap, HIDRO_CUERPOS_ID);
      else if (key === "curvas_nivel") setCurnivelLayersVisible(toMap, false, mun);
      setVisorOnlyLabelVisible(toMap, key, false, null);
      continue;
    }
    if (key === "hidro_corrientes") {
      copyLayerGroupRuntime(fromMap, toMap, HIDRO_CORRIENTES_ID, mun, emptyFilter);
      setVisorOnlyLabelVisible(toMap, key, true, mun);
    } else if (key === "hidro_cuerpos") {
      copyLayerGroupRuntime(fromMap, toMap, HIDRO_CUERPOS_ID, mun, emptyFilter);
      setVisorOnlyLabelVisible(toMap, key, true, mun);
    } else if (key === "curvas_nivel") {
      const vis =
        fromMap.getLayer(CURNIVEL_LAYERS.base) &&
        fromMap.getLayoutProperty(CURNIVEL_LAYERS.base, "visibility") === "visible";
      setCurnivelLayersVisible(toMap, vis, mun);
    }
  }

  const usoId = MARTIN_USO_SUELO.layerId;
  if (toMap.getLayer(usoId)) {
    try {
      if (!_usoSueloActive) {
        toMap.setLayoutProperty(usoId, "visibility", "none");
        toMap.setFilter(usoId, emptyFilter);
      } else if (fromMap.getLayer(usoId)) {
        const vis = fromMap.getLayoutProperty(usoId, "visibility") ?? "none";
        toMap.setLayoutProperty(usoId, "visibility", vis);
        if (vis === "visible") {
          const filter = fromMap.getFilter(usoId);
          if (filter != null) toMap.setFilter(usoId, filter);
        } else {
          toMap.setFilter(usoId, emptyFilter);
        }
      }
    } catch {
      /* noop */
    }
  }
}

/** Alinea capas temáticas del visor con `_overlayActive` / `_usoSueloActive`. */
function syncOverlayLayersFromState(map, cve, options = {}) {
  if (!map) return;
  const forceAllOff = Boolean(options.forceAllOff);
  const mun = resolveVisorOverlayCve(cve);
  const emptyFilter = ["literal", false];

  for (const d of allOverlayDefs()) {
    const lid = `ly-${d.key}`;
    if (!collectOverlayLayerIds(map, lid).length) continue;
    const on = !forceAllOff && !!_overlayActive[d.key];
    setLayerVisible(map, lid, on, on ? mun : null);
    if (!on) forceOverlayGroupOff(map, d.key);
  }

  if (map.getLayer(MARTIN_USO_SUELO.layerId)) {
    const onUso = !forceAllOff && _usoSueloActive;
    setLayerVisible(map, MARTIN_USO_SUELO.layerId, onUso, onUso ? mun : null);
  }

  syncVisorSharedThematicLayers(map, mun, forceAllOff);

  if (forceAllOff) {
    const geoLabelIds = new Set(overlayGeoLabelLayerIds());
    for (const d of allOverlayDefs()) {
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
  const apply = (map) => {
    syncOverlayLayersFromState(map, resolveVisorOverlayCve(_focusCve));
    notifyVisorOverlaysChanged();
  };
  if (_atlasLayersReady && _map.isStyleLoaded()) {
    apply(_map);
    return;
  }
  whenAtlasMapReady(apply);
}

/**
 * Replica en otra instancia MapLibre (p. ej. mapa INEGI del comparador) el estado
 * de capas temáticas del visor: crea capas faltantes y aplica visibilidad/filtros.
 * @param {import("maplibre-gl").Map} map
 * @returns {Promise<void>}
 */
export function syncVisorOverlayLayersOnMap(map) {
  if (!map) return Promise.resolve();
  const run = () => {
    ensureThematicMartinLayers(map);
    if (map !== _map) {
      stripClonedSymbolOverlayLayers(map);
      rebuildSymbolOverlayLayersOnMap(map);
    }
    for (const def of allOverlayDefs()) {
      if (map !== _map && overlayNeedsIconBootstrap(def) && def.type === "symbol") continue;
      ensureOverlayLayer(map, def);
    }
    for (const key of Object.keys(VISOR_ONLY_LABEL_SPECS)) {
      ensureVisorOnlyLabelLayer(map, key);
    }
    syncOverlayLayersFromState(map, resolveVisorOverlayCve(_focusCve));
    allOverlayDefs().forEach((d) => ensureOverlayLabelLayer(map, d));
    if (map !== _map && _map?.isStyleLoaded?.()) {
      copyVisorOverlayRuntime(_map, map);
      reapplyVisorThematicOpacityToMap(map);
    }
    if (map !== _map) {
      if (!map.__atlasColoniasLabelsBound) {
        bindColoniasLabelsSync(map, coloniasLabelsCtx, munFilter, ensureColoniasLabelsLayer);
        map.__atlasColoniasLabelsBound = true;
      }
      if (!map.__atlasLocsAtlasLabelsBound) {
        bindLocsAtlasLabelsSync(map, locsAtlasLabelsCtx, munFilter, ensureLocsAtlasLabelsLayer);
        map.__atlasLocsAtlasLabelsBound = true;
      }
    }
    refreshOverlayTipBindings(map, overlayLayerIds);
  };
  return new Promise((resolve) => {
    const start = () => {
      if (!map.isStyleLoaded()) {
        map.once("load", start);
        return;
      }
      if (map !== _map) {
        void ensureOverlaySymbolIconsOnMap(map).then(() => {
          if (!map.isStyleLoaded()) {
            resolve();
            return;
          }
          run();
          resolve();
        });
        return;
      }
      run();
      resolve();
    };
    start();
  });
}

/** @type {(() => void) | null} */
let _compareOverlaySyncHook = null;

/** Registra callback síncrono para replicar capas en el mapa INEGI del comparador. */
export function registerCompareOverlaySyncHook(fn) {
  _compareOverlaySyncHook = typeof fn === "function" ? fn : null;
}

/** Opacidad global de capas temáticas activas del visor (1 = opaco, 0 = transparente). */
let _visorThematicOpacityFactor = 1;
const _visorOpacityBaseCache = new Map();

const VISOR_THEMATIC_OPACITY_PROPS = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  raster: ["raster-opacity"],
};

function isMapLayerVisible(map, layerId) {
  if (!map.getLayer(layerId)) return false;
  try {
    return map.getLayoutProperty(layerId, "visibility") === "visible";
  } catch {
    return false;
  }
}

function clearVisorOpacityBaseCacheForLayer(layerId) {
  for (const key of [..._visorOpacityBaseCache.keys()]) {
    if (key.startsWith(`${layerId}|`)) _visorOpacityBaseCache.delete(key);
  }
}

function scaleVisorOpacityExpression(base, factor) {
  if (base == null) return factor;
  if (typeof base === "number") return Math.max(0, Math.min(1, base * factor));
  if (Array.isArray(base)) return ["*", base, factor];
  return base;
}

function getVisorOpacityBase(map, layerId, prop) {
  const key = `${layerId}|${prop}`;
  if (!_visorOpacityBaseCache.has(key)) {
    let val;
    try {
      val = map.getPaintProperty(layerId, prop);
    } catch {
      val = 1;
    }
    _visorOpacityBaseCache.set(key, val ?? 1);
  }
  return _visorOpacityBaseCache.get(key);
}

function collectActiveVisorThematicLayerIds(map) {
  if (!map) return [];
  const ids = new Set();

  for (const d of allOverlayDefs()) {
    if (!_overlayActive[d.key]) continue;
    for (const id of collectOverlayLayerIds(map, `ly-${d.key}`)) {
      if (isMapLayerVisible(map, id)) ids.add(id);
    }
  }

  if (_usoSueloActive) {
    const usoId = MARTIN_USO_SUELO.layerId;
    if (isMapLayerVisible(map, usoId)) ids.add(usoId);
  }

  for (const key of Object.keys(_visorSharedActive)) {
    if (!_visorSharedActive[key]) continue;
    if (key === "hidro_corrientes") {
      for (const id of collectOverlayLayerIds(map, HIDRO_CORRIENTES_ID)) {
        if (isMapLayerVisible(map, id)) ids.add(id);
      }
      const labelId = VISOR_ONLY_LABEL_SPECS.hidro_corrientes?.labelId;
      if (labelId && isMapLayerVisible(map, labelId)) ids.add(labelId);
    } else if (key === "hidro_cuerpos") {
      for (const id of collectOverlayLayerIds(map, HIDRO_CUERPOS_ID)) {
        if (isMapLayerVisible(map, id)) ids.add(id);
      }
      const labelId = VISOR_ONLY_LABEL_SPECS.hidro_cuerpos?.labelId;
      if (labelId && isMapLayerVisible(map, labelId)) ids.add(labelId);
    } else if (key === "curvas_nivel") {
      for (const base of [CURNIVEL_LAYERS.base, CURNIVEL_LAYERS.master]) {
        for (const id of lineLayerIds(base)) {
          if (isMapLayerVisible(map, id)) ids.add(id);
        }
      }
    }
  }

  return [...ids];
}

export function getVisorThematicOpacityFactor() {
  return _visorThematicOpacityFactor;
}

export function countActiveVisorThematicOverlayKeys() {
  let n = Object.values(_overlayActive).filter(Boolean).length;
  if (_usoSueloActive) n += 1;
  n += Object.values(_visorSharedActive).filter(Boolean).length;
  return n;
}

export function setVisorThematicOpacityFactor(factor) {
  const f = Math.max(0, Math.min(1, Number(factor)));
  _visorThematicOpacityFactor = f;
  if (_map?.isStyleLoaded?.()) applyVisorThematicOpacityToMap(_map);
  window.dispatchEvent(new CustomEvent("atlas:visor-opacity-changed", { detail: { factor: f } }));
}

export function applyVisorThematicOpacityToMap(map) {
  if (!map?.getStyle?.()) return;
  const factor = _visorThematicOpacityFactor;
  const layerIds = collectActiveVisorThematicLayerIds(map);

  for (const layerId of layerIds) {
    const layer = map.getStyle().layers?.find((l) => l.id === layerId);
    if (!layer) continue;
    const props = VISOR_THEMATIC_OPACITY_PROPS[layer.type];
    if (!props) continue;
    for (const prop of props) {
      try {
        const base = getVisorOpacityBase(map, layerId, prop);
        map.setPaintProperty(
          layerId,
          prop,
          factor >= 0.999 ? base : scaleVisorOpacityExpression(base, factor),
        );
      } catch {
        /* capa sin propiedad de opacidad */
      }
    }
  }
}

export function reapplyVisorThematicOpacityToMap(map) {
  if (_visorThematicOpacityFactor < 0.999) applyVisorThematicOpacityToMap(map);
}

function notifyVisorOverlaysChanged() {
  window.dispatchEvent(new CustomEvent("atlas:map-overlays-changed"));
  if (_map?.isStyleLoaded?.()) reapplyVisorThematicOpacityToMap(_map);
  if (_compareOverlaySyncHook) {
    requestAnimationFrame(() => {
      try {
        _compareOverlaySyncHook?.();
      } catch (err) {
        console.warn("[visor compare] overlay sync:", err);
      }
    });
  }
}

/** Apaga capas temáticas del visor (estado + mapa). Ignora callbacks async obsoletos. */
export function clearVisorThematicLayersOnMap() {
  _overlayOpGen += 1;
  _usoSueloOpGen += 1;
  _usoSueloActive = false;
  allOverlayDefs().forEach((d) => {
    _overlayActive[d.key] = false;
    _overlayKeyGen[d.key] = (_overlayKeyGen[d.key] || 0) + 1;
  });
  for (const key of Object.keys(_visorSharedActive)) {
    _visorSharedActive[key] = false;
    _visorSharedKeyGen[key] = (_visorSharedKeyGen[key] || 0) + 1;
  }
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
  });

  ids.forEach((id) => {
    if (!map.getLayer(id)) return;
    if (visible) {
      applyOverlayLayerMunFilter(map, id, true, cve);
    } else if (!isOverlayGeoLabelLayer(id)) {
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
        if (_visorStateWideMode) {
          deactivateOverlayGeoLabels(map, overlayKey);
        } else {
          activateOverlayGeoLabels(map, overlayKey, cve);
        }
      }
    }
  } else {
    const overlayKey = overlayKeyFromLayerId(layerId);
    if (overlayKey === "colonias" || overlayKey === "locsAtlas") {
      deactivateOverlayGeoLabels(map, overlayKey);
    }
    if (overlayKey && hasOverlayLabelDef(overlayKey)) {
      const labelId = overlayLabelLayerId(layerId);
      if (map.getLayer(labelId)) {
        try {
          map.setLayoutProperty(labelId, "visibility", "none");
          map.setFilter(labelId, emptyFilter);
        } catch {
          /* noop */
        }
      }
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
    ensureOverlayLayersExceptSymbols(_map);
    allOverlayDefs().forEach((d) => ensureOverlayLabelLayer(_map, d));
    bindColoniasLabelsSync(_map, coloniasLabelsCtx, munFilter, ensureColoniasLabelsLayer);
    bindLocsAtlasLabelsSync(_map, locsAtlasLabelsCtx, munFilter, ensureLocsAtlasLabelsLayer);
    applyOverlayLabelTheme(_map);
    bringMarcoEntToFront(_map);
    _atlasLayersReady = true;
    flushStyleReadyQueue();
    void ensureAllVisorCatalogIconsOnMap(_map).finally(() => {
      allOverlayDefs().forEach((d) => ensureOverlayLayer(_map, d));
      syncOverlayLayersFromState(_map, resolveVisorOverlayCve(_focusCve));
    });
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
    void (async () => {
      try {
        const { preloadVisorLayerCatalog } = await import("./visorLayers.js");
        await preloadVisorLayerCatalog();
      } catch (e) {
        console.warn("[map] catálogo visor antes de tooltips:", e);
      }
      bindAllOverlayTipHovers(_map, overlayLayerIds);
    })();
    if (!_map.__overlayLabelThemeBound) {
      window.addEventListener("atlasgro-themechange", () => {
        if (_map) applyOverlayLabelTheme(_map);
      });
      _map.__overlayLabelThemeBound = true;
    }
  });

  return _map;
}

function homeMunPickLayers(map) {
  if (!map) return [];
  return [LAYER_IDS.munAllFill, LAYER_IDS.munAllLine, LAYER_IDS.munAllLineHalo].filter(
    (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") === "visible",
  );
}

function municipioFromFeature(f) {
  if (!f?.properties) return null;
  const p = f.properties;
  const cve = pad3(p.cve_mun ?? p.CVE_MUN ?? "");
  if (!cve || cve === "000") return null;
  const nomgeo = p.nomgeo || p.NOMGEO || p.nom_mun || p.NOM_MUN || "";
  return { cve_mun: cve, nomgeo };
}

function handleHomeMunicipioPick(e) {
  if (!_homeMode || typeof _homePickHandler !== "function" || !_map) return;
  const layers = homeMunPickLayers(_map);
  if (!layers.length) return;
  const feats = _map.queryRenderedFeatures(e.point, { layers });
  for (const f of feats) {
    const m = municipioFromFeature(f);
    if (m) {
      void Promise.resolve(_homePickHandler(m)).catch((err) => {
        console.warn("home municipio pick:", err);
      });
      return;
    }
  }
}

function bindMapClick() {
  if (!_map || _map.__atlasClickBound) return;
  _map.__atlasClickBound = true;
  _map.on("click", (e) => {
    if (_homeMode) handleHomeMunicipioPick(e);
  });
  _map.on("mousemove", (e) => {
    if (!_homeMode) return;
    const layers = homeMunPickLayers(_map);
    if (!layers.length) {
      _map.getCanvas().style.cursor = "";
      return;
    }
    const hit = _map.queryRenderedFeatures(e.point, { layers }).some((f) => municipioFromFeature(f));
    _map.getCanvas().style.cursor = hit ? "pointer" : "";
  });
  _map.on("mouseleave", () => {
    if (_map) _map.getCanvas().style.cursor = "";
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
  const mun = _visorStateWideMode ? null : munFilter(cve || "001");
  const ma = mun ? ["all", mun, curnivelMaestroFilter()] : curnivelMaestroFilter();
  const groups = [
    { base: CURNIVEL_LAYERS.base, filter: mun },
    { base: CURNIVEL_LAYERS.master, filter: ma },
  ];
  for (const { base, filter } of groups) {
    const ids = lineLayerIds(base);
    ids.forEach((id) => {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, "visibility", v);
      if (visible) {
        try {
          map.setFilter(id, filter ?? null);
        } catch {
          /* noop */
        }
      }
    });
  }
  if (visible) refreshOverlayTipBindings(map, overlayLayerIds);
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

/** Apaga de inmediato relieve, clima, hidrología y uso de suelo (Datos geográficos). */
function hideGeoThematicLayersOnMap(map) {
  if (!map) return;
  _relieveActive = false;
  const c = pad3(_focusCve || "001");
  try {
    ensureThematicMartinLayers(map);
  } catch {
    /* capas aún no listas */
  }
  setLayerVisible(map, MARTIN_USO_SUELO.layerId, false, c);
  setLayerVisible(map, "ly-clima", false, c);
  setHidroCorrientesVisible(map, false, c);
  setHidroCuerposVisible(map, false, c);
  setCurnivelLayersVisible(map, false, c);
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
  ++_geoThematicGen;
  if (_map) {
    hideGeoThematicLayersOnMap(_map);
  }
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

  if (_visorStateWideMode) {
    applyVisorStateWideChrome(map);
    syncOverlayLayersFromState(map, null);
    return;
  }

  try {
    map.stop();
  } catch {
    /* cancela animación fly/fit previa */
  }

  await fitToMunicipio(map, _focusCve, {
    padding: fitProfile.padding,
    maxZoom: fitProfile.maxZoom,
    duration: fitProfile.duration ?? 1200,
    animate: true,
  });
  if (profile === "visor" || profile === "inv") {
    for (const def of getTieredOverlayDefs()) {
      ensureTieredOverlayLayers(map, def);
    }
  }
  syncOverlayLayersFromState(map, _focusCve);
}

function syncOverlayCve(cve) {
  syncOverlayLayersFromState(_map, resolveVisorOverlayCve(cve));
}

let _scheduledMunFocusTimer = null;
/** @type {{ containerEl: HTMLElement, cve_mun: string, profile: string }|null} */
let _scheduledMunFocusJob = null;

export function scheduleMunicipioMapFocus(containerEl, cve_mun, profile) {
  if (!containerEl || !cve_mun) return;
  _scheduledMunFocusJob = { containerEl, cve_mun, profile };
  if (_scheduledMunFocusTimer) clearTimeout(_scheduledMunFocusTimer);
  _scheduledMunFocusTimer = setTimeout(() => {
    _scheduledMunFocusTimer = null;
    const job = _scheduledMunFocusJob;
    _scheduledMunFocusJob = null;
    if (!job) return;
    invalidateMapSize();
    void setMunicipioMapFocus(job.containerEl, job.cve_mun, job.profile);
  }, 140);
}

function applyHomeMapModeLayers(map, homeMode) {
  const show = (id, on) => safeSetLayout(map, id, "visibility", on ? "visible" : "none");
  if (homeMode) {
    setMunicipioOutlineOnly(map, null, false);
    allOverlayDefs().forEach((d) => {
      _overlayActive[d.key] = false;
    });
    hideVisorThematicLayersOnMap(map);
    hideGeoThematicLayersOnMap(map);
    ensureHomeGeometryStack(map);
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

function syncMapInteractionLock() {
  applyMapInteractionLock(_homeMode || _geoViewLock);
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
    syncMapInteractionLock();
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

  whenAtlasMapReady((map) => ensureHomeGeometryStack(map));
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

/** Datos Geográficos: mapa fijo (sin pan/zoom) y sin herramientas del visor. */
export function setGeoMapViewLock(active) {
  const target = Boolean(active);
  const wasGeoLock = _geoViewLock;
  _geoViewLock = target;
  const el = document.getElementById("mapFrame");
  el?.classList.toggle("atlas-map--geo-lock", target);

  if (wasGeoLock && !target) {
    clearGeoThematicLayers();
  }

  const apply = () => {
    if (_geoViewLock !== target) return;
    syncMapInteractionLock();
    syncRefocusControlVisibility();
  };

  if (!_map || !_atlasLayersReady) {
    whenAtlasMapReady(apply);
    return;
  }
  apply();
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
  _activeBase = normalizeBaseKind(kind);
  whenAtlasMapReady((map) => {
    ensureBaseLayers(map);

    const applyVisibility = () => {
      applyBaseVisibilityOnMap(map, _activeBase);
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
  window.dispatchEvent(new CustomEvent("atlas:map-resize"));
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
  const def = findOverlayDefByKey(key);
  if (!def) return;
  _overlayKeyGen[key] = (_overlayKeyGen[key] || 0) + 1;
  const keyGen = _overlayKeyGen[key];
  _overlayActive[key] = active;
  if (!active && _map?.isStyleLoaded?.()) {
    forceOverlayGroupOff(_map, key);
  }
  if (!_map) {
    whenAtlasMapReady((map) => {
      if (keyGen !== _overlayKeyGen[key]) return;
      if (active) {
        ensureOverlayLayer(map, def);
      } else {
        forceOverlayGroupOff(map, key);
      }
      syncOverlayLayersFromState(map, resolveVisorOverlayCve(cve_mun));
    });
    return;
  }
  const opGen = _overlayOpGen;
  const cve = resolveVisorOverlayCve(cve_mun);

  const apply = (map) => {
    if (keyGen !== _overlayKeyGen[key]) return;
    if (opGen !== _overlayOpGen) return;
    if (active) {
      ensureOverlayLayer(map, def);
    } else {
      forceOverlayGroupOff(map, key);
    }
    syncOverlayLayersFromState(map, cve);
    if (active && def?.rncTiered) {
      try {
        map.triggerRepaint();
      } catch {
        /* noop */
      }
    }
    refreshOverlayTipBindings(map, overlayLayerIds);
    notifyVisorOverlaysChanged();
  };

  if (_map && _atlasLayersReady && _map.isStyleLoaded()) {
    apply(_map);
    return;
  }
  whenAtlasMapReady(apply);
}

/** Zoom mínimo de geometría de una capa del visor (p. ej. manzanas → 14). No incluye etiquetas. */
export function getOverlayMinZoom(key) {
  const def = findOverlayDefByKey(key);
  if (def?.minzoom != null) return def.minzoom;
  if (VISOR_SHARED_LAYER_MIN_ZOOM[key] != null) return VISOR_SHARED_LAYER_MIN_ZOOM[key];
  return null;
}

function setVisorSharedLayerActive(key, active, cve_mun) {
  if (!Object.prototype.hasOwnProperty.call(_visorSharedActive, key)) return;
  _visorSharedKeyGen[key] = (_visorSharedKeyGen[key] || 0) + 1;
  const keyGen = _visorSharedKeyGen[key];
  _visorSharedActive[key] = Boolean(active);
  const cve = resolveVisorOverlayCve(cve_mun);
  if (!active && _map?.isStyleLoaded?.()) {
    if (key === "hidro_corrientes") setHidroCorrientesVisible(_map, false, cve);
    else if (key === "hidro_cuerpos") setHidroCuerposVisible(_map, false, cve);
    else if (key === "curvas_nivel") setCurnivelLayersVisible(_map, false, cve);
    setVisorOnlyLabelVisible(_map, key, false, null);
  }

  const apply = (map) => {
    if (keyGen !== _visorSharedKeyGen[key]) return;
    syncOverlayLayersFromState(map, cve);
    refreshOverlayTipBindings(map, overlayLayerIds);
    notifyVisorOverlaysChanged();
  };

  if (_map && _atlasLayersReady && _map.isStyleLoaded()) {
    apply(_map);
    return;
  }
  whenAtlasMapReady(apply);
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

/** Estado de cualquier overlay temático (p. ej. capas DENUE). */
export function getOverlayActive(key) {
  return !!_overlayActive[key];
}

/** Activa/desactiva overlay por clave (capas DENUE y otras temáticas). */
export function setOverlayActiveByKey(key, active, cve_mun) {
  setOverlayActive(key, active, cve_mun);
}
export function setSaneamientoAguaLayerActive(a, c) { setOverlayActive("saneamientoAgua", a, c); }
export function getSaneamientoAguaLayerActive() { return !!_overlayActive.saneamientoAgua; }
export function setCluesLayerActive(a, c) { setOverlayActive("clues", a, c); }
export function getCluesLayerActive() { return !!_overlayActive.clues; }
export function setResiduoSolidoLayerActive(a, c) { setOverlayActive("residuoSolido", a, c); }
export function getResiduoSolidoLayerActive() { return !!_overlayActive.residuoSolido; }
export function setHidroCorrientesVisorLayerActive(a, c) {
  setVisorSharedLayerActive("hidro_corrientes", a, c);
}
export function getHidroCorrientesVisorLayerActive() {
  return !!_visorSharedActive.hidro_corrientes;
}
export function setHidroCuerposVisorLayerActive(a, c) {
  setVisorSharedLayerActive("hidro_cuerpos", a, c);
}
export function getHidroCuerposVisorLayerActive() {
  return !!_visorSharedActive.hidro_cuerpos;
}
export function setCurvasNivelVisorLayerActive(a, c) {
  setVisorSharedLayerActive("curvas_nivel", a, c);
}
export function getCurvasNivelVisorLayerActive() {
  return !!_visorSharedActive.curvas_nivel;
}

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
  if (!a && _map?.isStyleLoaded?.() && _map.getLayer(MARTIN_USO_SUELO.layerId)) {
    setLayerVisible(_map, MARTIN_USO_SUELO.layerId, false, cve);
  }
  const apply = (map) => {
    if (opGen !== _usoSueloOpGen) return;
    ensureThematicMartinLayers(map);
    syncOverlayLayersFromState(map, cve);
    notifyVisorOverlaysChanged();
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
    addMartinSource(map, "gm-mun", MARTIN_TABLES.municipios);
    addMartinSource(map, "gm-ent", MARTIN_TABLES.entidad);
    map.addLayer({
      id: "gm-mun-fill",
      type: "fill",
      source: "gm-mun",
      "source-layer": SL_MUN(),
      paint: HOME_MUN_DISP_FILL_PAINT,
    });
    map.addLayer({
      id: "gm-mun-line-halo",
      type: "line",
      source: "gm-mun",
      "source-layer": SL_MUN(),
      paint: HOME_MUN_DISP_LINE_HALO_PAINT,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-mun-line",
      type: "line",
      source: "gm-mun",
      "source-layer": SL_MUN(),
      paint: HOME_MUN_DISP_LINE_PAINT,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-ent-fill",
      type: "fill",
      source: "gm-ent",
      "source-layer": SL_ENT(),
      paint: LAYER_PAINT.entFill,
    });
    map.addLayer({
      id: "gm-ent-line-casing",
      type: "line",
      source: "gm-ent",
      "source-layer": SL_ENT(),
      paint: LAYER_PAINT.marcoEntLineCasing,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-ent-line-halo",
      type: "line",
      source: "gm-ent",
      "source-layer": SL_ENT(),
      paint: LAYER_PAINT.marcoEntLineHalo,
      layout: LINE_LAYOUT_SMOOTH,
    });
    map.addLayer({
      id: "gm-ent-line",
      type: "line",
      source: "gm-ent",
      "source-layer": SL_ENT(),
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
      fitMapToMartinSource(map, "gm-ent", SL_ENT(), {
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
