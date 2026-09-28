/**
 * Tema claro/oscuro: persiste en localStorage y emite atlasgro-themechange.
 * Tokens de color: catálogo data-driven GET /api/theme/catalog (fallback: layout.css).
 */
import { apiUrl } from "./atlasConfig.js";

const STORAGE_KEY = "atlasgro-theme";
/** default_theme del catálogo, cacheado para el script inline anti-flash. */
const DEFAULT_KEY = "atlasgro-theme-default";
export const THEMES = /** @type {const} */ (["claro", "oscuro"]);

let _themeUiBound = false;
/** @type {object|null} */
let _catalogCache = null;
let _catalogPromise = null;
/** @type {string[]} */
let _appliedTokenKeys = [];
/** Vista previa del Theme Studio: el borrador manda sobre el catálogo del servidor. */
let _previewLock = false;

/**
 * @returns {"claro" | "oscuro"}
 */
export function readStoredTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  if (THEMES.includes(/** @type {any} */ (v))) return v;
  const d = localStorage.getItem(DEFAULT_KEY);
  return THEMES.includes(/** @type {any} */ (d)) ? d : "claro";
}

/** true si el visitante eligió tema explícitamente (si no, manda default_theme). */
export function hasUserTheme() {
  return THEMES.includes(/** @type {any} */ (localStorage.getItem(STORAGE_KEY)));
}

function clearAppliedTokens() {
  const root = document.documentElement;
  for (const key of _appliedTokenKeys) {
    root.style.removeProperty(key);
  }
  _appliedTokenKeys = [];
}

/**
 * Aplica tokens CSS del tema activo desde el catálogo (si está cargado).
 * @param {"claro"|"oscuro"} themeName
 */
export function applyCatalogTokens(themeName) {
  const t = THEMES.includes(themeName) ? themeName : "claro";
  clearAppliedTokens();
  const theme = _catalogCache?.themes?.[t];
  const tokens = theme?.tokens;
  if (!tokens || typeof tokens !== "object") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    if (!key.startsWith("--") || value == null || value === "") continue;
    root.style.setProperty(key, String(value));
    // Derivados usados en layout.css
    if (key === "--accent-rgb") {
      root.style.setProperty("--accent", `rgb(${value})`);
      _appliedTokenKeys.push("--accent");
      root.style.setProperty("--chart-js-bar-fill", `rgba(${value}, 0.42)`);
      root.style.setProperty("--chart-js-bar-stroke", `rgba(${value}, 0.92)`);
      _appliedTokenKeys.push("--chart-js-bar-fill", "--chart-js-bar-stroke");
    }
    _appliedTokenKeys.push(key);
  }
}

export async function loadThemeCatalog(force = false) {
  if (_catalogCache && !force) return _catalogCache;
  if (_catalogPromise && !force) return _catalogPromise;
  _catalogPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/api/theme/catalog"), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (_previewLock) return _catalogCache;
      if (!res.ok || !data?.ok) {
        _catalogCache = null;
        return null;
      }
      _catalogCache = data;
      return data;
    } catch {
      if (_previewLock) return _catalogCache;
      _catalogCache = null;
      return null;
    } finally {
      _catalogPromise = null;
    }
  })();
  return _catalogPromise;
}

/**
 * @param {"claro" | "oscuro"} name
 * @param {{ persist?: boolean }} [opts] persist=false no fija la elección del visitante
 */
export function applyTheme(name, opts = {}) {
  const t = THEMES.includes(name) ? name : "claro";
  document.documentElement.setAttribute("data-theme", t);
  if (opts.persist !== false && !_previewLock) localStorage.setItem(STORAGE_KEY, t);
  applyCatalogTokens(t);
  window.dispatchEvent(
    new CustomEvent("atlasgro-themechange", { detail: { theme: t } })
  );
}

function syncThemeUi(theme) {
  const t = THEMES.includes(theme) ? theme : "claro";
  const track = document.getElementById("themeSwitchTrack");
  const lblClaro = document.getElementById("themeLabelClaro");
  const lblOscuro = document.getElementById("themeLabelOscuro");
  if (track) {
    track.setAttribute("aria-checked", t === "oscuro" ? "true" : "false");
    track.title = t === "oscuro" ? "Tema oscuro" : "Tema claro";
  }
  lblClaro?.classList.toggle("is-active", t === "claro");
  lblOscuro?.classList.toggle("is-active", t === "oscuro");
  document.querySelectorAll(".studio-theme-picker [data-studio-theme]").forEach((btn) => {
    const on = btn.getAttribute("data-studio-theme") === t;
    btn.classList.toggle("active", on);
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "oscuro" ? "claro" : "oscuro");
}

/** Un solo enlace de eventos (evita doble toggle por clic). */
export function initThemeSelector() {
  let t = document.documentElement.getAttribute("data-theme");
  if (!THEMES.includes(/** @type {any} */ (t))) {
    t = readStoredTheme();
    document.documentElement.setAttribute("data-theme", t);
  }
  syncThemeUi(/** @type {"claro"|"oscuro"} */ (t));

  void loadThemeCatalog().then((cat) => {
    if (!cat || _previewLock) return;
    const def = cat.default_theme;
    if (THEMES.includes(def)) {
      localStorage.setItem(DEFAULT_KEY, def);
      if (!hasUserTheme()) document.documentElement.setAttribute("data-theme", def);
    }
    const cur =
      document.documentElement.getAttribute("data-theme") || readStoredTheme();
    applyCatalogTokens(/** @type {"claro"|"oscuro"} */ (cur));
    window.dispatchEvent(
      new CustomEvent("atlasgro-themechange", { detail: { theme: cur } })
    );
  });

  if (_themeUiBound) return;
  _themeUiBound = true;

  document.addEventListener("click", (ev) => {
    const studioBtn = /** @type {HTMLElement|null} */ (
      ev.target instanceof Element
        ? ev.target.closest(".studio-theme-picker [data-studio-theme]")
        : null
    );
    if (studioBtn) {
      applyTheme(studioBtn.getAttribute("data-studio-theme") === "oscuro" ? "oscuro" : "claro");
    }
  });

  const picker = document.querySelector(".sidebar-theme-picker");
  if (picker) {
    picker.addEventListener("click", (ev) => {
      const target = /** @type {HTMLElement} */ (ev.target);
      if (target.id === "themeLabelClaro" || target.closest("#themeLabelClaro")) {
        applyTheme("claro");
        return;
      }
      if (target.id === "themeLabelOscuro" || target.closest("#themeLabelOscuro")) {
        applyTheme("oscuro");
        return;
      }
      if (target.id === "themeSwitchTrack" || target.closest("#themeSwitchTrack")) {
        toggleTheme();
      }
    });
  }

  window.addEventListener("atlasgro-themechange", (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail;
    syncThemeUi(detail?.theme || readStoredTheme());
  });
}

/** Invalida caché tras guardar en Theme Studio (misma pestaña). */
export function resetThemeCatalogCache() {
  _catalogCache = null;
  _catalogPromise = null;
}

/**
 * Inyecta catálogo en memoria (p. ej. preview en Theme Studio).
 * Forma esperada: { themes, default_theme?, ... } como en GET /api/theme/catalog.
 * @param {object|null} payload
 */
export function setThemeCatalogCache(payload) {
  _catalogCache = payload;
  _catalogPromise = null;
}

/**
 * Vista previa (portal dentro del Theme Studio): aplica un borrador sin guardar nada.
 * @param {{themes: object, default_theme?: string}} payload
 * @param {"claro"|"oscuro"} themeName
 */
export function applyPreviewCatalog(payload, themeName) {
  _previewLock = true;
  _catalogCache = { ok: true, ...payload };
  applyTheme(themeName, { persist: false });
}
