/**
 * Mapa base "Local": MBTiles (Martin, id mexico) + estilo OSM Bright (OpenMapTiles).
 * Assets estáticos: /atlas_gro/basemap/ (montaje Docker desde vector tiles/assets).
 */

import { martinTileJson, martinTileUrl, MARTIN_BASE } from "./atlasConfig.js";
import { MAPLIBRE_GLYPHS_URL } from "./martinLayerStyle.js";

export const LOCAL_MBTILES_ID = "mexico";
const OMT_SOURCE_ID = "openmaptiles";
const RASTER_SOURCE_ID = "base-local";
const LAYER_PREFIX = "base-bright-";
const BRIGHT_STYLE_PATH = "/atlas_gro/basemap/style-local.json";

/** CDN de respaldo si faltan PNG/PBF locales. */
const SPRITE_CDN = "https://cdn.jsdelivr.net/gh/openmaptiles/osm-bright-gl-style@master/sprite";
const GLYPHS_CDN = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/** Fuentes que usa style-local.json (OSM Bright). Todas deben existir en basemap/fonts/. */
const OSM_BRIGHT_FONT_STACKS = [
  "Noto Sans Regular",
  "Noto Sans Bold",
  "Noto Sans Italic",
];

let _basemapAssetsProbed = false;
let _basemapUseLocalFonts = false;
let _basemapUseLocalSprite = false;

/** @type {string[]} */
let _localLayerIds = [];
/** @type {Promise<any> | null} */
let _tileJsonPromise = null;
/** @type {Promise<any> | null} */
let _stylePromise = null;
let _isVector = true;
/** @type {string | null} */
let _basemapGlyphsUrl = null;
/** @type {string | null} */
let _basemapSpriteUrl = null;

function basemapAssetsBase() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/atlas_gro/basemap`;
  }
  return "/atlas_gro/basemap";
}

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

function loadBrightStyleJson() {
  if (!_stylePromise) {
    const url = `${basemapAssetsBase()}/style-local.json`;
    _stylePromise = fetch(url, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`style HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        _stylePromise = null;
        throw err;
      });
  }
  return _stylePromise;
}

/** @param {import("maplibre-gl").Map} map @param {string} spriteUrl */
async function applyBasemapSprite(map, spriteUrl) {
  if (typeof map.setSprite === "function") {
    await map.setSprite(spriteUrl);
    return;
  }
  await new Promise((resolve, reject) => {
    if (!map.style?.loadSprite) {
      reject(new Error("loadSprite no disponible"));
      return;
    }
    map.style.loadSprite(spriteUrl, (err) => (err ? reject(err) : resolve()));
  });
}

/** @param {string} url */
async function resourceExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Comprueba que existan todos los PBF que el estilo Bright solicita (no solo Regular). */
async function localGlyphSetsComplete(base) {
  const checks = await Promise.all(
    OSM_BRIGHT_FONT_STACKS.map((stack) =>
      resourceExists(`${base}/fonts/${encodeURIComponent(stack)}/0-255.pbf`),
    ),
  );
  return checks.every(Boolean);
}

/** @param {import("maplibre-gl").Map} map */
async function configureBasemapSpriteAndGlyphs(map) {
  const base = basemapAssetsBase();

  if (!_basemapAssetsProbed) {
    _basemapUseLocalSprite = await resourceExists(`${base}/sprite.json`);
    _basemapUseLocalFonts = await localGlyphSetsComplete(base);
    _basemapAssetsProbed = true;
  }

  const spriteUrl = _basemapUseLocalSprite ? `${base}/sprite` : SPRITE_CDN;
  const glyphsUrl = _basemapUseLocalFonts
    ? `${base}/fonts/{fontstack}/{range}.pbf`
    : GLYPHS_CDN;

  if (!_basemapUseLocalSprite) {
    console.info("[local-basemap] Sprites locales no encontrados; usando CDN.");
  }
  if (!_basemapUseLocalFonts) {
    console.info(
      "[local-basemap] Fuentes locales incompletas (se requieren Regular, Bold e Italic); usando OpenFreeMap.",
    );
  }

  _basemapSpriteUrl = spriteUrl;
  _basemapGlyphsUrl = glyphsUrl;

  try {
    await applyBasemapSprite(map, spriteUrl);
  } catch (err) {
    console.warn("[local-basemap] sprite:", err);
    if (spriteUrl !== SPRITE_CDN) {
      _basemapSpriteUrl = SPRITE_CDN;
      await applyBasemapSprite(map, SPRITE_CDN);
    }
  }

  if (typeof map.setGlyphs === "function") {
    map.setGlyphs(glyphsUrl);
  }

  if (_basemapUseLocalFonts) {
    const onGlyphError = (event) => {
      const url = String(event?.error?.url || event?.url || "");
      if (!url.includes("/basemap/fonts/")) return;
      map.off("error", onGlyphError);
      console.warn("[local-basemap] Error cargando glifos locales; CDN:", url);
      _basemapUseLocalFonts = false;
      _basemapGlyphsUrl = GLYPHS_CDN;
      map.setGlyphs(GLYPHS_CDN);
    };
    map.on("error", onGlyphError);
  }
}

/** @param {any[]} layers */
function brightLayerDefs(layers) {
  return layers.map((layer) => ({
    ...layer,
    id: `${LAYER_PREFIX}${layer.id}`,
    layout: { ...(layer.layout || {}), visibility: "none" },
  }));
}

/** Estilo mínimo si falla style-local.json (raster o vector). */
function openMapTilesLayerDefs(sourceId, available) {
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
      id: "base-local-transportation",
      type: "line",
      source: sourceId,
      "source-layer": "transportation",
      paint: { "line-color": "#ffffff", "line-width": 1.2 },
    },
  ];
  if (!available?.size) return defs;
  return defs;
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {any} tj
 * @param {string | undefined} anchor
 */
function installRasterBasemap(map, tj, anchor) {
  const tiles = Array.isArray(tj.tiles) && tj.tiles.length ? tj.tiles : [localTileTemplate()];
  if (!map.getSource(RASTER_SOURCE_ID)) {
    map.addSource(RASTER_SOURCE_ID, {
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
        source: RASTER_SOURCE_ID,
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
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {any} tj
 * @param {string | undefined} anchor
 */
async function installMinimalVectorBasemap(map, tj, anchor) {
  const sourceId = RASTER_SOURCE_ID;
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "vector",
      tiles: [localTileTemplate()],
      minzoom: tj.minzoom ?? 0,
      maxzoom: tj.maxzoom ?? 14,
      attribution: tj.attribution || "© OpenStreetMap · MBTiles local",
    });
  }
  const available = vectorLayerIdsFromTileJson(tj);
  const defs = openMapTilesLayerDefs(sourceId, available);
  const added = [];
  let below = anchor;
  for (let i = defs.length - 1; i >= 0; i--) {
    const def = defs[i];
    if (map.getLayer(def.id)) {
      added.push(def.id);
      continue;
    }
    map.addLayer({ ...def, layout: { visibility: "none" } }, below);
    added.push(def.id);
    below = def.id;
  }
  _localLayerIds = added;
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {any} tj
 * @param {string | undefined} anchor
 */
async function installBrightVectorBasemap(map, tj, anchor) {
  const style = await loadBrightStyleJson();
  await configureBasemapSpriteAndGlyphs(map);

  if (!map.getSource(OMT_SOURCE_ID)) {
    map.addSource(OMT_SOURCE_ID, {
      type: "vector",
      tiles: [localTileTemplate()],
      minzoom: tj.minzoom ?? 0,
      maxzoom: tj.maxzoom ?? 14,
      attribution: tj.attribution || "© OpenStreetMap · MBTiles local (OSM Bright)",
    });
  }

  const layers = brightLayerDefs(style.layers || []);
  const added = [];
  let below = anchor;

  for (let i = layers.length - 1; i >= 0; i--) {
    const def = layers[i];
    if (map.getLayer(def.id)) {
      added.push(def.id);
      continue;
    }
    try {
      map.addLayer(def, below);
      added.push(def.id);
      below = def.id;
    } catch (err) {
      console.warn(`[local-basemap] capa omitida ${def.id}:`, err);
    }
  }

  _localLayerIds = added;
  if (!added.length) {
    throw new Error("ninguna capa OSM Bright se pudo añadir");
  }
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
  void loadBrightStyleJson().catch(() => {});
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
  if (typeof map.setGlyphs !== "function") return;
  if (visible && _basemapGlyphsUrl) {
    map.setGlyphs(_basemapGlyphsUrl);
  } else if (!visible) {
    map.setGlyphs(MAPLIBRE_GLYPHS_URL);
  }
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {string} [beforeLayerId]
 */
export async function ensureLocalBasemap(map, beforeLayerId = "base-osm") {
  if (!map) return false;

  const brightReady = map.getLayer(`${LAYER_PREFIX}background`);
  const rasterReady = map.getLayer("base-local-raster");
  if ((brightReady || rasterReady) && _localLayerIds.length) {
    return true;
  }

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
    installRasterBasemap(map, tj, anchor);
    return true;
  }

  try {
    await installBrightVectorBasemap(map, tj, anchor);
    return true;
  } catch (err) {
    console.warn("[local-basemap] OSM Bright no disponible; estilo mínimo:", err);
    await installMinimalVectorBasemap(map, tj, anchor);
    return _localLayerIds.length > 0;
  }
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
