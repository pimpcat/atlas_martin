/**
 * Registro y validación de simbología del Visor geográfico (fases B + C).
 * - Fase B: valida style_preset, renderer y overlay_key al cargar el catálogo.
 * - Fase C: presets genéricos en config/visor/presets/*.json → OVERLAY_DEFS dinámicos.
 */
import {
  hasVisorOverlayDef,
  isBuiltinOverlayKey,
  registerVisorDynamicOverlayDefs,
  remountVisorDynamicOverlayLayers,
} from "./map.js";
import { getOrderedVisorLayerEntries } from "./visorCatalog.js";
import {
  buildSymbolByAttributeOverlayDefFromPreset,
  buildSymbolOverlayDefFromPreset,
  hasVisorIconKey,
  legendItemForIconKey,
  loadVisorIconsConfig,
} from "./visorIconRegistry.js";
import { LAYER_PAINT } from "./martinLayerStyle.js";

const GENERIC_PRESET_IDS = [
  "point_default",
  "point_symbol",
  "point_symbol_by_attribute",
  "line_simple",
  "line_outline",
  "polygon_outline",
  "polygon_outline_detail",
  "polygon_fill",
  "point_by_attribute",
  "line_by_attribute",
  "polygon_by_attribute",
  "rnc_tiered",
];

/** Presets nombrados que usan OVERLAY_DEFS fijos en map.js (capas compartidas). */
const BUILTIN_STYLE_PRESETS = new Set([
  "uso_suelo",
  "hidro_corrientes",
  "hidro_cuerpos",
  "curvas_nivel",
]);

/** @type {Record<string, object>|null} */
let _genericPresets = null;
/** @type {string[]} */
let _lastWarnings = [];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isAttributePreset(preset) {
  return Boolean(preset?.attribute?.paint);
}

function isSymbolAttributePreset(preset) {
  return preset?.attribute?.layout === "icon-image";
}

/** Expresión MapLibre: lee columna MVT (minúsculas o MAYÚSCULAS) como texto. */
function attributeFieldExpr(fieldName) {
  const upper = String(fieldName).toUpperCase();
  return ["to-string", ["coalesce", ["get", fieldName], ["get", upper], ""]];
}

function normalizeClassValue(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

/**
 * MapLibre match: valor de campo → color.
 * @param {string} fieldName
 * @param {Array<{ value: string|number, color: string }>} classes
 * @param {string} [defaultColor]
 */
export function buildAttributeColorMatch(fieldName, classes, defaultColor) {
  const field = attributeFieldExpr(fieldName);
  const pairs = [];
  const seen = new Set();
  for (const cls of classes || []) {
    const key = normalizeClassValue(cls?.value);
    const color = cls?.color;
    if (!key || !color || seen.has(key)) continue;
    seen.add(key);
    pairs.push(key, color);
  }
  const fallback = defaultColor || "#94a3b8";
  if (!pairs.length) return fallback;
  return ["match", field, ...pairs, fallback];
}

/**
 * @param {object} entry
 * @returns {string[]}
 */
function validateAttributeStyle(entry) {
  const warnings = [];
  const id = entry.id || "?";
  const style = entry.style || {};
  const field = style.field;
  const classes = style.classes;

  if (!field || typeof field !== "string") {
    warnings.push(`${id}: preset por atributo requiere style.field (nombre de columna MVT)`);
  }
  if (!Array.isArray(classes) || classes.length === 0) {
    warnings.push(
      `${id}: preset por atributo requiere style.classes con al menos { "value", "color" }`,
    );
  } else {
    classes.forEach((cls, i) => {
      if (cls?.value === undefined || cls?.value === null) {
        warnings.push(`${id}: style.classes[${i}] falta value`);
      }
      if (!cls?.color) {
        warnings.push(`${id}: style.classes[${i}] falta color`);
      }
    });
  }
  return warnings;
}

/**
 * @param {object} entry
 * @returns {string[]}
 */
function validateSymbolAttributeStyle(entry) {
  const warnings = [];
  const id = entry.id || "?";
  const style = entry.style || {};
  const field = style.field;
  const rules = style.icon_rules;
  const defaultKey = style.default_icon_key;

  if (!field || typeof field !== "string") {
    warnings.push(`${id}: preset symbol por atributo requiere style.field`);
  }
  if (!defaultKey) {
    warnings.push(`${id}: preset symbol por atributo requiere style.default_icon_key`);
  } else if (!hasVisorIconKey(defaultKey)) {
    warnings.push(`${id}: style.default_icon_key "${defaultKey}" no está en icons.json`);
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    warnings.push(
      `${id}: preset symbol por atributo requiere style.icon_rules con al menos { value, icon_key }`,
    );
  } else {
    rules.forEach((rule, i) => {
      if (rule?.value == null || rule?.value === "") {
        warnings.push(`${id}: style.icon_rules[${i}] falta value`);
      }
      if (!rule?.icon_key) {
        warnings.push(`${id}: style.icon_rules[${i}] falta icon_key`);
      } else if (!hasVisorIconKey(rule.icon_key)) {
        warnings.push(`${id}: style.icon_rules[${i}].icon_key "${rule.icon_key}" no está en icons.json`);
      }
    });
  }
  return warnings;
}

/**
 * @param {object} preset
 * @param {object} [layerStyle]
 * @param {"paint"|"paintHalo"} [target]
 */
function applyStyleSchema(preset, layerStyle, target = "paint") {
  let base;
  if (target === "paintHalo") {
    base = deepClone(preset.paintHalo || {});
  } else if (target === "fillHit") {
    base = deepClone(preset.fillHitPaint || {});
  } else {
    base = deepClone(preset.paint || {});
  }
  const schema = preset.style_schema || {};
  const style = layerStyle || {};

  for (const [styleKey, spec] of Object.entries(schema)) {
    const specTarget = spec.target || "paint";
    if (specTarget !== target) continue;
    if (!spec.paint) continue;
    const val = style[styleKey] !== undefined ? style[styleKey] : spec.default;
    if (val !== undefined) base[spec.paint] = val;
  }

  return base;
}

/**
 * @param {object|null} def
 * @param {object} entry
 */
function attachOverlayDefExtras(def, entry) {
  if (!def) return null;
  const codigoAct = entry.data?.filter?.codigo_act;
  if (Array.isArray(codigoAct) && codigoAct.length) def.codigoAct = codigoAct;
  const mf = entry.data?.mun_filter;
  if (mf === false || mf === "false" || mf === "none" || mf === 0) {
    def.skipMunFilter = true;
  }
  return def;
}

/**
 * @param {object} entry - capa del catálogo
 * @param {object} preset
 * @returns {object|null}
 */
export function buildOverlayDefFromGenericPreset(entry, preset) {
  const table = entry.data?.table;
  const key = entry.overlay_key;
  if (!table || !key || !preset) return null;

  if (preset.type === "symbol") {
    if (isSymbolAttributePreset(preset)) {
      return attachOverlayDefExtras(
        buildSymbolByAttributeOverlayDefFromPreset(entry, preset),
        entry,
      );
    }
    return attachOverlayDefExtras(buildSymbolOverlayDefFromPreset(entry, preset), entry);
  }

  /** @type {object} */
  const def = {
    key,
    table,
    type: preset.type,
    paint: applyStyleSchema(preset, entry.style, "paint"),
  };

  if (isAttributePreset(preset)) {
    const style = entry.style || {};
    def.paint[preset.attribute.paint] = buildAttributeColorMatch(
      style.field,
      style.classes,
      style.default_color ?? preset.attribute.default_color,
    );
  }

  if (preset.lineStack) {
    def.lineStack = true;
    def.paintHalo = applyStyleSchema(preset, entry.style, "paintHalo");
  }
  const wantsFillHit = preset.fillHit || entry.style?.fill_hit === true;
  if (wantsFillHit) {
    def.fillHit = true;
    def.fillHitPaint = applyStyleSchema(preset, entry.style, "fillHit");
    if (!def.fillHitPaint || !Object.keys(def.fillHitPaint).length) {
      const color = entry.style?.color ?? entry.style?.fill_hit_color;
      def.fillHitPaint = {
        "fill-color": color || "#990000",
        "fill-opacity": entry.style?.fill_hit_opacity ?? 0.01,
        "fill-antialias": true,
      };
    }
  } else if (preset.fillHit) {
    def.fillHit = true;
  }

  const minZ = entry.style?.minzoom ?? preset.minzoom;
  if (minZ != null) def.minzoom = Number(minZ);

  return attachOverlayDefExtras(def, entry);
}

function normalizeRncTiers(entry, preset) {
  const style = entry.style || {};
  const catalogTiers = style.tiers;
  const defaults = preset.default_tiers || [];
  const byId = Object.fromEntries(defaults.map((t) => [t.id, t]));

  const source = Array.isArray(catalogTiers) && catalogTiers.length ? catalogTiers : defaults;
  return source.map((ct) => {
    const def = byId[ct.id] || ct;
    const suffix =
      ct.suffix ??
      def.suffix ??
      (ct.id === "detail" || def.id === "detail" ? "" : `-${ct.id || def.id}`);
    return {
      suffix,
      filterValues: ct.filter_values ?? def.filter_values ?? [],
    };
  });
}

/**
 * Capa composite por zoom (RNC): colores y filtros desde catálogo, stack en map.js.
 * @param {object} entry
 * @param {object} preset
 * @returns {object|null}
 */
export function buildRncTieredOverlayDefFromPreset(entry, preset) {
  const table = entry.data?.table;
  const key = entry.overlay_key;
  if (!table || !key || !preset) return null;

  const style = entry.style || {};
  const field = style.field || preset.style_schema?.field?.default || "tipo_vial";
  const defaultColor =
    style.default_color || preset.style_schema?.default_color?.default || "rgb(140, 95, 55)";
  const colorMatch = Array.isArray(style.classes) && style.classes.length
    ? buildAttributeColorMatch(field, style.classes, defaultColor)
    : LAYER_PAINT.rnc["line-color"];

  const zoomCfg = { ...preset.zoom, ...style.zoom };
  const troncalMin = Number(zoomCfg.troncal_min ?? 10);
  const detailMin = Number(zoomCfg.detail_min ?? 12);

  return attachOverlayDefExtras(
    {
      key,
      table,
      type: "line",
      lineStack: true,
      rncTiered: true,
      rncFilterField: field,
      rncZoom: { troncalMin, detailMin },
      rncTiers: normalizeRncTiers(entry, preset),
      paintHalo: { ...LAYER_PAINT.rncHalo, "line-color": colorMatch },
      paint: { ...LAYER_PAINT.rnc, "line-color": colorMatch },
    },
    entry,
  );
}

/**
 * @param {object} entry
 * @param {Record<string, object>} genericPresets
 * @returns {string[]}
 */
export function validateVisorLayerStyle(entry, genericPresets) {
  const warnings = [];
  const id = entry.id || "?";
  const preset = entry.style_preset;
  const renderer = entry.renderer || "overlay";
  const overlayKey = entry.overlay_key;

  if (!preset) {
    warnings.push(`${id}: falta style_preset`);
    return warnings;
  }

  if (renderer === "overlay_composite") {
    if (preset !== "rnc_tiered") {
      warnings.push(`${id}: renderer overlay_composite espera style_preset "rnc_tiered"`);
      return warnings;
    }
    if (!genericPresets.rnc_tiered) {
      warnings.push(`${id}: preset rnc_tiered no cargado`);
      return warnings;
    }
    if (!overlayKey) warnings.push(`${id}: preset "rnc_tiered" requiere overlay_key`);
    if (!entry.data?.table) warnings.push(`${id}: preset "rnc_tiered" requiere data.table`);
    const tierStyle = entry.style || {};
    if (Array.isArray(tierStyle.classes) && tierStyle.classes.length) {
      warnings.push(...validateAttributeStyle(entry));
    }
    return warnings;
  }

  if (renderer === "visor_shared_martin" || renderer === "visor_shared_composite") {
    if (!overlayKey) warnings.push(`${id}: falta overlay_key para capa compartida Martin`);
    return warnings;
  }

  if (renderer !== "overlay") {
    warnings.push(`${id}: renderer "${renderer}" no reconocido`);
    return warnings;
  }

  if (genericPresets[preset]) {
    if (!overlayKey) warnings.push(`${id}: preset genérico "${preset}" requiere overlay_key`);
    if (!entry.data?.table) warnings.push(`${id}: preset genérico requiere data.table`);
    if (genericPresets[preset].type === "symbol") {
      if (isSymbolAttributePreset(genericPresets[preset])) {
        warnings.push(...validateSymbolAttributeStyle(entry));
      } else {
        const iconKey = entry.style?.icon_key;
        if (!iconKey) {
          warnings.push(`${id}: preset "${preset}" requiere style.icon_key`);
        } else if (!hasVisorIconKey(iconKey)) {
          warnings.push(`${id}: style.icon_key "${iconKey}" no está en config/visor/icons.json`);
        }
      }
      if (entry.data?.table === "c_denue" && !entry.data?.filter?.codigo_act?.length) {
        warnings.push(`${id}: capas DENUE requieren data.filter.codigo_act`);
      }
      return warnings;
    }
    const geom = entry.geometry;
    const presetGeom = genericPresets[preset].geometry;
    if (geom && presetGeom && geom !== presetGeom) {
      warnings.push(
        `${id}: geometry "${geom}" no coincide con preset "${preset}" (${presetGeom})`,
      );
    }
    if (isAttributePreset(genericPresets[preset])) {
      warnings.push(...validateAttributeStyle(entry));
    }
    return warnings;
  }

  if (BUILTIN_STYLE_PRESETS.has(preset)) {
    if (!overlayKey) {
      warnings.push(`${id}: preset "${preset}" requiere overlay_key`);
    } else if (!hasVisorOverlayDef(overlayKey)) {
      warnings.push(
        `${id}: overlay_key "${overlayKey}" no está en map.js — use preset genérico (${GENERIC_PRESET_IDS.join(", ")}) o registre OVERLAY_DEFS`,
      );
    }
    return warnings;
  }

  warnings.push(
    `${id}: style_preset "${preset}" desconocido. Builtin: ${[...BUILTIN_STYLE_PRESETS].join(", ")} | Genéricos: ${Object.keys(genericPresets).join(", ")}`,
  );
  return warnings;
}

/** Leyenda para capas con preset genérico. */
export function buildGenericLegendForLayer(entry, preset) {
  if (!preset || !entry) return null;
  const style = entry.style || {};
  const label = entry.label || entry.id;

  if (isAttributePreset(preset) && Array.isArray(style.classes) && style.classes.length) {
    const kind = preset.type === "line" ? "line" : preset.type === "circle" ? "circle" : "fill";
    const outline = style.outline_color ?? preset.paint?.["fill-outline-color"];
    return {
      items: style.classes.map((cls) => ({
        kind,
        color: String(cls.color),
        label: cls.label != null && cls.label !== "" ? String(cls.label) : String(cls.value),
        ...(kind === "fill" && outline ? { outline: String(outline) } : {}),
      })),
    };
  }

  if (
    preset.composite === "tiered_zoom" &&
    Array.isArray(style.classes) &&
    style.classes.length
  ) {
    return {
      items: style.classes.map((cls) => ({
        kind: "line",
        color: String(cls.color),
        label: cls.label != null && cls.label !== "" ? String(cls.label) : String(cls.value),
      })),
    };
  }

  if (isSymbolAttributePreset(preset) && Array.isArray(style.icon_rules) && style.icon_rules.length) {
    const iconItems = style.icon_rules
      .map((rule) => legendItemForIconKey(rule.icon_key, rule.label))
      .filter(Boolean);
    const fallback = legendItemForIconKey(
      style.default_icon_key,
      style.default_label || "Otro",
    );
    if (fallback) iconItems.push(fallback);
    return iconItems.length ? { iconItems } : null;
  }

  if (preset.type === "circle") {
    const color = style.color ?? preset.paint?.["circle-color"] ?? "#0d9488";
    return {
      items: [{ kind: "circle", color: String(color), label }],
    };
  }
  if (preset.type === "fill") {
    const color = style.color ?? preset.paint?.["fill-color"] ?? "#dce8ef";
    const outline = style.outline_color ?? preset.paint?.["fill-outline-color"] ?? "#6b8494";
    return {
      items: [{ kind: "fill", color: String(color), outline: String(outline), label }],
    };
  }
  if (preset.type === "line") {
    const color = style.color ?? preset.paint?.["line-color"] ?? "#333";
    return {
      items: [{ kind: "line", color: String(color), label }],
    };
  }
  return null;
}

export function getVisorStyleWarnings() {
  return _lastWarnings.slice();
}

export function isGenericStylePreset(presetId) {
  return Boolean(_genericPresets && _genericPresets[presetId]);
}

export function isAttributeStylePreset(presetId) {
  const preset = getGenericPreset(presetId);
  return Boolean(preset && (isAttributePreset(preset) || isSymbolAttributePreset(preset)));
}

export function getGenericPreset(presetId) {
  return _genericPresets?.[presetId] ?? null;
}

export function listGenericPresetIds() {
  return _genericPresets ? Object.keys(_genericPresets) : [];
}

async function fetchPresetJson(name) {
  const url = new URL(`../config/visor/presets/${name}.json`, import.meta.url);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`preset ${name}: HTTP ${res.status}`);
  return res.json();
}

/** @returns {Promise<Record<string, object>>} */
export async function loadGenericPresets() {
  if (_genericPresets) return _genericPresets;
  const map = {};
  for (const id of GENERIC_PRESET_IDS) {
    const data = await fetchPresetJson(id);
    if (data?.id) map[data.id] = data;
  }
  _genericPresets = map;
  return map;
}

/**
 * Valida catálogo, registra overlays dinámicos y remonta capas en el mapa.
 * @returns {Promise<{ warnings: string[], dynamicCount: number }>}
 */
export async function initVisorStyleFromCatalog() {
  const genericPresets = await loadGenericPresets();
  await loadVisorIconsConfig();
  const warnings = [];
  const dynamicDefs = [];

  for (const entry of getOrderedVisorLayerEntries()) {
    const layerWarnings = validateVisorLayerStyle(entry, genericPresets);
    warnings.push(...layerWarnings);

    const preset = entry.style_preset;
    if (entry.renderer === "overlay_composite") {
      if (preset === "rnc_tiered" && genericPresets.rnc_tiered) {
        const built = buildRncTieredOverlayDefFromPreset(entry, genericPresets.rnc_tiered);
        if (built) dynamicDefs.push(built);
      }
      continue;
    }

    if (entry.renderer !== "overlay") continue;
    if (!preset || !genericPresets[preset]) continue;
    if (isBuiltinOverlayKey(entry.overlay_key)) continue;

    const built = buildOverlayDefFromGenericPreset(entry, genericPresets[preset]);
    if (built) dynamicDefs.push(built);
  }

  registerVisorDynamicOverlayDefs(dynamicDefs);
  remountVisorDynamicOverlayLayers();

  _lastWarnings = warnings;
  for (const msg of warnings) {
    console.warn("[visor-style]", msg);
  }

  return { warnings, dynamicCount: dynamicDefs.length };
}
