/**
 * Orquestador principal del Atlas Gro (SPA en index.html).
 * Enlaza menú lateral, selección de municipio, mapa Leaflet y paneles por indicador.
 *
 * Dependencias principales: map.js, api.js, dashboard.js, geoContext.js, homeView.js,
 * visorLayers.js, invViv.js, módulos *Viz.js / *Export.js y theme.js.
 */
import { createMenu, collapseAllMenuSections, clearActiveMenuItem } from "./menu.js";
import {
  setMapView,
  getMapBaseUrl,
  setMunicipioMapFocus,
  scheduleMunicipioMapFocus,
  setLocsAtlasLayerActive,
  setMarcoWmsVisible,
  syncGeoThematicLayers,
  clearGeoThematicLayers,
  warmGeoThematicTiles,
  setHomeMapMode,
  setHomeMunicipioHighlight,
  setHomeMunicipioClickHandler,
  invalidateMapSize,
  refitHomeMapView,
  enterExploradorMapView,
  leaveHomeMapMode,
  restoreMapZoomControls,
  bindMapResizeHandler,
  invalidateMunicipioMapFocus,
} from "./map.js";
import {
  getIndicatorData,
  getMenuModel,
  fetchMunicipios,
  ensureGeoContextoBulk,
  ensureExploradorBulk,
  prefetchMunicipioData,
  fetchPoblacionComparativa,
  fetchCrecimientoComparativa,
  fetchEdadMedianaComparativa,
  fetchNacimientosVista,
  fetchDefuncionesVista,
  fetchUnidadesMedicasVista,
  fetchEscolaridadVista,
  fetchAnalfabetismoVista,
  fetchViviendaParticipacionVista,
  fetchViviendaServiciosVista,
  fetchPoblacionOcupadaVista,
  fetchCaracteristicasEconomicasVista,
  fetchUnidadesEconomicasVista,
  fetchSuperficieAgriculturaVista,
  fetchInversionPublicaVista,
  fetchInstitucionesAdminPublicaMunicipalVista,
  fetchHabitantesPorPoliciaVista,
} from "./api.js";
import { renderMunicipiosSelect, setMunicipioSelectValue } from "./municipios.js";
import { loadAndRenderHomePanels, loadHomeContext } from "./homeView.js";
import { renderTable } from "./table.js";
import { ensureChart, updateBarChart } from "./charts.js";
import { renderPoblacionComparativa } from "./poblacionViz.js";
import { renderEdadMedianaComparativa } from "./edadMedianaViz.js";
import { renderCrecimientoComparativa } from "./crecimientoViz.js";
import { renderNacimientosVista } from "./nacimientosViz.js";
import { renderDefuncionesVista } from "./defuncionesViz.js";
import { renderUnidadesMedicasVista } from "./unidadesMedicasViz.js";
import { renderEscolaridadVista } from "./escolaridadViz.js";
import { renderPoblacionOcupadaVista } from "./poblacionOcupadaViz.js";
import { renderCaracteristicasEconomicasVista } from "./caracteristicasEconomicasViz.js";
import { renderUnidadesEconomicasVista } from "./unidadesEconomicasViz.js";
import { renderSuperficieAgriculturaVista } from "./superficieAgriculturaViz.js";
import { renderInversionPublicaVista } from "./inversionPublicaViz.js";
import { renderInstitucionesAdminPublicaVista } from "./institucionesAdminPublicaViz.js";
import { renderHabitantesPoliciaVista } from "./habitantesPoliciaViz.js";
import { renderAnalfabetismoVista } from "./analfabetismoViz.js";
import { renderViviendaParticipacionVista } from "./viviendaParticipacionViz.js";
import {
  renderViviendaServiciosVista,
  updateViviendaServiciosChartTheme,
} from "./viviendaServiciosViz.js";
import {
  attachPoblacionExportButtons,
  setLastPoblacionExport,
} from "./poblacionExport.js";
import {
  attachCrecimientoExportButtons,
  setLastCrecimientoExport,
} from "./crecimientoExport.js";
import {
  attachEdadMedianaExportButtons,
  setLastEdadMedianaExport,
} from "./edadMedianaExport.js";
import {
  attachNacimientosExportButtons,
  setLastNacimientosExport,
} from "./nacimientosExport.js";
import {
  attachDefuncionesExportButtons,
  setLastDefuncionesExport,
} from "./defuncionesExport.js";
import {
  attachUnidadesMedicasExportButtons,
  setLastUnidadesMedicasExport,
} from "./unidadesMedicasExport.js";
import {
  attachEscolaridadExportButtons,
  setLastEscolaridadExport,
} from "./escolaridadExport.js";
import {
  attachPoblacionOcupadaExportButtons,
  setLastPoblacionOcupadaExport,
} from "./poblacionOcupadaExport.js";
import {
  attachCaracteristicasEconomicasExportButtons,
  setLastCaracteristicasEconomicasExport,
} from "./caracteristicasEconomicasExport.js";
import {
  attachUnidadesEconomicasExportButtons,
  setLastUnidadesEconomicasExport,
} from "./unidadesEconomicasExport.js";
import {
  attachSuperficieAgriculturaExportButtons,
  setLastSuperficieAgriculturaExport,
} from "./superficieAgriculturaExport.js";
import {
  attachInversionPublicaExportButtons,
  setLastInversionPublicaExport,
} from "./inversionPublicaExport.js";
import {
  attachInstitucionesAdminPublicaExportButtons,
  setLastInstitucionesAdminPublicaExport,
} from "./institucionesAdminPublicaExport.js";
import {
  attachHabitantesPoliciaExportButtons,
  setLastHabitantesPoliciaExport,
} from "./habitantesPoliciaExport.js";
import {
  attachAnalfabetismoExportButtons,
  setLastAnalfabetismoExport,
} from "./analfabetismoExport.js";
import {
  attachViviendaParticipacionExportButtons,
  setLastViviendaParticipacionExport,
} from "./viviendaParticipacionExport.js";
import {
  attachViviendaServiciosExportButtons,
  setLastViviendaServiciosExport,
} from "./viviendaServiciosExport.js";
import {
  setGeoLayout,
  setVisorLayout,
  setInvVivLayout,
  setPoblacionLayout,
  setCrecimientoLayout,
  setEdadMedianaLayout,
  setNacimientosLayout,
  setDefuncionesLayout,
  setUnidadesMedicasLayout,
  setEscolaridadLayout,
  setAnalfabetismoLayout,
  setViviendaParticipacionLayout,
  setViviendaServiciosLayout,
  setPoblacionOcupadaLayout,
  setCaracteristicasEconomicasLayout,
  setUnidadesEconomicasLayout,
  setSuperficieAgriculturaLayout,
  setInversionPublicaLayout,
  setInstitucionesAdminPublicaLayout,
  setHabitantesPoliciaLayout,
  setSitiosInteresLayout,
  setHomeLayout,
} from "./dashboard.js";
import { renderSitiosInteresView } from "./sitiosInteresView.js";
import {
  renderVisorLayerPanel,
  clearVisorThematicLayers,
  getActiveVisorLayersWithMinZoom,
  preloadVisorLayerCatalog,
} from "./visorLayers.js";
import { attachVisorMapUi, teardownVisorMapUi, refreshVisorMapUi } from "./visorMapUi.js";
import {
  attachVisorMapLegend,
  teardownVisorMapLegend,
  refreshVisorMapLegend,
} from "./visorMapLegend.js";
import {
  attachGeoMapLegend,
  syncGeoMapLegend,
  teardownGeoMapLegend,
} from "./geoMapLegend.js";
import {
  attachVisorMapOpacity,
  teardownVisorMapOpacity,
  refreshVisorMapOpacity,
} from "./visorMapOpacity.js";
import { setOverlayTipsVisorModeActive } from "./mapOverlayTips.js";
import {
  attachVisorMapIdentify,
  teardownVisorMapIdentify,
  refreshVisorMapIdentify,
  setVisorMapIdentifyActive,
} from "./visorMapIdentify.js";
import {
  attachVisorMapExport,
  teardownVisorMapExport,
  refreshVisorMapExport,
} from "./visorMapExport.js";
import { attachVisorDraw, teardownVisorDraw, refreshVisorDraw } from "./visorDraw.js";
import { attachVisorBuffer, teardownVisorBuffer, refreshVisorBuffer } from "./visorBuffer.js";
import {
  attachVisorFeaturePickBuffer,
  teardownVisorFeaturePickBuffer,
  refreshVisorFeaturePickBuffer,
} from "./visorFeaturePickBuffer.js";
import {
  attachVisorSpatialAnalysis,
  teardownVisorSpatialAnalysis,
  refreshVisorSpatialAnalysis,
} from "./visorSpatialAnalysis.js";
import {
  attachVisorTabular,
  teardownVisorTabular,
  refreshVisorTabular,
} from "./visorTabular.js";
import {
  attachVisorStateWide,
  teardownVisorStateWide,
  refreshVisorStateWide,
} from "./visorStateWide.js";
import {
  attachVisorCatalogAdmin,
  refreshVisorCatalogAdmin,
} from "./visorCatalogAdmin.js";
import {
  attachVisorClearLayers,
  teardownVisorClearLayers,
  refreshVisorClearLayers,
} from "./visorClearLayers.js";
import { getVisorStateWideMode, setVisorStateWideMode } from "./map.js";
import {
  attachVisorMapCompare,
  teardownVisorMapCompare,
  refreshVisorMapCompare,
} from "./visorMapCompare.js";
import {
  attachVisorGeocoder,
  teardownVisorGeocoder,
  refreshVisorGeocoder,
  clearVisorGeocoderSearch,
} from "./visorGeocoder.js";
import {
  renderInvVivPanel,
  attachInvVivMap,
  refreshInvVivNow,
  teardownInvVivMode,
} from "./invViv.js";
import { createGeoContextController } from "./geoContext.js";
import { initThemeSelector } from "./theme.js";

// --- Estado global de la aplicación ---

const state = {
  activeIndicatorId: null,
  /** Indicador activo (para restaurar vista del mapa al quitar municipio). */
  activeIndicator: null,
  chart: null,
  selectedMunicipio: null,
  /** Filas de atlas."12mun" para resolver nombre al clic en mapa de inicio. */
  municipiosRows: [],
  geoCtx: null,
  /** "home" = carta de presentación; "app" = indicadores / visor. */
  viewMode: "home",
};

// --- Municipio: clic en mapa de inicio y metadatos de tabla ---

/**
 * Resuelve nombre desde el catálogo atlas."12mun" si el GFI solo devolvió clave.
 * @param {{ cve_mun?: string, nomgeo?: string } | null} hit
 * @returns {{ cve_mun: string, nomgeo: string } | null}
 */
function resolveMunicipioFromMapHit(hit) {
  if (!hit || hit.cve_mun == null || hit.cve_mun === "") return null;
  const cve = String(hit.cve_mun).replace(/\D/g, "").slice(-3).padStart(3, "0");
  let nom = hit.nomgeo != null ? String(hit.nomgeo).trim() : "";
  if (!nom && state.municipiosRows.length) {
    for (let i = 0; i < state.municipiosRows.length; i++) {
      const r = state.municipiosRows[i];
      const rc = String(r.cve_mun != null ? r.cve_mun : "")
        .replace(/\D/g, "")
        .slice(-3)
        .padStart(3, "0");
      if (rc === cve) {
        nom = r.nomgeo != null ? String(r.nomgeo) : "";
        break;
      }
    }
  }
  return { cve_mun: cve, nomgeo: nom };
}

function setActivePill(_text) {
  /* Badge de indicador activo eliminado del header */
}

function setTableMeta(text) {
  const el = document.getElementById("tableMeta");
  el.textContent = text || "—";
}

// --- Predicados: tipo de indicador activo (flags del menú en api.js) ---

function isVisorIndicator(indicator) {
  return indicator && indicator.visor === true;
}

function updateVisorMunicipioLabel() {
  const nom = state.selectedMunicipio?.nomgeo?.trim() || "—";
  for (const id of ["visorMunicipioLabel", "invVivMunicipioLabel"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = nom;
  }
}

function isInvVivIndicator(indicator) {
  return indicator && indicator.invViv === true;
}

function isGeoContextIndicator(indicator) {
  return indicator && indicator.geoContext === true;
}

function isPoblacionIndicator(indicator) {
  return indicator && indicator.poblacionComparativa === true;
}

function isCrecimientoIndicator(indicator) {
  return indicator && indicator.crecimientoComparativa === true;
}

function isEdadMedianaIndicator(indicator) {
  return indicator && indicator.edadMedianaComparativa === true;
}

function isNacimientosIndicator(indicator) {
  return indicator && indicator.nacimientosVista === true;
}

function isDefuncionesIndicator(indicator) {
  return indicator && indicator.defuncionesVista === true;
}

function isUnidadesMedicasIndicator(indicator) {
  return indicator && indicator.unidadesMedicasVista === true;
}

function isEscolaridadIndicator(indicator) {
  return indicator && indicator.escolaridadVista === true;
}

function isAnalfabetismoIndicator(indicator) {
  return indicator && indicator.analfabetismoVista === true;
}

function isViviendaParticipacionIndicator(indicator) {
  return indicator && indicator.viviendaParticipacionVista === true;
}

function isViviendaServiciosIndicator(indicator) {
  return indicator && indicator.viviendaServiciosVista === true;
}

function isPoblacionOcupadaIndicator(indicator) {
  return indicator && indicator.poblacionOcupadaVista === true;
}

function isCaracteristicasEconomicasIndicator(indicator) {
  return indicator && indicator.caracteristicasEconomicasVista === true;
}

function isUnidadesEconomicasIndicator(indicator) {
  return indicator && indicator.unidadesEconomicasVista === true;
}

function isSuperficieAgriculturaIndicator(indicator) {
  return indicator && indicator.superficieAgriculturaVista === true;
}

function isInversionPublicaIndicator(indicator) {
  return indicator && indicator.inversionPublicaVista === true;
}

function isInstitucionesAdminPublicaMunicipalIndicator(indicator) {
  return indicator && indicator.institucionesAdminPublicaMunicipalVista === true;
}

function isHabitantesPorPoliciaIndicator(indicator) {
  return indicator && indicator.habitantesPorPoliciaVista === true;
}

function isSitiosInteresIndicator(indicator) {
  return indicator && indicator.sitiosInteres === true;
}

// --- Metadatos de cabecera por panel comparativo / vista ---

function setPoblacionMeta(text) {
  const el = document.getElementById("poblacionMeta");
  if (el) el.textContent = text || "—";
}

function setCrecimientoMeta(text) {
  const el = document.getElementById("crecimientoMeta");
  if (el) el.textContent = text || "—";
}

function setEdadMedianaMeta(text) {
  const el = document.getElementById("edadMedianaMeta");
  if (el) el.textContent = text || "—";
}

function setNacimientosMeta(text) {
  const el = document.getElementById("nacimientosMeta");
  if (el) el.textContent = text || "—";
}

function setDefuncionesMeta(text) {
  const el = document.getElementById("defuncionesMeta");
  if (el) el.textContent = text || "—";
}

function setUnidadesMedicasMeta(text) {
  const el = document.getElementById("unidadesMedicasMeta");
  if (el) el.textContent = text || "—";
}

function setEscolaridadMeta(text) {
  const el = document.getElementById("escolaridadMeta");
  if (el) el.textContent = text || "—";
}

function setAnalfabetismoMeta(text) {
  const el = document.getElementById("analfabetismoMeta");
  if (el) el.textContent = text || "—";
}

function setViviendaParticipacionMeta(text) {
  const el = document.getElementById("viviendaParticipacionMeta");
  if (el) el.textContent = text || "—";
}

function setViviendaServiciosMeta(text) {
  const el = document.getElementById("viviendaServiciosMeta");
  if (el) el.textContent = text || "—";
}

function setPoblacionOcupadaMeta(text) {
  const el = document.getElementById("poblacionOcupadaMeta");
  if (el) el.textContent = text || "—";
}

function setCaracteristicasEconomicasMeta(text) {
  const el = document.getElementById("caracteristicasEconomicasMeta");
  if (el) el.textContent = text || "—";
}

function setUnidadesEconomicasMeta(text) {
  const el = document.getElementById("unidadesEconomicasMeta");
  if (el) el.textContent = text || "—";
}

function setSuperficieAgriculturaMeta(text) {
  const el = document.getElementById("superficieAgriculturaMeta");
  if (el) el.textContent = text || "—";
}

function setInversionPublicaMeta(text) {
  const el = document.getElementById("inversionPublicaMeta");
  if (el) el.textContent = text || "—";
}

function setInstitucionesAdminPublicaMeta(text) {
  const el = document.getElementById("institucionesAdminPublicaMeta");
  if (el) el.textContent = text || "—";
}

function setHabitantesPoliciaMeta(text) {
  const el = document.getElementById("habitantesPoliciaMeta");
  if (el) el.textContent = text || "—";
}

// --- Visor geográfico e inventario: panel de capas ---

/** Opciones del panel de capas del visor: municipio activo para WMS y exportación KML/SHP. */
function visorLayerPanelOptions() {
  return {
    getCveMun: () =>
      state.selectedMunicipio && state.selectedMunicipio.cve_mun != null
        ? String(state.selectedMunicipio.cve_mun)
        : null,
    getMunicipio: () => state.selectedMunicipio,
    getStateWideMode: () => getVisorStateWideMode(),
  };
}

function spatialAnalysisOptions() {
  return {
    getCveMun: () =>
      state.selectedMunicipio?.cve_mun != null
        ? String(state.selectedMunicipio.cve_mun)
        : null,
  };
}

function onVisorLayersPanelRefresh() {
  refreshVisorLayerPanel();
  refreshVisorCatalogAdmin();
}

/** Plugins de mapa compartidos entre visor geográfico e inventario de viviendas. */
function attachMapViewerPlugins({ includeMapUi = false } = {}) {
  if (!includeMapUi) {
    teardownVisorMapLegend();
    setOverlayTipsVisorModeActive(() => false);
    setVisorMapIdentifyActive(() => false);
  } else {
    setOverlayTipsVisorModeActive(() => isVisorIndicator(state.activeIndicator));
    setVisorMapIdentifyActive(() => isVisorIndicator(state.activeIndicator));
  }
  if (includeMapUi) {
    attachVisorMapUi({ getActiveLayersWithMinZoom: getActiveVisorLayersWithMinZoom });
    attachVisorMapLegend();
    attachVisorMapOpacity();
    attachVisorFeaturePickBuffer();
    attachVisorMapIdentify();
  }
  attachVisorGeocoder(visorLayerPanelOptions());
  attachVisorMapExport();
  attachVisorDraw();
  attachVisorBuffer();
  attachVisorSpatialAnalysis(spatialAnalysisOptions());
  attachVisorTabular(visorLayerPanelOptions());
  attachVisorStateWide();
  attachVisorClearLayers();
  attachVisorMapCompare();
  document.addEventListener("atlasgro-visor-layers-panel-refresh", onVisorLayersPanelRefresh);
}

function refreshMapViewerPlugins({ includeMapUi = false } = {}) {
  if (includeMapUi) {
    refreshVisorMapUi();
    refreshVisorMapLegend();
    refreshVisorMapOpacity();
    refreshVisorFeaturePickBuffer();
    refreshVisorMapIdentify();
  }
  refreshVisorMapExport();
  refreshVisorDraw();
  refreshVisorBuffer();
  refreshVisorSpatialAnalysis();
  refreshVisorTabular(visorLayerPanelOptions());
  refreshVisorStateWide();
  refreshVisorCatalogAdmin();
  refreshVisorClearLayers();
  refreshVisorMapCompare();
  refreshVisorGeocoder();
}

function teardownMapViewerPlugins() {
  setOverlayTipsVisorModeActive(() => false);
  setVisorMapIdentifyActive(() => false);
  teardownVisorMapUi();
  teardownVisorMapLegend();
  teardownVisorMapOpacity();
  teardownVisorFeaturePickBuffer();
  teardownVisorMapIdentify();
  teardownVisorMapExport();
  teardownVisorDraw();
  teardownVisorBuffer();
  teardownVisorSpatialAnalysis();
  teardownVisorTabular();
  teardownVisorStateWide();
  teardownVisorClearLayers();
  teardownVisorMapCompare();
  teardownVisorGeocoder();
  document.removeEventListener("atlasgro-visor-layers-panel-refresh", onVisorLayersPanelRefresh);
}

function refreshVisorLayerPanel() {
  const layerHost = document.getElementById("visorLayerList");
  if (layerHost && isVisorIndicator(state.activeIndicator)) {
    void renderVisorLayerPanel(layerHost, visorLayerPanelOptions()).then(() => {
      refreshVisorMapUi();
    });
  }
}

/** Sincroniza capas WMS temáticas de Datos Geográficos según la pestaña activa. */
function getMapFocusProfile() {
  if (isVisorIndicator(state.activeIndicator)) return "visor";
  if (isInvVivIndicator(state.activeIndicator)) return "visor";
  if (isGeoContextIndicator(state.activeIndicator)) return "geo";
  return "default";
}

function syncGeoMapOverlayLayers() {
  const tab = state.geoCtx?.getActiveTabId?.() ?? "";
  const cve =
    state.selectedMunicipio && state.selectedMunicipio.cve_mun != null
      ? state.selectedMunicipio.cve_mun
      : null;
  const inGeo = isGeoContextIndicator(state.activeIndicator) && Boolean(cve);
  syncGeoThematicLayers(tab, cve, inGeo);
  syncGeoMapLegend(tab, inGeo);
}

/** Enfoque municipal tras estabilizar layout del dashboard (un solo fly). */
function scheduleAppMunicipioFocus(profile) {
  const mapEl = document.getElementById("mapFrame");
  const cve = state.selectedMunicipio?.cve_mun;
  if (!mapEl || !cve) return;
  scheduleMunicipioMapFocus(mapEl, cve, profile);
}

/**
 * En visor: solo contorno municipal (Marco WMS). Quita capas temáticas y alinea el panel.
 */
function resetVisorMapForMunicipioChange() {
  if (getVisorStateWideMode()) {
    setVisorStateWideMode(false);
  }
  setLocsAtlasLayerActive(false, null);
  setMarcoWmsVisible(true);
  refreshVisorLayerPanel();
  const mapEl = document.getElementById("mapFrame");
  const cve = state.selectedMunicipio?.cve_mun;
  if (cve && mapEl) {
    scheduleMunicipioMapFocus(mapEl, cve, "visor");
    requestAnimationFrame(() => {
      invalidateMapSize();
      refreshVisorMapUi();
      refreshVisorGeocoder();
    });
  }
}

function resetInvVivForMunicipioChange() {
  if (!isInvVivIndicator(state.activeIndicator)) return;
  const mapEl = document.getElementById("mapFrame");
  if (state.selectedMunicipio && state.selectedMunicipio.cve_mun && mapEl) {
    scheduleMunicipioMapFocus(mapEl, state.selectedMunicipio.cve_mun, "inv");
    requestAnimationFrame(() => {
      invalidateMapSize();
      refreshMapViewerPlugins({ includeMapUi: false });
    });
  }
  refreshInvVivNow();
}

// --- Navegación: carta de presentación (Inicio) vs modo indicadores ---

function exitHomeView() {
  const wasHome = state.viewMode === "home";
  if (wasHome) {
    state.viewMode = "app";
    setHomeLayout(false);
    const btn = document.getElementById("btnInicio");
    btn?.classList.remove("is-active");
    btn?.removeAttribute("aria-current");
  }
  leaveHomeMapMode();
  restoreMapZoomControls();
}

let _goHomeInFlight = null;

async function goToHomeView() {
  if (_goHomeInFlight) return _goHomeInFlight;

  _goHomeInFlight = (async () => {
    collapseAllMenuSections();
    clearActiveMenuItem();
    state.viewMode = "home";
    state.activeIndicatorId = null;
    state.activeIndicator = null;
    setActivePill("Explorador municipal");
    setHomeLayout(true);
    setGeoLayout(false);
    setVisorLayout(false);
    setInvVivLayout(false);
    teardownInvVivMode();
    teardownMapViewerPlugins();
    invalidateMunicipioMapFocus();
    clearVisorThematicLayers();
    clearGeoThematicLayers();
    teardownGeoMapLegend();
    setMarcoWmsVisible(false);
    const btn = document.getElementById("btnInicio");
    btn?.classList.add("is-active");
    btn?.setAttribute("aria-current", "page");
    restoreMapZoomControls();
    const cve =
      state.selectedMunicipio && state.selectedMunicipio.cve_mun
        ? state.selectedMunicipio.cve_mun
        : null;
    await Promise.all([
      enterExploradorMapView(cve),
      loadAndRenderHomePanels(state.selectedMunicipio),
    ]);
    clearVisorThematicLayers();
  })();

  try {
    await _goHomeInFlight;
  } finally {
    _goHomeInFlight = null;
  }
}

// --- Selección de municipio (combo, mapa inicio, recarga de vista activa) ---

/**
 * @param {{ cve_mun?: string, nomgeo?: string } | null} m
 */
async function applyMunicipioSelection(m) {
  state.selectedMunicipio = m;
  const munSelect = document.getElementById("selectMunicipio");
  setMunicipioSelectValue(munSelect, m);

  if (state.viewMode === "home") {
    setHomeMunicipioHighlight(m && m.cve_mun ? m.cve_mun : null);
    void loadAndRenderHomePanels(m, { optimistic: true });
    if (m?.cve_mun) prefetchMunicipioData(m.cve_mun);
    return;
  }

  const mapEl = document.getElementById("mapFrame");
  const profile = getMapFocusProfile();
  const cve = m && m.cve_mun ? m.cve_mun : null;
  const onVisor = isVisorIndicator(state.activeIndicator);
  const onInv = isInvVivIndicator(state.activeIndicator);
  const onGeo = isGeoContextIndicator(state.activeIndicator);

  void loadAndRenderHomePanels(m, { optimistic: true });
  if (cve) prefetchMunicipioData(cve);

  try {
    if (onVisor) {
      resetVisorMapForMunicipioChange();
    } else if (onInv) {
      resetInvVivForMunicipioChange();
    }

    if (!onVisor && !onInv) {
      if (onGeo && cve && mapEl) {
        scheduleMunicipioMapFocus(mapEl, cve, profile);
        syncGeoMapOverlayLayers();
        warmGeoThematicTiles(cve);
      } else {
        await setMunicipioMapFocus(mapEl, cve, profile);
        if (onGeo) {
          syncGeoMapOverlayLayers();
          if (cve) warmGeoThematicTiles(cve);
        }
        if (!m && state.activeIndicator) {
          setMapView(mapEl, state.activeIndicator.viewParam);
        }
      }
    } else if (onInv && !cve && mapEl && state.activeIndicator) {
      setMapView(mapEl, state.activeIndicator.viewParam);
    } else if (onVisor && !cve && mapEl && state.activeIndicator) {
      await setMunicipioMapFocus(mapEl, null, profile);
      setMapView(mapEl, state.activeIndicator.viewParam);
    }
  } catch (err) {
    console.warn("[municipio] map focus:", err);
  }

  if (onGeo && state.geoCtx) {
    try {
      state.geoCtx.setMunicipioChanged();
    } catch (err) {
      console.warn("[municipio] geo context:", err);
    }
  }

  if (onVisor || onInv) {
    updateVisorMunicipioLabel();
  }
  if (onVisor) {
    clearVisorGeocoderSearch();
    refreshVisorGeocoder();
  }

  if (
    isPoblacionIndicator(state.activeIndicator) ||
    isCrecimientoIndicator(state.activeIndicator) ||
    isEdadMedianaIndicator(state.activeIndicator) ||
    isNacimientosIndicator(state.activeIndicator) ||
    isDefuncionesIndicator(state.activeIndicator) ||
    isUnidadesMedicasIndicator(state.activeIndicator) ||
    isEscolaridadIndicator(state.activeIndicator) ||
    isAnalfabetismoIndicator(state.activeIndicator) ||
    isViviendaParticipacionIndicator(state.activeIndicator) ||
    isViviendaServiciosIndicator(state.activeIndicator) ||
    isPoblacionOcupadaIndicator(state.activeIndicator) ||
    isCaracteristicasEconomicasIndicator(state.activeIndicator) ||
    isUnidadesEconomicasIndicator(state.activeIndicator) ||
    isSuperficieAgriculturaIndicator(state.activeIndicator) ||
    isInversionPublicaIndicator(state.activeIndicator) ||
    isInstitucionesAdminPublicaMunicipalIndicator(state.activeIndicator) ||
    isHabitantesPorPoliciaIndicator(state.activeIndicator)
  ) {
    await onIndicatorSelected(state.activeIndicator);
  }
}

/**
 * Enrutador central al elegir un ítem del menú: activa layout en dashboard.js,
 * carga datos vía api.js y pinta el módulo *Viz.js correspondiente.
 */
async function onIndicatorSelected(indicator) {
  exitHomeView();
  requestAnimationFrame(() => restoreMapZoomControls());

  state.activeIndicatorId = indicator.id;
  state.activeIndicator = indicator;

  // Si estamos saliendo del INV, ocultar su layout.
  if (!isInvVivIndicator(indicator)) {
    setInvVivLayout(false);
    teardownInvVivMode();
  }

  if (!isVisorIndicator(indicator) && !isInvVivIndicator(indicator)) {
    teardownMapViewerPlugins();
  }

  if (!isVisorIndicator(indicator) && !isInvVivIndicator(indicator)) {
    clearVisorThematicLayers();
  }

  if (!isGeoContextIndicator(indicator)) {
    clearGeoThematicLayers();
    teardownGeoMapLegend();
  }

  // --- Indicador: Datos geográficos (pestañas + mapa macro) ---
  if (isGeoContextIndicator(indicator)) {
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setVisorLayout(false);
    setInvVivLayout(false);
    setGeoLayout(true);
    setMarcoWmsVisible(true);

    const mapEl = document.getElementById("mapFrame");

    // Panel de pestañas
    const tabsEl = document.getElementById("geoTabs");
    const contentEl = document.getElementById("geoTabContent");
    const metaEl = document.getElementById("geoTabsMeta");
    if (tabsEl && contentEl) {
      state.geoCtx = createGeoContextController({
        tabsEl,
        contentEl,
        metaEl,
        getMunicipio: () => state.selectedMunicipio,
        onTabChange: () => syncGeoMapOverlayLayers(),
      });
      await state.geoCtx.refresh();
    }

    syncGeoMapOverlayLayers();
    if (state.selectedMunicipio?.cve_mun) {
      warmGeoThematicTiles(state.selectedMunicipio.cve_mun);
    }
    attachGeoMapLegend();

    scheduleAppMunicipioFocus("geo");
    if (!state.selectedMunicipio?.cve_mun && mapEl) {
      setMapView(mapEl, indicator.viewParam);
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  // --- Indicador: Visor geográfico (capas WMS + panel lateral) ---
  if (isVisorIndicator(indicator)) {
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setGeoLayout(false);
    setInvVivLayout(false);
    setVisorLayout(true);
    setMarcoWmsVisible(true);
    updateVisorMunicipioLabel();
    const layerHost = document.getElementById("visorLayerList");
    if (layerHost) {
      void renderVisorLayerPanel(layerHost, visorLayerPanelOptions());
    }
    void preloadVisorLayerCatalog();
    requestAnimationFrame(() => {
      attachMapViewerPlugins({ includeMapUi: true });
      invalidateMapSize();
      if (state.selectedMunicipio?.cve_mun) {
        scheduleAppMunicipioFocus("visor");
      } else {
        const mapElVisor = document.getElementById("mapFrame");
        if (mapElVisor) setMapView(mapElVisor, indicator.viewParam);
      }
      requestAnimationFrame(() => refreshMapViewerPlugins({ includeMapUi: true }));
      setTimeout(() => {
        invalidateMapSize();
        refreshMapViewerPlugins({ includeMapUi: true });
      }, 400);
    });
    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  // --- Indicador: Inventario de viviendas (INV 2020, bbox + capas temáticas) ---
  if (isInvVivIndicator(indicator)) {
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setGeoLayout(false);
    setVisorLayout(false);
    setInvVivLayout(true);
    setLocsAtlasLayerActive(false, null);
    setMarcoWmsVisible(true);
    clearVisorThematicLayers();
    restoreMapZoomControls();

    const host = document.getElementById("invVivLayerList");
    if (host) {
      renderInvVivPanel(host, visorLayerPanelOptions());
    }
    attachInvVivMap(visorLayerPanelOptions());
    updateVisorMunicipioLabel();

    const mapElInv = document.getElementById("mapFrame");
    requestAnimationFrame(() => {
      teardownVisorMapUi();
      teardownVisorMapLegend();
      attachMapViewerPlugins({ includeMapUi: false });
      invalidateMapSize();
      if (state.selectedMunicipio?.cve_mun && mapElInv) {
        scheduleMunicipioMapFocus(mapElInv, state.selectedMunicipio.cve_mun, "inv");
      } else if (mapElInv) {
        setMapView(mapElInv, indicator.viewParam);
      }
      requestAnimationFrame(() => refreshMapViewerPlugins({ includeMapUi: false }));
      setTimeout(() => {
        invalidateMapSize();
        refreshMapViewerPlugins({ includeMapUi: false });
      }, 400);
    });
    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  // --- Indicadores sociodemográficos / económicos (vistas comparativas) ---

  if (isPoblacionIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setPoblacionLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("poblacionFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchPoblacionComparativa(state.selectedMunicipio);
      renderPoblacionComparativa(vizRoot, payload);
      setLastPoblacionExport(payload, state.selectedMunicipio);
      setPoblacionMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderPoblacionComparativa(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastPoblacionExport(null, null);
      setPoblacionMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isCrecimientoIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setCrecimientoLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("crecimientoFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchCrecimientoComparativa(state.selectedMunicipio);
      renderCrecimientoComparativa(vizRoot, payload);
      setLastCrecimientoExport(payload, state.selectedMunicipio);
      setCrecimientoMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderCrecimientoComparativa(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastCrecimientoExport(null, null);
      setCrecimientoMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isEdadMedianaIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setEdadMedianaLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("edadMedianaFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchEdadMedianaComparativa(state.selectedMunicipio);
      renderEdadMedianaComparativa(vizRoot, payload);
      setLastEdadMedianaExport(payload, state.selectedMunicipio);
      setEdadMedianaMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderEdadMedianaComparativa(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastEdadMedianaExport(null, null);
      setEdadMedianaMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isNacimientosIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setNacimientosLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("nacimientosFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchNacimientosVista(state.selectedMunicipio);
      renderNacimientosVista(vizRoot, payload);
      setLastNacimientosExport(payload, state.selectedMunicipio);
      setNacimientosMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderNacimientosVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastNacimientosExport(null, null);
      setNacimientosMeta("Error al consultar atlas.tab_nacional / tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isDefuncionesIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setDefuncionesLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("defuncionesFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchDefuncionesVista(state.selectedMunicipio);
      renderDefuncionesVista(vizRoot, payload);
      setLastDefuncionesExport(payload, state.selectedMunicipio);
      setDefuncionesMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderDefuncionesVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastDefuncionesExport(null, null);
      setDefuncionesMeta("Error al consultar atlas.tab_nacional / tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isUnidadesMedicasIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setUnidadesMedicasLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("unidadesMedicasFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchUnidadesMedicasVista(state.selectedMunicipio);
      renderUnidadesMedicasVista(vizRoot, payload);
      setLastUnidadesMedicasExport(payload, state.selectedMunicipio);
      setUnidadesMedicasMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · CLUES 2025`
          : "Sin municipio seleccionado · CLUES 2025"
      );
    } catch (e) {
      console.warn(e);
      renderUnidadesMedicasVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastUnidadesMedicasExport(null, null);
      setUnidadesMedicasMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isEscolaridadIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setEscolaridadLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("escolaridadFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchEscolaridadVista(state.selectedMunicipio);
      renderEscolaridadVista(vizRoot, payload);
      setLastEscolaridadExport(payload, state.selectedMunicipio);
      setEscolaridadMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderEscolaridadVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastEscolaridadExport(null, null);
      setEscolaridadMeta("Error al consultar atlas.tab_nacional / tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isPoblacionOcupadaIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setPoblacionOcupadaLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("poblacionOcupadaFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchPoblacionOcupadaVista(state.selectedMunicipio);
      renderPoblacionOcupadaVista(vizRoot, payload);
      setLastPoblacionOcupadaExport(payload, state.selectedMunicipio);
      setPoblacionOcupadaMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderPoblacionOcupadaVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastPoblacionOcupadaExport(null, null);
      setPoblacionOcupadaMeta("Error al consultar atlas.tab_nacional / tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isCaracteristicasEconomicasIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setCaracteristicasEconomicasLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("caracteristicasEconomicasFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchCaracteristicasEconomicasVista(state.selectedMunicipio);
      renderCaracteristicasEconomicasVista(vizRoot, payload);
      setLastCaracteristicasEconomicasExport(payload, state.selectedMunicipio);
      setCaracteristicasEconomicasMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderCaracteristicasEconomicasVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastCaracteristicasEconomicasExport(null, null);
      setCaracteristicasEconomicasMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isUnidadesEconomicasIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setUnidadesEconomicasLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("unidadesEconomicasFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchUnidadesEconomicasVista(state.selectedMunicipio);
      renderUnidadesEconomicasVista(vizRoot, payload);
      setLastUnidadesEconomicasExport(payload, state.selectedMunicipio);
      setUnidadesEconomicasMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderUnidadesEconomicasVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastUnidadesEconomicasExport(null, null);
      setUnidadesEconomicasMeta("Error al consultar atlas.tab_municipal (ue_den)");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isSuperficieAgriculturaIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setSuperficieAgriculturaLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("superficieAgriculturaFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchSuperficieAgriculturaVista(state.selectedMunicipio);
      renderSuperficieAgriculturaVista(vizRoot, payload);
      setLastSuperficieAgriculturaExport(payload, state.selectedMunicipio);
      setSuperficieAgriculturaMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderSuperficieAgriculturaVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastSuperficieAgriculturaExport(null, null);
      setSuperficieAgriculturaMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isInversionPublicaIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setInversionPublicaLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("inversionPublicaFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchInversionPublicaVista(state.selectedMunicipio);
      renderInversionPublicaVista(vizRoot, payload);
      setLastInversionPublicaExport(payload, state.selectedMunicipio);
      setInversionPublicaMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderInversionPublicaVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastInversionPublicaExport(null, null);
      setInversionPublicaMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isInstitucionesAdminPublicaMunicipalIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setInstitucionesAdminPublicaLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("institucionesAdminPublicaFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchInstitucionesAdminPublicaMunicipalVista(state.selectedMunicipio);
      renderInstitucionesAdminPublicaVista(vizRoot, payload);
      setLastInstitucionesAdminPublicaExport(payload, state.selectedMunicipio);
      setInstitucionesAdminPublicaMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderInstitucionesAdminPublicaVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastInstitucionesAdminPublicaExport(null, null);
      setInstitucionesAdminPublicaMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isHabitantesPorPoliciaIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setHabitantesPoliciaLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("habitantesPoliciaFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchHabitantesPorPoliciaVista(state.selectedMunicipio);
      renderHabitantesPoliciaVista(vizRoot, payload);
      setLastHabitantesPoliciaExport(payload, state.selectedMunicipio);
      setHabitantesPoliciaMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderHabitantesPoliciaVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastHabitantesPoliciaExport(null, null);
      setHabitantesPoliciaMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isViviendaParticipacionIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setViviendaParticipacionLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("viviendaParticipacionFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchViviendaParticipacionVista(state.selectedMunicipio);
      renderViviendaParticipacionVista(vizRoot, payload);
      setLastViviendaParticipacionExport(payload, state.selectedMunicipio);
      setViviendaParticipacionMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderViviendaParticipacionVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastViviendaParticipacionExport(null, null);
      setViviendaParticipacionMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isViviendaServiciosIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setSitiosInteresLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setViviendaServiciosLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("viviendaServiciosFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchViviendaServiciosVista(state.selectedMunicipio);
      renderViviendaServiciosVista(vizRoot, payload);
      setLastViviendaServiciosExport(payload, state.selectedMunicipio);
      setViviendaServiciosMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderViviendaServiciosVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastViviendaServiciosExport(null, null);
      setViviendaServiciosMeta("Error al consultar atlas.tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isSitiosInteresIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setAnalfabetismoLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setSitiosInteresLayout(true);
    setLocsAtlasLayerActive(false, null);
    renderSitiosInteresView(document.getElementById("sitiosInteresRoot"));
    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isAnalfabetismoIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setPoblacionLayout(false);
    setCrecimientoLayout(false);
    setEdadMedianaLayout(false);
    setNacimientosLayout(false);
    setDefuncionesLayout(false);
    setUnidadesMedicasLayout(false);
    setEscolaridadLayout(false);
    setViviendaParticipacionLayout(false);
    setViviendaServiciosLayout(false);
    setPoblacionOcupadaLayout(false);
    setCaracteristicasEconomicasLayout(false);
    setUnidadesEconomicasLayout(false);
    setSuperficieAgriculturaLayout(false);
    setInversionPublicaLayout(false);
    setInstitucionesAdminPublicaLayout(false);
    setHabitantesPoliciaLayout(false);
    setSitiosInteresLayout(false);
    setAnalfabetismoLayout(true);
    setLocsAtlasLayerActive(false, null);

    const vizRoot = document.getElementById("analfabetismoFullVizRoot");
    if (vizRoot) {
      vizRoot.innerHTML = '<div class="poblacion-viz-loading">Cargando datos…</div>';
    }

    try {
      const payload = await fetchAnalfabetismoVista(state.selectedMunicipio);
      renderAnalfabetismoVista(vizRoot, payload);
      setLastAnalfabetismoExport(payload, state.selectedMunicipio);
      setAnalfabetismoMeta(
        state.selectedMunicipio
          ? `Municipio seleccionado: ${state.selectedMunicipio.nomgeo || state.selectedMunicipio.cve_mun} · INEGI`
          : "Sin municipio seleccionado · INEGI"
      );
    } catch (e) {
      console.warn(e);
      renderAnalfabetismoVista(vizRoot, {
        ok: false,
        message: e && e.message ? String(e.message) : "Error al cargar datos",
      });
      setLastAnalfabetismoExport(null, null);
      setAnalfabetismoMeta("Error al consultar atlas.tab_nacional / tab_municipal");
    }

    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  setPoblacionLayout(false);
  setCrecimientoLayout(false);
  setEdadMedianaLayout(false);
  setNacimientosLayout(false);
  setDefuncionesLayout(false);
  setUnidadesMedicasLayout(false);
  setEscolaridadLayout(false);
  setAnalfabetismoLayout(false);
  setSitiosInteresLayout(false);
  setViviendaParticipacionLayout(false);
  setViviendaServiciosLayout(false);
  setPoblacionOcupadaLayout(false);
  setCaracteristicasEconomicasLayout(false);
  setUnidadesEconomicasLayout(false);
  setSuperficieAgriculturaLayout(false);
  setInversionPublicaLayout(false);
  setInstitucionesAdminPublicaLayout(false);
  setHabitantesPoliciaLayout(false);
  setVisorLayout(false);
  setGeoLayout(false);
  setLocsAtlasLayerActive(false, null);

  // 1) Mapa: si hay municipio seleccionado, el foco lo lleva setMunicipioMapFocus (no recentrar al indicador).
  if (!state.selectedMunicipio) {
    setMapView(document.getElementById("mapFrame"), indicator.viewParam);
  }

  // 2) Datos
  const rows = await getIndicatorData(indicator.id);

  // 3) Tabla
  renderTable(document.getElementById("tableContainer"), {
    title: indicator.title,
    unit: indicator.unit,
    rows,
  });

  // 4) Gráfica
  state.chart = state.chart || ensureChart(document.getElementById("chartCanvas"));
  updateBarChart(state.chart, {
    title: indicator.title,
    unit: indicator.unit,
    rows,
  });

  setActivePill(indicator.title);
  setTableMeta(`${rows.length} municipios · Fuente: mock (${indicator.unit || "—"})`);
}

// --- UI auxiliar y arranque ---

function setupSidebarToggle() {
  const btn = document.getElementById("btnSidebar");
  const sidebar = document.getElementById("sidebar");

  function setOpen(open) {
    sidebar.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
  }

  btn.addEventListener("click", () => {
    setOpen(!sidebar.classList.contains("is-open"));
  });

  // Cerrar al tocar fuera (viewport menor a md)
  document.addEventListener("click", (e) => {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    if (!sidebar.classList.contains("is-open")) return;
    const within = sidebar.contains(e.target) || btn.contains(e.target);
    if (!within) setOpen(false);
  });
}

function refreshMainBarChartColors() {
  if (!state.chart) return;
  const root = document.documentElement;
  const fill =
    getComputedStyle(root).getPropertyValue("--chart-js-bar-fill").trim() ||
    "rgba(0, 139, 139, 0.35)";
  const stroke =
    getComputedStyle(root).getPropertyValue("--chart-js-bar-stroke").trim() ||
    "rgba(0, 139, 139, 0.85)";
  const tick =
    getComputedStyle(root).getPropertyValue("--text-rgb").trim() || "236, 241, 248";
  const grid =
    getComputedStyle(root).getPropertyValue("--chart-axis-grid").trim() ||
    "rgba(255, 255, 255, 0.08)";
  const ds0 = state.chart.data.datasets[0];
  if (ds0) {
    ds0.backgroundColor = fill;
    ds0.borderColor = stroke;
  }
  const scales = state.chart.options?.scales;
  if (scales?.x?.ticks) scales.x.ticks.color = `rgba(${tick}, 0.85)`;
  if (scales?.x?.grid) scales.x.grid.color = grid;
  if (scales?.y?.ticks) scales.y.ticks.color = `rgba(${tick}, 0.85)`;
  if (scales?.y?.grid) scales.y.grid.color = grid;
  state.chart.update();
}

/** Busca un indicador del menú por id (p. ej. geo_visor). */
function findIndicatorById(model, id) {
  for (const section of model) {
    for (const item of section.items || []) {
      if (item.id === id) return item;
    }
  }
  return null;
}

/** Inicialización: tema, menú, municipios, exportaciones y vista Inicio. */
async function bootstrap() {
  initThemeSelector();
  attachVisorCatalogAdmin();
  window.addEventListener("atlasgro-themechange", () => {
    refreshMainBarChartColors();
    updateViviendaServiciosChartTheme();
  });
  setupSidebarToggle();
  attachPoblacionExportButtons();
  attachCrecimientoExportButtons();
  attachEdadMedianaExportButtons();
  attachNacimientosExportButtons();
  attachDefuncionesExportButtons();
  attachUnidadesMedicasExportButtons();
  attachEscolaridadExportButtons();
  attachAnalfabetismoExportButtons();
  attachViviendaParticipacionExportButtons();
  attachViviendaServiciosExportButtons();
  attachPoblacionOcupadaExportButtons();
  attachCaracteristicasEconomicasExportButtons();
  attachUnidadesEconomicasExportButtons();
  attachSuperficieAgriculturaExportButtons();
  attachInversionPublicaExportButtons();
  attachInstitucionesAdminPublicaExportButtons();
  attachHabitantesPoliciaExportButtons();

  const munSelect = document.getElementById("selectMunicipio");
  const munStatus = document.getElementById("municipiosStatus");
  if (munSelect && munStatus) {
    munStatus.textContent = "Cargando municipios…";
    try {
      const munRows = await fetchMunicipios();
      state.municipiosRows = munRows;
      renderMunicipiosSelect(munSelect, munStatus, munRows, {
        onSelect: async (m) => {
          try {
            await applyMunicipioSelection(m);
          } catch (err) {
            console.warn("[municipio] selection:", err);
          }
        },
      });
      void ensureGeoContextoBulk().catch(() => {});
      void ensureExploradorBulk().catch(() => {});

      setHomeMunicipioClickHandler(async (m) => {
        await applyMunicipioSelection(m);
      });

      document.getElementById("btnInicio")?.addEventListener("click", () => {
        void goToHomeView();
      });
    } catch (e) {
      munSelect.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Error al cargar";
      munSelect.append(opt);
      munSelect.disabled = true;
      munStatus.textContent =
        "No se pudo cargar desde PostgreSQL. Revisa el API /municipios y la tabla atlas.c_mun.";
      console.warn(e);
    }
  }

  // Menú (modelo viene de api.js para mantener consistencia)
  const model = getMenuModel();
  const menuRoot = document.getElementById("menuRoot");

  createMenu(menuRoot, model, {
    onSelect: async (indicator, { closeSidebar }) => {
      await onIndicatorSelected(indicator);
      closeSidebar?.();
    },
  });

  bindMapResizeHandler();

  // Estado inicial: carta de presentación (Inicio)
  await loadHomeContext();
  await goToHomeView();

  const visorParam = new URLSearchParams(window.location.search).get("visor");
  if (visorParam) {
    const visorIndicator = findIndicatorById(model, "geo_visor");
    if (visorIndicator) {
      await onIndicatorSelected(visorIndicator);
      history.replaceState(null, "", window.location.pathname);
    }
  }

  // Útil para depurar, sin ruido para usuarios no técnicos
  void getMapBaseUrl();
}

bootstrap();

