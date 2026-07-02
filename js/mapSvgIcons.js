/**
 * Utilidades para iconos symbol de MapLibre.
 * maplibre-gl-export ignora pixelRatio en addImage; el tamaño en pantalla
 * debe controlarse solo con icon-size y un raster sin pixelRatio.
 */

/** @type {Map<string, Promise<string>>} */
const svgTextCache = new Map();

/** URL pública de un icono SVG del visor (assets/icons/map/). */
export function atlasMapIconUrl(filename) {
  return new URL(`../assets/icons/map/${filename}`, import.meta.url).href;
}

/** Descarga texto SVG con caché en memoria (mismo origen). */
export function fetchSvgText(url, options = {}) {
  const bust = options.cacheBust ? `?v=${encodeURIComponent(String(options.cacheBust))}` : "";
  const fetchUrl = bust && !url.includes("?") ? `${url}${bust}` : url;
  const cacheKey = fetchUrl;
  const cached = svgTextCache.get(cacheKey);
  if (cached) return cached;
  const promise = fetch(fetchUrl, { cache: options.cacheBust ? "no-store" : "default" }).then((res) => {
    if (!res.ok) throw new Error(`SVG ${fetchUrl}: HTTP ${res.status}`);
    return res.text();
  });
  svgTextCache.set(cacheKey, promise);
  return promise;
}

export function invalidateSvgFileCache(filename) {
  const base = atlasMapIconUrl(filename);
  for (const key of [...svgTextCache.keys()]) {
    if (key === base || key.startsWith(`${base}?`)) svgTextCache.delete(key);
  }
}

/** Carga un SVG desde assets/icons/map/ y lo registra en MapLibre. */
export async function loadSvgFileAsMapSymbol(map, id, filename, rasterPx, options = {}) {
  const url = atlasMapIconUrl(filename);
  const svg = await fetchSvgText(url, { cacheBust: options.cacheBust });
  return loadSvgAsMapSymbol(map, id, svg, rasterPx, options);
}

/** Tamaño en px del bitmap (alta resolución para el icon-size máximo). */
export function getSymbolIconRasterPx(displayBasePx, maxIconScale, supersample) {
  return Math.round(displayBasePx * maxIconScale * supersample);
}

/** Convierte icon-size visual (pantalla) al layout con raster de alta resolución. */
export function symbolLayoutIconSize(visualSize, maxIconScale, supersample) {
  return visualSize / (maxIconScale * supersample);
}

/**
 * Rasteriza SVG en textura cuadrada para MapLibre.
 * Conserva proporción y alinea al fondo (icon-anchor: bottom en presets de pin).
 */
export function loadSvgAsMapSymbol(map, id, svg, rasterPx, options = {}) {
  const anchor = options.textureAnchor || "bottom";
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = rasterPx;
        canvas.height = rasterPx;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
          reject(new Error("Canvas 2D no disponible"));
          return;
        }
        ctx.clearRect(0, 0, rasterPx, rasterPx);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        const iw = img.naturalWidth || rasterPx;
        const ih = img.naturalHeight || rasterPx;
        const scale = Math.min(rasterPx / iw, rasterPx / ih);
        const drawW = iw * scale;
        const drawH = ih * scale;
        const ox = (rasterPx - drawW) / 2;
        let oy = (rasterPx - drawH) / 2;
        if (anchor === "bottom") oy = rasterPx - drawH;
        else if (anchor === "top") oy = 0;
        ctx.drawImage(img, ox, oy, drawW, drawH);
        if (map.hasImage(id)) map.removeImage(id);
        map.addImage(id, ctx.getImageData(0, 0, rasterPx, rasterPx), { sdf: false });
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`No se pudo cargar icono ${id}`));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
