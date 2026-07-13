/**
 * Template data-driven: ranking_with_rates_table
 * Barras (bar_metrics[0]) + columnas auxiliares (table_metrics).
 * Con tabla: filas emparejadas gráfico↔tabla (misma altura por municipio).
 */
import {
  appendFooter,
  applyBarColors,
  el,
  fieldLabel,
  fieldType,
  fmtValue,
  maxMetric,
  rankingBadge,
  resolveRankingSize,
  applyRankingSizeCss,
  showError,
} from "./domUtil.js";

function setTableCols(host, metrics, config) {
  const n = Math.max(1, metrics.length);
  host.style.setProperty("--rwrt-cols", String(n));
  let maxLen = 0;
  for (const key of metrics) {
    maxLen = Math.max(maxLen, String(fieldLabel(config, key) || key).length);
  }
  const rem = Math.min(9.5, Math.max(5.75, maxLen * 0.52));
  host.style.setProperty("--rwrt-col-w", `${rem}rem`);
}

function barRow(name, value, maxV, type, highlight) {
  const num = Number(value);
  const w =
    maxV > 0 && Number.isFinite(num) ? Math.round((num / maxV) * 100) : 0;
  const row = el("div", `crec-bar-row${highlight ? " crec-bar-row--hl" : ""}`);
  row.append(
    el("div", "crec-mun-name", [
      document.createTextNode(name && String(name).trim() ? String(name) : "—"),
    ])
  );
  const track = el("div", "crec-bar-track");
  const fill = el("div", "crec-bar-fill");
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);
  row.append(track);
  row.append(
    el("div", "crec-bar-num", [document.createTextNode(fmtValue(value, type))])
  );
  return row;
}

function tableRow(row, metrics, config, highlight) {
  const elRow = el("div", `crec-tbl-row${highlight ? " crec-tbl-row--hl" : ""}`);
  for (const key of metrics) {
    elRow.append(
      el("div", "crec-tbl-cell", [
        document.createTextNode(fmtValue(row?.[key], fieldType(config, key))),
      ])
    );
  }
  return elRow;
}

function chartBox(kind, badge, rows, barKey, maxV, config) {
  const box = el("div", `crec-box crec-box--${kind}`);
  const body = el("div", "crec-box-body");
  for (const r of rows || []) {
    body.append(
      barRow(r.nom_mun, r[barKey], maxV, fieldType(config, barKey), !!r.highlight)
    );
  }
  box.append(body);
  box.append(el("div", "crec-box-badge", [document.createTextNode(badge)]));
  return box;
}

function tableSection(kind, rows, metrics, config) {
  const sec = el("div", `crec-tbl-section crec-tbl-section--${kind}`);
  for (const r of rows || []) {
    sec.append(tableRow(r, metrics, config, !!r.highlight));
  }
  return sec;
}

function buildTableHead(tableMetrics, config) {
  const head = el("div", "rwrt-table-head crec-layout__head-table");
  head.append(
    el("div", "crec-tbl-supertitle", [
      document.createTextNode(config.tableTitle || "Detalle"),
    ])
  );
  const headRow = el("div", "crec-tbl-headers");
  for (const key of tableMetrics) {
    const th = el("div", "crec-tbl-header");
    th.append(
      el("span", "crec-tbl-header__text", [
        document.createTextNode(fieldLabel(config, key)),
      ])
    );
    headRow.append(th);
  }
  head.append(headRow);
  return head;
}

function renderChartOnly(root, payload, config, barKey, maxV, rankN) {
  const rootClass = config.rootClass || "crecimiento-viz";
  const wrap = el("div", `${rootClass} crecimiento-viz ind-preset-rwrt`);
  applyBarColors(wrap, config.style || {});
  applyRankingSizeCss(wrap, config, payload);

  if (config.title) {
    wrap.append(
      el("h3", "crecimiento-viz-title", [document.createTextNode(config.title)])
    );
  }

  const chartStack = el("div", "crec-chart-stack");
  chartStack.append(
    chartBox("top", rankingBadge("top", rankN), payload.top5, barKey, maxV, config)
  );
  const middleRow = payload.middle
    ? Object.assign({}, payload.middle, { highlight: true })
    : null;
  if (middleRow) {
    const mid = el("div", "crec-middle");
    mid.append(
      barRow(
        middleRow.nom_mun,
        middleRow[barKey],
        maxV,
        fieldType(config, barKey),
        true
      )
    );
    chartStack.append(mid);
  }
  chartStack.append(
    chartBox("bottom", rankingBadge("bottom", rankN), payload.bottom5, barKey, maxV, config)
  );
  wrap.append(chartStack);
  appendFooter(wrap, config, "crecimiento-viz-fuente");
  root.innerHTML = "";
  root.append(wrap);
}

export function renderRankingWithRatesTable(root, payload, config = {}) {
  if (!root) return;
  if (!payload?.ok) {
    showError(root, payload, "crecimiento-viz-error");
    return;
  }

  const barKey = config.barMetrics?.[0] || config.sortBy;
  const tableMetrics = config.tableMetrics?.length
    ? config.tableMetrics
    : (config.fieldKeys || []).filter((k) => k !== barKey);

  if (!barKey) {
    showError(root, {
      message: "Catálogo sin bar_metrics/sort_by para este preset.",
    });
    return;
  }

  const maxV = maxMetric(payload, barKey);
  const rankN = resolveRankingSize(config, payload);
  const middleRow = payload.middle
    ? Object.assign({}, payload.middle, { highlight: true })
    : null;

  if (!tableMetrics.length) {
    renderChartOnly(root, payload, config, barKey, maxV, rankN);
    return;
  }

  const rootClass = config.rootClass || "crecimiento-viz";
  const wrap = el("div", `${rootClass} crecimiento-viz ind-preset-rwrt ind-preset-rwrt--paired`);
  applyBarColors(wrap, config.style || {});
  applyRankingSizeCss(wrap, config, payload);
  setTableCols(wrap, tableMetrics, config);

  const layout = el("div", "crec-layout crec-layout--with-table crec-layout--paired");

  if (config.title) {
    const headChart = el("div", "crec-layout__head-chart");
    headChart.append(
      el("h3", "crecimiento-viz-title", [document.createTextNode(config.title)])
    );
    layout.append(headChart);
  }

  layout.append(buildTableHead(tableMetrics, config));

  const chartCol = el("div", "crec-layout__chart crec-side crec-side--chart");
  const chartStack = el("div", "crec-chart-stack");
  chartStack.append(
    chartBox("top", rankingBadge("top", rankN), payload.top5, barKey, maxV, config)
  );
  if (middleRow) {
    const mid = el("div", "crec-middle");
    mid.append(
      barRow(
        middleRow.nom_mun,
        middleRow[barKey],
        maxV,
        fieldType(config, barKey),
        true
      )
    );
    chartStack.append(mid);
  }
  chartStack.append(
    chartBox("bottom", rankingBadge("bottom", rankN), payload.bottom5, barKey, maxV, config)
  );
  chartCol.append(chartStack);
  layout.append(chartCol);

  const tableCol = el("div", "crec-layout__table crec-side crec-side--table");
  const tableStack = el("div", "crec-table-stack crec-table-stack--sync");
  tableStack.append(tableSection("top", payload.top5, tableMetrics, config));
  if (middleRow) {
    const sec = el("div", "crec-tbl-section crec-tbl-section--middle");
    sec.append(tableRow(middleRow, tableMetrics, config, true));
    tableStack.append(sec);
  }
  tableStack.append(tableSection("bottom", payload.bottom5, tableMetrics, config));
  tableCol.append(tableStack);
  layout.append(tableCol);

  wrap.append(layout);
  appendFooter(wrap, config, "crecimiento-viz-fuente");
  root.innerHTML = "";
  root.append(wrap);
}
