/**
 * Simbología INV — Entorno urbano (códigos 1–9, manzanas).
 * Alumbrado público (alumpub_c) y recubrimiento de calle (recucall_c).
 */

/** @typedef {{ code: number, label: string, color: string }} InvEntornoCode */

/** @type {InvEntornoCode[]} */
export const INV_ENTORNO_CODES = [
  { code: 1, label: "Todas las vialidades", color: "#005a4d" },
  { code: 2, label: "Alguna vialidad", color: "#ffff00" },
  { code: 3, label: "Ninguna vialidad", color: "#cc0000" },
  { code: 7, label: "Conjunto habitacional", color: "#ffffff" },
  { code: 8, label: "No aplica", color: "#0099cc" },
  { code: 9, label: "No especificado", color: "#9933cc" },
];

const CODE_MAP = new Map(INV_ENTORNO_CODES.map((c) => [c.code, c]));

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseEntornoCode(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "*" || /^n\.?d\.?$/i.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} raw
 * @returns {InvEntornoCode | null}
 */
export function getEntornoClass(raw) {
  const code = parseEntornoCode(raw);
  if (code == null) return null;
  return CODE_MAP.get(code) || null;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function getEntornoColor(raw) {
  const cls = getEntornoClass(raw);
  return cls ? cls.color : "rgba(120, 130, 150, 0.45)";
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function getEntornoLabel(raw) {
  const cls = getEntornoClass(raw);
  if (cls) return cls.label;
  const code = parseEntornoCode(raw);
  return code != null ? `Código ${code}` : "Sin dato";
}

/**
 * Leyenda compacta (panel lateral).
 */
export function invEntornoLegendSvg() {
  const items = INV_ENTORNO_CODES.map(
    (c, i) =>
      `<rect x="1" y="${1 + i * 3.4}" width="5" height="2.8" rx="0.4" fill="${c.color}" stroke="rgba(0,0,0,0.25)" stroke-width="0.35"/>`,
  ).join("");
  return `<svg class="invviv-ico-svg invviv-ico-entorno" viewBox="0 0 7 22" aria-hidden="true">${items}</svg>`;
}
