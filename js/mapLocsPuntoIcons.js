/**
 * Icono MapLibre para localidades (c_loc_punto) — chincheta de ubicación.
 */

export const LOCS_PUNTO_ICON = "atlas-locs-punto-pin";

export const LOCS_PUNTO_SYMBOL_LAYOUT = {
  "icon-image": LOCS_PUNTO_ICON,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 1.38, 12, 1.8, 16, 2.25, 20, 2.63],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
  "icon-anchor": "bottom",
  "icon-offset": [0, 8],
};

export const LOCS_PUNTO_SYMBOL_PAINT = {
  "icon-opacity": 0.96,
};

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 2.5C10.75 2.5 6.5 6.75 6.5 12c0 6.75 9.5 16.5 9.5 16.5S25.5 18.75 25.5 12c0-5.25-4.25-9.5-9.5-9.5z" fill="#e65100" stroke="#ffffff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="16" cy="11.5" r="3.8" fill="#ffffff"/>
  <circle cx="16" cy="11.5" r="2" fill="#ff9800"/>
</svg>`;

/** Tamaño lógico del viewBox SVG (32×32). */
const ICON_LOGICAL_PX = 32;
const ICON_MAX_SCALE = 2.63;
const ICON_SUPERSAMPLE = 3;

function getIconRasterConfig() {
  const dpr =
    typeof window !== "undefined"
      ? Math.min(Math.max(window.devicePixelRatio || 1, 2), 3)
      : 2;
  const displayBase = ICON_LOGICAL_PX / 2;
  const rasterPx = Math.round(displayBase * ICON_MAX_SCALE * dpr * ICON_SUPERSAMPLE);
  return {
    rasterPx,
    pixelRatio: rasterPx / displayBase,
  };
}

function loadSvgAsMapImage(map, id, svg) {
  const { rasterPx, pixelRatio } = getIconRasterConfig();
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
        map.addImage(id, ctx.getImageData(0, 0, rasterPx, rasterPx), {
          pixelRatio,
          sdf: false,
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`No se pudo cargar icono ${id}`));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

const LOCS_PUNTO_ICONS_VERSION = 4;

/** Registra la chincheta en el estilo MapLibre (idempotente). */
export async function ensureLocsPuntoMapIcons(map) {
  if (!map) return;
  if (map.__atlasLocsPuntoIconsVersion === LOCS_PUNTO_ICONS_VERSION) return;
  await loadSvgAsMapImage(map, LOCS_PUNTO_ICON, PIN_SVG);
  map.__atlasLocsPuntoIconsVersion = LOCS_PUNTO_ICONS_VERSION;
}

export function locsPuntoLayerUsesLegacyCircle(map) {
  if (!map?.getStyle?.()?.layers) return false;
  const layer = map.getStyle().layers.find((l) => l.id === "ly-locsPunto");
  return layer?.type === "circle";
}

/** Entrada para la leyenda del visor geográfico. */
export const LOCS_PUNTO_LEGEND_ITEM = {
  label: "Localidad",
  svg: PIN_SVG,
};
