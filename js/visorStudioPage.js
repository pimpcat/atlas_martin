/**
 * Página Visor Studio: login + gestión de usuarios admin (legacy).
 */
import { readStoredTheme } from "./theme.js";
import { createVisorStudioUsersController } from "./visorStudioUsers.js";
import { createStudioShell, studioIdsFromPrefix } from "./studioShell.js";

document.documentElement.setAttribute("data-theme", readStoredTheme());

const controller = createVisorStudioUsersController(document, { ui: "legacy" });

async function boot() {
  controller.bindUi();

  const shell = createStudioShell(
    studioIdsFromPrefix("visorStudio", { loginError: "visorStudioError" }),
    {
      activeNav: "visor",
      formatWelcome: (user) => {
        const name = user?.display_name || user?.username || "Administrador";
        const ent = user?.cve_ent
          ? ` · ${user.entidad || user.instancia_clave || ""} (${user.cve_ent})`
          : "";
        return `Sesión: ${name}${ent}`;
      },
      onEnterDashboard: () => controller.enterDashboard(),
      onDashboardError: (err) => {
        const usersStatus = document.getElementById("visorStudioUsersStatus");
        if (usersStatus) {
          usersStatus.textContent = err?.message || "Error al cargar usuarios.";
        }
      },
    },
  );
  await shell.boot();
}

void boot();
