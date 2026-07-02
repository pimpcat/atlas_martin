/**
 * Capas de punto con agrupación (clusters) MapLibre vía GeoJSON municipal.
 * Modo híbrido: clusters GeoJSON + iconos sueltos (GeoJSON symbol) + MVT desde zoom de entrega.
 */
import { apiUrl } from "./atlasConfig.js";
import { ensureVisorIconKeyOnMap, getIconMaplibreId } from "./visorIconRegistry.js";
import { MAPLIBRE_GLYPHS_URL } from "./martinLayerStyle.js";
import { mapLibreLayoutMinzoom } from "./visorMapZoom.js";
import { overlayBaseLayerIdOnMap, overlaySubLayerIdOnMap } from "./visorMapLayerIds.js";

/** @type {Record<string, { radius: number, maxZoom: number, minPoints: number }>} */
export const VISOR_CLUSTER_PRESETS = {
  standard: { radius: 50, maxZoom: 14, minPoints: 2 },
  compact: { radius: 35, maxZoom: 15, minPoints: 2 },
  wide: { radius: 70, maxZoom: 13, minPoints: 2 },
  sparse: { radius: 45, maxZoom: 12, minPoints: 3 },
};

const _clusterBindings = new WeakMap();
const _clusterLoadGen = new Map();

export function resolveClusterLayerId(def) {
  return String(def?.layerId || def?.catalogLayerId || "").trim();
}

export function overlayUsesCluster(def) {
  return Boolean(def?.cluster?.enabled && resolveClusterLayerId(def));
}

export function clusterUsesSymbolMvtLoose(def) {
  return def?.type === "symbol" && Boolean(def?.visorIconKey || def?.visorIconKeys?.length);
}

export function clusterSourceId(def) {
  return `src-cluster-${def.key}`;
}

export function clusterUnclusteredLayerId(baseLayerId) {
  return `${baseLayerId}-unclustered`;
}

/** Etiquetas en puntos sueltos (GeoJSON cluster) por debajo del zoom de entrega. */
export function clusterLooseLabelLayerId(baseLayerId) {
  return `${baseLayerId}-labels-loose`;
}

export function isClusterNonPickLayerId(layerId) {
  if (!layerId) return false;
  return (
    layerId.endsWith("-clusters") ||
    layerId.endsWith("-cluster-count") ||
    layerId.endsWith("-labels-loose")
  );
}

/** Capas interactivas (hover / identify): sueltos GeoJSON + MVT; sin círculos de cluster. */
export function clusterPickLayerIds(map, baseLayerId) {
  if (!map) return [];
  const base = overlayBaseLayerIdOnMap(map, baseLayerId) || baseLayerId;
  const ids = [];
  const looseId = overlaySubLayerIdOnMap(map, base, "-unclustered");
  if (looseId) ids.push(looseId);
  if (map.getLayer(base)) ids.push(base);
  return ids;
}

export function clusterMvtLabelLayerId(baseLayerId) {
  return `${baseLayerId}-labels`;
}

export function clusterLooseProbeLayerId(baseLayerId) {
  return `${baseLayerId}-loose-probe`;
}

export function clusterLayerIds(baseLayerId) {
  return [
    `${baseLayerId}-clusters`,
    `${baseLayerId}-cluster-count`,
    clusterUnclusteredLayerId(baseLayerId),
  ];
}

export function clusterGeoOnlyLayerIds(baseLayerId) {
  return [`${baseLayerId}-clusters`, `${baseLayerId}-cluster-count`];
}

/** Sub-capas cluster en orden de pintado (abajo → arriba) para restack global. */
export function clusterOverlayRestackLayerIds(map, baseLayerId) {
  if (!map) return [];
  const base = overlayBaseLayerIdOnMap(map, baseLayerId) || baseLayerId;
  return [
    overlaySubLayerIdOnMap(map, base, "-clusters"),
    overlaySubLayerIdOnMap(map, base, "-cluster-count"),
    overlaySubLayerIdOnMap(map, base, "-labels-loose"),
    overlaySubLayerIdOnMap(map, base, "-labels"),
    base,
    overlaySubLayerIdOnMap(map, base, "-unclustered"),
  ].filter(Boolean);
}

export function clusterMvtLayerIds(baseLayerId) {
  return [baseLayerId];
}

export function clusterPreset(def) {
  const key = String(def?.cluster?.preset || "standard").toLowerCase();
  return VISOR_CLUSTER_PRESETS[key] || VISOR_CLUSTER_PRESETS.standard;
}

export function resolveClusterHandoffZoom(def) {
  return clusterPreset(def).maxZoom;
}

/** Filtro MapLibre: hojas sueltas del GeoJSON clusterizado en el zoom actual. */
export function clusterUnclusteredLeafFilter() {
  return ["!", ["has", "point_count"]];
}

const CLUSTER_COUNT_FONT = ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"];

function ensureClusterMapGlyphs(map) {
  if (!map?.getStyle) return;
  const style = map.getStyle();
  if (style?.glyphs) return;
  try {
    map.setStyle({ ...style, glyphs: MAPLIBRE_GLYPHS_URL });
  } catch (err) {
    console.warn("[visor-cluster] glyphs no disponibles", err);
  }
}

function clusterCountLayout() {
  return {
    visibility: "none",
    "text-field": ["to-string", ["get", "point_count"]],
    "text-font": CLUSTER_COUNT_FONT,
    "text-size": 13,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "text-anchor": "center",
  };
}

function clusterCountPaint() {
  return {
    "text-color": "#ffffff",
    "text-halo-color": "#0f766e",
    "text-halo-width": 1.25,
  };
}

function clusterPointFilter(minPoints) {
  return ["all", ["has", "point_count"], [">=", ["get", "point_count"], minPoints]];
}

function applyClusterCountLayerSpec(map, countLayerId, spec, handoffZoom, minPoints) {
  const filter = clusterPointFilter(minPoints);
  if (!map.getLayer(countLayerId)) {
    try {
      map.addLayer({
        ...spec,
        id: countLayerId,
        type: "symbol",
        filter,
        maxzoom: handoffZoom,
        layout: clusterCountLayout(),
        paint: clusterCountPaint(),
      });
    } catch (err) {
      console.warn("[visor-cluster] capa contador", countLayerId, err);
    }
    return;
  }
  try {
    map.setFilter(countLayerId, filter);
    map.setLayoutProperty(countLayerId, "text-field", clusterCountLayout()["text-field"]);
    map.setLayoutProperty(countLayerId, "text-font", CLUSTER_COUNT_FONT);
    map.setLayoutProperty(countLayerId, "text-size", 13);
    map.setLayoutProperty(countLayerId, "text-allow-overlap", true);
    map.setLayoutProperty(countLayerId, "text-ignore-placement", true);
    map.setLayoutProperty(countLayerId, "text-anchor", "center");
    map.setPaintProperty(countLayerId, "text-color", "#ffffff");
    map.setPaintProperty(countLayerId, "text-halo-color", "#0f766e");
    map.setPaintProperty(countLayerId, "text-halo-width", 1.25);
  } catch {
    /* noop */
  }
}

function clusterCirclePaint() {
  return {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#0d9488",
      10,
      "#0891b2",
      50,
      "#0369a1",
    ],
    "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.95,
  };
}

function unclusteredCirclePaint(def) {
  const base = def?.paint || {};
  if (base["circle-color"]) {
    return {
      "circle-color": base["circle-color"],
      "circle-radius": base["circle-radius"] ?? 6,
      "circle-stroke-width": base["circle-stroke-width"] ?? 1,
      "circle-stroke-color": base["circle-stroke-color"] ?? "#ffffff",
      "circle-opacity": base["circle-opacity"] ?? 0.92,
    };
  }
  return {
    "circle-color": def?.clusterColor || "#0d9488",
    "circle-radius": 6,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.92,
  };
}

function removeLayerIfExists(map, id) {
  try {
    if (map.getLayer(id)) map.removeLayer(id);
  } catch {
    /* noop */
  }
}

function bindClusterInteractions(map, def, srcId, clusterLayerId) {
  if (_clusterBindings.get(map)?.has(clusterLayerId)) return;
  const onClick = (ev) => {
    const features = map.queryRenderedFeatures(ev.point, { layers: [clusterLayerId] });
    const feature = features[0];
    if (!feature) return;
    const clusterId = feature.properties?.cluster_id;
    const src = map.getSource(srcId);
    if (clusterId == null || !src?.getClusterExpansionZoom) return;
    src.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(zoom + 0.5, 18) });
    });
  };
  map.on("click", clusterLayerId, onClick);
  map.on("mouseenter", clusterLayerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", clusterLayerId, () => {
    map.getCanvas().style.cursor = "";
  });
  let set = _clusterBindings.get(map);
  if (!set) {
    set = new Set();
    _clusterBindings.set(map, set);
  }
  set.add(clusterLayerId);
}

export function orderClusterGeoJsonLayers(map, baseLayerId) {
  orderClusterOverlayLayers(map, baseLayerId);
}

/**
 * Orden relativo dentro del grupo cluster (abajo → arriba).
 * Preferir `restackVisorOverlayLayersByGeometry` en map.js para el stack global.
 */
export function orderClusterOverlayLayers(map, baseLayerId) {
  if (!map) return;
  const stack = [
    `${baseLayerId}-clusters`,
    `${baseLayerId}-cluster-count`,
    clusterLooseLabelLayerId(baseLayerId),
    clusterMvtLabelLayerId(baseLayerId),
    baseLayerId,
    clusterUnclusteredLayerId(baseLayerId),
  ].filter((id) => map.getLayer(id));
  try {
    for (const id of stack) {
      map.moveLayer(id);
    }
  } catch {
    /* noop */
  }
}

export function removeClusterLegacyHitLayer(map, def) {
  if (!map || !def) return;
  removeLayerIfExists(map, `ly-${def.key}-hit`);
}

export function removeClusterLooseProbeLayer(map, def) {
  if (!map || !def) return;
  removeLayerIfExists(map, clusterLooseProbeLayerId(`ly-${def.key}`));
}

/** Quita capas legadas (-hit, -loose-probe, -unclustered circle). */
export function purgeClusterLegacySubLayers(map, def) {
  if (!map || !def) return;
  removeClusterLegacyHitLayer(map, def);
  removeClusterLooseProbeLayer(map, def);
  const unclusteredId = clusterUnclusteredLayerId(`ly-${def.key}`);
  const existing = map.getLayer(unclusteredId);
  if (existing?.type === "circle") {
    removeLayerIfExists(map, unclusteredId);
  }
}

export function purgeAllLooseProbeLayers(map) {
  if (!map?.getStyle) return;
  for (const layer of map.getStyle()?.layers || []) {
    if (!layer.id.endsWith("-loose-probe")) continue;
    removeLayerIfExists(map, layer.id);
  }
}

export function removeClusterUnclusteredLayer(map, def) {
  if (!map || !def) return;
  removeLayerIfExists(map, clusterUnclusteredLayerId(`ly-${def.key}`));
}

function buildUnclusteredSymbolLayout(def) {
  const baseLayout = { ...(def.layout || {}) };
  if (!baseLayout["icon-image"] && def.visorIconKey) {
    const iconId = getIconMaplibreId(def.visorIconKey);
    if (iconId) baseLayout["icon-image"] = iconId;
  }
  return {
    visibility: "none",
    ...baseLayout,
    "icon-allow-overlap": baseLayout["icon-allow-overlap"] ?? true,
    "icon-ignore-placement": baseLayout["icon-ignore-placement"] ?? true,
    "icon-padding": Math.max(Number(baseLayout["icon-padding"]) || 0, 16),
  };
}

/** Capa symbol en puntos sueltos (mismo icono que MVT), solo por debajo del zoom de entrega. */
/**
 * Etiquetas data-driven en hojas sueltas del GeoJSON clusterizado.
 * @param {import("maplibre-gl").Map} map
 * @param {object} def
 * @param {object} labelDef - buildCatalogLabelDef
 * @param {object} paint
 */
export function ensureClusterLooseLabelLayer(map, def, labelDef, paint) {
  if (!map || !def || !labelDef || !overlayUsesCluster(def)) return;
  ensureClusterGeoJsonLayers(map, def);
  ensureClusterMapGlyphs(map);
  const layerId = `ly-${def.key}`;
  const looseLabelId = clusterLooseLabelLayerId(layerId);
  const srcId = clusterSourceId(def);
  const handoffZoom = resolveClusterHandoffZoom(def);
  if (!map.getSource(srcId)) return;

  const spec = {
    source: srcId,
    filter: clusterUnclusteredLeafFilter(),
    maxzoom: handoffZoom,
    minzoom: mapLibreLayoutMinzoom(labelDef.minzoom ?? 0),
  };
  const layout = { ...labelDef.layout, visibility: "none" };
  const layerPaint = paint || labelDef.paint || {};

  if (!map.getLayer(looseLabelId)) {
    map.addLayer({
      ...spec,
      id: looseLabelId,
      type: "symbol",
      layout,
      paint: layerPaint,
    });
  } else {
    try {
      map.setFilter(looseLabelId, clusterUnclusteredLeafFilter());
      for (const [key, value] of Object.entries(labelDef.layout)) {
        if (key === "visibility") continue;
        map.setLayoutProperty(looseLabelId, key, value);
      }
    } catch {
      /* noop */
    }
  }
}

export function applyClusterLooseLabelSpec(map, def, labelDef, paint) {
  if (!map || !def || !labelDef) return;
  const looseLabelId = clusterLooseLabelLayerId(`ly-${def.key}`);
  if (!map.getLayer(looseLabelId)) return;
  try {
    for (const [prop, val] of Object.entries(labelDef.layout)) {
      if (prop === "visibility") continue;
      map.setLayoutProperty(looseLabelId, prop, val);
    }
    const layerPaint = paint || labelDef.paint || {};
    for (const [prop, val] of Object.entries(layerPaint)) {
      map.setPaintProperty(looseLabelId, prop, val);
    }
    map.setLayerZoomRange(
      looseLabelId,
      mapLibreLayoutMinzoom(labelDef.minzoom ?? 0),
      resolveClusterHandoffZoom(def),
    );
  } catch {
    /* noop */
  }
}

export function syncClusterLabelHandoffVisibility(map, def, active, belowHandoff, cve) {
  if (!map || !def) return;
  const layerId = `ly-${def.key}`;
  const looseLabelId = overlaySubLayerIdOnMap(map, layerId, "-labels-loose");
  const mvtLabelId = overlaySubLayerIdOnMap(map, layerId, "-labels");
  const emptyFilter = ["literal", false];

  if (looseLabelId) {
    try {
      map.setLayoutProperty(
        looseLabelId,
        "visibility",
        active && belowHandoff ? "visible" : "none",
      );
    } catch {
      /* noop */
    }
  }

  if (!mvtLabelId) return;
  try {
    if (!active) {
      map.setLayoutProperty(mvtLabelId, "visibility", "none");
      map.setFilter(mvtLabelId, emptyFilter);
      return;
    }
    if (belowHandoff) {
      map.setLayoutProperty(mvtLabelId, "visibility", "none");
      map.setFilter(mvtLabelId, emptyFilter);
    } else {
      map.setLayoutProperty(mvtLabelId, "visibility", "visible");
    }
  } catch {
    /* noop */
  }
}

export async function ensureClusterUnclusteredSymbol(map, def) {
  if (!map || !def || !clusterUsesSymbolMvtLoose(def)) return;
  purgeClusterLegacySubLayers(map, def);

  const layerId = `ly-${def.key}`;
  const unclusteredId = clusterUnclusteredLayerId(layerId);
  const srcId = clusterSourceId(def);
  const handoffZoom = resolveClusterHandoffZoom(def);

  if (def.visorIconKeys?.length) {
    await Promise.all(def.visorIconKeys.map((k) => ensureVisorIconKeyOnMap(map, k)));
  } else if (def.visorIconKey) {
    await ensureVisorIconKeyOnMap(map, def.visorIconKey);
  }

  const spec = {
    source: srcId,
    filter: clusterUnclusteredLeafFilter(),
    maxzoom: handoffZoom,
  };
  if (def.minzoom != null) spec.minzoom = mapLibreLayoutMinzoom(def.minzoom);

  const layout = buildUnclusteredSymbolLayout(def);
  const paint = def.paint || {};

  if (!map.getLayer(unclusteredId)) {
    map.addLayer({
      ...spec,
      id: unclusteredId,
      type: "symbol",
      layout,
      paint,
    });
  } else if (map.getLayer(unclusteredId)?.type === "symbol") {
    try {
      map.setFilter(unclusteredId, clusterUnclusteredLeafFilter());
      for (const [key, value] of Object.entries(layout)) {
        map.setLayoutProperty(unclusteredId, key, value);
      }
    } catch {
      /* noop */
    }
  } else {
    removeLayerIfExists(map, unclusteredId);
    map.addLayer({
      ...spec,
      id: unclusteredId,
      type: "symbol",
      layout,
      paint,
    });
  }
}

export function ensureClusterGeoJsonLayers(map, def) {
  purgeClusterLegacySubLayers(map, def);
  ensureClusterMapGlyphs(map);
  const layerId = `ly-${def.key}`;
  const srcId = clusterSourceId(def);
  const preset = clusterPreset(def);
  const handoffZoom = preset.maxZoom;
  const clusterLayerId = `${layerId}-clusters`;
  const countLayerId = `${layerId}-cluster-count`;
  const pointLayerId = clusterUnclusteredLayerId(layerId);

  if (!map.getSource(srcId)) {
    map.addSource(srcId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: preset.radius,
      clusterMaxZoom: handoffZoom,
      clusterMinPoints: preset.minPoints,
    });
  }

  const spec = { source: srcId };
  if (def.minzoom != null) spec.minzoom = mapLibreLayoutMinzoom(def.minzoom);
  const pointFilter = clusterPointFilter(preset.minPoints);

  if (!map.getLayer(clusterLayerId)) {
    map.addLayer({
      ...spec,
      id: clusterLayerId,
      type: "circle",
      filter: pointFilter,
      paint: clusterCirclePaint(),
      maxzoom: handoffZoom,
      layout: { visibility: "none" },
    });
  } else {
    try {
      map.setFilter(clusterLayerId, pointFilter);
    } catch {
      /* noop */
    }
  }

  applyClusterCountLayerSpec(map, countLayerId, spec, handoffZoom, preset.minPoints);

  if (!clusterUsesSymbolMvtLoose(def) && !map.getLayer(pointLayerId)) {
    map.addLayer({
      ...spec,
      id: pointLayerId,
      type: "circle",
      filter: clusterUnclusteredLeafFilter(),
      paint: unclusteredCirclePaint(def),
      maxzoom: handoffZoom,
      layout: { visibility: "none" },
    });
  }

  bindClusterInteractions(map, def, srcId, clusterLayerId);
  syncClusterLayerZoomRanges(map, def);
  return layerId;
}

export function syncClusterLayerZoomRanges(map, def) {
  if (!map || !def) return;
  const layerId = `ly-${def.key}`;
  const handoffZoom = resolveClusterHandoffZoom(def);
  const geoMin = def.minzoom != null ? mapLibreLayoutMinzoom(def.minzoom) : null;

  for (const id of [...clusterGeoOnlyLayerIds(layerId), clusterUnclusteredLayerId(layerId)]) {
    if (!map.getLayer(id)) continue;
    try {
      if (geoMin != null) map.setLayerZoomRange(id, geoMin, handoffZoom);
      else map.setLayerZoomRange(id, 0, handoffZoom);
    } catch {
      /* noop */
    }
  }

  for (const id of clusterMvtLayerIds(layerId)) {
    if (!map.getLayer(id)) continue;
    try {
      const mvtMin = geoMin != null ? geoMin : 0;
      map.setLayerZoomRange(id, mvtMin, 24);
    } catch {
      /* noop */
    }
  }
}

async function fetchClusterGeoJson(layerId, cveMun, { stateWide = false } = {}) {
  const qs = new URLSearchParams();
  if (stateWide) {
    qs.set("scope", "estatal");
  } else {
    qs.set("cve_mun", String(cveMun || "").padStart(3, "0"));
  }
  const url = apiUrl(`/api/visor/layers/${encodeURIComponent(layerId)}/points?${qs}`);
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail ?? data;
    const msg =
      (typeof detail === "object" && detail?.message) ||
      data.message ||
      res.statusText ||
      "No se pudieron cargar los puntos.";
    throw new Error(String(msg));
  }
  return data.featureCollection || { type: "FeatureCollection", features: [] };
}

export async function ensureClusterOverlayLayer(map, def, options = {}) {
  ensureClusterGeoJsonLayers(map, def);
  await ensureClusterUnclusteredSymbol(map, def);
  options.onLayersReady?.();
  return `ly-${def.key}`;
}

export async function refreshClusterOverlayData(map, def, cveMun, onApplied, options = {}) {
  if (!overlayUsesCluster(def) || !map) return;
  const stateWide = Boolean(options.stateWide);
  if (!stateWide && !cveMun) return;
  ensureClusterGeoJsonLayers(map, def);
  await ensureClusterUnclusteredSymbol(map, def);
  const srcId = clusterSourceId(def);
  const genKey = def.key;
  const nextGen = (_clusterLoadGen.get(genKey) || 0) + 1;
  _clusterLoadGen.set(genKey, nextGen);
  try {
    const layerId = resolveClusterLayerId(def);
    const fc = await fetchClusterGeoJson(layerId, cveMun, { stateWide });
    if (_clusterLoadGen.get(genKey) !== nextGen) return;
    const src = map.getSource(srcId);
    if (src?.setData) src.setData(fc);
    const n = fc?.features?.length || 0;
    if (!n) {
      console.warn(
        "[visor-cluster]",
        def.key,
        stateWide ? "sin puntos (alcance estatal)" : "sin puntos para cve_mun",
        cveMun,
      );
    }
    const finish = () => {
      if (typeof onApplied === "function") onApplied();
    };
    if (map.isStyleLoaded?.()) {
      map.once("idle", finish);
    } else {
      finish();
    }
  } catch (err) {
    console.warn("[visor-cluster]", def.key, err?.message || err);
    const src = map.getSource(srcId);
    if (src?.setData) src.setData({ type: "FeatureCollection", features: [] });
  }
}

export function removeClusterOverlayLayers(map, def) {
  if (!map || !def) return;
  const layerId = `ly-${def.key}`;
  const srcId = clusterSourceId(def);
  removeClusterLegacyHitLayer(map, def);
  removeClusterLooseProbeLayer(map, def);
  removeClusterUnclusteredLayer(map, def);
  removeLayerIfExists(map, clusterLooseLabelLayerId(layerId));
  removeLayerIfExists(map, clusterMvtLabelLayerId(layerId));
  for (const id of [...clusterGeoOnlyLayerIds(layerId), ...clusterMvtLayerIds(layerId)]) {
    removeLayerIfExists(map, id);
  }
  try {
    if (map.getSource(srcId)) map.removeSource(srcId);
  } catch {
    /* noop */
  }
}
