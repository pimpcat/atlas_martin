/**
 * Gráfica de barras principal (Chart.js vía CDN) para indicadores mock.
 * Colores tomados de variables CSS del tema (--chart-js-bar-fill, etc.).
 */

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function accentRgba(alpha) {
  const rgb = cssVar("--accent-rgb", "0, 139, 139");
  return `rgba(${rgb},${alpha})`;
}

function textRgba(alpha) {
  const rgb = cssVar("--text-rgb", "236, 241, 248");
  return `rgba(${rgb},${alpha})`;
}

/**
 * Crea una instancia de Chart.js (una sola vez).
 */
export function ensureChart(canvasEl) {
  const ctx = canvasEl.getContext("2d");

  const tick = textRgba(0.85);
  const grid = cssVar("--chart-axis-grid", "rgba(255, 255, 255, 0.08)");
  const barFill = cssVar("--chart-js-bar-fill", accentRgba(0.35));
  const barStroke = cssVar("--chart-js-bar-stroke", accentRgba(0.85));

  // Chart viene del CDN (window.Chart)
  const chart = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [{
        label: "",
        data: [],
        borderWidth: 1,
        backgroundColor: barFill,
        borderColor: barStroke,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        title: { display: false },
      },
      scales: {
        x: {
          ticks: { color: tick },
          grid: { color: grid },
        },
        y: {
          ticks: { color: tick },
          grid: { color: grid },
        },
      },
    },
  });

  return chart;
}

/**
 * Actualiza la gráfica de barras.
 * Por UX: mostramos Top N (por defecto 10) para que sea legible.
 */
export function updateBarChart(chart, { title, unit, rows, topN = 10 }) {
  const top = (rows || []).slice(0, topN);

  chart.data.labels = top.map((r) => r.municipio);
  chart.data.datasets[0].label = unit ? `${title} (${unit})` : (title || "");
  chart.data.datasets[0].data = top.map((r) => Number(r.valor) || 0);

  chart.update();
}

