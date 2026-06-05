/**
 * Exportación PNG / CSV — Unidades económicas (DENUE).
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildUnidadesEconomicasCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(csvRow(["Unidades económicas por municipios seleccionados 2025"]));
  lines.push(csvRow(["Municipio seleccionado", sel]));
  lines.push(csvRow(["Generado", formatStamp(new Date())]));
  lines.push(csvRow([]));
  lines.push(csvRow(["Sección", "Clave", "Municipio", "Unidades económicas (DENUE)", ""]));

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        csvRow([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.ue_den != null ? r.ue_den : "",
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
      "Fuente: INEGI. Directorio Estadístico Nacional de Unidades Económicas (DENUE) Interactivo, mayo 2025.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "unidades_economicas",
  targetSelector: "#unidadesEconomicasFullVizRoot .poblacion-viz",
  buttons: {
    png: "btnUnidadesEconomicasExportPng",
    csv: "btnUnidadesEconomicasExportCsv",
  },
  buildCsv: buildUnidadesEconomicasCsv,
});

export function attachUnidadesEconomicasExportButtons() {
  controller.attach();
}

export function setLastUnidadesEconomicasExport(payload, selected) {
  controller.setData(payload, selected);
}
