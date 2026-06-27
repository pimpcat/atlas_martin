import { apiUrl } from "./atlasConfig.js";

/**
 * Cliente de descarga KML / SHP del Visor geográfico (GET /api/visor/export).
 */

/**
 * @param {string} layerId
 * @param {'kml'|'shp'} format
 * @param {() => { cve_mun?: string, nomgeo?: string } | null} getMunicipio
 * @param {() => string | null} [getCveMun] — respaldo si getMunicipio no trae cve_mun
 */
export async function downloadVisorLayerExport(
  layerId,
  format,
  getMunicipio,
  getCveMun,
  { skipMunFilter = false } = {},
) {
  const m = typeof getMunicipio === "function" ? getMunicipio() : null;
  let cve = m && m.cve_mun != null ? String(m.cve_mun).trim() : "";
  if (!cve && typeof getCveMun === "function") {
    const raw = getCveMun();
    if (raw != null && String(raw).trim() !== "") {
      cve = String(raw).trim();
    }
  }
  if (!skipMunFilter && !cve) {
    window.alert("Selecciona un municipio en el explorador para exportar la capa.");
    return;
  }

  const url = new URL(apiUrl("/api/visor/export"), window.location.href);
  url.searchParams.set("layer", layerId);
  url.searchParams.set("format", format);
  if (cve) url.searchParams.set("cve_mun", cve);
  const nom = m && m.nomgeo ? String(m.nomgeo).trim() : "";
  if (nom) {
    url.searchParams.set("nom_mun", nom);
  }

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const ct = (res.headers.get("content-type") || "").toLowerCase();

    if (!res.ok) {
      let msg = "No se pudo exportar.";
      if (ct.includes("application/json")) {
        const j = await res.json();
        const d = j && j.detail;
        msg =
          (typeof d === "object" && d && (d.message || d.error)) ||
          (j && (j.message || j.error)) ||
          msg;
      }
      window.alert(String(msg));
      return;
    }

    if (ct.includes("application/json")) {
      const j = await res.json();
      window.alert(j && j.message ? j.message : "Sin datos para exportar.");
      return;
    }

    const blob = await res.blob();
    const disp = res.headers.get("content-disposition") || "";
    let filename = "atlas_export." + (format === "shp" ? "zip" : "kml");
    const mName = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(disp);
    if (mName) {
      try {
        filename = decodeURIComponent(mName[1] || mName[2] || filename);
      } catch {
        filename = mName[2] || mName[1] || filename;
      }
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) {
    console.error("visor export:", e);
    window.alert("No se pudo completar la descarga.");
  }
}
