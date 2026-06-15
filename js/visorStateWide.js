/**
 * Vista estatal del Visor geográfico — alterna el filtro CVE_MUN del municipio seleccionado.
 */
import { getVisorStateWideMode, setVisorStateWideMode } from "./map.js";
import { refreshVisorMapUi } from "./visorMapUi.js";
import { refreshVisorGeocoder } from "./visorGeocoder.js";
import { scheduleVisorCompareSync } from "./visorMapCompare.js";
import { ensureVisorLayersHeaderToolbar } from "./visorLayersToolbar.js";

let _toggleBtn = null;

const STATE_WIDE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M3 7.2 9 4.6l6 2.4 6-2.4v9.6L15 19.4l-6-2.4L3 14.6V7.2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M9 4.6v12.8M15 7v12.4" stroke="currentColor" stroke-width="1.4" opacity="0.55"/>
  <circle cx="12" cy="11" r="2.2" fill="currentColor"/>
</svg>`;

function syncToggleUi() {
  if (!_toggleBtn) return;
  const on = getVisorStateWideMode();
  _toggleBtn.classList.toggle("is-active", on);
  _toggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
  _toggleBtn.title = on
    ? "Vista estatal activa — clic para volver al municipio seleccionado"
    : "Visor estatal";
  _toggleBtn.setAttribute(
    "aria-label",
    on ? "Desactivar vista estatal y volver al municipio" : "Activar vista estatal de Guerrero",
  );
}

function onToggleClick() {
  setVisorStateWideMode(!getVisorStateWideMode());
  syncToggleUi();
  refreshVisorMapUi();
  refreshVisorGeocoder();
  scheduleVisorCompareSync();
}

function onStateWideChange() {
  syncToggleUi();
  document.dispatchEvent(new CustomEvent("atlasgro-visor-layers-panel-refresh"));
  scheduleVisorCompareSync();
}

function ensureToggleButton() {
  const toolbar = ensureVisorLayersHeaderToolbar();
  if (!toolbar) return null;

  let btn = toolbar.querySelector("#visorStateWideToggleBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "visorStateWideToggleBtn";
    btn.className = "btn btn-sm visor-statewide-toggle-btn";
    btn.innerHTML = STATE_WIDE_ICON_SVG;
    btn.addEventListener("click", onToggleClick);
    toolbar.insertBefore(btn, toolbar.firstChild);
    document.addEventListener("atlasgro-visor-statewide-change", onStateWideChange);
  }
  _toggleBtn = btn;
  syncToggleUi();
  return btn;
}

export function attachVisorStateWide() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureToggleButton, { once: true });
  } else {
    ensureToggleButton();
  }
}

export function teardownVisorStateWide() {
  document.removeEventListener("atlasgro-visor-statewide-change", onStateWideChange);
  _toggleBtn?.remove();
  _toggleBtn = null;
  if (getVisorStateWideMode()) {
    setVisorStateWideMode(false);
  }
}

export function refreshVisorStateWide() {
  ensureToggleButton();
  syncToggleUi();
}
