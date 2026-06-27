/**
 * Identificación por clic / hover desde el catálogo del visor geográfico.
 */
import {
  locsPuntoTipHtml,
  locsAtlasTipHtml,
  coloniasTipHtml,
  agebUrbanasTipHtml,
  agebRuralesTipHtml,
  manzanasTipHtml,
  vialidadesTipHtml,
  rncTipHtml,
  saneamientoTipHtml,
  cluesTipHtml,
  residuoSolidoTipHtml,
  usoSueloTipHtml,
  hidroCorrienteTipHtml,
  hidroCuerpoTipHtml,
  curnivelTipHtml,
  registerCatalogTipDef,
  clearCatalogTipDefs,
} from "./mapOverlayTips.js";
import { denueTipHtml } from "./denueLayers.js";
import { getOrderedVisorLayerEntries } from "./visorCatalog.js";
import { maplibrePrimaryIdForCatalogLayer } from "./visorLayerBindings.js";

function featureProp(props, ...keys) {
  if (!props) return "";
  for (const key of keys) {
    if (key == null || key === "") continue;
    if (props[key] != null && String(props[key]).trim() !== "") {
      return String(props[key]).trim();
    }
    const upper = String(key).toUpperCase();
    if (props[upper] != null && String(props[upper]).trim() !== "") {
      return String(props[upper]).trim();
    }
  }
  return "";
}

/** Acepta "columna" o { column, label } o { join } (catálogo legacy y Visor Studio). */
function normalizeIdentifyField(field) {
  if (field == null) return null;
  if (typeof field === "string") {
    const col = field.trim();
    if (!col) return null;
    return { column: col, label: col };
  }
  if (typeof field === "object") {
    if (field.join) return field;
    const col = field.column != null ? String(field.column).trim() : "";
    if (!col) return null;
    return { column: col, label: field.label != null ? String(field.label) : col };
  }
  return null;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tipValue(props, ...keys) {
  const v = featureProp(props, ...keys);
  return escapeHtml(v || "—");
}

function tipColonJoin(props, leftKeys, rightKeys) {
  const left = featureProp(props, ...leftKeys);
  const right = featureProp(props, ...rightKeys);
  if (left && right) return `${escapeHtml(left)}: ${escapeHtml(right)}`;
  if (left) return `${escapeHtml(left)}:`;
  if (right) return escapeHtml(right);
  return "—";
}

function overlayTipShell(title, bodyHtml) {
  const titleHtml = title
    ? `<div class="atlas-loc-tip__title">${escapeHtml(title)}</div>`
    : "";
  return (
    `<div class="atlas-loc-tip">` +
    titleHtml +
    `<div class="atlas-loc-tip__body">${bodyHtml}</div>` +
    `</div>`
  );
}

function tipFieldRow(props, field) {
  const f = normalizeIdentifyField(field);
  if (!f || f.join) return "";
  const label = f.label || f.column;
  return (
    `<div class="atlas-loc-tip__row">` +
    `<span class="atlas-loc-tip__lbl">${escapeHtml(label)}:</span> ` +
    `<span class="atlas-loc-tip__val">${tipValue(props, f.column)}</span>` +
    `</div>`
  );
}

/** @type {Record<string, (props: object) => string>} */
const NAMED_TEMPLATES = {
  locs_punto: locsPuntoTipHtml,
  locs_atlas: locsAtlasTipHtml,
  colonias: coloniasTipHtml,
  ageb_urbanas: agebUrbanasTipHtml,
  ageb_rurales: agebRuralesTipHtml,
  manzanas: manzanasTipHtml,
  vialidades: vialidadesTipHtml,
  rnc: rncTipHtml,
  saneamiento_agua: saneamientoTipHtml,
  clues: cluesTipHtml,
  residuo_solido: residuoSolidoTipHtml,
  uso_suelo: usoSueloTipHtml,
  hidro_corrientes: hidroCorrienteTipHtml,
  hidro_cuerpos: hidroCuerpoTipHtml,
  curvas_nivel: curnivelTipHtml,
};

/**
 * @param {object} identify
 * @param {object} props
 * @returns {string|null}
 */
export function buildIdentifyHtmlFromCatalog(identify, props) {
  if (!identify) return null;

  if (identify.template === "denue") {
    return denueTipHtml(identify.title || "DENUE", props);
  }

  if (identify.template && NAMED_TEMPLATES[identify.template]) {
    return NAMED_TEMPLATES[identify.template](props);
  }

  if (identify.join) {
    const title = identify.title || "";
    const body = tipColonJoin(props, identify.join.left || [], identify.join.right || []);
    return overlayTipShell(title, body);
  }

  const fields = identify.fields;
  if (Array.isArray(fields) && fields.length) {
    const title = identify.title || "";
    const body = fields
      .map((raw) => {
        const f = normalizeIdentifyField(raw);
        if (!f) return "";
        if (f.join) {
          return `<div class="atlas-loc-tip__row">${tipColonJoin(props, f.join.left || [], f.join.right || [])}</div>`;
        }
        return tipFieldRow(props, f);
      })
      .filter(Boolean)
      .join("");
    if (!body) return null;
    return overlayTipShell(title, body);
  }

  return null;
}

/**
 * Configuración de hover/clic desde catálogo (`identify`, `tooltip` o `labels`).
 * @param {object} entry
 * @returns {object|null}
 */
export function resolveVisorHoverConfig(entry) {
  if (!entry) return null;
  if (entry.tooltip?.enabled === false) return null;
  if (entry.identify) {
    return {
      ...entry.identify,
      title: entry.identify.title ?? entry.label,
    };
  }

  const tooltip = entry.tooltip;
  if (tooltip) {
    if (tooltip.template || tooltip.join || tooltip.fields) {
      return { ...tooltip, title: tooltip.title ?? entry.label };
    }
    if (tooltip.field) {
      return {
        title: tooltip.title ?? entry.label,
        fields: [{ column: tooltip.field, label: tooltip.field_label }],
      };
    }
  }

  const labels = entry.labels;
  if (labels && labels.enabled !== false && labels.field) {
    return {
      title: labels.title ?? entry.label,
      fields: [{ column: labels.field }],
    };
  }

  return null;
}

/** Registra tooltips/identify del catálogo en mapOverlayTips (solo visor). */
export function registerVisorCatalogIdentify() {
  clearCatalogTipDefs();
  for (const entry of getOrderedVisorLayerEntries()) {
    const primary = maplibrePrimaryIdForCatalogLayer(entry);
    const identify = resolveVisorHoverConfig(entry);
    if (!identify) continue;
    const visorOnly = Boolean(entry.identify_visor_only);
    registerCatalogTipDef(primary, (props) => buildIdentifyHtmlFromCatalog(identify, props), visorOnly);

    if (entry.id === "curvas_nivel") {
      registerCatalogTipDef(
        "ly-curnivel-ma",
        (props) => buildIdentifyHtmlFromCatalog(identify, props),
        true,
      );
    }
    if (entry.id === "rnc") {
      for (const suffix of ["-estatal", "-troncal"]) {
        registerCatalogTipDef(
          `ly-rnc${suffix}`,
          (props) => buildIdentifyHtmlFromCatalog(identify, props),
          false,
        );
      }
    }
  }
}
