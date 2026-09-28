/**
 * Theme Studio — Imágenes del portal: lugares (logos, ícono, banner) + galería guardada.
 */
import { adminFetch } from "./visorAdminAuth.js";
import { apiUrl } from "./atlasConfig.js";

/** @type {(id: string) => HTMLElement|null} */
let $ = (id) => document.getElementById(id);
/** @type {() => object|null} */
let _getCatalog = () => null;
/** @type {() => void} */
let _onChange = () => {};

/** @type {Array<{id:string,label:string,help:string,original:string}>} */
let _slots = [];
/** @type {Array<any>} */
let _assets = [];
/** @type {{version:number, slots: Record<string, {file?:string,alt?:string,link?:string}>}} */
let _branding = { version: 1, slots: {} };
let _loadedJson = "";

const SLOT_THEME = {
  logo_left_claro: "claro",
  logo_left_oscuro: "oscuro",
  logo_right_claro: "claro",
  logo_right_oscuro: "oscuro",
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errMsg(pack, fallback) {
  const d = pack?.data || {};
  return d?.detail?.message || d?.message || (typeof d?.detail === "string" ? d.detail : "") || fallback;
}

function setStatus(msg, ok = true) {
  const el = $("themeAssetsStatus");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none", "text-success", "text-danger");
  el.classList.add(ok ? "text-success" : "text-danger");
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function assetUrl(name) {
  const a = _assets.find((x) => x.name === name);
  const v = a ? encodeURIComponent(a.sha256.slice(0, 10)) : "";
  return apiUrl(`/api/theme/assets/${encodeURIComponent(name)}?v=${v}`);
}

function slotLabel(id) {
  return _slots.find((s) => s.id === id)?.label || id;
}

/** Fondo real del lugar según el tema (para ver el logo como se verá). */
function slotBg(slotId) {
  const theme = SLOT_THEME[slotId];
  const tokens = _getCatalog()?.themes?.[theme || "claro"]?.tokens || {};
  if (!theme) return "transparent";
  return tokens["--header-bg"] || tokens["--shell-bg"] || (theme === "oscuro" ? "#0c141f" : "#ffffff");
}

/** Consejos simples para usuarios no técnicos. */
function slotHints(slotId, asset) {
  if (!asset?.width || !asset?.height) return [];
  const out = [];
  const ratio = asset.width / asset.height;
  if (slotId === "favicon" && Math.abs(ratio - 1) > 0.1) out.push("El ícono debería ser cuadrado.");
  if (slotId.startsWith("logo_") && asset.height < 100) out.push("Imagen pequeña: podría verse borrosa (ideal ≥ 104 px de alto).");
  if (slotId === "home_banner" && ratio < 1.5) out.push("El banner se ve mejor horizontal (ancho ≥ 2× alto).");
  if (asset.bytes > 1024 * 1024) out.push("Archivo pesado (> 1 MB): puede hacer lenta la carga.");
  return out;
}

function renderSlots() {
  const host = $("themeAssetsSlots");
  if (!host) return;
  const options = _assets.map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join("");
  host.innerHTML = _slots
    .map((s) => {
      const cfg = _branding.slots?.[s.id] || {};
      const file = cfg.file || "";
      const asset = _assets.find((a) => a.name === file);
      const src = file ? assetUrl(file) : s.original ? `./${s.original}` : "";
      const hints = slotHints(s.id, asset)
        .map((h) => `<div class="small text-warning-emphasis">⚠ ${esc(h)}</div>`)
        .join("");
      const missing = file && !asset ? `<div class="small text-danger">La imagen «${esc(file)}» ya no existe.</div>` : "";
      const preview = src
        ? `<img src="${esc(src)}" alt="" class="theme-assets-slot__img" />`
        : `<span class="small text-muted">Sin imagen</span>`;
      const link =
        s.id === "home_banner"
          ? `<input type="text" class="form-control form-control-sm mt-1" data-slot-link="${esc(s.id)}" placeholder="Enlace al hacer clic (opcional, https://…)" value="${esc(cfg.link || "")}" />`
          : "";
      return (
        `<div class="theme-assets-slot border rounded p-2" data-slot="${esc(s.id)}">` +
        `<div class="d-flex justify-content-between align-items-start gap-2">` +
        `<div><div class="fw-semibold small">${esc(s.label)}</div><div class="small text-muted">${esc(s.help)}</div></div>` +
        `<span class="badge ${file ? "text-bg-primary" : "text-bg-secondary"}">${file ? "Personalizada" : "Original"}</span>` +
        `</div>` +
        `<div class="theme-assets-slot__preview my-2" style="background:${esc(slotBg(s.id))}">${preview}</div>` +
        missing +
        hints +
        `<select class="form-select form-select-sm" data-slot-file="${esc(s.id)}" aria-label="Imagen para ${esc(s.label)}">` +
        `<option value="">${s.original ? "— Imagen original —" : "— Sin banner —"}</option>${options}</select>` +
        `<input type="text" class="form-control form-control-sm mt-1" data-slot-alt="${esc(s.id)}" placeholder="Descripción (para lectores de pantalla)" value="${esc(cfg.alt || "")}" />` +
        link +
        `</div>`
      );
    })
    .join("");

  host.querySelectorAll("[data-slot-file]").forEach((sel) => {
    const id = sel.getAttribute("data-slot-file");
    sel.value = _branding.slots?.[id]?.file || "";
    sel.addEventListener("change", () => {
      setSlotField(id, "file", sel.value);
      renderSlots();
      renderGallery();
    });
  });
  host.querySelectorAll("[data-slot-alt]").forEach((inp) => {
    const id = inp.getAttribute("data-slot-alt");
    inp.addEventListener("input", () => setSlotField(id, "alt", inp.value));
  });
  host.querySelectorAll("[data-slot-link]").forEach((inp) => {
    const id = inp.getAttribute("data-slot-link");
    inp.addEventListener("input", () => setSlotField(id, "link", inp.value));
  });
  updateDirty();
}

function setSlotField(slotId, field, value) {
  if (!_branding.slots) _branding.slots = {};
  const cur = { ...(_branding.slots[slotId] || {}) };
  cur[field] = value;
  if (!cur.file) {
    delete _branding.slots[slotId];
  } else {
    _branding.slots[slotId] = cur;
  }
  updateDirty();
}

function usedInDraft(name) {
  return Object.entries(_branding.slots || {})
    .filter(([, cfg]) => cfg?.file === name)
    .map(([id]) => id);
}

function renderGallery() {
  const host = $("themeAssetsGallery");
  if (!host) return;
  if (!_assets.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Aún no hay imágenes guardadas. Suba la primera con el botón de arriba.</p>`;
    return;
  }
  const slotOpts = _slots.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
  host.innerHTML = _assets
    .map((a) => {
      const used = usedInDraft(a.name);
      const usedHtml = used.length
        ? used.map((u) => `<span class="badge text-bg-success me-1">${esc(slotLabel(u))}</span>`).join("")
        : `<span class="badge text-bg-light border">Sin usar</span>`;
      const dup = a.duplicates?.length
        ? `<div class="small text-warning-emphasis">Idéntica a: ${esc(a.duplicates.join(", "))}</div>`
        : "";
      const dims = a.width && a.height ? `${a.width}×${a.height} px · ` : "";
      return (
        `<div class="theme-assets-card border rounded p-2" data-asset="${esc(a.name)}">` +
        `<div class="theme-assets-card__thumb"><img src="${esc(assetUrl(a.name))}" alt="" loading="lazy" /></div>` +
        `<div class="small fw-semibold text-truncate mt-1" title="${esc(a.name)}">${esc(a.name)}</div>` +
        `<div class="small text-muted">${esc(dims)}${esc(fmtBytes(a.bytes))}</div>` +
        `<div class="mt-1">${usedHtml}</div>${dup}` +
        `<div class="d-flex gap-1 mt-2">` +
        `<select class="form-select form-select-sm" data-use-slot aria-label="Usar en"><option value="">Usar en…</option>${slotOpts}</select>` +
        `<button type="button" class="btn btn-sm btn-outline-danger" data-del-asset ${used.length ? "disabled title=\"Está en uso\"" : ""}>Borrar</button>` +
        `</div></div>`
      );
    })
    .join("");

  host.querySelectorAll("[data-asset]").forEach((card) => {
    const name = card.getAttribute("data-asset");
    card.querySelector("[data-use-slot]")?.addEventListener("change", (ev) => {
      const slot = /** @type {HTMLSelectElement} */ (ev.target).value;
      if (!slot) return;
      setSlotField(slot, "file", name);
      renderSlots();
      renderGallery();
      setStatus(`«${name}» asignada a ${slotLabel(slot)}. Pulse «Guardar imágenes» para publicarla.`, true);
    });
    card.querySelector("[data-del-asset]")?.addEventListener("click", () => void deleteAsset(name));
  });
}

function updateDirty() {
  const btn = $("themeAssetsSaveBtn");
  const dirty = JSON.stringify(_branding) !== _loadedJson;
  if (btn) btn.textContent = dirty ? "Guardar imágenes •" : "Guardar imágenes";
  _onChange();
}

function applySnapshot(data) {
  _slots = data.slots || [];
  _assets = data.assets || [];
  _branding = JSON.parse(JSON.stringify(data.branding || { version: 1, slots: {} }));
  if (!_branding.slots) _branding.slots = {};
  _loadedJson = JSON.stringify(_branding);
  renderSlots();
  renderGallery();
}

export async function loadThemeAssets() {
  const pack = await adminFetch("/api/theme/admin/assets");
  if (pack.networkError || !pack.res?.ok || !pack.data?.ok) {
    setStatus(errMsg(pack, "No se pudo cargar la galería de imágenes"), false);
    return;
  }
  applySnapshot(pack.data);
}

async function uploadAsset() {
  const input = /** @type {HTMLInputElement|null} */ ($("themeAssetsFile"));
  const file = input?.files?.[0];
  if (!file) {
    setStatus("Elija primero una imagen (PNG, JPG o WEBP).", false);
    return;
  }
  const send = async (overwrite) => {
    const fd = new FormData();
    const safeName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^[^a-zA-Z0-9]+/, "");
    fd.append("file", file, safeName || "imagen.png");
    fd.append("overwrite", overwrite ? "true" : "false");
    return adminFetch("/api/theme/admin/assets", { method: "POST", body: fd });
  };
  setStatus("Subiendo…", true);
  let pack = await send(false);
  const msg = errMsg(pack, "");
  if (pack.res?.status === 400 && /confirme para reemplazarla/.test(msg)) {
    if (!window.confirm(`${msg}.\n\n¿Reemplazar la imagen existente?`)) {
      setStatus("Subida cancelada.", false);
      return;
    }
    pack = await send(true);
  }
  if (pack.networkError || !pack.res?.ok || !pack.data?.ok) {
    setStatus(errMsg(pack, "No se pudo subir la imagen"), false);
    return;
  }
  const keepDraft = _branding;
  applySnapshot(pack.data);
  _branding = keepDraft;
  renderSlots();
  renderGallery();
  if (input) input.value = "";
  setStatus("Imagen guardada en la galería. Asígnela a un lugar con «Usar en…».", true);
}

async function deleteAsset(name) {
  if (!window.confirm(`¿Borrar «${name}» de la galería? Esta acción no se puede deshacer.`)) return;
  const pack = await adminFetch(`/api/theme/admin/assets/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (pack.networkError || !pack.res?.ok || !pack.data?.ok) {
    setStatus(errMsg(pack, "No se pudo borrar"), false);
    return;
  }
  const keepDraft = _branding;
  applySnapshot(pack.data);
  _branding = keepDraft;
  renderSlots();
  renderGallery();
  setStatus(`«${name}» borrada.`, true);
}

async function saveBranding() {
  setStatus("Guardando…", true);
  const pack = await adminFetch("/api/theme/admin/branding", {
    method: "PUT",
    body: JSON.stringify({ branding: _branding }),
  });
  if (pack.networkError || !pack.res?.ok || !pack.data?.ok) {
    setStatus(errMsg(pack, "No se pudo guardar"), false);
    return;
  }
  applySnapshot(pack.data);
  setStatus("Imágenes publicadas. El portal las muestra al recargar (Ctrl+F5).", true);
}

/** Borrador actual (vista previa del portal). */
export function getBrandingDraftSlots() {
  const out = {};
  for (const [id, cfg] of Object.entries(_branding.slots || {})) {
    if (cfg?.file) out[id] = { url: `/api/theme/assets/${encodeURIComponent(cfg.file)}`, alt: cfg.alt || "", link: cfg.link || "" };
  }
  return out;
}

export function isBrandingDirty() {
  return JSON.stringify(_branding) !== _loadedJson;
}

/** Repinta fondos de vista previa (tras cambiar colores). */
export function refreshThemeAssetsPreview() {
  if (_slots.length) renderSlots();
}

/**
 * @param {(id: string) => HTMLElement|null} finder
 * @param {() => object|null} getCatalog
 * @param {() => void} [onChange] borrador de imágenes modificado
 */
export function bindThemeAssetsUi(finder, getCatalog, onChange) {
  $ = finder;
  _getCatalog = getCatalog;
  _onChange = onChange || (() => {});
  $("themeAssetsUploadBtn")?.addEventListener("click", () => void uploadAsset());
  $("themeAssetsSaveBtn")?.addEventListener("click", () => void saveBranding());
  $("themeAssetsReloadBtn")?.addEventListener("click", () => void loadThemeAssets());
}
