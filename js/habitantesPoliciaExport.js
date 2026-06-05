/**
 * Exportación PNG / CSV — Habitantes por policía.
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildHabitantesPoliciaCsv(payload, selected) {
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
      "Número de habitantes por policía en municipios seleccionados 2022",
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
      "Habitantes por policía",
      "Población",
      "Policía preventiva",
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
          r.habxpol != null ? r.habxpol : "",
          r.pob_tot != null ? r.pob_tot : "",
          r.pol_prev != null ? r.pol_prev : "",
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
      "Nota: El número de habitantes por policía preventivo se obtuvo de dividir el total de la población del municipio entre el número de policías preventivos del municipio correspondiente al 31 de diciembre de 2022.",
    ])
  );
  lines.push(
    row([
      "Fuente: INEGI. Censo Nacional de Gobiernos Municipales y Demarcaciones Territoriales de la Ciudad de México 2023. Datos Abiertos. Censo de Población y Vivienda 2020. Tabulados del cuestionario básico.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "habitantes_por_policia",
  targetSelector: "#habitantesPoliciaFullVizRoot .habitantes-policia-viz",
  buttons: {
    png: "btnHabitantesPoliciaExportPng",
    csv: "btnHabitantesPoliciaExportCsv",
  },
  buildCsv: buildHabitantesPoliciaCsv,
});

export function attachHabitantesPoliciaExportButtons() {
  controller.attach();
}

export function setLastHabitantesPoliciaExport(payload, selected) {
  controller.setData(payload, selected);
}
