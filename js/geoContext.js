/**
 * Panel "Datos geográficos": pestañas de texto y mini-mapa estatal.
 * Las pestañas vienen del catálogo GroSIG Geography Context.
 *
 * Dependencias: api.js (fetchGeoContexto), map.js (ensureGeoMacroMap),
 * geographyContextClient.js (catálogo).
 */

import { fetchGeoContexto, getGeoContextoCached } from "./api.js";
import { getActiveCveEnt } from "./amigoDeployment.js";
import {
  fetchGeographyCatalog,
  getGeographyCatalogCached,
} from "./geographyContextClient.js";
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

function normEnt(cve_ent) {
  const d = String(cve_ent ?? "").replace(/\D/g, "");
  return d.length >= 2 ? d.slice(-2) : "";
}

function resolveEnt(m) {
  return normEnt(m?.cve_ent || getActiveCveEnt());
}

/** Fallback si el catálogo no carga (paridad con seed). */
const FALLBACK_TABS = [
  { id: "ubicacion", label: "Ubicación", layers: [], show_legend: false },
  { id: "superficie", label: "Superficie", layers: [], show_legend: false },
  { id: "relieve", label: "Relieve", layers: ["curvas_nivel"], show_legend: true },
  { id: "clima", label: "Clima", layers: ["clima"], show_legend: true },
  {
    id: "hidrografia",
    label: "Hidrografía",
    layers: ["hidro_corrientes", "hidro_cuerpos"],
    show_legend: true,
  },
  { id: "uso_suelo", label: "Uso de Suelo", layers: ["uso_suelo"], show_legend: true },
];

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeTabs(catalog) {
  const tabs = (catalog?.tabs || []).filter((t) => t && t.enabled !== false);
  if (!tabs.length) return FALLBACK_TABS.map((t) => ({ ...t }));
  return tabs
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((t) => ({
      id: t.id,
      label: t.label || t.id,
      layers: Array.isArray(t.layers) ? t.layers.slice() : [],
      show_legend: Boolean(t.show_legend),
      text: t.text || {},
    }));
}

/**
 * @param {{
 *   tabsEl: HTMLElement,
 *   contentEl: HTMLElement,
 *   metaEl?: HTMLElement | null,
 *   getMunicipio?: () => { cve_mun?: string, nomgeo?: string } | null,
 *   onTabChange?: (tabId: string, tab?: object) => void,
 * }} options
 */
export function createGeoContextController({
  tabsEl,
  contentEl,
  metaEl,
  getMunicipio,
  onTabChange,
}) {
  let tabs = normalizeTabs(getGeographyCatalogCached());
  let activeTabId = tabs[0]?.id || "ubicacion";
  let lastCve = null;
  let lastEnt = null;
  let macroCveSynced = null;
  let cacheRow = null;
  let reqSeq = 0;
  let layout = { macro_map: true, detail_map_lock: true };

  const textScrollEl = document.getElementById("geoTabTextScroll");
  const macroSectionEl = document.getElementById("geoMacroMapSection");
  const macroMountEl = document.getElementById("geoMacroMapMount");

  function setMeta(text) {
    if (metaEl) metaEl.textContent = text || "—";
  }

  function setTextScrollHtml(html) {
    if (textScrollEl) textScrollEl.innerHTML = html;
    else if (contentEl) contentEl.innerHTML = html;
  }

  function setMacroVisible(on) {
    if (!macroSectionEl) return;
    const show = Boolean(on) && layout.macro_map !== false;
    macroSectionEl.classList.toggle("d-none", !show);
    if (show) {
      requestAnimationFrame(() => {
        invalidateGeoMacroMapSize();
        refitGeoMacroMap();
      });
    }
  }

  function teardownMacroMap() {
    setMacroVisible(false);
    destroyGeoMacroMap();
    macroCveSynced = null;
  }

  function syncMacroMap(cve, forceRefit) {
    if (!macroMountEl || layout.macro_map === false) {
      teardownMacroMap();
      return;
    }
    setMacroVisible(true);
    ensureGeoMacroMap(macroMountEl);
    setGeoMacroMunicipio(cve);
    if (forceRefit || macroCveSynced !== cve) {
      refitGeoMacroMap();
      macroCveSynced = cve;
    }
  }

  function getActiveTab() {
    return tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  }

  function notifyTabChange() {
    if (typeof onTabChange === "function") onTabChange(activeTabId, getActiveTab());
  }

  function renderTabText(text) {
    const safe = escapeHtml(String(text || "").replace(/^\s+/, "").replace(/\s+$/, ""));
    const inner = safe
      ? `<div class="context-text">${safe}</div>`
      : `<div class="empty-state">Sin texto para esta pestaña.</div>`;
    setTextScrollHtml(inner);
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    for (const t of tabs) {
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
    setTextScrollHtml(
      `<div class="empty-state">Selecciona un municipio para ver la información.</div>`
    );
  }

  function renderTextEmpty() {
    setTextScrollHtml(
      `<div class="empty-state">No hay información registrada para este municipio.</div>`
    );
  }

  function renderNoData() {
    teardownMacroMap();
    setTextScrollHtml(
      `<div class="empty-state">No hay información registrada para este municipio.</div>`
    );
  }

  function renderError(message) {
    teardownMacroMap();
    setTextScrollHtml(
      `<div class="empty-state">Error al cargar: ${escapeHtml(message || "Error desconocido")}</div>`
    );
  }

  /** Texto por id de pestaña (API Geography Context) o campo legacy. */
  function tabTextFromRow(row, tabId = activeTabId) {
    if (!row) return "";
    if (row[tabId] != null && row[tabId] !== "") return String(row[tabId]);
    const tab = tabs.find((t) => t.id === tabId);
    const field = tab?.text?.field || tabId;
    if (row[field] != null) return String(row[field]);
    return "";
  }

  function renderActiveTabFromCache() {
    const m = getMunicipio ? getMunicipio() : null;
    const cve = normCve3(m?.cve_mun);
    const ent = resolveEnt(m);
    if (!cve || normCve3(lastCve) !== cve || lastEnt !== ent) {
      void refresh();
      return;
    }
    if (cacheRow) {
      renderTabText(tabTextFromRow(cacheRow));
    } else {
      renderTextEmpty();
    }
    notifyTabChange();
  }

  async function loadRow(cve_mun, cve_ent) {
    const seq = ++reqSeq;
    const cve = normCve3(cve_mun);
    const ent = normEnt(cve_ent);
    const cached = getGeoContextoCached(cve, ent);
    if (cached !== undefined) {
      if (seq !== reqSeq) return null;
      cacheRow = cached;
      lastCve = cve;
      lastEnt = ent;
      return cached;
    }
    renderLoading();
    try {
      const row = await fetchGeoContexto(cve_mun, { cve_ent: ent });
      if (seq !== reqSeq) return null;
      cacheRow = row;
      lastCve = cve;
      lastEnt = ent;
      return row;
    } catch (e) {
      if (seq !== reqSeq) return null;
      renderError(e && e.message ? e.message : String(e));
      return undefined;
    }
  }

  async function ensureCatalogLoaded() {
    try {
      const ent = resolveEnt(getMunicipio ? getMunicipio() : null);
      const cat = await fetchGeographyCatalog({ cve_ent: ent || undefined });
      tabs = normalizeTabs(cat);
      layout = {
        macro_map: cat?.layout?.macro_map !== false,
        detail_map_lock: cat?.layout?.detail_map_lock !== false,
      };
      if (!tabs.some((t) => t.id === activeTabId)) {
        activeTabId = tabs[0]?.id || "ubicacion";
      }
      renderTabs();
    } catch {
      tabs = normalizeTabs(null);
      renderTabs();
    }
  }

  async function refresh() {
    const m = getMunicipio ? getMunicipio() : null;
    const cve = normCve3(m?.cve_mun);
    const ent = resolveEnt(m);
    const nom = m && m.nomgeo ? String(m.nomgeo) : "";

    if (!cve) {
      setMeta("—");
      cacheRow = null;
      lastCve = null;
      lastEnt = null;
      renderEmptyMunicipio();
      notifyTabChange();
      return;
    }

    setMeta(nom ? nom : `Municipio ${cve}`);

    let row = cacheRow;
    const territoryChanged = lastCve !== cve || lastEnt !== ent;
    if (territoryChanged) {
      row = await loadRow(cve, ent);
      if (row === undefined) {
        notifyTabChange();
        return;
      }
    }

    setMacroVisible(true);
    if (row) {
      renderTabText(tabTextFromRow(row));
    } else {
      renderTextEmpty();
    }
    if (territoryChanged || macroCveSynced !== cve) {
      syncMacroMap(cve, true);
    } else {
      syncMacroMap(cve, false);
    }

    notifyTabChange();
  }

  function setMunicipioChanged() {
    const m = getMunicipio ? getMunicipio() : null;
    const cve = normCve3(m?.cve_mun);
    const nom = m && m.nomgeo ? String(m.nomgeo) : "";
    cacheRow = null;
    lastCve = null;
    lastEnt = null;
    macroCveSynced = null;
    if (cve) {
      setMeta(nom ? nom : `Municipio ${cve}`);
    }
    void refresh();
    if (!cve) return;
    requestAnimationFrame(() => syncMacroMap(cve, true));
  }

  renderTabs();
  void ensureCatalogLoaded();

  return {
    refresh: async () => {
      await ensureCatalogLoaded();
      return refresh();
    },
    setMunicipioChanged,
    getActiveTabId: () => activeTabId,
    getActiveTab: () => getActiveTab(),
    getTabs: () => tabs.slice(),
    setActiveTab: (tabId) => {
      if (tabs.some((t) => t.id === tabId)) {
        activeTabId = tabId;
        renderTabs();
        renderActiveTabFromCache();
      }
    },
  };
}
