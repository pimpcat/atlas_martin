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
export function fetchSvgText(url) {
  const cached = svgTextCache.get(url);
  if (cached) return cached;
  const promise = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`SVG ${url}: HTTP ${res.status}`);
    return res.text();
  });
  svgTextCache.set(url, promise);
  return promise;
}

/** Carga un SVG desde assets/icons/map/ y lo registra en MapLibre. */
export async function loadSvgFileAsMapSymbol(map, id, filename, rasterPx) {
  const url = atlasMapIconUrl(filename);
  const svg = await fetchSvgText(url);
  return loadSvgAsMapSymbol(map, id, svg, rasterPx);
}

/** Tamaño en px del bitmap (alta resolución para el icon-size máximo). */
export function getSymbolIconRasterPx(displayBasePx, maxIconScale, supersample) {
  return Math.round(displayBasePx * maxIconScale * supersample);
}

/** Convierte icon-size visual (pantalla) al layout con raster de alta resolución. */
export function symbolLayoutIconSize(visualSize, maxIconScale, supersample) {
  return visualSize / (maxIconScale * supersample);
}

/** Registra un SVG rasterizado en el estilo MapLibre (sin pixelRatio). */
export function loadSvgAsMapSymbol(map, id, svg, rasterPx) {
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
        ctx.drawImage(img, 0, 0, rasterPx, rasterPx);
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
