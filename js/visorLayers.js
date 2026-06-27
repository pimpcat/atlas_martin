/**
 * Atlas Municipal — Panel lateral del Visor geográfico (data-driven).
 *
 * El listado de capas, grupos y etiquetas proviene de config/visor/catalog.json
 * (vía loadVisorCatalog). La activación en mapa sigue en map.js.
 *
 * @module visorLayers
 */
import {
  getOverlayMinZoom,
  clearVisorThematicLayersOnMap,
  bindAtlasOverlayTips,
  getLeafletMap,
} from "./map.js";
import { downloadVisorLayerExport } from "./visorExport.js";
import { notifyVisorLayerToggled } from "./visorMapUi.js";
import {
  loadVisorCatalog,
  getVisorCatalogGroups,
  getOrderedVisorLayerEntries,
  resetVisorCatalogCache,
} from "./visorCatalog.js";
import { resolveVisorLayerBinding } from "./visorLayerBindings.js";
import { registerVisorCatalogIdentify } from "./visorIdentifyCatalog.js";
import { initVisorStyleFromCatalog } from "./visorStyleRegistry.js";
import { initVisorLabelsFromCatalog } from "./visorLabelRegistry.js";
import { initVisorExportFromCatalog } from "./visorExportRegistry.js";
import { initVisorLegendFromCatalog } from "./visorLegendRegistry.js";
import { ensureVisorSearchConfig } from "./visorSearchCatalog.js";

/**
 * @typedef {object} VisorLayerDef
 * @property {string} id
 * @property {string} checkboxId
 * @property {string} label
 * @property {string} [overlayKey]
 * @property {() => boolean} getActive
 * @property {(active: boolean, cve?: string|null) => void} setActive
 * @property {boolean} [exportKml]
 * @property {boolean} [exportShp]
 */

/** @type {VisorLayerDef[]} */
let _visorLayerDefs = [];
let _catalogReady = false;

function checkboxIdFromLayerId(layerId, entry) {
  if (entry.checkbox_id) return entry.checkbox_id;
  const parts = String(layerId).split("_").filter(Boolean);
  const camel = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
  return `visor${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

function buildDefsFromCatalog() {
  const defs = [];
  for (const entry of getOrderedVisorLayerEntries()) {
    const binding = resolveVisorLayerBinding(entry.id, entry);
    if (!binding) {
      console.warn("[visor] Sin binding de mapa para capa del catálogo:", entry.id);
      continue;
    }
    const caps = entry.capabilities || {};
    const exportFormats = caps.export || [];
    const skipMunFilter = entry.data?.mun_filter === false;
    defs.push({
      id: entry.id,
      overlayKey: binding.overlayKey || entry.overlay_key,
      checkboxId: checkboxIdFromLayerId(entry.id, entry),
      label: entry.label || entry.id,
      getActive: binding.getActive,
      setActive: binding.setActive,
      exportKml: exportFormats.includes("kml"),
      exportShp: exportFormats.includes("shp"),
      exportSkipMunFilter: skipMunFilter,
    });
  }
  return defs;
}

/**
 * Carga el catálogo y prepara definiciones del panel (idempotente).
 * @returns {Promise<VisorLayerDef[]>}
 */
export async function ensureVisorLayerCatalog() {
  if (_catalogReady && _visorLayerDefs.length) return _visorLayerDefs;
  await loadVisorCatalog();
  await initVisorStyleFromCatalog();
  initVisorLabelsFromCatalog();
  initVisorExportFromCatalog();
  await initVisorLegendFromCatalog();
  await ensureVisorSearchConfig();
  _visorLayerDefs = buildDefsFromCatalog();
  registerVisorCatalogIdentify();
  const liveMap = getLeafletMap();
  if (liveMap?.isStyleLoaded?.()) bindAtlasOverlayTips(liveMap);
  _catalogReady = true;
  return _visorLayerDefs;
}

function getVisorLayerDefs() {
  return _visorLayerDefs;
}

const GROUP_COLLAPSE_STORAGE_KEY = "atlasgro-visor-layer-groups";

/**
 * @param {string} groupId
 * @param {boolean} [catalogDefault]
 */
function readGroupCollapsed(groupId, catalogDefault = false) {
  if (!groupId) return catalogDefault;
  try {
    const raw = sessionStorage.getItem(GROUP_COLLAPSE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, groupId)) {
        return Boolean(parsed[groupId]);
      }
    }
  } catch {
    /* ignore */
  }
  return Boolean(catalogDefault);
}

/** @param {string} groupId @param {boolean} collapsed */
function saveGroupCollapsed(groupId, collapsed) {
  if (!groupId) return;
  try {
    const raw = sessionStorage.getItem(GROUP_COLLAPSE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[groupId] = collapsed;
    sessionStorage.setItem(GROUP_COLLAPSE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} group
 * @param {Record<string, VisorLayerDef>} defsById
 * @param {boolean} isFirst
 * @param {() => string | null} getCveMun
 * @param {() => object | null} getMunicipio
 * @param {() => boolean} getStateWideMode
 */
function appendCatalogGroup(
  container,
  group,
  defsById,
  isFirst,
  getCveMun,
  getMunicipio,
  getStateWideMode,
) {
  const layerIds = group.layers || [];
  const rows = layerIds.map((id) => defsById[id]).filter(Boolean);
  if (!rows.length) return;

  const groupId = String(group.id || group.label || "group").trim();
  const collapsible = group.collapsible !== false && Boolean(group.label);

  if (!collapsible) {
    for (const def of rows) {
      appendVisorLayerRow(container, def, getCveMun, getMunicipio, getStateWideMode);
    }
    return;
  }

  const section = document.createElement("section");
  section.className = `visor-layer-group${isFirst ? "" : " visor-layer-group--spaced"}`;
  section.dataset.groupId = groupId;

  const collapsed = readGroupCollapsed(groupId, group.collapsed === true);
  if (collapsed) section.classList.add("visor-layer-group--collapsed");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "visor-layer-group-toggle";
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.setAttribute("aria-controls", `visor-layer-group-body-${groupId}`);

  const chevron = document.createElement("span");
  chevron.className = "visor-layer-group-toggle__chevron";
  chevron.setAttribute("aria-hidden", "true");
  const labelSpan = document.createElement("span");
  labelSpan.className = "visor-layer-group-toggle__label";
  labelSpan.textContent = group.label;
  toggle.append(chevron, labelSpan);

  const body = document.createElement("div");
  body.className = "visor-layer-group-body";
  body.id = `visor-layer-group-body-${groupId}`;

  for (const def of rows) {
    appendVisorLayerRow(body, def, getCveMun, getMunicipio, getStateWideMode);
  }

  toggle.addEventListener("click", () => {
    const nowCollapsed = section.classList.toggle("visor-layer-group--collapsed");
    toggle.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
    saveGroupCollapsed(groupId, nowCollapsed);
  });

  section.append(toggle, body);
  container.append(section);
}

/**
 * @param {HTMLElement} container
 * @param {VisorLayerDef} def
 * @param {() => string | null} getCveMun
 * @param {() => { cve_mun?: string, nomgeo?: string } | null} getMunicipio
 * @param {() => boolean} [getStateWideMode]
 */
function appendVisorLayerRow(container, def, getCveMun, getMunicipio, getStateWideMode) {
  const row = document.createElement("div");
  row.className = "visor-layer-row";
  row.dataset.layerId = def.id;

  const checkWrap = document.createElement("div");
  checkWrap.className = "form-check visor-layer-check mb-0";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "form-check-input";
  cb.id = def.checkboxId;
  cb.checked = def.getActive();

  const label = document.createElement("label");
  label.className = "form-check-label small";
  label.setAttribute("for", def.checkboxId);
  label.textContent = def.label;

  function applyToggle() {
    const stateWide = typeof getStateWideMode === "function" && getStateWideMode();
    const cve = getCveMun();
    if (cb.checked && !cve && !stateWide) {
      cb.checked = false;
      def.setActive(false, null);
      return;
    }
    def.setActive(cb.checked, stateWide ? null : cve || undefined);
    notifyVisorLayerToggled();
  }

  cb.addEventListener("change", applyToggle);
  checkWrap.append(cb, label);

  const btnGroup = document.createElement("div");
  btnGroup.className = "visor-export-btns";
  btnGroup.setAttribute("role", "group");
  btnGroup.setAttribute("aria-label", "Exportar " + def.label);

  if (def.exportKml !== false) {
    const btnKml = document.createElement("button");
    btnKml.type = "button";
    btnKml.className = "btn btn-sm btn-outline-secondary visor-export-btn";
    btnKml.textContent = "KML";
    btnKml.title = "Descargar KML (WGS84) del municipio seleccionado";
    btnKml.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void downloadVisorLayerExport(def.id, "kml", getMunicipio, getCveMun, {
        skipMunFilter: Boolean(def.exportSkipMunFilter),
      });
    });
    btnGroup.append(btnKml);
  }

  if (def.exportShp !== false) {
    const btnShp = document.createElement("button");
    btnShp.type = "button";
    btnShp.className = "btn btn-sm btn-outline-secondary visor-export-btn";
    btnShp.textContent = "SHP";
    btnShp.title = "Descargar Shapefile WGS84 (.zip) del municipio seleccionado";
    btnShp.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void downloadVisorLayerExport(def.id, "shp", getMunicipio, getCveMun, {
        skipMunFilter: Boolean(def.exportSkipMunFilter),
      });
    });
    btnGroup.append(btnShp);
  }

  row.append(checkWrap, btnGroup);
  container.append(row);
}

/**
 * Construye el contenido del panel #visorLayerList.
 * @param {HTMLElement} container
 * @param {{ getCveMun?: () => string | null, getMunicipio?: () => object | null, getStateWideMode?: () => boolean }} [options]
 */
export async function renderVisorLayerPanel(container, options = {}) {
  if (!container) return;

  const getCveMun =
    typeof options.getCveMun === "function" ? options.getCveMun : () => null;
  const getMunicipio =
    typeof options.getMunicipio === "function" ? options.getMunicipio : () => null;
  const getStateWideMode =
    typeof options.getStateWideMode === "function" ? options.getStateWideMode : () => false;

  container.innerHTML = "";

  try {
    await ensureVisorLayerCatalog();
  } catch (err) {
    console.error("[visor] No se pudo cargar el catálogo de capas:", err);
    const msg = document.createElement("p");
    msg.className = "small text-danger mb-0 px-1";
    msg.textContent = "No se pudo cargar el catálogo de capas del visor.";
    container.append(msg);
    return;
  }

  const defs = getVisorLayerDefs();
  const defsById = Object.fromEntries(defs.map((d) => [d.id, d]));
  const groups = getVisorCatalogGroups();

  if (!groups.length) {
    for (const def of defs) {
      appendVisorLayerRow(container, def, getCveMun, getMunicipio, getStateWideMode);
    }
    return;
  }

  let firstGroup = true;
  for (const group of groups) {
    appendCatalogGroup(
      container,
      group,
      defsById,
      firstGroup,
      getCveMun,
      getMunicipio,
      getStateWideMode,
    );
    firstGroup = false;
  }
}

/** Capas temáticas activas en el panel lateral del visor. */
export function getActiveVisorLayers() {
  return getVisorLayerDefs().filter((def) => def.getActive());
}

/** Capas activas del panel que exigen un zoom mínimo (para hint en el mapa). */
export function getActiveVisorLayersWithMinZoom() {
  const out = [];
  for (const def of getVisorLayerDefs()) {
    if (!def.getActive()) continue;
    const key = def.overlayKey || def.id;
    const minZ = getOverlayMinZoom(key);
    if (minZ != null) out.push({ label: def.label, minZ });
  }
  return out;
}

/** Apaga todas las capas temáticas del visor al salir del indicador. */
export function clearVisorThematicLayers() {
  clearVisorThematicLayersOnMap();
}

/** Sincroniza los checkboxes del panel con el estado real de las capas. */
export function syncVisorLayerPanelCheckboxes() {
  for (const def of getVisorLayerDefs()) {
    const cb = document.getElementById(def.checkboxId);
    if (cb) cb.checked = def.getActive();
  }
}

/** Apaga todas las capas temáticas y desmarca el panel lateral. */
export function clearVisorThematicLayersFromPanel() {
  clearVisorThematicLayersOnMap();
  syncVisorLayerPanelCheckboxes();
}

/** Precarga el catálogo al arrancar el visor (opcional). */
export function preloadVisorLayerCatalog() {
  return ensureVisorLayerCatalog().catch((err) => {
    console.warn("[visor] Precarga de catálogo:", err);
  });
}

/** Recarga catálogo y reinicializa estilos (publicación admin). */
export async function reloadVisorLayerCatalog() {
  _catalogReady = false;
  _visorLayerDefs = [];
  resetVisorCatalogCache();
  const { initVisorStyleFromCatalog } = await import("./visorStyleRegistry.js");
  await loadVisorCatalog();
  await initVisorStyleFromCatalog();
  initVisorLabelsFromCatalog();
  initVisorExportFromCatalog();
  await initVisorLegendFromCatalog();
  _visorLayerDefs = buildDefsFromCatalog();
  registerVisorCatalogIdentify();
  _catalogReady = true;
  return _visorLayerDefs;
}
