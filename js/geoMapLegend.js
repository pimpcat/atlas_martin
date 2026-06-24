/**
 * Panel de simbología en Datos geográficos (pestañas con capas temáticas en el mapa).
 */
import { getLeafletMap, whenAtlasMapReady } from "./map.js";
import { buildLegendPanelHtmlForDefs } from "./visorMapLegend.js";

const LEGEND_ATTRIB_GAP_PX = 10;

/** Pestañas de Datos geográficos que muestran capas en el mapa. */
const GEO_LEGEND_TABS = new Set(["relieve", "clima", "hidrografia", "uso_suelo"]);

/** Capas y títulos de leyenda por pestaña (alineado con syncGeoThematicLayers en map.js). */
const GEO_TAB_LAYER_DEFS = {
  relieve: [{ id: "curvas_nivel", label: "Relieve" }],
  clima: [{ id: "clima", label: "Clima" }],
  hidrografia: [
    { id: "hidro_corrientes", label: "Corrientes de agua" },
    { id: "hidro_cuerpos", label: "Cuerpos de agua" },
  ],
  uso_suelo: [{ id: "uso_suelo", label: "Uso de suelo" }],
};

let _legendRoot = null;
let _legendOpen = false;
let _layoutObserver = null;
let _mapResizeHandler = null;
let _observedAttribEl = null;

function layoutGeoMapLegend(map) {
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
    layoutGeoMapLegend(map);
  };

  if (!_layoutObserver) {
    _mapResizeHandler = relayout;
    map.on("resize", _mapResizeHandler);
    _layoutObserver = new ResizeObserver(relayout);
    _layoutObserver.observe(container);
  }

  relayout();
}

function setLegendPanelOpen(open) {
  _legendOpen = Boolean(open);
  if (!_legendRoot) return;
  const panel = _legendRoot.querySelector(".visor-map-legend__panel");
  const btn = _legendRoot.querySelector(".visor-map-legend__btn");
  if (panel) panel.classList.toggle("d-none", !_legendOpen);
  if (btn) btn.setAttribute("aria-expanded", _legendOpen ? "true" : "false");
  requestAnimationFrame(() => {
    const map = getLeafletMap();
    if (map) layoutGeoMapLegend(map);
  });
}

function removeLegendControl() {
  teardownLayoutWatchers();
  if (_legendRoot) {
    try {
      _legendRoot.remove();
    } catch {
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
  wrap.className = "visor-map-legend geo-map-legend maplibregl-ctrl";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "visor-map-legend__btn";
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML =
    '<span class="visor-map-legend__btn-ico" aria-hidden="true">▤</span><span>Simbología</span>';
  const panel = document.createElement("div");
  panel.className = "visor-map-legend__panel d-none";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Simbología de capas temáticas");
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

function layerDefsForTab(tabId) {
  return GEO_TAB_LAYER_DEFS[tabId] || [];
}

/** Muestra u oculta la simbología según la pestaña activa de Datos geográficos. */
export function syncGeoMapLegend(activeTab, inGeo) {
  const run = () => {
    const map = getLeafletMap();
    if (!map) return;

    const show =
      Boolean(inGeo) && GEO_LEGEND_TABS.has(String(activeTab || "").trim());
    if (!show) {
      removeLegendControl();
      return;
    }

    const layerDefs = layerDefsForTab(activeTab);
    const panelHtml = buildLegendPanelHtmlForDefs(layerDefs);
    if (!panelHtml) {
      removeLegendControl();
      return;
    }

    const root = ensureLegendControl(map);
    const body = root.querySelector(".visor-map-legend__body");
    if (!body) return;

    body.innerHTML = panelHtml;
    setLegendPanelOpen(true);
    ensureLayoutWatchers(map);
    layoutGeoMapLegend(map);
  };

  if (getLeafletMap()) run();
  else whenAtlasMapReady(run);
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 20) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  ensureLayoutWatchers(map);
}

export function attachGeoMapLegend() {
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function refreshGeoMapLegendLayout() {
  const map = getLeafletMap();
  if (map) layoutGeoMapLegend(map);
}

export function teardownGeoMapLegend() {
  removeLegendControl();
}
