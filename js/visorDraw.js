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

const DRAW_CONTROL_POSITION = "top-right";

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

function injectCircleDrawButton(draw, map) {
  const Geodesic = getMapboxDrawGeodesic();
  if (!draw || !Geodesic?.enable) return false;
  if (!draw.options?.modes?.draw_circle) return false;

  const group = findDrawButtonGroup(map || _mapRef);
  if (!group) return false;
  if (group.querySelector(".mapbox-gl-draw_circle")) return true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mapbox-gl-draw_ctrl-draw-btn mapbox-gl-draw_circle";
  btn.title = "Dibujar círculo geodésico";
  btn.setAttribute("aria-label", "Dibujar círculo");
  btn.addEventListener("click", () => {
    try {
      const active = draw.getMode?.() === "draw_circle";
      group.querySelectorAll(".mapbox-gl-draw_ctrl-draw-btn").forEach((el) => {
        el.classList.remove("active");
      });
      if (active) {
        draw.changeMode("simple_select");
      } else {
        btn.classList.add("active");
        draw.changeMode("draw_circle");
      }
    } catch (err) {
      console.warn("[visorDraw] draw_circle:", err);
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
  if (trashOk && (circleOk || !geodesic?.enable)) return;
  if (attempt < 16) {
    setTimeout(() => scheduleCircleButtonInjection(draw, map, attempt + 1), 120);
  }
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
    true
  );
  return true;
}

function drawHasCircleMode(draw) {
  return Boolean(draw?.options?.modes?.draw_circle);
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
  });

  map.addControl(_draw, DRAW_CONTROL_POSITION);
  _mapRef = map;
  _drawGeodesicReady = Boolean(Geodesic && drawHasCircleMode(_draw));
  if (typeof window !== "undefined") {
    window.atlasVisorDraw = _draw;
  }
  ensureAreaPanel(map);
  bindDrawEvents(map, _draw);
  scheduleCircleButtonInjection(_draw, map);
  syncDrawMeasurePanel();
  syncPolygonAnalysisTarget();
  return _draw;
}

function teardownDrawOnMap(map) {
  if (!map) return;
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
