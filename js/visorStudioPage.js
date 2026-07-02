/**
 * Página Visor Studio: login + gestión de usuarios admin.
 */
import { readStoredTheme } from "./theme.js";
import {
  changeMyAdminPassword,
  createAdminUserAccount,
  fetchAdminUsers,
  getAdminUser,
  isVisorAdminLoggedIn,
  loginAdmin,
  logoutAdmin,
  patchAdminUserAccount,
  resetAdminUserPassword,
  verifyAdminSession,
} from "./visorAdminAuth.js";

document.documentElement.setAttribute("data-theme", readStoredTheme());

const loginView = document.getElementById("visorStudioLoginView");
const dashboard = document.getElementById("visorStudioDashboard");
const errEl = document.getElementById("visorStudioError");
const dashMsg = document.getElementById("visorStudioDashMessage");
const welcomeEl = document.getElementById("visorStudioWelcome");
const usersBody = document.getElementById("visorStudioUsersTableBody");
const usersStatus = document.getElementById("visorStudioUsersStatus");

const ROLE_LABELS = {
  visor_admin: "Administrador",
  viewer: "Solo lectura",
};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function showDashMessage(text, kind = "success") {
  if (!dashMsg) return;
  dashMsg.textContent = text;
  dashMsg.className = `small mt-3 ${kind === "danger" ? "text-danger" : "text-success"}`;
  dashMsg.classList.remove("d-none");
  window.setTimeout(() => dashMsg?.classList.add("d-none"), 5000);
}

function showLogin() {
  loginView?.classList.remove("d-none");
  dashboard?.classList.add("d-none");
}

function showDashboard(user) {
  loginView?.classList.add("d-none");
  dashboard?.classList.remove("d-none");
  if (welcomeEl) {
    const name = user?.display_name || user?.username || "Administrador";
    welcomeEl.textContent = `Sesión: ${name}`;
  }
}

function setStudioTab(tab) {
  const usersPanel = document.getElementById("visorStudioUsersPanel");
  const passPanel = document.getElementById("visorStudioPasswordPanel");
  document.querySelectorAll("[data-studio-tab]").forEach((btn) => {
    const active = btn.getAttribute("data-studio-tab") === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  usersPanel?.classList.toggle("d-none", tab !== "users");
  passPanel?.classList.toggle("d-none", tab !== "password");
}

async function loadUsersTable() {
  if (!usersBody || !usersStatus) return;
  usersStatus.textContent = "Cargando…";
  usersBody.innerHTML = "";
  try {
    const users = await fetchAdminUsers();
    const me = getAdminUser();
    if (!users.length) {
      usersStatus.textContent = "No hay usuarios registrados.";
      return;
    }
    usersStatus.textContent = `${users.length} cuenta(s). Último acceso en la tabla.`;
    usersBody.innerHTML = users
      .map((u) => {
        const isSelf = me && Number(me.id) === Number(u.id);
        const active = u.active !== false;
        return `
        <tr data-user-id="${u.id}">
          <td>
            <div class="fw-semibold">${escapeHtml(u.display_name || u.username)}</div>
            <div class="text-muted small"><code>${escapeHtml(u.username)}</code></div>
            <div class="text-muted small">Último acceso: ${escapeHtml(formatWhen(u.last_login))}</div>
          </td>
          <td class="small">${escapeHtml(ROLE_LABELS[u.role] || u.role)}</td>
          <td class="small">
            <span class="badge ${active ? "text-bg-success" : "text-bg-secondary"}">${active ? "Activo" : "Inactivo"}</span>
          </td>
          <td class="text-end">
            <div class="d-flex flex-column gap-1 align-items-end">
              <button type="button" class="btn btn-sm btn-outline-primary" data-reset-pass="${u.id}" data-username="${escapeHtml(u.username)}">Nueva contraseña</button>
              ${
                isSelf
                  ? ""
                  : `<button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-active="${u.id}" data-active="${active ? "1" : "0"}">${active ? "Desactivar" : "Activar"}</button>`
              }
            </div>
          </td>
        </tr>`;
      })
      .join("");

    usersBody.querySelectorAll("[data-reset-pass]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-reset-pass");
        const username = btn.getAttribute("data-username") || "";
        const pwd1 = window.prompt(`Nueva contraseña para «${username}» (mín. 8 caracteres):`);
        if (!pwd1) return;
        const pwd2 = window.prompt("Repita la contraseña:");
        if (!pwd2 || pwd1 !== pwd2) {
          window.alert("Las contraseñas no coinciden.");
          return;
        }
        if (pwd1.length < 8) {
          window.alert("Use al menos 8 caracteres.");
          return;
        }
        try {
          const data = await resetAdminUserPassword(userId, pwd1);
          showDashMessage(data?.message || "Contraseña actualizada.");
        } catch (err) {
          window.alert(err?.message || "No se pudo restablecer la contraseña.");
        }
      });
    });

    usersBody.querySelectorAll("[data-toggle-active]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-toggle-active");
        const currentlyActive = btn.getAttribute("data-active") === "1";
        const label = currentlyActive ? "desactivar" : "activar";
        if (!window.confirm(`¿Confirma ${label} esta cuenta?`)) return;
        try {
          await patchAdminUserAccount(userId, { active: !currentlyActive });
          showDashMessage(currentlyActive ? "Usuario desactivado." : "Usuario activado.");
          await loadUsersTable();
        } catch (err) {
          window.alert(err?.message || "No se pudo actualizar el usuario.");
        }
      });
    });
  } catch (err) {
    usersStatus.textContent = err?.message || "Error al cargar usuarios.";
  }
}

async function boot() {
  document.querySelectorAll("[data-studio-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setStudioTab(btn.getAttribute("data-studio-tab") || "users"));
  });

  document.getElementById("visorStudioRefreshUsersBtn")?.addEventListener("click", () => void loadUsersTable());

  document.getElementById("visorStudioLogoutBtn")?.addEventListener("click", async () => {
    await logoutAdmin();
    showLogin();
  });

  document.getElementById("visorStudioLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    errEl?.classList.add("d-none");
    const username = document.getElementById("visorStudioUser")?.value?.trim();
    const password = document.getElementById("visorStudioPass")?.value || "";
    try {
      const user = await loginAdmin(username, password);
      showDashboard(user);
      setStudioTab("users");
      await loadUsersTable();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err?.message || "Error de acceso";
        errEl.classList.remove("d-none");
      }
    }
  });

  document.getElementById("visorStudioCreateUserForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const username = document.getElementById("visorStudioNewUsername")?.value?.trim();
    const display_name = document.getElementById("visorStudioNewDisplay")?.value?.trim();
    const role = document.getElementById("visorStudioNewRole")?.value || "visor_admin";
    const password = document.getElementById("visorStudioNewPassword")?.value || "";
    const password2 = document.getElementById("visorStudioNewPassword2")?.value || "";
    if (password !== password2) {
      window.alert("Las contraseñas no coinciden.");
      return;
    }
    try {
      const data = await createAdminUserAccount({
        username,
        password,
        display_name: display_name || undefined,
        role,
      });
      showDashMessage(data?.message || "Usuario creado.");
      ev.target.reset();
      await loadUsersTable();
    } catch (err) {
      window.alert(err?.message || "No se pudo crear el usuario.");
    }
  });

  document.getElementById("visorStudioPasswordForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const current_password = document.getElementById("visorStudioCurrentPass")?.value || "";
    const new_password = document.getElementById("visorStudioNewPass")?.value || "";
    const new_password2 = document.getElementById("visorStudioNewPass2")?.value || "";
    if (new_password !== new_password2) {
      window.alert("Las contraseñas nuevas no coinciden.");
      return;
    }
    try {
      const data = await changeMyAdminPassword(current_password, new_password);
      showDashMessage(data?.message || "Contraseña actualizada.");
      ev.target.reset();
    } catch (err) {
      window.alert(err?.message || "No se pudo cambiar la contraseña.");
    }
  });

  if (isVisorAdminLoggedIn()) {
    const user = await verifyAdminSession();
    if (user) {
      showDashboard(user);
      const hash = (window.location.hash || "").replace("#", "");
      setStudioTab(hash === "password" ? "password" : "users");
      await loadUsersTable();
      return;
    }
  }
  showLogin();
}

void boot();
