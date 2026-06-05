/**
 * Servicios en viviendas particulares habitadas — barras agrupadas (Nacional + Estatal + municipio).
 * El título largo vive en index.html (.viv-serv-card-heading); aquí gráfica + fuente.
 * Colores: variables CSS en .viv-serv-viz (tema claro/oscuro).
 */

const TITLE =
  "Porcentaje de viviendas particulares habitadas según disponibilidad de principales servicios 2020";
const FOOTER =
  "Fuente: INEGI. Censo de Población y Vivienda 2020. Tabulados interactivos.";

const LABELS = ["Electricidad", "Agua entubada", "Drenaje"];

/** Píxeles libres encima de la barra para dibujar la etiqueta fuera sin recorte. */
const LABEL_OUTSIDE_MIN_GAP = 22;

function fmtPct(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
    return "—";
  }
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function seriesValues(row) {
  if (!row) {
    return [null, null, null];
  }
  return [
    row.por_redo_ener != null ? Number(row.por_redo_ener) : null,
    row.por_redo_agua != null ? Number(row.por_redo_agua) : null,
    row.por_redo_drenaje != null ? Number(row.por_redo_drenaje) : null,
  ];
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

function destroyChartOn(root) {
  const prev = root && root._vivServiciosChart;
  if (prev && typeof prev.destroy === "function") {
    prev.destroy();
  }
  if (root) root._vivServiciosChart = null;
}

function readVivServChartStyle(wrap) {
  const cs = getComputedStyle(wrap);
  const g = (name, fallback) => {
    const v = cs.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    tick: g("--viv-serv-tick", "rgba(248, 250, 252, 0.92)"),
    legend: g("--viv-serv-legend", "rgba(248, 250, 252, 0.9)"),
    grid: g("--viv-serv-grid", "rgba(255, 255, 255, 0.1)"),
    labelAbove: g("--viv-serv-label-above", "rgba(248, 250, 252, 0.95)"),
    labelInside: g("--viv-serv-label-inside", "rgba(255, 255, 255, 0.97)"),
    barNacional: g("--viv-serv-bar-nacional", "#2a6aaf"),
    barNacionalBorder: g("--viv-serv-bar-nacional-border", "#1a4a7a"),
    barEstatal: g("--viv-serv-bar-estatal", "#1a9e96"),
    barEstatalBorder: g("--viv-serv-bar-estatal-border", "#0d5c57"),
    barMunicipio: g("--viv-serv-bar-municipio", "#8a9099"),
    barMunicipioBorder: g("--viv-serv-bar-municipio-border", "#5c636b"),
    barPlaceholder: g("--viv-serv-bar-placeholder", "rgba(136, 140, 148, 0.45)"),
    barPlaceholderBorder: g(
      "--viv-serv-bar-placeholder-border",
      "rgba(220, 225, 232, 0.55)"
    ),
    tooltipBg: g("--viv-serv-tooltip-bg", "rgba(15, 27, 51, 0.94)"),
    tooltipTitle: g("--viv-serv-tooltip-title", "rgba(232, 238, 252, 0.98)"),
    tooltipBody: g("--viv-serv-tooltip-body", "rgba(232, 238, 252, 0.95)"),
    tooltipBorder: g("--viv-serv-tooltip-border", "rgba(255, 255, 255, 0.12)"),
  };
}

/**
 * @param {any} chart
 * @param {HTMLElement} wrap
 */
function applyVivServThemeToChart(chart, wrap) {
  if (!chart || !wrap) return;
  const s = readVivServChartStyle(wrap);
  const scales = chart.options?.scales;
  if (scales?.x?.ticks) scales.x.ticks.color = s.tick;
  if (scales?.y?.ticks) scales.y.ticks.color = s.tick;
  if (scales?.y?.title) scales.y.title.color = s.tick;
  if (scales?.y?.grid) scales.y.grid.color = s.grid;

  const leg = chart.options?.plugins?.legend?.labels;
  if (leg) leg.color = s.legend;

  const tt = chart.options?.plugins?.tooltip;
  if (tt) {
    tt.backgroundColor = s.tooltipBg;
    tt.titleColor = s.tooltipTitle;
    tt.bodyColor = s.tooltipBody;
    tt.borderColor = s.tooltipBorder;
  }

  const ds = chart.data?.datasets;
  if (!ds || ds.length < 3) return;
  ds[0].backgroundColor = s.barNacional;
  ds[0].borderColor = s.barNacionalBorder;
  ds[1].backgroundColor = s.barEstatal;
  ds[1].borderColor = s.barEstatalBorder;
  if (ds[2].borderDash && ds[2].borderDash.length) {
    ds[2].backgroundColor = s.barPlaceholder;
    ds[2].borderColor = s.barPlaceholderBorder;
  } else {
    ds[2].backgroundColor = s.barMunicipio;
    ds[2].borderColor = s.barMunicipioBorder;
  }
}

function barValueLabelsPlugin(fmt, { munMissing, dataMunOriginal }) {
  return {
    id: "vivServiciosBarValueLabels",
    afterDatasetsDraw(chart) {
      const wrap = chart.canvas?.closest?.(".viv-serv-viz");
      const cs = wrap ? getComputedStyle(wrap) : null;
      const labelAbove =
        (cs?.getPropertyValue("--viv-serv-label-above").trim()) ||
        "rgba(248, 250, 252, 0.95)";
      const labelInside =
        (cs?.getPropertyValue("--viv-serv-label-inside").trim()) ||
        "rgba(255, 255, 255, 0.97)";

      const { ctx } = chart;
      const chartArea = chart.chartArea;
      if (!chartArea) return;

      ctx.save();
      ctx.font = "600 13px system-ui, Segoe UI, sans-serif";
      ctx.textAlign = "center";

      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const drawText = (text) => {
            const props = bar.getProps(["x", "y", "base"], true);
            const barTop = Math.min(props.y, props.base);
            const gapTop = barTop - chartArea.top;
            const useInside = gapTop < LABEL_OUTSIDE_MIN_GAP;
            ctx.fillStyle = useInside ? labelInside : labelAbove;
            if (useInside) {
              ctx.textBaseline = "top";
              ctx.fillText(text, props.x, barTop + 5);
            } else {
              ctx.textBaseline = "bottom";
              ctx.fillText(text, props.x, barTop - 6);
            }
          };

          if (di === 2 && munMissing) {
            drawText("—");
            return;
          }
          if (
            di === 2 &&
            (dataMunOriginal[i] === null || dataMunOriginal[i] === undefined)
          ) {
            drawText("—");
            return;
          }
          const raw = ds.data[i];
          if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return;
          drawText(fmt(raw));
        });
      });
      ctx.restore();
    },
  };
}

export function updateViviendaServiciosChartTheme() {
  const root = document.getElementById("viviendaServiciosFullVizRoot");
  const chart = root && root._vivServiciosChart;
  const wrap = root && root.querySelector(".viv-serv-viz");
  if (!chart || !wrap) return;
  applyVivServThemeToChart(chart, wrap);
  chart.update();
}

/**
 * @param {HTMLElement | null} root
 * @param {any} payload
 */
export function renderViviendaServiciosVista(root, payload) {
  if (!root) return;
  destroyChartOn(root);
  root.innerHTML = "";

  if (!payload || payload.ok !== true) {
    const msg =
      payload && payload.message
        ? String(payload.message)
        : "No se pudieron cargar los datos.";
    root.append(
      el("div", "poblacion-viz-error", [document.createTextNode(msg)])
    );
    return;
  }

  const wrap = el("div", "viv-serv-viz", []);
  const chartHost = el("div", "viv-serv-chart-host", []);
  const canvas = document.createElement("canvas");
  canvas.className = "viv-serv-chart-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${TITLE}. Gráfica de barras agrupadas: electricidad, agua entubada y drenaje; comparación nacional, estatal y municipio seleccionado.`
  );
  chartHost.append(canvas);

  const nat = payload.nacional;
  const est = payload.estatal;
  const mun = payload.municipio;
  const munMissing = !mun;
  const munLabel =
    mun && mun.nom_mun
      ? String(mun.nom_mun).trim()
      : "Municipio seleccionado";

  const estLabel =
    est && est.nom_mun ? String(est.nom_mun).trim() : "Estatal";

  const natLabel =
    nat && nat.nom_mun ? String(nat.nom_mun).trim() : "Nacional";

  const dataNat = seriesValues(nat);
  const dataEst = seriesValues(est);
  const dataMunOriginal = seriesValues(mun);
  const dataMunChart = munMissing
    ? [0, 0, 0]
    : dataMunOriginal.map((v) => (v == null ? 0 : v));

  const maxVal = Math.max(
    1,
    ...dataNat.filter((v) => v != null),
    ...dataEst.filter((v) => v != null),
    ...dataMunOriginal.filter((v) => v != null)
  );
  const yMax = Math.min(100, Math.ceil(maxVal / 5) * 5 + 5);

  const ChartCtor = typeof window !== "undefined" ? window.Chart : null;
  if (!ChartCtor) {
    chartHost.innerHTML =
      '<div class="poblacion-viz-error">Chart.js no está disponible.</div>';
    wrap.append(chartHost);
    const footer = el("div", "viv-serv-fuente", [document.createTextNode(FOOTER)]);
    wrap.append(footer);
    root.append(wrap);
    return;
  }

  const s0 = readVivServChartStyle(wrap);

  const datasets = [
    {
      label: natLabel,
      data: dataNat,
      backgroundColor: s0.barNacional,
      borderColor: s0.barNacionalBorder,
      borderWidth: 1,
      borderSkipped: false,
    },
    {
      label: estLabel,
      data: dataEst,
      backgroundColor: s0.barEstatal,
      borderColor: s0.barEstatalBorder,
      borderWidth: 1,
      borderSkipped: false,
    },
    {
      label: munLabel,
      data: dataMunChart,
      backgroundColor: munMissing ? s0.barPlaceholder : s0.barMunicipio,
      borderColor: munMissing ? s0.barPlaceholderBorder : s0.barMunicipioBorder,
      borderWidth: munMissing ? 2 : 1,
      borderDash: munMissing ? [5, 4] : [],
      borderSkipped: false,
      minBarLength: munMissing ? 14 : 6,
    },
  ];

  const ctx = canvas.getContext("2d");
  const chart = new ChartCtor(ctx, {
    type: "bar",
    data: {
      labels: LABELS,
      datasets,
    },
    plugins: [
      barValueLabelsPlugin(fmtPct, { munMissing, dataMunOriginal }),
    ],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      datasets: {
        bar: {
          categoryPercentage: 0.72,
          barPercentage: 0.88,
        },
      },
      layout: {
        padding: {
          top: 6,
          left: 0,
          right: 4,
          bottom: 4,
        },
      },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 12,
            font: { size: 13, weight: "500" },
            color: s0.legend,
            usePointStyle: false,
            boxWidth: 22,
            boxHeight: 12,
          },
        },
        tooltip: {
          backgroundColor: s0.tooltipBg,
          titleColor: s0.tooltipTitle,
          bodyColor: s0.tooltipBody,
          borderColor: s0.tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label(ctx) {
              const di = ctx.datasetIndex;
              const idx = ctx.dataIndex;
              const v = ctx.raw;
              const l = ctx.dataset.label || "";
              if (di === 2 && munMissing) {
                return `${l}: selecciona un municipio en el menú lateral`;
              }
              if (di === 2) {
                const orig = dataMunOriginal[idx];
                if (orig === null || orig === undefined) {
                  return `${l}: —`;
                }
              }
              if (v === null || v === undefined || Number.isNaN(Number(v))) {
                return `${l}: —`;
              }
              return `${l}: ${fmtPct(v)} %`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 13, weight: "600" },
            color: s0.tick,
            maxRotation: 0,
            autoSkip: false,
          },
        },
        y: {
          min: 0,
          max: yMax,
          ticks: {
            callback: (v) => `${v} %`,
            font: { size: 12 },
            color: s0.tick,
          },
          title: {
            display: true,
            text: "Porcentaje",
            font: { size: 12, weight: "600" },
            color: s0.tick,
          },
          grid: { display: true, color: s0.grid },
          border: { display: false },
        },
      },
    },
  });

  const footer = el("div", "viv-serv-fuente", [document.createTextNode(FOOTER)]);

  wrap.append(chartHost, footer);
  root.append(wrap);

  applyVivServThemeToChart(chart, wrap);
  chart.update();

  root._vivServiciosChart = chart;
}
