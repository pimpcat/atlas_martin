/**
 * Cliente HTTP — Análisis espacial dinámico (FastAPI / PostGIS).
 *
 * Endpoints:
 *   GET  /api/analisis/capas
 *   GET  /api/capas/{tabla}/columnas
 *   POST /api/analisis/dinamico
 */
import { apiUrl } from "./atlasConfig.js";

const API_CAPAS_URL = apiUrl("/api/analisis/capas");
const API_COLUMNAS_URL = (tabla) => apiUrl(`/api/capas/${encodeURIComponent(tabla)}/columnas`);
const API_ANALISIS_URL = apiUrl("/api/analisis/dinamico");

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
    if (res.status === 404) {
      msg =
        "El API de análisis espacial no responde (404). Reinicie el contenedor FastAPI: docker compose restart api_backend";
    }
    throw new Error(String(msg));
  }
  return data;
}

/** Capas habilitadas para el menú desplegable (paso 1). */
export async function fetchCapasAnalisis() {
  const res = await fetch(API_CAPAS_URL, { headers: { Accept: "application/json" } });
  const data = await parseJsonResponse(res);
  if (!data.ok) throw new Error(data.message || "No se pudieron cargar las capas.");
  return data.capas || [];
}

/** Columnas numéricas descubiertas vía information_schema (paso 2). */
export async function fetchColumnasCapa(tabla) {
  const res = await fetch(API_COLUMNAS_URL(tabla), { headers: { Accept: "application/json" } });
  const data = await parseJsonResponse(res);
  if (!data.ok) throw new Error(data.message || "No se pudieron cargar las columnas.");
  return data.columnas || [];
}

/**
 * Ejecuta agregación espacial (paso 4).
 * @param {{ tabla: string, campos_elegidos: string[], geojson: object, cve_mun?: string|null }} payload
 */
export async function ejecutarAnalisisDinamico(payload) {
  const res = await fetch(API_ANALISIS_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}
