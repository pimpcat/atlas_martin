/**
 * Usuarios y roles — administración de cuentas (Fase D).
 */
import { createVisorStudioUsersController } from "../../../js/visorStudioUsers.js";
import { staleCheck } from "../shell/mountGuard.js";

export const VIEW_ID = "users";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Usuarios y roles",
  subtitle: "Cuentas admin y cambio de contraseña",
  navActiveId: "users",
};

const PANEL_HTML = `
<div class="gs2-studio-module gs2-studio-users">
  <div class="gs2-card">
    <div class="gs2-studio-tabs" role="tablist">
      <button class="gs2-studio-tabs__btn is-active" type="button" data-studio-tab="users" role="tab" aria-selected="true">Usuarios</button>
      <button class="gs2-studio-tabs__btn" type="button" data-studio-tab="password" role="tab" aria-selected="false">Mi contraseña</button>
    </div>
    <div id="visorStudioUsersPanel" role="tabpanel">
      <div class="gs2-grid gs2-grid--2 gs2-studio-visor-grid">
        <div>
          <h2 class="gs2-card__title">Nuevo usuario</h2>
          <form id="visorStudioCreateUserForm" class="gs2-form-stack gs2-mt-sm">
            <div class="gs2-field">
              <label class="gs2-label" for="visorStudioNewUsername">Usuario</label>
              <input id="visorStudioNewUsername" class="gs2-input" pattern="[A-Za-z0-9_]{2,64}" required />
            </div>
            <div class="gs2-field">
              <label class="gs2-label" for="visorStudioNewDisplay">Nombre para mostrar</label>
              <input id="visorStudioNewDisplay" class="gs2-input" maxlength="120" />
            </div>
            <div class="gs2-field">
              <label class="gs2-label" for="visorStudioNewRole">Rol</label>
              <select id="visorStudioNewRole" class="gs2-select">
                <option value="visor_admin">Administrador del visor</option>
                <option value="viewer">Solo lectura (sin login admin)</option>
              </select>
            </div>
            <div class="gs2-field">
              <label class="gs2-label" for="visorStudioNewPassword">Contraseña</label>
              <input id="visorStudioNewPassword" type="password" class="gs2-input" minlength="8" required />
            </div>
            <div class="gs2-field">
              <label class="gs2-label" for="visorStudioNewPassword2">Repetir contraseña</label>
              <input id="visorStudioNewPassword2" type="password" class="gs2-input" minlength="8" required />
            </div>
            <button type="submit" class="gs2-btn gs2-btn--primary">Crear usuario</button>
          </form>
        </div>
        <div>
          <div class="gs2-card__head">
            <h2 class="gs2-card__title">Cuentas registradas</h2>
            <button type="button" class="gs2-btn gs2-btn--secondary gs2-btn--sm" id="visorStudioRefreshUsersBtn">Actualizar</button>
          </div>
          <div id="visorStudioUsersStatus" class="gs2-card__sub gs2-mb-sm">Cargando…</div>
          <div class="gs2-table-wrap">
            <table class="gs2-table">
              <thead>
                <tr><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody id="visorStudioUsersTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div id="visorStudioPasswordPanel" class="d-none" role="tabpanel">
      <h2 class="gs2-card__title">Cambiar mi contraseña</h2>
      <form id="visorStudioPasswordForm" class="gs2-form-stack gs2-studio-password-form">
        <div class="gs2-field">
          <label class="gs2-label" for="visorStudioCurrentPass">Contraseña actual</label>
          <input id="visorStudioCurrentPass" type="password" class="gs2-input" required />
        </div>
        <div class="gs2-field">
          <label class="gs2-label" for="visorStudioNewPass">Contraseña nueva</label>
          <input id="visorStudioNewPass" type="password" class="gs2-input" minlength="8" required />
        </div>
        <div class="gs2-field">
          <label class="gs2-label" for="visorStudioNewPass2">Repetir contraseña nueva</label>
          <input id="visorStudioNewPass2" type="password" class="gs2-input" minlength="8" required />
        </div>
        <button type="submit" class="gs2-btn gs2-btn--primary">Guardar contraseña</button>
      </form>
    </div>
    <div id="visorStudioDashMessage" class="gs2-form-error d-none mt-2" role="status"></div>
  </div>
</div>
`;

/** @type {ReturnType<typeof createVisorStudioUsersController>|null} */
let _controller = null;

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountUsersStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  staleCheck(mountToken);
  mountEl.innerHTML = PANEL_HTML;
  staleCheck(mountToken);
  _controller = createVisorStudioUsersController(mountEl, { ui: "gs2" });
  _controller.bindUi();
  await _controller.enterDashboard();
  staleCheck(mountToken);
}

export function teardownUsersStudioV2() {
  _controller = null;
}
