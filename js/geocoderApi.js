/**

 * Cliente HTTP — Buscador geográfico offline (FastAPI / PostGIS).

 *

 * Endpoint:

 *   GET /api/buscar?q={texto}&cve_mun={clave}

 *

 * @see app_api/geocoder.py  Consulta UNION ALL sobre c_loc_punto, c_col_ase (por municipio)

 * @see visorGeocoder.js     MaplibreGeocoder + forwardGeocode

 */

import { apiUrl } from "./atlasConfig.js";



const API_BUSCAR_URL = apiUrl("/api/buscar");



/**

 * @typedef {object} GeocoderRow

 * @property {string} nombre_busqueda

 * @property {string} tipo

 * @property {string} tabla_origen

 * @property {string} id_origen

 * @property {number} lng

 * @property {number} lat

 */



/**

 * @param {string} q

 * @param {string | null | undefined} cveMun Clave municipal 3 dígitos (visor).

 * @returns {Promise<{ ok: boolean, query: string, count: number, rows: GeocoderRow[] }>}

 */

export async function fetchBuscarGeocoder(q, cveMun) {

  const term = String(q || "").trim();

  if (term.length < 2) {

    return { ok: true, query: term, count: 0, rows: [] };

  }

  const cve = cveMun != null ? String(cveMun).trim() : "";

  let url = `${API_BUSCAR_URL}?q=${encodeURIComponent(term)}`;
  if (cve) {
    url += `&cve_mun=${encodeURIComponent(cve)}`;
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });

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
          lng: r.lng,
          lat: r.lat,
        },

      };

    });

  return { type: "FeatureCollection", features };

}


