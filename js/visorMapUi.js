/**
 * Controles de zoom y aviso contextual en el Visor geográfico.
 * Mismo patrón visual que invViv.js (indicador de zoom + hint por capa activa).
 */
import { getLeafletMap, whenAtlasMapReady, syncVisorOverlayLayersFromState } from "./map.js";
import { scheduleVisorCompareSync } from "./visorMapCompare.js";
import { syncVisorMapLegend } from "./visorMapLegend.js";

let _zoomEl = null;
let _hintEl = null;
let _syncHandler = null;
let _getActiveLayersWithMinZoom = () => [];

function mapZoomLevel(map) {
  return typeof map.getZoom === "function" ? map.getZoom() : 0;
}

function pickZoomHint(layers, z) {
  let best = null;
  for (const layer of layers) {
    if (z >= layer.minZ) continue;
    if (!best || layer.minZ > best.minZ) best = layer;
  }
  return best;
}

function syncVisorMapUi() {
  const map = getLeafletMap();
  if (!map || !_zoomEl?.isConnected) return;

  const z = mapZoomLevel(map);
  _zoomEl.textContent = `Zoom ${Math.round(z * 10) / 10}`;
  _zoomEl.style.display = "";

  if (!_hintEl?.isConnected) return;

  const activeLayers = _getActiveLayersWithMinZoom();
  const hint = pickZoomHint(activeLayers, z);
  if (!hint) {
    _hintEl.style.display = "none";
    return;
  }

  _hintEl.textContent = `Acerca el mapa a zoom ${hint.minZ}+ para ver ${hint.label}.`;
  _hintEl.style.display = "";
}

function detachMapHandlers(map) {
  if (map && _syncHandler) {
    map.off("zoom", _syncHandler);
    map.off("zoomend", _syncHandler);
  }
  _syncHandler = null;
}

function removeControlElements() {
  _zoomEl?.remove();
  _hintEl?.remove();
  _zoomEl = null;
  _hintEl = null;
}

function controlsConnected() {
  return Boolean(_zoomEl?.isConnected && _hintEl?.isConnected);
}

function ensureControls(map) {
  if (!map) return;

  if (_zoomEl && !controlsConnected()) {
    detachMapHandlers(map);
    removeControlElements();
  }

  if (_zoomEl) {
    syncVisorMapUi();
    return;
  }

  const zDiv = document.createElement("div");
  zDiv.className = "visor-zoom";
  zDiv.setAttribute("aria-live", "polite");
  map.getContainer().appendChild(zDiv);
  _zoomEl = zDiv;

  const hDiv = document.createElement("div");
  hDiv.className = "visor-hint";
  hDiv.setAttribute("aria-live", "polite");
  map.getContainer().appendChild(hDiv);
  _hintEl = hDiv;

  _syncHandler = () => syncVisorMapUi();
  map.on("zoom", _syncHandler);
  map.on("zoomend", _syncHandler);
  syncVisorMapUi();
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 20) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  ensureControls(map);
}

/**
 * Muestra indicador de zoom y aviso cuando una capa activa requiere más acercamiento.
 * @param {{ getActiveLayersWithMinZoom?: () => Array<{ label: string, minZ: number }> }} [options]
 */
export function attachVisorMapUi(options = {}) {
  _getActiveLayersWithMinZoom =
    typeof options.getActiveLayersWithMinZoom === "function"
      ? options.getActiveLayersWithMinZoom
      : () => [];

  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorMapUi() {
  const map = getLeafletMap();
  detachMapHandlers(map);
  _getActiveLayersWithMinZoom = () => [];
  removeControlElements();
}

/** Llamar al activar/desactivar capas del panel lateral. */
export function notifyVisorLayerToggled() {
  syncVisorOverlayLayersFromState();
  scheduleVisorCompareSync();
  const map = getLeafletMap();
  if (!map) return;
  if (!controlsConnected()) {
    ensureControls(map);
    syncVisorMapLegend();
    return;
  }
  syncVisorMapUi();
  syncVisorMapLegend();
}

/** Re-sincroniza controles tras cambio de municipio o resize del mapa. */
export function refreshVisorMapUi() {
  const map = getLeafletMap();
  if (!map) return;
  ensureControls(map);
  syncVisorMapLegend();
}
