/**
 * Capas temáticas del visor derivadas de atlas.c_denue (filtro codigo_act).
 * Especificaciones cargadas desde config/visor/catalog.json (grupo denue).
 */
import {
  DENUE_LABEL_LAYOUT,
  DENUE_LABEL_MIN_ZOOM,
  denueLabelPaint,
  denueLabelPaintClaro,
} from "./martinLayerStyle.js";
import catalogJson from "../config/visor/catalog.json" with { type: "json" };

/** @typedef {{ key: string, visorId: string, panelLabel: string, tipTitle: string, codigoAct: number[], labelColor: string }} DenueLayerSpec */

/** Zoom mínimo de iconos en el mapa (debe coincidir con martin.yaml → c_denue.minzoom). */
export const DENUE_MIN_ZOOM = 8;

function denueSpecsFromCatalogJson() {
  const denueGroup = (catalogJson.groups || []).find((g) => g.id === "denue");
  const ids =
    denueGroup?.layers ||
    Object.keys(catalogJson.layers || {}).filter((k) => k.startsWith("denue_"));
  return ids.map((id) => {
    const layer = catalogJson.layers[id];
    if (!layer) return null;
    return {
      key: layer.overlay_key,
      visorId: id,
      panelLabel: layer.label,
      tipTitle: layer.style?.tip_title || layer.label,
      codigoAct: layer.data?.filter?.codigo_act || [],
      labelColor: layer.style?.label_color || "#333333",
    };
  }).filter(Boolean);
}

export const DENUE_LAYER_SPECS = /** @type {DenueLayerSpec[]} */ (denueSpecsFromCatalogJson());

const DENUE_SPEC_BY_KEY = Object.fromEntries(DENUE_LAYER_SPECS.map((s) => [s.key, s]));

export function denueSpecByKey(key) {
  return DENUE_SPEC_BY_KEY[key] ?? null;
}

export function isDenueOverlayKey(key) {
  return Boolean(DENUE_SPEC_BY_KEY[key]);
}

/** Filtro MapLibre por códigos SCIAN (codigo_act). */
export function codigoActFilter(codes) {
  const list = (codes || []).map((c) => String(c));
  if (!list.length) return ["literal", true];
  const raw = ["coalesce", ["get", "codigo_act"], ["get", "CODIGO_ACT"]];
  const asStr = ["to-string", raw];
  const tests = list.flatMap((code) => [
    ["==", asStr, code],
    ["==", ["to-number", raw], Number(code)],
  ]);
  return ["any", ...tests];
}

/** Etiquetas fijas (nom_estab) para OVERLAY_LABEL_BY_KEY. */
export function buildDenueOverlayLabelByKey() {
  /** @type {Record<string, object>} */
  const out = {};
  for (const spec of DENUE_LAYER_SPECS) {
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
  return DENUE_LAYER_SPECS.map((spec) => ({
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
