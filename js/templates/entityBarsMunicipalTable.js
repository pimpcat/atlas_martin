/**
 * Template data-driven: entity_bars_municipal_table
 * Izquierda: barras por entidad (states + state_metric).
 * Derecha: tabla municipal (fields municipales).
 * Layout CSS: .nacimientos-viz / .nacim-* (mismo que el Viz original).
 */
import {
  appendFooter,
  applyBarColors,
  applyEntityChartLayout,
  appendRankingTableSections,
  createRankingTableStack,
  el,
  fieldLabel,
  fieldType,
  fmtValue,
  gridStyle,
  maxMetric,
  showError,
  tableColumns,
} from "./domUtil.js";

function isNacionalRow(s) {
  if (s?.nacional) return true;
  if (!s) return false;
  const nom = String(s.nom_ent || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (nom === "nacional" || nom === "estados unidos mexicanos") return true;
  const ent = String(s.ent || "").replace(/\D/g, "");
  return ent.length > 0 && /^0+$/.test(ent);
}

function stateBarRow(name, value, maxV, type, opts = {}) {
  const { nacional, estatalSi } = opts;
  const num = Number(value);
  const w =
    maxV > 0 && Number.isFinite(num) ? Math.round((num / maxV) * 100) : 0;
  let rowCls = "nacim-state-row";
  let fillCls = "nacim-state-fill";
  if (nacional) {
    rowCls += " nacim-state-row--nat";
    fillCls += " nacim-state-fill--nat";
  } else if (estatalSi) {
    rowCls += " nacim-state-row--gue";
    fillCls += " nacim-state-fill--gue";
  }
  const row = el("div", rowCls);
  const raw = name && String(name).trim() ? String(name) : "—";
  const lab = el("div", "nacim-state-name", [document.createTextNode(raw)]);
  if (raw !== "—") lab.setAttribute("title", raw);
  const track = el("div", "nacim-state-track");
  const fill = el("div", fillCls);
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);
  row.append(lab, track);
  row.append(
    el("div", "nacim-state-num", [document.createTextNode(fmtValue(value, type))])
  );
  return row;
}

function munRow(row, cols, config, style, opts = {}) {
  if (!row) return null;
  const { highlight, mid, ent } = opts;
  const cls = [
    "nacim-tbl-row",
    highlight ? "nacim-tbl-row--hl" : "",
    mid ? "nacim-tbl-row--mid" : "",
    ent ? "nacim-tbl-row--ent" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const elRow = el("div", cls);
  Object.assign(elRow.style, style);
  const nameCls = ent ? "nacim-tbl-name nacim-tbl-name--ent" : "nacim-tbl-name";
  elRow.append(
    el("div", nameCls, [
      document.createTextNode(row.nom_mun != null ? String(row.nom_mun) : "—"),
    ])
  );
  for (const key of cols) {
    elRow.append(
      el("div", "nacim-tbl-val", [
        document.createTextNode(fmtValue(row[key], fieldType(config, key))),
      ])
    );
  }
  return elRow;
}

/** Resuelve la métrica de barras estatales desde el payload real. */
function resolveStateKey(states, config) {
  const candidates = [
    config.stateMetric,
    config.barMetrics?.[0],
    ...(config.fieldKeys || []),
    config.sortBy,
  ].filter(Boolean);
  if (!states?.length) return candidates[0] || null;
  const sample = states.find((s) => s && typeof s === "object") || states[0];
  for (const key of candidates) {
    if (sample[key] != null && sample[key] !== "") return key;
  }
  for (const [k, v] of Object.entries(sample)) {
    if (["ent", "nom_ent", "estatal_si", "nacional", "highlight"].includes(k)) {
      continue;
    }
    if (v != null && Number.isFinite(Number(v))) return k;
  }
  return candidates[0] || null;
}

export function renderEntityBarsMunicipalTable(root, payload, config = {}) {
  if (!root) return;
  if (!payload?.ok) {
    showError(root, payload, "nacimientos-viz-error");
    return;
  }

  const statesAll = payload.states || [];
  // Algunas vistas (población ocupada) no dibujan la fila "Nacional" en barras.
  const statesChart = statesAll.filter((s) => !isNacionalRow(s));
  const states = statesChart.length ? statesChart : statesAll;
  const stateKey = resolveStateKey(statesAll.length ? statesAll : states, config);
  const cols = tableColumns(config);
  const munCols = cols.length
    ? cols
    : [config.municipalMetric || config.sortBy].filter(Boolean);

  if (!stateKey && !munCols.length) {
    showError(root, {
      message: "Catálogo sin state_metric ni fields para este preset.",
    });
    return;
  }

  const colCount = Math.max(1, munCols.length);
  const style = gridStyle(colCount, { wide: colCount >= 4 });
  const maxV = stateKey ? maxMetric({ states }, stateKey) : 1;
  const presetStyle = config.style || {};

  const rootClass =
    config.rootClass ||
    presetStyle.root_class ||
    "nacimientos-viz ind-preset-entity-bars";
  const wrap = el("div", `${rootClass} ind-preset-entity-bars`);
  applyBarColors(wrap, presetStyle);
  if (config.title) {
    wrap.append(
      el("h3", "nacimientos-viz-title ind-preset-entity-bars__title", [
        document.createTextNode(config.title),
      ])
    );
  }

  const body = el("div", "nacim-body ind-preset-entity-bars__body");
  applyEntityChartLayout(wrap, body, presetStyle, {
    states,
    columnCount: colCount,
  });

  if (states.length && stateKey) {
    const chartSide = el("div", "nacim-side nacim-side--chart");
    const natBox = el("div", "nacim-national");
    const natBody = el("div", "nacim-national-body");
    for (const s of states) {
      natBody.append(
        stateBarRow(s.nom_ent, s[stateKey], maxV, fieldType(config, stateKey), {
          nacional: isNacionalRow(s),
          estatalSi: !!s.estatal_si,
        })
      );
    }
    natBox.append(natBody);
    chartSide.append(natBox);
    if (config.showEntityShare && payload.por_entidad_guerrero != null) {
      chartSide.append(
        el("p", "nacimientos-viz-pie", [
          document.createTextNode(
            `¹ Participación entidad: ${fmtValue(
              payload.por_entidad_guerrero,
              "percent"
            )}%`
          ),
        ])
      );
    }
    body.append(chartSide);
  }

  const tblSide = el("div", "nacim-side nacim-side--table ind-preset-entity-bars__table");
  const tbl = el("div", "nacim-tbl ind-preset-entity-bars__tbl");

  const head = el("div", "nacim-tbl-row nacim-tbl-row--head");
  Object.assign(head.style, style);
  head.append(el("div", "nacim-tbl-h", [document.createTextNode("Municipio")]));
  for (const key of munCols) {
    const h = el("div", "nacim-tbl-h", [
      document.createTextNode(fieldLabel(config, key)),
    ]);
    h.setAttribute("title", fieldLabel(config, key));
    head.append(h);
  }
  tbl.append(head);

  if (payload.tabla_nacional) {
    tbl.append(
      munRow(payload.tabla_nacional, munCols, config, style, { ent: true })
    );
  }
  if (payload.tabla_entidad) {
    tbl.append(
      munRow(payload.tabla_entidad, munCols, config, style, { ent: true })
    );
  }
  if (payload.entidad && !payload.tabla_entidad) {
    tbl.append(munRow(payload.entidad, munCols, config, style, { ent: true }));
  }

  const rankStack = createRankingTableStack();
  appendRankingTableSections(rankStack, payload, config, (r, opts) =>
    munRow(r, munCols, config, style, opts)
  );
  tbl.append(rankStack);

  tblSide.append(tbl);
  body.append(tblSide);
  wrap.append(body);
  appendFooter(wrap, config, "nacimientos-viz-pie");
  root.innerHTML = "";
  root.append(wrap);
}
