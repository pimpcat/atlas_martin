/**
 * Cliente GroSIG INV Engine (opcional).
 * Solo muestra geo_inv_viv si GET /api/inv/health responde OK.
 */
import { apiUrl } from "./atlasConfig.js";

let _enabled = false;
let _probed = false;
let _health = null;

export function isInvEngineEnabled() {
  return _enabled;
}

export function getInvHealth() {
  return _health;
}

export async function probeInvEngine() {
  if (_probed) return _enabled;
  _probed = true;
  try {
    const res = await fetch(apiUrl("/api/inv/health"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      _enabled = false;
      return false;
    }
    const data = await res.json();
    _health = data;
    _enabled = Boolean(data?.enabled) && data?.engine === "grosig-inv";
    return _enabled;
  } catch {
    _enabled = false;
    return false;
  }
}

export function resetInvEngineProbe() {
  _probed = false;
  _enabled = false;
  _health = null;
}
