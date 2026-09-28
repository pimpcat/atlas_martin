/**
 * Imágenes del portal (Theme Studio → GET /api/theme/branding).
 * Lugar sin configurar = se conserva la imagen original del HTML.
 */
import { apiUrl } from "./atlasConfig.js";

/** @type {Record<string, string>} */
const _originals = {};

function rememberOriginal(key, el, attr) {
  if (el && !(key in _originals)) _originals[key] = el.getAttribute(attr) || "";
}

function setImg(key, el, entry) {
  if (!el) return;
  rememberOriginal(key, el, "src");
  el.setAttribute("src", entry?.url ? apiUrl(entry.url) : _originals[key]);
  if (entry?.alt) el.setAttribute("alt", entry.alt);
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "oscuro" ? "oscuro" : "claro";
}

/** @type {Record<string, {url?: string, alt?: string, link?: string}>} */
let _slots = {};

function applyRightLogo() {
  const el = document.querySelector(".header-logo-snieg");
  const entry =
    (currentTheme() === "oscuro" && _slots.logo_right_oscuro) || _slots.logo_right_claro || null;
  setImg("logo_right", el, entry);
}

function applyFavicon() {
  const links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  links.forEach((link, i) => {
    const key = `favicon_${i}`;
    rememberOriginal(key, link, "href");
    link.setAttribute("href", _slots.favicon?.url ? apiUrl(_slots.favicon.url) : _originals[key]);
  });
}

function applyBanner() {
  const host = document.getElementById("homeBanner");
  if (!host) return;
  const entry = _slots.home_banner;
  const img = host.querySelector("img");
  const link = host.querySelector("a");
  if (!entry?.url || !img) {
    host.hidden = true;
    return;
  }
  img.setAttribute("src", apiUrl(entry.url));
  img.setAttribute("alt", entry.alt || "");
  if (link) {
    if (entry.link) {
      link.setAttribute("href", entry.link);
      link.removeAttribute("aria-disabled");
    } else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
    }
  }
  host.hidden = false;
}

/**
 * Aplica un conjunto de lugares (también usado por la vista previa del Theme Studio).
 * @param {Record<string, {url?: string, alt?: string, link?: string}>} slots
 */
export function applyPortalBranding(slots) {
  _slots = slots && typeof slots === "object" ? slots : {};
  setImg("logo_left_claro", document.querySelector(".header-logo-inegi--claro"), _slots.logo_left_claro);
  setImg("logo_left_oscuro", document.querySelector(".header-logo-inegi--oscuro"), _slots.logo_left_oscuro);
  applyRightLogo();
  applyFavicon();
  applyBanner();
}

let _bound = false;

export async function initPortalBranding() {
  if (!_bound) {
    _bound = true;
    window.addEventListener("atlasgro-themechange", applyRightLogo);
  }
  /* En la vista previa del Theme Studio el borrador llega por postMessage. */
  if (new URLSearchParams(window.location.search).has("themePreview") && window.parent !== window) return;
  try {
    const res = await fetch(apiUrl("/api/theme/branding"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) applyPortalBranding(data.slots || {});
  } catch {
    /* sin API: quedan las imágenes originales */
  }
}
