/**
 * GroSIG Studio 2 — montaje del Administrative Shell (Fase B).
 */

const SIDEBAR_COLLAPSED_KEY = "gs2-sidebar-collapsed";

/**
 * @param {{ sidebar?: HTMLElement|null, toggle?: HTMLElement|null }} [opts]
 */
export function initSidebarCollapse(opts = {}) {
  const sidebar = opts.sidebar || document.querySelector(".grosig-shell-v2__sidebar");
  const toggle = opts.toggle || document.getElementById("gs2SidebarToggle");
  if (!sidebar || !toggle) return;

  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  if (stored) sidebar.classList.add("is-collapsed");

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("is-collapsed");
    localStorage.setItem(
      SIDEBAR_COLLAPSED_KEY,
      sidebar.classList.contains("is-collapsed") ? "1" : "0",
    );
  });
}

/**
 * @param {HTMLElement|null} wrap
 * @param {{ username?: string, entidad?: string, instancia_clave?: string, cve_ent?: string }} user
 */
export function mountTopbarUserChip(wrap, user) {
  if (!wrap) return;
  if (!user?.username) {
    wrap.innerHTML = "";
    return;
  }
  const initials = user.username.slice(0, 2).toUpperCase();
  const meta = user.instancia_clave || user.entidad || "admin";
  wrap.innerHTML = `
    <span class="gs2-user-chip__avatar" aria-hidden="true">${initials}</span>
    <span>${user.username} · ${meta}</span>
  `;
}

/**
 * @param {HTMLElement|null} el
 * @param {{ cve_ent?: string, entidad?: string, instancia_clave?: string }} user
 */
export function mountEntityPill(el, user) {
  if (!el || !user?.cve_ent) return;
  const clave = (user.instancia_clave || "INST").toUpperCase();
  const name = user.entidad || user.instancia_clave || "Instancia";
  el.textContent = `${name} (${user.cve_ent})`;
  el.setAttribute("data-clave", clave);
}

/**
 * Inicializa piezas del shell tras login.
 * @param {{ user?: object }} [opts]
 */
export function initShellLayout(opts = {}) {
  initSidebarCollapse({
    sidebar: document.querySelector(".grosig-shell-v2__sidebar"),
    toggle: document.getElementById("gs2SidebarToggle"),
  });
  const user = opts.user;
  mountTopbarUserChip(document.getElementById("gs2TopbarUser"), user);
  mountEntityPill(document.getElementById("gs2TopbarEnt"), user);
}
