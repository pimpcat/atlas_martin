/**
 * Nodo Studio — módulo embebido en GroSIG shell v2 (Fase D.10).
 * Auth SuperAdmin separada (sessionStorage grosigNodoSuperadminToken).
 */
import { staleCheck } from "../shell/mountGuard.js";
import { loadStudioAppModule } from "../shell/studioAppLoader.js";

export const VIEW_ID = "nodo";

export const VIEW_META = {
  id: VIEW_ID,
  title: "Instancias (Nodo)",
  subtitle: "SuperAdmin federación — analítica e instancias CORE",
  navActiveId: "nodo",
};

/** @type {Promise<void>|null} */
let _bootstrapPromise = null;
/** @type {typeof import("../../../js/nodoStudioApp.js") | null} */
let _nodoMod = null;

function ensureBootstrapJs() {
  if (globalThis.bootstrap) return Promise.resolve();
  if (_bootstrapPromise) return _bootstrapPromise;
  _bootstrapPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="bootstrap.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("bootstrap.js")), { once: true });
      if (globalThis.bootstrap) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "./assets/bootstrap.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar bootstrap.js"));
    document.head.appendChild(script);
  });
  return _bootstrapPromise;
}

/** @param {Document} doc */
function ensureKitGroModal(doc) {
  if (document.getElementById("nodoKitGroModal")) return;
  const modal = doc.getElementById("nodoKitGroModal");
  if (modal) document.body.appendChild(document.importNode(modal, true));
}

/** @param {HTMLElement} dashboard */
function installNodoToolbar(dashboard) {
  if (dashboard.querySelector(".gs2-nodo-toolbar")) return;
  const bar = document.createElement("div");
  bar.className =
    "gs2-nodo-toolbar d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2";
  bar.innerHTML =
    '<p class="small text-muted mb-0" id="nodoWelcome"></p>' +
    '<button type="button" class="btn btn-sm btn-outline-secondary" id="nodoLogoutBtn">Cerrar sesión Nodo</button>';
  dashboard.insertBefore(bar, dashboard.firstChild);
}

/**
 * @param {HTMLElement} mountEl
 * @param {number} [mountToken]
 */
export async function mountNodoStudioV2(mountEl, mountToken) {
  if (!mountEl) return;
  await ensureBootstrapJs();
  staleCheck(mountToken);

  const res = await fetch("./nodo-studio.html", { cache: "no-store" });
  staleCheck(mountToken);
  if (!res.ok) throw new Error("No se pudo cargar el panel de Nodo");
  const html = await res.text();
  staleCheck(mountToken);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const login = doc.querySelector("#nodoLoginView");
  const legacyDash = doc.querySelector("#nodoDashboard");
  if (!login || !legacyDash) throw new Error("Estructura de Nodo Studio no encontrada");

  ensureKitGroModal(doc);

  mountEl.innerHTML = "";
  staleCheck(mountToken);
  const wrap = document.createElement("div");
  wrap.className = "gs2-studio-module gs2-studio-nodo visor-studio-page";

  wrap.appendChild(document.importNode(login, true));

  const dashboard = document.createElement("div");
  dashboard.id = "nodoDashboard";
  dashboard.className = "d-none";
  const children = [...legacyDash.children];
  for (let i = 1; i < children.length; i += 1) {
    dashboard.appendChild(document.importNode(children[i], true));
  }
  installNodoToolbar(dashboard);
  wrap.appendChild(dashboard);

  mountEl.appendChild(wrap);
  staleCheck(mountToken);

  const mod = await loadStudioAppModule(
    "../../../js/nodoStudioApp.js",
    ["bindNodoStudioUi", "enterNodoStudioDashboard", "teardownNodoStudioUi"],
    import.meta,
  );
  staleCheck(mountToken);
  _nodoMod = mod;
  mod.bindNodoStudioUi();
  mod.enterNodoStudioDashboard();
  staleCheck(mountToken);
}

export function teardownNodoStudioV2() {
  _nodoMod?.teardownNodoStudioUi?.();
  _nodoMod = null;
}
