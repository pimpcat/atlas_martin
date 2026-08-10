/**
 * Explorer Studio — estilos mínimos del Explorador Municipal.
 * Reutiliza sesión JWT de Visor Studio.
 */
import {
  adminFetch,
  clearAdminSession,
  getAdminUser,
  isVisorAdminLoggedIn,
  loginAdmin,
  verifyAdminSession,
} from "./visorAdminAuth.js";
import { mountStudioNav, studioLoginFooterHtml } from "./studioNav.js";

const $ = (id) => document.getElementById(id);

const FALLBACK_DEFAULTS = {
  version: 1,
  description: "Estilos visuales mínimos del Explorador Municipal",
  estado: { line_color: "#0f172a", line_width: 2.4 },
  municipios: { line_color: "#475569", line_width: 1.25 },
  municipio_seleccionado: { fill_color: "#008b8b", fill_opacity: 0.42 },
};

let _catalog = null;
let _defaults = FALLBACK_DEFAULTS;

function showErr(el, msg) {
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

function setMsg(msg, ok = true) {
  const el = $("explorerStudioMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `small ${ok ? "text-success" : "text-danger"}`;
}

function showLogin(show) {
  $("explorerStudioLoginView")?.classList.toggle("d-none", !show);
  $("explorerStudioDashboard")?.classList.toggle("d-none", show);
}

function fillForm(cat) {
  const c = cat || FALLBACK_DEFAULTS;
  $("fEstadoColor").value = c.estado?.line_color || "#0f172a";
  $("fEstadoWidth").value = c.estado?.line_width ?? 2.4;
  $("fMunColor").value = c.municipios?.line_color || "#475569";
  $("fMunWidth").value = c.municipios?.line_width ?? 1.25;
  $("fSelFill").value = c.municipio_seleccionado?.fill_color || "#008b8b";
  updatePreview();
}

function readForm() {
  return {
    version: 1,
    description:
      _catalog?.description ||
      _defaults?.description ||
      FALLBACK_DEFAULTS.description,
    estado: {
      line_color: $("fEstadoColor").value,
      line_width: Number($("fEstadoWidth").value),
    },
    municipios: {
      line_color: $("fMunColor").value,
      line_width: Number($("fMunWidth").value),
    },
    municipio_seleccionado: {
      fill_color: $("fSelFill").value,
      fill_opacity:
        _catalog?.municipio_seleccionado?.fill_opacity ??
        _defaults?.municipio_seleccionado?.fill_opacity ??
        0.42,
    },
  };
}

function updatePreview() {
  const estadoColor = $("fEstadoColor")?.value || "#0f172a";
  const estadoW = Number($("fEstadoWidth")?.value || 2.4);
  const munColor = $("fMunColor")?.value || "#475569";
  const munW = Number($("fMunWidth")?.value || 1.25);
  const sel = $("fSelFill")?.value || "#008b8b";
  const opacity =
    _catalog?.municipio_seleccionado?.fill_opacity ??
    _defaults?.municipio_seleccionado?.fill_opacity ??
    0.42;

  if ($("prevEstadoSwatch")) $("prevEstadoSwatch").style.background = estadoColor;
  if ($("prevMunSwatch")) $("prevMunSwatch").style.background = munColor;
  if ($("prevEstadoLine")) {
    $("prevEstadoLine").style.borderBottomColor = estadoColor;
    $("prevEstadoLine").style.borderBottomWidth = `${Math.max(1, estadoW)}px`;
  }
  if ($("prevMunLine")) {
    $("prevMunLine").style.borderBottomColor = munColor;
    $("prevMunLine").style.borderBottomWidth = `${Math.max(1, munW)}px`;
  }
  if ($("prevSelFill")) {
    $("prevSelFill").style.background = sel;
    $("prevSelFill").style.opacity = String(opacity);
  }
}

async function loadCatalog() {
  const res = await adminFetch("/api/explorer/admin/catalog");
  if (!res.res?.ok) {
    throw new Error(
      res.data?.detail?.message || res.data?.message || "No se pudo cargar el catálogo"
    );
  }
  _catalog = res.data.catalog || FALLBACK_DEFAULTS;
  _defaults = res.data.defaults || FALLBACK_DEFAULTS;
  fillForm(_catalog);
}

async function publish(ev) {
  ev?.preventDefault();
  const catalog = readForm();
  setMsg("Publicando…", true);
  const { res, data } = await adminFetch("/api/explorer/admin/catalog", {
    method: "PUT",
    body: JSON.stringify({ catalog }),
  });
  if (!res?.ok) {
    const msg =
      data?.detail?.message ||
      (typeof data?.detail === "string" ? data.detail : null) ||
      data?.message ||
      `Error HTTP ${res?.status}`;
    setMsg(msg, false);
    return;
  }
  _catalog = data.catalog || catalog;
  fillForm(_catalog);
  setMsg("Publicado. Recargue el Atlas para ver el Explorador.", true);
}

function restoreDefaults() {
  fillForm(_defaults || FALLBACK_DEFAULTS);
  setMsg("Defaults cargados en el formulario (aún no publicados).", true);
}

async function bootDashboard() {
  const user = getAdminUser();
  if ($("explorerStudioWelcome")) {
    $("explorerStudioWelcome").textContent = user?.username
      ? `Sesión: ${user.username}`
      : "Sesión admin activa";
  }
  mountStudioNav($("explorerStudioNav"), { active: "explorer" });
  showLogin(false);
  await loadCatalog();
}

async function init() {
  $("explorerStudioLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr($("explorerStudioError"), "");
    try {
      await loginAdmin(
        $("explorerStudioUser").value.trim(),
        $("explorerStudioPass").value
      );
      await bootDashboard();
    } catch (err) {
      showErr($("explorerStudioError"), err.message || String(err));
    }
  });

  $("explorerStudioLogoutBtn")?.addEventListener("click", () => {
    clearAdminSession();
    showLogin(true);
  });
  $("explorerStudioForm")?.addEventListener("submit", (ev) => void publish(ev));
  $("explorerStudioResetBtn")?.addEventListener("click", restoreDefaults);
  ["fEstadoColor", "fEstadoWidth", "fMunColor", "fMunWidth", "fSelFill"].forEach(
    (id) => {
      $(id)?.addEventListener("input", updatePreview);
    }
  );

  if (isVisorAdminLoggedIn()) {
    try {
      await verifyAdminSession();
      await bootDashboard();
    } catch {
      clearAdminSession();
      showLogin(true);
    }
  } else {
    const footer = $("explorerStudioLoginFooter");
    if (footer) footer.innerHTML = studioLoginFooterHtml("explorer");
    showLogin(true);
  }
}

void init();
