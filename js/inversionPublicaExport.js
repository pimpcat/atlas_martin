/**
 * Exportación PNG / CSV — Inversión pública.
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

const NOTA_CSV =
  "Nota: Este apartado se refiere a la inversión con cobertura estatal y no se muestra el desglose para cada municipio.";
const FUENTE_CSV =
  "Fuente: INEGI. México en cifras, Tabulados de Integración, 2024. Cuadro 24.10.";

function fmtCsvEnt(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "0";
  return String(Math.round(Number(v)));
}

function fmtCsvMun(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "-";
  const n = Math.round(Number(v));
  if (n === 0) return "-";
  return String(n);
}

function pushRowEnt(lines, r) {
  if (!r) return;
  lines.push(
    row([
      r.nom_mun || "",
      fmtCsvEnt(r.total_inv),
      fmtCsvEnt(r.gob_inv),
      fmtCsvEnt(r.desoc_inv),
      fmtCsvEnt(r.desec_inv),
      fmtCsvEnt(r.otras_inv),
    ])
  );
}

function pushRowMun(lines, r) {
  if (!r) return;
  lines.push(
    row([
      r.nom_mun || "",
      fmtCsvMun(r.total_inv),
      fmtCsvMun(r.gob_inv),
      fmtCsvMun(r.desoc_inv),
      fmtCsvMun(r.desec_inv),
      fmtCsvMun(r.otras_inv),
    ])
  );
}

function buildInversionPublicaCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Inversión pública ejercida según finalidad 2023 (Miles de pesos)",
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
      "Total",
      "Gobierno",
      "Desarrollo social",
      "Desarrollo económico",
      "Otras",
    ])
  );

  pushRowEnt(lines, payload.tabla_entidad);
  lines.push(row([]));
  lines.push(row(["Municipios con mayor inversión pública", "", "", "", "", ""]));
  for (const r of payload.top5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRowMun(lines, { ...r, nom_mun: tag });
  }
  if (payload.middle) {
    lines.push(row(["Seleccionado (fuera de top/bottom)", "", "", "", "", ""]));
    pushRowMun(lines, payload.middle);
  }
  lines.push(row([]));
  lines.push(row(["Municipios con menor inversión pública", "", "", "", "", ""]));
  for (const r of payload.bottom5 || []) {
    const tag = r.highlight ? `${r.nom_mun || ""} (seleccionado)` : r.nom_mun || "";
    pushRowMun(lines, { ...r, nom_mun: tag });
  }

  lines.push(row([]));
  lines.push(row([NOTA_CSV, "", "", "", "", ""]));
  lines.push(row([FUENTE_CSV, "", "", "", "", ""]));

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "inversion_publica",
  targetSelector: "#inversionPublicaFullVizRoot .inversion-publica-viz",
  buttons: {
    png: "btnInversionPublicaExportPng",
    csv: "btnInversionPublicaExportCsv",
  },
  buildCsv: buildInversionPublicaCsv,
});

export function attachInversionPublicaExportButtons() {
  controller.attach();
}

export function setLastInversionPublicaExport(payload, selected) {
  controller.setData(payload, selected);
}
