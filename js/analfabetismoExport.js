/**
 * Exportación PNG / CSV de la vista "Tasa de analfabetismo".
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildAnalfabetismoCsv(payload, selected) {
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
      "Tasa de analfabetismo de la población de 15 años y más por entidad federativa y municipios seleccionados 2010 y 2020",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel]));
  lines.push(row(["Generado", formatStamp(new Date())]));
  lines.push(row([]));

  lines.push(row(["NACIONAL", "2010", "2020", "", "", ""]));
  lines.push(
    row([
      "Valores nacionales (ent 00)",
      payload.tasa_nacional_2010 != null ? payload.tasa_nacional_2010 : "",
      payload.tasa_nacional_2020 != null ? payload.tasa_nacional_2020 : "",
      "",
      "",
      "",
    ])
  );
  lines.push(
    row([
      payload.nom_ent_estatal || "Entidad (estatal=si)",
      payload.tasa_entidad_2010 != null ? payload.tasa_entidad_2010 : "",
      payload.tasa_entidad_2020 != null ? payload.tasa_entidad_2020 : "",
      "",
      "",
      "",
    ])
  );

  lines.push(row([]));
  lines.push(row(["Entidad", "Tasa 2020 (ranking)", "", "", "", ""]));
  for (const s of payload.states || []) {
    lines.push(
      row([
        s.nom_ent || "",
        s.tasa_an2020 != null ? s.tasa_an2020 : "",
        "",
        "",
        "",
        "",
      ])
    );
  }

  lines.push(row([]));
  lines.push(
    row([
      "Estados Unidos Mexicanos",
      payload.tasa_nacional_2020 != null ? payload.tasa_nacional_2020 : "",
      "",
      "",
      "",
      "",
    ])
  );
  lines.push(
    row([
      "Entidad Federativa",
      payload.tasa_entidad_2020 != null ? payload.tasa_entidad_2020 : "",
      "",
      "",
      "",
      "",
    ])
  );

  lines.push(row([]));
  lines.push(row(["Sección", "Clave", "Municipio", "Tasa (tasa_an_red)", "", ""]));

  const pushRows = (label, rows) => {
    for (const r of rows || []) {
      const tag = r.highlight ? `${label} (seleccionado)` : label;
      lines.push(
        row([
          tag,
          r.cve_mun || "",
          r.nom_mun || "",
          r.tasa_an_red != null ? r.tasa_an_red : "",
          "",
          "",
        ])
      );
    }
  };

  pushRows("Mayor tasa (top 5)", payload.top5);
  if (payload.middle) {
    pushRows("Seleccionado", [Object.assign({}, payload.middle, { highlight: true })]);
  }
  pushRows("Menor tasa (bottom 5)", payload.bottom5);

  lines.push(row([]));
  lines.push(
    row([
      "Nota: La información de la gráfica corresponde a datos del Censo de Población y Vivienda 2020.",
    ])
  );
  lines.push(
    row([
      "Fuente: INEGI. Censos de Población y Vivienda 2010 y 2020. Tabulados del cuestionario básico. Educación 4.",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "tasa_analfabetismo",
  targetSelector: "#analfabetismoFullVizRoot .analfabetismo-viz",
  buttons: {
    png: "btnAnalfabetismoExportPng",
    csv: "btnAnalfabetismoExportCsv",
  },
  buildCsv: buildAnalfabetismoCsv,
});

export function attachAnalfabetismoExportButtons() {
  controller.attach();
}

export function setLastAnalfabetismoExport(payload, selected) {
  controller.setData(payload, selected);
}
