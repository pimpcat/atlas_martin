/**
 * Fábrica de controladores de exportación (PNG + CSV/XLSX) para una vista de gráfico.
 * Cada vista (Población, Crecimiento, etc.) crea su propia instancia.
 *
 * Fase 4: si se pasa ``backendExport.indicatorId``, CSV/XLSX se descargan desde
 * ``GET /api/indicators/{id}/export`` (openpyxl en FastAPI). PNG sigue en cliente.
 */

import { apiUrl } from "./atlasConfig.js";

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

function filenameFromDisposition(header, fallback) {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(header);
  if (!m) return fallback;
  try {
    return decodeURIComponent(m[1].replace(/["']/g, "").trim());
  } catch {
    return m[1].replace(/["']/g, "").trim() || fallback;
  }
}

/**
 * @param {{
 *   filenamePrefix: string,
 *   targetSelector: string,
 *   buttons: { png?: string, csv?: string, xlsx?: string },
 *   buildCsv?: (payload: any, selected: any) => string | null,
 *   backendExport?: { indicatorId: string },
 * }} opts
 */
export function createExportController(opts) {
  let lastPayload = null;
  let lastSelected = null;

  function fileBaseName() {
    const mun =
      (lastSelected && (lastSelected.nomgeo || lastSelected.cve_mun)) || "guerrero";
    const prefix =
      typeof opts.filenamePrefix === "function"
        ? opts.filenamePrefix()
        : opts.filenamePrefix;
    return `${prefix || "indicador"}_${slugify(mun)}_${timestamp()}`;
  }

  async function downloadBackend(format, btnId) {
    const indicatorId = opts.backendExport?.indicatorId;
    if (!indicatorId) {
      alert("Exportación backend no configurada.");
      return;
    }
    if (!lastPayload || !lastPayload.ok) {
      alert("No hay datos para exportar todavía.");
      return;
    }

    const btn = btnId ? document.getElementById(btnId) : null;
    if (btn) btn.disabled = true;

    try {
      const url = new URL(
        apiUrl(`/api/indicators/${encodeURIComponent(indicatorId)}/export`),
        window.location.href
      );
      url.searchParams.set("format", format);
      if (lastSelected?.cve_mun) {
        url.searchParams.set("cve_mun", String(lastSelected.cve_mun));
        if (lastSelected.nomgeo) {
          url.searchParams.set("nom_mun", String(lastSelected.nomgeo));
        }
      }
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          const d = body?.detail;
          msg = (d && (d.message || d.error)) || body?.message || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const fallback = `${fileBaseName()}.${format === "csv" ? "csv" : "xlsx"}`;
      const filename = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        fallback
      );
      triggerDownload(blob, filename);
    } catch (e) {
      console.warn(e);
      alert("Error al exportar: " + (e && e.message ? e.message : e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function downloadCsvLocal() {
    if (!lastPayload || !lastPayload.ok) {
      alert("No hay datos para exportar todavía.");
      return;
    }
    if (typeof opts.buildCsv !== "function") {
      alert("Exportación CSV no disponible.");
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

  function downloadCsv() {
    if (opts.backendExport?.indicatorId) {
      void downloadBackend("csv", opts.buttons?.csv);
      return;
    }
    downloadCsvLocal();
  }

  function downloadXlsx() {
    if (opts.backendExport?.indicatorId) {
      void downloadBackend("xlsx", opts.buttons?.xlsx);
      return;
    }
    alert("Exportación Excel no disponible para esta vista.");
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
    for (const key of ["png", "csv", "xlsx"]) {
      const id = opts.buttons?.[key];
      if (!id) continue;
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !enabled;
    }
  }

  function attach() {
    const btnPng = opts.buttons?.png
      ? document.getElementById(opts.buttons.png)
      : null;
    const btnCsv = opts.buttons?.csv
      ? document.getElementById(opts.buttons.csv)
      : null;
    const btnXlsx = opts.buttons?.xlsx
      ? document.getElementById(opts.buttons.xlsx)
      : null;

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
    if (btnXlsx && !btnXlsx.dataset.bound) {
      btnXlsx.addEventListener("click", () => {
        downloadXlsx();
      });
      btnXlsx.dataset.bound = "1";
    }
    if (btnPng) btnPng.disabled = true;
    if (btnCsv) btnCsv.disabled = true;
    if (btnXlsx) btnXlsx.disabled = true;
  }

  return { attach, setData };
}
