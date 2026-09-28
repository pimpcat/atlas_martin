/**
 * Etiquetas de polígonos publicados en catálogo (data-driven, source=centroid).
 * Una etiqueta por feature vía ST_PointOnSurface (API), sin duplicados por tesela MVT.
 */

import { fetchPolygonCatalogLabels } from "./api.js";
import { isMapZoomAtLeast, mapLibreLayoutMinzoom } from "./visorMapZoom.js";

/** @type {Map<string, object>} */
const _cache = new Map();
/** @type {Map<string, number>} */
const _reqGen = new Map();
/** @type {Map<string, { layerId: string, minzoom: number, active: boolean, stateWide: boolean, focusCve: string }>} */
const _ctxByOverlay = new Map();

function attributeFilterKey(attrFilter) {
  if (!attrFilter?.field || !attrFilter?.values?.length) return "";
  const vals = attrFilter.values.map((v) => String(v).trim()).filter(Boolean);
  if (!vals.length) return "";
  return `${attrFilter.field}=${vals.join("|")}`;
}

export function catalogPolygonLabelGeoSourceId(overlayKey) {
  return `src-${overlayKey}-label-geo`;
}

export function isCentroidLabelDef(labelDef) {
  return labelDef?.source === "centroid";
}

function cacheKey(layerId, stateWide, cve, filterKey) {
  const base = stateWide ? `${layerId}:estatal` : `${layerId}:${cve || "001"}`;
  return filterKey ? `${base}:${filterKey}` : base;
}

function ensureGeoSource(map, overlayKey) {
  const srcId = catalogPolygonLabelGeoSourceId(overlayKey);
  if (map.getSource(srcId)) return srcId;
  map.addSource(srcId, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  return srcId;
}

function setLabelData(map, overlayKey, geojson) {
  const srcId = ensureGeoSource(map, overlayKey);
  map.getSource(srcId).setData(geojson);
}

export function clearCatalogPolygonLabels(map, overlayKey) {
  const srcId = catalogPolygonLabelGeoSourceId(overlayKey);
  if (!map?.getSource(srcId)) return;
  setLabelData(map, overlayKey, { type: "FeatureCollection", features: [] });
}

function migrateVectorLabelLayer(map, overlayKey, labelId) {
  const srcId = catalogPolygonLabelGeoSourceId(overlayKey);
  const layer = map.getStyle()?.layers?.find((l) => l.id === labelId);
  if (!layer || layer.source === srcId) return;
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
export function ensureCatalogPolygonLabelLayer(map, overlayKey, labelDef, labelId, paintForTheme) {
  migrateVectorLabelLayer(map, overlayKey, labelId);
  ensureGeoSource(map, overlayKey);
  const srcId = catalogPolygonLabelGeoSourceId(overlayKey);
  const existing = map.getStyle()?.layers?.find((l) => l.id === labelId);
  if (existing?.source === srcId) {
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
    source: srcId,
    minzoom: mapLibreLayoutMinzoom(labelDef.minzoom ?? 0),
    layout: { ...labelDef.layout, visibility: "none" },
    paint: paintForTheme(labelDef),
  });
  clearLabelFilter(map, labelId);
  return labelId;
}

function labelsShouldLoad(ctx) {
  return Boolean(ctx?.active);
}

function labelsShouldRender(map, ctx) {
  if (!labelsShouldLoad(ctx)) return false;
  const minz = Number(ctx.minzoom ?? 14);
  return isMapZoomAtLeast(map.getZoom(), minz);
}

export function registerCatalogPolygonLabelCtx(overlayKey, ctx) {
  if (!ctx?.active) {
    _ctxByOverlay.delete(overlayKey);
    return;
  }
  const prev = _ctxByOverlay.get(overlayKey);
  const next = {
    ...ctx,
    filterKey: attributeFilterKey(ctx.attributeFilter),
  };
  if (
    prev &&
    (prev.filterKey !== next.filterKey ||
      prev.layerId !== next.layerId ||
      prev.stateWide !== next.stateWide ||
      prev.focusCve !== next.focusCve)
  ) {
    invalidateCatalogPolygonLabelCache(next.layerId);
  }
  _ctxByOverlay.set(overlayKey, next);
}

export async function syncCatalogPolygonLabels(map, overlayKey) {
  const ctx = _ctxByOverlay.get(overlayKey);
  const labelId = ctx?.labelId || `ly-${overlayKey}-labels`;
  if (!map?.getLayer(labelId) || !ctx?.layerId) return;

  clearLabelFilter(map, labelId);

  if (!labelsShouldLoad(ctx)) {
    clearCatalogPolygonLabels(map, overlayKey);
    return;
  }

  const gen = (_reqGen.get(overlayKey) || 0) + 1;
  _reqGen.set(overlayKey, gen);

  const cKey = cacheKey(ctx.layerId, ctx.stateWide, ctx.focusCve, ctx.filterKey || "");

  try {
    let fc = _cache.get(cKey);
    if (!fc) {
      fc = await fetchPolygonCatalogLabels(ctx.layerId, {
        cveMun: ctx.stateWide ? "" : ctx.focusCve || "001",
        stateWide: ctx.stateWide,
      });
      _cache.set(cKey, fc);
    }
    if (gen !== _reqGen.get(overlayKey) || !labelsShouldLoad(_ctxByOverlay.get(overlayKey))) return;
    if (!labelsShouldRender(map, ctx)) {
      clearCatalogPolygonLabels(map, overlayKey);
      return;
    }
    setLabelData(map, overlayKey, fc);
    try {
      map.setLayoutProperty(labelId, "visibility", "visible");
    } catch {
      /* noop */
    }
  } catch (err) {
    if (gen !== _reqGen.get(overlayKey)) return;
    clearCatalogPolygonLabels(map, overlayKey);
    console.warn(`[visor-labels:${overlayKey}]`, err);
  }
}

export function scheduleCatalogPolygonLabelsSync(map, overlayKey) {
  if (!map) return;
  void syncCatalogPolygonLabels(map, overlayKey);
}

export function invalidateCatalogPolygonLabelCache(layerId) {
  if (!layerId) {
    _cache.clear();
    return;
  }
  const prefix = `${layerId}:`;
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

export function bindCatalogPolygonLabelsSync(map, getStateWide, getFocusCve) {
  if (!map || map.__catalogPolygonLabelsBound) return;
  map.__catalogPolygonLabelsBound = true;
  let timer = null;
  const run = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      for (const overlayKey of _ctxByOverlay.keys()) {
        const ctx = _ctxByOverlay.get(overlayKey);
        if (!ctx) continue;
        ctx.stateWide = Boolean(getStateWide?.());
        ctx.focusCve = getFocusCve?.() || ctx.focusCve || "001";
        scheduleCatalogPolygonLabelsSync(map, overlayKey);
      }
    }, 80);
  };
  map.on("moveend", run);
  map.on("zoomend", run);
  map.on("idle", run);
}
