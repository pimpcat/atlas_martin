/**
 * Registro data-driven de iconos del visor (config/visor/icons.json).
 */
import {
  atlasMapIconUrl,
  getSymbolIconRasterPx,
  loadSvgFileAsMapSymbol,
  symbolLayoutIconSize,
} from "./mapSvgIcons.js";

/** @type {object|null} */
let _iconsConfig = null;

function iconVersionKey(iconKey) {
  return `__atlasVisorIcon_${iconKey}_v`;
}

export async function loadVisorIconsConfig() {
  if (_iconsConfig) return _iconsConfig;
  const url = new URL("../config/visor/icons.json", import.meta.url);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`icons.json: HTTP ${res.status}`);
  _iconsConfig = await res.json();
  return _iconsConfig;
}

export function getVisorIconsConfig() {
  return _iconsConfig;
}

export function hasVisorIconKey(iconKey) {
  const key = (iconKey || "").trim();
  return Boolean(key && _iconsConfig?.icons?.[key]);
}

function buildIconSizeExpression(iconEntry) {
  return buildIconSizeFromLayerStyle(iconEntry || {});
}

/** Expresión icon-size desde perfil de capa o entrada de icono. */
export function buildIconSizeFromLayerStyle(layerStyle = {}) {
  const profileName = layerStyle.size_profile || "standard_zoom";
  const profile = _iconsConfig?.size_profiles?.[profileName] || _iconsConfig?.size_profiles?.standard_zoom;
  const stops = profile?.zoom_stops || [8, 1.38, 12, 1.8, 16, 2.25, 20, 2.63];
  const maxScale = layerStyle.max_scale ?? 2.63;
  const iconSz = (v) => symbolLayoutIconSize(v, maxScale, layerStyle.supersample ?? 3);
  const pairs = [];
  for (let i = 0; i < stops.length - 1; i += 2) {
    pairs.push(stops[i], iconSz(stops[i + 1]));
  }
  return ["interpolate", ["linear"], ["zoom"], ...pairs];
}

function attributeFieldExpr(fieldName) {
  const upper = String(fieldName).toUpperCase();
  return ["coalesce", ["get", fieldName], ["get", upper], ""];
}

function matchRuleClause(fieldExpr, rule) {
  const clauses = [["==", fieldExpr, rule.value]];
  if (rule.partial) {
    clauses.push([">=", ["index-of", rule.partial, ["downcase", fieldExpr]], 0]);
  }
  return clauses.length === 1 ? clauses[0] : ["any", ...clauses];
}

export function getIconMaplibreId(iconKey) {
  return _iconsConfig?.icons?.[iconKey]?.id ?? null;
}

/**
 * Expresión MapLibre case para icon-image según reglas del catálogo.
 * @param {string} fieldName
 * @param {Array<{ value: string, partial?: string, icon_key: string }>} iconRules
 * @param {string} defaultIconKey
 */
export function buildIconImageMatchExpr(fieldName, iconRules, defaultIconKey) {
  const field = attributeFieldExpr(fieldName);
  const defaultId = getIconMaplibreId(defaultIconKey);
  if (!defaultId) return defaultIconKey;

  const cases = ["case"];
  for (const rule of iconRules || []) {
    const iconId = getIconMaplibreId(rule.icon_key);
    if (!iconId || rule.value == null) continue;
    cases.push(matchRuleClause(field, rule));
    cases.push(iconId);
  }
  cases.push(defaultId);
  return cases;
}

export function collectIconKeysFromStyle(style = {}) {
  const keys = new Set();
  if (style.default_icon_key) keys.add(style.default_icon_key);
  for (const rule of style.icon_rules || []) {
    if (rule?.icon_key) keys.add(rule.icon_key);
  }
  return [...keys];
}

export function readCatalogStyleFieldValue(properties, fieldName) {
  if (!properties || !fieldName) return "";
  const upper = String(fieldName).toUpperCase();
  const raw = properties[fieldName] ?? properties[upper];
  return raw == null ? "" : String(raw);
}

function catalogRuleMatches(rule, fieldValue) {
  const fv = String(fieldValue);
  if (fv === String(rule.value)) return true;
  if (rule.partial) {
    const partial = String(rule.partial).toLowerCase();
    if (fv.toLowerCase().includes(partial)) return true;
  }
  return false;
}

/**
 * Resuelve icon_key del catálogo para un feature (point_symbol / point_symbol_by_attribute).
 * @param {object} style - entry.style del catálogo
 * @param {object} [properties]
 */
export function resolveIconKeyFromCatalogStyle(style, properties) {
  if (!style) return null;
  if (style.icon_key) return style.icon_key;
  const field = style.field;
  if (!field) return style.default_icon_key || null;
  const fieldValue = readCatalogStyleFieldValue(properties, field);
  for (const rule of style.icon_rules || []) {
    if (catalogRuleMatches(rule, fieldValue)) return rule.icon_key;
  }
  return style.default_icon_key || null;
}

/** Capa del visor con simbología symbol declarada en catálogo. */
export function isCatalogSymbolLayerEntry(entry) {
  if (!entry?.style) return false;
  const preset = entry.style_preset;
  if (preset === "point_symbol" || preset === "point_symbol_by_attribute") return true;
  return Boolean(entry.style.icon_key || entry.style.icon_rules?.length);
}

/**
 * @param {string} iconKey
 * @param {object} presetLayout
 */
export function buildSymbolLayoutForIconKey(iconKey, presetLayout = {}) {
  const icon = _iconsConfig?.icons?.[iconKey];
  if (!icon) return null;
  return {
    ...presetLayout,
    "icon-image": icon.id,
    "icon-size": buildIconSizeExpression(icon),
  };
}

export async function ensureVisorIconKeyOnMap(map, iconKey) {
  if (!map || !iconKey) return;
  await loadVisorIconsConfig();
  const icon = _iconsConfig?.icons?.[iconKey];
  if (!icon) return;
  const ver = icon.version ?? 1;
  if (map[iconVersionKey(iconKey)] === ver) return;
  const maxScale = icon.max_scale ?? 2.63;
  const supersample = icon.supersample ?? 3;
  const base = (icon.logical_px ?? 32) / 2;
  const rasterPx = getSymbolIconRasterPx(base, maxScale, supersample);
  await loadSvgFileAsMapSymbol(map, icon.id, icon.file, rasterPx);
  map[iconVersionKey(iconKey)] = ver;
}

export async function ensureAllVisorCatalogIconsOnMap(map) {
  const cfg = await loadVisorIconsConfig();
  const keys = Object.keys(cfg.icons || {});
  await Promise.all(keys.map((key) => ensureVisorIconKeyOnMap(map, key)));
}

export function invalidateVisorIconRegistryOnMap(map) {
  if (!map || !_iconsConfig) return;
  for (const key of Object.keys(_iconsConfig.icons || {})) {
    delete map[iconVersionKey(key)];
  }
}

/**
 * @param {string} iconKey
 * @param {string} [labelOverride]
 */
export function legendItemForIconKey(iconKey, labelOverride) {
  const icon = _iconsConfig?.icons?.[iconKey];
  if (!icon) return null;
  return {
    label: labelOverride || icon.label || iconKey,
    icon: atlasMapIconUrl(icon.file),
  };
}

/**
 * @param {object} entry - capa del catálogo
 * @param {object} preset - preset point_symbol
 */
export function buildSymbolOverlayDefFromPreset(entry, preset) {
  const table = entry.data?.table;
  const key = entry.overlay_key;
  const iconKey = entry.style?.icon_key;
  if (!table || !key || !preset || !iconKey) return null;

  const layout = buildSymbolLayoutForIconKey(iconKey, preset.layout || {});
  if (!layout) return null;

  const style = entry.style || {};
  const paint = { ...(preset.paint || {}) };
  if (style.opacity != null) paint["icon-opacity"] = style.opacity;
  else if (preset.style_schema?.opacity?.default != null) {
    paint["icon-opacity"] = preset.style_schema.opacity.default;
  }

  const def = {
    key,
    table,
    type: "symbol",
    layout,
    paint,
    visorIconKey: iconKey,
  };
  const minZ = style.minzoom ?? preset.minzoom;
  if (minZ != null) def.minzoom = Number(minZ);
  return def;
}

/**
 * @param {object} entry - capa del catálogo
 * @param {object} preset - preset point_symbol_by_attribute
 */
export function buildSymbolByAttributeOverlayDefFromPreset(entry, preset) {
  const table = entry.data?.table;
  const key = entry.overlay_key;
  const style = entry.style || {};
  const field = style.field;
  const defaultKey = style.default_icon_key;
  if (!table || !key || !preset || !field || !defaultKey) return null;

  const iconImage = buildIconImageMatchExpr(field, style.icon_rules, defaultKey);
  const layerLayout = { ...(preset.layout || {}), ...(style.layout || {}) };
  layerLayout["icon-image"] = iconImage;
  layerLayout["icon-size"] = buildIconSizeFromLayerStyle(style);

  const paint = { ...(preset.paint || {}) };
  if (style.opacity != null) paint["icon-opacity"] = style.opacity;
  else if (preset.style_schema?.opacity?.default != null) {
    paint["icon-opacity"] = preset.style_schema.opacity.default;
  }

  const def = {
    key,
    table,
    type: "symbol",
    layout: layerLayout,
    paint,
    visorIconKeys: collectIconKeysFromStyle(style),
  };
  const minZ = style.minzoom ?? preset.minzoom;
  if (minZ != null) def.minzoom = Number(minZ);
  return def;
}

/**
 * Resuelve iconItems del bloque legend (icon_key → url SVG).
 * @param {Array<object|boolean>|boolean} iconItems
 */
export function resolveLegendIconItems(iconItems) {
  if (!iconItems || iconItems === true) return [];
  if (!Array.isArray(iconItems)) return [];
  return iconItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      if (item.icon) return { label: item.label || "", icon: item.icon };
      if (item.icon_key) return legendItemForIconKey(item.icon_key, item.label);
      return null;
    })
    .filter(Boolean);
}
