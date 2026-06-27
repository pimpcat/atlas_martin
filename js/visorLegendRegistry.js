/**
 * Leyenda data-driven desde bloque `legend` del catálogo del visor.
 */
import { getOrderedVisorLayerEntries } from "./visorCatalog.js";
import {
  buildGenericLegendForLayer,
  getGenericPreset,
  isGenericStylePreset,
} from "./visorStyleRegistry.js";
import { loadVisorIconsConfig, resolveLegendIconItems } from "./visorIconRegistry.js";

/** @type {Map<string, { items?: object[], iconItems?: object[]|boolean }>} */
const _legendByLayerId = new Map();

function normalizeLegendBlock(legend) {
  if (!legend || typeof legend !== "object") return null;
  const out = {};
  if (Array.isArray(legend.items) && legend.items.length) {
    out.items = legend.items.map((item) => ({ ...item }));
  }
  if (legend.iconItems) {
    const resolved = resolveLegendIconItems(legend.iconItems);
    if (resolved.length) out.iconItems = resolved;
  }
  return out.items?.length || out.iconItems ? out : null;
}

/**
 * Registra leyendas explícitas del catálogo (idempotente).
 */
export async function initVisorLegendFromCatalog() {
  await loadVisorIconsConfig();
  _legendByLayerId.clear();
  for (const entry of getOrderedVisorLayerEntries()) {
    const sym = normalizeLegendBlock(entry.legend);
    if (sym) _legendByLayerId.set(entry.id, sym);
  }
}

/**
 * Leyenda para una capa: catálogo explícito → preset genérico → null.
 * @param {string} layerId
 * @param {object} [entry]
 */
export function resolveVisorLegendForLayer(layerId, entry = null) {
  const explicit = _legendByLayerId.get(layerId);
  if (explicit) return explicit;

  const layerEntry = entry || null;
  if (layerEntry && isGenericStylePreset(layerEntry.style_preset)) {
    const preset = getGenericPreset(layerEntry.style_preset);
    return buildGenericLegendForLayer(layerEntry, preset);
  }
  return null;
}
