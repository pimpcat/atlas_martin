/**
 * Exportación PNG / CSV de la comparativa de superficie (pestaña Datos Geográficos).
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildSuperficieCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(csvRow(["% del territorio estatal por municipio"]));
  lines.push(csvRow(["Municipio seleccionado", sel]));
  lines.push(csvRow(["Generado", formatStamp(new Date())]));
  lines.push(csvRow([]));
  lines.push(csvRow(["Sección", "Clave", "Municipio", "% superficie estatal", ""]));

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        csvRow([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.porcsup != null ? r.porcsup : "",
          "",
        ])
      );
    }
  };

  pushRows("Top 5", payload.top5);
  if (payload.middle) {
    pushRows("Seleccionado", [Object.assign({}, payload.middle, { highlight: true })]);
  }
  pushRows("Bottom 5", payload.bottom5);

  lines.push(csvRow([]));
  lines.push(
    csvRow([
      "Fuente: atlas.12mun · porcentaje de superficie respecto al territorio del estado de Guerrero.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "superficie_municipal",
  targetSelector: "#geoSuperficieVizRoot .poblacion-viz",
  buttons: {
    png: "btnGeoSuperficieExportPng",
    csv: "btnGeoSuperficieExportCsv",
  },
  buildCsv: buildSuperficieCsv,
});

export function attachSuperficieExportButtons() {
  controller.attach();
}

export function setLastSuperficieExport(payload, selected) {
  controller.setData(payload, selected);
}
