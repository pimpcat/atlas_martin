/**
 * Herramientas de dibujo en el Visor geográfico — MapboxDraw + geodesic + MapLibre.
 * Polígonos/círculos → análisis espacial · Líneas → medición con Turf.
 */
import { getLeafletMap, whenAtlasMapReady } from "./map.js";

let _draw = null;
let _areaEl = null;
let _mapRef = null;
let _onDrawChange = null;
let _lastPolygonFeature = null;
let _drawGeodesicReady = false;
let _circleClickMode = false;
let _circleClickHandler = null;
let _circleModeChangeHandler = null;
let _radiusDialogEl = null;
let _radiusDialogOutsideHandler = null;
let _pendingCircleCenter = null;

const DRAW_CONTROL_POSITION = "top-right";

/** Trazo de medición: alto contraste sobre OSM, satélite y relieve. */
const MEASURE_LINE_CORE = "#FF1F8F";
const MEASURE_LINE_ACTIVE = "#FFD400";
const MEASURE_LINE_HALO = "#FFFFFF";
const MEASURE_LINE_CASING = "#0B1F33";
const MEASURE_POLYGON_STROKE = "#FF1F8F";
const MEASURE_POLYGON_ACTIVE = "#FFD400";
const MEASURE_POLYGON_FILL_OPACITY = 0.24;
const MEASURE_POLYGON_FILL_OPACITY_ACTIVE = 0.32;

const MEASURE_LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 5.5, 16, 7, 20, 9];
const MEASURE_LINE_CASING_WIDTH = ["interpolate", ["linear"], ["zoom"], 8, 6, 12, 8, 16, 10, 20, 12];
const MEASURE_LINE_HALO_WIDTH = ["interpolate", ["linear"], ["zoom"], 8, 8, 12, 10, 16, 13, 20, 16];

const DRAW_LINE_LAYER_RE = /^gl-draw-line/;
const DRAW_POLYGON_LAYER_RE = /^gl-draw-polygon/;
const POLYGON_FILTER = ["==", "$type", "Polygon"];
const ACTIVE_EXPR = ["==", ["get", "active"], "true"];

function cloneDrawThemeLayer(layer) {
  return {
    ...layer,
    layout: layer.layout ? { ...layer.layout } : undefined,
    paint: layer.paint ? { ...layer.paint } : undefined,
    filter: Array.isArray(layer.filter) ? JSON.parse(JSON.stringify(layer.filter)) : layer.filter,
  };
}

/** Tema por defecto de MapboxDraw (fallback si el bundle no expone lib.theme). */
function fallbackDrawTheme() {
  const blue = "#3bb2d0";
  const orange = "#fbb03b";
  const white = "#fff";
  return [
    {
      id: "gl-draw-polygon-fill",
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"]],
      paint: {
        "fill-color": ["case", ["==", ["get", "active"], "true"], orange, blue],
        "fill-opacity": 0.1,
      },
    },
    {
      id: "gl-draw-lines",
      type: "line",
      filter: ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["==", ["get", "active"], "true"], orange, blue],
        "line-dasharray": ["case", ["==", ["get", "active"], "true"], ["literal", [0.2, 2]], ["literal", [2, 0]]],
        "line-width": 2,
      },
    },
    {
      id: "gl-draw-point-outer",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 7, 5],
        "circle-color": white,
      },
    },
    {
      id: "gl-draw-point-inner",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 5, 3],
        "circle-color": ["case", ["==", ["get", "active"], "true"], orange, blue],
      },
    },
    {
      id: "gl-draw-vertex-outer",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"], ["!=", "mode", "simple_select"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 8, 6],
        "circle-color": white,
      },
    },
    {
      id: "gl-draw-vertex-inner",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"], ["!=", "mode", "simple_select"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 6, 4],
        "circle-color": MEASURE_LINE_ACTIVE,
      },
    },
    {
      id: "gl-draw-midpoint",
      type: "circle",
      filter: ["all", ["==", "meta", "midpoint"]],
      paint: {
        "circle-radius": 4,
        "circle-color": MEASURE_LINE_ACTIVE,
      },
    },
  ];
}

function getDefaultDrawTheme(MapboxDraw) {
  const theme = MapboxDraw?.lib?.theme || MapboxDraw?.constants?.theme;
  if (Array.isArray(theme) && theme.length) {
    return theme.map(cloneDrawThemeLayer);
  }
  return fallbackDrawTheme();
}

function buildMeasurePolygonLayers() {
  const lineCap = { "line-cap": "round", "line-join": "round" };
  const strokeColor = ["case", ACTIVE_EXPR, MEASURE_POLYGON_ACTIVE, MEASURE_POLYGON_STROKE];
  const fillColor = ["case", ACTIVE_EXPR, MEASURE_POLYGON_ACTIVE, MEASURE_POLYGON_STROKE];
  const fillOpacity = ["case", ACTIVE_EXPR, MEASURE_POLYGON_FILL_OPACITY_ACTIVE, MEASURE_POLYGON_FILL_OPACITY];

  return [
    {
      id: "gl-draw-polygon-fill",
      type: "fill",
      filter: POLYGON_FILTER,
      paint: {
        "fill-color": fillColor,
        "fill-opacity": fillOpacity,
        "fill-outline-color": "transparent",
      },
    },
    {
      id: "gl-draw-polygon-line-halo",
      type: "line",
      filter: POLYGON_FILTER,
      layout: lineCap,
      paint: {
        "line-color": MEASURE_LINE_HALO,
        "line-width": MEASURE_LINE_HALO_WIDTH,
        "line-opacity": 0.92,
      },
    },
    {
      id: "gl-draw-polygon-line-casing",
      type: "line",
      filter: POLYGON_FILTER,
      layout: lineCap,
      paint: {
        "line-color": MEASURE_LINE_CASING,
        "line-width": MEASURE_LINE_CASING_WIDTH,
        "line-opacity": 0.88,
      },
    },
    {
      id: "gl-draw-polygon-line-core",
      type: "line",
      filter: POLYGON_FILTER,
      layout: lineCap,
      paint: {
        "line-color": strokeColor,
        "line-width": MEASURE_LINE_WIDTH,
        "line-opacity": 1,
      },
    },
  ];
}

function buildMeasureLineLayers() {
  const lineCap = { "line-cap": "round", "line-join": "round" };
  const lineFilter = ["all", ["==", "$type", "LineString"]];
  const activeColor = ["case", ["==", ["get", "active"], "true"], MEASURE_LINE_ACTIVE, MEASURE_LINE_CORE];

  return [
    {
      id: "gl-draw-line-halo",
      type: "line",
      filter: lineFilter,
      layout: lineCap,
      paint: {
        "line-color": MEASURE_LINE_HALO,
        "line-width": MEASURE_LINE_HALO_WIDTH,
        "line-opacity": 0.95,
      },
    },
    {
      id: "gl-draw-line-casing",
      type: "line",
      filter: lineFilter,
      layout: lineCap,
      paint: {
        "line-color": MEASURE_LINE_CASING,
        "line-width": MEASURE_LINE_CASING_WIDTH,
        "line-opacity": 0.88,
      },
    },
    {
      id: "gl-draw-line-core",
      type: "line",
      filter: lineFilter,
      layout: lineCap,
      paint: {
        "line-color": activeColor,
        "line-width": MEASURE_LINE_WIDTH,
        "line-opacity": 1,
        "line-dasharray": ["case", ["==", ["get", "active"], "true"], ["literal", [1.4, 1.1]], ["literal", [1, 0]]],
      },
    },
  ];
}

/** Estilos Draw del visor: polígonos/círculos y líneas visibles sobre cualquier mapa base. */
function buildVisorDrawStyles(MapboxDraw) {
  const base = getDefaultDrawTheme(MapboxDraw);
  const rest = base.filter((layer) => {
    if (layer.id === "gl-draw-polygon-fill") return false;
    if (layer.type === "line" && (layer.id === "gl-draw-lines" || DRAW_LINE_LAYER_RE.test(layer.id))) {
      return false;
    }
    if (DRAW_POLYGON_LAYER_RE.test(layer.id)) return false;
    return true;
  });

  return [...rest, ...buildMeasurePolygonLayers(), ...buildMeasureLineLayers()];
}

function patchLegacyDrawStyleLayers(map) {
  if (!map?.getStyle?.()?.layers) return;
  for (const layer of map.getStyle().layers) {
    if (layer.id === "gl-draw-polygon-fill" && layer.type === "fill") {
      try {
        map.setPaintProperty(layer.id, "fill-color", MEASURE_POLYGON_STROKE);
        map.setPaintProperty(layer.id, "fill-opacity", MEASURE_POLYGON_FILL_OPACITY);
      } catch {
        /* capa en transición */
      }
      continue;
    }
    if (layer.type !== "line" || !DRAW_LINE_LAYER_RE.test(layer.id)) continue;
    if (layer.id.includes("halo") || layer.id.includes("casing") || layer.id.includes("core")) continue;
    try {
      map.setLayoutProperty(layer.id, "line-cap", "round");
      map.setLayoutProperty(layer.id, "line-join", "round");
      map.setPaintProperty(layer.id, "line-color", MEASURE_LINE_CORE);
      map.setPaintProperty(layer.id, "line-width", MEASURE_LINE_WIDTH);
      map.setPaintProperty(layer.id, "line-opacity", 1);
      map.setPaintProperty(layer.id, "line-dasharray", [1, 0]);
    } catch {
      /* capa en transición */
    }
  }
}

function scheduleDrawLineStylePatch(map) {
  if (!map) return;
  const run = () => patchLegacyDrawStyleLayers(map);
  if (map.isStyleLoaded?.()) {
    requestAnimationFrame(run);
  } else {
    map.once("load", run);
  }
}

function getMapboxDraw() {
  if (typeof MapboxDraw !== "undefined") return MapboxDraw;
  if (typeof window !== "undefined" && window.MapboxDraw) return window.MapboxDraw;
  return null;
}

function getMapboxDrawGeodesic() {
  if (typeof MapboxDrawGeodesic !== "undefined") return MapboxDrawGeodesic;
  if (typeof window !== "undefined" && window.MapboxDrawGeodesic) return window.MapboxDrawGeodesic;
  return null;
}

function getTurf() {
  if (typeof turf !== "undefined") return turf;
  if (typeof window !== "undefined" && window.turf) return window.turf;
  return null;
}

function buildDrawModes(MapboxDraw) {
  const Geodesic = getMapboxDrawGeodesic();
  if (Geodesic?.enable) {
    return Geodesic.enable(Object.assign({}, MapboxDraw.modes));
  }
  return Object.assign({}, MapboxDraw.modes);
}

function isPolygonLikeFeature(feature) {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

function isLineFeature(feature) {
  const t = feature?.geometry?.type;
  return t === "LineString" || t === "MultiLineString";
}

/** Polígono/círculo cerrado apto para análisis espacial (descarta geometrías degeneradas). */
function isAnalysisPolygon(feature) {
  if (!feature?.geometry || !isPolygonLikeFeature(feature)) return false;

  const Geodesic = getMapboxDrawGeodesic();
  if (Geodesic?.isCircle?.(feature)) {
    try {
      const radius = Geodesic.getCircleRadius(feature);
      return Number.isFinite(radius) && radius > 0;
    } catch {
      return false;
    }
  }

  const ring =
    feature.geometry.type === "Polygon"
      ? feature.geometry.coordinates?.[0]
      : feature.geometry.coordinates?.[0]?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;

  const turfLib = getTurf();
  if (!turfLib) return true;
  try {
    return turfLib.area(feature) > 1;
  } catch {
    return false;
  }
}

const CIRCLE_POLYGON_STEPS = 64;
const EARTH_RADIUS_KM = 6371.0088;

function geodesicDestination([lng, lat], distanceKm, bearingDeg) {
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const δ = distanceKm / EARTH_RADIUS_KM;
  const θ = (bearingDeg * Math.PI) / 180;
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

function buildGeodesicCircleRing(center, radiusKm, steps = CIRCLE_POLYGON_STEPS) {
  const ring = [];
  for (let i = 0; i < steps; i += 1) {
    ring.push(geodesicDestination(center, radiusKm, (360 * -i) / steps));
  }
  ring.push(ring[0]);
  return ring;
}

/**
 * MapboxDrawGeodesic guarda círculos como polígono degenerado (4 vértices en el centro)
 * + propiedad circleRadius (km). Hay que expandirlos antes de medir o enviar al API.
 * @param {object} feature
 */
function expandGeodesicCircleFeature(feature) {
  const Geodesic = getMapboxDrawGeodesic();
  if (!Geodesic?.isCircle?.(feature)) return null;

  const center = Geodesic.getCircleCenter(feature);
  const radiusKm = Geodesic.getCircleRadius(feature);
  if (!center || !Number.isFinite(radiusKm) || radiusKm <= 0) return null;

  const props = { ...(feature.properties || {}) };
  delete props.circleRadius;
  delete props.circleHandleBearing;

  const turfLib = getTurf();
  if (turfLib?.circle) {
    const expanded = turfLib.circle(center, radiusKm, {
      steps: CIRCLE_POLYGON_STEPS,
      units: "kilometers",
      properties: props,
    });
    if (feature.id != null) expanded.id = feature.id;
    return expanded;
  }

  return {
    type: "Feature",
    id: feature.id,
    properties: props,
    geometry: { type: "Polygon", coordinates: [buildGeodesicCircleRing(center, radiusKm)] },
  };
}

/**
 * Convierte círculos geodésicos a polígono denso WGS84 antes de enviar al API.
 * @param {object|null} feature
 */
export function normalizePolygonForAnalysis(feature) {
  if (!feature) return null;
  const Geodesic = getMapboxDrawGeodesic();
  if (Geodesic?.isCircle?.(feature)) {
    try {
      return expandGeodesicCircleFeature(feature);
    } catch {
      return null;
    }
  }
  return isAnalysisPolygon(feature) ? feature : null;
}

/** MapLibre usa clases maplibregl-ctrl; MapboxDraw las trae como mapboxgl-ctrl por defecto. */
function patchMapboxDrawForMapLibre() {
  const Draw = getMapboxDraw();
  const classes = Draw?.constants?.classes;
  if (!classes) return;
  classes.CONTROL_BASE = "maplibregl-ctrl";
  classes.CONTROL_PREFIX = "maplibregl-ctrl-";
  classes.CONTROL_GROUP = "maplibregl-ctrl-group";
  classes.ATTRIBUTION = "maplibregl-ctrl-attrib";
}

/**
 * @param {number} m2
 * @returns {string|null}
 */
export function formatDrawArea(m2) {
  if (!Number.isFinite(m2) || m2 <= 0) return null;
  if (m2 >= 1_000_000) {
    return `${(m2 / 1_000_000).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km²`;
  }
  if (m2 >= 10_000) {
    return `${(m2 / 10_000).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ha`;
  }
  return `${m2.toLocaleString("es-MX", { maximumFractionDigits: 0 })} m²`;
}

/**
 * @param {number} km
 * @returns {string|null}
 */
export function formatDrawLength(km) {
  if (!Number.isFinite(km) || km <= 0) return null;
  if (km >= 1) {
    return `${km.toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km`;
  }
  const m = km * 1000;
  return `${m.toLocaleString("es-MX", { maximumFractionDigits: 0 })} m`;
}

/**
 * @param {object} draw
 */
function sumDrawPolygonAreas(draw) {
  const turfLib = getTurf();
  if (!turfLib || !draw) return { count: 0, m2: 0 };

  const fc = draw.getAll();
  let m2 = 0;
  let count = 0;
  for (const f of fc.features || []) {
    const measurable = normalizePolygonForAnalysis(f);
    if (!measurable) continue;
    try {
      m2 += turfLib.area(measurable);
      count += 1;
    } catch {
      /* geometría inválida en curso de edición */
    }
  }
  return { count, m2 };
}

/**
 * @param {object} draw
 */
function sumDrawLineLengths(draw) {
  const turfLib = getTurf();
  if (!turfLib || !draw) return { count: 0, km: 0 };

  const fc = draw.getAll();
  let km = 0;
  let count = 0;
  for (const f of fc.features || []) {
    if (!isLineFeature(f)) continue;
    try {
      km += turfLib.length(f, { units: "kilometers" });
      count += 1;
    } catch {
      /* línea en edición */
    }
  }
  return { count, km };
}

function syncDrawMeasurePanel() {
  if (!_areaEl) return;
  if (!_draw) {
    _areaEl.hidden = true;
    syncVisorToolsExtrasVisibility();
    return;
  }

  const { count: polyCount, m2 } = sumDrawPolygonAreas(_draw);
  const { count: lineCount, km } = sumDrawLineLengths(_draw);
  const parts = [];

  if (polyCount > 0) {
    const areaLabel = formatDrawArea(m2);
    const polySuffix = polyCount === 1 ? "1 polígono" : `${polyCount} polígonos`;
    if (areaLabel) parts.push(`Área: ${areaLabel} (${polySuffix})`);
  }

  if (lineCount > 0) {
    const distLabel = formatDrawLength(km);
    const lineSuffix = lineCount === 1 ? "1 línea" : `${lineCount} líneas`;
    if (distLabel) parts.push(`Distancia: ${distLabel} (${lineSuffix})`);
  }

  if (!parts.length) {
    _areaEl.hidden = true;
    _areaEl.textContent = "";
    syncVisorToolsExtrasVisibility();
    return;
  }

  _areaEl.textContent = parts.join(" · ");
  _areaEl.hidden = false;
  syncVisorToolsExtrasVisibility();
}

let _toolsExtrasHost = null;

/** Contenedor apilado bajo el buscador: medidor de área + análisis espacial. */
export function ensureVisorToolsExtrasHost(map) {
  if (!map?.getContainer) return null;

  const stack = map.getContainer().querySelector(".maplibregl-ctrl-top-left");
  if (!stack) return _toolsExtrasHost;

  if (!_toolsExtrasHost) {
    const host = document.createElement("div");
    host.className = "visor-map-tools-extras";
    host.hidden = true;
    _toolsExtrasHost = host;
  }

  if (_toolsExtrasHost.parentElement !== stack) {
    stack.appendChild(_toolsExtrasHost);
  }

  return _toolsExtrasHost;
}

export function syncVisorToolsExtrasVisibility() {
  if (!_toolsExtrasHost) return;
  const visible = [..._toolsExtrasHost.children].some((el) => !el.hidden);
  _toolsExtrasHost.hidden = !visible;
}

function mountInToolsExtras(map, el, { before } = {}) {
  const host = ensureVisorToolsExtrasHost(map);
  if (host && el.parentElement !== host) {
    if (before) host.insertBefore(el, before);
    else host.appendChild(el);
  } else if (!el.isConnected) {
    map.getContainer().appendChild(el);
  }
  syncVisorToolsExtrasVisibility();
}

function removeToolsExtrasHost() {
  _toolsExtrasHost?.remove();
  _toolsExtrasHost = null;
}

function pickLatestPolygon(draw) {
  if (!draw) return null;
  let latest = null;
  for (const f of draw.getAll().features || []) {
    if (isAnalysisPolygon(f)) latest = f;
  }
  return latest;
}

function syncPolygonAnalysisTarget() {
  _lastPolygonFeature = pickLatestPolygon(_draw);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("atlas:visor-polygon-closed", {
        detail: { feature: _lastPolygonFeature },
      })
    );
  }
  return _lastPolygonFeature;
}

function onDrawChange() {
  syncDrawMeasurePanel();
  syncPolygonAnalysisTarget();
}

function bindDrawEvents(map, draw) {
  if (_onDrawChange) return;
  _onDrawChange = onDrawChange;
  for (const ev of ["draw.create", "draw.update", "draw.delete", "draw.selectionchange"]) {
    map.on(ev, _onDrawChange);
  }
}

function unbindDrawEvents(map) {
  if (!map || !_onDrawChange) return;
  for (const ev of ["draw.create", "draw.update", "draw.delete", "draw.selectionchange"]) {
    map.off(ev, _onDrawChange);
  }
  _onDrawChange = null;
}

function ensureAreaPanel(map) {
  const host = ensureVisorToolsExtrasHost(map);
  const beforeTrigger = host?.querySelector(".visor-spatial-trigger") || null;

  if (_areaEl?.isConnected) {
    mountInToolsExtras(map, _areaEl, { before: beforeTrigger });
    return _areaEl;
  }

  const el = document.createElement("div");
  el.className = "visor-draw-area";
  el.setAttribute("aria-live", "polite");
  el.hidden = true;
  _areaEl = el;
  mountInToolsExtras(map, el, { before: beforeTrigger });
  return el;
}

function removeAreaPanel() {
  _areaEl?.remove();
  _areaEl = null;
  removeToolsExtrasHost();
}

export function findVisorDrawButtonGroup(map) {
  const root = map?.getContainer?.();
  if (!root) return null;
  const trash = root.querySelector(".mapbox-gl-draw_trash");
  if (trash?.parentElement) return trash.parentElement;
  const polygonBtn = root.querySelector(".mapbox-gl-draw_polygon");
  if (polygonBtn?.parentElement) return polygonBtn.parentElement;
  return root.querySelector(".maplibregl-ctrl-top-right .mapbox-gl-draw, .mapbox-gl-draw");
}

function findDrawButtonGroup(map) {
  return findVisorDrawButtonGroup(map);
}

function getDrawUiShell(map) {
  const container = map?.getContainer?.();
  if (!container) return null;
  return (
    container.closest(".visor-map-frame-wrap") ||
    container.closest(".map-frame-wrap") ||
    container.parentElement ||
    container
  );
}

function hideCircleRadiusDialog() {
  if (_radiusDialogOutsideHandler) {
    document.removeEventListener("mousedown", _radiusDialogOutsideHandler, true);
    _radiusDialogOutsideHandler = null;
  }
  _radiusDialogEl?.remove();
  _radiusDialogEl = null;
  _pendingCircleCenter = null;
}

function parseCircleRadiusMeters(raw) {
  const value = Number(String(raw ?? "").replace(",", ".").trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function createGeodesicCircleFeature(center, radiusMeters) {
  const Geodesic = getMapboxDrawGeodesic();
  const radiusKm = radiusMeters / 1000;
  if (Geodesic?.createCircle) {
    return Geodesic.createCircle(center, radiusKm);
  }
  return {
    type: "Feature",
    properties: { circleRadius: radiusKm },
    geometry: {
      type: "Polygon",
      coordinates: [[center, center, center, center]],
    },
  };
}

function addCircleFromRadiusDialog(draw, map, center, radiusMeters) {
  if (!draw || !map || !center || !radiusMeters) return false;
  try {
    const feature = createGeodesicCircleFeature(center, radiusMeters);
    const ids = draw.add(feature);
    const featureIds = Array.isArray(ids) ? ids.map(String) : [String(ids)];
    deactivateCircleClickMode(draw, map);
    draw.changeMode("simple_select", { featureIds });
    onDrawChange();
    return true;
  } catch (err) {
    console.warn("[visorDraw] círculo por radio:", err);
    return false;
  }
}

function showCircleRadiusDialog(draw, map, center) {
  hideCircleRadiusDialog();
  _pendingCircleCenter = center;

  const shell = getDrawUiShell(map);
  if (!shell) return;

  const picker = document.createElement("div");
  picker.className = "visor-draw-radius-picker";
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Radio del círculo en metros");

  const title = document.createElement("div");
  title.className = "visor-draw-radius-picker__title";
  title.textContent = "Radio del círculo";

  const hint = document.createElement("p");
  hint.className = "visor-draw-radius-picker__hint";
  hint.textContent = "Indica el radio en metros desde el punto elegido.";

  const field = document.createElement("label");
  field.className = "visor-draw-radius-picker__field";
  const fieldLabel = document.createElement("span");
  fieldLabel.textContent = "Radio (m)";
  const input = document.createElement("input");
  input.type = "number";
  input.className = "visor-draw-radius-picker__input";
  input.min = "1";
  input.step = "1";
  input.value = "500";
  input.inputMode = "decimal";
  field.append(fieldLabel, input);

  const actions = document.createElement("div");
  actions.className = "visor-draw-radius-picker__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "visor-draw-radius-picker__btn visor-draw-radius-picker__btn--ghost";
  cancelBtn.textContent = "Cancelar";

  const drawBtn = document.createElement("button");
  drawBtn.type = "button";
  drawBtn.className = "visor-draw-radius-picker__btn visor-draw-radius-picker__btn--primary";
  drawBtn.textContent = "Dibujar";

  const submit = () => {
    const meters = parseCircleRadiusMeters(input.value);
    if (!meters) {
      input.focus();
      input.select();
      return;
    }
    hideCircleRadiusDialog();
    addCircleFromRadiusDialog(draw, map, center, meters);
  };

  cancelBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    hideCircleRadiusDialog();
    if (_circleClickMode) {
      map.getCanvas().style.cursor = "crosshair";
    }
  });
  drawBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    submit();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      submit();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      hideCircleRadiusDialog();
      if (_circleClickMode) map.getCanvas().style.cursor = "crosshair";
    }
  });

  actions.append(cancelBtn, drawBtn);
  picker.append(title, hint, field, actions);
  shell.appendChild(picker);
  _radiusDialogEl = picker;

  _radiusDialogOutsideHandler = (ev) => {
    if (picker.contains(ev.target)) return;
    hideCircleRadiusDialog();
    if (_circleClickMode) map.getCanvas().style.cursor = "crosshair";
  };
  document.addEventListener("mousedown", _radiusDialogOutsideHandler, true);
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function deactivateCircleClickMode(draw, map) {
  _circleClickMode = false;
  hideCircleRadiusDialog();
  if (map && _circleClickHandler) {
    map.off("click", _circleClickHandler);
  }
  _circleClickHandler = null;
  const canvas = map?.getCanvas?.();
  if (canvas) canvas.style.cursor = "";
  const group = findDrawButtonGroup(map);
  group?.querySelector(".mapbox-gl-draw_circle")?.classList.remove("active");
  try {
    draw?.changeMode?.("simple_select");
  } catch {
    /* noop */
  }
}

function activateCircleClickMode(draw, map) {
  if (!draw || !map) return;
  const group = findDrawButtonGroup(map);
  deactivateCircleClickMode(draw, map);
  try {
    draw.changeMode("simple_select");
  } catch {
    /* noop */
  }
  _circleClickMode = true;
  group?.querySelectorAll(".mapbox-gl-draw_ctrl-draw-btn").forEach((el) => {
    el.classList.remove("active");
  });
  group?.querySelector(".mapbox-gl-draw_circle")?.classList.add("active");
  map.getCanvas().style.cursor = "crosshair";
  _circleClickHandler = (e) => {
    if (!_circleClickMode || _radiusDialogEl) return;
    if (e.originalEvent?.target?.closest?.(".maplibregl-ctrl, .mapbox-gl-draw")) return;
    showCircleRadiusDialog(draw, map, [e.lngLat.lng, e.lngLat.lat]);
  };
  map.on("click", _circleClickHandler);
}

function bindCircleModeGuards(map, draw) {
  if (!map || !draw || _circleModeChangeHandler) return;
  _circleModeChangeHandler = (e) => {
    if (!_circleClickMode) return;
    if (e.mode && e.mode !== "simple_select") {
      deactivateCircleClickMode(draw, map);
    }
  };
  map.on("draw.modechange", _circleModeChangeHandler);
}

function unbindCircleModeGuards(map) {
  if (!map || !_circleModeChangeHandler) return;
  map.off("draw.modechange", _circleModeChangeHandler);
  _circleModeChangeHandler = null;
}

function injectCircleDrawButton(draw, map) {
  const Geodesic = getMapboxDrawGeodesic();
  if (!draw || !Geodesic?.createCircle) return false;

  const group = findDrawButtonGroup(map || _mapRef);
  if (!group) return false;
  if (group.querySelector(".mapbox-gl-draw_circle")) return true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mapbox-gl-draw_ctrl-draw-btn mapbox-gl-draw_circle";
  btn.title = "Clic en el mapa e indica el radio en metros";
  btn.setAttribute("aria-label", "Dibujar círculo por radio en metros");
  btn.addEventListener("click", () => {
    try {
      if (_circleClickMode) {
        deactivateCircleClickMode(draw, map || _mapRef);
        return;
      }
      activateCircleClickMode(draw, map || _mapRef);
    } catch (err) {
      console.warn("[visorDraw] círculo por radio:", err);
    }
  });

  const trash = group.querySelector(".mapbox-gl-draw_trash");
  if (trash) group.insertBefore(btn, trash);
  else group.appendChild(btn);
  return true;
}

function scheduleCircleButtonInjection(draw, map, attempt = 0) {
  const circleOk = injectCircleDrawButton(draw, map);
  const trashOk = patchTrashDeleteButton(draw, map);
  const geodesic = getMapboxDrawGeodesic();
  if (trashOk && (circleOk || !geodesic?.createCircle)) return;
  if (attempt < 16) {
    setTimeout(() => scheduleCircleButtonInjection(draw, map, attempt + 1), 120);
  }
}

function drawHasCircleMode(draw) {
  return Boolean(getMapboxDrawGeodesic()?.createCircle);
}

/**
 * MapboxDraw solo borra features seleccionadas; tras buffer/modal a veces se pierde la selección.
 */
function patchTrashDeleteButton(draw, map) {
  const trash = findDrawButtonGroup(map)?.querySelector(".mapbox-gl-draw_trash");
  if (!draw || !trash || trash.dataset.atlasTrashPatch) return Boolean(trash.dataset.atlasTrashPatch);

  trash.dataset.atlasTrashPatch = "1";
  trash.addEventListener(
    "click",
    (e) => {
      const selected = draw.getSelectedIds?.() || [];
      if (selected.length > 0) return;

      const features = draw.getAll()?.features || [];
      if (features.length !== 1) return;

      const id = features[0]?.id;
      if (id == null) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        draw.changeMode?.("simple_select", { featureIds: [String(id)] });
      } catch {
        /* noop */
      }
      draw.delete(String(id));
    },
    true,
  );
  return true;
}

function ensureDrawControl(map) {
  const Geodesic = getMapboxDrawGeodesic();

  if (_draw && _mapRef === map) {
    if (Geodesic && !drawHasCircleMode(_draw)) {
      teardownDrawOnMap(map);
    } else {
      scheduleCircleButtonInjection(_draw, map);
      patchTrashDeleteButton(_draw, map);
      return _draw;
    }
  }

  const MapboxDraw = getMapboxDraw();
  if (!MapboxDraw) {
    console.warn("[visorDraw] MapboxDraw no está cargado (assets/mapbox-gl-draw.js).");
    return null;
  }

  if (!Geodesic) {
    console.warn("[visorDraw] MapboxDrawGeodesic no está cargado (assets/mapbox-gl-draw-geodesic.js).");
  }

  patchMapboxDrawForMapLibre();

  if (_draw && _mapRef) {
    teardownDrawOnMap(_mapRef);
  }

  _draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
      polygon: true,
      line_string: true,
      trash: true,
    },
    modes: buildDrawModes(MapboxDraw),
    defaultMode: "simple_select",
    styles: buildVisorDrawStyles(MapboxDraw),
  });

  map.addControl(_draw, DRAW_CONTROL_POSITION);
  _mapRef = map;
  scheduleDrawLineStylePatch(map);
  _drawGeodesicReady = Boolean(Geodesic && drawHasCircleMode(_draw));
  if (typeof window !== "undefined") {
    window.atlasVisorDraw = _draw;
  }
  ensureAreaPanel(map);
  bindDrawEvents(map, _draw);
  bindCircleModeGuards(map, _draw);
  scheduleCircleButtonInjection(_draw, map);
  syncDrawMeasurePanel();
  syncPolygonAnalysisTarget();
  return _draw;
}

function teardownDrawOnMap(map) {
  if (!map) return;
  deactivateCircleClickMode(_draw, map);
  unbindCircleModeGuards(map);
  unbindDrawEvents(map);
  if (_draw) {
    try {
      map.removeControl(_draw);
    } catch {
      /* control ya retirado */
    }
  }
  _draw = null;
  _mapRef = null;
  _lastPolygonFeature = null;
  _drawGeodesicReady = false;
  if (typeof window !== "undefined") {
    delete window.atlasVisorDraw;
    window.dispatchEvent(
      new CustomEvent("atlas:visor-polygon-closed", { detail: { feature: null } })
    );
  }
  removeAreaPanel();
}

function attachDrawWhenReady(map, attempt = 0) {
  if (!map?.getContainer?.()?.isConnected) {
    if (attempt < 12) setTimeout(() => attachDrawWhenReady(map, attempt + 1), 150);
    return;
  }
  ensureDrawControl(map);
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 30) setTimeout(() => tryAttach(attempt + 1), 150);
    return;
  }
  attachDrawWhenReady(map);
  map.once("idle", () => attachDrawWhenReady(map));
  setTimeout(() => attachDrawWhenReady(map), 350);
}

/** Activa dibujo de polígonos en el visor geográfico. */
export function attachVisorDraw() {
  whenAtlasMapReady((map) => {
    requestAnimationFrame(() => tryAttach(0));
    map.once("idle", () => attachDrawWhenReady(map));
  });
}

/** Retira controles y limpia estado al salir del visor. */
export function teardownVisorDraw() {
  const map = _mapRef || getLeafletMap();
  teardownDrawOnMap(map);
}

/** Instancia MapboxDraw activa (null fuera del visor). */
export function getVisorDrawControl() {
  return _draw;
}

/** Último polígono/círculo válido en el visor (null si solo hay líneas o el mapa está vacío). */
export function getLastDrawnPolygonFeature() {
  return pickLatestPolygon(_draw);
}

/** Fuerza re-sincronización del botón de análisis espacial. */
export function refreshPolygonAnalysisTarget() {
  return syncPolygonAnalysisTarget();
}

/** Re-sincroniza panel de área y controles tras resize o reentrada al visor. */
export function refreshVisorDraw() {
  const map = getLeafletMap();
  if (!map) return;
  ensureAreaPanel(map);
  syncDrawMeasurePanel();
  if (!_draw || _mapRef !== map) {
    attachDrawWhenReady(map);
    map.once("idle", () => attachDrawWhenReady(map));
    return;
  }
  scheduleCircleButtonInjection(_draw, map);
  patchTrashDeleteButton(_draw, map);
  syncPolygonAnalysisTarget();
  ensureVisorToolsExtrasHost(map);
}
