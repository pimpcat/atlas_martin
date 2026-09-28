/**
 * Explorer Studio — estilos mínimos del Explorador Municipal.
 * Reutiliza sesión JWT de Visor Studio (studioShell).
 */
import { adminFetch } from "./visorAdminAuth.js";
import {
  createStudioShell,
  setStudioStatus,
  studioIdsFromPrefix,
} from "./studioShell.js";

/** @type {Document|HTMLElement|null} */
let _uiRoot = null;

const $ = (id) => {
  const root = _uiRoot || document;
  if (root === document) return document.getElementById(id);
  return root.querySelector(`#${CSS.escape(id)}`);
};

const FALLBACK_DEFAULTS = {
  version: 1,
  description: "Estilos visuales mínimos del Explorador Municipal",
  estado: { line_color: "#0f172a", line_width: 2.4 },
  municipios: { line_color: "#475569", line_width: 1.25 },
  municipio_seleccionado: { fill_color: "#008b8b", fill_opacity: 0.42 },
};

let _catalog = null;
let _defaults = FALLBACK_DEFAULTS;

function setMsg(msg, ok = true) {
  setStudioStatus("explorerStudioMsg", msg, ok);
}

function fillForm(cat) {
  const c = cat || FALLBACK_DEFAULTS;
  const estadoColor = $("fEstadoColor");
  const estadoWidth = $("fEstadoWidth");
  const munColor = $("fMunColor");
  const munWidth = $("fMunWidth");
  const selFill = $("fSelFill");
  if (estadoColor) estadoColor.value = c.estado?.line_color || "#0f172a";
  if (estadoWidth) estadoWidth.value = c.estado?.line_width ?? 2.4;
  if (munColor) munColor.value = c.municipios?.line_color || "#475569";
  if (munWidth) munWidth.value = c.municipios?.line_width ?? 1.25;
  if (selFill) selFill.value = c.municipio_seleccionado?.fill_color || "#008b8b";
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

  const paintBg = (el, color) => {
    if (!el) return;
    el.style.setProperty("background-color", color, "important");
  };

  paintBg($("prevEstadoSwatch"), estadoColor);
  paintBg($("prevMunSwatch"), munColor);
  const estadoLine = $("prevEstadoLine");
  if (estadoLine) {
    estadoLine.style.borderBottomStyle = "solid";
    estadoLine.style.borderBottomColor = estadoColor;
    estadoLine.style.borderBottomWidth = `${Math.max(1, estadoW)}px`;
  }
  const munLine = $("prevMunLine");
  if (munLine) {
    munLine.style.borderBottomStyle = "solid";
    munLine.style.borderBottomColor = munColor;
    munLine.style.borderBottomWidth = `${Math.max(1, munW)}px`;
  }
  const selFill = $("prevSelFill");
  if (selFill) {
    paintBg(selFill, sel);
    selFill.style.opacity = String(opacity);
  }
}

/** Shell v2 — refrescar vista previa (p. ej. tras montar DOM) */
export function updateExplorerPreview() {
  updatePreview();
}

/** Shell v2 — limpiar referencia al contenedor montado */
export function resetExplorerStudioUiRoot() {
  _uiRoot = null;
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

function wireExplorerStudioUi() {
  $("explorerStudioForm")?.addEventListener("submit", (ev) => void publish(ev));
  $("explorerStudioResetBtn")?.addEventListener("click", restoreDefaults);
  ["fEstadoColor", "fEstadoWidth", "fMunColor", "fMunWidth", "fSelFill"].forEach(
    (id) => {
      $(id)?.addEventListener("input", updatePreview);
    }
  );
}

/** Shell v2 — enlazar UI tras montar panel en #gs2StudioMount */
export function bindExplorerStudioUi(root) {
  _uiRoot = root instanceof HTMLElement ? root : null;
  wireExplorerStudioUi();
}

/** Shell v2 — cargar catálogo */
export function enterExplorerStudioDashboard() {
  return loadCatalog();
}

async function init() {
  wireExplorerStudioUi();

  const shell = createStudioShell(
    studioIdsFromPrefix("explorerStudio", {
      loginError: "explorerStudioError",
    }),
    {
      activeNav: "explorer",
      onEnterDashboard: () => loadCatalog(),
      onDashboardError: (err) => setMsg(err?.message || String(err), false),
    }
  );
  await shell.boot();
}

if (document.getElementById("explorerStudioLoginForm")) {
  void init();
}
