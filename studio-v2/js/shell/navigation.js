/**
 * Navegación lateral GroSIG Studio 2 (grupos del doc de modernización).
 */
import { isCartographyEnabled, probeCartographyHealth } from "../../../js/cartographyHealth.js";

export const NAV_GROUPS = [
  {
    id: "overview",
    label: "",
    items: [{ id: "overview", label: "Resumen", href: "./grosig-studio-v2.html", activeOn: "overview" }],
  },
  {
    id: "content",
    label: "Contenido",
    items: [
      { id: "visor", label: "Visor geográfico", href: "./grosig-studio-v2.html?view=visor", v2Native: true },
      { id: "geography", label: "Datos geográficos", href: "./grosig-studio-v2.html?view=geography", v2Native: true },
      { id: "indicators", label: "Indicadores", href: "./grosig-studio-v2.html?view=indicators", v2Native: true },
      { id: "inv", label: "Inventario Nacional de Viviendas", href: "./grosig-studio-v2.html?view=inv", v2Native: true },
      { id: "explorer", label: "Explorador municipal", href: "./grosig-studio-v2.html?view=explorer", v2Native: true },
    ],
  },
  {
    id: "design",
    label: "Diseño",
    items: [
      {
        id: "cartography",
        label: "Cartografía",
        href: "./grosig-studio-v2.html?view=cartography",
        v2Native: true,
        requiresCartography: true,
      },
      { id: "theme", label: "Tema", href: "./grosig-studio-v2.html?view=theme", v2Native: true },
    ],
  },
  {
    id: "operations",
    label: "Operaciones",
    items: [
      {
        id: "data-refresh",
        label: "Actualización de datos",
        href: "./grosig-studio-v2.html?view=data-refresh",
        v2Native: true,
      },
      { id: "backup", label: "Studio Respaldo", href: "./grosig-studio-v2.html?view=backup", v2Native: true },
      { id: "atlas", label: "Atlas (portal)", href: "./index.html", legacy: true, external: true },
    ],
  },
  {
    id: "administration",
    label: "Administración",
    items: [
      { id: "users", label: "Usuarios y roles", href: "./grosig-studio-v2.html?view=users", v2Native: true },
      { id: "nodo", label: "Instancias (Nodo)", href: "./grosig-studio-v2.html?view=nodo", v2Native: true },
    ],
  },
];

/**
 * @param {typeof NAV_GROUPS[number]["items"][number]} item
 * @param {{ cartographyEnabled?: boolean }} ctx
 */
function isNavItemVisible(item, ctx) {
  if (item.requiresCartography && !ctx.cartographyEnabled) return false;
  return true;
}

function createNavLink(item, activeId) {
  const el = document.createElement("a");
  el.className = "grosig-shell-v2__nav-link";
  el.href = item.href;
  if (item.id === activeId) el.classList.add("is-active");
  if (item.legacy) el.title = "Studio legacy (migración Fase D)";
  if (item.v2Native) el.title = "Módulo nativo en shell v2 (Fase D)";
  if (item.external) el.target = "_blank";
  el.rel = item.external ? "noopener noreferrer" : "";

  const dot = document.createElement("span");
  dot.className = "grosig-shell-v2__nav-dot";
  dot.setAttribute("aria-hidden", "true");
  el.appendChild(dot);

  const label = document.createElement("span");
  label.textContent = item.label;
  el.appendChild(label);

  return el;
}

/**
 * @param {HTMLElement} container
 * @param {{ activeId?: string, cartographyEnabled?: boolean }} [opts]
 */
export function renderSidebarNav(container, opts = {}) {
  if (!container) return;
  const activeId = opts.activeId || "overview";
  const ctx = { cartographyEnabled: opts.cartographyEnabled !== false };
  container.innerHTML = "";

  for (const group of NAV_GROUPS) {
    const visibleItems = group.items.filter((item) => isNavItemVisible(item, ctx));
    if (!visibleItems.length) continue;

    const wrap = document.createElement("div");
    wrap.className = "grosig-shell-v2__nav-group";
    if (group.label) {
      const lbl = document.createElement("div");
      lbl.className = "grosig-shell-v2__nav-label";
      lbl.textContent = group.label;
      wrap.appendChild(lbl);
    }
    for (const item of visibleItems) {
      wrap.appendChild(createNavLink(item, activeId));
    }
    container.appendChild(wrap);
  }
}

/**
 * Renderiza nav tras comprobar feature flags async (p. ej. Cartography).
 * @param {HTMLElement|null} container
 * @param {{ activeId?: string }} [opts]
 */
export async function renderSidebarNavWithFlags(container, opts = {}) {
  await probeCartographyHealth().catch(() => {});
  renderSidebarNav(container, {
    ...opts,
    cartographyEnabled: isCartographyEnabled(),
  });
}
