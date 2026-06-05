/**
 * Exportación PNG / CSV de la vista "Edad mediana".
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildEdadMedianaCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(csvRow(["Edad mediana por municipio (años)"]));
  lines.push(csvRow(["Municipio seleccionado", sel]));
  lines.push(csvRow(["Generado", formatStamp(new Date())]));
  lines.push(csvRow([]));
  lines.push(csvRow(["Sección", "Clave", "Municipio", "Edad mediana", ""]));

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        csvRow([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.edad_mediana != null ? r.edad_mediana : "",
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
      "Nota: Esta medida divide la distribución por edades de una población determinada en dos grupos numéricamente iguales; la mitad de los casos quedan por abajo de la mediana y la otra mitad por encima. Para su cálculo se excluye a la población con edad no especificada.",
    ])
  );
  lines.push(
    csvRow([
      "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados del cuestionario básico. Población 4.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "edad_mediana",
  targetSelector: "#edadMedianaFullVizRoot .poblacion-viz",
  buttons: {
    png: "btnEdadMedianaExportPng",
    csv: "btnEdadMedianaExportCsv",
  },
  buildCsv: buildEdadMedianaCsv,
});

export function attachEdadMedianaExportButtons() {
  controller.attach();
}

export function setLastEdadMedianaExport(payload, selected) {
  controller.setData(payload, selected);
}
