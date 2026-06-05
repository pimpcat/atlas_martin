/**
 * Exportación PNG / CSV de la vista "Población y crecimiento".
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildCrecimientoCsv(payload, selected) {
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
      "Distribución porcentual de población y tasa de crecimiento anual por municipios seleccionados 2020",
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
      "Distribución % 2020",
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
          r.dist_porc != null ? r.dist_porc : "",
          r.creci_00_10 != null ? r.creci_00_10 : "",
          r.creci_10_20 != null ? r.creci_10_20 : "",
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

  lines.push(row([]));
  lines.push(
    row([
      "Fuente: INEGI. Censos de Población y Vivienda 2000, 2010 y 2020. Tabulados del cuestionario básico. Población 2.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "poblacion_crecimiento",
  targetSelector: "#crecimientoFullVizRoot .crecimiento-viz",
  buttons: {
    png: "btnCrecimientoExportPng",
    csv: "btnCrecimientoExportCsv",
  },
  buildCsv: buildCrecimientoCsv,
});

export function attachCrecimientoExportButtons() {
  controller.attach();
}

export function setLastCrecimientoExport(payload, selected) {
  controller.setData(payload, selected);
}
