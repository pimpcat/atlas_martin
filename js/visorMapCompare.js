/**
 * Comparador de mapas base en el Visor geográfico (maplibre-gl-compare).
 *
 * Permite elegir el mapa base de cada lado (izquierda / derecha).
 * Las capas vectoriales activas se replican en ambos mapas.
 *
 * @see assets/maplibre-gl-compare.js · css/maplibre-gl-compare.css
 */
import {
  applyMapInstanceBaseLayer,
  bindAtlasOverlayTips,
  createCompareMapInstance,
  getActiveMapBase,
  getLeafletMap,
  rebootstrapOverlaySymbolIconsOnMap,
  registerCompareOverlaySyncHook,
  reapplyVisorThematicOpacityToMap,
  setMapBaseLayer,
  syncVisorOverlayLayersOnMap,
  VISOR_BASEMAP_CHOICES,
  whenAtlasMapReady,
} from "./map.js";

let _toggleBtn = null;
let _labelsEl = null;
let _pickerEl = null;
let _leftSelect = null;
let _rightSelect = null;
let _compareHost = null;
let _comparePaneB = null;
let _compareMap = null;
let _compareCtrl = null;
let _active = false;
let _savedBase = null;
let _leftBase = "osm";
let _rightBase = "inegi";
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
let _pickerOutsideHandler = null;
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

function defaultRightBase(leftKey) {
  const alt = VISOR_BASEMAP_CHOICES.find((c) => c.key !== leftKey);
  return alt?.key || "inegi";
}

function fillBasemapSelect(select, selectedKey) {
  if (!select) return;
  select.replaceChildren();
  for (const choice of VISOR_BASEMAP_CHOICES) {
    const opt = document.createElement("option");
    opt.value = choice.key;
    opt.textContent = choice.short;
    opt.title = choice.label;
    if (choice.key === selectedKey) opt.selected = true;
    select.appendChild(opt);
  }
}

function hideComparePicker() {
  if (_pickerOutsideHandler) {
    document.removeEventListener("mousedown", _pickerOutsideHandler, true);
    _pickerOutsideHandler = null;
  }
  _pickerEl?.remove();
  _pickerEl = null;
}

function showComparePicker() {
  if (_active || _enablePromise) return;
  hideComparePicker();

  const shell = getMapUiShell();
  if (!shell || !_toggleBtn) return;

  _leftBase = getActiveMapBase() || "osm";
  _rightBase = defaultRightBase(_leftBase);

  const picker = document.createElement("div");
  picker.className = "visor-compare-picker";
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Elegir mapas base para comparar");

  const title = document.createElement("div");
  title.className = "visor-compare-picker__title";
  title.textContent = "Comparar mapas base";

  const grid = document.createElement("div");
  grid.className = "visor-compare-picker__grid";

  const mkField = (labelText, side) => {
    const field = document.createElement("label");
    field.className = "visor-compare-picker__field";
    const span = document.createElement("span");
    span.textContent = labelText;
    const select = document.createElement("select");
    select.className = "visor-compare-picker__select";
    select.dataset.side = side;
    fillBasemapSelect(select, side === "left" ? _leftBase : _rightBase);
    field.append(span, select);
    return { field, select };
  };

  const leftField = mkField("Izquierda", "left");
  const rightField = mkField("Derecha", "right");
  _leftSelect = leftField.select;
  _rightSelect = rightField.select;
  grid.append(leftField.field, rightField.field);

  const actions = document.createElement("div");
  actions.className = "visor-compare-picker__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "visor-compare-picker__btn visor-compare-picker__btn--ghost";
  cancelBtn.textContent = "Cancelar";
  cancelBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    hideComparePicker();
  });

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "visor-compare-picker__btn visor-compare-picker__btn--primary";
  startBtn.textContent = "Comenzar";
  startBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    _leftBase = _leftSelect?.value || "osm";
    _rightBase = _rightSelect?.value || defaultRightBase(_leftBase);
    hideComparePicker();
    void enableCompare().catch((err) => console.warn("visor compare:", err));
  });

  actions.append(cancelBtn, startBtn);
  picker.append(title, grid, actions);
  shell.appendChild(picker);
  _pickerEl = picker;

  _pickerOutsideHandler = (ev) => {
    if (picker.contains(ev.target) || _toggleBtn?.contains(ev.target)) return;
    hideComparePicker();
  };
  document.addEventListener("mousedown", _pickerOutsideHandler, true);
}

async function applyCompareBasemaps() {
  const primary = getLeafletMap();
  if (!primary || !_compareMap) return;
  await applyMapInstanceBaseLayer(primary, _leftBase);
  await applyMapInstanceBaseLayer(_compareMap, _rightBase);
  syncBasemapSelectValues();
}

function syncBasemapSelectValues() {
  if (_leftSelect?.isConnected) _leftSelect.value = _leftBase;
  if (_rightSelect?.isConnected) _rightSelect.value = _rightBase;
}

function onCompareBaseSelectChange(side, value) {
  if (side === "left") _leftBase = value;
  else _rightBase = value;
  void syncCompareMapsNow();
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

async function syncCompareMapsNow() {
  if (!_compareMap) return;
  const primary = getLeafletMap();
  if (!primary) return;

  // Bases primero: el mapa local recarga sprite y borra iconos addImage.
  await applyCompareBasemaps();
  if (_leftBase === "local") {
    await rebootstrapOverlaySymbolIconsOnMap(primary);
  }
  if (_rightBase === "local") {
    await rebootstrapOverlaySymbolIconsOnMap(_compareMap);
  }

  await syncVisorOverlayLayersOnMap(_compareMap);
  reapplyVisorThematicOpacityToMap(_compareMap);
  bindCompareOverlayTips();
  try {
    primary.triggerRepaint?.();
    _compareMap.triggerRepaint();
  } catch {
    /* noop */
  }
}

function scheduleSyncCompareMaps() {
  if (_syncCompareRaf) cancelAnimationFrame(_syncCompareRaf);
  _syncCompareRaf = requestAnimationFrame(() => {
    _syncCompareRaf = 0;
    void syncCompareMapsNow();
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
    _toggleBtn.title = "Desactivar comparación de mapas base";
    _toggleBtn.setAttribute("aria-label", "Salir del modo comparación");
    _toggleBtn.classList.add("is-active");
    _toggleBtn.setAttribute("aria-pressed", "true");
  } else {
    _toggleBtn.textContent = "⇆ Comparar bases";
    _toggleBtn.title = "Elegir y comparar dos mapas base";
    _toggleBtn.setAttribute("aria-label", "Comparar mapas base");
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
  host.appendChild(el);
  _labelsEl = el;
  updateCompareLabelsUi();
  return el;
}

function updateCompareLabelsUi() {
  if (!_labelsEl) return;
  _labelsEl.replaceChildren();

  const mkSide = (side, labelText) => {
    const wrap = document.createElement("div");
    wrap.className = `visor-compare-label-wrap visor-compare-label-wrap--${side}`;

    const tag = document.createElement("span");
    tag.className = "visor-compare-label-tag";
    tag.textContent = labelText;

    const select = document.createElement("select");
    select.className = "visor-compare-label-select";
    select.title = `Mapa base ${labelText.toLowerCase()}`;
    select.dataset.side = side;
    fillBasemapSelect(select, side === "left" ? _leftBase : _rightBase);
    select.addEventListener("change", () => {
      onCompareBaseSelectChange(side, select.value);
    });
    if (side === "left") _leftSelect = select;
    else _rightSelect = select;

    wrap.append(tag, select);
    return wrap;
  };

  _labelsEl.append(mkSide("left", "Izquierda"), mkSide("right", "Derecha"));
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
  _leftSelect = null;
  _rightSelect = null;
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
    _savedBase = activeBtn?.dataset?.base || getActiveMapBase() || "osm";
  } catch {
    _savedBase = getActiveMapBase() || "osm";
  }

  await applyMapInstanceBaseLayer(primary, _leftBase);
  await waitMapReady(primary);
  if (opGen !== _compareOpGen) return;

  const primaryEl = primary.getContainer();
  _compareHost = ensureCompareHost(primaryEl);
  if (!_compareHost) return;

  _comparePaneB = ensureComparePaneB(_compareHost);
  removeOrphanCompareControls(_compareHost);
  clearComparePaneMaps(_comparePaneB);
  ensureLabels(_compareHost);
  mountToggleButton(getMapUiShell());

  const styleSnapshot = primary.getStyle();
  _compareMap = createCompareMapInstance(_comparePaneB, styleSnapshot, viewState(primary));

  await waitMapReady(_compareMap);
  if (opGen !== _compareOpGen) {
    destroyCompareMap();
    return;
  }

  await applyMapInstanceBaseLayer(_compareMap, _rightBase);

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
  if (_toggleBtn) _toggleBtn.disabled = false;
  setBasemapCtrlHidden(true);

  await syncCompareMapsNow();

  requestAnimationFrame(() => {
    if (opGen !== _compareOpGen || !_active) return;
    primary.resize();
    _compareMap?.resize();
    setSliderCenter();
    updateCompareHitTarget(getCompareDividerX());
    void syncCompareMapsNow();
  });
}

function isCompareUiOpen() {
  return Boolean(_active || _compareHost || document.querySelector(".visor-compare-host"));
}

function disableCompare() {
  _compareOpGen += 1;
  _enablePromise = null;
  hideComparePicker();
  if (!isCompareUiOpen()) return;

  _active = false;
  if (_toggleBtn) _toggleBtn.disabled = false;
  updateToggleUi();
  setBasemapCtrlHidden(false);
  destroyCompareMap();
  if (_savedBase) setMapBaseLayer(_savedBase);
  _savedBase = null;
  const primary = getLeafletMap();
  primary?.resize();
  mountToggleButton(getMapUiShell());
}

function toggleCompare() {
  if (isCompareUiOpen()) {
    disableCompare();
    return;
  }
  if (_enablePromise) {
    disableCompare();
    return;
  }
  showComparePicker();
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
  registerCompareOverlaySyncHook(() => {
    void syncCompareMapsNow();
  });
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
  hideComparePicker();
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
    mountToggleButton(getMapUiShell());
    scheduleSyncCompareMaps();
  }
}

export function isVisorCompareActive() {
  return _active;
}
