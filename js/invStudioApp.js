/**
 * INV Studio — administración del catálogo Inventario Nacional de Viviendas.
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
import { INV_ICON_OPTIONS, invLayerIconSvg } from "./invVivIcons.js";

const $ = (id) => document.getElementById(id);

const KIND_DOCS = {
  count:
    "<strong>Conteo / cantidad.</strong> Valor numérico por manzana (p. ej. población, viviendas). En el mapa se muestra como número; el front convierte cadenas tipo <code>\"123\"</code> a número.",
  percent:
    "<strong>Porcentaje.</strong> Igual que conteo en el dibujo actual (etiqueta numérica). Reserve para columnas que ya vienen como % (0–100 o 0–1 según fuente).",
  grade:
    "<strong>Promedio / grado.</strong> Valores con decimales (p. ej. años de escolaridad). Formato con hasta 2 decimales.",
  entorno:
    "<strong>Entorno urbano (código).</strong> Códigos categóricos INEGI (1–9) en texto: se interpretan como clase (todas / alguna / ninguna vialidad, etc.) y se colorean como polígono. Requiere dibujo = Polígono.",
};

let _meta = null;
let _catalog = null;
let _editingGroupId = null;
let _editingIndId = null;
let _isNewGroup = false;
let _isNewInd = false;
/** Id del indicador origen al crear una copia (null si no es copia). */
let _copySourceId = null;

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
  $("invStudioLoginView")?.classList.toggle("d-none", !show);
  $("invStudioDashboard")?.classList.toggle("d-none", show);
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

function sortedGroups() {
  return (_catalog?.groups || [])
    .slice()
    .sort(
      (a, b) =>
        (a.order || 0) - (b.order || 0) ||
        String(a.label || "").localeCompare(String(b.label || ""))
    );
}

function sortedIndicators() {
  const gOrder = new Map(sortedGroups().map((g, i) => [g.id, i]));
  return (_catalog?.indicators || [])
    .slice()
    .sort((a, b) => {
      const ga = gOrder.get(a.group_id) ?? 999;
      const gb = gOrder.get(b.group_id) ?? 999;
      return ga - gb || String(a.label || "").localeCompare(String(b.label || ""));
    });
}

function fillMenuFields() {
  const menu = _catalog?.menu || {};
  if ($("invMenuLabel")) $("invMenuLabel").value = menu.label || "";
  if ($("invMenuSubtitle")) $("invMenuSubtitle").value = menu.subtitle || "";
  if ($("invMenuEnabled")) $("invMenuEnabled").checked = menu.enabled !== false;
}

function readMenuFieldsIntoCatalog() {
  if (!_catalog) return;
  _catalog.menu = {
    ...(_catalog.menu || {}),
    id: (_catalog.menu && _catalog.menu.id) || "geo_inv_viv",
    label: $("invMenuLabel")?.value?.trim() || "Inventario de Viviendas",
    subtitle: $("invMenuSubtitle")?.value?.trim() || "INV 2020 · Manzanas",
    enabled: Boolean($("invMenuEnabled")?.checked),
  };
}

function fillFieldSelect(selected) {
  const sel = $("fIndField");
  if (!sel) return;
  const cols = (_meta?.columns || []).filter((c) => {
    const n = String(c.name || "").toLowerCase();
    return !["the_geom", "geom", "geometry", "gid", "ogc_fid"].includes(n);
  });
  sel.innerHTML = cols
    .map(
      (c) =>
        `<option value="${escapeAttr(c.name)}">${escapeHtml(c.name)} (${escapeHtml(c.data_type)})</option>`
    )
    .join("");
  if (selected) sel.value = selected;
}

function fillGroupSelect(selected) {
  const sel = $("fIndGroup");
  if (!sel) return;
  sel.innerHTML = sortedGroups()
    .map(
      (g) =>
        `<option value="${escapeAttr(g.id)}">${escapeHtml(g.label || g.id)}</option>`
    )
    .join("");
  if (selected) sel.value = selected;
}

function fillIconSelect(selected) {
  const sel = $("fIndIcon");
  if (!sel) return;
  const known = new Set(INV_ICON_OPTIONS.map((o) => o.id));
  let opts = INV_ICON_OPTIONS.slice();
  if (selected && !known.has(selected)) {
    opts = [{ id: selected, label: `${selected} (personalizado)` }, ...opts];
  }
  sel.innerHTML = opts
    .map(
      (o) =>
        `<option value="${escapeAttr(o.id)}">${escapeHtml(o.label)} (${escapeHtml(o.id)})</option>`
    )
    .join("");
  if (selected) sel.value = selected;
  else if (opts[0]) sel.value = opts[0].id;
  syncIconPreview();
}

function syncIconPreview() {
  const preview = $("fIndIconPreview");
  if (!preview) return;
  const icon = $("fIndIcon")?.value || "person";
  const color = $("fIndColor")?.value || "#66bb6a";
  preview.innerHTML = invLayerIconSvg(icon, color);
}

function syncKindDoc() {
  const el = $("fIndKindDoc");
  if (!el) return;
  const kind = $("fIndKind")?.value || "count";
  el.innerHTML = KIND_DOCS[kind] || KIND_DOCS.count;
}

function suggestCopyId(baseId) {
  const base = String(baseId || "ind")
    .replace(/_copia\d*$/, "")
    .slice(0, 40);
  const existing = new Set((_catalog?.indicators || []).map((i) => i.id));
  let candidate = `${base}_copia`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_copia${n}`;
    n += 1;
  }
  return candidate;
}

function setCopyHint(msg) {
  const el = $("invIndCopyHint");
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

function updateIndActionButtons() {
  const copyBtn = $("invIndCopyBtn");
  const delBtn = $("invIndDeleteBtn");
  const canEditExisting = !_isNewInd && Boolean(_editingIndId);
  if (copyBtn) copyBtn.classList.toggle("d-none", !canEditExisting);
  if (delBtn) delBtn.classList.toggle("d-none", !canEditExisting);
}

function hideForms() {
  $("invGroupForm")?.classList.add("d-none");
  $("invIndForm")?.classList.add("d-none");
  $("invStudioFormEmpty")?.classList.remove("d-none");
  setCopyHint("");
  _copySourceId = null;
}

function renderGroupList() {
  const root = $("invGroupList");
  if (!root) return;
  const groups = sortedGroups();
  if (!groups.length) {
    root.innerHTML = `<p class="small text-muted p-2 mb-0">Sin grupos.</p>`;
    return;
  }
  root.innerHTML = groups
    .map((g) => {
      const active = g.id === _editingGroupId ? " active" : "";
      return `<div class="list-group-item list-group-item-action py-2 px-2${active}" data-group-id="${escapeAttr(g.id)}">
        <div class="small fw-semibold">${escapeHtml(g.label || g.id)}</div>
        <div class="text-muted" style="font-size:0.7rem">${escapeHtml(g.id)} · orden ${g.order ?? "—"}</div>
      </div>`;
    })
    .join("");
  root.querySelectorAll("[data-group-id]").forEach((el) => {
    el.addEventListener("click", () => openGroup(el.getAttribute("data-group-id")));
  });
}

function renderIndList() {
  const root = $("invIndList");
  if (!root) return;
  const inds = sortedIndicators();
  const gLabel = new Map(sortedGroups().map((g) => [g.id, g.label || g.id]));
  if (!inds.length) {
    root.innerHTML = `<p class="small text-muted p-2 mb-0">Sin indicadores.</p>`;
    return;
  }
  root.innerHTML = inds
    .map((ind) => {
      const active = ind.id === _editingIndId ? " active" : "";
      const off = ind.enabled === false ? " text-muted" : "";
      const swatch = escapeAttr(ind.color || "#66bb6a");
      return `<div class="list-group-item list-group-item-action py-2 px-2 d-flex gap-2 align-items-start${active}" data-ind-id="${escapeAttr(ind.id)}">
        <span style="width:12px;height:12px;border-radius:2px;background:${swatch};margin-top:4px;flex-shrink:0"></span>
        <div class="flex-grow-1${off}">
          <div class="small fw-semibold">${escapeHtml(ind.label || ind.id)}</div>
          <div class="text-muted" style="font-size:0.7rem">${escapeHtml(ind.field)} · ${escapeHtml(gLabel.get(ind.group_id) || ind.group_id)} · ${escapeHtml(ind.render)}</div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1" data-copy-ind="${escapeAttr(ind.id)}" title="Copiar como nuevo">⧉</button>
      </div>`;
    })
    .join("");
  root.querySelectorAll("[data-ind-id]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-copy-ind]")) return;
      openIndicator(el.getAttribute("data-ind-id"));
    });
  });
  root.querySelectorAll("[data-copy-ind]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      copyIndicatorAsNew(btn.getAttribute("data-copy-ind"));
    });
  });
}

function renderPreview() {
  const root = $("invPanelPreview");
  if (!root || !_catalog) return;
  const groups = sortedGroups();
  const inds = sortedIndicators().filter((i) => i.enabled !== false);
  if (!groups.length) {
    root.innerHTML = `<p class="small text-muted mb-0">Sin contenido.</p>`;
    return;
  }
  root.innerHTML = groups
    .map((g) => {
      const items = inds.filter((i) => i.group_id === g.id);
      if (!items.length) return "";
      const lis = items
        .map((i) => {
          const color = i.color || "#888";
          const ico = invLayerIconSvg(i.icon || "person", color);
          return `<li class="small d-flex align-items-center gap-2 mb-1">
              <span class="inv-studio-icon-preview border-0" style="width:22px;height:22px;background:transparent">${ico}</span>
              ${escapeHtml(i.label)} <span class="text-muted">(${escapeHtml(i.field)})</span>
            </li>`;
        })
        .join("");
      return `<div class="mb-3"><div class="fw-semibold small mb-1">${escapeHtml(g.label)}</div><ul class="list-unstyled mb-0 ps-1">${lis}</ul></div>`;
    })
    .join("");
}

function openGroup(id) {
  const g = (_catalog.groups || []).find((x) => x.id === id);
  if (!g) return;
  _editingGroupId = id;
  _editingIndId = null;
  _isNewGroup = false;
  _isNewInd = false;
  hideForms();
  $("invStudioFormEmpty")?.classList.add("d-none");
  $("invGroupForm")?.classList.remove("d-none");
  $("fGroupId").value = g.id;
  $("fGroupId").readOnly = true;
  $("fGroupLabel").value = g.label || "";
  $("fGroupOrder").value = g.order ?? 10;
  renderGroupList();
  renderIndList();
}

function openNewGroup() {
  _editingGroupId = null;
  _editingIndId = null;
  _isNewGroup = true;
  hideForms();
  $("invStudioFormEmpty")?.classList.add("d-none");
  $("invGroupForm")?.classList.remove("d-none");
  $("fGroupId").value = "";
  $("fGroupId").readOnly = false;
  $("fGroupLabel").value = "";
  $("fGroupOrder").value = (sortedGroups().length + 1) * 10;
  renderGroupList();
  renderIndList();
}

function openIndicator(id) {
  const ind = (_catalog.indicators || []).find((x) => x.id === id);
  if (!ind) return;
  _editingIndId = id;
  _editingGroupId = null;
  _isNewInd = false;
  _isNewGroup = false;
  _copySourceId = null;
  setCopyHint("");
  $("invGroupForm")?.classList.add("d-none");
  $("invStudioFormEmpty")?.classList.add("d-none");
  $("invIndForm")?.classList.remove("d-none");
  fillFieldSelect(ind.field);
  fillGroupSelect(ind.group_id);
  fillIconSelect(ind.icon || "person");
  $("fIndId").value = ind.id;
  $("fIndId").readOnly = true;
  $("fIndLabel").value = ind.label || "";
  $("fIndKind").value = ind.kind || "count";
  $("fIndRender").value = ind.render || "point";
  $("fIndColor").value = ind.color || "#66bb6a";
  $("fIndEnabled").checked = ind.enabled !== false;
  $("fIndHover").checked = ind.hover !== false;
  syncKindDoc();
  syncIconPreview();
  updateIndActionButtons();
  renderGroupList();
  renderIndList();
}

function openNewIndicator() {
  _editingIndId = null;
  _editingGroupId = null;
  _isNewInd = true;
  _copySourceId = null;
  setCopyHint("");
  $("invGroupForm")?.classList.add("d-none");
  $("invStudioFormEmpty")?.classList.add("d-none");
  $("invIndForm")?.classList.remove("d-none");
  fillFieldSelect("");
  fillGroupSelect(sortedGroups()[0]?.id || "");
  fillIconSelect("person");
  $("fIndId").value = "";
  $("fIndId").readOnly = false;
  $("fIndLabel").value = "";
  $("fIndKind").value = "count";
  $("fIndRender").value = "point";
  $("fIndColor").value = "#66bb6a";
  $("fIndEnabled").checked = true;
  $("fIndHover").checked = true;
  syncKindDoc();
  syncIconPreview();
  updateIndActionButtons();
  renderGroupList();
  renderIndList();
}

/**
 * Duplica un indicador existente como borrador nuevo.
 * Conserva kind/render/icono/grupo/flags; el usuario debe cambiar Id y Columna BD
 * (y conviene cambiar Color).
 */
function copyIndicatorAsNew(sourceId) {
  const src =
    (_catalog?.indicators || []).find((x) => x.id === sourceId) ||
    (_editingIndId && (_catalog?.indicators || []).find((x) => x.id === _editingIndId));
  if (!src) {
    setMsg($("invStudioPublishMsg"), "Seleccione un indicador para copiar.", false);
    return;
  }

  _editingIndId = null;
  _editingGroupId = null;
  _isNewInd = true;
  _isNewGroup = false;
  _copySourceId = src.id;

  $("invStudioFormEmpty")?.classList.add("d-none");
  $("invGroupForm")?.classList.add("d-none");
  $("invIndForm")?.classList.remove("d-none");

  const newId = suggestCopyId(src.id);
  fillFieldSelect(src.field);
  fillGroupSelect(src.group_id);
  fillIconSelect(src.icon || "person");
  $("fIndId").value = newId;
  $("fIndId").readOnly = false;
  $("fIndLabel").value = `${src.label || src.id} (copia)`;
  $("fIndKind").value = src.kind || "count";
  $("fIndRender").value = src.render || "point";
  $("fIndColor").value = src.color || "#66bb6a";
  $("fIndEnabled").checked = src.enabled !== false;
  $("fIndHover").checked = src.hover !== false;
  syncKindDoc();
  syncIconPreview();
  updateIndActionButtons();
  setCopyHint(
    `Copia de «${src.label || src.id}». Cambie el Id (ya sugerido), elija otra Columna BD y un Color distinto; luego guarde el borrador.`
  );
  setMsg(
    $("invStudioPublishMsg"),
    "Borrador de copia listo: ajuste Id, campo y color.",
    true
  );
  renderGroupList();
  renderIndList();
  $("fIndField")?.focus();
}

function saveGroupDraft(ev) {
  ev.preventDefault();
  if (!_catalog) return;
  const id = $("fGroupId").value.trim();
  const label = $("fGroupLabel").value.trim();
  const order = Number($("fGroupOrder").value || 0);
  if (!id || !label) return;
  if (!_catalog.groups) _catalog.groups = [];
  if (_isNewGroup) {
    if (_catalog.groups.some((g) => g.id === id)) {
      setMsg($("invStudioPublishMsg"), `Ya existe el grupo ${id}`, false);
      return;
    }
    _catalog.groups.push({ id, label, order });
    _editingGroupId = id;
    _isNewGroup = false;
    $("fGroupId").readOnly = true;
  } else {
    const g = _catalog.groups.find((x) => x.id === _editingGroupId);
    if (!g) return;
    g.label = label;
    g.order = order;
  }
  renderGroupList();
  renderIndList();
  renderPreview();
  fillGroupSelect($("fIndGroup")?.value);
  setMsg($("invStudioPublishMsg"), "Grupo en borrador. Publique para aplicar.", true);
}

function deleteGroup() {
  if (!_editingGroupId || !_catalog) return;
  const used = (_catalog.indicators || []).some((i) => i.group_id === _editingGroupId);
  if (used) {
    setMsg(
      $("invStudioPublishMsg"),
      "No se puede eliminar: hay indicadores en este grupo.",
      false
    );
    return;
  }
  _catalog.groups = (_catalog.groups || []).filter((g) => g.id !== _editingGroupId);
  _editingGroupId = null;
  hideForms();
  renderGroupList();
  renderPreview();
}

function saveIndDraft(ev) {
  ev.preventDefault();
  if (!_catalog) return;
  const payload = {
    id: $("fIndId").value.trim(),
    field: $("fIndField").value.trim(),
    label: $("fIndLabel").value.trim(),
    group_id: $("fIndGroup").value.trim(),
    kind: $("fIndKind").value,
    render: $("fIndRender").value,
    color: $("fIndColor").value || "#66bb6a",
    icon: $("fIndIcon").value.trim() || "person",
    enabled: Boolean($("fIndEnabled").checked),
    hover: Boolean($("fIndHover").checked),
  };
  if (!payload.id || !payload.field || !payload.label || !payload.group_id) return;
  if (payload.render === "polygon" && payload.kind !== "entorno") {
    setMsg(
      $("invStudioPublishMsg"),
      "Polígono solo con tipo «Entorno urbano».",
      false
    );
    return;
  }

  if (_isNewInd && _copySourceId) {
    const src = (_catalog.indicators || []).find((i) => i.id === _copySourceId);
    if (payload.id === _copySourceId) {
      setMsg(
        $("invStudioPublishMsg"),
        "La copia necesita un Id distinto al original.",
        false
      );
      $("fIndId")?.focus();
      return;
    }
    if (src && payload.field === src.field) {
      setMsg(
        $("invStudioPublishMsg"),
        "Elija otra Columna BD: no puede repetir la del indicador original.",
        false
      );
      $("fIndField")?.focus();
      return;
    }
    if (src && payload.color.toLowerCase() === String(src.color || "").toLowerCase()) {
      setMsg(
        $("invStudioPublishMsg"),
        "Cambie el Color para distinguir la copia en el panel (mismo color que el original).",
        false
      );
      $("fIndColor")?.focus();
      return;
    }
  }

  if (!_catalog.indicators) _catalog.indicators = [];
  if (_isNewInd) {
    if (_catalog.indicators.some((i) => i.id === payload.id || i.field === payload.field)) {
      setMsg($("invStudioPublishMsg"), "Id o columna BD ya usados por otro indicador.", false);
      return;
    }
    _catalog.indicators.push(payload);
    _editingIndId = payload.id;
    _isNewInd = false;
    _copySourceId = null;
    setCopyHint("");
    $("fIndId").readOnly = true;
  } else {
    const ind = _catalog.indicators.find((x) => x.id === _editingIndId);
    if (!ind) return;
    Object.assign(ind, payload, { id: ind.id });
  }
  updateIndActionButtons();
  renderIndList();
  renderPreview();
  setMsg($("invStudioPublishMsg"), "Indicador en borrador. Publique para aplicar.", true);
}

function deleteInd() {
  if (!_editingIndId || !_catalog) return;
  _catalog.indicators = (_catalog.indicators || []).filter(
    (i) => i.id !== _editingIndId
  );
  _editingIndId = null;
  hideForms();
  renderIndList();
  renderPreview();
}

async function loadMetaAndCatalog() {
  const metaRes = await adminFetch("/api/inv/admin/meta");
  if (!metaRes.res?.ok) {
    throw new Error(
      metaRes.data?.detail?.message || metaRes.data?.message || "No se pudo cargar meta"
    );
  }
  _meta = metaRes.data;
  const catRes = await adminFetch("/api/inv/admin/catalog");
  if (!catRes.res?.ok) {
    throw new Error(
      catRes.data?.detail?.message ||
        catRes.data?.message ||
        "No se pudo cargar catálogo"
    );
  }
  _catalog = JSON.parse(JSON.stringify(catRes.data.catalog || {}));
  if (!_catalog.hover_defaults) {
    _catalog.hover_defaults = ["cvegeo", "ambito"];
  }
  fillMenuFields();
  renderGroupList();
  renderIndList();
  renderPreview();
  hideForms();
}

async function publishCatalog() {
  readMenuFieldsIntoCatalog();
  setMsg($("invStudioPublishMsg"), "Publicando…", true);
  const { res, data } = await adminFetch("/api/inv/admin/catalog", {
    method: "PUT",
    body: JSON.stringify({ catalog: _catalog }),
  });
  if (!res?.ok) {
    const msg =
      data?.detail?.message ||
      (typeof data?.detail === "string" ? data.detail : null) ||
      data?.message ||
      `Error HTTP ${res?.status}`;
    setMsg($("invStudioPublishMsg"), msg, false);
    return;
  }
  _catalog = data.catalog || _catalog;
  renderGroupList();
  renderIndList();
  renderPreview();
  setMsg(
    $("invStudioPublishMsg"),
    "Catálogo publicado. Recargue el Atlas para ver los cambios.",
    true
  );
}

async function bootDashboard() {
  const user = getAdminUser();
  if ($("invStudioWelcome")) {
    $("invStudioWelcome").textContent = user?.username
      ? `Sesión: ${user.username}`
      : "Sesión admin activa";
  }
  mountStudioNav($("invStudioNav"), { active: "inv" });
  showLogin(false);
  await loadMetaAndCatalog();
}

async function init() {
  $("invStudioLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr($("invStudioError"), "");
    try {
      await loginAdmin($("invStudioUser").value.trim(), $("invStudioPass").value);
      await bootDashboard();
    } catch (err) {
      showErr($("invStudioError"), err.message || String(err));
    }
  });

  $("invStudioLogoutBtn")?.addEventListener("click", () => {
    clearAdminSession();
    showLogin(true);
  });
  $("invGroupNewBtn")?.addEventListener("click", () => openNewGroup());
  $("invIndNewBtn")?.addEventListener("click", () => openNewIndicator());
  $("invGroupForm")?.addEventListener("submit", saveGroupDraft);
  $("invIndForm")?.addEventListener("submit", saveIndDraft);
  $("invGroupDeleteBtn")?.addEventListener("click", deleteGroup);
  $("invIndDeleteBtn")?.addEventListener("click", deleteInd);
  $("invIndCopyBtn")?.addEventListener("click", () => {
    if (_editingIndId) copyIndicatorAsNew(_editingIndId);
  });
  $("invStudioPublishBtn")?.addEventListener("click", () => void publishCatalog());
  $("fIndIcon")?.addEventListener("change", syncIconPreview);
  $("fIndColor")?.addEventListener("input", syncIconPreview);
  $("fIndKind")?.addEventListener("change", () => {
    syncKindDoc();
    // Entorno → polígono por defecto si el usuario cambia a ese tipo
    if ($("fIndKind")?.value === "entorno" && $("fIndRender")?.value === "point") {
      $("fIndRender").value = "polygon";
    }
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
    const footer = $("invStudioLoginFooter");
    if (footer) footer.innerHTML = studioLoginFooterHtml("inv");
    showLogin(true);
  }
}

void init();
