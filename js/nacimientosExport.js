/**
 * Exportación PNG / CSV de la vista "Nacimientos".
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildNacimientosCsv(payload, selected) {
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
      "Nacimientos registrados por entidad federativa de residencia habitual de la madre y municipios seleccionados 2024",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel]));
  lines.push(row(["Generado", formatStamp(new Date())]));
  lines.push(row([]));

  lines.push(row(["Entidad", "Nacimientos 2024", "", "", "", ""]));
  for (const s of payload.states || []) {
    lines.push(
      row([
        s.nom_ent || "",
        s.naci_24 != null ? s.naci_24 : "",
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
      "por_naci24 (estatal=si)",
      payload.por_entidad_guerrero != null ? payload.por_entidad_guerrero : "",
      "",
      "",
      "",
      "",
    ])
  );

  lines.push(row([]));
  lines.push(row(["Sección", "Clave", "Municipio", "Porcentaje nacimientos", "", ""]));

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        row([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.por_naci_2024_redo != null ? r.por_naci_2024_redo : "",
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
      "Fuente: INEGI. Estadísticas de Natalidad 2024. Consulta interactiva de datos.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "nacimientos",
  targetSelector: "#nacimientosFullVizRoot .nacimientos-viz",
  buttons: {
    png: "btnNacimientosExportPng",
    csv: "btnNacimientosExportCsv",
  },
  buildCsv: buildNacimientosCsv,
});

export function attachNacimientosExportButtons() {
  controller.attach();
}

export function setLastNacimientosExport(payload, selected) {
  controller.setData(payload, selected);
}
