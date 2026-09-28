/**
 * API de buffer y geometría del visor geográfico (PostGIS).
 */
import { apiUrl } from "./atlasConfig.js";

const API_BUFFER_URL = apiUrl("/api/visor/buffer");
const API_FEATURE_GEOM_URL = apiUrl("/api/visor/feature-geometry");
const API_FEATURE_OUTLINE_URL = apiUrl("/api/visor/feature-outline");

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

/**
 * @param {{ geojson: object, distance_m: number, layer_id?: string|null, source_gid?: string|null, line_side?: string|null }} payload
 * @returns {Promise<{ feature: object }>}
 */
export async function fetchVisorBuffer(payload) {
  const res = await fetch(API_BUFFER_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse(res);
  if (!data.ok || !data.feature) {
    throw new Error(data.message || "No se pudo generar el buffer.");
  }
  return data;
}

/** Geometría completa desde PostGIS (gid, clic lon/lat sobre the_geom, o attrs de catálogo). */
export async function fetchVisorFeatureGeometry({ layer_id, gid, attrs, lon, lat } = {}) {
  const qs = new URLSearchParams({
    layer_id: String(layer_id),
  });
  if (gid != null && String(gid).trim() !== "") {
    qs.set("gid", String(gid).trim());
  }
  if (Number.isFinite(Number(lon)) && Number.isFinite(Number(lat))) {
    qs.set("lon", String(lon));
    qs.set("lat", String(lat));
  }
  if (attrs && typeof attrs === "object" && Object.keys(attrs).length) {
    const slim = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || typeof v === "object") continue;
      if (/^atlas/i.test(k)) continue;
      const s = String(v).trim();
      if (s) slim[k] = s;
    }
    if (Object.keys(slim).length) qs.set("attrs", JSON.stringify(slim));
  }
  const res = await fetch(`${API_FEATURE_GEOM_URL}?${qs}`, {
    headers: { Accept: "application/json" },
  });
  const data = await parseJsonResponse(res);
  if (!data.ok || !data.feature) {
    throw new Error(data.message || "No se pudo cargar la geometría del elemento.");
  }
  return data;
}

/** Contorno simplificado de polígono (LineString) para resaltado. */
export async function fetchVisorFeatureOutline({ layer_id, gid }) {
  const qs = new URLSearchParams({
    layer_id: String(layer_id),
    gid: String(gid),
  });
  const res = await fetch(`${API_FEATURE_OUTLINE_URL}?${qs}`, {
    headers: { Accept: "application/json" },
  });
  const data = await parseJsonResponse(res);
  if (!data.ok || !data.feature) {
    throw new Error(data.message || "No se pudo cargar el contorno del elemento.");
  }
  return data;
}
