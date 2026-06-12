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
import { getActiveBufferFeature } from "./visorBuffer.js";
import {
  fetchCapasAnalisis,
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

const INV_CAMPOS_UI = INV_SECCIONES.flatMap((s) => s.campos);
const INV_ORDEN_CAMPOS = new Map(INV_CAMPOS_UI.map((c, i) => [c.columna, i]));

let _triggerBtn = null;
let _modalEl = null;
let _modalBackdrop = null;
let _getCveMun = () => null;
let _capas = [];
let _columnas = [];
let _ultimoResultado = null;
let _polygonHandler = null;

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
      <div class="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
        <div class="modal-content visor-spatial-modal">
          <div class="modal-header">
            <h2 class="modal-title h5" id="visorSpatialModalTitle">Análisis espacial</h2>
            <button type="button" class="btn-close" id="visorSpatialCloseX" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <div id="visorSpatialPolyInfo" class="visor-spatial-poly-info small text-muted mb-3"></div>
            <div class="mb-3">
              <label class="form-label fw-semibold" for="visorSpatialCapaSelect">Capa a analizar</label>
              <select id="visorSpatialCapaSelect" class="form-select form-select-sm"></select>
            </div>
            <div id="visorSpatialFieldsWrap" class="visor-spatial-fields-wrap d-none">
              <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <label class="form-label fw-semibold mb-0" for="visorSpatialFieldFilter">Indicadores</label>
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

  _modalEl.querySelector("#visorSpatialCapaSelect")?.addEventListener("change", onCapaChange);
  _modalEl.querySelector("#visorSpatialFieldFilter")?.addEventListener("input", renderFieldCheckboxes);
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
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("text-danger", isError);
  el.classList.toggle("text-success", !isError);
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
  const sel = _modalEl?.querySelector("#visorSpatialCapaSelect");
  if (!sel) return;
  sel.innerHTML = "";
  _capas = await fetchCapasAnalisis();
  if (!_capas.length) {
    sel.innerHTML = "<option value=\"\">— Sin capas —</option>";
    return;
  }
  for (const c of _capas) {
    const opt = document.createElement("option");
    opt.value = c.id || c.tabla;
    opt.textContent = c.etiqueta || c.id;
    sel.appendChild(opt);
  }
  await onCapaChange();
}

async function onCapaChange() {
  const sel = _modalEl?.querySelector("#visorSpatialCapaSelect");
  const wrap = _modalEl?.querySelector("#visorSpatialFieldsWrap");
  const runBtn = _modalEl?.querySelector("#visorSpatialRunBtn");
  if (!sel || !wrap) return;

  const tabla = sel.value;
  if (!tabla) {
    wrap.classList.add("d-none");
    if (runBtn) runBtn.disabled = true;
    return;
  }

  setStatus("Cargando indicadores…", false);
  try {
    const apiCols = await fetchColumnasCapa(tabla);
    const apiMap = new Map((apiCols || []).map((c) => [c.columna, c]));
    _columnas = INV_CAMPOS_UI.filter((c) => apiMap.has(c.columna)).map((c) => ({
      ...c,
      agregacion: apiMap.get(c.columna)?.agregacion || "sum",
    }));
    wrap.classList.remove("d-none");
    renderFieldCheckboxes();
    if (runBtn) runBtn.disabled = _columnas.length === 0;
    setStatus("");
  } catch {
    _columnas = [...INV_CAMPOS_UI];
    wrap.classList.remove("d-none");
    renderFieldCheckboxes();
    if (runBtn) runBtn.disabled = false;
    setStatus("");
  }
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
    list.appendChild(row);
  };

  if (filter) {
    for (const col of filteredCols) appendField(col);
  } else {
    for (const seccion of INV_SECCIONES) {
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
      (INV_ORDEN_CAMPOS.get(a.columna) ?? 999) - (INV_ORDEN_CAMPOS.get(b.columna) ?? 999)
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
  return [...(_modalEl?.querySelectorAll("#visorSpatialFieldList input:checked") || [])].map(
    (el) => el.value
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
  const tabla = _modalEl?.querySelector("#visorSpatialCapaSelect")?.value;
  const campos = selectedFields();
  const runBtn = _modalEl?.querySelector("#visorSpatialRunBtn");

  if (!feat) {
    setStatus("Dibuja un polígono cerrado en el mapa.");
    return;
  }
  if (!tabla) {
    setStatus("Selecciona una capa.");
    return;
  }
  if (!campos.length) {
    setStatus("Marca al menos un indicador.");
    return;
  }

  if (runBtn) runBtn.disabled = true;
  setStatus("Ejecutando consulta…", false);

  try {
    const data = await ejecutarAnalisisDinamico({
      tabla,
      campos_elegidos: campos,
      geojson: feat,
    });
    renderResults(data);
    const n = data.registros_intersectados ?? 0;
    if (n === 0) {
      setStatus(
        "No se encontraron manzanas INV dentro del polígono. Verifica que el área dibujada cubra manzanas en el mapa.",
        true
      );
    } else {
      setStatus(`Consulta completada · ${n.toLocaleString("es-MX")} manzana(s) intersectada(s).`, false);
    }
  } catch (err) {
    setStatus(err.message || "Error en la consulta.");
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

function onExportExcel() {
  if (!_ultimoResultado || typeof XLSX === "undefined") {
    setStatus("No hay resultados o falta la librería XLSX.");
    return;
  }
  const data = _ultimoResultado;
  const pol = data.poligono || {};
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

  try {
    await loadCapasSelect();
  } catch (err) {
    setStatus(err.message || "No se pudo cargar el catálogo de capas.");
  }

  showSpatialModal();
  syncTriggerVisibility();
}

function onPolygonEvent() {
  syncTriggerVisibility();
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
  _columnas = [];
  closeSpatialModal();
}

export function refreshVisorSpatialAnalysis() {
  const map = getLeafletMap();
  if (!map) return;
  ensureVisorToolsExtrasHost(map);
  ensureTriggerButton(map);
  syncTriggerVisibility();
}
