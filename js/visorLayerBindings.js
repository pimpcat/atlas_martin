/**
 * Enlace entre ids del catálogo del visor y funciones get/set de map.js.
 * Solo aplica al Visor geográfico.
 */
import {
  getOverlayActive,
  setOverlayActiveByKey,
  setUsoSueloLayerActive,
  getUsoSueloLayerActive,
  setHidroCorrientesVisorLayerActive,
  getHidroCorrientesVisorLayerActive,
  setHidroCuerposVisorLayerActive,
  getHidroCuerposVisorLayerActive,
  setCurvasNivelVisorLayerActive,
  getCurvasNivelVisorLayerActive,
} from "./map.js";

/** @typedef {{ getActive: () => boolean, setActive: (active: boolean, cve?: string|null) => void, overlayKey?: string }} VisorLayerBinding */

/** Capas con activación especial (compartidas / compuestas). El resto usa overlay_key genérico. */
/** @type {Record<string, VisorLayerBinding>} */
const SPECIAL_LAYER_BINDINGS = {
  uso_suelo: {
    overlayKey: "uso_suelo",
    getActive: getUsoSueloLayerActive,
    setActive: setUsoSueloLayerActive,
  },
  hidro_corrientes: {
    overlayKey: "hidro",
    getActive: getHidroCorrientesVisorLayerActive,
    setActive: setHidroCorrientesVisorLayerActive,
  },
  hidro_cuerpos: {
    overlayKey: "hcuerpos",
    getActive: getHidroCuerposVisorLayerActive,
    setActive: setHidroCuerposVisorLayerActive,
  },
  curvas_nivel: {
    overlayKey: "curnivel",
    getActive: getCurvasNivelVisorLayerActive,
    setActive: setCurvasNivelVisorLayerActive,
  },
};

/**
 * @param {string} layerId
 * @param {{ overlay_key?: string, renderer?: string }} [entry]
 * @returns {VisorLayerBinding|null}
 */
export function resolveVisorLayerBinding(layerId, entry = {}) {
  const key = (layerId || "").trim().toLowerCase();
  const special = SPECIAL_LAYER_BINDINGS[key];
  if (special) return special;

  const overlayKey = entry.overlay_key;
  if (!overlayKey) return null;

  return {
    overlayKey,
    getActive: () => getOverlayActive(overlayKey),
    setActive: (active, cve) => setOverlayActiveByKey(overlayKey, active, cve),
  };
}

/**
 * Clave MapLibre principal para identify (ly-*).
 * @param {{ id: string, overlay_key?: string, renderer?: string }} entry
 */
export function maplibrePrimaryIdForCatalogLayer(entry) {
  if (entry.id === "uso_suelo") return "lyr_usosuelo";
  if (entry.id === "hidro_corrientes") return "ly-hidro";
  if (entry.id === "hidro_cuerpos") return "ly-hcuerpos";
  if (entry.id === "curvas_nivel") return "ly-curnivel";
  if (entry.overlay_key) return `ly-${entry.overlay_key}`;
  return `ly-${entry.id}`;
}
