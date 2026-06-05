/**
 * Inventario de Viviendas (INV 2020): capas vectoriales vía FastAPI /api/inv/bbox.
 * Depende de map.js, invVivCatalog.js, invVivIcons.js, invVivEntorno.js.
 */
import { apiUrl } from "./atlasConfig.js";
import { getLeafletMap, whenAtlasMapReady, scheduleMunicipioMapFocus } from "./map.js";
import {
  INV_ALL_LAYERS,
  INV_PANEL_GROUPS,
  getInvLayer,
  isInvPolygonLayer,
} from "./invVivCatalog.js";
import { invLayerIconSvg } from "./invVivIcons.js";
import { INV_ENTORNO_CODES, getEntornoColor, getEntornoLabel } from "./invVivEntorno.js";

// --- Constantes de zoom y panes Leaflet ---

const API_INV_BBOX = apiUrl("/api/inv/bbox");
const INV_SOURCE_ID = "invviv-geojson";
const INV_LAYER_POINT = "invviv-points";
const INV_LAYER_POLY = "invviv-polygons";
/** Manzanas INV (etiquetas y polígonos): solo zoom de detalle calle/manzana. */
const MIN_ZOOM_POINT = 14;
const MIN_ZOOM_POLYGON = 14;
const INV_MARKER_PANE = "invvivLabels";
const INV_POLY_PANE = "invvivPolygons";
/** Pane propio: debe quedar por encima de invvivLabels (Leaflet tooltipPane ≈ 650). */
const INV_TOOLTIP_PANE = "invvivTooltips";

/** @type {string | null} */
let _activeField = null;
let _layer = null;
let _abort = null;
let _mapRefreshHandler = null;
let _getCveMun = () => null;
let _zoomCtl = null;
let _hintCtl = null;
let _entornoLegendCtl = null;
let _entornoLegendOpen = false;
/** @type {((e?: unknown) => void) | null} */
let _syncZoomUiHandler = null;
/** @type {((e?: unknown) => void) | null} */
let _mapZoomGuardHandler = null;
let _fetchGen = 0;
let _statusEl = null;

function mapZoomLevel(map) {
  if (!map) return 0;
  const z = map.getZoom();
  return typeof z === "number" && Number.isFinite(z) ? z : 0;
}

function padCve3(cve) {
  const s = String(cve != null ? cve : "").replace(/\D/g, "");
  return s ? ("000" + s).slice(-3) : "";
}

function fmtVal(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  const isInt = Number.isInteger(num);
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: isInt ? 0 : 1,
    maximumFractionDigits: isInt ? 0 : 2,
  }).format(num);
}

function getIndicatorLabel(fieldId) {
  const it = getInvLayer(fieldId);
  return it ? it.label : fieldId;
}

function setStatus(text, isError) {
  if (!_statusEl) return;
  if (!isError) {
    _statusEl.textContent = "";
    _statusEl.classList.add("d-none");
    return;
  }
  _statusEl.textContent = text || "";
  _statusEl.classList.remove("d-none");
  _statusEl.classList.add("text-danger");
  _statusEl.classList.remove("text-muted");
}

function getMinZoomForField(fieldId) {
  return isInvPolygonLayer(fieldId) ? MIN_ZOOM_POLYGON : MIN_ZOOM_POINT;
}

function syncInvVivHint(map) {
  const hintEl = _hintCtl && _hintCtl.getContainer();
  if (!hintEl || !map) return;
  const z = mapZoomLevel(map);
  const minZ = _activeField ? getMinZoomForField(_activeField) : MIN_ZOOM_POINT;
  const poly = _activeField && isInvPolygonLayer(_activeField);
  hintEl.textContent = poly
    ? `Zoom ${minZ}+ para polígonos INV.`
    : `Zoom ${minZ}+ para etiquetas INV.`;
  hintEl.style.display = z >= minZ ? "none" : "";
}

function ensureInvVivPanes(_map) {
  /* MapLibre no usa panes Leaflet; capas INV van por orden de addLayer. */
}

function bringInvTooltipToFront(layer) {
  const tip = layer && layer.getTooltip ? layer.getTooltip() : null;
  if (tip && typeof tip.bringToFront === "function") {
    tip.bringToFront();
  }
}

function buildMapEntornoLegendListHtml() {
  return INV_ENTORNO_CODES.map(
    (c) =>
      `<li><span class="invviv-map-legend__chip" style="background:${c.color}"></span><span>${c.label}</span></li>`,
  ).join("");
}

function setEntornoLegendPanelOpen(open) {
  _entornoLegendOpen = Boolean(open);
  const root = _entornoLegendCtl && _entornoLegendCtl.getContainer();
  if (!root) return;
  const panel = root.querySelector(".invviv-map-legend__panel");
  const btn = root.querySelector(".invviv-map-legend__btn");
  if (panel) panel.classList.toggle("d-none", !_entornoLegendOpen);
  if (btn) btn.setAttribute("aria-expanded", _entornoLegendOpen ? "true" : "false");
}

/** Leyenda colapsable en el mapa (solo capas Entorno Urbano). */
function syncEntornoMapLegend(map) {
  if (!map) return;

  const layerDef =
    _activeField && isInvPolygonLayer(_activeField) ? getInvLayer(_activeField) : null;

  if (!layerDef) {
    if (_entornoLegendCtl) {
      try {
        _entornoLegendCtl.getContainer()?.remove();
      } catch (_) {
        /* noop */
      }
      _entornoLegendCtl = null;
      _entornoLegendOpen = false;
    }
    return;
  }

  if (!_entornoLegendCtl) {
    const wrap = document.createElement("div");
    wrap.className = "invviv-map-legend maplibregl-ctrl";
    const btn = document.createElement("button");
    btn.className = "invviv-map-legend__btn";
    btn.type = "button";
    btn.innerHTML =
      '<span class="invviv-map-legend__btn-ico" aria-hidden="true">▤</span><span>Simbología</span>';
    const panel = document.createElement("div");
    panel.className = "invviv-map-legend__panel d-none";
    const title = document.createElement("div");
    title.className = "invviv-map-legend__title";
    title.textContent = layerDef.label;
    const list = document.createElement("ul");
    list.className = "invviv-map-legend__list";
    list.innerHTML = buildMapEntornoLegendListHtml();
    panel.append(title, list);
    wrap.append(btn, panel);
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setEntornoLegendPanelOpen(!_entornoLegendOpen);
    });
    map.getContainer().appendChild(wrap);
    _entornoLegendCtl = { getContainer: () => wrap };
    _entornoLegendOpen = false;
    return;
  }

  const root = _entornoLegendCtl.getContainer();
  const title = root && root.querySelector(".invviv-map-legend__title");
  if (title) title.textContent = layerDef.label;
  setEntornoLegendPanelOpen(false);
}

function ensureControls(map) {
  if (_zoomCtl) {
    const zEl = _zoomCtl.getContainer();
    if (zEl) zEl.textContent = `Zoom ${Math.round(mapZoomLevel(map) * 10) / 10}`;
    return;
  }

  const zDiv = document.createElement("div");
  zDiv.className = "invviv-zoom maplibregl-ctrl";
  zDiv.textContent = `Zoom ${Math.round(mapZoomLevel(map) * 10) / 10}`;
  map.getContainer().appendChild(zDiv);
  _zoomCtl = { getContainer: () => zDiv };

  const hDiv = document.createElement("div");
  hDiv.className = "invviv-hint maplibregl-ctrl";
  hDiv.textContent = "Elige un indicador INV y acércate al mapa.";
  map.getContainer().appendChild(hDiv);
  _hintCtl = { getContainer: () => hDiv };

  _syncZoomUiHandler = () => {
    const z = mapZoomLevel(map);
    const zEl = _zoomCtl && _zoomCtl.getContainer();
    if (zEl) zEl.textContent = `Zoom ${Math.round(z * 10) / 10}`;
    syncInvVivHint(map);
    enforceInvZoomVisibility(map);
  };
  map.on("zoom", _syncZoomUiHandler);
  map.on("zoomend", _syncZoomUiHandler);
  _syncZoomUiHandler();
}

function removeInvVivMapControls(map) {
  if (map && _syncZoomUiHandler) {
    map.off("zoom", _syncZoomUiHandler);
    map.off("zoomend", _syncZoomUiHandler);
    _syncZoomUiHandler = null;
  }
  if (_zoomCtl) {
    try {
      _zoomCtl.getContainer()?.remove();
    } catch (_) {
      /* noop */
    }
    _zoomCtl = null;
  }
  if (_hintCtl) {
    try {
      _hintCtl.getContainer()?.remove();
    } catch (_) {
      /* noop */
    }
    _hintCtl = null;
  }
  if (_entornoLegendCtl) {
    try {
      _entornoLegendCtl.getContainer()?.remove();
    } catch (_) {
      /* noop */
    }
    _entornoLegendCtl = null;
    _entornoLegendOpen = false;
  }
}

function clearLayerInternal() {
  const map = getLeafletMap();
  if (!map) return;
  [INV_LAYER_POINT, INV_LAYER_POLY, "invviv-poly-outline", INV_SOURCE_ID].forEach((id) => {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    } catch (_) {
      /* noop */
    }
  });
  _layer = null;
}

function renderInvGeoJsonOnMap(map, fc, isPolygon, layerDef) {
  if (!map.isStyleLoaded()) {
    whenAtlasMapReady(() => renderInvGeoJsonOnMap(map, fc, isPolygon, layerDef));
    return;
  }
  clearLayerInternal();
  if (!map.getSource(INV_SOURCE_ID)) {
    map.addSource(INV_SOURCE_ID, { type: "geojson", data: fc });
  } else {
    map.getSource(INV_SOURCE_ID).setData(fc);
  }
  if (isPolygon) {
    const matchExpr = ["match", ["to-number", ["get", "value"]]];
    INV_ENTORNO_CODES.forEach((c) => {
      matchExpr.push(c.code, c.color);
    });
    matchExpr.push("#cccccc");
    if (!map.getLayer(INV_LAYER_POLY)) {
      map.addLayer({
        id: INV_LAYER_POLY,
        type: "fill",
        source: INV_SOURCE_ID,
        paint: { "fill-color": matchExpr, "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: "invviv-poly-outline",
        type: "line",
        source: INV_SOURCE_ID,
        paint: { "line-color": "#333", "line-width": 1 },
      });
    }
  } else {
    const color = layerDef?.color || "#66bb6a";
    if (!map.getLayer(INV_LAYER_POINT)) {
      map.addLayer({
        id: INV_LAYER_POINT,
        type: "circle",
        source: INV_SOURCE_ID,
        paint: {
          "circle-radius": 8,
          "circle-color": color,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });
    }
  }
}

/** Quita la capa del mapa si el zoom actual está por debajo del mínimo del indicador activo. */
function enforceInvZoomVisibility(map) {
  if (!map || !_activeField) return false;
  const minZ = getMinZoomForField(_activeField);
  const z = mapZoomLevel(map);
  if (z >= minZ) return false;

  _fetchGen += 1;
  if (_abort) {
    try {
      _abort.abort();
    } catch (_) {
      // ignore
    }
    _abort = null;
  }
  clearLayerInternal();

  const isPolygon = isInvPolygonLayer(_activeField);
  setStatus(
    `Zoom ${z}: acerca a ${minZ}+ para ver ${isPolygon ? "polígonos" : "etiquetas"} (capa oculta).`,
  );
  syncInvVivHint(map);
  return true;
}

export function clearInvVivLayer() {
  if (_abort) {
    try {
      _abort.abort();
    } catch (_) {
      // ignore
    }
  }
  _abort = null;
  clearLayerInternal();
}

export function teardownInvVivMode() {
  clearInvVivLayer();
  _activeField = null;
  const map = getLeafletMap();
  if (map && _mapRefreshHandler) {
    map.off("moveend", _mapRefreshHandler);
    map.off("zoomend", _mapRefreshHandler);
  }
  _mapRefreshHandler = null;
  if (map && _mapZoomGuardHandler) {
    map.off("zoom", _mapZoomGuardHandler);
  }
  _mapZoomGuardHandler = null;
  _fetchGen += 1;
  removeInvVivMapControls(map);
}

function parseHexColor(hex) {
  const s = String(hex || "").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return { r: 102, g: 187, b: 106 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Color de fondo de etiqueta = color del icono de la capa activa. */
function layerBadgeStyle(layerColor) {
  const { r, g, b } = parseHexColor(layerColor);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const fg = lum > 165 ? "rgba(0, 30, 40, 0.92)" : "rgba(255, 255, 255, 0.96)";
  const border =
    lum > 165 ? "rgba(0, 60, 80, 0.35)" : "rgba(255, 255, 255, 0.65)";
  return {
    bg: `rgb(${r}, ${g}, ${b})`,
    fg,
    border,
  };
}

function buildTooltipHtml(props) {
  const cvegeo = props && props.cvegeo != null ? String(props.cvegeo) : "—";
  const amb = props && props.ambito != null ? String(props.ambito) : "—";
  const pobt = fmtVal(props ? props.pobtot : null);
  const pobf = fmtVal(props ? props.pobfem : null);
  const pobm = fmtVal(props ? props.pobmas : null);
  const layerDef = _activeField ? getInvLayer(_activeField) : null;
  const label = layerDef ? layerDef.label : "—";
  const val =
    layerDef && layerDef.kind === "entorno"
      ? getEntornoLabel(props ? props.value : null)
      : fmtVal(props ? props.value : null);

  return `
    <div class="invviv-tip">
      <div class="invviv-tip__title">Manzana ${cvegeo}</div>
      <div class="invviv-tip__row"><span>Ámbito</span><strong>${amb}</strong></div>
      <div class="invviv-tip__row"><span>${label}</span><strong>${val}</strong></div>
      <div class="invviv-tip__row"><span>Pob. total</span><strong>${pobt}</strong></div>
      <div class="invviv-tip__row"><span>Pob. fem.</span><strong>${pobf}</strong></div>
      <div class="invviv-tip__row"><span>Pob. masc.</span><strong>${pobm}</strong></div>
    </div>
  `.trim();
}

function entornoPolygonStyle(feature) {
  const code = feature && feature.properties ? feature.properties.value : null;
  const fill = getEntornoColor(code);
  const light = code === 2 || code === 7 || code === 8;
  return {
    fillColor: fill,
    fillOpacity: 0.78,
    color: light ? "rgba(0, 0, 0, 0.42)" : "rgba(255, 255, 255, 0.32)",
    weight: 1,
  };
}

function bindInvFeatureTooltip(layer, props) {
  layer.bindTooltip(buildTooltipHtml(props || {}), {
    direction: "top",
    opacity: 1,
    sticky: true,
    className: "invviv-tooltip",
    pane: INV_TOOLTIP_PANE,
  });
  layer.on("mouseover", () => {
    layer.openTooltip();
    bringInvTooltipToFront(layer);
  });
  layer.on("mouseout", () => layer.closeTooltip());
}

function renderPointLayer(map, fc, layerDef) {
  const badge = layerBadgeStyle(layerDef ? layerDef.color : "#66bb6a");
  return L.geoJSON(fc, {
    pointToLayer: (feature, latlng) => {
      const v = feature && feature.properties ? feature.properties.value : null;
      const txt = fmtVal(v);
      const html = `<span class="invviv-badge" style="--invviv-bg:${badge.bg};--invviv-fg:${badge.fg};--invviv-border:${badge.border}">${txt}</span>`;
      const icon = L.divIcon({
        className: "invviv-label",
        html,
        iconSize: null,
      });
      const m = L.marker(latlng, { icon, interactive: true, pane: INV_MARKER_PANE });
      bindInvFeatureTooltip(m, feature.properties || {});
      return m;
    },
  });
}

function renderPolygonLayer(map, fc) {
  return L.geoJSON(fc, {
    pane: INV_POLY_PANE,
    style: entornoPolygonStyle,
    onEachFeature: (feature, layer) => {
      bindInvFeatureTooltip(layer, feature.properties || {});
    },
  });
}

async function fetchAndRender(map, cve_mun) {
  if (!_activeField) {
    clearLayerInternal();
    setStatus("Selecciona un indicador del panel para ver etiquetas en el mapa.");
    return;
  }

  const layerDef = getInvLayer(_activeField);
  const isPolygon = layerDef && layerDef.render === "polygon";

  if (enforceInvZoomVisibility(map)) return;
  const z = mapZoomLevel(map);
  const cve = padCve3(cve_mun);
  const fetchGen = ++_fetchGen;
  if (!cve) {
    clearLayerInternal();
    setStatus("Selecciona un municipio para consultar el INV.", true);
    return;
  }

  const b = map.getBounds();
  const swLL = b.getSouthWest();
  const neLL = b.getNorthEast();
  const toMerc = (lng, lat) => {
    const x = (lng * 20037508.34) / 180;
    const y =
      (Math.log(Math.tan((Math.PI / 4) + (Math.PI / 180) * lat * 0.5)) * 20037508.34) /
      Math.PI;
    return { x, y };
  };
  const sw = toMerc(swLL.lng, swLL.lat);
  const ne = toMerc(neLL.lng, neLL.lat);

  if (_abort) {
    try {
      _abort.abort();
    } catch (_) {}
  }
  _abort = new AbortController();

  setStatus("Cargando manzanas…");

  const u = new URL(API_INV_BBOX);
  u.searchParams.set("cve_mun", cve);
  u.searchParams.set("field", _activeField);
  if (isPolygon) u.searchParams.set("mode", "polygon");
  u.searchParams.set("xmin", String(sw.x));
  u.searchParams.set("ymin", String(sw.y));
  u.searchParams.set("xmax", String(ne.x));
  u.searchParams.set("ymax", String(ne.y));

  let json;
  try {
    const res = await fetch(u.toString(), { signal: _abort.signal, cache: "no-store" });
    json = await res.json();
  } catch (err) {
    if (err && err.name === "AbortError") return;
    if (fetchGen !== _fetchGen) return;
    clearLayerInternal();
    setStatus("No se pudo consultar atlas.c_inv.", true);
    return;
  }

  if (fetchGen !== _fetchGen) return;

  if (!json || json.ok !== true) {
    clearLayerInternal();
    const msg = json && json.message ? String(json.message) : "Error en la consulta INV.";
    setStatus(msg, true);
    return;
  }

  const fc = json.featureCollection;
  const feats = fc && Array.isArray(fc.features) ? fc.features : [];
  let shown = 0;
  for (const f of feats) {
    const v = f && f.properties ? Number(f.properties.value) : NaN;
    if (v != null && !Number.isNaN(v)) shown += 1;
  }

  clearLayerInternal();
  ensureInvVivPanes(map);

  if (!feats.length) {
    setStatus(`Sin manzanas en esta vista (cve ${cve}). Prueba otro zoom o municipio.`, true);
    return;
  }

  if (enforceInvZoomVisibility(map)) return;

  renderInvGeoJsonOnMap(map, fc, isPolygon, layerDef);
  _layer = true;
  syncInvVivHint(map);
  const total = json.count != null ? json.count : feats.length;
  const tipo = isPolygon ? "polígono(s)" : "manzana(s)";
  setStatus(`${total} ${tipo} · ${shown} con valor · zoom ${z}`);
}

/**
 * Enlaza eventos del mapa (idempotente).
 * @param {{ getCveMun?: () => string | null }} [options]
 */
export function attachInvVivMap(options = {}) {
  _getCveMun = typeof options.getCveMun === "function" ? options.getCveMun : () => null;

  const tryAttach = (attempt) => {
    const map = getLeafletMap();
    if (!map) {
      if (attempt < 12) {
        setTimeout(() => tryAttach(attempt + 1), 120);
      }
      return;
    }

    ensureControls(map);
    ensureInvVivPanes(map);
    syncEntornoMapLegend(map);

    if (_mapRefreshHandler) {
      map.off("moveend", _mapRefreshHandler);
      map.off("zoomend", _mapRefreshHandler);
    }
    if (_mapZoomGuardHandler) {
      map.off("zoom", _mapZoomGuardHandler);
    }

    _mapRefreshHandler = () => {
      if (enforceInvZoomVisibility(map)) return;
      const cve = _getCveMun ? _getCveMun() : null;
      void fetchAndRender(map, cve);
    };

    _mapZoomGuardHandler = () => {
      if (enforceInvZoomVisibility(map)) return;
    };

    map.on("moveend", _mapRefreshHandler);
    map.on("zoomend", _mapRefreshHandler);
    map.on("zoom", _mapZoomGuardHandler);
    const cve0 = _getCveMun ? _getCveMun() : null;
    const mapFrame = document.getElementById("mapFrame");
    if (cve0 && mapFrame) {
      scheduleMunicipioMapFocus(mapFrame, cve0, "inv");
    }

    whenAtlasMapReady(() => _mapRefreshHandler());

    // Tras autozoom municipal (async), reintentar carga de etiquetas.
    setTimeout(_mapRefreshHandler, 400);
    setTimeout(_mapRefreshHandler, 900);
    setTimeout(_mapRefreshHandler, 1600);
  };

  tryAttach(0);
}

/** Fuerza recarga de manzanas INV (p. ej. tras cambiar municipio). */
export function refreshInvVivNow() {
  const map = getLeafletMap();
  if (!map || !_mapRefreshHandler) return;
  _mapRefreshHandler();
}

export function setInvVivActive(fieldId) {
  const id = fieldId && String(fieldId).trim() ? String(fieldId).trim() : "";
  if (!id) return;
  _activeField = id;
  const titleEl = document.getElementById("invVivActiveLabel");
  if (titleEl) titleEl.textContent = getIndicatorLabel(_activeField);

  const map0 = getLeafletMap();
  if (map0) {
    syncInvVivHint(map0);
    syncEntornoMapLegend(map0);
  }

  document.querySelectorAll(".invviv-radio.is-active").forEach((el) => {
    el.classList.remove("is-active");
  });
  const activeRow = document.querySelector(`.invviv-radio[data-field="${_activeField}"]`);
  if (activeRow) activeRow.classList.add("is-active");
  const inp = activeRow && activeRow.querySelector('input[type="radio"]');
  if (inp) inp.checked = true;

  const map = getLeafletMap();
  if (map) {
    void fetchAndRender(map, _getCveMun ? _getCveMun() : null);
  }
}

/**
 * Panel lateral INV 2020 (Población + Viviendas).
 * @param {HTMLElement} container
 * @param {{ getCveMun?: () => string | null }} [options]
 */
export function renderInvVivPanel(container, options = {}) {
  if (!container) return;

  _activeField = null;
  clearLayerInternal();

  container.innerHTML = "";

  const head = document.createElement("div");
  head.className = "invviv-panel-head";
  head.innerHTML = `
    <div class="invviv-panel-title">Inventario Nacional de Viviendas</div>
    <div id="invVivActiveLabel" class="fw-semibold text-muted">Ninguno</div>
    <div id="invVivStatus" class="small text-danger mt-1 d-none" role="alert" aria-live="assertive"></div>
  `;
  container.appendChild(head);
  _statusEl = head.querySelector("#invVivStatus");

  const groups = {};
  for (const g of INV_PANEL_GROUPS) {
    groups[g] = [];
  }
  for (const it of INV_ALL_LAYERS) {
    if (groups[it.group]) groups[it.group].push(it);
  }

  for (const gname of INV_PANEL_GROUPS) {
    const section = document.createElement("section");
    section.className = "invviv-group";

    const gBtn = document.createElement("button");
    gBtn.type = "button";
    gBtn.className = "invviv-group__toggle";
    gBtn.setAttribute("aria-expanded", "true");
    gBtn.innerHTML = `<span class="invviv-group__dash" aria-hidden="true">−</span><span>${gname}</span>`;
    section.appendChild(gBtn);

    const list = document.createElement("div");
    list.className = "invviv-group__list";

    gBtn.addEventListener("click", () => {
      const open = list.classList.toggle("d-none");
      gBtn.setAttribute("aria-expanded", open ? "false" : "true");
      gBtn.querySelector(".invviv-group__dash").textContent = open ? "+" : "−";
    });

    for (const it of groups[gname]) {
      const row = document.createElement("label");
      row.className = "invviv-radio" + (it.id === _activeField ? " is-active" : "");
      row.dataset.field = it.id;

      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = "invvivField";
      inp.className = "invviv-radio__input";
      inp.checked = it.id === _activeField;
      inp.value = it.id;

      const ico = document.createElement("span");
      ico.className = "invviv-radio__ico";
      ico.innerHTML = invLayerIconSvg(it.icon, it.color);

      const txt = document.createElement("span");
      txt.className = "invviv-radio__label";
      txt.textContent = it.label;

      inp.addEventListener("change", () => {
        if (!inp.checked) return;
        setInvVivActive(it.id);
      });

      row.append(inp, ico, txt);
      list.appendChild(row);
    }

    section.appendChild(list);
    container.appendChild(section);
  }

  const map = getLeafletMap();
  if (map) syncEntornoMapLegend(map);
}
