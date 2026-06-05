/**
 * Mapa base "Local" desde MBTiles servido por Martin (fuente id: mexico).
 * Estilo mínimo compatible con OpenMapTiles / Planetiler; capas genéricas de respaldo.
 */

import { martinTileJson, martinTileUrl, MARTIN_BASE } from "./atlasConfig.js";

export const LOCAL_MBTILES_ID = "mexico";
const LOCAL_SOURCE_ID = "base-local";

/** @type {string[]} */
let _localLayerIds = [];
/** @type {Promise<any> | null} */
let _tileJsonPromise = null;
let _isVector = true;

function localTileJsonUrl() {
  const base = martinTileJson(LOCAL_MBTILES_ID);
  if (typeof window !== "undefined" && window.location?.origin && !base.startsWith("http")) {
    return `${window.location.origin}${base}`;
  }
  return base;
}

function localTileTemplate() {
  return martinTileUrl(LOCAL_MBTILES_ID);
}

/** @param {any} tj */
function vectorLayerIdsFromTileJson(tj) {
  const ids = new Set();
  if (Array.isArray(tj?.vector_layers)) {
    for (const v of tj.vector_layers) {
      if (v?.id) ids.add(String(v.id));
    }
  }
  if (!ids.size && tj?.json) {
    try {
      const meta = typeof tj.json === "string" ? JSON.parse(tj.json) : tj.json;
      for (const v of meta?.vector_layers || []) {
        if (v?.id) ids.add(String(v.id));
      }
    } catch {
      /* noop */
    }
  }
  return ids;
}

/** @param {any} tj */
function isVectorTileJson(tj) {
  const fmt = String(tj?.format || "").toLowerCase();
  if (fmt === "pbf" || fmt === "mvt") return true;
  if (vectorLayerIdsFromTileJson(tj).size > 0) return true;
  const tile0 = String(tj?.tiles?.[0] || "").toLowerCase();
  return !/\.(png|jpe?g|webp|gif)(\?|$)/.test(tile0);
}

/** Estilo compacto tipo OpenMapTiles (Planetiler / tippecanoe OSM). */
function openMapTilesLayerDefs(sourceId, available) {
  /** @type {Array<object>} */
  const defs = [
    { id: "base-local-bg", type: "background", paint: { "background-color": "#f2efe9" } },
    {
      id: "base-local-water",
      type: "fill",
      source: sourceId,
      "source-layer": "water",
      paint: { "fill-color": "#aad3df" },
    },
    {
      id: "base-local-ocean",
      type: "fill",
      source: sourceId,
      "source-layer": "ocean",
      paint: { "fill-color": "#aad3df" },
    },
    {
      id: "base-local-landcover",
      type: "fill",
      source: sourceId,
      "source-layer": "landcover",
      paint: { "fill-color": "#cfe8c4", "fill-opacity": 0.75 },
    },
    {
      id: "base-local-land",
      type: "fill",
      source: sourceId,
      "source-layer": "land",
      paint: { "fill-color": "#f2efe9" },
    },
    {
      id: "base-local-landuse",
      type: "fill",
      source: sourceId,
      "source-layer": "landuse",
      paint: { "fill-color": "#e6e2dc", "fill-opacity": 0.7 },
    },
    {
      id: "base-local-urban",
      type: "fill",
      source: sourceId,
      "source-layer": "urban",
      paint: { "fill-color": "#e0dcd6", "fill-opacity": 0.85 },
    },
    {
      id: "base-local-woods",
      type: "fill",
      source: sourceId,
      "source-layer": "woods",
      paint: { "fill-color": "#add19e", "fill-opacity": 0.75 },
    },
    {
      id: "base-local-waterway",
      type: "line",
      source: sourceId,
      "source-layer": "waterway",
      paint: { "line-color": "#6baed6", "line-width": 1 },
    },
    {
      id: "base-local-transportation",
      type: "line",
      source: sourceId,
      "source-layer": "transportation",
      paint: { "line-color": "#ffffff", "line-width": 1.2 },
    },
    {
      id: "base-local-roads",
      type: "line",
      source: sourceId,
      "source-layer": "roads",
      paint: { "line-color": "#ffffff", "line-width": 1 },
    },
    {
      id: "base-local-building",
      type: "fill",
      source: sourceId,
      "source-layer": "building",
      paint: { "fill-color": "#d9d5cf", "fill-opacity": 0.65 },
    },
    {
      id: "base-local-buildings",
      type: "fill",
      source: sourceId,
      "source-layer": "buildings",
      paint: { "fill-color": "#d9d5cf", "fill-opacity": 0.65 },
    },
    {
      id: "base-local-boundary",
      type: "line",
      source: sourceId,
      "source-layer": "boundary",
      paint: { "line-color": "#9e9cab", "line-width": 0.6, "line-dasharray": [2, 1] },
    },
  ];

  if (!available?.size) return defs;

  const slKnown = new Set(
    defs.filter((d) => d["source-layer"]).map((d) => d["source-layer"]),
  );
  for (const sl of available) {
    if (slKnown.has(sl)) continue;
    defs.push({
      id: `base-local-fill-${sl}`,
      type: "fill",
      source: sourceId,
      "source-layer": sl,
      paint: { "fill-color": "#e8e4e0", "fill-opacity": 0.55 },
    });
    defs.push({
      id: `base-local-line-${sl}`,
      type: "line",
      source: sourceId,
      "source-layer": sl,
      paint: { "line-color": "#888", "line-width": 0.4 },
    });
  }
  return defs;
}

export function fetchLocalBasemapTileJson() {
  if (!_tileJsonPromise) {
    _tileJsonPromise = fetch(localTileJsonUrl(), { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`TileJSON HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        _tileJsonPromise = null;
        throw err;
      });
  }
  return _tileJsonPromise;
}

export function prefetchLocalBasemapCatalog() {
  void fetchLocalBasemapTileJson().catch(() => {});
}

export function getLocalBasemapLayerIds() {
  return _localLayerIds.slice();
}

export function isLocalBasemapVector() {
  return _isVector;
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {boolean} visible
 */
export function setLocalBasemapVisible(map, visible) {
  if (!map || !_localLayerIds.length) return;
  const vis = visible ? "visible" : "none";
  for (const id of _localLayerIds) {
    try {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    } catch {
      /* noop */
    }
  }
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {string} [beforeLayerId]
 */
export async function ensureLocalBasemap(map, beforeLayerId = "base-osm") {
  if (!map) return false;
  if (map.getSource(LOCAL_SOURCE_ID) && _localLayerIds.length) return true;

  let tj;
  try {
    tj = await fetchLocalBasemapTileJson();
  } catch (err) {
    console.warn("[local-basemap] TileJSON:", err);
    return false;
  }

  _isVector = isVectorTileJson(tj);
  const anchor = map.getLayer(beforeLayerId) ? beforeLayerId : undefined;

  if (!_isVector) {
    const tiles = Array.isArray(tj.tiles) && tj.tiles.length ? tj.tiles : [localTileTemplate()];
    if (!map.getSource(LOCAL_SOURCE_ID)) {
      map.addSource(LOCAL_SOURCE_ID, {
        type: "raster",
        tiles,
        tileSize: tj.tileSize || 256,
        minzoom: tj.minzoom ?? 0,
        maxzoom: tj.maxzoom ?? 19,
        attribution: tj.attribution || "© OpenStreetMap · MBTiles local",
      });
    }
    if (!map.getLayer("base-local-raster")) {
      map.addLayer(
        {
          id: "base-local-raster",
          type: "raster",
          source: LOCAL_SOURCE_ID,
          layout: { visibility: "none" },
          paint: {
            "raster-opacity": 1,
            "raster-fade-duration": 0,
            "raster-resampling": "linear",
          },
        },
        anchor,
      );
    }
    _localLayerIds = ["base-local-raster"];
    return true;
  }

  if (!map.getSource(LOCAL_SOURCE_ID)) {
    map.addSource(LOCAL_SOURCE_ID, {
      type: "vector",
      tiles: [localTileTemplate()],
      minzoom: tj.minzoom ?? 0,
      maxzoom: tj.maxzoom ?? 14,
      attribution: tj.attribution || "© OpenStreetMap · MBTiles local",
    });
  }

  const available = vectorLayerIdsFromTileJson(tj);
  const defs = openMapTilesLayerDefs(LOCAL_SOURCE_ID, available);
  /** @type {string[]} */
  const added = [];

  let below = anchor;
  for (let i = defs.length - 1; i >= 0; i--) {
    const def = defs[i];
    if (map.getLayer(def.id)) {
      added.push(def.id);
      continue;
    }
    const sl = def["source-layer"];
    if (sl && available.size && !available.has(sl)) continue;
    map.addLayer({ ...def, layout: { visibility: "none" } }, below);
    added.push(def.id);
    below = def.id;
  }

  _localLayerIds = added;
  if (!_localLayerIds.length) {
    console.warn("[local-basemap] sin capas compatibles en el MBTiles");
    return false;
  }
  return true;
}

/** URL de comprobación (catálogo Martin). */
export function getLocalBasemapCatalogUrl() {
  const base = MARTIN_BASE.replace(/\/$/, "");
  const prefix =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}${base}`
      : base;
  return `${prefix}/catalog`;
}
