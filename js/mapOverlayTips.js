/**
 * Tooltips hover (globos) para capas vectoriales Martin del visor.
 * Eventos mouseenter/mousemove/mouseleave por capa (cursor + globo).
 */
import { MARTIN_USO_SUELO } from "./martinLayerStyle.js";

const TIP_DEFS = [
  { primary: "ly-locsPunto", tipHtml: locsPuntoTipHtml },
  { primary: "ly-locsAtlas", tipHtml: locsAtlasTipHtml },
  { primary: "ly-colonias", tipHtml: coloniasTipHtml },
  { primary: "ly-agebUrbanas", tipHtml: agebUrbanasTipHtml },
  { primary: "ly-agebRurales", tipHtml: agebRuralesTipHtml },
  { primary: "ly-manzanas", tipHtml: manzanasTipHtml },
  { primary: "ly-vialidades", tipHtml: vialidadesTipHtml },
  { primary: "ly-rnc", tipHtml: rncTipHtml },
  { primary: "ly-saneamientoAgua", tipHtml: saneamientoTipHtml },
  { primary: "ly-residuoSolido", tipHtml: residuoSolidoTipHtml },
  { primary: MARTIN_USO_SUELO.layerId, tipHtml: usoSueloTipHtml },
  { primary: "ly-hidro", tipHtml: hidroCorrienteTipHtml, visorOnly: true },
  { primary: "ly-hcuerpos", tipHtml: hidroCuerpoTipHtml, visorOnly: true },
];

/** @type {WeakMap<import("maplibre-gl").Map, Set<string>>} */
const _boundLayersByMap = new WeakMap();
/** @type {WeakMap<import("maplibre-gl").Map, Map<string, { depth: number, primary: string, tipHtml: (p: object) => string }>>} */
const _handlersByMap = new WeakMap();

function boundLayerSet(map) {
  let set = _boundLayersByMap.get(map);
  if (!set) {
    set = new Set();
    _boundLayersByMap.set(map, set);
  }
  return set;
}

function handlerMap(map) {
  let m = _handlersByMap.get(map);
  if (!m) {
    m = new Map();
    _handlersByMap.set(map, m);
  }
  return m;
}

let _tipEl = null;
let _tipHoverFeatKey = null;
let _tipOpen = false;
let _tipLeaveTimer = null;

function featureProp(props, ...keys) {
  if (!props) return "";
  for (const key of keys) {
    if (props[key] != null && String(props[key]).trim() !== "") {
      return String(props[key]).trim();
    }
    const upper = key.toUpperCase();
    if (props[upper] != null && String(props[upper]).trim() !== "") {
      return String(props[upper]).trim();
    }
  }
  return "";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tipValue(props, ...keys) {
  const v = featureProp(props, ...keys);
  return escapeHtml(v || "—");
}

function tipColonJoin(props, leftKeys, rightKeys) {
  const left = featureProp(props, ...leftKeys);
  const right = featureProp(props, ...rightKeys);
  if (left && right) return `${escapeHtml(left)}: ${escapeHtml(right)}`;
  if (left) return `${escapeHtml(left)}:`;
  if (right) return escapeHtml(right);
  return "—";
}

function overlayTipShell(title, bodyHtml) {
  return (
    `<div class="atlas-loc-tip">` +
    `<div class="atlas-loc-tip__title">${escapeHtml(title)}</div>` +
    `<div class="atlas-loc-tip__body">${bodyHtml}</div>` +
    `</div>`
  );
}

export function locsPuntoTipHtml(props) {
  const line = [featureProp(props, "cvegeo"), featureProp(props, "nom_loc")].filter(Boolean).join(" ");
  return overlayTipShell("Localidad:", escapeHtml(line || "—"));
}

export function locsAtlasTipHtml(props) {
  const line = [featureProp(props, "cvegeo"), featureProp(props, "nomgeo")].filter(Boolean).join(" ");
  return overlayTipShell("Localidad:", escapeHtml(line || "—"));
}

export function coloniasTipHtml(props) {
  return overlayTipShell("Colonia", tipValue(props, "nom_asen"));
}

export function agebUrbanasTipHtml(props) {
  return overlayTipShell("AGEB Urbana", tipValue(props, "cvegeo"));
}

export function agebRuralesTipHtml(props) {
  return overlayTipShell("AGEB Rural", tipValue(props, "cvegeo"));
}

export function manzanasTipHtml(props) {
  const body = [
    `Clave de manzana: ${tipValue(props, "cvegeo")}`,
    `Ambito: ${tipValue(props, "ambito", "ámbito")}`,
    `Tipo de manzana: ${tipValue(props, "tipomza")}`,
  ].join("<br>");
  return overlayTipShell("Manzana", body);
}

export function vialidadesTipHtml(props) {
  return overlayTipShell("Vialidad", tipColonJoin(props, ["tipovial"], ["nomvial"]));
}

export function rncTipHtml(props) {
  const line1 = tipColonJoin(props, ["tipo_vial"], ["nombre"]);
  const vel = featureProp(props, "velocidad");
  const line2 = vel
    ? `Velocidad máxima: ${escapeHtml(vel)} km/h`
    : "Velocidad máxima: —";
  return overlayTipShell("Red Nacional de Caminos", `${line1}<br>${line2}`);
}

export function saneamientoTipHtml(props) {
  return overlayTipShell("Agua/saneamiento", tipColonJoin(props, ["tipo"], ["nom_tipo"]));
}

export function residuoSolidoTipHtml(props) {
  return overlayTipShell(
    "Residuos solidos urbanos",
    tipColonJoin(props, ["tipo"], ["nom_tipo"]),
  );
}

export function usoSueloTipHtml(props) {
  return overlayTipShell("Uso de Suelo", tipValue(props, "descripcio"));
}

export function hidroCorrienteTipHtml(props) {
  return overlayTipShell("Corriente de agua", `NOMBRE: ${tipValue(props, "nombre")}`);
}

export function hidroCuerpoTipHtml(props) {
  return overlayTipShell("Cuerpo de agua", `NOMBRE: ${tipValue(props, "nombre")}`);
}

let _visorGeograficoActiveFn = () => false;

/** Solo hover/etiquetas de hidrografía en el visor geográfico (no en Datos geográficos). */
export function setOverlayTipsVisorModeActive(fn) {
  _visorGeograficoActiveFn = typeof fn === "function" ? fn : () => false;
}

function overlayFeatureKey(feature) {
  if (!feature) return null;
  if (feature.id != null) return String(feature.id);
  const gid = featureProp(feature.properties, "gid", "GID");
  if (gid) return `gid:${gid}`;
  const cvegeo = featureProp(feature.properties, "cvegeo");
  if (cvegeo) return `cve:${cvegeo}`;
  const nom = featureProp(feature.properties, "nom_asen", "nomvial", "nombre", "descripcio", "nom_tipo");
  return nom ? `nom:${nom}` : null;
}

function isGroupVisible(map, overlayLayerIds, primary) {
  return overlayLayerIds(map, primary).some((id) => {
    if (!map.getLayer(id)) return false;
    return map.getLayoutProperty(id, "visibility") === "visible";
  });
}

function ensureTipEl(map) {
  const container = map.getContainer();
  if (_tipEl && _tipEl.parentNode !== container) {
    _tipEl.remove();
    _tipEl = null;
  }
  if (_tipEl) return _tipEl;
  _tipEl = document.createElement("div");
  _tipEl.className = "atlas-overlay-tip";
  _tipEl.setAttribute("role", "tooltip");
  _tipEl.style.display = "none";
  container.appendChild(_tipEl);
  return _tipEl;
}

function showTip(map, point, html) {
  const el = ensureTipEl(map);
  el.innerHTML = html;
  el.style.display = "block";
  el.style.left = `${Math.round(point.x + 14)}px`;
  el.style.top = `${Math.round(point.y + 14)}px`;
  _tipOpen = true;
}

function hideTip(map) {
  if (_tipLeaveTimer) {
    clearTimeout(_tipLeaveTimer);
    _tipLeaveTimer = null;
  }
  _tipHoverFeatKey = null;
  _tipOpen = false;
  if (_tipEl) _tipEl.style.display = "none";
  if (map) map.getCanvas().style.cursor = "";
}

function scheduleHideIfIdle(map) {
  if (_tipLeaveTimer) clearTimeout(_tipLeaveTimer);
  _tipLeaveTimer = setTimeout(() => {
    let anyDepth = false;
    for (const st of handlerMap(map).values()) {
      if (st.depth > 0) {
        anyDepth = true;
        break;
      }
    }
    if (!anyDepth) hideTip(map);
    _tipLeaveTimer = null;
  }, 50);
}

function bindLayerTipHandlers(map, layerId, primary, tipHtml, visorOnly = false) {
  const bound = boundLayerSet(map);
  if (!map.getLayer(layerId) || bound.has(layerId)) return;

  const state = { depth: 0, primary, tipHtml, visorOnly };
  handlerMap(map).set(layerId, state);

  const onEnter = (e) => {
    if (visorOnly && !_visorGeograficoActiveFn()) return;
    if (!_overlayLayerIdsFn || !isGroupVisible(map, _overlayLayerIdsFn, primary)) return;
    const f = e.features?.[0];
    if (!f) return;

    if (_tipLeaveTimer) {
      clearTimeout(_tipLeaveTimer);
      _tipLeaveTimer = null;
    }

    state.depth += 1;
    map.getCanvas().style.cursor = "pointer";
    _tipHoverFeatKey = overlayFeatureKey(f);
    showTip(map, e.point, tipHtml(f.properties || {}));
  };

  const onMove = (e) => {
    if (!_tipOpen || !_tipEl) return;
    _tipEl.style.left = `${Math.round(e.point.x + 14)}px`;
    _tipEl.style.top = `${Math.round(e.point.y + 14)}px`;
    const f = e.features?.[0];
    if (!f) return;
    const key = overlayFeatureKey(f);
    if (key && key !== _tipHoverFeatKey) {
      _tipHoverFeatKey = key;
      _tipEl.innerHTML = tipHtml(f.properties || {});
    }
  };

  const onLeave = () => {
    state.depth = Math.max(0, state.depth - 1);
    if (state.depth > 0) return;
    scheduleHideIfIdle(map);
  };

  map.on("mouseenter", layerId, onEnter);
  map.on("mousemove", layerId, onMove);
  map.on("mouseleave", layerId, onLeave);
  bound.add(layerId);
}

let _overlayLayerIdsFn = null;

/**
 * Enlaza handlers en capas nuevas (p. ej. ly-*-fill añadidas tras migración).
 * @param {import("maplibre-gl").Map} map
 * @param {(layerId: string) => string[]} overlayLayerIds
 */
export function refreshOverlayTipBindings(map, overlayLayerIds) {
  if (!map) return;
  _overlayLayerIdsFn = overlayLayerIds;

  for (const def of TIP_DEFS) {
    for (const layerId of overlayLayerIds(map, def.primary)) {
      bindLayerTipHandlers(map, layerId, def.primary, def.tipHtml, Boolean(def.visorOnly));
    }
  }

  if (!map.__overlayTipCanvasLeaveBound) {
    map.getCanvas().addEventListener("mouseleave", () => hideTip(map));
    map.__overlayTipCanvasLeaveBound = true;
  }
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {(layerId: string) => string[]} overlayLayerIds
 */
export function bindAllOverlayTipHovers(map, overlayLayerIds) {
  if (!map) return;
  refreshOverlayTipBindings(map, overlayLayerIds);
}
