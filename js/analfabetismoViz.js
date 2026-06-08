/**
 * Tasa de analfabetismo: tab_nacional (2010/2020, barras por entidad 2020)
 * + mini comparativo entidad + tabla municipal (tasa_an_red).
 */

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

function maxTasa2020(states) {
  let m = 0.1;
  for (const s of states || []) {
    const v = Number(s.tasa_an2020);
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
}

function isNacionalRow(s) {
  if (s && s.nacional) return true;
  if (!s) return false;
  const nom = String(s.nom_ent || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (nom === "nacional" || nom === "estados unidos mexicanos") return true;
  const ent = String(s.ent || "").replace(/\D/g, "");
  if (ent.length > 0 && /^0+$/.test(ent)) return true;
  return false;
}

function el(tag, className, children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (children) {
    for (const ch of children) {
      if (ch !== null && ch !== undefined) node.append(ch);
    }
  }
  return node;
}

function stateBarRow(nomEnt, val2020, maxV, nacional, estatalSi) {
  const w = maxV > 0 ? Math.round((Number(val2020) / maxV) * 100) : 0;
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
  const lab = el("div", "nacim-state-name", [
    document.createTextNode(nomEnt && String(nomEnt).trim() ? String(nomEnt) : "—"),
  ]);
  const track = el("div", "nacim-state-track");
  const fill = el("div", fillCls);
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);
  const num = el("div", "nacim-state-num", [document.createTextNode(fmtTasaPct(val2020))]);
  row.append(lab, track, num);
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

function tblSectionTitle(text) {
  return el("div", "nacim-tbl-merge", [document.createTextNode(text)]);
}

/** Eje vertical del mini gráfico entidad: tope de escala 20 (puntos de tasa en %). Si algún dato > 20, el tope sube. */
const MINI_ENT_Y_MAX = 20;

/** Si el dato viene en 0–1 en lugar de 0–100, lo llevamos a porcentaje. */
function miniRatePct(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  if (x > 0 && x <= 1) return x * 100;
  return x;
}

function buildLeftMiniBlock(payload) {
  const a = miniRatePct(payload.tasa_entidad_2010);
  const b = miniRatePct(payload.tasa_entidad_2020);
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
      el("div", "analf-mini-bar-val", [document.createTextNode(fmtTasaNum(Number.isFinite(v) ? v : null))])
    );
    track.append(gap, bar);
    return track;
  };

  const grid = el("div", "analf-left-mixed-grid analf-mini-chart--entidad");

  const head = el("div", "analf-nat-head");
  head.appendChild(document.createTextNode("NACIONAL"));
  const nat2010 = el("div", "analf-nat-val-over");
  nat2010.appendChild(document.createTextNode(fmtTasaPct(payload.tasa_nacional_2010)));
  const nat2020 = el("div", "analf-nat-val-over");
  nat2020.appendChild(document.createTextNode(fmtTasaPct(payload.tasa_nacional_2020)));
  grid.append(head, nat2010, nat2020);

  const nomUp = payload.nom_ent_estatal
    ? String(payload.nom_ent_estatal).trim().toUpperCase()
    : "—";
  const entLbl = el("div", "analf-ent-lbl-side");
  entLbl.appendChild(document.createTextNode(nomUp));

  const x2010 = el("div", "analf-mini-x");
  x2010.appendChild(document.createTextNode("2010"));
  const x2020 = el("div", "analf-mini-x");
  x2020.appendChild(document.createTextNode("2020"));

  const col2010 = el("div", "analf-mini-col-stack");
  col2010.append(buildTrack(a, "analf-mini-bar--2010"), x2010);
  const col2020 = el("div", "analf-mini-col-stack");
  col2020.append(buildTrack(b, "analf-mini-bar--2020"), x2020);

  grid.append(entLbl, col2010, col2020);

  return grid;
}

/**
 * @param {HTMLElement} root
 * @param {any} payload
 */
export function renderAnalfabetismoVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "analfabetismo-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const states = payload.states || [];
  const maxV = maxTasa2020(states);

  const wrap = el("div", "analfabetismo-viz");

  wrap.append(
    el("h3", "analfabetismo-viz-title", [
      document.createTextNode(
        "Tasa de analfabetismo de la población de 15 años y más por entidad federativa\ny municipios seleccionados 2010 y 2020"
      ),
    ])
  );

  const body = el("div", "analf-body");

  const left = el("div", "analf-col analf-col--left");
  const leftPanel = el("div", "analf-left-panel");
  const leftCluster = el("div", "analf-left-cluster");
  leftCluster.append(buildLeftMiniBlock(payload));
  leftPanel.append(leftCluster);
  left.append(leftPanel);

  const center = el("div", "analf-col analf-col--center");
  const natBox = el("div", "nacim-national");
  const natBody = el("div", "nacim-national-body");
  for (const s of states) {
    natBody.append(
      stateBarRow(s.nom_ent, s.tasa_an2020, maxV, isNacionalRow(s), !!s.estatal_si)
    );
  }
  natBox.append(natBody);
  center.append(natBox);

  const tblSide = el("div", "analf-col analf-col--right nacim-side nacim-side--table");
  const tbl = el("div", "nacim-tbl");

  tbl.append(
    el("div", "analf-tbl-title", [
      document.createTextNode("Tasa de analfabetismo por municipios\nseleccionados 2020"),
    ])
  );

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--head", [
      el("div", "nacim-tbl-h", [document.createTextNode("Municipio")]),
      el("div", "nacim-tbl-h", [document.createTextNode("Tasa")]),
    ])
  );

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--ent", [
      el("div", "nacim-tbl-name nacim-tbl-name--ent", [
        document.createTextNode("Estados Unidos Mexicanos"),
      ]),
      el("div", "nacim-tbl-val", [document.createTextNode(fmtTasaPct(payload.tasa_nacional_2020))]),
    ])
  );

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--ent", [
      el("div", "nacim-tbl-name nacim-tbl-name--ent", [
        document.createTextNode("Entidad Federativa"),
      ]),
      el("div", "nacim-tbl-val", [document.createTextNode(fmtTasaPct(payload.tasa_entidad_2020))]),
    ])
  );

  tbl.append(tblSectionTitle("Municipios con mayor tasa de analfabetismo"));
  for (const r of payload.top5 || []) {
    tbl.append(tblDataRow(r.nom_mun, r.tasa_an_red, !!r.highlight, false));
  }

  if (payload.middle) {
    const mid = el("div", "nacim-tbl-middle");
    mid.append(tblDataRow(payload.middle.nom_mun, payload.middle.tasa_an_red, false, true));
    tbl.append(mid);
  }

  tbl.append(tblSectionTitle("Municipios con menor tasa de analfabetismo"));
  for (const r of payload.bottom5 || []) {
    tbl.append(tblDataRow(r.nom_mun, r.tasa_an_red, !!r.highlight, false));
  }

  tblSide.append(tbl);
  body.append(left, center, tblSide);
  wrap.append(body);

  const foot = el("div", "analfabetismo-viz-footer");
  foot.append(
    el("p", "analfabetismo-viz-pie-line", [
      document.createTextNode(
        "Nota: La información de la gráfica corresponde a datos del Censo de Población y Vivienda 2020."
      ),
    ]),
    el("p", "analfabetismo-viz-pie-line", [
      document.createTextNode(
        "Fuente: INEGI. Censos de Población y Vivienda 2010 y 2020. Tabulados del cuestionario básico. Educación 4."
      ),
    ])
  );
  wrap.append(foot);

  root.append(wrap);
}
