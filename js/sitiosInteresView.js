/**
 * Vista «Sitios de interés»: carrusel de portales + rejilla de enlaces del acervo INEGI.
 */
import { SITIOS_INTERES_DESTACADOS, SITIOS_INTERES_GRUPOS } from "./sitiosInteresData.js";

function el(tag, className, children = [], attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  for (const ch of children) {
    if (ch == null) continue;
    node.append(ch);
  }
  return node;
}

function externalLinkCard({ title, subtitle, url, accent, featured = false }) {
  const card = el("a", featured ? "sitios-featured-card" : "sitios-link-card", [
    el("span", "sitios-card__accent", []),
    el("span", "sitios-card__body", [
      el("span", "sitios-card__title", [document.createTextNode(title)]),
      subtitle ? el("span", "sitios-card__subtitle", [document.createTextNode(subtitle)]) : null,
    ]),
    el("span", "sitios-card__arrow", [document.createTextNode("↗")]),
  ]);
  card.href = url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute("aria-label", `${title} (abre en nueva pestaña)`);
  if (accent) card.dataset.accent = accent;
  return card;
}

function buildFeaturedCarousel() {
  const section = el("section", "sitios-section sitios-section--featured", [
    el("div", "sitios-section__head", [
      el("h2", "sitios-section__title", [document.createTextNode("Portales destacados")]),
      el("p", "sitios-section__hint", [
        document.createTextNode("Desliza para ver más · se abren en una pestaña nueva"),
      ]),
    ]),
  ]);

  const track = el("div", "sitios-carousel", [], {
    tabindex: "0",
    role: "region",
    "aria-label": "Portales destacados",
  });
  for (const item of SITIOS_INTERES_DESTACADOS) {
    track.append(externalLinkCard({ ...item, featured: true }));
  }

  const nav = el("div", "sitios-carousel-nav", [
    el("button", "sitios-carousel-btn sitios-carousel-btn--prev", [], { type: "button", "aria-label": "Anterior" }),
    el("button", "sitios-carousel-btn sitios-carousel-btn--next", [], { type: "button", "aria-label": "Siguiente" }),
  ]);
  nav.querySelector(".sitios-carousel-btn--prev").textContent = "‹";
  nav.querySelector(".sitios-carousel-btn--next").textContent = "›";

  const wrap = el("div", "sitios-carousel-wrap", [track, nav]);
  section.append(wrap);

  const scrollStep = () => Math.max(240, track.clientWidth * 0.72);
  nav.querySelector(".sitios-carousel-btn--prev").addEventListener("click", () => {
    track.scrollBy({ left: -scrollStep(), behavior: "smooth" });
  });
  nav.querySelector(".sitios-carousel-btn--next").addEventListener("click", () => {
    track.scrollBy({ left: scrollStep(), behavior: "smooth" });
  });

  return section;
}

function buildGroupsGrid() {
  const section = el("section", "sitios-section sitios-section--grid", [
    el("div", "sitios-section__head", [
      el("h2", "sitios-section__title", [document.createTextNode("Programas del acervo INEGI")]),
      el("p", "sitios-section__hint", [
        document.createTextNode("Enlaces a las fuentes estadísticas y geográficas del atlas"),
      ]),
    ]),
  ]);

  const groups = el("div", "sitios-groups");
  for (const group of SITIOS_INTERES_GRUPOS) {
    const block = el("div", "sitios-group", [
      el("h3", "sitios-group__title", [document.createTextNode(group.title)]),
      el("div", "sitios-group__grid", group.items.map((item) => externalLinkCard(item))),
    ]);
    groups.append(block);
  }
  section.append(groups);
  return section;
}

/** Monta o actualiza la vista en el contenedor raíz. */
export function renderSitiosInteresView(root) {
  if (!root) return;
  root.innerHTML = "";
  root.className = "sitios-interes-root atlas-scroll";
  root.append(
    el("header", "sitios-hero", [
      el("p", "sitios-hero__eyebrow", [document.createTextNode("Acervo estadístico y geográfico")]),
      el("h1", "sitios-hero__title", [document.createTextNode("Sitios de interés")]),
      el("p", "sitios-hero__lead", [
        document.createTextNode("Acceso directo a portales y programas INEGI."),
      ]),
    ]),
    buildFeaturedCarousel(),
    buildGroupsGrid(),
    el("footer", "sitios-footnote", [
      document.createTextNode("Fuente: INEGI · Comité Estatal de Información Geográfica de Guerrero"),
    ]),
  );
}
