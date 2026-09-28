/**
 * Shell compartido de Studios admin (Fase 3).
 * GroSIG — studioShell
 * Copyright (c) 2025–2026 Víctor Alfonso Jorge Navarro
 * Autoría: Víctor Alfonso Jorge Navarro — para INEGI Coordinación Estatal Guerrero.
 * Ver /NOTICE y /LICENSE en la raíz del stack.
 *
 * Login / dashboard gate / logout / nav / toast — sin rediseño visual.
 *
 * Uso típico:
 *   const shell = createStudioShell({ ...ids }, {
 *     activeNav: "theme",
 *     onEnterDashboard: () => loadAll(),
 *   });
 *   await shell.boot();
 */
import { applyTheme, hasUserTheme, initThemeSelector, readStoredTheme } from "./theme.js";
import {
  clearAdminSession,
  fillLoginInstanciasSelect,
  getAdminUser,
  isVisorAdminLoggedIn,
  loginAdmin,
  verifyAdminSession,
} from "./visorAdminAuth.js";
import { mountStudioNav, studioLoginFooterHtml } from "./studioNav.js";
import { mountStudioInstanceBadge } from "./studioInstanceBadge.js";

/**
 * @param {string|HTMLElement|null} elOrId
 * @returns {HTMLElement|null}
 */
function resolveEl(elOrId) {
  if (!elOrId) return null;
  if (typeof elOrId === "string") return document.getElementById(elOrId);
  return elOrId;
}

/**
 * Mensaje de estado (success/danger) en un elemento del dashboard.
 * @param {string|HTMLElement|null} elOrId
 * @param {string} msg
 * @param {boolean} [ok=true]
 */
export function setStudioStatus(elOrId, msg, ok = true) {
  const el = resolveEl(elOrId);
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    el.classList.remove("text-danger", "text-success");
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none", "text-danger", "text-success");
  el.classList.add(ok ? "text-success" : "text-danger");
}

/**
 * Error bajo el formulario de login (alert).
 * @param {string|HTMLElement|null} elOrId
 * @param {string} msg
 */
export function showStudioError(elOrId, msg) {
  const el = resolveEl(elOrId);
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

/**
 * HTML del card de login (mismas clases visuales que los Studios actuales).
 * @param {{ prefix: string, title: string, blurb?: string, maxWidth?: string }} opts
 */
export function studioLoginFormHtml(opts) {
  const prefix = opts.prefix;
  const title = opts.title || "Studio";
  const blurb =
    opts.blurb ||
    "Misma sesión admin que Visor Studio (rol visor_admin). Elija la entidad de la instancia.";
  const maxWidth = opts.maxWidth || "28rem";
  return `
    <section id="${prefix}LoginView" class="visor-studio-card-wrap">
      <div class="card shadow-sm visor-studio-card" style="max-width:${maxWidth};margin:2rem auto">
        <div class="card-body p-4">
          <h1 class="h5 mb-1">${title}</h1>
          <p class="small text-muted mb-3">${blurb}</p>
          <form id="${prefix}LoginForm" class="d-grid gap-3">
            <div>
              <label class="form-label small" for="${prefix}Entidad">Entidad</label>
              <select id="${prefix}Entidad" class="form-select form-select-sm" required>
                <option value="">Cargando instancias…</option>
              </select>
            </div>
            <div>
              <label class="form-label small" for="${prefix}User">Usuario</label>
              <input id="${prefix}User" class="form-control form-control-sm" autocomplete="username" required />
            </div>
            <div>
              <label class="form-label small" for="${prefix}Pass">Contraseña</label>
              <input id="${prefix}Pass" type="password" class="form-control form-control-sm" autocomplete="current-password" required />
            </div>
            <div id="${prefix}LoginError" class="small text-danger d-none" role="alert"></div>
            <button type="submit" class="btn btn-primary btn-sm">Entrar</button>
          </form>
          <p class="small text-muted mt-3 mb-0" id="${prefix}LoginFooter"></p>
        </div>
      </div>
    </section>`;
}

/**
 * Mapa de IDs típico a partir de un prefijo (`themeStudio`, `explorerStudio`, …).
 * @param {string} prefix
 * @param {{ loginError?: string }} [aliases] p. ej. explorer usa `explorerStudioError`
 */
export function studioIdsFromPrefix(prefix, aliases = {}) {
  return {
    loginView: `${prefix}LoginView`,
    dashboard: `${prefix}Dashboard`,
    loginForm: `${prefix}LoginForm`,
    entidad: `${prefix}Entidad`,
    user: `${prefix}User`,
    pass: `${prefix}Pass`,
    loginError: aliases.loginError || `${prefix}LoginError`,
    loginFooter: `${prefix}LoginFooter`,
    logoutBtn: `${prefix}LogoutBtn`,
    nav: `${prefix}Nav`,
    welcome: `${prefix}Welcome`,
  };
}

/**
 * @param {Record<string, string>} ids — mapa de roles → element id
 * @param {{
 *   activeNav: string,
 *   onEnterDashboard?: () => (void|Promise<void>),
 *   welcomeSuffix?: string,
 *   formatWelcome?: (user: object|null) => string,
 *   onDashboardError?: (err: Error) => void,
 * }} opts
 */
export function createStudioShell(ids, opts) {
  const activeNav = opts.activeNav || "";
  const welcomeSuffix = opts.welcomeSuffix ?? "";
  const formatWelcome = opts.formatWelcome;
  const onEnterDashboard = opts.onEnterDashboard;
  const onDashboardError = opts.onDashboardError;
  const onLogout = opts.onLogout;
  const onBeforeLogout = opts.onBeforeLogout;

  /** @param {string} key */
  const el = (key) => {
    const id = ids[key];
    return id ? document.getElementById(id) : null;
  };

  function showLogin() {
    document.documentElement.classList.remove("gs2-session-hint");
    el("loginView")?.classList.remove("d-none");
    el("dashboard")?.classList.add("d-none");
    const footer = el("loginFooter");
    if (footer && activeNav) {
      footer.innerHTML = studioLoginFooterHtml(activeNav);
    }
  }

  function showDashboard() {
    document.documentElement.classList.add("gs2-session-hint");
    el("loginView")?.classList.add("d-none");
    el("dashboard")?.classList.remove("d-none");
    const user = getAdminUser();
    const welcome = el("welcome");
    if (welcome) {
      if (typeof formatWelcome === "function") {
        welcome.textContent = formatWelcome(user);
      } else {
        welcome.textContent = user?.username
          ? `Sesión: ${user.username}${user.cve_ent ? ` · ${user.entidad || user.instancia_clave || ""} (${user.cve_ent})` : ""}${welcomeSuffix}`
          : "Sesión admin activa";
      }
    }
    const badgeMode = opts.instanceBadge ?? true;
    if (badgeMode !== false) {
      const badgeHost =
        typeof badgeMode === "string"
          ? document.getElementById(badgeMode)
          : badgeMode instanceof HTMLElement
            ? badgeMode
            : el("dashboard");
      mountStudioInstanceBadge(badgeHost, user);
    }
    if (activeNav) {
      const themePicker = opts.themePicker ?? activeNav !== "theme";
      mountStudioNav(el("nav"), {
        active: activeNav,
        themePicker,
      });
      if (themePicker) applyTheme(readStoredTheme(), { persist: hasUserTheme() });
    }
  }

  function entidadSelect() {
    return (
      el("entidad") ||
      el("loginForm")?.querySelector("select[id$='Entidad']") ||
      el("loginForm")?.querySelector("select") ||
      null
    );
  }

  function bindAuth() {
    void fillLoginInstanciasSelect(el("entidad") || el("loginForm"));
    el("loginForm")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      showStudioError(el("loginError"), "");
      try {
        const username = (el("user")?.value || "").trim();
        const password = el("pass")?.value || "";
        const cveEnt = (entidadSelect()?.value || "").trim();
        if (!cveEnt) {
          throw new Error("Seleccione la entidad de la instancia");
        }
        await loginAdmin(username, password, cveEnt);
        showDashboard();
        if (onEnterDashboard) await onEnterDashboard();
      } catch (err) {
        showStudioError(
          el("loginError"),
          err?.message || "Login fallido"
        );
      }
    });

    el("logoutBtn")?.addEventListener("click", () => {
      if (typeof onBeforeLogout === "function" && onBeforeLogout() === false) {
        return;
      }
      clearAdminSession();
      if (typeof onLogout === "function") onLogout();
      showLogin();
    });
  }

  /**
   * Arranque: bind + verify sesión o login.
   * @returns {Promise<{ loggedIn: boolean }>}
   */
  async function boot() {
    if (opts.initTheme !== false && activeNav !== "theme") {
      initThemeSelector();
    }
    bindAuth();
    if (isVisorAdminLoggedIn()) {
      if (opts.optimisticSession !== false) {
        showDashboard();
      }
      // Portal mapa usa failClosed; Studio tolera red caída (401 sí limpia sesión).
      const ok = await verifyAdminSession({ failClosed: false });
      if (ok) {
        showDashboard();
        if (onEnterDashboard) {
          try {
            await onEnterDashboard();
          } catch (err) {
            if (onDashboardError) onDashboardError(err);
            else throw err;
          }
        }
        return { loggedIn: true };
      }
      // Token inválido (401) → login; no dejar dashboard a medias.
      showLogin();
      return { loggedIn: false };
    }
    showLogin();
    return { loggedIn: false };
  }

  return {
    showLogin,
    showDashboard,
    boot,
    bindAuth,
    el,
  };
}
