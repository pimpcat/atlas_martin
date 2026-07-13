/**
 * Template data-driven: chartjs_grouped_bars
 * Estilo del preset (presentation_presets.style) + variables CSS de .viv-serv-viz.
 */
import {
  appendFooter,
  applyBarColors,
  el,
  fieldLabel,
  fieldType,
  fmtValue,
  showError,
} from "./domUtil.js";

const LABEL_OUTSIDE_MIN_GAP = 22;

function destroyChartOn(root) {
  const prev = root && root._indDdChart;
  if (prev && typeof prev.destroy === "function") prev.destroy();
  if (root) root._indDdChart = null;
}

function seriesValues(row, metrics) {
  if (!row) return metrics.map(() => null);
  return metrics.map((key) => (row[key] != null ? Number(row[key]) : null));
}

function readChartStyle(wrap) {
  const cs = getComputedStyle(wrap);
  const g = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    tick: g("--viv-serv-tick", "rgba(248, 250, 252, 0.92)"),
    legend: g("--viv-serv-legend", "rgba(248, 250, 252, 0.9)"),
    labelAbove: g("--viv-serv-label-above", "rgba(248, 250, 252, 0.95)"),
    labelInside: g("--viv-serv-label-inside", "rgba(255, 255, 255, 0.97)"),
    grid: g("--viv-serv-grid", "rgba(255, 255, 255, 0.1)"),
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

function applyThemeToChart(chart, wrap) {
  if (!chart || !wrap) return;
  const s = readChartStyle(wrap);
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
  const ds = chart.data?.datasets || [];
  for (const d of ds) {
    if (d.key === "nacional") {
      d.backgroundColor = s.barNacional;
      d.borderColor = s.barNacionalBorder;
    } else if (d.key === "estatal") {
      d.backgroundColor = s.barEstatal;
      d.borderColor = s.barEstatalBorder;
    } else if (d.key === "municipio") {
      if (d.borderDash?.length) {
        d.backgroundColor = s.barPlaceholder;
        d.borderColor = s.barPlaceholderBorder;
      } else {
        d.backgroundColor = s.barMunicipio;
        d.borderColor = s.barMunicipioBorder;
      }
    }
  }
}

function barValueLabelsPlugin(fmt, { munDatasetIndex, munMissing, dataMunOriginal }) {
  return {
    id: "indDdBarValueLabels",
    afterDatasetsDraw(chart) {
      const wrap = chart.canvas?.closest?.(".viv-serv-viz, .ind-preset-grouped-bars");
      const cs = wrap ? getComputedStyle(wrap) : null;
      const labelAbove =
        cs?.getPropertyValue("--viv-serv-label-above").trim() ||
        "rgba(248, 250, 252, 0.95)";
      const labelInside =
        cs?.getPropertyValue("--viv-serv-label-inside").trim() ||
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
          if (di === munDatasetIndex && munMissing) {
            drawText("—");
            return;
          }
          if (
            di === munDatasetIndex &&
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

function fmtPct(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function renderChartjsGroupedBars(root, payload, config = {}) {
  if (!root) return;
  destroyChartOn(root);
  if (!payload?.ok) {
    showError(root, payload);
    return;
  }

  const metrics =
    (config.chartMetrics?.length ? config.chartMetrics : config.fieldKeys) || [];
  if (!metrics.length) {
    showError(root, { message: "Catálogo sin chart_metrics/fields para la gráfica." });
    return;
  }

  const chartOpts = config.style?.chart || config.chartStyle || {};
  const categoryPercentage = chartOpts.categoryPercentage ?? 0.72;
  const barPercentage = chartOpts.barPercentage ?? 0.88;
  const yTitle = chartOpts.y_title ?? "Porcentaje";
  const ySuffix = chartOpts.y_suffix ?? " %";
  const showValueLabels = chartOpts.value_labels !== false;

  const labels = metrics.map(
    (k, i) => config.legendLabels?.[i] || fieldLabel(config, k)
  );
  const valueType = fieldType(config, metrics[0]);
  const isPct = valueType === "percent" || ySuffix.includes("%");

  const nat = payload.nacional;
  const est = payload.estatal;
  const mun = payload.municipio;
  const munMissing = !mun;
  const ySeries = (config.ySeries || ["nacional", "estatal", "municipio"]).filter(
    (s) => ["nacional", "estatal", "municipio"].includes(s)
  );
  const wantNat = ySeries.includes("nacional");
  const wantEst = ySeries.includes("estatal");
  const wantMun = ySeries.includes("municipio");
  if (!wantNat && !wantEst && !wantMun) {
    showError(root, {
      message: "Elija al menos una serie: país, estado o municipio.",
    });
    return;
  }

  const seriesLabels = config.seriesLabels || [];
  const natLabel =
    seriesLabels[0] ||
    (nat?.nom_mun ? String(nat.nom_mun).trim() : "Nacional");
  const estLabel =
    seriesLabels[1] ||
    (est?.nom_mun ? String(est.nom_mun).trim() : "Estatal");
  const munLabel =
    seriesLabels[2] ||
    (mun?.nom_mun ? String(mun.nom_mun).trim() : "Municipio seleccionado");

  const dataNat = seriesValues(nat, metrics);
  const dataEst = seriesValues(est, metrics);
  const dataMunOriginal = seriesValues(mun, metrics);
  const dataMunChart = munMissing
    ? metrics.map(() => 0)
    : dataMunOriginal.map((v) => (v == null ? 0 : v));

  const fmt = isPct ? fmtPct : (v) => fmtValue(v, valueType);

  // Clase del preset: variables de color + layout del host.
  const rootClass =
    config.rootClass || config.style?.root_class || "viv-serv-viz";
  const wrap = el("div", `${rootClass} ind-preset-grouped-bars`);
  applyBarColors(wrap, config.style || {});
  if (config.title) {
    wrap.append(
      el("h3", "viv-serv-card-heading ind-preset-grouped-bars__title", [
        document.createTextNode(config.title),
      ])
    );
  }

  const chartHost = el("div", "viv-serv-chart-host");
  const canvas = document.createElement("canvas");
  canvas.className = "viv-serv-chart-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", config.title || "Gráfica de barras agrupadas");
  chartHost.append(canvas);
  wrap.append(chartHost);
  appendFooter(wrap, config, "viv-serv-fuente");

  root.innerHTML = "";
  root.append(wrap);

  const ChartCtor = typeof window !== "undefined" ? window.Chart : null;
  if (!ChartCtor) {
    chartHost.innerHTML =
      '<div class="poblacion-viz-error">Chart.js no está disponible.</div>';
    return;
  }

  const s0 = readChartStyle(wrap);
  const maxParts = [1];
  if (wantNat) maxParts.push(...dataNat.filter((v) => v != null));
  if (wantEst) maxParts.push(...dataEst.filter((v) => v != null));
  if (wantMun) maxParts.push(...dataMunOriginal.filter((v) => v != null));
  const maxVal = Math.max(...maxParts);
  const yMax = isPct
    ? Math.min(100, Math.ceil(maxVal / 5) * 5 + 5)
    : Math.ceil(maxVal * 1.1);

  const datasets = [];
  let munDatasetIndex = -1;
  if (wantNat) {
    datasets.push({
      key: "nacional",
      label: natLabel,
      data: dataNat,
      backgroundColor: s0.barNacional,
      borderColor: s0.barNacionalBorder,
      borderWidth: 1,
      borderSkipped: false,
    });
  }
  if (wantEst) {
    datasets.push({
      key: "estatal",
      label: estLabel,
      data: dataEst,
      backgroundColor: s0.barEstatal,
      borderColor: s0.barEstatalBorder,
      borderWidth: 1,
      borderSkipped: false,
    });
  }
  if (wantMun) {
    munDatasetIndex = datasets.length;
    datasets.push({
      key: "municipio",
      label: munLabel,
      data: dataMunChart,
      backgroundColor: munMissing ? s0.barPlaceholder : s0.barMunicipio,
      borderColor: munMissing ? s0.barPlaceholderBorder : s0.barMunicipioBorder,
      borderWidth: munMissing ? 2 : 1,
      borderDash: munMissing ? [5, 4] : [],
      borderSkipped: false,
      minBarLength: munMissing ? 14 : 6,
    });
  }

  const plugins = showValueLabels
    ? [
        barValueLabelsPlugin(fmt, {
          munDatasetIndex,
          munMissing,
          dataMunOriginal,
        }),
      ]
    : [];

  const chart = new ChartCtor(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets },
    plugins,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      datasets: {
        bar: {
          categoryPercentage,
          barPercentage,
        },
      },
      layout: {
        padding: { top: 6, left: 0, right: 4, bottom: 4 },
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
              if (di === munDatasetIndex && munMissing) {
                return `${l}: selecciona un municipio en el menú lateral`;
              }
              if (di === munDatasetIndex) {
                const orig = dataMunOriginal[idx];
                if (orig === null || orig === undefined) return `${l}: —`;
              }
              if (v === null || v === undefined || Number.isNaN(Number(v))) {
                return `${l}: —`;
              }
              return isPct
                ? `${l}: ${fmtPct(v)} %`
                : `${l}: ${fmtValue(v, valueType)}`;
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
            callback: (v) => (isPct ? `${v} %` : fmtValue(v, valueType)),
            font: { size: 12 },
            color: s0.tick,
          },
          title: {
            display: Boolean(yTitle),
            text: yTitle,
            font: { size: 12, weight: "600" },
            color: s0.tick,
          },
          grid: { display: true, color: s0.grid },
          border: { display: false },
        },
      },
    },
  });

  applyThemeToChart(chart, wrap);
  chart.update();
  root._indDdChart = chart;
}

/** Recolorea la gráfica activa al cambiar tema claro/oscuro. */
export function updateGroupedBarsChartTheme() {
  const root = document.getElementById("indicatorFullVizRoot");
  const chart = root && root._indDdChart;
  const wrap =
    root &&
    root.querySelector(".viv-serv-viz, .ind-preset-grouped-bars");
  if (!chart || !wrap) return;
  applyThemeToChart(chart, wrap);
  chart.update();
}
