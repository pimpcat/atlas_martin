/**
 * Exportación PNG / CSV de la vista "Población".
 * Usa el factory genérico de `chartExport.js`.
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildPoblacionCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(csvRow(["Población total por municipios seleccionados 2010 y 2020"]));
  lines.push(csvRow(["Municipio seleccionado", sel]));
  lines.push(csvRow(["Generado", formatStamp(new Date())]));
  lines.push(csvRow([]));
  lines.push(
    csvRow(["Sección", "Clave", "Municipio", "Población 2010", "Población 2020"])
  );

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        csvRow([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.pob_tot_2010 != null ? r.pob_tot_2010 : "",
          r.pob_tot != null ? r.pob_tot : "",
        ])
      );
    }
  };

  pushRows("Top 5", payload.top5);
  if (payload.middle) {
    pushRows("Seleccionado", [
      Object.assign({}, payload.middle, { highlight: true }),
    ]);
  }
  pushRows("Bottom 5", payload.bottom5);

  lines.push(csvRow([]));
  lines.push(
    csvRow([
      "Fuente: INEGI. Censos de Población y Vivienda 2010 y 2020. Tabulados del cuestionario básico. Población 2.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "poblacion",
  targetSelector: "#poblacionFullVizRoot .poblacion-viz",
  buttons: {
    png: "btnPoblacionExportPng",
    csv: "btnPoblacionExportCsv",
  },
  buildCsv: buildPoblacionCsv,
});

export function attachPoblacionExportButtons() {
  controller.attach();
}

export function setLastPoblacionExport(payload, selected) {
  controller.setData(payload, selected);
}
