function fmtEdad(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-MX", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

function maxEdadValues({ top5, bottom5, middle }) {
  let m = 1;
  const consider = (row) => {
    if (!row) return;
    m = Math.max(m, Math.abs(Number(row.edad_mediana)) || 0);
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
    el("div", "pobl-mun-name", [document.createTextNode(name && String(name).trim() ? String(name) : "—")])
  );

  const bars = el("div", "pobl-bar-stack pobl-bar-stack--single");
  const track1 = el("div", "pobl-bar-track");
  const fill1 = el("div", "pobl-bar-fill pobl-bar-fill--2020");
  fill1.style.width = `${Math.min(100, w)}%`;
  track1.append(fill1);
  bars.append(track1);

  const nums = el("div", "pobl-bar-nums pobl-bar-nums--single");
  nums.append(el("div", "pobl-bar-num", [document.createTextNode(fmtEdad(valor))]));

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
    body.append(barRowSingle(r.nom_mun, r.edad_mediana, maxV, !!r.highlight));
  }
  wrap.append(body);
  return wrap;
}

function middleSection(row, maxV) {
  const wrap = el("div", "pobl-middle");
  wrap.append(barRowSingle(row.nom_mun, row.edad_mediana, maxV, true));
  return wrap;
}

/**
 * @param {HTMLElement} root
 * @param {{ ok: boolean, message?: string, top5?: any[], bottom5?: any[], middle?: any }} payload
 */
export function renderEdadMedianaComparativa(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg = payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "poblacion-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const maxV = maxEdadValues(payload);

  const wrap = el("div", "poblacion-viz");
  wrap.append(
    el("h3", "poblacion-viz-title", [
      document.createTextNode("Edad mediana por municipio (años)"),
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
      document.createTextNode(" Edad mediana"),
    ])
  );
  wrap.append(leg);

  wrap.append(
    el("p", "poblacion-viz-fuente", [
      document.createTextNode(
        "Nota: Esta medida divide la distribución por edades de una población determinada en dos grupos numéricamente iguales; la mitad de los casos quedan por abajo de la mediana y la otra mitad por encima. Para su cálculo se excluye a la población con edad no especificada."
      ),
      el("br"),
      document.createTextNode(
        "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados del cuestionario básico. Población 4."
      ),
    ])
  );

  root.append(wrap);
}
