/**
 * Resaltado del polígono seleccionado en el buscador del visor (colonias, municipios).
 */
const SOURCE_ID = "atlas-geocoder-highlight-src";
const LAYER_FILL = "atlas-geocoder-highlight-fill";
const LAYER_LINE_HALO = "atlas-geocoder-highlight-line-halo";
const LAYER_LINE = "atlas-geocoder-highlight-line";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

const FILL_COLOR = "#00bcd4";
const LINE_COLOR = "#00838f";
const LINE_HALO = "#b2dfdb";

function isPolygonGeometry(feature) {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

function findInsertBefore(map) {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    if (layer.id.includes("gl-draw")) return layer.id;
  }
  return undefined;
}

function stackHighlightLayers(map) {
  if (!map?.getStyle?.()) return;
  for (const id of [LAYER_FILL, LAYER_LINE_HALO, LAYER_LINE]) {
    if (!map.getLayer(id)) continue;
    try {
      map.moveLayer(id);
    } catch {
      /* noop */
    }
  }
}

function ensureLayers(map) {
  if (!map) return false;
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
        paint: {
          "fill-color": FILL_COLOR,
          "fill-opacity": 0.22,
        },
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
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
        paint: {
          "line-color": LINE_HALO,
          "line-width": 4,
        },
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
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
        paint: {
          "line-color": LINE_COLOR,
          "line-width": 2,
        },
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      },
      beforeId,
    );
  }
  stackHighlightLayers(map);
  return true;
}

function setData(map, feature) {
  if (!map?.getSource?.(SOURCE_ID)) return;
  const data = feature
    ? { type: "FeatureCollection", features: [feature] }
    : EMPTY_FC;
  map.getSource(SOURCE_ID).setData(data);
}

/** Muestra el contorno/relleno del polígono buscado. */
export function showGeocoderHighlight(map, feature) {
  if (!map || !feature?.geometry || !isPolygonGeometry(feature)) return;
  const apply = () => {
    if (!ensureLayers(map)) return;
    setData(map, feature);
    stackHighlightLayers(map);
  };
  if (map.isStyleLoaded?.()) apply();
  else map.once("load", apply);
}

/** Quita el polígono del buscador. */
export function clearGeocoderHighlight(map) {
  if (!map?.getSource?.(SOURCE_ID)) return;
  setData(map, null);
}

/** Libera capas al salir del visor. */
export function teardownGeocoderHighlight(map) {
  clearGeocoderHighlight(map);
  if (!map) return;
  for (const id of [LAYER_LINE, LAYER_LINE_HALO, LAYER_FILL]) {
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
