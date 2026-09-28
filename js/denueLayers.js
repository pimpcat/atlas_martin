/**
 * Capas temáticas DENUE — especificaciones desde catálogo runtime (no import estático).
 */
import {
  DENUE_LABEL_LAYOUT,
  DENUE_LABEL_MIN_ZOOM,
  denueLabelPaint,
  denueLabelPaintClaro,
} from "./martinLayerStyle.js";

/** @typedef {{ key: string, visorId: string, panelLabel: string, tipTitle: string, codigoAct: number[], labelColor: string }} DenueLayerSpec */

/** Zoom mínimo de iconos (paridad martin.yaml / catálogo). */
export const DENUE_MIN_ZOOM = 8;

/** @type {DenueLayerSpec[]} */
let _denueSpecs = [];
/** @type {Record<string, DenueLayerSpec>} */
let _denueSpecByKey = {};

function buildSpecsFromCatalog(catalog) {
  if (!catalog?.layers) return [];
  const denueGroup = (catalog.groups || []).find((g) => g.id === "denue");
  const ids =
    denueGroup?.layers ||
    Object.keys(catalog.layers).filter((k) => k.startsWith("denue_"));
  return ids
    .map((id) => {
      const layer = catalog.layers[id];
      if (!layer) return null;
      return {
        key: layer.overlay_key,
        visorId: id,
        panelLabel: layer.label,
        tipTitle: layer.style?.tip_title || layer.label,
        codigoAct: layer.data?.filter?.codigo_act || [],
        labelColor: layer.style?.label_color || "#333333",
      };
    })
    .filter(Boolean);
}

/** Inicializar tras loadVisorCatalog() — una sola fuente runtime. */
export function initDenueLayersFromCatalog(catalog) {
  _denueSpecs = buildSpecsFromCatalog(catalog);
  _denueSpecByKey = Object.fromEntries(_denueSpecs.map((s) => [s.key, s]));
}

export function getDenueLayerSpecs() {
  return _denueSpecs;
}

/** @deprecated usar getDenueLayerSpecs() tras initDenueLayersFromCatalog */
export const DENUE_LAYER_SPECS = [];

export function denueSpecByKey(key) {
  return _denueSpecByKey[key] ?? null;
}

export function isDenueOverlayKey(key) {
  return Boolean(_denueSpecByKey[key]);
}

/** Filtro MapLibre por códigos SCIAN (codigo_act). Paridad con spatial_analysis (varchar). */
export function codigoActFilter(codes) {
  const list = (codes || [])
    .map((c) => String(c).trim())
    .filter(Boolean)
    .map((c) => String(parseInt(c, 10)))
    .filter((c) => c !== "NaN");
  if (!list.length) return ["literal", true];
  const raw = ["coalesce", ["get", "codigo_act"], ["get", "CODIGO_ACT"], ""];
  const asStr = ["to-string", raw];
  const asNum = ["to-number", raw];
  const tests = [];
  for (const code of list) {
    const n = Number(code);
    tests.push(["==", asStr, code]);
    tests.push(["==", asStr, String(n)]);
    tests.push(["==", asNum, n]);
    if (code.length < 6) {
      tests.push(["==", asStr, code.padStart(6, "0")]);
    }
  }
  return ["any", ...tests];
}

/** Etiquetas fijas (nom_estab) para OVERLAY_LABEL_BY_KEY. */
export function buildDenueOverlayLabelByKey() {
  /** @type {Record<string, object>} */
  const out = {};
  for (const spec of _denueSpecs) {
    out[spec.key] = {
      minzoom: DENUE_LABEL_MIN_ZOOM,
      layout: DENUE_LABEL_LAYOUT,
      paint: denueLabelPaint(spec.labelColor),
      paintClaro: denueLabelPaintClaro(spec.labelColor),
    };
  }
  return out;
}

/** Tooltips hover: título en negritas + nom_estab. */
export function denueTipHtml(title, props) {
  const nom = featureProp(props, "nom_estab", "NOM_ESTAB") || "—";
  return (
    `<div class="atlas-loc-tip">` +
    `<div class="atlas-loc-tip__title">${escapeHtml(title)}</div>` +
    `<div class="atlas-loc-tip__body">${escapeHtml(nom)}</div>` +
    `</div>`
  );
}

export function buildDenueTipDefs() {
  return _denueSpecs.map((spec) => ({
    primary: `ly-${spec.key}`,
    tipHtml: (props) => denueTipHtml(spec.tipTitle, props),
  }));
}

function featureProp(props, ...keys) {
  if (!props) return "";
  for (const key of keys) {
    if (props[key] != null && String(props[key]).trim() !== "") {
      return String(props[key]).trim();
    }
    const upper = key.toUpperCase();
    if (props[upper] != null && String(props[upper]).trim() !== "") {
      return String(props[upper]).trim();
    }
  }
  return "";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
