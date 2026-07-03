/**
 * Resolución case-insensitive de IDs de capa MapLibre.
 * MapLibre normaliza los id a minúsculas; el catálogo puede usar camelCase (p. ej. rncLoc → ly-rncloc).
 */

export function normalizeMapLayerId(id) {
  return String(id || "").toLowerCase();
}

export function resolveMapLayerId(map, layerId) {
  if (!map || !layerId) return null;
  if (map.getLayer(layerId)) return layerId;
  const target = normalizeMapLayerId(layerId);
  const hit = map.getStyle()?.layers?.find((l) => normalizeMapLayerId(l.id) === target);
  return hit && map.getLayer(hit.id) ? hit.id : null;
}

export function canonicalOverlayBaseId(keyOrLayerId) {
  let s = String(keyOrLayerId || "");
  if (!s.startsWith("ly-")) s = `ly-${s}`;
  return normalizeMapLayerId(s);
}

export function layerBelongsToOverlayBase(layerId, baseLayerId) {
  const lid = normalizeMapLayerId(layerId);
  const base = canonicalOverlayBaseId(baseLayerId);
  return lid === base || lid.startsWith(`${base}-`);
}

export function overlaySubLayerIdOnMap(map, baseLayerId, suffix = "") {
  if (!map) return null;
  const base = canonicalOverlayBaseId(baseLayerId);
  const target = suffix ? `${base}${suffix.startsWith("-") ? suffix : `-${suffix}`}` : base;
  return resolveMapLayerId(map, target);
}

export function overlayBaseLayerIdOnMap(map, keyOrBaseId) {
  return overlaySubLayerIdOnMap(map, keyOrBaseId) || resolveMapLayerId(map, keyOrBaseId);
}

/**
 * Clave para hover/identify: capas Martin compartidas (p. ej. lyr_usosuelo) no usan prefijo ly-.
 * @param {import("maplibre-gl").Map|null|undefined} map
 * @param {string} layerIdOrPrimary
 */
export function resolveOverlayPickPrimary(map, layerIdOrPrimary) {
  const raw = String(layerIdOrPrimary || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("lyr_") || raw.startsWith("ly-")) return raw;
  if (map && resolveMapLayerId(map, raw)) return raw;
  return `ly-${raw}`;
}
