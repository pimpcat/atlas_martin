/**
 * Buffer / área de influencia en el Visor geográfico.
 * Mantiene el elemento original en MapboxDraw y muestra el buffer en capa aparte.
 */
import { getLeafletMap, whenAtlasMapReady } from "./map.js";
import {
  ensureVisorToolsExtrasHost,
  syncVisorToolsExtrasVisibility,
  getVisorDrawControl,
  normalizePolygonForAnalysis,
  findVisorDrawButtonGroup,
  refreshPolygonAnalysisTarget,
} from "./visorDraw.js";

const SOURCE_ID = "atlas-visor-buffer-src";
const FILL_LAYER_ID = "atlas-visor-buffer-fill";
const LINE_LAYER_ID = "atlas-visor-buffer-line";

let _panelEl = null;
let _toggleBtn = null;
let _mapRef = null;
let _onDrawChange = null;
let _bufferFeature = null;
let _sourceFeatureId = null;
let _panelOpen = false;

function getTurf() {
  if (typeof turf !== "undefined") return turf;
  if (typeof window !== "undefined" && window.turf) return window.turf;
  return null;
}

function isLineFeature(feature) {
  const t = feature?.geometry?.type;
  return t === "LineString" || t === "MultiLineString";
}

function isPolygonLikeFeature(feature) {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

function isCircleFeature(feature) {
  const Geodesic = typeof MapboxDrawGeodesic !== "undefined" ? MapboxDrawGeodesic : window.MapboxDrawGeodesic;
  return Boolean(Geodesic?.isCircle?.(feature));
}

/** Polígono activo para análisis espacial (buffer generado). */
export function getActiveBufferFeature() {
  return _bufferFeature;
}

function setStatus(msg, isError = false) {
  const el = _panelEl?.querySelector(".visor-buffer-panel__status");
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

function getSelectedDrawFeature() {
  const draw = getVisorDrawControl();
  if (!draw) return null;
  const features = draw.getSelected()?.features || [];
  if (features.length !== 1) return null;
  return features[0];
}

function describeFeature(feature) {
  if (!feature?.geometry) return "elemento";
  if (isLineFeature(feature)) return "línea";
  if (isCircleFeature(feature)) return "círculo";
  if (isPolygonLikeFeature(feature)) return "polígono";
  return "elemento";
}

function syncLineSideVisibility(feature) {
  const wrap = _panelEl?.querySelector("#visorBufferLineSide");
  if (!wrap) return;
  wrap.classList.toggle("d-none", !feature || !isLineFeature(feature));
}

function setBufferPanelOpen(open) {
  _panelOpen = Boolean(open);
  if (_panelEl) _panelEl.hidden = !_panelOpen;
  if (_toggleBtn) {
    _toggleBtn.classList.toggle("active", _panelOpen);
    _toggleBtn.setAttribute("aria-expanded", _panelOpen ? "true" : "false");
  }
  syncVisorToolsExtrasVisibility();
  if (_panelOpen) syncBufferPanelUi();
}

function toggleBufferPanel() {
  const map = _mapRef || getLeafletMap();
  const draw = getVisorDrawControl();

  if (!_panelOpen) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("atlas:visor-close-pick-buffer"));
    }
    try {
      draw?.changeMode?.("simple_select");
    } catch {
      /* noop */
    }
    const group = findVisorDrawButtonGroup(map);
    group?.querySelectorAll(".mapbox-gl-draw_ctrl-draw-btn").forEach((el) => {
      if (!el.classList.contains("mapbox-gl-draw_buffer")) el.classList.remove("active");
    });
  } else {
    syncBufferPanelUi();
  }

  setBufferPanelOpen(!_panelOpen);
}

function injectBufferToggleButton(map) {
  const group = findVisorDrawButtonGroup(map);
  if (!group) return false;
  if (group.querySelector(".mapbox-gl-draw_buffer")) {
    _toggleBtn = group.querySelector(".mapbox-gl-draw_buffer");
    return true;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mapbox-gl-draw_ctrl-draw-btn mapbox-gl-draw_buffer";
  btn.title = "Área de influencia (buffer)";
  btn.setAttribute("aria-label", "Área de influencia (buffer)");
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", () => toggleBufferPanel());

  const trash = group.querySelector(".mapbox-gl-draw_trash");
  if (trash) trash.insertAdjacentElement("afterend", btn);
  else group.appendChild(btn);

  _toggleBtn = btn;
  return true;
}

function scheduleBufferButtonInjection(map, attempt = 0) {
  if (injectBufferToggleButton(map)) return;
  if (attempt < 16) {
    setTimeout(() => scheduleBufferButtonInjection(map, attempt + 1), 120);
  }
}

function syncBufferPanelUi() {
  if (!_panelEl || _panelEl.hidden) return;
  const feature = getSelectedDrawFeature();
  const hint = _panelEl.querySelector(".visor-buffer-panel__hint");
  const applyBtn = _panelEl.querySelector("#visorBufferApply");
  const clearBtn = _panelEl.querySelector("#visorBufferClear");

  syncLineSideVisibility(feature);

  if (hint) {
    if (!feature) {
      hint.textContent = "Selecciona una línea, polígono o círculo dibujado en el mapa.";
    } else {
      hint.textContent = `Seleccionado: ${describeFeature(feature)} · trazo A→B define izquierda/derecha en líneas.`;
    }
  }

  if (applyBtn) applyBtn.disabled = !feature;
  if (clearBtn) clearBtn.classList.toggle("d-none", !_bufferFeature);
}

function findDrawLayerInsertBefore(map) {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    if (layer.id.includes("gl-draw")) return layer.id;
  }
  return undefined;
}

function ensureBufferLayers(map) {
  if (!map?.isStyleLoaded?.()) return false;

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  const beforeId = findDrawLayerInsertBefore(map);

  if (!map.getLayer(FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": "#1e88e5",
          "fill-opacity": 0.38,
        },
      },
      beforeId
    );
  }

  if (!map.getLayer(LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#0d47a1",
          "line-width": 2,
          "line-dasharray": [2, 1.5],
        },
      },
      beforeId
    );
  }

  return true;
}

function setBufferLayerData(map, feature) {
  if (!map) return false;
  const data = {
    type: "FeatureCollection",
    features: feature ? [feature] : [],
  };
  const existing = map.getSource(SOURCE_ID);
  if (existing) {
    existing.setData(data);
    return true;
  }
  if (!feature) return false;
  if (!ensureBufferLayers(map)) return false;
  const src = map.getSource(SOURCE_ID);
  if (!src) return false;
  src.setData(data);
  return true;
}

function updateBufferLayer(map, feature) {
  setBufferLayerData(map, feature);
}

function removeBufferLayers(map) {
  if (!map?.getStyle?.()) return;
  for (const id of [LINE_LAYER_ID, FILL_LAYER_ID]) {
    if (map.getLayer(id)) {
      try {
        map.removeLayer(id);
      } catch {
        /* noop */
      }
    }
  }
  if (map.getSource(SOURCE_ID)) {
    try {
      map.removeSource(SOURCE_ID);
    } catch {
      /* noop */
    }
  }
}

function notifyAnalysisTarget() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("atlas:visor-polygon-closed", {
      detail: { feature: _bufferFeature },
    })
  );
}

/** Publica el polígono de buffer (p. ej. tras selección en mapa + PostGIS). */
export function publishVisorBufferFeature(feature, statusMessage) {
  const map = getLeafletMap() || _mapRef;
  _bufferFeature = feature;
  _sourceFeatureId = null;
  if (map) setBufferLayerData(map, feature);
  syncBufferPanelUi();
  if (statusMessage) setStatus(statusMessage, false);
  notifyAnalysisTarget();
  refreshPolygonAnalysisTarget();
}

export function clearVisorBuffer(options = {}) {
  const { silent = false } = options;
  const sourceId = _sourceFeatureId;
  _bufferFeature = null;
  _sourceFeatureId = null;
  const map = getLeafletMap() || _mapRef;
  if (map) setBufferLayerData(map, null);
  syncBufferPanelUi();

  if (sourceId != null) {
    const draw = getVisorDrawControl();
    const stillThere = draw?.getAll()?.features?.some((f) => f.id === sourceId);
    if (stillThere) {
      try {
        draw.changeMode("simple_select", { featureIds: [String(sourceId)] });
      } catch {
        try {
          draw.changeMode("simple_select");
        } catch {
          /* noop */
        }
      }
    }
  }

  if (!silent) {
    setStatus("");
    notifyAnalysisTarget();
    refreshPolygonAnalysisTarget();
  }
}

function parseDistanceMeters() {
  const raw = _panelEl?.querySelector("#visorBufferDistance")?.value;
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function bearingBetween(turfLib, a, b) {
  return turfLib.bearing(turfLib.point(a), turfLib.point(b));
}

function destinationPoint(turfLib, coord, distanceM, bearingDeg) {
  return turfLib.destination(turfLib.point(coord), distanceM, bearingDeg, { units: "meters" }).geometry
    .coordinates;
}

function primaryLineFeature(turfLib, feature) {
  const g = feature?.geometry;
  if (!g) return null;
  if (g.type === "LineString") return feature;
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
    let best = g.coordinates[0];
    for (const part of g.coordinates) {
      if (Array.isArray(part) && part.length > (best?.length || 0)) best = part;
    }
    if (!best?.length) return null;
    return turfLib.lineString(best, { ...(feature.properties || {}) });
  }
  return null;
}

function finalizeBufferPolygon(turfLib, poly, extraProps = {}) {
  let out = poly;
  if (turfLib.unkinkPolygon) {
    const unkinked = turfLib.unkinkPolygon(out);
    const parts = unkinked?.features || [];
    if (parts.length === 1) {
      out = parts[0];
    } else if (parts.length > 1 && turfLib.union) {
      out = parts.reduce((acc, part, idx) => (idx === 0 ? part : turfLib.union(acc, part)));
    }
  }
  if (turfLib.rewind) out = turfLib.rewind(out, { reverse: false });
  if (turfLib.cleanCoords) out = turfLib.cleanCoords(out);
  out.properties = { ...(out.properties || {}), ...extraProps };
  return out;
}

/** Buffer unilateral de línea (inundación a un lado del trazo A→B). */
function bufferLineOneSide(lineFeature, distanceM, side) {
  const turfLib = getTurf();
  if (!turfLib?.polygon || !turfLib?.bearing || !turfLib?.destination) {
    throw new Error("Turf no disponible para buffer de línea.");
  }

  const line = primaryLineFeature(turfLib, lineFeature) || lineFeature;
  const coords = line?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error("La línea debe tener al menos dos vértices.");
  }

  if (side === "both") {
    if (!turfLib.buffer) throw new Error("turf.buffer no disponible.");
    const buffered = turfLib.buffer(line, distanceM, { units: "meters", steps: 32 });
    return finalizeBufferPolygon(turfLib, buffered, {
      atlasBuffer: true,
      atlasBufferSide: side,
    });
  }

  const extraProps = { atlasBuffer: true, atlasBufferSide: side };

  if (turfLib.lineOffset) {
    const offsetDist = side === "left" ? -distanceM : distanceM;
    const offsetLine = turfLib.lineOffset(line, offsetDist, { units: "meters" });
    const offCoords = offsetLine?.geometry?.coordinates;
    if (Array.isArray(offCoords) && offCoords.length >= 2) {
      const ring = [...coords, ...offCoords.slice().reverse(), coords[0]];
      let poly = turfLib.polygon([ring], extraProps);
      return finalizeBufferPolygon(turfLib, poly, extraProps);
    }
  }

  const sign = side === "right" ? 1 : -1;
  const offsetCoords = [];
  for (let i = 0; i < coords.length; i += 1) {
    const azimuth =
      i < coords.length - 1
        ? bearingBetween(turfLib, coords[i], coords[i + 1])
        : bearingBetween(turfLib, coords[i - 1], coords[i]);
    offsetCoords.push(destinationPoint(turfLib, coords[i], distanceM, azimuth + 90 * sign));
  }

  const ring = [...coords, ...offsetCoords.reverse()];
  if (ring.length < 4) throw new Error("No se pudo generar el polígono de inundación.");
  ring.push(ring[0]);

  let poly = turfLib.polygon([ring], extraProps);
  return finalizeBufferPolygon(turfLib, poly, extraProps);
}

export function buildBufferFromSource(sourceFeature, distanceM, lineSide) {
  return buildBufferFeature(sourceFeature, distanceM, lineSide);
}

function buildBufferFeature(sourceFeature, distanceM, lineSide) {
  const turfLib = getTurf();
  if (!turfLib?.buffer && !isLineFeature(sourceFeature)) {
    throw new Error("turf.buffer no disponible.");
  }

  if (isLineFeature(sourceFeature)) {
    return bufferLineOneSide(sourceFeature, distanceM, lineSide || "both");
  }

  const base = normalizePolygonForAnalysis(sourceFeature) || sourceFeature;
  if (!base?.geometry) throw new Error("Geometría no válida para buffer.");

  let buffered = turfLib.buffer(base, distanceM, { units: "meters", steps: 32 });
  buffered.properties = {
    ...(buffered.properties || {}),
    atlasBuffer: true,
    atlasBufferSource: sourceFeature.id || null,
  };
  if (turfLib.rewind) buffered = turfLib.rewind(buffered, { reverse: false });
  return buffered;
}

function applyBuffer() {
  const draw = getVisorDrawControl();
  const map = _mapRef || getLeafletMap();
  const source = getSelectedDrawFeature();

  if (!draw || !map || !source) {
    setStatus("Selecciona un solo elemento dibujado en el mapa.", true);
    return;
  }

  const distanceM = parseDistanceMeters();
  if (!distanceM) {
    setStatus("Indica una distancia válida en metros.", true);
    return;
  }

  const lineSide = _panelEl?.querySelector("#visorBufferLineSideSelect")?.value || "both";

  try {
    const buffered = buildBufferFeature(source, distanceM, lineSide);
    _bufferFeature = buffered;
    _sourceFeatureId = source.id ?? null;
    updateBufferLayer(map, buffered);
    syncBufferPanelUi();
    setStatus(
      isLineFeature(source) && lineSide !== "both"
        ? `Inundación generada · ${distanceM.toLocaleString("es-MX")} m al ${lineSide === "left" ? "lado izquierdo" : "lado derecho"} del trazo.`
        : `Área de influencia generada · ${distanceM.toLocaleString("es-MX")} m.`,
      false
    );
    notifyAnalysisTarget();
  } catch (err) {
    console.warn("[visorBuffer]", err);
    setStatus(err.message || "No se pudo generar el buffer.", true);
  }
}

function onDrawChange(ev) {
  if (_sourceFeatureId && ev?.type === "draw.delete") {
    const deleted = (ev.features || []).some((f) => f.id === _sourceFeatureId);
    if (deleted) clearVisorBuffer();
  }
  syncBufferPanelUi();
}

function bindDrawEvents(map) {
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

function mountBufferPanel(map) {
  if (_panelEl?.isConnected) {
    ensureVisorToolsExtrasHost(map);
    return _panelEl;
  }

  const host = ensureVisorToolsExtrasHost(map);
  const beforeTrigger = host?.querySelector(".visor-spatial-trigger") || null;

  const el = document.createElement("div");
  el.className = "visor-buffer-panel";
  el.innerHTML = `
    <div class="visor-buffer-panel__title">Área de influencia (buffer)</div>
    <p class="visor-buffer-panel__hint">Selecciona una línea, polígono o círculo dibujado en el mapa.</p>
    <div class="visor-buffer-panel__row">
      <label class="visually-hidden" for="visorBufferDistance">Distancia en metros</label>
      <input type="number" id="visorBufferDistance" class="form-control form-control-sm" min="0" step="1" value="0" />
      <span class="visor-buffer-panel__unit">m</span>
    </div>
    <div id="visorBufferLineSide" class="visor-buffer-panel__line-side d-none">
      <label class="form-label visor-buffer-panel__side-label" for="visorBufferLineSideSelect">Inundación (línea / río)</label>
      <select id="visorBufferLineSideSelect" class="form-select form-select-sm">
        <option value="left">Lado izquierdo (A→B)</option>
        <option value="right">Lado derecho (A→B)</option>
        <option value="both" selected>Ambos lados (corredor)</option>
      </select>
    </div>
    <div class="visor-buffer-panel__actions">
      <button type="button" id="visorBufferApply" class="btn btn-sm btn-outline-primary" disabled>Generar área de influencia</button>
      <button type="button" id="visorBufferClear" class="btn btn-sm btn-outline-secondary d-none">Quitar buffer</button>
    </div>
    <div class="visor-buffer-panel__status small" role="status" hidden></div>
  `;

  el.querySelector("#visorBufferApply")?.addEventListener("click", applyBuffer);
  el.querySelector("#visorBufferClear")?.addEventListener("click", () => clearVisorBuffer());

  if (host) {
    if (beforeTrigger) host.insertBefore(el, beforeTrigger);
    else host.appendChild(el);
  } else {
    map.getContainer().appendChild(el);
  }

  el.hidden = true;
  _panelEl = el;
  setBufferPanelOpen(false);
  return el;
}

function attachToMap(map) {
  _mapRef = map;
  mountBufferPanel(map);
  scheduleBufferButtonInjection(map);
  bindDrawEvents(map);
  map.once("idle", () => {
    ensureBufferLayers(map);
    scheduleBufferButtonInjection(map);
  });
  ensureBufferLayers(map);
}

function tryAttach(attempt = 0) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 24) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  attachToMap(map);
}

export function attachVisorBuffer() {
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorBuffer() {
  unbindDrawEvents(_mapRef || getLeafletMap());
  clearVisorBuffer({ silent: true });
  _toggleBtn?.remove();
  _toggleBtn = null;
  _panelEl?.remove();
  _panelEl = null;
  _panelOpen = false;
  removeBufferLayers(_mapRef || getLeafletMap());
  _mapRef = null;
}

export function refreshVisorBuffer() {
  const map = getLeafletMap();
  if (!map) return;
  attachToMap(map);
  scheduleBufferButtonInjection(map);
  if (_toggleBtn) {
    _toggleBtn.classList.toggle("active", _panelOpen);
    _toggleBtn.setAttribute("aria-expanded", _panelOpen ? "true" : "false");
  }
  if (_panelEl) _panelEl.hidden = !_panelOpen;
  if (_bufferFeature) updateBufferLayer(map, _bufferFeature);
}
