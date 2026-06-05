/**
 * Carta de presentación (Inicio): KPIs y escalas de marginación/rezago social.
 * Datos desde FastAPI /api/explorador/municipal; depende de api.js.
 */

import { fetchExploradorMunicipal } from "./api.js";

// --- Escalas visuales (marginación y rezago social) ---

/** Escala de marginación (atlas.tab_municipal.grad_marg), 5 niveles. */
const MARG_SCALE = [
  { label: "Muy bajo", short: "M. bajo", color: "#26a69a" },
  { label: "Bajo", short: "Bajo", color: "#9ccc65" },
  { label: "Medio", short: "Medio", color: "#fdd835" },
  { label: "Alto", short: "Alto", color: "#fb8c00" },
  { label: "Muy alto", short: "M. alto", color: "#e53935" },
];

function padCve3(cve) {
  const s = String(cve != null ? cve : "").replace(/\D/g, "");
  if (!s) return "";
  return ("000" + s).slice(-3);
}

function fmtInt(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));
}

function fmtDec(n, digits) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n));
}

function fmtRank(n) {
  if (n == null || n < 1) return "—";
  return `${n}° lugar estatal`;
}

function rezsocClass(val) {
  const t = String(val || "").toLowerCase().trim();
  if (t === "muy bajo") return "home-stat--rez-muy-bajo";
  if (t === "bajo") return "home-stat--rez-bajo";
  if (t === "medio") return "home-stat--rez-medio";
  if (t === "alto") return "home-stat--rez-alto";
  if (t === "muy alto") return "home-stat--rez-muy-alto";
  return "";
}

/** Índice 0–4 en MARG_SCALE; −1 si no reconocido. */
function margLevelIndex(val) {
  const t = String(val || "").toLowerCase().trim();
  if (!t || t === "—") return -1;
  if (t === "muy alto" || t.startsWith("muy alto")) return 4;
  if (t === "alto") return 3;
  if (t === "medio") return 2;
  if (t === "muy bajo" || t.startsWith("muy bajo")) return 0;
  if (t === "bajo") return 1;
  return -1;
}

function rezagoPeopleSvg() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 16");
  svg.setAttribute("class", "home-rez-scale__ico-svg");
  svg.setAttribute("aria-hidden", "true");
  const g = document.createElementNS(ns, "g");
  g.setAttribute("fill", "currentColor");
  [[7, 5], [15, 5]].forEach(([cx, cy]) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", "2.8");
    g.appendChild(c);
  });
  [[7, 12], [15, 12]].forEach(([cx, cy]) => {
    const e = document.createElementNS(ns, "ellipse");
    e.setAttribute("cx", String(cx));
    e.setAttribute("cy", String(cy));
    e.setAttribute("rx", "4.5");
    e.setAttribute("ry", "3.2");
    g.appendChild(e);
  });
  svg.appendChild(g);
  return svg;
}

function renderMargScale(rootEl, gradMarg) {
  if (!rootEl) return;
  const idx = margLevelIndex(gradMarg);
  const label =
    idx >= 0 ? MARG_SCALE[idx].label : gradMarg && String(gradMarg).trim() ? String(gradMarg).trim() : "—";
  const activeColor = idx >= 0 ? MARG_SCALE[idx].color : null;

  rootEl.innerHTML = "";
  rootEl.className = "home-rez-scale-host";

  const scale = document.createElement("div");
  scale.className = "home-rez-scale";
  scale.setAttribute("role", "img");
  scale.setAttribute(
    "aria-label",
    label !== "—" ? `Grado de marginación: ${label}` : "Grado de marginación sin dato"
  );

  const pill = document.createElement("div");
  pill.className = "home-rez-scale__pill" + (idx >= 0 ? " is-active" : "");
  if (activeColor) pill.style.setProperty("--rez-pill-color", activeColor);
  pill.appendChild(rezagoPeopleSvg());
  const pillTxt = document.createElement("span");
  pillTxt.className = "home-rez-scale__pill-txt";
  pillTxt.textContent = label;
  pill.appendChild(pillTxt);
  scale.appendChild(pill);

  const steps = document.createElement("div");
  steps.className = "home-rez-scale__steps";
  MARG_SCALE.forEach((step, i) => {
    const el = document.createElement("div");
    el.className = "home-rez-scale__step" + (i === idx ? " is-active" : "");
    el.style.setProperty("--rez-step-color", step.color);

    if (i === idx) {
      const pin = document.createElement("span");
      pin.className = "home-rez-scale__pin";
      pin.setAttribute("aria-hidden", "true");
      el.appendChild(pin);
    }

    const chip = document.createElement("span");
    chip.className = "home-rez-scale__chip";
    chip.appendChild(rezagoPeopleSvg());
    el.appendChild(chip);

    const name = document.createElement("span");
    name.className = "home-rez-scale__name";
    name.textContent = step.label;
    name.setAttribute("title", step.label);
    const nameShort = document.createElement("span");
    nameShort.className = "home-rez-scale__name-short";
    nameShort.textContent = step.short;
    nameShort.setAttribute("aria-hidden", "true");
    el.appendChild(name);
    el.appendChild(nameShort);

    steps.appendChild(el);
  });
  scale.appendChild(steps);

  const track = document.createElement("div");
  track.className = "home-rez-scale__track";
  const line = document.createElement("div");
  line.className = "home-rez-scale__line";
  track.appendChild(line);
  const dots = document.createElement("div");
  dots.className = "home-rez-scale__dots";
  MARG_SCALE.forEach((step, i) => {
    const dot = document.createElement("span");
    dot.className = "home-rez-scale__dot" + (i === idx ? " is-active" : "");
    dot.style.setProperty("--rez-dot-color", step.color);
    dots.appendChild(dot);
  });
  track.appendChild(dots);
  scale.appendChild(track);

  const legend = document.createElement("div");
  legend.className = "home-rez-scale__legend";
  legend.innerHTML =
    '<span>Menor marginación</span><span class="home-rez-scale__legend-arrow" aria-hidden="true">⟶</span><span>Mayor marginación</span>';
  scale.appendChild(legend);

  rootEl.appendChild(scale);
}

function renderMiniBars(rootEl, bars) {
  if (!rootEl) return;
  rootEl.innerHTML = "";
  if (!bars || !bars.length) return;

  const max = Math.max(...bars.map((b) => Number(b.value) || 0), 1);
  const selected = bars.find((b) => b.highlight || b.selected);

  const chart = document.createElement("div");
  chart.className = "home-mini-chart";

  const wrap = document.createElement("div");
  wrap.className = "home-mini-bars";
  wrap.setAttribute("role", "img");
  wrap.setAttribute(
    "aria-label",
    selected
      ? `Comparación municipal centrada en ${selected.nom_mun}`
      : "Comparación con municipios vecinos"
  );

  bars.forEach((b) => {
    const isHi = Boolean(b.highlight || b.selected);
    const col = document.createElement("div");
    col.className = "home-mini-bars__col" + (isHi ? " is-highlight" : "");

    const barZone = document.createElement("div");
    barZone.className = "home-mini-bars__bar-zone";
    const valText = fmtInt(b.value);
    barZone.title = (b.nom_mun || "").trim()
      ? `${(b.nom_mun || "").trim()}: ${valText}`
      : valText;

    const tip = document.createElement("span");
    tip.className = "home-mini-bars__tip";
    tip.setAttribute("role", "tooltip");
    tip.textContent = valText;

    const bar = document.createElement("div");
    bar.className = "home-mini-bars__bar";
    bar.style.height = Math.round(((Number(b.value) || 0) / max) * 100) + "%";
    barZone.appendChild(tip);
    barZone.appendChild(bar);

    const lbl = document.createElement("span");
    lbl.className = "home-mini-bars__label";
    lbl.textContent = (b.nom_mun || "").trim();
    lbl.title = b.nom_mun || "";

    col.appendChild(barZone);
    col.appendChild(lbl);
    wrap.appendChild(col);
  });

  chart.appendChild(wrap);
  rootEl.appendChild(chart);
}

function applyContext(ctx) {
  const foot = document.getElementById("homeKpi1Foot");
  if (!foot || !ctx) return;
  const n = ctx.municipio_count != null ? ctx.municipio_count : "—";
  const ent = ctx.nom_ent || "—";
  foot.textContent = `Entre los ${n} municipios del Estado de ${ent}.`;
}

function renderEmptyState() {
  const nameEl = document.getElementById("homeMunNombre");
  const cveEl = document.getElementById("homeMunClave");
  const emptyEl = document.getElementById("homeMunEmpty");
  const detailEl = document.getElementById("homeMunDetail");
  if (nameEl) nameEl.textContent = "Selecciona un municipio";
  if (cveEl) cveEl.textContent = "";
  if (emptyEl) emptyEl.classList.remove("d-none");
  if (detailEl) detailEl.classList.add("d-none");

  const dash = "—";
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("homeStatPoblacion", dash);
  set("homeStatSuperficie", dash);
  set("homeStatDensidad", dash);
  set("homeStatLocalidades", dash);
  set("homeStatRegion", dash);
  const rezEl = document.getElementById("homeStatRezsoc");
  if (rezEl) {
    rezEl.textContent = dash;
    rezEl.className = "home-stat-value";
  }
  set("homeKpi1PobRank", dash);
  set("homeKpi1DenRank", dash);
  set("homeCardPoblacionVal", dash);
  set("homeCardViviendasVal", dash);
  set("homeIndViviendas", dash);
  set("homeIndPobOcupada", dash);
  set("homeIndEscolaridad", dash);
  set("homeIndUnidadesEco", dash);
  set("homeIndPobreza", dash);
  renderMiniBars(document.getElementById("homeChartPoblacion"), []);
  renderMiniBars(document.getElementById("homeChartViviendas"), []);
  const margScale = document.getElementById("homeMargScale");
  if (margScale) renderMargScale(margScale, "");
}

function renderFromPayload(data, municipio) {
  const sel = data && data.selected;
  const hasMun = Boolean(sel && sel.cve_mun);
  const nom = hasMun ? sel.nom_mun || municipio?.nomgeo || "Municipio" : "Selecciona un municipio";
  const cve = hasMun ? padCve3(sel.cve_mun) : "—";

  const nameEl = document.getElementById("homeMunNombre");
  const cveEl = document.getElementById("homeMunClave");
  const emptyEl = document.getElementById("homeMunEmpty");
  const detailEl = document.getElementById("homeMunDetail");
  if (nameEl) nameEl.textContent = nom;
  if (cveEl) cveEl.textContent = hasMun ? `Clave INEGI: ${cve}` : "";
  if (emptyEl) emptyEl.classList.toggle("d-none", hasMun);
  if (detailEl) detailEl.classList.toggle("d-none", !hasMun);

  if (!hasMun) {
    renderEmptyState();
    return;
  }

  const p = sel.panel || {};
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  set("homeStatPoblacion", fmtInt(p.pop_tot));
  set("homeStatSuperficie", fmtDec(p.sup_km2, 2));
  set("homeStatDensidad", fmtDec(p.densidad, 2));
  set("homeStatLocalidades", fmtInt(p.localidades));
  set("homeStatRegion", (p.region && String(p.region).trim()) ? String(p.region).trim() : "—");
  const rezEl = document.getElementById("homeStatRezsoc");
  if (rezEl) {
    const gr = p.grad_rezsoc || "—";
    rezEl.textContent = gr;
    rezEl.className = "home-stat-value " + rezsocClass(gr);
  }

  const k1 = sel.kpi1 || {};
  set("homeKpi1PobRank", fmtRank(k1.poblacion_rank));
  set("homeKpi1DenRank", fmtRank(k1.densidad_rank));

  const k2 = sel.kpi2 || {};
  set("homeCardPoblacionVal", fmtInt(k2.value));
  renderMiniBars(document.getElementById("homeChartPoblacion"), k2.bars || []);

  const k3 = sel.kpi3 || {};
  set("homeCardViviendasVal", fmtInt(k3.value));
  renderMiniBars(document.getElementById("homeChartViviendas"), k3.bars || []);

  const k4 = sel.kpi4 || {};
  const grMarg = k4.grad_marg || "—";
  const margScale = document.getElementById("homeMargScale");
  if (margScale) renderMargScale(margScale, grMarg);

  const k5 = sel.kpi5 || {};
  set("homeIndViviendas", fmtInt(k5.tvivpar));
  set("homeIndPobOcupada", fmtInt(k5.ocupada));
  set("homeIndEscolaridad", fmtDec(k5.graproes, 1));
  set("homeIndUnidadesEco", fmtInt(k5.unidades_economicas));
  set("homeIndPobreza", fmtInt(k5.pob_pobre));
}

let lastContext = null;
let _homePanelGen = 0;
let _homePanelAbort = null;

const HOME_LOADING = "…";

/** Muestra nombre/clave al instante; KPIs en placeholder hasta que llegue la API. */
export function showHomeMunicipioPreview(municipio) {
  if (!municipio?.cve_mun) {
    renderEmptyState();
    return;
  }
  const cve = padCve3(municipio.cve_mun);
  const nom = (municipio.nomgeo || municipio.nom_mun || "Municipio").trim();

  const nameEl = document.getElementById("homeMunNombre");
  const cveEl = document.getElementById("homeMunClave");
  const emptyEl = document.getElementById("homeMunEmpty");
  const detailEl = document.getElementById("homeMunDetail");
  if (nameEl) nameEl.textContent = nom;
  if (cveEl) cveEl.textContent = `Clave INEGI: ${cve}`;
  if (emptyEl) emptyEl.classList.add("d-none");
  if (detailEl) detailEl.classList.remove("d-none");

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("homeStatPoblacion", HOME_LOADING);
  set("homeStatSuperficie", HOME_LOADING);
  set("homeStatDensidad", HOME_LOADING);
  set("homeStatLocalidades", HOME_LOADING);
  set("homeStatRegion", HOME_LOADING);
  const rezEl = document.getElementById("homeStatRezsoc");
  if (rezEl) {
    rezEl.textContent = HOME_LOADING;
    rezEl.className = "home-stat-value";
  }
  set("homeKpi1PobRank", HOME_LOADING);
  set("homeKpi1DenRank", HOME_LOADING);
  set("homeCardPoblacionVal", HOME_LOADING);
  set("homeCardViviendasVal", HOME_LOADING);
  set("homeIndViviendas", HOME_LOADING);
  set("homeIndPobOcupada", HOME_LOADING);
  set("homeIndEscolaridad", HOME_LOADING);
  set("homeIndUnidadesEco", HOME_LOADING);
  set("homeIndPobreza", HOME_LOADING);
  renderMiniBars(document.getElementById("homeChartPoblacion"), []);
  renderMiniBars(document.getElementById("homeChartViviendas"), []);
  const margScale = document.getElementById("homeMargScale");
  if (margScale) renderMargScale(margScale, "");
}

/**
 * @param {{ cve_mun?: string, nomgeo?: string } | null} municipio
 * @param {{ optimistic?: boolean }} [opts]
 */
export async function loadAndRenderHomePanels(municipio, opts = {}) {
  const gen = ++_homePanelGen;
  if (_homePanelAbort) _homePanelAbort.abort();
  _homePanelAbort = new AbortController();
  const { signal } = _homePanelAbort;

  if (opts.optimistic && municipio?.cve_mun) {
    showHomeMunicipioPreview(municipio);
  } else if (!municipio?.cve_mun) {
    renderEmptyState();
  }

  const cve = municipio && municipio.cve_mun ? padCve3(municipio.cve_mun) : "";
  try {
    const data = await fetchExploradorMunicipal(cve || undefined, { signal });
    if (gen !== _homePanelGen) return;
    if (data && data.context) {
      lastContext = data.context;
      applyContext(data.context);
    }
    renderFromPayload(data, municipio);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.warn("[home] explorador_municipal:", err);
    if (gen !== _homePanelGen) return;
    if (lastContext) applyContext(lastContext);
    if (opts.optimistic && municipio?.cve_mun) {
      showHomeMunicipioPreview(municipio);
    } else {
      renderEmptyState();
    }
  }
}

/** @param {{ cve_mun?: string, nomgeo?: string } | null} municipio */
export function renderHomePanels(municipio) {
  void loadAndRenderHomePanels(municipio);
}

export async function loadHomeContext() {
  try {
    const data = await fetchExploradorMunicipal();
    if (data && data.context) {
      lastContext = data.context;
      applyContext(data.context);
    }
  } catch (err) {
    console.warn("[home] context:", err);
  }
}

export function renderHomePanelsEmpty() {
  renderEmptyState();
  if (lastContext) applyContext(lastContext);
}
