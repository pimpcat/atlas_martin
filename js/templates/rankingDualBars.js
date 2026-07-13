/**
 * Barras horizontales por municipio (horizontal_bars / ranking_dual_bars).
 * - N series (bar_metrics), sin límite a 2
 * - Ranking opcional: top / municipio seleccionado / bottom
 */
import { applyBarColors, applyRankingSizeCss, rankingBadge, resolveRankingSize } from "./domUtil.js";

const SERIES_PALETTE = [
  "#6342ff",
  "#d08200",
  "#d160c7",
  "#8906b5",
  "#2a9d96",
  "#1a4971",
  "#c0392b",
  "#27ae60",
];

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

function fmtValue(n, type) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  if (type === "percent") {
    return num.toLocaleString("es-MX", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  if (type === "float") {
    return num.toLocaleString("es-MX", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    });
  }
  return num.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

function fieldType(config, key) {
  return config.fieldTypes?.[key] || "integer";
}

function fieldLabel(config, key, index) {
  if (config.legendLabels?.[index]) return config.legendLabels[index];
  return config.fieldLabels?.[key] || key;
}

function maxDisplayedValues(payload, metrics, ranking) {
  let m = 1;
  const consider = (row) => {
    if (!row) return;
    for (const key of metrics) {
      const v = Number(row[key]);
      if (!Number.isNaN(v)) m = Math.max(m, Math.abs(v));
    }
  };
  if (ranking) {
    (payload.top5 || []).forEach(consider);
    (payload.bottom5 || []).forEach(consider);
  }
  consider(payload.middle);
  return m;
}

function seriesColorVars(config, index) {
  const colors = config.style?.colors || {};
  const claro = colors.claro || {};
  const oscuro = colors.oscuro || {};
  const seriesClaro = Array.isArray(claro.series)
    ? claro.series
    : [claro.serie1, claro.serie2].filter(Boolean);
  const seriesOscuro = Array.isArray(oscuro.series)
    ? oscuro.series
    : [oscuro.serie1, oscuro.serie2].filter(Boolean);
  const fallback = SERIES_PALETTE[index % SERIES_PALETTE.length];
  return {
    claro: seriesClaro[index] || (index === 0 ? claro.barra_hl : claro.barra) || fallback,
    oscuro:
      seriesOscuro[index] || (index === 0 ? oscuro.barra_hl : oscuro.barra) || fallback,
  };
}

function applySeriesColorVars(wrap, config, metrics) {
  applyBarColors(wrap, config.style || {});
  metrics.forEach((_, i) => {
    const { claro, oscuro } = seriesColorVars(config, i);
    wrap.style.setProperty(`--ind-s${i}-claro`, claro);
    wrap.style.setProperty(`--ind-s${i}-oscuro`, oscuro);
  });
}

function barRow(name, row, metrics, maxV, highlight, config) {
  const single = metrics.length === 1;
  const rowEl = el(
    "div",
    `pobl-bar-row${single ? " pobl-bar-row--single" : " pobl-bar-row--multi"}${highlight ? " pobl-bar-row--hl" : ""}`
  );
  const lab = el("div", "pobl-bar-labels");
  lab.append(
    el("div", "pobl-mun-name", [
      document.createTextNode(name && String(name).trim() ? String(name) : "—"),
    ])
  );

  const bars = el(
    "div",
    `pobl-bar-stack${single ? " pobl-bar-stack--single" : ""}`
  );
  const nums = el(
    "div",
    `pobl-bar-nums${single ? " pobl-bar-nums--single" : ""}`
  );

  metrics.forEach((key, i) => {
    const val = row?.[key];
    const num = Number(val);
    const w = maxV > 0 && !Number.isNaN(num) ? Math.round((num / maxV) * 100) : 0;
    const track = el("div", "pobl-bar-track");
    const fill = el("div", "pobl-bar-fill ind-hbar-fill");
    fill.dataset.series = String(i);
    fill.style.width = `${Math.min(100, Math.max(0, w))}%`;
    track.append(fill);
    bars.append(track);
    nums.append(
      el("div", "pobl-bar-num", [
        document.createTextNode(fmtValue(val, fieldType(config, key))),
      ])
    );
  });

  rowEl.append(lab, bars, nums);
  return rowEl;
}

function boxSection(kind, badge, rows, metrics, maxV, config) {
  const wrap = el("div", `pobl-box pobl-box--${kind}`);
  const head = el("div", "pobl-box-head");
  head.append(el("span", "pobl-box-badge", [document.createTextNode(badge)]));
  wrap.append(head);
  const body = el("div", "pobl-box-body");
  for (const r of rows || []) {
    body.append(barRow(r.nom_mun, r, metrics, maxV, !!r.highlight, config));
  }
  wrap.append(body);
  return wrap;
}

function middleSection(row, metrics, maxV, config) {
  const wrap = el("div", "pobl-middle");
  wrap.append(barRow(row.nom_mun, row, metrics, maxV, true, config));
  return wrap;
}

/**
 * @param {HTMLElement} root
 * @param {object} payload
 * @param {object} config
 */
export function renderRankingDualBars(root, payload, config = {}) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message
        ? String(payload.message)
        : "No se pudo cargar la información.";
    root.append(el("div", "poblacion-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const metrics = (config.metrics || config.barMetrics || []).filter(Boolean);
  if (!metrics.length) {
    root.append(
      el("div", "poblacion-viz-error", [
        document.createTextNode(
          "Defina al menos una serie (columnas de las barras) en el catálogo."
        ),
      ])
    );
    return;
  }

  const ranking = config.ranking !== false;
  const rankN = resolveRankingSize(config, payload);
  const maxV = maxDisplayedValues(payload, metrics, ranking);
  const rootClass = config.rootClass || "poblacion-viz";
  const wrap = el("div", `${rootClass} ind-preset-hbar`);
  applySeriesColorVars(wrap, config, metrics);
  applyRankingSizeCss(wrap, config, payload);

  if (config.title) {
    wrap.append(
      el("h3", "poblacion-viz-title", [document.createTextNode(config.title)])
    );
  }

  const body = el("div", "poblacion-viz-body");
  if (ranking) {
    body.append(boxSection("top", rankingBadge("top", rankN), payload.top5, metrics, maxV, config));
    if (payload.middle) {
      body.append(middleSection(payload.middle, metrics, maxV, config));
    }
    body.append(
      boxSection("bottom", rankingBadge("bottom", rankN), payload.bottom5, metrics, maxV, config)
    );
  } else if (payload.middle) {
    body.append(middleSection(payload.middle, metrics, maxV, config));
  } else {
    body.append(
      el("div", "poblacion-viz-error", [
        document.createTextNode(
          "Sin ranking: seleccione un municipio para ver las series."
        ),
      ])
    );
  }
  wrap.append(body);

  const leg = el("div", "poblacion-viz-legend");
  metrics.forEach((key, i) => {
    const sq = el("span", "pobl-leg-sq ind-hbar-leg");
    sq.dataset.series = String(i);
    leg.append(
      el("span", "pobl-leg-item", [
        sq,
        document.createTextNode(` ${fieldLabel(config, key, i)}`),
      ])
    );
  });
  wrap.append(leg);

  if (config.footer) {
    wrap.append(
      el("p", "poblacion-viz-fuente", [document.createTextNode(config.footer)])
    );
  }

  root.append(wrap);
}
