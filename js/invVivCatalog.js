/**
 * Catálogo INV 2020 — capas, campos (atlas.c_inv) y metadatos del panel.
 * Fuente: config/inv/catalog.json (API / estático) con fallback embebido.
 */

import { apiUrl } from "./atlasConfig.js";

/** @typedef {"count"|"percent"|"grade"|"entorno"} InvValueKind */
/** @typedef {"point"|"polygon"} InvRenderMode */

/**
 * @typedef {Object} InvLayerDef
 * @property {string} id
 * @property {string} field
 * @property {string} label
 * @property {string} group
 * @property {string} [group_id]
 * @property {InvValueKind} kind
 * @property {InvRenderMode} render
 * @property {string} icon
 * @property {string} [color]
 * @property {boolean} [hover]
 * @property {boolean} [enabled]
 */

/** Semilla embebida (= catálogo inicial) para resiliencia offline. */
const EMBEDDED_CATALOG = {
  version: 1,
  menu: {
    id: "geo_inv_viv",
    label: "Inventario de Viviendas",
    subtitle: "INV 2020 · Manzanas",
    enabled: true,
  },
  groups: [
    { id: "poblacion", label: "Población", order: 1 },
    { id: "viviendas", label: "Viviendas", order: 2 },
    { id: "entorno", label: "Entorno Urbano", order: 3 },
  ],
  indicators: [
    { id: "pobtot", field: "pobtot", label: "Población total", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#66bb6a", icon: "person", hover: true },
    { id: "pobfem", field: "pobfem", label: "Población femenina", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#ec407a", icon: "person-f", hover: true },
    { id: "pobmas", field: "pobmas", label: "Población masculina", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#42a5f5", icon: "person-m", hover: true },
    { id: "pob0_14", field: "pob0_14", label: "Población de 0 a 14 años", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#2e7d32", icon: "person-child", hover: true },
    { id: "p15a29a", field: "p15a29a", label: "Población de 15 a 29 años", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#7e57c2", icon: "person-youth", hover: true },
    { id: "p30a59a", field: "p30a59a", label: "Población de 30 a 59 años", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#3949ab", icon: "person-adult", hover: true },
    { id: "p_60ymas", field: "p_60ymas", label: "Población de 60 años y más", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#fb8c00", icon: "person-senior", hover: true },
    { id: "p_cd_t", field: "p_cd_t", label: "Población con discapacidad", group_id: "poblacion", enabled: true, kind: "count", render: "point", color: "#e53935", icon: "person-cd", hover: true },
    { id: "graproes", field: "graproes", label: "Promedio de escolaridad", group_id: "poblacion", enabled: true, kind: "grade", render: "point", color: "#8d6e63", icon: "person-grad", hover: true },
    { id: "graproes_f", field: "graproes_f", label: "Promedio de escolaridad, mujeres", group_id: "poblacion", enabled: true, kind: "grade", render: "point", color: "#66bb6a", icon: "person-grad-f", hover: true },
    { id: "graproes_m", field: "graproes_m", label: "Promedio de escolaridad, hombres", group_id: "poblacion", enabled: true, kind: "grade", render: "point", color: "#8d6e63", icon: "person-grad-m", hover: true },
    { id: "vivtot", field: "vivtot", label: "Total de viviendas", group_id: "viviendas", enabled: true, kind: "count", render: "point", color: "#66bb6a", icon: "house", hover: true },
    { id: "vivpar", field: "vivpar", label: "Total de viviendas particulares", group_id: "viviendas", enabled: true, kind: "count", render: "point", color: "#ec407a", icon: "house-par", hover: true },
    { id: "tvipahab", field: "tvipahab", label: "Viviendas particulares habitadas", group_id: "viviendas", enabled: true, kind: "count", render: "point", color: "#42a5f5", icon: "house-hab", hover: true },
    { id: "vivnohab", field: "vivnohab", label: "Viviendas particulares no habitadas", group_id: "viviendas", enabled: true, kind: "count", render: "point", color: "#2e7d32", icon: "house-nohab", hover: true },
    { id: "alumpub_c", field: "alumpub_c", label: "Alumbrado público", group_id: "entorno", enabled: true, kind: "entorno", render: "polygon", color: "#ffb300", icon: "entorno-alum", hover: true },
    { id: "recucall_c", field: "recucall_c", label: "Recubrimiento de la calle", group_id: "entorno", enabled: true, kind: "entorno", render: "polygon", color: "#8d6e63", icon: "entorno-pav", hover: true },
  ],
  hover_defaults: ["cvegeo", "ambito"],
};

/** @type {InvLayerDef[]} */
export const INV_LAYERS = [];
/** @type {InvLayerDef[]} */
export const INV_ENTORNO_LAYERS = [];
/** @type {string[]} */
export const INV_PANEL_GROUPS = [];
/** @type {InvLayerDef[]} */
export const INV_ALL_LAYERS = [];
/** @type {string[]} */
export const INV_FIELD_IDS = [];

/** @type {object} */
let _catalog = EMBEDDED_CATALOG;
let _loadPromise = null;
let _remoteLoaded = false;

function indicatorToLayer(ind, groupLabelById) {
  const gid = ind.group_id || "";
  return {
    id: ind.id || ind.field,
    field: ind.field || ind.id,
    label: ind.label || ind.field || ind.id,
    group: groupLabelById.get(gid) || gid || "Otros",
    group_id: gid,
    kind: ind.kind || "count",
    render: ind.render || "point",
    icon: ind.icon || "person",
    color: ind.color || "#66bb6a",
    hover: ind.hover !== false,
    enabled: ind.enabled !== false,
  };
}

function applyCatalog(catalog) {
  _catalog = catalog || EMBEDDED_CATALOG;
  const groups = [...(_catalog.groups || [])].sort(
    (a, b) =>
      (a.order || 0) - (b.order || 0) ||
      String(a.label || "").localeCompare(String(b.label || ""))
  );
  const groupLabelById = new Map(groups.map((g) => [g.id, g.label || g.id]));
  const layers = (_catalog.indicators || [])
    .filter((i) => i && i.enabled !== false)
    .map((i) => indicatorToLayer(i, groupLabelById));

  INV_PANEL_GROUPS.length = 0;
  for (const g of groups) {
    if (layers.some((l) => l.group_id === g.id)) {
      INV_PANEL_GROUPS.push(g.label || g.id);
    }
  }

  INV_LAYERS.length = 0;
  INV_ENTORNO_LAYERS.length = 0;
  for (const l of layers) {
    if (l.kind === "entorno" || l.render === "polygon") {
      INV_ENTORNO_LAYERS.push(l);
    } else {
      INV_LAYERS.push(l);
    }
  }

  INV_ALL_LAYERS.length = 0;
  INV_ALL_LAYERS.push(...INV_LAYERS, ...INV_ENTORNO_LAYERS);
  INV_FIELD_IDS.length = 0;
  INV_FIELD_IDS.push(...INV_ALL_LAYERS.map((l) => l.id));
  return _catalog;
}

applyCatalog(EMBEDDED_CATALOG);

export function getInvCatalogCached() {
  return _catalog;
}

export function getInvHoverDefaults() {
  const d = _catalog?.hover_defaults;
  return Array.isArray(d) && d.length ? d.map(String) : ["cvegeo", "ambito"];
}

/**
 * Capas de hover para la sección del indicador activo (+ seleccionado).
 * @param {string} fieldId
 * @returns {InvLayerDef[]}
 */
export function getInvHoverLayersForField(fieldId) {
  const active = getInvLayer(fieldId);
  if (!active) return [];
  const gid = active.group_id;
  return INV_ALL_LAYERS.filter((l) => {
    if (gid && l.group_id !== gid) return false;
    if (l.id === active.id || l.field === active.field) return true;
    return l.hover !== false;
  });
}

export async function loadInvCatalog({ force = false } = {}) {
  if (!force && _remoteLoaded) return _catalog;
  if (!force && _loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const tryUrls = [apiUrl("/api/inv/catalog"), "./config/inv/catalog.json"];
    for (const url of tryUrls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: force ? "no-store" : "default",
        });
        if (!res.ok) continue;
        const data = await res.json();
        const cat = data?.catalog || data;
        if (cat && Array.isArray(cat.indicators)) {
          _remoteLoaded = true;
          return applyCatalog(cat);
        }
      } catch {
        /* next */
      }
    }
    return applyCatalog(EMBEDDED_CATALOG);
  })().finally(() => {
    _loadPromise = null;
  });

  return _loadPromise;
}

export function getInvLayer(id) {
  const key = String(id || "").trim();
  return (
    INV_ALL_LAYERS.find((l) => l.id === key || l.field === key) || null
  );
}

export function isInvPolygonLayer(id) {
  const it = getInvLayer(id);
  return it != null && it.render === "polygon";
}

export function invMenuItemFromCatalog(catalog) {
  const menu = catalog?.menu || EMBEDDED_CATALOG.menu;
  return {
    id: menu.id || "geo_inv_viv",
    title: menu.label || "Inventario de Viviendas",
    subtitle: menu.subtitle || "INV 2020 · Manzanas",
    unit: "",
    viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
    invViv: true,
  };
}
