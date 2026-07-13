/**
 * Template data-driven: multi_column_table
 * Columnas = fields[] / table_columns. Estilo del preset (ind-preset-mct).
 */
import {
  appendFooter,
  appendRankingTableSections,
  createRankingTableStack,
  el,
  fieldLabel,
  fieldType,
  fmtValue,
  showError,
  tableColumns,
} from "./domUtil.js";

function colsTemplate(n) {
  const nameFr = n <= 2 ? "minmax(140px, 2fr)" : "minmax(120px, 1.55fr)";
  const rest = Array.from({ length: n }, () => "minmax(72px, 1fr)").join(" ");
  return `${nameFr} ${rest}`;
}

function applyCols(node, n) {
  if (!node) return;
  node.style.setProperty("--ind-mct-cols", colsTemplate(n));
}

function headRow(cols, config) {
  const head = el("div", "ind-mct-head nacim-tbl-row nacim-tbl-row--head");
  applyCols(head, cols.length);
  head.append(el("div", "nacim-tbl-h ind-mct-h", [document.createTextNode("Municipio")]));
  for (const key of cols) {
    head.append(
      el("div", "nacim-tbl-h ind-mct-h", [
        document.createTextNode(fieldLabel(config, key)),
      ])
    );
  }
  return head;
}

function dataRow(row, cols, config, opts = {}) {
  if (!row) return null;
  const { highlight, mid, ent } = opts;
  const cls = [
    "nacim-tbl-row",
    "ind-mct-row",
    highlight ? "nacim-tbl-row--hl ind-mct-row--hl" : "",
    mid ? "nacim-tbl-row--mid ind-mct-row--mid" : "",
    ent ? "nacim-tbl-row--ent ind-mct-row--ent" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const elRow = el("div", cls);
  applyCols(elRow, cols.length);
  const name = row.nom_mun != null ? String(row.nom_mun) : "—";
  elRow.append(
    el("div", ent ? "nacim-tbl-name nacim-tbl-name--ent" : "nacim-tbl-name", [
      document.createTextNode(name),
    ])
  );
  for (const key of cols) {
    elRow.append(
      el("div", "nacim-tbl-val ind-mct-val", [
        document.createTextNode(fmtValue(row[key], fieldType(config, key))),
      ])
    );
  }
  return elRow;
}


export function renderMultiColumnTable(root, payload, config = {}) {
  if (!root) return;
  if (!payload?.ok) {
    showError(root, payload);
    return;
  }

  const cols = tableColumns(config);
  if (!cols.length) {
    showError(root, { message: "Catálogo sin fields/table_columns para la tabla." });
    return;
  }

  const rootClass =
    config.rootClass ||
    config.style?.root_class ||
    "ind-preset-mct";

  const wrap = el("div", `${rootClass} ind-preset-mct`);
  if (config.title) {
    wrap.append(
      el("h3", "ind-preset-mct__title", [document.createTextNode(config.title)])
    );
  }

  const scroll = el("div", "ind-preset-mct__scroll");
  const tbl = el("div", "nacim-tbl ind-preset-mct__tbl");
  applyCols(tbl, cols.length);
  tbl.append(headRow(cols, config));

  if (payload.tabla_nacional) {
    tbl.append(dataRow(payload.tabla_nacional, cols, config, { ent: true }));
  }
  if (payload.nacional && !payload.tabla_nacional) {
    tbl.append(dataRow(payload.nacional, cols, config, { ent: true }));
  }
  if (payload.tabla_entidad) {
    tbl.append(dataRow(payload.tabla_entidad, cols, config, { ent: true }));
  }
  if (payload.entidad && !payload.tabla_entidad) {
    tbl.append(dataRow(payload.entidad, cols, config, { ent: true }));
  }
  if (payload.estatal && !payload.tabla_entidad && !payload.entidad) {
    tbl.append(dataRow(payload.estatal, cols, config, { ent: true }));
  }

  const hasRanking =
    (payload.top5 && payload.top5.length) ||
    payload.middle ||
    (payload.bottom5 && payload.bottom5.length);

  if (hasRanking) {
    tbl.append(el("div", "ind-preset-mct__sep"));
    const rankStack = createRankingTableStack();
    appendRankingTableSections(rankStack, payload, config, (r, opts) =>
      dataRow(r, cols, config, opts)
    );
    tbl.append(rankStack);
  }

  scroll.append(tbl);
  wrap.append(scroll);
  appendFooter(wrap, config, "ind-preset-mct__fuente");
  root.innerHTML = "";
  root.append(wrap);
}
