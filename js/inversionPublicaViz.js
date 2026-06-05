/**
 * Inversión pública ejercida según finalidad 2023 — tabla 6 columnas.
 * Estilo alineado con Características económicas / Superficie agricultura.
 */

const TITLE =
  "Inversión Pública ejercida según finalidad 2023 (Miles de pesos)";

const NOTA =
  "Nota: Este apartado se refiere a la inversión con cobertura estatal y no se muestra el desglose para cada municipio.";
const FUENTE =
  "Fuente: INEGI. México en cifras, Tabulados de Integración, 2024. Cuadro 24.10.";

function fmtIntEnt(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "0";
  const n = Math.round(Number(v));
  return n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

function fmtIntMun(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "-";
  const n = Math.round(Number(v));
  if (n === 0) return "-";
  return n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
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

function invpubTblHead() {
  const head = el("div", "invpub-nacim-head");
  const labels = [
    "Municipio",
    "Total",
    "Gobierno",
    "Desarrollo social",
    "Desarrollo económico",
    "Otras",
  ];
  for (let i = 0; i < labels.length; i += 1) {
    const cell = el("div", "nacim-tbl-h invpub-nacim-h", [
      document.createTextNode(labels[i]),
    ]);
    if (i > 0) cell.classList.add("invpub-nacim-h--num");
    head.append(cell);
  }
  return head;
}

function invpubRowFromPayload(r, opts) {
  if (!r) return null;
  const { highlight, mid, ent } = opts || {};
  const cls = [
    "nacim-tbl-row",
    "invpub-tbl-row",
    highlight ? "nacim-tbl-row--hl" : "",
    mid ? "nacim-tbl-row--mid" : "",
    ent ? "nacim-tbl-row--ent" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const row = el("div", cls);
  const nameCls = ent ? "nacim-tbl-name nacim-tbl-name--ent" : "nacim-tbl-name";
  const fmt = ent ? fmtIntEnt : fmtIntMun;
  row.append(
    el("div", nameCls, [document.createTextNode(r.nom_mun != null ? String(r.nom_mun) : "—")]),
    el("div", "nacim-tbl-val invpub-tbl-val", [document.createTextNode(fmt(r.total_inv))]),
    el("div", "nacim-tbl-val invpub-tbl-val", [document.createTextNode(fmt(r.gob_inv))]),
    el("div", "nacim-tbl-val invpub-tbl-val", [document.createTextNode(fmt(r.desoc_inv))]),
    el("div", "nacim-tbl-val invpub-tbl-val", [document.createTextNode(fmt(r.desec_inv))]),
    el("div", "nacim-tbl-val invpub-tbl-val", [document.createTextNode(fmt(r.otras_inv))])
  );
  return row;
}

function tblSectionTitle(text) {
  return el("div", "nacim-tbl-merge invpub-tbl-merge", [document.createTextNode(text)]);
}

function buildFooter() {
  const foot = el("div", "inversion-publica-viz-foot");
  const p1 = el("p", "inversion-publica-viz-nota", [document.createTextNode(NOTA)]);
  const p2 = el("p", "inversion-publica-viz-fuente", [document.createTextNode(FUENTE)]);
  foot.append(p1, p2);
  return foot;
}

/**
 * @param {HTMLElement | null} root
 * @param {any} payload
 */
export function renderInversionPublicaVista(root, payload) {
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

  const wrap = el("div", "inversion-publica-viz", []);
  wrap.append(
    el("h3", "inversion-publica-viz-title", [document.createTextNode(TITLE)])
  );

  const scroll = el("div", "invpub-table-scroll");
  const tbl = el("div", "nacim-tbl invpub-nacim-tbl");

  tbl.append(invpubTblHead());

  if (payload.tabla_entidad) {
    tbl.append(invpubRowFromPayload(payload.tabla_entidad, { ent: true }));
  }
  tbl.append(el("div", "invpub-nacim-sep"));
  tbl.append(tblSectionTitle("Municipios con mayor inversión pública"));
  for (const r of payload.top5 || []) {
    tbl.append(invpubRowFromPayload(r, { highlight: !!r.highlight }));
  }
  if (payload.middle) {
    const midWrap = el("div", "nacim-tbl-middle");
    midWrap.append(invpubRowFromPayload(payload.middle, { mid: true }));
    tbl.append(midWrap);
  }
  tbl.append(tblSectionTitle("Municipios con menor inversión pública"));
  for (const r of payload.bottom5 || []) {
    tbl.append(invpubRowFromPayload(r, { highlight: !!r.highlight }));
  }

  scroll.append(tbl);
  wrap.append(scroll, buildFooter());
  root.append(wrap);
}
