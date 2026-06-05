/**
 * Características económicas — tabla (Nacional, Estatal, top 5, seleccionado, bottom 5).
 * Estilo alineado con Población ocupada (nacim-tbl, sin rejilla tipo Excel).
 */

const TITLE = "Características económicas por municipios seleccionados 2023";
const SAIC_URL = "https://www.inegi.org.mx/app/saic/default.html";

function fmtInt(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

function fmtProd(v) {
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

function cecoTblHead() {
  const head = el("div", "ceco-nacim-head");
  const hMun = el("div", "nacim-tbl-h ceco-nacim-h", [document.createTextNode("Municipio")]);
  const hUe = el("div", "nacim-tbl-h ceco-nacim-h", [
    document.createTextNode("Unidades económicas"),
  ]);
  const hPers = el("div", "nacim-tbl-h ceco-nacim-h", [
    document.createTextNode("Personal ocupado total"),
  ]);
  const hProd = document.createElement("div");
  hProd.className = "nacim-tbl-h ceco-nacim-h ceco-nacim-h--prod";
  hProd.innerHTML =
    "Producción bruta total<br><span class=\"ceco-nacim-h-subline\">(Millones de pesos)</span>";
  head.append(hMun, hUe, hPers, hProd);
  return head;
}

function cecoRowFromPayload(r, opts) {
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
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.ue))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtInt(r.pers_ocup))]),
    el("div", "nacim-tbl-val", [document.createTextNode(fmtProd(r.prod_brut))])
  );
  return row;
}

function tblSectionTitle(text) {
  return el("div", "nacim-tbl-merge", [document.createTextNode(text)]);
}

function buildFooter() {
  const foot = el("div", "caracteristicas-economicas-viz-foot");
  const p = document.createElement("p");
  p.className = "caracteristicas-economicas-viz-fuente";
  p.appendChild(
    document.createTextNode(
      "Fuente: INEGI. Censos Económicos 2024. Consulta al Sistema Automatizado de Información Censal (SAIC). "
    )
  );
  const a = document.createElement("a");
  a.href = SAIC_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "caracteristicas-economicas-viz-fuente-link";
  a.appendChild(document.createTextNode(SAIC_URL));
  p.appendChild(a);
  p.appendChild(document.createTextNode("."));
  foot.append(p);
  return foot;
}

/**
 * @param {HTMLElement | null} root
 * @param {any} payload
 */
export function renderCaracteristicasEconomicasVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message
        ? String(payload.message)
        : "No se pudieron cargar los datos.";
    root.append(
      el("div", "poblacion-viz-error", [document.createTextNode(msg)])
    );
    return;
  }

  const wrap = el("div", "caracteristicas-economicas-viz", []);
  wrap.append(
    el("h3", "caracteristicas-economicas-viz-title", [
      document.createTextNode(TITLE),
    ])
  );

  const scroll = el("div", "ceco-table-scroll");
  const tbl = el("div", "nacim-tbl ceco-nacim-tbl");

  tbl.append(cecoTblHead());

  if (payload.tabla_nacional) {
    tbl.append(cecoRowFromPayload(payload.tabla_nacional, { ent: true }));
  }
  if (payload.tabla_entidad) {
    tbl.append(cecoRowFromPayload(payload.tabla_entidad, { ent: true }));
  }
  tbl.append(el("div", "ceco-nacim-sep"));
  tbl.append(tblSectionTitle("Municipios con mayor producción"));
  for (const r of payload.top5 || []) {
    tbl.append(cecoRowFromPayload(r, { highlight: !!r.highlight }));
  }
  if (payload.middle) {
    const midWrap = el("div", "nacim-tbl-middle");
    midWrap.append(cecoRowFromPayload(payload.middle, { mid: true }));
    tbl.append(midWrap);
  }
  tbl.append(tblSectionTitle("Municipios con menor producción"));
  for (const r of payload.bottom5 || []) {
    tbl.append(cecoRowFromPayload(r, { highlight: !!r.highlight }));
  }

  scroll.append(tbl);
  wrap.append(scroll, buildFooter());
  root.append(wrap);
}
