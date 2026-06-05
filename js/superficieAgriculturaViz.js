/**
 * Superficie con agricultura a cielo abierto — tabla 5 columnas, encabezado en 3 filas.
 * Estilo alineado con Características económicas (nacim-tbl).
 */

const TITLE_LINE1 = "Superficie total con agricultura a cielo abierto según";
const TITLE_LINE2 =
  "superficie sembrada estimada y disponibilidad del agua por municipios seleccionados 2016 (hectareas)";

const FOOTNOTE =
  "\u00B9 La superficie sembrada total por entidad y por municipio corresponde solo a la superficie de los cultivos seleccionados, no a la total de la entidad.";
const FUENTE =
  "Fuente: INEGI. Actualización del marco censal agropecuario 2016. Cuadro AMCA_2016_07.";

function fmtHa(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function sgrTblHead() {
  const wrap = el("div", "sgr-nacim-head", []);
  const grid = el("div", "sgr-head-grid", []);

  const hMun = el("div", "sgr-h-cell sgr-h-mun", [document.createTextNode("Municipio")]);
  const hSup = document.createElement("div");
  hSup.className = "sgr-h-cell sgr-h-sup";
  hSup.innerHTML =
    "<span class=\"sgr-h-sup-line\">Superficie total con</span><br>" +
    "<span class=\"sgr-h-sup-line\">agricultura a cielo abierto</span>";
  const hGroup = el("div", "sgr-h-cell sgr-h-group", [
    document.createTextNode("Superficie sembrada estimada y disponibilidad de agua\u00B9"),
  ]);
  const hTot = el("div", "sgr-h-cell sgr-h-sub sgr-h-tot", [document.createTextNode("Total")]);
  const hTemp = el("div", "sgr-h-cell sgr-h-sub sgr-h-temp", [
    document.createTextNode("Temporal"),
  ]);
  const hRieg = el("div", "sgr-h-cell sgr-h-sub sgr-h-rieg", [document.createTextNode("De riego")]);

  grid.append(hMun, hSup, hGroup, hTot, hTemp, hRieg);
  wrap.append(grid);
  return wrap;
}

function sgrRowFromPayload(r, opts) {
  if (!r) return null;
  const { highlight, mid, ent } = opts || {};
  const cls = [
    "nacim-tbl-row",
    "sgr-tbl-row",
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
    el("div", "nacim-tbl-val sgr-tbl-val", [document.createTextNode(fmtHa(r.sup_cieloabtot))]),
    el("div", "nacim-tbl-val sgr-tbl-val", [document.createTextNode(fmtHa(r.sup_sembtot))]),
    el("div", "nacim-tbl-val sgr-tbl-val", [document.createTextNode(fmtHa(r.sup_sembtemp))]),
    el("div", "nacim-tbl-val sgr-tbl-val", [document.createTextNode(fmtHa(r.sup_sembrieg))])
  );
  return row;
}

function tblSectionTitle(text) {
  return el("div", "nacim-tbl-merge sgr-tbl-merge", [document.createTextNode(text)]);
}

function buildFooter() {
  const foot = el("div", "superficie-agricultura-viz-foot");
  const p1 = el("p", "superficie-agricultura-viz-nota", [document.createTextNode(FOOTNOTE)]);
  const p2 = el("p", "superficie-agricultura-viz-fuente", [document.createTextNode(FUENTE)]);
  foot.append(p1, p2);
  return foot;
}

/**
 * @param {HTMLElement | null} root
 * @param {any} payload
 */
export function renderSuperficieAgriculturaVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message
        ? String(payload.message)
        : "No se pudieron cargar los datos.";
    root.append(el("div", "poblacion-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const wrap = el("div", "superficie-agricultura-viz", []);
  const h3 = document.createElement("h3");
  h3.className = "superficie-agricultura-viz-title";
  h3.innerHTML =
    `<span class="sgr-title-line">${TITLE_LINE1}</span><br>` +
    `<span class="sgr-title-line">${TITLE_LINE2}</span>`;

  wrap.append(h3);

  const scroll = el("div", "sgr-table-scroll");
  const tbl = el("div", "nacim-tbl sgr-nacim-tbl");

  tbl.append(sgrTblHead());

  if (payload.tabla_nacional) {
    tbl.append(sgrRowFromPayload(payload.tabla_nacional, { ent: true }));
  }
  if (payload.tabla_entidad) {
    tbl.append(sgrRowFromPayload(payload.tabla_entidad, { ent: true }));
  }
  tbl.append(el("div", "sgr-nacim-sep"));
  tbl.append(tblSectionTitle("Municipios con mayor superficie de riego"));
  for (const r of payload.top5 || []) {
    tbl.append(sgrRowFromPayload(r, { highlight: !!r.highlight }));
  }
  if (payload.middle) {
    const midWrap = el("div", "nacim-tbl-middle");
    midWrap.append(sgrRowFromPayload(payload.middle, { mid: true }));
    tbl.append(midWrap);
  }
  tbl.append(tblSectionTitle("Municipios con menor superficie de riego"));
  for (const r of payload.bottom5 || []) {
    tbl.append(sgrRowFromPayload(r, { highlight: !!r.highlight }));
  }

  scroll.append(tbl);
  wrap.append(scroll, buildFooter());
  root.append(wrap);
}
