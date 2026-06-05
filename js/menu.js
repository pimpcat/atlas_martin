/**
 * Menú lateral acordeón (temáticas e indicadores).
 * Recibe el modelo de api.getMenuModel() y notifica onSelect a app.js.
 */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v === null || v === undefined) continue;
    else node.setAttribute(k, String(v));
  }
  for (const ch of children) node.append(ch);
  return node;
}

function iconChevron() {
  const span = document.createElement("span");
  span.className = "chev";
  span.textContent = "▾";
  return span;
}

const SECTION_ICON_SRC = {
  geo: "./assets/icons/menu/geo.svg",
  socio: "./assets/icons/menu/socio.svg",
  viv: "./assets/icons/menu/viv.svg",
  eco: "./assets/icons/menu/eco.svg",
  gov: "./assets/icons/menu/gov.svg",
  contacto: "./assets/icons/menu/contacto.svg",
};

function sectionIcon(sectionId) {
  const src = SECTION_ICON_SRC[sectionId];
  if (!src) return document.createDocumentFragment();
  const img = document.createElement("img");
  img.className = "menu-section-icon";
  img.src = src;
  img.alt = "";
  img.width = 22;
  img.height = 22;
  img.setAttribute("aria-hidden", "true");
  return img;
}

let _collapseAllMenuSections = null;

/** Cierra todas las temáticas del acordeón (p. ej. al pulsar Inicio). */
export function collapseAllMenuSections() {
  if (typeof _collapseAllMenuSections === "function") {
    _collapseAllMenuSections();
  }
}

/**
 * Crea el menú completo (temática -> indicadores) y dispara onSelect.
 * Acordeón: solo una temática expandida a la vez; la activa se resalta (CSS).
 */
export function createMenu(root, sections, { onSelect }) {
  root.innerHTML = "";

  let activeItemEl = null;
  const sectionRefs = [];

  const sidebar = document.getElementById("sidebar");
  const closeSidebar = () => {
    if (window.matchMedia("(max-width: 767.98px)").matches) {
      sidebar.classList.remove("is-open");
      document.getElementById("btnSidebar")?.setAttribute("aria-expanded", "false");
    }
  };

  const collapseRef = (ref) => {
    ref.sectionEl.setAttribute("aria-expanded", "false");
    ref.btn.setAttribute("aria-expanded", "false");
    ref.itemsWrap.style.display = "none";
    ref.sectionEl.classList.remove("menu-section--expanded");
  };

  const expandRef = (ref) => {
    ref.sectionEl.setAttribute("aria-expanded", "true");
    ref.btn.setAttribute("aria-expanded", "true");
    ref.itemsWrap.style.display = "";
    ref.sectionEl.classList.add("menu-section--expanded");
  };

  for (const section of sections) {
    const sectionId = `sec_${section.id}`;

    const itemsWrap = el("div", { className: "menu-items", id: sectionId });

    for (const item of section.items) {
      const itemEl = el("div", { className: "menu-item", role: "button", tabindex: "0" }, [
        el("div", { className: "title" }, [document.createTextNode(item.title)]),
        el("div", { className: "meta" }, [document.createTextNode(item.subtitle || item.unit || "")]),
      ]);

      const activate = async () => {
        if (activeItemEl) activeItemEl.classList.remove("is-active");
        itemEl.classList.add("is-active");
        activeItemEl = itemEl;
        await onSelect?.(item, { closeSidebar });
      };

      itemEl.addEventListener("click", activate);
      itemEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void activate();
        }
      });

      itemsWrap.append(itemEl);
    }

    const sectionEl = el("section", {
      className: "menu-section",
      "aria-expanded": "false",
    });

    const ref = { sectionEl, btn: null, itemsWrap };

    const btn = el("button", {
      className: "section-toggle",
      type: "button",
      "aria-controls": sectionId,
      "aria-expanded": "false",
      onclick: () => {
        const isOpen = sectionEl.getAttribute("aria-expanded") === "true";
        if (isOpen) {
          collapseRef(ref);
        } else {
          for (const r of sectionRefs) {
            if (r.sectionEl !== sectionEl) collapseRef(r);
          }
          expandRef(ref);
        }
      },
    }, [
      el("span", { className: "label" }, [
        sectionIcon(section.id),
        el("span", { className: "label-text" }, [document.createTextNode(section.title)]),
      ]),
      iconChevron(),
    ]);

    ref.btn = btn;
    sectionEl.append(btn);

    itemsWrap.style.display = "none";
    sectionEl.append(itemsWrap);

    sectionRefs.push(ref);
    root.append(sectionEl);
  }

  let defaultIdx = -1;
  sections.forEach((s, i) => {
    if (s.defaultExpanded === true && defaultIdx < 0) {
      defaultIdx = i;
    }
  });
  _collapseAllMenuSections = () => {
    for (let i = 0; i < sectionRefs.length; i++) {
      collapseRef(sectionRefs[i]);
    }
  };

  if (defaultIdx >= 0) {
    sectionRefs.forEach((ref, i) => {
      if (i === defaultIdx) expandRef(ref);
      else collapseRef(ref);
    });
  }
}
