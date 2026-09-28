/**
 * Bloque compartido: publicar capa / gestionar catálogo (asistente del visor).
 */
import {
  clearVisorCatalogAdminInlineHost,
  initVisorCatalogAdminForStudio,
  openVisorCatalogManageModal,
  openVisorCatalogPublishWizard,
  setVisorCatalogAdminInlineHost,
} from "../../../js/visorCatalogAdmin.js";

export const VISOR_CATALOG_ACTIONS_HTML = `
<div class="gs2-card gs2-studio-visor-catalog">
  <div class="gs2-card__head">
    <h2 class="gs2-card__title">Catálogo de capas</h2>
  </div>
  <p class="gs2-card__sub gs2-mb-sm">
    Importe shapefiles (.shp / .zip) y publique capas en el visor. Mismo asistente que en el mapa del Atlas.
  </p>
  <div class="d-flex flex-wrap gap-2">
    <button type="button" class="gs2-btn gs2-btn--primary gs2-btn--sm" id="visorStudioPublishLayerBtn">
      Publicar capa
    </button>
    <button type="button" class="gs2-btn gs2-btn--secondary gs2-btn--sm" id="visorStudioManageLayersBtn">
      Gestionar capas
    </button>
  </div>
</div>
<div id="visorStudioCatalogEmbed" class="gs2-card gs2-studio-visor-catalog-embed gs2-studio-visor-catalog-embed--idle" aria-live="polite">
  <p class="gs2-card__sub mb-0" id="visorStudioCatalogEmbedHint">Seleccione Publicar capa o Gestionar capas.</p>
</div>
`;

/**
 * @param {HTMLElement|Document} root
 */
export function bindVisorCatalogStudioActions(root = document) {
  const q = (id) =>
    root instanceof Document ? root.getElementById(id) : root.querySelector(`#${id}`);

  const openInline = (mode) => {
    const host = q("visorStudioCatalogEmbed");
    if (!host) return;
    setVisorCatalogAdminInlineHost(host);
    if (mode === "publish") void openVisorCatalogPublishWizard();
    else void openVisorCatalogManageModal();
  };

  q("visorStudioPublishLayerBtn")?.addEventListener("click", () => openInline("publish"));
  q("visorStudioManageLayersBtn")?.addEventListener("click", () => openInline("manage"));
}

export function initVisorCatalogStudioShell() {
  initVisorCatalogAdminForStudio();
}

export function teardownVisorCatalogStudioShell() {
  clearVisorCatalogAdminInlineHost();
}
