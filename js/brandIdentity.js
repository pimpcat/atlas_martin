/**
 * Identidad de chrome (título / footer / aria) según entidad activa.
 * P1 — no toca catálogos ni textos narrativos de indicadores.
 */

const TITLE_PREFIX = "Atlas Municipal de Indicadores de ";
const SUBTITLE =
  "Plataforma interactiva para consulta territorial y análisis municipal";

/** @type {{ cve_ent: string, nom_ent: string, nationalCountryView: boolean }} */
let _brand = {
  cve_ent: "",
  nom_ent: "",
  nationalCountryView: false,
};

function titleFor(nom_ent, nationalCountryView) {
  if (nationalCountryView) return `${TITLE_PREFIX}México`;
  const nom = (nom_ent || "").trim() || "México";
  return `${TITLE_PREFIX}${nom}`;
}

function footerFor(nom_ent, nationalCountryView) {
  if (nationalCountryView) {
    return "INEGI - SNIEG. Todos los derechos reservados.";
  }
  const nom = (nom_ent || "").trim();
  if (!nom) return "INEGI - SNIEG. Todos los derechos reservados.";
  return `INEGI - CEIEG ${nom}. Todos los derechos reservados.`;
}

function ceiegLineFor(nom_ent, nationalCountryView) {
  if (nationalCountryView) return "MÉXICO";
  const nom = (nom_ent || "").trim();
  return nom ? nom.toUpperCase() : "MÉXICO";
}

/**
 * @param {{ cve_ent?: string, nom_ent?: string, nationalCountryView?: boolean }} opts
 */
export function setBrandEntity(opts = {}) {
  const nationalCountryView = Boolean(opts.nationalCountryView);
  const cve_ent = String(opts.cve_ent || "").replace(/\D/g, "").slice(-2);
  const nom_ent = String(opts.nom_ent || "").trim();
  _brand = { cve_ent, nom_ent, nationalCountryView };

  const title = titleFor(nom_ent, nationalCountryView);
  document.title = title;

  const main = document.getElementById("appTitleMain");
  if (main) main.textContent = title;

  const sub = document.getElementById("appTitleSubtitle");
  if (sub) sub.textContent = SUBTITLE;

  const foot = document.getElementById("appFooterBrand");
  if (foot) foot.textContent = footerFor(nom_ent, nationalCountryView);

  const ceieg = document.getElementById("appCeiegEnt");
  if (ceieg) ceieg.textContent = ceiegLineFor(nom_ent, nationalCountryView);

  const place = nationalCountryView ? "México" : nom_ent || "México";
  document.querySelectorAll("[data-brand-ent]").forEach((el) => {
    const kind = el.getAttribute("data-brand-ent");
    if (kind === "sidebarMuns") {
      el.setAttribute("aria-label", `Municipios de ${place}`);
    } else if (kind === "mapZone") {
      el.setAttribute("aria-label", `Mapa de ${place}`);
    } else if (kind === "mapFrame") {
      el.setAttribute(
        "aria-label",
        nationalCountryView
          ? "Mapa de entidades federativas de México"
          : `Mapa de municipios de ${place}`,
      );
    } else if (kind === "macroMap") {
      el.setAttribute(
        "aria-label",
        `Mapa del estado de ${place} con el municipio seleccionado resaltado`,
      );
    }
  });
}

export function getBrandState() {
  return { ..._brand };
}

export function brandTitlePreview(nom_ent, nationalCountryView = false) {
  return titleFor(nom_ent, nationalCountryView);
}
