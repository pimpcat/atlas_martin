/**
 * Navegación compartida entre Studios administrativos de GroSIG.
 * Uso: mountStudioNav(containerEl, { active: "geography" })
 */
const STUDIO_LINKS = [
  { id: "hub", href: "./grosig-studio.html", label: "GroSIG Studio" },
  { id: "visor", href: "./visor-studio.html", label: "Visor" },
  { id: "geography", href: "./geography-studio.html", label: "Geography" },
  { id: "inv", href: "./inv-studio.html", label: "INV" },
  { id: "explorer", href: "./explorer-studio.html", label: "Explorer" },
  { id: "indicators", href: "./indicators-studio.html", label: "Indicators" },
  { id: "cartography", href: "./cartography-studio.html", label: "Cartography" },
  { id: "theme", href: "./theme-studio.html", label: "Theme" },
  { id: "data-refresh", href: "./data-refresh-studio.html", label: "Data Refresh" },
  { id: "backup", href: "./backup-studio.html", label: "Backup" },
  { id: "atlas", href: "./index.html", label: "Atlas" },
];

/**
 * @param {HTMLElement|null} el
 * @param {{ active?: string }} [opts]
 */
export function mountStudioNav(el, opts = {}) {
  if (!el) return;
  const active = String(opts.active || "").toLowerCase();
  const showPicker = opts.themePicker !== false && active !== "theme";
  el.classList.add("grosig-studio-nav", "d-flex", "flex-wrap", "gap-1", "align-items-center");
  const links = STUDIO_LINKS.map((link) => {
    const isActive = link.id === active;
    const cls = isActive
      ? "btn btn-sm btn-primary"
      : "btn btn-sm btn-outline-secondary";
    return `<a href="${link.href}" class="${cls}" ${isActive ? 'aria-current="page"' : ""}>${link.label}</a>`;
  }).join("");
  const picker = showPicker
    ? `<span class="studio-theme-picker btn-group ms-auto" role="group" aria-label="Tema visual">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-studio-theme="claro">Claro</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-studio-theme="oscuro">Oscuro</button>
      </span>`
    : "";
  el.innerHTML = `${links}${picker}`;
}

/** HTML compacto para pie de login (sin botones). */
export function studioLoginFooterHtml(activeId) {
  return STUDIO_LINKS.filter((l) => l.id !== activeId)
    .map((l) => `<a href="${l.href}">${l.label}</a>`)
    .join(" · ");
}

export { STUDIO_LINKS };
