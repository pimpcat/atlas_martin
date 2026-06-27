/**
 * Resaltado temporal del elemento identificado por clic (visor geográfico).
 * Capas GeoJSON sobre el mapa; se quita al cerrar el panel de identificación.
 * La geometría de tesela MVT está simplificada: se refina vía PostGIS cuando hay gid.
 */
import { fetchVisorFeatureGeometry } from "./visorBufferApi.js";
import { pickVisorFeatureGid, resolveVisorApiLayerId } from "./visorFeaturePickBuffer.js";
import { getVisorLayerEntry, loadVisorCatalog } from "./visorCatalog.js";
import {
  buildIconSizeFromLayerStyle,
  ensureVisorIconKeyOnMap,
  getIconMaplibreId,
  isCatalogSymbolLayerEntry,
  loadVisorIconsConfig,
  resolveIconKeyFromCatalogStyle,
} from "./visorIconRegistry.js";

const SOURCE_ID = "atlas-identify-highlight-src";
const LAYER_FILL = "atlas-identify-highlight-fill";
const LAYER_POLY_LINE_HALO = "atlas-identify-highlight-poly-line-halo";
const LAYER_POLY_LINE = "atlas-identify-highlight-poly-line";
const LAYER_LINE_HALO = "atlas-identify-highlight-line-halo";
const LAYER_LINE = "atlas-identify-highlight-line";
const LAYER_CIRCLE = "atlas-identify-highlight-circle";
const LAYER_SYMBOL_HALO = "atlas-identify-highlight-symbol-halo";
const LAYER_SYMBOL = "atlas-identify-highlight-symbol";

const ALL_LAYER_IDS = [
  LAYER_FILL,
  LAYER_POLY_LINE_HALO,
  LAYER_POLY_LINE,
  LAYER_LINE_HALO,
  LAYER_LINE,
  LAYER_CIRCLE,
  LAYER_SYMBOL_HALO,
  LAYER_SYMBOL,
];

const SYMBOL_LAYOUT_KEYS = [
  "icon-image",
  "icon-size",
  "icon-anchor",
  "icon-offset",
  "icon-rotate",
  "icon-allow-overlap",
  "icon-ignore-placement",
  "icon-pitch-alignment",
  "icon-rotation-alignment",
];

const POLYGON_FILTER = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const LINE_FILTER = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const POINT_FILTER = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];

const IDENTIFY_FILL = "#00bcd4";
const IDENTIFY_LINE = "#006064";
const IDENTIFY_LINE_HALO = "#80deea";
const IDENTIFY_POLY_LINE = "#00838f";
const IDENTIFY_POLY_LINE_HALO = "#b2dfdb";
const IDENTIFY_POINT = "#00acc1";
const IDENTIFY_POINT_STROKE = "#004d40";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

const MAX_GEOM_CACHE = 48;

let _fetchGen = 0;
/** @type {Map<string, object>} */
const _geometryCache = new Map();

function geometryCacheKey(apiLayer, gid) {
  return `${apiLayer}:${gid}`;
}

function readCachedGeometry(apiLayer, gid) {
  if (!apiLayer || !gid) return null;
  return _geometryCache.get(geometryCacheKey(apiLayer, gid)) ?? null;
}

function storeCachedGeometry(apiLayer, gid, feature) {
  if (!apiLayer || !gid || !feature?.geometry) return;
  const key = geometryCacheKey(apiLayer, gid);
  if (_geometryCache.size >= MAX_GEOM_CACHE && !_geometryCache.has(key)) {
    const oldest = _geometryCache.keys().next().value;
    if (oldest) _geometryCache.delete(oldest);
  }
  _geometryCache.set(key, feature);
}

function resolveFetchTarget(map, mapFeature, layerId, point) {
  const resolved = resolveIdentifyHighlightFeature(map, mapFeature, layerId, point);
  if (!resolved) return null;
  const primary = normalizeIdentifyPrimary(layerId) || layerId;
  const apiLayer = resolveVisorApiLayerId(primary);
  const gid = pickVisorFeatureGid(resolved.properties || mapFeature.properties);
  return { resolved, apiLayer, gid };
}

function fetchFullGeometry(apiLayer, gid) {
  const cached = readCachedGeometry(apiLayer, gid);
  if (cached) return Promise.resolve(cached);
  return fetchVisorFeatureGeometry({ layer_id: apiLayer, gid }).then(({ feature: full }) => {
    if (full?.geometry) storeCachedGeometry(apiLayer, gid, full);
    return full ?? null;
  });
}

/** Precarga geometría PostGIS al abrir el panel (antes de «Acercar al elemento»). */
export function prefetchIdentifyGeometry(map, mapFeature, layerId, point, onReady) {
  if (!map || !mapFeature?.geometry) return;
  const target = resolveFetchTarget(map, mapFeature, layerId, point);
  if (!target) return;
  const { resolved, apiLayer, gid } = target;
  if (!apiLayer || !gid) {
    onReady?.(resolved);
    return;
  }
  const cached = readCachedGeometry(apiLayer, gid);
  if (cached) {
    onReady?.(cached);
    return;
  }
  fetchFullGeometry(apiLayer, gid)
    .then((full) => onReady?.(full?.geometry ? mergeHighlightFeature(resolved, full) : resolved))
    .catch(() => onReady?.(resolved));
}

/** Crea capas de resaltado en idle para evitar costo en el primer clic. */
export function warmIdentifyHighlightLayers(map) {
  if (!map) return;
  if (ensureHighlightLayers(map)) return;
  map.once("idle", () => ensureHighlightLayers(map));
}

function isPolygonGeometry(feature) {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

function isLineGeometry(feature) {
  const t = feature?.geometry?.type;
  return t === "LineString" || t === "MultiLineString";
}

function isPointGeometry(feature) {
  const t = feature?.geometry?.type;
  return t === "Point" || t === "MultiPoint";
}

function cloneFeature(feature) {
  if (!feature?.geometry) return null;
  return {
    type: "Feature",
    properties: { ...(feature.properties || {}) },
    geometry: JSON.parse(JSON.stringify(feature.geometry)),
  };
}

export function normalizeIdentifyPrimary(layerId) {
  if (!layerId) return null;
  let base = layerId;
  if (base.endsWith("-labels")) base = base.slice(0, -7);
  if (base.endsWith("-halo")) base = base.slice(0, -5);
  if (base.endsWith("-fill")) base = base.slice(0, -5);
  return base;
}

function resolveSymbolSourceLayer(map, layerId) {
  if (!map || !layerId) return null;
  const candidates = [layerId, normalizeIdentifyPrimary(layerId)].filter(Boolean);
  const seen = new Set();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const layer = map.getLayer(id);
      if (layer?.type !== "symbol") continue;
      const icon = map.getLayoutProperty(id, "icon-image");
      if (icon != null && icon !== "") return id;
    } catch {
      /* noop */
    }
  }
  return null;
}

function scaleIconSize(value, factor) {
  if (typeof value === "number") return value * factor;
  if (Array.isArray(value)) return ["*", value, factor];
  return value;
}

function mergeHighlightFeature(baseFeature, refinedFeature) {
  if (!refinedFeature?.geometry) return baseFeature;
  return {
    type: "Feature",
    properties: { ...(baseFeature?.properties || {}), ...(refinedFeature.properties || {}) },
    geometry: refinedFeature.geometry,
  };
}

function resolveCatalogSymbolHighlightSpec(feature, layerId) {
  const catalogId = resolveVisorApiLayerId(normalizeIdentifyPrimary(layerId));
  if (!catalogId) return null;
  const entry = getVisorLayerEntry(catalogId);
  if (!isCatalogSymbolLayerEntry(entry)) return null;
  const iconKey = resolveIconKeyFromCatalogStyle(entry.style, feature?.properties);
  const iconId = iconKey ? getIconMaplibreId(iconKey) : null;
  if (!iconKey || !iconId) return null;
  return { iconKey, iconId, style: entry.style || {} };
}

function applyCatalogSymbolHighlightLayout(map, spec) {
  if (!map.getLayer(LAYER_SYMBOL) || !spec) return;

  const { iconId, style } = spec;
  const iconSize = buildIconSizeFromLayerStyle(style);
  const layout = {
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-anchor": style.layout?.["icon-anchor"] || "bottom",
    "icon-offset": style.layout?.["icon-offset"] || [0, 8],
  };

  for (const [key, val] of Object.entries(layout)) {
    map.setLayoutProperty(LAYER_SYMBOL, key, val);
    map.setLayoutProperty(LAYER_SYMBOL_HALO, key, val);
  }

  map.setLayoutProperty(LAYER_SYMBOL, "icon-image", iconId);
  map.setLayoutProperty(LAYER_SYMBOL_HALO, "icon-image", iconId);
  map.setLayoutProperty(LAYER_SYMBOL, "icon-size", scaleIconSize(iconSize, 1.1));
  map.setLayoutProperty(LAYER_SYMBOL_HALO, "icon-size", scaleIconSize(iconSize, 1.32));

  map.setPaintProperty(LAYER_SYMBOL, "icon-halo-width", 0);
  map.setPaintProperty(LAYER_SYMBOL, "icon-opacity", 1);
  map.setPaintProperty(LAYER_SYMBOL_HALO, "icon-halo-color", IDENTIFY_LINE_HALO);
  map.setPaintProperty(LAYER_SYMBOL_HALO, "icon-halo-width", 5);
  map.setPaintProperty(LAYER_SYMBOL_HALO, "icon-opacity", 0.05);
  map.setLayoutProperty(LAYER_SYMBOL, "visibility", "visible");
  map.setLayoutProperty(LAYER_SYMBOL_HALO, "visibility", "visible");
  map.setLayoutProperty(LAYER_CIRCLE, "visibility", "none");
}

async function applyCatalogSymbolHighlight(map, feature, layerId) {
  await loadVisorCatalog();
  const spec = resolveCatalogSymbolHighlightSpec(feature, layerId);
  if (!spec) return false;
  await loadVisorIconsConfig();
  await ensureVisorIconKeyOnMap(map, spec.iconKey);
  applyCatalogSymbolHighlightLayout(map, spec);
  return true;
}

function applySymbolHighlightFromSource(map, sourceLayerId) {
  if (!map.getLayer(LAYER_SYMBOL)) return;

  let baseSize;
  for (const key of SYMBOL_LAYOUT_KEYS) {
    try {
      const val = map.getLayoutProperty(sourceLayerId, key);
      if (val === undefined) continue;
      if (key === "icon-size") {
        baseSize = val;
        map.setLayoutProperty(LAYER_SYMBOL, key, scaleIconSize(val, 1.1));
        map.setLayoutProperty(LAYER_SYMBOL_HALO, key, scaleIconSize(val, 1.32));
        continue;
      }
      map.setLayoutProperty(LAYER_SYMBOL, key, val);
      map.setLayoutProperty(LAYER_SYMBOL_HALO, key, val);
    } catch {
      /* noop */
    }
  }

  if (baseSize === undefined) {
    try {
      baseSize = map.getLayoutProperty(sourceLayerId, "icon-size");
      if (baseSize !== undefined) {
        map.setLayoutProperty(LAYER_SYMBOL, "icon-size", scaleIconSize(baseSize, 1.1));
        map.setLayoutProperty(LAYER_SYMBOL_HALO, "icon-size", scaleIconSize(baseSize, 1.32));
      }
    } catch {
      /* noop */
    }
  }

  map.setPaintProperty(LAYER_SYMBOL, "icon-halo-width", 0);
  map.setPaintProperty(LAYER_SYMBOL, "icon-opacity", 1);
  map.setPaintProperty(LAYER_SYMBOL_HALO, "icon-halo-color", IDENTIFY_LINE_HALO);
  map.setPaintProperty(LAYER_SYMBOL_HALO, "icon-halo-width", 5);
  map.setPaintProperty(LAYER_SYMBOL_HALO, "icon-opacity", 0.05);
  map.setLayoutProperty(LAYER_SYMBOL, "visibility", "visible");
  map.setLayoutProperty(LAYER_SYMBOL_HALO, "visibility", "visible");
  map.setLayoutProperty(LAYER_CIRCLE, "visibility", "none");
}

function syncPointHighlightMode(map, feature, layerId) {
  if (!feature) {
    if (map.getLayer(LAYER_CIRCLE)) map.setLayoutProperty(LAYER_CIRCLE, "visibility", "none");
    if (map.getLayer(LAYER_SYMBOL)) map.setLayoutProperty(LAYER_SYMBOL, "visibility", "none");
    if (map.getLayer(LAYER_SYMBOL_HALO)) map.setLayoutProperty(LAYER_SYMBOL_HALO, "visibility", "none");
    return;
  }

  if (isPointGeometry(feature) && resolveCatalogSymbolHighlightSpec(feature, layerId)) {
    void applyCatalogSymbolHighlight(map, feature, layerId).catch((err) => {
      console.warn("[visorMapIdentify] resaltado symbol catálogo:", err);
    });
    return;
  }

  const symbolSource = isPointGeometry(feature) ? resolveSymbolSourceLayer(map, layerId) : null;

  if (symbolSource) {
    applySymbolHighlightFromSource(map, symbolSource);
    return;
  }

  if (map.getLayer(LAYER_CIRCLE)) {
    map.setLayoutProperty(LAYER_CIRCLE, "visibility", "visible");
  }
  if (map.getLayer(LAYER_SYMBOL)) {
    map.setLayoutProperty(LAYER_SYMBOL, "visibility", "none");
  }
  if (map.getLayer(LAYER_SYMBOL_HALO)) {
    map.setLayoutProperty(LAYER_SYMBOL_HALO, "visibility", "none");
  }
}

/**
 * Si el clic fue en contorno/línea de un polígono, intenta obtener el polígono desde la capa -fill.
 */
export function resolveIdentifyHighlightFeature(map, mapFeature, layerId, point) {
  const cloned = cloneFeature(mapFeature);
  if (!cloned?.geometry || !map) return cloned;
  if (isPolygonGeometry(cloned) || isPointGeometry(cloned)) return cloned;

  if (!isLineGeometry(cloned) || !point || !layerId) return cloned;

  const primary = normalizeIdentifyPrimary(layerId);
  const fillId = primary ? `${primary}-fill` : null;
  if (!fillId || !map.getLayer(fillId)) return cloned;

  try {
    if (map.getLayoutProperty(fillId, "visibility") !== "visible") return cloned;
  } catch {
    return cloned;
  }

  const pad = 4;
  const hits = map.queryRenderedFeatures(
    [
      [point.x - pad, point.y - pad],
      [point.x + pad, point.y + pad],
    ],
    { layers: [fillId] },
  );
  const poly = hits.find((f) => isPolygonGeometry(f));
  return poly ? cloneFeature(poly) : cloned;
}

function findInsertBefore(map) {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    if (layer.id.includes("gl-draw")) return layer.id;
  }
  return undefined;
}

function resolveLabelLayerId(map, layerId) {
  const primary = normalizeIdentifyPrimary(layerId);
  if (!primary || !map) return null;
  const candidates = [
    `${primary}-labels`,
    `${primary}-visor-labels`,
    "ly-hidro-visor-labels",
    "ly-hcuerpos-visor-labels",
  ];
  for (const id of candidates) {
    if (map.getLayer(id)) return id;
  }
  return null;
}

function isSymbolHighlightActive(map, feature, layerId) {
  if (!feature || !isPointGeometry(feature)) return false;
  if (resolveCatalogSymbolHighlightSpec(feature, layerId)) return true;
  if (!resolveSymbolSourceLayer(map, layerId)) return false;
  try {
    return map.getLayoutProperty(LAYER_SYMBOL, "visibility") === "visible";
  } catch {
    return false;
  }
}

/** Polígonos/líneas arriba; resaltado symbol de puntos debajo de la etiqueta (-labels). */
function stackHighlightLayers(map, feature, layerId) {
  if (!map?.getStyle?.()) return;

  if (isSymbolHighlightActive(map, feature, layerId)) {
    const labelId = resolveLabelLayerId(map, layerId);
    if (labelId) {
      for (const id of [LAYER_SYMBOL_HALO, LAYER_SYMBOL]) {
        if (!map.getLayer(id)) continue;
        try {
          map.moveLayer(id, labelId);
        } catch {
          /* noop */
        }
      }
      return;
    }
  }

  for (const id of ALL_LAYER_IDS) {
    if (!map.getLayer(id)) continue;
    try {
      map.moveLayer(id);
    } catch {
      /* noop */
    }
  }
}

function ensureHighlightLayers(map) {
  if (!map?.isStyleLoaded?.()) return false;

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_FC });
  }

  const beforeId = findInsertBefore(map);

  if (!map.getLayer(LAYER_FILL)) {
    map.addLayer(
      {
        id: LAYER_FILL,
        type: "fill",
        source: SOURCE_ID,
        filter: POLYGON_FILTER,
        paint: {
          "fill-color": IDENTIFY_FILL,
          "fill-opacity": 0.38,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(LAYER_POLY_LINE_HALO)) {
    map.addLayer(
      {
        id: LAYER_POLY_LINE_HALO,
        type: "line",
        source: SOURCE_ID,
        filter: POLYGON_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": IDENTIFY_POLY_LINE_HALO,
          "line-width": 4,
          "line-opacity": 0.85,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(LAYER_POLY_LINE)) {
    map.addLayer(
      {
        id: LAYER_POLY_LINE,
        type: "line",
        source: SOURCE_ID,
        filter: POLYGON_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": IDENTIFY_POLY_LINE,
          "line-width": 2,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(LAYER_LINE_HALO)) {
    map.addLayer(
      {
        id: LAYER_LINE_HALO,
        type: "line",
        source: SOURCE_ID,
        filter: LINE_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": IDENTIFY_LINE_HALO,
          "line-width": 8,
          "line-opacity": 0.9,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(LAYER_LINE)) {
    map.addLayer(
      {
        id: LAYER_LINE,
        type: "line",
        source: SOURCE_ID,
        filter: LINE_FILTER,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": IDENTIFY_LINE,
          "line-width": 4,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(LAYER_CIRCLE)) {
    map.addLayer(
      {
        id: LAYER_CIRCLE,
        type: "circle",
        source: SOURCE_ID,
        filter: POINT_FILTER,
        layout: { visibility: "none" },
        paint: {
          "circle-color": IDENTIFY_POINT,
          "circle-radius": 10,
          "circle-stroke-color": IDENTIFY_POINT_STROKE,
          "circle-stroke-width": 2.5,
          "circle-opacity": 0.92,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(LAYER_SYMBOL_HALO)) {
    map.addLayer(
      {
        id: LAYER_SYMBOL_HALO,
        type: "symbol",
        source: SOURCE_ID,
        filter: POINT_FILTER,
        layout: {
          visibility: "none",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-halo-color": IDENTIFY_LINE_HALO,
          "icon-halo-width": 5,
          "icon-opacity": 0.05,
        },
      },
      beforeId,
    );
  }

  if (!map.getLayer(LAYER_SYMBOL)) {
    map.addLayer(
      {
        id: LAYER_SYMBOL,
        type: "symbol",
        source: SOURCE_ID,
        filter: POINT_FILTER,
        layout: {
          visibility: "none",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": 1,
        },
      },
      beforeId,
    );
  }

  return Boolean(map.getSource(SOURCE_ID));
}

function setHighlightData(map, feature, layerId) {
  if (!map) return;

  const data = {
    type: "FeatureCollection",
    features: feature ? [feature] : [],
  };

  const commit = () => {
    if (feature && !ensureHighlightLayers(map)) return false;
    syncPointHighlightMode(map, feature, layerId);
    const src = map.getSource(SOURCE_ID);
    if (!src) return !feature;
    src.setData(data);
    if (feature) stackHighlightLayers(map, feature, layerId);
    return true;
  };

  if (commit()) return;
  if (!feature) {
    map.getSource(SOURCE_ID)?.setData(data);
    return;
  }
  map.once("idle", () => commit());
}

/** Muestra el resaltado del feature identificado (tesela al instante + PostGIS en segundo plano). */
export function showIdentifyHighlight(map, mapFeature, layerId, point, onRefined) {
  if (!map || !mapFeature?.geometry) return;

  const gen = ++_fetchGen;
  const target = resolveFetchTarget(map, mapFeature, layerId, point);
  if (!target) return;

  const { resolved, apiLayer, gid } = target;
  const apply = (feature) => setHighlightData(map, feature, layerId);

  if (!apiLayer || !gid) {
    apply(resolved);
    return;
  }

  const cached = readCachedGeometry(apiLayer, gid);
  if (cached) {
    const merged = mergeHighlightFeature(resolved, cached);
    apply(merged);
    onRefined?.(merged);
    return;
  }

  // Vista previa inmediata (tesela); PostGIS refina sin bloquear la UI.
  apply(resolved);

  fetchFullGeometry(apiLayer, gid)
    .then((full) => {
      if (gen !== _fetchGen || !full?.geometry) return;
      apply(mergeHighlightFeature(resolved, full));
      onRefined?.(mergeHighlightFeature(resolved, full));
    })
    .catch((err) => {
      console.warn("[visorMapIdentify] geometría PostGIS:", err);
    });
}

/** Quita el resaltado del mapa. */
export function clearIdentifyHighlight(map) {
  _fetchGen += 1;
  if (!map) return;
  setHighlightData(map, null, null);
}

/** Libera capas y fuente (p. ej. al salir del visor). */
export function teardownIdentifyHighlight(map) {
  _fetchGen += 1;
  _geometryCache.clear();
  clearIdentifyHighlight(map);
  if (!map) return;
  for (const id of ALL_LAYER_IDS) {
    if (!map.getLayer(id)) continue;
    try {
      map.removeLayer(id);
    } catch {
      /* noop */
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
