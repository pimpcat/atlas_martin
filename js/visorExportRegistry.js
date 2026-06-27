/**
 * Validación de exportación data-driven del Visor geográfico (catálogo → API).
 */
import { getOrderedVisorLayerEntries } from "./visorCatalog.js";

/** @type {string[]} */
let _lastWarnings = [];

/**
 * @param {object} entry
 * @returns {string[]}
 */
export function validateVisorLayerExport(entry) {
  const warnings = [];
  const id = entry.id || "?";
  const caps = entry.capabilities?.export || [];
  if (!caps.length) return warnings;

  const data = entry.data || {};
  const hasTable = Boolean(data.table || data.export_table);
  const hasSql = Boolean(data.from_sql || data.from_sql_preset);

  if (!hasTable && !hasSql) {
    warnings.push(`${id}: export activo pero falta data.table o data.from_sql_preset`);
    return warnings;
  }

  const exp = data.export;
  if (exp && typeof exp === "object" && exp.mode === "columns") {
    const hasCols =
      (Array.isArray(exp.columns) && exp.columns.length) ||
      (Array.isArray(exp.columns_kml) && exp.columns_kml.length) ||
      (Array.isArray(exp.columns_shp) && exp.columns_shp.length) ||
      (Array.isArray(data.export_columns) && data.export_columns.length);
    if (!hasCols) {
      warnings.push(`${id}: export.mode "columns" requiere columns o export_columns`);
    }
  }

  return warnings;
}

export function getVisorExportWarnings() {
  return _lastWarnings.slice();
}

/** @returns {{ warnings: string[] }} */
export function initVisorExportFromCatalog() {
  const warnings = [];
  for (const entry of getOrderedVisorLayerEntries()) {
    warnings.push(...validateVisorLayerExport(entry));
  }
  _lastWarnings = warnings;
  for (const msg of warnings) {
    console.warn("[visor-export]", msg);
  }
  return { warnings };
}
