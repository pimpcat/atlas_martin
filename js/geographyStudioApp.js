/**
 * Geography Studio — administración del catálogo de Datos Geográficos.
 * Reutiliza la sesión JWT de Visor Studio (visorAdminAuth.js).
 */
import {
  adminFetch,
  clearAdminSession,
  getAdminUser,
  isVisorAdminLoggedIn,
  loginAdmin,
  verifyAdminSession,
} from "./visorAdminAuth.js";
import { mountStudioNav, studioLoginFooterHtml } from "./studioNav.js";

const $ = (id) => document.getElementById(id);

let _meta = null;
let _catalog = null;
let _editingId = null;
let _isNew = false;
let _columnsCache = new Map();

function showErr(el, msg) {
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

function setMsg(el, msg, ok = true) {
  if (!el) return;
  el.textContent = msg || "";
  el.className = `small ${ok ? "text-success" : "text-danger"}`;
}

function showLogin(show) {
  $("geoStudioLoginView")?.classList.toggle("d-none", !show);
  $("geoStudioDashboard")?.classList.toggle("d-none", show);
}

async function loadMetaAndCatalog() {
  const metaRes = await adminFetch("/api/geography-context/admin/meta");
  if (!metaRes.res?.ok) {
    throw new Error(metaRes.data?.detail?.message || metaRes.data?.message || "No se pudo cargar meta");
  }
  _meta = metaRes.data;
  const catRes = await adminFetch("/api/geography-context/admin/catalog");
  if (!catRes.res?.ok) {
    throw new Error(catRes.data?.detail?.message || catRes.data?.message || "No se pudo cargar catálogo");
  }
  _catalog = JSON.parse(JSON.stringify(catRes.data.catalog || {}));
  fillMenuFields();
  fillTableSelect();
  renderList();
}

function fillMenuFields() {
  const menu = _catalog?.menu || {};
  const layout = _catalog?.layout || {};
  if ($("geoMenuLabel")) $("geoMenuLabel").value = menu.label || "";
  if ($("geoMenuSubtitle")) $("geoMenuSubtitle").value = menu.subtitle || "";
  if ($("geoMenuSection")) $("geoMenuSection").value = menu.section_label || "";
  if ($("geoLayoutMacro")) $("geoLayoutMacro").checked = layout.macro_map !== false;
}

function readMenuFieldsIntoCatalog() {
  if (!_catalog) return;
  _catalog.menu = {
    ...(_catalog.menu || {}),
    id: (_catalog.menu && _catalog.menu.id) || "geo_datos_geo",
    label: $("geoMenuLabel")?.value?.trim() || "Datos Geográficos",
    subtitle: $("geoMenuSubtitle")?.value?.trim() || "",
    section_id: (_catalog.menu && _catalog.menu.section_id) || "geo",
    section_label: $("geoMenuSection")?.value?.trim() || "Geografía",
  };
  _catalog.layout = {
    ...(_catalog.layout || {}),
    macro_map: Boolean($("geoLayoutMacro")?.checked),
    detail_map_lock: (_catalog.layout && _catalog.layout.detail_map_lock) !== false,
  };
}

function fillTableSelect() {
  const sel = $("fTextTable");
  if (!sel) return;
  const tables = _meta?.tables || [];
  sel.innerHTML = tables
    .map((t) => `<option value="${escapeAttr(t.table)}">${escapeHtml(t.label || t.table)}</option>`)
    .join("");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#039;");
}

function sortedTabs() {
  return (_catalog?.tabs || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.label || "").localeCompare(String(b.label || "")));
}

function renderList() {
  const root = $("geoStudioList");
  if (!root) return;
  const tabs = sortedTabs();
  if (!tabs.length) {
    root.innerHTML = `<p class="small text-muted p-2 mb-0">Sin pestañas.</p>`;
    return;
  }
  root.innerHTML = tabs
    .map((t, idx) => {
      const active = t.id === _editingId ? " active" : "";
      const off = t.enabled === false ? " text-muted" : "";
      return `<div class="list-group-item list-group-item-action d-flex align-items-center gap-1 py-2 px-2${active}" data-tab-id="${escapeAttr(t.id)}">
        <div class="flex-grow-1${off}">
          <div class="small fw-semibold">${escapeHtml(t.label || t.id)}</div>
          <div class="text-muted" style="font-size:0.7rem">${escapeHtml(t.id)} · orden ${t.order ?? "—"}</div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1" data-move="up" data-idx="${idx}" title="Subir">↑</button>
        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1" data-move="down" data-idx="${idx}" title="Bajar">↓</button>
      </div>`;
    })
    .join("");

  root.querySelectorAll("[data-tab-id]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-move]")) return;
      openTab(el.getAttribute("data-tab-id"));
    });
  });
  root.querySelectorAll("[data-move]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      moveTab(Number(btn.getAttribute("data-idx")), btn.getAttribute("data-move"));
    });
  });
}

function moveTab(idx, dir) {
  const tabs = sortedTabs();
  const j = dir === "up" ? idx - 1 : idx + 1;
  if (j < 0 || j >= tabs.length) return;
  const a = tabs[idx];
  const b = tabs[j];
  const oa = a.order ?? (idx + 1) * 10;
  const ob = b.order ?? (j + 1) * 10;
  a.order = ob;
  b.order = oa;
  _catalog.tabs = (_catalog.tabs || []).map((t) => {
    if (t.id === a.id) return a;
    if (t.id === b.id) return b;
    return t;
  });
  renderList();
  setMsg($("geoStudioPublishMsg"), "Orden cambiado (borrador). Publique para aplicar.", true);
}

async function loadColumns(table) {
  if (!table) return [];
  if (_columnsCache.has(table)) return _columnsCache.get(table);
  const { res, data } = await adminFetch(
    `/api/geography-context/admin/tables/${encodeURIComponent(table)}/columns`
  );
  if (!res?.ok) throw new Error(data?.detail?.message || "No se pudieron leer columnas");
  const cols = data.columns || [];
  _columnsCache.set(table, cols);
  return cols;
}

async function fillFieldSelect(table, selected) {
  const sel = $("fTextField");
  if (!sel) return;
  sel.innerHTML = `<option value="">Cargando…</option>`;
  try {
    const cols = await loadColumns(table);
    sel.innerHTML = cols
      .map(
        (c) =>
          `<option value="${escapeAttr(c.name)}" ${c.name === selected ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.data_type)})</option>`
      )
      .join("");
  } catch (err) {
    sel.innerHTML = `<option value="">Error: ${escapeHtml(err.message)}</option>`;
  }
}

function renderLayersBox(selected) {
  const box = $("fLayersBox");
  if (!box) return;
  const layers = _meta?.visor_layers || [];
  const sel = new Set((selected || []).map((x) => String(x)));
  if (!layers.length) {
    box.innerHTML = `<p class="small text-muted mb-0">No hay capas en Visor Catalog.</p>`;
    return;
  }
  box.innerHTML = layers
    .map((L) => {
      const badge = L.legacy
        ? `<span class="badge text-bg-secondary ms-1">Núcleo</span>`
        : `<span class="badge text-bg-success ms-1">Studio</span>`;
      return `<div class="form-check">
        <input class="form-check-input" type="checkbox" value="${escapeAttr(L.layer_id)}" id="ly_${escapeAttr(L.layer_id)}" ${sel.has(L.layer_id) ? "checked" : ""} />
        <label class="form-check-label small" for="ly_${escapeAttr(L.layer_id)}">${escapeHtml(L.label || L.layer_id)}${badge}</label>
      </div>`;
    })
    .join("");
}

function readSelectedLayers() {
  return [...($("fLayersBox")?.querySelectorAll("input:checked") || [])].map((el) => el.value);
}

function showForm(show) {
  $("geoStudioFormEmpty")?.classList.toggle("d-none", show);
  $("geoStudioForm")?.classList.toggle("d-none", !show);
}

async function openTab(tabId) {
  const tab = (_catalog.tabs || []).find((t) => t.id === tabId);
  if (!tab) return;
  _editingId = tabId;
  _isNew = false;
  showForm(true);
  renderList();
  const idEl = $("fTabId");
  if (idEl) {
    idEl.value = tab.id;
    idEl.readOnly = true;
  }
  if ($("fTabLabel")) $("fTabLabel").value = tab.label || "";
  if ($("fTabOrder")) $("fTabOrder").value = tab.order ?? 10;
  if ($("fTabEnabled")) $("fTabEnabled").value = tab.enabled === false ? "false" : "true";
  const table = tab.text?.table || "c_contexto";
  if ($("fTextTable")) $("fTextTable").value = table;
  if ($("fTextKey")) $("fTextKey").value = tab.text?.key_column || "cve_mun";
  if ($("fShowLegend")) $("fShowLegend").checked = Boolean(tab.show_legend);
  await fillFieldSelect(table, tab.text?.field || "");
  renderLayersBox(tab.layers || []);
  setMsg($("geoStudioFormMsg"), "");
}

function openNew() {
  _editingId = null;
  _isNew = true;
  showForm(true);
  renderList();
  const idEl = $("fTabId");
  if (idEl) {
    idEl.value = "";
    idEl.readOnly = false;
  }
  if ($("fTabLabel")) $("fTabLabel").value = "";
  if ($("fTabOrder")) {
    const maxOrder = Math.max(0, ...(_catalog.tabs || []).map((t) => Number(t.order) || 0));
    $("fTabOrder").value = maxOrder + 10;
  }
  if ($("fTabEnabled")) $("fTabEnabled").value = "true";
  const defaultTable = (_meta?.tables || []).some((t) => t.table === "c_contexto")
    ? "c_contexto"
    : (_meta?.tables || [])[0]?.table || "";
  if ($("fTextTable")) $("fTextTable").value = defaultTable;
  if ($("fTextKey")) $("fTextKey").value = "cve_mun";
  if ($("fShowLegend")) $("fShowLegend").checked = false;
  void fillFieldSelect(defaultTable, "");
  renderLayersBox([]);
  setMsg($("geoStudioFormMsg"), "");
}

function saveTabDraft(ev) {
  ev.preventDefault();
  const id = $("fTabId")?.value?.trim() || "";
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    setMsg($("geoStudioFormMsg"), "Identificador inválido.", false);
    return;
  }
  const entry = {
    id,
    label: $("fTabLabel")?.value?.trim() || id,
    enabled: $("fTabEnabled")?.value !== "false",
    order: Number($("fTabOrder")?.value || 10),
    text: {
      table: $("fTextTable")?.value?.trim() || "",
      field: $("fTextField")?.value?.trim() || "",
      key_column: $("fTextKey")?.value?.trim() || "cve_mun",
    },
    layers: readSelectedLayers(),
    show_legend: Boolean($("fShowLegend")?.checked),
  };
  if (!entry.text.table || !entry.text.field) {
    setMsg($("geoStudioFormMsg"), "Tabla y campo de texto son obligatorios.", false);
    return;
  }
  if (!_catalog.tabs) _catalog.tabs = [];
  const idx = _catalog.tabs.findIndex((t) => t.id === id);
  if (_isNew && idx >= 0) {
    setMsg($("geoStudioFormMsg"), "Ya existe una pestaña con ese id.", false);
    return;
  }
  if (!_isNew && _editingId && _editingId !== id) {
    setMsg($("geoStudioFormMsg"), "No se puede cambiar el id de una pestaña existente.", false);
    return;
  }
  if (idx >= 0) _catalog.tabs[idx] = entry;
  else _catalog.tabs.push(entry);
  _editingId = id;
  _isNew = false;
  if ($("fTabId")) $("fTabId").readOnly = true;
  renderList();
  setMsg($("geoStudioFormMsg"), "Pestaña guardada en borrador. Publique para aplicar.", true);
}

function deleteTab() {
  const id = _editingId || $("fTabId")?.value?.trim();
  if (!id) return;
  if (!confirm(`¿Eliminar la pestaña «${id}» del borrador?`)) return;
  _catalog.tabs = (_catalog.tabs || []).filter((t) => t.id !== id);
  _editingId = null;
  _isNew = false;
  showForm(false);
  renderList();
  setMsg($("geoStudioPublishMsg"), "Pestaña eliminada del borrador. Publique para aplicar.", true);
}

async function publishCatalog() {
  readMenuFieldsIntoCatalog();
  if (!(_catalog.tabs || []).length) {
    setMsg($("geoStudioPublishMsg"), "Debe haber al menos una pestaña.", false);
    return;
  }
  setMsg($("geoStudioPublishMsg"), "Publicando…", true);
  const { res, data } = await adminFetch("/api/geography-context/admin/catalog", {
    method: "PUT",
    body: JSON.stringify({ catalog: _catalog }),
  });
  if (!res?.ok) {
    const msg =
      data?.detail?.message ||
      (typeof data?.detail === "string" ? data.detail : null) ||
      data?.message ||
      `Error HTTP ${res?.status}`;
    setMsg($("geoStudioPublishMsg"), msg, false);
    return;
  }
  _catalog = data.catalog || _catalog;
  renderList();
  setMsg($("geoStudioPublishMsg"), "Catálogo publicado. Recargue el Atlas para ver los cambios.", true);
}

async function bootDashboard() {
  const user = getAdminUser();
  if ($("geoStudioWelcome")) {
    $("geoStudioWelcome").textContent = user?.username
      ? `Sesión: ${user.username}`
      : "Sesión admin activa";
  }
  mountStudioNav($("geoStudioNav"), { active: "geography" });
  showLogin(false);
  await loadMetaAndCatalog();
}

async function init() {
  $("geoStudioLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr($("geoStudioError"), "");
    try {
      await loginAdmin($("geoStudioUser").value.trim(), $("geoStudioPass").value);
      await bootDashboard();
    } catch (err) {
      showErr($("geoStudioError"), err.message || String(err));
    }
  });

  $("geoStudioLogoutBtn")?.addEventListener("click", () => {
    clearAdminSession();
    showLogin(true);
  });
  $("geoStudioNewBtn")?.addEventListener("click", () => openNew());
  $("geoStudioForm")?.addEventListener("submit", saveTabDraft);
  $("geoStudioDeleteBtn")?.addEventListener("click", deleteTab);
  $("geoStudioPublishBtn")?.addEventListener("click", () => void publishCatalog());
  $("fTextTable")?.addEventListener("change", () => {
    void fillFieldSelect($("fTextTable").value, "");
  });

  if (isVisorAdminLoggedIn()) {
    try {
      await verifyAdminSession();
      await bootDashboard();
    } catch {
      clearAdminSession();
      showLogin(true);
    }
  } else {
    const footer = $("geoStudioLoginFooter");
    if (footer) footer.innerHTML = studioLoginFooterHtml("geography");
    showLogin(true);
  }
}

void init();
