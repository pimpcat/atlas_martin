/**
 * Exportación PNG / CSV — Superficie con agricultura.
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

const COLS = 6;
const row = (cells) => csvRow(cells, COLS);

function pushRow(lines, r) {
  if (!r) return;
  lines.push(
    row([
      r.nom_mun || "",
      r.sup_cieloabtot != null ? r.sup_cieloabtot : "",
      r.sup_sembtot != null ? r.sup_sembtot : "",
      r.sup_sembtemp != null ? r.sup_sembtemp : "",
      r.sup_sembrieg != null ? r.sup_sembrieg : "",
      "",
    ])
  );
}

function buildSuperficieAgriculturaCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Superficie total con agricultura a cielo abierto (municipios seleccionados 2016)",
      "",
      "",
      "",
      "",
      "",
    ])
  );
  lines.push(row(["Municipio seleccionado", sel, "", "", "", ""]));
  lines.push(row(["Generado", formatStamp(new Date()), "", "", "", ""]));
  lines.push(row([]));
  lines.push(
    row([
      "Municipio",
      "Superficie total con agricultura a cielo abierto (ha)",
      "Total (sembrada)",
      "Temporal",
      "De riego",
      "",
    ])
  );

  pushRow(lines, payload.tabla_nacional);
  pushRow(lines, payload.tabla_entidad);
  lines.push(row([]));
  lines.push(row(["Municipios con mayor superficie de riego", "", "", "", "", ""]));
  for (const r of payload.top5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRow(lines, { ...r, nom_mun: tag });
  }
  if (payload.middle) {
    lines.push(row(["Seleccionado (fuera de top/bottom)", "", "", "", "", ""]));
    pushRow(lines, payload.middle);
  }
  lines.push(row([]));
  lines.push(row(["Municipios con menor superficie de riego", "", "", "", "", ""]));
  for (const r of payload.bottom5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRow(lines, { ...r, nom_mun: tag });
  }

  lines.push(row([]));
  lines.push(
    row([
      "1 La superficie sembrada total por entidad y por municipio corresponde solo a la superficie de los cultivos seleccionados, no a la total de la entidad.",
      "",
      "",
      "",
      "",
      "",
    ])
  );
  lines.push(
    row([
      "Fuente: INEGI. Actualización del marco censal agropecuario 2016. Cuadro AMCA_2016_07.",
      "",
      "",
      "",
      "",
      "",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "superficie_agricultura",
  targetSelector: "#superficieAgriculturaFullVizRoot .superficie-agricultura-viz",
  buttons: {
    png: "btnSuperficieAgriculturaExportPng",
    csv: "btnSuperficieAgriculturaExportCsv",
  },
  buildCsv: buildSuperficieAgriculturaCsv,
});

export function attachSuperficieAgriculturaExportButtons() {
  controller.attach();
}

export function setLastSuperficieAgriculturaExport(payload, selected) {
  controller.setData(payload, selected);
}
