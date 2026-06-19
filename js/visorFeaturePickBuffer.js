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
} from "./visorBuffer.js";
import { fetchVisorBuffer, fetchVisorFeatureGeometry, fetchVisorFeatureOutline } from "./visorBufferApi.js";

let _panelEl = null;
let _toggleBtn = null;
let _mapRef = null;
let _pickActive = false;
let _panelOpen = false;
let _pickedFeature = null;
let _clickHandler = null;
let _applying = false;
let _closeListener = null;
let _highlightFetchGen = 0;

const PICK_HIGHLIGHT_SRC = "atlas-visor-pick-highlight-src";
const PICK_HIGHLIGHT_OUTLINE_HALO = "atlas-visor-pick-highlight-outline-halo";
const PICK_HIGHLIGHT_OUTLINE = "atlas-visor-pick-highlight-outline";
const PICK_HIGHLIGHT_LINE_HALO = "atlas-visor-pick-highlight-line-halo";
const PICK_HIGHLIGHT_LINE = "atlas-visor-pick-highlight-line";
const PICK_HIGHLIGHT_CIRCLE = "atlas-visor-pick-highlight-circle";

const HIGHLIGHT_OUTLINE_FILTER = ["==", ["get", "atlasPickOutline"], true];
const HIGHLIGHT_LINE_FILTER = [
  "all",
  ["==", ["get", "atlasPickKind"], "line"],
  ["!=", ["get", "atlasPickOutline"], true],
];
const HIGHLIGHT_POINT_FILTER = ["==", ["get", "atlasPickKind"], "point"];

/** Contorno de polígonos (PostGIS outline): trazo fino. */
const HIGHLIGHT_OUTLINE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  1,
  12,
  1.5,
  16,
  2,
  20,
  2.5,
];
const HIGHLIGHT_OUTLINE_HALO_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  2.5,
  12,
  3.5,
  16,
  4.5,
  20,
  5.5,
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

function pickHighlightHint(feature) {
  if (isLineGeometry(feature)) return "trazo naranja en el mapa";
  if (isPointGeometry(feature)) return "punto resaltado en el mapa";
  return "contorno naranja en el mapa";
}

function tagHighlightFeature(feature) {
  if (!feature?.geometry) return null;
  let kind = "polygon";
  if (isLineGeometry(feature)) kind = "line";
  else if (isPointGeometry(feature)) kind = "point";
  const props = { ...(feature.properties || {}), atlasPickKind: kind };
  if (props.atlasPickOutline == null && feature.properties?.atlasPickOutline != null) {
    props.atlasPickOutline = feature.properties.atlasPickOutline;
  }
  return {
    type: "Feature",
    properties: props,
    geometry: feature.geometry,
  };
}

function raisePickHighlightLayers(map) {
  if (!map?.getStyle?.()) return;
  for (const id of [
    PICK_HIGHLIGHT_CIRCLE,
    PICK_HIGHLIGHT_LINE,
    PICK_HIGHLIGHT_LINE_HALO,
    PICK_HIGHLIGHT_OUTLINE,
    PICK_HIGHLIGHT_OUTLINE_HALO,
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
  return {
    type: "Feature",
    properties: { ...(mapFeature.properties || {}) },
    geometry: JSON.parse(JSON.stringify(mapFeature.geometry)),
  };
}

function layerRank(layerId) {
  if (!layerId) return 5;
  if (layerId.includes("-halo")) return 3;
  if (layerId.includes("-fill")) return 1;
  if (layerId.endsWith("-labels")) return 9;
  return 0;
}

function pickBestFeature(features) {
  if (!features?.length) return null;
  const sorted = [...features].sort((a, b) => {
    const ra = layerRank(a.layer?.id);
    const rb = layerRank(b.layer?.id);
    if (ra !== rb) return ra - rb;
    return 0;
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
  if (!layerId) return "elemento del mapa";
  if (layerId.includes("manzanas")) return "manzana";
  if (layerId.includes("hcuerpos")) return "cuerpo de agua";
  if (layerId.includes("hidro")) return "corriente de agua";
  if (layerId.includes("colonias")) return "colonia";
  if (layerId.includes("vialidades")) return "vialidad";
  if (layerId.includes("rnc")) return "vía RNC";
  if (layerId.includes("saneamiento")) return "servicio de agua";
  if (layerId.includes("residuo")) return "residuo sólido";
  if (layerId.includes("locsPunto")) return "localidad";
  if (layerId.includes("locsAtlas")) return "localidad";
  if (layerId.includes("ageb")) return "AGEB";
  if (layerId.includes("curnivel")) return "curva de nivel";
  if (layerId.includes("uso") || layerId === MARTIN_USO_SUELO.layerId) return "uso de suelo";
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

export function pickVisorFeatureGid(props) {
  if (!props) return null;
  for (const k of ["gid", "GID", "ogc_fid", "OGC_FID"]) {
    if (props[k] != null && String(props[k]).trim()) return String(props[k]).trim();
  }
  return null;
}

/** Capa del API (/api/visor/export) a partir del id MapLibre ly-*. */
export function resolveVisorApiLayerId(mapLayerId) {
  if (!mapLayerId) return null;
  if (mapLayerId === MARTIN_USO_SUELO.layerId) return "uso_suelo";
  const key = mapLayerId.replace(/^ly-/, "").replace(/-visor-labels$/, "").replace(/-labels$/, "");
  const base = key.split("-")[0];
  const map = {
    hcuerpos: "hidro_cuerpos",
    hidro: "hidro_corrientes",
    curnivel: "curvas_nivel",
    locsPunto: "locspunto",
    locsAtlas: "locsatlas",
    agebUrbanas: "ageb_urbanas",
    agebRurales: "ageb_rurales",
    saneamientoAgua: "saneamiento_agua",
    clues: "clues",
    residuoSolido: "residuo_solido",
    denueRastros: "denue_rastros",
    denueGasolinerias: "denue_gasolinerias",
    denueGaseras: "denue_gaseras",
    denueEscuelas: "denue_escuelas",
    denueHospitales: "denue_hospitales",
    denueMuseos: "denue_museos",
    denueCementerios: "denue_cementerios",
    denueIglesias: "denue_iglesias",
  };
  if (map[key]) return map[key];
  if (map[base]) return map[base];
  if (["manzanas", "colonias", "vialidades", "rnc"].includes(base)) return base;
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

  const beforeId = findDrawLayerInsertBefore(map);

  // Retirar capas legadas (fill / contorno sobre polígonos de tile).
  for (const legacyId of [
    "atlas-visor-pick-highlight-fill",
    "atlas-visor-pick-highlight-poly-halo",
    "atlas-visor-pick-highlight-poly-line",
  ]) {
    if (map.getLayer(legacyId)) {
      try {
        map.removeLayer(legacyId);
      } catch {
        /* noop */
      }
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

function setPickHighlightData(map, feature) {
  if (!map) return;
  const tagged = feature ? tagHighlightFeature(feature) : null;
  const data = {
    type: "FeatureCollection",
    features: tagged ? [tagged] : [],
  };

  const commit = () => {
    if (tagged && !ensurePickHighlightLayers(map)) return false;
    const src = map.getSource(PICK_HIGHLIGHT_SRC);
    if (!src) return !tagged;
    src.setData(data);
    if (tagged) raisePickHighlightLayers(map);
    return true;
  };

  if (commit()) return;
  if (!tagged) {
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
  clearPickHighlight(map);
  clearVisorBuffer();
  setStatus("");
  syncPickPanelUi();
  if (!keepPanelOpen) setPickPanelOpen(false);
}

function outlineFeatureFromPolygon(fullFeature) {
  const turf = globalThis.turf;
  if (!turf?.polygonToLine || !fullFeature?.geometry) return null;
  try {
    const line = turf.polygonToLine(fullFeature);
    const geometry =
      line.type === "Feature" ? line.geometry : line.type === "FeatureCollection" ? line.features[0]?.geometry : line;
    if (!geometry) return null;
    return {
      type: "Feature",
      properties: { ...(fullFeature.properties || {}), atlasPickOutline: true },
      geometry,
    };
  } catch {
    return null;
  }
}

async function loadPolygonPickOutline(apiLayer, gid) {
  try {
    const { feature: outline } = await fetchVisorFeatureOutline({ layer_id: apiLayer, gid });
    return outline;
  } catch (err) {
    console.warn("[visorFeaturePickBuffer] contorno PostGIS:", err);
  }
  try {
    const { feature: full } = await fetchVisorFeatureGeometry({ layer_id: apiLayer, gid });
    return outlineFeatureFromPolygon(full);
  } catch (err) {
    console.warn("[visorFeaturePickBuffer] contorno Turf:", err);
  }
  return null;
}

async function refreshPickHighlight(feature, layerId) {
  const map = _mapRef || getLeafletMap();
  if (!map || !feature) {
    clearPickHighlight(map);
    return;
  }

  const apiLayer = resolveVisorApiLayerId(layerId);
  const gid = pickVisorFeatureGid(feature.properties);
  const gen = _highlightFetchGen;

  if (isPolygonGeometry(feature)) {
    clearPickHighlight(map);
    if (!apiLayer || !gid) return;
    const outline = await loadPolygonPickOutline(apiLayer, gid);
    if (gen !== _highlightFetchGen || !_pickedFeature) return;
    if (outline) updatePickHighlight(map, outline);
    return;
  }

  updatePickHighlight(map, feature);

  if (apiLayer && gid) {
    try {
      const { feature: full } = await fetchVisorFeatureGeometry({ layer_id: apiLayer, gid });
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
        ? `Seleccionado: ${describePicked(_pickedFeature, _pickedFeature._layerId)} · ${pickHighlightHint(_pickedFeature)}.`
        : "Haz clic sobre una manzana, cuerpo de agua, vía u otra capa activa del visor."
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
    setPickModeActive(false);
    _pickedFeature = null;
    clearPickHighlight(_mapRef || getLeafletMap());
  } else {
    setPickModeActive(true);
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
    setStatus("No hay ningún elemento seleccionable en ese punto.", true);
    syncPickPanelUi();
    return;
  }

  _pickedFeature = cloneMapFeature(best);
  if (_pickedFeature) {
    _pickedFeature._layerId = best.layer?.id || "";
    _pickedFeature._apiLayerId = resolveVisorApiLayerId(_pickedFeature._layerId);
    _pickedFeature._sourceGid = pickVisorFeatureGid(_pickedFeature.properties);
  }
  setStatus("");
  syncPickPanelUi();
  void refreshPickHighlight(_pickedFeature, _pickedFeature?._layerId);
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
  const sourceGid = feature._sourceGid || pickVisorFeatureGid(feature.properties);
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
    if (_pickedFeature) void refreshPickHighlight(_pickedFeature, _pickedFeature._layerId);
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
    <div class="visor-buffer-panel__title">Buffer sobre elemento del mapa</div>
    <p class="visor-buffer-panel__hint visor-pick-buffer-panel__hint">
      Haz clic sobre una capa activa del visor (manzana, cuerpo de agua, vía…).
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

function bindCloseListener() {
  if (_closeListener || typeof window === "undefined") return;
  _closeListener = () => closeVisorFeaturePickBuffer();
  window.addEventListener("atlas:visor-close-pick-buffer", _closeListener);
}

function unbindCloseListener() {
  if (_closeListener && typeof window !== "undefined") {
    window.removeEventListener("atlas:visor-close-pick-buffer", _closeListener);
  }
  _closeListener = null;
}

function attachToMap(map) {
  _mapRef = map;
  mountPickPanel(map);
  schedulePickButtonInjection(map);
  bindMapClick(map);
  bindCloseListener();
  warmPickHighlightLayers(map);
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
