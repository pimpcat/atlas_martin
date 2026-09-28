/**
 * Analítica — Comparador municipal (N municipios, máx. 5; ref = primero).
 */
import { apiUrl } from "./atlasConfig.js";
import { fetchExploradorMunicipal } from "./api.js";
import {
  fetchEntidadesAmigo,
  fetchMunicipiosAmigo,
  getActiveCveEnt,
  getDefaultEnt,
  isNationalMode,
} from "./amigoDeployment.js";
import {
  getCompareEnabledIds,
  isCompareEnabled,
  loadCompareEnabledIds,
} from "./compareIndicators.js";
import { getIndicatorById, loadIndicatorsCatalog } from "./indicatorCatalog.js";

const MAX_MUN = 5;
const SLOT_BAR = ["a", "b", "c", "d", "e"];
/** A partir de esta cantidad de series, resumen A vs B usa layout compacto. */
const DENSE_BAR_THRESHOLD = 6;
const CHART_COLORS = [
  "rgba(59, 130, 246, 0.85)",
  "rgba(139, 92, 246, 0.85)",
  "rgba(16, 185, 129, 0.85)",
  "rgba(245, 158, 11, 0.85)",
  "rgba(236, 72, 153, 0.85)",
];

/** Cómo interpretar el bloque inferior de variación/diferencia. */
const VARIATION_FALLBACK = {
  socio_poblacion: {
    kind: "temporal",
    fromMetric: "pob_tot_2010",
    toMetric: "pob_tot",
  },
  socio_crecimiento: { kind: "cross", metricKey: "dist_porc" },
  socio_edad_mediana: { kind: "cross", metricKey: "edad_mediana" },
  eco_unidades_economicas: { kind: "cross", metricKey: "ue_den" },
  gov_habitantes_por_policia: { kind: "cross", metricKey: "habxpol" },
  socio_nacimientos: { kind: "cross", metricKey: "por_naci_2024_redo" },
  socio_defunciones: { kind: "cross", metricKey: "por_def_2024_redo" },
  socio_escolaridad: { kind: "cross", metricKey: "graproes" },
  socio_analfabetismo: { kind: "cross", metricKey: "tasa_an_red" },
  eco_poblacion_ocupada: { kind: "cross", metricKey: "ocupada" },
  viv_participacion_vivh: { kind: "cross", metricKey: "part_por_vivh" },
  eco_caracteristicas_economicas: { kind: "cross", metricKey: "prod_brut" },
  eco_superficie_agricultura: { kind: "cross", metricKey: "sup_sembrieg" },
  gov_inversion_publica: { kind: "cross", metricKey: "total_inv" },
  gov_instituciones_admin_publica: { kind: "cross", metricKey: "total_inst" },
  viv_servicios_vivh: { kind: "cross", metricKey: "por_redo_ener" },
  socio_unidades_medicas: { kind: "cross", metricKey: "total" },
};

let _lastPayload = null;
/** Métrica elegida en diferencia A vs B (multi-serie); null = default API/primera. */
let _crossMetricKey = null;
let _fichaLoadSeq = 0;

/** Filas comparables de la ficha Explorador (Inicio). */
const FICHA_METRICS = [
  { section: "Territorio", label: "Población total", kind: "int", get: (s) => s?.panel?.pop_tot },
  { section: "Territorio", label: "Superficie (km²)", kind: "dec2", get: (s) => s?.panel?.sup_km2 },
  { section: "Territorio", label: "Densidad (hab/km²)", kind: "dec2", get: (s) => s?.panel?.densidad },
  { section: "Territorio", label: "Localidades", kind: "int", get: (s) => s?.panel?.localidades },
  { section: "Territorio", label: "Región", kind: "text", get: (s) => s?.panel?.region },
  { section: "Territorio", label: "Grado de rezago social", kind: "text", get: (s) => s?.panel?.grad_rezsoc },
  { section: "Posición estatal", label: "Lugar por población", kind: "rank", get: (s) => s?.kpi1?.poblacion_rank },
  { section: "Posición estatal", label: "Lugar por densidad", kind: "rank", get: (s) => s?.kpi1?.densidad_rank },
  { section: "Indicadores transversales", label: "Total viviendas particulares", kind: "int", get: (s) => s?.kpi5?.tvivpar },
  { section: "Indicadores transversales", label: "Población ocupada", kind: "int", get: (s) => s?.kpi5?.ocupada },
  { section: "Indicadores transversales", label: "Grado promedio de escolaridad", kind: "dec1", get: (s) => s?.kpi5?.graproes },
  { section: "Indicadores transversales", label: "Unidades económicas (DENUE)", kind: "int", get: (s) => s?.kpi5?.unidades_economicas },
  { section: "Indicadores transversales", label: "Población en situación de pobreza", kind: "int", get: (s) => s?.kpi5?.pob_pobre },
  { section: "Indicadores transversales", label: "Grado de marginación", kind: "text", get: (s) => s?.kpi4?.grad_marg },
];
let _chart = null;
/** @type {{ ent: string, mun: string, nom: string }[]} */
let _munSlots = [{ ent: "", mun: "", nom: "" }, { ent: "", mun: "", nom: "" }];
let _state = {
  indicatorId: "socio_poblacion",
  tab: "resumen",
};

function pad2(cve) {
  const d = String(cve ?? "").replace(/\D/g, "");
  return d.length >= 2 ? d.slice(-2) : ("00" + d).slice(-2);
}
function pad3(cve) {
  const d = String(cve ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length >= 3 ? d.slice(-3) : ("000" + d).slice(-3);
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function fmtNum(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}
function fmtPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return sign + n.toLocaleString("es-MX", { maximumFractionDigits: 2 }) + "%";
}

function unitHint(payload) {
  const u = (payload?.unit || "").trim();
  if (!u) return "";
  if (/persona/i.test(u)) return "habitantes";
  return u;
}

async function loadEntOptions(sel) {
  if (!sel) return;
  let rows = [];
  try {
    rows = (await fetchEntidadesAmigo()) || [];
  } catch {
    rows = [{ cve_ent: getDefaultEnt(), nomgeo: "Entidad" }];
  }
  const cur = sel.value || pad2(getActiveCveEnt());
  sel.innerHTML = rows
    .map((r) => {
      const e = pad2(r.cve_ent || r.cve || "");
      const n = r.nomgeo || r.nombre || e;
      return `<option value="${e}"${e === cur ? " selected" : ""}>${escapeHtml(n)}</option>`;
    })
    .join("");
  if (!sel.value && rows[0]) sel.value = pad2(rows[0].cve_ent || getDefaultEnt());
}

async function loadMunOptions(sel, cve_ent, preferredMun) {
  if (!sel) return;
  const ent = pad2(cve_ent || getActiveCveEnt());
  let rows = [];
  try {
    rows = (await fetchMunicipiosAmigo(ent)) || [];
  } catch {
    rows = [];
  }
  const pref = preferredMun ? pad3(preferredMun) : "";
  sel.innerHTML =
    `<option value="">— Municipio —</option>` +
    rows
      .map((r) => {
        const m = pad3(r.cve_mun || r.cve || "");
        const n = r.nomgeo || r.nom_mun || m;
        return `<option value="${m}"${m === pref ? " selected" : ""}>${escapeHtml(n)}</option>`;
      })
      .join("");
}

function fillIndicatorSelect(sel) {
  if (!sel) return;
  const ids = getCompareEnabledIds();
  const opts = ids.map((id) => {
    const ind = getIndicatorById(id);
    const label = ind?.label || id;
    return `<option value="${id}"${id === _state.indicatorId ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  sel.innerHTML = opts;
}

function shellHtml() {
  const showEnt = isNationalMode();
  return `
  <div class="analitica-compare">
    <div class="analitica-controls">
      <div class="analitica-mun-panel">
        <div class="analitica-mun-head">
          <div class="analitica-mun-head-title">Municipios <span class="text-muted fw-normal">(máx. ${MAX_MUN})</span></div>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="acBtnAddMun">+ Municipio</button>
        </div>
        <div id="acMunList" class="analitica-mun-list" aria-live="polite"></div>
        <p class="analitica-mun-hint small text-muted mb-0">El primero es referencia; Δ absoluta respecto a él.</p>
      </div>
      <div class="analitica-side analitica-side--ind">
        <div class="analitica-side-label">Indicador</div>
        <label class="form-label small mb-0" for="acIndicator">Indicador</label>
        <select id="acIndicator" class="form-select form-select-sm"></select>
        <button type="button" class="btn btn-sm btn-success mt-2" id="acBtnCompare">Comparar</button>
      </div>
    </div>

    <div class="analitica-toolbar">
      <div class="analitica-tabs" role="tablist">
        <button type="button" class="analitica-tab is-active" data-tab="resumen" role="tab">Resumen</button>
        <button type="button" class="analitica-tab" data-tab="tabla" role="tab">Tabla de datos</button>
        <button type="button" class="analitica-tab" data-tab="grafica" role="tab">Gráfica</button>
        <button type="button" class="analitica-tab" data-tab="variacion" role="tab">Variación</button>
        <button type="button" class="analitica-tab" data-tab="ficha" role="tab">Ficha vs ficha</button>
      </div>
      <div class="analitica-exports">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="acExportPng" disabled>PNG</button>
        <button type="button" class="btn btn-sm btn-outline-success" id="acExportCsv" disabled>CSV</button>
        <button type="button" class="btn btn-sm btn-outline-success" id="acExportXlsx" disabled>Excel</button>
      </div>
    </div>

    <div id="acError" class="small text-danger d-none mb-2"></div>
    <div id="acPanel" class="analitica-panel"></div>
  </div>`;
}

function showErr(msg) {
  const el = document.getElementById("acError");
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

let _munRenderSeq = 0;
let _addMunLock = false;

async function renderMunSlotList() {
  const list = document.getElementById("acMunList");
  const addBtn = document.getElementById("acBtnAddMun");
  if (!list) return;
  const seq = ++_munRenderSeq;
  const snapshot = _munSlots.slice();
  const showEnt = isNationalMode();
  list.innerHTML = snapshot
    .map((slot, idx) => {
      const isRef = idx === 0;
      const label = isRef ? "Referencia" : `Municipio ${idx + 1}`;
      return `<div class="analitica-mun-row" data-idx="${idx}">
        <div class="analitica-mun-row-label">${escapeHtml(label)}${
          isRef ? ' <span class="ac-ref-tag">(Δ vs ref)</span>' : ""
        }</div>
        <div class="analitica-mun-row-fields">
          ${
            showEnt
              ? `<select class="form-select form-select-sm ac-mun-ent" data-idx="${idx}" aria-label="Entidad ${idx + 1}"></select>`
              : ""
          }
          <select class="form-select form-select-sm ac-mun-select" data-idx="${idx}" aria-label="Municipio ${idx + 1}"></select>
          ${
            isRef
              ? ""
              : `<button type="button" class="btn btn-sm btn-outline-secondary ac-mun-remove" data-idx="${idx}" aria-label="Quitar municipio">×</button>`
          }
        </div>
      </div>`;
    })
    .join("");

  for (let idx = 0; idx < snapshot.length; idx++) {
    if (seq !== _munRenderSeq) return;
    const slot = snapshot[idx];
    const entSel = list.querySelector(`.ac-mun-ent[data-idx="${idx}"]`);
    const munSel = list.querySelector(`.ac-mun-select[data-idx="${idx}"]`);
    if (entSel) {
      await loadEntOptions(entSel);
      if (seq !== _munRenderSeq) return;
      entSel.value = pad2(slot.ent || getActiveCveEnt());
    }
    const ent = pad2(entSel?.value || slot.ent || getActiveCveEnt());
    await loadMunOptions(munSel, ent, slot.mun);
  }
  if (seq !== _munRenderSeq) return;
  if (addBtn) addBtn.disabled = _munSlots.length >= MAX_MUN;
}

function readControls() {
  const list = document.getElementById("acMunList");
  const slots = [];
  list?.querySelectorAll(".analitica-mun-row").forEach((row, idx) => {
    const entSel = row.querySelector(".ac-mun-ent");
    const munSel = row.querySelector(".ac-mun-select");
    const prev = _munSlots[idx] || { ent: "", mun: "", nom: "" };
    const ent = pad2(entSel?.value || prev.ent || getActiveCveEnt());
    const rawMun = String(munSel?.value || "").trim();
    const mun = rawMun ? pad3(rawMun) : pad3(prev.mun);
    const nom = rawMun
      ? munSel?.selectedOptions?.[0]?.textContent?.trim() || mun
      : prev.nom || mun;
    slots.push({ ent, mun, nom });
  });
  if (slots.length >= 2) _munSlots = slots;
  _state.indicatorId = document.getElementById("acIndicator")?.value || "socio_poblacion";
}

function filledTerritorySlots() {
  return _munSlots.filter((s) => s.mun);
}

function addMunSlot() {
  if (_addMunLock) return;
  _addMunLock = true;
  readControls();
  if (_munSlots.length < MAX_MUN) {
    _munSlots.push({ ent: pad2(getActiveCveEnt()), mun: "", nom: "" });
    void renderMunSlotList();
  }
  queueMicrotask(() => {
    _addMunLock = false;
  });
}

function removeMunSlot(idx) {
  if (idx <= 0 || idx >= _munSlots.length) return;
  readControls();
  _munSlots.splice(idx, 1);
  void renderMunSlotList();
}

function firstEmptyMunSelect() {
  const list = document.getElementById("acMunList");
  if (!list) return null;
  for (const sel of list.querySelectorAll(".ac-mun-select")) {
    if (!sel.value) return sel;
  }
  return null;
}

async function runCompare() {
  showErr("");
  readControls();
  const picked = filledTerritorySlots();
  if (picked.length < 2) {
    showErr("Seleccione al menos dos municipios distintos.");
    return;
  }
  const keys = new Set(picked.map((s) => `${s.ent}:${s.mun}`));
  if (keys.size !== picked.length) {
    showErr("Hay municipios repetidos; elija territorios distintos.");
    return;
  }
  const panel = document.getElementById("acPanel");
  if (panel) panel.innerHTML = '<div class="small text-muted p-3">Comparando…</div>';
  try {
    const url = new URL(
      apiUrl(`/api/indicators/${encodeURIComponent(_state.indicatorId)}/compare`),
      window.location.href
    );
    for (const s of picked) {
      url.searchParams.append("t", `${s.ent}:${s.mun}`);
    }
    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      const d = json?.detail;
      throw new Error((d && (d.message || d.error)) || json?.message || `HTTP ${res.status}`);
    }
    _lastPayload = json;
    _crossMetricKey = null;
    document.getElementById("acExportCsv")?.removeAttribute("disabled");
    document.getElementById("acExportXlsx")?.removeAttribute("disabled");
    document.getElementById("acExportPng")?.removeAttribute("disabled");
    renderActiveTab();
  } catch (e) {
    _lastPayload = null;
    if (panel) panel.innerHTML = "";
    showErr(e?.message || String(e));
  }
}

function seriesByKey(payload, metricKey) {
  return (payload.series || []).find((s) => (s.metric_key || s.key) === metricKey);
}

function buildTemporalVariation(payload, cfg) {
  const fromS = seriesByKey(payload, cfg.fromMetric);
  const toS = seriesByKey(payload, cfg.toMetric);
  if (!fromS || !toS) return null;
  const rows = [];
  for (let i = 0; i < (payload.territories || []).length; i++) {
    const v0 = Number((fromS.values || [])[i]?.value);
    const v1 = Number((toS.values || [])[i]?.value);
    const abs = Number.isFinite(v0) && Number.isFinite(v1) ? v1 - v0 : null;
    const pct =
      Number.isFinite(v0) && v0 !== 0 && Number.isFinite(v1) ? ((v1 - v0) / v0) * 100 : null;
    rows.push({
      nom: payload.territories[i]?.nom_mun || "",
      abs,
      pct,
    });
  }
  return {
    kind: "temporal",
    fromLabel: fromS.label || cfg.fromMetric,
    toLabel: toS.label || cfg.toMetric,
    metricLabel: toS.label || "",
    rows,
  };
}

function listCrossMetricOptions(payload) {
  if ((payload.territories || []).length !== 2) return [];
  return (payload.series || [])
    .map((s) => ({
      key: String(s.metric_key || s.key || "").trim(),
      label: String(s.label || s.metric_key || s.key || "").trim(),
    }))
    .filter((o) => o.key);
}

function resolveCrossMetricKey(payload, hintKey) {
  const options = listCrossMetricOptions(payload);
  if (!options.length) return hintKey || null;
  const apiKey =
    payload.variation?.kind === "cross_municipal" ? payload.variation.metric_key : null;
  const preferred = _crossMetricKey || hintKey || apiKey || options[0].key;
  if (options.some((o) => o.key === preferred)) return preferred;
  return options[0].key;
}

function buildCrossMunicipalVariation(payload, metricKey) {
  const series = seriesByKey(payload, metricKey);
  const terrs = payload.territories || [];
  if (!series || terrs.length !== 2) return null;
  const va = Number((series.values || [])[0]?.value);
  const vb = Number((series.values || [])[1]?.value);
  if (!Number.isFinite(va) || !Number.isFinite(vb)) return null;
  const rows = [
    {
      nom: terrs[0]?.nom_mun || "A",
      abs: va - vb,
      pct: vb !== 0 ? ((va - vb) / vb) * 100 : null,
      refName: terrs[1]?.nom_mun || "B",
    },
    {
      nom: terrs[1]?.nom_mun || "B",
      abs: vb - va,
      pct: va !== 0 ? ((vb - va) / va) * 100 : null,
      refName: terrs[0]?.nom_mun || "A",
    },
  ];
  return {
    kind: "cross",
    metricLabel: series.label || metricKey,
    rows,
  };
}

function buildVariationInfo(payload) {
  const apiVar = payload.variation || {};
  let cfg = null;
  if (apiVar.kind === "temporal" && apiVar.from_metric && apiVar.to_metric) {
    cfg = { kind: "temporal", fromMetric: apiVar.from_metric, toMetric: apiVar.to_metric };
  } else if (apiVar.kind === "cross_municipal" && apiVar.metric_key) {
    cfg = { kind: "cross", metricKey: apiVar.metric_key };
  } else {
    cfg = VARIATION_FALLBACK[payload.indicator_id] || null;
  }
  if (!cfg) return null;
  if (cfg.kind === "temporal") return buildTemporalVariation(payload, cfg);
  if (cfg.kind === "cross" && (payload.territories || []).length === 2) {
    const options = listCrossMetricOptions(payload);
    const metricKey = resolveCrossMetricKey(payload, cfg.metricKey);
    const info = buildCrossMunicipalVariation(payload, metricKey);
    if (!info) return null;
    if (options.length > 1) {
      info.metricOptions = options;
      info.selectedMetricKey = metricKey;
    }
    return info;
  }
  return null;
}

function refreshVariationCards(panel) {
  if (!panel || !_lastPayload) return;
  const unit = unitHint(_lastPayload);
  const varInfo = buildVariationInfo(_lastPayload);
  if (!varInfo) return;
  panel.querySelectorAll(".ac-var-card:not(.ac-chart-card)").forEach((card) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = renderVariationCard(varInfo, unit);
    const next = wrap.firstElementChild;
    if (next) card.replaceWith(next);
  });
}

function renderVariationCard(varInfo, unit) {
  const n = (varInfo.rows || []).length;
  const compact = n >= 5;
  const cols = (varInfo.rows || [])
    .map((r, i) => {
      const up = r.pct != null && r.pct > 0;
      const flat = r.pct != null && r.pct === 0;
      const cls = flat ? "is-flat" : up ? "is-up" : "is-down";
      const arrow = flat ? "→" : up ? "↑" : "↓";
      const absStr =
        r.abs != null
          ? `${r.abs >= 0 ? "+" : ""}${fmtNum(r.abs)}${unit ? ` ${escapeHtml(unit)}` : ""}`
          : "—";
      const sideCls =
        n > 2
          ? ` ac-var-col--${SLOT_BAR[i] || "a"}`
          : i === 0
            ? " ac-var-col--a"
            : " ac-var-col--b";
      return `<div class="ac-var-col${sideCls} ${cls}">
        <div class="ac-var-name">${escapeHtml(r.nom)}</div>
        <div class="ac-var-pct"><span class="ac-var-arrow" aria-hidden="true">${arrow}</span> ${fmtPct(r.pct)}</div>
        <div class="ac-var-abs">${absStr}</div>
      </div>`;
    })
    .join("");
  const colsCls = compact
    ? ` ac-var-cols--multi ac-var-cols--n${n}`
    : n === 3
      ? " ac-var-cols--n3"
      : "";
  const note =
    varInfo.kind === "temporal"
      ? `Variación porcentual calculada respecto a ${escapeHtml(varInfo.fromLabel)} (ayuda visual; no es indicador almacenado).`
      : `Diferencia respecto al otro municipio en «${escapeHtml(varInfo.metricLabel || "indicador")}» (ayuda visual; no es indicador almacenado).`;

  const metricOptions = varInfo.metricOptions || [];
  const showMetricSelect = varInfo.kind === "cross" && metricOptions.length > 1;
  const metricSelectHtml = showMetricSelect
    ? `<label class="ac-var-metric-label">
        <span class="ac-var-metric-label-text">Métrica</span>
        <select class="form-select form-select-sm ac-var-metric-select" aria-label="Métrica para diferencia A vs B">
          ${metricOptions
            .map(
              (o) =>
                `<option value="${escapeHtml(o.key)}"${
                  o.key === varInfo.selectedMetricKey ? " selected" : ""
                }>${escapeHtml(o.label)}</option>`
            )
            .join("")}
        </select>
      </label>`
    : "";

  const titleHtml =
    varInfo.kind === "temporal"
      ? `<div class="ac-var-title">Variación ${escapeHtml(varInfo.fromLabel)} – ${escapeHtml(varInfo.toLabel)}</div>`
      : showMetricSelect
        ? `<div class="ac-var-title ac-var-title--cross"><span>Diferencia A vs B</span>${metricSelectHtml}</div>`
        : `<div class="ac-var-title">Diferencia A vs B · ${escapeHtml(varInfo.metricLabel || "")}</div>`;

  return `<div class="ac-var-card">
    ${titleHtml}
    <div class="ac-var-cols${colsCls}">${cols}</div>
    <p class="ac-var-note">${note}</p>
  </div>`;
}

function isDenseResumen(seriesCount) {
  return Number(seriesCount) >= DENSE_BAR_THRESHOLD;
}

function resumenDensityClass(seriesCount) {
  return isDenseResumen(seriesCount) ? " ac-resumen--dense" : "";
}

function wrapResumenBars(seriesCount, innerHtml) {
  if (!isDenseResumen(seriesCount)) return innerHtml;
  return `<div class="ac-resumen-bars">${innerHtml}</div>`;
}

function renderResumenPair(payload) {
  const terrs = payload.territories || [];
  const a = terrs[0] || {};
  const b = terrs[1] || {};
  const unit = unitHint(payload);
  const series = payload.series || [];
  const maxAbs = Math.max(
    0,
    ...series.flatMap((s) => (s.values || []).map((v) => Math.abs(Number(v.value) || 0)))
  );

  const rowsHtml = series
    .map((s) => {
      const va = Number((s.values || [])[0]?.value);
      const vb = Number((s.values || [])[1]?.value);
      const pa = maxAbs > 0 && Number.isFinite(va) ? (Math.abs(va) / maxAbs) * 100 : 0;
      const pb = maxAbs > 0 && Number.isFinite(vb) ? (Math.abs(vb) / maxAbs) * 100 : 0;
      return `<div class="ac-resumen-row">
        <div class="ac-resumen-col ac-resumen-col--a">
          <div class="ac-resumen-val">${fmtNum(va)}${unit ? ` <span class="ac-resumen-unit">${escapeHtml(unit)}</span>` : ""}</div>
          <div class="ac-bar-track"><div class="ac-bar ac-bar--a" style="width:${pa}%"></div></div>
        </div>
        <div class="ac-resumen-year">${escapeHtml(s.label)}</div>
        <div class="ac-resumen-col ac-resumen-col--b">
          <div class="ac-resumen-val">${fmtNum(vb)}${unit ? ` <span class="ac-resumen-unit">${escapeHtml(unit)}</span>` : ""}</div>
          <div class="ac-bar-track"><div class="ac-bar ac-bar--b" style="width:${pb}%"></div></div>
        </div>
      </div>`;
    })
    .join("");

  const varInfo = buildVariationInfo(payload);
  let varHtml = "";
  if (varInfo) {
    varHtml = `<div class="ac-var-grid">
      ${renderVariationCard(varInfo, unit)}
      <div class="ac-var-card ac-chart-card">
        <div class="ac-var-title">Comparativo gráfico</div>
        <div class="ac-chart-box ac-chart-box--mini">
          <canvas id="acChartMini" aria-label="Comparativo gráfico"></canvas>
        </div>
      </div>
    </div>`;
  }

  return `<div class="ac-resumen${resumenDensityClass(series.length)}" id="acCaptureRoot">
    <div class="ac-resumen-head">
      <div class="ac-resumen-title">${escapeHtml(payload.label || "")}</div>
      <div class="ac-resumen-sub">${escapeHtml(payload.subtitle || "")}</div>
    </div>
    <div class="ac-resumen-names">
      <div class="ac-name ac-name--a">${escapeHtml(a.nom_mun || "A")}</div>
      <div class="ac-name ac-name--mid">Métrica</div>
      <div class="ac-name ac-name--b">${escapeHtml(b.nom_mun || "B")}</div>
    </div>
    ${wrapResumenBars(series.length, rowsHtml)}
    ${varHtml}
    <p class="ac-footer">${escapeHtml(payload.footer || "")}</p>
  </div>`;
}

function renderResumenMulti(payload) {
  const terrs = payload.territories || [];
  const n = terrs.length;
  const unit = unitHint(payload);
  const series = payload.series || [];
  const maxAbs = Math.max(
    0,
    ...series.flatMap((s) => (s.values || []).map((v) => Math.abs(Number(v.value) || 0)))
  );

  const namesHtml = terrs
    .map(
      (t, i) =>
        `<div class="ac-name ac-name--${SLOT_BAR[i] || "a"}">${escapeHtml(t.nom_mun || `Mun ${i + 1}`)}</div>`
    )
    .join("");

  const namesRowHtml = `<div class="ac-resumen-names ac-resumen-names--multi ac-resumen-row--multi">
    <div class="ac-resumen-metric-label ac-resumen-metric-label--spacer" aria-hidden="true"></div>
    <div class="ac-resumen-multi-cols ac-resumen-multi-cols--${n}">${namesHtml}</div>
  </div>`;

  const rowsHtml = series
    .map((s) => {
      const cols = (s.values || [])
        .map((v, i) => {
          const vn = Number(v.value);
          const pct = maxAbs > 0 && Number.isFinite(vn) ? (Math.abs(vn) / maxAbs) * 100 : 0;
          const diff =
            i === 0
              ? ""
              : `<div class="ac-resumen-diff small">Δ ${fmtNum((s.diff_abs_vs_ref || [])[i])}</div>`;
          return `<div class="ac-resumen-col ac-resumen-col--${SLOT_BAR[i] || "a"}">
            <div class="ac-resumen-val">${fmtNum(vn)}${unit ? ` <span class="ac-resumen-unit">${escapeHtml(unit)}</span>` : ""}</div>
            <div class="ac-bar-track"><div class="ac-bar ac-bar--${SLOT_BAR[i] || "a"}" style="width:${pct}%"></div></div>
            ${diff}
          </div>`;
        })
        .join("");
      return `<div class="ac-resumen-row ac-resumen-row--multi">
        <div class="ac-resumen-metric-label">${escapeHtml(s.label)}</div>
        <div class="ac-resumen-multi-cols ac-resumen-multi-cols--${n}">${cols}</div>
      </div>`;
    })
    .join("");

  const varInfo = buildVariationInfo(payload);
  let varHtml = "";
  if (varInfo) {
    varHtml = `<div class="ac-var-grid">
      ${renderVariationCard(varInfo, unit)}
      <div class="ac-var-card ac-chart-card">
        <div class="ac-var-title">Comparativo gráfico</div>
        <div class="ac-chart-box ac-chart-box--mini">
          <canvas id="acChartMini" aria-label="Comparativo gráfico"></canvas>
        </div>
      </div>
    </div>`;
  } else {
    varHtml = `<div class="ac-var-grid ac-var-grid--chart-only">
      <div class="ac-var-card ac-chart-card">
        <div class="ac-var-title">Comparativo gráfico</div>
        <div class="ac-chart-box ac-chart-box--mini">
          <canvas id="acChartMini" aria-label="Comparativo gráfico"></canvas>
        </div>
      </div>
    </div>`;
  }

  return `<div class="ac-resumen${resumenDensityClass(series.length)}" id="acCaptureRoot">
    <div class="ac-resumen-head">
      <div class="ac-resumen-title">${escapeHtml(payload.label || "")}</div>
      <div class="ac-resumen-sub">${escapeHtml(payload.subtitle || "")}</div>
    </div>
    ${namesRowHtml}
    ${wrapResumenBars(series.length, rowsHtml)}
    ${varHtml}
    <p class="ac-footer">${escapeHtml(payload.footer || "")}</p>
  </div>`;
}

function renderResumen(payload) {
  const n = (payload.territories || []).length;
  if (n > 2) return renderResumenMulti(payload);
  return renderResumenPair(payload);
}

function renderTabla(payload) {
  const terrs = payload.territories || [];
  const head = terrs.map((t) => `<th class="text-center">${escapeHtml(t.nom_mun)}</th>`).join("");
  const body = (payload.series || [])
    .map((s) => {
      const cells = (s.values || [])
        .map((v, i) => {
          const d = i === 0 ? "" : ` <span class="ac-diff">(Δ ${fmtNum((s.diff_abs_vs_ref || [])[i])})</span>`;
          return `<td class="text-center">${fmtNum(v.value)}${d}</td>`;
        })
        .join("");
      return `<tr><th>${escapeHtml(s.label)}</th>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-responsive ac-table-wrap"><table class="table table-sm ac-data-table">
    <thead><tr><th>Métrica</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderGrafica(payload) {
  return `<div class="ac-grafica-wrap"><div class="ac-chart-box ac-chart-box--full"><canvas id="acChartFull" aria-label="Gráfica comparativa"></canvas></div></div>`;
}

function renderVariacion(payload) {
  const n = (payload.territories || []).length;
  const varInfo = buildVariationInfo(payload);
  if (!varInfo) {
    if (n > 2) {
      return `<p class="small text-muted">Con más de dos municipios use <strong>Tabla</strong> o <strong>Gráfica</strong> (Δ vs referencia). La diferencia A vs B aplica solo con exactamente 2.</p>`;
    }
    return `<p class="small text-muted">Este indicador no tiene variación temporal ni diferencia A vs B configurada.</p>`;
  }
  return `<div class="ac-var-only">${renderVariationCard(varInfo, unitHint(payload))}</div>`;
}

function renderFicha() {
  return `<p class="small text-muted mb-0">Cargando fichas del Explorador municipal…</p>`;
}

function fichaSelected(data) {
  if (data?.amigo_status === "NO_INSTANCE") return null;
  return data?.selected || null;
}

function fmtFichaValue(kind, raw) {
  if (raw == null || raw === "") return "—";
  if (kind === "text") return String(raw).trim() || "—";
  if (kind === "rank") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return "—";
    return `${Math.round(n)}° lugar estatal`;
  }
  if (kind === "dec1") {
    const n = Number(raw);
    return Number.isFinite(n)
      ? new Intl.NumberFormat("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
      : "—";
  }
  if (kind === "dec2") {
    const n = Number(raw);
    return Number.isFinite(n)
      ? new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
      : "—";
  }
  const n = Number(raw);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Math.round(n))
    : "—";
}

function fichaNumericDelta(kind, va, vb) {
  if (!["int", "dec1", "dec2"].includes(kind)) return null;
  const a = Number(va);
  const b = Number(vb);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

function renderFichaCompareHtml(slotA, slotB, dataA, dataB, extraCount) {
  const selA = fichaSelected(dataA);
  const selB = fichaSelected(dataB);
  const nomA = selA?.nom_mun || slotA.nom || slotA.mun;
  const nomB = selB?.nom_mun || slotB.nom || slotB.mun;
  const crossEnt = slotA.ent !== slotB.ent;
  const warnA =
    dataA?.amigo_status === "NO_INSTANCE"
      ? `<p class="ac-ficha-warn small text-warning">${escapeHtml(dataA.message || "Sin instancia AMIGO para la entidad A.")}</p>`
      : !selA
        ? `<p class="ac-ficha-warn small text-warning">Sin ficha para el municipio A.</p>`
        : "";
  const warnB =
    dataB?.amigo_status === "NO_INSTANCE"
      ? `<p class="ac-ficha-warn small text-warning">${escapeHtml(dataB.message || "Sin instancia AMIGO para la entidad B.")}</p>`
      : !selB
        ? `<p class="ac-ficha-warn small text-warning">Sin ficha para el municipio B.</p>`
        : "";

  let lastSection = "";
  const body = FICHA_METRICS.map((row) => {
    const sectionRow =
      row.section !== lastSection
        ? (() => {
            lastSection = row.section;
            return `<tr class="ac-ficha-section"><th colspan="4">${escapeHtml(row.section)}</th></tr>`;
          })()
        : "";
    const va = selA ? row.get(selA) : null;
    const vb = selB ? row.get(selB) : null;
    const d = fichaNumericDelta(row.kind, va, vb);
    const diffCell =
      d == null
        ? `<td class="text-center text-muted">—</td>`
        : `<td class="text-center ac-diff">Δ ${fmtNum(d)}</td>`;
    return `${sectionRow}<tr>
      <th>${escapeHtml(row.label)}</th>
      <td class="text-center">${escapeHtml(fmtFichaValue(row.kind, va))}</td>
      <td class="text-center">${escapeHtml(fmtFichaValue(row.kind, vb))}</td>
      ${diffCell}
    </tr>`;
  }).join("");

  const extraNote =
    extraCount > 2
      ? `<p class="ac-ficha-note small text-muted mb-2">Solo se comparan <strong>referencia</strong> y <strong>municipio 2</strong> (las dos primeras filas del panel).</p>`
      : "";

  const rankNote = crossEnt
    ? `<p class="ac-ficha-note small text-muted mb-2">Municipios de entidades distintas: los «lugares estatales» no son comparables entre sí.</p>`
    : "";

  return `<div class="ac-ficha-wrap">
    <div class="ac-resumen-head">
      <div class="ac-resumen-title">Ficha vs ficha</div>
      <div class="ac-resumen-sub">KPIs transversales del Explorador municipal (panel Inicio)</div>
    </div>
    ${warnA}${warnB}
    ${extraNote}${rankNote}
    <div class="table-responsive ac-table-wrap ac-ficha-table-wrap">
      <table class="table table-sm ac-data-table ac-ficha-table">
        <thead>
          <tr>
            <th>Métrica</th>
            <th class="text-center ac-name--a">${escapeHtml(nomA)}</th>
            <th class="text-center ac-name--b">${escapeHtml(nomB)}</th>
            <th class="text-center">Δ (A − B)</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="ac-ficha-foot small text-muted mb-0">Fuente: <code>/api/explorador/municipal</code>. Δ solo en métricas numéricas; categorías y ranks se muestran lado a lado.</p>
  </div>`;
}

async function loadFichaTab(panel) {
  readControls();
  const picked = filledTerritorySlots();
  if (picked.length < 2) {
    panel.innerHTML = `<p class="small text-muted mb-0">Seleccione al menos dos municipios (referencia y municipio 2) para comparar fichas.</p>`;
    return;
  }
  const slotA = picked[0];
  const slotB = picked[1];
  const seq = ++_fichaLoadSeq;
  panel.innerHTML = renderFicha();
  try {
    const [dataA, dataB] = await Promise.all([
      fetchExploradorMunicipal(slotA.mun, { cve_ent: slotA.ent }),
      fetchExploradorMunicipal(slotB.mun, { cve_ent: slotB.ent }),
    ]);
    if (seq !== _fichaLoadSeq) return;
    panel.innerHTML = renderFichaCompareHtml(slotA, slotB, dataA, dataB, picked.length);
  } catch (e) {
    if (seq !== _fichaLoadSeq) return;
    panel.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(e?.message || String(e))}</p>`;
  }
}

function paintChart(canvasId, payload, retry = 0) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  const box = canvas.parentElement;
  // El canvas llena la caja (position:absolute); Chart.js necesita dimensiones del contenedor.
  if (box?.classList.contains("ac-chart-box")) {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if ((w <= 0 || h <= 0) && retry < 4) {
      requestAnimationFrame(() => paintChart(canvasId, payload, retry + 1));
      return;
    }
    if (w > 0 && h > 0) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }
  const series = payload.series || [];
  const terrs = payload.territories || [];
  const labels = series.map((s) => s.label);
  const datasets = terrs.map((t, i) => ({
    label: t.nom_mun || `Mun ${i + 1}`,
    data: series.map((s) => Number((s.values || [])[i]?.value) || 0),
    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
    borderRadius: 4,
  }));
  if (_chart) {
    try {
      _chart.destroy();
    } catch {
      /* ignore */
    }
    _chart = null;
  }
  _chart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      resizeDelay: 100,
      layout: {
        padding: { top: 8, right: 8, bottom: 4, left: 4 },
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            boxWidth: 12,
            padding: 8,
            color:
              getComputedStyle(document.documentElement).getPropertyValue("--text").trim() ||
              "#e2e8f0",
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", maxRotation: 0 },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.15)" },
          beginAtZero: true,
        },
      },
    },
  });
}

function scheduleChartPaint(canvasId, payload) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => paintChart(canvasId, payload));
  });
}

function renderActiveTab() {
  const panel = document.getElementById("acPanel");
  if (!panel) return;

  if (_state.tab === "ficha") {
    void loadFichaTab(panel);
    return;
  }

  if (!_lastPayload) {
    panel.innerHTML = `<p class="small text-muted mb-0">Elija al menos dos municipios e indicador, luego pulse Comparar.</p>`;
    return;
  }
  const p = _lastPayload;
  if (_state.tab === "tabla") panel.innerHTML = renderTabla(p);
  else if (_state.tab === "grafica") {
    panel.innerHTML = renderGrafica(p);
    scheduleChartPaint("acChartFull", p);
  } else if (_state.tab === "variacion") {
    panel.innerHTML = renderVariacion(p);
  } else {
    panel.innerHTML = renderResumen(p);
    scheduleChartPaint("acChartMini", p);
  }
}

async function downloadExport(format) {
  readControls();
  const picked = filledTerritorySlots();
  if (picked.length < 2) return;
  const url = new URL(
    apiUrl(`/api/indicators/${encodeURIComponent(_state.indicatorId)}/compare/export`),
    window.location.href
  );
  url.searchParams.set("format", format);
  for (const s of picked) {
    url.searchParams.append("t", `${s.ent}:${s.mun}`);
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    showErr(`Exportación falló (${res.status})`);
    return;
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Comparacion_${_state.indicatorId}.${format === "csv" ? "csv" : "xlsx"}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadPng() {
  const root = document.getElementById("acCaptureRoot") || document.getElementById("acPanel");
  if (!root || typeof html2canvas !== "function") {
    showErr("PNG no disponible (html2canvas).");
    return;
  }
  try {
    const canvas = await html2canvas(root, { backgroundColor: null, scale: 2 });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `Comparacion_${_state.indicatorId}.png`;
    a.click();
  } catch (e) {
    showErr(e?.message || "Error al generar PNG");
  }
}

function bindOnce(root) {
  if (root.dataset.acCompareBound === "1") return;
  root.dataset.acCompareBound = "1";
  root.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLSelectElement)) return;
    if (t.classList.contains("ac-var-metric-select")) {
      _crossMetricKey = t.value;
      refreshVariationCards(document.getElementById("acPanel"));
      return;
    }
    const idx = Number(t.getAttribute("data-idx"));
    if (t.classList.contains("ac-mun-ent")) {
      const munSel = root.querySelector(`.ac-mun-select[data-idx="${idx}"]`);
      const prev = Number.isFinite(idx) ? _munSlots[idx] : null;
      const newEnt = pad2(t.value);
      if (prev) {
        const sameEnt = pad2(prev.ent) === newEnt;
        prev.ent = newEnt;
        if (!sameEnt) {
          prev.mun = "";
          prev.nom = "";
        }
      }
      await loadMunOptions(munSel, t.value, prev?.mun || "");
      return;
    }
    if (t.classList.contains("ac-mun-select") && Number.isFinite(idx) && _munSlots[idx]) {
      const mun = pad3(t.value);
      _munSlots[idx].mun = mun;
      _munSlots[idx].nom = t.selectedOptions?.[0]?.textContent?.trim() || mun;
      const entSel = root.querySelector(`.ac-mun-ent[data-idx="${idx}"]`);
      _munSlots[idx].ent = pad2(entSel?.value || _munSlots[idx].ent || getActiveCveEnt());
    }
  });
  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.id === "acBtnCompare") void runCompare();
    if (btn.id === "acBtnAddMun") addMunSlot();
    if (btn.classList.contains("ac-mun-remove")) {
      const idx = Number(btn.getAttribute("data-idx"));
      if (Number.isFinite(idx)) removeMunSlot(idx);
    }
    if (btn.id === "acExportCsv") void downloadExport("csv");
    if (btn.id === "acExportXlsx") void downloadExport("xlsx");
    if (btn.id === "acExportPng") void downloadPng();
    if (btn.classList.contains("analitica-tab")) {
      root.querySelectorAll(".analitica-tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      _state.tab = btn.getAttribute("data-tab") || "resumen";
      renderActiveTab();
    }
  });
}

/**
 * @param {HTMLElement|null} root
 * @param {{
 *   cve_ent?: string,
 *   cve_mun?: string,
 *   nomgeo?: string,
 *   cve_ent_b?: string,
 *   cve_mun_b?: string,
 *   nomgeo_b?: string,
 *   indicatorId?: string,
 *   autoCompare?: boolean,
 * }|null} seed
 */
export async function renderAnaliticaCompareView(root, seed = null) {
  if (!root) return;
  await loadIndicatorsCatalog();
  await loadCompareEnabledIds();
  root.innerHTML = shellHtml();
  bindOnce(root);

  const defEnt = pad2(seed?.cve_ent || getActiveCveEnt());
  const defEntB = pad2(seed?.cve_ent_b || defEnt);
  _state.indicatorId = seed?.indicatorId || _state.indicatorId || "socio_poblacion";
  if (seed?.indicatorId && isCompareEnabled(seed.indicatorId)) {
    _state.indicatorId = seed.indicatorId;
  }

  fillIndicatorSelect(document.getElementById("acIndicator"));
  const indSel = document.getElementById("acIndicator");
  if (indSel) indSel.value = _state.indicatorId;

  const munA = pad3(seed?.cve_mun || "");
  const munB = pad3(seed?.cve_mun_b || "");
  _munSlots = [
    { ent: defEnt, mun: munA, nom: seed?.nomgeo || "" },
    { ent: defEntB, mun: munB, nom: seed?.nomgeo_b || "" },
  ];

  await renderMunSlotList();

  _lastPayload = null;
  _state.tab = "resumen";

  if (seed?.autoCompare && munA && munB) {
    await runCompare();
    return;
  }

  renderActiveTab();
  if (munA && !munB) {
    const panel = document.getElementById("acPanel");
    if (panel) {
      const hint = seed?.nomgeo
        ? `<p class="small text-muted mb-0">Referencia: <strong>${escapeHtml(seed.nomgeo)}</strong>. Elija al menos un municipio más y pulse Comparar.</p>`
        : `<p class="small text-muted mb-0">Elija al menos un municipio más y pulse Comparar.</p>`;
      panel.innerHTML = hint;
    }
    requestAnimationFrame(() => firstEmptyMunSelect()?.focus());
  }
}
