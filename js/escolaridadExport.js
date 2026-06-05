/**
 * Exportación PNG / CSV de la vista "Grado promedio de escolaridad".
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildEscolaridadCsv(payload, selected) {
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
      "Grado promedio de escolaridad por entidad federativa y municipios seleccionados 2020",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel]));
  lines.push(row(["Generado", formatStamp(new Date())]));
  lines.push(row([]));

  lines.push(row(["Entidad", "Grado promedio", "", "", "", ""]));
  for (const s of payload.states || []) {
    lines.push(
      row([
        s.nom_ent || "",
        s.graproes != null ? s.graproes : "",
        "",
        "",
        "",
        "",
      ])
    );
  }

  lines.push(row([]));
  lines.push(row(["Estados Unidos Mexicanos", payload.grap_nacional != null ? payload.grap_nacional : "", "", "", "", ""]));
  lines.push(row(["Entidad Federativa", payload.grap_entidad != null ? payload.grap_entidad : "", "", "", "", ""]));

  lines.push(row([]));
  lines.push(row(["Sección", "Clave", "Municipio", "Grado promedio", "", ""]));

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        row([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.graproes != null ? r.graproes : "",
          "",
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

  lines.push(row([]));
  lines.push(
    row([
      "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados del cuestionario básico. Educación 14. Principales resultados por localidad (ITER).",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "grado_promedio_escolaridad",
  targetSelector: "#escolaridadFullVizRoot .escolaridad-viz",
  buttons: {
    png: "btnEscolaridadExportPng",
    csv: "btnEscolaridadExportCsv",
  },
  buildCsv: buildEscolaridadCsv,
});

export function attachEscolaridadExportButtons() {
  controller.attach();
}

export function setLastEscolaridadExport(payload, selected) {
  controller.setData(payload, selected);
}
