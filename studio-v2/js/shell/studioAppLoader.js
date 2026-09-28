/**
 * Carga módulos legacy de Studio con bust de caché y validación de exports v2.
 */
export const STUDIO_APP_LOAD_REV = "20260928a";

/**
 * @param {string} relPath — relativo al caller (p. ej. ../../../js/invStudioApp.js)
 * @param {string[]} requiredExports
 * @param {ImportMeta} meta — import.meta del módulo caller
 */
export async function loadStudioAppModule(relPath, requiredExports, meta) {
  const url = new URL(relPath, meta.url);
  url.searchParams.set("gs2", STUDIO_APP_LOAD_REV);
  const mod = await import(url.href);
  const missing = requiredExports.filter((name) => typeof mod[name] !== "function");
  if (missing.length) {
    throw new Error(
      `${url.pathname} no exporta: ${missing.join(", ")}. ` +
        "Recargue con Ctrl+F5 o vacíe caché del navegador.",
    );
  }
  return mod;
}
