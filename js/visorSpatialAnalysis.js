/**
 * Flujo UI de Análisis Espacial en el Visor geográfico.
 *
 * 1. Usuario cierra polígono → botón flotante «Iniciar Análisis Espacial».
 * 2. Modal: capa INV → checkboxes con descripción legible (sin nombres técnicos).
 * 3. Ejecutar → tabla de resultados + metadatos mínimos del polígono.
 * 4. Exportar a Excel (.xlsx).
 */
import { getLeafletMap, whenAtlasMapReady } from "./map.js";
import { getLastDrawnPolygonFeature, formatDrawArea, normalizePolygonForAnalysis, ensureVisorToolsExtrasHost, syncVisorToolsExtrasVisibility } from "./visorDraw.js";
import { DENUE_LAYER_SPECS } from "./denueLayers.js";
import { getActiveBufferFeature } from "./visorBuffer.js";
import {
  fetchCapasIntersectantes,
  fetchColumnasCapa,
  ejecutarAnalisisDinamico,
} from "./spatialAnalysisApi.js";

/** Catálogo fijo INV — población primero, luego vivienda. */
const INV_SECCIONES = [
  {
    titulo: "Población",
    campos: [
      { columna: "pobtot", etiqueta: "Población total" },
      { columna: "pobfem", etiqueta: "Población femenina" },
      { columna: "pobmas", etiqueta: "Población masculina" },
      { columna: "pob0_14", etiqueta: "Población de 0 a 14 años" },
      { columna: "p15a29a", etiqueta: "Población de 15 a 29 años" },
      { columna: "p30a59a", etiqueta: "Población de 30 a 59 años" },
      { columna: "p_60ymas", etiqueta: "Población de 60 años y más" },
      { columna: "p_cd_t", etiqueta: "Población con discapacidad" },
    ],
  },
  {
    titulo: "Vivienda",
    campos: [
      { columna: "vivtot", etiqueta: "Total de viviendas" },
      { columna: "vivpar", etiqueta: "Total de viviendas particulares" },
      { columna: "tvipahab", etiqueta: "Total de viviendas particulares habitadas" },
      { columna: "vivnohab", etiqueta: "Viviendas particulares no habitadas" },
      {
        columna: "v3masocu",
        etiqueta: "Viviendas particulares habitadas con 3 o más ocupantes por cuarto",
      },
      {
        columna: "vph_pidt",
        etiqueta: "Viviendas particulares habitadas con piso de material diferente de tierra",
      },
      {
        columna: "vph_c_el",
        etiqueta: "Viviendas particulares habitadas que disponen de energía eléctrica",
      },
      {
        columna: "vph_exsa",
        etiqueta: "Viviendas particulares habitadas que disponen de excusado o sanitario",
      },
      {
        columna: "vph_dren",
        etiqueta: "Viviendas particulares habitadas que disponen de drenaje",
      },
    ],
  },
];

/** Catálogo ITER 2020 — localidades (geometría vía c_loc_punto). */
const ITER_SECCIONES = [
  {
    titulo: "Población",
    campos: [
      { columna: "pobtot", etiqueta: "Población total" },
      { columna: "pobfem", etiqueta: "Población femenina" },
      { columna: "pobmas", etiqueta: "Población masculina" },
    ],
  },
  {
    titulo: "Etnicidad",
    campos: [
      {
        columna: "p3ym_hli",
        etiqueta: "Población de 3 años y más que habla alguna lengua indígena",
      },
      {
        columna: "p3hlinhe",
        etiqueta:
          "Población de 3 años y más que habla alguna lengua indígena y no habla español",
      },
    ],
  },
  {
    titulo: "Discapacidad",
    campos: [
      { columna: "pcon_disc", etiqueta: "Población con discapacidad" },
      {
        columna: "psind_lim",
        etiqueta: "Población sin discapacidad, limitación, problema o condición mental",
      },
    ],
  },
  {
    titulo: "Características Económicas",
    campos: [
      {
        columna: "pea",
        etiqueta: "Población de 12 años y más económicamente activa",
      },
      {
        columna: "pea_f",
        etiqueta: "Población femenina de 12 años y más económicamente activa",
      },
      {
        columna: "pea_m",
        etiqueta: "Población masculina de 12 años y más económicamente activa",
      },
      {
        columna: "psinder",
        etiqueta: "Población sin afiliación a servicios de salud",
      },
      {
        columna: "pder_ss",
        etiqueta: "Población afiliada a servicios de salud",
      },
    ],
  },
  {
    titulo: "Vivienda",
    campos: [
      { columna: "vivtot", etiqueta: "Total de viviendas" },
      { columna: "tvivhab", etiqueta: "Total de viviendas habitadas" },
      { columna: "tvivpar", etiqueta: "Total de viviendas particulares" },
      { columna: "vivpar_hab", etiqueta: "Viviendas particulares habitadas" },
      { columna: "vivpar_des", etiqueta: "Viviendas particulares deshabitadas" },
      {
        columna: "vph_pisodt",
        etiqueta: "Viviendas particulares habitadas con piso de material diferente de tierra",
      },
      {
        columna: "vph_pisoti",
        etiqueta: "Viviendas particulares habitadas con piso de tierra",
      },
      {
        columna: "vph_c_elec",
        etiqueta: "Viviendas particulares habitadas que disponen de energía eléctrica",
      },
      {
        columna: "vph_aguadv",
        etiqueta:
          "Viviendas particulares habitadas que disponen de agua entubada en el ámbito de la vivienda",
      },
      {
        columna: "vph_drenaj",
        etiqueta: "Viviendas particulares habitadas que disponen de drenaje",
      },
    ],
  },
];

const NO_INTERSECT_MSG =
  "No es posible realizar el análisis espacial: el polígono no intersecta datos censales (INV/ITER), capas DENUE ni establecimientos de salud. Ajusta el área dibujada.";

const GRUPO_ETIQUETAS = {
  censales: "Censales (INV / ITER)",
  denue: "DENUE",
  salud: "Salud",
};

/** Pseudo-capa del combo: abre la sección de tipos DENUE debajo (como ITER/INV). */
const DENUE_PANEL_CAPA_ID = "__denue__";

const CAPA_UI = {
  c_inv: {
    capaId: "c_inv",
    secciones: INV_SECCIONES,
    unidadRegistro: "manzana(s)",
    emptyMsg:
      "No se encontraron manzanas INV dentro del polígono. Verifica que el área dibujada cubra manzanas en el mapa.",
  },
  iter: {
    capaId: "iter",
    secciones: ITER_SECCIONES,
    unidadRegistro: "localidad(es)",
    emptyMsg:
      "No se encontraron localidades dentro del polígono. Verifica que el área cubra puntos de localidad (c_loc_punto) en el mapa.",
  },
};

/** Capas de solo conteo (DENUE + CLUES). */
const COUNT_CAPA_UI = {};
for (const spec of DENUE_LAYER_SPECS) {
  COUNT_CAPA_UI[spec.visorId] = {
    capaId: spec.visorId,
    modoConteo: true,
    unidadRegistro: "elemento(s)",
    emptyMsg: `No se encontraron ${spec.panelLabel.toLowerCase()} dentro del polígono.`,
  };
}
COUNT_CAPA_UI.clues = {
  capaId: "clues",
  modoConteo: true,
  unidadRegistro: "establecimiento(s)",
  emptyMsg: "No se encontraron establecimientos de salud dentro del polígono.",
};

function buildOrdenCampos(secciones) {
  const campos = secciones.flatMap((s) => s.campos);
  return new Map(campos.map((c, i) => [c.columna, i]));
}

function getCapaUi(capaId) {
  return COUNT_CAPA_UI[capaId] || CAPA_UI[capaId] || CAPA_UI.c_inv;
}

function isConteoCapa(capaId) {
  return Boolean(COUNT_CAPA_UI[capaId]);
}

function capaMetaById(capaId) {
  return _capas.find((c) => (c.id || c.tabla) === capaId) || null;
}

function isConteoCapaModo(capaId) {
  const meta = capaMetaById(capaId);
  if (meta?.grupo === "denue") return false;
  return meta?.modo === "conteo" || capaId === "clues";
}

let _triggerBtn = null;
let _modalEl = null;
let _modalBackdrop = null;
let _getCveMun = () => null;
let _capas = [];
let _capasDenue = [];
let _selectedCapaId = "";
let _capaPickerDocClick = null;
let _columnas = [];
let _seccionesUI = INV_SECCIONES;
let _ordenCampos = buildOrdenCampos(INV_SECCIONES);
let _capaUi = CAPA_UI.c_inv;
let _ultimoResultado = null;
let _polygonHandler = null;
let _intersectCacheKey = null;
let _intersectCacheCapas = null;
let _intersectFetchPromise = null;
let _prefetchTimer = null;

const STATIC_CAPA_IDS = new Set(["c_inv", "iter"]);

function polygonCacheKey(feature) {
  const feat = normalizePolygonForAnalysis(feature) || feature;
  if (!feat?.geometry) return null;
  const turfLib = getTurf();
  if (turfLib?.bbox) {
    try {
      const bbox = turfLib.bbox(feat);
      if (Array.isArray(bbox) && bbox.length >= 4) {
        return bbox.map((n) => Number(n).toFixed(5)).join(",");
      }
    } catch {
      /* noop */
    }
  }
  const ring =
    feat.geometry.type === "Polygon"
      ? feat.geometry.coordinates?.[0]
      : feat.geometry.coordinates?.[0]?.[0];
  if (!Array.isArray(ring) || !ring.length) return null;
  const sample = ring
    .slice(0, 12)
    .map((c) => `${Number(c[0]).toFixed(5)},${Number(c[1]).toFixed(5)}`)
    .join(";");
  return `${feat.geometry.type}:${ring.length}:${sample}`;
}

function clearIntersectCache() {
  _intersectCacheKey = null;
  _intersectCacheCapas = null;
  _intersectFetchPromise = null;
}

function prefetchIntersectCapas() {
  const feat = getAnalysisTargetFeature();
  const key = polygonCacheKey(feat);
  if (!feat || !key) {
    clearIntersectCache();
    return;
  }
  if (key === _intersectCacheKey && _intersectCacheCapas) return;
  if (_intersectFetchPromise && key === _intersectCacheKey) return;

  _intersectCacheKey = key;
  _intersectCacheCapas = null;
  const cve_mun = _getCveMun?.() || null;
  _intersectFetchPromise = fetchCapasIntersectantes({ geojson: feat, cve_mun })
    .then((capas) => {
      _intersectCacheCapas = capas;
      return capas;
    })
    .catch(() => {
      _intersectCacheCapas = null;
      return null;
    })
    .finally(() => {
      _intersectFetchPromise = null;
    });
}

async function resolveIntersectCapas(feat) {
  const key = polygonCacheKey(feat);
  if (!feat || !key) return [];

  if (key === _intersectCacheKey && _intersectCacheCapas) {
    return _intersectCacheCapas;
  }

  if (_intersectFetchPromise && key === _intersectCacheKey) {
    const cached = await _intersectFetchPromise;
    if (cached) return cached;
  }

  const cve_mun = _getCveMun?.() || null;
  const capas = await fetchCapasIntersectantes({ geojson: feat, cve_mun });
  _intersectCacheKey = key;
  _intersectCacheCapas = capas;
  return capas;
}

function isDenueCapaId(capaId) {
  return Boolean(COUNT_CAPA_UI[capaId]) && capaId !== "clues";
}

function capasForDropdown(capas) {
  return (capas || []).filter((c) => c.grupo !== "denue");
}

function splitIntersectCapas(capas) {
  const denue = (capas || []).filter((c) => c.grupo === "denue");
  const rest = capasForDropdown(capas);
  return { denue, rest };
}

function isDenuePanelCapa(capaId) {
  return capaId === DENUE_PANEL_CAPA_ID;
}

function getCapaPickerPanel() {
  return _modalEl?.querySelector("#visorSpatialCapaPickerPanel");
}

function getSelectedCapaTabla() {
  return _selectedCapaId || "";
}

function selectedDenueCapas() {
  return [
    ...(_modalEl?.querySelectorAll(
      '#visorSpatialFieldList input[type=checkbox][data-denue="1"]:checked',
    ) || []),
  ].map((el) => el.value);
}

function setFieldsSectionTitle(text) {
  const label = _modalEl?.querySelector("#visorSpatialFieldsLabel");
  if (label) label.textContent = text;
}

function closeCapaPickerPanel() {
  const panel = getCapaPickerPanel();
  const trigger = _modalEl?.querySelector("#visorSpatialCapaPickerBtn");
  const host = _modalEl?.querySelector(".visor-spatial-capa-picker__host");
  panel?.classList.add("d-none");
  host?.classList.remove("visor-spatial-capa-picker__host--open");
  trigger?.setAttribute("aria-expanded", "false");
}

function openCapaPickerPanel() {
  const panel = getCapaPickerPanel();
  const trigger = _modalEl?.querySelector("#visorSpatialCapaPickerBtn");
  const host = _modalEl?.querySelector(".visor-spatial-capa-picker__host");
  if (!panel || !trigger || trigger.disabled) return;
  panel.classList.remove("d-none");
  host?.classList.add("visor-spatial-capa-picker__host--open");
  trigger.setAttribute("aria-expanded", "true");
}

function toggleCapaPickerPanel() {
  const panel = getCapaPickerPanel();
  const trigger = _modalEl?.querySelector("#visorSpatialCapaPickerBtn");
  if (!panel || !trigger || trigger.disabled) return;
  if (panel.classList.contains("d-none")) openCapaPickerPanel();
  else closeCapaPickerPanel();
}

function syncCapaPickerSummary() {
  const trigger = _modalEl?.querySelector("#visorSpatialCapaPickerBtn");
  if (!trigger || trigger.disabled) return;
  const parts = [];
  if (isDenuePanelCapa(_selectedCapaId)) {
    parts.push("DENUE · Establecimientos");
    const denue = selectedDenueCapas();
    if (denue.length) {
      const labels = denue.map((id) => {
        const c = _capasDenue.find((x) => (x.id || x.tabla) === id);
        return c?.etiqueta || id;
      });
      const preview = labels.slice(0, 2).join(", ");
      parts.push(
        denue.length === 1
          ? preview
          : `${denue.length} tipos: ${preview}${denue.length > 2 ? "…" : ""}`,
      );
    }
  } else if (_selectedCapaId) {
    const capa = _capas.find((c) => (c.id || c.tabla) === _selectedCapaId);
    if (capa) parts.push(capa.etiqueta || _selectedCapaId);
  }
  trigger.textContent = parts.length ? parts.join(" · ") : "— Seleccionar capas —";
}

function highlightCapaPickerSelection() {
  const panel = getCapaPickerPanel();
  if (!panel) return;
  panel.querySelectorAll(".visor-spatial-capa-picker__option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.capaId === _selectedCapaId);
  });
}

function buildCapaPickerPanel() {
  const panel = getCapaPickerPanel();
  const trigger = _modalEl?.querySelector("#visorSpatialCapaPickerBtn");
  if (!panel || !trigger) return;

  const prevCapa = _selectedCapaId;
  panel.innerHTML = "";

  const dropdownCapas = capasForDropdown(_capas);
  const hasAny = dropdownCapas.length > 0 || _capasDenue.length > 0;

  if (!hasAny) {
    trigger.disabled = true;
    trigger.textContent = "— Sin capas intersectantes —";
    closeCapaPickerPanel();
    return;
  }

  trigger.disabled = false;

  const byGrupo = new Map();
  for (const c of dropdownCapas) {
    const g = c.grupo || "otros";
    if (!byGrupo.has(g)) byGrupo.set(g, []);
    byGrupo.get(g).push(c);
  }

  for (const grupo of ["censales", "salud", "otros"]) {
    const list = byGrupo.get(grupo);
    if (!list?.length) continue;
    const section = document.createElement("div");
    section.className = "visor-spatial-capa-picker__section";
    const head = document.createElement("div");
    head.className = "visor-spatial-capa-picker__group";
    head.textContent = GRUPO_ETIQUETAS[grupo] || grupo;
    section.appendChild(head);
    for (const c of list) {
      const id = c.id || c.tabla;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "visor-spatial-capa-picker__option";
      btn.dataset.capaId = id;
      btn.textContent = c.etiqueta || id;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        _selectedCapaId = _selectedCapaId === id ? "" : id;
        highlightCapaPickerSelection();
        syncCapaPickerSummary();
        closeCapaPickerPanel();
        void onCapaChange();
      });
      section.appendChild(btn);
    }
    panel.appendChild(section);
  }

  if (_capasDenue.length) {
    const section = document.createElement("div");
    section.className = "visor-spatial-capa-picker__section";
    const head = document.createElement("div");
    head.className = "visor-spatial-capa-picker__group";
    head.textContent = GRUPO_ETIQUETAS.denue;
    section.appendChild(head);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "visor-spatial-capa-picker__option";
    btn.dataset.capaId = DENUE_PANEL_CAPA_ID;
    btn.textContent = "Establecimientos";
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      _selectedCapaId = _selectedCapaId === DENUE_PANEL_CAPA_ID ? "" : DENUE_PANEL_CAPA_ID;
      highlightCapaPickerSelection();
      syncCapaPickerSummary();
      closeCapaPickerPanel();
      void onCapaChange();
    });
    section.appendChild(btn);
    panel.appendChild(section);
  }

  _selectedCapaId = prevCapa;
  highlightCapaPickerSelection();
  syncCapaPickerSummary();
}

function bindCapaPickerEvents() {
  if (_modalEl?.dataset.capaPickerBound) return;
  const host = _modalEl?.querySelector(".visor-spatial-capa-picker__host");
  const trigger = _modalEl?.querySelector("#visorSpatialCapaPickerBtn");
  trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCapaPickerPanel();
  });
  panelStopPropagation();
  if (!_capaPickerDocClick) {
    _capaPickerDocClick = (e) => {
      if (!host?.contains(e.target)) closeCapaPickerPanel();
    };
    document.addEventListener("click", _capaPickerDocClick);
  }
  if (_modalEl) _modalEl.dataset.capaPickerBound = "1";
}

function panelStopPropagation() {
  getCapaPickerPanel()?.addEventListener("click", (e) => e.stopPropagation());
}

function syncRunButtonState() {
  const runBtn = _modalEl?.querySelector("#visorSpatialRunBtn");
  if (!runBtn) return;

  const tabla = getSelectedCapaTabla();
  const campos = selectedFields();

  if (isDenuePanelCapa(tabla)) {
    runBtn.disabled = selectedDenueCapas().length === 0;
    return;
  }

  if (!tabla) {
    runBtn.disabled = true;
    return;
  }

  if (isConteoCapaModo(tabla)) {
    runBtn.disabled = false;
    return;
  }

  runBtn.disabled = campos.length === 0;
}

function getTurf() {
  if (typeof turf !== "undefined") return turf;
  if (typeof window !== "undefined" && window.turf) return window.turf;
  return null;
}

function polygonSummary(feature) {
  const feat = normalizePolygonForAnalysis(feature) || feature;
  if (!feat?.geometry) return null;
  const turfLib = getTurf();
  let areaM2 = null;
  if (turfLib) {
    try {
      areaM2 = turfLib.area(feat);
    } catch {
      areaM2 = null;
    }
  }
  const coords =
    feat.geometry.type === "Polygon"
      ? feat.geometry.coordinates?.[0]
      : feat.geometry.coordinates?.[0]?.[0];
  const vertices = Array.isArray(coords) ? coords.length : 0;
  return { areaLabel: areaM2 != null ? formatDrawArea(areaM2) : null, areaM2, vertices };
}

function closeSpatialModal() {
  if (!_modalEl) return;
  closeCapaPickerPanel();
  _modalEl.classList.remove("show");
  _modalEl.style.display = "none";
  _modalEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  _modalBackdrop?.remove();
  _modalBackdrop = null;
  syncTriggerVisibility();
}

function showSpatialModal() {
  if (!_modalEl) return;
  _modalBackdrop?.remove();
  _modalBackdrop = document.createElement("div");
  _modalBackdrop.className = "modal-backdrop fade show";
  _modalBackdrop.addEventListener("click", closeSpatialModal);
  document.body.appendChild(_modalBackdrop);
  _modalEl.style.display = "block";
  _modalEl.classList.add("show");
  _modalEl.removeAttribute("aria-hidden");
  document.body.classList.add("modal-open");
}

function ensureTriggerButton(map) {
  if (_triggerBtn?.isConnected) {
    ensureVisorToolsExtrasHost(map);
    const host = map.getContainer()?.querySelector(".visor-map-tools-extras");
    if (host && _triggerBtn.parentElement !== host) {
      host.appendChild(_triggerBtn);
    }
    return _triggerBtn;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "visor-spatial-trigger";
  btn.hidden = true;
  btn.innerHTML =
    "<span class=\"visor-spatial-trigger__icon\" aria-hidden=\"true\">📊</span> Iniciar Análisis Espacial";
  btn.addEventListener("click", () => openSpatialModal());
  const host = ensureVisorToolsExtrasHost(map);
  if (host) host.appendChild(btn);
  else map.getContainer().appendChild(btn);
  _triggerBtn = btn;
  return btn;
}

function getAnalysisTargetFeature() {
  const buffered = getActiveBufferFeature();
  if (buffered) return buffered;
  return normalizePolygonForAnalysis(getLastDrawnPolygonFeature());
}

function syncTriggerVisibility() {
  const feat = getAnalysisTargetFeature();
  const modalOpen = Boolean(_modalEl?.classList.contains("show"));
  if (_triggerBtn) _triggerBtn.hidden = !feat || modalOpen;
  syncVisorToolsExtrasVisibility();
}

function ensureModal() {
  if (_modalEl) return _modalEl;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal fade" id="visorSpatialModal" tabindex="-1" aria-labelledby="visorSpatialModalTitle" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered visor-spatial-modal-dialog">
        <div class="modal-content visor-spatial-modal">
          <div class="modal-header">
            <h2 class="modal-title h5" id="visorSpatialModalTitle">Análisis espacial</h2>
            <button type="button" class="btn-close" id="visorSpatialCloseX" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <div id="visorSpatialPolyInfo" class="visor-spatial-poly-info small text-muted mb-3"></div>
            <div class="mb-3 visor-spatial-capa-picker">
              <label class="form-label fw-semibold" for="visorSpatialCapaPickerBtn">Capa a analizar</label>
              <div class="visor-spatial-capa-picker__host">
                <button
                  type="button"
                  id="visorSpatialCapaPickerBtn"
                  class="form-select visor-spatial-capa-picker__trigger text-start"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  disabled
                >Comprobando capas…</button>
                <div id="visorSpatialCapaPickerPanel" class="visor-spatial-capa-picker__panel d-none" role="listbox"></div>
              </div>
            </div>
            <div id="visorSpatialFieldsWrap" class="visor-spatial-fields-wrap d-none">
              <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <label class="form-label fw-semibold mb-0" id="visorSpatialFieldsLabel" for="visorSpatialFieldFilter">Indicadores</label>
                <input type="search" id="visorSpatialFieldFilter" class="form-control form-control-sm ms-auto" style="max-width:14rem" placeholder="Filtrar…" />
              </div>
              <div id="visorSpatialFieldList" class="visor-spatial-field-list atlas-scroll"></div>
              <div class="small text-muted mt-1" id="visorSpatialFieldCount"></div>
            </div>
            <div id="visorSpatialStatus" class="small text-danger mt-2" role="alert" hidden></div>
            <div id="visorSpatialResults" class="visor-spatial-results mt-3 d-none"></div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="visorSpatialCloseBtn">Cerrar</button>
            <button type="button" id="visorSpatialClearBtn" class="btn btn-outline-danger btn-sm d-none">Borrar consulta</button>
            <button type="button" id="visorSpatialExportBtn" class="btn btn-outline-success btn-sm d-none">Exportar Excel</button>
            <button type="button" id="visorSpatialRunBtn" class="btn btn-primary btn-sm" disabled>⚡ Ejecutar consulta</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap.firstElementChild);
  _modalEl = document.getElementById("visorSpatialModal");

  bindCapaPickerEvents();
  _modalEl.querySelector("#visorSpatialFieldFilter")?.addEventListener("input", renderActiveFieldCheckboxes);
  _modalEl.querySelector("#visorSpatialRunBtn")?.addEventListener("click", onRunAnalysis);
  _modalEl.querySelector("#visorSpatialExportBtn")?.addEventListener("click", onExportExcel);
  _modalEl.querySelector("#visorSpatialClearBtn")?.addEventListener("click", clearResults);
  _modalEl.querySelector("#visorSpatialCloseX")?.addEventListener("click", closeSpatialModal);
  _modalEl.querySelector("#visorSpatialCloseBtn")?.addEventListener("click", closeSpatialModal);
  _modalEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeSpatialModal();
  });

  return _modalEl;
}

function setStatus(msg, isError = true) {
  const el = _modalEl?.querySelector("#visorSpatialStatus");
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  if (typeof msg === "object" && msg !== null && msg.html != null) {
    el.innerHTML = msg.html;
    el.classList.remove("text-danger", "text-success");
    if (!msg.mixed) {
      el.classList.toggle("text-danger", isError);
      el.classList.toggle("text-success", !isError);
    }
    return;
  }
  el.textContent = String(msg);
  el.innerHTML = "";
  el.classList.toggle("text-danger", isError);
  el.classList.toggle("text-success", !isError);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPolyInfo() {
  const host = _modalEl?.querySelector("#visorSpatialPolyInfo");
  const feat = getAnalysisTargetFeature();
  if (!host || !feat) {
    if (host) host.textContent = "";
    return;
  }
  const s = polygonSummary(feat);
  const lines = [];
  if (s?.areaLabel) lines.push(`Área aproximada: ${s.areaLabel}`);
  if (s?.vertices) lines.push(`Vértices (anillo exterior): ${s.vertices}`);
  host.textContent = lines.join(" · ");
}

async function loadCapasSelect() {
  const trigger = _modalEl?.querySelector("#visorSpatialCapaPickerBtn");
  const wrap = _modalEl?.querySelector("#visorSpatialFieldsWrap");
  const runBtn = _modalEl?.querySelector("#visorSpatialRunBtn");
  if (!trigger) return;

  const feat = getAnalysisTargetFeature();
  if (!feat) {
    trigger.disabled = true;
    trigger.textContent = "— Sin polígono —";
    wrap?.classList.add("d-none");
    closeCapaPickerPanel();
    if (runBtn) runBtn.disabled = true;
    return;
  }

  trigger.disabled = true;
  trigger.textContent = "Comprobando capas…";
  wrap?.classList.add("d-none");
  closeCapaPickerPanel();
  if (runBtn) runBtn.disabled = true;
  setStatus("Comprobando intersecciones…", false);

  try {
    const intersectCapas = await resolveIntersectCapas(feat);
    _capas = intersectCapas;
    const split = splitIntersectCapas(intersectCapas);
    _capasDenue = split.denue;

    if (!_capas.length) {
      trigger.textContent = "— Sin capas intersectantes —";
      setStatus(NO_INTERSECT_MSG, true);
      return;
    }

    buildCapaPickerPanel();
    setStatus("");
    await onCapaChange();
    syncRunButtonState();
  } catch (err) {
    trigger.textContent = "— Error —";
    setStatus(err.message || "No se pudo comprobar la intersección con las capas.", true);
  }
}

async function onCapaChange() {
  const wrap = _modalEl?.querySelector("#visorSpatialFieldsWrap");
  const runBtn = _modalEl?.querySelector("#visorSpatialRunBtn");
  if (!wrap) return;

  const tabla = getSelectedCapaTabla();
  if (!tabla) {
    wrap.classList.add("d-none");
    syncRunButtonState();
    return;
  }

  if (isDenuePanelCapa(tabla)) {
    setFieldsSectionTitle("Establecimientos");
    wrap.classList.remove("d-none");
    renderDenueFieldCheckboxes();
    syncRunButtonState();
    setStatus("");
    return;
  }

  setFieldsSectionTitle("Indicadores");
  _capaUi = getCapaUi(tabla);

  if (isConteoCapaModo(tabla)) {
    wrap.classList.add("d-none");
    syncRunButtonState();
    setStatus("");
    return;
  }

  _seccionesUI = _capaUi.secciones;
  _ordenCampos = buildOrdenCampos(_seccionesUI);
  const camposUI = _seccionesUI.flatMap((s) => s.campos);

  if (STATIC_CAPA_IDS.has(tabla)) {
    _columnas = camposUI.map((c) => ({ ...c, agregacion: "sum" }));
    wrap.classList.remove("d-none");
    renderFieldCheckboxes();
    if (runBtn) runBtn.disabled = _columnas.length === 0;
    setStatus("");
    syncRunButtonState();
    return;
  }

  setStatus("Cargando indicadores…", false);
  try {
    const apiCols = await fetchColumnasCapa(tabla);
    const apiMap = new Map((apiCols || []).map((c) => [c.columna, c]));
    _columnas = camposUI.filter((c) => apiMap.has(c.columna)).map((c) => ({
      ...c,
      agregacion: apiMap.get(c.columna)?.agregacion || "sum",
    }));
    wrap.classList.remove("d-none");
    renderFieldCheckboxes();
    if (runBtn) runBtn.disabled = _columnas.length === 0;
    setStatus("");
  } catch {
    _columnas = [...camposUI];
    wrap.classList.remove("d-none");
    renderFieldCheckboxes();
    if (runBtn) runBtn.disabled = false;
    setStatus("");
  }
  syncRunButtonState();
}

function renderActiveFieldCheckboxes() {
  if (isDenuePanelCapa(getSelectedCapaTabla())) renderDenueFieldCheckboxes();
  else renderFieldCheckboxes();
}

function renderDenueFieldCheckboxes() {
  const list = _modalEl?.querySelector("#visorSpatialFieldList");
  const countEl = _modalEl?.querySelector("#visorSpatialFieldCount");
  const filter = (_modalEl?.querySelector("#visorSpatialFieldFilter")?.value || "").trim().toLowerCase();
  if (!list) return;

  const prev = new Set(
    [...list.querySelectorAll('input[type=checkbox][data-denue="1"]:checked')].map((el) => el.value),
  );

  list.innerHTML = "";

  const filtered = _capasDenue.filter((c) => {
    if (!filter) return true;
    return (c.etiqueta || c.id || "").toLowerCase().includes(filter);
  });

  if (!filter) {
    const head = document.createElement("div");
    head.className = "visor-spatial-field-section";
    head.textContent = "Tipos de establecimiento";
    list.appendChild(head);
  }

  for (const c of filtered) {
    const id = c.id || c.tabla;
    const cbId = `vsp-denue-${id}`;
    const row = document.createElement("div");
    row.className = "form-check visor-spatial-field-item";
    row.innerHTML = `
      <input class="form-check-input" type="checkbox" value="${id}" id="${cbId}" data-denue="1" />
      <label class="form-check-label visor-spatial-field-label-only" for="${cbId}">${escapeHtml(c.etiqueta || id)}</label>
    `;
    const cb = row.querySelector("input");
    if (cb && prev.has(id)) cb.checked = true;
    cb?.addEventListener("change", () => {
      syncCapaPickerSummary();
      syncRunButtonState();
    });
    list.appendChild(row);
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} tipo(s) · ${_capasDenue.length} en total`;
  }
  syncRunButtonState();
}

function renderFieldCheckboxes() {
  const list = _modalEl?.querySelector("#visorSpatialFieldList");
  const countEl = _modalEl?.querySelector("#visorSpatialFieldCount");
  const filter = (_modalEl?.querySelector("#visorSpatialFieldFilter")?.value || "").trim().toLowerCase();
  if (!list) return;

  const prev = new Set(
    [...list.querySelectorAll("input[type=checkbox]:checked")].map((el) => el.value)
  );

  list.innerHTML = "";

  const colMap = new Map(_columnas.map((c) => [c.columna, c]));
  const filteredCols = _columnas.filter((c) => {
    if (!filter) return true;
    return (c.etiqueta || "").toLowerCase().includes(filter);
  });

  const appendField = (col) => {
    const id = `vsp-field-${col.columna}`;
    const row = document.createElement("div");
    row.className = "form-check visor-spatial-field-item";
    row.innerHTML = `
      <input class="form-check-input" type="checkbox" value="${col.columna}" id="${id}" />
      <label class="form-check-label visor-spatial-field-label-only" for="${id}">${col.etiqueta}</label>
    `;
    const cb = row.querySelector("input");
    if (cb && prev.has(col.columna)) cb.checked = true;
    cb?.addEventListener("change", syncRunButtonState);
    list.appendChild(row);
  };

  if (filter) {
    for (const col of filteredCols) appendField(col);
  } else {
    for (const seccion of _seccionesUI) {
      const cols = seccion.campos
        .map((c) => colMap.get(c.columna))
        .filter(Boolean);
      if (!cols.length) continue;
      const head = document.createElement("div");
      head.className = "visor-spatial-field-section";
      head.textContent = seccion.titulo;
      list.appendChild(head);
      for (const col of cols) appendField(col);
    }
  }

  if (countEl) {
    countEl.textContent = `${filteredCols.length} indicador(es) · ${_columnas.length} en total`;
  }
}

function sortCamposResultado(campos) {
  return [...(campos || [])].sort(
    (a, b) =>
      (_ordenCampos.get(a.columna) ?? 999) - (_ordenCampos.get(b.columna) ?? 999)
  );
}

function clearResults() {
  _ultimoResultado = null;
  const host = _modalEl?.querySelector("#visorSpatialResults");
  host?.classList.add("d-none");
  if (host) host.innerHTML = "";
  _modalEl?.querySelector("#visorSpatialExportBtn")?.classList.add("d-none");
  _modalEl?.querySelector("#visorSpatialClearBtn")?.classList.add("d-none");
  setStatus("");
}

function selectedFields() {
  return [...(_modalEl?.querySelectorAll("#visorSpatialFieldList input:checked:not([data-denue])") || [])].map(
    (el) => el.value,
  );
}

function formatAreaM2(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatValor(campo) {
  if (campo.valor == null) return "—";
  if (typeof campo.valor !== "number") return campo.valor;
  if (campo.valor === 0) return "0";
  return campo.valor.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

function formatValorExcel(campo) {
  if (campo.valor == null) return "";
  if (typeof campo.valor !== "number") return campo.valor;
  return campo.valor;
}

function formatConsultaCompletada(data) {
  const n = data.registros_intersectados ?? 0;
  const capaId = data.capa_id || _capaUi.capaId;

  if (data.modo === "conteo_multi" && Array.isArray(data.filas)) {
    return `Consulta completada · ${data.filas.length} establecimiento(s) DENUE contabilizados.`;
  }

  if (data.modo === "conteo" || isConteoCapa(capaId)) {
    return `Consulta completada · ${n.toLocaleString("es-MX")} elemento(s) en ${data.capa_etiqueta || "la capa seleccionada"}.`;
  }

  if (capaId === "iter") {
    const con = data.localidades_con_datos || [];
    const sin = data.localidades_sin_datos || [];
    const conNames = con.map((l) => escapeHtml(l.etiqueta || l.nombre)).join(", ");
    const sinNames = sin.map((l) => escapeHtml(l.etiqueta || l.nombre)).join(", ");

    let html = `<span class="visor-spatial-con-datos text-success">Consulta completada · ${n.toLocaleString("es-MX")} localidad(es) con información ITER`;
    html += con.length ? `: ${conNames}.` : ".";
    html += "</span>";
    if (sin.length) {
      html += ` <span class="visor-spatial-sin-datos text-danger">Sin datos ITER en el polígono: ${sinNames}.</span>`;
    }
    return { html, mixed: true };
  }

  return `Consulta completada · ${n.toLocaleString("es-MX")} ${_capaUi.unidadRegistro} intersectada(s).`;
}

function renderResults(data) {
  const host = _modalEl?.querySelector("#visorSpatialResults");
  const exportBtn = _modalEl?.querySelector("#visorSpatialExportBtn");
  const clearBtn = _modalEl?.querySelector("#visorSpatialClearBtn");
  if (!host) return;

  _ultimoResultado = data;
  host.classList.remove("d-none");
  exportBtn?.classList.remove("d-none");
  clearBtn?.classList.remove("d-none");

  const pol = data.poligono || {};
  const metaRows = [];
  if (pol.area_m2 != null) metaRows.push(["Área del polígono (m²)", formatAreaM2(pol.area_m2)]);
  if (pol.vertices != null) metaRows.push(["Vértices", pol.vertices]);
  metaRows.push(["Capa", data.capa_etiqueta || data.tabla]);

  let metaHtml =
    "<div class=\"visor-spatial-meta mb-3\"><table class=\"table table-sm table-bordered mb-0\"><tbody>";
  for (const [k, v] of metaRows) {
    metaHtml += `<tr><th scope="row">${k}</th><td>${v ?? "—"}</td></tr>`;
  }
  metaHtml += "</tbody></table></div>";

  if (data.modo === "conteo_multi" && Array.isArray(data.filas)) {
    let tbl =
      "<div class=\"table-responsive atlas-scroll\"><table class=\"table table-sm table-striped visor-spatial-table\">" +
      "<thead><tr><th>Establecimiento</th><th class=\"text-end\">Total de elementos</th></tr></thead><tbody>";
    for (const fila of data.filas) {
      tbl += `<tr><td>${escapeHtml(fila.etiqueta || "—")}</td>` +
        `<td class="text-end fw-semibold">${Number(fila.total || 0).toLocaleString("es-MX")}</td></tr>`;
    }
    tbl += "</tbody></table></div>";
    host.innerHTML = `<h3 class="h6 fw-bold mb-2">Resultados</h3>${metaHtml}${tbl}`;
    return;
  }

  if (data.modo === "conteo") {
    const n = data.registros_intersectados ?? 0;
    const tbl =
      "<div class=\"table-responsive atlas-scroll\"><table class=\"table table-sm table-striped visor-spatial-table\">" +
      "<thead><tr><th>Capa</th><th class=\"text-end\">Total de elementos</th></tr></thead><tbody>" +
      `<tr><td>${escapeHtml(data.capa_etiqueta || "—")}</td>` +
      `<td class="text-end fw-semibold">${n.toLocaleString("es-MX")}</td></tr>` +
      "</tbody></table></div>";
    host.innerHTML = `<h3 class="h6 fw-bold mb-2">Resultados</h3>${metaHtml}${tbl}`;
    return;
  }

  const camposOrdenados = sortCamposResultado(data.campos);
  let tbl =
    "<div class=\"table-responsive atlas-scroll\"><table class=\"table table-sm table-striped visor-spatial-table\"><thead><tr>";
  tbl += "<th>Indicador</th><th class=\"text-end\">Valor</th></tr></thead><tbody>";
  for (const c of camposOrdenados) {
    tbl += `<tr><td>${c.etiqueta || "—"}</td><td class=\"text-end fw-semibold\">${formatValor(c)}</td></tr>`;
  }
  tbl += "</tbody></table></div>";

  host.innerHTML = `<h3 class=\"h6 fw-bold mb-2\">Resultados</h3>${metaHtml}${tbl}`;
}

async function onRunAnalysis() {
  const feat = getAnalysisTargetFeature();
  const tabla = getSelectedCapaTabla();
  const denueIds = selectedDenueCapas();
  const campos = selectedFields();
  const runBtn = _modalEl?.querySelector("#visorSpatialRunBtn");
  const cve_mun = _getCveMun?.() || null;

  if (!feat) {
    setStatus("Dibuja un polígono cerrado en el mapa.");
    return;
  }

  const modoDenue = isDenuePanelCapa(tabla);
  const modoConteoDropdown = tabla && isConteoCapaModo(tabla);
  const modoAgregacion = tabla && !modoConteoDropdown && !modoDenue;

  if (!tabla) {
    setStatus("Selecciona una capa para analizar.");
    return;
  }
  if (modoDenue && !denueIds.length) {
    setStatus("Marca al menos un tipo de establecimiento.");
    return;
  }
  if (modoAgregacion && !campos.length) {
    setStatus("Marca al menos un indicador.");
    return;
  }

  if (runBtn) runBtn.disabled = true;
  setStatus("Ejecutando consulta…", false);

  try {
    if (modoDenue || denueIds.length > 0) {
      const results = await Promise.all(
        denueIds.map((id) =>
          ejecutarAnalisisDinamico({
            tabla: id,
            campos_elegidos: [],
            geojson: feat,
            cve_mun,
          }),
        ),
      );
      const filas = results.map((r) => ({
        id: r.capa_id,
        etiqueta: r.capa_etiqueta,
        total: r.registros_intersectados ?? 0,
      }));
      const data = {
        ok: true,
        modo: "conteo_multi",
        capa_etiqueta: "DENUE — Establecimientos",
        poligono: results[0]?.poligono || {},
        filas,
        registros_intersectados: filas.reduce((acc, f) => acc + Number(f.total || 0), 0),
      };
      renderResults(data);
      const vacias = filas.filter((f) => !f.total);
      if (vacias.length === filas.length) {
        setStatus("No se encontraron establecimientos DENUE dentro del polígono.", true);
      } else {
        setStatus(formatConsultaCompletada(data), false);
      }
      return;
    }

    const data = await ejecutarAnalisisDinamico({
      tabla,
      campos_elegidos: modoConteoDropdown ? [] : campos,
      geojson: feat,
      cve_mun,
    });
    renderResults(data);
    const n = data.registros_intersectados ?? 0;
    if (n === 0) {
      setStatus(_capaUi.emptyMsg, true);
    } else {
      setStatus(formatConsultaCompletada(data), false);
    }
  } catch (err) {
    setStatus(err.message || "Error en la consulta.");
  } finally {
    syncRunButtonState();
  }
}

function onExportExcel() {
  if (!_ultimoResultado || typeof XLSX === "undefined") {
    setStatus("No hay resultados o falta la librería XLSX.");
    return;
  }
  const data = _ultimoResultado;
  const pol = data.poligono || {};

  if (data.modo === "conteo_multi" && Array.isArray(data.filas)) {
    const sheetRows = [
      ["Análisis espacial — Atlas Gro"],
      [],
      ["Área del polígono (m²)", pol.area_m2 != null ? formatAreaM2(pol.area_m2) : ""],
      ["Vértices", pol.vertices ?? ""],
      [],
      ["Establecimiento", "Total de elementos"],
      ...data.filas.map((f) => [f.etiqueta || f.id || "", f.total ?? 0]),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws["!cols"] = [{ wch: 56 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `analisis_espacial_denue_${stamp}.xlsx`);
    return;
  }

  if (data.modo === "conteo") {
    const n = data.registros_intersectados ?? 0;
    const sheetRows = [
      ["Análisis espacial — Atlas Gro"],
      [],
      ["Área del polígono (m²)", pol.area_m2 != null ? formatAreaM2(pol.area_m2) : ""],
      ["Vértices", pol.vertices ?? ""],
      [],
      ["Capa", "Total de elementos"],
      [data.capa_etiqueta || data.tabla || "", n],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws["!cols"] = [{ wch: 56 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `analisis_espacial_${data.capa_id || data.tabla}_${stamp}.xlsx`);
    return;
  }

  const camposOrdenados = sortCamposResultado(data.campos);

  const sheetRows = [
    ["Análisis espacial — Atlas Gro"],
    [],
    ["Área del polígono (m²)", pol.area_m2 != null ? formatAreaM2(pol.area_m2) : ""],
    ["Vértices", pol.vertices ?? ""],
    ["Capa", data.capa_etiqueta || data.tabla || ""],
    [],
    ["Indicador", "Valor"],
    ...camposOrdenados.map((c) => [c.etiqueta || c.columna, formatValorExcel(c)]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws["!cols"] = [{ wch: 72 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `analisis_espacial_${data.tabla}_${stamp}.xlsx`);
}

async function openSpatialModal() {
  ensureModal();
  renderPolyInfo();
  _modalEl.querySelector("#visorSpatialResults")?.classList.add("d-none");
  _modalEl.querySelector("#visorSpatialExportBtn")?.classList.add("d-none");
  _modalEl.querySelector("#visorSpatialClearBtn")?.classList.add("d-none");
  _ultimoResultado = null;
  setStatus("");

  showSpatialModal();
  syncTriggerVisibility();

  void loadCapasSelect();
}

function onPolygonEvent() {
  syncTriggerVisibility();
  clearTimeout(_prefetchTimer);
  if (!getAnalysisTargetFeature()) {
    clearIntersectCache();
    return;
  }
  _prefetchTimer = setTimeout(() => prefetchIntersectCapas(), 350);
}

function tryAttach(attempt) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 24) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  ensureTriggerButton(map);
  syncTriggerVisibility();
}

/**
 * @param {{ getCveMun?: () => string|null }} [options]
 */
export function attachVisorSpatialAnalysis(options = {}) {
  _getCveMun = typeof options.getCveMun === "function" ? options.getCveMun : () => null;
  if (!_polygonHandler) {
    _polygonHandler = onPolygonEvent;
    window.addEventListener("atlas:visor-polygon-closed", _polygonHandler);
  }
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorSpatialAnalysis() {
  if (_polygonHandler) {
    window.removeEventListener("atlas:visor-polygon-closed", _polygonHandler);
    _polygonHandler = null;
  }
  _triggerBtn?.remove();
  _triggerBtn = null;
  _ultimoResultado = null;
  _capas = [];
  _capasDenue = [];
  _selectedCapaId = "";
  if (_capaPickerDocClick) {
    document.removeEventListener("click", _capaPickerDocClick);
    _capaPickerDocClick = null;
  }
  _columnas = [];
  _seccionesUI = INV_SECCIONES;
  _ordenCampos = buildOrdenCampos(INV_SECCIONES);
  _capaUi = CAPA_UI.c_inv;
  clearIntersectCache();
  clearTimeout(_prefetchTimer);
  _prefetchTimer = null;
  closeSpatialModal();
}

export function refreshVisorSpatialAnalysis() {
  const map = getLeafletMap();
  if (!map) return;
  ensureVisorToolsExtrasHost(map);
  ensureTriggerButton(map);
  syncTriggerVisibility();
}
