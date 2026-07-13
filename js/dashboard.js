/**
 * Layouts del panel principal: muestra/oculta dashboards activos
 * y reubica el contenedor del mapa (#mapFrame) entre mounts del DOM.
 *
 * Dashboards activos: Home, Normal, Geo, Visor, InvViv, SitiosInteres, Indicator (shell).
 */
import {
  destroyGeoMacroMap,
  invalidateGeoMacroMapSize,
  invalidateMapSize,
  restoreMapZoomControls,
  setGeoMapViewLock,
} from "./map.js";

const ACTIVE_DASHBOARDS = [
  "dashboardHome",
  "dashboardNormal",
  "dashboardGeo",
  "dashboardVisor",
  "dashboardInvViv",
  "dashboardSitiosInteres",
  "dashboardIndicator",
];

const MAIN_MODE_CLASSES = [
  "home-mode",
  "geo-mode",
  "visor-mode",
  "invviv-mode",
  "sitios-interes-mode",
  "indicator-shell-mode",
];

/** No sacar el mapa de Explorador municipal si otro layout se desactiva en cadena. */
function appendMapFrameUnlessInHome(targetMount) {
  const frame = document.getElementById("mapFrame");
  const mountHome = document.getElementById("mapMountHome");
  if (!frame || !targetMount) return;
  if (mountHome && frame.parentElement === mountHome) return;
  targetMount.appendChild(frame);
}

/** Muestra el dashboard clásico (mapa+tabla) solo fuera de Explorador municipal / Inicio. */
function revealDashboardNormal() {
  const normal = document.getElementById("dashboardNormal");
  const main = document.getElementById("main");
  if (!normal) return;
  if (main?.classList.contains("home-mode")) return;
  normal.classList.remove("d-none");
  normal.setAttribute("aria-hidden", "false");
}

function hideEl(el) {
  if (!el) return;
  el.classList.add("d-none");
  el.setAttribute("aria-hidden", "true");
}

function showEl(el) {
  if (!el) return;
  el.classList.remove("d-none");
  el.setAttribute("aria-hidden", "false");
}

/** Oculta todos los dashboards activos excepto los listados. */
function hideDashboardsExcept(keepIds = []) {
  const keep = new Set(keepIds);
  for (const id of ACTIVE_DASHBOARDS) {
    if (keep.has(id)) continue;
    hideEl(document.getElementById(id));
  }
}

function clearMainModes(main, keep = []) {
  if (!main) return;
  const keepSet = new Set(keep);
  for (const cls of MAIN_MODE_CLASSES) {
    if (keepSet.has(cls)) continue;
    main.classList.remove(cls);
  }
}

function applyAppShellHomeColumns(active) {
  const shellRow = document.querySelector(".app-shell__row");
  if (!shellRow) return;
  shellRow.classList.toggle("app-shell__row--home", !!active);
}

/**
 * Activa el layout de pantalla amplia con mapa + panel de capas (Visor geográfico).
 */
export function setVisorLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const visor = document.getElementById("dashboardVisor");
  const frame = document.getElementById("mapFrame");
  const mountN = document.getElementById("mapMountNormal");
  const mountV = document.getElementById("mapMountVisor");
  const main = document.getElementById("main");

  if (!normal || !visor || !frame || !mountN || !mountV || !main) return;

  if (active) {
    // Al pasar de "Datos geográficos" (geo-mode) al visor,
    // hay que desactivar el lock que oculta zoom/botones/dibujo.
    setGeoMapViewLock(false);
    applyAppShellHomeColumns(false);
    hideDashboardsExcept(["dashboardVisor"]);
    showEl(visor);
    mountV.appendChild(frame);
    clearMainModes(main, ["visor-mode"]);
    main.classList.add("visor-mode");
    document.dispatchEvent(new CustomEvent("atlasgro-visor-layout-active"));
  } else {
    hideEl(visor);
    revealDashboardNormal();
    appendMapFrameUnlessInHome(mountN);
    main.classList.remove("visor-mode");
  }

  invalidateMapSize();
  if (active) restoreMapZoomControls();
}

/**
 * Activa el layout "Inventario de Viviendas": mapa amplio + panel de indicadores INV (BBOX).
 */
export function setInvVivLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const inv = document.getElementById("dashboardInvViv");
  const frame = document.getElementById("mapFrame");
  const mountN = document.getElementById("mapMountNormal");
  const mountI = document.getElementById("mapMountInvViv");
  const main = document.getElementById("main");

  if (!inv || !normal || !frame || !mountN || !mountI || !main) return;

  if (active) {
    // En INV también se reutiliza el mapa; aseguramos que no quede el lock de geo-mode.
    setGeoMapViewLock(false);
    applyAppShellHomeColumns(false);
    hideDashboardsExcept(["dashboardInvViv"]);
    showEl(inv);
    mountI.appendChild(frame);
    clearMainModes(main, ["invviv-mode"]);
    main.classList.add("invviv-mode");
  } else {
    hideEl(inv);
    revealDashboardNormal();
    appendMapFrameUnlessInHome(mountN);
    main.classList.remove("invviv-mode");
  }

  invalidateMapSize();
  if (active) restoreMapZoomControls();
}

/**
 * Activa el layout de Datos Geográficos (macro-mapa + texto de contexto).
 */
export function setGeoLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const frame = document.getElementById("mapFrame");
  const mountN = document.getElementById("mapMountNormal");
  const mountG = document.getElementById("mapMountGeo");
  const main = document.getElementById("main");

  if (!normal || !geo || !visor || !frame || !mountN || !mountG || !main) return;

  if (active) {
    applyAppShellHomeColumns(false);
    hideDashboardsExcept(["dashboardGeo"]);
    showEl(geo);
    mountG.appendChild(frame);
    clearMainModes(main, ["geo-mode"]);
    main.classList.add("geo-mode");
    setGeoMapViewLock(true);
  } else {
    hideEl(geo);
    main.classList.remove("geo-mode");
    setGeoMapViewLock(false);
    revealDashboardNormal();
    appendMapFrameUnlessInHome(mountN);
    destroyGeoMacroMap();
  }

  invalidateMapSize();
  if (active) {
    restoreMapZoomControls();
    requestAnimationFrame(() => invalidateGeoMacroMapSize(null));
  } else if (!main.classList.contains("home-mode")) {
    restoreMapZoomControls();
  }
}

/**
 * Activa el layout de Sitios de interés (enlaces del acervo INEGI).
 */
export function setSitiosInteresLayout(active) {
  const sitios = document.getElementById("dashboardSitiosInteres");
  const main = document.getElementById("main");

  if (!sitios || !main) return;

  if (active) {
    applyAppShellHomeColumns(false);
    hideDashboardsExcept(["dashboardSitiosInteres"]);
    showEl(sitios);
    clearMainModes(main, ["sitios-interes-mode"]);
    main.classList.add("sitios-interes-mode");
  } else {
    hideEl(sitios);
    main.classList.remove("sitios-interes-mode");
    revealDashboardNormal();
  }
}

/**
 * Activa el layout de Inicio / Explorador municipal.
 */
export function setHomeLayout(active) {
  const home = document.getElementById("dashboardHome");
  const normal = document.getElementById("dashboardNormal");
  const frame = document.getElementById("mapFrame");
  const mountN = document.getElementById("mapMountNormal");
  const mountHome = document.getElementById("mapMountHome");
  const main = document.getElementById("main");

  if (!home || !normal || !frame || !mountN || !mountHome || !main) return;

  applyAppShellHomeColumns(active);

  if (active) {
    hideDashboardsExcept(["dashboardHome"]);
    showEl(home);
    mountHome.appendChild(frame);
    clearMainModes(main, ["home-mode"]);
    main.classList.add("home-mode");
  } else {
    hideEl(home);
    main.classList.remove("home-mode");
    revealDashboardNormal();
    mountN.appendChild(frame);
    restoreMapZoomControls();
  }

  invalidateMapSize();
}
