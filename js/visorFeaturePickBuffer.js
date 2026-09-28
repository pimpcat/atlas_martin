/**
 * Buffer por selección de elemento vectorial en el mapa (visor geográfico).
 * Click → queryRenderedFeatures → PostGIS ST_Buffer → capa temporal + análisis INV.
 */
import { getLeafletMap, whenAtlasMapReady } from "./map.js";
import { MARTIN_USO_SUELO } from "./martinLayerStyle.js";
import {
  ensureVisorToolsExtrasHost,
  syncVisorToolsExtrasVisibility,
  findVisorDrawButtonGroup,
  getVisorDrawControl,
} from "./visorDraw.js";
import {
  buildBufferFromSource,
  publishVisorBufferFeature,
  clearVisorBuffer,
  ensureDrawTrashClearsBuffer,
} from "./visorBuffer.js";
import { fetchVisorBuffer, fetchVisorFeatureGeometry } from "./visorBufferApi.js";
import { getOrderedVisorLayerEntries, getVisorLayerEntry } from "./visorCatalog.js";

let _panelEl = null;
let _toggleBtn = null;
let _mapRef = null;
let _pickActive = false;
let _panelOpen = false;
let _pickedFeature = null;
let _pickAoiFeature = null;
let _pickAoiGen = 0;
let _clickHandler = null;
let _applying = false;
let _closeListener = null;
let _bufferClearedListener = null;
let _highlightFetchGen = 0;

const PICK_HIGHLIGHT_SRC = "atlas-visor-pick-highlight-src";
const PICK_HIGHLIGHT_FILL = "atlas-visor-pick-highlight-fill";
const PICK_HIGHLIGHT_POLY_HALO = "atlas-visor-pick-highlight-poly-halo";
const PICK_HIGHLIGHT_POLY_LINE = "atlas-visor-pick-highlight-poly-line";
const PICK_HIGHLIGHT_OUTLINE_HALO = "atlas-visor-pick-highlight-outline-halo";
const PICK_HIGHLIGHT_OUTLINE = "atlas-visor-pick-highlight-outline";
const PICK_HIGHLIGHT_LINE_HALO = "atlas-visor-pick-highlight-line-halo";
const PICK_HIGHLIGHT_LINE = "atlas-visor-pick-highlight-line";
const PICK_HIGHLIGHT_CIRCLE = "atlas-visor-pick-highlight-circle";

const HIGHLIGHT_POLYGON_FILTER = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const HIGHLIGHT_OUTLINE_FILTER = ["==", ["get", "atlasPickOutline"], true];
const HIGHLIGHT_LINE_FILTER = [
  "any",
  ["==", ["get", "atlasPickKind"], "line"],
  ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
];
const HIGHLIGHT_POINT_FILTER = ["==", ["get", "atlasPickKind"], "point"];

/** Contorno de polígonos: mismo peso que las líneas, visible a zoom municipal. */
const HIGHLIGHT_OUTLINE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  3.5,
  12,
  5,
  16,
  7,
  20,
  9,
];
const HIGHLIGHT_OUTLINE_HALO_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  7,
  12,
  10,
  16,
  13,
  20,
  16,
];

/** Líneas (ríos, vías): trazo más visible que el contorno. */
const HIGHLIGHT_LINE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  3,
  12,
  5,
  16,
  7,
  20,
  9,
];
const HIGHLIGHT_LINE_HALO_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  6,
  12,
  9,
  16,
  12,
  20,
  15,
];

const HIGHLIGHT_ORANGE = "#ff9800";
const HIGHLIGHT_ORANGE_DARK = "#e65100";
const HIGHLIGHT_ORANGE_HALO = "#ffb74d";

const SKIP_LAYER_RE =
  /(gl-draw|atlas-visor-buffer|atlas-identify-highlight|atlas-mun|atlas-ent|gm-|osm|clima|visor-labels|-labels$)/i;

function isLineGeometry(feature) {
  const t = feature?.geometry?.type;
  return t === "LineString" || t === "MultiLineString";
}

function isPointGeometry(feature) {
  const t = feature?.geometry?.type;
  return t === "Point" || t === "MultiPoint";
}

function isPolygonGeometry(feature) {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

function catalogGeometryKind(layerId) {
  const catalogId = resolveVisorApiLayerId(layerId);
  if (!catalogId) return null;
  const g = String(getVisorLayerEntry(catalogId)?.geometry || "").trim().toLowerCase();
  if (g === "line" || g === "polygon" || g === "point") return g;
  return null;
}

function treatFeatureAsPolygon(feature, layerId) {
  if (isPolygonGeometry(feature)) return true;
  return catalogGeometryKind(layerId || feature?._layerId) === "polygon";
}

function notifyPickAoiChanged(feature) {
  window.dispatchEvent(
    new CustomEvent("atlas:visor-pick-aoi-changed", {
      detail: { feature: feature || null },
    }),
  );
  window.dispatchEvent(
    new CustomEvent("atlas:visor-polygon-closed", {
      detail: { feature: feature || null, source: "pick-aoi" },
    }),
  );
}

function clearPickAoi(notify = true) {
  _pickAoiFeature = null;
  _pickAoiGen += 1;
  if (notify) notifyPickAoiChanged(null);
}

/**
 * Polígono/multipolígono seleccionado listo para análisis espacial (sin buffer).
 * Geometría completa PostGIS cuando hay layer_id + gid.
 */
export function getActivePickAoiFeature() {
  return _pickAoiFeature;
}

async function resolvePickAoiFromFeature(feature) {
  if (!feature || !treatFeatureAsPolygon(feature, feature._layerId)) {
    clearPickAoi(true);
    return null;
  }
  const gen = ++_pickAoiGen;
  const apiLayer = feature._apiLayerId || resolveVisorApiLayerId(feature._layerId);
  const gid = feature._sourceGid || pickVisorFeatureGid(feature.properties, feature, feature._layerId);
  if (!apiLayer) {
    clearPickAoi(true);
    return null;
  }
  try {
    const { feature: full } = await fetchVisorFeatureGeometry({
      layer_id: apiLayer,
      gid,
      attrs: feature.properties,
      ...clickLonLatFromFeature(feature),
    });
    if (gen !== _pickAoiGen) return null;
    if (!full?.geometry || !isPolygonGeometry(full)) {
      clearPickAoi(true);
      return null;
    }
    const aoi = {
      type: "Feature",
      properties: {
        ...(full.properties || {}),
        ...(feature.properties || {}),
        atlasAnalysisSource: "pick",
        gid: full.properties?.gid || gid,
      },
      geometry: full.geometry,
    };
    _pickAoiFeature = aoi;
    notifyPickAoiChanged(aoi);
    return aoi;
  } catch (err) {
    console.warn("[visorFeaturePickBuffer] AOI PostGIS:", err);
    if (gen === _pickAoiGen) clearPickAoi(true);
    return null;
  }
}

function pickHighlightHint(feature) {
  if (isLineGeometry(feature)) return "trazo naranja en el mapa";
  if (isPointGeometry(feature)) return "punto resaltado en el mapa";
  return "contorno naranja en el mapa";
}

function coerceHighlightGeometry(geometry) {
  if (!geometry?.type) return geometry;
  const t = geometry.type;
  if (
    t === "Polygon" ||
    t === "MultiPolygon" ||
    t === "LineString" ||
    t === "MultiLineString" ||
    t === "Point" ||
    t === "MultiPoint"
  ) {
    return geometry;
  }
  if (t !== "GeometryCollection") return geometry;
  const polys = [];
  const lines = [];
  const points = [];
  for (const g of geometry.geometries || []) {
    if (g.type === "Polygon") polys.push(g.coordinates);
    else if (g.type === "MultiPolygon") polys.push(...g.coordinates);
    else if (g.type === "LineString") lines.push(g.coordinates);
    else if (g.type === "MultiLineString") lines.push(...g.coordinates);
    else if (g.type === "Point") points.push(g.coordinates);
    else if (g.type === "MultiPoint") points.push(...g.coordinates);
  }
  if (polys.length) return { type: "MultiPolygon", coordinates: polys };
  if (lines.length === 1) return { type: "LineString", coordinates: lines[0] };
  if (lines.length > 1) return { type: "MultiLineString", coordinates: lines };
  if (points.length === 1) return { type: "Point", coordinates: points[0] };
  if (points.length > 1) return { type: "MultiPoint", coordinates: points };
  return geometry;
}

function outlineToLineHighlight(feature) {
  if (!feature?.geometry) return null;
  const geometry = coerceHighlightGeometry(feature.geometry) || feature.geometry;
  if (!geometry) return null;
  return {
    type: "Feature",
    properties: {
      ...(feature.properties || {}),
      atlasPickKind: "line",
      atlasPickOutline: false,
    },
    geometry,
  };
}

function polygonRingsToLineFeature(feature) {
  const geom = coerceHighlightGeometry(feature?.geometry) || feature?.geometry;
  if (!geom) return null;
  if (geom.type === "LineString" || geom.type === "MultiLineString") {
    return outlineToLineHighlight({ ...feature, geometry: geom });
  }
  const turf = globalThis.turf;
  if (turf?.polygonToLine) {
    try {
      const line = turf.polygonToLine({
        type: "Feature",
        properties: {},
        geometry: geom,
      });
      const geometry =
        line?.type === "Feature"
          ? line.geometry
          : line?.type === "FeatureCollection"
            ? line.features?.[0]?.geometry
            : line;
      if (geometry) return outlineToLineHighlight({ ...feature, geometry });
    } catch {
      /* anillos a mano */
    }
  }
  const polys =
    geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const lines = [];
  for (const poly of polys) {
    const ring = poly?.[0];
    if (Array.isArray(ring) && ring.length >= 2) lines.push(ring);
  }
  if (!lines.length) return null;
  return outlineToLineHighlight({
    ...feature,
    geometry:
      lines.length === 1
        ? { type: "LineString", coordinates: lines[0] }
        : { type: "MultiLineString", coordinates: lines },
  });
}

function tagHighlightFeature(feature) {
  if (!feature?.geometry) return null;
  const geometry = coerceHighlightGeometry(feature.geometry) || feature.geometry;
  let kind = "polygon";
  const coerced = { type: "Feature", properties: feature.properties, geometry };
  if (isLineGeometry(coerced) || feature.properties?.atlasPickKind === "line") kind = "line";
  else if (isPointGeometry(coerced)) kind = "point";
  const props = { ...(feature.properties || {}), atlasPickKind: kind };
  if (props.atlasPickOutline == null && feature.properties?.atlasPickOutline != null) {
    props.atlasPickOutline = feature.properties.atlasPickOutline;
  }
  return {
    type: "Feature",
    properties: props,
    geometry,
  };
}

export function raisePickHighlightLayers(map) {
  if (!map?.getStyle?.()) return;
  ensurePickHighlightLayers(map);
  for (const id of [
    PICK_HIGHLIGHT_FILL,
    PICK_HIGHLIGHT_POLY_HALO,
    PICK_HIGHLIGHT_POLY_LINE,
    PICK_HIGHLIGHT_OUTLINE_HALO,
    PICK_HIGHLIGHT_OUTLINE,
    PICK_HIGHLIGHT_LINE_HALO,
    PICK_HIGHLIGHT_LINE,
    PICK_HIGHLIGHT_CIRCLE,
  ]) {
    if (!map.getLayer(id)) continue;
    try {
      map.moveLayer(id);
    } catch {
      /* noop */
    }
  }
}

function cloneMapFeature(mapFeature) {
  if (!mapFeature?.geometry) return null;
  const props = { ...(mapFeature.properties || {}) };
  if (props.gid == null && mapFeature.id != null) props.gid = String(mapFeature.id);
  return {
    type: "Feature",
    id: mapFeature.id,
    properties: props,
    geometry: JSON.parse(JSON.stringify(mapFeature.geometry)),
  };
}

function layerRank(layerId) {
  if (!layerId) return 5;
  if (layerId.endsWith("-labels") || layerId.includes("-visor-labels")) return 9;
  if (layerId.includes("-halo")) return 3;
  if (layerId.includes("-fill") || layerId.endsWith("-hit")) return 0;
  return 2;
}

function pickBestFeature(features) {
  if (!features?.length) return null;
  const sorted = [...features].sort((a, b) => {
    const ra = layerRank(a.layer?.id);
    const rb = layerRank(b.layer?.id);
    if (ra !== rb) return ra - rb;
    const pa = isPolygonGeometry(a) ? 0 : 1;
    const pb = isPolygonGeometry(b) ? 0 : 1;
    return pa - pb;
  });
  return sorted[0];
}

function getPickableLayerIds(map) {
  const style = map.getStyle()?.layers || [];
  const ids = [];
  for (const layer of style) {
    const id = layer.id;
    if (!id || SKIP_LAYER_RE.test(id)) continue;
    if (!id.startsWith("ly-") && id !== MARTIN_USO_SUELO.layerId) continue;
    try {
      if (map.getLayoutProperty(id, "visibility") !== "visible") continue;
    } catch {
      continue;
    }
    ids.push(id);
  }
  return ids;
}

function describeLayer(layerId) {
  const catalogId = resolveVisorApiLayerId(layerId);
  const entry = catalogId ? getVisorLayerEntry(catalogId) : null;
  const title = entry?.identify?.title || entry?.label;
  if (title) return String(title);
  return "elemento del mapa";
}

function featureLabel(props) {
  if (!props) return "";
  const keys = [
    "nombre",
    "NOMBRE",
    "nom_asen",
    "nom_loc",
    "nomgeo",
    "cvegeo",
    "tipo",
    "gid",
  ];
  for (const k of keys) {
    if (props[k] != null && String(props[k]).trim()) return String(props[k]).trim();
  }
  return "";
}

function describePicked(feature, layerId) {
  const kind = describeLayer(layerId);
  const label = featureLabel(feature.properties);
  return label ? `${kind}: ${label}` : kind;
}

export function pickVisorFeatureGid(props, feature, layerId) {
  const bag = { ...(feature?.properties || {}), ...(props || {}) };
  const lower = {};
  for (const [k, v] of Object.entries(bag)) {
    lower[String(k).toLowerCase()] = v;
  }
  for (const col of ["gid", "ogc_fid"]) {
    const val = lower[col];
    if (val != null && String(val).trim() !== "") return String(val).trim();
  }
  const fid = feature?.id;
  if (fid != null && String(fid).trim() !== "") return String(fid).trim();
  return null;
}

function clickLonLatFromFeature(feature) {
  const lon = Number(feature?._clickLon);
  const lat = Number(feature?._clickLat);
  if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
  return {};
}

function gidFromLoadedTiles(map, mapFeature) {
  if (!map || !mapFeature?.source) return null;
  const sl = mapFeature.sourceLayer;
  let feats = [];
  try {
    feats = map.querySourceFeatures(mapFeature.source, sl ? { sourceLayer: sl } : {});
  } catch {
    return null;
  }
  const name = featureLabel(mapFeature.properties);
  for (const f of feats) {
    const gid = pickVisorFeatureGid(f.properties, f, mapFeature.layer?.id);
    if (!gid) continue;
    if (name && featureLabel(f.properties) === name) return gid;
  }
  return null;
}

function stripMapLayerKeySuffix(key) {
  if (!key) return key;
  if (key.endsWith("-cluster-count")) return key.slice(0, -"-cluster-count".length);
  if (key.endsWith("-clusters")) return key.slice(0, -"-clusters".length);
  if (key.endsWith("-unclustered")) return key.slice(0, -"-unclustered".length);
  if (key.endsWith("-hit")) return key.slice(0, -4);
  if (key.endsWith("-labels-loose")) return key.slice(0, -"-labels-loose".length);
  if (key.endsWith("-labels")) return key.slice(0, -7);
  if (key.endsWith("-halo")) return key.replace(/-halo$/, "");
  if (key.endsWith("-fill")) return key.replace(/-fill$/, "");
  return key;
}

/** Capa del API a partir del id MapLibre, vía catálogo (id / overlay_key / capa MapLibre). */
export function resolveVisorApiLayerId(mapLayerId) {
  if (!mapLayerId) return null;
  if (mapLayerId === MARTIN_USO_SUELO.layerId) return "uso_suelo";
  const stripped = stripMapLayerKeySuffix(
    mapLayerId.replace(/^ly-/, "").replace(/^lyr_/, "").replace(/-visor-labels$/, "").replace(/-labels$/, ""),
  );
  try {
    for (const entry of getOrderedVisorLayerEntries()) {
      if (!entry?.id) continue;
      if (entry.id === stripped || entry.id === mapLayerId) return entry.id;
      const overlayKey = String(entry.overlay_key || "");
      if (overlayKey && overlayKey === stripped) return entry.id;
      if (overlayKey && `ly-${overlayKey}` === mapLayerId) return entry.id;
    }
  } catch {
    /* catálogo aún no cargado */
  }
  return null;
}

function findDrawLayerInsertBefore(map) {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    if (layer.id.includes("gl-draw")) return layer.id;
  }
  return undefined;
}

function ensurePickHighlightLayers(map) {
  if (!map?.isStyleLoaded?.()) return false;

  if (!map.getSource(PICK_HIGHLIGHT_SRC)) {
    map.addSource(PICK_HIGHLIGHT_SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  const beforeId = undefined;

  if (!map.getLayer(PICK_HIGHLIGHT_FILL)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_FILL,
        type: "fill",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_POLYGON_FILTER,
        paint: {
          "fill-color": "#ff6d00",
          "fill-opacity": 0.42,
          "fill-outline-color": "#e65100",
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_FILL, HIGHLIGHT_POLYGON_FILTER);
      map.setPaintProperty(PICK_HIGHLIGHT_FILL, "fill-color", "#ff6d00");
      map.setPaintProperty(PICK_HIGHLIGHT_FILL, "fill-opacity", 0.42);
    } catch {
      /* noop */
    }
  }

  if (!map.getLayer(PICK_HIGHLIGHT_POLY_HALO)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_POLY_HALO,
        type: "line",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_POLYGON_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": HIGHLIGHT_ORANGE_HALO,
          "line-width": HIGHLIGHT_OUTLINE_HALO_WIDTH,
          "line-opacity": 0.9,
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_POLY_HALO, HIGHLIGHT_POLYGON_FILTER);
      map.setPaintProperty(PICK_HIGHLIGHT_POLY_HALO, "line-color", HIGHLIGHT_ORANGE_HALO);
      map.setPaintProperty(PICK_HIGHLIGHT_POLY_HALO, "line-width", HIGHLIGHT_OUTLINE_HALO_WIDTH);
      map.setPaintProperty(PICK_HIGHLIGHT_POLY_HALO, "line-opacity", 0.9);
    } catch {
      /* noop */
    }
  }

  if (!map.getLayer(PICK_HIGHLIGHT_POLY_LINE)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_POLY_LINE,
        type: "line",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_POLYGON_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": HIGHLIGHT_ORANGE_DARK,
          "line-width": HIGHLIGHT_OUTLINE_WIDTH,
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_POLY_LINE, HIGHLIGHT_POLYGON_FILTER);
      map.setPaintProperty(PICK_HIGHLIGHT_POLY_LINE, "line-color", HIGHLIGHT_ORANGE_DARK);
      map.setPaintProperty(PICK_HIGHLIGHT_POLY_LINE, "line-width", HIGHLIGHT_OUTLINE_WIDTH);
    } catch {
      /* noop */
    }
  }

  if (!map.getLayer(PICK_HIGHLIGHT_OUTLINE_HALO)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_OUTLINE_HALO,
        type: "line",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_OUTLINE_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": HIGHLIGHT_ORANGE_HALO,
          "line-width": HIGHLIGHT_OUTLINE_HALO_WIDTH,
          "line-opacity": 0.75,
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_OUTLINE_HALO, HIGHLIGHT_OUTLINE_FILTER);
      map.setPaintProperty(PICK_HIGHLIGHT_OUTLINE_HALO, "line-color", HIGHLIGHT_ORANGE_HALO);
      map.setPaintProperty(PICK_HIGHLIGHT_OUTLINE_HALO, "line-width", HIGHLIGHT_OUTLINE_HALO_WIDTH);
    } catch {
      /* noop */
    }
  }

  if (!map.getLayer(PICK_HIGHLIGHT_OUTLINE)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_OUTLINE,
        type: "line",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_OUTLINE_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": HIGHLIGHT_ORANGE,
          "line-width": HIGHLIGHT_OUTLINE_WIDTH,
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_OUTLINE, HIGHLIGHT_OUTLINE_FILTER);
      map.setPaintProperty(PICK_HIGHLIGHT_OUTLINE, "line-color", HIGHLIGHT_ORANGE);
      map.setPaintProperty(PICK_HIGHLIGHT_OUTLINE, "line-width", HIGHLIGHT_OUTLINE_WIDTH);
    } catch {
      /* noop */
    }
  }

  if (!map.getLayer(PICK_HIGHLIGHT_LINE_HALO)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_LINE_HALO,
        type: "line",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_LINE_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": HIGHLIGHT_ORANGE_HALO,
          "line-width": HIGHLIGHT_LINE_HALO_WIDTH,
          "line-opacity": 0.85,
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_LINE_HALO, HIGHLIGHT_LINE_FILTER);
      map.setPaintProperty(PICK_HIGHLIGHT_LINE_HALO, "line-color", HIGHLIGHT_ORANGE_HALO);
      map.setPaintProperty(PICK_HIGHLIGHT_LINE_HALO, "line-width", HIGHLIGHT_LINE_HALO_WIDTH);
    } catch {
      /* noop */
    }
  }

  if (!map.getLayer(PICK_HIGHLIGHT_LINE)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_LINE,
        type: "line",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_LINE_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": HIGHLIGHT_ORANGE_DARK,
          "line-width": HIGHLIGHT_LINE_WIDTH,
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_LINE, HIGHLIGHT_LINE_FILTER);
      map.setPaintProperty(PICK_HIGHLIGHT_LINE, "line-width", HIGHLIGHT_LINE_WIDTH);
      map.setPaintProperty(PICK_HIGHLIGHT_LINE, "line-color", HIGHLIGHT_ORANGE_DARK);
    } catch {
      /* noop */
    }
  }

  if (!map.getLayer(PICK_HIGHLIGHT_CIRCLE)) {
    map.addLayer(
      {
        id: PICK_HIGHLIGHT_CIRCLE,
        type: "circle",
        source: PICK_HIGHLIGHT_SRC,
        filter: HIGHLIGHT_POINT_FILTER,
        paint: {
          "circle-color": HIGHLIGHT_ORANGE,
          "circle-radius": 8,
          "circle-stroke-color": HIGHLIGHT_ORANGE_DARK,
          "circle-stroke-width": 2,
        },
      },
      beforeId
    );
  } else {
    try {
      map.setFilter(PICK_HIGHLIGHT_CIRCLE, HIGHLIGHT_POINT_FILTER);
    } catch {
      /* noop */
    }
  }

  return Boolean(map.getSource(PICK_HIGHLIGHT_SRC));
}

function warmPickHighlightLayers(map) {
  if (!map) return;
  if (ensurePickHighlightLayers(map)) return;
  map.once("idle", () => ensurePickHighlightLayers(map));
}

function setPickHighlightData(map, featureOrList) {
  if (!map) return;
  const list = Array.isArray(featureOrList)
    ? featureOrList
    : featureOrList
      ? [featureOrList]
      : [];
  const tagged = list.map(tagHighlightFeature).filter(Boolean);
  const data = {
    type: "FeatureCollection",
    features: tagged,
  };

  const commit = () => {
    if (tagged.length && !ensurePickHighlightLayers(map)) return false;
    const src = map.getSource(PICK_HIGHLIGHT_SRC);
    if (!src) return !tagged.length;
    src.setData(data);
    if (tagged.length) raisePickHighlightLayers(map);
    return true;
  };

  if (commit()) return;
  if (!tagged.length) {
    map.getSource(PICK_HIGHLIGHT_SRC)?.setData(data);
    return;
  }
  map.once("idle", () => commit());
}

function updatePickHighlight(map, feature) {
  setPickHighlightData(map, feature);
}

function clearPickHighlight(map) {
  updatePickHighlight(map, null);
}

/** Quita selección, resaltado naranja y buffer azul del mapa. */
function clearPickSelection(options = {}) {
  const { keepPanelOpen = true } = options;
  const map = _mapRef || getLeafletMap();
  _pickedFeature = null;
  _highlightFetchGen += 1;
  clearPickAoi(true);
  clearPickHighlight(map);
  clearVisorBuffer();
  setStatus("");
  syncPickPanelUi();
  if (!keepPanelOpen) setPickPanelOpen(false);
}

function paintPolygonPickHighlight(map, feature) {
  const geom = coerceHighlightGeometry(feature?.geometry) || feature?.geometry;
  if (!geom) return;
  const polyFeat = {
    type: "Feature",
    properties: { ...(feature.properties || {}), atlasPickKind: "polygon" },
    geometry: geom,
  };
  const lineFeat = polygonRingsToLineFeature(polyFeat);
  setPickHighlightData(map, [polyFeat, lineFeat].filter(Boolean));
}

async function refreshPickHighlight(feature, layerId) {
  const map = _mapRef || getLeafletMap();
  if (!map || !feature) {
    clearPickHighlight(map);
    return;
  }

  const apiLayer = feature._apiLayerId || resolveVisorApiLayerId(layerId);
  const gid =
    feature._sourceGid ||
    pickVisorFeatureGid(feature.properties, feature, layerId);
  const gen = ++_highlightFetchGen;
  const asPolygon = treatFeatureAsPolygon(feature, layerId);

  if (asPolygon) {
    if (!apiLayer) {
      setStatus("No se encontró esta capa en el catálogo.", true);
      return;
    }
    if (_pickedFeature?._fullPostgis && isPolygonGeometry(_pickedFeature)) {
      paintPolygonPickHighlight(map, _pickedFeature);
      return;
    }
    setStatus("Cargando geometría completa…");
    clearPickHighlight(map);
    try {
      const { feature: full } = await fetchVisorFeatureGeometry({
        layer_id: apiLayer,
        gid,
        attrs: feature.properties,
        ...clickLonLatFromFeature(feature),
      });
      if (gen !== _highlightFetchGen || !_pickedFeature) return;
      const geom = coerceHighlightGeometry(full?.geometry) || full?.geometry;
      if (!geom) {
        setStatus("El elemento no tiene geometría en PostGIS.", true);
        return;
      }
      _pickedFeature.geometry = geom;
      _pickedFeature.properties = {
        ...(_pickedFeature.properties || {}),
        ...(full.properties || {}),
      };
      _pickedFeature._fullPostgis = true;
      if (full.properties?.gid) {
        _pickedFeature._sourceGid = String(full.properties.gid);
      }
      paintPolygonPickHighlight(map, _pickedFeature);
      setStatus("");
      syncPickPanelUi();
    } catch (err) {
      if (gen !== _highlightFetchGen) return;
      console.warn("[visorFeaturePickBuffer] geometría PostGIS:", err);
      setStatus(err?.message || "No se pudo cargar la geometría completa.", true);
    }
    return;
  }

  updatePickHighlight(map, feature);

  if (apiLayer) {
    try {
      const { feature: full } = await fetchVisorFeatureGeometry({
        layer_id: apiLayer,
        gid,
        attrs: feature.properties,
        ...clickLonLatFromFeature(feature),
      });
      if (gen !== _highlightFetchGen || !_pickedFeature) return;
      updatePickHighlight(map, full);
    } catch (err) {
      console.warn("[visorFeaturePickBuffer] highlight PostGIS:", err);
    }
  }
}

function setStatus(msg, isError = false) {
  const el = _panelEl?.querySelector(".visor-pick-buffer-panel__status");
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("text-danger", isError);
  el.classList.toggle("text-success", !isError);
}

function syncLineSideVisibility() {
  const wrap = _panelEl?.querySelector("#visorPickBufferLineSide");
  if (!wrap) return;
  wrap.classList.toggle("d-none", !_pickedFeature || !isLineGeometry(_pickedFeature));
}

function syncPickPanelUi() {
  if (!_panelEl || _panelEl.hidden) return;
  const hint = _panelEl.querySelector(".visor-pick-buffer-panel__hint");
  const applyBtn = _panelEl.querySelector("#visorPickBufferApply");
  syncLineSideVisibility();
  if (hint) {
    hint.textContent = _pickActive
      ? _pickedFeature
        ? treatFeatureAsPolygon(_pickedFeature, _pickedFeature._layerId)
          ? `Seleccionado: ${describePicked(_pickedFeature, _pickedFeature._layerId)} · listo para análisis espacial (sin buffer) o genera buffer.`
          : `Seleccionado: ${describePicked(_pickedFeature, _pickedFeature._layerId)} · ${pickHighlightHint(_pickedFeature)}. Para análisis espacial genera un buffer.`
        : "Haz clic sobre una colonia, manzana u otra capa activa del visor."
      : "Activa la selección con el botón del puntero.";
  }
  if (applyBtn) applyBtn.disabled = !_pickedFeature || _applying;
}

function setPickModeActive(active) {
  _pickActive = Boolean(active);
  const map = _mapRef || getLeafletMap();
  if (map) {
    const canvas = map.getCanvas();
    if (canvas) canvas.style.cursor = _pickActive ? "pointer" : "";
  }
  if (_toggleBtn) {
    _toggleBtn.classList.toggle("active", _pickActive && _panelOpen);
  }
  syncPickPanelUi();
}

function setPickPanelOpen(open) {
  _panelOpen = Boolean(open);
  if (_panelEl) _panelEl.hidden = !_panelOpen;
  if (_toggleBtn) {
    _toggleBtn.setAttribute("aria-expanded", _panelOpen ? "true" : "false");
  }
  syncVisorToolsExtrasVisibility();
  if (!_panelOpen) {
    // Al cerrar la herramienta: sin selección activa → sin AOI de análisis.
    setPickModeActive(false);
    _pickedFeature = null;
    clearPickHighlight(_mapRef || getLeafletMap());
    clearPickAoi(true);
  } else {
    // Sesión limpia: el botón de análisis solo aparece tras seleccionar un polígono.
    setPickModeActive(true);
    _pickedFeature = null;
    clearPickHighlight(_mapRef || getLeafletMap());
    clearPickAoi(true);
    syncPickPanelUi();
    warmPickHighlightLayers(_mapRef || getLeafletMap());
  }
}

function deactivateOtherDrawTools(map) {
  const draw = getVisorDrawControl();
  try {
    draw?.changeMode?.("simple_select");
  } catch {
    /* noop */
  }
  const group = findVisorDrawButtonGroup(map);
  group?.querySelectorAll(".mapbox-gl-draw_ctrl-draw-btn").forEach((el) => {
    if (
      !el.classList.contains("mapbox-gl-draw_pick") &&
      !el.classList.contains("mapbox-gl-draw_buffer")
    ) {
      el.classList.remove("active");
    }
  });
}

function togglePickPanel() {
  const map = _mapRef || getLeafletMap();
  if (!_panelOpen) {
    deactivateOtherDrawTools(map);
    const bufferBtn = map?.getContainer()?.querySelector(".mapbox-gl-draw_buffer");
    bufferBtn?.classList.remove("active");
  }
  setPickPanelOpen(!_panelOpen);
}

function onMapClick(ev) {
  if (!_pickActive || !_panelOpen) return;
  const map = _mapRef || getLeafletMap();
  if (!map) return;

  const layers = getPickableLayerIds(map);
  if (!layers.length) {
    setStatus("Activa al menos una capa temática del visor.", true);
    return;
  }

  let hits = [];
  try {
    hits = map.queryRenderedFeatures(ev.point, { layers });
  } catch {
    hits = [];
  }

  const best = pickBestFeature(hits);
  if (!best) {
    _pickedFeature = null;
    clearPickAoi(true);
    setStatus("No hay ningún elemento seleccionable en ese punto.", true);
    syncPickPanelUi();
    return;
  }

  _pickedFeature = cloneMapFeature(best);
  if (_pickedFeature) {
    _pickedFeature._layerId = best.layer?.id || "";
    _pickedFeature._apiLayerId = resolveVisorApiLayerId(_pickedFeature._layerId);
    _pickedFeature._clickLon = ev.lngLat?.lng;
    _pickedFeature._clickLat = ev.lngLat?.lat;
    _pickedFeature._sourceGid =
      pickVisorFeatureGid(_pickedFeature.properties, best, _pickedFeature._layerId) ||
      gidFromLoadedTiles(map, best);
  }
  setStatus("");
  syncPickPanelUi();
  void refreshPickHighlight(_pickedFeature, _pickedFeature?._layerId);
  void resolvePickAoiFromFeature(_pickedFeature).then((aoi) => {
    if (!aoi && _pickedFeature && !treatFeatureAsPolygon(_pickedFeature, _pickedFeature._layerId)) {
      setStatus(
        "Elemento seleccionado. Para análisis espacial en puntos/líneas genera un buffer; en polígonos (colonia, manzana…) ya puedes iniciar el análisis.",
        false,
      );
    } else if (aoi) {
      setStatus(
        "Polígono listo para análisis espacial (sin buffer). Usa «Iniciar Análisis Espacial» o genera buffer si necesitas un área de influencia.",
        false,
      );
    }
  });
}

function bindMapClick(map) {
  if (_clickHandler) return;
  _clickHandler = onMapClick;
  map.on("click", _clickHandler);
}

function unbindMapClick(map) {
  if (!map || !_clickHandler) return;
  map.off("click", _clickHandler);
  _clickHandler = null;
}

function parseDistanceMeters() {
  const raw = _panelEl?.querySelector("#visorPickBufferDistance")?.value;
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function bufferApiPayload(feature, distanceM, lineSide = "both") {
  const apiLayer = feature._apiLayerId || null;
  const sourceGid = feature._sourceGid || pickVisorFeatureGid(feature.properties, feature);
  const payload = {
    distance_m: distanceM,
    layer_id: apiLayer,
    source_gid: sourceGid,
  };
  if (isLineGeometry(feature) && lineSide && lineSide !== "both") {
    payload.line_side = lineSide;
  }
  if (apiLayer && sourceGid) {
    return {
      ...payload,
      geojson: {
        type: "Feature",
        properties: { ...(feature.properties || {}), gid: sourceGid },
      },
    };
  }
  return {
    ...payload,
    geojson: feature,
  };
}

async function buildLineSideBufferLocal(feature, distanceM, lineSide) {
  let source = feature;
  if (feature._apiLayerId && feature._sourceGid) {
    try {
      const { feature: full } = await fetchVisorFeatureGeometry({
        layer_id: feature._apiLayerId,
        gid: feature._sourceGid,
        attrs: feature.properties,
        ...clickLonLatFromFeature(feature),
      });
      source = full;
    } catch (err) {
      console.warn("[visorFeaturePickBuffer] geometría completa para Turf:", err);
    }
  }
  return buildBufferFromSource(source, distanceM, lineSide);
}

async function applyPickBuffer() {
  if (!_pickedFeature || _applying) return;
  const distanceM = parseDistanceMeters();
  if (!distanceM) {
    setStatus("Indica una distancia válida en metros.", true);
    return;
  }

  const lineSide = _panelEl?.querySelector("#visorPickBufferLineSideSelect")?.value || "both";
  _applying = true;
  syncPickPanelUi();
  setStatus("Generando área de influencia…");

  try {
    let buffered;
    const payload = bufferApiPayload(_pickedFeature, distanceM, lineSide);
    const canUsePostgis = payload.layer_id && payload.source_gid;
    const oneSidedLine = isLineGeometry(_pickedFeature) && lineSide !== "both";

    if (canUsePostgis || !oneSidedLine) {
      try {
        const { feature } = await fetchVisorBuffer(payload);
        buffered = feature;
      } catch (err) {
        if (isLineGeometry(_pickedFeature)) {
          buffered = await buildLineSideBufferLocal(_pickedFeature, distanceM, lineSide);
        } else {
          throw err;
        }
      }
    } else {
      buffered = await buildLineSideBufferLocal(_pickedFeature, distanceM, lineSide);
    }

    const msg = oneSidedLine
      ? `Inundación generada · ${distanceM.toLocaleString("es-MX")} m al ${lineSide === "left" ? "lado izquierdo" : "lado derecho"} del trazo.`
      : `Área de influencia generada · ${distanceM.toLocaleString("es-MX")} m (PostGIS).`;

    publishVisorBufferFeature(buffered, msg);
    if (_pickedFeature) {
      void refreshPickHighlight(_pickedFeature, _pickedFeature._layerId);
      raisePickHighlightLayers(_mapRef || getLeafletMap());
    }
    setStatus(msg, false);
  } catch (err) {
    console.warn("[visorFeaturePickBuffer]", err);
    setStatus(err.message || "No se pudo generar el buffer.", true);
  } finally {
    _applying = false;
    syncPickPanelUi();
  }
}

function injectPickButton(map) {
  const group = findVisorDrawButtonGroup(map);
  if (!group) return false;
  ensureDrawTrashClearsBuffer(map);
  if (group.querySelector(".mapbox-gl-draw_pick")) {
    _toggleBtn = group.querySelector(".mapbox-gl-draw_pick");
    return true;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mapbox-gl-draw_ctrl-draw-btn mapbox-gl-draw_pick";
  btn.title = "Buffer sobre elemento del mapa";
  btn.setAttribute("aria-label", "Buffer sobre elemento del mapa");
  btn.setAttribute("aria-expanded", "false");

  const bufferBtn = group.querySelector(".mapbox-gl-draw_buffer");
  if (bufferBtn) bufferBtn.insertAdjacentElement("afterend", btn);
  else {
    const trash = group.querySelector(".mapbox-gl-draw_trash");
    if (trash) trash.insertAdjacentElement("afterend", btn);
    else group.appendChild(btn);
  }

  btn.addEventListener("click", () => togglePickPanel());
  _toggleBtn = btn;
  return true;
}

function schedulePickButtonInjection(map, attempt = 0) {
  if (injectPickButton(map)) return;
  if (attempt < 16) setTimeout(() => schedulePickButtonInjection(map, attempt + 1), 120);
}

function mountPickPanel(map) {
  if (_panelEl?.isConnected) return _panelEl;

  const host = ensureVisorToolsExtrasHost(map);
  const el = document.createElement("div");
  el.className = "visor-pick-buffer-panel visor-buffer-panel";
  el.innerHTML = `
    <div class="visor-buffer-panel__title">Selección / buffer en el mapa</div>
    <p class="visor-buffer-panel__hint visor-pick-buffer-panel__hint">
      Haz clic sobre una colonia, manzana u otra capa activa. Los polígonos permiten análisis espacial sin buffer.
    </p>
    <div class="visor-buffer-panel__row">
      <label class="visually-hidden" for="visorPickBufferDistance">Distancia en metros</label>
      <input type="number" id="visorPickBufferDistance" class="form-control form-control-sm" min="0" step="1" value="50" />
      <span class="visor-buffer-panel__unit">m</span>
    </div>
    <div id="visorPickBufferLineSide" class="visor-buffer-panel__line-side d-none">
      <label class="form-label visor-buffer-panel__side-label" for="visorPickBufferLineSideSelect">Inundación (línea / río)</label>
      <select id="visorPickBufferLineSideSelect" class="form-select form-select-sm">
        <option value="left">Lado izquierdo (A→B)</option>
        <option value="right">Lado derecho (A→B)</option>
        <option value="both" selected>Ambos lados (corredor)</option>
      </select>
    </div>
    <div class="visor-buffer-panel__actions">
      <button type="button" id="visorPickBufferApply" class="btn btn-sm btn-outline-primary" disabled>Generar área de influencia</button>
      <button type="button" id="visorPickBufferClear" class="btn btn-sm btn-outline-secondary">Limpiar</button>
    </div>
    <div class="visor-pick-buffer-panel__status visor-buffer-panel__status small" role="status" hidden></div>
  `;

  el.querySelector("#visorPickBufferApply")?.addEventListener("click", () => void applyPickBuffer());
  el.querySelector("#visorPickBufferClear")?.addEventListener("click", () => {
    clearPickSelection({ keepPanelOpen: true });
  });

  if (host) {
    const bufferPanel = host.querySelector(".visor-buffer-panel:not(.visor-pick-buffer-panel)");
    if (bufferPanel) host.insertBefore(el, bufferPanel.nextSibling);
    else host.appendChild(el);
  } else {
    map.getContainer().appendChild(el);
  }

  el.hidden = true;
  _panelEl = el;
  return el;
}

function onVisorBufferCleared() {
  const map = _mapRef || getLeafletMap();
  _pickedFeature = null;
  _highlightFetchGen += 1;
  clearPickHighlight(map);
  setStatus("");
  syncPickPanelUi();
}

function bindCloseListener() {
  if (typeof window === "undefined") return;
  if (!_closeListener) {
    _closeListener = () => closeVisorFeaturePickBuffer();
    window.addEventListener("atlas:visor-close-pick-buffer", _closeListener);
  }
  if (!_bufferClearedListener) {
    _bufferClearedListener = onVisorBufferCleared;
    window.addEventListener("atlas:visor-buffer-cleared", _bufferClearedListener);
  }
}

function unbindCloseListener() {
  if (typeof window === "undefined") return;
  if (_closeListener) {
    window.removeEventListener("atlas:visor-close-pick-buffer", _closeListener);
  }
  _closeListener = null;
  if (_bufferClearedListener) {
    window.removeEventListener("atlas:visor-buffer-cleared", _bufferClearedListener);
  }
  _bufferClearedListener = null;
}

function attachToMap(map) {
  _mapRef = map;
  mountPickPanel(map);
  schedulePickButtonInjection(map);
  bindMapClick(map);
  bindCloseListener();
  if (!map.__visorPickHighlightRestackBound) {
    map.__visorPickHighlightRestackBound = true;
    const refocus = () => raisePickHighlightLayers(map);
    map.on("moveend", refocus);
    map.on("zoomend", refocus);
  }
  map.once("idle", () => schedulePickButtonInjection(map));
}

function tryAttach(attempt = 0) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 24) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  attachToMap(map);
}

export function attachVisorFeaturePickBuffer() {
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorFeaturePickBuffer() {
  const map = _mapRef || getLeafletMap();
  unbindCloseListener();
  unbindMapClick(map);
  if (map?.getCanvas()) map.getCanvas().style.cursor = "";
  _highlightFetchGen += 1;
  clearPickHighlight(map);
  for (const id of [
    PICK_HIGHLIGHT_CIRCLE,
    PICK_HIGHLIGHT_LINE,
    PICK_HIGHLIGHT_LINE_HALO,
    PICK_HIGHLIGHT_OUTLINE,
    PICK_HIGHLIGHT_OUTLINE_HALO,
    "atlas-visor-pick-highlight-fill",
    "atlas-visor-pick-highlight-poly-halo",
    "atlas-visor-pick-highlight-poly-line",
  ]) {
    if (map?.getLayer(id)) {
      try {
        map.removeLayer(id);
      } catch {
        /* noop */
      }
    }
  }
  if (map?.getSource(PICK_HIGHLIGHT_SRC)) {
    try {
      map.removeSource(PICK_HIGHLIGHT_SRC);
    } catch {
      /* noop */
    }
  }
  _toggleBtn?.remove();
  _toggleBtn = null;
  _panelEl?.remove();
  _panelEl = null;
  _pickedFeature = null;
  clearPickAoi(false);
  _pickActive = false;
  _panelOpen = false;
  _mapRef = null;
}

export function refreshVisorFeaturePickBuffer() {
  const map = getLeafletMap();
  if (!map) return;
  attachToMap(map);
  schedulePickButtonInjection(map);
  if (_panelEl) _panelEl.hidden = !_panelOpen;
  setPickModeActive(_panelOpen);
}

/** Cierra el modo selección (p. ej. al abrir buffer por dibujo). */
/** Verdadero cuando el panel de selección para buffer está activo (evita conflicto con map-on-click). */
export function isVisorFeaturePickBusy() {
  return _pickActive && _panelOpen;
}

export function closeVisorFeaturePickBuffer() {
  setPickPanelOpen(false);
}
