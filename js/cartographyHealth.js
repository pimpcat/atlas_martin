/**
 * Cartography Health — contrato Core único.
 *
 * Único mecanismo para saber si vive GroSIG Cartography Engine:
 *   GET /api/cartography/health
 *
 * Consumidores: Visor, GroSIG Studio, Cartography Studio (y docs Installer / Deployment Manager).
 * No inventar flags paralelos ni “¿existe el engine?” por otra vía.
 */
import { apiUrl } from "./atlasConfig.js";

export const CARTOGRAPHY_ENGINE_ID = "grosig-cartography";

/** @type {object|null} */
let _health = null;
let _enabled = false;
let _probed = false;

/**
 * ¿El payload indica Engine vivo y usable en UI?
 * @param {object|null|undefined} data
 */
export function isCartographyHealthAlive(data) {
  return Boolean(data?.enabled) && data?.engine === CARTOGRAPHY_ENGINE_ID;
}

export function getCartographyHealth() {
  return _health;
}

export function isCartographyEnabled() {
  return _enabled;
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, health: object|null, httpStatus?: number }>}
 */
export async function probeCartographyHealth(opts = {}) {
  const force = Boolean(opts.force);
  if (_probed && !force) {
    return { ok: _enabled, health: _health };
  }
  _probed = true;
  try {
    const res = await fetch(apiUrl("/api/cartography/health"), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      _health = null;
      _enabled = false;
      return { ok: false, health: null, httpStatus: res.status };
    }
    const data = await res.json();
    _health = data;
    _enabled = isCartographyHealthAlive(data);
    return { ok: _enabled, health: data, httpStatus: res.status };
  } catch {
    _health = null;
    _enabled = false;
    return { ok: false, health: null };
  }
}

/** Alias histórico usado por el panel del Visor. */
export async function probeCartographyEngine(opts = {}) {
  const result = await probeCartographyHealth(opts);
  return result.ok;
}

/**
 * Resumen listo para fase 0 / pills (sin I/O).
 * @param {object|null|undefined} data
 */
export function summarizeCartographyHealth(data) {
  if (!isCartographyHealthAlive(data)) {
    return {
      alive: false,
      title: "GroSIG Cartography Engine",
      statusLabel: "No disponible",
      version: data?.version || "—",
      templatesCount: 0,
      logosCount: 0,
      brandingUpdatedAt: null,
      engine: data?.engine || null,
      status: data?.status || "off",
    };
  }
  const templatesCount =
    typeof data.templates_count === "number"
      ? data.templates_count
      : Array.isArray(data.templates)
        ? data.templates.length
        : 0;
  const logosCount = typeof data.logos_count === "number" ? data.logos_count : 0;
  const status = String(data.status || "available");
  const statusLabel =
    status === "available"
      ? "Disponible"
      : status === "degraded"
        ? "Degradado"
        : status;
  return {
    alive: true,
    title: "GroSIG Cartography Engine",
    statusLabel,
    version: data.version || "—",
    templatesCount,
    logosCount,
    brandingUpdatedAt: data.branding_updated_at || null,
    engine: data.engine,
    status,
  };
}
