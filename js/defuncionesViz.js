/**
 * Defunciones: misma estructura que Nacimientos (tab_nacional defu + tab_municipal por_def_2024_redo).
 */

function fmtMiles(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const s = String(Math.round(Number(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtPct(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function maxDefu(states) {
  let m = 1;
  for (const s of states || []) {
    const v = Number(s.defu);
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
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

function stateBarRow(nomEnt, valor, maxV, gue) {
  const w = maxV > 0 ? Math.round((Number(valor) / maxV) * 100) : 0;
  const row = el("div", `nacim-state-row${gue ? " nacim-state-row--gue" : ""}`);
  const lab = el("div", "nacim-state-name", [
    document.createTextNode(nomEnt && String(nomEnt).trim() ? String(nomEnt) : "—"),
  ]);
  const track = el("div", "nacim-state-track");
  const fill = el("div", gue ? "nacim-state-fill nacim-state-fill--gue" : "nacim-state-fill");
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);
  const num = el("div", "nacim-state-num", [document.createTextNode(fmtMiles(valor))]);
  row.append(lab, track, num);
  return row;
}

function tblDataRow(nom, pct, highlight, mid) {
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
    el("div", "nacim-tbl-val", [document.createTextNode(fmtPct(pct))])
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
export function renderDefuncionesVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message
        ? String(payload.message)
        : "No se pudo cargar la información.";
    root.append(el("div", "defunciones-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const states = payload.states || payload.entities || [];
  const maxV = maxDefu(states);
  const porEnt = payload.por_entidad_guerrero;

  const wrap = el("div", "defunciones-viz");

  wrap.append(
    el("h3", "defunciones-viz-title", [
      document.createTextNode(
        "Defunciones generales por entidad federativa de residencia habitual del fallecido y municipios seleccionados 2024"
      ),
    ])
  );

  const body = el("div", "nacim-body");

  const chartSide = el("div", "nacim-side nacim-side--chart");
  const natBox = el("div", "nacim-national");
  const natBody = el("div", "nacim-national-body");
  for (const s of states) {
    natBody.append(stateBarRow(s.nom_ent, s.defu, maxV, !!s.estatal_si));
  }
  natBox.append(natBody);
  chartSide.append(natBox);

  const tblSide = el("div", "nacim-side nacim-side--table");
  const tbl = el("div", "nacim-tbl");

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--head", [
      el("div", "nacim-tbl-h", [document.createTextNode("Municipio")]),
      el("div", "nacim-tbl-h", [document.createTextNode("Porcentaje de defunciones")]),
    ])
  );

  tbl.append(
    el("div", "nacim-tbl-row nacim-tbl-row--ent", [
      el("div", "nacim-tbl-name nacim-tbl-name--ent", [
        document.createTextNode("Entidad federativa¹"),
      ]),
      el("div", "nacim-tbl-val", [document.createTextNode(fmtPct(porEnt))]),
    ])
  );

  tbl.append(tblSectionTitle("Municipios con mayor cantidad de defunciones"));
  for (const r of payload.top5 || []) {
    tbl.append(tblDataRow(r.nom_mun, r.por_def_2024_redo, !!r.highlight, false));
  }

  if (payload.middle) {
    const mid = el("div", "nacim-tbl-middle");
    mid.append(
      tblDataRow(
        payload.middle.nom_mun,
        payload.middle.por_def_2024_redo,
        false,
        true
      )
    );
    tbl.append(mid);
  }

  tbl.append(tblSectionTitle("Municipios con menor cantidad de defunciones"));
  for (const r of payload.bottom5 || []) {
    tbl.append(tblDataRow(r.nom_mun, r.por_def_2024_redo, !!r.highlight, false));
  }

  tblSide.append(tbl);
  body.append(chartSide, tblSide);
  wrap.append(body);

  wrap.append(
    el("p", "defunciones-viz-pie", [
      document.createTextNode(
        "¹ Porcentaje de la Entidad Federativa respecto al total nacional."
      ),
      el("br"),
      document.createTextNode(
        "Fuente: INEGI. Estadísticas de mortalidad 2024. Consulta interactiva de datos."
      ),
    ])
  );

  root.append(wrap);
}
