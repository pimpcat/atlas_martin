/**
 * Vista "Distribución porcentual de población y tasa de crecimiento anual".
 * Renderiza un gráfico de barras (basado en dist_porc) y una tabla anexa
 * con las tasas de crecimiento (creci_00_10 y creci_10_20).
 *
 * Estructura: chart (izquierda) + tabla sin bordes (derecha) alineados por
 * filas, en 3 secciones (top 5 / municipio seleccionado / bottom 5).
 */

function fmtDist(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
    return "-";
  }
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCreci(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
    return "-";
  }
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function maxDist({ top5, bottom5, middle }) {
  let m = 1;
  const consider = (row) => {
    if (!row) return;
    const v = Number(row.dist_porc);
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

function chartRow(name, dist, maxV, highlight) {
  const w = maxV > 0 ? Math.round((Number(dist) / maxV) * 100) : 0;

  const row = el("div", `crec-bar-row${highlight ? " crec-bar-row--hl" : ""}`);

  const lab = el("div", "crec-mun-name", [
    document.createTextNode(name && String(name).trim() ? String(name) : "—"),
  ]);

  const track = el("div", "crec-bar-track");
  const fill = el("div", "crec-bar-fill");
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);

  const num = el("div", "crec-bar-num", [document.createTextNode(fmtDist(dist))]);

  row.append(lab, track, num);
  return row;
}

function tableRow(creci0010, creci1020, highlight) {
  const row = el("div", `crec-tbl-row${highlight ? " crec-tbl-row--hl" : ""}`);
  row.append(
    el("div", "crec-tbl-cell", [document.createTextNode(fmtCreci(creci0010))]),
    el("div", "crec-tbl-cell", [document.createTextNode(fmtCreci(creci1020))])
  );
  return row;
}

function chartBox(kind, badge, rows, maxV) {
  const box = el("div", `crec-box crec-box--${kind}`);
  const body = el("div", "crec-box-body");
  for (const r of rows || []) {
    body.append(chartRow(r.nom_mun, r.dist_porc, maxV, !!r.highlight));
  }
  box.append(body);
  box.append(el("div", "crec-box-badge", [document.createTextNode(badge)]));
  return box;
}

function tableSection(kind, rows) {
  const sec = el("div", `crec-tbl-section crec-tbl-section--${kind}`);
  for (const r of rows || []) {
    sec.append(tableRow(r.creci_00_10, r.creci_10_20, !!r.highlight));
  }
  return sec;
}

/**
 * @param {HTMLElement} root
 * @param {{ ok: boolean, message?: string, top5?: any[], bottom5?: any[], middle?: any }} payload
 */
export function renderCrecimientoComparativa(root, payload) {
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

  const maxV = maxDist(payload);
  const middleRow = payload.middle
    ? Object.assign({}, payload.middle, { highlight: true })
    : null;

  const wrap = el("div", "crecimiento-viz");

  // Cabecera: título a la izquierda + meta de la tabla a la derecha
  const header = el("div", "crec-header");

  header.append(
    el("h3", "crecimiento-viz-title", [
      document.createTextNode(
        "Distribución porcentual de población y tasa de crecimiento anual por municipios seleccionados 2020"
      ),
    ])
  );

  const tblMeta = el("div", "crec-tbl-meta");
  tblMeta.append(
    el("div", "crec-tbl-supertitle", [
      document.createTextNode("Tasa de crecimiento"),
    ]),
    (() => {
      const cols = el("div", "crec-tbl-headers");
      cols.append(
        el("div", "crec-tbl-header", [document.createTextNode("2000-2010")]),
        el("div", "crec-tbl-header", [document.createTextNode("2010-2020")])
      );
      return cols;
    })()
  );
  header.append(tblMeta);
  wrap.append(header);

  // Cuerpo: chart (izquierda) + tabla (derecha) alineados por flex
  const body = el("div", "crec-body");

  const chartSide = el("div", "crec-side crec-side--chart");
  chartSide.append(chartBox("top", "5+", payload.top5, maxV));
  if (middleRow) {
    const mid = el("div", "crec-middle");
    mid.append(chartRow(middleRow.nom_mun, middleRow.dist_porc, maxV, true));
    chartSide.append(mid);
  }
  chartSide.append(chartBox("bottom", "5−", payload.bottom5, maxV));

  const tblSide = el("div", "crec-side crec-side--table");
  tblSide.append(tableSection("top", payload.top5));
  if (middleRow) {
    const sec = el("div", "crec-tbl-section crec-tbl-section--middle");
    sec.append(tableRow(middleRow.creci_00_10, middleRow.creci_10_20, true));
    tblSide.append(sec);
  }
  tblSide.append(tableSection("bottom", payload.bottom5));

  body.append(chartSide, tblSide);
  wrap.append(body);

  wrap.append(
    el("p", "crecimiento-viz-fuente", [
      document.createTextNode(
        "Fuente: INEGI. Censos de Población y Vivienda 2000, 2010 y 2020. Tabulados del cuestionario básico. Población 2."
      ),
    ])
  );

  root.append(wrap);
}
