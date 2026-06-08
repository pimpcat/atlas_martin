/**
 * Etiquetas de localidades con amanzanamiento (c_l): una por polígono.
 * Misma estrategia que colonias: puntos GeoJSON desde API (ST_PointOnSurface).
 */

import { fetchLocsAtlasLabels } from "./api.js";
import { getTurf } from "./mapGeo.js";
import {
  LOCS_ATLAS_LABEL_MIN_ZOOM,
  MARTIN_TABLES,
  martinSourceLayer,
} from "./martinLayerStyle.js";

export const LOCS_ATLAS_LABEL_GEO_SRC = "src-locs-atlas-label-geo";
export const LAYER_LOCS_ATLAS = "ly-locsAtlas";

const _cache = new Map();
let _reqGen = 0;

function locsAtlasLabelLayerId() {
  return `${LAYER_LOCS_ATLAS}-labels`;
}

function locsProp(props, ...keys) {
  if (!props) return "";
  for (const key of keys) {
    const val = props[key] ?? props[key.toUpperCase()];
    if (val != null && String(val).trim() !== "") return String(val).trim();
  }
  return "";
}

function locsAtlasFeatureKey(feature) {
  if (feature?.id != null && String(feature.id).trim() !== "") {
    return `id:${feature.id}`;
  }
  const props = feature?.properties || {};
  const gid = locsProp(props, "gid", "GID", "ogc_fid", "OGC_FID");
  if (gid) return `gid:${gid}`;
  const cvegeo = locsProp(props, "cvegeo", "CVEGEO");
  if (cvegeo) return `cvegeo:${cvegeo}`;
  const nom = locsProp(props, "nomgeo", "NOMGEO");
  const mun = locsProp(props, "cve_mun", "CVE_MUN");
  if (nom) return `nom:${nom}|mun:${mun}`;
  return "";
}

function geometryBbox(geometry) {
  if (!geometry?.coordinates) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      if (lng < west) west = lng;
      if (lat < south) south = lat;
      if (lng > east) east = lng;
      if (lat > north) north = lat;
      return;
    }
    for (const part of coords) walk(part);
  };
  walk(geometry.coordinates);
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

function bboxSpan(geometry) {
  const bb = geometryBbox(geometry);
  if (!bb) return 0;
  return Math.max(0, bb[2] - bb[0]) * Math.max(0, bb[3] - bb[1]);
}

function bboxCenter(geometry) {
  const bb = geometryBbox(geometry);
  if (!bb) return null;
  return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
}

function labelPointFromFeature(feature) {
  const turf = getTurf();
  if (turf) {
    try {
      return turf.pointOnFeature(feature).geometry.coordinates;
    } catch {
      try {
        return turf.centerOfMass(feature).geometry.coordinates;
      } catch {
        /* fallback abajo */
      }
    }
  }
  return bboxCenter(feature.geometry);
}

function ensureGeoSource(map) {
  if (map.getSource(LOCS_ATLAS_LABEL_GEO_SRC)) return;
  map.addSource(LOCS_ATLAS_LABEL_GEO_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

function setLabelData(map, geojson) {
  ensureGeoSource(map);
  map.getSource(LOCS_ATLAS_LABEL_GEO_SRC).setData(geojson);
}

export function clearLocsAtlasLabels(map) {
  if (!map?.getSource(LOCS_ATLAS_LABEL_GEO_SRC)) return;
  setLabelData(map, { type: "FeatureCollection", features: [] });
}

function labelLayerSpec(map, labelId) {
  return map.getStyle()?.layers?.find((l) => l.id === labelId) || null;
}

function migrateVectorLabelLayer(map, labelId) {
  const layer = labelLayerSpec(map, labelId);
  if (!layer || layer.source === LOCS_ATLAS_LABEL_GEO_SRC) return;
  try {
    map.removeLayer(labelId);
  } catch {
    /* noop */
  }
}

function clearLabelFilter(map, labelId) {
  if (!map?.getLayer(labelId)) return;
  try {
    map.setFilter(labelId, null);
  } catch {
    /* noop */
  }
}

/** Crea capa symbol sobre GeoJSON de puntos (no sobre polígonos Martin). */
export function ensureLocsAtlasLabelLayer(map, labelDef, paintForTheme) {
  const labelId = locsAtlasLabelLayerId();
  migrateVectorLabelLayer(map, labelId);
  ensureGeoSource(map);
  const existing = labelLayerSpec(map, labelId);
  if (existing?.source === LOCS_ATLAS_LABEL_GEO_SRC) {
    clearLabelFilter(map, labelId);
    return labelId;
  }
  if (existing) {
    try {
      map.removeLayer(labelId);
    } catch {
      /* noop */
    }
  }
  map.addLayer({
    id: labelId,
    type: "symbol",
    source: LOCS_ATLAS_LABEL_GEO_SRC,
    minzoom: labelDef.minzoom,
    layout: { ...labelDef.layout, visibility: "none" },
    paint: paintForTheme(labelDef),
  });
  clearLabelFilter(map, labelId);
  return labelId;
}

function buildLabelsFromSourceFeatures(map, cve, munFilter) {
  const srcId = `src-${MARTIN_TABLES.locsAtlas}`;
  const sl = martinSourceLayer(MARTIN_TABLES.locsAtlas);
  if (!map.getSource(srcId)) {
    return { type: "FeatureCollection", features: [] };
  }
  let feats = [];
  try {
    feats = map.querySourceFeatures(srcId, {
      sourceLayer: sl,
      filter: munFilter(cve),
    });
  } catch {
    return { type: "FeatureCollection", features: [] };
  }

  const byKey = new Map();
  for (const feature of feats) {
    const key = locsAtlasFeatureKey(feature);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || bboxSpan(feature.geometry) > bboxSpan(prev.geometry)) {
      byKey.set(key, feature);
    }
  }

  const points = [];
  for (const feature of byKey.values()) {
    const nom = locsProp(feature.properties, "nomgeo", "NOMGEO");
    const cvegeo = locsProp(feature.properties, "cvegeo", "CVEGEO");
    if (!nom && !cvegeo) continue;
    const coords = labelPointFromFeature(feature);
    if (!coords) continue;
    const props = {};
    if (nom) {
      props.nomgeo = nom;
      props.NOMGEO = nom;
    }
    if (cvegeo) {
      props.cvegeo = cvegeo;
      props.CVEGEO = cvegeo;
    }
    points.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: props,
    });
  }
  return { type: "FeatureCollection", features: points };
}

function labelsShouldLoad(ctx) {
  return !ctx.homeMode && ctx.locsAtlasActive;
}

function labelsShouldRender(map, ctx) {
  if (!labelsShouldLoad(ctx)) return false;
  return map.getZoom() >= LOCS_ATLAS_LABEL_MIN_ZOOM;
}

/** Sincroniza puntos de etiqueta (API → respaldo por teselas). */
export async function syncLocsAtlasLabels(map, ctx, munFilter, ensureLayer) {
  if (typeof ensureLayer === "function") ensureLayer();
  const labelId = locsAtlasLabelLayerId();
  if (!map?.getLayer(labelId)) return;

  clearLabelFilter(map, labelId);

  if (!labelsShouldLoad(ctx)) {
    clearLocsAtlasLabels(map);
    return;
  }

  const cve = ctx.focusCve || "001";
  const gen = ++_reqGen;

  try {
    let fc = _cache.get(cve);
    if (!fc) {
      fc = await fetchLocsAtlasLabels(cve);
      _cache.set(cve, fc);
    }
    if (gen !== _reqGen || !labelsShouldLoad(ctx)) return;
    if (!labelsShouldRender(map, ctx)) {
      clearLocsAtlasLabels(map);
      return;
    }
    setLabelData(map, fc);
  } catch (err) {
    if (gen !== _reqGen || !labelsShouldLoad(ctx)) return;
    if (!labelsShouldRender(map, ctx)) {
      clearLocsAtlasLabels(map);
      return;
    }
    const fc = buildLabelsFromSourceFeatures(map, cve, munFilter);
    setLabelData(map, fc);
    if (!fc.features.length) {
      console.warn("[locs-atlas-labels] sin puntos (API y teselas):", err);
    }
  }

  try {
    map.moveLayer(labelId);
  } catch {
    /* noop */
  }
}

export function scheduleLocsAtlasLabelsSync(map, ctx, munFilter, ensureLayer) {
  if (!map || ctx.homeMode) return;
  void syncLocsAtlasLabels(map, ctx, munFilter, ensureLayer);
}

export function bindLocsAtlasLabelsSync(map, getCtx, munFilter, ensureLayer) {
  if (!map || map.__locsAtlasLabelsBound) return;
  map.__locsAtlasLabelsBound = true;
  let timer = null;
  const run = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      scheduleLocsAtlasLabelsSync(map, getCtx(), munFilter, ensureLayer);
    }, 80);
  };
  map.on("moveend", run);
  map.on("zoomend", run);
  map.on("idle", run);
  map.on("sourcedata", (e) => {
    if (e.sourceId !== `src-${MARTIN_TABLES.locsAtlas}`) return;
    if (!getCtx().locsAtlasActive || getCtx().homeMode) return;
    run();
  });
}

export function locsAtlasLabelLayerIdForOverlay() {
  return locsAtlasLabelLayerId();
}
