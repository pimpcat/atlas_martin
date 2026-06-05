/**
 * Tema claro/oscuro: persiste en localStorage y emite atlasgro-themechange.
 * Depende de los controles en el sidebar de index.html.
 */

const STORAGE_KEY = "atlasgro-theme";
export const THEMES = /** @type {const} */ (["claro", "oscuro"]);

let _themeUiBound = false;

/**
 * @returns {"claro" | "oscuro"}
 */
export function readStoredTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  return THEMES.includes(/** @type {any} */ (v)) ? v : "claro";
}

/**
 * @param {"claro" | "oscuro"} name
 */
export function applyTheme(name) {
  const t = THEMES.includes(name) ? name : "claro";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(STORAGE_KEY, t);
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
    localStorage.setItem(STORAGE_KEY, t);
  }
  syncThemeUi(/** @type {"claro"|"oscuro"} */ (t));

  if (_themeUiBound) return;
  _themeUiBound = true;

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
    const next = ev.detail && ev.detail.theme ? ev.detail.theme : readStoredTheme();
    syncThemeUi(next);
  });
}
