/**
 * Participación viviendas particulares habitadas + tasas de crecimiento
 * (misma lógica de resaltado que Población y crecimiento; tres columnas).
 */

function fmtPart(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
    return "-";
  }
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
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

function maxPart({ top5, bottom5, middle }) {
  let m = 0.1;
  const consider = (row) => {
    if (!row) return;
    const v = Number(row.part_por_vivh);
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

function chartRow(name, partVal, maxV, highlight) {
  const w = maxV > 0 ? Math.round((Number(partVal) / maxV) * 100) : 0;

  const row = el("div", `crec-bar-row${highlight ? " crec-bar-row--hl" : ""}`);

  const lab = el("div", "crec-mun-name", [
    document.createTextNode(name && String(name).trim() ? String(name) : "—"),
  ]);

  const track = el("div", "crec-bar-track");
  const fill = el("div", "crec-bar-fill");
  fill.style.width = `${Math.max(1, Math.min(100, w))}%`;
  track.append(fill);

  const num = el("div", "crec-bar-num", [document.createTextNode(fmtPart(partVal))]);

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
    body.append(chartRow(r.nom_mun, r.part_por_vivh, maxV, !!r.highlight));
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

function tblMetaBlock() {
  const tblMeta = el("div", "crec-tbl-meta");
  tblMeta.append(
    el("div", "crec-tbl-supertitle", [document.createTextNode("Tasa de crecimiento")]),
    (() => {
      const cols = el("div", "crec-tbl-headers");
      cols.append(
        el("div", "crec-tbl-header", [document.createTextNode("2000-2010")]),
        el("div", "crec-tbl-header", [document.createTextNode("2010-2020")])
      );
      return cols;
    })()
  );
  return tblMeta;
}

/** Encabezados de la tabla resumen (misma fila que la tabla central, como en Población y crecimiento). */
function summaryHeaderBlock() {
  const wrap = el("div", "viv-part-summary viv-part-summary--head");
  wrap.append(
    el("div", "crec-tbl-supertitle", [document.createTextNode("Tasa de crecimiento")]),
    (() => {
      const head = el("div", "viv-part-summary-head");
      head.append(
        el("div", "viv-part-summary-corner", []),
        el("div", "crec-tbl-header", [document.createTextNode("2000-2010")]),
        el("div", "crec-tbl-header", [document.createTextNode("2010-2020")])
      );
      return head;
    })()
  );
  return wrap;
}

function summaryBodyBlock(nacional, estatal) {
  const wrap = el("div", "viv-part-summary viv-part-summary--body");
  const body = el("div", "viv-part-summary-body");
  const pushLine = (row) => {
    const nm = row && row.nom_mun ? String(row.nom_mun) : "—";
    const r = el("div", "viv-part-summary-row");
    r.append(
      el("div", "viv-part-summary-name", [document.createTextNode(nm)]),
      el("div", "viv-part-summary-cell", [
        document.createTextNode(fmtCreci(row ? row.creci_00_10 : null)),
      ]),
      el("div", "viv-part-summary-cell", [
        document.createTextNode(fmtCreci(row ? row.creci_10_20 : null)),
      ])
    );
    body.append(r);
  };
  pushLine(nacional || null);
  pushLine(estatal || null);
  wrap.append(body);
  return wrap;
}

/**
 * @param {HTMLElement} root
 * @param {any} payload
 */
export function renderViviendaParticipacionVista(root, payload) {
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

  const maxV = maxPart(payload);
  const middleRow = payload.middle
    ? Object.assign({}, payload.middle, { highlight: true })
    : null;

  const wrap = el("div", "crecimiento-viz viv-part-viz");

  const titleRow = el("div", "viv-part-title-row");
  titleRow.append(
    el("h3", "crecimiento-viz-title viv-part-title", [
      document.createTextNode(
        "Participación porcentual de viviendas particulares habitadas y tasa de crecimiento por municipios seleccionados 2020"
      ),
    ])
  );
  wrap.append(titleRow);

  /* Misma idea que crecimiento: encabezados de tablas fuera del cuerpo alineado → filas cuadran con el gráfico */
  const syncHeader = el("div", "viv-part-sync-header");
  syncHeader.append(
    el("div", "viv-part-sync-spacer", []),
    tblMetaBlock(),
    el("div", "viv-part-sync-spacer-tail", [])
  );
  wrap.append(syncHeader);

  const body = el("div", "viv-part-body");

  const chartSide = el("div", "crec-side crec-side--chart");
  chartSide.append(chartBox("top", "5+", payload.top5, maxV));
  if (middleRow) {
    const mid = el("div", "crec-middle");
    mid.append(chartRow(middleRow.nom_mun, middleRow.part_por_vivh, maxV, true));
    chartSide.append(mid);
  }
  chartSide.append(chartBox("bottom", "5−", payload.bottom5, maxV));

  const tblSide = el("div", "crec-side crec-side--table viv-part-tbl-mun");
  tblSide.append(tableSection("top", payload.top5));
  if (middleRow) {
    const sec = el("div", "crec-tbl-section crec-tbl-section--middle");
    sec.append(tableRow(middleRow.creci_00_10, middleRow.creci_10_20, true));
    tblSide.append(sec);
  }
  tblSide.append(tableSection("bottom", payload.bottom5));

  const sumSide = el("div", "viv-part-side-summary");
  sumSide.append(summaryHeaderBlock());
  sumSide.append(summaryBodyBlock(payload.nacional, payload.estatal));

  body.append(chartSide, tblSide, sumSide);
  wrap.append(body);

  wrap.append(
    el("p", "crecimiento-viz-fuente viv-part-fuente", [
      document.createTextNode(
        "Fuente: INEGI. XII Censo General de Población y Vivienda 2000. Censos de Población y Vivienda 2010 y 2020.\nTabulados del Cuestionario Básico. Vivienda 4."
      ),
    ])
  );

  root.append(wrap);
}
