/**
 * Población ocupada: barras horizontales (tab_nacional, pea_ocup)
 * + tabla (tab_municipal, ocupada y escolaridad).
 */

const FOOTNOTES = [
  "Incluye a la población que tiene al menos un grado aprobado en primaria.",
  "Incluye a la población con secundaria incompleta y con estudios técnicos o comerciales con primaria terminada.",
  "Incluye a la población que tiene al menos un grado aprobado en estudios técnicos o comerciales con secundaria terminada, preparatoria o bachillerato, o normal básica.",
  "Incluye a la población que tiene al menos un grado aprobado en estudios técnicos o comerciales con preparatoria terminada, profesional (licenciatura, normal superior o equivalente), especialidad, maestría o doctorado.",
];

const FUENTE =
  "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados del Cuestionario Básico. Características económicas 4.";

function fmtInt(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

function maxPea(states) {
  let m = 1;
  for (const s of states || []) {
    const v = Number(s.pea_ocup);
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
  const raw = nomEnt && String(nomEnt).trim() ? String(nomEnt) : "—";
  const lab = el("div", "nacim-state-name", [document.createTextNode(raw)]);
  if (raw !== "—") {
    lab.setAttribute("title", raw);
  }
  const track = el("div", "nacim-state-track");
  const fill = el("div", fillCls);
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);
  const num = el("div", "nacim-state-num", [document.createTextNode(fmtInt(val))]);
  row.append(lab, track, num);
  return row;
}

function poocSubHeadHtml(html) {
  const d = document.createElement("div");
  d.className = "nacim-tbl-h pooc-nacim-h-sub";
  d.innerHTML = html;
  return d;
}

function poocTblHead() {
  const head = el("div", "pooc-nacim-head");
  head.append(
    el("div", "nacim-tbl-h pooc-nacim-h-span2", [document.createTextNode("Municipio")]),
    el("div", "nacim-tbl-h pooc-nacim-h-span2 pooc-nacim-h-pea", [
      document.createTextNode("PEA Ocupada"),
    ]),
    el("div", "nacim-tbl-h pooc-nacim-h-esc", [document.createTextNode("Escolaridad")]),
    poocSubHeadHtml("Sin escolaridad"),
    poocSubHeadHtml("Primaria<sup>1</sup>"),
    poocSubHeadHtml("Secundaria<sup>2</sup>"),
    poocSubHeadHtml("Media superior<sup>3</sup>"),
    poocSubHeadHtml("Superior<sup>4</sup>"),
    poocSubHeadHtml("No especificado")
  );
  return head;
}

function poocRowFromPayload(r, opts) {
  if (!r) return null;
  const { highlight, mid, ent } = opts || {};
  const cls = [
    "nacim-tbl-row",
    highlight ? "nacim-tbl-row--hl" : "",
    mid ? "nacim-tbl-row--mid" : "",
    ent ? "nacim-tbl-row--ent" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const row = el("div", cls);
  const nameCls = ent ? "nacim-tbl-name nacim-tbl-name--ent" : "nacim-tbl-name";
  row.append(
    el("div", nameCls, [document.createTextNode(r.nom_mun != null ? String(r.nom_mun) : "—")]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.ocupada))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.sin_escol))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.primaria))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.secund))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.med_sup))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.superior))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.no_esp))])
  );
  return row;
}

function tblSectionTitle(text) {
  return el("div", "nacim-tbl-merge", [document.createTextNode(text)]);
}

/**
 * @param {HTMLElement} root
 * @param {any} payload
 */
export function renderPoblacionOcupadaVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "poblacion-ocupada-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const states = payload.states || [];
  const statesChart = states.filter((s) => !isNacionalRow(s));
  const maxV = maxPea(statesChart);

  const wrap = el("div", "poblacion-ocupada-viz");

  wrap.append(
    el("h3", "poblacion-ocupada-viz-title", [
      document.createTextNode(
        "Población ocupada por entidad federativa según escolaridad y municipios seleccionados 2020"
      ),
    ])
  );

  const body = el("div", "pooc-body");

  const chartSide = el("div", "nacim-side nacim-side--chart");
  const natBox = el("div", "nacim-national");
  const natBody = el("div", "nacim-national-body");
  for (const s of statesChart) {
    natBody.append(stateBarRow(s.nom_ent, s.pea_ocup, maxV, false, !!s.estatal_si));
  }
  natBox.append(natBody);
  chartSide.append(natBox);

  const tblSide = el("div", "nacim-side nacim-side--table pooc-side-table");
  const tbl = el("div", "nacim-tbl pooc-nacim-tbl");

  tbl.append(poocTblHead());

  if (payload.tabla_nacional) {
    tbl.append(poocRowFromPayload(payload.tabla_nacional, { ent: true }));
  }
  if (payload.tabla_entidad) {
    tbl.append(poocRowFromPayload(payload.tabla_entidad, { ent: true }));
  }
  tbl.append(el("div", "pooc-nacim-sep"));
  tbl.append(tblSectionTitle("Municipios con mayor población ocupada"));
  for (const r of payload.top5 || []) {
    tbl.append(poocRowFromPayload(r, { highlight: !!r.highlight }));
  }
  if (payload.middle) {
    const midWrap = el("div", "nacim-tbl-middle");
    midWrap.append(poocRowFromPayload(payload.middle, { mid: true }));
    tbl.append(midWrap);
  }
  tbl.append(tblSectionTitle("Municipios con menor población ocupada"));
  for (const r of payload.bottom5 || []) {
    tbl.append(poocRowFromPayload(r, { highlight: !!r.highlight }));
  }

  tblSide.append(tbl);
  body.append(chartSide, tblSide);
  wrap.append(body);

  const foot = el("div", "poblacion-ocupada-viz-foot");
  const ol = document.createElement("ol");
  ol.className = "pooc-footnotes";
  for (let i = 0; i < FOOTNOTES.length; i++) {
    const li = document.createElement("li");
    li.textContent = FOOTNOTES[i];
    ol.appendChild(li);
  }
  foot.append(
    ol,
    el("p", "poblacion-ocupada-viz-fuente", [document.createTextNode(FUENTE)])
  );
  wrap.append(foot);

  root.append(wrap);
}
