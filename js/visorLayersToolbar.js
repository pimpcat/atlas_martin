/**
 * Barra de acciones del encabezado del panel «Capas» (visor geográfico).
 */

/** @returns {HTMLElement | null} */
export function ensureVisorLayersHeaderToolbar() {
  const header = document.querySelector("#dashboardVisor .visor-layers-card .card-header");
  if (!header) return null;

  if (!header.classList.contains("visor-layers-card__header")) {
    header.classList.add(
      "visor-layers-card__header",
      "d-flex",
      "align-items-start",
      "justify-content-between",
      "gap-2",
    );
    const titleWrap = document.createElement("div");
    while (header.firstChild) titleWrap.appendChild(header.firstChild);
    header.appendChild(titleWrap);
  }

  let toolbar = header.querySelector(".visor-layers-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "visor-layers-toolbar d-flex align-items-center gap-1 flex-shrink-0";
    header.appendChild(toolbar);
  }
  return toolbar;
}
