/**
 * Instituciones administración pública municipal (CNGG) — cabecera 2 filas, 5 columnas.
 */

const TITLE_LINE1 =
  "Instituciones de la administración pública municipal según clasificación administrativa y personal";
const TITLE_LINE2 = "por municipios seleccionados 2022";

const FUENTE =
  "Fuente: INEGI. Censo Nacional de Gobiernos Municipales y Demarcaciones Territoriales de la Ciudad de México 2023. Datos abiertos.";

function fmtInt(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", { maximumFractionDigits: 0 });
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

function iapmTblHead() {
  const wrap = el("div", "iapm-nacim-head", []);
  const grid = el("div", "iapm-head-grid", []);

  const hMun = el("div", "iapm-h-cell iapm-h-mun", [document.createTextNode("Municipio")]);

  const hTotal = document.createElement("div");
  hTotal.className = "iapm-h-cell iapm-h-total";
  hTotal.innerHTML =
    '<span class="iapm-h-line">Total</span><br><span class="iapm-h-line">Instituciones</span>';

  const hAdmin = el("div", "iapm-h-cell iapm-h-admin-top", [
    document.createTextNode("Administración"),
  ]);
  const hPer = el("div", "iapm-h-cell iapm-h-personal", [document.createTextNode("Personal")]);
  const hCentral = el("div", "iapm-h-cell iapm-h-sub iapm-h-central", [
    document.createTextNode("Central"),
  ]);
  const hParam = el("div", "iapm-h-cell iapm-h-sub iapm-h-param", [
    document.createTextNode("Paramunicipal"),
  ]);

  grid.append(hMun, hTotal, hAdmin, hPer, hCentral, hParam);
  wrap.append(grid);
  return wrap;
}

function iapmRowFromPayload(r, opts) {
  if (!r) return null;
  const { highlight, mid, ent } = opts || {};
  const cls = [
    "nacim-tbl-row",
    "iapm-tbl-row",
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
    el("div", "nacim-tbl-val iapm-tbl-val", [document.createTextNode(fmtInt(r.total_inst))]),
    el("div", "nacim-tbl-val iapm-tbl-val", [document.createTextNode(fmtInt(r.inst_central))]),
    el("div", "nacim-tbl-val iapm-tbl-val", [document.createTextNode(fmtInt(r.inst_parampal))]),
    el("div", "nacim-tbl-val iapm-tbl-val", [document.createTextNode(fmtInt(r.personal))])
  );
  return row;
}

function tblSectionTitle(text) {
  return el("div", "nacim-tbl-merge iapm-tbl-merge", [document.createTextNode(text)]);
}

function buildFooter() {
  const foot = el("div", "instituciones-admin-publica-viz-foot");
  const p = el("p", "instituciones-admin-publica-viz-fuente", [document.createTextNode(FUENTE)]);
  foot.append(p);
  return foot;
}

/**
 * @param {HTMLElement | null} root
 * @param {any} payload
 */
export function renderInstitucionesAdminPublicaVista(root, payload) {
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

  const wrap = el("div", "instituciones-admin-publica-viz", []);
  const h3 = document.createElement("h3");
  h3.className = "instituciones-admin-publica-viz-title";
  h3.innerHTML =
    `<span class="iapm-title-line">${TITLE_LINE1}</span><br>` +
    `<span class="iapm-title-line">${TITLE_LINE2}</span>`;
  wrap.append(h3);

  const scroll = el("div", "iapm-table-scroll");
  const tbl = el("div", "nacim-tbl iapm-nacim-tbl");

  tbl.append(iapmTblHead());

  if (payload.tabla_nacional) {
    tbl.append(iapmRowFromPayload(payload.tabla_nacional, { ent: true }));
  }
  if (payload.tabla_entidad) {
    tbl.append(iapmRowFromPayload(payload.tabla_entidad, { ent: true }));
  }
  tbl.append(el("div", "iapm-nacim-sep"));
  tbl.append(tblSectionTitle("Municipios con mayor cantidad de instituciones"));
  for (const r of payload.top5 || []) {
    tbl.append(iapmRowFromPayload(r, { highlight: !!r.highlight }));
  }
  if (payload.middle) {
    const midWrap = el("div", "nacim-tbl-middle");
    midWrap.append(iapmRowFromPayload(payload.middle, { mid: true }));
    tbl.append(midWrap);
  }
  tbl.append(tblSectionTitle("Municipios con menor cantidad de instituciones"));
  for (const r of payload.bottom5 || []) {
    tbl.append(iapmRowFromPayload(r, { highlight: !!r.highlight }));
  }

  scroll.append(tbl);
  wrap.append(scroll, buildFooter());
  root.append(wrap);
}
