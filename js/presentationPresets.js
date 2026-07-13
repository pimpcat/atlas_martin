/**
 * Catálogo de presets de presentación (Fase 7).
 * Fuente: config/indicators/presentation_presets.json o GET /api/indicators/presentation-presets.
 */
import { apiUrl } from "./atlasConfig.js";

/** @type {object|null} */
let _presets = null;
/** @type {Promise<object>|null} */
let _loadPromise = null;

async function fetchPresetsJson() {
  const url = new URL("../config/indicators/presentation_presets.json", import.meta.url);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`presentation_presets.json: HTTP ${res.status}`);
  return res.json();
}

async function fetchPresetsApi() {
  const res = await fetch(apiUrl("/api/indicators/presentation-presets"), {
    cache: "no-cache",
  });
  if (!res.ok) throw new Error(`API presets: HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.ok) throw new Error(body?.message || "API presets no ok");
  const { ok: _ok, presets_path: _path, ...rest } = body;
  return rest;
}

export function loadPresentationPresets() {
  if (_presets) return Promise.resolve(_presets);
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    let data;
    try {
      data = await fetchPresetsJson();
    } catch {
      data = await fetchPresetsApi();
    }
    if (!Array.isArray(data?.presets) || !data.presets.length) {
      throw new Error("presentation_presets inválido: falta 'presets'");
    }
    _presets = data;
    return data;
  })();
  return _loadPromise;
}

export function getPresentationPresets() {
  return _presets;
}

export function resetPresentationPresetsCache() {
  _presets = null;
  _loadPromise = null;
}

/** Presets activos (implemented + catalog_only). */
export function listActivePresets() {
  return (_presets?.presets || []).filter(
    (p) => p.status === "implemented" || p.status === "catalog_only"
  );
}

export function getPresetById(presetId) {
  if (!presetId || !_presets) return null;
  const active = (_presets.presets || []).find((p) => p.id === presetId);
  if (active) return active;
  const reserved = (_presets.reserved || []).find((p) => p.id === presetId);
  if (reserved?.status === "alias" && reserved.alias_of) {
    return (_presets.presets || []).find((p) => p.id === reserved.alias_of) || reserved;
  }
  return reserved || null;
}

/** Ids válidos para presentation.template (incluye alias/reserved). */
export function knownTemplateIds() {
  const ids = new Set();
  for (const p of _presets?.presets || []) ids.add(p.id);
  for (const r of _presets?.reserved || []) {
    if (r.id) ids.add(r.id);
  }
  return ids;
}
