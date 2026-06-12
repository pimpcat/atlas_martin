/**
 * Consulta tabular de capas del Visor geográfico.
 * Botón en el panel «Capas» → modal → selección de capa → tabla + exportación Excel.
 */
import { fetchVisorTabularData, fetchVisorTabularLayers, downloadVisorTabularExcel } from "./visorTabularApi.js";

let _openBtn = null;
let _modalEl = null;
let _modalBackdrop = null;
let _getCveMun = () => null;
let _getMunicipio = () => null;
let _layers = [];
let _ultimoResultado = null;
let _loading = false;

const TABLE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/>
  <path d="M3 9h18M3 14h18M9 4v16" stroke="currentColor" stroke-width="1.6"/>
</svg>`;

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCell(value, field) {
  if (value == null || value === "") return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (field === "altitud") {
      return value.toLocaleString("es-MX", { maximumFractionDigits: 0 });
    }
    if (String(field).startsWith("pob_") || field === "total_viv") {
      return value.toLocaleString("es-MX", { maximumFractionDigits: 0 });
    }
    return String(value);
  }
  return escapeHtml(value);
}

function municipioLabel() {
  const m = typeof _getMunicipio === "function" ? _getMunicipio() : null;
  const cve = resolveCveMun();
  if (m?.nomgeo && cve) {
    return `${m.nomgeo} (${String(cve).padStart(3, "0")})`;
  }
  if (m?.nomgeo) return String(m.nomgeo);
  return cve ? `Municipio ${String(cve).padStart(3, "0")}` : "Sin municipio seleccionado";
}

/** Clave municipal: estado de la app, objeto municipio o combo lateral. */
function resolveCveMun() {
  const fromGetter = typeof _getCveMun === "function" ? _getCveMun() : null;
  if (fromGetter != null && String(fromGetter).trim() !== "") {
    return String(fromGetter).trim();
  }
  const m = typeof _getMunicipio === "function" ? _getMunicipio() : null;
  if (m?.cve_mun != null && String(m.cve_mun).trim() !== "") {
    return String(m.cve_mun).trim();
  }
  const sel = document.getElementById("selectMunicipio");
  if (sel?.value && String(sel.value).trim() !== "") {
    return String(sel.value).trim();
  }
  return null;
}

function selectedLayerId() {
  const layer = _modalEl?.querySelector("#visorTabularLayerSelect")?.value;
  return layer && String(layer).trim() ? String(layer).trim() : null;
}

function closeTabularModal() {
  if (!_modalEl) return;
  _modalEl.classList.remove("show");
  _modalEl.style.display = "none";
  _modalEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  _modalBackdrop?.remove();
  _modalBackdrop = null;
}

function showTabularModal() {
  if (!_modalEl) return;
  _modalBackdrop?.remove();
  _modalBackdrop = document.createElement("div");
  _modalBackdrop.className = "modal-backdrop fade show";
  _modalBackdrop.addEventListener("click", closeTabularModal);
  document.body.appendChild(_modalBackdrop);
  _modalEl.style.display = "block";
  _modalEl.classList.add("show");
  _modalEl.removeAttribute("aria-hidden");
  document.body.classList.add("modal-open");
}

function setStatus(msg, isError = false) {
  const el = _modalEl?.querySelector("#visorTabularStatus");
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("text-danger", "text-success");
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("text-danger", isError);
  el.classList.toggle("text-success", !isError);
}

function syncActionButtons() {
  const layerOk = Boolean(selectedLayerId());
  const runBtn = _modalEl?.querySelector("#visorTabularRunBtn");
  const exportBtn = _modalEl?.querySelector("#visorTabularExportBtn");
  if (runBtn) runBtn.disabled = _loading || !layerOk;
  if (exportBtn) exportBtn.disabled = _loading || !_ultimoResultado;
}

function clearResults() {
  _ultimoResultado = null;
  const host = _modalEl?.querySelector("#visorTabularResults");
  host?.classList.add("d-none");
  if (host) host.innerHTML = "";
  _modalEl?.querySelector("#visorTabularExportBtn")?.classList.add("d-none");
  syncActionButtons();
}

function renderSummary(data) {
  const total = data.total_registros ?? (data.rows?.length || 0);
  const nom = data.nom_mun || municipioLabel();
  return `
    <div class="visor-tabular-summary">
      <div class="visor-tabular-stat">
        <span class="visor-tabular-stat__value">${total.toLocaleString("es-MX")}</span>
        <span class="visor-tabular-stat__label">Localidades en el municipio</span>
      </div>
      <div class="visor-tabular-stat visor-tabular-stat--muted">
        <span class="visor-tabular-stat__value visor-tabular-stat__value--sm">${escapeHtml(nom)}</span>
        <span class="visor-tabular-stat__label">Ámbito de la consulta</span>
      </div>
    </div>`;
}

function renderTable(data) {
  const host = _modalEl?.querySelector("#visorTabularResults");
  const exportBtn = _modalEl?.querySelector("#visorTabularExportBtn");
  if (!host) return;

  _ultimoResultado = data;
  host.classList.remove("d-none");
  exportBtn?.classList.remove("d-none");

  const columns = data.columns || [];
  const rows = data.rows || [];

  const cellClass = (field) =>
    field === "nom_loc" ? "visor-tabular-cell--left" : "visor-tabular-cell--center";

  let thead = "<thead><tr>";
  for (const col of columns) {
    thead += `<th scope="col" class="${cellClass(col.field)}">${escapeHtml(col.label)}</th>`;
  }
  thead += "</tr></thead>";

  let tbody = "<tbody>";
  for (const row of rows) {
    tbody += "<tr>";
    for (const col of columns) {
      tbody += `<td class="${cellClass(col.field)}">${formatCell(row[col.field], col.field)}</td>`;
    }
    tbody += "</tr>";
  }
  tbody += "</tbody>";

  host.innerHTML = `
    <div class="visor-tabular-results-head">
      <h3 class="h6 fw-bold mb-0">Resultados</h3>
      <span class="badge rounded-pill text-bg-primary">${rows.length.toLocaleString("es-MX")} filas</span>
    </div>
    ${renderSummary(data)}
    <div class="table-responsive atlas-scroll visor-tabular-table-wrap">
      <table class="table table-sm table-hover visor-tabular-table mb-0">${thead}${tbody}</table>
    </div>`;

  syncActionButtons();
}

async function loadLayerSelect() {
  const sel = _modalEl?.querySelector("#visorTabularLayerSelect");
  if (!sel) return;
  _layers = await fetchVisorTabularLayers();
  sel.innerHTML = "";
  if (!_layers.length) {
    sel.innerHTML = '<option value="">Sin capas disponibles</option>';
    syncActionButtons();
    return;
  }
  for (const layer of _layers) {
    const opt = document.createElement("option");
    opt.value = layer.id;
    opt.textContent = layer.label || layer.id;
    sel.appendChild(opt);
  }
  sel.value = _layers[0].id;
  syncActionButtons();
}

async function onGenerateTable() {
  const layer = selectedLayerId();
  const cve = resolveCveMun();

  if (!cve) {
    setStatus("Selecciona un municipio en el explorador lateral.", true);
    return;
  }
  if (!layer) {
    setStatus("Elige una capa para consultar.", true);
    return;
  }

  _loading = true;
  syncActionButtons();
  setStatus("Generando tabla…");
  clearResults();

  try {
    const data = await fetchVisorTabularData({ layer, cve_mun: cve });
    renderTable(data);
    const n = data.total_registros ?? data.rows?.length ?? 0;
    setStatus(`Tabla generada · ${n.toLocaleString("es-MX")} localidad(es).`, false);
  } catch (err) {
    setStatus(err.message || "No se pudo generar la tabla.", true);
  } finally {
    _loading = false;
    syncActionButtons();
  }
}

async function onExportExcel() {
  if (!_ultimoResultado) {
    setStatus("Genera la tabla antes de exportar.", true);
    return;
  }
  const cve = _ultimoResultado.cve_mun || (typeof _getCveMun === "function" ? _getCveMun() : null);
  if (!cve) return;

  _loading = true;
  syncActionButtons();
  setStatus("Preparando Excel…");

  try {
    await downloadVisorTabularExcel({
      layer: _ultimoResultado.layer,
      cve_mun: cve,
      nom_mun: _ultimoResultado.nom_mun,
    });
    setStatus("Archivo Excel descargado.", false);
  } catch (err) {
    setStatus(err.message || "No se pudo exportar.", true);
  } finally {
    _loading = false;
    syncActionButtons();
  }
}

function ensureModal() {
  if (_modalEl) return _modalEl;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal fade" id="visorTabularModal" tabindex="-1" aria-labelledby="visorTabularModalTitle" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
        <div class="modal-content visor-tabular-modal">
          <div class="modal-header visor-tabular-modal__header">
            <div>
              <h2 class="modal-title h5 mb-1" id="visorTabularModalTitle">Consulta tabular</h2>
              <p class="visor-tabular-modal__subtitle small mb-0">Atributos alfanuméricos de capas activas del visor</p>
            </div>
            <button type="button" class="btn-close" id="visorTabularCloseX" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <div class="visor-tabular-mun-banner" id="visorTabularMunBanner"></div>
            <div class="row g-3 align-items-end">
              <div class="col-md-8">
                <label class="form-label fw-semibold" for="visorTabularLayerSelect">Capa temática</label>
                <select id="visorTabularLayerSelect" class="form-select form-select-sm"></select>
              </div>
              <div class="col-md-4">
                <button type="button" id="visorTabularRunBtn" class="btn btn-primary btn-sm w-100 visor-tabular-run-btn">
                  Generar tabla
                </button>
              </div>
            </div>
            <div id="visorTabularStatus" class="small mt-2" role="status" hidden></div>
            <div id="visorTabularResults" class="visor-tabular-results mt-3 d-none"></div>
          </div>
          <div class="modal-footer flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="visorTabularCloseBtn">Cerrar</button>
            <button type="button" id="visorTabularExportBtn" class="btn btn-outline-success btn-sm d-none">
              Exportar Excel
            </button>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(wrap.firstElementChild);
  _modalEl = document.getElementById("visorTabularModal");

  _modalEl.querySelector("#visorTabularCloseX")?.addEventListener("click", closeTabularModal);
  _modalEl.querySelector("#visorTabularCloseBtn")?.addEventListener("click", closeTabularModal);
  _modalEl.querySelector("#visorTabularRunBtn")?.addEventListener("click", () => void onGenerateTable());
  _modalEl.querySelector("#visorTabularExportBtn")?.addEventListener("click", () => void onExportExcel());
  _modalEl.querySelector("#visorTabularLayerSelect")?.addEventListener("change", () => {
    clearResults();
    setStatus("");
    syncActionButtons();
  });

  return _modalEl;
}

function updateMunBanner() {
  const el = _modalEl?.querySelector("#visorTabularMunBanner");
  if (!el) return;
  el.innerHTML = `
    <span class="visor-tabular-mun-banner__icon" aria-hidden="true">📍</span>
    <span><strong>Municipio:</strong> ${escapeHtml(municipioLabel())}</span>`;
}

function ensureOpenButton() {
  const header = document.querySelector("#dashboardVisor .visor-layers-card .card-header");
  if (!header) return null;

  if (!header.classList.contains("visor-layers-card__header")) {
    header.classList.add("visor-layers-card__header", "d-flex", "align-items-start", "justify-content-between", "gap-2");
    const titleWrap = document.createElement("div");
    while (header.firstChild) titleWrap.appendChild(header.firstChild);
    header.appendChild(titleWrap);
  }

  let btn = header.querySelector("#visorTabularOpenBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "visorTabularOpenBtn";
    btn.className = "btn btn-sm visor-tabular-open-btn";
    btn.title = "Consulta tabular de capas";
    btn.setAttribute("aria-label", "Abrir consulta tabular de capas");
    btn.innerHTML = TABLE_ICON_SVG;
    btn.addEventListener("click", () => void openTabularModal());
    header.appendChild(btn);
  }
  _openBtn = btn;
  return btn;
}

async function openTabularModal() {
  ensureModal();
  clearResults();
  setStatus("");
  updateMunBanner();

  try {
    await loadLayerSelect();
  } catch (err) {
    setStatus(err.message || "No se pudo cargar el catálogo de capas.", true);
    syncActionButtons();
  }

  updateMunBanner();
  syncActionButtons();
  showTabularModal();
}

/**
 * @param {{ getCveMun?: () => string|null, getMunicipio?: () => object|null }} [options]
 */
export function attachVisorTabular(options = {}) {
  _getCveMun = typeof options.getCveMun === "function" ? options.getCveMun : () => null;
  _getMunicipio = typeof options.getMunicipio === "function" ? options.getMunicipio : () => null;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureOpenButton, { once: true });
  } else {
    ensureOpenButton();
  }
}

export function teardownVisorTabular() {
  closeTabularModal();
  _openBtn?.remove();
  _openBtn = null;
  _modalEl?.remove();
  _modalEl = null;
  _ultimoResultado = null;
  _layers = [];
}

export function refreshVisorTabular(options = {}) {
  if (typeof options.getCveMun === "function") _getCveMun = options.getCveMun;
  if (typeof options.getMunicipio === "function") _getMunicipio = options.getMunicipio;
  ensureOpenButton();
}
