/**
 * Exportación PNG / CSV — Características económicas.
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

const COLS = 5;
const row = (cells) => csvRow(cells, COLS);

function pushRow(lines, r) {
  if (!r) return;
  lines.push(
    row([
      r.nom_mun || "",
      r.ue != null ? r.ue : "",
      r.pers_ocup != null ? r.pers_ocup : "",
      r.prod_brut != null ? r.prod_brut : "",
      "",
    ])
  );
}

function buildCaracteristicasEconomicasCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Características económicas por municipios seleccionados 2023",
      "",
      "",
      "",
      "",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel, "", "", ""]));
  lines.push(row(["Generado", formatStamp(new Date()), "", "", ""]));
  lines.push(row([]));
  lines.push(
    row([
      "Municipio",
      "Unidades económicas",
      "Personal ocupado total",
      "Producción bruta total (millones de pesos)",
      "",
    ])
  );

  pushRow(lines, payload.tabla_nacional);
  pushRow(lines, payload.tabla_entidad);
  lines.push(row([]));
  lines.push(row(["Municipios con mayor producción", "", "", "", ""]));
  for (const r of payload.top5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRow(lines, { ...r, nom_mun: tag });
  }
  if (payload.middle) {
    lines.push(row(["Seleccionado (fuera de top/bottom)", "", "", "", ""]));
    pushRow(lines, payload.middle);
  }
  lines.push(row([]));
  lines.push(row(["Municipios con menor producción", "", "", "", ""]));
  for (const r of payload.bottom5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRow(lines, { ...r, nom_mun: tag });
  }

  lines.push(row([]));
  lines.push(
    row([
      "Fuente: INEGI. Censos Económicos 2024. SAIC: https://www.inegi.org.mx/app/saic/default.html",
      "",
      "",
      "",
      "",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "caracteristicas_economicas",
  targetSelector: "#caracteristicasEconomicasFullVizRoot .caracteristicas-economicas-viz",
  buttons: {
    png: "btnCaracteristicasEconomicasExportPng",
    csv: "btnCaracteristicasEconomicasExportCsv",
  },
  buildCsv: buildCaracteristicasEconomicasCsv,
});

export function attachCaracteristicasEconomicasExportButtons() {
  controller.attach();
}

export function setLastCaracteristicasEconomicasExport(payload, selected) {
  controller.setData(payload, selected);
}
