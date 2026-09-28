/**
 * Cartography Studio P3 — editor de productos oficiales (draft → preview → publish).
 * Retoma el shell de branding; no reescribe el Engine.
 */
import * as api from "./cartographyProductApi.js";
import { adminFetch } from "./visorAdminAuth.js";

const $ = (id) => document.getElementById(id);

/** @type {{ products: any[], productKey: string, templateId: string, draft: object|null, dirty: boolean }} */
const state = {
  products: [],
  productKey: "",
  templateId: "",
  draft: null,
  dirty: false,
  datasources: [],
  /** @type {Record<string, Promise<string[]>>} source_id → columnas */
  columnsCache: {},
  /** P13: simbología del panel lateral en edición. */
  panelSym: { templateId: "", kind: "croquis", sections: null, custom: false },
  /** @type {Record<string, any[]>} kind → secciones de fábrica */
  panelSymDefaults: {},
  /** P14: columna LÍMITES de la tira en edición (limits null = cargando) */
  stripSym: { templateId: "", limits: null, custom: false },
  stripSymDefaults: null,
};

const PREVIEW_DEFAULTS = {
  plano_localidad: { cve_ent: "12", cve_mun: "029", cve_loc: "0001" },
  grosig_croquis_municipal: { cve_mun: "003" },
  condensado_estatal: {},
  croquis_municipal: { cve_mun: "001" },
  atlas_municipal: { cve_mun_list: ["001"], cover: true },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showMsg(kind, msg) {
  const err = $("cartoProdError");
  const errTop = $("cartoProdErrorTop");
  const ok = $("cartoProdOk");
  const applyErr = (el) => {
    if (!el) return;
    el.classList.toggle("d-none", kind !== "error" || !msg);
    el.textContent = kind === "error" ? msg || "" : "";
  };
  applyErr(err);
  applyErr(errTop);
  if (ok) {
    ok.classList.toggle("d-none", kind !== "ok" || !msg);
    ok.textContent = kind === "ok" ? msg || "" : "";
  }
}

function currentProductMeta() {
  return state.products.find((p) => p.product_key === state.productKey) || null;
}

function markDirty(flag = true) {
  state.dirty = flag;
  const badge = $("cartoProdDirtyBadge");
  if (badge) badge.classList.toggle("d-none", !flag);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function layoutNestedEnabled(layout, key) {
  const nest = layout?.[key];
  if (!nest || typeof nest !== "object") return false;
  return nest.enabled !== false;
}

const PAPER_OPTIONS = [
  { id: "letter", label: "Carta (Letter) 8.5×11 in" },
  { id: "a4", label: "A4 210×297 mm" },
  { id: "dcarta_42x28", label: "Doble carta 42×28 cm" },
  { id: "plotter_90x60", label: "Plotter 90×60 cm" },
  { id: "plotter_90x70", label: "Plotter 90×70 cm" },
  { id: "plotter_90x120", label: "Plotter 90×120 cm" },
  { id: "custom", label: "Personalizado…" },
];

function ensurePaperSelect() {
  const sel = $("cartoLayPaper");
  if (!sel || sel.options.length > 1) return;
  sel.innerHTML = PAPER_OPTIONS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`
  ).join("");
}

function toggleCustomPaperUi() {
  const paper = $("cartoLayPaper")?.value || "letter";
  const wrap = $("cartoLayCustomWrap");
  wrap?.classList.toggle("d-none", paper !== "custom");
  const hint = $("cartoLayPaperHint");
  if (!hint) return;
  if (paper === "custom") {
    const w = $("cartoLayWidth")?.value || "?";
    const h = $("cartoLayHeight")?.value || "?";
    const u = $("cartoLayUnit")?.value || "cm";
    hint.textContent = `Personalizado: ${w} × ${h} ${u}`;
  } else {
    const opt = PAPER_OPTIONS.find((p) => p.id === paper);
    hint.textContent = opt?.label || paper;
  }
}

function setLayoutFlag(layout, key, nestedKey, enabled) {
  if (!layout || typeof layout !== "object") return;
  if (nestedKey) {
    if (!layout[key] || typeof layout[key] !== "object") layout[key] = {};
    layout[key][nestedKey] = enabled;
    return;
  }
  layout[key] = enabled;
}

function symbolColor(sym, ...keys) {
  for (const k of keys) {
    if (sym && sym[k] != null && String(sym[k]).trim()) return String(sym[k]);
  }
  return "#888888";
}

function symbolNum(sym, keys, fallback) {
  for (const k of keys) {
    if (sym && sym[k] != null && sym[k] !== "") {
      const n = Number(sym[k]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return fallback;
}

function applySymbolField(sym, type, field, value) {
  if (field === "fill") {
    if ("fill" in sym || type === "polygon" || type === "point") {
      delete sym.fill_color;
      sym.fill = value;
    } else {
      sym.fill_color = value;
    }
    return;
  }
  if (field === "stroke") {
    if ("stroke" in sym || type === "line" || type === "polygon") {
      delete sym.stroke_color;
      sym.stroke = value;
    } else {
      sym.stroke_color = value;
    }
    return;
  }
  if (field === "width") {
    if ("width" in sym || type === "line" || type === "polygon") {
      delete sym.stroke_width;
      sym.width = value;
    } else {
      sym.stroke_width = value;
    }
    return;
  }
  if (field === "fill_opacity") sym.fill_opacity = value;
  if (field === "size") sym.size = value;
  if (field === "dash") {
    const raw = String(value || "").trim();
    if (!raw) {
      delete sym.dash;
      return;
    }
    sym.dash = raw.split(/[,\s]+/).map(Number).filter((n) => !Number.isNaN(n));
  }
}

function renderProductOptions() {
  const sel = $("cartoProdSelect");
  if (!sel) return;
  sel.innerHTML = state.products
    .map(
      (p) =>
        `<option value="${escapeHtml(p.product_key)}">${escapeHtml(
          p.name || p.product_key
        )}${p.has_draft ? " · draft" : ""}</option>`
    )
    .join("");
  if (state.productKey) sel.value = state.productKey;
}

function renderTemplateOptions() {
  const sel = $("cartoProdTemplateSelect");
  const meta = currentProductMeta();
  if (!sel || !meta) return;
  const ids = meta.template_ids || [meta.primary_template_id];
  sel.innerHTML = ids
    .map((id) => {
      const primary = id === meta.primary_template_id ? " (principal)" : "";
      return `<option value="${escapeHtml(id)}">${escapeHtml(id)}${primary}</option>`;
    })
    .join("");
  if (state.templateId) sel.value = state.templateId;
}

function renderStatus(meta) {
  const el = $("cartoProdStatus");
  if (!el) return;
  const m = meta || {};
  const draft = m.has_draft ? "draft sí" : "sin draft";
  const ver = m.active_version ? `v${m.active_version}` : "baseline";
  el.innerHTML = `<span class="badge text-bg-secondary">${escapeHtml(
    draft
  )}</span> <span class="badge text-bg-light border">${escapeHtml(ver)}</span>`;
}

function isUrbanPlanoTemplate() {
  return state.productKey === "plano_localidad" && String(state.templateId || "") === "plano_localidad_urbana";
}

function renderMultipageFields() {
  const card = $("cartoMpCard");
  if (!card) return;
  const on = isUrbanPlanoTemplate();
  card.classList.toggle("d-none", !on);
  if (!on) return;
  const t = state.draft || {};
  const sizes = t.detail_label_sizes && typeof t.detail_label_sizes === "object" ? t.detail_label_sizes : {};
  const setVal = (id, v) => {
    const el = $(id);
    if (el) el.value = v == null ? "" : String(v);
  };
  setVal("cartoMpScale", t.detail_scale);
  setVal("cartoMpMaxPages", t.max_map_pages);
  setVal("cartoMpOverlap", t.tile_overlap != null ? Math.round(Number(t.tile_overlap) * 100) : "");
  setVal("cartoMpIndexPaper", t.index_paper || "");
  setVal("cartoMpSizeMza", sizes.manzana);
  setVal("cartoMpSizeAgeb", sizes.ageb);
  setVal("cartoMpSizeVial", sizes.vialidad);
}

function collectMultipageIntoDraft() {
  const t = state.draft;
  if (!t || !isUrbanPlanoTemplate()) return;
  const num = (id, lo, hi) => {
    const raw = String($(id)?.value ?? "").trim();
    if (!raw) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
  };
  const put = (key, v) => {
    if (v == null || v === "") delete t[key];
    else t[key] = v;
  };
  put("detail_scale", num("cartoMpScale", 1000, 50000));
  const pages = num("cartoMpMaxPages", 1, 40);
  put("max_map_pages", pages == null ? null : Math.round(pages));
  const ov = num("cartoMpOverlap", 0, 30);
  put("tile_overlap", ov == null ? null : ov / 100);
  put("index_paper", $("cartoMpIndexPaper")?.value || "");
  const sizes = {};
  [
    ["manzana", "cartoMpSizeMza"],
    ["ageb", "cartoMpSizeAgeb"],
    ["vialidad", "cartoMpSizeVial"],
  ].forEach(([k, id]) => {
    const v = num(id, 1, 24);
    if (v != null) sizes[k] = v;
  });
  put("detail_label_sizes", Object.keys(sizes).length ? sizes : null);
}

function renderMetaFields() {
  const t = state.draft || {};
  if ($("cartoProdTitle")) $("cartoProdTitle").value = t.title || "";
  if ($("cartoProdFooter")) $("cartoProdFooter").value = t.footer || "";
  renderMultipageFields();
  const layout = t.layout || {};
  const setChk = (id, on) => {
    const el = $(id);
    if (el) el.checked = Boolean(on);
  };
  ensurePaperSelect();
  const paper = String(layout.paper || "letter").toLowerCase();
  if ($("cartoLayPaper")) {
    $("cartoLayPaper").value = PAPER_OPTIONS.some((p) => p.id === paper)
      ? paper
      : "custom";
  }
  if ($("cartoLayOrient")) {
    $("cartoLayOrient").value =
      layout.orientation === "landscape" ? "landscape" : "portrait";
  }
  const unit = String(layout.unit || layout.size?.unit || "cm").toLowerCase();
  if ($("cartoLayUnit")) {
    $("cartoLayUnit").value = ["cm", "mm", "in", "pt", "px"].includes(unit)
      ? unit
      : "cm";
  }
  const w = layout.width ?? layout.size?.width;
  const h = layout.height ?? layout.size?.height;
  if ($("cartoLayWidth")) $("cartoLayWidth").value = w != null ? w : "";
  if ($("cartoLayHeight")) $("cartoLayHeight").value = h != null ? h : "";
  if (paper === "custom" && (!$("cartoLayWidth")?.value || !$("cartoLayHeight")?.value)) {
    if ($("cartoLayWidth") && !$("cartoLayWidth").value) $("cartoLayWidth").value = "42";
    if ($("cartoLayHeight") && !$("cartoLayHeight").value) $("cartoLayHeight").value = "28";
  }
  toggleCustomPaperUi();
  setChk("cartoLayLegend", layoutNestedEnabled(layout, "legend"));
  setChk("cartoLayNorth", layoutNestedEnabled(layout, "north"));
  setChk("cartoLayScale", layoutNestedEnabled(layout, "scale_bar"));
  setChk("cartoLayBrand", layout.show_brand_header !== false);
  setChk("cartoLayFrame", layout.show_outer_frame !== false);
  const hasStrip = layout.strip && typeof layout.strip === "object";
  const sidePanel = isSidePanelPreset(layout.preset);
  if (hasStrip) {
    setChk("cartoLayStrip", layout.strip.enabled !== false);
    const ratioPct = Math.round(
      clampNum(
        Number(layout.strip.ratio != null ? layout.strip.ratio : 0.1) * 100,
        8,
        35
      )
    );
    if ($("cartoLayStripRatio")) $("cartoLayStripRatio").value = String(ratioPct);
    fillStripComposeControls(layout.strip);
    void fillStripSymbology(layout.strip);
    updateStripUx();
    $("cartoLayStripWrap")?.classList.remove("d-none");
    setChk("cartoLabEngineV2", String(t.label_placement?.engine || "").toLowerCase() === "v2");
    setChk("cartoLayInset", layout.inset?.enabled === true);
    $("cartoLayLabelsWrap")?.classList.remove("d-none");
    $("cartoLayHeightsWrap")?.classList.add("d-none");
    $("cartoLayPanelWrap")?.classList.add("d-none");
  } else if (sidePanel) {
    $("cartoLayStripWrap")?.classList.add("d-none");
    $("cartoLayLabelsWrap")?.classList.add("d-none");
    $("cartoLayHeightsWrap")?.classList.add("d-none");
    fillPanelComposeControls(layout);
    void fillPanelSymbology(layout);
    updatePanelPreview(layout);
    $("cartoLayPanelWrap")?.classList.remove("d-none");
  } else {
    $("cartoLayStripWrap")?.classList.add("d-none");
    $("cartoLayLabelsWrap")?.classList.add("d-none");
    $("cartoLayPanelWrap")?.classList.add("d-none");
    const ph = presetHeights(layout.preset);
    const bh = layout.brand_height != null ? Number(layout.brand_height) : ph.brand_height;
    const th = layout.title_height != null ? Number(layout.title_height) : ph.title_height;
    const fh = layout.footer_height != null ? Number(layout.footer_height) : ph.footer_height;
    if ($("cartoLayBrandH")) $("cartoLayBrandH").value = String(clampNum(bh, 0, 80));
    if ($("cartoLayTitleH")) $("cartoLayTitleH").value = String(clampNum(th, 0, 56));
    if ($("cartoLayFooterH")) $("cartoLayFooterH").value = String(clampNum(fh, 0, 48));
    $("cartoLayHeightsWrap")?.classList.remove("d-none");
  }
}

function isSidePanelPreset(presetName) {
  const p = String(presetName || "");
  return p === "grosig_croquis_90x70" || p === "grosig_condensado";
}

function panelCanonicalDefaults(presetName) {
  if (String(presetName || "") === "grosig_condensado") {
    return {
      legend_width: 340,
      gap_max: 64,
      type_scale: 1,
      index_h_frac: 13,
      bottom_lift_min: 56,
      bottom_lift_pad_mult: 3.2,
      warn_floor_pad: 18,
    };
  }
  return {
    legend_width: 260,
    gap_max: 56,
    type_scale: 1,
    index_h_frac: 12,
    bottom_lift_min: 48,
    bottom_lift_pad_mult: 3.5,
    warn_floor_pad: 16,
  };
}

/** Alturas canónicas por preset (layouts.PRESETS) — evita drift al guardar sin cambios. */
function presetHeights(presetName) {
  const table = {
    default: { brand_height: 36, title_height: 34, footer_height: 30 },
    compact: { brand_height: 28, title_height: 26, footer_height: 24 },
    map_focus: { brand_height: 26, title_height: 22, footer_height: 22 },
    grosig_marginalia: { brand_height: 48, title_height: 36, footer_height: 32 },
    grosig_croquis_90x70: { brand_height: 0, title_height: 0, footer_height: 0 },
    grosig_condensado: { brand_height: 0, title_height: 0, footer_height: 0 },
    grosig_localidad: { brand_height: 0, title_height: 0, footer_height: 0 },
  };
  return table[String(presetName || "default")] || table.default;
}

function clampNum(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function syncStripRatioLabel() {
  updateStripUx();
}

/** P7b — aviso tira off + mini preview de proporción mapa/tira. */
function updateStripUx() {
  const wrap = $("cartoLayStripWrap");
  if (!wrap || wrap.classList.contains("d-none")) return;

  const on = Boolean($("cartoLayStrip")?.checked);
  const pct = clampNum(Number($("cartoLayStripRatio")?.value), 8, 35);
  if ($("cartoLayStripRatioLbl")) $("cartoLayStripRatioLbl").textContent = String(Math.round(pct));

  const warn = $("cartoLayStripWarn");
  if (warn) warn.classList.toggle("d-none", on);

  const band = $("cartoLayStripPreviewBand");
  const mapEl = $("cartoLayStripPreviewMap");
  const lbl = $("cartoLayStripPreviewLbl");
  const ratioEl = $("cartoLayStripRatio");
  if (ratioEl) ratioEl.disabled = !on;

  if (band && mapEl) {
    if (on) {
      band.style.flex = `0 0 ${Math.round(pct)}%`;
      band.style.display = "";
      band.style.background = "#6c757d";
      mapEl.style.flex = "1 1 auto";
      if (lbl) lbl.textContent = `mapa ${100 - Math.round(pct)}% · tira ${Math.round(pct)}%`;
    } else {
      band.style.flex = "0 0 0";
      band.style.display = "none";
      mapEl.style.flex = "1 1 auto";
      if (lbl) lbl.textContent = "sin tira";
    }
  }
}

/** P15 — motor de etiquetas v2 (raíz) y recuadro de ampliación (layout). Desmarcado = sin clave. */
function collectLabelsAndInsetInto(draft, L) {
  const wrap = $("cartoLayLabelsWrap");
  if (!wrap || wrap.classList.contains("d-none")) return;
  if ($("cartoLabEngineV2")?.checked) {
    const lp = draft.label_placement && typeof draft.label_placement === "object" ? draft.label_placement : {};
    draft.label_placement = { ...lp, engine: "v2" };
  } else {
    delete draft.label_placement;
  }
  const inset = L.inset && typeof L.inset === "object" ? L.inset : null;
  if ($("cartoLayInset")?.checked) {
    L.inset = { ...(inset || {}), enabled: true };
  } else if (inset && Object.keys(inset).some((k) => k !== "enabled")) {
    L.inset = { ...inset, enabled: false };
  } else {
    delete L.inset;
  }
}

function collectMetaIntoDraft() {
  if (!state.draft) return;
  state.draft.title = $("cartoProdTitle")?.value ?? state.draft.title;
  state.draft.footer = $("cartoProdFooter")?.value ?? state.draft.footer;
  collectMultipageIntoDraft();
  if (!state.draft.layout || typeof state.draft.layout !== "object") {
    state.draft.layout = {};
  }
  const L = state.draft.layout;
  const paper = $("cartoLayPaper")?.value || "letter";
  L.paper = paper;
  L.orientation = $("cartoLayOrient")?.value === "landscape" ? "landscape" : "portrait";
  if (paper === "custom") {
    const w = Number($("cartoLayWidth")?.value);
    const h = Number($("cartoLayHeight")?.value);
    const unit = $("cartoLayUnit")?.value || "cm";
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      throw new Error("Indique ancho y alto válidos para el papel personalizado");
    }
    L.width = w;
    L.height = h;
    L.unit = unit;
    delete L.size;
  } else {
    delete L.width;
    delete L.height;
    delete L.unit;
    delete L.size;
  }
  setLayoutFlag(L, "legend", "enabled", $("cartoLayLegend")?.checked);
  setLayoutFlag(L, "north", "enabled", $("cartoLayNorth")?.checked);
  setLayoutFlag(L, "scale_bar", "enabled", $("cartoLayScale")?.checked);
  L.show_brand_header = Boolean($("cartoLayBrand")?.checked);
  L.show_outer_frame = Boolean($("cartoLayFrame")?.checked);
  if (L.strip && typeof L.strip === "object") {
    L.strip.enabled = Boolean($("cartoLayStrip")?.checked);
    const pct = clampNum(Number($("cartoLayStripRatio")?.value), 8, 35);
    L.strip.ratio = Math.round(pct) / 100;
    collectStripComposeInto(L.strip);
    collectLabelsAndInsetInto(state.draft, L);
  } else if (isSidePanelPreset(L.preset) && $("cartoLayPanelWrap") && !$("cartoLayPanelWrap").classList.contains("d-none")) {
    collectPanelComposeInto(L);
  } else {
    const hw = $("cartoLayHeightsWrap");
    if (hw && !hw.classList.contains("d-none")) {
      L.brand_height = clampNum(Number($("cartoLayBrandH")?.value), 0, 80);
      L.title_height = clampNum(Number($("cartoLayTitleH")?.value), 0, 56);
      L.footer_height = clampNum(Number($("cartoLayFooterH")?.value), 0, 48);
    }
  }
}

const STRIP_COL_DEFAULTS = {
  limites: 17,
  claves: 12,
  servicios: 18,
  indice: 26,
  advertencia: 27,
};

function fillStripComposeControls(strip) {
  const s = strip && typeof strip === "object" ? strip : {};
  const cols = s.columns && typeof s.columns === "object" ? s.columns : {};
  const setPct = (id, frac, defPct) => {
    const el = $(id);
    if (!el) return;
    if (frac != null && Number.isFinite(Number(frac))) {
      el.value = String(Math.round(clampNum(Number(frac) * 100, 1, 80)));
    } else {
      el.value = String(defPct);
    }
  };
  setPct("cartoStripColLimites", cols.limites, STRIP_COL_DEFAULTS.limites);
  setPct("cartoStripColClaves", cols.claves, STRIP_COL_DEFAULTS.claves);
  setPct("cartoStripColServicios", cols.servicios, STRIP_COL_DEFAULTS.servicios);
  setPct("cartoStripColIndice", cols.indice, STRIP_COL_DEFAULTS.indice);
  setPct("cartoStripColAdvert", cols.advertencia, STRIP_COL_DEFAULTS.advertencia);
  if ($("cartoStripLogoMax")) {
    const v = s.logo_max_frac != null ? Number(s.logo_max_frac) * 100 : 28;
    $("cartoStripLogoMax").value = String(Math.round(clampNum(v, 10, 45)));
  }
  if ($("cartoStripLogoH")) {
    const v = s.logo_height_frac != null ? Number(s.logo_height_frac) * 100 : 96;
    $("cartoStripLogoH").value = String(Math.round(clampNum(v, 70, 100)));
  }
  if ($("cartoStripGapTabs")) {
    const v = s.gap_tabs != null ? Number(s.gap_tabs) : 2;
    $("cartoStripGapTabs").value = String(clampNum(v, 0, 4));
  }
}

function collectStripComposeInto(stripObj) {
  const pct = (id, defPct) =>
    clampNum(Number($(id)?.value), 1, 80) || defPct;
  stripObj.columns = {
    limites: pct("cartoStripColLimites", STRIP_COL_DEFAULTS.limites) / 100,
    claves: pct("cartoStripColClaves", STRIP_COL_DEFAULTS.claves) / 100,
    servicios: pct("cartoStripColServicios", STRIP_COL_DEFAULTS.servicios) / 100,
    indice: pct("cartoStripColIndice", STRIP_COL_DEFAULTS.indice) / 100,
    advertencia: pct("cartoStripColAdvert", STRIP_COL_DEFAULTS.advertencia) / 100,
  };
  stripObj.logo_max_frac =
    clampNum(Number($("cartoStripLogoMax")?.value), 10, 45) / 100;
  stripObj.logo_height_frac =
    clampNum(Number($("cartoStripLogoH")?.value), 70, 100) / 100;
  stripObj.gap_tabs = clampNum(Number($("cartoStripGapTabs")?.value), 0, 4);
}

function resetStripComposeCanonical() {
  if ($("cartoStripColLimites")) $("cartoStripColLimites").value = "17";
  if ($("cartoStripColClaves")) $("cartoStripColClaves").value = "12";
  if ($("cartoStripColServicios")) $("cartoStripColServicios").value = "18";
  if ($("cartoStripColIndice")) $("cartoStripColIndice").value = "26";
  if ($("cartoStripColAdvert")) $("cartoStripColAdvert").value = "27";
  if ($("cartoStripLogoMax")) $("cartoStripLogoMax").value = "28";
  if ($("cartoStripLogoH")) $("cartoStripLogoH").value = "96";
  if ($("cartoStripGapTabs")) $("cartoStripGapTabs").value = "2";
  markDirty(true);
}

function fillPanelComposeControls(layout) {
  const def = panelCanonicalDefaults(layout.preset);
  const panel = layout.panel && typeof layout.panel === "object" ? layout.panel : {};
  const blocks = panel.blocks && typeof panel.blocks === "object" ? panel.blocks : {};
  const legendW =
    layout.legend && typeof layout.legend === "object" && layout.legend.width != null
      ? Number(layout.legend.width)
      : def.legend_width;
  if ($("cartoPanelLegendW")) $("cartoPanelLegendW").value = String(clampNum(legendW, 80, 480));
  if ($("cartoPanelTypeScale")) {
    $("cartoPanelTypeScale").value = String(
      clampNum(panel.type_scale != null ? Number(panel.type_scale) : def.type_scale, 0.7, 1.4)
    );
  }
  if ($("cartoPanelGapMax")) {
    $("cartoPanelGapMax").value = String(
      Math.round(clampNum(panel.gap_max != null ? Number(panel.gap_max) : def.gap_max, 0, 120))
    );
  }
  const setBlk = (id, key) => {
    const el = $(id);
    if (!el) return;
    el.checked = blocks[key] !== false;
  };
  setBlk("cartoPanelBlkSym", "simbologia");
  setBlk("cartoPanelBlkClaves", "claves");
  setBlk("cartoPanelBlkId", "identificacion");
  setBlk("cartoPanelBlkIdx", "indice");
  setBlk("cartoPanelBlkRef", "referencia");
  const idxPct =
    panel.index_h_frac != null
      ? Math.round(Number(panel.index_h_frac) * 100)
      : def.index_h_frac;
  if ($("cartoPanelIdxFrac")) $("cartoPanelIdxFrac").value = String(clampNum(idxPct, 5, 40));
  if ($("cartoPanelLiftMin")) {
    $("cartoPanelLiftMin").value = String(
      Math.round(
        clampNum(
          panel.bottom_lift_min != null ? Number(panel.bottom_lift_min) : def.bottom_lift_min,
          0,
          200
        )
      )
    );
  }
  if ($("cartoPanelLiftMult")) {
    $("cartoPanelLiftMult").value = String(
      clampNum(
        panel.bottom_lift_pad_mult != null
          ? Number(panel.bottom_lift_pad_mult)
          : def.bottom_lift_pad_mult,
        0,
        10
      )
    );
  }
  if ($("cartoPanelWarnPad")) {
    $("cartoPanelWarnPad").value = String(
      Math.round(
        clampNum(
          panel.warn_floor_pad != null ? Number(panel.warn_floor_pad) : def.warn_floor_pad,
          0,
          80
        )
      )
    );
  }
}

function collectPanelComposeInto(L) {
  const prevSym = L.panel && typeof L.panel === "object" ? L.panel.simbologia : undefined;
  if (!L.legend || typeof L.legend !== "object") L.legend = { enabled: true };
  L.legend.enabled = true;
  L.legend.width = clampNum(Number($("cartoPanelLegendW")?.value), 80, 480);
  L.panel = {
    gap_max: clampNum(Number($("cartoPanelGapMax")?.value), 0, 120),
    type_scale: clampNum(Number($("cartoPanelTypeScale")?.value), 0.7, 1.4),
    index_h_frac: clampNum(Number($("cartoPanelIdxFrac")?.value), 5, 40) / 100,
    bottom_lift_min: clampNum(Number($("cartoPanelLiftMin")?.value), 0, 200),
    bottom_lift_pad_mult: clampNum(Number($("cartoPanelLiftMult")?.value), 0, 10),
    warn_floor_pad: clampNum(Number($("cartoPanelWarnPad")?.value), 0, 80),
    blocks: {
      simbologia: Boolean($("cartoPanelBlkSym")?.checked),
      claves: Boolean($("cartoPanelBlkClaves")?.checked),
      identificacion: Boolean($("cartoPanelBlkId")?.checked),
      indice: Boolean($("cartoPanelBlkIdx")?.checked),
      referencia: Boolean($("cartoPanelBlkRef")?.checked),
    },
  };
  const ps = state.panelSym;
  if (ps.templateId === state.templateId && Array.isArray(ps.sections)) {
    if (ps.custom) L.panel.simbologia = JSON.parse(JSON.stringify(ps.sections));
  } else if (prevSym !== undefined) {
    L.panel.simbologia = prevSym;
  }
  updatePanelPreview(L);
}

/* ---------- P13 · Simbología del panel ---------- */

const SYM_KIND_LABELS = {
  line: "Línea",
  mixed_double: "Carretera mixta",
  double_road: "Carretera doble",
  estatal_cross: "Límite estatal (cruces)",
  poly: "Polígono",
  point: "Punto",
  plane: "Avión",
};

function symKindDefaults(kind) {
  switch (kind) {
    case "line":
      return { kind, color: "#212121", width: 1.2 };
    case "poly":
      return { kind, fill: "#FFF59D", stroke: "#B2B2B2", hatch: false };
    case "plane":
      return { kind, size: 5 };
    case "point":
      return { kind };
    case "estatal_cross":
      return { kind, color: "#CC0000" };
    default:
      return { kind, color: "#212121" };
  }
}

async function panelSymDefaults(kind) {
  if (!state.panelSymDefaults[kind]) {
    const data = await api.panelSymbologyDefaults(kind);
    state.panelSymDefaults[kind] = Array.isArray(data?.sections) ? data.sections : [];
  }
  return JSON.parse(JSON.stringify(state.panelSymDefaults[kind]));
}

async function fillPanelSymbology(layout) {
  const kind = String(layout?.preset || "").includes("condensado") ? "condensado" : "croquis";
  const raw = layout?.panel && typeof layout.panel === "object" ? layout.panel.simbologia : undefined;
  const custom = Array.isArray(raw);
  state.panelSym = {
    templateId: state.templateId,
    kind,
    sections: custom ? JSON.parse(JSON.stringify(raw)) : null,
    custom,
  };
  if (!custom) {
    try {
      const defs = await panelSymDefaults(kind);
      if (state.panelSym.templateId === state.templateId && !state.panelSym.custom) {
        state.panelSym.sections = defs;
      }
    } catch (e) {
      const host = $("cartoPanelSym");
      if (host) host.innerHTML = `<span class="text-danger">${escapeHtml(e?.message || String(e))}</span>`;
      return;
    }
  }
  renderPanelSymbology();
}

function symColor(v, fallback = "#000000") {
  const s = String(v || "");
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

/** Paso 3: estilo que la fila toma de su capa (mismo criterio que apply_layer_styles del motor). */
function layerLinkedStyle(row) {
  if (row.link === false || !row.layer) return null;
  const layer = (state.draft?.layers || []).find((l) => l?.id === row.layer);
  const sym = layer?.symbol && typeof layer.symbol === "object" ? layer.symbol : null;
  if (!sym) return null;
  const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v) : null);
  const first = (...vals) => vals.find((v) => v != null);
  const stroke = hex(first(sym.stroke_color, sym.stroke, sym.color));
  const fill = hex(first(sym.fill_color, sym.fill, sym.color));
  const kind = row.swatch?.kind;
  const out = {};
  if (["line", "mixed_double", "double_road", "estatal_cross"].includes(kind)) {
    if (stroke) out.color = stroke;
  } else if (kind === "poly") {
    if (fill) out.fill = fill;
    if (stroke) out.stroke = stroke;
    out.hatch = Boolean(sym.hatch);
  } else if (kind === "point") {
    if (fill) out.color = fill;
  }
  return out;
}

function symStyleInputs(swRaw, si, ri, linked) {
  const locked = linked || {};
  const sw = { ...swRaw, ...locked };
  const at = (field) => `data-sec="${si}" data-row="${ri}" data-field="${field}"`;
  const lockAttr = (field) => (field in locked ? 'disabled title="Tomado de la capa"' : "");
  const color = (field, title) =>
    `<input type="color" class="form-control form-control-color form-control-sm p-0" style="width:2rem;height:1.6rem" title="${title}" value="${symColor(sw[field])}" ${at(field)} ${lockAttr(field)} />`;
  switch (sw.kind) {
    case "line":
      return `${color("color", "Color")}
        <input type="number" class="form-control form-control-sm" style="width:4.2rem" min="0.1" max="10" step="0.1" title="Grosor (pt)" value="${escapeHtml(sw.width ?? 1)}" ${at("width")} />
        <input type="text" class="form-control form-control-sm" style="width:5rem" placeholder="continua" title="Guiones, p. ej. 8 6" value="${escapeHtml((sw.dash || []).join(" "))}" ${at("dash")} />`;
    case "poly":
      return `${color("fill", "Relleno")}${color("stroke", "Contorno")}
        <label class="form-check-label d-flex align-items-center gap-1"><input type="checkbox" class="form-check-input m-0" ${sw.hatch ? "checked" : ""} ${at("hatch")} ${lockAttr("hatch")} />trama</label>`;
    case "plane":
      return `<input type="number" class="form-control form-control-sm" style="width:4.2rem" min="1" max="20" step="0.5" title="Tamaño" value="${escapeHtml(sw.size ?? 5)}" ${at("size")} />`;
    case "point":
      return color("color", "Color");
    default:
      return color("color", "Color");
  }
}

function renderPanelSymbology() {
  const host = $("cartoPanelSym");
  if (!host) return;
  const ps = state.panelSym;
  const sections = Array.isArray(ps.sections) ? ps.sections : [];
  const layerIds = (state.draft?.layers || []).map((l) => l?.id).filter(Boolean);
  const kindOpts = (cur) =>
    Object.entries(SYM_KIND_LABELS)
      .map(([k, lab]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${lab}</option>`)
      .join("");
  const layerOpts = (cur) =>
    `<option value="">— sin capa —</option>` +
    [...new Set([...(cur ? [cur] : []), ...layerIds])]
      .map((id) => `<option value="${escapeHtml(id)}" ${id === cur ? "selected" : ""}>${escapeHtml(id)}${layerIds.includes(id) ? "" : " (no está en capas)"}</option>`)
      .join("");
  const btn = (action, label, si, ri = "", title = "") =>
    `<button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1" data-sym-action="${action}" data-sec="${si}" data-row="${ri}" title="${title}">${label}</button>`;

  const head = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <span class="badge ${ps.custom ? "text-bg-primary" : "text-bg-secondary"}">${ps.custom ? "Personalizada" : "De fábrica"}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary py-0" data-sym-action="add-sec" data-sec="">+ Sección</button>
      ${ps.custom ? `<button type="button" class="btn btn-sm btn-outline-danger py-0" data-sym-action="reset" data-sec="">Restablecer de fábrica</button>` : ""}
      <button type="button" class="btn btn-sm btn-outline-dark py-0 ms-auto" data-sym-action="check" data-sec="" title="Comparar la simbología con las capas del mapa">Revisar contra el mapa</button>
    </div>
    <div id="cartoPanelSymIssues" class="mb-2"></div>`;

  const body = sections
    .map((sec, si) => {
      const rows = (sec.rows || [])
        .map((r, ri) => {
          const linked = layerLinkedStyle(r);
          const wantsLink = r.link !== false && Boolean(r.layer);
          const linkNote =
            wantsLink && !linked
              ? `<div class="text-warning" style="font-size:0.7rem">capa no encontrada: usa sus colores propios</div>`
              : "";
          return `<tr class="${r.visible === false ? "opacity-50" : ""}">
          <td class="text-nowrap"><input type="checkbox" class="form-check-input" title="Visible" ${r.visible === false ? "" : "checked"} data-sec="${si}" data-row="${ri}" data-field="visible" /><span class="ms-1" data-sym-flag="${si}:${ri}"></span></td>
          <td><input type="text" class="form-control form-control-sm" maxlength="80" value="${escapeHtml(r.label)}" data-sec="${si}" data-row="${ri}" data-field="label" /></td>
          <td><select class="form-select form-select-sm" data-sec="${si}" data-row="${ri}" data-field="kind">${kindOpts(r.swatch?.kind)}</select></td>
          <td><div class="d-flex align-items-center gap-1">${symStyleInputs(r.swatch || {}, si, ri, linked)}</div>${linkNote}</td>
          <td><select class="form-select form-select-sm" title="Capa que representa" data-sec="${si}" data-row="${ri}" data-field="layer">${layerOpts(r.layer)}</select></td>
          <td class="text-center"><input type="checkbox" class="form-check-input" title="Tomar color/relleno/trama de la capa" ${wantsLink ? "checked" : ""} ${r.layer ? "" : "disabled"} data-sec="${si}" data-row="${ri}" data-field="link" /></td>
          <td class="text-nowrap">${btn("row-up", "↑", si, ri, "Subir")}${btn("row-down", "↓", si, ri, "Bajar")}${btn("row-del", "✕", si, ri, "Quitar fila")}</td>
        </tr>`;
        })
        .join("");
      return `<div class="border rounded p-2 mb-2 bg-white">
        <div class="d-flex align-items-center gap-1 mb-1">
          <input type="text" class="form-control form-control-sm fw-semibold" maxlength="80" placeholder="Título de sección" value="${escapeHtml(sec.title)}" data-sec="${si}" data-field="title" />
          ${btn("sec-up", "↑", si, "", "Subir sección")}${btn("sec-down", "↓", si, "", "Bajar sección")}${btn("sec-del", "✕", si, "", "Quitar sección")}
        </div>
        <div class="table-responsive"><table class="table table-sm align-middle mb-1">
          <thead><tr class="text-muted"><th></th><th>Texto</th><th>Muestra</th><th>Estilo</th><th>Capa</th><th title="Toma color, relleno y trama de la capa del mapa">Ligada</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="text-muted">Sin filas (la sección no se dibuja)</td></tr>`}</tbody>
        </table></div>
        ${btn("add-row", "+ Fila", si)}
      </div>`;
    })
    .join("");
  host.innerHTML = head + (body || `<div class="text-muted">Sin secciones: solo se dibujará el título SIMBOLOGÍA.</div>`);
  if (state.panelSym.report) paintPanelSymIssues(state.panelSym.report);
  schedulePanelSymCheck();
}

/* P13 paso 4 — incongruencias simbología ↔ capas (solo lectura). */
let panelSymCheckTimer = null;
let panelSymCheckSeq = 0;

function schedulePanelSymCheck(delay = 600) {
  if (!$("cartoPanelSymDetails")?.open) return;
  clearTimeout(panelSymCheckTimer);
  panelSymCheckTimer = setTimeout(() => void runPanelSymCheck(), delay);
}

async function runPanelSymCheck() {
  if (!state.draft || state.panelSym.templateId !== state.templateId) return;
  collectLayersFromDom();
  const seq = ++panelSymCheckSeq;
  try {
    const report = await api.checkPanelSymbology(state.draft);
    if (seq !== panelSymCheckSeq) return;
    state.panelSym.report = report;
    paintPanelSymIssues(report);
  } catch (e) {
    const box = $("cartoPanelSymIssues");
    if (box) box.innerHTML = `<div class="text-danger">${escapeHtml(e?.message || String(e))}</div>`;
  }
}

function paintPanelSymIssues(report) {
  const box = $("cartoPanelSymIssues");
  if (!box) return;
  document.querySelectorAll("#cartoPanelSym [data-sym-flag]").forEach((el) => {
    el.textContent = "";
    el.removeAttribute("title");
    el.className = "ms-1";
  });
  if (!report?.applies) {
    box.innerHTML = "";
    return;
  }
  if (report.hidden) {
    box.innerHTML = `<div class="text-muted">El bloque SIMBOLOGÍA está oculto en «Bloques y métricas»: no se revisa.</div>`;
    return;
  }
  const issues = report.issues || [];
  const byRow = {};
  issues.forEach((i) => {
    if (i.section == null || i.row == null) return;
    (byRow[`${i.section}:${i.row}`] ||= []).push(i);
  });
  Object.entries(byRow).forEach(([key, list]) => {
    const el = document.querySelector(`#cartoPanelSym [data-sym-flag="${key}"]`);
    if (!el) return;
    const warn = list.some((i) => i.level === "warn");
    el.textContent = warn ? "⚠" : "ⓘ";
    el.className = `ms-1 ${warn ? "text-warning" : "text-muted"}`;
    el.title = list.map((i) => i.msg).join("\n");
  });
  if (!issues.length) {
    box.innerHTML = `<div class="text-success">✔ La simbología coincide con las capas del mapa.</div>`;
    return;
  }
  const warns = issues.filter((i) => i.level === "warn");
  const infos = issues.length - warns.length;
  const items = issues
    .map(
      (i) => `<li class="${i.level === "warn" ? "text-warning-emphasis" : "text-muted"}">${i.level === "warn" ? "⚠" : "ⓘ"} ${
        i.label ? `<strong>${escapeHtml(i.label)}</strong>: ` : ""
      }${escapeHtml(i.msg)}</li>`
    )
    .join("");
  box.innerHTML = `<details ${warns.length ? "open" : ""} class="border rounded p-2 ${warns.length ? "border-warning" : ""}">
      <summary>${warns.length ? `<span class="text-warning-emphasis fw-semibold">⚠ ${warns.length} aviso(s)</span>` : ""}${
        warns.length && infos ? " · " : ""
      }${infos ? `<span class="text-muted">ⓘ ${infos} observación(es)</span>` : ""}</summary>
      <ul class="mb-0 mt-1 ps-3">${items}</ul>
    </details>`;
}

function panelSymSyncDraft() {
  const L = state.draft?.layout;
  if (!L || state.panelSym.templateId !== state.templateId) return;
  if (!L.panel || typeof L.panel !== "object") L.panel = {};
  if (state.panelSym.custom && Array.isArray(state.panelSym.sections)) {
    L.panel.simbologia = JSON.parse(JSON.stringify(state.panelSym.sections));
  } else {
    delete L.panel.simbologia;
  }
}

function panelSymTouch(rerender = false) {
  state.panelSym.custom = true;
  panelSymSyncDraft();
  markDirty(true);
  if (rerender) renderPanelSymbology();
  else schedulePanelSymCheck();
}

function panelSymOnInput(ev) {
  const el = ev.target;
  if (!(el instanceof HTMLElement) || !el.dataset.field) return;
  const sections = state.panelSym.sections;
  if (!Array.isArray(sections)) return;
  const si = Number(el.dataset.sec);
  const sec = sections[si];
  if (!sec) return;
  const field = el.dataset.field;
  if (field === "title") {
    sec.title = el.value;
    panelSymTouch();
    return;
  }
  const row = sec.rows?.[Number(el.dataset.row)];
  if (!row) return;
  const sw = row.swatch || (row.swatch = symKindDefaults("line"));
  if (field === "label") row.label = el.value;
  else if (field === "visible") {
    if (el.checked) delete row.visible;
    else row.visible = false;
    panelSymTouch(true);
    return;
  } else if (field === "layer") {
    row.layer = el.value || null;
    panelSymTouch(true);
    return;
  } else if (field === "link") {
    if (el.checked) delete row.link;
    else {
      const eff = layerLinkedStyle(row);
      if (eff) Object.assign(sw, eff);
      row.link = false;
    }
    panelSymTouch(true);
    return;
  } else if (field === "kind") {
    row.swatch = symKindDefaults(el.value);
    if (sw.color && "color" in row.swatch) row.swatch.color = sw.color;
    panelSymTouch(true);
    return;
  } else if (field === "hatch") sw.hatch = el.checked;
  else if (field === "width" || field === "size") {
    const n = Number(el.value);
    if (Number.isFinite(n) && n > 0) sw[field] = n;
  } else if (field === "dash") {
    const vals = String(el.value || "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 6);
    if (vals.length) sw.dash = vals;
    else delete sw.dash;
  } else if (field === "color" || field === "fill" || field === "stroke") sw[field] = el.value.toUpperCase();
  panelSymTouch();
}

function moveItem(arr, i, delta) {
  const j = i + delta;
  if (!Array.isArray(arr) || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

async function panelSymOnClick(ev) {
  const b = ev.target instanceof HTMLElement ? ev.target.closest("[data-sym-action]") : null;
  if (!b) return;
  const ps = state.panelSym;
  const action = b.dataset.symAction;
  if (action === "check") {
    await runPanelSymCheck();
    return;
  }
  if (action === "reset") {
    if (!confirm("¿Restablecer la simbología de fábrica? Se descartan los cambios de este panel.")) return;
    ps.sections = await panelSymDefaults(ps.kind);
    ps.custom = false;
    panelSymSyncDraft();
    markDirty(true);
    renderPanelSymbology();
    return;
  }
  if (!Array.isArray(ps.sections)) ps.sections = [];
  const si = Number(b.dataset.sec);
  const ri = Number(b.dataset.row);
  const sec = ps.sections[si];
  switch (action) {
    case "add-sec":
      ps.sections.push({ title: "Nueva sección", rows: [] });
      break;
    case "sec-up":
      moveItem(ps.sections, si, -1);
      break;
    case "sec-down":
      moveItem(ps.sections, si, 1);
      break;
    case "sec-del":
      if ((sec?.rows || []).length && !confirm(`¿Quitar la sección «${sec.title}» y sus filas?`)) return;
      ps.sections.splice(si, 1);
      break;
    case "add-row":
      sec?.rows?.push({ label: "Nueva fila", layer: null, swatch: symKindDefaults("line") });
      break;
    case "row-up":
      moveItem(sec?.rows, ri, -1);
      break;
    case "row-down":
      moveItem(sec?.rows, ri, 1);
      break;
    case "row-del":
      sec?.rows?.splice(ri, 1);
      break;
    default:
      return;
  }
  panelSymTouch(true);
}

function bindPanelSymbologyUi() {
  const host = $("cartoPanelSym");
  if (!host || host.dataset.bound) return;
  host.dataset.bound = "1";
  host.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number" || el.type === "color")) panelSymOnInput(ev);
  });
  host.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "checkbox")) panelSymOnInput(ev);
  });
  host.addEventListener("click", (ev) => void panelSymOnClick(ev));
  $("cartoPanelSymDetails")?.addEventListener("toggle", (ev) => {
    if (ev.target.open && Array.isArray(state.panelSym.sections)) renderPanelSymbology();
  });
}

/* ---------- P14 · Simbología de la tira (LÍMITES) ---------- */

const STRIP_KIND_LABELS = {
  line: "Línea",
  cross: "Cruces (estatal)",
  triangle: "Triángulo",
};

async function stripSymDefaults() {
  if (!state.stripSymDefaults) {
    const data = await api.stripSymbologyDefaults();
    state.stripSymDefaults = data?.limits && typeof data.limits === "object" ? data.limits : { title: "LÍMITES", rows: [] };
  }
  return JSON.parse(JSON.stringify(state.stripSymDefaults));
}

async function fillStripSymbology(strip) {
  const raw = strip && typeof strip === "object" ? strip.simbologia : undefined;
  const custom = Boolean(raw && typeof raw === "object" && Array.isArray(raw.rows));
  state.stripSym = {
    templateId: state.templateId,
    limits: custom ? JSON.parse(JSON.stringify(raw)) : null,
    custom,
  };
  if (!custom) {
    try {
      const defs = await stripSymDefaults();
      if (state.stripSym.templateId === state.templateId && !state.stripSym.custom) {
        state.stripSym.limits = defs;
      }
    } catch (e) {
      const host = $("cartoStripSym");
      if (host) host.innerHTML = `<span class="text-danger">${escapeHtml(e?.message || String(e))}</span>`;
      return;
    }
  }
  renderStripSymbology();
}

/** Paso 3: color que la fila toma de su capa (mismo criterio que apply_strip_layer_styles). */
function stripLinkedColor(row) {
  if (row.link === false || !row.layer) return null;
  const layer = (state.draft?.layers || []).find((l) => l?.id === row.layer);
  const sym = layer?.symbol && typeof layer.symbol === "object" ? layer.symbol : null;
  if (!sym) return null;
  const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v).toUpperCase() : null);
  const first = (...vals) => vals.find((v) => v != null);
  const stroke = hex(first(sym.stroke_color, sym.stroke, sym.color));
  const isPoint = String(sym.type || layer.geometry || "").toLowerCase() === "point";
  if (isPoint && (!stroke || stroke === "#FFFFFF")) return hex(first(sym.fill_color, sym.fill, sym.color));
  return stroke;
}

function renderStripSymbology() {
  const host = $("cartoStripSym");
  if (!host) return;
  const ss = state.stripSym;
  const lim = ss.limits && typeof ss.limits === "object" ? ss.limits : { title: "LÍMITES", rows: [] };
  const rows = Array.isArray(lim.rows) ? lim.rows : [];
  const layerIds = (state.draft?.layers || []).map((l) => l?.id).filter(Boolean);
  const kindOpts = (cur) =>
    Object.entries(STRIP_KIND_LABELS)
      .map(([k, lab]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${lab}</option>`)
      .join("");
  const layerOpts = (cur) =>
    `<option value="">— sin capa —</option>` +
    [...new Set([...(cur ? [cur] : []), ...layerIds])]
      .map((id) => `<option value="${escapeHtml(id)}" ${id === cur ? "selected" : ""}>${escapeHtml(id)}${layerIds.includes(id) ? "" : " (no está en capas)"}</option>`)
      .join("");
  const btn = (action, label, ri = "", title = "") =>
    `<button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1" data-ssym-action="${action}" data-row="${ri}" title="${title}">${label}</button>`;
  const at = (ri, field) => `data-row="${ri}" data-field="${field}"`;

  const head = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <span class="badge ${ss.custom ? "text-bg-primary" : "text-bg-secondary"}">${ss.custom ? "Personalizada" : "De fábrica"}</span>
      <input type="text" class="form-control form-control-sm fw-semibold" style="max-width:14rem" maxlength="40" placeholder="LÍMITES" title="Título de la columna" value="${escapeHtml(lim.title || "")}" data-row="" data-field="title" />
      ${btn("add-row", "+ Fila", "", "Añadir fila")}
      ${ss.custom ? `<button type="button" class="btn btn-sm btn-outline-danger py-0" data-ssym-action="reset" data-row="">Restablecer de fábrica</button>` : ""}
      <button type="button" class="btn btn-sm btn-outline-dark py-0 ms-auto" data-ssym-action="check" data-row="" title="Comparar la columna LÍMITES con las capas del plano">Revisar contra el mapa</button>
    </div>
    <div id="cartoStripSymIssues" class="mb-2"></div>`;

  const body = rows
    .map((r, ri) => {
      const sw = r.swatch || {};
      const linked = stripLinkedColor(r);
      const wantsLink = r.link !== false && Boolean(r.layer);
      const shownColor = linked || sw.color;
      const linkNote =
        wantsLink && !linked
          ? `<div class="text-warning" style="font-size:0.7rem">capa no encontrada: usa su color propio</div>`
          : "";
      const dash = sw.kind === "line"
        ? `<input type="text" class="form-control form-control-sm" style="width:6rem" placeholder="continua" title="Guiones, p. ej. 6 2 1.2 2" value="${escapeHtml((sw.dash || []).join(" "))}" ${at(ri, "dash")} />`
        : "";
      return `<tr class="${r.visible === false ? "opacity-50" : ""}">
        <td class="text-nowrap"><input type="checkbox" class="form-check-input" title="Visible" ${r.visible === false ? "" : "checked"} ${at(ri, "visible")} /><span class="ms-1" data-ssym-flag="${ri}"></span></td>
        <td><input type="text" class="form-control form-control-sm" maxlength="60" value="${escapeHtml(r.label)}" ${at(ri, "label")} /></td>
        <td><select class="form-select form-select-sm" ${at(ri, "kind")}>${kindOpts(sw.kind)}</select></td>
        <td><div class="d-flex align-items-center gap-1">
          <input type="color" class="form-control form-control-color form-control-sm p-0" style="width:2rem;height:1.6rem" ${linked ? 'disabled title="Tomado de la capa"' : 'title="Color"'} value="${symColor(shownColor, "#757575")}" ${at(ri, "color")} />${dash}
        </div>${linkNote}</td>
        <td><select class="form-select form-select-sm" title="Capa que representa" ${at(ri, "layer")}>${layerOpts(r.layer)}</select></td>
        <td class="text-center"><input type="checkbox" class="form-check-input" title="Tomar el color de la capa del mapa" ${wantsLink ? "checked" : ""} ${r.layer ? "" : "disabled"} ${at(ri, "link")} /></td>
        <td class="text-nowrap">${btn("row-up", "↑", ri, "Subir")}${btn("row-down", "↓", ri, "Bajar")}${btn("row-del", "✕", ri, "Quitar fila")}</td>
      </tr>`;
    })
    .join("");
  const visible = rows.filter((r) => r.visible !== false).length;
  const crowd =
    visible > 8
      ? `<div class="text-warning mb-1" style="font-size:0.75rem">Más de 8 filas visibles: en tiras bajas el texto puede quedar apretado. Revise con Preview.</div>`
      : "";
  host.innerHTML = `${head}${crowd}<div class="table-responsive"><table class="table table-sm align-middle mb-1">
      <thead><tr class="text-muted"><th></th><th>Texto</th><th>Muestra</th><th>Estilo</th><th>Capa</th><th title="Toma el color de la capa del mapa">Ligada</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="7" class="text-muted">Sin filas: solo se dibujará el título.</td></tr>`}</tbody>
    </table></div>`;
  if (ss.report) paintStripSymIssues(ss.report);
  scheduleStripSymCheck();
}

/* P14 paso 4 — incongruencias LÍMITES ↔ capas del plano (solo lectura). */
let stripSymCheckTimer = null;
let stripSymCheckSeq = 0;

function scheduleStripSymCheck(delay = 600) {
  if (!$("cartoStripSymDetails")?.open) return;
  clearTimeout(stripSymCheckTimer);
  stripSymCheckTimer = setTimeout(() => void runStripSymCheck(), delay);
}

async function runStripSymCheck() {
  if (!state.draft || state.stripSym.templateId !== state.templateId) return;
  collectLayersFromDom();
  const seq = ++stripSymCheckSeq;
  try {
    const report = await api.checkPanelSymbology(state.draft);
    if (seq !== stripSymCheckSeq) return;
    state.stripSym.report = report;
    paintStripSymIssues(report);
  } catch (e) {
    const box = $("cartoStripSymIssues");
    if (box) box.innerHTML = `<div class="text-danger">${escapeHtml(e?.message || String(e))}</div>`;
  }
}

function paintStripSymIssues(report) {
  const box = $("cartoStripSymIssues");
  if (!box) return;
  document.querySelectorAll("#cartoStripSym [data-ssym-flag]").forEach((el) => {
    el.textContent = "";
    el.removeAttribute("title");
    el.className = "ms-1";
  });
  if (!report?.applies || report.target !== "strip") {
    box.innerHTML = "";
    return;
  }
  if (report.hidden) {
    box.innerHTML = `<div class="text-muted">La tira está desactivada: no se revisa.</div>`;
    return;
  }
  const issues = report.issues || [];
  const byRow = {};
  issues.forEach((i) => {
    if (i.row == null) return;
    (byRow[i.row] ||= []).push(i);
  });
  Object.entries(byRow).forEach(([ri, list]) => {
    const el = document.querySelector(`#cartoStripSym [data-ssym-flag="${ri}"]`);
    if (!el) return;
    const warn = list.some((i) => i.level === "warn");
    el.textContent = warn ? "⚠" : "ⓘ";
    el.className = `ms-1 ${warn ? "text-warning" : "text-muted"}`;
    el.title = list.map((i) => i.msg).join("\n");
  });
  if (!issues.length) {
    box.innerHTML = `<div class="text-success">✔ La columna LÍMITES coincide con las capas del plano.</div>`;
    return;
  }
  const warns = issues.filter((i) => i.level === "warn");
  const infos = issues.length - warns.length;
  const items = issues
    .map(
      (i) => `<li class="${i.level === "warn" ? "text-warning-emphasis" : "text-muted"}">${i.level === "warn" ? "⚠" : "ⓘ"} ${
        i.label ? `<strong>${escapeHtml(i.label)}</strong>: ` : ""
      }${escapeHtml(i.msg)}</li>`
    )
    .join("");
  box.innerHTML = `<details ${warns.length ? "open" : ""} class="border rounded p-2 ${warns.length ? "border-warning" : ""}">
      <summary>${warns.length ? `<span class="text-warning-emphasis fw-semibold">⚠ ${warns.length} aviso(s)</span>` : ""}${
        warns.length && infos ? " · " : ""
      }${infos ? `<span class="text-muted">ⓘ ${infos} observación(es)</span>` : ""}</summary>
      <ul class="mb-0 mt-1 ps-3">${items}</ul>
    </details>`;
}

function stripSymSyncDraft() {
  const L = state.draft?.layout;
  if (!L || state.stripSym.templateId !== state.templateId) return;
  if (!L.strip || typeof L.strip !== "object") return;
  if (state.stripSym.custom && state.stripSym.limits) {
    L.strip.simbologia = JSON.parse(JSON.stringify(state.stripSym.limits));
  } else {
    delete L.strip.simbologia;
  }
}

function stripSymTouch(rerender = false) {
  state.stripSym.custom = true;
  stripSymSyncDraft();
  markDirty(true);
  if (rerender) renderStripSymbology();
  else scheduleStripSymCheck();
}

function stripSymOnInput(ev) {
  const el = ev.target;
  if (!(el instanceof HTMLElement) || !el.dataset.field) return;
  const lim = state.stripSym.limits;
  if (!lim || typeof lim !== "object") return;
  const field = el.dataset.field;
  if (field === "title") {
    lim.title = el.value;
    stripSymTouch();
    return;
  }
  const row = lim.rows?.[Number(el.dataset.row)];
  if (!row) return;
  const sw = row.swatch || (row.swatch = { kind: "line", color: "#757575" });
  if (field === "label") row.label = el.value;
  else if (field === "visible") {
    if (el.checked) delete row.visible;
    else row.visible = false;
    stripSymTouch(true);
    return;
  } else if (field === "layer") {
    row.layer = el.value || null;
    stripSymTouch(true);
    return;
  } else if (field === "link") {
    if (el.checked) delete row.link;
    else {
      const eff = stripLinkedColor(row);
      if (eff) sw.color = eff;
      row.link = false;
    }
    stripSymTouch(true);
    return;
  } else if (field === "kind") {
    row.swatch = { kind: el.value, color: sw.color || "#757575" };
    stripSymTouch(true);
    return;
  } else if (field === "color") sw.color = el.value.toUpperCase();
  else if (field === "dash") {
    const vals = String(el.value || "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 6);
    if (vals.length) sw.dash = vals;
    else delete sw.dash;
  }
  stripSymTouch();
}

async function stripSymOnClick(ev) {
  const b = ev.target instanceof HTMLElement ? ev.target.closest("[data-ssym-action]") : null;
  if (!b) return;
  const ss = state.stripSym;
  const action = b.dataset.ssymAction;
  if (action === "check") {
    await runStripSymCheck();
    return;
  }
  if (action === "reset") {
    if (!confirm("¿Restablecer la columna LÍMITES de fábrica? Se descartan los cambios de la tira.")) return;
    ss.limits = await stripSymDefaults();
    ss.custom = false;
    stripSymSyncDraft();
    markDirty(true);
    renderStripSymbology();
    return;
  }
  if (!ss.limits || typeof ss.limits !== "object") return;
  if (!Array.isArray(ss.limits.rows)) ss.limits.rows = [];
  const rows = ss.limits.rows;
  const ri = Number(b.dataset.row);
  switch (action) {
    case "add-row":
      rows.push({ label: "NUEVA FILA", layer: null, swatch: { kind: "line", color: "#757575" } });
      break;
    case "row-up":
      moveItem(rows, ri, -1);
      break;
    case "row-down":
      moveItem(rows, ri, 1);
      break;
    case "row-del":
      rows.splice(ri, 1);
      break;
    default:
      return;
  }
  stripSymTouch(true);
}

function bindStripSymbologyUi() {
  const host = $("cartoStripSym");
  if (!host || host.dataset.bound) return;
  host.dataset.bound = "1";
  host.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "color")) stripSymOnInput(ev);
  });
  host.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "checkbox")) stripSymOnInput(ev);
  });
  host.addEventListener("click", (ev) => void stripSymOnClick(ev));
  $("cartoStripSymDetails")?.addEventListener("toggle", (ev) => {
    if (ev.target.open && state.stripSym.limits) refreshStripSymFromLayers();
  });
}

function refreshStripSymFromLayers() {
  if (!$("cartoStripSymDetails")?.open || !state.stripSym.limits) return;
  if (state.stripSym.templateId !== state.templateId) return;
  collectLayersFromDom();
  renderStripSymbology();
}

function updatePanelPreview(layout) {
  const band = $("cartoPanelPreviewBand");
  if (!band) return;
  const w = Number($("cartoPanelLegendW")?.value);
  // Aprox visual: croquis ~260/1984 ≈ 13%… usamos % del input vs tip. page
  const pageHint = String(layout?.preset || "").includes("condensado") ? 3400 : 2550;
  const pct = Number.isFinite(w) ? clampNum((w / pageHint) * 100, 12, 45) : 28;
  band.style.flex = `0 0 ${Math.round(pct)}%`;
}

function resetPanelComposeCanonical() {
  const preset = state.draft?.layout?.preset || "grosig_croquis_90x70";
  const def = panelCanonicalDefaults(preset);
  if ($("cartoPanelLegendW")) $("cartoPanelLegendW").value = String(def.legend_width);
  if ($("cartoPanelTypeScale")) $("cartoPanelTypeScale").value = String(def.type_scale);
  if ($("cartoPanelGapMax")) $("cartoPanelGapMax").value = String(def.gap_max);
  if ($("cartoPanelIdxFrac")) $("cartoPanelIdxFrac").value = String(def.index_h_frac);
  if ($("cartoPanelLiftMin")) $("cartoPanelLiftMin").value = String(def.bottom_lift_min);
  if ($("cartoPanelLiftMult")) $("cartoPanelLiftMult").value = String(def.bottom_lift_pad_mult);
  if ($("cartoPanelWarnPad")) $("cartoPanelWarnPad").value = String(def.warn_floor_pad);
  ["cartoPanelBlkSym", "cartoPanelBlkClaves", "cartoPanelBlkId", "cartoPanelBlkIdx", "cartoPanelBlkRef"].forEach(
    (id) => {
      if ($(id)) $(id).checked = true;
    }
  );
  updatePanelPreview({ preset });
  markDirty(true);
}

function layerVisible(layer) {
  if (layer.visible === false) return false;
  if (layer.draw === false) return false;
  return true;
}

function setLayerVisible(layer, on) {
  if ("draw" in layer) layer.draw = on;
  else layer.visible = on;
  if (on) {
    if (layer.draw === false) layer.draw = true;
    if (layer.visible === false) layer.visible = true;
  }
}

function datasourceOptionsHtml(selectedTable) {
  const cur = String(selectedTable || "").trim();
  const sources = state.datasources || [];
  const opts = sources.map((s) => {
    const id = s.source_id || s.id || "";
    const backend = s.backend ? ` · ${s.backend}` : "";
    const label = s.label || id;
    return `<option value="${escapeHtml(id)}" ${
      id === cur ? "selected" : ""
    }>${escapeHtml(label)}${escapeHtml(backend)}</option>`;
  });
  if (cur && !sources.some((s) => (s.source_id || s.id) === cur)) {
    opts.unshift(
      `<option value="${escapeHtml(cur)}" selected>${escapeHtml(
        cur
      )} (fuera de catálogo)</option>`
    );
  }
  if (!opts.length) {
    opts.push(
      `<option value="${escapeHtml(cur)}">${escapeHtml(cur || "—")}</option>`
    );
  }
  return opts.join("");
}

/** cols=null → cargando; [] → sin columnas / error. Conserva el valor actual aunque no esté. */
function labelFieldOptionsHtml(cols, selected, emptyText = "— Sin campo —") {
  const cur = String(selected || "").trim();
  const opts = [`<option value="">${escapeHtml(emptyText)}</option>`];
  if (cols === null) {
    if (cur) opts.push(`<option value="${escapeHtml(cur)}" selected>${escapeHtml(cur)}</option>`);
    opts.push(`<option value="" disabled>Cargando columnas…</option>`);
    return opts.join("");
  }
  if (cur && !cols.includes(cur)) {
    opts.push(
      `<option value="${escapeHtml(cur)}" selected>${escapeHtml(cur)} (no está en la tabla)</option>`
    );
  }
  cols.forEach((c) => {
    opts.push(
      `<option value="${escapeHtml(c)}" ${c === cur ? "selected" : ""}>${escapeHtml(c)}</option>`
    );
  });
  return opts.join("");
}

function sourceColumns(sourceId) {
  const sid = String(sourceId || "").trim();
  if (!sid) return Promise.resolve([]);
  if (!state.columnsCache[sid]) {
    state.columnsCache[sid] = api
      .listSourceColumns(sid)
      .then((data) => (data?.columns || []).map((c) => c.name).filter(Boolean))
      .catch(() => {
        delete state.columnsCache[sid];
        return [];
      });
  }
  return state.columnsCache[sid];
}

const RULE_OPS = [
  { id: "eq", label: "=" },
  { id: "contains", label: "contiene" },
  { id: "ne", label: "≠" },
];

function labelRulesHtml(idx, rules) {
  const list = Array.isArray(rules) ? rules : [];
  if (!list.length) {
    return `<div class="text-muted small mb-1">Sin reglas.</div>`;
  }
  return list
    .map((r, ridx) => {
      const op = String(r?.op || "eq");
      return `<div class="row g-1 align-items-center mb-1 carto-rule-row" data-idx="${idx}" data-ridx="${ridx}">
      <div class="col-md-3">
        <select class="form-select form-select-sm carto-col-select carto-rule-field" data-current="${escapeHtml(
          r?.field || ""
        )}" title="Campo">${labelFieldOptionsHtml(null, r?.field, "— Campo —")}</select>
      </div>
      <div class="col-md-2">
        <select class="form-select form-select-sm carto-rule-op" title="Operador">${RULE_OPS.map(
          (o) => `<option value="${o.id}" ${o.id === op ? "selected" : ""}>${escapeHtml(o.label)}</option>`
        ).join("")}</select>
      </div>
      <div class="col-md-6">
        <input class="form-control form-control-sm carto-rule-value" value="${escapeHtml(
          r?.value ?? ""
        )}" placeholder="valor" title="Valor" />
      </div>
      <div class="col-md-1 text-end">
        <button type="button" class="btn btn-outline-danger btn-sm py-0 px-1 carto-rule-del" data-idx="${idx}" data-ridx="${ridx}" title="Quitar regla">✕</button>
      </div>
      <div class="col-12 ps-3">
        <div class="small text-muted">Si coincide, etiquetar como:</div>
        ${templateBuilderHtml(
          `<input class="form-control form-control-sm carto-rule-template carto-tb-input" value="${escapeHtml(
            r?.template || ""
          )}" placeholder="{tipo} {nombre}" title="Plantilla si coincide" />`
        )}
      </div>
    </div>`;
    })
    .join("");
}

const TB_TOKEN_RE = /(\{[A-Za-z_][A-Za-z0-9_]{0,62}\})/;
const TB_QUICK = [
  { lit: " ", label: "␣ espacio", title: "Espacio" },
  { lit: " - ", label: "–", title: "Guion con espacios" },
  { lit: ", ", label: ",", title: "Coma y espacio" },
  { lit: " (", label: "(", title: "Abre paréntesis" },
  { lit: ")", label: ")", title: "Cierra paréntesis" },
  { lit: "\\n", label: "↵ salto", title: "Salto de línea" },
];

function tbTokens(template) {
  return String(template || "")
    .split(TB_TOKEN_RE)
    .filter((p) => p !== "")
    .map((p) =>
      TB_TOKEN_RE.test(p) && p.startsWith("{")
        ? { kind: "field", value: p.slice(1, -1) }
        : { kind: "text", value: p }
    );
}

function tbJoin(tokens) {
  return tokens.map((t) => (t.kind === "field" ? `{${t.value}}` : t.value)).join("");
}

function tbShowText(s) {
  return String(s).replace(/\\n/g, "↵").replace(/ /g, "␣");
}

/** Constructor de plantilla por fichas; ``inputHtml`` es el input real (clase carto-tb-input). */
function templateBuilderHtml(inputHtml) {
  return `<div class="carto-tb-wrap">
    <div class="carto-tb border rounded p-1 mb-1">
      <div class="carto-tb-chips d-flex flex-wrap gap-1 align-items-center"></div>
      <div class="d-flex flex-wrap gap-1 mt-1 align-items-center">
        <select class="form-select form-select-sm carto-col-select carto-tb-field" style="width:auto;max-width:14rem" data-current="" title="Añadir un campo">
          ${labelFieldOptionsHtml(null, "", "+ Campo…")}
        </select>
        ${TB_QUICK.map(
          (q) =>
            `<button type="button" class="btn btn-outline-secondary btn-sm py-0 carto-tb-lit" data-lit="${escapeHtml(
              q.lit
            )}" title="${escapeHtml(q.title)}">${escapeHtml(q.label)}</button>`
        ).join("")}
        <input class="form-control form-control-sm carto-tb-text" style="width:9rem" placeholder="texto fijo (Río…)" maxlength="60" />
        <button type="button" class="btn btn-outline-primary btn-sm py-0 carto-tb-text-add" title="Añadir el texto fijo">+ Texto</button>
        <button type="button" class="btn btn-outline-danger btn-sm py-0 carto-tb-clear" title="Vaciar la plantilla">Limpiar</button>
      </div>
      <div class="small text-muted mt-1 carto-tb-preview"></div>
    </div>
    ${inputHtml}
  </div>`;
}

function renderTemplateBuilder(wrap) {
  const input = wrap?.querySelector(".carto-tb-input");
  const chips = wrap?.querySelector(".carto-tb-chips");
  const preview = wrap?.querySelector(".carto-tb-preview");
  if (!input || !chips) return;
  const tokens = tbTokens(input.value);
  chips.innerHTML = tokens.length
    ? tokens
        .map((t, i) => {
          const cls = t.kind === "field" ? "text-bg-primary" : "text-bg-light border";
          const txt = t.kind === "field" ? t.value : `“${tbShowText(t.value)}”`;
          return `<span class="badge ${cls} d-inline-flex align-items-center gap-1 fw-normal">${escapeHtml(
            txt
          )}<button type="button" class="btn-close btn-close-sm carto-tb-x" data-pos="${i}" aria-label="Quitar" style="font-size:.55rem"></button></span>`;
        })
        .join("")
    : `<span class="small text-muted">Elija campos y separadores para armar la etiqueta (vacío = solo el campo).</span>`;
  if (preview) {
    const shown = tokens
      .map((t) => (t.kind === "field" ? `«${t.value}»` : t.value.replace(/\\n/g, " ⏎ ")))
      .join("");
    preview.textContent = tokens.length ? `Resultado: ${shown}` : "";
  }
}

function setTemplateValue(wrap, value) {
  const input = wrap?.querySelector(".carto-tb-input");
  if (!input) return;
  input.value = value;
  renderTemplateBuilder(wrap);
  markDirty(true);
}

function tbAppend(wrap, piece) {
  const input = wrap?.querySelector(".carto-tb-input");
  if (!input) return;
  setTemplateValue(wrap, `${input.value}${piece}`);
}

async function fillLabelFieldSelect(sel, sourceId) {
  if (!sel) return;
  const current = sel.value || sel.getAttribute("data-current") || "";
  const emptyText = sel.options?.[0]?.textContent || "— Sin campo —";
  sel.innerHTML = labelFieldOptionsHtml(null, current, emptyText);
  const cols = await sourceColumns(sourceId);
  if (!sel.isConnected) return;
  sel.innerHTML = labelFieldOptionsHtml(cols, current, emptyText);
}

function fillLayerColumnSelects(item, sourceId) {
  item
    ?.querySelectorAll(".carto-lab-field, .carto-col-select")
    .forEach((sel) => void fillLabelFieldSelect(sel, sourceId));
}

function fillAllLabelFieldSelects() {
  const layers = state.draft?.layers || [];
  document.querySelectorAll(".carto-layer-item").forEach((item) => {
    const idx = Number(item.getAttribute("data-idx"));
    fillLayerColumnSelects(item, layers[idx]?.table);
  });
}

function fillAddLayerCombo() {
  const sel = $("cartoProdAddTable");
  if (!sel) return;
  const sources = state.datasources || [];
  sel.innerHTML = sources.length
    ? `<option value="">— Elija fuente —</option>${sources
        .map((s) => {
          const id = s.source_id || "";
          const label = s.label || id;
          return `<option value="${escapeHtml(id)}" data-label="${escapeHtml(
            label
          )}" data-geom="${escapeHtml(s.geom_kind || (s.geom_kinds && s.geom_kinds[0]) || "auto")}">${escapeHtml(
            label
          )}</option>`;
        })
        .join("")}`
    : `<option value="">Sin fuentes (registre en pestaña Fuentes)</option>`;
}

function suggestLayerId(table) {
  const bare = String(table || "")
    .split(".")
    .pop()
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  let base = bare || "capa";
  const used = new Set(
    (state.draft?.layers || []).map((L) => String(L.id || "").toLowerCase())
  );
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

function defaultSymbolForGeom(geom) {
  const g = String(geom || "auto").toLowerCase();
  if (g === "point") {
    return {
      type: "point",
      fill_color: "#C0392B",
      stroke_color: "#FFFFFF",
      size: 3.2,
    };
  }
  if (g === "line") {
    return {
      type: "line",
      stroke_color: "#1A5276",
      width: 1.2,
    };
  }
  return {
    type: "polygon",
    fill_color: "#AED6F1",
    fill_opacity: 0.35,
    stroke_color: "#1A5276",
    stroke_width: 1.0,
  };
}

function productNeedsCveMun() {
  const meta = currentProductMeta();
  const req = meta?.required_params || [];
  return req.includes("cve_mun") || state.productKey.includes("municipal") || state.productKey.includes("croquis");
}

function productNeedsCveLoc() {
  const meta = currentProductMeta();
  const req = meta?.required_params || [];
  return req.includes("cve_loc") || state.productKey.includes("localidad");
}

function addLayerFromSource() {
  collectAll();
  if (!state.draft) {
    showMsg("error", "Cargue un producto primero");
    return;
  }
  const table = $("cartoProdAddTable")?.value?.trim();
  if (!table) {
    showMsg("error", "Elija una fuente / tabla");
    return;
  }
  const opt = $("cartoProdAddTable")?.selectedOptions?.[0];
  const suggestedLabel =
    $("cartoProdAddLabel")?.value?.trim() ||
    opt?.getAttribute("data-label") ||
    table;
  let geom = $("cartoProdAddGeom")?.value || "auto";
  if (geom === "auto") {
    geom = opt?.getAttribute("data-geom") || "polygon";
    if (geom === "auto") geom = "polygon";
  }
  const layer = {
    id: suggestLayerId(table),
    label: suggestedLabel,
    table,
    geom_column: "the_geom",
    legend: true,
    optional: true,
    symbol: defaultSymbolForGeom(geom),
  };
  if (productNeedsCveMun()) {
    layer.filter = { ...(layer.filter || {}), cve_mun: "{cve_mun}" };
  }
  if (productNeedsCveLoc()) {
    layer.filter = { ...(layer.filter || {}), cve_loc: "{cve_loc}" };
  }
  if (!Array.isArray(state.draft.layers)) state.draft.layers = [];
  // Al final = encima en el mapa
  state.draft.layers.push(layer);
  markDirty(true);
  if ($("cartoProdAddLabel")) $("cartoProdAddLabel").value = "";
  if ($("cartoProdAddTable")) $("cartoProdAddTable").selectedIndex = 0;
  renderLayers();
  showMsg(
    "ok",
    `Capa «${suggestedLabel}» añadida. Ajuste símbolo si hace falta, guarde draft y haga Preview.`
  );
}

function removeLayer(idx) {
  collectLayersFromDom();
  const layers = state.draft?.layers;
  if (!Array.isArray(layers) || idx < 0 || idx >= layers.length) return;
  const name = layers[idx]?.label || layers[idx]?.id || "capa";
  if (!confirm(`¿Quitar la capa «${name}» de este producto?`)) return;
  layers.splice(idx, 1);
  markDirty(true);
  renderLayers();
  showMsg("ok", `Capa «${name}» quitada del draft`);
}

function renderLayers() {
  const host = $("cartoProdLayers");
  if (!host || !state.draft) return;
  const layers = Array.isArray(state.draft.layers) ? state.draft.layers : [];
  if (!layers.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Sin capas. Use «Añadir» arriba para incorporar una fuente.</p>`;
    return;
  }
  const n = layers.length;
  const openIdx = new Set(
    [...host.querySelectorAll(".carto-layer-item[open]")].map((el) => el.getAttribute("data-idx"))
  );
  const openLabIdx = new Set(
    [...host.querySelectorAll(".carto-lab-panel[open]")].map((el) => el.getAttribute("data-idx"))
  );
  host.innerHTML = layers
    .map((layer, idx) => {
      const id = layer.id || `layer_${idx}`;
      const sym = layer.symbol && typeof layer.symbol === "object" ? layer.symbol : {};
      const st = String(sym.type || layer.geometry || "polygon").toLowerCase();
      const labels = layer.labels && typeof layer.labels === "object" ? layer.labels : {};
      const dashStr = Array.isArray(sym.dash) ? sym.dash.join(", ") : "";
      const zHint =
        idx === 0 && n > 1
          ? "debajo"
          : idx === n - 1 && n > 1
            ? "encima"
            : "";
      return `
<details class="border rounded mb-2 carto-layer-item" data-idx="${idx}">
  <summary class="px-2 py-2 small d-flex flex-wrap align-items-center gap-2" style="cursor:pointer">
    <span class="text-muted" title="Expandir">▸</span>
    <input type="checkbox" class="form-check-input carto-layer-vis" data-idx="${idx}" ${
        layerVisible(layer) ? "checked" : ""
      } onclick="event.stopPropagation()" />
    <strong>${escapeHtml(layer.label || id)}</strong>
    <span class="badge text-bg-light border">${escapeHtml(st)}</span>
    ${
      zHint
        ? `<span class="badge text-bg-secondary">${escapeHtml(zHint)}</span>`
        : ""
    }
    <span class="ms-auto d-flex gap-1">
      <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1 carto-layer-up" data-idx="${idx}" title="Más arriba en lista (más abajo en mapa)">↑</button>
      <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1 carto-layer-down" data-idx="${idx}" title="Más abajo en lista (más encima en mapa)">↓</button>
      <button type="button" class="btn btn-outline-danger btn-sm py-0 px-1 carto-layer-del" data-idx="${idx}" title="Quitar capa">✕</button>
    </span>
  </summary>
  <div class="px-2 pb-2 small">
    <div class="row g-2 mb-2">
      <div class="col-md-6">
        <label class="form-label mb-0">Nombre en leyenda</label>
        <input class="form-control form-control-sm carto-layer-label" data-idx="${idx}" value="${escapeHtml(
        layer.label || ""
      )}" />
      </div>
      <div class="col-md-6">
        <label class="form-label mb-0">Fuente de datos</label>
        <select class="form-select form-select-sm carto-layer-table" data-idx="${idx}">
          ${datasourceOptionsHtml(layer.table)}
        </select>
      </div>
      <div class="col-md-3 d-flex align-items-end">
        <div class="form-check">
          <input class="form-check-input carto-layer-legend" type="checkbox" data-idx="${idx}" id="leg_${idx}" ${
        layer.legend !== false ? "checked" : ""
      } />
          <label class="form-check-label" for="leg_${idx}">En leyenda</label>
        </div>
      </div>
      <div class="col-md-3 d-flex align-items-end">
        <div class="form-check">
          <input class="form-check-input carto-layer-optional" type="checkbox" data-idx="${idx}" id="opt_${idx}" ${
        layer.optional ? "checked" : ""
      } />
          <label class="form-check-label" for="opt_${idx}">Opcional</label>
        </div>
      </div>
      ${
        String(layer.id || "").startsWith("ctx_")
          ? ""
          : `<div class="col-md-6 d-flex align-items-end">
        <div class="form-check">
          <input class="form-check-input carto-layer-outside" type="checkbox" data-idx="${idx}" id="out_${idx}" ${
        layer.show_outside ? "checked" : ""
      } />
          <label class="form-check-label" for="out_${idx}" title="Muestra también los elementos de esta capa que caen dentro del marco del mapa pero fuera del municipio o localidad foco (vecinos). No aplica al condensado estatal.">Mostrar también fuera del territorio (solo lo visible)</label>
        </div>
      </div>`
      }
    </div>
    <div class="fw-semibold mb-1">Símbolo (${escapeHtml(st)})</div>
    <div class="row g-2 mb-2 carto-sym-fields" data-idx="${idx}" data-type="${escapeHtml(st)}">
      ${
        st === "point" || st === "polygon"
          ? `<div class="col-6 col-md-3"><label class="form-label mb-0">Relleno</label>
             <input type="color" class="form-control form-control-sm form-control-color carto-sym-fill" value="${escapeHtml(
               symbolColor(sym, "fill", "fill_color")
             )}" /></div>
             <div class="col-6 col-md-3"><label class="form-label mb-0">Opacidad</label>
             <input type="number" min="0" max="1" step="0.05" class="form-control form-control-sm carto-sym-opacity" value="${escapeHtml(
               String(symbolNum(sym, ["fill_opacity"], st === "point" ? 1 : 0.45))
             )}" /></div>`
          : ""
      }
      ${
        st !== "none"
          ? `<div class="col-6 col-md-3"><label class="form-label mb-0">Trazo</label>
             <input type="color" class="form-control form-control-sm form-control-color carto-sym-stroke" value="${escapeHtml(
               symbolColor(sym, "stroke", "stroke_color", "color")
             )}" /></div>
             <div class="col-6 col-md-3"><label class="form-label mb-0">${
               st === "point" ? "Tamaño" : "Ancho"
             }</label>
             <input type="number" min="0" step="0.05" class="form-control form-control-sm carto-sym-width" value="${escapeHtml(
               String(
                 st === "point"
                   ? symbolNum(sym, ["size"], 3)
                   : symbolNum(sym, ["width", "stroke_width"], 1)
               )
             )}" /></div>`
          : `<div class="col-12 text-muted">type=none (solo etiquetas)</div>`
      }
      ${
        st === "line"
          ? `<div class="col-md-6"><label class="form-label mb-0">Dash (números)</label>
             <input class="form-control form-control-sm carto-sym-dash" value="${escapeHtml(
               dashStr
             )}" placeholder="6, 2, 1.2, 2" /></div>`
          : ""
      }
    </div>
    <div class="d-flex align-items-center gap-3 mb-1">
      <span class="fw-semibold">Etiquetas</span>
      <div class="form-check mb-0">
        <input class="form-check-input carto-lab-en" type="checkbox" data-idx="${idx}" id="laben_${idx}" ${
        labels.enabled ? "checked" : ""
      } />
        <label class="form-check-label" for="laben_${idx}">Activas</label>
      </div>
    </div>
    <details class="carto-lab-panel border rounded px-2 py-1 mb-1" data-idx="${idx}">
    <summary>Configurar etiquetas</summary>
    <div class="row g-2 mt-1 mb-1">
      <div class="col-md-4">
        <label class="form-label mb-0">Campo</label>
        <select class="form-select form-select-sm carto-lab-field" data-idx="${idx}" data-current="${escapeHtml(
        labels.field || ""
      )}">
          ${labelFieldOptionsHtml(null, labels.field)}
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label mb-0">Tamaño</label>
        <input type="number" step="0.1" class="form-control form-control-sm carto-lab-size" data-idx="${idx}" value="${escapeHtml(
        String(labels.size ?? "")
      )}" />
      </div>
      <div class="col-md-2">
        <label class="form-label mb-0">Color</label>
        <input type="color" class="form-control form-control-sm form-control-color carto-lab-color" data-idx="${idx}" value="${escapeHtml(
        labels.color || "#1a1a1a"
      )}" />
      </div>
      <div class="col-md-2">
        <label class="form-label mb-0">Límite</label>
        <input type="number" min="0" class="form-control form-control-sm carto-lab-limit" data-idx="${idx}" value="${escapeHtml(
        String(labels.limit ?? "")
      )}" />
      </div>
      <div class="col-md-1"></div>
      <div class="col-12 d-flex flex-wrap gap-3">
        <div class="form-check">
          <input class="form-check-input carto-lab-bold" type="checkbox" data-idx="${idx}" id="labb_${idx}" ${
        labels.bold ? "checked" : ""
      } />
          <label class="form-check-label fw-bold" for="labb_${idx}">Negrita</label>
        </div>
        <div class="form-check">
          <input class="form-check-input carto-lab-italic" type="checkbox" data-idx="${idx}" id="labi_${idx}" ${
        labels.italic ? "checked" : ""
      } />
          <label class="form-check-label fst-italic" for="labi_${idx}">Cursiva</label>
        </div>
        <div class="form-check">
          <input class="form-check-input carto-lab-underline" type="checkbox" data-idx="${idx}" id="labu_${idx}" ${
        labels.underline ? "checked" : ""
      } />
          <label class="form-check-label text-decoration-underline" for="labu_${idx}">Subrayado</label>
        </div>
      </div>
      <div class="col-12">
        <label class="form-label mb-0">Plantilla de texto <span class="text-muted">(opcional · concatenar campos y texto)</span></label>
        ${templateBuilderHtml(
          `<input class="form-control form-control-sm carto-lab-template carto-tb-input" data-idx="${idx}" value="${escapeHtml(
            labels.template || ""
          )}" placeholder="{tipo} {nombre}   ·   Río {nombre}" />`
        )}
        <div class="form-text">Clic en campos y separadores para armarla, o escríbala: <code>{campo}</code> inserta el valor; el texto fijo va tal cual. Vacío = solo el campo.</div>
      </div>
      <div class="col-12">
        <div class="d-flex align-items-center gap-2 mb-1">
          <span class="fw-semibold">Reglas (campo = valor)</span>
          <button type="button" class="btn btn-outline-primary btn-sm py-0 carto-rule-add" data-idx="${idx}">+ Regla</button>
          <div class="form-check ms-2">
            <input class="form-check-input carto-lab-rules-only" type="checkbox" data-idx="${idx}" id="labro_${idx}" ${
        labels.rules_only ? "checked" : ""
      } />
            <label class="form-check-label" for="labro_${idx}">Etiquetar solo lo que cumpla una regla</label>
          </div>
        </div>
        ${labelRulesHtml(idx, labels.rules)}
        <div class="form-text">Se aplica la primera regla que coincida con su plantilla; si ninguna coincide se usa la plantilla general.
          Ej.: <code>tipo</code> contiene <code>Rio</code> → <code>{tipo} {nombre}</code> produce «Rio Papagayo».</div>
      </div>
    </div>
    </details>
  </div>
</details>`;
    })
    .join("");
  host.querySelectorAll(".carto-layer-item").forEach((el) => {
    if (openIdx.has(el.getAttribute("data-idx"))) el.open = true;
  });
  host.querySelectorAll(".carto-lab-panel").forEach((el) => {
    if (openLabIdx.has(el.getAttribute("data-idx"))) el.open = true;
  });
  host.querySelectorAll(".carto-tb-wrap").forEach((w) => renderTemplateBuilder(w));
  fillAllLabelFieldSelects();
}

function collectLayersFromDom() {
  if (!state.draft || !Array.isArray(state.draft.layers)) return;
  const layers = state.draft.layers;
  document.querySelectorAll(".carto-layer-item").forEach((item) => {
    const idx = Number(item.getAttribute("data-idx"));
    const layer = layers[idx];
    if (!layer) return;
    const vis = item.querySelector(".carto-layer-vis");
    if (vis) setLayerVisible(layer, vis.checked);
    const lab = item.querySelector(".carto-layer-label");
    if (lab) layer.label = lab.value;
    const tableSel = item.querySelector(".carto-layer-table");
    if (tableSel && tableSel.value) layer.table = tableSel.value.trim();
    const legend = item.querySelector(".carto-layer-legend");
    if (legend) layer.legend = legend.checked;
    const optional = item.querySelector(".carto-layer-optional");
    if (optional) layer.optional = optional.checked;
    const outside = item.querySelector(".carto-layer-outside");
    if (outside) {
      if (outside.checked) layer.show_outside = true;
      else delete layer.show_outside;
    }

    if (!layer.symbol || typeof layer.symbol !== "object") layer.symbol = {};
    const sym = layer.symbol;
    const st = String(sym.type || layer.geometry || "polygon").toLowerCase();
    const fill = item.querySelector(".carto-sym-fill");
    const stroke = item.querySelector(".carto-sym-stroke");
    const width = item.querySelector(".carto-sym-width");
    const opacity = item.querySelector(".carto-sym-opacity");
    const dash = item.querySelector(".carto-sym-dash");
    if (fill) applySymbolField(sym, st, "fill", fill.value);
    if (stroke) applySymbolField(sym, st, "stroke", stroke.value);
    if (width) {
      const n = Number(width.value);
      if (!Number.isNaN(n)) {
        if (st === "point") applySymbolField(sym, st, "size", n);
        else applySymbolField(sym, st, "width", n);
      }
    }
    if (opacity) {
      const n = Number(opacity.value);
      if (!Number.isNaN(n)) applySymbolField(sym, st, "fill_opacity", n);
    }
    if (dash) applySymbolField(sym, st, "dash", dash.value);

    const labEn = item.querySelector(".carto-lab-en");
    if (labEn) {
      if (!layer.labels || typeof layer.labels !== "object") layer.labels = {};
      layer.labels.enabled = labEn.checked;
      const f = item.querySelector(".carto-lab-field");
      const sz = item.querySelector(".carto-lab-size");
      const col = item.querySelector(".carto-lab-color");
      const lim = item.querySelector(".carto-lab-limit");
      const bold = item.querySelector(".carto-lab-bold");
      if (f) layer.labels.field = f.value.trim();
      if (sz && sz.value !== "") layer.labels.size = Number(sz.value);
      if (col) layer.labels.color = col.value;
      if (lim && lim.value !== "") layer.labels.limit = Number(lim.value);
      if (bold) layer.labels.bold = bold.checked;
      const italic = item.querySelector(".carto-lab-italic");
      const underline = item.querySelector(".carto-lab-underline");
      const tmpl = item.querySelector(".carto-lab-template");
      const rulesOnly = item.querySelector(".carto-lab-rules-only");
      if (italic) layer.labels.italic = italic.checked;
      if (underline) layer.labels.underline = underline.checked;
      if (tmpl) {
        const t = tmpl.value.trim();
        if (t) layer.labels.template = t;
        else delete layer.labels.template;
      }
      const rules = [...item.querySelectorAll(".carto-rule-row")].map((row) => ({
        field: row.querySelector(".carto-rule-field")?.value?.trim() || "",
        op: row.querySelector(".carto-rule-op")?.value || "eq",
        value: row.querySelector(".carto-rule-value")?.value ?? "",
        template: row.querySelector(".carto-rule-template")?.value?.trim() || "",
      }));
      if (rules.length) layer.labels.rules = rules;
      else delete layer.labels.rules;
      if (rulesOnly && rules.length) layer.labels.rules_only = rulesOnly.checked;
      else delete layer.labels.rules_only;
    }
  });
}

function collectAll() {
  collectMetaIntoDraft();
  collectLayersFromDom();
}

function renderPreviewParams() {
  const host = $("cartoProdPreviewParams");
  if (!host) return;
  const meta = currentProductMeta();
  const req = meta?.required_params || [];
  const defaults = PREVIEW_DEFAULTS[state.productKey] || {};
  if (!req.length && state.productKey === "condensado_estatal") {
    host.innerHTML = `<p class="small text-muted mb-0">Sin parámetros obligatorios (opcional cve_ent).</p>
      <label class="form-label small">cve_ent</label>
      <input id="pv_cve_ent" class="form-control form-control-sm" value="${escapeHtml(
        defaults.cve_ent || "12"
      )}" />`;
    return;
  }
  if (!req.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Sin parámetros de territorio.</p>`;
    return;
  }
  host.innerHTML =
    req
      .map((name) => {
        if (name === "cve_mun" || name === "cve_loc") {
          const amb = territoryAmbitoLabel();
          const label =
            name === "cve_mun" ? "Municipio (cve_mun)" : `Localidad (cve_loc)${amb ? ` — solo ${amb}` : ""}`;
          return `<div class="mb-2">
        <label class="form-label small" for="pv_${name}">${label}</label>
        <select id="pv_${name}" class="form-select form-select-sm"><option value="">Cargando…</option></select>
      </div>`;
        }
        let val = defaults[name];
        if (Array.isArray(val)) val = val.join(",");
        if (val == null) val = "";
        return `<div class="mb-2">
        <label class="form-label small" for="pv_${escapeHtml(name)}">${escapeHtml(name)}</label>
        <input id="pv_${escapeHtml(name)}" class="form-control form-control-sm" value="${escapeHtml(
          String(val)
        )}" />
      </div>`;
      })
      .join("") + multipagePreviewHtml();
  wirePreviewTerritory(defaults).catch((err) => console.warn("[cartography studio] territorio", err));
}

const territoryCache = { municipios: null, locs: new Map() };

function normCve(value, width) {
  const d = String(value ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.slice(-width).padStart(width, "0");
}

function byClave(a, b) {
  return a.cve.localeCompare(b.cve, "es", { numeric: true });
}

async function fetchCatalogJson(path) {
  const { res, data, networkError } = await adminFetch(path, { clearOn401: false });
  if (networkError || !res) throw new Error(`sin conexión con ${path}`);
  if (!res.ok) throw new Error(`${path} respondió HTTP ${res.status}`);
  if (data == null) throw new Error(`${path} no devolvió JSON`);
  return data;
}

async function loadMunicipios() {
  if (!territoryCache.municipios) {
    const data = await fetchCatalogJson("/api/cartography/preview-territory");
    const rows = data.rows || [];
    if (!rows.length) throw new Error("la base de cartografía no trajo municipios");
    territoryCache.municipios = rows
      .map((r) => ({ cve: normCve(r.cve, 3), nom: String(r.nomgeo || "").trim() }))
      .filter((r) => r.cve && r.cve !== "000")
      .sort(byClave);
  }
  return territoryCache.municipios;
}

async function loadLocalidades(cveMun) {
  if (!territoryCache.locs.has(cveMun)) {
    const data = await fetchCatalogJson(`/api/cartography/preview-territory?cve_mun=${encodeURIComponent(cveMun)}`);
    const items = (data.rows || [])
      .map((r) => ({
        cve: normCve(r.cve, 4),
        nom: String(r.nomgeo || "").trim(),
        urban: !/^\s*R/i.test(String(r.ambito || "")),
      }))
      .filter((r) => r.cve && r.cve !== "0000");
    territoryCache.locs.set(cveMun, items.sort(byClave));
  }
  const tid = String(state.templateId || "");
  const all = territoryCache.locs.get(cveMun);
  if (tid.endsWith("_rural")) return all.filter((it) => !it.urban);
  if (tid.endsWith("_urbana")) return all.filter((it) => it.urban);
  return all;
}

function territoryAmbitoLabel() {
  const tid = String(state.templateId || "");
  if (tid.endsWith("_rural")) return "rurales";
  if (tid.endsWith("_urbana")) return "urbanas";
  return "";
}

function territoryOptions(items, selected) {
  const has = items.some((it) => it.cve === selected);
  const extra = selected && !has ? [{ cve: selected, nom: "(no está en el catálogo)" }] : [];
  return [...extra, ...items]
    .map(
      (it) =>
        `<option value="${escapeHtml(it.cve)}"${it.cve === selected ? " selected" : ""}>${escapeHtml(
          it.nom ? `${it.nom} (${it.cve})` : it.cve
        )}</option>`
    )
    .join("");
}

function manualTerritoryInput(sel, value, err) {
  const input = document.createElement("input");
  input.id = sel.id;
  input.className = "form-control form-control-sm";
  input.placeholder = "Clave (no se pudo cargar el catálogo)";
  input.value = value || "";
  sel.replaceWith(input);
  if (err) {
    const note = document.createElement("div");
    note.className = "form-text text-warning";
    note.textContent = `No se pudo cargar el catálogo: ${err.message || err}. Escriba la clave.`;
    input.after(note);
  }
  return input;
}

async function wirePreviewTerritory(defaults) {
  const munSel = $("pv_cve_mun");
  const locSel = $("pv_cve_loc");
  if (!munSel && !locSel) return;
  const remembered = state.previewTerritory || {};
  const munWanted = normCve(remembered.cve_mun || defaults.cve_mun, 3);
  const locWanted = normCve(remembered.cve_loc || defaults.cve_loc, 4);

  const fillLocs = async (cveMun, wanted) => {
    const sel = $("pv_cve_loc");
    if (!sel || sel.tagName !== "SELECT") return;
    if (!cveMun) {
      sel.innerHTML = `<option value="">— Elige municipio —</option>`;
      return;
    }
    sel.innerHTML = `<option value="">Cargando localidades…</option>`;
    sel.disabled = true;
    try {
      const items = await loadLocalidades(cveMun);
      if ($("pv_cve_loc") !== sel) return;
      sel.innerHTML = items.length
        ? territoryOptions(items, items.some((it) => it.cve === wanted) ? wanted : items[0].cve)
        : `<option value="">Sin localidades amanzanadas ${territoryAmbitoLabel()} en este municipio</option>`;
      state.previewTerritory = { ...(state.previewTerritory || {}), cve_loc: sel.value };
    } catch (err) {
      console.warn("[cartography studio] localidades", err);
      manualTerritoryInput(sel, wanted, err);
      return;
    } finally {
      sel.disabled = false;
    }
  };

  if (locSel) {
    locSel.addEventListener("change", () => {
      state.previewTerritory = { ...(state.previewTerritory || {}), cve_loc: locSel.value };
    });
  }

  if (!munSel) {
    if (locSel) manualTerritoryInput(locSel, locWanted);
    return;
  }
  try {
    const municipios = await loadMunicipios();
    if ($("pv_cve_mun") !== munSel) return;
    munSel.innerHTML = territoryOptions(municipios, munWanted || municipios[0]?.cve || "");
  } catch (err) {
    console.warn("[cartography studio] municipios", err);
    manualTerritoryInput(munSel, munWanted, err);
    if (locSel) manualTerritoryInput(locSel, locWanted);
    return;
  }
  state.previewTerritory = { ...(state.previewTerritory || {}), cve_mun: munSel.value };
  munSel.addEventListener("change", () => {
    state.previewTerritory = { cve_mun: munSel.value, cve_loc: "" };
    fillLocs(munSel.value, "");
  });
  await fillLocs(munSel.value, locWanted);
}

function multipagePreviewHtml() {
  if (state.productKey !== "plano_localidad") return "";
  const rural = String(state.templateId || "").includes("rural");
  return `<div class="border rounded p-2 mb-2">
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="pv_multipage" ${rural ? "disabled" : ""} />
      <label class="form-check-label small" for="pv_multipage">Cartas detalle (solo localidades urbanas)</label>
    </div>
    <div class="mt-1">
      <label class="form-label small mb-0" for="pv_package">Armado</label>
      <select id="pv_package" class="form-select form-select-sm" ${rural ? "disabled" : ""}>
        <option value="index_plotter" selected>Paquete: hoja índice + cartas</option>
        <option value="sheets_only">Solo cartas sueltas</option>
      </select>
    </div>
    <div class="form-text">${
      rural
        ? "Las cartas de detalle solo existen para la plantilla urbana."
        : "Use una localidad urbana (p. ej. cabecera). Escala, papel del índice y tipografía: apartado «Cartas de detalle»."
    }</div>
  </div>`;
}

function readPreviewParams() {
  const meta = currentProductMeta();
  const req = meta?.required_params || [];
  const params = {};
  const names = new Set(req);
  if (state.productKey === "condensado_estatal") names.add("cve_ent");
  names.forEach((name) => {
    const el = $(`pv_${name}`);
    if (!el) return;
    let v = el.value.trim();
    if (!v) return;
    if (name === "cve_mun_list") {
      params[name] = v.split(/[,\s;]+/).filter(Boolean);
    } else if (name === "cover") {
      params[name] = v === "1" || v.toLowerCase() === "true";
    } else {
      params[name] = v;
    }
  });
  const mp = $("pv_multipage");
  if (mp && mp.checked && !mp.disabled) {
    params.multipage = true;
    if (($("pv_package")?.value || "index_plotter") === "index_plotter") {
      params.package = "index_plotter";
    }
  }
  return params;
}

const DIFF_KIND = { added: "＋", removed: "－", changed: "✎" };

function diffChangesHtml(changes) {
  return `<ul class="mb-1 ps-3">${changes
    .map(
      (c) => `<li><span class="text-muted">${DIFF_KIND[c.kind] || "•"}</span> <strong>${escapeHtml(
        c.label
      )}</strong>: <span class="text-danger text-decoration-line-through">${escapeHtml(
        c.before
      )}</span> → <span class="text-success">${escapeHtml(c.after)}</span></li>`
    )
    .join("")}</ul>`;
}

function renderDiffHtml(d) {
  const head = `<div class="small text-muted mb-1">${escapeHtml(d.left?.label || "")} → ${escapeHtml(
    d.right?.label || ""
  )}</div>`;
  if (d.missing) {
    return `${head}<p class="small text-muted mb-0">No hay ${escapeHtml(d.missing)} para comparar.</p>`;
  }
  if (d.identical) {
    return `${head}<p class="small text-success mb-0">Sin cambios.</p>`;
  }
  const parts = [head, `<div class="small fw-semibold mb-1">${d.total} cambio(s)</div>`];
  (d.sections || []).forEach((s) => {
    parts.push(`<div class="small fw-semibold">${escapeHtml(s.title)}</div>${diffChangesHtml(s.changes)}`);
  });
  const L = d.layers || {};
  const layerParts = [];
  (L.added || []).forEach((x) =>
    layerParts.push(`<li class="text-success">＋ Capa añadida: <strong>${escapeHtml(x.label)}</strong> <code>${escapeHtml(x.id)}</code> (posición ${x.index})</li>`)
  );
  (L.removed || []).forEach((x) =>
    layerParts.push(`<li class="text-danger">－ Capa quitada: <strong>${escapeHtml(x.label)}</strong> <code>${escapeHtml(x.id)}</code></li>`)
  );
  (L.moved || []).forEach((x) =>
    layerParts.push(`<li>↕ Reordenada: <strong>${escapeHtml(x.label)}</strong> (${x.from} → ${x.to})</li>`)
  );
  (L.changed || []).forEach((x) =>
    layerParts.push(`<li>✎ <strong>${escapeHtml(x.label)}</strong> <code>${escapeHtml(x.id)}</code>${diffChangesHtml(x.changes)}</li>`)
  );
  if (layerParts.length) {
    parts.push(`<div class="small fw-semibold">Capas</div><ul class="small mb-1 ps-3">${layerParts.join("")}</ul>`);
  }
  return `<div class="border rounded p-2 small">${parts.join("")}</div>`;
}

async function onShowDiff() {
  const host = $("cartoProdDiff");
  if (!host || !state.draft) return;
  collectMetaIntoDraft();
  collectLayersFromDom();
  host.innerHTML = `<p class="small text-muted mb-0">Calculando cambios…</p>`;
  try {
    const d = await api.diffProductInline(state.productKey, state.draft, {
      templateId: state.templateId,
      left: $("cartoProdDiffLeft")?.value || "active",
    });
    host.innerHTML = renderDiffHtml(d);
  } catch (e) {
    host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(e.message || String(e))}</p>`;
  }
}

async function onCompareVersion(ver) {
  const host = $("cartoProdVersionDiff");
  if (!host) return;
  host.innerHTML = `<p class="small text-muted mb-0">Calculando cambios…</p>`;
  try {
    const d = await api.diffProduct(state.productKey, {
      templateId: state.templateId,
      left: "active",
      right: `v${ver}`,
    });
    host.innerHTML = `<div class="small mb-1">Si restauras <code>v${ver}</code>, esto cambiaría respecto a lo publicado:</div>${renderDiffHtml(d)}`;
  } catch (e) {
    host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(e.message || String(e))}</p>`;
  }
}

async function renderVersions() {
  const host = $("cartoProdVersions");
  if (!host) return;
  try {
    const versions = await api.listVersions(state.productKey, state.templateId);
    if (!versions.length) {
      host.innerHTML = `<p class="small text-muted mb-0">Sin versiones publicadas aún.</p>`;
      return;
    }
    host.innerHTML = `
      <ul class="list-unstyled small mb-0">
        ${versions
          .map(
            (v) => `<li class="d-flex flex-wrap align-items-center gap-2 py-1 border-bottom">
            <code>v${String(v.version).padStart(4, "0")}</code>
            <span class="text-muted">${escapeHtml(v.status || "")}</span>
            <span class="text-muted">${escapeHtml(v.comment || v.mtime || "")}</span>
            ${v.is_active ? '<span class="badge text-bg-success">active</span>' : ""}
            <button type="button" class="btn btn-outline-info btn-sm py-0 ms-auto carto-version-diff" data-ver="${v.version}" title="Qué cambiaría respecto a lo publicado">Comparar</button>
            <button type="button" class="btn btn-outline-secondary btn-sm py-0 carto-restore-draft" data-ver="${v.version}">→ draft</button>
            <button type="button" class="btn btn-outline-primary btn-sm py-0 carto-restore-pub" data-ver="${v.version}">Publicar</button>
          </li>`
          )
          .join("")}
      </ul>`;
  } catch (e) {
    host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(e.message || e)}</p>`;
  }
}

async function loadSelected() {
  showMsg();
  ["cartoProdDiff", "cartoProdVersionDiff"].forEach((id) => {
    if ($(id)) $(id).innerHTML = "";
  });
  const pack = await api.getDraft(state.productKey, state.templateId);
  state.draft = pack.template;
  markDirty(false);
  renderStatus(pack.meta);
  renderMetaFields();
  renderLayers();
  renderPreviewParams();
  await renderVersions();
  const src = pack.source === "draft" ? "Draft en disco" : "Clon de active (aún no guardado)";
  showMsg("ok", `${src} · ${state.templateId}`);
}

async function onProductChange() {
  const sel = $("cartoProdSelect");
  state.productKey = sel?.value || "";
  const meta = currentProductMeta();
  state.templateId = meta?.primary_template_id || "";
  renderTemplateOptions();
  await loadSelected();
}

async function onTemplateChange() {
  state.templateId = $("cartoProdTemplateSelect")?.value || state.templateId;
  await loadSelected();
}

async function onSaveDraft() {
  collectAll();
  const comment = $("cartoProdComment")?.value?.trim() || "";
  const data = await api.saveDraft(state.productKey, state.draft, {
    templateId: state.templateId,
    comment,
  });
  state.draft = data.template;
  markDirty(false);
  renderStatus(data.meta);
  await renderVersions();
  // refresh product list draft flags
  state.products = await api.listProducts();
  renderProductOptions();
  showMsg("ok", "Draft guardado (active de producción no cambia).");
}

async function onValidate() {
  collectAll();
  const data = await api.validateProduct(
    state.productKey,
    state.draft,
    state.templateId
  );
  if (data.ok) {
    const warns = data.report?.warnings?.length || 0;
    showMsg(
      "ok",
      warns ? `Schema OK (${warns} warnings)` : "Schema OK"
    );
  } else {
    showMsg(
      "error",
      (data.report?.errors || []).join("; ") || "Schema inválido"
    );
  }
}

async function onPreview() {
  collectAll();
  showMsg("ok", "Generando preview…");
  const { blob, filename, report } = await api.previewProduct(state.productKey, {
    template_id: state.templateId,
    template: state.draft,
    params: readPreviewParams(),
    format: "pdf",
  });
  downloadBlob(blob, filename);
  const diag = formatRenderReport(report);
  showMsg("ok", `Preview descargado: ${filename}${diag ? ` — ${diag}` : ""}`);
}

function formatRenderReport(report) {
  if (!report || typeof report !== "object") return "";
  const parts = [];
  const scopeName = { mapa: "mapa", recuadro: "recuadro" };
  for (const run of Array.isArray(report.labels) ? report.labels : []) {
    const counts = run?.counts || {};
    const where = scopeName[run?.scope] || String(run?.scope || "mapa");
    const bits = [];
    if (Array.isArray(counts.calles) && counts.calles[1] > 0) {
      bits.push(`${counts.calles[0]} de ${counts.calles[1]} calles con nombre`);
    }
    if (Array.isArray(counts.sil) && counts.sil[1] > 0) {
      bits.push(`${counts.sil[0]} de ${counts.sil[1]} ríos/carreteras`);
    }
    if (bits.length) parts.push(`${where}: ${bits.join(", ")}`);
  }
  const inset = report.inset;
  if (inset && typeof inset === "object") {
    if (inset.drawn) {
      const scale = Number(inset.scale) > 0 ? ` (1:${Number(inset.scale).toLocaleString("es-MX")})` : "";
      parts.push(`recuadro de ampliación ${Number(inset.magnification).toFixed(2)}×${scale}`);
    } else if (inset.reason === "ampliacion_baja") {
      parts.push(
        `sin recuadro: solo cabía ${Number(inset.possible).toFixed(2)}× (mínimo ${Number(inset.min).toFixed(2)}×)`
      );
    } else {
      parts.push("sin recuadro: no hay hueco libre en el marco");
    }
  }
  return parts.join(" · ");
}

async function onPublish() {
  if (state.dirty) await onSaveDraft();
  else collectAll();
  if (!confirm("¿Publicar draft como active? El Visor usará esta plantilla.")) return;
  const comment = $("cartoProdComment")?.value?.trim() || "";
  // ensure draft on disk
  await api.saveDraft(state.productKey, state.draft, {
    templateId: state.templateId,
    comment,
  });
  const data = await api.publishProduct(state.productKey, {
    templateId: state.templateId,
    comment,
  });
  markDirty(false);
  renderStatus(data.meta);
  state.products = await api.listProducts();
  renderProductOptions();
  await loadSelected();
  showMsg("ok", `Publicado v${data.published_version}.`);
}

async function onDiscard() {
  if (!confirm("¿Descartar draft? Se vuelve al active.")) return;
  await api.discardDraft(state.productKey, state.templateId);
  markDirty(false);
  state.products = await api.listProducts();
  renderProductOptions();
  await loadSelected();
  showMsg("ok", "Draft descartado.");
}

async function onRestoreFactory() {
  const ok = confirm(
    "¿Restaurar el producto CANÓNICO GroSIG (fábrica)?\n\n" +
      "Se carga en draft (no cambia el Visor hasta que publiques).\n" +
      "Plantilla: " +
      state.templateId
  );
  if (!ok) return;
  const data = await api.restoreFactory(state.productKey, {
    templateId: state.templateId,
    asDraft: true,
    comment: $("cartoProdComment")?.value?.trim() || "restore canónico",
  });
  state.draft = data.template;
  markDirty(false);
  renderStatus(data.meta);
  renderMetaFields();
  renderLayers();
  state.products = await api.listProducts();
  renderProductOptions();
  await renderVersions();
  showMsg(
    "ok",
    "Canónico restaurado en draft. Revisa y pulsa Publicar solo si quieres aplicarlo al Visor."
  );
}

async function onRestore(version, asDraft) {
  const data = await api.restoreVersion(state.productKey, version, {
    templateId: state.templateId,
    asDraft,
    comment: asDraft ? `restore draft v${version}` : `restore publish v${version}`,
  });
  state.products = await api.listProducts();
  renderProductOptions();
  await loadSelected();
  showMsg(
    "ok",
    asDraft
      ? `v${version} cargado en draft`
      : `Restaurado y publicado (nueva versión ${data.published_version || ""})`
  );
}

function moveLayer(idx, dir) {
  collectLayersFromDom();
  const layers = state.draft?.layers;
  if (!Array.isArray(layers)) return;
  const j = idx + dir;
  if (j < 0 || j >= layers.length) return;
  const tmp = layers[idx];
  layers[idx] = layers[j];
  layers[j] = tmp;
  markDirty(true);
  renderLayers();
}

function bindEditorEvents() {
  $("cartoProdSelect")?.addEventListener("change", () => {
    void onProductChange().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdTemplateSelect")?.addEventListener("change", () => {
    void onTemplateChange().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdSaveBtn")?.addEventListener("click", () => {
    void onSaveDraft().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdValidateBtn")?.addEventListener("click", () => {
    void onValidate().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdPreviewBtn")?.addEventListener("click", () => {
    void onPreview().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdPublishBtn")?.addEventListener("click", () => {
    void onPublish().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdDiscardBtn")?.addEventListener("click", () => {
    void onDiscard().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdFactoryBtn")?.addEventListener("click", () => {
    void onRestoreFactory().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoProdReloadBtn")?.addEventListener("click", () => {
    void loadSelected().catch((e) => showMsg("error", e.message || String(e)));
  });
  ["change", "input"].forEach((evt) =>
    $("cartoMpCard")?.addEventListener(evt, () => markDirty(true))
  );
  $("cartoProdDiffBtn")?.addEventListener("click", () => void onShowDiff());

  ["cartoProdTitle", "cartoProdFooter", "cartoLayLegend", "cartoLayNorth", "cartoLayScale", "cartoLayBrand", "cartoLayFrame", "cartoLayStrip", "cartoLayStripRatio", "cartoLabEngineV2", "cartoLayInset", "cartoLayBrandH", "cartoLayTitleH", "cartoLayFooterH", "cartoLayPaper", "cartoLayOrient", "cartoLayWidth", "cartoLayHeight", "cartoLayUnit", "cartoStripColLimites", "cartoStripColClaves", "cartoStripColServicios", "cartoStripColIndice", "cartoStripColAdvert", "cartoStripLogoMax", "cartoStripLogoH", "cartoStripGapTabs", "cartoPanelLegendW", "cartoPanelTypeScale", "cartoPanelGapMax", "cartoPanelBlkSym", "cartoPanelBlkClaves", "cartoPanelBlkId", "cartoPanelBlkIdx", "cartoPanelBlkRef", "cartoPanelIdxFrac", "cartoPanelLiftMin", "cartoPanelLiftMult", "cartoPanelWarnPad"].forEach(
    (id) => {
      $(id)?.addEventListener("change", () => {
        if (id === "cartoLayPaper" || id === "cartoLayWidth" || id === "cartoLayHeight" || id === "cartoLayUnit") {
          toggleCustomPaperUi();
        }
        if (id === "cartoLayStripRatio" || id === "cartoLayStrip") updateStripUx();
        if (id === "cartoPanelLegendW") updatePanelPreview(state.draft?.layout || {});
        markDirty(true);
      });
      $(id)?.addEventListener("input", () => {
        if (id === "cartoLayWidth" || id === "cartoLayHeight") toggleCustomPaperUi();
        if (id === "cartoLayStripRatio" || id === "cartoLayStrip") updateStripUx();
        if (id === "cartoPanelLegendW") updatePanelPreview(state.draft?.layout || {});
        markDirty(true);
      });
    }
  );

  $("cartoStripComposeResetBtn")?.addEventListener("click", () => {
    resetStripComposeCanonical();
  });
  $("cartoPanelComposeResetBtn")?.addEventListener("click", () => {
    resetPanelComposeCanonical();
  });
  bindPanelSymbologyUi();
  bindStripSymbologyUi();

  $("cartoProdLayers")?.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const wrap = t.closest(".carto-tb-wrap");
    if (wrap && t.closest(".carto-tb")) {
      const input = wrap.querySelector(".carto-tb-input");
      if (t.classList.contains("carto-tb-lit")) {
        tbAppend(wrap, t.getAttribute("data-lit") || "");
      } else if (t.classList.contains("carto-tb-x")) {
        const tokens = tbTokens(input?.value);
        tokens.splice(Number(t.getAttribute("data-pos")), 1);
        setTemplateValue(wrap, tbJoin(tokens));
      } else if (t.classList.contains("carto-tb-text-add")) {
        const txt = wrap.querySelector(".carto-tb-text");
        if (txt && txt.value) {
          tbAppend(wrap, txt.value.replace(/[{}]/g, ""));
          txt.value = "";
        }
      } else if (t.classList.contains("carto-tb-clear")) {
        setTemplateValue(wrap, "");
      }
      return;
    }
    if (t.classList.contains("carto-layer-up")) {
      moveLayer(Number(t.getAttribute("data-idx")), -1);
    } else if (t.classList.contains("carto-layer-down")) {
      moveLayer(Number(t.getAttribute("data-idx")), 1);
    } else if (t.classList.contains("carto-layer-del")) {
      removeLayer(Number(t.getAttribute("data-idx")));
    } else if (t.classList.contains("carto-rule-add") || t.classList.contains("carto-rule-del")) {
      collectLayersFromDom();
      const layer = state.draft?.layers?.[Number(t.getAttribute("data-idx"))];
      if (!layer) return;
      if (!layer.labels || typeof layer.labels !== "object") layer.labels = {};
      const rules = Array.isArray(layer.labels.rules) ? layer.labels.rules : [];
      if (t.classList.contains("carto-rule-add")) {
        rules.push({ field: "", op: "eq", value: "", template: "" });
        layer.labels.enabled = true;
      } else {
        rules.splice(Number(t.getAttribute("data-ridx")), 1);
      }
      if (rules.length) layer.labels.rules = rules;
      else {
        delete layer.labels.rules;
        delete layer.labels.rules_only;
      }
      markDirty(true);
      renderLayers();
    }
  });
  $("cartoProdLayers")?.addEventListener("change", (ev) => {
    markDirty(true);
    schedulePanelSymCheck(900);
    refreshStripSymFromLayers();
    const t = ev.target;
    if (!(t instanceof HTMLSelectElement)) return;
    if (t.classList.contains("carto-layer-table")) {
      fillLayerColumnSelects(t.closest(".carto-layer-item"), t.value);
    } else if (t.classList.contains("carto-tb-field") && t.value) {
      const wrap = t.closest(".carto-tb-wrap");
      const cur = wrap?.querySelector(".carto-tb-input")?.value || "";
      const sep = cur && !/[\s(]$/.test(cur) && !cur.endsWith("\\n") ? " " : "";
      tbAppend(wrap, `${sep}{${t.value}}`);
      t.value = "";
    }
  });
  $("cartoProdLayers")?.addEventListener("input", (ev) => {
    markDirty(true);
    const t = ev.target;
    if (t instanceof HTMLInputElement && t.classList.contains("carto-tb-input")) {
      renderTemplateBuilder(t.closest(".carto-tb-wrap"));
    }
  });
  $("cartoProdLayers")?.addEventListener("keydown", (ev) => {
    const t = ev.target;
    if (ev.key === "Enter" && t instanceof HTMLInputElement && t.classList.contains("carto-tb-text")) {
      ev.preventDefault();
      t.closest(".carto-tb-wrap")?.querySelector(".carto-tb-text-add")?.click();
    }
  });

  $("cartoProdAddLayerBtn")?.addEventListener("click", () => {
    try {
      addLayerFromSource();
    } catch (e) {
      showMsg("error", e?.message || String(e));
    }
  });
  $("cartoProdAddTable")?.addEventListener("change", () => {
    const opt = $("cartoProdAddTable")?.selectedOptions?.[0];
    if (!opt || !opt.value) return;
    if ($("cartoProdAddLabel") && !$("cartoProdAddLabel").value.trim()) {
      $("cartoProdAddLabel").value = opt.getAttribute("data-label") || "";
    }
    const g = opt.getAttribute("data-geom");
    if (g && $("cartoProdAddGeom") && $("cartoProdAddGeom").value === "auto") {
      /* keep auto; engine/symbol will resolve */
    }
  });

  $("cartoProdVersions")?.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const ver = Number(t.getAttribute("data-ver"));
    if (!ver) return;
    if (t.classList.contains("carto-version-diff")) {
      void onCompareVersion(ver);
    } else if (t.classList.contains("carto-restore-draft")) {
      void onRestore(ver, true).catch((e) => showMsg("error", e.message || String(e)));
    } else if (t.classList.contains("carto-restore-pub")) {
      if (!confirm(`¿Publicar restauración de v${ver}?`)) return;
      void onRestore(ver, false).catch((e) => showMsg("error", e.message || String(e)));
    }
  });
}

function bindTabs() {
  document.querySelectorAll("[data-carto-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-carto-tab");
      document.querySelectorAll("[data-carto-tab]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      $("cartoStudioProductsPanel")?.classList.toggle("d-none", tab !== "products");
      $("cartoStudioCustomPanel")?.classList.toggle("d-none", tab !== "custom");
      $("cartoStudioFuentesPanel")?.classList.toggle("d-none", tab !== "fuentes");
      $("cartoStudioDatosPanel")?.classList.toggle("d-none", tab !== "datos");
      $("cartoStudioBrandingPanel")?.classList.toggle("d-none", tab !== "branding");
      $("cartoStudioSaludPanel")?.classList.toggle("d-none", tab !== "salud");
      if (tab === "salud") {
        import("./cartographySaludPanel.js")
          .then((m) => m.enterSaludPanel())
          .catch((e) => {
            const err = $("cartoSaludError");
            if (err) {
              err.classList.remove("d-none");
              err.textContent = e?.message || String(e);
            }
          });
      }
      if (tab === "custom") {
        import("./cartographyCustomBuilder.js")
          .then((m) => m.enterCustomBuilder())
          .catch((e) => {
            const err = $("cartoCustomError");
            if (err) {
              err.classList.remove("d-none");
              err.textContent = e?.message || String(e);
            }
          });
      }
      if (tab === "fuentes") {
        import("./cartographyFuentesPanel.js")
          .then((m) => m.enterFuentesPanel())
          .catch((e) => {
            const err = $("cartoFuentesError");
            if (err) {
              err.classList.remove("d-none");
              err.textContent = e?.message || String(e);
            }
          });
      }
      if (tab === "datos") {
        import("./cartographyDatosPanel.js")
          .then((m) => m.enterDatosPanel())
          .catch((e) => {
            const err = $("cartoDatosError");
            if (err) {
              err.classList.remove("d-none");
              err.textContent = e?.message || String(e);
            }
          });
      }
    });
  });
}

export function bindProductEditorUi() {
  bindTabs();
  bindEditorEvents();
}

export async function enterProductEditor() {
  try {
    state.products = await api.listProducts();
  } catch (e) {
    state.products = [];
    renderProductOptions();
    renderTemplateOptions();
    showMsg(
      "error",
      (e?.message || String(e)) +
        " — Si el health muestra versión vieja o Fase «—», reinicie: docker restart fastapi_backend"
    );
    return;
  }
  try {
    state.datasources = (await api.listDatasources()).filter(
      (s) => s.enabled !== false
    );
  } catch (_) {
    state.datasources = [];
  }
  fillAddLayerCombo();
  if (!state.products.length) {
    showMsg("error", "No hay productos oficiales en el registry.");
    return;
  }
  state.productKey = state.products[0].product_key;
  state.templateId = state.products[0].primary_template_id;
  renderProductOptions();
  renderTemplateOptions();
  await loadSelected();
}
