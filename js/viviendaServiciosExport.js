/**
 * Exportación PNG / CSV — Servicios en viviendas particulares habitadas.
 */

import {
  createExportController,
  csvRow,
  csvSeparatorHint,
  formatStamp,
  joinCsv,
} from "./chartExport.js";

function buildViviendaServiciosCsv(payload, selected) {
  if (!payload || !payload.ok) return null;

  const sel =
    selected && (selected.nomgeo || selected.cve_mun)
      ? `${selected.nomgeo || ""} (${selected.cve_mun || ""})`.trim()
      : "—";

  const COLS = 5;
  const row = (cells) => csvRow(cells, COLS);

  const lines = [];
  lines.push(csvSeparatorHint());
  lines.push(
    row([
      "Porcentaje de viviendas particulares habitadas según disponibilidad de principales servicios 2020",
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
      "Servicio",
      "Nacional %",
      "Estatal %",
      "Municipio %",
      "",
    ])
  );

  const nat = payload.nacional || {};
  const est = payload.estatal || {};
  const mun = payload.municipio || {};

  const pushSvc = (label, k) => {
    lines.push(
      row([
        label,
        nat[k] != null ? nat[k] : "",
        est[k] != null ? est[k] : "",
        mun[k] != null ? mun[k] : "",
        "",
      ])
    );
  };

  pushSvc("Electricidad", "por_redo_ener");
  pushSvc("Agua entubada", "por_redo_agua");
  pushSvc("Drenaje", "por_redo_drenaje");

  lines.push(row([]));
  lines.push(
    row([
      "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados interactivos.",
      "",
      "",
      "",
      "",
    ])
  );

  return joinCsv(lines);
}

const controller = createExportController({
  filenamePrefix: "servicios_viviendas_habitadas",
  targetSelector: "#viviendaServiciosPngRegion",
  buttons: {
    png: "btnViviendaServiciosExportPng",
    csv: "btnViviendaServiciosExportCsv",
  },
  buildCsv: buildViviendaServiciosCsv,
});

export function attachViviendaServiciosExportButtons() {
  controller.attach();
}

export function setLastViviendaServiciosExport(payload, selected) {
  controller.setData(payload, selected);
}
