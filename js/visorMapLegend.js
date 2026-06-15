/**
 * Panel colapsable de simbología en el Visor geográfico.
 * Muestra la leyenda solo de las capas temáticas activas en el panel lateral.
 */
import { getLeafletMap, whenAtlasMapReady } from "./map.js";
import { getActiveVisorLayers } from "./visorLayers.js";
import { RESIDUO_SOLIDO_LEGEND_ITEMS } from "./mapResiduoSolidoIcons.js";
import { LOCS_PUNTO_LEGEND_ITEM } from "./mapLocsPuntoIcons.js";
import { CLUES_LEGEND_ITEM } from "./mapCluesIcons.js";

let _legendRoot = null;
let _legendOpen = false;
let _layoutObserver = null;
let _mapResizeHandler = null;
let _observedAttribEl = null;

/** Separación mínima entre el botón de simbología y la atribución MapLibre. */
const LEGEND_ATTRIB_GAP_PX = 10;

/** @typedef {{ kind: 'chip'|'line'|'circle'|'fill', color: string, label: string, outline?: string }} VisorLegendItem */
/** @typedef {{ kind: 'icon', label: string, svg: string }} VisorLegendIconItem */

/** Catálogo de simbología por id de capa (coincide con VISOR_LAYER_DEFS). */
const VISOR_SYMBOLOGY = {
  locspunto: {
    iconItems: [{ label: LOCS_PUNTO_LEGEND_ITEM.label, svg: LOCS_PUNTO_LEGEND_ITEM.svg }],
  },
  locsatlas: {
    items: [{ kind: "line", color: "#3399ff", label: "Límite de localidad con amanzanamiento" }],
  },
  colonias: {
    items: [{ kind: "line", color: "#990000", label: "Límite de colonia o asentamiento" }],
  },
  ageb_urbanas: {
    items: [{ kind: "line", color: "#990000", label: "AGEB urbana" }],
  },
  ageb_rurales: {
    items: [{ kind: "line", color: "#666600", label: "AGEB rural" }],
  },
  manzanas: {
    items: [
      {
        kind: "fill",
        color: "rgb(245, 225, 145)",
        outline: "rgb(150, 150, 150)",
        label: "Manzana",
      },
    ],
  },
  vialidades: {
    items: [{ kind: "line", color: "rgb(140, 95, 55)", label: "Vialidad municipal" }],
  },
  rnc: {
    items: [
      { kind: "line", color: "rgb(200, 0, 0)", label: "Carretera" },
      { kind: "line", color: "rgb(235, 145, 60)", label: "Periférico" },
      { kind: "line", color: "rgb(0, 0, 0)", label: "Vereda" },
      { kind: "line", color: "rgb(140, 95, 55)", label: "Camino / otro" },
    ],
  },
  saneamiento_agua: {
    items: [{ kind: "circle", color: "#0066cc", label: "Servicio de agua o saneamiento" }],
  },
  clues: {
    iconItems: [{ label: CLUES_LEGEND_ITEM.label, svg: CLUES_LEGEND_ITEM.svg }],
  },
  residuo_solido: {
    iconItems: true,
  },
  hidro_corrientes: {
    items: [
      { kind: "line", color: "rgb(0, 120, 230)", label: "Corriente permanente" },
      { kind: "line", color: "rgb(100, 180, 255)", label: "Corriente intermitente" },
    ],
  },
  hidro_cuerpos: {
    items: [
      { kind: "chip", color: "rgb(0, 160, 255)", label: "Cuerpo de agua permanente" },
      { kind: "chip", color: "rgb(170, 230, 255)", label: "Cuerpo de agua intermitente" },
    ],
  },
  curvas_nivel: {
    items: [
      { kind: "line", color: "#463a30", label: "Curva de nivel" },
      { kind: "line", color: "#231c16", label: "Curva maestra (múltiplo de 1000 m)" },
    ],
  },
  uso_suelo: {
    items: [
      { kind: "chip", color: "rgb(0, 197, 255)", label: "Cuerpo de agua" },
      { kind: "chip", color: "rgb(255, 0, 0)", label: "Asentamientos humanos" },
      { kind: "chip", color: "rgb(255, 255, 190)", label: "Agricultura" },
      { kind: "chip", color: "rgb(38, 115, 0)", label: "Bosque" },
      { kind: "chip", color: "rgb(112, 168, 0)", label: "Selva" },
      { kind: "chip", color: "rgb(204, 204, 204)", label: "Otro uso de suelo" },
    ],
  },
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function swatchHtml(item) {
  if (item.kind === "line") {
    return `<span class="visor-map-legend__swatch visor-map-legend__swatch--line" style="--swatch-color:${item.color}"></span>`;
  }
  if (item.kind === "circle") {
    return `<span class="visor-map-legend__swatch visor-map-legend__swatch--circle" style="background:${item.color}"></span>`;
  }
  if (item.kind === "fill") {
    const outline = item.outline || item.color;
    return `<span class="visor-map-legend__swatch visor-map-legend__swatch--fill" style="background:${item.color};border-color:${outline}"></span>`;
  }
  return `<span class="visor-map-legend__swatch visor-map-legend__chip" style="background:${item.color}"></span>`;
}

function iconSwatchHtml(svg, { large = false } = {}) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const size = large ? 28 : 18;
  const cls = large ? "visor-map-legend__icon visor-map-legend__icon--pin" : "visor-map-legend__icon";
  return `<img class="${cls}" src="${src}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
}

function buildLayerSectionHtml(layerDef) {
  const sym = VISOR_SYMBOLOGY[layerDef.id];
  if (!sym) return "";

  let listHtml = "";
  if (sym.iconItems) {
    const items = sym.iconItems === true ? RESIDUO_SOLIDO_LEGEND_ITEMS : sym.iconItems;
    const largePin = layerDef.id === "locspunto" || layerDef.id === "clues";
    listHtml = items
      .map(
        (item) =>
          `<li>${iconSwatchHtml(item.svg, { large: largePin })}<span>${escapeHtml(item.label)}</span></li>`,
      )
      .join("");
  } else if (sym.items?.length) {
    listHtml = sym.items
      .map((item) => `<li>${swatchHtml(item)}<span>${escapeHtml(item.label)}</span></li>`)
      .join("");
  }
  if (!listHtml) return "";

  return `<section class="visor-map-legend__section">
    <div class="visor-map-legend__title">${escapeHtml(layerDef.label)}</div>
    <ul class="visor-map-legend__list">${listHtml}</ul>
  </section>`;
}

function buildLegendPanelHtml(activeLayers) {
  return activeLayers.map(buildLayerSectionHtml).filter(Boolean).join("");
}

function setLegendPanelOpen(open) {
  _legendOpen = Boolean(open);
  if (!_legendRoot) return;
  const panel = _legendRoot.querySelector(".visor-map-legend__panel");
  const btn = _legendRoot.querySelector(".visor-map-legend__btn");
  if (panel) panel.classList.toggle("d-none", !_legendOpen);
  if (btn) btn.setAttribute("aria-expanded", _legendOpen ? "true" : "false");
}

function teardownLayoutWatchers() {
  _layoutObserver?.disconnect();
  _layoutObserver = null;
  _observedAttribEl = null;
  const map = getLeafletMap();
  if (map && _mapResizeHandler) {
    map.off("resize", _mapResizeHandler);
  }
  _mapResizeHandler = null;
}

/** Coloca la leyenda justo encima de la atribución OSM/MapLibre (sin solaparse). */
function layoutVisorMapLegend(map) {
  if (!_legendRoot?.isConnected || !map) return;

  const container = map.getContainer();
  const attrib = container.querySelector(".maplibregl-ctrl-attrib");
  let bottomPx = 48;

  if (attrib) {
    const cRect = container.getBoundingClientRect();
    const aRect = attrib.getBoundingClientRect();
    if (cRect.height > 0 && aRect.height > 0) {
      bottomPx = Math.ceil(cRect.bottom - aRect.top + LEGEND_ATTRIB_GAP_PX);
    }
  }

  _legendRoot.style.setProperty("--visor-legend-bottom", `${bottomPx}px`);
}

function ensureLayoutWatchers(map) {
  if (!map) return;

  const container = map.getContainer();
  const relayout = () => {
    const attrib = container.querySelector(".maplibregl-ctrl-attrib");
    if (attrib && _layoutObserver && attrib !== _observedAttribEl) {
      if (_observedAttribEl) _layoutObserver.unobserve(_observedAttribEl);
      _layoutObserver.observe(attrib);
      _observedAttribEl = attrib;
    }
    layoutVisorMapLegend(map);
  };

  if (!_layoutObserver) {
    _mapResizeHandler = relayout;
    map.on("resize", _mapResizeHandler);
    _layoutObserver = new ResizeObserver(relayout);
    _layoutObserver.observe(container);
  }

  relayout();
}

function removeLegendControl() {
  teardownLayoutWatchers();
  if (_legendRoot) {
    try {
      _legendRoot.remove();
    } catch (_) {
      /* noop */
    }
  }
  _legendRoot = null;
  _legendOpen = false;
}

function ensureLegendControl(map) {
  if (_legendRoot?.isConnected) return _legendRoot;

  removeLegendControl();

  const wrap = document.createElement("div");
  wrap.className = "visor-map-legend maplibregl-ctrl";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "visor-map-legend__btn";
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML =
    '<span class="visor-map-legend__btn-ico" aria-hidden="true">▤</span><span>Simbología</span>';
  const panel = document.createElement("div");
  panel.className = "visor-map-legend__panel d-none";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Simbología de capas activas");
  const body = document.createElement("div");
  body.className = "visor-map-legend__body";
  panel.appendChild(body);
  wrap.append(btn, panel);
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const bodyEl = wrap.querySelector(".visor-map-legend__body");
    if (!bodyEl?.childElementCount) return;
    setLegendPanelOpen(!_legendOpen);
  });
  map.getContainer().appendChild(wrap);
  _legendRoot = wrap;
  _legendOpen = false;
  return wrap;
}

/** Actualiza el panel según las capas activas del visor. */
export function syncVisorMapLegend() {
  const map = getLeafletMap();
  if (!map) return;

  const activeLayers = getActiveVisorLayers();
  const panelHtml = buildLegendPanelHtml(activeLayers);
  const root = ensureLegendControl(map);
  const body = root.querySelector(".visor-map-legend__body");
  if (!body) return;

  if (!panelHtml) {
    body.innerHTML = "";
    setLegendPanelOpen(false);
  } else {
    const prevOpen = _legendOpen;
    body.innerHTML = panelHtml;
    setLegendPanelOpen(prevOpen);
  }

  ensureLayoutWatchers(map);
  layoutVisorMapLegend(map);
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 20) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  syncVisorMapLegend();
}

export function attachVisorMapLegend() {
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function refreshVisorMapLegend() {
  syncVisorMapLegend();
}

export function teardownVisorMapLegend() {
  removeLegendControl();
}

export function refreshVisorMapLegendLayout() {
  const map = getLeafletMap();
  if (map) layoutVisorMapLegend(map);
}
