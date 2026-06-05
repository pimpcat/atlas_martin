/**
 * Catálogo INV 2020 — capas, campos (minúsculas en atlas.c_inv) y metadatos del panel.
 * Usado por invViv.js y el menú lateral en app.js.
 */

/** @typedef {"count"|"percent"|"grade"|"entorno"} InvValueKind */

/** @typedef {"point"|"polygon"} InvRenderMode */



/**

 * @typedef {Object} InvLayerDef

 * @property {string} id

 * @property {string} label

 * @property {string} group

 * @property {InvValueKind} kind

 * @property {InvRenderMode} render

 * @property {string} icon

 * @property {string} [color]

 */



/** @type {InvLayerDef[]} */

export const INV_LAYERS = [

  { id: "pobtot", label: "Población total", group: "Población", kind: "count", render: "point", icon: "person", color: "#66bb6a" },

  { id: "pobfem", label: "Población femenina", group: "Población", kind: "count", render: "point", icon: "person-f", color: "#ec407a" },

  { id: "pobmas", label: "Población masculina", group: "Población", kind: "count", render: "point", icon: "person-m", color: "#42a5f5" },

  { id: "pob0_14", label: "Población de 0 a 14 años", group: "Población", kind: "count", render: "point", icon: "person-child", color: "#2e7d32" },

  { id: "p15a29a", label: "Población de 15 a 29 años", group: "Población", kind: "count", render: "point", icon: "person-youth", color: "#7e57c2" },

  { id: "p30a59a", label: "Población de 30 a 59 años", group: "Población", kind: "count", render: "point", icon: "person-adult", color: "#3949ab" },

  { id: "p_60ymas", label: "Población de 60 años y más", group: "Población", kind: "count", render: "point", icon: "person-senior", color: "#fb8c00" },

  { id: "p_cd_t", label: "Población con discapacidad", group: "Población", kind: "count", render: "point", icon: "person-cd", color: "#e53935" },

  { id: "graproes", label: "Promedio de escolaridad", group: "Población", kind: "grade", render: "point", icon: "person-grad", color: "#8d6e63" },

  { id: "graproes_f", label: "Promedio de escolaridad, mujeres", group: "Población", kind: "grade", render: "point", icon: "person-grad-f", color: "#66bb6a" },

  { id: "graproes_m", label: "Promedio de escolaridad, hombres", group: "Población", kind: "grade", render: "point", icon: "person-grad-m", color: "#8d6e63" },

  { id: "vivtot", label: "Total de viviendas", group: "Viviendas", kind: "count", render: "point", icon: "house", color: "#66bb6a" },

  { id: "vivpar", label: "Total de viviendas particulares", group: "Viviendas", kind: "count", render: "point", icon: "house-par", color: "#ec407a" },

  { id: "tvipahab", label: "Viviendas particulares habitadas", group: "Viviendas", kind: "count", render: "point", icon: "house-hab", color: "#42a5f5" },

  { id: "vivnohab", label: "Viviendas particulares no habitadas", group: "Viviendas", kind: "count", render: "point", icon: "house-nohab", color: "#2e7d32" },

];



/** @type {InvLayerDef[]} */

export const INV_ENTORNO_LAYERS = [

  {

    id: "alumpub_c",

    label: "Alumbrado público",

    group: "Entorno Urbano",

    kind: "entorno",

    render: "polygon",

    icon: "entorno-alum",
    color: "#ffb300",

  },

  {

    id: "recucall_c",

    label: "Recubrimiento de la calle",

    group: "Entorno Urbano",

    kind: "entorno",

    render: "polygon",

    icon: "entorno-pav",
    color: "#8d6e63",

  },

];



export const INV_PANEL_GROUPS = ["Población", "Viviendas", "Entorno Urbano"];



export const INV_ALL_LAYERS = [...INV_LAYERS, ...INV_ENTORNO_LAYERS];



export const INV_FIELD_IDS = INV_ALL_LAYERS.map((l) => l.id);



export function getInvLayer(id) {

  return INV_ALL_LAYERS.find((l) => l.id === id) || null;

}



export function isInvPolygonLayer(id) {

  const it = getInvLayer(id);

  return it != null && it.render === "polygon";

}


