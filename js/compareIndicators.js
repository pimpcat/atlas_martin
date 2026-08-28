/**
 * Comparador municipal — ids habilitados desde API (catálogo + legacy AMIGO).
 */
import { apiUrl } from "./atlasConfig.js";
import { getIndicatorById, getIndicatorsCatalog } from "./indicatorCatalog.js";

/** Fallback offline / antes de cargar API (legacy C3). */
const LEGACY_COMPARE_INDICATOR_IDS = [
  "eco_caracteristicas_economicas",
  "eco_poblacion_ocupada",
  "eco_superficie_agricultura",
  "eco_unidades_economicas",
  "gov_habitantes_por_policia",
  "gov_instituciones_admin_publica",
  "gov_inversion_publica",
  "socio_analfabetismo",
  "socio_crecimiento",
  "socio_defunciones",
  "socio_edad_mediana",
  "socio_escolaridad",
  "socio_nacimientos",
  "socio_poblacion",
  "socio_unidades_medicas",
  "viv_participacion_vivh",
  "viv_servicios_vivh",
];

/** @type {Set<string>|null} */
let _compareSet = null;
/** @type {Promise<Set<string>>|null} */
let _loadPromise = null;

function idsFromCatalog() {
  const catalog = getIndicatorsCatalog();
  if (!catalog?.indicators?.length) return null;
  const ids = new Set();
  for (const ind of catalog.indicators) {
    const iid = String(ind?.id || "").trim();
    if (!iid) continue;
    if (ind?.compare?.enabled === false) continue;
    if (ind?.compare?.enabled === true) ids.add(iid);
  }
  for (const id of LEGACY_COMPARE_INDICATOR_IDS) {
    const ind = catalog.indicators.find((x) => x.id === id);
    if (ind?.compare?.enabled === false) continue;
    if (!ind?.compare || ind.compare.enabled !== false) ids.add(id);
  }
  return ids.size ? ids : null;
}

async function fetchCompareEnabledFromApi() {
  const res = await fetch(apiUrl("/api/indicators/compare/enabled"), { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`compare/enabled: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body?.ok || !Array.isArray(body.indicator_ids)) {
    throw new Error(body?.message || "compare/enabled: respuesta inválida");
  }
  return new Set(body.indicator_ids.map((x) => String(x).trim()).filter(Boolean));
}

/**
 * Carga ids habilitados (idempotente). Preferir llamar al arrancar Analítica / shell.
 * @returns {Promise<Set<string>>}
 */
export function loadCompareEnabledIds() {
  if (_compareSet) return Promise.resolve(_compareSet);
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      _compareSet = await fetchCompareEnabledFromApi();
    } catch (err) {
      console.warn("[compare] API compare/enabled no disponible:", err);
      _compareSet = idsFromCatalog() || new Set(LEGACY_COMPARE_INDICATOR_IDS);
    }
    return _compareSet;
  })();
  return _loadPromise;
}

/** Lista ordenada (requiere loadCompareEnabledIds previo o usa fallback legacy). */
export function getCompareEnabledIds() {
  if (_compareSet) return [..._compareSet].sort();
  const fromCat = idsFromCatalog();
  if (fromCat) return [...fromCat].sort();
  return [...LEGACY_COMPARE_INDICATOR_IDS];
}

export function isCompareEnabled(indicatorId) {
  const id = String(indicatorId || "").trim();
  if (!id) return false;
  if (_compareSet) return _compareSet.has(id);
  const ind = getIndicatorById(id);
  if (ind?.compare?.enabled === true) return true;
  if (ind?.compare?.enabled === false) return false;
  return LEGACY_COMPARE_INDICATOR_IDS.includes(id);
}

export function resetCompareEnabledCache() {
  _compareSet = null;
  _loadPromise = null;
}
