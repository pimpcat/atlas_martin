/**
 * Unidades económicas (DENUE) — barras top 5 / municipio seleccionado / bottom 5 (ue_den).
 * Misma estructura visual que Edad mediana (.poblacion-viz).
 */

const TITLE = "Unidades económicas por municipios seleccionados 2025";
const FOOTER =
  "Fuente: INEGI. Directorio Estadístico Nacional de Unidades Económicas (DENUE) Interactivo, mayo 2025.";

function fmtUe(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

function maxUeDenValues({ top5, bottom5, middle }) {
  let m = 1;
  const consider = (row) => {
    if (!row || row.ue_den == null) return;
    m = Math.max(m, Math.abs(Number(row.ue_den)) || 0);
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

function barRowSingle(name, valor, maxV, highlight) {
  const num = Number(valor);
  const w = maxV > 0 && !Number.isNaN(num) ? Math.round((num / maxV) * 100) : 0;

  const row = el("div", `pobl-bar-row${highlight ? " pobl-bar-row--hl" : ""}`);
  const lab = el("div", "pobl-bar-labels");
  lab.append(
    el("div", "pobl-mun-name", [
      document.createTextNode(name && String(name).trim() ? String(name) : "—"),
    ])
  );

  const bars = el("div", "pobl-bar-stack pobl-bar-stack--single");
  const track1 = el("div", "pobl-bar-track");
  const fill1 = el("div", "pobl-bar-fill pobl-bar-fill--2020");
  fill1.style.width = `${Math.min(100, w)}%`;
  track1.append(fill1);
  bars.append(track1);

  const nums = el("div", "pobl-bar-nums pobl-bar-nums--single");
  nums.append(el("div", "pobl-bar-num", [document.createTextNode(fmtUe(valor))]));

  row.append(lab, bars, nums);
  return row;
}

function boxSection(kind, badge, rows, maxV) {
  const wrap = el("div", `pobl-box pobl-box--${kind}`);
  const head = el("div", "pobl-box-head");
  head.append(el("span", "pobl-box-badge", [document.createTextNode(badge)]));
  wrap.append(head);

  const body = el("div", "pobl-box-body");
  for (const r of rows || []) {
    body.append(barRowSingle(r.nom_mun, r.ue_den, maxV, !!r.highlight));
  }
  wrap.append(body);
  return wrap;
}

function middleSection(row, maxV) {
  const wrap = el("div", "pobl-middle");
  wrap.append(barRowSingle(row.nom_mun, row.ue_den, maxV, true));
  return wrap;
}

/**
 * @param {HTMLElement} root
 * @param {{ ok: boolean, message?: string, top5?: any[], bottom5?: any[], middle?: any }} payload
 */
export function renderUnidadesEconomicasVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "poblacion-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const maxV = maxUeDenValues(payload);

  const wrap = el("div", "poblacion-viz ue-economicas-viz");
  wrap.append(el("h3", "poblacion-viz-title", [document.createTextNode(TITLE)]));

  const body = el("div", "poblacion-viz-body");
  body.append(boxSection("top", "5+", payload.top5, maxV));
  if (payload.middle) {
    body.append(middleSection(payload.middle, maxV));
  }
  body.append(boxSection("bottom", "5−", payload.bottom5, maxV));
  wrap.append(body);

  const leg = el("div", "poblacion-viz-legend");
  leg.append(
    el("span", "pobl-leg-item", [
      el("span", "pobl-leg-sq pobl-leg-sq--2020"),
      document.createTextNode(" Unidades económicas (DENUE)"),
    ])
  );
  wrap.append(leg);

  wrap.append(el("p", "poblacion-viz-fuente", [document.createTextNode(FOOTER)]));

  root.append(wrap);
}
