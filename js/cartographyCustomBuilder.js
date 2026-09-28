/**
 * Cartography Studio P6 — Custom Product Builder (clone aislado).
 */
import * as api from "./cartographyCustomApi.js";
import { listProducts, listDatasources } from "./cartographyProductApi.js";

const $ = (id) => document.getElementById(id);

const state = {
  products: [],
  customs: [],
  customId: "",
  draft: null,
  dirty: false,
  datasources: [],
};

const PREVIEW_DEFAULTS = {
  plano_localidad: { cve_ent: "12", cve_mun: "029", cve_loc: "0001" },
  grosig_croquis_municipal: { cve_mun: "003" },
  condensado_estatal: {},
  croquis_municipal: { cve_mun: "001" },
  atlas_municipal: { cve_mun_list: ["001"], cover: true },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showMsg(kind, msg) {
  const err = $("cartoCustomError");
  const ok = $("cartoCustomOk");
  if (err) {
    err.classList.toggle("d-none", kind !== "error" || !msg);
    err.textContent = kind === "error" ? msg || "" : "";
  }
  if (ok) {
    ok.classList.toggle("d-none", kind !== "ok" || !msg);
    ok.textContent = kind === "ok" ? msg || "" : "";
  }
}

function markDirty(flag = true) {
  state.dirty = flag;
  const badge = $("cartoCustomDirtyBadge");
  if (badge) badge.classList.toggle("d-none", !flag);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderCustomOptions() {
  const sel = $("cartoCustomSelect");
  if (!sel) return;
  const cur = state.customId;
  sel.innerHTML = state.customs.length
    ? state.customs
        .map(
          (c) =>
            `<option value="${escapeHtml(c.custom_id)}">${escapeHtml(
              c.name || c.custom_id
            )}${c.has_draft ? " · draft" : ""}${c.has_active ? " · active" : ""}</option>`
        )
        .join("")
    : `<option value="">— sin customs —</option>`;
  if (cur && state.customs.some((c) => c.custom_id === cur)) {
    sel.value = cur;
  } else if (state.customs[0]) {
    state.customId = state.customs[0].custom_id;
    sel.value = state.customId;
  } else {
    state.customId = "";
  }
}

function renderCloneProductOptions() {
  const sel = $("cartoCustomCloneProduct");
  if (!sel) return;
  sel.innerHTML = state.products
    .map(
      (p) =>
        `<option value="${escapeHtml(p.product_key)}">${escapeHtml(
          p.name || p.product_key
        )}</option>`
    )
    .join("");
}

function renderCloneTemplateOptions() {
  const prodSel = $("cartoCustomCloneProduct");
  const tplSel = $("cartoCustomCloneTemplate");
  if (!prodSel || !tplSel) return;
  const meta = state.products.find((p) => p.product_key === prodSel.value);
  const ids = meta?.template_ids || meta?.templates || [];
  const list = Array.isArray(ids) ? ids : [];
  tplSel.innerHTML = list.length
    ? list.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")
    : `<option value="">(primaria)</option>`;
}

function fillEditorFromDraft() {
  const tpl = state.draft;
  if (!tpl) return;
  if ($("cartoCustomTitle")) $("cartoCustomTitle").value = tpl.title || "";
  if ($("cartoCustomFooter")) $("cartoCustomFooter").value = tpl.footer || "";
  const meta = state.customs.find((c) => c.custom_id === state.customId);
  const status = $("cartoCustomStatus");
  if (status) {
    const cloned = tpl.cloned_from || meta?.cloned_from || {};
    status.innerHTML = `
      <div><code>${escapeHtml(state.customId)}</code></div>
      <div class="text-muted">clonado de <code>${escapeHtml(
        cloned.template_id || "?"
      )}</code> · producto <code>${escapeHtml(cloned.product_key || tpl.product || "?")}</code></div>
      <div class="text-muted">${meta?.has_draft ? "draft" : "sin draft"} · ${
      meta?.has_active ? "active custom" : "sin active"
    }</div>`;
  }
  renderLayers();
  renderPreviewParams();
  markDirty(false);
}

function datasourceOptionsHtml(selectedTable) {
  const cur = String(selectedTable || "").trim();
  const sources = state.datasources || [];
  const opts = sources.map((s) => {
    const id = s.source_id || s.id || "";
    const backend = s.backend ? ` · ${s.backend}` : "";
    const label = s.label || id;
    return `<option value="${escapeHtml(id)}" ${
      id === cur ? "selected" : ""
    }>${escapeHtml(label)}${escapeHtml(backend)}</option>`;
  });
  if (cur && !sources.some((s) => (s.source_id || s.id) === cur)) {
    opts.unshift(
      `<option value="${escapeHtml(cur)}" selected>${escapeHtml(
        cur
      )} (fuera de catálogo)</option>`
    );
  }
  if (!opts.length) {
    opts.push(
      `<option value="${escapeHtml(cur)}">${escapeHtml(cur || "—")}</option>`
    );
  }
  return opts.join("");
}

function renderLayers() {
  const host = $("cartoCustomLayers");
  if (!host || !state.draft) return;
  const layers = Array.isArray(state.draft.layers) ? state.draft.layers : [];
  if (!layers.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Sin capas</p>`;
    return;
  }
  host.innerHTML = layers
    .map((layer, idx) => {
      const id = layer.id || `layer_${idx}`;
      const enabled = layer.enabled !== false && layer.draw !== false && layer.visible !== false;
      const table = layer.table || "";
      return `<div class="border rounded p-2 mb-2 small">
        <div class="form-check mb-1">
          <input class="form-check-input carto-custom-layer-en" type="checkbox" data-idx="${idx}" id="ccLay${idx}" ${
        enabled ? "checked" : ""
      } />
          <label class="form-check-label" for="ccLay${idx}">
            <strong>${escapeHtml(id)}</strong>
          </label>
        </div>
        <label class="form-label mb-0">Tabla / origen</label>
        <select class="form-select form-select-sm carto-custom-layer-table" data-idx="${idx}">
          ${datasourceOptionsHtml(table)}
        </select>
      </div>`;
    })
    .join("");
  host.querySelectorAll(".carto-custom-layer-en").forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = Number(cb.getAttribute("data-idx"));
      if (!state.draft?.layers?.[i]) return;
      state.draft.layers[i].enabled = cb.checked;
      state.draft.layers[i].visible = cb.checked;
      state.draft.layers[i].draw = cb.checked;
      markDirty(true);
    });
  });
  host.querySelectorAll(".carto-custom-layer-table").forEach((sel) => {
    sel.addEventListener("change", () => {
      const i = Number(sel.getAttribute("data-idx"));
      if (!state.draft?.layers?.[i]) return;
      state.draft.layers[i].table = sel.value.trim();
      markDirty(true);
    });
  });
}

function renderPreviewParams() {
  const host = $("cartoCustomPreviewParams");
  if (!host || !state.draft) return;
  const product =
    state.draft.cloned_from?.product_key || state.draft.product || "";
  const defaults = PREVIEW_DEFAULTS[product] || { cve_mun: "001" };
  const keys = Object.keys(defaults);
  host.innerHTML = keys
    .map((k) => {
      const val =
        typeof defaults[k] === "object"
          ? JSON.stringify(defaults[k])
          : String(defaults[k] ?? "");
      return `<div class="mb-1">
        <label class="form-label small mb-0" for="ccParam_${escapeHtml(k)}">${escapeHtml(
        k
      )}</label>
        <input class="form-control form-control-sm carto-custom-param" id="ccParam_${escapeHtml(
          k
        )}" data-key="${escapeHtml(k)}" value="${escapeHtml(val)}" />
      </div>`;
    })
    .join("");
}

function collectPreviewParams() {
  const params = {};
  document.querySelectorAll(".carto-custom-param").forEach((inp) => {
    const key = inp.getAttribute("data-key");
    let v = inp.value?.trim() ?? "";
    if (v.startsWith("[") || v.startsWith("{")) {
      try {
        v = JSON.parse(v);
      } catch (_) {
        /* keep string */
      }
    } else if (v === "true") v = true;
    else if (v === "false") v = false;
    params[key] = v;
  });
  return params;
}

function syncMetaFromForm() {
  if (!state.draft) return;
  state.draft.title = $("cartoCustomTitle")?.value?.trim() || "";
  state.draft.footer = $("cartoCustomFooter")?.value?.trim() || "";
}

async function refreshList() {
  state.customs = await api.listCustoms();
  renderCustomOptions();
}

async function loadSelected() {
  showMsg();
  if (!state.customId) {
    state.draft = null;
    const host = $("cartoCustomLayers");
    if (host) host.innerHTML = "";
    return;
  }
  const data = await api.getCustom(state.customId);
  state.draft = data.template || null;
  fillEditorFromDraft();
}

async function onClone() {
  showMsg();
  const productKey = $("cartoCustomCloneProduct")?.value;
  if (!productKey) {
    showMsg("error", "Elija un producto oficial para clonar");
    return;
  }
  const name = $("cartoCustomCloneName")?.value?.trim() || undefined;
  const customId = $("cartoCustomCloneId")?.value?.trim() || undefined;
  const templateId = $("cartoCustomCloneTemplate")?.value?.trim() || undefined;
  const result = await api.cloneFromProduct(productKey, {
    name,
    customId,
    templateId: templateId || undefined,
  });
  await refreshList();
  state.customId = result.meta?.custom_id || result.template?.id;
  renderCustomOptions();
  await loadSelected();
  showMsg("ok", `Clone creado: ${state.customId}`);
}

async function onSave() {
  showMsg();
  if (!state.customId || !state.draft) return;
  syncMetaFromForm();
  const comment = $("cartoCustomComment")?.value?.trim();
  await api.saveCustomDraft(state.customId, state.draft, comment);
  await refreshList();
  markDirty(false);
  showMsg("ok", "Draft custom guardado (oficiales intactos)");
}

async function onPreview() {
  showMsg();
  if (!state.customId || !state.draft) return;
  syncMetaFromForm();
  if (state.dirty) {
    await api.saveCustomDraft(
      state.customId,
      state.draft,
      $("cartoCustomComment")?.value?.trim()
    );
    markDirty(false);
  }
  const { blob, filename } = await api.previewCustom(state.customId, {
    params: collectPreviewParams(),
    format: "pdf",
    prefer_draft: true,
  });
  downloadBlob(blob, filename);
  showMsg("ok", `Preview: ${filename}`);
}

async function onPublish() {
  showMsg();
  if (!state.customId) return;
  if (state.dirty) await onSave();
  const comment = $("cartoCustomComment")?.value?.trim();
  const pub = await api.publishCustom(state.customId, comment);
  await refreshList();
  await loadSelected();
  showMsg(
    "ok",
    `Custom publicado v${pub.published_version || "?"} (no afecta Visor oficial)`
  );
}

async function onRestoreFactory() {
  showMsg();
  if (!state.customId) return;
  if (!window.confirm("¿Restaurar el clone al JSON de origen (fábrica custom)?")) return;
  await api.restoreCustomFactory(state.customId);
  await refreshList();
  await loadSelected();
  showMsg("ok", "Fábrica custom restaurada a draft");
}

async function onDelete() {
  showMsg();
  if (!state.customId) return;
  if (!window.confirm(`¿Eliminar custom «${state.customId}»?`)) return;
  await api.deleteCustom(state.customId);
  state.customId = "";
  state.draft = null;
  await refreshList();
  await loadSelected();
  showMsg("ok", "Custom eliminado");
}

function bindEvents() {
  $("cartoCustomSelect")?.addEventListener("change", () => {
    state.customId = $("cartoCustomSelect").value || "";
    void loadSelected().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoCustomCloneProduct")?.addEventListener("change", () =>
    renderCloneTemplateOptions()
  );
  $("cartoCustomCloneBtn")?.addEventListener("click", () =>
    void onClone().catch((e) => showMsg("error", e.message || String(e)))
  );
  $("cartoCustomSaveBtn")?.addEventListener("click", () =>
    void onSave().catch((e) => showMsg("error", e.message || String(e)))
  );
  $("cartoCustomPreviewBtn")?.addEventListener("click", () =>
    void onPreview().catch((e) => showMsg("error", e.message || String(e)))
  );
  $("cartoCustomPublishBtn")?.addEventListener("click", () =>
    void onPublish().catch((e) => showMsg("error", e.message || String(e)))
  );
  $("cartoCustomFactoryBtn")?.addEventListener("click", () =>
    void onRestoreFactory().catch((e) => showMsg("error", e.message || String(e)))
  );
  $("cartoCustomDeleteBtn")?.addEventListener("click", () =>
    void onDelete().catch((e) => showMsg("error", e.message || String(e)))
  );
  $("cartoCustomReloadBtn")?.addEventListener("click", () =>
    void loadSelected().catch((e) => showMsg("error", e.message || String(e)))
  );
  $("cartoCustomTitle")?.addEventListener("input", () => markDirty(true));
  $("cartoCustomFooter")?.addEventListener("input", () => markDirty(true));
}

export function bindCustomBuilderUi() {
  bindEvents();
}

export async function enterCustomBuilder() {
  try {
    state.products = await listProducts();
  } catch (_) {
    state.products = [];
  }
  try {
    state.datasources = (await listDatasources()).filter(
      (s) => s.enabled !== false
    );
  } catch (_) {
    state.datasources = [];
  }
  renderCloneProductOptions();
  renderCloneTemplateOptions();
  await refreshList();
  await loadSelected();
}
