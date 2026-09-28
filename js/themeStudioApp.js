/**
 * Theme Studio — identidad de color claro/oscuro (catálogo data-driven), imágenes del portal,
 * vista previa real del portal y temas guardados.
 * Reutiliza sesión JWT de Visor Studio (visorAdminAuth.js + studioShell).
 */
import { adminFetch } from "./visorAdminAuth.js";
import {
  applyCatalogTokens,
  resetThemeCatalogCache,
  setThemeCatalogCache,
} from "./theme.js";
import {
  createStudioShell,
  setStudioStatus,
  studioIdsFromPrefix,
} from "./studioShell.js";
import {
  bindThemeAssetsUi,
  getBrandingDraftSlots,
  isBrandingDirty,
  loadThemeAssets,
  refreshThemeAssetsPreview,
} from "./themeStudioAssets.js?v=20260925b";
import {
  BASICS,
  basicToTokens,
  catalogDiff,
  generateDarkFromLight,
  legibilityReport,
  readBasicHex,
} from "./themeStudioBasics.js?v=20260928a";

/** @type {Document|HTMLElement|null} */
let _uiRoot = null;
/** Invalida loadAll/renderEditor obsoletos al cambiar de vista. */
let _loadSession = 0;

export function bumpThemeStudioSession() {
  _loadSession += 1;
}

const $ = (id) => {
  const root = _uiRoot || document;
  if (root === document) return document.getElementById(id);
  return root.querySelector(`#${CSS.escape(id)}`);
};

const ADVANCED_KEY = "atlasgro-theme-studio-advanced";

/** @type {object|null} */
let _catalog = null;
/** @type {object|null} */
let _schema = null;
/** @type {object|null} */
let _defaults = null;
/** @type {"claro"|"oscuro"} */
let _activeTheme = "claro";
/** Snapshot al cargar (detectar cambios locales). */
let _loadedJson = "";
let _advanced = localStorage.getItem(ADVANCED_KEY) === "1";
/** @type {"claro"|"oscuro"} */
let _previewTheme = "claro";

function setStatus(msg, ok = true) {
  setStudioStatus("themeStudioStatus", msg, ok);
}

function parseColorToHex(value) {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1],
      g = v[2],
      b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  if (m) {
    const hex = (n) => Number(n).toString(16).padStart(2, "0");
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  }
  const t = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/.exec(v);
  if (t) {
    const hex = (n) => Number(n).toString(16).padStart(2, "0");
    return `#${hex(t[1])}${hex(t[2])}${hex(t[3])}`;
  }
  return "#808080";
}

function hexToRgbTriplet(hex) {
  const h = parseColorToHex(hex).slice(1);
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function getTokenValue(themeId, key) {
  return _catalog?.themes?.[themeId]?.tokens?.[key] ?? "";
}

function setTokenValue(themeId, key, value) {
  if (!_catalog?.themes?.[themeId]) return;
  if (!_catalog.themes[themeId].tokens) _catalog.themes[themeId].tokens = {};
  _catalog.themes[themeId].tokens[key] = value;
}

function tokenLabels() {
  const map = {};
  for (const g of _schema?.token_groups || []) {
    for (const t of g.tokens || []) map[t.key] = t.label || t.key;
  }
  map.default_theme = "Tema por defecto";
  return map;
}

function isCatalogDirty() {
  return !!_catalog && JSON.stringify(_catalog) !== _loadedJson;
}

function renderLegibility() {
  const host = $("themeStudioLegibility");
  if (!host) return;
  const tokens = _catalog?.themes?.[_activeTheme]?.tokens || {};
  const rows = legibilityReport(tokens, _activeTheme);
  const icon = { ok: "✓ Bien", warn: "⚠ Justo", bad: "✗ Difícil de leer" };
  host.innerHTML = rows
    .map(
      (r) =>
        `<li><span>${escapeHtml(r.label)}</span><span class="lv-${r.level} text-nowrap" title="Contraste ${r.ratio.toFixed(1)}:1 (recomendado ≥ 4.5)">${icon[r.level]}</span></li>`,
    )
    .join("");
}

function renderDiff() {
  const summary = $("themeStudioDiffSummary");
  const list = $("themeStudioDiffList");
  const saveBtn = $("themeStudioSaveBtn");
  if (!summary || !list || !_catalog) return;
  const before = _loadedJson ? JSON.parse(_loadedJson) : {};
  const diff = catalogDiff(before, _catalog);
  if (saveBtn) saveBtn.textContent = diff.length ? `Guardar colores (${diff.length} cambios)` : "Guardar colores";
  summary.textContent = diff.length ? `Ver cambios sin guardar (${diff.length})` : "Sin cambios pendientes";
  const labels = tokenLabels();
  const sw = (v) => `<span class="theme-diff-sw" style="background:${escapeAttr(v)}"></span>`;
  list.innerHTML = diff
    .slice(0, 80)
    .map((d) => {
      const theme = d.theme === "general" ? "" : `[${d.theme === "oscuro" ? "Oscuro" : "Claro"}] `;
      const isColor = d.key !== "default_theme" && !/^\s*\d/.test(String(d.after));
      const b = isColor ? sw(d.before) : "";
      const a = isColor ? sw(d.after) : "";
      return `<li>${escapeHtml(theme + (labels[d.key] || d.key))}: ${b} ${escapeHtml(d.before || "—")} → ${a} ${escapeHtml(d.after || "—")}</li>`;
    })
    .join("");
}

function updatePreview() {
  const tokens = _catalog?.themes?.[_activeTheme]?.tokens || {};
  const box = $("themeStudioPreview");
  const title = $("themeStudioPreviewTitle");
  const muted = $("themeStudioPreviewMuted");
  const btn = $("themeStudioPreviewBtn");
  if (!box) return;
  const bg = tokens["--shell-bg"] || tokens["--bg"] || "#40cfc6";
  const fg = tokens["--shell-text"] || tokens["--text"] || "#061018";
  const mu = tokens["--shell-muted"] || tokens["--muted"] || fg;
  const accentRgb = tokens["--accent-rgb"] || "0, 51, 102";
  const paint = (el, prop, value) => {
    if (!el) return;
    el.style.setProperty(prop, value, "important");
  };
  paint(box, "background-color", bg);
  paint(box, "color", fg);
  paint(box, "border-color", tokens["--shell-border"] || "rgba(0,0,0,0.2)");
  if (title) paint(title, "color", fg);
  if (muted) {
    paint(muted, "color", mu);
    muted.textContent = `Tema «${_catalog?.themes?.[_activeTheme]?.label || _activeTheme}»`;
  }
  if (btn) {
    paint(btn, "background-color", `rgb(${accentRgb})`);
    paint(btn, "border-color", `rgb(${accentRgb})`);
    paint(btn, "color", "#fff");
  }
  // Vista previa también en el documento del studio
  if (_catalog) {
    setThemeCatalogCache({
      ok: true,
      themes: _catalog.themes,
      default_theme: _catalog.default_theme,
    });
  }
  document.documentElement.setAttribute("data-theme", _activeTheme);
  applyCatalogTokens(_activeTheme);
  renderLegibility();
  renderDiff();
  schedulePortalPreview();
}

/** Shell v2 — refrescar vista previa tras montar DOM */
export function updateThemePreview() {
  updatePreview();
}

/** Shell v2 — limpiar referencia al contenedor montado */
export function resetThemeStudioUiRoot() {
  _uiRoot = null;
}

function renderBasicEditor(host) {
  const tokens = _catalog?.themes?.[_activeTheme]?.tokens || {};
  host.innerHTML =
    `<p class="small text-muted">Elija los colores principales; los tonos relacionados (textos tenues, bordes, encabezados) se ajustan solos. ` +
    `Para afinar cada detalle active «Mostrar todos los colores».</p>` +
    `<div class="theme-basic-grid">` +
    BASICS.map((b) => {
      const id = `basic_${_activeTheme}_${b.id}`;
      return (
        `<div class="theme-basic-item border rounded p-2">` +
        `<input type="color" class="form-control form-control-color" id="${id}" data-basic="${b.id}" value="${readBasicHex(tokens, b)}" />` +
        `<label for="${id}" class="small"><span class="fw-semibold d-block">${escapeHtml(b.label)}</span><span class="text-muted">${escapeHtml(b.help)}</span></label>` +
        `</div>`
      );
    }).join("") +
    `</div>`;
  host.querySelectorAll("[data-basic]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const next = basicToTokens(_activeTheme, inp.getAttribute("data-basic"), inp.value);
      for (const [k, v] of Object.entries(next)) setTokenValue(_activeTheme, k, v);
      updatePreview();
    });
  });
}

function renderAdvancedEditor(host) {
  const groups = _schema.token_groups || [];
  const parts = [];
  for (const group of groups) {
    const tokens = group.tokens || [];
    parts.push(
      `<div class="theme-studio-group border rounded p-3">` +
        `<div class="fw-semibold small mb-2">${escapeHtml(group.label || group.id)}</div>` +
        `<div class="d-grid gap-2">`,
    );
    for (const tok of tokens) {
      const key = tok.key;
      const fmt = tok.format || "color";
      const val = getTokenValue(_activeTheme, key);
      const id = `tok_${_activeTheme}_${key.replace(/[^a-z0-9]/gi, "_")}`;
      const isRgb = fmt === "rgb_triplet";
      const pickerVal = parseColorToHex(val);
      parts.push(
        `<div class="theme-studio-token-row row g-2 align-items-center" data-token-key="${escapeHtml(key)}" data-format="${escapeHtml(fmt)}">` +
          `<div class="col-md-4"><label class="form-label small mb-0" for="${id}">${escapeHtml(tok.label || key)}</label>` +
          `<div class="form-text font-monospace" style="font-size:0.7rem">${escapeHtml(key)}</div></div>` +
          `<div class="col-md-5"><input type="text" class="form-control form-control-sm theme-studio-token-text" id="${id}" value="${escapeAttr(val)}" /></div>` +
          `<div class="col-md-3 d-flex gap-1 align-items-center">` +
          `<input type="color" class="form-control form-control-color theme-studio-token-picker" value="${pickerVal}" aria-label="Selector ${escapeAttr(tok.label || key)}" />` +
          `${isRgb ? '<span class="small text-muted">RGB</span>' : ""}` +
          `</div></div>`,
      );
    }
    parts.push(`</div></div>`);
  }
  host.innerHTML = parts.join("");

  host.querySelectorAll(".theme-studio-token-row").forEach((row) => {
    const key = row.getAttribute("data-token-key");
    const fmt = row.getAttribute("data-format");
    const text = row.querySelector(".theme-studio-token-text");
    const picker = row.querySelector(".theme-studio-token-picker");
    text?.addEventListener("change", () => {
      setTokenValue(_activeTheme, key, text.value.trim());
      if (picker) picker.value = parseColorToHex(text.value);
      updatePreview();
    });
    text?.addEventListener("input", () => {
      setTokenValue(_activeTheme, key, text.value.trim());
      updatePreview();
    });
    picker?.addEventListener("input", () => {
      const hex = picker.value;
      const next = fmt === "rgb_triplet" ? hexToRgbTriplet(hex) : hex;
      if (text) text.value = next;
      setTokenValue(_activeTheme, key, next);
      updatePreview();
    });
  });
}

function renderEditor() {
  if (_loadSession !== _activeLoadSession) return;
  const host = $("themeStudioEditor");
  const title = $("themeStudioEditorTitle");
  if (!host || !_schema) return;
  const label = _catalog?.themes?.[_activeTheme]?.label || _activeTheme;
  if (title) title.textContent = `${_advanced ? "Todos los colores" : "Colores principales"} — tema ${label}`;
  const adv = $("themeStudioAdvanced");
  if (adv) adv.checked = _advanced;
  if (_advanced) renderAdvancedEditor(host);
  else renderBasicEditor(host);
  updatePreview();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function setActiveTab(themeId) {
  _activeTheme = themeId === "oscuro" ? "oscuro" : "claro";
  $("themeStudioTabClaro")?.classList.toggle("active", _activeTheme === "claro");
  $("themeStudioTabOscuro")?.classList.toggle("active", _activeTheme === "oscuro");
  renderEditor();
}

/** Snapshot de sesión activa durante loadAll/renderEditor. */
let _activeLoadSession = 0;

async function loadAll() {
  const session = _loadSession;
  _activeLoadSession = session;
  setStatus("Cargando…", true);
  const [catPack, metaPack] = await Promise.all([
    adminFetch("/api/theme/admin/catalog"),
    adminFetch("/api/theme/admin/meta"),
  ]);
  if (session !== _loadSession) return;
  const catData = catPack.data || {};
  const metaData = metaPack.data || {};
  if (catPack.networkError || !catPack.res) {
    throw new Error("No se pudo contactar al API de temas");
  }
  if (!catPack.res.ok || !catData.ok) {
    throw new Error(
      catData?.detail?.message || catData?.message || "No se pudo cargar el catálogo",
    );
  }
  if (!metaPack.res?.ok || !metaData.ok) {
    throw new Error(
      metaData?.detail?.message || metaData?.message || "No se pudo cargar el schema",
    );
  }
  _catalog = JSON.parse(JSON.stringify(catData.catalog));
  _schema = metaData.schema;
  _defaults = metaData.defaults
    ? JSON.parse(JSON.stringify(metaData.defaults))
    : null;
  _loadedJson = JSON.stringify(_catalog);
  const def = $("themeStudioDefault");
  if (def) def.value = _catalog.default_theme || "claro";
  if (session !== _loadSession) return;
  setActiveTab(_catalog.default_theme === "oscuro" ? "oscuro" : "claro");
  if (session !== _loadSession) return;
  setStatus("Catálogo cargado.", true);
  void loadThemeAssets();
  void loadProfiles();
}

function restoreDefaults() {
  if (!_defaults) {
    setStatus(
      "No hay catalog.defaults.json en el servidor; no se pueden restaurar defaults.",
      false,
    );
    return;
  }
  if (
    !window.confirm(
      "¿Poner los colores de fábrica en el editor? (no se publica hasta pulsar Guardar)",
    )
  ) {
    return;
  }
  _catalog = JSON.parse(JSON.stringify(_defaults));
  const def = $("themeStudioDefault");
  if (def) def.value = _catalog.default_theme || "claro";
  setActiveTab(_activeTheme);
  setStatus("Colores de fábrica en el editor. Pulse Guardar para publicarlos.", true);
}

function generateDark() {
  if (!_catalog?.themes?.claro || !_catalog?.themes?.oscuro) return;
  if (
    !window.confirm(
      "Se propondrá un tema oscuro basado en los colores del tema claro. Reemplaza los colores oscuros del editor (no se publica hasta Guardar). ¿Continuar?",
    )
  ) {
    return;
  }
  const next = generateDarkFromLight(_catalog.themes.claro.tokens || {});
  for (const [k, v] of Object.entries(next)) setTokenValue("oscuro", k, v);
  setActiveTab("oscuro");
  setStatus("Tema oscuro propuesto. Revise el semáforo y la vista previa antes de guardar.", true);
}

async function saveCatalog() {
  if (!_catalog) return;
  const def = $("themeStudioDefault")?.value;
  if (def === "claro" || def === "oscuro") _catalog.default_theme = def;
  const bad = legibilityReport(_catalog.themes?.[_activeTheme]?.tokens || {}, _activeTheme).filter(
    (r) => r.level === "bad",
  );
  if (bad.length && !window.confirm(`Hay ${bad.length} combinación(es) difíciles de leer. ¿Guardar de todos modos?`)) {
    return;
  }
  setStatus("Guardando…", true);
  const { res, data, networkError } = await adminFetch("/api/theme/admin/catalog", {
    method: "PUT",
    body: JSON.stringify({ catalog: _catalog }),
  });
  if (networkError || !res) {
    setStatus("No se pudo contactar al API", false);
    return;
  }
  const payload = data || {};
  if (!res.ok || !payload.ok) {
    const msg =
      payload?.detail?.message || payload?.message || `Error HTTP ${res.status}`;
    setStatus(String(msg), false);
    return;
  }
  _catalog = JSON.parse(JSON.stringify(payload.catalog));
  _loadedJson = JSON.stringify(_catalog);
  resetThemeCatalogCache();
  setStatus("Guardado. El portal tomará los colores al recargar (Ctrl+F5).", true);
  updatePreview();
}

/* ---------- vista previa real del portal ---------- */

let _previewTimer = 0;

function previewFrame() {
  return /** @type {HTMLIFrameElement|null} */ ($("themePreviewWrap")?.querySelector("iframe") || null);
}

function postPortalPreview() {
  const frame = previewFrame();
  if (!frame?.contentWindow || !_catalog) return;
  frame.contentWindow.postMessage(
    {
      type: "grosig-theme-preview",
      catalog: { themes: _catalog.themes, default_theme: _catalog.default_theme },
      theme: _previewTheme,
      branding: getBrandingDraftSlots(),
    },
    window.location.origin,
  );
}

function schedulePortalPreview() {
  if (!previewFrame()) return;
  clearTimeout(_previewTimer);
  _previewTimer = window.setTimeout(postPortalPreview, 150);
}

function fitPreviewFrame() {
  const wrap = $("themePreviewWrap");
  const frame = previewFrame();
  if (!wrap || !frame) return;
  const W = 1440;
  const scale = Math.min(1, wrap.clientWidth / W) || 0.5;
  frame.style.width = `${W}px`;
  frame.style.height = `${Math.ceil(wrap.clientHeight / scale)}px`;
  frame.style.transform = `scale(${scale})`;
}

function ensurePreviewFrame(reload = false) {
  const wrap = $("themePreviewWrap");
  if (!wrap) return;
  let frame = previewFrame();
  if (frame && !reload) {
    fitPreviewFrame();
    postPortalPreview();
    return;
  }
  wrap.innerHTML = "";
  frame = document.createElement("iframe");
  frame.title = "Vista previa del portal";
  frame.src = `./index.html?themePreview=1&t=${Date.now()}`;
  frame.addEventListener("load", () => postPortalPreview());
  wrap.appendChild(frame);
  fitPreviewFrame();
}

let _messageBound = false;

function bindPreviewMessages() {
  if (_messageBound) return;
  _messageBound = true;
  window.addEventListener("message", (ev) => {
    if (ev.origin !== window.location.origin) return;
    if (ev.data?.type !== "grosig-theme-preview-ready") return;
    if (ev.source === previewFrame()?.contentWindow) postPortalPreview();
  });
  window.addEventListener("resize", () => fitPreviewFrame());
  window.addEventListener("beforeunload", (ev) => {
    if (!$("themeStudioEditor")) return;
    if (isCatalogDirty() || isBrandingDirty()) {
      ev.preventDefault();
      ev.returnValue = "";
    }
  });
}

function setPreviewTheme(theme) {
  _previewTheme = theme === "oscuro" ? "oscuro" : "claro";
  const root = _uiRoot || document;
  root.querySelectorAll("[data-preview-theme]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-preview-theme") === _previewTheme);
  });
  postPortalPreview();
}

/* ---------- temas guardados ---------- */

function profilesStatus(msg, ok = true) {
  const el = $("themeProfilesStatus");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none", "text-success", "text-danger");
  el.classList.add(ok ? "text-success" : "text-danger");
}

function errText(pack, fallback) {
  const d = pack?.data || {};
  return d?.detail?.message || d?.message || fallback;
}

function renderProfiles(list) {
  const host = $("themeProfilesList");
  if (!host) return;
  if (!list?.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Todavía no hay temas guardados.</p>`;
    return;
  }
  const sw = (s) =>
    `<div class="theme-profile-sw">${["shell", "card", "accent", "text"]
      .map((k) => `<span style="background:${escapeAttr(s?.[k] || "transparent")}"></span>`)
      .join("")}</div>`;
  host.innerHTML = list
    .map((p) => {
      const when = p.saved_at ? new Date(p.saved_at).toLocaleString() : "";
      return (
        `<div class="border rounded p-2" data-profile="${escapeAttr(p.slug)}" data-profile-name="${escapeAttr(p.name)}">` +
        `<div class="fw-semibold small">${escapeHtml(p.name)}${p.auto ? ' <span class="badge text-bg-secondary">automático</span>' : ""}</div>` +
        `<div class="small text-muted mb-1">${escapeHtml(when)}${p.saved_by ? ` · ${escapeHtml(p.saved_by)}` : ""}</div>` +
        `<div class="small">Claro</div>${sw(p.swatches?.claro)}` +
        `<div class="small mt-1">Oscuro</div>${sw(p.swatches?.oscuro)}` +
        `<div class="small text-muted mt-1">${p.images?.length ? `${p.images.length} imagen(es) personalizada(s)` : "Imágenes originales"}</div>` +
        `<div class="d-flex gap-1 mt-2">` +
        `<button type="button" class="btn btn-sm btn-primary" data-profile-apply>Aplicar</button>` +
        `<button type="button" class="btn btn-sm btn-outline-danger" data-profile-del>Borrar</button>` +
        `</div></div>`
      );
    })
    .join("");
  host.querySelectorAll("[data-profile]").forEach((card) => {
    const slug = card.getAttribute("data-profile");
    const name = card.getAttribute("data-profile-name") || slug;
    card.querySelector("[data-profile-apply]")?.addEventListener("click", () => void applyProfile(slug, name));
    card.querySelector("[data-profile-del]")?.addEventListener("click", () => void deleteProfile(slug, name));
  });
}

async function loadProfiles() {
  const pack = await adminFetch("/api/theme/admin/profiles");
  if (pack.res?.ok && pack.data?.ok) renderProfiles(pack.data.profiles);
}

async function saveProfile() {
  const input = /** @type {HTMLInputElement|null} */ ($("themeProfileName"));
  const name = (input?.value || "").trim();
  if (!name) {
    profilesStatus("Escriba un nombre para el tema.", false);
    return;
  }
  if (isCatalogDirty() || isBrandingDirty()) {
    if (!window.confirm("Hay cambios sin guardar; se guardará el tema PUBLICADO (sin esos cambios). ¿Continuar?")) return;
  }
  const send = (overwrite) =>
    adminFetch("/api/theme/admin/profiles", { method: "POST", body: JSON.stringify({ name, overwrite }) });
  let pack = await send(false);
  if (pack.res?.status === 400 && /confirme/.test(errText(pack, ""))) {
    if (!window.confirm(`${errText(pack, "")}.\n\n¿Sobrescribir?`)) return;
    pack = await send(true);
  }
  if (!pack.res?.ok || !pack.data?.ok) {
    profilesStatus(errText(pack, "No se pudo guardar"), false);
    return;
  }
  if (input) input.value = "";
  renderProfiles(pack.data.profiles);
  profilesStatus(`Tema «${pack.data.name}» guardado.`, true);
}

async function applyProfile(slug, name) {
  if (!window.confirm(`¿Aplicar «${name}» al portal? El tema actual se guardará como «Respaldo automático».`)) return;
  const pack = await adminFetch(`/api/theme/admin/profiles/${encodeURIComponent(slug)}/apply`, { method: "POST" });
  if (!pack.res?.ok || !pack.data?.ok) {
    profilesStatus(errText(pack, "No se pudo aplicar"), false);
    return;
  }
  renderProfiles(pack.data.profiles);
  resetThemeCatalogCache();
  await loadAll().catch((e) => setStatus(e.message, false));
  const miss = pack.data.missing_images || [];
  profilesStatus(
    miss.length
      ? `Aplicado. Estas imágenes ya no existen y se usará la original: ${miss.join(", ")}`
      : `«${name}» aplicado al portal.`,
    !miss.length,
  );
}

async function deleteProfile(slug, name) {
  if (!window.confirm(`¿Borrar el tema guardado «${name}»?`)) return;
  const pack = await adminFetch(`/api/theme/admin/profiles/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!pack.res?.ok || !pack.data?.ok) {
    profilesStatus(errText(pack, "No se pudo borrar"), false);
    return;
  }
  renderProfiles(pack.data.profiles);
  profilesStatus(`«${name}» borrado.`, true);
}

/* ---------- revisión técnica ---------- */

async function loadHealth() {
  const host = $("themeStudioHealth");
  if (!host) return;
  host.textContent = "Revisando…";
  const pack = await adminFetch("/api/theme/admin/health");
  const d = pack.data || {};
  if (!pack.res?.ok || !d.ok) {
    host.textContent = errText(pack, "No se pudo revisar");
    return;
  }
  if (!d.css_available) {
    host.textContent = "El servidor no ve los CSS del portal (falta montar htdocs/atlas_gro/css en /data/ui_css).";
    return;
  }
  const mark = (ok) => (ok ? "✓" : "⚠");
  const drift = d.fallback_drift || [];
  const undef = d.undefined_vars || [];
  const files = Object.entries(d.hardcoded?.per_file || {})
    .map(([f, c]) => [f, c.claro + c.oscuro, c])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const sus = d.suspicious || [];
  host.innerHTML =
    `<div>${mark(!drift.length)} Respaldo de colores (layout.css) ${drift.length ? `con ${drift.length} diferencia(s)` : "coincide con el catálogo"}</div>` +
    `<div>${mark(!undef.length)} Variables usadas sin definir: ${undef.length}` +
    (undef.length
      ? `<ul class="mb-1">${undef.slice(0, 15).map((u) => `<li><code>${escapeHtml(u.var)}</code> ×${u.uses} (${escapeHtml(u.first)})</li>`).join("")}</ul>`
      : "") +
    `</div>` +
    `<div class="mt-1">Colores fijos que este Studio aún no controla: claro ${d.hardcoded?.total?.claro ?? 0}, oscuro ${d.hardcoded?.total?.oscuro ?? 0}</div>` +
    `<ul class="mb-1">${files.map(([f, n, c]) => `<li>${escapeHtml(f)}: ${n} (claro ${c.claro} / oscuro ${c.oscuro})</li>`).join("")}</ul>` +
    `<div>${mark(!d.suspicious_count)} Posibles fondos claros en tema oscuro (u oscuros en claro): ${d.suspicious_count || 0}</div>` +
    (sus.length
      ? `<ul class="theme-diff-list mb-0">${sus
          .slice(0, 40)
          .map((s) => `<li><span class="theme-diff-sw" style="background:${escapeAttr(s.value)}"></span> [${s.theme}] ${escapeHtml(s.file)}:${s.line} <code>${escapeHtml(s.selector)}</code></li>`)
          .join("")}</ul>`
      : "");
}

/* ---------- secciones y cableado ---------- */

function setSection(section) {
  const root = _uiRoot || document;
  root.querySelectorAll("[data-ts-section]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-ts-section") === section);
  });
  root.querySelectorAll("[data-ts-pane]").forEach((pane) => {
    pane.classList.toggle("d-none", pane.getAttribute("data-ts-pane") !== section);
  });
  if (section === "images") refreshThemeAssetsPreview();
  if (section === "preview") ensurePreviewFrame();
  if (section === "profiles") void loadProfiles();
}

function wireThemeStudioUi() {
  const root = _uiRoot || document;
  bindPreviewMessages();
  root.querySelectorAll("[data-ts-section]").forEach((btn) => {
    btn.addEventListener("click", () => setSection(btn.getAttribute("data-ts-section")));
  });
  root.querySelectorAll("[data-preview-theme]").forEach((btn) => {
    btn.addEventListener("click", () => setPreviewTheme(btn.getAttribute("data-preview-theme")));
  });
  bindThemeAssetsUi($, () => _catalog, () => schedulePortalPreview());
  $("themePreviewReloadBtn")?.addEventListener("click", () => ensurePreviewFrame(true));
  $("themeProfileSaveBtn")?.addEventListener("click", () => void saveProfile());
  $("themeStudioAdvanced")?.addEventListener("change", (ev) => {
    _advanced = /** @type {HTMLInputElement} */ (ev.target).checked;
    localStorage.setItem(ADVANCED_KEY, _advanced ? "1" : "0");
    renderEditor();
  });
  $("themeStudioTabClaro")?.addEventListener("click", () => setActiveTab("claro"));
  $("themeStudioTabOscuro")?.addEventListener("click", () => setActiveTab("oscuro"));
  $("themeStudioSaveBtn")?.addEventListener("click", () => void saveCatalog());
  $("themeStudioReloadBtn")?.addEventListener("click", () => {
    if (isCatalogDirty() && !window.confirm("¿Descartar los cambios de colores sin guardar?")) return;
    void loadAll().catch((e) => setStatus(e.message, false));
  });
  $("themeStudioGenDarkBtn")?.addEventListener("click", () => generateDark());
  $("themeStudioHealthBox")?.addEventListener("toggle", (ev) => {
    if (/** @type {HTMLDetailsElement} */ (ev.target).open) void loadHealth();
  });
  $("themeStudioRestoreBtn")?.addEventListener("click", () => restoreDefaults());
  $("themeStudioDefault")?.addEventListener("change", () => {
    if (_catalog) _catalog.default_theme = $("themeStudioDefault").value;
    renderDiff();
  });
}

/** Shell v2 — enlazar UI tras montar panel en #gs2StudioMount */
export function bindThemeStudioUi(root) {
  bumpThemeStudioSession();
  _uiRoot = root instanceof HTMLElement ? root : null;
  wireThemeStudioUi();
}

/** Shell v2 — cargar catálogo y schema */
export function enterThemeStudioDashboard() {
  return loadAll();
}

async function init() {
  wireThemeStudioUi();

  const shell = createStudioShell(studioIdsFromPrefix("themeStudio"), {
    activeNav: "theme",
    welcomeSuffix: " (visor_admin)",
    onEnterDashboard: () => loadAll(),
    onDashboardError: (err) =>
      setStatus(err?.message || "Error al cargar", false),
  });
  await shell.boot();
}

if (document.getElementById("themeStudioLoginForm")) {
  void init();
}
