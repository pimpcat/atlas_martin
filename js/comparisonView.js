/**
 * Comparador municipal N-arios (ids desde API / catálogo — ver compareIndicators.js).
 * Mun A = selección del sidebar; + agrega más (máx 5). Diff absoluta vs A.
 */
import { apiUrl } from "./atlasConfig.js";
import {
  fetchMunicipiosAmigo,
  getActiveCveEnt,
  isNationalMode,
} from "./amigoDeployment.js";

const MAX_MUN = 5;

import { isCompareEnabled } from "./compareIndicators.js";

export { isCompareEnabled };

let _indicatorId = null;
let _ref = null; // { cve_ent, cve_mun, nomgeo }
let _extra = []; // [{ cve_ent, cve_mun, nomgeo }]
let _munCache = []; // [{ cve_mun, nomgeo }]
let _lastPayload = null;

function pad2(cve) {
  const d = String(cve ?? "").replace(/\D/g, "");
  return d.length >= 2 ? d.slice(-2) : ("00" + d).slice(-2);
}

function pad3(cve) {
  const d = String(cve ?? "").replace(/\D/g, "");
  return d.length >= 3 ? d.slice(-3) : ("000" + d).slice(-3);
}

function els() {
  return {
    modal: document.getElementById("indicatorCompareModal"),
    backdrop: document.getElementById("indicatorCompareBackdrop"),
    title: document.getElementById("indicatorCompareTitle"),
    refLabel: document.getElementById("indicatorCompareRef"),
    list: document.getElementById("indicatorCompareList"),
    addBtn: document.getElementById("btnCompareAddMun"),
    runBtn: document.getElementById("btnCompareRun"),
    closeBtn: document.getElementById("btnCompareClose"),
    err: document.getElementById("indicatorCompareError"),
    result: document.getElementById("indicatorCompareResult"),
    exportCsv: document.getElementById("btnCompareExportCsv"),
    exportXlsx: document.getElementById("btnCompareExportXlsx"),
  };
}

function showErr(msg) {
  const { err } = els();
  if (!err) return;
  if (!msg) {
    err.classList.add("d-none");
    err.textContent = "";
    return;
  }
  err.textContent = msg;
  err.classList.remove("d-none");
}

function fmtNum(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

function fmtDiff(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return sign + n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

async function ensureMunList(cve_ent) {
  const ent = pad2(cve_ent || getActiveCveEnt());
  try {
    const rows = await fetchMunicipiosAmigo(ent);
    _munCache = (rows || []).map((r) => ({
      cve_mun: pad3(r.cve_mun || r.cve || ""),
      nomgeo: r.nomgeo || r.nom_mun || r.nombre || "",
      cve_ent: ent,
    }));
  } catch {
    _munCache = [];
  }
}

function usedKeys() {
  const keys = new Set();
  if (_ref?.cve_mun) keys.add(`${pad2(_ref.cve_ent)}:${pad3(_ref.cve_mun)}`);
  for (const e of _extra) {
    if (e?.cve_mun) keys.add(`${pad2(e.cve_ent)}:${pad3(e.cve_mun)}`);
  }
  return keys;
}

function renderExtraRows() {
  const { list, addBtn } = els();
  if (!list) return;
  const used = usedKeys();
  list.innerHTML = _extra
    .map((row, idx) => {
      const opts = _munCache
        .filter((m) => {
          const k = `${m.cve_ent}:${m.cve_mun}`;
          if (k === `${pad2(row.cve_ent)}:${pad3(row.cve_mun)}`) return true;
          return !used.has(k);
        })
        .map((m) => {
          const sel =
            pad3(m.cve_mun) === pad3(row.cve_mun) ? " selected" : "";
          return `<option value="${m.cve_mun}"${sel}>${escapeHtml(
            m.nomgeo || m.cve_mun
          )}</option>`;
        })
        .join("");
      return `<div class="indicator-compare-row d-flex align-items-center gap-2 mb-2" data-idx="${idx}">
        <label class="small text-muted mb-0" style="min-width:4.5rem">Mun ${idx + 2}</label>
        <select class="form-select form-select-sm compare-mun-select" data-idx="${idx}">
          <option value="">— Municipio —</option>
          ${opts}
        </select>
        <button type="button" class="btn btn-sm btn-outline-secondary compare-remove" data-idx="${idx}" title="Quitar" aria-label="Quitar municipio">×</button>
      </div>`;
    })
    .join("");

  list.querySelectorAll(".compare-mun-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const i = Number(sel.getAttribute("data-idx"));
      const mun = pad3(sel.value);
      const found = _munCache.find((m) => m.cve_mun === mun);
      if (!_extra[i]) return;
      _extra[i] = {
        cve_ent: pad2(_ref?.cve_ent || getActiveCveEnt()),
        cve_mun: mun,
        nomgeo: found?.nomgeo || "",
      };
      renderExtraRows();
    });
  });
  list.querySelectorAll(".compare-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-idx"));
      _extra.splice(i, 1);
      renderExtraRows();
      updateAddState();
    });
  });
  updateAddState();
}

function updateAddState() {
  const { addBtn } = els();
  if (!addBtn) return;
  const total = 1 + _extra.length;
  addBtn.disabled = total >= MAX_MUN;
  addBtn.title =
    total >= MAX_MUN
      ? `Máximo ${MAX_MUN} municipios`
      : "Agregar otro municipio";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function territoryTokens() {
  const tokens = [];
  if (_ref?.cve_mun) {
    tokens.push(`${pad2(_ref.cve_ent)}:${pad3(_ref.cve_mun)}`);
  }
  for (const e of _extra) {
    if (e?.cve_mun) tokens.push(`${pad2(e.cve_ent)}:${pad3(e.cve_mun)}`);
  }
  return tokens;
}

function renderResult(payload) {
  const { result } = els();
  if (!result) return;
  _lastPayload = payload;
  const terrs = payload.territories || [];
  const series = payload.series || [];
  const maxAbs = Math.max(
    0,
    ...series.flatMap((s) =>
      (s.values || []).map((v) => Math.abs(Number(v.value) || 0))
    )
  );

  const head = terrs
    .map(
      (t, i) =>
        `<th class="text-end">${escapeHtml(t.nom_mun || t.cve_mun)}${
          i === 0 ? ' <span class="indicator-compare-ref-tag fw-normal">(ref)</span>' : ""
        }</th>`
    )
    .join("");

  const body = series
    .map((s) => {
      const cells = (s.values || [])
        .map((v, i) => {
          const n = Number(v.value);
          const pct =
            maxAbs > 0 && Number.isFinite(n) ? Math.min(100, (Math.abs(n) / maxAbs) * 100) : 0;
          const diff =
            i === 0
              ? ""
              : `<div class="small indicator-compare-diff">Δ ${fmtDiff(
                  (s.diff_abs_vs_ref || [])[i]
                )}</div>`;
          return `<td class="text-end indicator-compare-cell">
            <div class="indicator-compare-value">${fmtNum(v.value)}</div>
            <div class="indicator-compare-bar-track" aria-hidden="true"><div class="indicator-compare-bar" style="width:${pct}%"></div></div>
            ${diff}
          </td>`;
        })
        .join("");
      return `<tr><th scope="row" class="text-nowrap indicator-compare-metric">${escapeHtml(
        s.label || s.metric_key
      )}</th>${cells}</tr>`;
    })
    .join("");

  const warns = (payload.warnings || [])
    .map((w) => `<div class="small indicator-compare-warn">${escapeHtml(w)}</div>`)
    .join("");

  result.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
      <div>
        <div class="indicator-compare-ind-title">${escapeHtml(payload.label || "")}</div>
        <div class="small indicator-compare-ind-sub">${escapeHtml(payload.subtitle || "")}</div>
      </div>
      <div class="small indicator-compare-mode">Modo ${escapeHtml(payload.comparison_mode || "")}</div>
    </div>
    ${warns}
    <div class="table-responsive indicator-compare-table-wrap">
      <table class="table table-sm align-middle indicator-compare-table mb-2">
        <thead><tr><th>Métrica</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="small indicator-compare-footer mb-0">${escapeHtml(payload.footer || "")}</p>
  `;
  const { exportCsv, exportXlsx } = els();
  exportCsv?.classList.remove("d-none");
  exportXlsx?.classList.remove("d-none");
}

async function runCompare() {
  showErr("");
  const tokens = territoryTokens();
  if (tokens.length < 2) {
    showErr("Agregue al menos otro municipio con el botón +.");
    return;
  }
  const { runBtn, result } = els();
  if (runBtn) runBtn.disabled = true;
  if (result) result.innerHTML = '<div class="small text-muted">Comparando…</div>';
  try {
    const url = new URL(
      apiUrl(`/api/indicators/${encodeURIComponent(_indicatorId)}/compare`),
      window.location.href
    );
    for (const tok of tokens) url.searchParams.append("t", tok);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      const d = json?.detail;
      throw new Error(
        (d && (d.message || d.error)) || json?.message || `HTTP ${res.status}`
      );
    }
    renderResult(json);
  } catch (e) {
    if (result) result.innerHTML = "";
    showErr(e?.message || String(e));
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

async function downloadCompare(format) {
  const tokens = territoryTokens();
  if (tokens.length < 2) {
    showErr("Nada que exportar todavía.");
    return;
  }
  const url = new URL(
    apiUrl(`/api/indicators/${encodeURIComponent(_indicatorId)}/compare/export`),
    window.location.href
  );
  url.searchParams.set("format", format);
  for (const tok of tokens) url.searchParams.append("t", tok);
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Comparacion_${_indicatorId}.${format === "csv" ? "csv" : "xlsx"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    showErr(e?.message || String(e));
  }
}

function closeModal() {
  const { modal, backdrop } = els();
  modal?.classList.add("d-none");
  backdrop?.classList.add("d-none");
  if (modal) modal.setAttribute("aria-hidden", "true");
}

export async function openIndicatorCompare(indicatorId, selected) {
  if (!isCompareEnabled(indicatorId)) {
    alert("Comparador aún no habilitado para este indicador.");
    return;
  }
  if (!selected?.cve_mun) {
    alert("Seleccione primero un municipio en el explorador (Municipio A).");
    return;
  }
  _indicatorId = indicatorId;
  _ref = {
    cve_ent: pad2(selected.cve_ent || getActiveCveEnt()),
    cve_mun: pad3(selected.cve_mun),
    nomgeo: selected.nomgeo || selected.nom_mun || "",
  };
  _extra = [];
  _lastPayload = null;
  showErr("");

  const {
    modal,
    backdrop,
    title,
    refLabel,
    result,
    exportCsv,
    exportXlsx,
  } = els();
  if (title) title.textContent = "Comparación municipal";
  if (refLabel) {
    refLabel.textContent = `${_ref.nomgeo || _ref.cve_mun} · entidad ${_ref.cve_ent}${
      isNationalMode() ? "" : ""
    } (referencia)`;
  }
  if (result) result.innerHTML = "";
  exportCsv?.classList.add("d-none");
  exportXlsx?.classList.add("d-none");

  await ensureMunList(_ref.cve_ent);
  // Pre-cargar una fila vacía para el segundo municipio
  _extra = [
    {
      cve_ent: _ref.cve_ent,
      cve_mun: "",
      nomgeo: "",
    },
  ];
  renderExtraRows();

  backdrop?.classList.remove("d-none");
  modal?.classList.remove("d-none");
  if (modal) modal.setAttribute("aria-hidden", "false");
}

export function attachIndicatorCompareUi() {
  const { addBtn, runBtn, closeBtn, backdrop, exportCsv, exportXlsx } = els();
  addBtn?.addEventListener("click", () => {
    if (1 + _extra.length >= MAX_MUN) return;
    _extra.push({
      cve_ent: pad2(_ref?.cve_ent || getActiveCveEnt()),
      cve_mun: "",
      nomgeo: "",
    });
    renderExtraRows();
  });
  runBtn?.addEventListener("click", () => void runCompare());
  closeBtn?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", closeModal);
  exportCsv?.addEventListener("click", () => void downloadCompare("csv"));
  exportXlsx?.addEventListener("click", () => void downloadCompare("xlsx"));
}
