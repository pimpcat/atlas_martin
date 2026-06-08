/**
 * Etiquetas de colonias: una por asentamiento.
 * MapLibre no deduplica symbol sobre polígonos MVT (issue maplibre-gl-js#5042);
 * symbol-avoid-edges no corrige duplicados por tesela.
 * @see https://maplibre.org/maplibre-style-spec/layers/#symbol-symbol-avoid-edges
 *
 * Estrategia:
 * 1) Puntos desde API (ST_PointOnSurface sobre polígono completo, sin vista en BD).
 * 2) Respaldo: querySourceFeatures + promoteId + mayor fragmento por gid.
 */

import { fetchColoniasLabels } from "./api.js";
import { getTurf } from "./mapGeo.js";
import {
  COLONIAS_LABEL_MIN_ZOOM,
  MARTIN_TABLES,
  martinSourceLayer,
} from "./martinLayerStyle.js";

export const COLONIAS_LABEL_GEO_SRC = "src-colonias-label-geo";
export const LAYER_COLONIAS = "ly-colonias";

const _cache = new Map();
let _reqGen = 0;

function coloniasLabelLayerId() {
  return `${LAYER_COLONIAS}-labels`;
}

function coloniasProp(props, ...keys) {
  if (!props) return "";
  for (const key of keys) {
    const val = props[key] ?? props[key.toUpperCase()];
    if (val != null && String(val).trim() !== "") return String(val).trim();
  }
  return "";
}

function coloniasFeatureKey(feature) {
  if (feature?.id != null && String(feature.id).trim() !== "") {
    return `id:${feature.id}`;
  }
  const props = feature?.properties || {};
  const gid = coloniasProp(props, "gid", "GID", "ogc_fid", "OGC_FID");
  if (gid) return `gid:${gid}`;
  const cvegeo = coloniasProp(props, "cvegeo", "CVEGEO");
  if (cvegeo) return `cvegeo:${cvegeo}`;
  const nom = coloniasProp(props, "nom_asen", "NOM_ASEN");
  const mun = coloniasProp(props, "cve_mun", "CVE_MUN");
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
  if (map.getSource(COLONIAS_LABEL_GEO_SRC)) return;
  map.addSource(COLONIAS_LABEL_GEO_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

function setLabelData(map, geojson) {
  ensureGeoSource(map);
  map.getSource(COLONIAS_LABEL_GEO_SRC).setData(geojson);
}

export function clearColoniasLabels(map) {
  if (!map?.getSource(COLONIAS_LABEL_GEO_SRC)) return;
  setLabelData(map, { type: "FeatureCollection", features: [] });
}

function coloniasLabelLayerSpec(map, labelId) {
  return map.getStyle()?.layers?.find((l) => l.id === labelId) || null;
}

function migrateVectorColoniasLabelLayer(map, labelId) {
  const layer = coloniasLabelLayerSpec(map, labelId);
  if (!layer || layer.source === COLONIAS_LABEL_GEO_SRC) return;
  try {
    map.removeLayer(labelId);
  } catch {
    /* noop */
  }
}

function clearColoniasLabelFilter(map, labelId) {
  if (!map?.getLayer(labelId)) return;
  try {
    map.setFilter(labelId, null);
  } catch {
    /* noop */
  }
}

/** Crea capa symbol sobre GeoJSON de puntos (no sobre polígonos Martin). */
export function ensureColoniasLabelLayer(map, labelDef, paintForTheme) {
  const labelId = coloniasLabelLayerId();
  migrateVectorColoniasLabelLayer(map, labelId);
  ensureGeoSource(map);
  const existing = coloniasLabelLayerSpec(map, labelId);
  if (existing?.source === COLONIAS_LABEL_GEO_SRC) {
    clearColoniasLabelFilter(map, labelId);
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
    source: COLONIAS_LABEL_GEO_SRC,
    minzoom: labelDef.minzoom,
    layout: { ...labelDef.layout, visibility: "none" },
    paint: paintForTheme(labelDef),
  });
  clearColoniasLabelFilter(map, labelId);
  return labelId;
}

function buildLabelsFromSourceFeatures(map, cve, munFilter) {
  const srcId = `src-${MARTIN_TABLES.colonias}`;
  const sl = martinSourceLayer(MARTIN_TABLES.colonias);
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
    const key = coloniasFeatureKey(feature);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || bboxSpan(feature.geometry) > bboxSpan(prev.geometry)) {
      byKey.set(key, feature);
    }
  }

  const points = [];
  for (const feature of byKey.values()) {
    const nom = coloniasProp(feature.properties, "nom_asen", "NOM_ASEN");
    if (!nom) continue;
    const coords = labelPointFromFeature(feature);
    if (!coords) continue;
    points.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: { nom_asen: nom, NOM_ASEN: nom },
    });
  }
  return { type: "FeatureCollection", features: points };
}

function labelsShouldLoad(ctx) {
  return !ctx.homeMode && ctx.coloniasActive;
}

function labelsShouldRender(map, ctx) {
  if (!labelsShouldLoad(ctx)) return false;
  return map.getZoom() >= COLONIAS_LABEL_MIN_ZOOM;
}

/** Sincroniza puntos de etiqueta (API → respaldo por teselas). */
export async function syncColoniasLabels(map, ctx, munFilter, ensureLayer) {
  if (typeof ensureLayer === "function") ensureLayer();
  const labelId = coloniasLabelLayerId();
  if (!map?.getLayer(labelId)) return;

  clearColoniasLabelFilter(map, labelId);

  if (!labelsShouldLoad(ctx)) {
    clearColoniasLabels(map);
    return;
  }

  const cve = ctx.focusCve || "001";
  const gen = ++_reqGen;

  try {
    let fc = _cache.get(cve);
    if (!fc) {
      fc = await fetchColoniasLabels(cve);
      _cache.set(cve, fc);
    }
    if (gen !== _reqGen || !labelsShouldLoad(ctx)) return;
    if (!labelsShouldRender(map, ctx)) {
      clearColoniasLabels(map);
      return;
    }
    setLabelData(map, fc);
  } catch (err) {
    if (gen !== _reqGen || !labelsShouldLoad(ctx)) return;
    if (!labelsShouldRender(map, ctx)) {
      clearColoniasLabels(map);
      return;
    }
    const fc = buildLabelsFromSourceFeatures(map, cve, munFilter);
    setLabelData(map, fc);
    if (!fc.features.length) {
      console.warn("[colonias-labels] sin puntos (API y teselas):", err);
    }
  }

  try {
    map.moveLayer(labelId);
  } catch {
    /* noop */
  }
}

export function scheduleColoniasLabelsSync(map, ctx, munFilter, ensureLayer) {
  if (!map || ctx.homeMode) return;
  void syncColoniasLabels(map, ctx, munFilter, ensureLayer);
}

export function bindColoniasLabelsSync(map, getCtx, munFilter, ensureLayer) {
  if (!map || map.__coloniasLabelsBound) return;
  map.__coloniasLabelsBound = true;
  let timer = null;
  const run = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      scheduleColoniasLabelsSync(map, getCtx(), munFilter, ensureLayer);
    }, 80);
  };
  map.on("moveend", run);
  map.on("zoomend", run);
  map.on("idle", run);
  map.on("sourcedata", (e) => {
    if (e.sourceId !== `src-${MARTIN_TABLES.colonias}`) return;
    if (!getCtx().coloniasActive || getCtx().homeMode) return;
    run();
  });
}

export function coloniasLabelLayerIdForOverlay() {
  return coloniasLabelLayerId();
}
