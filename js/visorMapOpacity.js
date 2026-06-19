/**
 * Control de transparencia global para capas temáticas activas del Visor geográfico.
 */
import {
  countActiveVisorThematicOverlayKeys,
  getLeafletMap,
  getVisorThematicOpacityFactor,
  reapplyVisorThematicOpacityToMap,
  setVisorThematicOpacityFactor,
  whenAtlasMapReady,
} from "./map.js";

let _root = null;
let _panelOpen = false;
let _slider = null;
let _valueEl = null;
let _hintEl = null;
let _layoutObserver = null;
let _legendLayoutObserver = null;
let _mapResizeHandler = null;
let _observedAttribEl = null;
let _observedLegendEl = null;

/** Separación entre controles flotantes del visor (simbología ↔ transparencia). */
const VISOR_MAP_UI_STACK_GAP_PX = 10;

const OPACITY_BTN_HTML = `<span class="visor-map-opacity__btn-ico" aria-hidden="true">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3c-4.5 3.2-7.5 7.4-7.5 12a7.5 7.5 0 0 0 15 0c0-4.6-3-8.8-7.5-12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 3v18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
</span>`;

function transparencyPercentFromFactor(factor) {
  return Math.round((1 - factor) * 100);
}

function factorFromTransparencyPercent(pct) {
  return 1 - Math.max(0, Math.min(100, pct)) / 100;
}

function syncSliderUi() {
  if (!_slider || !_valueEl) return;
  const factor = getVisorThematicOpacityFactor();
  const transparency = transparencyPercentFromFactor(factor);
  _slider.value = String(transparency);
  _slider.disabled = countActiveVisorThematicOverlayKeys() === 0;
  _valueEl.textContent = transparency === 0 ? "Opaco" : `${transparency}% transparente`;
  if (_hintEl) {
    _hintEl.textContent =
      countActiveVisorThematicOverlayKeys() === 0
        ? "Activa capas temáticas para ajustar la transparencia."
        : "Afecta todas las capas activas del panel.";
  }
}

function setPanelOpen(open) {
  _panelOpen = open;
  const panel = _root?.querySelector(".visor-map-opacity__panel");
  const btn = _root?.querySelector(".visor-map-opacity__btn");
  if (!panel || !btn) return;
  panel.classList.toggle("d-none", !open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.classList.toggle("is-open", open);
  if (open) syncSliderUi();
  requestAnimationFrame(() => {
    const map = getLeafletMap();
    if (map) layoutControl(map);
    window.dispatchEvent(new CustomEvent("atlas:visor-map-ui-layout"));
  });
}

function layoutControl(map) {
  if (!_root?.isConnected || !map) return;
  const container = map.getContainer();
  const mapRect = container.getBoundingClientRect();
  const attrib = container.querySelector(".maplibregl-ctrl-attrib");
  const attribRect = attrib?.getBoundingClientRect();
  const legend = container.querySelector(".visor-map-legend");
  const legendRect = legend?.getBoundingClientRect();

  let bottomPx = 48;
  if (attribRect && mapRect.height > 0) {
    bottomPx = Math.max(48, mapRect.bottom - attribRect.top + VISOR_MAP_UI_STACK_GAP_PX);
  }
  if (legendRect && mapRect.height > 0 && legendRect.height > 0) {
    const aboveLegend = mapRect.bottom - legendRect.top + VISOR_MAP_UI_STACK_GAP_PX;
    bottomPx = Math.max(bottomPx, aboveLegend);
  }
  _root.style.setProperty("--visor-opacity-bottom", `${bottomPx}px`);
}

function ensureLayoutWatchers(map) {
  layoutControl(map);
  if (_mapResizeHandler) map.off("resize", _mapResizeHandler);
  _mapResizeHandler = () => layoutControl(map);
  map.on("resize", _mapResizeHandler);

  const container = map.getContainer();
  const attrib = container.querySelector(".maplibregl-ctrl-attrib");
  if (_layoutObserver) _layoutObserver.disconnect();
  _layoutObserver = null;
  _observedAttribEl = null;
  _legendLayoutObserver?.disconnect();
  _legendLayoutObserver = null;
  _observedLegendEl = null;

  if (typeof ResizeObserver !== "undefined") {
    _layoutObserver = new ResizeObserver(() => layoutControl(map));
    _layoutObserver.observe(container);
    if (attrib) {
      _observedAttribEl = attrib;
      _layoutObserver.observe(attrib);
    }
    const legend = container.querySelector(".visor-map-legend");
    if (legend) {
      _observedLegendEl = legend;
      _legendLayoutObserver = new ResizeObserver(() => layoutControl(map));
      _legendLayoutObserver.observe(legend);
      const legendPanel = legend.querySelector(".visor-map-legend__panel");
      if (legendPanel) _legendLayoutObserver.observe(legendPanel);
    }
  }
}

function ensureControl(map) {
  if (_root?.isConnected) {
    syncSliderUi();
    layoutControl(map);
    return _root;
  }

  const wrap = document.createElement("div");
  wrap.className = "visor-map-opacity maplibregl-ctrl";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "visor-map-opacity__btn";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", "Transparencia de capas activas");
  btn.title = "Transparencia de capas activas";
  btn.innerHTML = OPACITY_BTN_HTML;

  const panel = document.createElement("div");
  panel.className = "visor-map-opacity__panel d-none";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Transparencia de capas temáticas");

  const title = document.createElement("div");
  title.className = "visor-map-opacity__title";
  title.textContent = "Transparencia";

  const row = document.createElement("div");
  row.className = "visor-map-opacity__row";

  const minLbl = document.createElement("span");
  minLbl.className = "visor-map-opacity__edge";
  minLbl.textContent = "Opaco";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "visor-map-opacity__slider";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.value = "0";
  slider.setAttribute("aria-valuemin", "0");
  slider.setAttribute("aria-valuemax", "100");
  slider.setAttribute("aria-label", "Nivel de transparencia de capas activas");

  const maxLbl = document.createElement("span");
  maxLbl.className = "visor-map-opacity__edge";
  maxLbl.textContent = "Transparente";

  row.append(minLbl, slider, maxLbl);

  const valueEl = document.createElement("div");
  valueEl.className = "visor-map-opacity__value";
  valueEl.setAttribute("aria-live", "polite");

  const hintEl = document.createElement("p");
  hintEl.className = "visor-map-opacity__hint";

  panel.append(title, row, valueEl, hintEl);
  wrap.append(btn, panel);

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    setPanelOpen(!_panelOpen);
  });

  slider.addEventListener("input", () => {
    const transparency = Number(slider.value);
    setVisorThematicOpacityFactor(factorFromTransparencyPercent(transparency));
    syncSliderUi();
  });

  map.getContainer().appendChild(wrap);
  _root = wrap;
  _slider = slider;
  _valueEl = valueEl;
  _hintEl = hintEl;
  _panelOpen = false;
  syncSliderUi();
  ensureLayoutWatchers(map);
  return wrap;
}

function onUiLayoutChanged() {
  const map = getLeafletMap();
  if (map) layoutControl(map);
}

function onOverlaysChanged() {
  syncSliderUi();
  onUiLayoutChanged();
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 20) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  ensureControl(map);
}

export function attachVisorMapOpacity() {
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
  window.addEventListener("atlas:map-overlays-changed", onOverlaysChanged);
  window.addEventListener("atlas:visor-opacity-changed", syncSliderUi);
  window.addEventListener("atlas:visor-map-ui-layout", onUiLayoutChanged);
}

export function refreshVisorMapOpacity() {
  const map = getLeafletMap();
  if (!map) return;
  ensureControl(map);
  reapplyVisorThematicOpacityToMap(map);
}

export function teardownVisorMapOpacity() {
  window.removeEventListener("atlas:map-overlays-changed", onOverlaysChanged);
  window.removeEventListener("atlas:visor-opacity-changed", syncSliderUi);
  window.removeEventListener("atlas:visor-map-ui-layout", onUiLayoutChanged);
  const map = getLeafletMap();
  if (map && _mapResizeHandler) map.off("resize", _mapResizeHandler);
  _layoutObserver?.disconnect();
  _legendLayoutObserver?.disconnect();
  _layoutObserver = null;
  _legendLayoutObserver = null;
  _observedAttribEl = null;
  _observedLegendEl = null;
  _mapResizeHandler = null;
  _root?.remove();
  _root = null;
  _slider = null;
  _valueEl = null;
  _hintEl = null;
  _panelOpen = false;
  setVisorThematicOpacityFactor(1);
}
