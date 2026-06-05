/**
 * Autozoom y bbox con Turf.js + features de Martin (querySourceFeatures / click).
 */

import { fetchMunicipioExtent } from "./api.js";

export function getTurf() {
  if (typeof turf !== "undefined") return turf;
  if (typeof window !== "undefined" && window.turf) return window.turf;
  return null;
}

export function bboxToLngLatBounds(bbox) {
  if (!bbox || bbox.length < 4) return null;
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]],
  ];
}

export function bboxFromFeatures(features) {
  const t = getTurf();
  if (!t || !features?.length) return null;
  return t.bbox(t.featureCollection(features));
}

/** Evita encuadre con fragmentos de tesela (bbox demasiado pequeño). */
export function bboxSpanOk(bbox, minDeg = 0.45) {
  if (!bbox || bbox.length < 4) return false;
  return bbox[2] - bbox[0] >= minDeg && bbox[3] - bbox[1] >= minDeg;
}

export function fitMapToFeatures(map, features, options = {}) {
  const bbox = bboxFromFeatures(features);
  if (!bbox || !map) return false;
  const bounds = bboxToLngLatBounds(bbox);
  const {
    padding = 40,
    maxZoom,
    duration = 0,
    animate = duration > 0,
  } = options;
  map.fitBounds(bounds, {
    padding,
    maxZoom,
    duration: animate ? duration : 0,
    animate,
  });
  return true;
}

/**
 * Encuadra el mapa a features de una fuente Martin (reintenta en idle hasta cargar tiles).
 */
export function fitMapToMartinSource(map, sourceId, sourceLayer, options = {}) {
  const { filter, maxAttempts = 12, fallbackBounds, ...fitOpts } = options;
  let attempts = 0;

  const tryFit = () => {
    if (!map?.querySourceFeatures) return false;
    const feats = map.querySourceFeatures(sourceId, {
      sourceLayer,
      filter: filter || undefined,
    });
    if (feats.length > 0) {
      const bbox = bboxFromFeatures(feats);
      if (bboxSpanOk(bbox)) {
        return fitMapToFeatures(map, feats, fitOpts);
      }
    }
    if (attempts < maxAttempts) {
      attempts += 1;
      map.once("idle", tryFit);
      return false;
    }
    if (fallbackBounds) {
      map.fitBounds(fallbackBounds, {
        padding: fitOpts.padding ?? 24,
        maxZoom: fitOpts.maxZoom,
        duration: fitOpts.duration ?? 0,
        animate: Boolean(fitOpts.animate && (fitOpts.duration ?? 0) > 0),
      });
      return true;
    }
    return false;
  };

  if (map.isStyleLoaded()) {
    tryFit();
  } else {
    map.once("load", () => map.once("idle", tryFit));
  }
}

/** Encuadre con bbox PostGIS (polígono completo, no fragmentos de tesela). */
export async function fitMapToMunicipioExtent(map, cve_mun, options = {}) {
  if (!map || !cve_mun) return false;
  try {
    const data = await fetchMunicipioExtent(cve_mun);
    const b = data.bbox;
    if (!b || b.west == null) return false;
    const {
      padding = 40,
      maxZoom,
      duration = 0,
      animate = duration > 0,
    } = options;
    map.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      {
        padding,
        maxZoom,
        duration: animate ? duration : 0,
        animate,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** Encuadra a un municipio (reintentos en idle; fallback si no hay API). */
export function fitToMunicipioWhenReady(map, sourceId, sourceLayer, cve_mun, munFilter, options = {}) {
  const { maxAttempts = 14, fallbackBounds, ...fitOpts } = options;
  let attempts = 0;

  const tryFit = () => {
    const preset = findMunicipioFeature(map, sourceId, sourceLayer, cve_mun);
    if (preset && fitMapToFeatures(map, [preset], fitOpts)) return true;

    const feats = map.querySourceFeatures(sourceId, {
      sourceLayer,
      filter: munFilter(cve_mun),
    });
    if (feats.length > 0 && fitMapToFeatures(map, feats, fitOpts)) return true;

    if (attempts < maxAttempts) {
      attempts += 1;
      map.once("idle", tryFit);
      return false;
    }
    if (fallbackBounds) {
      map.fitBounds(fallbackBounds, {
        padding: fitOpts.padding ?? 40,
        maxZoom: fitOpts.maxZoom,
        duration: fitOpts.duration ?? 0,
        animate: Boolean(fitOpts.animate && (fitOpts.duration ?? 0) > 0),
      });
    }
    return false;
  };

  if (map.isStyleLoaded()) {
    map.once("idle", tryFit);
  } else {
    map.once("load", () => map.once("idle", tryFit));
  }
}

export function findMunicipioFeature(map, sourceId, sourceLayer, cve_mun) {
  const p = String(cve_mun ?? "").replace(/\D/g, "");
  const pad = p.length >= 3 ? p.slice(-3) : ("000" + p).slice(-3);
  const n = String(parseInt(pad, 10));
  const feats = map.querySourceFeatures(sourceId, { sourceLayer });
  return feats.find((f) => {
    const v = f.properties?.cve_mun ?? f.properties?.CVE_MUN;
    const s = String(v ?? "").replace(/\D/g, "");
    const fp = s.length >= 3 ? s.slice(-3) : ("000" + s).slice(-3);
    return fp === pad || fp === n || s === pad;
  });
}
