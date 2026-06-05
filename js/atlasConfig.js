/**
 * URLs del stack Atlas (Nginx → FastAPI / Martin / Apache).
 *
 * Con Nginx (puerto 80): rutas relativas, mismo origen → sin CORS.
 * Desarrollo legacy (Apache :8080 sin Nginx): FastAPI :8000, Martin :3000.
 *
 * Sobrescribir en index.html antes de cargar módulos si hace falta:
 *   window.ATLAS_API_BASE = "";
 *   window.ATLAS_MARTIN_BASE = "/tiles";
 */

function pagePort() {
  if (typeof window === "undefined" || !window.location) return "";
  return window.location.port || "";
}

function isNginxFrontDoor() {
  const p = pagePort();
  return !p || p === "80" || p === "443";
}

function detectApiBase() {
  if (typeof window !== "undefined" && window.ATLAS_API_BASE != null && window.ATLAS_API_BASE !== "") {
    return String(window.ATLAS_API_BASE).replace(/\/$/, "");
  }
  if (typeof window === "undefined" || !window.location) return "";
  const { protocol, hostname } = window.location;
  if (isNginxFrontDoor()) return "";
  if (pagePort() === "8080") return `${protocol}//${hostname}:8000`;
  return "";
}

function detectMartinBase() {
  if (typeof window !== "undefined" && window.ATLAS_MARTIN_BASE != null && window.ATLAS_MARTIN_BASE !== "") {
    return String(window.ATLAS_MARTIN_BASE).replace(/\/$/, "");
  }
  if (typeof window === "undefined" || !window.location) return "/tiles";
  const { protocol, hostname } = window.location;
  if (isNginxFrontDoor()) return "/tiles";
  if (pagePort() === "8080") return `${protocol}//${hostname}:3000`;
  return "/tiles";
}

export const API_BASE = detectApiBase();
export const MARTIN_BASE = detectMartinBase();

/** Prefijo /api/… → FastAPI (app_api) vía Nginx; no usa htdocs/atlas_gro/api/*. */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

/** Base pública de una capa Martin (sin /{z}/{x}/{y}). */
export function martinTileJson(table) {
  const base = MARTIN_BASE.replace(/\/$/, "");
  const t = String(table).replace(/^\//, "");
  return `${base}/${t}`;
}

/** Plantilla XYZ de teselas vectoriales Martin (siempre bajo /tiles/ con Nginx). */
export function martinTileUrl(table) {
  const path = `${martinTileJson(table)}/{z}/{x}/{y}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}
