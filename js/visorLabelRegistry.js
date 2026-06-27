/**
 * Etiquetas en mapa (letreritos por zoom) data-driven desde catalog.json.
 * Fase C+ del visor geográfico.
 */
import {
  hasBuiltinOverlayLabel,
  registerVisorCatalogLabelDefs,
  remountVisorCatalogLabelLayers,
} from "./map.js";
import { SYMBOL_POINT_LABEL_TEXT_OFFSET } from "./martinLayerStyle.js";
import { getOrderedVisorLayerEntries } from "./visorCatalog.js";

/** @type {string[]} */
let _lastWarnings = [];

const DEFAULT_MINZOOM = {
  point: 14,
  line: 16,
  polygon: 14,
};

function coalesceFieldExpr(fieldName) {
  const upper = String(fieldName).toUpperCase();
  return ["coalesce", ["get", fieldName], ["get", upper], ""];
}

/**
 * @param {string[]} keys
 * @returns {object}
 */
function coalesceFieldsConcat(keys) {
  const parts = (keys || []).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return coalesceFieldExpr(parts[0]);
  const exprs = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) exprs.push(" ");
    exprs.push(coalesceFieldExpr(parts[i]));
  }
  return ["concat", ...exprs];
}

/**
 * @param {object} labels
 * @returns {object|string}
 */
export function buildLabelTextExpression(labels) {
  const fallback = labels.fallback ?? "—";

  if (labels.join) {
    const left = coalesceFieldsConcat(labels.join.left || []);
    const right = coalesceFieldsConcat(labels.join.right || []);
    const sep = labels.join.separator ?? ": ";
    return [
      "case",
      [
        "all",
        [">", ["length", left], 0],
        [">", ["length", right], 0],
      ],
      ["concat", left, sep, right],
      [">", ["length", left], 0],
      ["concat", left, sep],
      [">", ["length", right], 0],
      right,
      fallback,
    ];
  }

  if (Array.isArray(labels.fields) && labels.fields.length) {
    const cols = labels.fields.map((f) => (typeof f === "string" ? f : f.column)).filter(Boolean);
    const body = coalesceFieldsConcat(cols);
    if (labels.prefix) return ["concat", labels.prefix, body];
    return [
      "case",
      [">", ["length", body], 0],
      body,
      fallback,
    ];
  }

  if (labels.field) {
    const body = coalesceFieldExpr(labels.field);
    if (labels.prefix) {
      return [
        "case",
        [">", ["length", body], 0],
        ["concat", labels.prefix, body],
        labels.prefix ? ["concat", labels.prefix, fallback] : fallback,
      ];
    }
    return [
      "coalesce",
      ["get", labels.field],
      ["get", String(labels.field).toUpperCase()],
      fallback,
    ];
  }

  return fallback;
}

/**
 * @param {object} entry
 * @param {object} labels
 * @returns {object}
 */
export function buildCatalogLabelDef(entry, labels) {
  const geometry = entry.geometry || "point";
  const minzoom = Number(labels.minzoom ?? DEFAULT_MINZOOM[geometry] ?? 14);
  const placement =
    labels.placement || (geometry === "line" ? "line" : "point");
  const aboveIcon = Boolean(labels.above_icon);
  const anchor =
    labels.anchor || (aboveIcon ? "bottom" : placement === "line" ? "center" : "center");
  const offset =
    labels.offset || (aboveIcon ? SYMBOL_POINT_LABEL_TEXT_OFFSET : [0, 0]);

  const textSizeBase = Number(labels.size ?? (placement === "line" ? 11 : 13));

  /** @type {object} */
  const layout = {
    "text-field": buildLabelTextExpression(labels),
    "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
    "text-size": [
      "interpolate",
      ["linear"],
      ["zoom"],
      minzoom,
      textSizeBase,
      minzoom + 4,
      textSizeBase + 2,
      minzoom + 8,
      textSizeBase + 3,
    ],
    "text-anchor": anchor,
    "text-offset": offset,
    "text-justify": labels.justify || "center",
    "text-max-width": labels.max_width ?? (placement === "line" ? 16 : 20),
    "text-allow-overlap": labels.allow_overlap !== false,
    "text-ignore-placement": labels.ignore_placement !== false,
    "text-letter-spacing": labels.letter_spacing ?? 0.01,
    "symbol-placement": placement,
    visibility: "none",
  };

  if (placement === "line") {
    layout["text-rotation-alignment"] = labels.rotation_alignment || "map";
    if (labels.line_height != null) layout["text-line-height"] = labels.line_height;
    else layout["text-line-height"] = 1.15;
  }

  const color = labels.color || "#2c3e50";
  const haloColor = labels.halo_color || "#ffffff";
  const paint = {
    "text-color": color,
    "text-halo-color": haloColor,
    "text-halo-width": labels.halo_width ?? 2,
    "text-halo-blur": labels.halo_blur ?? 0.5,
    "text-opacity": ["step", ["zoom"], 0, minzoom, 1],
  };

  return {
    minzoom,
    layout,
    paint,
    paintClaro: {
      ...paint,
      "text-color": labels.color_claro || color,
      "text-halo-color": labels.halo_color_claro || haloColor,
    },
  };
}

/**
 * @param {object} entry
 * @returns {string[]}
 */
export function validateVisorLayerLabels(entry) {
  const warnings = [];
  const id = entry.id || "?";
  const labels = entry.labels;
  if (!labels || labels.enabled === false) return warnings;

  if (!entry.overlay_key) {
    warnings.push(`${id}: labels requiere overlay_key`);
    return warnings;
  }

  if (hasBuiltinOverlayLabel(entry.overlay_key)) {
    warnings.push(
      `${id}: overlay_key "${entry.overlay_key}" ya tiene etiquetas en código; omita labels o use otra capa`,
    );
    return warnings;
  }

  const hasField = Boolean(labels.field);
  const hasFields = Array.isArray(labels.fields) && labels.fields.length > 0;
  const hasJoin = Boolean(labels.join?.left?.length || labels.join?.right?.length);

  if (!hasField && !hasFields && !hasJoin) {
    warnings.push(
      `${id}: labels requiere field, fields o join (columna publicada en Martin)`,
    );
  }

  if (labels.minzoom != null && Number.isNaN(Number(labels.minzoom))) {
    warnings.push(`${id}: labels.minzoom debe ser numérico`);
  }

  return warnings;
}

export function getVisorLabelWarnings() {
  return _lastWarnings.slice();
}

/**
 * Registra etiquetas dinámicas y remonta capas symbol en el mapa.
 * @returns {{ warnings: string[], labelCount: number }}
 */
export function initVisorLabelsFromCatalog() {
  const warnings = [];
  /** @type {Record<string, object>} */
  const byKey = {};

  for (const entry of getOrderedVisorLayerEntries()) {
    const layerWarnings = validateVisorLayerLabels(entry);
    warnings.push(...layerWarnings);

    const labels = entry.labels;
    if (!labels || labels.enabled === false) continue;
    if (!entry.overlay_key || hasBuiltinOverlayLabel(entry.overlay_key)) continue;

    const hasField = Boolean(labels.field);
    const hasFields = Array.isArray(labels.fields) && labels.fields.length > 0;
    const hasJoin = Boolean(labels.join?.left?.length || labels.join?.right?.length);
    if (!hasField && !hasFields && !hasJoin) continue;

    byKey[entry.overlay_key] = buildCatalogLabelDef(entry, labels);
  }

  registerVisorCatalogLabelDefs(byKey);
  remountVisorCatalogLabelLayers();

  _lastWarnings = warnings;
  for (const msg of warnings) {
    console.warn("[visor-labels]", msg);
  }

  return { warnings, labelCount: Object.keys(byKey).length };
}
