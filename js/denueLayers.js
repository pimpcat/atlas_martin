/**
 * Capas temáticas del visor derivadas de atlas.c_denue (filtro codigo_act).
 */
import {
  DENUE_LABEL_LAYOUT,
  DENUE_LABEL_MIN_ZOOM,
  denueLabelPaint,
  denueLabelPaintClaro,
} from "./martinLayerStyle.js";
import {
  DENUE_ICON_BY_KEY,
  DENUE_LEGEND_BY_KEY,
  DENUE_SYMBOL_LAYOUT_BY_KEY,
  DENUE_SYMBOL_PAINT,
} from "./mapDenueIcons.js";

/** @typedef {{ key: string, visorId: string, panelLabel: string, tipTitle: string, codigoAct: number[], labelColor: string }} DenueLayerSpec */

export const DENUE_LAYER_SPECS = /** @type {DenueLayerSpec[]} */ ([
  {
    key: "denueRastros",
    visorId: "denue_rastros",
    panelLabel: "Rastros",
    tipTitle: "Rastros",
    codigoAct: [311611],
    labelColor: "#5d4037",
  },
  {
    key: "denueGasolinerias",
    visorId: "denue_gasolinerias",
    panelLabel: "Gasolinerías",
    tipTitle: "Gasolinerías",
    codigoAct: [468411],
    labelColor: "#1b5e20",
  },
  {
    key: "denueGaseras",
    visorId: "denue_gaseras",
    panelLabel: "Gaseras",
    tipTitle: "Gaseras",
    codigoAct: [468412],
    labelColor: "#01579b",
  },
  {
    key: "denueEscuelas",
    visorId: "denue_escuelas",
    panelLabel: "Escuelas",
    tipTitle: "Escuelas",
    codigoAct: [
      611112, 611122, 611132, 611142, 611152, 611162, 611172, 611182,
      611212, 611312, 611422, 611432, 611512, 611612, 611622, 611632,
    ],
    labelColor: "#e65100",
  },
  {
    key: "denueHospitales",
    visorId: "denue_hospitales",
    panelLabel: "Hospitales (DENUE)",
    tipTitle: "Hospitales (DENUE)",
    codigoAct: [622112],
    labelColor: "#b71c1c",
  },
  {
    key: "denueMuseos",
    visorId: "denue_museos",
    panelLabel: "Museos",
    tipTitle: "Museos",
    codigoAct: [712112],
    labelColor: "#4a148c",
  },
  {
    key: "denueCementerios",
    visorId: "denue_cementerios",
    panelLabel: "Cementerios",
    tipTitle: "Cementerios",
    codigoAct: [812322],
    labelColor: "#424242",
  },
  {
    key: "denueIglesias",
    visorId: "denue_iglesias",
    panelLabel: "Iglesias/Templos",
    tipTitle: "Iglesias/Templos",
    codigoAct: [813210],
    labelColor: "#4e342e",
  },
]);

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

/** Definiciones OVERLAY_DEFS para map.js. */
export function buildDenueOverlayDefs(tableName) {
  return DENUE_LAYER_SPECS.map((spec) => ({
    key: spec.key,
    table: tableName,
    type: "symbol",
    layout: DENUE_SYMBOL_LAYOUT_BY_KEY[spec.key],
    paint: DENUE_SYMBOL_PAINT,
    codigoAct: spec.codigoAct,
    tipTitle: spec.tipTitle,
  }));
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

/** Entradas del panel lateral del visor. */
export function buildDenueVisorPanelDefs(getOverlayActive, setOverlayActive) {
  return DENUE_LAYER_SPECS.map((spec) => ({
    id: spec.visorId,
    overlayKey: spec.key,
    checkboxId: `visor${spec.key.charAt(0).toUpperCase()}${spec.key.slice(1)}`,
    label: spec.panelLabel,
    getActive: () => getOverlayActive(spec.key),
    setActive: (active, cve) => setOverlayActive(spec.key, active, cve),
  }));
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

export function buildDenueLegendSymbology() {
  /** @type {Record<string, { iconItems: { label: string, icon: string }[] }>} */
  const out = {};
  for (const spec of DENUE_LAYER_SPECS) {
    const leg = DENUE_LEGEND_BY_KEY[spec.key];
    if (leg) out[spec.visorId] = { iconItems: [leg] };
  }
  return out;
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
