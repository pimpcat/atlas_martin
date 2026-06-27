/**
 * Identificación por clic en el visor geográfico.
 * Panel fijo bajo el buscador (mismo bloque que atlas-geocoder-info).
 */
import {
  getLeafletMap,
  whenAtlasMapReady,
  getOverlayActive,
  getUsoSueloLayerActive,
  getHidroCorrientesVisorLayerActive,
  getHidroCuerposVisorLayerActive,
  getCurvasNivelVisorLayerActive,
} from "./map.js";
import { fitMapToFeatures } from "./mapGeo.js";
import { MARTIN_USO_SUELO } from "./martinLayerStyle.js";
import {
  appendIdentifyCoords,
  setOverlayIdentifyActive,
  setOverlayIdentifyClickHandler,
  rebindOverlayIdentifyForMap,
} from "./mapOverlayTips.js";
import { getVisorDrawControl } from "./visorDraw.js";
import { isVisorFeaturePickBusy, resolveVisorApiLayerId } from "./visorFeaturePickBuffer.js";
import { getVisorGeocoderContainer } from "./visorGeocoder.js";
import { getVisorLayerEntry } from "./visorCatalog.js";
import {
  buildIdentifyHtmlFromCatalog,
  resolveVisorHoverConfig,
} from "./visorIdentifyCatalog.js";
import {
  showIdentifyHighlight,
  clearIdentifyHighlight,
  teardownIdentifyHighlight,
  normalizeIdentifyPrimary,
  prefetchIdentifyGeometry,
  warmIdentifyHighlightLayers,
} from "./visorMapIdentifyHighlight.js";

const POINT_FLY_ZOOM = 16;

let _mapRef = null;
let _panel = null;
let _lastFeature = null;
let _lastLngLat = null;
let _lastLayerId = null;
let _lastPoint = null;
let _lastPrimary = null;
let _prefetchGen = 0;

export function setVisorMapIdentifyActive(fn) {
  setOverlayIdentifyActive(fn);
}

function isDrawModeBlocking() {
  const draw = getVisorDrawControl();
  const mode = draw?.getMode?.() ?? "simple_select";
  return mode !== "simple_select" && mode !== "static";
}

function isIdentifyPanelOpen() {
  return Boolean(_panel && !_panel.hidden);
}

function isIdentifiedLayerActive(primary) {
  if (!primary) return true;
  if (primary === MARTIN_USO_SUELO.layerId) return getUsoSueloLayerActive();
  if (primary.startsWith("ly-")) {
    const key = primary.slice(3);
    if (key === "hidro") return getHidroCorrientesVisorLayerActive();
    if (key === "hcuerpos") return getHidroCuerposVisorLayerActive();
    if (key === "curnivel" || key === "curnivel-ma") return getCurvasNivelVisorLayerActive();
    if (key.startsWith("rnc")) return getOverlayActive("rnc");
    return getOverlayActive(key);
  }
  return getOverlayActive(primary);
}

function resetIdentifySelection() {
  _lastFeature = null;
  _lastLngLat = null;
  _lastLayerId = null;
  _lastPoint = null;
  _lastPrimary = null;
}

function rebuildIdentifyPanelHtml() {
  if (!_lastFeature || !_lastLngLat) return null;
  const catalogId = resolveVisorApiLayerId(_lastPrimary || _lastLayerId || "");
  const entry = catalogId ? getVisorLayerEntry(catalogId) : null;
  const identify = entry ? resolveVisorHoverConfig(entry) : null;
  const props = _lastFeature.properties || {};
  let html = identify ? buildIdentifyHtmlFromCatalog(identify, props) : null;
  if (!html) {
    const gid = props.gid ?? props.GID ?? "";
    if (gid) {
      html = `<div class="atlas-loc-tip"><div class="atlas-loc-tip__title">gid: ${gid}</div></div>`;
    }
  }
  if (!html) return null;
  return appendIdentifyCoords(html, _lastLngLat.lng, _lastLngLat.lat);
}

function refreshIdentifyPanelContent() {
  if (!isIdentifyPanelOpen()) return;
  const html = rebuildIdentifyPanelHtml();
  if (!html) return;
  const content = _panel.querySelector(".atlas-map-identify__content");
  if (content) content.innerHTML = html;
}

function prefetchLastFeatureGeometry() {
  const map = _mapRef || getLeafletMap();
  if (!map || !_lastFeature) return;

  _prefetchGen += 1;
  const gen = _prefetchGen;

  prefetchIdentifyGeometry(map, _lastFeature, _lastLayerId, _lastPoint, (full) => {
    if (gen !== _prefetchGen || !_lastFeature) return;
    _lastFeature = {
      type: "Feature",
      properties: { ...(_lastFeature.properties || {}), ...(full.properties || {}) },
      geometry: full.geometry || _lastFeature.geometry,
    };
    refreshIdentifyPanelContent();
  });
}

function createIdentifyPanel() {
  const el = document.createElement("div");
  el.className = "atlas-map-identify maplibregl-ctrl";
  el.hidden = true;
  el.setAttribute("aria-live", "polite");
  el.innerHTML =
    '<button type="button" class="atlas-map-identify__close" aria-label="Cerrar identificación" title="Cerrar">×</button>' +
    '<div class="atlas-map-identify__content"></div>' +
    '<div class="atlas-map-identify__actions">' +
    '<button type="button" class="atlas-map-identify__zoom" title="Acercar el mapa al elemento">' +
    "Acercar al elemento" +
    "</button>" +
    "</div>";
  el.querySelector(".atlas-map-identify__close")?.addEventListener("click", () => {
    hideIdentifyPanel();
  });
  el.querySelector(".atlas-map-identify__zoom")?.addEventListener("click", () => {
    zoomToLastFeature();
  });
  return el;
}

function mountIdentifyPanel() {
  const geocoderEl = getVisorGeocoderContainer();
  if (!geocoderEl) return false;
  if (!_panel) _panel = createIdentifyPanel();
  _panel.remove();
  geocoderEl.insertAdjacentElement("afterend", _panel);
  return true;
}

function hideIdentifyPanel() {
  if (_panel) _panel.hidden = true;
  _prefetchGen += 1;
  clearIdentifyHighlight(_mapRef || getLeafletMap());
  resetIdentifySelection();
}

function showIdentifyPanel(html) {
  if (!mountIdentifyPanel()) return;
  const content = _panel.querySelector(".atlas-map-identify__content");
  if (content) content.innerHTML = html;
  _panel.hidden = false;
}

function applyIdentifyHighlight() {
  const map = _mapRef || getLeafletMap();
  if (!map || !_lastFeature) return;

  showIdentifyHighlight(map, _lastFeature, _lastLayerId, _lastPoint, (full) => {
    if (!_lastFeature) return;
    _lastFeature = {
      type: "Feature",
      properties: { ...(_lastFeature.properties || {}), ...(full.properties || {}) },
      geometry: full.geometry || _lastFeature.geometry,
    };
  });
}

function zoomToLastFeature() {
  const map = _mapRef || getLeafletMap();
  if (!map) return;

  const feature = _lastFeature;
  const lngLat = _lastLngLat;

  applyIdentifyHighlight();

  if (feature?.geometry) {
    const type = feature.geometry.type;
    if (type === "Point") {
      const [lng, lat] = feature.geometry.coordinates;
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), POINT_FLY_ZOOM),
        speed: 1.2,
        essential: true,
      });
      return;
    }
    if (type === "MultiPoint" && feature.geometry.coordinates?.length) {
      const [lng, lat] = feature.geometry.coordinates[0];
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), POINT_FLY_ZOOM),
        speed: 1.2,
        essential: true,
      });
      return;
    }
    if (fitMapToFeatures(map, [feature], { padding: 56, maxZoom: 18, duration: 900, animate: true })) {
      return;
    }
  }

  if (lngLat && Number.isFinite(lngLat.lng) && Number.isFinite(lngLat.lat)) {
    map.flyTo({
      center: [lngLat.lng, lngLat.lat],
      zoom: Math.max(map.getZoom(), POINT_FLY_ZOOM),
      speed: 1.2,
      essential: true,
    });
  }
}

function onFeatureIdentifyClick(map, lngLat, html, feature, meta = {}) {
  if (isVisorFeaturePickBusy()) return;
  if (isDrawModeBlocking()) return;

  _mapRef = map;
  _prefetchGen += 1;
  clearIdentifyHighlight(map);
  warmIdentifyHighlightLayers(map);

  _lastFeature = feature?.geometry
    ? { type: "Feature", properties: feature.properties || {}, geometry: feature.geometry }
    : null;
  _lastLngLat = lngLat;
  _lastLayerId = meta.layerId ?? null;
  _lastPoint = meta.point ?? null;
  _lastPrimary = normalizeIdentifyPrimary(meta.layerId) || meta.layerId || null;

  prefetchLastFeatureGeometry();

  const enriched = appendIdentifyCoords(html, lngLat.lng, lngLat.lat);
  showIdentifyPanel(enriched);
}

function registerIdentifyHandler() {
  setOverlayIdentifyClickHandler((map, lngLat, html, feature, meta) => {
    onFeatureIdentifyClick(map, lngLat, html, feature, meta);
  });
}

function attachToMap(map) {
  _mapRef = map;
  registerIdentifyHandler();
  rebindOverlayIdentifyForMap(map);
}

function tryAttach(attempt = 0) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 24) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  attachToMap(map);
  mountIdentifyPanel();
}

export function attachVisorMapIdentify() {
  registerIdentifyHandler();
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorMapIdentify() {
  hideIdentifyPanel();
  teardownIdentifyHighlight(_mapRef || getLeafletMap());
  _panel?.remove();
  _panel = null;
  setOverlayIdentifyClickHandler(null);
  setOverlayIdentifyActive(() => false);
  _mapRef = null;
}

/** Cierra identificación si la capa temática del elemento ya no está activa. */
export function dismissVisorMapIdentifyIfLayerHidden() {
  if (!isIdentifyPanelOpen() || !_lastPrimary) return;
  if (!isIdentifiedLayerActive(_lastPrimary)) {
    hideIdentifyPanel();
  }
}

export function refreshVisorMapIdentify() {
  const map = getLeafletMap();
  if (map) {
    rebindOverlayIdentifyForMap(map);
    mountIdentifyPanel();
  }
}
