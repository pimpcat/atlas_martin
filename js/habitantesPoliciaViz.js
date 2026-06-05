/**
 * Habitantes por policía preventiva — gráfico (habxpol) + tabla (pob_tot, pol_prev).
 * Misma estructura que Población y crecimiento: chart izquierda, tabla derecha, filas alineadas.
 */

const TITLE =
  "Número de habitantes por policía en municipios seleccionados 2022";

const NOTA_BODY =
  "El número de habitantes por policía preventivo se obtuvo de dividir el total de la población del municipio entre el número de policías preventivos del municipio correspondiente al 31 de diciembre de 2022.";

const FUENTE_BODY =
  "INEGI. Censo Nacional de Gobiernos Municipales y Demarcaciones Territoriales de la Ciudad de México 2023. Datos Abiertos. Censo de Población y Vivienda 2020. Tabulados del cuestionario básico.";

function fmtInt(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
    return "—";
  }
  return Number(v).toLocaleString("es-MX", {
    maximumFractionDigits: 0,
  });
}

function fmtHabxpol(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
    return "—";
  }
  return Math.round(Number(v)).toLocaleString("es-MX", {
    maximumFractionDigits: 0,
  });
}

function maxHabxpol({ top5, bottom5, middle }) {
  let m = 1;
  const consider = (row) => {
    if (!row) return;
    const v = Number(row.habxpol);
    if (Number.isFinite(v) && v > m) m = v;
  };
  (top5 || []).forEach(consider);
  (bottom5 || []).forEach(consider);
  consider(middle);
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

function chartRow(name, habxpol, maxV, highlight) {
  const w = maxV > 0 ? Math.round((Number(habxpol) / maxV) * 100) : 0;

  const row = el("div", `crec-bar-row${highlight ? " crec-bar-row--hl" : ""}`);

  const lab = el("div", "crec-mun-name", [
    document.createTextNode(name && String(name).trim() ? String(name) : "—"),
  ]);

  const track = el("div", "crec-bar-track");
  const fill = el("div", "crec-bar-fill");
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);

  const num = el("div", "crec-bar-num", [document.createTextNode(fmtHabxpol(habxpol))]);

  row.append(lab, track, num);
  return row;
}

function tableRow(pobTot, polPrev, highlight) {
  const row = el("div", `crec-tbl-row${highlight ? " crec-tbl-row--hl" : ""}`);
  row.append(
    el("div", "crec-tbl-cell", [document.createTextNode(fmtInt(pobTot))]),
    el("div", "crec-tbl-cell", [document.createTextNode(fmtInt(polPrev))])
  );
  return row;
}

function chartBox(kind, badge, rows, maxV) {
  const box = el("div", `crec-box crec-box--${kind}`);
  const body = el("div", "crec-box-body");
  for (const r of rows || []) {
    body.append(chartRow(r.nom_mun, r.habxpol, maxV, !!r.highlight));
  }
  box.append(body);
  box.append(el("div", "crec-box-badge", [document.createTextNode(badge)]));
  return box;
}

function tableSection(kind, rows) {
  const sec = el("div", `crec-tbl-section crec-tbl-section--${kind}`);
  for (const r of rows || []) {
    sec.append(tableRow(r.pob_tot, r.pol_prev, !!r.highlight));
  }
  return sec;
}

function footHangRow(labelText, bodyText) {
  const row = el("div", "hpol-foot-item");
  row.append(
    el("span", "hpol-foot-label", [document.createTextNode(labelText)]),
    el("span", "hpol-foot-body", [document.createTextNode(bodyText)])
  );
  return row;
}

/**
 * @param {HTMLElement} root
 * @param {{ ok: boolean, message?: string, top5?: any[], bottom5?: any[], middle?: any }} payload
 */
export function renderHabitantesPoliciaVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message
        ? String(payload.message)
        : "No se pudo cargar la información.";
    root.append(el("div", "crecimiento-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const maxV = maxHabxpol(payload);
  const middleRow = payload.middle
    ? Object.assign({}, payload.middle, { highlight: true })
    : null;

  const wrap = el("div", "crecimiento-viz habitantes-policia-viz");

  const header = el("div", "crec-header");

  header.append(el("h3", "crecimiento-viz-title", [document.createTextNode(TITLE)]));

  const tblMeta = el("div", "crec-tbl-meta");
  tblMeta.append(
    el("div", "crec-tbl-supertitle hpol-tbl-head-spacer", [document.createTextNode("\u00A0")]),
    (() => {
      const cols = el("div", "crec-tbl-headers");
      cols.append(
        el("div", "crec-tbl-header", [document.createTextNode("Población")]),
        el("div", "crec-tbl-header", [document.createTextNode("Policía preventiva")])
      );
      return cols;
    })()
  );
  header.append(tblMeta);
  wrap.append(header);

  const body = el("div", "crec-body");

  const chartSide = el("div", "crec-side crec-side--chart");
  chartSide.append(chartBox("top", "5+", payload.top5, maxV));
  if (middleRow) {
    const mid = el("div", "crec-middle");
    mid.append(chartRow(middleRow.nom_mun, middleRow.habxpol, maxV, true));
    chartSide.append(mid);
  }
  chartSide.append(chartBox("bottom", "5−", payload.bottom5, maxV));

  const tblSide = el("div", "crec-side crec-side--table");
  tblSide.append(tableSection("top", payload.top5));
  if (middleRow) {
    const sec = el("div", "crec-tbl-section crec-tbl-section--middle");
    sec.append(tableRow(middleRow.pob_tot, middleRow.pol_prev, true));
    tblSide.append(sec);
  }
  tblSide.append(tableSection("bottom", payload.bottom5));

  body.append(chartSide, tblSide);
  wrap.append(body);

  const foot = el("div", "hpol-viz-foot");
  foot.append(footHangRow("Nota:", NOTA_BODY), footHangRow("Fuente:", FUENTE_BODY));
  wrap.append(foot);

  root.append(wrap);
}
