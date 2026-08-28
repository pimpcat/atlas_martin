/** Semilla pendiente al abrir Analítica desde el shell de un indicador. */
let _pending = null;

/**
 * @param {{
 *   indicatorId?: string,
 *   cve_ent?: string,
 *   cve_mun?: string,
 *   nomgeo?: string,
 *   cve_ent_b?: string,
 *   cve_mun_b?: string,
 *   nomgeo_b?: string,
 *   autoCompare?: boolean,
 * }|null} seed
 */
export function setPendingAnaliticaCompareSeed(seed) {
  _pending = seed ? { ...seed } : null;
}

/** @returns {typeof _pending} */
export function consumePendingAnaliticaCompareSeed() {
  const s = _pending;
  _pending = null;
  return s;
}
