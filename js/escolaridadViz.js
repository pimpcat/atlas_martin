/**
 * Grado promedio de escolaridad: barras nacionales (tab_nacional, graproes, incl. ent 00)
 * + tabla municipal (tab_municipal, graproes).
 */

function fmtGrap(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function maxGrap(states) {
  let m = 0.1;
  for (const s of states || []) {
    const v = Number(s.graproes);
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
}

/** Coincide con api/escolaridad_vista.php: barra gris aunque el flag JSON falle. */
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

function stateBarRow(nomEnt, gr, maxV, nacional, estatalSi) {
  const w = maxV > 0 ? Math.round((Number(gr) / maxV) * 100) : 0;
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
  const num = el("div", "nacim-state-num", [document.createTextNode(fmtGrap(gr))]);
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
    el("div", "nacim-tbl-val", [document.createTextNode(fmtGrap(val))])
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
export function renderEscolaridadVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "escolaridad-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const states = payload.states || [];
  const maxV = maxGrap(states);

  const wrap = el("div", "escolaridad-viz");

  wrap.append(
    el("h3", "escolaridad-viz-title", [
      document.createTextNode(
        "Grado promedio de escolaridad por entidad federativa\ny municipios seleccionados 2020"
      ),
    ])
  );

  const body = el("div", "nacim-body");

  const chartSide = el("div", "nacim-side nacim-side--chart");
  const natBox = el("div", "nacim-national");
  const natBody = el("div", "nacim-national-body");
  for (const s of states) {
    natBody.append(
      stateBarRow(s.nom_ent, s.graproes, maxV, isNacionalRow(s), !!s.estatal_si)
    );
  }
  natBox.append(natBody);
  chartSide.append(natBox);

  const tblSide = el("div", "nacim-side nacim-side--table");
  const tbl = el("div", "nacim-tbl");

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--head", [
      el("div", "nacim-tbl-h", [document.createTextNode("Municipio")]),
      el("div", "nacim-tbl-h", [document.createTextNode("Grado Promedio de Escolaridad")]),
    ])
  );

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--ent", [
      el("div", "nacim-tbl-name nacim-tbl-name--ent", [
        document.createTextNode("Estados Unidos Mexicanos"),
      ]),
      el("div", "nacim-tbl-val", [document.createTextNode(fmtGrap(payload.grap_nacional))]),
    ])
  );

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--ent", [
      el("div", "nacim-tbl-name nacim-tbl-name--ent", [
        document.createTextNode("Entidad Federativa"),
      ]),
      el("div", "nacim-tbl-val", [document.createTextNode(fmtGrap(payload.grap_entidad))]),
    ])
  );

  tbl.append(tblSectionTitle("Municipios con mayor grado"));
  for (const r of payload.top5 || []) {
    tbl.append(tblDataRow(r.nom_mun, r.graproes, !!r.highlight, false));
  }

  if (payload.middle) {
    const mid = el("div", "nacim-tbl-middle");
    mid.append(tblDataRow(payload.middle.nom_mun, payload.middle.graproes, false, true));
    tbl.append(mid);
  }

  tbl.append(tblSectionTitle("Municipios con menor grado"));
  for (const r of payload.bottom5 || []) {
    tbl.append(tblDataRow(r.nom_mun, r.graproes, !!r.highlight, false));
  }

  tblSide.append(tbl);
  body.append(chartSide, tblSide);
  wrap.append(body);

  wrap.append(
    el("p", "escolaridad-viz-pie", [
      document.createTextNode(
        "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados del cuestionario básico. Educación 14. Principales resultados por localidad (ITER)."
      ),
    ])
  );

  root.append(wrap);
}
