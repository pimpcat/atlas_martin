/**
 * Tablas Martin (PostGIS atlas.*) y simbología MapLibre (MxSIG_vector.map).
 * source-layer en MVT = id del catálogo Martin (p. ej. "c_mun", no "atlas.c_mun").
 */

/** Suavizado sutil del trazo central (overlays / detalle). */
export const LINE_BLUR_SOFT = 0.2;

/** Glyphs MapLibre (requerido para capas symbol / etiquetas). */
export const MAPLIBRE_GLYPHS_URL = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

/** Visor geográfico — etiquetas de localidades (puntos) desde este zoom. */
export const LOCS_PUNTO_LABEL_MIN_ZOOM = 13;

/** Clave geográfica + nombre (sin prefijo; el hover sigue mostrando "Localidad:"). */
export const LOCS_PUNTO_LABEL_TEXT = [
  "case",
  [
    "all",
    [">", ["length", ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""]], 0],
    [">", ["length", ["coalesce", ["get", "nom_loc"], ["get", "NOM_LOC"], ""]], 0],
  ],
  [
    "concat",
    ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""],
    " ",
    ["coalesce", ["get", "nom_loc"], ["get", "NOM_LOC"], ""],
  ],
  [">", ["length", ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""]], 0],
  ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], "—"],
  [">", ["length", ["coalesce", ["get", "nom_loc"], ["get", "NOM_LOC"], ""]], 0],
  ["coalesce", ["get", "nom_loc"], ["get", "NOM_LOC"], "—"],
  "—",
];

export const LOCS_PUNTO_LABEL_LAYOUT = {
  "text-field": LOCS_PUNTO_LABEL_TEXT,
  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 13, 13, 15, 14, 17, 15],
  "text-anchor": "bottom",
  "text-offset": [0, -1.45],
  "text-justify": "center",
  "text-max-width": 20,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "text-letter-spacing": 0.01,
  "symbol-placement": "point",
  "visibility": "none",
};

export const LOCS_PUNTO_LABEL_PAINT = {
  "text-color": "#2c3e50",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": ["step", ["zoom"], 0, LOCS_PUNTO_LABEL_MIN_ZOOM, 1],
};

export const LOCS_PUNTO_LABEL_PAINT_CLARO = {
  "text-color": "#2c3e50",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": LOCS_PUNTO_LABEL_PAINT["text-opacity"],
};

/** Localidades con amanzanamiento (c_l) — misma etiqueta desde zoom 13. */
export const LOCS_ATLAS_LABEL_MIN_ZOOM = LOCS_PUNTO_LABEL_MIN_ZOOM;

export const LOCS_ATLAS_LABEL_TEXT = [
  "case",
  [
    "all",
    [">", ["length", ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""]], 0],
    [">", ["length", ["coalesce", ["get", "nomgeo"], ["get", "NOMGEO"], ""]], 0],
  ],
  [
    "concat",
    ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""],
    " ",
    ["coalesce", ["get", "nomgeo"], ["get", "NOMGEO"], ""],
  ],
  [">", ["length", ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], ""]], 0],
  ["coalesce", ["get", "cvegeo"], ["get", "CVEGEO"], "—"],
  [">", ["length", ["coalesce", ["get", "nomgeo"], ["get", "NOMGEO"], ""]], 0],
  ["coalesce", ["get", "nomgeo"], ["get", "NOMGEO"], "—"],
  "—",
];

export const LOCS_ATLAS_LABEL_LAYOUT = {
  ...LOCS_PUNTO_LABEL_LAYOUT,
  "text-field": LOCS_ATLAS_LABEL_TEXT,
};

export const LOCS_ATLAS_LABEL_PAINT = { ...LOCS_PUNTO_LABEL_PAINT };
export const LOCS_ATLAS_LABEL_PAINT_CLARO = { ...LOCS_PUNTO_LABEL_PAINT_CLARO };

/** Colonias (c_col_ase) — etiquetas desde zoom 14. */
export const COLONIAS_LABEL_MIN_ZOOM = 14;

export const COLONIAS_LABEL_TEXT = [
  "coalesce",
  ["get", "nom_asen"],
  ["get", "NOM_ASEN"],
  "—",
];

export const COLONIAS_LABEL_LAYOUT = {
  "text-field": COLONIAS_LABEL_TEXT,
  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 14, 13, 16, 14, 18, 15],
  "text-anchor": "center",
  "text-offset": [0, 0],
  "text-justify": "center",
  "text-max-width": 20,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "text-letter-spacing": 0.01,
  "symbol-placement": "point",
  "symbol-avoid-edges": true,
  "visibility": "none",
};

export const COLONIAS_LABEL_PAINT = {
  "text-color": "#2c3e50",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": ["step", ["zoom"], 0, COLONIAS_LABEL_MIN_ZOOM, 1],
};

export const COLONIAS_LABEL_PAINT_CLARO = { ...COLONIAS_LABEL_PAINT };

/** Residuos sólidos urbanos (c_residuo_solido) — etiquetas desde zoom 14. */
export const RESIDUO_SOLIDO_LABEL_MIN_ZOOM = 14;

export const RESIDUO_SOLIDO_LABEL_TEXT = [
  "case",
  [
    "all",
    [">", ["length", ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""]], 0],
    [">", ["length", ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], ""]], 0],
  ],
  [
    "concat",
    ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""],
    "\n",
    ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], ""],
  ],
  [">", ["length", ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""]], 0],
  ["coalesce", ["get", "tipo"], ["get", "TIPO"], "—"],
  [">", ["length", ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], ""]], 0],
  ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], "—"],
  "—",
];

export const RESIDUO_SOLIDO_LABEL_LAYOUT = {
  "text-field": RESIDUO_SOLIDO_LABEL_TEXT,
  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 14, 12, 16, 13, 18, 14],
  "text-anchor": "bottom",
  "text-offset": [0, -1.6],
  "text-justify": "center",
  "text-max-width": 18,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "text-line-height": 1.15,
  "symbol-placement": "point",
  "visibility": "none",
};

export const RESIDUO_SOLIDO_LABEL_PAINT = {
  "text-color": "#3e2723",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": ["step", ["zoom"], 0, RESIDUO_SOLIDO_LABEL_MIN_ZOOM, 1],
};

export const RESIDUO_SOLIDO_LABEL_PAINT_CLARO = { ...RESIDUO_SOLIDO_LABEL_PAINT };

/** Agua y saneamiento (c_agua_sanea) — etiquetas desde zoom 14 (mismo texto que el hover). */
export const SANEAMIENTO_AGUA_LABEL_MIN_ZOOM = 14;

export const SANEAMIENTO_AGUA_LABEL_TEXT = [
  "case",
  [
    "all",
    [">", ["length", ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""]], 0],
    [">", ["length", ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], ""]], 0],
  ],
  [
    "concat",
    ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""],
    ": ",
    ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], ""],
  ],
  [">", ["length", ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""]], 0],
  ["concat", ["coalesce", ["get", "tipo"], ["get", "TIPO"], ""], ":"],
  [">", ["length", ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], ""]], 0],
  ["coalesce", ["get", "nom_tipo"], ["get", "NOM_TIPO"], "—"],
  "—",
];

export const SANEAMIENTO_AGUA_LABEL_LAYOUT = {
  "text-field": SANEAMIENTO_AGUA_LABEL_TEXT,
  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 14, 12, 16, 13, 18, 14],
  "text-anchor": "bottom",
  "text-offset": [0, -1.2],
  "text-justify": "center",
  "text-max-width": 18,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "symbol-placement": "point",
  "visibility": "none",
};

export const SANEAMIENTO_AGUA_LABEL_PAINT = {
  "text-color": "#004080",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": ["step", ["zoom"], 0, SANEAMIENTO_AGUA_LABEL_MIN_ZOOM, 1],
};

export const SANEAMIENTO_AGUA_LABEL_PAINT_CLARO = { ...SANEAMIENTO_AGUA_LABEL_PAINT };

/** Establecimientos de salud (c_clues) — etiquetas fijas desde zoom 14 (icono siempre visible). */
export const CLUES_LABEL_MIN_ZOOM = 14;

export const CLUES_LABEL_TEXT = [
  "case",
  [
    "all",
    [">", ["length", ["coalesce", ["get", "nom_insti"], ["get", "NOM_INSTI"], ""]], 0],
    [">", ["length", ["coalesce", ["get", "nom_comer"], ["get", "NOM_COMER"], ""]], 0],
    [">", ["length", ["coalesce", ["get", "nom_insadm"], ["get", "NOM_INSADM"], ""]], 0],
  ],
  [
    "concat",
    ["coalesce", ["get", "nom_insti"], ["get", "NOM_INSTI"], ""],
    " ",
    ["coalesce", ["get", "nom_comer"], ["get", "NOM_COMER"], ""],
    "\n",
    ["coalesce", ["get", "nom_insadm"], ["get", "NOM_INSADM"], ""],
  ],
  [
    "all",
    [">", ["length", ["coalesce", ["get", "nom_insti"], ["get", "NOM_INSTI"], ""]], 0],
    [">", ["length", ["coalesce", ["get", "nom_comer"], ["get", "NOM_COMER"], ""]], 0],
  ],
  [
    "concat",
    ["coalesce", ["get", "nom_insti"], ["get", "NOM_INSTI"], ""],
    " ",
    ["coalesce", ["get", "nom_comer"], ["get", "NOM_COMER"], ""],
  ],
  [">", ["length", ["coalesce", ["get", "nom_insti"], ["get", "NOM_INSTI"], ""]], 0],
  ["coalesce", ["get", "nom_insti"], ["get", "NOM_INSTI"], "—"],
  [">", ["length", ["coalesce", ["get", "nom_comer"], ["get", "NOM_COMER"], ""]], 0],
  ["coalesce", ["get", "nom_comer"], ["get", "NOM_COMER"], "—"],
  [">", ["length", ["coalesce", ["get", "nom_insadm"], ["get", "NOM_INSADM"], ""]], 0],
  ["coalesce", ["get", "nom_insadm"], ["get", "NOM_INSADM"], "—"],
  "—",
];

export const CLUES_LABEL_LAYOUT = {
  "text-field": CLUES_LABEL_TEXT,
  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 14, 12, 16, 13, 18, 14],
  "text-anchor": "bottom",
  "text-offset": [0, -2.1],
  "text-justify": "center",
  "text-max-width": 18,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "text-line-height": 1.15,
  "symbol-placement": "point",
  "visibility": "none",
};

export const CLUES_LABEL_PAINT = {
  "text-color": "#004d40",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": ["step", ["zoom"], 0, CLUES_LABEL_MIN_ZOOM, 1],
};

export const CLUES_LABEL_PAINT_CLARO = { ...CLUES_LABEL_PAINT };

/** Hidrografía — texto «NOMBRE: …» (hover y etiquetas del visor geográfico). */
export const HIDRO_NOMBRE_LABEL_TEXT = [
  "case",
  [">", ["length", ["coalesce", ["get", "nombre"], ["get", "NOMBRE"], ""]], 0],
  ["concat", "NOMBRE: ", ["coalesce", ["get", "nombre"], ["get", "NOMBRE"], ""]],
  "NOMBRE: —",
];

/** Corrientes de agua (hcorrientes) — etiquetas desde zoom 16. */
export const HCORRIENTES_LABEL_MIN_ZOOM = 16;

export const HCORRIENTES_LABEL_TEXT = [
  "concat",
  "Corriente de agua\n",
  HIDRO_NOMBRE_LABEL_TEXT,
];

export const HCORRIENTES_LABEL_LAYOUT = {
  "text-field": HCORRIENTES_LABEL_TEXT,
  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 16, 11, 18, 12, 20, 13],
  "text-anchor": "center",
  "text-justify": "center",
  "text-max-width": 16,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "text-line-height": 1.15,
  "symbol-placement": "line",
  "text-rotation-alignment": "map",
  "visibility": "none",
};

export const HCORRIENTES_LABEL_PAINT = {
  "text-color": "#004080",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": ["step", ["zoom"], 0, HCORRIENTES_LABEL_MIN_ZOOM, 1],
};

export const HCORRIENTES_LABEL_PAINT_CLARO = { ...HCORRIENTES_LABEL_PAINT };

/** Cuerpos de agua (hcuerpos) — etiquetas desde zoom 13. */
export const HCUERPOS_LABEL_MIN_ZOOM = 13;

export const HCUERPOS_LABEL_TEXT = [
  "concat",
  "Cuerpo de agua\n",
  HIDRO_NOMBRE_LABEL_TEXT,
];

export const HCUERPOS_LABEL_LAYOUT = {
  "text-field": HCUERPOS_LABEL_TEXT,
  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold", "Open Sans Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 16, 12, 18, 13],
  "text-anchor": "center",
  "text-justify": "center",
  "text-max-width": 16,
  "text-allow-overlap": true,
  "text-ignore-placement": true,
  "text-line-height": 1.15,
  "symbol-placement": "point",
  "visibility": "none",
};

export const HCUERPOS_LABEL_PAINT = {
  "text-color": "#004080",
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
  "text-halo-blur": 0.5,
  "text-opacity": ["step", ["zoom"], 0, HCUERPOS_LABEL_MIN_ZOOM, 1],
};

export const HCUERPOS_LABEL_PAINT_CLARO = { ...HCUERPOS_LABEL_PAINT };

/** Municipios: visibles pero por debajo del contorno estatal. */
export const HOME_MUN_LINE_STACK_OPACITY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5,
  0.72,
  8,
  0.82,
  10,
  0.92,
  12,
  1,
  14,
  1,
];

/** @deprecated alias de HOME_MUN_LINE_STACK_OPACITY */
export const HOME_LINE_STACK_OPACITY = HOME_MUN_LINE_STACK_OPACITY;

/** Contorno estatal: visible desde zoom bajo (no se apaga como municipios). */
export const HOME_ENT_LINE_STACK_OPACITY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5,
  0.92,
  7,
  0.97,
  9,
  1,
  11,
  1,
];

/** line-blur mayor en zoom bajo suaviza el trazo vectorial (MapLibre paint line-blur). */
export const HOME_LINE_BLUR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5,
  0.55,
  8,
  0.35,
  11,
  0.18,
  14,
  0.08,
];

/** Joins/caps redondeados — mejora esquinas y terminaciones. */
export const LINE_LAYOUT_SMOOTH = {
  "line-join": "round",
  "line-cap": "round",
};

function homeLineOpacity(zoomStops) {
  return ["*", HOME_MUN_LINE_STACK_OPACITY, ["interpolate", ["linear"], ["zoom"], ...zoomStops]];
}

function homeMunLineOpacity(zoomStops) {
  return homeLineOpacity(zoomStops);
}

function homeEntLineOpacity(zoomStops) {
  return ["*", HOME_ENT_LINE_STACK_OPACITY, ["interpolate", ["linear"], ["zoom"], ...zoomStops]];
}

/** Ancho de línea escalado por zoom: lineWidthZoom(8, 1, 12, 2, 15, 4) */
export function lineWidthZoom(...stops) {
  return ["interpolate", ["linear"], ["zoom"], ...stops];
}

/**
 * Municipios — gruesos en vista estatal (Explorador ~z6–8); al acercar (z9+) grosor fino.
 * fill-outline-color siempre ~1px; en Explorador se apaga (HOME_MUN_DISP_FILL_PAINT).
 */
const MUN_LINE_HALO_WIDTH = lineWidthZoom(5, 14, 7, 13, 8, 12, 9, 5.4, 12, 6, 15, 6.8);
const MUN_LINE_WIDTH = lineWidthZoom(5, 5.5, 7, 5, 8, 4.5, 9, 2.25, 12, 2.85, 15, 3.4);

/** Sin line-blur en zoom bajo: el blur hacía ver delgadas las líneas en vista estatal. */
export const HOME_MUN_LINE_BLUR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5,
  0,
  9,
  0,
  11,
  0.18,
  14,
  0.08,
];

/**
 * Contorno estatal — doble línea (halo + núcleo), ~2× grosor municipal en vista estatal.
 * La capa casing queda disponible pero apagada (evita banda excesiva).
 */
const ENT_LINE_CASING_WIDTH = lineWidthZoom(5, 10, 7, 11, 9, 12, 12, 13, 15, 14);
const ENT_LINE_HALO_WIDTH = lineWidthZoom(5, 6, 7, 6.5, 9, 7, 12, 8, 15, 9);
const ENT_LINE_WIDTH = lineWidthZoom(5, 2.2, 7, 2.4, 9, 2.6, 12, 2.9, 15, 3.2);

/** Overlays administrativos (colonias, AGEB, localidades). */
const DETAIL_LINE_HALO = lineWidthZoom(10, 1.6, 13, 2.6, 16, 3.8, 18, 5.5);
const DETAIL_LINE_CORE = lineWidthZoom(10, 0.75, 13, 1.35, 16, 2.2, 18, 3.5);

/** Vialidades / RNC. */
const ROAD_LINE_HALO = lineWidthZoom(10, 2.2, 13, 3.4, 16, 5, 18, 7);
const ROAD_LINE_CORE = lineWidthZoom(10, 1.1, 13, 2, 16, 3.2, 18, 4.8);

/** Hidrografía (corrientes). */
const HYDRO_LINE_HALO = lineWidthZoom(8, 1.8, 11, 3, 14, 4.5, 16, 6);
const HYDRO_LINE_CORE = lineWidthZoom(8, 0.9, 11, 1.6, 14, 2.8, 16, 4);

/** Curvas de nivel (curnivel / c_curvasn en MxSIG_vector.map). */
const CUR_LINE_HALO = lineWidthZoom(10, 1.6, 13, 2, 16, 2.4);
const CUR_LINE_CORE = lineWidthZoom(10, 1, 13, 1.2, 16, 1.5);
const CUR_MA_HALO = lineWidthZoom(10, 3.4, 13, 3.8, 16, 4.2);
const CUR_MA_CORE = lineWidthZoom(10, 2.2, 13, 2.6, 16, 3);

/** Vialidades — MapServer OUTLINECOLOR 140 95 55 (sin relleno oscuro). */
const VIAL_COLOR = "rgb(140, 95, 55)";

/** RNC — colores por tipo_vial (OUTLINECOLOR en MxSIG_vector.map). */
export const RNC_LINE_COLOR = [
  "match",
  ["coalesce", ["get", "tipo_vial"], ["get", "TIPO_VIAL"], ""],
  "Carretera",
  "rgb(200, 0, 0)",
  "Periférico",
  "rgb(235, 145, 60)",
  "Vereda",
  "rgb(0, 0, 0)",
  "Camino",
  "rgb(140, 95, 55)",
  "rgb(140, 95, 55)",
];
export const MARTIN_TABLES = {
  entidad: "c_ent",
  entidadDisp: "v_c_ent_disp",
  municipios: "c_mun",
  municipiosDisp: "v_c_mun_disp",
  locsAtlas: "c_l",
  locsPunto: "c_loc_punto",
  colonias: "c_col_ase",
  agebUrbanas: "c_a",
  agebRurales: "c_ar",
  manzanas: "c_m",
  vialidades: "c_e",
  rnc: "c_rnc",
  saneamientoAgua: "c_agua_sanea",
  residuoSolido: "c_residuo_solido",
  clues: "c_clues",
  clima: "clima",
  hcorrientes: "hcorrientes",
  hcuerpos: "hcuerpos",
  curnivel: "curnivel",
};

/** Curvas maestras (elev múltiplo de 1000) — MxSIG c_curvasn. */
export function curnivelMaestroFilter() {
  return [
    "==",
    ["%", ["round", ["to-number", ["coalesce", ["get", "elev"], ["get", "ELEV"], 0]]], 1000],
    0,
  ];
}

/** Uso de suelo (Martin: atlas.usosuelo). */
export const MARTIN_USO_SUELO = {
  sourceId: "src_usosuelo",
  layerId: "lyr_usosuelo",
  martinPath: "usosuelo",
  sourceLayer: "usosuelo",
};

/** Capa vectorial dentro del tile (.pbf) */
export function martinSourceLayer(table) {
  return table;
}

export const LAYER_PAINT = {
  /**
   * Municipios — estilo MapServer (TYPE POLYGON + OUTLINECOLOR).
   * fill-outline-color usa antialiasing GPU → contorno suave en zoom bajo.
   */
  munAllFill: {
    "fill-antialias": true,
    "fill-color": "#dce8ef",
    "fill-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      0.22,
      8,
      0.2,
      11,
      0.22,
      14,
      0.28,
    ],
    "fill-outline-color": [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      "#7a96a8",
      9,
      "#6b8494",
      12,
      "#556b78",
      14,
      "#4a6572",
    ],
  },
  munAllLineHalo: {
    "line-color": "#eef2f6",
    "line-width": MUN_LINE_HALO_WIDTH,
    "line-opacity": homeMunLineOpacity([5, 0.88, 9, 0.8, 14, 0.65]),
    "line-blur": [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      0,
      9,
      0.12,
      14,
      0,
    ],
  },
  munAllLine: {
    "line-color": "#4a6572",
    "line-width": MUN_LINE_WIDTH,
    "line-opacity": homeMunLineOpacity([5, 0.85, 9, 0.9, 14, 0.96]),
    "line-blur": HOME_MUN_LINE_BLUR,
  },
  munHighlightFill: {
    "fill-antialias": true,
    "fill-color": "#008b8b",
    "fill-opacity": 0.42,
  },
  munHighlightLineHalo: {
    "line-color": "#ffffff",
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      3.5,
      9,
      4,
      12,
      4.5,
      15,
      5,
    ],
    "line-opacity": 0.65,
  },
  munHighlightLine: {
    "line-color": "#004858",
    "line-width": lineWidthZoom(6, 1.75, 9, 2.25, 12, 2.75, 15, 3.25),
    "line-opacity": 0.95,
    "line-blur": LINE_BLUR_SOFT,
  },
  marcoMunLine: {
    "line-color": "#2c5282",
    "line-width": lineWidthZoom(8, 1.85, 12, 2.6, 15, 3.4),
    "line-opacity": 0.92,
  },
  /** Contorno estatal: triple banda oscura (legible sobre mapa base claro). */
  entFill: {
    "fill-antialias": true,
    "fill-color": "#c5d4e3",
    "fill-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      0.04,
      10,
      0.02,
      14,
      0,
    ],
    "fill-outline-color": "rgba(6, 24, 41, 0)",
  },
  /** Banda exterior (reserva; apagada en Explorador — ver applyHomeMapModeLayers). */
  marcoEntLineCasing: {
    "line-color": "#64748b",
    "line-width": ENT_LINE_CASING_WIDTH,
    "line-opacity": 0.75,
  },
  marcoEntLineHalo: {
    "line-color": "#64748b",
    "line-width": ENT_LINE_HALO_WIDTH,
    "line-opacity": 0.88,
  },
  marcoEntLine: {
    "line-color": "#0f172a",
    "line-width": ENT_LINE_WIDTH,
    "line-opacity": 1,
  },
  locsAtlasHalo: {
    "line-color": "#3399ff",
    "line-width": DETAIL_LINE_HALO,
    "line-opacity": 0.95,
  },
  locsAtlas: {
    "line-color": "#3399ff",
    "line-width": DETAIL_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.95,
  },
  /** Relleno casi invisible solo para hover dentro del polígono (c_l). */
  locsAtlasFillHit: {
    "fill-color": "#3399ff",
    "fill-opacity": 0.01,
    "fill-antialias": true,
  },
  coloniasHalo: {
    "line-color": "#990000",
    "line-width": DETAIL_LINE_HALO,
    "line-opacity": 0.95,
  },
  colonias: {
    "line-color": "#990000",
    "line-width": DETAIL_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.95,
  },
  coloniasFillHit: {
    "fill-color": "#990000",
    "fill-opacity": 0.01,
    "fill-antialias": true,
  },
  agebUHalo: {
    "line-color": "#990000",
    "line-width": DETAIL_LINE_HALO,
    "line-opacity": 0.95,
  },
  agebU: {
    "line-color": "#990000",
    "line-width": DETAIL_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.95,
  },
  agebUFillHit: {
    "fill-color": "#990000",
    "fill-opacity": 0.01,
    "fill-antialias": true,
  },
  agebRHalo: {
    "line-color": "#666600",
    "line-width": DETAIL_LINE_HALO,
    "line-opacity": 0.95,
  },
  agebR: {
    "line-color": "#666600",
    "line-width": DETAIL_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.95,
  },
  agebRFillHit: {
    "fill-color": "#666600",
    "fill-opacity": 0.01,
    "fill-antialias": true,
  },
  manzanasFill: {
    "fill-color": "rgb(245, 225, 145)",
    "fill-outline-color": "rgb(150, 150, 150)",
    "fill-opacity": 0.6,
  },
  manzanasLineHalo: {
    "line-color": "rgb(150, 150, 150)",
    "line-width": lineWidthZoom(14, 1.4, 16, 2, 18, 2.8),
    "line-opacity": 0.9,
  },
  manzanasLine: {
    "line-color": "rgb(150, 150, 150)",
    "line-width": lineWidthZoom(14, 0.65, 16, 1, 18, 1.5),
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.9,
  },
  vialidadesHalo: {
    "line-color": VIAL_COLOR,
    "line-width": ROAD_LINE_HALO,
    "line-opacity": 0.95,
  },
  vialidades: {
    "line-color": VIAL_COLOR,
    "line-width": ROAD_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.95,
  },
  rncHalo: {
    "line-color": RNC_LINE_COLOR,
    "line-width": ROAD_LINE_HALO,
    "line-opacity": 0.95,
  },
  rnc: {
    "line-color": RNC_LINE_COLOR,
    "line-width": ROAD_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.95,
  },
  saneamiento: { "circle-color": "#0066cc", "circle-radius": 5 },
  clues: {
    "circle-color": "#00897b",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 6, 16, 8],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.96,
  },
  locsPunto: {
    /* Legado circle — el mapa usa chincheta vía mapLocsPuntoIcons.js */
    "circle-color": "#e65100",
    "circle-radius": 6,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#fff",
  },
  usoSuelo: {
    "fill-color": [
      "case",
      [
        ">=",
        ["index-of", "CUERPO DE AGUA", ["upcase", ["coalesce", ["to-string", ["get", "descripcio"]], ""]]],
        0,
      ],
      "rgb(0, 197, 255)",
      [
        ">=",
        ["index-of", "ASENTAMIENTOS", ["upcase", ["coalesce", ["to-string", ["get", "descripcio"]], ""]]],
        0,
      ],
      "rgb(255, 0, 0)",
      [
        ">=",
        ["index-of", "AGRICULTURA", ["upcase", ["coalesce", ["to-string", ["get", "descripcio"]], ""]]],
        0,
      ],
      "rgb(255, 255, 190)",
      [">=", ["index-of", "BOSQUE", ["upcase", ["coalesce", ["to-string", ["get", "descripcio"]], ""]]], 0],
      "rgb(38, 115, 0)",
      [">=", ["index-of", "SELVA", ["upcase", ["coalesce", ["to-string", ["get", "descripcio"]], ""]]], 0],
      "rgb(112, 168, 0)",
      "rgb(204, 204, 204)",
    ],
    "fill-opacity": 0.85,
  },
  hcorrientesHalo: {
    "line-color": [
      "match",
      ["upcase", ["coalesce", ["to-string", ["get", "condicion"]], ""]],
      "INTERMITENTE",
      "rgb(100, 180, 255)",
      "rgb(0, 120, 230)",
    ],
    "line-width": HYDRO_LINE_HALO,
    "line-opacity": 0.92,
  },
  hcorrientes: {
    "line-color": [
      "match",
      ["upcase", ["coalesce", ["to-string", ["get", "condicion"]], ""]],
      "INTERMITENTE",
      "rgb(100, 180, 255)",
      "rgb(0, 120, 230)",
    ],
    "line-width": HYDRO_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.92,
    "line-dasharray": [
      "case",
      ["==", ["upcase", ["coalesce", ["to-string", ["get", "condicion"]], ""]], "INTERMITENTE"],
      ["literal", [2, 2]],
      ["literal", [1, 0]],
    ],
  },
  hcuerposFill: {
    "fill-antialias": true,
    "fill-color": [
      "match",
      ["upcase", ["coalesce", ["to-string", ["get", "condicion"]], ""]],
      "INTERMITENTE",
      "rgb(170, 230, 255)",
      "rgb(0, 160, 255)",
    ],
    "fill-opacity": 0.88,
    "fill-outline-color": [
      "match",
      ["upcase", ["coalesce", ["to-string", ["get", "condicion"]], ""]],
      "INTERMITENTE",
      "rgb(120, 190, 230)",
      "rgb(0, 120, 230)",
    ],
  },
  /** Curvas de nivel — doble trazo blanco + marrón (OPACITY 35/88 en mapfile). */
  curnivelHalo: {
    "line-color": "#ffffff",
    "line-width": CUR_LINE_HALO,
    "line-opacity": 0.35,
  },
  curnivel: {
    "line-color": "#463a30",
    "line-width": CUR_LINE_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 0.88,
  },
  curnivelMaestroHalo: {
    "line-color": "#ffffff",
    "line-width": CUR_MA_HALO,
    "line-opacity": 0.55,
  },
  curnivelMaestro: {
    "line-color": "#231c16",
    "line-width": CUR_MA_CORE,
    "line-blur": LINE_BLUR_SOFT,
    "line-opacity": 1,
  },
  clima: {
    "fill-color": [
      "match",
      ["get", "desc_mapa"],
      "Grupo A - Cálido Subhúmedo",
      "rgb(230, 0, 126)",
      "Grupo C - Semicálido Subhúmedo",
      "rgb(34, 161, 18)",
      "Grupo C - Templado Subhúmedo",
      "rgb(153, 204, 102)",
      "Grupo B - Semiseco",
      "rgb(188, 143, 143)",
      "Grupo B - Muy Seco",
      "rgb(255, 255, 0)",
      "rgb(200, 200, 200)",
    ],
    "fill-opacity": 0.88,
  },
};

/** Explorador municipal: relleno municipal (contorno fino de respaldo + capas line encima). */
export const HOME_MUN_DISP_FILL_PAINT = {
  "fill-antialias": true,
  "fill-color": "#dce8ef",
  "fill-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    5,
    0.22,
    8,
    0.2,
    11,
    0.22,
    14,
    0.28,
  ],
  "fill-outline-color": "rgba(0, 0, 0, 0)",
};

/** Explorador: grosor fijo (zoom bloqueado ~z7); geometría c_mun (no v_c_mun_disp). */
export const HOME_MUN_DISP_LINE_HALO_PAINT = {
  "line-color": "#f1f5f9",
  "line-width": 4.2,
  "line-opacity": 0.95,
  "line-blur": 0,
};

export const HOME_MUN_DISP_LINE_PAINT = {
  "line-color": "#475569",
  "line-width": 1.25,
  "line-opacity": 1,
  "line-blur": 0,
};
