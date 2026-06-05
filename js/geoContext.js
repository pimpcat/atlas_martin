/**

 * Panel "Datos geográficos": pestañas de texto (ubicación, relieve, clima…)

 * y mini-mapa estatal persistente con el municipio resaltado (como Explorador municipal).

 *

 * Dependencias: api.js (fetchGeoContexto), map.js (ensureGeoMacroMap).

 */

import { fetchGeoContexto, getGeoContextoCached } from "./api.js";

import {

  destroyGeoMacroMap,

  ensureGeoMacroMap,

  invalidateGeoMacroMapSize,

  refitGeoMacroMap,

  setGeoMacroMunicipio,

} from "./map.js";



function normCve3(cve_mun) {

  const raw = String(cve_mun || "").trim();

  const digits = raw.replace(/\D/g, "");

  return digits ? (digits.length >= 3 ? digits.slice(-3) : ("000" + digits).slice(-3)) : "";

}



const TABS = [

  { id: "ubicacion", label: "Ubicación", field: "ubicacion" },

  { id: "superficie", label: "Superficie", field: "superficie" },

  { id: "relieve", label: "Relieve", field: "relieve" },

  { id: "clima", label: "Clima", field: "clima" },

  { id: "hidrografia", label: "Hidrografía", field: "hidrografia" },

  { id: "uso_suelo", label: "Uso de Suelo", field: "uso_suelo" },

];



function escapeHtml(s) {

  return String(s || "")

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");

}



/**

 * @param {{

 *   tabsEl: HTMLElement,

 *   contentEl: HTMLElement,

 *   metaEl?: HTMLElement | null,

 *   getMunicipio?: () => { cve_mun?: string, nomgeo?: string } | null,

 *   onTabChange?: (tabId: string) => void,

 * }} options

 */

export function createGeoContextController({ tabsEl, contentEl, metaEl, getMunicipio, onTabChange }) {

  let activeTabId = TABS[0].id;

  let lastCve = null;

  let macroCveSynced = null;

  let cacheRow = null;

  let reqSeq = 0;



  const textScrollEl = document.getElementById("geoTabTextScroll");

  const macroSectionEl = document.getElementById("geoMacroMapSection");

  const macroMountEl = document.getElementById("geoMacroMapMount");



  function setMeta(text) {

    if (metaEl) metaEl.textContent = text || "—";

  }



  function setMacroVisible(visible) {

    if (!macroSectionEl) return;

    macroSectionEl.classList.toggle("d-none", !visible);

    macroSectionEl.setAttribute("aria-hidden", visible ? "false" : "true");

    if (contentEl) {

      contentEl.classList.toggle("geo-tab-content--with-macro", visible);

    }

  }



  function setTextScrollHtml(html) {

    if (textScrollEl) {

      textScrollEl.innerHTML = html;

      return;

    }

    if (contentEl) contentEl.innerHTML = html;

  }



  function syncMacroMap(cve_mun, force = false) {

    const cve = normCve3(cve_mun);

    if (!cve || !macroMountEl || !macroMountEl.isConnected) return;

    if (!force && macroCveSynced === cve) {

      requestAnimationFrame(() => {

        try {

          invalidateGeoMacroMapSize(cve);

        } catch {

          /* noop */

        }

      });

      return;

    }

    macroCveSynced = cve;

    try {

      ensureGeoMacroMap(macroMountEl, cve);

      setGeoMacroMunicipio(cve);

    } catch (err) {

      console.warn("[geo] macro highlight:", err);

    }

    requestAnimationFrame(() => {

      try {

        refitGeoMacroMap(cve);

      } catch (err) {

        console.warn("[geo] macro refit:", err);

      }

    });

  }



  function teardownMacroMap() {

    macroCveSynced = null;

    destroyGeoMacroMap();

    setMacroVisible(false);

    if (contentEl) contentEl.classList.remove("geo-tab-content--with-macro");

  }



  function renderTabText(text) {

    const safe = escapeHtml(text || "");

    const inner = safe

      ? `<div class="context-text">${safe}</div>`

      : `<div class="empty-state">Sin texto para esta pestaña.</div>`;

    setTextScrollHtml(inner);

  }



  function renderTabs() {

    tabsEl.innerHTML = "";

    for (const t of TABS) {

      const li = document.createElement("li");

      li.className = "nav-item";

      li.setAttribute("role", "presentation");

      const btn = document.createElement("button");

      btn.className = "nav-link" + (t.id === activeTabId ? " active" : "");

      btn.type = "button";

      btn.setAttribute("role", "tab");

      btn.setAttribute("aria-selected", String(t.id === activeTabId));

      btn.textContent = t.label;

      btn.addEventListener("click", () => {

        if (activeTabId === t.id) return;

        activeTabId = t.id;

        renderTabs();

        renderActiveTabFromCache();

      });

      li.appendChild(btn);

      tabsEl.appendChild(li);

    }

  }



  function renderLoading() {

    setTextScrollHtml(`<div class="geo-loading">Cargando…</div>`);

  }



  function renderEmptyMunicipio() {

    teardownMacroMap();

    setTextScrollHtml(`<div class="empty-state">Selecciona un municipio para ver la información.</div>`);

  }



  function renderNoData() {

    teardownMacroMap();

    setTextScrollHtml(`<div class="empty-state">No hay información registrada para este municipio.</div>`);

  }



  function renderError(message) {

    teardownMacroMap();

    setTextScrollHtml(

      `<div class="empty-state">Error al cargar: ${escapeHtml(message || "Error desconocido")}</div>`

    );

  }



  function tabTextFromRow(row, tabId = activeTabId) {

    const tab = TABS.find((t) => t.id === tabId) || TABS[0];

    return row && row[tab.field] != null ? String(row[tab.field]) : "";

  }



  function renderActiveTabFromCache() {

    const m = getMunicipio ? getMunicipio() : null;

    const cve = normCve3(m?.cve_mun);

    if (!cve || !cacheRow || normCve3(lastCve) !== cve) {

      void refresh();

      return;

    }

    renderTabText(tabTextFromRow(cacheRow));

    if (typeof onTabChange === "function") onTabChange(activeTabId);

  }



  async function loadRow(cve_mun) {

    const seq = ++reqSeq;

    const cve = normCve3(cve_mun);

    const cached = getGeoContextoCached(cve);

    if (cached !== undefined) {

      if (seq !== reqSeq) return null;

      cacheRow = cached;

      lastCve = cve;

      return cached;

    }

    renderLoading();

    try {

      const row = await fetchGeoContexto(cve_mun);

      if (seq !== reqSeq) return null;

      cacheRow = row;

      lastCve = cve;

      return row;

    } catch (e) {

      if (seq !== reqSeq) return null;

      renderError(e && e.message ? e.message : String(e));

      return null;

    }

  }



  async function refresh() {

    const m = getMunicipio ? getMunicipio() : null;

    const cve = normCve3(m?.cve_mun);

    const nom = m && m.nomgeo ? String(m.nomgeo) : "";



    if (!cve) {

      setMeta("—");

      cacheRow = null;

      lastCve = null;

      renderEmptyMunicipio();

      if (typeof onTabChange === "function") onTabChange(activeTabId);

      return;

    }



    setMeta(nom ? nom : `Municipio ${cve}`);



    let row = cacheRow;

    const municipioChanged = lastCve !== cve;

    if (municipioChanged) {

      row = await loadRow(cve);

    }



    if (row === null) {

      if (!municipioChanged) renderNoData();

      if (typeof onTabChange === "function") onTabChange(activeTabId);

      return;

    }



    setMacroVisible(true);

    renderTabText(tabTextFromRow(row));

    if (municipioChanged || macroCveSynced !== cve) {

      syncMacroMap(cve, true);

    } else {

      syncMacroMap(cve, false);

    }



    if (typeof onTabChange === "function") onTabChange(activeTabId);

  }



  function setMunicipioChanged() {

    const m = getMunicipio ? getMunicipio() : null;

    const cve = normCve3(m?.cve_mun);

    const nom = m && m.nomgeo ? String(m.nomgeo) : "";

    cacheRow = null;

    lastCve = null;

    macroCveSynced = null;

    if (cve) {

      setMeta(nom ? nom : `Municipio ${cve}`);

    }

    void refresh();

    if (!cve) return;

    requestAnimationFrame(() => syncMacroMap(cve, true));

  }



  renderTabs();



  return {

    refresh,

    setMunicipioChanged,

    getActiveTabId: () => activeTabId,

    setActiveTab: (tabId) => {

      if (TABS.some((t) => t.id === tabId)) {

        activeTabId = tabId;

        renderTabs();

        renderActiveTabFromCache();

      }

    },

  };

}


