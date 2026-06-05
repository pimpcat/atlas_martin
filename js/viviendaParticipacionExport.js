/**
 * Exportación PNG / CSV — Participación viviendas particulares habitadas.
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildVivPartCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const COLS = 6;
  const row = (cells) => csvRow(cells, COLS);

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Participación porcentual de viviendas particulares habitadas y tasa de crecimiento por municipios seleccionados 2020",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel]));
  lines.push(row(["Generado", formatStamp(new Date())]));
  lines.push(row([]));
  lines.push(
    row([
      "Sección",
      "Clave",
      "Municipio",
      "Participación % viviendas habitadas",
      "Tasa 2000-2010",
      "Tasa 2010-2020",
    ])
  );

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        row([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.part_por_vivh != null ? r.part_por_vivh : "",
          r.creci_00_10 != null ? r.creci_00_10 : "",
          r.creci_10_20 != null ? r.creci_10_20 : "",
        ])
      );
    }
  };

  pushRows("Top 5", payload.top5);
  if (payload.middle) {
    pushRows("Seleccionado", [Object.assign({}, payload.middle, { highlight: true })]);
  }
  pushRows("Bottom 5", payload.bottom5);

  lines.push(row([]));
  lines.push(row(["Resumen tasas (tabla derecha)"]));
  lines.push(row(["Etiqueta", "2000-2010", "2010-2020", "", "", ""]));
  const nat = payload.nacional;
  lines.push(
    row([
      nat && nat.nom_mun ? nat.nom_mun : "Nacional",
      nat && nat.creci_00_10 != null ? nat.creci_00_10 : "",
      nat && nat.creci_10_20 != null ? nat.creci_10_20 : "",
      "",
      "",
      "",
    ])
  );
  const est = payload.estatal;
  lines.push(
    row([
      est && est.nom_mun ? est.nom_mun : "Estatal",
      est && est.creci_00_10 != null ? est.creci_00_10 : "",
      est && est.creci_10_20 != null ? est.creci_10_20 : "",
      "",
      "",
      "",
    ])
  );

  lines.push(row([]));
  lines.push(
    row([
      "Fuente: INEGI. XII Censo General de Población y Vivienda 2000. Censos de Población y Vivienda 2010 y 2020. Tabulados del Cuestionario Básico. Vivienda 4.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "vivienda_participacion_vivh",
  targetSelector: "#viviendaParticipacionFullVizRoot .crecimiento-viz",
  buttons: {
    png: "btnViviendaParticipacionExportPng",
    csv: "btnViviendaParticipacionExportCsv",
  },
  buildCsv: buildVivPartCsv,
});

export function attachViviendaParticipacionExportButtons() {
  controller.attach();
}

export function setLastViviendaParticipacionExport(payload, selected) {
  controller.setData(payload, selected);
}
