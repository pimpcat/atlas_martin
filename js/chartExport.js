/**
 * Fábrica de controladores de exportación (PNG + CSV) para una vista de gráfico.
 * Cada vista (Población, Crecimiento, etc.) crea su propia instancia.
 */

const CSV_SEP = ";";
const CSV_COLS = 5;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function slugify(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

export function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.indexOf(CSV_SEP) !== -1 || /["\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(cells, cols = CSV_COLS) {
  const r = cells.slice(0, cols);
  while (r.length < cols) r.push("");
  return r.map(csvEscape).join(CSV_SEP);
}

export function csvSeparatorHint() {
  return `sep=${CSV_SEP}`;
}

export function formatStamp(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function joinCsv(lines) {
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}

/**
 * @param {{
 *   filenamePrefix: string,
 *   targetSelector: string,
 *   buttons: { png: string, csv: string },
 *   buildCsv: (payload: any, selected: any) => string | null,
 * }} opts
 */
export function createExportController(opts) {
  let lastPayload = null;
  let lastSelected = null;

  function fileBaseName() {
    const mun =
      (lastSelected && (lastSelected.nomgeo || lastSelected.cve_mun)) || "guerrero";
    return `${opts.filenamePrefix}_${slugify(mun)}_${timestamp()}`;
  }

  function downloadCsv() {
    if (!lastPayload || !lastPayload.ok) {
      alert("No hay datos para exportar todavía.");
      return;
    }
    const csv = opts.buildCsv(lastPayload, lastSelected);
    if (!csv) {
      alert("No hay datos para exportar todavía.");
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `${fileBaseName()}.csv`);
  }

  async function downloadPng() {
    const target = document.querySelector(opts.targetSelector);
    if (!target) {
      alert("Aún no hay gráfica para exportar.");
      return;
    }
    if (typeof window.html2canvas !== "function") {
      alert(
        "No se cargó html2canvas (revisa que ./assets/html2canvas.min.js esté disponible)."
      );
      return;
    }

    const btn = document.getElementById(opts.buttons.png);
    if (btn) btn.disabled = true;

    try {
      const root = getComputedStyle(document.documentElement);
      const snap =
        root.getPropertyValue("--export-snapshot-bg").trim() ||
        root.getPropertyValue("--surface").trim() ||
        "#152232";
      const bg =
        getComputedStyle(target.closest(".card") || target).backgroundColor || snap;
      const canvas = await window.html2canvas(target, {
        backgroundColor: bg,
        scale: Math.max(2, window.devicePixelRatio || 1),
        logging: false,
        useCORS: true,
      });
      canvas.toBlob((blob) => {
        if (!blob) {
          alert("No se pudo generar la imagen.");
          return;
        }
        triggerDownload(blob, `${fileBaseName()}.png`);
      }, "image/png");
    } catch (e) {
      console.warn(e);
      alert("Error al generar la imagen: " + (e && e.message ? e.message : e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function setData(payload, selected) {
    lastPayload = payload && payload.ok ? payload : null;
    lastSelected = selected || null;
    const enabled = !!lastPayload;
    const btnPng = document.getElementById(opts.buttons.png);
    const btnCsv = document.getElementById(opts.buttons.csv);
    if (btnPng) btnPng.disabled = !enabled;
    if (btnCsv) btnCsv.disabled = !enabled;
  }

  function attach() {
    const btnPng = document.getElementById(opts.buttons.png);
    const btnCsv = document.getElementById(opts.buttons.csv);
    if (btnPng && !btnPng.dataset.bound) {
      btnPng.addEventListener("click", () => {
        void downloadPng();
      });
      btnPng.dataset.bound = "1";
    }
    if (btnCsv && !btnCsv.dataset.bound) {
      btnCsv.addEventListener("click", () => {
        downloadCsv();
      });
      btnCsv.dataset.bound = "1";
    }
    if (btnPng) btnPng.disabled = true;
    if (btnCsv) btnCsv.disabled = true;
  }

  return { attach, setData };
}
