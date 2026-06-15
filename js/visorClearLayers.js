/**
 * Botón «Despintar capas» en el encabezado del panel «Capas» del visor geográfico.
 */
import { ensureVisorLayersHeaderToolbar } from "./visorLayersToolbar.js";
import { clearVisorThematicLayersFromPanel } from "./visorLayers.js";
import { notifyVisorLayerToggled } from "./visorMapUi.js";

let _clearBtn = null;

const CLEAR_LAYERS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 8.2 12 5l8 3.2-8 3.2-8-3.2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M4 12.5 12 15.7l8-3.2" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" opacity="0.72"/>
  <path d="M4 16.8 12 20l8-3.2" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" opacity="0.48"/>
  <path d="M5.5 4.5 18.5 19.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/>
</svg>`;

function onClearClick() {
  clearVisorThematicLayersFromPanel();
  notifyVisorLayerToggled();
}

function ensureClearButton() {
  const toolbar = ensureVisorLayersHeaderToolbar();
  if (!toolbar) return null;

  let btn = toolbar.querySelector("#visorClearLayersBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "visorClearLayersBtn";
    btn.className = "btn btn-sm visor-clear-layers-btn";
    btn.title = "Despintar todas las capas";
    btn.setAttribute("aria-label", "Despintar y desactivar todas las capas temáticas");
    btn.innerHTML = CLEAR_LAYERS_ICON_SVG;
    btn.addEventListener("click", onClearClick);
    toolbar.appendChild(btn);
  }
  _clearBtn = btn;
  return btn;
}

export function attachVisorClearLayers() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureClearButton, { once: true });
  } else {
    ensureClearButton();
  }
}

export function teardownVisorClearLayers() {
  _clearBtn?.remove();
  _clearBtn = null;
}

export function refreshVisorClearLayers() {
  ensureClearButton();
}
