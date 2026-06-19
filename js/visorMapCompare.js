/**
 * Comparador de mapas base en el Visor geográfico (maplibre-gl-compare).
 *
 * Izquierda: OpenStreetMap · Derecha: INEGI.
 * Las capas vectoriales activas se replican en ambos mapas; solo cambia el raster base.
 *
 * @see assets/maplibre-gl-compare.js · css/maplibre-gl-compare.css
 */
import {
  bindAtlasOverlayTips,
  createCompareMapInstance,
  getLeafletMap,
  registerCompareOverlaySyncHook,
  reapplyVisorThematicOpacityToMap,
  setMapBaseLayer,
  syncVisorOverlayLayersOnMap,
  whenAtlasMapReady,
} from "./map.js";

let _toggleBtn = null;
let _labelsEl = null;
let _compareHost = null;
let _comparePaneB = null;
let _compareMap = null;
let _compareCtrl = null;
let _active = false;
let _savedBase = null;
let _styleSyncHandler = null;
let _resizeHandler = null;
let _dragEndHandler = null;
let _pointerMoveHandler = null;
let _pointerLeaveHandler = null;
let _lastPointerClientX = 0;
let _compareOpGen = 0;
let _enablePromise = null;
let _syncCompareRaf = 0;
let _opacitySyncHandler = null;

function getCompareDividerX() {
  if (!_compareHost) return 0;
  const rect = _compareHost.getBoundingClientRect();
  const divider = _compareCtrl?.currentPosition;
  if (typeof divider === "number" && divider > 0) return rect.left + divider;
  return rect.left + rect.width / 2;
}

function updateCompareHitTarget(clientX) {
  if (!_active || !_compareHost || !_compareMap) return;
  _lastPointerClientX = clientX;
  const primary = getLeafletMap();
  const primaryEl = primary?.getContainer?.();
  const secondaryEl = _compareMap.getContainer?.();
  if (!primaryEl || !secondaryEl) return;

  const onLeft = clientX < getCompareDividerX();

  primaryEl.style.pointerEvents = onLeft ? "auto" : "none";
  secondaryEl.style.pointerEvents = onLeft ? "none" : "auto";
}

function bindComparePointerRouting() {
  unbindComparePointerRouting();
  if (!_compareHost) return;

  _pointerMoveHandler = (e) => updateCompareHitTarget(e.clientX);
  _pointerLeaveHandler = () => {
    updateCompareHitTarget(_lastPointerClientX || getCompareDividerX());
  };

  _compareHost.addEventListener("mousemove", _pointerMoveHandler);
  _compareHost.addEventListener("wheel", _pointerMoveHandler, { passive: true });
  _compareHost.addEventListener("mouseleave", _pointerLeaveHandler);
  updateCompareHitTarget(getCompareDividerX());
}

function unbindComparePointerRouting() {
  if (_compareHost && _pointerMoveHandler) {
    _compareHost.removeEventListener("mousemove", _pointerMoveHandler);
    _compareHost.removeEventListener("wheel", _pointerMoveHandler);
  }
  if (_compareHost && _pointerLeaveHandler) {
    _compareHost.removeEventListener("mouseleave", _pointerLeaveHandler);
  }
  _pointerMoveHandler = null;
  _pointerLeaveHandler = null;

  const primary = getLeafletMap()?.getContainer?.();
  if (primary) primary.style.pointerEvents = "";
  if (_compareMap) _compareMap.getContainer().style.pointerEvents = "";
}

function bindCompareOverlayTips() {
  if (_compareMap) bindAtlasOverlayTips(_compareMap);
}

function bindCompareDragNoSelect() {
  unbindCompareDragNoSelect();
  const swiper = _compareHost?.querySelector(".compare-swiper-vertical, .compare-swiper-horizontal");
  if (!swiper) return;

  const onDown = () => {
    document.body.classList.add("visor-compare-dragging");
  };
  const onUp = () => {
    document.body.classList.remove("visor-compare-dragging");
    updateCompareHitTarget(_lastPointerClientX || getCompareDividerX());
  };

  swiper.addEventListener("mousedown", onDown);
  swiper.addEventListener("touchstart", onDown, { passive: true });
  const onDragMove = (e) => {
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    if (typeof x === "number") updateCompareHitTarget(x);
  };
  swiper.addEventListener("touchmove", onDragMove, { passive: true });
  _dragEndHandler = onUp;
  document.addEventListener("mouseup", onUp);
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("touchend", onUp);
  document.addEventListener("touchcancel", onUp);
  swiper.__atlasCompareOnDown = onDown;
  swiper.__atlasCompareOnDragMove = onDragMove;
}

function unbindCompareDragNoSelect() {
  document.body.classList.remove("visor-compare-dragging");
  const swiper = _compareHost?.querySelector(".compare-swiper-vertical, .compare-swiper-horizontal");
  if (swiper?.__atlasCompareOnDown) {
    swiper.removeEventListener("mousedown", swiper.__atlasCompareOnDown);
    swiper.removeEventListener("touchstart", swiper.__atlasCompareOnDown);
    delete swiper.__atlasCompareOnDown;
  }
  if (swiper?.__atlasCompareOnDragMove) {
    swiper.removeEventListener("touchmove", swiper.__atlasCompareOnDragMove);
    document.removeEventListener("mousemove", swiper.__atlasCompareOnDragMove);
    delete swiper.__atlasCompareOnDragMove;
  }
  if (_dragEndHandler) {
    document.removeEventListener("mouseup", _dragEndHandler);
    document.removeEventListener("touchend", _dragEndHandler);
    document.removeEventListener("touchcancel", _dragEndHandler);
    _dragEndHandler = null;
  }
}

function getCompareCtor() {
  const ml = typeof maplibregl !== "undefined" ? maplibregl : window.maplibregl;
  return ml?.Compare || null;
}

/** Contenedor externo al mapa (no recibe clip del comparador). */
function getMapUiShell() {
  const map = getLeafletMap();
  const container = map?.getContainer?.();
  if (!container) return null;
  return (
    container.closest(".visor-map-frame-wrap") ||
    container.closest(".map-frame-wrap") ||
    container.parentElement ||
    container
  );
}

function viewState(map) {
  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

function applySideBase(map, baseKey) {
  if (!map?.getStyle()?.layers) return;
  for (const layer of map.getStyle().layers) {
    if (!layer.id.startsWith("base-")) continue;
    let visible = false;
    if (baseKey === "osm") visible = layer.id === "base-osm";
    else if (baseKey === "inegi") visible = layer.id === "base-inegi";
    try {
      map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
    } catch {
      /* capa ausente en clon */
    }
  }
}

/** Quita controles compare huérfanos (p. ej. doble clic rápido en el botón). */
function removeOrphanCompareControls(host) {
  if (!host) return;
  host.querySelectorAll(".maplibregl-compare").forEach((el) => el.remove());
}

function clearComparePaneMaps(pane) {
  if (!pane) return;
  pane.querySelectorAll(".maplibregl-map").forEach((el) => el.remove());
}

function clearMapClips() {
  const primary = getLeafletMap();
  const container = primary?.getContainer?.();
  if (container) container.style.clip = "";
  document.getElementById("mapFrame")?.style && (document.getElementById("mapFrame").style.clip = "");
}

function setSliderCenter() {
  if (!_compareCtrl || !_compareHost) return;
  const w = _compareHost.clientWidth;
  if (w > 0) _compareCtrl.setSlider(w / 2);
}

function preserveSliderOnResize() {
  if (!_compareCtrl || !_compareHost) return;
  const pos = _compareCtrl.currentPosition;
  if (typeof pos === "number" && pos > 0) {
    _compareCtrl.setSlider(pos);
  } else {
    setSliderCenter();
  }
  updateCompareHitTarget(_lastPointerClientX || getCompareDividerX());
}

function syncCompareMapsNow() {
  if (!_active || !_compareMap) return;
  const primary = getLeafletMap();
  if (!primary) return;

  syncVisorOverlayLayersOnMap(_compareMap);
  reapplyVisorThematicOpacityToMap(_compareMap);
  applySideBase(primary, "osm");
  applySideBase(_compareMap, "inegi");
  bindCompareOverlayTips();
  try {
    _compareMap.triggerRepaint();
  } catch {
    /* noop */
  }
}

function scheduleSyncCompareMaps() {
  if (_syncCompareRaf) cancelAnimationFrame(_syncCompareRaf);
  _syncCompareRaf = requestAnimationFrame(() => {
    _syncCompareRaf = 0;
    syncCompareMapsNow();
  });
}

function setBasemapCtrlHidden(hidden) {
  document.querySelectorAll(".atlas-basemap-ctrl").forEach((el) => {
    el.style.display = hidden ? "none" : "";
  });
}

function updateToggleUi() {
  if (!_toggleBtn) return;
  if (_active) {
    _toggleBtn.textContent = "✕ Salir comparación";
    _toggleBtn.title = "Desactivar comparación OSM / INEGI";
    _toggleBtn.setAttribute("aria-label", "Salir del modo comparación");
    _toggleBtn.classList.add("is-active");
    _toggleBtn.setAttribute("aria-pressed", "true");
  } else {
    _toggleBtn.textContent = "⇆ Comparar bases";
    _toggleBtn.title = "Comparar mapas base OSM e INEGI";
    _toggleBtn.setAttribute("aria-label", "Comparar mapas base OSM e INEGI");
    _toggleBtn.classList.remove("is-active");
    _toggleBtn.setAttribute("aria-pressed", "false");
  }
}

function mountToggleButton(target) {
  if (!_toggleBtn || !target) return;
  target.appendChild(_toggleBtn);
}

function ensureCompareHost(primaryEl) {
  if (primaryEl.parentElement?.classList.contains("visor-compare-host")) {
    return primaryEl.parentElement;
  }
  const host = document.createElement("div");
  host.className = "visor-compare-host";
  const parent = primaryEl.parentElement;
  if (!parent) return null;
  parent.insertBefore(host, primaryEl);
  host.appendChild(primaryEl);
  primaryEl.classList.add("visor-compare-pane", "visor-compare-pane--a");
  return host;
}

function ensureComparePaneB(host) {
  let pane = host.querySelector("#mapFrameCompare");
  if (pane) return pane;
  pane = document.createElement("div");
  pane.id = "mapFrameCompare";
  pane.className = "map-frame visor-compare-pane visor-compare-pane--b";
  pane.setAttribute("aria-hidden", "true");
  host.appendChild(pane);
  return pane;
}

function ensureLabels(host) {
  if (_labelsEl?.isConnected) return _labelsEl;
  const el = document.createElement("div");
  el.className = "visor-compare-labels";
  el.innerHTML =
    '<span class="visor-compare-label visor-compare-label--left">OpenStreetMap</span><span class="visor-compare-label visor-compare-label--right">INEGI</span>';
  host.appendChild(el);
  _labelsEl = el;
  return el;
}

function unwrapCompareDom() {
  const host = document.querySelector(".visor-compare-host");
  if (!host) return;
  const primary = document.getElementById("mapFrame");
  const parent = host.parentElement;
  if (primary && parent) {
    parent.insertBefore(primary, host);
    primary.classList.remove("visor-compare-pane", "visor-compare-pane--a");
    primary.style.clip = "";
  }
  host.querySelector("#mapFrameCompare")?.remove();
  _labelsEl?.remove();
  _labelsEl = null;
  host.remove();
  _compareHost = null;
  _comparePaneB = null;
  clearMapClips();
  mountToggleButton(getMapUiShell());
}

function destroyCompareMap() {
  unbindComparePointerRouting();
  unbindCompareDragNoSelect();
  if (_compareCtrl) {
    try {
      _compareCtrl.remove();
    } catch {
      /* noop */
    }
    _compareCtrl = null;
  }
  removeOrphanCompareControls(_compareHost);
  if (_compareMap) {
    try {
      _compareMap.remove();
    } catch {
      /* noop */
    }
    _compareMap = null;
  }
  clearComparePaneMaps(_comparePaneB);
  clearMapClips();
  unwrapCompareDom();
}

function waitMapReady(map) {
  return new Promise((resolve) => {
    if (map.isStyleLoaded()) {
      resolve();
      return;
    }
    map.once("load", () => resolve());
  });
}

async function enableCompare() {
  if (_active) return;
  if (_enablePromise) return _enablePromise;

  const opGen = ++_compareOpGen;
  _enablePromise = doEnableCompare(opGen).finally(() => {
    if (opGen === _compareOpGen) _enablePromise = null;
    if (_toggleBtn) _toggleBtn.disabled = false;
  });

  if (_toggleBtn) _toggleBtn.disabled = true;
  return _enablePromise;
}

async function doEnableCompare(opGen) {
  const Compare = getCompareCtor();
  const primary = getLeafletMap();
  if (!Compare || !primary) return;

  destroyCompareMap();

  _savedBase = null;
  try {
    const activeBtn = document.querySelector(".atlas-basemap-ctrl__btn.is-active");
    _savedBase = activeBtn?.dataset?.base || "osm";
  } catch {
    _savedBase = "osm";
  }

  setMapBaseLayer("osm");
  await waitMapReady(primary);
  if (opGen !== _compareOpGen) return;

  const primaryEl = primary.getContainer();
  _compareHost = ensureCompareHost(primaryEl);
  if (!_compareHost) return;

  _comparePaneB = ensureComparePaneB(_compareHost);
  removeOrphanCompareControls(_compareHost);
  clearComparePaneMaps(_comparePaneB);
  ensureLabels(_compareHost);
  mountToggleButton(_compareHost);

  const styleSnapshot = primary.getStyle();
  _compareMap = createCompareMapInstance(_comparePaneB, styleSnapshot, viewState(primary));

  await waitMapReady(_compareMap);
  if (opGen !== _compareOpGen) {
    destroyCompareMap();
    return;
  }

  applySideBase(primary, "osm");
  applySideBase(_compareMap, "inegi");
  syncCompareMapsNow();

  /* Solo arrastrar el control; sin seguir el cursor sobre el mapa. */
  _compareCtrl = new Compare(primary, _compareMap, _compareHost, { mousemove: false });
  if (opGen !== _compareOpGen) {
    destroyCompareMap();
    return;
  }

  bindCompareDragNoSelect();
  bindComparePointerRouting();
  _active = true;
  updateToggleUi();
  setBasemapCtrlHidden(true);

  requestAnimationFrame(() => {
    if (opGen !== _compareOpGen || !_active) return;
    primary.resize();
    _compareMap?.resize();
    setSliderCenter();
    updateCompareHitTarget(getCompareDividerX());
    syncCompareMapsNow();
  });
}

function disableCompare() {
  _compareOpGen += 1;
  if (!_active && !_enablePromise) return;
  _active = false;
  updateToggleUi();
  setBasemapCtrlHidden(false);
  destroyCompareMap();
  const restore = _savedBase && _savedBase !== "osm" ? _savedBase : null;
  if (restore) setMapBaseLayer(restore);
  _savedBase = null;
  const primary = getLeafletMap();
  primary?.resize();
  mountToggleButton(getMapUiShell());
}

function toggleCompare() {
  if (_enablePromise) return;
  if (_active) disableCompare();
  else void enableCompare().catch((err) => console.warn("visor compare:", err));
}

function ensureToggleButton() {
  const shell = getMapUiShell();
  if (!shell) return null;
  if (_toggleBtn?.isConnected && _toggleBtn.parentElement === shell) return _toggleBtn;
  if (_toggleBtn) {
    mountToggleButton(shell);
    return _toggleBtn;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "visor-compare-toggle";
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    toggleCompare();
  });
  _toggleBtn = btn;
  updateToggleUi();
  shell.appendChild(btn);
  return btn;
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 24) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  ensureToggleButton();
}

export function attachVisorMapCompare() {
  registerCompareOverlaySyncHook(syncCompareMapsNow);
  if (!_styleSyncHandler) {
    _styleSyncHandler = () => scheduleSyncCompareMaps();
    window.addEventListener("atlas:map-overlays-changed", _styleSyncHandler);
  }
  if (!_resizeHandler) {
    _resizeHandler = () => {
      if (!_active || !_compareMap) return;
      const primary = getLeafletMap();
      primary?.resize();
      _compareMap.resize();
      preserveSliderOnResize();
    };
    window.addEventListener("atlas:map-resize", _resizeHandler);
  }
  if (!_opacitySyncHandler) {
    _opacitySyncHandler = () => {
      if (_compareMap?.isStyleLoaded?.()) reapplyVisorThematicOpacityToMap(_compareMap);
    };
    window.addEventListener("atlas:visor-opacity-changed", _opacitySyncHandler);
  }
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorMapCompare() {
  registerCompareOverlaySyncHook(null);
  disableCompare();
  if (_styleSyncHandler) {
    window.removeEventListener("atlas:map-overlays-changed", _styleSyncHandler);
    _styleSyncHandler = null;
  }
  if (_resizeHandler) {
    window.removeEventListener("atlas:map-resize", _resizeHandler);
    _resizeHandler = null;
  }
  if (_opacitySyncHandler) {
    window.removeEventListener("atlas:visor-opacity-changed", _opacitySyncHandler);
    _opacitySyncHandler = null;
  }
  _toggleBtn?.remove();
  _toggleBtn = null;
}

export function scheduleVisorCompareSync() {
  scheduleSyncCompareMaps();
}

export function refreshVisorMapCompare() {
  if (!getLeafletMap()) return;
  ensureToggleButton();
  if (_active) {
    mountToggleButton(_compareHost || getMapUiShell());
    scheduleSyncCompareMaps();
  }
}

export function isVisorCompareActive() {
  return _active;
}
