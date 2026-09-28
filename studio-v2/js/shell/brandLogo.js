/**
 * Resuelve la ruta del logo GroSIG según tema claro/oscuro.
 */
const LOGO_CANDIDATES = {
  claro: [
    "./assets/logos/GroSIG-claro.png",
    "./assets/logos/GroSIG.png",
    "./assets/logo/GroSIG.png",
    "./studio-v2/img/GroSIG.png",
  ],
  oscuro: [
    "./assets/logos/GroSIG.png",
    "./assets/logo/GroSIG.png",
    "./studio-v2/img/GroSIG.png",
  ],
};

let _themeLogoBound = false;

/**
 * @returns {"claro"|"oscuro"}
 */
function readPageTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "oscuro" ? "oscuro" : "claro";
}

/** @param {string} src */
function sameLogoSrc(img, src) {
  try {
    return new URL(src, window.location.href).href === img.src;
  } catch {
    return img.getAttribute("src") === src;
  }
}

/**
 * @param {string} src
 * @returns {Promise<boolean>}
 */
async function probeLogo(src) {
  try {
    const res = await fetch(src, { method: "GET", cache: "no-store" });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    return ct.includes("image") || src.endsWith(".png");
  } catch {
    return false;
  }
}

/**
 * @param {"claro"|"oscuro"} [theme]
 * @returns {Promise<string|null>}
 */
export async function resolveBrandLogoUrl(theme = readPageTheme()) {
  const list = LOGO_CANDIDATES[theme === "oscuro" ? "oscuro" : "claro"];
  for (const src of list) {
    if (await probeLogo(src)) return src;
  }
  return null;
}

/**
 * Aplica URL resuelta a imágenes de marca (sidebar + login).
 * @param {"claro"|"oscuro"} [theme] — por defecto lee `data-theme` del documento.
 */
export async function applyBrandLogos(theme = readPageTheme()) {
  const url = await resolveBrandLogoUrl(theme);
  if (!url) return;
  document
    .querySelectorAll(".grosig-shell-v2__brand-logo, .grosig-shell-v2__login-logo")
    .forEach((img) => {
      if (img instanceof HTMLImageElement && !sameLogoSrc(img, url)) {
        img.src = url;
      }
    });
}

function bindBrandLogoThemeSync() {
  if (_themeLogoBound) return;
  _themeLogoBound = true;

  window.addEventListener("atlasgro-themechange", () => {
    void applyBrandLogos();
  });

  // Theme Studio aplica preview vía data-theme sin atlasgro-themechange (no toca localStorage).
  new MutationObserver(() => {
    void applyBrandLogos();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

/** Montaje inicial + sincronización con tema SPA y preview del editor. */
export async function mountBrandLogos() {
  await applyBrandLogos();
  bindBrandLogoThemeSync();
}
