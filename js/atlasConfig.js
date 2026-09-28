/**
 * URLs del stack Atlas (Nginx → FastAPI / Martin / Apache).
 *
 * Con Nginx (PORT_NGINX en .env, p. ej. 850): rutas relativas /api y /tiles → sin CORS.
 * Desarrollo legacy (Apache :8080 expuesto sin Nginx): FastAPI :8000, Martin :3000.
 *
 * Sobrescribir en index.html antes de cargar módulos si hace falta:
 *   window.ATLAS_API_BASE = "";
 *   window.ATLAS_MARTIN_BASE = "/tiles";
 */

function pagePort() {
  if (typeof window === "undefined" || !window.location) return "";
  return window.location.port || "";
}

/** Apache del contenedor expuesto directo al host (sin proxy Nginx). */
function isLegacyApacheDev() {
  return pagePort() === "8080";
}

/** Portal servido por Nginx (cualquier PORT_NGINX: 850, 80, etc.). */
function isNginxFrontDoor() {
  return !isLegacyApacheDev();
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

/** Capas Martin de CORE (marco nacional) y basemap: nunca llevan prefijo de instancia. */
const MARTIN_CORE_SOURCE_IDS = new Set([
  "amigo_c_ent",
  "amigo_c_mun",
  "c_ent",
  "c_mun",
  "v_c_ent_disp",
  "v_c_mun_disp",
  "mexico",
]);

let _martinSourcePrefix = "";
let _apiCveEnt = "";

export function setMartinSourcePrefix(prefix) {
  _martinSourcePrefix = String(prefix || "").trim();
}

export function getMartinSourcePrefix() {
  return _martinSourcePrefix;
}

export function setApiCveEnt(cve_ent) {
  const d = String(cve_ent ?? "").replace(/\D/g, "");
  _apiCveEnt = d.length >= 2 ? d.slice(-2) : "";
}

export function getApiCveEnt() {
  return _apiCveEnt;
}

function _apiPathname(href) {
  try {
    return new URL(href, "http://local.invalid").pathname;
  } catch {
    return String(href || "").split("?")[0];
  }
}

/** Rutas Studio/admin: el JWT define la instancia; no reescribir con cve_ent. */
function shouldAttachCveEnt(href) {
  const p = _apiPathname(href);
  if (!p.includes("/api/") && !p.startsWith("/api")) return false;
  const skip = [
    "/api/admin",
    "/api/data-refresh",
    "/api/visor/admin",
    "/api/geography-context/admin",
    "/api/inv/admin",
    "/api/indicators/admin",
    "/api/explorer/admin",
    "/api/amigo/nodo",
    "/api/amigo/config",
    "/api/amigo/entidades",
    "/api/cartography",
    "/api/auth",
  ];
  return !skip.some((s) => p === s || p.startsWith(`${s}/`));
}

function withTerritoryUrl(href) {
  if (!_apiCveEnt || !href || !shouldAttachCveEnt(href)) return href;
  try {
    const u = new URL(href, typeof window !== "undefined" ? window.location.origin : "http://local.invalid");
    if (!u.searchParams.has("cve_ent")) {
      u.searchParams.set("cve_ent", _apiCveEnt);
    }
    const orig = String(href);
    if (/^https?:\/\//i.test(orig)) return u.toString();
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}

function installTerritoryFetch() {
  if (typeof window === "undefined" || window.__grosigTerritoryFetch) return;
  const orig = window.fetch.bind(window);
  window.__grosigTerritoryFetch = true;
  window.fetch = (input, init) => {
    try {
      const href = typeof input === "string" ? input : input && input.url;
      const nextHref = withTerritoryUrl(href);
      if (!_apiCveEnt || !shouldAttachCveEnt(href || "")) {
        return orig(input, init);
      }
      const headers = new Headers(
        (init && init.headers) ||
          (typeof input !== "string" && input && input.headers) ||
          undefined,
      );
      headers.set("X-GroSIG-Cve-Ent", _apiCveEnt);
      const nextInit = init ? { ...init, headers } : { headers };
      if (typeof input === "string") {
        return orig(nextHref, nextInit);
      }
      return orig(new Request(nextHref, input), nextInit);
    } catch {
      return orig(input, init);
    }
  };
}

installTerritoryFetch();

/** ID publicado en Martin: tabla en GRO/CORE; `{connection_key}_{tabla}` en federadas. */
export function martinPublishedId(table) {
  const t = String(table || "").replace(/^\//, "");
  if (!t || MARTIN_CORE_SOURCE_IDS.has(t) || !_martinSourcePrefix) return t;
  return `${_martinSourcePrefix}_${t}`;
}

/** Prefijo /api/… → FastAPI (app_api) vía Nginx; no usa htdocs/atlas_gro/api/*. */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

/** Base pública de una capa Martin (sin /{z}/{x}/{y}). */
export function martinTileJson(table) {
  const base = MARTIN_BASE.replace(/\/$/, "");
  const t = martinPublishedId(table);
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
