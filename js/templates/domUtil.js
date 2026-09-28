/** Utilidades DOM compartidas por templates de indicadores (data-driven). */

export function el(tag, className, children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (children) {
    for (const ch of children) {
      if (ch !== null && ch !== undefined) node.append(ch);
    }
  }
  return node;
}

export function fmtValue(n, type) {
  if (n === null || n === undefined || n === "" || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  if (type === "percent") {
    return num.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (type === "float") {
    return num.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return num.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

export function showError(root, payload, className = "poblacion-viz-error") {
  root.innerHTML = "";
  const msg =
    payload && payload.message
      ? String(payload.message)
      : "No se pudo cargar la información.";
  root.append(el("div", className, [document.createTextNode(msg)]));
}

export function normalizeNotes(notes) {
  if (!notes) return [];
  if (Array.isArray(notes)) return notes.filter(Boolean).map(String);
  return [String(notes)];
}

export function appendFooter(wrap, config, className = "ind-dd-fuente") {
  if (config.footer) {
    wrap.append(el("p", className, [document.createTextNode(config.footer)]));
  }
}

export function fieldLabel(config, key) {
  return config.fieldLabels?.[key] || key;
}

export function fieldType(config, key) {
  return config.fieldTypes?.[key] || "integer";
}

export function tableColumns(config) {
  const cols = config.tableColumns || config.fieldKeys || [];
  return cols.filter(Boolean);
}

export function sectionLabels(config) {
  const custom = config.sectionLabels || {};
  const sortLabel = fieldLabel(config, config.sortBy) || "valor";
  const low = String(sortLabel).toLowerCase();
  return {
    top5: custom.top5 || `Municipios con mayor ${low}`,
    bottom5: custom.bottom5 || `Municipios con menor ${low}`,
  };
}

/** N configurado para extremos del ranking (default 5). */
export function resolveRankingSize(config, payload) {
  const fromConfig = Number(config?.rankingSize);
  if (Number.isFinite(fromConfig) && fromConfig > 0) {
    return Math.max(1, Math.min(50, Math.floor(fromConfig)));
  }
  const fromPayload = Number(payload?.ranking_size);
  if (Number.isFinite(fromPayload) && fromPayload > 0) {
    return Math.max(1, Math.min(50, Math.floor(fromPayload)));
  }
  return 5;
}

/** Insignia visual del bloque top/bottom (p. ej. 5+, 10−). */
export function rankingBadge(kind, n) {
  const num = Math.max(1, Number(n) || 5);
  return kind === "top" ? `${num}+` : `${num}−`;
}

/** Variable CSS --ind-rank-n para proporciones del layout top/middle/bottom. */
export function applyRankingSizeCss(root, config, payload) {
  if (!root) return;
  root.style.setProperty("--ind-rank-n", String(resolveRankingSize(config, payload)));
}

/** Encabezado de bloque top/bottom en tablas (título + insignia N+/N−). */
export function rankingSectionHeader(label, kind, rankN) {
  const head = el("div", `nacim-tbl-merge ind-rank-merge ind-rank-merge--${kind}`);
  head.append(
    el("span", "ind-rank-merge__text", [document.createTextNode(label || "")])
  );
  head.append(
    el("span", "ind-rank-badge", [document.createTextNode(rankingBadge(kind, rankN))])
  );
  return head;
}

export function createRankingTableStack() {
  return el("div", "nacim-tbl-rank-stack nacim-tbl-rank-stack--compact");
}

export function createRankingTableSection(kind) {
  return el("div", `nacim-tbl-rank nacim-tbl-rank--${kind}`);
}

/**
 * Bloques top / middle / bottom para tablas municipales (misma N que los gráficos).
 * @param {HTMLElement} tableStack
 * @param {Function} rowRenderer (row, opts) => HTMLElement|null
 */
export function appendRankingTableSections(tableStack, payload, config, rowRenderer) {
  const rankN = resolveRankingSize(config, payload);
  const labels = sectionLabels(config);

  if (payload.top5?.length) {
    const sec = createRankingTableSection("top");
    sec.append(rankingSectionHeader(labels.top5, "top", rankN));
    for (const r of payload.top5) {
      const node = rowRenderer(r, { highlight: !!r.highlight });
      if (node) sec.append(node);
    }
    tableStack.append(sec);
  }
  if (payload.middle) {
    const sec = createRankingTableSection("middle");
    const midWrap = el("div", "nacim-tbl-middle");
    const node = rowRenderer(payload.middle, { mid: true });
    if (node) midWrap.append(node);
    sec.append(midWrap);
    tableStack.append(sec);
  }
  if (payload.bottom5?.length) {
    const sec = createRankingTableSection("bottom");
    sec.append(rankingSectionHeader(labels.bottom5, "bottom", rankN));
    for (const r of payload.bottom5) {
      const node = rowRenderer(r, { highlight: !!r.highlight });
      if (node) sec.append(node);
    }
    tableStack.append(sec);
  }
  return rankN;
}

export function maxMetric(payload, key) {
  let m = 1;
  const consider = (row) => {
    if (!row) return;
    const v = Number(row[key]);
    if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  };
  (payload.top5 || []).forEach(consider);
  (payload.bottom5 || []).forEach(consider);
  consider(payload.middle);
  (payload.states || []).forEach((row) => {
    const v = Number(row?.[key]);
    if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  });
  return m;
}

export function gridStyle(columnCount, opts = {}) {
  // Municipio + N métricas
  const n = Math.max(1, columnCount);
  const wide = opts.wide || n >= 4;
  const nameFr = wide
    ? "minmax(7.5rem, 1.35fr)"
    : n <= 2
      ? "minmax(8rem, 2.2fr)"
      : "minmax(7rem, 1.6fr)";
  const colFr = wide ? "minmax(3.2rem, 0.85fr)" : "minmax(4rem, 1fr)";
  const rest = Array.from({ length: n }, () => colFr).join(" ");
  return {
    display: "grid",
    gridTemplateColumns: `${nameFr} ${rest}`,
    gap: wide ? "0.25rem 0.4rem" : "0.35rem 0.75rem",
  };
}

/** Colores de barras desde presentation.style.colors (claro / oscuro). */
export function applyBarColors(wrap, style = {}) {
  if (!wrap) return;
  const colors = style.colors;
  if (!colors || typeof colors !== "object") return;
  const set = (name, val) => {
    if (val) wrap.style.setProperty(name, String(val));
  };
  const claro = colors.claro || {};
  const oscuro = colors.oscuro || {};
  // Series dobles (ranking_dual_bars: 1.ª / 2.ª columna de bar_metrics)
  set("--ind-color-serie1-claro", claro.serie1 || claro.barra_hl);
  set("--ind-color-serie2-claro", claro.serie2 || claro.barra);
  set("--ind-color-serie1-oscuro", oscuro.serie1 || oscuro.barra_hl);
  set("--ind-color-serie2-oscuro", oscuro.serie2 || oscuro.barra);
  // Una barra + destacada (crecimiento, entidades)
  set("--ind-color-barra-claro", claro.barra || claro.serie2);
  set("--ind-color-barra-hl-claro", claro.barra_hl || claro.serie1);
  set("--ind-color-barra-oscuro", oscuro.barra || oscuro.serie2);
  set("--ind-color-barra-hl-oscuro", oscuro.barra_hl || oscuro.serie1);
  // Agrupadas nacional / estatal / municipio
  set("--ind-color-nacional-claro", claro.nacional);
  set("--ind-color-estatal-claro", claro.estatal);
  set("--ind-color-municipio-claro", claro.municipio);
  set("--ind-color-nacional-oscuro", oscuro.nacional);
  set("--ind-color-estatal-oscuro", oscuro.estatal);
  set("--ind-color-municipio-oscuro", oscuro.municipio);
}

/** Proporción gráfico/tabla desde style.split del preset o catálogo. */
/**
 * Columna de nombres compartida (Población / crecimiento).
 * Mide el texto más largo y fija --ind-name-col en el host.
 */
export function syncRankingNameColumn(host) {
  if (!host) return;
  const names = host.querySelectorAll(".crec-mun-name, .pobl-mun-name");
  let max = 0;
  names.forEach((n) => {
    const w = Math.ceil(n.scrollWidth);
    if (w > max) max = w;
  });
  if (max > 0) {
    host.style.setProperty("--ind-name-col", `${max}px`);
  }
  requestAnimationFrame(() => {
    let max2 = 0;
    names.forEach((n) => {
      const w = Math.ceil(n.scrollWidth);
      if (w > max2) max2 = w;
    });
    if (max2 > 0) {
      host.style.setProperty("--ind-name-col", `${max2}px`);
    }
  });
}

export function applySplitLayout(bodyEl, style = {}, columnCount = 1) {
  if (!bodyEl) return;
  const split = style.split || {};
  const wide = columnCount >= 4;
  const tableMin = split.table_min ?? (wide ? "320px" : "240px");
  const chartMax = split.chart_max ?? (wide ? "32%" : "52%");
  bodyEl.style.setProperty("--ind-split-table-min", String(tableMin));
  bodyEl.style.setProperty("--ind-split-chart-max", String(chartMax));
  bodyEl.classList.add("ind-preset-entity-bars__body");
  if (wide) bodyEl.classList.add("ind-preset-entity-bars__body--wide-table");
}

/**
 * Etiquetas de entidad federativa: ancho según el nombre más largo (p. ej. Veracruz…).
 * Override opcional en presentation.style.split: entity_label_min, entity_label_max, chart_max.
 */
export function applyEntityChartLayout(
  wrap,
  bodyEl,
  style = {},
  { states = [], columnCount = 1 } = {}
) {
  applySplitLayout(bodyEl, style, columnCount);
  if (!wrap) return;

  const split = style.split || {};
  const wide = columnCount >= 4;
  const names = (states || [])
    .map((s) => String(s?.nom_ent || "").trim())
    .filter(Boolean);
  const maxLen = names.reduce((m, n) => Math.max(m, n.length), 0);
  const hasChartMax = split.chart_max != null && String(split.chart_max).trim() !== "";

  let labelMin = split.entity_label_min;
  let labelMax = split.entity_label_max;

  if (!labelMin || !labelMax) {
    if (maxLen >= 28) {
      labelMin = labelMin || "10rem";
      labelMax = labelMax || "38%";
      if (!hasChartMax && !wide) {
        bodyEl.style.setProperty("--ind-split-chart-max", "58%");
      }
    } else if (maxLen >= 20) {
      labelMin = labelMin || "8.25rem";
      labelMax = labelMax || "32%";
      if (!hasChartMax && !wide) {
        bodyEl.style.setProperty("--ind-split-chart-max", "54%");
      }
    } else {
      labelMin = labelMin || "5.5rem";
      labelMax = labelMax || "26%";
    }
  }

  wrap.style.setProperty("--ind-entity-label-min", String(labelMin));
  wrap.style.setProperty("--ind-entity-label-max", String(labelMax));
}
