/**
 * Visor geográfico — acceso al mapa y catálogo de capas (Fase D.1).
 */
import { staleCheck } from "../shell/mountGuard.js";
import {
  VISOR_CATALOG_ACTIONS_HTML,
  bindVisorCatalogStudioActions,
  initVisorCatalogStudioShell,
  teardownVisorCatalogStudioShell,
} from "./visorCatalogStudioShell.js";

export const VIEW_ID = "visor";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Visor geográfico",
  subtitle: "Mapa interactivo, shapefiles y publicación de capas",
  navActiveId: "visor",
};

const PANEL_HTML = `
<div class="gs2-studio-module gs2-studio-visor">
  <div class="gs2-studio-module__actions">
    <a class="gs2-btn gs2-btn--primary gs2-btn--sm" href="./index.html?visor=1" target="_blank" rel="noopener noreferrer">Abrir visor en el mapa</a>
  </div>
  ${VISOR_CATALOG_ACTIONS_HTML}
  <p class="gs2-card__sub gs2-studio-visor-map-note mb-0">
    Desde el mapa del Atlas también puede publicar capas y subir shapefiles (panel de capas, iconos de administrador).
    Los cambios del catálogo aplican en ambos lugares.
  </p>
</div>
`;

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountVisorStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  staleCheck(mountToken);
  mountEl.innerHTML = PANEL_HTML;
  staleCheck(mountToken);
  initVisorCatalogStudioShell();
  bindVisorCatalogStudioActions(mountEl);
  staleCheck(mountToken);
}

export function teardownVisorStudioV2() {
  teardownVisorCatalogStudioShell();
}
