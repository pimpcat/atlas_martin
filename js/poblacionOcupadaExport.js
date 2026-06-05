/**
 * Exportación PNG / CSV — Población ocupada (entidades + tabla municipal).
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

const COLS = 8;
const row = (cells) => csvRow(cells, COLS);

function pushMunRow(lines, r) {
  if (!r) return;
  lines.push(
    row([
      r.nom_mun || "",
      r.ocupada != null ? r.ocupada : "",
      r.sin_escol != null ? r.sin_escol : "",
      r.primaria != null ? r.primaria : "",
      r.secund != null ? r.secund : "",
      r.med_sup != null ? r.med_sup : "",
      r.superior != null ? r.superior : "",
      r.no_esp != null ? r.no_esp : "",
    ])
  );
}

function buildPoblacionOcupadaCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Población ocupada por entidad federativa según escolaridad y municipios seleccionados 2020",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel, "", "", "", "", "", ""]));
  lines.push(row(["Generado", formatStamp(new Date()), "", "", "", "", "", ""]));
  lines.push(row([]));

  lines.push(row(["Entidad", "PEA ocupada", "", "", "", "", "", ""]));
  for (const s of payload.states || []) {
    lines.push(
      row([
        s.nom_ent || "",
        s.pea_ocup != null ? s.pea_ocup : "",
        "",
        "",
        "",
        "",
        "",
        "",
      ])
    );
  }

  lines.push(row([]));
  lines.push(
    row([
      "Municipio",
      "PEA Ocupada",
      "Sin escolaridad",
      "Primaria",
      "Secundaria",
      "Media superior",
      "Superior",
      "No especificado",
    ])
  );

  pushMunRow(lines, payload.tabla_nacional);
  pushMunRow(lines, payload.tabla_entidad);
  lines.push(row([]));
  lines.push(row(["Top 5 mayor población ocupada", "", "", "", "", "", "", ""]));
  for (const r of payload.top5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushMunRow(lines, { ...r, nom_mun: tag });
  }
  if (payload.middle) {
    lines.push(row(["Seleccionado (fuera de top/bottom)", "", "", "", "", "", "", ""]));
    pushMunRow(lines, payload.middle);
  }
  lines.push(row([]));
  lines.push(row(["Bottom 5 menor población ocupada", "", "", "", "", "", "", ""]));
  for (const r of payload.bottom5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushMunRow(lines, { ...r, nom_mun: tag });
  }

  lines.push(row([]));
  lines.push(
    row([
      "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados del Cuestionario Básico. Características económicas 4.",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "poblacion_ocupada_escolaridad",
  targetSelector: "#poblacionOcupadaFullVizRoot .poblacion-ocupada-viz",
  buttons: {
    png: "btnPoblacionOcupadaExportPng",
    csv: "btnPoblacionOcupadaExportCsv",
  },
  buildCsv: buildPoblacionOcupadaCsv,
});

export function attachPoblacionOcupadaExportButtons() {
  controller.attach();
}

export function setLastPoblacionOcupadaExport(payload, selected) {
  controller.setData(payload, selected);
}
