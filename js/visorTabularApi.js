/**
 * Cliente HTTP — consulta tabular de capas del visor geográfico.
 * @see app_api/visor_tabular.py
 */
import { apiUrl } from "./atlasConfig.js";

const API_CAPAS_URL = apiUrl("/api/visor/tabla/capas");
const API_TABLA_URL = apiUrl("/api/visor/tabla");
const API_EXPORT_URL = apiUrl("/api/visor/tabla/export");

async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail ?? data;
    let msg =
      (typeof detail === "object" && detail !== null && detail.message) ||
      (typeof detail === "object" && detail !== null && detail.error) ||
      data.message ||
      res.statusText;
    if (typeof detail === "string" && detail) msg = detail;
    throw new Error(String(msg));
  }
  return data;
}

/** Capas habilitadas para consulta tabular. */
export async function fetchVisorTabularLayers() {
  const res = await fetch(API_CAPAS_URL, { headers: { Accept: "application/json" } });
  const data = await parseJsonResponse(res);
  return data.layers || [];
}

/**
 * @param {{ layer: string, cve_mun: string }} params
 */
export async function fetchVisorTabularData(params) {
  const qs = new URLSearchParams({
    layer: String(params.layer),
    cve_mun: String(params.cve_mun),
  });
  const res = await fetch(`${API_TABLA_URL}?${qs}`, { headers: { Accept: "application/json" } });
  const data = await parseJsonResponse(res);
  if (!data.ok) throw new Error(data.message || "No se pudo cargar la tabla.");
  return data;
}

/**
 * Descarga Excel generado en el backend (openpyxl).
 * @param {{ layer: string, cve_mun: string, nom_mun?: string }} params
 */
export async function downloadVisorTabularExcel(params) {
  const qs = new URLSearchParams({
    layer: String(params.layer),
    cve_mun: String(params.cve_mun),
    format: "xlsx",
  });
  const res = await fetch(`${API_EXPORT_URL}?${qs}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail ?? data;
    const msg =
      (typeof detail === "object" && detail?.message) ||
      data.message ||
      res.statusText ||
      "No se pudo exportar.";
    throw new Error(String(msg));
  }
  const blob = await res.blob();
  const cve = String(params.cve_mun).padStart(3, "0");
  const nom = (params.nom_mun || "municipio").replace(/\s+/g, "_");
  const filename = `localidades_${nom}_${cve}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
