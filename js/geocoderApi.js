/**
 * Cliente HTTP — Buscador geográfico offline (FastAPI / PostGIS).
 *
 * Endpoint:
 *   GET /api/buscar?q={texto}&cve_mun={clave}&cve_ent={ent}
 *
 * @see app_api/geocoder.py
 * @see visorGeocoder.js     MaplibreGeocoder + forwardGeocode
 */

import { apiUrl } from "./atlasConfig.js";

const API_BUSCAR_URL = apiUrl("/api/buscar");
const API_BUSCAR_GEOM_URL = apiUrl("/api/buscar/geometria");

/** Cancela la petición de sugerencias anterior al teclear de nuevo. */
let _buscarAbort = null;

/**
 * @typedef {object} GeocoderRow
 * @property {string} nombre_busqueda
 * @property {string} tipo
 * @property {string} tabla_origen
 * @property {string} id_origen
 * @property {string} [geom_tipo]
 * @property {number} lng
 * @property {number} lat
 */

/**
 * @param {string} q
 * @param {string | null | undefined} cveMun Clave municipal 3 dígitos (visor).
 * @param {string | null | undefined} cveEnt
 * @returns {Promise<{ ok: boolean, query: string, count: number, rows: GeocoderRow[], performance?: object, timings?: object[], aborted?: boolean }>}
 */
export async function fetchBuscarGeocoder(q, cveMun, cveEnt) {
  const term = String(q || "").trim();

  if (term.length < 2) {
    return { ok: true, query: term, count: 0, rows: [] };
  }

  const cve = cveMun != null ? String(cveMun).trim() : "";
  const ent = cveEnt != null ? String(cveEnt).replace(/\D/g, "").slice(-2) : "";

  let url = `${API_BUSCAR_URL}?q=${encodeURIComponent(term)}`;
  if (cve) {
    url += `&cve_mun=${encodeURIComponent(cve)}`;
  }
  if (ent.length === 2) {
    url += `&cve_ent=${encodeURIComponent(ent)}`;
  }

  if (_buscarAbort) {
    try {
      _buscarAbort.abort();
    } catch (_) {
      /* ignore */
    }
  }
  const ctrl = new AbortController();
  _buscarAbort = ctrl;

  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err && (err.name === "AbortError" || ctrl.signal.aborted)) {
      return { ok: true, query: term, count: 0, rows: [], aborted: true };
    }
    throw err;
  } finally {
    if (_buscarAbort === ctrl) {
      _buscarAbort = null;
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      data.message ||
      res.statusText ||
      "Error en búsqueda geográfica";
    throw new Error(msg);
  }

  return {
    ok: Boolean(data.ok),
    query: data.query ?? term,
    count: Number(data.count) || 0,
    rows: Array.isArray(data.rows) ? data.rows : [],
    performance: data.performance || undefined,
    timings: Array.isArray(data.timings) ? data.timings : undefined,
  };
}

/**
 * Convierte filas del API a FeatureCollection GeoJSON para @maplibre/maplibre-gl-geocoder.
 *
 * @param {GeocoderRow[]} rows
 * @returns {import("geojson").FeatureCollection}
 */
export function geocoderRowsToFeatureCollection(rows) {
  const features = (rows || [])
    .filter((r) => r && Number.isFinite(r.lng) && Number.isFinite(r.lat))
    .map((r) => {
      const nombre = r.nombre_busqueda || "";
      const tipo = r.tipo || "";
      const placeName = tipo ? `${nombre} — ${tipo}` : nombre;
      const coords = [r.lng, r.lat];

      return {
        type: "Feature",
        id: `${r.tabla_origen || "capa"}:${r.id_origen || nombre}`,
        place_name: placeName,
        text: nombre,
        center: coords,
        geometry: { type: "Point", coordinates: coords },
        properties: {
          nombre_busqueda: nombre,
          tipo,
          cvegeo: r.id_origen || "",
          tabla_origen: r.tabla_origen || "",
          id_origen: r.id_origen || "",
          geom_tipo: r.geom_tipo || "point",
          lng: r.lng,
          lat: r.lat,
        },
      };
    });

  return { type: "FeatureCollection", features };
}

/** Geometría WGS84 de colonia o municipio (para dibujar contorno en el mapa). */
export async function fetchBuscarGeometria(tabla, cvegeo, cveEnt) {
  const tablaLc = String(tabla || "").trim().toLowerCase();
  const clave = String(cvegeo || "").trim();
  if (!tablaLc || !clave) {
    throw new Error("Parámetros de geometría incompletos");
  }
  const ent = cveEnt != null ? String(cveEnt).replace(/\D/g, "").slice(-2) : "";
  let url = `${API_BUSCAR_GEOM_URL}?tabla=${encodeURIComponent(tablaLc)}&cvegeo=${encodeURIComponent(clave)}`;
  if (ent.length === 2) {
    url += `&cve_ent=${encodeURIComponent(ent)}`;
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data.detail === "object" && data.detail?.message) ||
      (typeof data.detail === "string" && data.detail) ||
      data.message ||
      res.statusText ||
      "No se pudo cargar la geometría";
    throw new Error(msg);
  }
  if (!data.ok || !data.feature) {
    throw new Error(data.message || "Geometría no disponible");
  }
  return data;
}
