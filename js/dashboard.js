/**
 * Layouts del panel principal: muestra/oculta dashboards por indicador
 * y reubica el contenedor del mapa (#mapFrame) entre mounts del DOM.
 *
 * Depende de map.js (invalidateMapSize, destroyGeoMacroMap).
 */
import {
  destroyGeoMacroMap,
  invalidateGeoMacroMapSize,
  invalidateMapSize,
  restoreMapZoomControls,
} from "./map.js";

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

// --- Utilidades internas: ocultar grupos de dashboards ---

function hideDashboardInvViv() {
  const inv = document.getElementById("dashboardInvViv");
  inv?.classList.add("d-none");
  inv?.setAttribute("aria-hidden", "true");
  document.getElementById("main")?.classList.remove("invviv-mode");
}

function hideDashboardViviendaParticipacion() {
  const viv = document.getElementById("dashboardViviendaParticipacion");
  viv?.classList.add("d-none");
  viv?.setAttribute("aria-hidden", "true");
  const vivS = document.getElementById("dashboardViviendaServicios");
  vivS?.classList.add("d-none");
  vivS?.setAttribute("aria-hidden", "true");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  pooc?.classList.add("d-none");
  pooc?.setAttribute("aria-hidden", "true");
  const ceco = document.getElementById("dashboardCaracteristicasEconomicas");
  ceco?.classList.add("d-none");
  ceco?.setAttribute("aria-hidden", "true");
  const uee = document.getElementById("dashboardUnidadesEconomicas");
  uee?.classList.add("d-none");
  uee?.setAttribute("aria-hidden", "true");
  const sagr = document.getElementById("dashboardSuperficieAgricultura");
  sagr?.classList.add("d-none");
  sagr?.setAttribute("aria-hidden", "true");
  const ipub = document.getElementById("dashboardInversionPublica");
  ipub?.classList.add("d-none");
  ipub?.setAttribute("aria-hidden", "true");
  const iapm = document.getElementById("dashboardInstitucionesAdminPublica");
  iapm?.classList.add("d-none");
  iapm?.setAttribute("aria-hidden", "true");
  const hpol = document.getElementById("dashboardHabitantesPolicia");
  hpol?.classList.add("d-none");
  hpol?.setAttribute("aria-hidden", "true");
  const main = document.getElementById("main");
  if (main) {
    main.classList.remove("vivienda-participacion-mode");
    main.classList.remove("vivienda-servicios-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
  }
}

// --- Layouts por indicador (mapa + panel lateral o vista comparativa) ---

/**
 * Activa el layout de pantalla amplia con mapa + panel de capas (Visor geográfico).
 */
export function setVisorLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const inv = document.getElementById("dashboardInvViv");
  const frame = document.getElementById("mapFrame");
  const mountN = document.getElementById("mapMountNormal");
  const mountG = document.getElementById("mapMountGeo");
  const mountV = document.getElementById("mapMountVisor");
  const mountI = document.getElementById("mapMountInvViv");
  const main = document.getElementById("main");

  if (!normal || !visor || !frame || !mountN || !mountV || !main) return;

  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");

  if (active) {
    normal.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    inv?.classList.add("d-none");
    inv?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    hideDashboardInvViv();
    visor.classList.remove("d-none");
    visor.setAttribute("aria-hidden", "false");
    mountV.appendChild(frame);
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("visor-mode");
  } else {
    visor.classList.add("d-none");
    visor.setAttribute("aria-hidden", "true");
    inv?.classList.add("d-none");
    inv?.setAttribute("aria-hidden", "true");
    revealDashboardNormal();
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
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
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const inv = document.getElementById("dashboardInvViv");
  const frame = document.getElementById("mapFrame");
  const mountN = document.getElementById("mapMountNormal");
  const mountI = document.getElementById("mapMountInvViv");
  const main = document.getElementById("main");

  if (!inv || !normal || !frame || !mountN || !mountI || !main) return;

  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");

  if (active) {
    normal.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();

    inv.classList.remove("d-none");
    inv.setAttribute("aria-hidden", "false");
    mountI.appendChild(frame);

    main.classList.remove("visor-mode");
    main.classList.add("invviv-mode");
  } else {
    inv.classList.add("d-none");
    inv.setAttribute("aria-hidden", "true");
    revealDashboardNormal();
    appendMapFrameUnlessInHome(mountN);
    main.classList.remove("invviv-mode");
  }

  invalidateMapSize();
  if (active) restoreMapZoomControls();
}

/**
 * Activa el layout "Población": pantalla completa solo con la gráfica.
 * Oculta dashboardNormal/Geo/Visor (no se muestra ni el mapa ni la tabla).
 */
export function setPoblacionLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!pob || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pob.classList.remove("d-none");
    pob.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("poblacion-mode");
  } else {
    pob.classList.add("d-none");
    pob.setAttribute("aria-hidden", "true");
    main.classList.remove("poblacion-mode");
    revealDashboardNormal();
  }
}

/**
 * Activa el layout "Población y crecimiento": pantalla completa solo con
 * la gráfica y la tabla anexa, sin mapa ni paneles auxiliares.
 */
export function setCrecimientoLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!crec || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    crec.classList.remove("d-none");
    crec.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("crecimiento-mode");
  } else {
    crec.classList.add("d-none");
    crec.setAttribute("aria-hidden", "true");
    main.classList.remove("crecimiento-mode");
    revealDashboardNormal();
  }
}

/**
 * Activa el layout "Datos Geográficos": 50% mapa, 50% panel con pestañas.
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

  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");

  if (active) {
    visor.classList.add("d-none");
    visor.setAttribute("aria-hidden", "true");
    normal.classList.add("d-none");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    hideDashboardInvViv();
    geo.classList.remove("d-none");
    geo.setAttribute("aria-hidden", "false");
    mountG.appendChild(frame);
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
  } else {
    geo.classList.add("d-none");
    geo.setAttribute("aria-hidden", "true");
    revealDashboardNormal();
    appendMapFrameUnlessInHome(mountN);
    destroyGeoMacroMap();
  }

  invalidateMapSize();
  if (active) {
    restoreMapZoomControls();
    requestAnimationFrame(() => invalidateGeoMacroMapSize(null));
  }
}

/**
 * Activa el layout "Edad mediana": pantalla completa con la gráfica (misma
 * estructura que "Población").
 */
export function setEdadMedianaLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!edad || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    edad.classList.remove("d-none");
    edad.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("edad-mediana-mode");
  } else {
    edad.classList.add("d-none");
    edad.setAttribute("aria-hidden", "true");
    main.classList.remove("edad-mediana-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Nacimientos": gráfica nacional + tabla (misma envolvente que crecimiento).
 */
export function setNacimientosLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!nacim || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    nacim.classList.remove("d-none");
    nacim.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("nacimientos-mode");
  } else {
    nacim.classList.add("d-none");
    nacim.setAttribute("aria-hidden", "true");
    main.classList.remove("nacimientos-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Defunciones": misma envolvente que Nacimientos.
 */
export function setDefuncionesLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!defun || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun.classList.remove("d-none");
    defun.setAttribute("aria-hidden", "false");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("defunciones-mode");
  } else {
    defun.classList.add("d-none");
    defun.setAttribute("aria-hidden", "true");
    main.classList.remove("defunciones-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Unidades médicas en servicio": pantalla completa con tabla.
 */
export function setUnidadesMedicasLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!um || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    um.classList.remove("d-none");
    um.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("unidades-medicas-mode");
  } else {
    um.classList.add("d-none");
    um.setAttribute("aria-hidden", "true");
    main.classList.remove("unidades-medicas-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Grado promedio de escolaridad": gráfica nacional + tabla municipal.
 */
export function setEscolaridadLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!esc || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    esc.classList.remove("d-none");
    esc.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("escolaridad-mode");
  } else {
    esc.classList.add("d-none");
    esc.setAttribute("aria-hidden", "true");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Tasa de analfabetismo": tres columnas (nacional/entidad, ranking, tabla municipal).
 */
export function setAnalfabetismoLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const main = document.getElementById("main");

  if (!alf || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    alf.classList.remove("d-none");
    alf.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.add("analfabetismo-mode");
  } else {
    alf.classList.add("d-none");
    alf.setAttribute("aria-hidden", "true");
    main.classList.remove("analfabetismo-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Participación viviendas particulares habitadas": gráfica + tabla municipal + resumen Nacional/Estatal.
 */
export function setViviendaParticipacionLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const viv = document.getElementById("dashboardViviendaParticipacion");
  const vivS = document.getElementById("dashboardViviendaServicios");
  const main = document.getElementById("main");

  if (!viv || !main) return;

  if (active) {
    hideDashboardViviendaParticipacion();
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    vivS?.classList.add("d-none");
    vivS?.setAttribute("aria-hidden", "true");
    viv.classList.remove("d-none");
    viv.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("vivienda-servicios-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.add("vivienda-participacion-mode");
  } else {
    viv.classList.add("d-none");
    viv.setAttribute("aria-hidden", "true");
    main.classList.remove("vivienda-participacion-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Servicios en viviendas particulares habitadas": gráfica de barras agrupadas (Nacional, Estatal, municipio).
 */
export function setViviendaServiciosLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const viv = document.getElementById("dashboardViviendaParticipacion");
  const vivS = document.getElementById("dashboardViviendaServicios");
  const main = document.getElementById("main");

  if (!vivS || !main) return;

  if (active) {
    hideDashboardViviendaParticipacion();
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    viv?.classList.add("d-none");
    viv?.setAttribute("aria-hidden", "true");
    vivS.classList.remove("d-none");
    vivS.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("vivienda-participacion-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.add("vivienda-servicios-mode");
  } else {
    vivS.classList.add("d-none");
    vivS.setAttribute("aria-hidden", "true");
    main.classList.remove("vivienda-servicios-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Población ocupada": barras por entidad + tabla escolaridad (Economía).
 */
export function setPoblacionOcupadaLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  const main = document.getElementById("main");

  if (!pooc || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pooc.classList.remove("d-none");
    pooc.setAttribute("aria-hidden", "false");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.add("poblacion-ocupada-mode");
  } else {
    pooc.classList.add("d-none");
    pooc.setAttribute("aria-hidden", "true");
    main.classList.remove("poblacion-ocupada-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Características económicas" (Economía): tabla censos económicos.
 */
export function setCaracteristicasEconomicasLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  const ceco = document.getElementById("dashboardCaracteristicasEconomicas");
  const main = document.getElementById("main");

  if (!ceco || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pooc?.classList.add("d-none");
    pooc?.setAttribute("aria-hidden", "true");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    main.classList.add("caracteristicas-economicas-mode");
    ceco.classList.remove("d-none");
    ceco.setAttribute("aria-hidden", "false");
  } else {
    ceco.classList.add("d-none");
    ceco.setAttribute("aria-hidden", "true");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Superficie con agricultura" (Economía): tabla AMCA 2016.
 */
export function setSuperficieAgriculturaLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  const ceco = document.getElementById("dashboardCaracteristicasEconomicas");
  const uee = document.getElementById("dashboardUnidadesEconomicas");
  const sagr = document.getElementById("dashboardSuperficieAgricultura");
  const main = document.getElementById("main");

  if (!sagr || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pooc?.classList.add("d-none");
    pooc?.setAttribute("aria-hidden", "true");
    ceco?.classList.add("d-none");
    ceco?.setAttribute("aria-hidden", "true");
    uee?.classList.add("d-none");
    uee?.setAttribute("aria-hidden", "true");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    main.classList.add("superficie-agricultura-mode");
    sagr.classList.remove("d-none");
    sagr.setAttribute("aria-hidden", "false");
  } else {
    sagr.classList.add("d-none");
    sagr.setAttribute("aria-hidden", "true");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Inversión pública" (Gobierno): tabla finalidad 2023.
 */
export function setInversionPublicaLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  const ceco = document.getElementById("dashboardCaracteristicasEconomicas");
  const uee = document.getElementById("dashboardUnidadesEconomicas");
  const sagr = document.getElementById("dashboardSuperficieAgricultura");
  const ipub = document.getElementById("dashboardInversionPublica");
  const main = document.getElementById("main");

  if (!ipub || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pooc?.classList.add("d-none");
    pooc?.setAttribute("aria-hidden", "true");
    ceco?.classList.add("d-none");
    ceco?.setAttribute("aria-hidden", "true");
    uee?.classList.add("d-none");
    uee?.setAttribute("aria-hidden", "true");
    sagr?.classList.add("d-none");
    sagr?.setAttribute("aria-hidden", "true");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    main.classList.add("inversion-publica-mode");
    ipub.classList.remove("d-none");
    ipub.setAttribute("aria-hidden", "false");
  } else {
    ipub.classList.add("d-none");
    ipub.setAttribute("aria-hidden", "true");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Instituciones administración pública municipal" (Gobierno): CNGG 2022.
 */
export function setInstitucionesAdminPublicaLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  const ceco = document.getElementById("dashboardCaracteristicasEconomicas");
  const uee = document.getElementById("dashboardUnidadesEconomicas");
  const sagr = document.getElementById("dashboardSuperficieAgricultura");
  const ipub = document.getElementById("dashboardInversionPublica");
  const iapm = document.getElementById("dashboardInstitucionesAdminPublica");
  const main = document.getElementById("main");

  if (!iapm || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pooc?.classList.add("d-none");
    pooc?.setAttribute("aria-hidden", "true");
    ceco?.classList.add("d-none");
    ceco?.setAttribute("aria-hidden", "true");
    uee?.classList.add("d-none");
    uee?.setAttribute("aria-hidden", "true");
    sagr?.classList.add("d-none");
    sagr?.setAttribute("aria-hidden", "true");
    ipub?.classList.add("d-none");
    ipub?.setAttribute("aria-hidden", "true");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.add("instituciones-admin-publica-mode");
    iapm.classList.remove("d-none");
    iapm.setAttribute("aria-hidden", "false");
  } else {
    iapm.classList.add("d-none");
    iapm.setAttribute("aria-hidden", "true");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Habitantes por policía" (Gobierno): habxpol + tabla pob_tot / pol_prev.
 */
export function setHabitantesPoliciaLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  const ceco = document.getElementById("dashboardCaracteristicasEconomicas");
  const uee = document.getElementById("dashboardUnidadesEconomicas");
  const sagr = document.getElementById("dashboardSuperficieAgricultura");
  const ipub = document.getElementById("dashboardInversionPublica");
  const iapm = document.getElementById("dashboardInstitucionesAdminPublica");
  const hpol = document.getElementById("dashboardHabitantesPolicia");
  const main = document.getElementById("main");

  if (!hpol || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pooc?.classList.add("d-none");
    pooc?.setAttribute("aria-hidden", "true");
    ceco?.classList.add("d-none");
    ceco?.setAttribute("aria-hidden", "true");
    uee?.classList.add("d-none");
    uee?.setAttribute("aria-hidden", "true");
    sagr?.classList.add("d-none");
    sagr?.setAttribute("aria-hidden", "true");
    ipub?.classList.add("d-none");
    ipub?.setAttribute("aria-hidden", "true");
    iapm?.classList.add("d-none");
    iapm?.setAttribute("aria-hidden", "true");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    main.classList.add("habitantes-policia-mode");
    hpol.classList.remove("d-none");
    hpol.setAttribute("aria-hidden", "false");
  } else {
    hpol.classList.add("d-none");
    hpol.setAttribute("aria-hidden", "true");
    main.classList.remove("habitantes-policia-mode");
    revealDashboardNormal();
  }
}

/**
 * Vista "Unidades económicas" (Economía): barras DENUE (ue_den), top 5 / seleccionado / bottom 5.
 */
export function setUnidadesEconomicasLayout(active) {
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");
  const pooc = document.getElementById("dashboardPoblacionOcupada");
  const ceco = document.getElementById("dashboardCaracteristicasEconomicas");
  const uee = document.getElementById("dashboardUnidadesEconomicas");
  const sagr = document.getElementById("dashboardSuperficieAgricultura");
  const main = document.getElementById("main");

  if (!uee || !main) return;

  if (active) {
    normal?.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    pooc?.classList.add("d-none");
    pooc?.setAttribute("aria-hidden", "true");
    ceco?.classList.add("d-none");
    ceco?.setAttribute("aria-hidden", "true");
    sagr?.classList.add("d-none");
    sagr?.setAttribute("aria-hidden", "true");
    main.classList.remove("visor-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    main.classList.add("unidades-economicas-mode");
    uee.classList.remove("d-none");
    uee.setAttribute("aria-hidden", "false");
  } else {
    uee.classList.add("d-none");
    uee.setAttribute("aria-hidden", "true");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    revealDashboardNormal();
  }
}

// --- Layout: carta de presentación (Inicio) ---

/**
 * Ajusta columnas del shell cuando la vista Inicio está activa.
 */
function applyAppShellHomeColumns(active) {
  const shellRow = document.querySelector(".app-shell__row");
  if (!shellRow) return;
  shellRow.classList.toggle("app-shell__row--home", !!active);
}

export function setHomeLayout(active) {
  const home = document.getElementById("dashboardHome");
  const normal = document.getElementById("dashboardNormal");
  const geo = document.getElementById("dashboardGeo");
  const visor = document.getElementById("dashboardVisor");
  const frame = document.getElementById("mapFrame");
  const mountN = document.getElementById("mapMountNormal");
  const mountHome = document.getElementById("mapMountHome");
  const main = document.getElementById("main");

  if (!home || !normal || !frame || !mountN || !mountHome || !main) return;

  applyAppShellHomeColumns(active);

  const pob = document.getElementById("dashboardPoblacion");
  const crec = document.getElementById("dashboardCrecimiento");
  const edad = document.getElementById("dashboardEdadMediana");
  const nacim = document.getElementById("dashboardNacimientos");
  const defun = document.getElementById("dashboardDefunciones");
  const um = document.getElementById("dashboardUnidadesMedicas");
  const esc = document.getElementById("dashboardEscolaridad");
  const alf = document.getElementById("dashboardAnalfabetismo");

  if (active) {
    normal.classList.add("d-none");
    geo?.classList.add("d-none");
    geo?.setAttribute("aria-hidden", "true");
    visor?.classList.add("d-none");
    visor?.setAttribute("aria-hidden", "true");
    pob?.classList.add("d-none");
    pob?.setAttribute("aria-hidden", "true");
    crec?.classList.add("d-none");
    crec?.setAttribute("aria-hidden", "true");
    edad?.classList.add("d-none");
    edad?.setAttribute("aria-hidden", "true");
    nacim?.classList.add("d-none");
    nacim?.setAttribute("aria-hidden", "true");
    defun?.classList.add("d-none");
    defun?.setAttribute("aria-hidden", "true");
    um?.classList.add("d-none");
    um?.setAttribute("aria-hidden", "true");
    esc?.classList.add("d-none");
    esc?.setAttribute("aria-hidden", "true");
    alf?.classList.add("d-none");
    alf?.setAttribute("aria-hidden", "true");
    hideDashboardViviendaParticipacion();
    hideDashboardInvViv();
    home.classList.remove("d-none");
    home.setAttribute("aria-hidden", "false");
    mountHome.appendChild(frame);
    main.classList.remove("visor-mode");
    main.classList.remove("invviv-mode");
    main.classList.remove("poblacion-mode");
    main.classList.remove("crecimiento-mode");
    main.classList.remove("edad-mediana-mode");
    main.classList.remove("nacimientos-mode");
    main.classList.remove("defunciones-mode");
    main.classList.remove("unidades-medicas-mode");
    main.classList.remove("escolaridad-mode");
    main.classList.remove("analfabetismo-mode");
    main.classList.remove("poblacion-ocupada-mode");
    main.classList.remove("caracteristicas-economicas-mode");
    main.classList.remove("unidades-economicas-mode");
    main.classList.remove("superficie-agricultura-mode");
    main.classList.remove("inversion-publica-mode");
    main.classList.remove("instituciones-admin-publica-mode");
    main.classList.remove("habitantes-policia-mode");
    main.classList.add("home-mode");
  } else {
    home.classList.add("d-none");
    home.setAttribute("aria-hidden", "true");
    main.classList.remove("home-mode");
    revealDashboardNormal();
    mountN.appendChild(frame);
    restoreMapZoomControls();
  }

  invalidateMapSize();
}
