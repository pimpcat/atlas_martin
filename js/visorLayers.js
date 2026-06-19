/**
 * Atlas Municipal — Panel lateral del Visor geográfico.
 *
 * Renderiza checkboxes de capas temáticas WMS y botones de exportación KML/SHP
 * por fila. El municipio activo proviene de app.js (getCveMun / getMunicipio).
 *
 * @module visorLayers
 * @see map.js              Activación de capas WMS por CVE_MUN
 * @see visorExport.js      downloadVisorLayerExport()
 * @see app_api/routers/api.py  Endpoints FastAPI (ids deben coincidir con VISOR_LAYER_DEFS)
 * @see app.js               renderVisorLayerPanel(), visorLayerPanelOptions()
 *
 * Reglas de UI:
 *   - Sin municipio seleccionado no se activan capas temáticas ni exportación.
 *   - clearVisorThematicLayers() apaga todas las capas al salir del indicador visor.
 */
import {
  setLocsPuntoLayerActive,
  getLocsPuntoLayerActive,
  setLocsAtlasLayerActive,
  getLocsAtlasLayerActive,
  setColoniasLayerActive,
  getColoniasLayerActive,
  setAgebUrbanasLayerActive,
  getAgebUrbanasLayerActive,
  setAgebRuralesLayerActive,
  getAgebRuralesLayerActive,
  setManzanasLayerActive,
  getManzanasLayerActive,
  setVialidadesLayerActive,
  getVialidadesLayerActive,
  setRncLayerActive,
  getRncLayerActive,
  setSaneamientoAguaLayerActive,
  getSaneamientoAguaLayerActive,
  setCluesLayerActive,
  getCluesLayerActive,
  setResiduoSolidoLayerActive,
  getResiduoSolidoLayerActive,
  setUsoSueloLayerActive,
  getUsoSueloLayerActive,
  setHidroCorrientesVisorLayerActive,
  getHidroCorrientesVisorLayerActive,
  setHidroCuerposVisorLayerActive,
  getHidroCuerposVisorLayerActive,
  setCurvasNivelVisorLayerActive,
  getCurvasNivelVisorLayerActive,
  getOverlayMinZoom,
  getOverlayActive,
  setOverlayActiveByKey,
  clearVisorThematicLayersOnMap,
} from "./map.js";
import { downloadVisorLayerExport } from "./visorExport.js";
import { notifyVisorLayerToggled, refreshVisorMapUi } from "./visorMapUi.js";
import { buildDenueVisorPanelDefs } from "./denueLayers.js";

/**
 * @typedef {object} VisorLayerDef
 * @property {string} id - id para /api/visor/export (?layer=) en FastAPI
 * @property {string} checkboxId - id HTML del input
 * @property {string} label - texto visible
 * @property {string} [overlayKey] - clave en OVERLAY_DEFS (map.js) si difiere de id
 * @property {() => boolean} getActive
 * @property {(active: boolean, cve?: string|null) => void} setActive - activa WMS con CVE_MUN
 */

/** Definiciones de capas del panel; el campo `id` es el valor de ?layer= en el API. */
const VISOR_LAYER_DEFS = [
  {
    id: "locspunto",
    overlayKey: "locsPunto",
    checkboxId: "visorLocsPunto",
    label: "Localidades",
    getActive: getLocsPuntoLayerActive,
    setActive: setLocsPuntoLayerActive,
  },
  {
    id: "locsatlas",
    overlayKey: "locsAtlas",
    checkboxId: "visorLocsAtlas",
    label: "Localidades con amanzanamiento",
    getActive: getLocsAtlasLayerActive,
    setActive: setLocsAtlasLayerActive,
  },
  {
    id: "colonias",
    checkboxId: "visorColonias",
    label: "Colonias",
    getActive: getColoniasLayerActive,
    setActive: setColoniasLayerActive,
  },
  {
    id: "ageb_urbanas",
    overlayKey: "agebUrbanas",
    checkboxId: "visorAgebUrbanas",
    label: "AGEBS Urbanas",
    getActive: getAgebUrbanasLayerActive,
    setActive: setAgebUrbanasLayerActive,
  },
  {
    id: "ageb_rurales",
    overlayKey: "agebRurales",
    checkboxId: "visorAgebRurales",
    label: "AGEBS Rurales",
    getActive: getAgebRuralesLayerActive,
    setActive: setAgebRuralesLayerActive,
  },
  {
    id: "manzanas",
    checkboxId: "visorManzanas",
    label: "Manzanas",
    getActive: getManzanasLayerActive,
    setActive: setManzanasLayerActive,
  },
  {
    id: "vialidades",
    checkboxId: "visorVialidades",
    label: "Vialidades (Calles)",
    getActive: getVialidadesLayerActive,
    setActive: setVialidadesLayerActive,
  },
  {
    id: "rnc",
    checkboxId: "visorRnc",
    label: "Red Nacional de Caminos",
    getActive: getRncLayerActive,
    setActive: setRncLayerActive,
  },
  {
    id: "saneamiento_agua",
    overlayKey: "saneamientoAgua",
    checkboxId: "visorSaneamientoAgua",
    label: "Servicios de Agua y Saneamiento",
    getActive: getSaneamientoAguaLayerActive,
    setActive: setSaneamientoAguaLayerActive,
  },
  {
    id: "clues",
    overlayKey: "clues",
    checkboxId: "visorClues",
    label: "Establecimientos de salud",
    getActive: getCluesLayerActive,
    setActive: setCluesLayerActive,
  },
  {
    id: "residuo_solido",
    overlayKey: "residuoSolido",
    checkboxId: "visorResiduoSolido",
    label: "Residuos solidos urbanos",
    getActive: getResiduoSolidoLayerActive,
    setActive: setResiduoSolidoLayerActive,
  },
  {
    id: "uso_suelo",
    checkboxId: "visorUsoSuelo",
    label: "Uso de suelo",
    getActive: getUsoSueloLayerActive,
    setActive: setUsoSueloLayerActive,
  },
  {
    id: "hidro_corrientes",
    checkboxId: "visorHidroCorrientes",
    label: "Hidrografía (corrientes de agua)",
    getActive: getHidroCorrientesVisorLayerActive,
    setActive: setHidroCorrientesVisorLayerActive,
  },
  {
    id: "hidro_cuerpos",
    checkboxId: "visorHidroCuerpos",
    label: "Hidrografía (cuerpos de agua)",
    getActive: getHidroCuerposVisorLayerActive,
    setActive: setHidroCuerposVisorLayerActive,
  },
  {
    id: "curvas_nivel",
    checkboxId: "visorCurvasNivel",
    label: "Curvas de nivel",
    getActive: getCurvasNivelVisorLayerActive,
    setActive: setCurvasNivelVisorLayerActive,
  },
  ...buildDenueVisorPanelDefs(getOverlayActive, setOverlayActiveByKey),
];

/**
 * Una fila del panel: checkbox de capa + botones KML y SHP.
 *
 * @param {HTMLElement} container
 * @param {VisorLayerDef} def
 * @param {() => string | null} getCveMun — CVE 3 dígitos para WMS
 * @param {() => { cve_mun?: string, nomgeo?: string } | null} getMunicipio — para export y nombre de archivo
 * @param {() => boolean} [getStateWideMode]
 */
function appendVisorLayerRow(container, def, getCveMun, getMunicipio, getStateWideMode) {
  const row = document.createElement("div");
  row.className = "visor-layer-row";

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

  // Sin municipio seleccionado no se puede activar capa temática (salvo vista estatal).
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

  const btnKml = document.createElement("button");
  btnKml.type = "button";
  btnKml.className = "btn btn-sm btn-outline-secondary visor-export-btn";
  btnKml.textContent = "KML";
  btnKml.title = "Descargar KML (WGS84) del municipio seleccionado";
  btnKml.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void downloadVisorLayerExport(def.id, "kml", getMunicipio, getCveMun);
  });

  const btnShp = document.createElement("button");
  btnShp.type = "button";
  btnShp.className = "btn btn-sm btn-outline-secondary visor-export-btn";
  btnShp.textContent = "SHP";
  btnShp.title = "Descargar Shapefile WGS84 (.zip) del municipio seleccionado";
  btnShp.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void downloadVisorLayerExport(def.id, "shp", getMunicipio, getCveMun);
  });

  btnGroup.append(btnKml, btnShp);
  row.append(checkWrap, btnGroup);
  container.append(row);
}

/**
 * Construye el contenido del panel #visorLayerList.
 *
 * @param {HTMLElement} container
 * @param {{ getCveMun?: () => string | null, getMunicipio?: () => { cve_mun?: string, nomgeo?: string } | null }} [options]
 */
export function renderVisorLayerPanel(container, options = {}) {
  if (!container) return;

  const getCveMun =
    typeof options.getCveMun === "function" ? options.getCveMun : () => null;
  const getMunicipio =
    typeof options.getMunicipio === "function"
      ? options.getMunicipio
      : () => null;
  const getStateWideMode =
    typeof options.getStateWideMode === "function" ? options.getStateWideMode : () => false;

  container.innerHTML = "";

  for (const def of VISOR_LAYER_DEFS) {
    appendVisorLayerRow(container, def, getCveMun, getMunicipio, getStateWideMode);
  }
}

/** Capas temáticas activas en el panel lateral del visor. */
export function getActiveVisorLayers() {
  return VISOR_LAYER_DEFS.filter((def) => def.getActive());
}

/** Capas activas del panel que exigen un zoom mínimo (para hint en el mapa). */
export function getActiveVisorLayersWithMinZoom() {
  const out = [];
  for (const def of VISOR_LAYER_DEFS) {
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
  for (const def of VISOR_LAYER_DEFS) {
    const cb = document.getElementById(def.checkboxId);
    if (cb) cb.checked = def.getActive();
  }
}

/** Apaga todas las capas temáticas y desmarca el panel lateral. */
export function clearVisorThematicLayersFromPanel() {
  clearVisorThematicLayersOnMap();
  syncVisorLayerPanelCheckboxes();
}
