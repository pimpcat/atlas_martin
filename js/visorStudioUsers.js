/**
 * Gestión de usuarios admin del Visor Studio (compartido legacy + shell v2).
 * @param {Document|ParentNode} [root=document]
 */
export function createVisorStudioUsersController(root = document, opts = {}) {
  const el = (id) =>
    root instanceof Document
      ? root.getElementById(id)
      : root.querySelector(`#${id}`);

  const gs2 =
    opts.ui === "gs2" ||
    (opts.ui !== "legacy" && Boolean(root.querySelector?.(".gs2-studio-module")));

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
    const dashMsg = el("visorStudioDashMessage");
    if (!dashMsg) return;
    dashMsg.textContent = text;
    if (gs2) {
      dashMsg.className =
        kind === "danger"
          ? "gs2-form-error mt-2"
          : "gs2-status gs2-status--success mt-2";
    } else {
      dashMsg.className = `small mt-3 ${kind === "danger" ? "text-danger" : "text-success"}`;
    }
    dashMsg.classList.remove("d-none");
    window.setTimeout(() => dashMsg?.classList.add("d-none"), 5000);
  }

  function setStudioTab(tab) {
    const usersPanel = el("visorStudioUsersPanel");
    const passPanel = el("visorStudioPasswordPanel");
    root.querySelectorAll("[data-studio-tab]").forEach((btn) => {
      const active = btn.getAttribute("data-studio-tab") === tab;
      btn.classList.toggle("is-active", active);
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    usersPanel?.classList.toggle("d-none", tab !== "users");
    passPanel?.classList.toggle("d-none", tab !== "password");
  }

  async function loadUsersTable() {
    const usersBody = el("visorStudioUsersTableBody");
    const usersStatus = el("visorStudioUsersStatus");
    if (!usersBody || !usersStatus) return;

    const { fetchAdminUsers, getAdminUser, resetAdminUserPassword, patchAdminUserAccount } =
      await import("./visorAdminAuth.js");

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
          const statusBadge = gs2
            ? `<span class="gs2-status ${active ? "gs2-status--success" : "gs2-status--muted"}">${active ? "Activo" : "Inactivo"}</span>`
            : `<span class="badge ${active ? "text-bg-success" : "text-bg-secondary"}">${active ? "Activo" : "Inactivo"}</span>`;
          const resetBtn = gs2
            ? `<button type="button" class="gs2-btn gs2-btn--secondary gs2-btn--sm" data-reset-pass="${u.id}" data-username="${escapeHtml(u.username)}">Nueva contraseña</button>`
            : `<button type="button" class="btn btn-sm btn-outline-primary" data-reset-pass="${u.id}" data-username="${escapeHtml(u.username)}">Nueva contraseña</button>`;
          const toggleBtn = gs2
            ? `<button type="button" class="gs2-btn gs2-btn--ghost gs2-btn--sm" data-toggle-active="${u.id}" data-active="${active ? "1" : "0"}">${active ? "Desactivar" : "Activar"}</button>`
            : `<button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-active="${u.id}" data-active="${active ? "1" : "0"}">${active ? "Desactivar" : "Activar"}</button>`;
          return `
        <tr data-user-id="${u.id}">
          <td>
            <div class="fw-semibold">${escapeHtml(u.display_name || u.username)}</div>
            <div class="text-muted small"><code>${escapeHtml(u.username)}</code></div>
            <div class="text-muted small">Último acceso: ${escapeHtml(formatWhen(u.last_login))}</div>
          </td>
          <td class="small">${escapeHtml(ROLE_LABELS[u.role] || u.role)}</td>
          <td class="small">${statusBadge}</td>
          <td class="text-end">
            <div class="d-flex flex-column gap-1 align-items-end">
              ${resetBtn}
              ${isSelf ? "" : toggleBtn}
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

  async function enterDashboard() {
    const hash = (window.location.hash || "").replace("#", "");
    setStudioTab(hash === "password" ? "password" : "users");
    await loadUsersTable();
  }

  function bindUi() {
    root.querySelectorAll("[data-studio-tab]").forEach((btn) => {
      btn.addEventListener("click", () =>
        setStudioTab(btn.getAttribute("data-studio-tab") || "users"),
      );
    });

    el("visorStudioRefreshUsersBtn")?.addEventListener("click", () => void loadUsersTable());

    el("visorStudioCreateUserForm")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const { createAdminUserAccount } = await import("./visorAdminAuth.js");
      const username = el("visorStudioNewUsername")?.value?.trim();
      const display_name = el("visorStudioNewDisplay")?.value?.trim();
      const role = el("visorStudioNewRole")?.value || "visor_admin";
      const password = el("visorStudioNewPassword")?.value || "";
      const password2 = el("visorStudioNewPassword2")?.value || "";
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

    el("visorStudioPasswordForm")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const { changeMyAdminPassword } = await import("./visorAdminAuth.js");
      const current_password = el("visorStudioCurrentPass")?.value || "";
      const new_password = el("visorStudioNewPass")?.value || "";
      const new_password2 = el("visorStudioNewPass2")?.value || "";
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
  }

  return { bindUi, enterDashboard, loadUsersTable, setStudioTab, showDashMessage };
}
