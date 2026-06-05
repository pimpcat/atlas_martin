/**
 * Exportación PNG / CSV — Instituciones administración pública municipal.
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

const COLS = 5;
const row = (cells) => csvRow(cells, COLS);

const FUENTE_CSV =
  "Fuente: INEGI. Censo Nacional de Gobiernos Municipales y Demarcaciones Territoriales de la Ciudad de México 2023. Datos abiertos.";

function fmtCsv(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "";
  return String(Math.round(Number(v)));
}

function pushRow(lines, r) {
  if (!r) return;
  lines.push(
    row([
      r.nom_mun || "",
      fmtCsv(r.total_inst),
      fmtCsv(r.inst_central),
      fmtCsv(r.inst_parampal),
      fmtCsv(r.personal),
    ])
  );
}

function buildInstitucionesAdminPublicaCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Instituciones de la administración pública municipal (municipios seleccionados 2022)",
      "",
      "",
      "",
      "",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel, "", "", ""]));
  lines.push(row(["Generado", formatStamp(new Date()), "", "", ""]));
  lines.push(row([]));
  lines.push(row(["Municipio", "Total instituciones", "Central", "Paramunicipal", "Personal"]));

  pushRow(lines, payload.tabla_nacional);
  pushRow(lines, payload.tabla_entidad);
  lines.push(row([]));
  lines.push(row(["Municipios con mayor cantidad de instituciones", "", "", "", ""]));
  for (const r of payload.top5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRow(lines, { ...r, nom_mun: tag });
  }
  if (payload.middle) {
    lines.push(row(["Seleccionado (fuera de top/bottom)", "", "", "", ""]));
    pushRow(lines, payload.middle);
  }
  lines.push(row([]));
  lines.push(row(["Municipios con menor cantidad de instituciones", "", "", "", ""]));
  for (const r of payload.bottom5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRow(lines, { ...r, nom_mun: tag });
  }

  lines.push(row([]));
  lines.push(row([FUENTE_CSV, "", "", "", ""]));

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "instituciones_admin_publica_municipal",
  targetSelector: "#institucionesAdminPublicaFullVizRoot .instituciones-admin-publica-viz",
  buttons: {
    png: "btnInstitucionesAdminPublicaExportPng",
    csv: "btnInstitucionesAdminPublicaExportCsv",
  },
  buildCsv: buildInstitucionesAdminPublicaCsv,
});

export function attachInstitucionesAdminPublicaExportButtons() {
  controller.attach();
}

export function setLastInstitucionesAdminPublicaExport(payload, selected) {
  controller.setData(payload, selected);
}
