/**
 * Geography Studio — módulo nativo en shell v2 (Fase D.2).
 */
import { createGeographyStudioController } from "../../../js/geographyStudioController.js";
import { staleCheck } from "../shell/mountGuard.js";

export const VIEW_ID = "geography";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Datos geográficos",
  subtitle: "Pestañas, menú y capas del módulo de geografía",
  navActiveId: "geography",
};

const PANEL_HTML = `
<div class="gs2-studio-module gs2-studio-geography">
  <div class="gs2-grid gs2-grid--2 gs2-studio-geo-grid">
    <div class="gs2-card gs2-studio-geo-list-card">
      <div class="gs2-card__head">
        <h2 class="gs2-card__title">Pestañas</h2>
        <button type="button" class="gs2-btn gs2-btn--primary gs2-btn--sm" id="geoStudioNewBtn">+ Nueva</button>
      </div>
      <div id="geoStudioList" class="gs2-geo-tab-list"></div>
    </div>
    <div class="gs2-studio-geo-editor">
      <div class="gs2-card gs2-mb-sm gs2-studio-geo-menu-card">
        <div class="gs2-card__head">
          <h2 class="gs2-card__title">Menú y layout</h2>
        </div>
        <div class="gs2-grid gs2-grid--3">
          <div class="gs2-field">
            <label class="gs2-label" for="geoMenuLabel">Título del ítem</label>
            <input id="geoMenuLabel" class="gs2-input" />
          </div>
          <div class="gs2-field">
            <label class="gs2-label" for="geoMenuSubtitle">Subtítulo</label>
            <input id="geoMenuSubtitle" class="gs2-input" />
          </div>
          <div class="gs2-field">
            <label class="gs2-label" for="geoMenuSection">Sección del menú</label>
            <input id="geoMenuSection" class="gs2-input" />
          </div>
          <div class="gs2-field gs2-field--inline">
            <label class="gs2-check-inline">
              <input type="checkbox" id="geoLayoutMacro" checked />
              Mini-mapa estatal
            </label>
          </div>
        </div>
      </div>

      <div class="gs2-card gs2-studio-geo-form-card">
        <div id="geoStudioFormEmpty" class="gs2-card__sub">Seleccione una pestaña o cree una nueva.</div>
        <form id="geoStudioForm" class="d-none gs2-form-stack">
          <fieldset class="gs2-fieldset">
            <legend class="gs2-fieldset__title">Identidad</legend>
            <div class="gs2-grid gs2-grid--4">
              <div class="gs2-field">
                <label class="gs2-label" for="fTabId">Identificador</label>
                <input id="fTabId" class="gs2-input" required pattern="[a-z][a-z0-9_]*" />
                <span class="gs2-hint">Solo minúsculas, números y _.</span>
              </div>
              <div class="gs2-field">
                <label class="gs2-label" for="fTabLabel">Etiqueta</label>
                <input id="fTabLabel" class="gs2-input" required />
              </div>
              <div class="gs2-field">
                <label class="gs2-label" for="fTabOrder">Orden</label>
                <input id="fTabOrder" type="number" class="gs2-input" value="10" />
              </div>
              <div class="gs2-field">
                <label class="gs2-label" for="fTabEnabled">Visible</label>
                <select id="fTabEnabled" class="gs2-select">
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset class="gs2-fieldset">
            <legend class="gs2-fieldset__title">Texto (tabla y campo)</legend>
            <div class="gs2-grid gs2-grid--3">
              <div class="gs2-field">
                <label class="gs2-label" for="fTextTable">Tabla</label>
                <select id="fTextTable" class="gs2-select"></select>
              </div>
              <div class="gs2-field">
                <label class="gs2-label" for="fTextField">Campo</label>
                <select id="fTextField" class="gs2-select"></select>
              </div>
              <div class="gs2-field">
                <label class="gs2-label" for="fTextKey">Clave mun.</label>
                <input id="fTextKey" class="gs2-input" value="cve_mun" />
              </div>
            </div>
          </fieldset>

          <fieldset class="gs2-fieldset gs2-fieldset--layers">
            <legend class="gs2-fieldset__title">Capas del Visor al activar la pestaña</legend>
            <p class="gs2-card__sub gs2-mb-sm">
              Solo capas publicadas en Visor Catalog. Las marcadas como núcleo no se editan en Visor Studio, pero sí se pueden seleccionar aquí.
            </p>
            <div id="fLayersBox" class="gs2-geo-layers-box"></div>
            <label class="gs2-check-inline gs2-mt-sm">
              <input type="checkbox" id="fShowLegend" />
              Mostrar leyenda / simbología
            </label>
          </fieldset>

          <div class="gs2-form-actions">
            <button type="submit" class="gs2-btn gs2-btn--primary">Guardar pestaña en borrador</button>
            <button type="button" class="gs2-btn gs2-btn--danger gs2-btn--sm" id="geoStudioDeleteBtn">Eliminar pestaña</button>
            <span id="geoStudioFormMsg" class="gs2-card__sub"></span>
          </div>
        </form>
      </div>

      <div class="gs2-form-actions gs2-studio-geo-publish">
        <button type="button" class="gs2-btn gs2-btn--primary" id="geoStudioPublishBtn">Publicar catálogo</button>
        <span id="geoStudioPublishMsg" class="gs2-card__sub"></span>
      </div>
    </div>
  </div>
</div>
`;

/** @type {ReturnType<typeof createGeographyStudioController>|null} */
let _controller = null;

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountGeographyStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  staleCheck(mountToken);
  mountEl.innerHTML = PANEL_HTML;
  staleCheck(mountToken);
  _controller = createGeographyStudioController(mountEl, { ui: "gs2" });
  _controller.bindUi();
  await _controller.enterDashboard();
  staleCheck(mountToken);
}

export function teardownGeographyStudioV2() {
  _controller = null;
}
