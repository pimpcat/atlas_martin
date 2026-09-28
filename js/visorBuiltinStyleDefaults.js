/**
 * Simbología “de mapa” para capas legacy / compartidas (medio físico).
 * Espejo de LAYER_PAINT (martinLayerStyle.js) y VISOR_SYMBOLOGY (visorMapLegend.js).
 *
 * Solo para reflejar en el gestor de capas cómo se ven en el mapa.
 * No sustituye el paint del mapa: esas capas siguen renderizando con OVERLAY_DEFS fijos.
 */

/** @typedef {{ value: string, color: string, label: string }} BuiltinStyleClass */
/**
 * @typedef {object} BuiltinStyleHydration
 * @property {string} catalog_style_preset  Preset real del catálogo (hidro_corrientes, …)
 * @property {string} ui_style_preset       Preset Studio para mostrar en el asistente
 * @property {string} [field]
 * @property {string} [color]
 * @property {string} [default_color]
 * @property {BuiltinStyleClass[]} [classes]
 * @property {number} [opacity_pct]
 * @property {string} [line_dash]
 * @property {string} note
 */

function rgbToHex(input) {
  const s = String(input || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return "#94a3b8";
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

function cls(value, color, label) {
  return { value, color: rgbToHex(color), label };
}

/**
 * Defaults alineados con el paint del mapa (no con el fallback del wizard).
 * @type {Record<string, Omit<BuiltinStyleHydration, 'catalog_style_preset'>>}
 */
const BUILTIN_MAP_STYLE = {
  hidro_corrientes: {
    ui_style_preset: "line_by_attribute",
    field: "condicion",
    default_color: rgbToHex("rgb(0, 120, 230)"),
    opacity_pct: 92,
    classes: [
      cls("PERMANENTE", "rgb(0, 120, 230)", "Corriente permanente"),
      cls("INTERMITENTE", "rgb(100, 180, 255)", "Corriente intermitente"),
    ],
    note:
      "Simbología fija del mapa (corrientes). Los colores siguen el atributo «condicion»; " +
      "las intermitentes se dibujan con trazo discontinuo. No se edita desde Studio.",
  },
  hidro_cuerpos: {
    ui_style_preset: "polygon_by_attribute",
    field: "condicion",
    default_color: rgbToHex("rgb(0, 160, 255)"),
    opacity_pct: 88,
    classes: [
      cls("PERMANENTE", "rgb(0, 160, 255)", "Cuerpo de agua permanente"),
      cls("INTERMITENTE", "rgb(170, 230, 255)", "Cuerpo de agua intermitente"),
    ],
    note:
      "Simbología fija del mapa (cuerpos de agua) según «condicion». Solo lectura en el gestor.",
  },
  curvas_nivel: {
    ui_style_preset: "line_by_attribute",
    field: "elev",
    default_color: "#463a30",
    opacity_pct: 88,
    classes: [
      cls("normal", "#463a30", "Curva de nivel"),
      cls("maestra", "#231c16", "Curva maestra (múltiplo de 1000 m)"),
    ],
    note:
      "Simbología fija del mapa (doble capa: curva / maestra según elevación). " +
      "Las clases son informativas; el render no usa el estilo Studio.",
  },
  uso_suelo: {
    ui_style_preset: "polygon_by_attribute",
    field: "descripcio",
    default_color: rgbToHex("rgb(204, 204, 204)"),
    opacity_pct: 85,
    classes: [
      cls("CUERPO DE AGUA", "rgb(0, 197, 255)", "Cuerpo de agua"),
      cls("ASENTAMIENTOS", "rgb(255, 0, 0)", "Asentamientos humanos"),
      cls("AGRICULTURA", "rgb(255, 255, 190)", "Agricultura"),
      cls("BOSQUE", "rgb(38, 115, 0)", "Bosque"),
      cls("SELVA", "rgb(112, 168, 0)", "Selva"),
      cls("OTRO", "rgb(204, 204, 204)", "Otro uso de suelo"),
    ],
    note:
      "Simbología fija del mapa (coincidencias por texto en «descripcio»). Solo lectura en el gestor.",
  },
  clima: {
    ui_style_preset: "polygon_by_attribute",
    field: "desc_mapa",
    default_color: rgbToHex("rgb(200, 200, 200)"),
    opacity_pct: 88,
    classes: [
      cls("Grupo A - Cálido Subhúmedo", "rgb(230, 0, 126)", "Grupo A - Cálido Subhúmedo"),
      cls("Grupo C - Semicálido Subhúmedo", "rgb(34, 161, 18)", "Grupo C - Semicálido Subhúmedo"),
      cls("Grupo C - Templado Subhúmedo", "rgb(153, 204, 102)", "Grupo C - Templado Subhúmedo"),
      cls("Grupo B - Semiseco", "rgb(188, 143, 143)", "Grupo B - Semiseco"),
      cls("Grupo B - Muy Seco", "rgb(255, 255, 0)", "Grupo B - Muy Seco"),
    ],
    note: "Simbología fija del mapa por «desc_mapa». Solo lectura en el gestor.",
  },
};

const BUILTIN_STYLE_PRESET_IDS = new Set([
  "hidro_corrientes",
  "hidro_cuerpos",
  "curvas_nivel",
  "uso_suelo",
  "clima",
]);

function catalogHasStudioStyle(style) {
  if (!style || typeof style !== "object") return false;
  if (String(style.field || "").trim()) return true;
  if (String(style.color || "").trim()) return true;
  if (String(style.icon_key || "").trim()) return true;
  if (Array.isArray(style.classes) && style.classes.length > 0) return true;
  return false;
}

/**
 * @param {string} layerId
 * @param {{ style?: object, style_preset?: string, renderer?: string }} [entry]
 * @returns {BuiltinStyleHydration|null}
 */
export function resolveBuiltinMapStyleHydration(layerId, entry = {}) {
  const lid = String(layerId || "").trim().toLowerCase();
  const def = BUILTIN_MAP_STYLE[lid];
  if (!def) return null;
  if (catalogHasStudioStyle(entry.style)) return null;

  const renderer = String(entry.renderer || "").toLowerCase();
  const preset = String(entry.style_preset || "").trim().toLowerCase();
  const looksShared =
    renderer.startsWith("visor_shared") ||
    BUILTIN_STYLE_PRESET_IDS.has(preset) ||
    BUILTIN_STYLE_PRESET_IDS.has(lid);
  if (!looksShared) return null;

  return {
    ...def,
    catalog_style_preset: preset || lid,
  };
}

export function isBuiltinMapStylePreset(presetId) {
  return BUILTIN_STYLE_PRESET_IDS.has(String(presetId || "").trim().toLowerCase());
}

export { rgbToHex };
