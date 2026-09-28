/**
 * Geography Studio — administración del catálogo de Datos Geográficos (legacy).
 */
import { createGeographyStudioController } from "./geographyStudioController.js";
import { createStudioShell, studioIdsFromPrefix } from "./studioShell.js";

const controller = createGeographyStudioController(document, { ui: "legacy" });

async function init() {
  controller.bindUi();

  const shell = createStudioShell(
    studioIdsFromPrefix("geoStudio", { loginError: "geoStudioError" }),
    {
      activeNav: "geography",
      onEnterDashboard: () => controller.enterDashboard(),
      onDashboardError: (err) => {
        const msgEl = document.getElementById("geoStudioPublishMsg");
        if (msgEl) {
          msgEl.textContent = err?.message || "Error al cargar";
          msgEl.className = "small text-danger";
        }
      },
    },
  );
  await shell.boot();
}

void init();
