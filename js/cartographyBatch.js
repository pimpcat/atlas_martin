/**
 * Lote «Generar todas las localidades» del panel Cartografía.
 * Cola en el navegador: un plano por petición (sin timeouts largos ni carga extra al API).
 * Guardado: carpeta elegida (File System Access: Chrome/Edge/Opera) o ZIP armado aquí.
 */

const AVG_KEY = "grosig.cartography.batchAvgSec";
const DEFAULT_AVG_SEC = { U: 25, R: 12 };
const RATE_LIMIT_WAIT_MS = 15000;
const RATE_LIMIT_RETRIES = 4;

export function canPickFolder() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function loadAverages() {
  try {
    const raw = JSON.parse(localStorage.getItem(AVG_KEY) || "{}");
    return {
      U: Number(raw.U) > 0 ? Number(raw.U) : DEFAULT_AVG_SEC.U,
      R: Number(raw.R) > 0 ? Number(raw.R) : DEFAULT_AVG_SEC.R,
      measured: !!raw.measured,
    };
  } catch {
    return { ...DEFAULT_AVG_SEC, measured: false };
  }
}

function saveAverages(avg) {
  try {
    localStorage.setItem(AVG_KEY, JSON.stringify({ U: avg.U, R: avg.R, measured: true }));
  } catch {
    /* almacenamiento no disponible */
  }
}

function kindOf(item) {
  return item.ambito === "R" ? "R" : "U";
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Estimación antes de empezar: conteos por ámbito y segundos totales. */
export function estimateBatch(items) {
  const avg = loadAverages();
  let urban = 0;
  let rural = 0;
  for (const it of items) {
    if (kindOf(it) === "R") rural += 1;
    else urban += 1;
  }
  return { urban, rural, seconds: urban * avg.U + rural * avg.R, measured: avg.measured };
}

// --- ZIP sin compresión (los PDF ya vienen comprimidos) ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

class ZipBuilder {
  constructor() {
    this.parts = [];
    this.central = [];
    this.offset = 0;
    this.count = 0;
  }

  async add(name, blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const { time, date } = dosDateTime(new Date());

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, this.offset, true);

    this.parts.push(local.buffer, nameBytes, data);
    this.central.push(cen.buffer, nameBytes);
    this.offset += 30 + nameBytes.length + data.length;
    this.count += 1;
  }

  toBlob() {
    const centralSize = this.central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.count, true);
    end.setUint16(10, this.count, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, end.buffer], { type: "application/zip" });
  }
}

// --- Destinos ---

/** Pide la carpeta (debe llamarse dentro del clic del usuario). null si canceló. */
export async function pickFolder() {
  try {
    return await window.showDirectoryPicker({ id: "grosig-planos", mode: "readwrite" });
  } catch (err) {
    if (err?.name === "AbortError") return null;
    throw err;
  }
}

function folderSink(dir) {
  return {
    kind: "folder",
    async save(name, blob) {
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    },
    async finish() {
      return null;
    },
  };
}

function zipSink(zipName) {
  const zip = new ZipBuilder();
  return {
    kind: "zip",
    save: (name, blob) => zip.add(name, blob),
    async finish() {
      if (!zip.count) return null;
      const url = URL.createObjectURL(zip.toBlob());
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return zipName;
    },
  };
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

/**
 * Ejecuta el lote. ``generate(item, signal)`` → { blob, filename }.
 * ``onProgress({ done, total, current, etaSec, ok, failed })``.
 * Devuelve { ok, failed: [{item, message}], cancelled, zipName, aborted }.
 */
export async function runBatch({ items, generate, folder, zipName, onProgress, signal }) {
  const sink = folder ? folderSink(folder) : zipSink(zipName);
  const avg = loadAverages();
  const seen = { U: [], R: [] };
  const failed = [];
  let ok = 0;
  let aborted = "";

  const eta = (fromIndex) => {
    let sec = 0;
    for (let i = fromIndex; i < items.length; i += 1) sec += avg[kindOf(items[i])];
    return sec;
  };

  for (let i = 0; i < items.length; i += 1) {
    if (signal?.aborted) break;
    const item = items[i];
    onProgress?.({ done: i, total: items.length, current: item, etaSec: eta(i), ok, failed: failed.length });
    const t0 = performance.now();
    let attempt = 0;
    for (;;) {
      try {
        const { blob, filename } = await generate(item, signal);
        await sink.save(filename, blob);
        ok += 1;
        const k = kindOf(item);
        seen[k].push((performance.now() - t0) / 1000);
        avg[k] = seen[k].reduce((a, b) => a + b, 0) / seen[k].length;
        break;
      } catch (err) {
        if (signal?.aborted) break;
        if (err?.status === 429 && attempt < RATE_LIMIT_RETRIES) {
          attempt += 1;
          await sleep(RATE_LIMIT_WAIT_MS, signal);
          continue;
        }
        if (err?.status === 401 || err?.status === 403) {
          aborted = "La sesión de administrador expiró; vuelve a iniciar sesión y repite el lote.";
        }
        failed.push({ item, message: err?.message || String(err) });
        break;
      }
    }
    if (aborted) break;
  }

  if (failed.length) {
    const lines = failed.map((f) => `${f.item.cve_loc}\t${f.item.nomgeo}\t${f.message}`);
    const report = new Blob([`Localidades con error (${failed.length})\r\n`, lines.join("\r\n")], {
      type: "text/plain",
    });
    try {
      await sink.save("_errores.txt", report);
    } catch {
      /* el resumen en pantalla ya lista los errores */
    }
  }
  if (seen.U.length || seen.R.length) saveAverages(avg);
  onProgress?.({ done: items.length, total: items.length, current: null, etaSec: 0, ok, failed: failed.length });
  const savedZip = await sink.finish();
  return { ok, failed, cancelled: !!signal?.aborted, zipName: savedZip, aborted };
}
