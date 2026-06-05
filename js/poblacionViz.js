/**
 * Vista comparativa "Población" (top/bottom 5 + municipio seleccionado, 2010 vs 2020).
 * Renderiza barras en DOM; datos desde api.js → poblacion_comparativa.php.
 */

// --- Utilidades de formato y nodos DOM ---

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

function maxDisplayedValues({ top5, bottom5, middle }) {
  let m = 1;
  const consider = (row) => {
    if (!row) return;
    m = Math.max(m, Number(row.pob_tot_2010) || 0, Number(row.pob_tot) || 0);
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

function barRow(name, v2010, v2020, maxV, highlight) {
  const w2010 = maxV > 0 ? Math.round((Number(v2010) / maxV) * 100) : 0;
  const w2020 = maxV > 0 ? Math.round((Number(v2020) / maxV) * 100) : 0;

  const row = el("div", `pobl-bar-row${highlight ? " pobl-bar-row--hl" : ""}`);
  const lab = el("div", "pobl-bar-labels");
  lab.append(
    el("div", "pobl-mun-name", [document.createTextNode(name && String(name).trim() ? String(name) : "—")])
  );

  const bars = el("div", "pobl-bar-stack");
  const track1 = el("div", "pobl-bar-track");
  const fill1 = el("div", "pobl-bar-fill pobl-bar-fill--2010");
  fill1.style.width = `${Math.min(100, w2010)}%`;
  track1.append(fill1);
  const track2 = el("div", "pobl-bar-track");
  const fill2 = el("div", "pobl-bar-fill pobl-bar-fill--2020");
  fill2.style.width = `${Math.min(100, w2020)}%`;
  track2.append(fill2);
  bars.append(track1, track2);

  const nums = el("div", "pobl-bar-nums");
  const n1 = el("div", "pobl-bar-num", [document.createTextNode(fmtNum(v2010))]);
  const n2 = el("div", "pobl-bar-num", [document.createTextNode(fmtNum(v2020))]);
  nums.append(n1, n2);

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
    body.append(barRow(r.nom_mun, r.pob_tot_2010, r.pob_tot, maxV, !!r.highlight));
  }
  wrap.append(body);
  return wrap;
}

function middleSection(row, maxV) {
  const wrap = el("div", "pobl-middle");
  wrap.append(barRow(row.nom_mun, row.pob_tot_2010, row.pob_tot, maxV, true));
  return wrap;
}

/**
 * Pinta la comparativa en un contenedor vacío.
 * @param {HTMLElement} root
 * @param {{ ok: boolean, message?: string, top5?: any[], bottom5?: any[], middle?: any }} payload
 */
export function renderPoblacionComparativa(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg = payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "poblacion-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const maxV = maxDisplayedValues(payload);

  const wrap = el("div", "poblacion-viz");
  wrap.append(
    el("h3", "poblacion-viz-title", [
      document.createTextNode("Población total por municipios seleccionados 2010 y 2020"),
    ])
  );

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
      el("span", "pobl-leg-sq pobl-leg-sq--2010"),
      document.createTextNode(" 2010"),
    ]),
    el("span", "pobl-leg-item", [
      el("span", "pobl-leg-sq pobl-leg-sq--2020"),
      document.createTextNode(" 2020"),
    ])
  );
  wrap.append(leg);

  wrap.append(
    el("p", "poblacion-viz-fuente", [
      document.createTextNode(
        "Fuente: INEGI. Censos de Población y Vivienda 2010 y 2020. Tabulados del cuestionario básico. Población 2."
      ),
    ])
  );

  root.append(wrap);
}
