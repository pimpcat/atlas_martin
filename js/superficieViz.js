/**
 * Vista comparativa de superficie municipal (% del estado).
 * Datos desde api.js → superficie_comparativa.php.
 */

function fmtPorcsup(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return (
    Number(n).toLocaleString("es-MX", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 1,
    }) + " %"
  );
}

function maxPorcsupValues({ top5, bottom5, middle }) {
  let m = 0.01;
  const consider = (row) => {
    if (!row) return;
    m = Math.max(m, Math.abs(Number(row.porcsup)) || 0);
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
  const w = maxV > 0 ? Math.round((Number(valor) / maxV) * 100) : 0;

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
  nums.append(el("div", "pobl-bar-num", [document.createTextNode(fmtPorcsup(valor))]));

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
    body.append(barRowSingle(r.nom_mun, r.porcsup, maxV, !!r.highlight));
  }
  wrap.append(body);
  return wrap;
}

function middleSection(row, maxV) {
  const wrap = el("div", "pobl-middle");
  wrap.append(barRowSingle(row.nom_mun, row.porcsup, maxV, true));
  return wrap;
}

/**
 * @param {HTMLElement} root
 * @param {{ ok: boolean, message?: string, top5?: any[], bottom5?: any[], middle?: any }} payload
 * @param {{ compact?: boolean }} [opts]
 */
export function renderSuperficieComparativa(root, payload, opts) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "poblacion-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const compact = opts && opts.compact === true;
  const maxV = maxPorcsupValues(payload);

  const wrap = el("div", "poblacion-viz geo-superficie-viz");
  wrap.append(
    el("h3", "poblacion-viz-title", [
      document.createTextNode("% del territorio estatal por municipio"),
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
      el("span", "pobl-leg-sq pobl-leg-sq--2020"),
      document.createTextNode(" % superficie estatal"),
    ])
  );
  wrap.append(leg);

  if (!compact) {
    wrap.append(
      el("p", "poblacion-viz-fuente", [
        document.createTextNode(
          "Fuente: atlas.12mun · porcentaje de superficie respecto al territorio del estado de Guerrero."
        ),
      ])
    );
  }

  root.append(wrap);
}
