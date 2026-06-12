/**
 * Exportación de mapa (PNG/PDF) en el Visor geográfico — @watergis/maplibre-gl-export.
 */
import { getLeafletMap, whenAtlasMapReady } from "./map.js";

const EXPORT_POSITION = "top-right";

/** v4.1.2 usa Local; Portrait/Landscape van como claves del enum y se parchean en DOM. */
const ORIENTATION_LABELS = {
  Portrait: "Vertical",
  Landscape: "Horizontal",
};

let _exportControl = null;
let _mapRef = null;

function getExportModule() {
  if (typeof MaplibreExportControl !== "undefined") return MaplibreExportControl;
  if (typeof window !== "undefined" && window.MaplibreExportControl) return window.MaplibreExportControl;
  return null;
}

function resolveExportCtor(mod) {
  if (!mod) return null;
  if (typeof mod === "function") return mod;
  return mod.default || mod.MaplibreExportControl || null;
}

function buildExportOptions(mod) {
  const Size = mod?.Size;
  const PageOrientation = mod?.PageOrientation;
  const Format = mod?.Format;
  const DPI = mod?.DPI;

  return {
    PageSize: Size?.A4 ?? "A4",
    PageOrientation: PageOrientation?.Landscape ?? "landscape",
    Format: Format?.PNG ?? "png",
    DPI: DPI?.[300] ?? 300,
    Local: "es",
    Filename: "atlas_visor",
    attributionOptions: {
      visibility: false,
    },
  };
}

/** La librería pinta Portrait/Landscape como texto de <option>; las renombramos. */
function localizeExportControlUi() {
  const orientationSelect = document.getElementById("mapbox-gl-export-page-orientation");
  if (!orientationSelect) return;

  orientationSelect.querySelectorAll("option").forEach((opt) => {
    const key = (opt.textContent || "").trim();
    if (ORIENTATION_LABELS[key]) opt.textContent = ORIENTATION_LABELS[key];
  });
}

function createExportControl() {
  const mod = getExportModule();
  const Ctor = resolveExportCtor(mod);
  if (!Ctor) {
    console.warn("[visorMapExport] MaplibreExportControl no está cargado.");
    return null;
  }
  try {
    return new Ctor(buildExportOptions(mod));
  } catch (err) {
    console.warn("[visorMapExport] No se pudo crear el control:", err);
    return null;
  }
}

function removeExportControl(map) {
  if (!map || !_exportControl) return;
  try {
    map.removeControl(_exportControl);
  } catch {
    /* control ya retirado */
  }
  _exportControl = null;
}

function ensureExportControl(map) {
  if (!map) return null;

  if (_exportControl && _mapRef === map) {
    return _exportControl;
  }

  if (_exportControl && _mapRef && _mapRef !== map) {
    removeExportControl(_mapRef);
  }

  const control = createExportControl();
  if (!control) return null;

  map.addControl(control, EXPORT_POSITION);
  requestAnimationFrame(() => localizeExportControlUi());
  _exportControl = control;
  _mapRef = map;
  return control;
}

function tryAttach(attempt = 0) {
  const map = getLeafletMap();
  if (!map) {
    if (attempt < 24) setTimeout(() => tryAttach(attempt + 1), 120);
    return;
  }
  ensureExportControl(map);
}

/** Activa exportación de mapa solo en el visor geográfico. */
export function attachVisorMapExport() {
  whenAtlasMapReady(() => {
    requestAnimationFrame(() => tryAttach(0));
  });
}

export function teardownVisorMapExport() {
  removeExportControl(_mapRef || getLeafletMap());
  _mapRef = null;
}

export function refreshVisorMapExport() {
  const map = getLeafletMap();
  if (!map) return;
  ensureExportControl(map);
}
