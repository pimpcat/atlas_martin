/**
 * Visor geográfico — Buscador offline (MaplibreGeocoder + FastAPI /api/buscar).
 *
 * @see assets/maplibre-gl-geocoder.js
 * @see geocoderApi.js
 * @see app_api/geocoder.py
 */
import { getLeafletMap, getVisorStateWideMode, whenAtlasMapReady } from "./map.js";
import { fetchBuscarGeocoder, fetchBuscarGeometria, geocoderRowsToFeatureCollection } from "./geocoderApi.js";
import { ensureVisorToolsExtrasHost } from "./visorDraw.js";
import {
  clearGeocoderHighlight,
  showGeocoderHighlight,
  teardownGeocoderHighlight,
} from "./visorGeocoderHighlight.js";

/** @type {import("@maplibre/maplibre-gl-geocoder").MaplibreGeocoder | null} */
let _geocoder = null;

/** @type {{ getCveMun?: () => string | null, getMunicipio?: () => { nomgeo?: string } | null }} */
let _visorOptions = {};

/** @type {import("maplibre-gl").Marker | null} */
let _searchMarker = null;

/** @type {HTMLElement | null} */
let _infoPanel = null;

const FLY_ZOOM = 14;
const COORD_DECIMALS = 5;

function getGeocoderCtor() {
  const g = typeof maplibregl !== "undefined" ? maplibregl : window.maplibregl;
  const Ctor =
    (typeof MaplibreGeocoder !== "undefined" ? MaplibreGeocoder : null) ||
    window.MaplibreGeocoder ||
    null;
  return { maplibregl: g, MaplibreGeocoder: Ctor };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getActiveCveMun() {
  if (getVisorStateWideMode()) return null;
  const fn = _visorOptions.getCveMun;
  if (typeof fn !== "function") return null;
  const raw = fn();
  return raw != null && String(raw).trim() ? String(raw).trim() : null;
}

function buildPlaceholder() {
  if (getVisorStateWideMode()) return "Buscar en Guerrero…";
  const m = _visorOptions.getMunicipio?.();
  const nom = m?.nomgeo?.trim();
  if (nom) return `Buscar en ${nom}…`;
  return "Seleccione un municipio para buscar…";
}

async function forwardGeocode(config) {
  const q = String(config?.query || "").trim();
  const cveMun = getActiveCveMun();
  if (q.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }
  if (!getVisorStateWideMode() && !cveMun) {
    return { type: "FeatureCollection", features: [] };
  }
  try {
    const payload = await fetchBuscarGeocoder(q, cveMun);
    return geocoderRowsToFeatureCollection(payload.rows);
  } catch (err) {
    console.warn("[visor geocoder]", err);
    return { type: "FeatureCollection", features: [] };
  }
}

/** HTML de cada sugerencia: «Nombre» + espacio + tipo (sin clase --result del plugin). */
function renderGeocoderSuggestion(item) {
  const p = item.properties || item;
  const nombre = escapeHtml(p.nombre_busqueda || item.text || "—");
  const tipo = escapeHtml(p.tipo || "");
  return (
    `<div class="atlas-geocoder-suggestion">` +
    `<span class="atlas-geocoder-suggestion__name">${nombre}</span>` +
    (tipo ? `<span class="atlas-geocoder-suggestion__sep"> </span><span class="atlas-geocoder-suggestion__tipo">${tipo}</span>` : "") +
    `</div>`
  );
}

function buildGeocoderApi() {
  return { forwardGeocode };
}

function buildGeocoderOptions(maplibregl) {
  return {
    maplibregl,
    placeholder: buildPlaceholder(),
    minLength: 2,
    limit: 15,
    zoom: FLY_ZOOM,
    flyTo: { zoom: FLY_ZOOM, speed: 1.25, essential: true },
    marker: false,
    showResultsWhileTyping: true,
    collapsed: false,
    getItemValue: (item) => item.properties?.nombre_busqueda || item.text || "",
    render: renderGeocoderSuggestion,
  };
}

function formatLatitude(lat) {
  if (!Number.isFinite(lat)) return "—";
  return `${lat.toFixed(COORD_DECIMALS)}°`;
}

function formatLongitude(lng) {
  if (!Number.isFinite(lng)) return "—";
  return `${lng.toFixed(COORD_DECIMALS)}°`;
}

function extractResultInfo(selected) {
  const p = selected?.properties || {};
  const center = resolveCoords(selected);
  return {
    cvegeo: p.cvegeo || p.id_origen || "",
    nombre: p.nombre_busqueda || selected?.text || "—",
    tipo: p.tipo || "",
    lat: center?.[1],
    lng: center?.[0],
  };
}

function createInfoPanel() {
  const el = document.createElement("div");
  el.className = "atlas-geocoder-info maplibregl-ctrl";
  el.hidden = true;
  el.setAttribute("aria-live", "polite");
  el.innerHTML =
    '<div class="atlas-geocoder-info__cvegeo" data-field="cvegeo"></div>' +
    '<p class="atlas-geocoder-info__titulo">' +
    '<strong class="atlas-geocoder-info__tipo" data-field="tipo"></strong>' +
    '<strong class="atlas-geocoder-info__nombre" data-field="nombre"></strong>' +
    "</p>" +
    '<dl class="atlas-geocoder-info__coords">' +
    '<div class="atlas-geocoder-info__row"><dt>Latitud</dt><dd data-field="lat"></dd></div>' +
    '<div class="atlas-geocoder-info__row"><dt>Longitud</dt><dd data-field="lng"></dd></div>' +
    "</dl>";
  return el;
}

function mountInfoPanel(geocoder) {
  if (!geocoder?.container) return;
  if (!_infoPanel) _infoPanel = createInfoPanel();
  _infoPanel.remove();
  geocoder.container.insertAdjacentElement("afterend", _infoPanel);
}

function showSearchInfo(selected) {
  if (!_geocoder) return;
  mountInfoPanel(_geocoder);
  if (!_infoPanel) return;

  const info = extractResultInfo(selected);
  const cvegeoEl = _infoPanel.querySelector('[data-field="cvegeo"]');
  const tipoEl = _infoPanel.querySelector('[data-field="tipo"]');
  const nombreEl = _infoPanel.querySelector('[data-field="nombre"]');
  if (cvegeoEl) cvegeoEl.textContent = info.cvegeo || "—";
  if (tipoEl) tipoEl.textContent = info.tipo ? `${info.tipo}: ` : "";
  if (nombreEl) nombreEl.textContent = info.nombre;
  const latEl = _infoPanel.querySelector('[data-field="lat"]');
  const lngEl = _infoPanel.querySelector('[data-field="lng"]');
  if (latEl) latEl.textContent = formatLatitude(info.lat);
  if (lngEl) lngEl.textContent = formatLongitude(info.lng);
  _infoPanel.hidden = false;
}

function hideSearchInfo() {
  if (!_infoPanel) return;
  _infoPanel.hidden = true;
}

function removeInfoPanel() {
  hideSearchInfo();
  _infoPanel?.remove();
  _infoPanel = null;
}

/** Pin clásico de ubicación (SVG) anclado en la punta inferior. */
function createGeocoderPinElement() {
  const el = document.createElement("div");
  el.className = "atlas-geocoder-pin";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Ubicación buscada");
  el.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>' +
    "</svg>";
  return el;
}

function removeSearchMarker() {
  if (!_searchMarker) return;
  try {
    _searchMarker.remove();
  } catch {
    /* ya retirado */
  }
  _searchMarker = null;
}

function placeSearchMarker(selected, map) {
  const targetMap = map || _geocoder?._map || getLeafletMap();
  const center = resolveCoords(selected);
  const { maplibregl } = getGeocoderCtor();
  if (!targetMap || !center || !maplibregl?.Marker) return;

  removeSearchMarker();
  try {
    _searchMarker = new maplibregl.Marker({
      element: createGeocoderPinElement(),
      anchor: "bottom",
      offset: [0, 2],
    })
      .setLngLat(center)
      .addTo(targetMap);
  } catch (err) {
    console.warn("[visor geocoder] marker:", err);
  }
}

function getTurf() {
  if (typeof turf !== "undefined") return turf;
  if (typeof window !== "undefined" && window.turf) return window.turf;
  return null;
}

function isPolygonSearchResult(selected) {
  const p = selected?.properties || {};
  if (p.geom_tipo === "polygon") return true;
  const tabla = String(p.tabla_origen || "").toLowerCase();
  return tabla === "c_col_ase" || tabla === "c_l" || tabla === "c_mun";
}

function fitMapToFeature(map, feature) {
  const turfLib = getTurf();
  if (!map || !feature?.geometry || !turfLib?.bbox) return false;
  try {
    const [west, south, east, north] = turfLib.bbox(feature);
    if (!Number.isFinite(west) || west >= east || south >= north) return false;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 56, maxZoom: 16, duration: 1200, essential: true }
    );
    return true;
  } catch {
    return false;
  }
}

async function drawPolygonHighlight(selected, map) {
  const p = selected?.properties || {};
  const tabla = String(p.tabla_origen || "").toLowerCase();
  const cvegeo = String(p.cvegeo || p.id_origen || "").trim();
  if (!isPolygonSearchResult(selected) || !tabla || !cvegeo) {
    clearGeocoderHighlight(map);
    return false;
  }
  try {
    const data = await fetchBuscarGeometria(tabla, cvegeo);
    const feature = {
      ...data.feature,
      properties: {
        ...(data.feature?.properties || {}),
        nombre_busqueda: p.nombre_busqueda,
        tipo: p.tipo,
      },
    };
    showGeocoderHighlight(map, feature);
    return feature;
  } catch (err) {
    console.warn("[visor geocoder] geometría:", err);
    clearGeocoderHighlight(map);
    return null;
  }
}

function resolveCoords(selected) {
  if (!selected) return null;
  const p = selected.properties || {};
  let lng = p.lng;
  let lat = p.lat;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    const coords = selected.center || selected.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      lng = coords[0];
      lat = coords[1];
    }
  }
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

async function flyToGeocoderResult(selected, map) {
  const targetMap = map || _geocoder?._map || getLeafletMap();
  const center = resolveCoords(selected);
  if (!targetMap || !center) return;

  placeSearchMarker(selected, targetMap);
  showSearchInfo(selected);

  if (isPolygonSearchResult(selected)) {
    const feature = await drawPolygonHighlight(selected, targetMap);
    if (feature && fitMapToFeature(targetMap, feature)) return;
  } else {
    clearGeocoderHighlight(targetMap);
  }

  try {
    targetMap.flyTo({ center, zoom: FLY_ZOOM, speed: 1.25, essential: true });
  } catch (err) {
    console.warn("[visor geocoder] flyTo:", err);
  }
}

function bindGeocoderEvents(geocoder) {
  if (!geocoder || geocoder._atlasBound) return;
  geocoder._atlasBound = true;

  geocoder.on("result", (ev) => {
    requestAnimationFrame(() => flyToGeocoderResult(ev?.result, geocoder._map));
  });

  geocoder.on("clear", () => {
    removeSearchMarker();
    hideSearchInfo();
    clearGeocoderHighlight(geocoder._map || getLeafletMap());
  });

  geocoder._inputEl?.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      const sel = geocoder._typeahead?.selected;
      if (sel && "geometry" in sel) {
        requestAnimationFrame(() => flyToGeocoderResult(sel, geocoder._map));
      }
    },
    true,
  );
}

function updateGeocoderUi() {
  if (!_geocoder) return;
  try {
    _geocoder.setPlaceholder(buildPlaceholder());
  } catch {
    /* control aún no montado */
  }
  const stateWide = getVisorStateWideMode();
  const cve = getActiveCveMun();
  const input = _geocoder._inputEl;
  if (input) {
    input.disabled = !stateWide && !cve;
    input.title = stateWide
      ? "Buscar localidades y colonias en todo Guerrero"
      : cve
        ? "Buscar localidades y colonias del municipio seleccionado"
        : "Seleccione un municipio en el panel izquierdo";
  }
}

function detachGeocoder(map) {
  removeSearchMarker();
  removeInfoPanel();
  teardownGeocoderHighlight(map);
  if (!_geocoder || !map) return;
  try {
    map.removeControl(_geocoder);
  } catch {
    /* control ya retirado */
  }
  _geocoder = null;
}

function ensureGeocoder(map) {
  const { maplibregl, MaplibreGeocoder } = getGeocoderCtor();
  if (!map || !MaplibreGeocoder) return;

  if (_geocoder) {
    hideSearchInfo();
    removeInfoPanel();
    try {
      map.removeControl(_geocoder);
    } catch {
      /* noop */
    }
    _geocoder = null;
  }

  _geocoder = new MaplibreGeocoder(buildGeocoderApi(), buildGeocoderOptions(maplibregl));
  bindGeocoderEvents(_geocoder);
  map.addControl(_geocoder, "top-left");
  mountInfoPanel(_geocoder);
  updateGeocoderUi();
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 24) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  ensureGeocoder(map);
  ensureVisorToolsExtrasHost(map);
}

/**
 * Monta el buscador en el mapa del visor geográfico.
 * @param {{ getCveMun?: () => string | null, getMunicipio?: () => object | null }} [options]
 */
export function attachVisorGeocoder(options = {}) {
  _visorOptions = options || {};
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorGeocoder() {
  removeSearchMarker();
  detachGeocoder(getLeafletMap());
  _visorOptions = {};
}

/** Limpia texto del buscador y retira el marcador temporal. */
export function clearVisorGeocoderSearch() {
  removeSearchMarker();
  hideSearchInfo();
  clearGeocoderHighlight(getLeafletMap());
  if (_geocoder) {
    try {
      _geocoder.clear();
    } catch {
      /* noop */
    }
  }
}

export function refreshVisorGeocoder() {
  const map = getLeafletMap();
  if (!map) return;
  if (_geocoder) {
    updateGeocoderUi();
  } else {
    tryAttach(0);
  }
}

/** Contenedor del input del buscador (anclar panel de identificación por clic). */
export function getVisorGeocoderContainer() {
  return _geocoder?.container ?? null;
}
