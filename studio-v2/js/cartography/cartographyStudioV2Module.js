/**
 * Cartography Studio — módulo nativo en shell v2 (Fase D.6).
 */
import { staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "cartography";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Cartografía",
  subtitle: "Productos, Custom, Fuentes, Datos (capas carto) y branding PDF",
  navActiveId: "cartography",
};

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountCartographyStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  const res = await fetch("./cartography-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel de Cartografía");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const offline = doc.querySelector("#cartoStudioOffline");
  const online = doc.querySelector("#cartoStudioOnline");
  if (!offline || !online) {
    throw new Error("Estructura de Cartography Studio no encontrada");
  }

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className =
    "gs2-studio-module gs2-studio-cartography cartography-studio-page visor-studio-page";
  wrap.appendChild(document.importNode(offline, true));
  wrap.appendChild(document.importNode(online, true));
  mountEl.appendChild(wrap);

  const mod = await loadStudioAppModule(
    "../../../js/cartographyStudioApp.js",
    ["bindCartographyStudioUi", "enterCartographyStudioDashboard"],
    import.meta,
  );
  staleCheck(mountToken);
  mod.bindCartographyStudioUi();
  await mod.enterCartographyStudioDashboard();
  staleCheck(mountToken);
}

export function teardownCartographyStudioV2() {}
