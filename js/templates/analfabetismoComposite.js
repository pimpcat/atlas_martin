/**
 * Template data-driven: analfabetismo_composite
 * Tres columnas (como el Viz original):
 *  1) Mini comparativo nacional + entidad (period_keys / tasas 2010–2020)
 *  2) Barras por entidad (state_metric)
 *  3) Tabla municipal (table_columns / sort_by)
 */
import {
  appendFooter,
  appendRankingTableSections,
  createRankingTableStack,
  el,
  fieldLabel,
  fieldType,
  fmtValue,
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

function fmtTasaPct(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function fmtTasaNum(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function miniRatePct(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  if (x > 0 && x <= 1) return x * 100;
  return x;
}

const MINI_ENT_Y_MAX = 20;

function resolveStateKey(states, config) {
  const candidates = [
    config.stateMetric,
    ...(config.periodKeys || []).slice().reverse(),
    config.barMetrics?.[0],
    ...(config.fieldKeys || []),
  ].filter(Boolean);
  if (!states?.length) return candidates[0] || null;
  const sample = states.find((s) => s && typeof s === "object") || states[0];
  for (const key of candidates) {
    if (sample[key] != null && sample[key] !== "") return key;
  }
  for (const [k, v] of Object.entries(sample)) {
    if (["ent", "nom_ent", "estatal_si", "nacional", "highlight"].includes(k)) continue;
    if (v != null && Number.isFinite(Number(v))) return k;
  }
  return candidates[0] || null;
}

function stateBarRow(nomEnt, val, maxV, nacional, estatalSi) {
  const w = maxV > 0 ? Math.round((Number(val) / maxV) * 100) : 0;
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
  row.append(
    el("div", "nacim-state-name", [
      document.createTextNode(nomEnt && String(nomEnt).trim() ? String(nomEnt) : "—"),
    ])
  );
  const track = el("div", "nacim-state-track");
  const fill = el("div", fillCls);
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);
  row.append(track);
  row.append(el("div", "nacim-state-num", [document.createTextNode(fmtTasaPct(val))]));
  return row;
}

function tblDataRow(nom, val, highlight, mid) {
  const cls = [
    "nacim-tbl-row",
    highlight ? "nacim-tbl-row--hl" : "",
    mid ? "nacim-tbl-row--mid" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const row = el("div", cls);
  row.append(
    el("div", "nacim-tbl-name", [document.createTextNode(nom || "—")]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtTasaPct(val))])
  );
  return row;
}

/**
 * Columna izquierda: valores nacionales + barras verticales entidad (periodos).
 * Usa claves del payload del handler (tasa_nacional_*, tasa_entidad_*) o period_keys.
 */
function buildLeftMiniBlock(payload, config) {
  const periods = config.periodKeys || ["tasa_an2010", "tasa_an2020"];
  const p0 = periods[0] || "tasa_an2010";
  const p1 = periods[1] || periods[0] || "tasa_an2020";

  // Preferir campos explícitos del handler; si no, period_keys sobre fila estatal en states.
  const gue = (payload.states || []).find((s) => s.estatal_si);
  const natRow = (payload.states || []).find((s) => isNacionalRow(s));

  const nat2010 =
    payload.tasa_nacional_2010 ??
    payload.tasa_nacional?.[p0] ??
    natRow?.[p0];
  const nat2020 =
    payload.tasa_nacional_2020 ??
    payload.tasa_nacional?.[p1] ??
    natRow?.[p1];
  const ent2010 =
    payload.tasa_entidad_2010 ??
    payload.tasa_entidad?.[p0] ??
    gue?.[p0];
  const ent2020 =
    payload.tasa_entidad_2020 ??
    payload.tasa_entidad?.[p1] ??
    gue?.[p1];

  const a = miniRatePct(ent2010);
  const b = miniRatePct(ent2020);
  const dataMax = Math.max(a, b, 0.1);
  const den = Math.max(MINI_ENT_Y_MAX, dataMax);

  const flexWeights = (valPct) => {
    const v = Math.max(0, Math.min(den, Number.isFinite(valPct) ? valPct : 0));
    const barW = Math.max(1, Math.round((v / den) * 10000));
    const gapW = Math.max(1, Math.round(((den - v) / den) * 10000));
    return { barW, gapW };
  };

  const buildTrack = (valPct, barClass) => {
    const v = Math.max(0, Number.isFinite(valPct) ? valPct : 0);
    const { barW, gapW } = flexWeights(v);
    const track = el("div", "analf-mini-track");
    const gap = el("div", "analf-mini-bar-gap");
    gap.style.flex = `${gapW} 1 0`;
    gap.style.minHeight = "0";
    const bar = el("div", `analf-mini-bar ${barClass}`);
    bar.style.flex = `${barW} 0 0`;
    bar.style.minHeight = "0";
    bar.append(
      el("div", "analf-mini-bar-val", [
        document.createTextNode(fmtTasaNum(Number.isFinite(v) ? v : null)),
      ])
    );
    track.append(gap, bar);
    return track;
  };

  const grid = el("div", "analf-left-mixed-grid analf-mini-chart--entidad");

  const head = el("div", "analf-nat-head");
  head.appendChild(document.createTextNode("NACIONAL"));
  const nat2010El = el("div", "analf-nat-val-over");
  nat2010El.appendChild(document.createTextNode(fmtTasaPct(nat2010)));
  const nat2020El = el("div", "analf-nat-val-over");
  nat2020El.appendChild(document.createTextNode(fmtTasaPct(nat2020)));
  grid.append(head, nat2010El, nat2020El);

  const nomUp = payload.nom_ent_estatal
    ? String(payload.nom_ent_estatal).trim().toUpperCase()
    : gue?.nom_ent
      ? String(gue.nom_ent).trim().toUpperCase()
      : "—";
  const entLbl = el("div", "analf-ent-lbl-side");
  entLbl.appendChild(document.createTextNode(nomUp));

  const label0 = fieldLabel(config, p0).replace(/tasa\s*/i, "").trim() || "2010";
  const label1 = fieldLabel(config, p1).replace(/tasa\s*/i, "").trim() || "2020";
  // Preferir años cortos si el label del catálogo es largo
  const x0Text = /\d{4}/.test(label0) ? (label0.match(/\d{4}/) || ["2010"])[0] : "2010";
  const x1Text = /\d{4}/.test(label1) ? (label1.match(/\d{4}/) || ["2020"])[0] : "2020";

  const x2010 = el("div", "analf-mini-x");
  x2010.appendChild(document.createTextNode(x0Text));
  const x2020 = el("div", "analf-mini-x");
  x2020.appendChild(document.createTextNode(x1Text));

  const col2010 = el("div", "analf-mini-col-stack");
  col2010.append(buildTrack(a, "analf-mini-bar--2010"), x2010);
  const col2020 = el("div", "analf-mini-col-stack");
  col2020.append(buildTrack(b, "analf-mini-bar--2020"), x2020);

  grid.append(entLbl, col2010, col2020);
  return grid;
}

export function renderAnalfabetismoComposite(root, payload, config = {}) {
  if (!root) return;
  if (!payload?.ok) {
    showError(root, payload, "analfabetismo-viz-error");
    return;
  }

  const states = payload.states || [];
  const stateKey = resolveStateKey(states, config) || "tasa_an2020";
  const munKey =
    (tableColumns(config)[0] || config.municipalMetric || config.sortBy || "tasa_an_red");
  const maxV = maxMetric({ states }, stateKey);

  const rootClass = config.rootClass || "analfabetismo-viz";
  const wrap = el("div", `${rootClass} analfabetismo-viz`);
  const titleText =
    config.title ||
    "Tasa de analfabetismo de la población de 15 años y más por entidad federativa\ny municipios seleccionados 2010 y 2020";
  wrap.append(
    el("h3", "analfabetismo-viz-title", [document.createTextNode(titleText)])
  );

  const body = el("div", "analf-body");

  // 1) Mini comparativo nacional + entidad
  const left = el("div", "analf-col analf-col--left");
  const leftPanel = el("div", "analf-left-panel");
  const leftCluster = el("div", "analf-left-cluster");
  leftCluster.append(buildLeftMiniBlock(payload, config));
  leftPanel.append(leftCluster);
  left.append(leftPanel);

  // 2) Barras por entidad
  const center = el("div", "analf-col analf-col--center");
  const natBox = el("div", "nacim-national");
  const natBody = el("div", "nacim-national-body");
  for (const s of states) {
    natBody.append(
      stateBarRow(
        s.nom_ent,
        s[stateKey],
        maxV,
        isNacionalRow(s),
        !!s.estatal_si
      )
    );
  }
  natBox.append(natBody);
  center.append(natBox);

  // 3) Tabla municipal
  const tblSide = el("div", "analf-col analf-col--right nacim-side nacim-side--table");
  const tbl = el("div", "nacim-tbl");

  tbl.append(
    el("div", "analf-tbl-title", [
      document.createTextNode(
        config.tableTitle ||
          `Tasa de analfabetismo por municipios\nseleccionados 2020`
      ),
    ])
  );

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--head", [
      el("div", "nacim-tbl-h", [document.createTextNode("Municipio")]),
      el("div", "nacim-tbl-h", [
        document.createTextNode(fieldLabel(config, munKey) || "Tasa"),
      ]),
    ])
  );

  const nat2020 =
    payload.tasa_nacional_2020 ??
    (states.find((s) => isNacionalRow(s)) || {})[stateKey];
  const ent2020 =
    payload.tasa_entidad_2020 ??
    (states.find((s) => s.estatal_si) || {})[stateKey];

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--ent", [
      el("div", "nacim-tbl-name nacim-tbl-name--ent", [
        document.createTextNode("Estados Unidos Mexicanos"),
      ]),
      el("div", "nacim-tbl-val", [document.createTextNode(fmtTasaPct(nat2020))]),
    ])
  );
  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--ent", [
      el("div", "nacim-tbl-name nacim-tbl-name--ent", [
        document.createTextNode("Entidad Federativa"),
      ]),
      el("div", "nacim-tbl-val", [document.createTextNode(fmtTasaPct(ent2020))]),
    ])
  );

  const rankStack = createRankingTableStack();
  appendRankingTableSections(rankStack, payload, config, (r, opts) =>
    tblDataRow(r.nom_mun, r[munKey], !!opts?.highlight, !!opts?.mid)
  );
  tbl.append(rankStack);

  tblSide.append(tbl);
  body.append(left, center, tblSide);
  wrap.append(body);

  const foot = el("div", "analfabetismo-viz-footer");
  if (config.footer) {
    foot.append(
      el("p", "analfabetismo-viz-pie-line", [document.createTextNode(config.footer)])
    );
  }
  if (foot.childNodes.length) {
    wrap.append(foot);
  } else {
    appendFooter(wrap, config, "analfabetismo-viz-pie-line");
  }

  root.innerHTML = "";
  root.append(wrap);
}
