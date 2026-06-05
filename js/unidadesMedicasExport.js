/**
 * Exportación PNG / CSV de la vista "Unidades médicas en servicio".
 */

import { createExportController, csvRow, csvSeparatorHint, joinCsv } from "./chartExport.js";

function fmtInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

function buildCsv(payload) {
  if (!payload || !payload.ok) return null;

  const COLS = 10;
  const row = (cells) => csvRow(cells, COLS);

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Unidades médicas en servicio de las instituciones del sector público de salud, por municipios seleccionados según institución",
    ])
  );
  lines.push(row(["Fuente: \"CLUES Secretaría de Salud- Diciembre 2025 (depurando bajas)\"."]));
  lines.push(row([]));

  lines.push(
    row([
      "Sección",
      "Clave",
      "Municipio",
      "Total",
      "IMSS",
      "ISSSTE",
      "SEMAR",
      "IMSS BIENESTAR",
      "SSA (ESTATAL)",
      "SSA (FEDERAL)",
    ])
  );

  const pushOne = (section, r) => {
    if (!r) return;
    lines.push(
      row([
        section,
        r.cve_mun || "",
        r.nom_mun || "",
        fmtInt(r.total),
        fmtInt(r.imss),
        fmtInt(r.issste),
        fmtInt(r.semar),
        fmtInt(r.imb),
        fmtInt(r.sesa),
        fmtInt(r.ssa),
      ])
    );
  };

  if (payload.entidad) {
    pushOne("Entidad Federativa", {
      cve_mun: payload.entidad.cve_mun || "12",
      nom_mun: "Entidad Federativa",
      total: payload.entidad.total,
      imss: payload.entidad.imss,
      issste: payload.entidad.issste,
      semar: payload.entidad.semar,
      imb: payload.entidad.imb,
      sesa: payload.entidad.sesa,
      ssa: payload.entidad.ssa,
    });
  }

  for (const r of payload.top5 || []) pushOne("Top 5", r);
  if (payload.middle) pushOne("Seleccionado", payload.middle);
  for (const r of payload.bottom5 || []) pushOne("Bottom 5", r);

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "unidades_medicas",
  targetSelector: "#unidadesMedicasFullVizRoot .unimed-viz",
  buttons: {
    png: "btnUnidadesMedicasExportPng",
    csv: "btnUnidadesMedicasExportCsv",
  },
  buildCsv,
});

export function attachUnidadesMedicasExportButtons() {
  controller.attach();
}

export function setLastUnidadesMedicasExport(payload, selected) {
  controller.setData(payload, selected);
}

