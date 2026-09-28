/**
 * Geography Studio — catálogo de Datos Geográficos (compartido legacy + shell v2).
 * @param {Document|ParentNode} [root=document]
 */
export function createGeographyStudioController(root = document, opts = {}) {
  const el = (id) =>
    root instanceof Document
      ? root.getElementById(id)
      : root.querySelector(`#${id}`);

  const gs2 =
    opts.ui === "gs2" ||
    (opts.ui !== "legacy" && Boolean(root.querySelector?.(".gs2-studio-module")));

  let _meta = null;
  let _catalog = null;
  let _editingId = null;
  let _isNew = false;
  let _columnsCache = new Map();
  let _bound = false;

  function setMsg(targetId, msg, ok = true) {
    const node = el(targetId);
    if (!node) return;
    node.textContent = msg || "";
    if (gs2) {
      node.className = ok ? "gs2-status gs2-status--success" : "gs2-form-error";
    } else {
      node.className = `small ${ok ? "text-success" : "text-danger"}`;
    }
  }

  async function loadMetaAndCatalog() {
    const { adminFetch } = await import("./visorAdminAuth.js");
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
    if (el("geoMenuLabel")) el("geoMenuLabel").value = menu.label || "";
    if (el("geoMenuSubtitle")) el("geoMenuSubtitle").value = menu.subtitle || "";
    if (el("geoMenuSection")) el("geoMenuSection").value = menu.section_label || "";
    if (el("geoLayoutMacro")) el("geoLayoutMacro").checked = layout.macro_map !== false;
  }

  function readMenuFieldsIntoCatalog() {
    if (!_catalog) return;
    _catalog.menu = {
      ...(_catalog.menu || {}),
      id: (_catalog.menu && _catalog.menu.id) || "geo_datos_geo",
      label: el("geoMenuLabel")?.value?.trim() || "Datos Geográficos",
      subtitle: el("geoMenuSubtitle")?.value?.trim() || "",
      section_id: (_catalog.menu && _catalog.menu.section_id) || "geo",
      section_label: el("geoMenuSection")?.value?.trim() || "Geografía",
    };
    _catalog.layout = {
      ...(_catalog.layout || {}),
      macro_map: Boolean(el("geoLayoutMacro")?.checked),
      detail_map_lock: (_catalog.layout && _catalog.layout.detail_map_lock) !== false,
    };
  }

  function fillTableSelect() {
    const sel = el("fTextTable");
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
    const listRoot = el("geoStudioList");
    if (!listRoot) return;
    const tabs = sortedTabs();
    if (!tabs.length) {
      listRoot.innerHTML = gs2
        ? `<p class="gs2-card__sub mb-0">Sin pestañas.</p>`
        : `<p class="small text-muted p-2 mb-0">Sin pestañas.</p>`;
      return;
    }
    if (gs2) {
      listRoot.innerHTML = tabs
        .map((t, idx) => {
          const active = t.id === _editingId ? " is-active" : "";
          const off = t.enabled === false ? " is-disabled" : "";
          return `<button type="button" class="gs2-geo-tab${active}${off}" data-tab-id="${escapeAttr(t.id)}">
            <span class="gs2-geo-tab__label">${escapeHtml(t.label || t.id)}</span>
            <span class="gs2-geo-tab__meta">${escapeHtml(t.id)} · orden ${t.order ?? "—"}</span>
            <span class="gs2-geo-tab__moves">
              <button type="button" class="gs2-btn gs2-btn--ghost gs2-btn--sm" data-move="up" data-idx="${idx}" title="Subir">↑</button>
              <button type="button" class="gs2-btn gs2-btn--ghost gs2-btn--sm" data-move="down" data-idx="${idx}" title="Bajar">↓</button>
            </span>
          </button>`;
        })
        .join("");
    } else {
      listRoot.innerHTML = tabs
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
    }

    listRoot.querySelectorAll("[data-tab-id]").forEach((node) => {
      node.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-move]")) return;
        void openTab(node.getAttribute("data-tab-id"));
      });
    });
    listRoot.querySelectorAll("[data-move]").forEach((btn) => {
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
    setMsg("geoStudioPublishMsg", "Orden cambiado (borrador). Publique para aplicar.", true);
  }

  async function loadColumns(table) {
    if (!table) return [];
    if (_columnsCache.has(table)) return _columnsCache.get(table);
    const { adminFetch } = await import("./visorAdminAuth.js");
    const { res, data } = await adminFetch(
      `/api/geography-context/admin/tables/${encodeURIComponent(table)}/columns`,
    );
    if (!res?.ok) throw new Error(data?.detail?.message || "No se pudieron leer columnas");
    const cols = data.columns || [];
    _columnsCache.set(table, cols);
    return cols;
  }

  async function fillFieldSelect(table, selected) {
    const sel = el("fTextField");
    if (!sel) return;
    sel.innerHTML = `<option value="">Cargando…</option>`;
    try {
      const cols = await loadColumns(table);
      sel.innerHTML = cols
        .map(
          (c) =>
            `<option value="${escapeAttr(c.name)}" ${c.name === selected ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.data_type)})</option>`,
        )
        .join("");
    } catch (err) {
      sel.innerHTML = `<option value="">Error: ${escapeHtml(err.message)}</option>`;
    }
  }

  function renderLayersBox(selected) {
    const box = el("fLayersBox");
    if (!box) return;
    const layers = _meta?.visor_layers || [];
    const sel = new Set((selected || []).map((x) => String(x)));
    if (!layers.length) {
      box.innerHTML = gs2
        ? `<p class="gs2-card__sub mb-0">No hay capas en Visor Catalog.</p>`
        : `<p class="small text-muted mb-0">No hay capas en Visor Catalog.</p>`;
      return;
    }
    box.innerHTML = layers
      .map((L) => {
        const badgeClass =
          L.origin === "seed" || L.seed
            ? "text-bg-info"
            : L.origin === "marco"
              ? "text-bg-secondary"
              : "text-bg-success";
        const badgeText =
          L.badge ||
          (L.origin === "seed" || L.legacy
            ? "Kit Base"
            : L.origin === "marco"
              ? "Marco nacional"
              : "Studio");
        const badge = gs2
          ? `<span class="gs2-badge gs2-badge--muted ms-1">${escapeHtml(badgeText)}</span>`
          : `<span class="badge ${badgeClass} ms-1">${escapeHtml(badgeText)}</span>`;
        const checkClass = gs2 ? "gs2-check-inline" : "form-check";
        const inputClass = gs2 ? "" : "form-check-input";
        const labelClass = gs2 ? "" : "form-check-label small";
        return `<div class="${checkClass}">
          <input class="${inputClass}" type="checkbox" value="${escapeAttr(L.layer_id)}" id="ly_${escapeAttr(L.layer_id)}" ${sel.has(L.layer_id) ? "checked" : ""} />
          <label class="${labelClass}" for="ly_${escapeAttr(L.layer_id)}">${escapeHtml(L.label || L.layer_id)}${badge}</label>
        </div>`;
      })
      .join("");
  }

  function readSelectedLayers() {
    return [...(el("fLayersBox")?.querySelectorAll("input:checked") || [])].map((node) => node.value);
  }

  function showForm(show) {
    el("geoStudioFormEmpty")?.classList.toggle("d-none", show);
    el("geoStudioForm")?.classList.toggle("d-none", !show);
  }

  async function openTab(tabId) {
    const tab = (_catalog.tabs || []).find((t) => t.id === tabId);
    if (!tab) return;
    _editingId = tabId;
    _isNew = false;
    showForm(true);
    renderList();
    const idEl = el("fTabId");
    if (idEl) {
      idEl.value = tab.id;
      idEl.readOnly = true;
    }
    if (el("fTabLabel")) el("fTabLabel").value = tab.label || "";
    if (el("fTabOrder")) el("fTabOrder").value = tab.order ?? 10;
    if (el("fTabEnabled")) el("fTabEnabled").value = tab.enabled === false ? "false" : "true";
    const table = tab.text?.table || "c_contexto";
    if (el("fTextTable")) el("fTextTable").value = table;
    if (el("fTextKey")) el("fTextKey").value = tab.text?.key_column || "cve_mun";
    if (el("fShowLegend")) el("fShowLegend").checked = Boolean(tab.show_legend);
    await fillFieldSelect(table, tab.text?.field || "");
    renderLayersBox(tab.layers || []);
    setMsg("geoStudioFormMsg", "", true);
  }

  function openNew() {
    _editingId = null;
    _isNew = true;
    showForm(true);
    renderList();
    const idEl = el("fTabId");
    if (idEl) {
      idEl.value = "";
      idEl.readOnly = false;
    }
    if (el("fTabLabel")) el("fTabLabel").value = "";
    if (el("fTabOrder")) {
      const maxOrder = Math.max(0, ...(_catalog.tabs || []).map((t) => Number(t.order) || 0));
      el("fTabOrder").value = maxOrder + 10;
    }
    if (el("fTabEnabled")) el("fTabEnabled").value = "true";
    const defaultTable = (_meta?.tables || []).some((t) => t.table === "c_contexto")
      ? "c_contexto"
      : (_meta?.tables || [])[0]?.table || "";
    if (el("fTextTable")) el("fTextTable").value = defaultTable;
    if (el("fTextKey")) el("fTextKey").value = "cve_mun";
    if (el("fShowLegend")) el("fShowLegend").checked = false;
    void fillFieldSelect(defaultTable, "");
    renderLayersBox([]);
    setMsg("geoStudioFormMsg", "", true);
  }

  function saveTabDraft(ev) {
    ev.preventDefault();
    const id = el("fTabId")?.value?.trim() || "";
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      setMsg("geoStudioFormMsg", "Identificador inválido.", false);
      return;
    }
    const entry = {
      id,
      label: el("fTabLabel")?.value?.trim() || id,
      enabled: el("fTabEnabled")?.value !== "false",
      order: Number(el("fTabOrder")?.value || 10),
      text: {
        table: el("fTextTable")?.value?.trim() || "",
        field: el("fTextField")?.value?.trim() || "",
        key_column: el("fTextKey")?.value?.trim() || "cve_mun",
      },
      layers: readSelectedLayers(),
      show_legend: Boolean(el("fShowLegend")?.checked),
    };
    if (!entry.text.table || !entry.text.field) {
      setMsg("geoStudioFormMsg", "Tabla y campo de texto son obligatorios.", false);
      return;
    }
    if (!_catalog.tabs) _catalog.tabs = [];
    const idx = _catalog.tabs.findIndex((t) => t.id === id);
    if (_isNew && idx >= 0) {
      setMsg("geoStudioFormMsg", "Ya existe una pestaña con ese id.", false);
      return;
    }
    if (!_isNew && _editingId && _editingId !== id) {
      setMsg("geoStudioFormMsg", "No se puede cambiar el id de una pestaña existente.", false);
      return;
    }
    if (idx >= 0) _catalog.tabs[idx] = entry;
    else _catalog.tabs.push(entry);
    _editingId = id;
    _isNew = false;
    if (el("fTabId")) el("fTabId").readOnly = true;
    renderList();
    setMsg("geoStudioFormMsg", "Pestaña guardada en borrador. Publique para aplicar.", true);
  }

  function deleteTab() {
    const id = _editingId || el("fTabId")?.value?.trim();
    if (!id) return;
    if (!confirm(`¿Eliminar la pestaña «${id}» del borrador?`)) return;
    _catalog.tabs = (_catalog.tabs || []).filter((t) => t.id !== id);
    _editingId = null;
    _isNew = false;
    showForm(false);
    renderList();
    setMsg("geoStudioPublishMsg", "Pestaña eliminada del borrador. Publique para aplicar.", true);
  }

  async function publishCatalog() {
    const { adminFetch } = await import("./visorAdminAuth.js");
    readMenuFieldsIntoCatalog();
    if (!(_catalog.tabs || []).length) {
      setMsg("geoStudioPublishMsg", "Debe haber al menos una pestaña.", false);
      return;
    }
    setMsg("geoStudioPublishMsg", "Publicando…", true);
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
      setMsg("geoStudioPublishMsg", msg, false);
      return;
    }
    _catalog = data.catalog || _catalog;
    renderList();
    setMsg("geoStudioPublishMsg", "Catálogo publicado. Recargue el Atlas para ver los cambios.", true);
  }

  function bindUi() {
    if (_bound) return;
    _bound = true;
    el("geoStudioNewBtn")?.addEventListener("click", () => openNew());
    el("geoStudioForm")?.addEventListener("submit", saveTabDraft);
    el("geoStudioDeleteBtn")?.addEventListener("click", deleteTab);
    el("geoStudioPublishBtn")?.addEventListener("click", () => void publishCatalog());
    el("fTextTable")?.addEventListener("change", () => {
      void fillFieldSelect(el("fTextTable").value, "");
    });
  }

  return {
    bindUi,
    enterDashboard: () => loadMetaAndCatalog(),
  };
}
