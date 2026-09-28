/**
 * Raw Render Mode — debug MapLibre sin filtros ni simbología (§22 doc reparación).
 * Activa: window.__VISOR_RAW_RENDER__ = true antes de cargar el mapa.
 */

/** @typedef {"point" | "line" | "polygon"} RawGeomKind */

/**
 * @param {RawGeomKind} kind
 * @returns {object}
 */
export function rawRenderLayerSpec(kind) {
  if (kind === "line") {
    return {
      type: "line",
      paint: {
        "line-width": 3,
        "line-color": "#ff0000",
      },
    };
  }
  if (kind === "polygon") {
    return {
      type: "fill",
      paint: {
        "fill-color": "#ff0000",
        "fill-opacity": 0.6,
      },
    };
  }
  return {
    type: "circle",
    paint: {
      "circle-radius": 5,
      "circle-color": "#ff0000",
    },
  };
}

export function isRawRenderModeEnabled() {
  if (typeof window === "undefined") return false;
  return Boolean(window.__VISOR_RAW_RENDER__);
}

/**
 * Sustituye paint/layout por raw debug cuando el modo está activo.
 * @param {object} layerDef
 * @param {RawGeomKind} [geomKind="point"]
 */
export function applyRawRenderIfEnabled(layerDef, geomKind = "point") {
  if (!isRawRenderModeEnabled() || !layerDef) return layerDef;
  const raw = rawRenderLayerSpec(geomKind);
  return {
    ...layerDef,
    type: raw.type,
    paint: raw.paint,
    layout: {},
    filter: undefined,
  };
}
