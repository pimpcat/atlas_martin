/**
 * Theme Studio — identidad de color claro/oscuro (catálogo data-driven).
 * Reutiliza sesión JWT de Visor Studio (visorAdminAuth.js).
 */
import {
  adminFetch,
  clearAdminSession,
  getAdminUser,
  isVisorAdminLoggedIn,
  loginAdmin,
  verifyAdminSession,
} from "./visorAdminAuth.js";
import {
  applyCatalogTokens,
  resetThemeCatalogCache,
  setThemeCatalogCache,
} from "./theme.js";
import { mountStudioNav, studioLoginFooterHtml } from "./studioNav.js";

const $ = (id) => document.getElementById(id);

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

function setStatus(msg, ok = true) {
  const el = $("themeStudioStatus");
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none", "text-danger", "text-success");
  el.classList.add(ok ? "text-success" : "text-danger");
}

function showLogin() {
  $("themeStudioLoginView")?.classList.remove("d-none");
  $("themeStudioDashboard")?.classList.add("d-none");
}

function showDashboard() {
  $("themeStudioLoginView")?.classList.add("d-none");
  $("themeStudioDashboard")?.classList.remove("d-none");
  const user = getAdminUser();
  const welcome = $("themeStudioWelcome");
  if (welcome) {
    welcome.textContent = user?.username
      ? `Sesión: ${user.username} (visor_admin)`
      : "Sesión admin activa";
  }
  mountStudioNav($("themeStudioNav"), { active: "theme" });
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
  box.style.background = bg;
  box.style.color = fg;
  box.style.borderColor = tokens["--shell-border"] || "rgba(0,0,0,0.2)";
  if (title) title.style.color = fg;
  if (muted) {
    muted.style.color = mu;
    muted.textContent = `Tema «${_catalog?.themes?.[_activeTheme]?.label || _activeTheme}»`;
  }
  if (btn) {
    btn.style.background = `rgb(${accentRgb})`;
    btn.style.borderColor = `rgb(${accentRgb})`;
    btn.style.color = "#fff";
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
}

function renderEditor() {
  const host = $("themeStudioEditor");
  const title = $("themeStudioEditorTitle");
  if (!host || !_schema) return;
  const label = _catalog?.themes?.[_activeTheme]?.label || _activeTheme;
  if (title) title.textContent = `Colores — tema ${label}`;

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

async function loadAll() {
  setStatus("Cargando…", true);
  const [catPack, metaPack] = await Promise.all([
    adminFetch("/api/theme/admin/catalog"),
    adminFetch("/api/theme/admin/meta"),
  ]);
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
  setActiveTab(_catalog.default_theme === "oscuro" ? "oscuro" : "claro");
  setStatus("Catálogo cargado.", true);
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
      "¿Restaurar colores de fábrica en el editor? (aún debes Guardar para persistir)",
    )
  ) {
    return;
  }
  _catalog = JSON.parse(JSON.stringify(_defaults));
  const def = $("themeStudioDefault");
  if (def) def.value = _catalog.default_theme || "claro";
  setActiveTab(_activeTheme);
  setStatus("Defaults en el editor. Pulsa Guardar para aplicarlos al portal.", true);
}

async function saveCatalog() {
  if (!_catalog) return;
  const def = $("themeStudioDefault")?.value;
  if (def === "claro" || def === "oscuro") _catalog.default_theme = def;
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

async function boot() {
  $("themeStudioLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr($("themeStudioLoginError"), "");
    try {
      await loginAdmin($("themeStudioUser").value.trim(), $("themeStudioPass").value);
      showDashboard();
      await loadAll();
    } catch (err) {
      showErr($("themeStudioLoginError"), err.message || "Login fallido");
    }
  });

  $("themeStudioLogoutBtn")?.addEventListener("click", () => {
    clearAdminSession();
    showLogin();
  });

  $("themeStudioTabClaro")?.addEventListener("click", () => setActiveTab("claro"));
  $("themeStudioTabOscuro")?.addEventListener("click", () => setActiveTab("oscuro"));
  $("themeStudioSaveBtn")?.addEventListener("click", () => void saveCatalog());
  $("themeStudioReloadBtn")?.addEventListener("click", () =>
    void loadAll().catch((e) => setStatus(e.message, false)),
  );
  $("themeStudioRestoreBtn")?.addEventListener("click", () => restoreDefaults());
  $("themeStudioDefault")?.addEventListener("change", () => {
    if (_catalog) _catalog.default_theme = $("themeStudioDefault").value;
  });

  if (isVisorAdminLoggedIn()) {
    const ok = await verifyAdminSession();
    if (ok) {
      showDashboard();
      try {
        await loadAll();
      } catch (err) {
        setStatus(err.message || "Error al cargar", false);
      }
      return;
    }
  }
  const footer = $("themeStudioLoginFooter");
  if (footer) footer.innerHTML = studioLoginFooterHtml("theme");
  showLogin();
}

void boot();
