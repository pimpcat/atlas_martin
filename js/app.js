/**
 * Orquestador principal del Atlas Gro (SPA en index.html).
 * GroSIG — front Atlas
 * Copyright (c) 2025–2026 Víctor Alfonso Jorge Navarro
 * Autoría: Víctor Alfonso Jorge Navarro — para INEGI Coordinación Estatal Guerrero.
 * Ver /NOTICE y /LICENSE en la raíz del stack.
 *
 * Enlaza menú lateral, selección de municipio, mapa Leaflet y paneles por indicador.
 *
 * Dependencias principales: map.js, api.js, dashboard.js, indicatorShell.js,
 * geoContext.js, homeView.js, visorLayers.js, invViv.js y theme.js.
 */
import { createMenu, collapseAllMenuSections, clearActiveMenuItem, activateMenuItemById } from "./menu.js";
import { purgeOrphanModalBackdrops } from "./atlasModalCleanup.js";
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
  setHomeEntidadClickHandler,
} from "./map.js";
import {
  getIndicatorData,
  getMenuModelAsync,
  fetchMunicipios,
  ensureGeoContextoBulk,
  ensureExploradorBulk,
  prefetchMunicipioData,
  invalidateExploradorCache,
  invalidateGeoContextoCache,
} from "./api.js";
import {
  loadAmigoConfig,
  isNationalMode,
  getDefaultEnt,
  getActiveCveEnt,
  setActiveCveEnt,
  clearNationalEntityPick,
  fetchEntidadesAmigo,
  fetchMunicipiosAmigo,
  getEntidadNombre,
  rememberEntidadNombre,
  isEntityPicked,
  onAmigoTerritoryChange,
} from "./amigoDeployment.js";
import { setBrandEntity } from "./brandIdentity.js";
import { trackEvent, trackSessionStart } from "./telemetry.js";
import {
  attachIndicatorShellExport,
  isCatalogTabularIndicator,
  refreshCatalogIndicator,
  setIndicatorShellLayout,
  showCatalogIndicator,
} from "./indicatorShell.js";
import {
  renderMunicipiosSelect,
  setMunicipioSelectValue,
  renderEntidadesSelect,
  setEntidadSelectValue,
} from "./municipios.js";
import { loadAndRenderHomePanels, loadHomeContext } from "./homeView.js";
import { attachCartographyUi } from "./cartographyClient.js";
import { resolveVisorLayerBinding } from "./visorLayerBindings.js";
import { getVisorLayerEntry } from "./visorCatalog.js";
import { renderTable } from "./table.js";
import { ensureChart, updateBarChart } from "./charts.js";
import { updateGroupedBarsChartTheme } from "./templates/chartjsGroupedBars.js";
import {
  setGeoLayout,
  setVisorLayout,
  setInvVivLayout,
  setSitiosInteresLayout,
  setAnaliticaLayout,
  setHomeLayout,
} from "./dashboard.js";
import { renderSitiosInteresView } from "./sitiosInteresView.js";
import { renderAnaliticaCompareView } from "./analiticaCompareView.js";
import { consumePendingAnaliticaCompareSeed } from "./analiticaCompareSeed.js";
import { registerAnaliticaCompareNav } from "./analiticaCompareNav.js";
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
import { initPortalBranding } from "./portalBranding.js";
import { initThemePreviewBridge } from "./themePreviewBridge.js";

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

function isSitiosInteresIndicator(indicator) {
  return indicator && indicator.sitiosInteres === true;
}

function isAnaliticaCompareIndicator(indicator) {
  return indicator && indicator.analiticaCompare === true;
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
    getCveMun: () => {
      if (getVisorStateWideMode()) return null;
      return state.selectedMunicipio?.cve_mun != null
        ? String(state.selectedMunicipio.cve_mun)
        : null;
    },
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
    attachVisorGeocoder(visorLayerPanelOptions());
  } else {
    teardownVisorGeocoder();
  }
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
    refreshVisorGeocoder();
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

const GEO_CORE_LAYER_IDS = new Set([
  "uso_suelo",
  "clima",
  "hidro_corrientes",
  "hidro_cuerpos",
  "curvas_nivel",
]);
/** Capas Visor extras activadas por Geography Context (no núcleo). */
let _geoExtraLayerIds = new Set();

function syncGeoExtraVisorLayers(layerIds, cve, inGeo) {
  const wanted = new Set();
  if (inGeo && Array.isArray(layerIds)) {
    for (const raw of layerIds) {
      const id = String(raw || "").trim().toLowerCase();
      if (id && !GEO_CORE_LAYER_IDS.has(id)) wanted.add(id);
    }
  }
  for (const id of _geoExtraLayerIds) {
    if (wanted.has(id)) continue;
    const entry = getVisorLayerEntry(id) || {};
    const binding = resolveVisorLayerBinding(id, entry);
    try {
      binding?.setActive(false, cve);
    } catch {
      /* noop */
    }
  }
  for (const id of wanted) {
    const entry = getVisorLayerEntry(id) || {};
    const binding = resolveVisorLayerBinding(id, entry);
    try {
      binding?.setActive(true, cve);
    } catch {
      /* noop */
    }
  }
  _geoExtraLayerIds = wanted;
}

function syncGeoMapOverlayLayers() {
  const tabId = state.geoCtx?.getActiveTabId?.() ?? "";
  const tab = state.geoCtx?.getActiveTab?.() ?? null;
  const cve =
    state.selectedMunicipio && state.selectedMunicipio.cve_mun != null
      ? state.selectedMunicipio.cve_mun
      : null;
  const inGeo = isGeoContextIndicator(state.activeIndicator) && Boolean(cve);
  const layerIds = Array.isArray(tab?.layers) ? tab.layers : null;
  syncGeoThematicLayers(tabId, cve, inGeo, layerIds);
  syncGeoExtraVisorLayers(layerIds, cve, inGeo);
  syncGeoMapLegend(tabId, inGeo, tab);
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
    setIndicatorShellLayout(false);
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
    await Promise.all([
      enterExploradorMapView(() => state.selectedMunicipio?.cve_mun ?? null),
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

  if (m?.cve_mun) {
    trackEvent("MUNICIPIO_SELECCIONADO", {
      cve_ent: m.cve_ent || getActiveCveEnt(),
      cve_mun: m.cve_mun,
    });
  }

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

  if (isCatalogTabularIndicator(state.activeIndicator)) {
    // Ruta ligera: no rearmar shell ni teardowns de mapa/visor.
    try {
      await refreshCatalogIndicator(state.selectedMunicipio);
    } catch (err) {
      console.warn("[indicador] refresh municipio:", err);
    }
  }
}

/**
 * Enrutador central al elegir un ítem del menú: activa layout en dashboard.js,
 * carga datos vía api.js y pinta con indicatorShell / templates data-driven.
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
    syncGeoExtraVisorLayers([], null, false);
    teardownGeoMapLegend();
  }

  // --- Indicador: Datos geográficos (pestañas + mapa macro) ---
  if (isGeoContextIndicator(indicator)) {
    setIndicatorShellLayout(false);
    setGeoLayout(true);
    setMarcoWmsVisible(true);

    const mapEl = document.getElementById("mapFrame");

    // Panel de pestañas
    const tabsEl = document.getElementById("geoTabs");
    const contentEl = document.getElementById("geoTabContent");
    const metaEl = document.getElementById("geoMapTitle");
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
    purgeOrphanModalBackdrops();
    setIndicatorShellLayout(false);
    setAnaliticaLayout(false);
    setSitiosInteresLayout(false);
    setVisorLayout(true);
    setMarcoWmsVisible(true);
    updateVisorMunicipioLabel();
    trackEvent("VISOR_ABIERTO", {
      cve_ent: getActiveCveEnt(),
      cve_mun: state.selectedMunicipio?.cve_mun,
      resourceType: "INDICADOR",
      resourceKey: indicator.id || "geo_visor",
    });
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
        if (state.selectedMunicipio?.cve_mun && isVisorIndicator(state.activeIndicator)) {
          scheduleAppMunicipioFocus("visor");
        }
      }, 400);
    });
    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  // --- Indicador: Inventario de viviendas (INV 2020, bbox + capas temáticas) ---
  if (isInvVivIndicator(indicator)) {
    setIndicatorShellLayout(false);
    setInvVivLayout(true);
    setLocsAtlasLayerActive(false, null);
    setMarcoWmsVisible(true);
    clearVisorThematicLayers();
    restoreMapZoomControls();

    const host = document.getElementById("invVivLayerList");
    if (host) {
      void renderInvVivPanel(host, visorLayerPanelOptions());
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

  // --- Indicadores tabulares del catálogo (Fase 10: shell único) ---
  if (isCatalogTabularIndicator(indicator)) {
    setVisorLayout(false);
    setGeoLayout(false);
    setInvVivLayout(false);
    setSitiosInteresLayout(false);
    setAnaliticaLayout(false);
    setMarcoWmsVisible(false);
    setLocsAtlasLayerActive(false, null);
    setIndicatorShellLayout(true);
    try {
      await showCatalogIndicator(indicator, state.selectedMunicipio);
    } catch (e) {
      console.warn(e);
      const viz = document.getElementById("indicatorFullVizRoot");
      if (viz) {
        viz.innerHTML = "";
        const err = document.createElement("div");
        err.className = "poblacion-viz-error";
        err.textContent = e && e.message ? String(e.message) : "Error al cargar indicador";
        viz.append(err);
      }
    }
    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isSitiosInteresIndicator(indicator)) {
    setIndicatorShellLayout(false);
    setAnaliticaLayout(false);
    setSitiosInteresLayout(true);
    setLocsAtlasLayerActive(false, null);
    renderSitiosInteresView(document.getElementById("sitiosInteresRoot"));
    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  if (isAnaliticaCompareIndicator(indicator)) {
    setIndicatorShellLayout(false);
    setSitiosInteresLayout(false);
    setVisorLayout(false);
    setGeoLayout(false);
    setInvVivLayout(false);
    setAnaliticaLayout(true);
    setLocsAtlasLayerActive(false, null);
    const pending = consumePendingAnaliticaCompareSeed();
    void renderAnaliticaCompareView(document.getElementById("analiticaRoot"), {
      cve_ent: pending?.cve_ent || state.selectedMunicipio?.cve_ent || getActiveCveEnt(),
      cve_mun: pending?.cve_mun || state.selectedMunicipio?.cve_mun || "",
      nomgeo: pending?.nomgeo || state.selectedMunicipio?.nomgeo || "",
      cve_ent_b: pending?.cve_ent_b,
      cve_mun_b: pending?.cve_mun_b,
      nomgeo_b: pending?.nomgeo_b,
      indicatorId: pending?.indicatorId || "socio_poblacion",
      autoCompare: pending?.autoCompare,
    });
    setActivePill(indicator.title);
    setTableMeta("—");
    return;
  }

  setIndicatorShellLayout(false);
  setVisorLayout(false);
  setGeoLayout(false);
  setSitiosInteresLayout(false);
  setAnaliticaLayout(false);
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
  void initPortalBranding();
  initThemePreviewBridge();
  attachVisorCatalogAdmin();
  window.addEventListener("atlasgro-themechange", () => {
    refreshMainBarChartColors();
    updateGroupedBarsChartTheme();
  });
  setupSidebarToggle();
  attachIndicatorShellExport();
  registerAnaliticaCompareNav({ activateMenuItem: activateMenuItemById });

  await loadAmigoConfig();

  function syncBrandFromTerritory() {
    const countryView = isNationalMode() && !isEntityPicked();
    const cve = getActiveCveEnt();
    setBrandEntity({
      cve_ent: cve,
      nom_ent: countryView ? "" : getEntidadNombre(cve),
      nationalCountryView: countryView,
    });
  }

  onAmigoTerritoryChange(({ cve_ent }) => {
    syncBrandFromTerritory();
    invalidateExploradorCache();
    invalidateGeoContextoCache(cve_ent);
    void import("./geographyContextClient.js")
      .then(({ invalidateGeographyCatalogCache }) =>
        invalidateGeographyCatalogCache(cve_ent),
      )
      .catch(() => {});
    if (isVisorIndicator(state.activeIndicator)) {
      void import("./visorLayers.js")
        .then(({ reloadVisorLayerCatalog }) => reloadVisorLayerCatalog())
        .then(() => refreshVisorLayerPanel())
        .catch((err) => console.warn("[visor] recarga catálogo por entidad:", err));
    }
    if (state.geoCtx && isGeoContextIndicator(state.activeIndicator)) {
      try {
        state.geoCtx.setMunicipioChanged();
      } catch (err) {
        console.warn("[geo] territory change:", err);
      }
    }
  });

  const munSelect = document.getElementById("selectMunicipio");
  const munStatus = document.getElementById("municipiosStatus");
  const entSelect = document.getElementById("selectEntidad");
  const entWrap = document.getElementById("entidadSelectWrap");

  async function reloadMunicipiosForEnt(cve_ent) {
    if (!munSelect || !munStatus) return;
    munStatus.textContent = "Cargando municipios…";
    const munRows = await fetchMunicipiosAmigo(cve_ent).catch(async () => {
      if (String(cve_ent) === String(getDefaultEnt())) {
        return fetchMunicipios();
      }
      throw new Error("municipios AMIGO");
    });
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
  }

  async function applyEntidadSelection(ent) {
    if (!ent?.cve_ent) {
      clearNationalEntityPick();
      invalidateExploradorCache();
      invalidateGeoContextoCache();
      if (munSelect) {
        munSelect.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "— Primero elige entidad —";
        munSelect.append(opt);
        munSelect.disabled = true;
      }
      await applyMunicipioSelection(null);
      await goToHomeView();
      return;
    }
    setActiveCveEnt(ent.cve_ent, { picked: true });
    if (ent.nomgeo) rememberEntidadNombre(ent.cve_ent, ent.nomgeo);
    trackEvent("ENTIDAD_SELECCIONADA", { cve_ent: ent.cve_ent });
    invalidateExploradorCache();
    invalidateGeoContextoCache();
    setEntidadSelectValue(entSelect, ent.cve_ent);
    await reloadMunicipiosForEnt(ent.cve_ent);
    await applyMunicipioSelection(null);
    void ensureExploradorBulk({ cve_ent: ent.cve_ent }).catch(() => {});
    void ensureGeoContextoBulk({ cve_ent: ent.cve_ent }).catch(() => {});
    await goToHomeView();
  }

  if (munSelect && munStatus) {
    munStatus.textContent = "Cargando territorio…";
    try {
      if (isNationalMode() && entWrap && entSelect) {
        entWrap.classList.remove("d-none");
        const entRows = await fetchEntidadesAmigo();
        syncBrandFromTerritory();
        renderEntidadesSelect(entSelect, munStatus, entRows, {
          selected: "",
          onSelect: async (e) => {
            try {
              await applyEntidadSelection(e);
            } catch (err) {
              console.warn("[entidad] selection:", err);
            }
          },
        });
        munSelect.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "— Primero elige entidad —";
        munSelect.append(opt);
        munSelect.disabled = true;
        munStatus.textContent = "Selecciona una entidad para ver municipios";
      } else {
        entWrap?.classList.add("d-none");
        // Estatal: cargar nombres CORE para branding de default_ent
        try {
          await fetchEntidadesAmigo();
        } catch (e) {
          console.warn("[amigo] entidades para branding:", e);
        }
        setActiveCveEnt(getDefaultEnt(), { picked: true });
        syncBrandFromTerritory();
        await reloadMunicipiosForEnt(getActiveCveEnt());
      }

      purgeOrphanModalBackdrops();
      void ensureGeoContextoBulk({ cve_ent: getActiveCveEnt() }).catch(() => {});
      void ensureExploradorBulk().catch(() => {});

      setHomeMunicipioClickHandler(async (m) => {
        await applyMunicipioSelection(m);
      });
      setHomeEntidadClickHandler(async (ent) => {
        await applyEntidadSelection(ent);
      });

      document.getElementById("btnInicio")?.addEventListener("click", () => {
        if (isNationalMode()) {
          clearNationalEntityPick();
          setEntidadSelectValue(entSelect, "");
          if (munSelect) {
            munSelect.innerHTML = "";
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "— Primero elige entidad —";
            munSelect.append(opt);
            munSelect.disabled = true;
          }
          void applyMunicipioSelection(null);
        }
        void goToHomeView();
      });

      void attachCartographyUi({
        getCveMun: () =>
          state.selectedMunicipio?.cve_mun != null
            ? String(state.selectedMunicipio.cve_mun)
            : null,
        getNomgeo: () => state.selectedMunicipio?.nomgeo || null,
      });
    } catch (e) {
      munSelect.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Error al cargar";
      munSelect.append(opt);
      munSelect.disabled = true;
      munStatus.textContent =
        "No se pudo cargar territorio. Revisa /api/amigo/config y geo.c_mun en CORE.";
      console.warn(e);
    }
  }

  // Menú: catálogo data-driven (Fase 1.5) con fallback estático en api.js
  trackSessionStart();
  const model = await getMenuModelAsync();
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

