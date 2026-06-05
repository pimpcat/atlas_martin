/**
 * Exportación PNG / CSV de la vista "Defunciones".
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildDefuncionesCsv(payload, selected) {
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
      "Defunciones generales por entidad federativa de residencia habitual del fallecido y municipios seleccionados 2024",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel]));
  lines.push(row(["Generado", formatStamp(new Date())]));
  lines.push(row([]));

  lines.push(row(["Entidad", "Defunciones", "", "", "", ""]));
  for (const s of payload.states || payload.entities || []) {
    lines.push(
      row([
        s.nom_ent || "",
        s.defu != null ? s.defu : "",
        "",
        "",
        "",
        "",
      ])
    );
  }

  lines.push(row([]));
  lines.push(row(["Entidad federativa Guerrero — % nacional", "", "", "", "", ""]));
  lines.push(
    row([
      "% respecto al total nacional (estatal=si)",
      payload.por_entidad_guerrero != null ? payload.por_entidad_guerrero : "",
      "",
      "",
      "",
      "",
    ])
  );

  lines.push(row([]));
  lines.push(row(["Sección", "Clave", "Municipio", "Porcentaje defunciones", "", ""]));

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        row([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.por_def_2024_redo != null ? r.por_def_2024_redo : "",
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
      "¹ Porcentaje de la Entidad Federativa respecto al total nacional.",
    ])
  );
  lines.push(
    row([
      "Fuente: INEGI. Estadísticas de mortalidad 2024. Consulta interactiva de datos.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "defunciones",
  targetSelector: "#defuncionesFullVizRoot .defunciones-viz",
  buttons: {
    png: "btnDefuncionesExportPng",
    csv: "btnDefuncionesExportCsv",
  },
  buildCsv: buildDefuncionesCsv,
});

export function attachDefuncionesExportButtons() {
  controller.attach();
}

export function setLastDefuncionesExport(payload, selected) {
  controller.setData(payload, selected);
}
