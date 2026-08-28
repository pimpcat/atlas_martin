import { setPendingAnaliticaCompareSeed } from "./analiticaCompareSeed.js";
import { isCompareEnabled } from "./comparisonView.js";

let _activateMenuItem = null;

/** Registra la función de menú (app.js al arrancar). */
export function registerAnaliticaCompareNav({ activateMenuItem }) {
  _activateMenuItem = activateMenuItem;
}

/**
 * Abre Analítica → Comparador municipal con datos precargados.
 * @param {{
 *   indicatorId: string,
 *   cve_ent?: string,
 *   cve_mun?: string,
 *   nomgeo?: string,
 *   cve_ent_b?: string,
 *   cve_mun_b?: string,
 *   nomgeo_b?: string,
 *   autoCompare?: boolean,
 * }} seed
 */
export async function openCompareInAnalitica(seed) {
  const indicatorId = String(seed?.indicatorId || "").trim();
  if (!isCompareEnabled(indicatorId)) {
    alert("Comparador aún no habilitado para este indicador.");
    return;
  }
  if (!seed?.cve_mun) {
    alert("Seleccione primero un municipio en el explorador (Municipio A).");
    return;
  }
  setPendingAnaliticaCompareSeed({
    indicatorId,
    cve_ent: seed.cve_ent,
    cve_mun: seed.cve_mun,
    nomgeo: seed.nomgeo,
    cve_ent_b: seed.cve_ent_b,
    cve_mun_b: seed.cve_mun_b,
    nomgeo_b: seed.nomgeo_b,
    autoCompare: seed.autoCompare !== false && Boolean(seed.cve_mun_b),
  });
  if (typeof _activateMenuItem === "function") {
    await _activateMenuItem("analitica_comparador");
    return;
  }
  alert("No se pudo abrir Analítica. Recargue la página.");
}
