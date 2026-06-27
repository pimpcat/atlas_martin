/**
 * Asistente admin: publicar capa en el catálogo del visor (Fase 1).
 */
import { adminFetch, isVisorAdminLoggedIn, verifyAdminSession } from "./visorAdminAuth.js";
import { ensureVisorLayersHeaderToolbar } from "./visorLayersToolbar.js";
import { reloadVisorLayerCatalog } from "./visorLayers.js";
import { renderAdminStylePreview } from "./visorAdminStylePreview.js";

let _publishBtn = null;
let _manageBtn = null;
let _modalEl = null;
let _meta = null;
let _attached = false;

const PUBLISH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const MANAGE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8"/>
  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2.07 2.07 0 0 1-2.93 2.93l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2.07 2.07 0 0 1-4.14 0v-.07a1.7 1.7 0 0 0-1.1-1.54 1.7 1.7 0 0 0-1.87.34l-.05.05a2.07 2.07 0 0 1-2.93-2.93l.05-.05a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.54-1H3a2.07 2.07 0 0 1 0-4.14h.09a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2.07 2.07 0 0 1 2.93-2.93l.05.05a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 9 3.09V3a2.07 2.07 0 0 1 4.14 0v.09a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.87-.34l.05-.05a2.07 2.07 0 0 1 2.93 2.93l-.05.05a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.54 1H21a2.07 2.07 0 0 1 0 4.14h-.09a1.7 1.7 0 0 0-1.54 1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
</svg>`;

/** Plantillas DENUE frecuentes (códigos SCIAN + icono sugerido). */
const DENUE_CATALOG_PRESETS = [
  { key: "denue_rastros", label: "Rastros (sacrificio de ganado)", codigo_act: [311611], icon_key: "denue_rastros" },
  { key: "denue_gasolinerias", label: "Gasolinerías", codigo_act: [468411], icon_key: "denue_gasolinerias" },
  { key: "denue_gaseras", label: "Gaseras", codigo_act: [468412], icon_key: "denue_gaseras" },
  {
    key: "denue_escuelas",
    label: "Escuelas",
    codigo_act: [
      611112, 611122, 611132, 611142, 611152, 611162, 611172, 611182,
      611212, 611312, 611422, 611432, 611512, 611612, 611622, 611632,
    ],
    icon_key: "denue_escuelas",
  },
  { key: "denue_hospitales", label: "Hospitales (DENUE)", codigo_act: [622112], icon_key: "denue_hospitales" },
  { key: "denue_museos", label: "Museos", codigo_act: [712112], icon_key: "denue_museos" },
  { key: "denue_cementerios", label: "Cementerios", codigo_act: [812322], icon_key: "denue_cementerios" },
  { key: "denue_iglesias", label: "Iglesias/Templos", codigo_act: [813210], icon_key: "denue_iglesias" },
];

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layerIdFromTable(table) {
  return String(table || "")
    .replace(/^c_/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

function syncPublishButton() {
  if (!_publishBtn) return;
  const show = isVisorAdminLoggedIn();
  _publishBtn.classList.toggle("d-none", !show);
  _publishBtn.disabled = !show;
}

async function loadMeta() {
  const { res, data, networkError } = await adminFetch("/api/visor/admin/meta");
  if (networkError || !res?.ok) {
    throw new Error(apiErrorMessage(data, "No se pudo cargar metadatos del asistente"));
  }
  _meta = data;
  return data;
}

function ensureModal() {
  if (_modalEl) return _modalEl;
  const wrap = document.createElement("div");
  wrap.id = "visorCatalogAdminModal";
  wrap.className = "visor-admin-modal d-none";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "visorCatalogAdminTitle");
  wrap.innerHTML = `
    <div class="visor-admin-modal__backdrop"></div>
    <div class="visor-admin-modal__panel card shadow">
      <div class="card-header d-flex align-items-center justify-content-between py-2">
        <div class="fw-semibold small" id="visorCatalogAdminTitle">Publicar capa en el visor</div>
        <button type="button" class="btn-close btn-close-sm" aria-label="Cerrar"></button>
      </div>
      <div class="card-body visor-admin-modal__body atlas-scroll"></div>
      <div class="card-footer d-flex justify-content-between gap-2 py-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-act="prev">Atrás</button>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-act="cancel">Cancelar</button>
          <button type="button" class="btn btn-sm btn-primary" data-act="next">Siguiente</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector(".visor-admin-modal__backdrop")?.addEventListener("click", closeModal);
  wrap.querySelector(".btn-close")?.addEventListener("click", closeModal);
  wrap.querySelector('[data-act="cancel"]')?.addEventListener("click", closeModal);
  _modalEl = wrap;
  return wrap;
}

function closeModal() {
  _modalEl?.classList.add("d-none");
}

function setModalTitle(text) {
  const el = document.getElementById("visorCatalogAdminTitle");
  if (el) el.textContent = text;
}

function syncAdminButtons() {
  syncPublishButton();
  if (!_manageBtn) return;
  const show = isVisorAdminLoggedIn();
  _manageBtn.classList.toggle("d-none", !show);
  _manageBtn.disabled = !show;
}

const wizard = {
  mode: "create",
  editingLayerId: "",
  step: 0,
  table: "",
  label: "",
  group_id: "",
  geometry: "line",
  style_preset: "line_outline",
  color: "#8c5f37",
  icon_key: "",
  style_field: "",
  default_color: "#94a3b8",
  style_classes: [],
  denue_codigo_act: [],
  denue_use_template: true,
  denue_preset_key: "",
  martin_needs_restart: false,
  table_source: "martin",
  shp_uploaded: false,
  export_kml: true,
  export_shp: true,
  mun_scope: "municipio",
  identify_fields: [{ column: "gid", label: "Identificador" }],
  identify_title: "",
  labels_enabled: false,
  labels_field: "",
  labels_minzoom: 14,
  labels_above_icon: true,
  labels_color: "#2c3e50",
  export_columns: [],
  table_columns: [],
  columns_load_error: "",
  distinct_values: [],
  distinct_total: 0,
  distinct_truncated: false,
};

function wizardMaxStep() {
  return wizard.mode === "edit" ? 3 : 4;
}

function resetWizardForCreate() {
  wizard.mode = "create";
  wizard.editingLayerId = "";
  wizard.step = 0;
  wizard.table = "";
  wizard.label = "";
  wizard.group_id = _meta?.groups?.[0]?.id || "servicios";
  wizard.geometry = "line";
  wizard.style_preset = "line_outline";
  wizard.color = "#8c5f37";
  wizard.icon_key = "";
  wizard.style_field = "";
  wizard.default_color = "#94a3b8";
  wizard.style_classes = [];
  wizard.denue_codigo_act = [];
  wizard.denue_use_template = true;
  wizard.denue_preset_key = "";
  wizard.martin_needs_restart = false;
  wizard.export_kml = true;
  wizard.export_shp = true;
  wizard.mun_scope = "municipio";
  wizard.identify_fields = [{ column: "gid", label: "Identificador" }];
  wizard.identify_title = "";
  wizard.labels_enabled = false;
  wizard.labels_field = "";
  wizard.labels_minzoom = 14;
  wizard.labels_above_icon = true;
  wizard.labels_color = "#2c3e50";
  wizard.export_columns = [];
  wizard.table_columns = [];
  wizard.columns_load_error = "";
  wizard.distinct_values = [];
  wizard.distinct_total = 0;
  wizard.distinct_truncated = false;
}

function presetOptionsHtml() {
  const presets = _meta?.presets || [];
  const basic = presets.filter((p) => !p.by_attribute);
  const byAttr = presets.filter((p) => p.by_attribute);
  const render = (list) =>
    list
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}" data-geometry="${escapeHtml(p.geometry)}">${escapeHtml(p.label || p.id)}</option>`,
      )
      .join("");
  if (!byAttr.length) return render(presets);
  return `
    <optgroup label="Símbolo único">${render(basic)}</optgroup>
    <optgroup label="Por atributo (colores por campo)">${render(byAttr)}</optgroup>`;
}

function groupOptionsHtml() {
  return (_meta?.groups || [])
    .map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.label || g.id)}</option>`)
    .join("");
}

function iconOptionsHtml() {
  return (_meta?.icons || [])
    .map((i) => `<option value="${escapeHtml(i.key)}">${escapeHtml(i.label || i.key)}</option>`)
    .join("");
}

function presetMetaById(id) {
  return (_meta?.presets || []).find((p) => p.id === id);
}

function isByAttributePreset(presetId) {
  const meta = presetMetaById(presetId);
  return Boolean(meta?.by_attribute || String(presetId || "").endsWith("_by_attribute"));
}

function isDenueTable(table) {
  return String(table || "").toLowerCase() === "c_denue";
}

function defaultStyleClasses() {
  return [
    { value: "A", color: "#ef4444", label: "Clase A" },
    { value: "B", color: "#3b82f6", label: "Clase B" },
  ];
}

/** Paleta para autoclasificar (hasta 32 clases). */
const AUTO_CLASS_COLORS = [
  "#ef4444",
  "#f97316",
  "#ca8a04",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
  "#0d9488",
  "#dc2626",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

function normalizeStyleClasses(list) {
  return (list || [])
    .map((c) => ({
      value: String(c?.value ?? "").trim(),
      color: String(c?.color ?? "#94a3b8").trim(),
      label: String(c?.label ?? c?.value ?? "").trim(),
    }))
    .filter((c) => c.value);
}

function styleClassRowsHtml(classes) {
  const rows = normalizeStyleClasses(classes);
  const list = rows.length ? rows : defaultStyleClasses();
  return list
    .map(
      (cls, idx) => `
      <div class="visor-admin-class-row" data-idx="${idx}">
        <input type="text" class="form-control form-control-sm visor-admin-cls-value" placeholder="Valor" value="${escapeHtml(cls.value)}" />
        <input type="color" class="form-control form-control-color form-control-sm visor-admin-cls-color" value="${escapeHtml(cls.color)}" />
        <input type="text" class="form-control form-control-sm visor-admin-cls-label" placeholder="Leyenda" value="${escapeHtml(cls.label || cls.value)}" />
        <button type="button" class="btn btn-sm btn-outline-danger visor-admin-cls-remove" title="Quitar">×</button>
      </div>`,
    )
    .join("");
}

function readStyleClassesFromDom() {
  const root = document.getElementById("visorAdminStyleClasses");
  const attrWrap = document.getElementById("visorAdminAttrWrap");
  if (!root || attrWrap?.classList.contains("d-none")) {
    return normalizeStyleClasses(wizard.style_classes);
  }
  const out = [];
  root.querySelectorAll(".visor-admin-class-row").forEach((row) => {
    const value = row.querySelector(".visor-admin-cls-value")?.value?.trim();
    const color = row.querySelector(".visor-admin-cls-color")?.value?.trim() || "#94a3b8";
    const label = row.querySelector(".visor-admin-cls-label")?.value?.trim() || value;
    if (value) out.push({ value, color, label });
  });
  return out;
}

function bindStyleClassEditor(attrWrap, onChange) {
  if (!attrWrap) return;
  const listRoot = attrWrap.querySelector("#visorAdminStyleClasses");
  const sync = () => {
    wizard.style_classes = readStyleClassesFromDom();
    onChange?.();
  };
  attrWrap.querySelector("#visorAdminAddClass")?.addEventListener("click", () => {
    const rows = readStyleClassesFromDom();
    rows.push({ value: "", color: "#94a3b8", label: "" });
    if (listRoot) {
      listRoot.innerHTML = styleClassRowsHtml(rows);
      bindStyleClassEditor(attrWrap, onChange);
    }
    sync();
  });
  listRoot?.querySelectorAll(".visor-admin-cls-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".visor-admin-class-row")?.remove();
      sync();
    });
  });
  listRoot?.querySelectorAll(".visor-admin-cls-value, .visor-admin-cls-color, .visor-admin-cls-label").forEach((el) => {
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
  });
}

function columnOptionsHtml(cols, selected) {
  const sel = String(selected || "").toLowerCase();
  return (cols || [])
    .map((col) => {
      const picked = col.toLowerCase() === sel ? "selected" : "";
      return `<option value="${escapeHtml(col)}" ${picked}>${escapeHtml(col)}</option>`;
    })
    .join("");
}

function denuePresetOptionsHtml(selectedKey) {
  const sel = String(selectedKey || "");
  const opts = DENUE_CATALOG_PRESETS.map(
    (p) =>
      `<option value="${escapeHtml(p.key)}" ${p.key === sel ? "selected" : ""}>${escapeHtml(p.label)}</option>`,
  ).join("");
  return `<option value="">— Personalizado —</option>${opts}`;
}

function applyDenuePreset(key) {
  const preset = DENUE_CATALOG_PRESETS.find((p) => p.key === key);
  if (!preset) return;
  wizard.denue_preset_key = preset.key;
  wizard.denue_codigo_act = [...preset.codigo_act];
  wizard.style_preset = "point_symbol";
  wizard.geometry = "point";
  wizard.icon_key = preset.icon_key;
  wizard.group_id = "denue";
  wizard.denue_use_template = true;
}

async function fetchTablePublishStatus(table) {
  const name = String(table || "").trim();
  if (!name) return null;
  try {
    const { res, data } = await adminFetch(
      `/api/visor/admin/tables/${encodeURIComponent(name)}/status`,
    );
    if (!res?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function renderMartinStatusBanner(container, status) {
  if (!container) return;
  if (!status?.needs_martin_restart) {
    container.innerHTML = "";
    container.classList.add("d-none");
    wizard.martin_needs_restart = false;
    return;
  }
  wizard.martin_needs_restart = true;
  container.classList.remove("d-none");
  container.innerHTML = `
    <div class="alert alert-warning py-2 px-2 small mb-2 visor-admin-martin-banner">
      <strong>Martin:</strong> esta tabla aún no aparece en tiles. Tras publicar, reinicie Martin una vez:
      <code>docker compose restart martin</code>
    </div>`;
}

function refreshStylePreview(container) {
  if (!container) return;
  const preset = document.getElementById("visorAdminPreset")?.value || wizard.style_preset;
  const byAttr = isByAttributePreset(preset);
  renderAdminStylePreview(container, {
    geometry: wizard.geometry,
    preset,
    color: document.getElementById("visorAdminColor")?.value || wizard.color,
    classes: byAttr ? readStyleClassesFromDom() : [],
    defaultColor: document.getElementById("visorAdminDefaultColor")?.value || wizard.default_color,
  });
}

function apiErrorMessage(data, fallback) {
  const detail = data?.detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const loc = Array.isArray(first?.loc) ? first.loc.filter((p) => p !== "body").join(".") : "";
    const msg = first?.msg || first?.message;
    if (loc && msg) return `${loc}: ${msg}`;
    if (msg) return String(msg);
  }
  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string" && detail.message.includes("|")) {
      return detail.message.split("|")[0];
    }
    return detail.message || detail.error || fallback;
  }
  return data?.message || fallback;
}

async function fetchAdminTables(retries = 2) {
  let lastError = "No se pudo listar tablas de Martin";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { res, data, networkError } = await adminFetch("/api/visor/admin/tables");
    if (networkError || !res) {
      lastError = "No se pudo contactar al API. Verifique que el contenedor api_backend esté activo.";
    } else if (res.ok) {
      return data?.tables || [];
    } else {
      lastError = apiErrorMessage(data, lastError);
      const errCode = data?.detail?.error || "";
      if (res.status === 503 || errCode === "MARTIN_UNAVAILABLE") {
        lastError =
          "Martin aún no responde. Espere unos segundos y pulse Reintentar (no requiere municipio seleccionado).";
      }
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  const err = new Error(lastError);
  err.retryable = true;
  throw err;
}

async function uploadShpFromWizard(body) {
  const fileEl = body?.querySelector("#visorAdminShpFile");
  const statusEl = body?.querySelector("#visorAdminShpStatus");
  const tableHint = body?.querySelector("#visorAdminShpTable")?.value?.trim() || "";
  const file = fileEl?.files?.[0];
  if (!file) {
    if (statusEl) statusEl.textContent = "Seleccione un archivo .shp o .zip";
    return;
  }
  if (statusEl) statusEl.textContent = "Importando…";
  const form = new FormData();
  form.append("file", file);
  if (tableHint) form.append("table_name", tableHint);
  const { res, data } = await adminFetch("/api/visor/admin/upload/shp", { method: "POST", body: form });
  if (!res?.ok) {
    if (statusEl) statusEl.textContent = apiErrorMessage(data, "No se pudo importar el shapefile");
    return;
  }
  wizard.table = data.table || "";
  wizard.geometry = data.geometry || "point";
  wizard.table_columns = (data.columns || []).map((c) => String(c.name || "")).filter(Boolean);
  wizard.shp_uploaded = true;
  wizard.table_source = "shp";
  wizard.martin_needs_restart = true;
  if (statusEl) {
    statusEl.innerHTML = `Importado: <code>${escapeHtml(wizard.table)}</code> (${data.feature_count ?? "?"} features). ${escapeHtml(data.message || "")}`;
    statusEl.classList.remove("text-danger");
    statusEl.classList.add("text-success");
  }
  const okBox = body?.querySelector("#visorAdminShpOk");
  if (okBox) {
    okBox.classList.remove("d-none");
    okBox.innerHTML = `Tabla lista: <strong>${escapeHtml(wizard.table)}</strong> · geometría ${escapeHtml(wizard.geometry)}. Pulse <strong>Siguiente</strong>.`;
  }
}

async function uploadIconFromStyleStep(body) {
  const statusEl = body?.querySelector("#visorAdminIconUploadStatus");
  const key = body?.querySelector("#visorAdminIconKey")?.value?.trim() || "";
  const label = body?.querySelector("#visorAdminIconLabel")?.value?.trim() || key;
  const file = body?.querySelector("#visorAdminIconFile")?.files?.[0];
  if (!key || !file) {
    if (statusEl) statusEl.textContent = "Indique clave e icono SVG";
    return;
  }
  if (statusEl) statusEl.textContent = "Subiendo…";
  const form = new FormData();
  form.append("file", file);
  form.append("icon_key", key);
  form.append("label", label);
  const { res, data } = await adminFetch("/api/visor/admin/upload/icon", { method: "POST", body: form });
  if (!res?.ok) {
    if (statusEl) statusEl.textContent = apiErrorMessage(data, "No se pudo registrar el icono");
    return;
  }
  await loadMeta();
  const iconEl = body?.querySelector("#visorAdminIcon");
  if (iconEl) {
    iconEl.innerHTML = iconOptionsHtml();
    iconEl.value = data.icon_key || key;
    wizard.icon_key = iconEl.value;
  }
  if (statusEl) {
    statusEl.textContent = data.message || "Icono registrado";
    statusEl.classList.add("text-success");
  }
  refreshStylePreview(body?.querySelector("#visorAdminStylePreviewHost"));
}

async function renderStepTables(body) {
  body.innerHTML = `
    <ul class="nav nav-tabs nav-tabs-sm mb-2 visor-admin-table-tabs" role="tablist">
      <li class="nav-item"><button type="button" class="nav-link ${wizard.table_source !== "shp" ? "active" : ""}" data-tab="martin">Tablas en Martin</button></li>
      <li class="nav-item"><button type="button" class="nav-link ${wizard.table_source === "shp" ? "active" : ""}" data-tab="shp">Subir shapefile</button></li>
    </ul>
    <div id="visorAdminTableTabMartin" class="${wizard.table_source === "shp" ? "d-none" : ""}"></div>
    <div id="visorAdminTableTabShp" class="${wizard.table_source === "shp" ? "" : "d-none"}">
      <p class="small text-muted">Importa <strong>.shp</strong> o <strong>.zip</strong> (con .shp, .dbf, .shx). Se crea tabla <code>c_*</code> en PostGIS (EPSG:3857).</p>
      <div class="mb-2">
        <label class="form-label small mb-1" for="visorAdminShpTable">Nombre de tabla (opcional)</label>
        <input type="text" class="form-control form-control-sm" id="visorAdminShpTable" placeholder="c_mi_capa" value="${escapeHtml(wizard.table && wizard.shp_uploaded ? wizard.table : "")}" />
      </div>
      <div class="mb-2">
        <label class="form-label small mb-1" for="visorAdminShpFile">Archivo</label>
        <input type="file" class="form-control form-control-sm" id="visorAdminShpFile" accept=".shp,.zip,application/zip,application/x-shapefile" />
      </div>
      <button type="button" class="btn btn-sm btn-primary" id="visorAdminShpUploadBtn">Importar a PostGIS</button>
      <div id="visorAdminShpStatus" class="small mt-2 text-muted"></div>
      <div id="visorAdminShpOk" class="alert alert-success py-2 px-2 small mt-2 ${wizard.shp_uploaded ? "" : "d-none"}">${wizard.shp_uploaded ? `Tabla lista: <strong>${escapeHtml(wizard.table)}</strong>` : ""}</div>
      <div class="alert alert-warning py-2 px-2 small mt-2">Tras importar: <code>docker compose restart martin</code> antes de publicar.</div>
    </div>`;

  body.querySelectorAll(".visor-admin-table-tabs [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wizard.table_source = btn.getAttribute("data-tab") === "shp" ? "shp" : "martin";
      void renderStepTables(body);
    });
  });
  body.querySelector("#visorAdminShpUploadBtn")?.addEventListener("click", () => void uploadShpFromWizard(body));

  if (wizard.table_source === "shp") return;

  const martinPane = body.querySelector("#visorAdminTableTabMartin");
  if (!martinPane) return;

  let tables = [];
  try {
    tables = await fetchAdminTables();
  } catch (err) {
    martinPane.innerHTML = `
      <p class="small text-danger mb-2">${escapeHtml(err?.message || "No se pudo listar tablas de Martin")}</p>
      <p class="small text-muted mb-2">Puede usar la pestaña <strong>Subir shapefile</strong> o reintentar cuando Martin responda.</p>
      <button type="button" class="btn btn-sm btn-outline-primary" data-act="retry-tables">Reintentar</button>`;
    martinPane.querySelector('[data-act="retry-tables"]')?.addEventListener("click", () => void renderStepTables(body));
    return;
  }
  if (!tables.length) {
    martinPane.innerHTML =
      '<p class="small text-muted mb-0">No hay tablas nuevas en Martin. Use <strong>Subir shapefile</strong> o cargue datos a PostGIS y reinicie Martin.</p>';
    return;
  }
  martinPane.innerHTML = `
    <p class="small text-muted">Seleccione la tabla publicada en Martin que aún no está en el catálogo.</p>
    <div id="visorAdminMartinBanner" class="d-none"></div>
    <select class="form-select form-select-sm" id="visorAdminTablePick">
      ${tables.map((t) => `<option value="${escapeHtml(t.table)}">${escapeHtml(t.table)}</option>`).join("")}
    </select>`;
  const pick = martinPane.querySelector("#visorAdminTablePick");
  const banner = martinPane.querySelector("#visorAdminMartinBanner");
  wizard.table = pick?.value || tables[0].table;
  wizard.shp_uploaded = false;
  const syncTablePick = async () => {
    wizard.table = pick?.value || wizard.table;
    wizard.table_source = "martin";
    if (isDenueTable(wizard.table)) {
      wizard.geometry = "point";
      wizard.group_id = "denue";
      wizard.style_preset = wizard.style_preset || "point_symbol";
    }
    const status = await fetchTablePublishStatus(wizard.table);
    renderMartinStatusBanner(banner, status);
  };
  pick?.addEventListener("change", () => void syncTablePick());
  await syncTablePick();
}

async function detectMunScope(table) {
  try {
    const { res, data } = await adminFetch(
      `/api/visor/admin/tables/${encodeURIComponent(table)}/columns`,
    );
    if (!res?.ok) return "municipio";
    const cols = (data?.columns || []).map((c) => String(c.name || "").toLowerCase());
    if (cols.includes("cve_mun") || cols.includes("cvegeo")) return "municipio";
    return "estatal";
  } catch {
    return "municipio";
  }
}

function renderStepDetails(body) {
  const lid =
    wizard.mode === "edit"
      ? wizard.editingLayerId
      : layerIdFromTable(wizard.table);
  const tableReadonly = wizard.mode === "edit";
  body.innerHTML = `
    ${tableReadonly ? `<p class="small text-muted mb-2">Tabla: <code>${escapeHtml(wizard.table)}</code> (no editable)</p>` : ""}
    <div class="mb-2">
      <label class="form-label small mb-1">Etiqueta en el panel</label>
      <input type="text" class="form-control form-control-sm" id="visorAdminLabel" value="${escapeHtml(wizard.label || lid.replace(/_/g, " "))}" />
    </div>
    <div class="mb-2 ${tableReadonly ? "d-none" : ""}">
      <label class="form-label small mb-1">Id de capa (catálogo)</label>
      <input type="text" class="form-control form-control-sm" id="visorAdminLayerId" value="${escapeHtml(lid)}" ${tableReadonly ? "readonly" : ""} />
    </div>
    <div class="mb-2">
      <label class="form-label small mb-1">Grupo del panel</label>
      <select class="form-select form-select-sm" id="visorAdminGroup">${groupOptionsHtml()}</select>
    </div>
    <div class="mb-2">
      <label class="form-label small mb-1">Alcance territorial</label>
      <select class="form-select form-select-sm" id="visorAdminMunScope">
        <option value="municipio">Municipal (filtra por cve_mun del explorador)</option>
        <option value="estatal">Estatal (sin filtro municipal)</option>
      </select>
      <div class="form-text">Use <strong>Estatal</strong> si la tabla no tiene columna <code>cve_mun</code> (p. ej. contorno de entidad).</div>
    </div>
    <div class="mb-0">
      <label class="form-label small mb-1">Geometría</label>
      <select class="form-select form-select-sm" id="visorAdminGeometry">
        <option value="point">Punto</option>
        <option value="line">Línea</option>
        <option value="polygon">Polígono</option>
      </select>
    </div>`;
  body.querySelector("#visorAdminLabel")?.addEventListener("input", (ev) => {
    ev.target.dataset.touched = "1";
  });
  const geom = body.querySelector("#visorAdminGeometry");
  if (geom) geom.value = wizard.geometry;
  const grp = body.querySelector("#visorAdminGroup");
  if (grp && wizard.group_id) grp.value = wizard.group_id;
  const scope = body.querySelector("#visorAdminMunScope");
  if (scope) {
    scope.value = wizard.mun_scope;
    scope.addEventListener("change", () => {
      wizard.mun_scope = scope.value === "estatal" ? "estatal" : "municipio";
    });
  }
  void detectMunScope(wizard.table).then((detected) => {
    if (wizard.mode === "edit") return;
    wizard.mun_scope = detected;
    if (scope) scope.value = detected;
  });
}

async function loadTableColumns(table) {
  const name = String(table || "").trim();
  if (!name) return [];
  const { res, data } = await adminFetch(
    `/api/visor/admin/tables/${encodeURIComponent(name)}/columns`,
  );
  if (!res?.ok) throw new Error(apiErrorMessage(data, "No se pudieron cargar las columnas de la tabla"));
  const cols = (data?.columns || []).map((c) => String(c.name || "")).filter(Boolean);
  wizard.table_columns = cols;
  return cols;
}

/** Columnas disponibles: PostGIS + identify/export ya configurados en el asistente. */
function columnCandidatesForStyle() {
  const fromTable = wizard.table_columns || [];
  const fromIdentify = normalizeIdentifyFieldObjects(wizard.identify_fields).map((f) => f.column);
  const fromExport = wizard.export_columns || [];
  return [...new Set([...fromTable, ...fromIdentify, ...fromExport])].filter(Boolean);
}

async function ensureTableColumnsLoaded() {
  const table = String(wizard.table || "").trim();
  wizard.columns_load_error = "";
  if (!table) return columnCandidatesForStyle();
  if (!wizard.table_columns.length) {
    try {
      await loadTableColumns(table);
    } catch (err) {
      wizard.columns_load_error = err?.message || "Error al cargar columnas";
    }
  }
  return columnCandidatesForStyle();
}

function refreshStyleFieldSelect(root, selected) {
  const fieldEl =
    root?.querySelector("#visorAdminStyleField") || document.getElementById("visorAdminStyleField");
  const statusEl =
    root?.querySelector("#visorAdminStyleFieldStatus") ||
    document.getElementById("visorAdminStyleFieldStatus");
  if (!fieldEl) return;
  const cols = columnCandidatesForStyle();
  const sel = selected ?? wizard.style_field ?? "";
  if (!cols.length) {
    fieldEl.innerHTML = `<option value="">— Sin columnas —</option>`;
    if (statusEl) {
      statusEl.textContent = wizard.columns_load_error
        ? wizard.columns_load_error
        : wizard.table
          ? `No se encontraron columnas para ${wizard.table}. Verifique PostGIS.`
          : "Seleccione una tabla primero.";
      statusEl.classList.add("text-danger");
    }
    return;
  }
  fieldEl.innerHTML = `<option value="">— Seleccione —</option>${columnOptionsHtml(cols, sel)}`;
  if (sel && cols.some((c) => c.toLowerCase() === String(sel).toLowerCase())) {
    fieldEl.value = cols.find((c) => c.toLowerCase() === String(sel).toLowerCase()) || sel;
  }
  if (statusEl) {
    statusEl.textContent = wizard.columns_load_error || "";
    statusEl.classList.toggle("text-danger", Boolean(wizard.columns_load_error));
  }
}

async function fetchDistinctFieldValues(table, column) {
  const t = String(table || "").trim();
  const c = String(column || "").trim();
  if (!t || !c) return null;
  const { res, data } = await adminFetch(
    `/api/visor/admin/tables/${encodeURIComponent(t)}/columns/${encodeURIComponent(c)}/distinct?limit=32`,
  );
  if (!res?.ok) return { error: apiErrorMessage(data, "No se pudieron leer valores") };
  return data;
}

function buildClassesFromDistinctValues(values) {
  return (values || []).map((val, i) => {
    const text = String(val);
    return {
      value: text,
      color: AUTO_CLASS_COLORS[i % AUTO_CLASS_COLORS.length],
      label: text.length > 48 ? `${text.slice(0, 45)}…` : text,
    };
  });
}

function distinctValuesChipsHtml(values) {
  return (values || [])
    .map(
      (v) =>
        `<span class="visor-admin-distinct-chip" title="${escapeHtml(String(v))}">${escapeHtml(String(v))}</span>`,
    )
    .join("");
}

function applyStyleClassesToDom(body, classes, previewHost) {
  const attrWrap = body?.querySelector("#visorAdminAttrWrap");
  const listRoot = body?.querySelector("#visorAdminStyleClasses");
  if (!listRoot || !attrWrap) return;
  wizard.style_classes = normalizeStyleClasses(classes);
  listRoot.innerHTML = styleClassRowsHtml(wizard.style_classes);
  bindStyleClassEditor(attrWrap, () => refreshStylePreview(previewHost));
  refreshStylePreview(previewHost);
}

async function loadDistinctFieldPanel(body, previewHost) {
  const fieldEl = body?.querySelector("#visorAdminStyleField");
  const field = fieldEl?.value?.trim() || "";
  const panel = body?.querySelector("#visorAdminDistinctPanel");
  const statusEl = body?.querySelector("#visorAdminDistinctStatus");
  const valuesEl = body?.querySelector("#visorAdminDistinctValues");
  const autoBtn = body?.querySelector("#visorAdminAutoclassifyBtn");
  if (!panel) return;
  if (!field) {
    panel.classList.add("d-none");
    return;
  }
  wizard.style_field = field;
  panel.classList.remove("d-none");
  if (statusEl) statusEl.textContent = "Consultando valores únicos en PostGIS…";
  if (valuesEl) valuesEl.innerHTML = "";
  if (autoBtn) autoBtn.disabled = true;

  const result = await fetchDistinctFieldValues(wizard.table, field);
  if (result?.error) {
    if (statusEl) {
      statusEl.textContent = result.error;
      statusEl.classList.add("text-danger");
    }
    return;
  }
  wizard.distinct_values = result?.values || [];
  wizard.distinct_total = result?.total_distinct ?? wizard.distinct_values.length;
  wizard.distinct_truncated = Boolean(result?.truncated);

  if (statusEl) {
    statusEl.classList.remove("text-danger");
    if (!wizard.distinct_values.length) {
      statusEl.textContent = "Sin valores distintos (columna vacía o nula).";
    } else if (wizard.distinct_truncated) {
      statusEl.textContent = `${wizard.distinct_total} valores distintos; mostrando ${wizard.distinct_values.length}. Puede editar clases manualmente.`;
    } else {
      statusEl.textContent = `${wizard.distinct_values.length} valor${wizard.distinct_values.length === 1 ? "" : "es"} distinto${wizard.distinct_values.length === 1 ? "" : "s"} en «${field}».`;
    }
  }
  if (valuesEl) {
    valuesEl.innerHTML = wizard.distinct_values.length
      ? distinctValuesChipsHtml(wizard.distinct_values)
      : '<span class="small text-muted">—</span>';
  }
  if (autoBtn) autoBtn.disabled = !wizard.distinct_values.length;
}

function runAutoclassify(body, previewHost) {
  if (!wizard.distinct_values.length) {
    window.alert("Seleccione un campo con valores en la tabla.");
    return;
  }
  const existing = normalizeStyleClasses(readStyleClassesFromDom());
  const hasReal =
    existing.length &&
    !(
      existing.length === 2 &&
      existing[0]?.value === "A" &&
      existing[1]?.value === "B"
    );
  if (
    hasReal &&
    !window.confirm(
      "¿Reemplazar las clases actuales por la autoclasificación sugerida?\n\nPodrá ajustar colores y etiquetas después.",
    )
  ) {
    return;
  }
  applyStyleClassesToDom(body, buildClassesFromDistinctValues(wizard.distinct_values), previewHost);
}

function defaultIdentifyFields(cols) {
  const preferred = ["gid", "cvegeo", "cve_mun", "cve_ent", "nomgeo", "nom_loc", "nom_mun", "nombre"];
  const picked = preferred.filter((p) => cols.map((c) => c.toLowerCase()).includes(p));
  return picked.length ? picked : cols.slice(0, Math.min(6, cols.length));
}

function defaultFieldLabel(col) {
  const key = String(col || "").toLowerCase();
  const defaults = {
    gid: "Identificador",
    nombre: "Nombre",
    nomgeo: "Nombre geoestadístico",
    nom_loc: "Localidad",
    nom_mun: "Municipio",
    cvegeo: "Clave geoestadística",
    cve_ent: "Clave entidad",
    cve_mun: "Clave municipio",
    cve_loc: "Clave localidad",
    tipo: "Tipo",
    ent: "Entidad",
  };
  if (defaults[key]) return defaults[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeIdentifyFieldObjects(fields) {
  const list = fields?.length ? fields : [{ column: "gid", label: defaultFieldLabel("gid") }];
  return list
    .map((f) => {
      if (typeof f === "string") {
        const col = f.trim();
        return col ? { column: col, label: defaultFieldLabel(col) } : null;
      }
      if (f && typeof f === "object") {
        const col = String(f.column || f.field || f.name || "").trim();
        if (!col) return null;
        const label = String(f.label || "").trim() || defaultFieldLabel(col);
        return { column: col, label };
      }
      return null;
    })
    .filter(Boolean);
}

/** @deprecated use normalizeIdentifyFieldObjects — solo nombres de columna. */
function normalizeIdentifyFieldNames(fields) {
  return normalizeIdentifyFieldObjects(fields).map((f) => f.column);
}

function identifyFieldsEditorHtml(cols, selected) {
  const map = new Map(normalizeIdentifyFieldObjects(selected).map((f) => [f.column.toLowerCase(), f]));
  return cols
    .map((col) => {
      const saved = map.get(col.toLowerCase());
      const checked = saved ? "checked" : "";
      const labelVal = escapeHtml(saved?.label || defaultFieldLabel(col));
      const disabled = saved ? "" : "disabled";
      return `<div class="visor-admin-identify-row">
        <div class="form-check form-check-sm mb-0">
          <input class="form-check-input visor-admin-idf-check" type="checkbox" id="idf_${escapeHtml(col)}" value="${escapeHtml(col)}" ${checked} />
          <label class="form-check-label small font-monospace" for="idf_${escapeHtml(col)}">${escapeHtml(col)}</label>
        </div>
        <input type="text" class="form-control form-control-sm visor-admin-idf-label" data-for="${escapeHtml(col)}" placeholder="Etiqueta visible" value="${labelVal}" ${disabled} />
      </div>`;
    })
    .join("");
}

function bindIdentifyFieldEditors(root) {
  if (!root) return;
  root.querySelectorAll(".visor-admin-idf-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".visor-admin-identify-row");
      const labelInput = row?.querySelector(".visor-admin-idf-label");
      if (!labelInput) return;
      labelInput.disabled = !cb.checked;
      if (cb.checked && !labelInput.value.trim()) {
        labelInput.value = defaultFieldLabel(cb.value);
      }
    });
  });
}

function readIdentifyFieldsFromDom() {
  const root = document.getElementById("visorAdminIdentifyCols");
  if (!root) return normalizeIdentifyFieldObjects(wizard.identify_fields);
  const out = [];
  root.querySelectorAll(".visor-admin-identify-row").forEach((row) => {
    const cb = row.querySelector(".visor-admin-idf-check");
    if (!cb?.checked) return;
    const col = cb.value;
    const labelInput = row.querySelector(".visor-admin-idf-label");
    const label = labelInput?.value?.trim() || defaultFieldLabel(col);
    out.push({ column: col, label });
  });
  return out;
}

function columnsCheckboxList(id, cols, selected) {
  const sel = new Set(normalizeIdentifyFieldNames(selected).map((c) => c.toLowerCase()));
  return cols
    .map((col) => {
      const checked = sel.has(col.toLowerCase()) ? "checked" : "";
      return `<div class="form-check form-check-sm">
        <input class="form-check-input" type="checkbox" id="${id}_${escapeHtml(col)}" value="${escapeHtml(col)}" ${checked} />
        <label class="form-check-label small" for="${id}_${escapeHtml(col)}">${escapeHtml(col)}</label>
      </div>`;
    })
    .join("");
}

function readCheckedColumns(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return [];
  return [...root.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
}

function defaultLabelMinzoom(geometry) {
  return geometry === "line" ? 16 : 14;
}

function labelFieldOptionsHtml(cols, identifyFields, selected) {
  const fromIdentify = normalizeIdentifyFieldObjects(identifyFields).map((f) => f.column);
  const ordered = [...new Set([...fromIdentify, ...cols])];
  const sel = (selected || "").toLowerCase();
  return ordered
    .map((col) => {
      const picked = col.toLowerCase() === sel ? "selected" : "";
      return `<option value="${escapeHtml(col)}" ${picked}>${escapeHtml(col)}</option>`;
    })
    .join("");
}

function bindLabelsStepUi(root) {
  if (!root) return;
  const enabled = root.querySelector("#visorAdminLabelsEnabled");
  const opts = root.querySelector("#visorAdminLabelsOptions");
  const aboveWrap = root.querySelector("#visorAdminLabelsAboveWrap");
  const sync = () => {
    const on = Boolean(enabled?.checked);
    opts?.classList.toggle("d-none", !on);
    if (aboveWrap) {
      aboveWrap.classList.toggle("d-none", wizard.geometry !== "point");
    }
    if (on) {
      const fieldEl = root.querySelector("#visorAdminLabelsField");
      if (fieldEl && !fieldEl.value) {
        const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields);
        const pick =
          idFields.find((f) => f.column === "nombre")?.column ||
          idFields[0]?.column ||
          wizard.table_columns[0] ||
          "";
        if (pick) fieldEl.value = pick;
      }
    }
  };
  if (enabled) {
    enabled.addEventListener("change", sync);
    sync();
  }
}

function readLabelsFromDom() {
  const enabledEl = document.getElementById("visorAdminLabelsEnabled");
  if (!enabledEl) return;
  wizard.labels_enabled = Boolean(enabledEl.checked);
  if (!wizard.labels_enabled) return;
  wizard.labels_field = document.getElementById("visorAdminLabelsField")?.value?.trim() || "";
  const minz = Number(document.getElementById("visorAdminLabelsMinzoom")?.value);
  wizard.labels_minzoom = Number.isFinite(minz) ? minz : defaultLabelMinzoom(wizard.geometry);
  wizard.labels_above_icon = Boolean(document.getElementById("visorAdminLabelsAboveIcon")?.checked);
  wizard.labels_color =
    document.getElementById("visorAdminLabelsColor")?.value?.trim() || wizard.labels_color;
}

async function renderStepColumns(body) {
  body.innerHTML = '<p class="small text-muted mb-0">Cargando columnas…</p>';
  try {
    if (!wizard.table_columns.length) {
      await loadTableColumns(wizard.table);
    }
    const cols = wizard.table_columns;
    if (!cols.length) {
      body.innerHTML = '<p class="small text-muted mb-0">Sin columnas atributivas para esta tabla.</p>';
      return;
    }
    if (!wizard.identify_fields.length) {
      wizard.identify_fields = defaultIdentifyFields(cols).map((col) => ({
        column: col,
        label: defaultFieldLabel(col),
      }));
    }
    const idTitle = escapeHtml(wizard.identify_title || wizard.label || "");
    const labelMinz = wizard.labels_minzoom ?? defaultLabelMinzoom(wizard.geometry);
    const labelField =
      wizard.labels_field ||
      normalizeIdentifyFieldObjects(wizard.identify_fields).find((f) => f.column === "nombre")?.column ||
      normalizeIdentifyFieldObjects(wizard.identify_fields)[0]?.column ||
      "";
    body.innerHTML = `
      <div class="visor-admin-step-columns">
        <p class="small text-muted mb-2">Elija atributos para el popup de identificación, etiquetas en mapa y exportación KML/SHP.</p>
        <div class="mb-3">
          <label class="form-label small mb-1" for="visorAdminIdentifyTitle">Título del popup (negrita)</label>
          <input type="text" class="form-control form-control-sm" id="visorAdminIdentifyTitle" value="${idTitle}" placeholder="Ej. Red Nacional de Caminos" />
          <div class="form-text">Si lo deja vacío, se usa la etiqueta de la capa en el panel.</div>
        </div>
        <div class="row g-3 visor-admin-cols-grid">
          <div class="col-lg-6 visor-admin-cols-pane">
            <div class="fw-semibold small mb-1">Identificación (clic en mapa)</div>
            <div class="form-text mb-1">Columna técnica → etiqueta visible antes de los dos puntos.</div>
            <div id="visorAdminIdentifyCols" class="visor-admin-cols-list atlas-scroll">${identifyFieldsEditorHtml(cols, wizard.identify_fields)}</div>
          </div>
          <div class="col-lg-6 visor-admin-cols-pane">
            <div class="fw-semibold small mb-1">Exportación KML / SHP</div>
            <div class="form-text mb-1">Si no marca ninguna, se exportan todas las columnas.</div>
            <div id="visorAdminExportCols" class="visor-admin-cols-list atlas-scroll">${columnsCheckboxList("exp", cols, wizard.export_columns)}</div>
          </div>
        </div>
        <div class="visor-admin-labels-block border rounded p-2 mt-3">
          <div class="form-check form-check-sm mb-2">
            <input class="form-check-input" type="checkbox" id="visorAdminLabelsEnabled" ${wizard.labels_enabled ? "checked" : ""} />
            <label class="form-check-label small fw-semibold" for="visorAdminLabelsEnabled">Etiquetas automáticas en el mapa</label>
          </div>
          <div id="visorAdminLabelsOptions" class="${wizard.labels_enabled ? "" : "d-none"}">
            <div class="row g-2 align-items-end">
              <div class="col-sm-5">
                <label class="form-label small mb-1" for="visorAdminLabelsField">Campo del letrerito</label>
                <select class="form-select form-select-sm" id="visorAdminLabelsField">${labelFieldOptionsHtml(cols, wizard.identify_fields, labelField)}</select>
              </div>
              <div class="col-sm-3">
                <label class="form-label small mb-1" for="visorAdminLabelsMinzoom">Zoom mínimo</label>
                <input type="number" class="form-control form-control-sm" id="visorAdminLabelsMinzoom" min="8" max="20" step="0.5" value="${escapeHtml(String(labelMinz))}" />
              </div>
              <div class="col-sm-4">
                <label class="form-label small mb-1" for="visorAdminLabelsColor">Color del texto</label>
                <input type="color" class="form-control form-control-color form-control-sm w-100" id="visorAdminLabelsColor" value="${escapeHtml(wizard.labels_color || "#2c3e50")}" />
              </div>
            </div>
            <div class="form-check form-check-sm mt-2 ${wizard.geometry === "point" ? "" : "d-none"}" id="visorAdminLabelsAboveWrap">
              <input class="form-check-input" type="checkbox" id="visorAdminLabelsAboveIcon" ${wizard.labels_above_icon !== false ? "checked" : ""} />
              <label class="form-check-label small" for="visorAdminLabelsAboveIcon">Mostrar encima del símbolo (puntos)</label>
            </div>
              <p class="form-text mb-0 mt-2">Las etiquetas se dibujan al superar el zoom mínimo configurado.</p>
          </div>
        </div>
      </div>`;
    bindIdentifyFieldEditors(body.querySelector("#visorAdminIdentifyCols"));
    bindLabelsStepUi(body);
  } catch (err) {
    body.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(err?.message || "Error al cargar columnas")}</p>`;
  }
}

function renderStepStyle(body) {
  const showDenue = isDenueTable(wizard.table);
  const classes = normalizeStyleClasses(wizard.style_classes);
  body.innerHTML = `
    <div class="visor-admin-style-step">
      <div class="mb-2">
        <label class="form-label small mb-1">Preset de simbología</label>
        <select class="form-select form-select-sm" id="visorAdminPreset">${presetOptionsHtml()}</select>
        <div class="form-text" id="visorAdminPresetHint">Para colorear por un campo de la tabla, elija un preset del grupo <strong>Por atributo</strong>.</div>
      </div>
      ${showDenue ? `
      <div class="visor-admin-denue-block border rounded p-2 mb-2">
        <div class="fw-semibold small mb-1">Capa DENUE (tabla c_denue)</div>
        <div class="mb-2">
          <label class="form-label small mb-1" for="visorAdminDenuePreset">Plantilla de actividad</label>
          <select class="form-select form-select-sm" id="visorAdminDenuePreset">${denuePresetOptionsHtml(wizard.denue_preset_key)}</select>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-1" for="visorAdminDenueCodigos">Códigos SCIAN (separados por coma)</label>
          <input type="text" class="form-control form-control-sm" id="visorAdminDenueCodigos" value="${escapeHtml((wizard.denue_codigo_act || []).join(", "))}" placeholder="468411, 468412" />
        </div>
        <div class="form-check form-check-sm mb-0">
          <input class="form-check-input" type="checkbox" id="visorAdminDenueTemplate" ${wizard.denue_use_template !== false ? "checked" : ""} />
          <label class="form-check-label small" for="visorAdminDenueTemplate">Popup con plantilla DENUE</label>
        </div>
      </div>` : ""}
      <div class="mb-2" id="visorAdminColorWrap">
        <label class="form-label small mb-1">Color</label>
        <input type="color" class="form-control form-control-color form-control-sm" id="visorAdminColor" value="${escapeHtml(wizard.color)}" />
      </div>
      <div class="mb-2 d-none" id="visorAdminIconWrap">
        <label class="form-label small mb-1">Icono</label>
        <select class="form-select form-select-sm" id="visorAdminIcon">${iconOptionsHtml()}</select>
        <div class="visor-admin-icon-upload border rounded p-2 mt-2">
          <div class="fw-semibold small mb-1">Subir icono SVG</div>
          <div class="row g-2">
            <div class="col-sm-4">
              <label class="form-label small mb-1" for="visorAdminIconKey">Clave (catálogo)</label>
              <input type="text" class="form-control form-control-sm" id="visorAdminIconKey" placeholder="mi_capa_icon" />
            </div>
            <div class="col-sm-4">
              <label class="form-label small mb-1" for="visorAdminIconLabel">Etiqueta</label>
              <input type="text" class="form-control form-control-sm" id="visorAdminIconLabel" placeholder="Mi icono" />
            </div>
            <div class="col-sm-4">
              <label class="form-label small mb-1" for="visorAdminIconFile">Archivo .svg</label>
              <input type="file" class="form-control form-control-sm" id="visorAdminIconFile" accept=".svg,image/svg+xml" />
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="visorAdminIconUploadBtn">Registrar icono</button>
          <div id="visorAdminIconUploadStatus" class="small mt-1 text-muted"></div>
        </div>
      </div>
      <div class="mb-2 d-none" id="visorAdminAttrWrap">
        <label class="form-label small mb-1" for="visorAdminStyleField">Campo de clasificación (MVT)</label>
        <select class="form-select form-select-sm" id="visorAdminStyleField" disabled>
          <option value="">Cargando columnas…</option>
        </select>
        <div id="visorAdminStyleFieldStatus" class="form-text">Consultando columnas de <code>${escapeHtml(wizard.table || "—")}</code>…</div>
        <div id="visorAdminDistinctPanel" class="visor-admin-distinct-panel border rounded p-2 mt-2 d-none">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
            <span class="small fw-semibold mb-0">Valores en la tabla</span>
            <button type="button" class="btn btn-sm btn-primary" id="visorAdminAutoclassifyBtn" disabled>Autoclasificar</button>
          </div>
          <div id="visorAdminDistinctStatus" class="small text-muted mb-1"></div>
          <div id="visorAdminDistinctValues" class="visor-admin-distinct-values atlas-scroll"></div>
        </div>
        <div class="form-text">Valores únicos del atributo → color en mapa y leyenda. Ajuste colores/etiquetas tras autoclasificar.</div>
        <div class="mt-2">
          <label class="form-label small mb-1">Color por defecto (otros valores)</label>
          <input type="color" class="form-control form-control-color form-control-sm" id="visorAdminDefaultColor" value="${escapeHtml(wizard.default_color || "#94a3b8")}" />
        </div>
        <div class="fw-semibold small mt-2 mb-1">Clases valor / color</div>
        <div id="visorAdminStyleClasses" class="visor-admin-class-list">${styleClassRowsHtml(classes)}</div>
        <button type="button" class="btn btn-sm btn-outline-secondary mt-1" id="visorAdminAddClass">+ Agregar clase</button>
      </div>
      <div class="visor-admin-style-preview border rounded p-1 mt-2">
        <div class="small text-muted px-1 pt-1">Vista previa</div>
        <div id="visorAdminStylePreviewHost"></div>
      </div>
    </div>`;
  const presetEl = body.querySelector("#visorAdminPreset");
  const previewHost = body.querySelector("#visorAdminStylePreviewHost");
  const syncPresetUi = async () => {
    const preset = presetEl?.value || wizard.style_preset;
    wizard.style_preset = preset;
    const isSymbol = preset === "point_symbol";
    const isAttr = isByAttributePreset(preset);
    body.querySelector("#visorAdminIconWrap")?.classList.toggle("d-none", !isSymbol);
    body.querySelector("#visorAdminColorWrap")?.classList.toggle("d-none", isSymbol || isAttr);
    body.querySelector("#visorAdminAttrWrap")?.classList.toggle("d-none", !isAttr);
    body.querySelector("#visorAdminPresetHint")?.classList.toggle("d-none", isAttr);
    const opt = presetEl?.selectedOptions?.[0];
    if (opt?.dataset.geometry) {
      wizard.geometry = opt.dataset.geometry;
    }
    if (isAttr) {
      const fieldEl = body.querySelector("#visorAdminStyleField");
      if (fieldEl && !wizard.table_columns.length) {
        fieldEl.disabled = true;
        fieldEl.innerHTML = `<option value="">Cargando columnas…</option>`;
      }
      await ensureTableColumnsLoaded();
      if (fieldEl) fieldEl.disabled = false;
      refreshStyleFieldSelect(body, wizard.style_field);
      if (wizard.style_field) {
        await loadDistinctFieldPanel(body, previewHost);
      }
    }
    refreshStylePreview(previewHost);
  };
  if (presetEl) {
    presetEl.value = wizard.style_preset;
    presetEl.addEventListener("change", () => void syncPresetUi());
  }
  const iconEl = body.querySelector("#visorAdminIcon");
  if (iconEl && wizard.icon_key) iconEl.value = wizard.icon_key;
  iconEl?.addEventListener("change", () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminColor")?.addEventListener("input", () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminDefaultColor")?.addEventListener("input", () => refreshStylePreview(previewHost));
  bindStyleClassEditor(body.querySelector("#visorAdminAttrWrap"), () => refreshStylePreview(previewHost));
  body.querySelector("#visorAdminStyleField")?.addEventListener("change", () => {
    void loadDistinctFieldPanel(body, previewHost);
  });
  body.querySelector("#visorAdminAutoclassifyBtn")?.addEventListener("click", () => {
    runAutoclassify(body, previewHost);
  });
  body.querySelector("#visorAdminIconUploadBtn")?.addEventListener("click", () => void uploadIconFromStyleStep(body));
  body.querySelector("#visorAdminDenuePreset")?.addEventListener("change", (ev) => {
    const key = ev.target.value;
    if (key) applyDenuePreset(key);
    const codigosEl = body.querySelector("#visorAdminDenueCodigos");
    if (codigosEl) codigosEl.value = (wizard.denue_codigo_act || []).join(", ");
    if (presetEl) presetEl.value = wizard.style_preset;
    if (iconEl && wizard.icon_key) iconEl.value = wizard.icon_key;
    syncPresetUi();
  });
  void syncPresetUi();
}

function renderStepReview(body) {
  const exports = [];
  if (wizard.export_kml) exports.push("KML");
  if (wizard.export_shp) exports.push("SHP");
  const layerId =
    wizard.mode === "edit"
      ? wizard.editingLayerId
      : document.getElementById("visorAdminLayerId")?.value || layerIdFromTable(wizard.table);
  const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields);
  const idf =
    idFields.map((f) => (f.label !== f.column ? `${f.label} (${f.column})` : f.label)).join(", ") || "gid";
  const idTitle = (wizard.identify_title || wizard.label || "").trim();
  const exp =
    wizard.export_columns.length > 0 ? wizard.export_columns.join(", ") : "Todas las columnas";
  const labelsSummary = wizard.labels_enabled
    ? `${wizard.labels_field || "—"} (zoom ≥ ${wizard.labels_minzoom ?? defaultLabelMinzoom(wizard.geometry)})`
    : "Desactivadas";
  const styleSummary = isByAttributePreset(wizard.style_preset)
    ? `${wizard.style_preset} · ${wizard.style_field || "—"} (${normalizeStyleClasses(wizard.style_classes).length} clases)`
    : document.getElementById("visorAdminPreset")?.value || wizard.style_preset;
  const denueSummary = isDenueTable(wizard.table)
    ? `${(wizard.denue_codigo_act || []).join(", ") || "—"}${wizard.denue_use_template !== false ? " · plantilla DENUE" : ""}`
    : null;
  body.innerHTML = `
    <dl class="small mb-2 visor-admin-review">
      <dt>Tabla</dt><dd>${escapeHtml(wizard.table)}</dd>
      <dt>Capa</dt><dd>${escapeHtml(layerId)}</dd>
      <dt>Etiqueta</dt><dd>${escapeHtml(document.getElementById("visorAdminLabel")?.value || wizard.label || "")}</dd>
      <dt>Preset</dt><dd>${escapeHtml(styleSummary)}</dd>
      ${denueSummary ? `<dt>DENUE</dt><dd>${escapeHtml(denueSummary)}</dd>` : ""}
      <dt>Alcance</dt><dd>${wizard.mun_scope === "estatal" ? "Estatal" : "Municipal"}</dd>
      <dt>Título popup</dt><dd>${escapeHtml(idTitle || "—")}</dd>
      <dt>Identify</dt><dd>${escapeHtml(idf)}</dd>
      <dt>Etiquetas mapa</dt><dd>${escapeHtml(labelsSummary)}</dd>
      <dt>Export cols</dt><dd>${escapeHtml(exp)}</dd>
      <dt>Exportación</dt><dd>${exports.length ? exports.join(", ") : "Ninguna"}</dd>
    </dl>
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="visorAdminExpKml" ${wizard.export_kml ? "checked" : ""} />
      <label class="form-check-label small" for="visorAdminExpKml">KML</label>
    </div>
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="visorAdminExpShp" ${wizard.export_shp ? "checked" : ""} />
      <label class="form-check-label small" for="visorAdminExpShp">SHP</label>
    </div>
    <div id="visorAdminStatus" class="small mt-2 text-danger" hidden></div>
    ${wizard.martin_needs_restart ? `<div class="alert alert-warning py-2 px-2 small mb-0">Recuerde reiniciar Martin si la tabla es nueva: <code>docker compose restart martin</code></div>` : ""}`;
}

function readStepFields() {
  wizard.label = document.getElementById("visorAdminLabel")?.value?.trim() || wizard.label;
  wizard.group_id = document.getElementById("visorAdminGroup")?.value || wizard.group_id;
  wizard.geometry = document.getElementById("visorAdminGeometry")?.value || wizard.geometry;
  wizard.style_preset = document.getElementById("visorAdminPreset")?.value || wizard.style_preset;
  wizard.color = document.getElementById("visorAdminColor")?.value || wizard.color;
  wizard.icon_key = document.getElementById("visorAdminIcon")?.value || wizard.icon_key;
  if (document.getElementById("visorAdminStyleField")) {
    wizard.style_field = document.getElementById("visorAdminStyleField")?.value?.trim() || "";
    wizard.default_color =
      document.getElementById("visorAdminDefaultColor")?.value?.trim() || wizard.default_color;
    wizard.style_classes = readStyleClassesFromDom();
  }
  if (document.getElementById("visorAdminDenueCodigos")) {
    const raw = document.getElementById("visorAdminDenueCodigos")?.value || "";
    wizard.denue_codigo_act = raw
      .split(/[,;\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    wizard.denue_use_template = Boolean(document.getElementById("visorAdminDenueTemplate")?.checked);
    wizard.denue_preset_key = document.getElementById("visorAdminDenuePreset")?.value || "";
  }
  wizard.export_kml = Boolean(document.getElementById("visorAdminExpKml")?.checked);
  wizard.export_shp = Boolean(document.getElementById("visorAdminExpShp")?.checked);
  const scopeEl = document.getElementById("visorAdminMunScope");
  if (scopeEl) wizard.mun_scope = scopeEl.value === "estatal" ? "estatal" : "municipio";
  if (document.getElementById("visorAdminIdentifyTitle")) {
    wizard.identify_title = document.getElementById("visorAdminIdentifyTitle")?.value?.trim() || "";
  }
  if (document.getElementById("visorAdminIdentifyCols")) {
    wizard.identify_fields = readIdentifyFieldsFromDom();
  }
  if (document.getElementById("visorAdminExportCols")) {
    wizard.export_columns = readCheckedColumns("visorAdminExportCols");
  }
  readLabelsFromDom();
}

function buildPayload() {
  readStepFields();
  const layerId =
    wizard.mode === "edit"
      ? wizard.editingLayerId
      : document.getElementById("visorAdminLayerId")?.value?.trim() || layerIdFromTable(wizard.table);
  const style = {};
  if (isByAttributePreset(wizard.style_preset)) {
    style.field = wizard.style_field;
    style.default_color = wizard.default_color || "#94a3b8";
    style.classes = normalizeStyleClasses(wizard.style_classes);
  } else if (wizard.style_preset === "point_symbol") {
    style.icon_key = wizard.icon_key || (_meta?.icons?.[0]?.key ?? "");
  } else if (wizard.style_preset === "line_outline") {
    style.color = wizard.color;
    style.halo_color = wizard.color;
    style.width = 2;
    style.halo_width = 4;
  } else if (wizard.style_preset === "line_simple") {
    style.color = wizard.color;
    style.width = 2;
  } else if (wizard.style_preset === "polygon_fill") {
    style.color = wizard.color;
    style.opacity = 0.6;
  } else {
    style.color = wizard.color;
  }
  const exportFormats = [];
  if (wizard.export_kml) exportFormats.push("kml");
  if (wizard.export_shp) exportFormats.push("shp");
  const data = {
    table: wizard.table,
    mun_filter: wizard.mun_scope === "estatal" ? false : "cve_mun",
  };
  if (wizard.export_columns.length) data.export_columns = wizard.export_columns;
  const idFields = normalizeIdentifyFieldObjects(wizard.identify_fields);
  const idTitle = (wizard.identify_title || wizard.label || layerId).trim();
  const payload = {
    layer_id: layerId,
    label: wizard.label || layerId,
    group_id: wizard.group_id || _meta?.groups?.[0]?.id || "servicios",
    geometry: wizard.geometry,
    style_preset: wizard.style_preset,
    style,
    data,
    capabilities: { export: exportFormats, tabular: false, spatial_analysis: false },
  };
  const useDenueTemplate =
    isDenueTable(wizard.table) && wizard.denue_use_template !== false && wizard.denue_codigo_act.length;
  if (!useDenueTemplate) {
    payload.identify = {
      title: idTitle,
      fields: idFields.length ? idFields : [{ column: "gid", label: defaultFieldLabel("gid") }],
    };
  } else {
    payload.identify = { title: idTitle, fields: [] };
  }
  if (wizard.labels_enabled && wizard.labels_field) {
    payload.labels = {
      enabled: true,
      field: wizard.labels_field,
      minzoom: wizard.labels_minzoom ?? defaultLabelMinzoom(wizard.geometry),
      above_icon: wizard.labels_above_icon !== false,
      color: wizard.labels_color || "#2c3e50",
    };
  }
  if (isDenueTable(wizard.table) && wizard.denue_codigo_act.length) {
    payload.denue = {
      codigo_act: wizard.denue_codigo_act,
      use_template: wizard.denue_use_template !== false,
    };
  }
  return payload;
}

async function renderWizardStep() {
  const modal = ensureModal();
  const body = modal.querySelector(".visor-admin-modal__body");
  const panel = modal.querySelector(".visor-admin-modal__panel");
  const btnPrev = modal.querySelector('[data-act="prev"]');
  const btnNext = modal.querySelector('[data-act="next"]');
  if (!body || !btnPrev || !btnNext) return;

  const max = wizardMaxStep();
  const onColumns =
    (wizard.mode === "edit" && wizard.step === 2) ||
    (wizard.mode === "create" && wizard.step === 3);
  const onStyle =
    (wizard.mode === "edit" && wizard.step === 1) ||
    (wizard.mode === "create" && wizard.step === 2);
  panel?.classList.toggle("visor-admin-modal__panel--wide", onColumns);
  panel?.classList.toggle("visor-admin-modal__panel--columns", onColumns);
  panel?.classList.toggle("visor-admin-modal__panel--style", onStyle);
  body?.classList.toggle("visor-admin-modal__body--columns", onColumns);
  btnPrev.classList.toggle("invisible", wizard.step === 0);
  btnNext.textContent = wizard.step >= max ? (wizard.mode === "edit" ? "Guardar" : "Publicar") : "Siguiente";

  if (wizard.mode === "edit") {
    if (wizard.step === 0) renderStepDetails(body);
    else if (wizard.step === 1) renderStepStyle(body);
    else if (wizard.step === 2) await renderStepColumns(body);
    else renderStepReview(body);
  } else if (wizard.step === 0) await renderStepTables(body);
  else if (wizard.step === 1) renderStepDetails(body);
  else if (wizard.step === 2) renderStepStyle(body);
  else if (wizard.step === 3) await renderStepColumns(body);
  else renderStepReview(body);

  modal.classList.remove("d-none");
}

async function saveLayer() {
  const payload = buildPayload();
  const status = document.getElementById("visorAdminStatus");
  const isEdit = wizard.mode === "edit";
  const url = isEdit
    ? `/api/visor/admin/layers/${encodeURIComponent(wizard.editingLayerId)}`
    : "/api/visor/admin/layers";
  const { res, data } = await adminFetch(url, {
    method: isEdit ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = apiErrorMessage(data, isEdit ? "No se pudo actualizar la capa" : "No se pudo publicar la capa");
    if (status) {
      status.hidden = false;
      status.textContent = String(msg);
    } else {
      window.alert(String(msg));
    }
    return;
  }
  closeModal();
  await reloadVisorLayerCatalog();
  document.dispatchEvent(new CustomEvent("atlasgro-visor-layers-panel-refresh"));
  window.alert(data?.message || (isEdit ? "Capa actualizada. Recargue el visor (Ctrl+F5)." : "Capa publicada. Recargue el visor (Ctrl+F5)."));
}

async function publishLayer() {
  await saveLayer();
}

async function ensureAdminSession() {
  if (!isVisorAdminLoggedIn()) {
    window.location.href = "./visor-studio.html";
    return false;
  }
  const user = await verifyAdminSession();
  if (!user) {
    window.alert(
      "No se pudo validar la sesión admin.\n\n" +
        "1) Reinicie nginx: docker compose restart nginx_proxy api_backend\n" +
        "2) Vuelva a entrar en visor-studio.html",
    );
    window.location.href = "./visor-studio.html";
    return false;
  }
  return true;
}

function bindWizardNav() {
  const modal = ensureModal();
  const btnNext = modal.querySelector('[data-act="next"]');
  const btnPrev = modal.querySelector('[data-act="prev"]');
  btnNext.onclick = async () => {
    const max = wizardMaxStep();
    if (wizard.step < max) {
      if (wizard.mode === "create" && wizard.step === 0) {
        if (wizard.table_source === "shp" && !wizard.shp_uploaded) {
          window.alert("Importe el shapefile antes de continuar.");
          return;
        }
        if (!wizard.table) {
          window.alert("Seleccione o importe una tabla.");
          return;
        }
      }
      if (wizard.step > 0 || wizard.mode === "edit") readStepFields();
      wizard.step += 1;
      await renderWizardStep();
      return;
    }
    await saveLayer();
  };
  btnPrev.onclick = async () => {
    if (wizard.step > 0) {
      readStepFields();
      wizard.step -= 1;
      await renderWizardStep();
    }
  };
}

async function openWizard() {
  if (!(await ensureAdminSession())) return;
  try {
    await loadMeta();
    resetWizardForCreate();
    setModalTitle("Publicar capa en el visor");
    await renderWizardStep();
    bindWizardNav();
  } catch (err) {
    console.error("[visor-admin]", err);
    window.alert(err?.message || "No se pudo abrir el asistente");
  }
}

async function openEditWizard(layerId) {
  if (!(await ensureAdminSession())) return;
  try {
    await loadMeta();
    const { res, data } = await adminFetch(
      `/api/visor/admin/layers/${encodeURIComponent(layerId)}`,
    );
    if (!res?.ok) throw new Error(apiErrorMessage(data, "No se pudo cargar la capa"));
    wizard.mode = "edit";
    wizard.editingLayerId = data.layer_id;
    wizard.step = 0;
    wizard.table = data.data?.table || "";
    wizard.label = data.label || "";
    wizard.group_id = data.group_id || _meta?.groups?.[0]?.id || "servicios";
    wizard.geometry = data.geometry || "polygon";
    wizard.style_preset = data.style_preset || "line_outline";
    wizard.color = data.style?.color || "#8c5f37";
    wizard.icon_key = data.style?.icon_key || "";
    wizard.style_field = data.style?.field || "";
    wizard.default_color = data.style?.default_color || "#94a3b8";
    wizard.style_classes = normalizeStyleClasses(data.style?.classes);
    const denue = data.denue || {};
    wizard.denue_codigo_act = [...(denue.codigo_act || [])];
    wizard.denue_use_template = denue.use_template !== false;
    wizard.denue_preset_key =
      DENUE_CATALOG_PRESETS.find(
        (p) => JSON.stringify(p.codigo_act) === JSON.stringify(wizard.denue_codigo_act),
      )?.key || "";
    const caps = data.capabilities?.export || [];
    wizard.export_kml = caps.includes("kml");
    wizard.export_shp = caps.includes("shp");
    wizard.mun_scope = data.data?.mun_filter === false ? "estatal" : "municipio";
    wizard.identify_fields = normalizeIdentifyFieldObjects(data.identify?.fields);
    wizard.identify_title = data.identify?.title || data.label || "";
    const lb = data.labels || {};
    wizard.labels_enabled = Boolean(lb.enabled && lb.field);
    wizard.labels_field = lb.field || "";
    wizard.labels_minzoom = lb.minzoom ?? defaultLabelMinzoom(data.geometry || "point");
    wizard.labels_above_icon = lb.above_icon !== false;
    wizard.labels_color = lb.color || "#2c3e50";
    wizard.export_columns = [...(data.data?.export_columns || [])];
    wizard.table_columns = [];
    wizard.columns_load_error = "";
    if (wizard.table) {
      await ensureTableColumnsLoaded();
    }
    setModalTitle(`Editar capa: ${data.label || layerId}`);
    await renderWizardStep();
    bindWizardNav();
  } catch (err) {
    console.error("[visor-admin]", err);
    window.alert(err?.message || "No se pudo abrir el editor");
  }
}

async function unpublishLayer(layerId, label) {
  if (
    !window.confirm(
      `¿Despublicar "${label}" del catálogo?\n\nLa capa dejará de aparecer en el visor.`,
    )
  ) {
    return;
  }
  const { res, data } = await adminFetch(
    `/api/visor/admin/layers/${encodeURIComponent(layerId)}`,
    { method: "DELETE" },
  );
  if (!res?.ok) {
    window.alert(apiErrorMessage(data, "No se pudo despublicar la capa"));
    return;
  }
  await reloadVisorLayerCatalog();
  document.dispatchEvent(new CustomEvent("atlasgro-visor-layers-panel-refresh"));
  window.alert(data?.message || "Capa despublicada.");
}

async function renderManageList(body) {
  body.innerHTML = '<p class="small text-muted mb-0">Cargando capas…</p>';
  const { res, data } = await adminFetch("/api/visor/admin/layers");
  if (!res?.ok) {
    body.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(apiErrorMessage(data, "No se pudo listar capas"))}</p>`;
    return;
  }
  const layers = data?.layers || [];
  if (!layers.length) {
    body.innerHTML =
      '<p class="small text-muted mb-0">No hay capas publicadas desde Visor Studio. Use el botón <strong>+</strong> para agregar una.</p>';
    return;
  }
  body.innerHTML = `
    <p class="small text-muted mb-2">Capas publicadas con Visor Studio. Solo estas se pueden editar o despublicar.</p>
    <ul class="list-group list-group-flush visor-admin-manage-list">
      ${layers
        .map(
          (layer) => `
        <li class="list-group-item px-0 py-2 d-flex align-items-start justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold small">${escapeHtml(layer.label)}</div>
            <div class="text-muted small"><code>${escapeHtml(layer.layer_id)}</code> · ${escapeHtml(layer.table || "")}</div>
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button type="button" class="btn btn-sm btn-outline-primary" data-edit="${escapeHtml(layer.layer_id)}">Editar</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-delete="${escapeHtml(layer.layer_id)}" data-label="${escapeHtml(layer.label)}">Quitar</button>
          </div>
        </li>`,
        )
        .join("")}
    </ul>`;
  body.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeModal();
      void openEditWizard(btn.getAttribute("data-edit"));
    });
  });
  body.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void unpublishLayer(btn.getAttribute("data-delete"), btn.getAttribute("data-label")).then(
        () => void openManageModal(),
      );
    });
  });
}

async function openManageModal() {
  if (!(await ensureAdminSession())) return;
  try {
    await loadMeta();
    const modal = ensureModal();
    setModalTitle("Gestionar capas publicadas");
    modal.querySelector(".visor-admin-modal__panel")?.classList.remove("visor-admin-modal__panel--wide");
    modal.querySelector('[data-act="prev"]')?.classList.add("invisible");
    const btnNext = modal.querySelector('[data-act="next"]');
    if (btnNext) {
      btnNext.textContent = "Cerrar";
      btnNext.onclick = () => closeModal();
    }
    modal.querySelector('[data-act="prev"]').onclick = null;
    const body = modal.querySelector(".visor-admin-modal__body");
    if (body) await renderManageList(body);
    modal.classList.remove("d-none");
  } catch (err) {
    console.error("[visor-admin]", err);
    window.alert(err?.message || "No se pudo abrir el gestor");
  }
}

function ensureManageButton() {
  const toolbar = ensureVisorLayersHeaderToolbar();
  if (!toolbar) return null;
  let btn = toolbar.querySelector("#visorCatalogAdminManageBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "visorCatalogAdminManageBtn";
    btn.className = "btn btn-sm visor-admin-manage-btn d-none";
    btn.title = "Gestionar capas publicadas (admin)";
    btn.setAttribute("aria-label", "Gestionar capas del catálogo");
    btn.innerHTML = MANAGE_ICON;
    btn.addEventListener("click", () => void openManageModal());
    const publishBtn = toolbar.querySelector("#visorCatalogAdminPublishBtn");
    if (publishBtn?.nextSibling) toolbar.insertBefore(btn, publishBtn.nextSibling);
    else toolbar.appendChild(btn);
  }
  _manageBtn = btn;
  return btn;
}

function ensurePublishButton() {
  const toolbar = ensureVisorLayersHeaderToolbar();
  if (!toolbar) return null;
  let btn = toolbar.querySelector("#visorCatalogAdminPublishBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "visorCatalogAdminPublishBtn";
    btn.className = "btn btn-sm visor-admin-publish-btn d-none";
    btn.title = "Agregar capa al catálogo (admin)";
    btn.setAttribute("aria-label", "Agregar capa al visor");
    btn.innerHTML = PUBLISH_ICON;
    btn.addEventListener("click", () => void openWizard());
    const clearBtn = toolbar.querySelector("#visorClearLayersBtn");
    if (clearBtn) toolbar.insertBefore(btn, clearBtn);
    else toolbar.appendChild(btn);
  }
  _publishBtn = btn;
  syncPublishButton();
  return btn;
}

function onVisorLayersPanelRefresh() {
  refreshVisorCatalogAdmin();
}

function onVisorLayoutActive() {
  refreshVisorCatalogAdmin();
}

export function attachVisorCatalogAdmin() {
  if (_attached) {
    refreshVisorCatalogAdmin();
    return;
  }
  _attached = true;
  document.addEventListener("atlasgro-visor-layers-panel-refresh", onVisorLayersPanelRefresh);
  document.addEventListener("atlasgro-visor-layout-active", onVisorLayoutActive);
  document.addEventListener("atlasgro-visor-admin-auth-change", syncAdminButtons);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initAdminUi(), { once: true });
  } else {
    initAdminUi();
  }
}

function initAdminUi() {
  ensurePublishButton();
  ensureManageButton();
  syncAdminButtons();
}

export function refreshVisorCatalogAdmin() {
  ensurePublishButton();
  ensureManageButton();
  syncAdminButtons();
}

export function teardownVisorCatalogAdmin() {
  document.removeEventListener("atlasgro-visor-layers-panel-refresh", onVisorLayersPanelRefresh);
  document.removeEventListener("atlasgro-visor-layout-active", onVisorLayoutActive);
  document.removeEventListener("atlasgro-visor-admin-auth-change", syncAdminButtons);
  _attached = false;
  _publishBtn?.remove();
  _publishBtn = null;
  _manageBtn?.remove();
  _manageBtn = null;
  _modalEl?.remove();
  _modalEl = null;
}
