/**
 * Data Refresh Studio — ETL espacial SHP/ZIP (staging → diff → swap).
 */
import {
  adminFetch,
  clearAdminSession,
  getAdminToken,
  getAdminUser,
  isVisorAdminLoggedIn,
  loginAdmin,
  verifyAdminSession,
} from "./visorAdminAuth.js";
import { mountStudioNav, studioLoginFooterHtml } from "./studioNav.js";
import { apiUrl } from "./atlasConfig.js";

const $ = (id) => document.getElementById(id);

const TERMINAL = new Set(["ready", "failed", "cancelled", "applied"]);
const STATUS_PCT = {
  uploading: 20,
  queued: 25,
  importing: 55,
  comparing: 85,
  applying: 70,
  ready: 100,
  failed: 100,
  applied: 100,
  cancelled: 100,
};

let _currentJobId = null;
let _currentJobKind = "spatial";
let _busy = false;
let _pollTimer = null;
let _mode = "spatial"; // spatial | indicators
let _indScope = "estatal"; // estatal (tab_municipal) | nacional (tab_nacional)
let _templates = [];

function templateIsNacional(t) {
  return t?.scope === "nacional" || t?.target_table === "tab_nacional";
}

function templatesForScope() {
  return (_templates || []).filter((t) =>
    _indScope === "nacional" ? templateIsNacional(t) : !templateIsNacional(t)
  );
}

function showErr(el, msg) {
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

function setMsg(el, msg, ok = true) {
  if (!el) return;
  el.textContent = msg || "";
  el.className = `small ${ok ? "text-success" : "text-danger"}`;
}

function showLogin(show) {
  $("drLoginView")?.classList.toggle("d-none", !show);
  $("drDashboard")?.classList.toggle("d-none", show);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setBusyUi(on) {
  _busy = !!on;
  document.body.classList.toggle("dr-is-busy", _busy);
  const overlay = $("drBusyOverlay");
  if (overlay) overlay.hidden = !_busy;
  ["drUploadBtn", "drApplyBtn", "drCancelBtn", "drLogoutBtn", "drTarget", "drFile", "drTemplate", "drIndFile", "drModeSpatial", "drModeIndicators", "drMoldBtn", "drSynthBtn", "drSynthSeed", "drSynthChanges", "drSynthJitter", "drScopeEstatal", "drScopeNacional"].forEach(
    (id) => {
      const el = $(id);
      if (el) el.disabled = _busy;
    }
  );
  if ($("drJobsList")) {
    $("drJobsList").style.pointerEvents = _busy ? "none" : "";
    $("drJobsList").style.opacity = _busy ? "0.55" : "";
  }
  if ($("drVersionsList")) {
    $("drVersionsList").style.pointerEvents = _busy ? "none" : "";
    $("drVersionsList").style.opacity = _busy ? "0.55" : "";
  }
}

function setProgress(pct, label, { indeterminate = false } = {}) {
  const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const bar = $("drBusyBar");
  const pctEl = $("drBusyPct");
  const labelEl = $("drBusyLabel");
  if (labelEl && label) labelEl.textContent = label;
  if (bar) {
    bar.classList.toggle("is-indeterminate", !!indeterminate);
    if (!indeterminate) bar.style.width = `${n}%`;
  }
  if (pctEl) {
    pctEl.textContent = indeterminate ? "En curso…" : `${n}%`;
  }
}

function stopPoll() {
  if (_pollTimer) {
    clearTimeout(_pollTimer);
    _pollTimer = null;
  }
}

function progressFromJob(job) {
  const report = job?.report || {};
  const fromReport = Number(report.progress);
  if (Number.isFinite(fromReport) && fromReport >= 0) return fromReport;
  return STATUS_PCT[job?.status] ?? 40;
}

function labelFromJob(job) {
  const report = job?.report || {};
  if (report.label) return String(report.label);
  const map = {
    queued: "En cola…",
    importing: "Importando SHP a staging…",
    comparing: "Comparando con producción…",
    applying: "Aplicando swap…",
    ready: "Listo",
    failed: "Error",
  };
  return map[job?.status] || `Estado: ${job?.status || "…"}`;
}

function setIndScope(scope) {
  _indScope = scope === "nacional" ? "nacional" : "estatal";
  const est = $("drScopeEstatal");
  const nat = $("drScopeNacional");
  if (est) {
    est.classList.toggle("btn-primary", _indScope === "estatal");
    est.classList.toggle("btn-outline-secondary", _indScope !== "estatal");
  }
  if (nat) {
    nat.classList.toggle("btn-primary", _indScope === "nacional");
    nat.classList.toggle("btn-outline-secondary", _indScope !== "nacional");
  }
  fillTemplateSelect();
  setMsg($("drUploadMsg"), "", true);
  void loadJobs();
  void loadVersions();
}

function setMode(mode) {
  _mode = mode === "indicators" ? "indicators" : "spatial";
  $("drSpatialFields")?.classList.toggle("d-none", _mode !== "spatial");
  $("drIndicatorFields")?.classList.toggle("d-none", _mode !== "indicators");
  $("drIndScopeTabs")?.classList.toggle("d-none", _mode !== "indicators");
  $("drDerivedCard")?.classList.toggle("d-none", _mode !== "spatial");
  const spat = $("drModeSpatial");
  const ind = $("drModeIndicators");
  if (spat) {
    spat.classList.toggle("btn-primary", _mode === "spatial");
    spat.classList.toggle("btn-outline-secondary", _mode !== "spatial");
  }
  if (ind) {
    ind.classList.toggle("btn-primary", _mode === "indicators");
    ind.classList.toggle("btn-outline-secondary", _mode !== "indicators");
  }
  const btn = $("drUploadBtn");
  if (btn) {
    btn.textContent = _mode === "indicators" ? "Subir y validar CSV" : "Subir y comparar";
  }
  setMsg($("drUploadMsg"), "", true);
  if (_mode === "indicators") {
    setIndScope(_indScope);
  } else {
    void loadJobs();
    void loadVersions();
  }
}

function syncTemplateUi() {
  const sel = $("drTemplate");
  const t = _templates.find((x) => x.id === sel?.value);
  const hint = $("drTemplateHint");
  const moldBtn = $("drMoldBtn");
  const synthBtn = $("drSynthBtn");
  const fileHelp = document
    .querySelector('label[for="drIndFile"]')
    ?.parentElement?.querySelector(".form-text");
  const isNat = _indScope === "nacional" || templateIsNacional(t);
  if (hint) {
    if (!t) {
      hint.textContent =
        _indScope === "nacional"
          ? "Elija un indicador nacional (tab_nacional) para ver las columnas del molde."
          : "Elija un indicador estatal (tab_municipal) para ver las columnas del molde.";
    } else {
      const cols = (t.metrics || [])
        .filter((m) => m.in_database)
        .map((m) => `${m.column}${m.label ? ` (${m.label})` : ""}`)
        .join(", ");
      if (!cols) {
        hint.textContent = isNat
          ? "Esta plantilla no tiene columnas resolubles en tab_nacional."
          : "Esta plantilla no tiene columnas resolubles en tab_municipal.";
      } else if (isNat) {
        hint.textContent = `Columnas: ent (2 dígitos 01–32), nom_ent, ${cols}. Descargue el Excel, rellene y súbalo.`;
      } else {
        hint.textContent = `Columnas: cve_mun (3 dígitos), nom_mun, ${cols}. Descargue el Excel, rellene y súbalo.`;
      }
    }
  }
  if (fileHelp) {
    fileHelp.innerHTML = isNat
      ? "Use el molde Excel (claves <code>01</code>…<code>32</code>), complete valores y súbalo. También acepta CSV (<code>,</code> o <code>;</code>)."
      : "Use el molde Excel (claves <code>001</code>…), complete valores y súbalo. También acepta CSV (<code>,</code> o <code>;</code>).";
  }
  if (moldBtn) moldBtn.disabled = !t || _busy;
  if (synthBtn) synthBtn.disabled = !t || _busy;
}

function fillTemplateSelect() {
  const sel = $("drTemplate");
  if (!sel) return;
  const list = templatesForScope();
  if (!list.length) {
    sel.innerHTML =
      _indScope === "nacional"
        ? `<option value="">(sin plantillas nacionales)</option>`
        : `<option value="">(sin plantillas estatales)</option>`;
    syncTemplateUi();
    return;
  }
  const prev = sel.value;
  sel.innerHTML =
    `<option value="">— Seleccione indicador —</option>` +
    list
      .map((t) => {
        const label = `${t.label}${t.group_id ? ` · ${t.group_id}` : ""} (${t.metrics_in_db || 0} cols)`;
        return `<option value="${escapeHtml(t.id)}">${escapeHtml(label)}</option>`;
      })
      .join("");
  if (prev && list.some((t) => t.id === prev)) {
    sel.value = prev;
  }
  sel.onchange = syncTemplateUi;
  syncTemplateUi();
}

async function loadTemplates() {
  const { res, data } = await adminFetch("/api/data-refresh/indicators/templates");
  if (!res?.ok) throw new Error(data?.detail?.message || "No se pudieron cargar plantillas");
  _templates = data.templates || [];
  fillTemplateSelect();
}

async function downloadIndicatorMold() {
  const templateId = $("drTemplate")?.value?.trim();
  if (!templateId) {
    setMsg($("drUploadMsg"), "Seleccione una plantilla primero.", false);
    return;
  }
  const token = getAdminToken();
  const url = apiUrl(
    `/api/data-refresh/indicators/templates/${encodeURIComponent(templateId)}/mold`
  );
  try {
    setBusyUi(true);
    setProgress(30, "Generando molde Excel…", { indeterminate: true });
    const res = await fetch(url, {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            "X-Atlas-Authorization": `Bearer ${token}`,
          }
        : {},
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        msg = data?.detail?.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = /filename="?([^"]+)"?/i.exec(cd);
    const filename = m?.[1] || `molde_${templateId}.xlsx`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    setMsg(
      $("drUploadMsg"),
      "Molde descargado. Complete las columnas numéricas (no borre cve_mun/nom_mun) y súbalo.",
      true
    );
  } catch (err) {
    setMsg($("drUploadMsg"), err?.message || "No se pudo descargar el molde.", false);
  } finally {
    setBusyUi(false);
  }
}

async function downloadSyntheticIndicator() {
  const templateId = $("drTemplate")?.value?.trim();
  if (!templateId) {
    setMsg($("drUploadMsg"), "Seleccione una plantilla primero.", false);
    return;
  }
  const seed = Number($("drSynthSeed")?.value ?? 1234);
  const changes = Number($("drSynthChanges")?.value ?? 40);
  const jitterPct = Number($("drSynthJitter")?.value ?? 8) / 100;
  if (!Number.isFinite(seed) || seed < 0) {
    setMsg($("drUploadMsg"), "Seed inválida.", false);
    return;
  }
  if (!Number.isFinite(changes) || changes < 1) {
    setMsg($("drUploadMsg"), "Número de cambios inválido.", false);
    return;
  }
  const token = getAdminToken();
  const url = apiUrl("/api/data-refresh/indicators/synthetic");
  try {
    setBusyUi(true);
    setProgress(25, `Generando escenario seed=${seed}…`, { indeterminate: true });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
              "X-Atlas-Authorization": `Bearer ${token}`,
            }
          : {}),
      },
      body: JSON.stringify({
        template_id: templateId,
        changes,
        seed,
        jitter_pct: jitterPct,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        msg = data?.detail?.message || data?.detail || msg;
        if (typeof msg !== "string") msg = JSON.stringify(msg);
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = /filename="?([^"]+)"?/i.exec(cd);
    const filename = m?.[1] || `prueba_${templateId}_seed${seed}.xlsx`;
    const applied = res.headers.get("X-GroSIG-Changes") || "?";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    setMsg(
      $("drUploadMsg"),
      `Escenario seed=${seed}: ${applied} cambios → ${filename}. Revise hoja Escenario (SQL backup) antes de Aplicar.`,
      true
    );
  } catch (err) {
    setMsg(
      $("drUploadMsg"),
      err?.message || "No se pudo generar el dataset de prueba.",
      false
    );
  } finally {
    setBusyUi(false);
  }
}

async function loadTargets() {
  const { res, data } = await adminFetch("/api/data-refresh/targets");
  if (!res?.ok) throw new Error(data?.detail?.message || "No se pudieron listar tablas");
  const sel = $("drTarget");
  if (!sel) return;
  const targets = data.targets || [];
  const opts = targets
    .map((t) => {
      const label = `${t.table} · ${t.geometry || "?"} · ${t.feature_count ?? "?"} feats`;
      return `<option value="${escapeHtml(t.table)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  if (!targets.length) {
    sel.innerHTML = `<option value="">(sin tablas candidatas)</option>`;
    return;
  }
  sel.innerHTML = `<option value="">— Seleccione tabla destino —</option>${opts}`;
}

async function loadJobs() {
  const params = new URLSearchParams({ limit: "50" });
  if (_mode === "indicators") {
    params.set("kind", "indicator");
  }
  // En modo espacial: historial sin filtro kind → espacial + derivadas (excluye indicadores en cliente)
  const { res, data } = await adminFetch(`/api/data-refresh/history?${params}`);
  const host = $("drJobsList");
  if (!host) return;
  if (!res?.ok) {
    host.innerHTML = `<tr><td colspan="7" class="text-danger px-2">Error al listar historial</td></tr>`;
    return;
  }
  let jobs = data.jobs || [];
  if (_mode === "indicators") {
    jobs = jobs.filter((j) => {
      const tgt = String(j.target_table || "").toLowerCase();
      if (_indScope === "nacional") return tgt === "tab_nacional";
      return tgt === "tab_municipal";
    });
  } else {
    jobs = jobs.filter((j) => j.kind !== "indicator");
  }
  if (!jobs.length) {
    host.innerHTML = `<tr><td colspan="7" class="text-muted px-2">Sin jobs aún.</td></tr>`;
    return;
  }
  host.innerHTML = jobs
    .map((j) => {
      const when = formatHistoryDate(j.created_at);
      const dur =
        j.elapsed_seconds != null
          ? `${Number(j.elapsed_seconds).toLocaleString("es-MX", {
              maximumFractionDigits: 1,
            })} s`
          : "—";
      const kind =
        j.kind === "indicator"
          ? "Indicator"
          : j.kind === "derived"
            ? "Derived"
            : "Spatial";
      return `<tr class="dr-hist-row" role="button" tabindex="0" data-job="${escapeHtml(
        j.id
      )}" style="cursor:pointer">
          <td class="text-nowrap">${escapeHtml(when)}</td>
          <td>${escapeHtml(j.username || "—")}</td>
          <td><code>${escapeHtml(j.target_table || "")}</code></td>
          <td>${escapeHtml(kind)}</td>
          <td class="text-truncate" style="max-width:12rem" title="${escapeHtml(
            j.summary || ""
          )}">${escapeHtml(j.summary || "—")}</td>
          <td class="text-nowrap">${escapeHtml(dur)}</td>
          <td><strong>${escapeHtml(j.status || "")}</strong></td>
        </tr>`;
    })
    .join("");
  host.querySelectorAll("[data-job]").forEach((row) => {
    const open = () => {
      if (_busy) return;
      void openJob(row.getAttribute("data-job"));
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

function formatHistoryDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

async function loadVersions() {
  const host = $("drVersionsList");
  if (!host) return;
  const params = new URLSearchParams({ limit: "30" });
  if (_mode === "indicators") {
    params.set(
      "table_name",
      _indScope === "nacional" ? "tab_nacional" : "tab_municipal"
    );
  }
  const { res, data } = await adminFetch(`/api/data-refresh/versions?${params}`);
  if (!res?.ok) {
    host.innerHTML = `<p class="small text-danger mb-0">Error al listar versiones</p>`;
    return;
  }
  let versions = data.versions || [];
  if (_mode === "spatial") {
    versions = versions.filter((v) => (v.kind || "spatial") === "spatial");
  }
  if (!versions.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Sin versiones retenidas aún (aparecen tras un apply exitoso).</p>`;
    return;
  }
  host.innerHTML = versions
    .map((v) => {
      const when = formatHistoryDate(v.created_at);
      const rows =
        v.row_count != null ? `${fmtInt(v.row_count)} filas` : "—";
      return `<div class="border rounded p-2 mb-1 small">
        <div class="d-flex justify-content-between gap-2 align-items-start">
          <div>
            <div><code>${escapeHtml(v.table_name)}</code> · ${escapeHtml(
        when
      )}</div>
            <div class="text-muted">${escapeHtml(rows)} · <code>${escapeHtml(
        v.backup_table || ""
      )}</code></div>
          </div>
          <button type="button" class="btn btn-outline-warning btn-sm flex-shrink-0" data-restore="${
            v.id
          }">Restaurar</button>
        </div>
      </div>`;
    })
    .join("");
  host.querySelectorAll("[data-restore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (_busy) return;
      void restoreVersion(btn.getAttribute("data-restore"));
    });
  });
}

async function restoreVersion(versionId) {
  if (!versionId || _busy) return;
  const ok = window.confirm(
    "¿Restaurar esta versión? La producción actual se conservará como nueva versión (máx. 3)."
  );
  if (!ok) return;
  setBusyUi(true);
  setMsg($("drApplyMsg"), "Restaurando versión…", true);
  try {
    const { res, data } = await adminFetch(
      `/api/data-refresh/versions/${encodeURIComponent(versionId)}/restore`,
      { method: "POST" }
    );
    if (!res?.ok) {
      throw new Error(data?.detail?.message || "No se pudo restaurar");
    }
    setMsg($("drApplyMsg"), "Versión restaurada.", true);
    await loadVersions();
    await loadJobs();
  } catch (err) {
    setMsg($("drApplyMsg"), err?.message || "Error al restaurar", false);
  } finally {
    setBusyUi(false);
  }
}

function fmtInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.round(x).toLocaleString("es-MX");
}

function fmtDelta(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const abs = Math.abs(Math.round(x)).toLocaleString("es-MX");
  if (x > 0) return `+${abs} registros`;
  if (x < 0) return `−${abs} registros`;
  return "0 registros";
}

function renderValidationLight(level, label) {
  const map = {
    ok: { cls: "dr-light--ok", glyph: "🟢", text: label || "Compatible" },
    warn: { cls: "dr-light--warn", glyph: "🟡", text: label || "Revisar" },
    block: { cls: "dr-light--block", glyph: "🔴", text: label || "Bloqueado" },
  };
  const m = map[level] || map.warn;
  return `<div class="dr-light ${m.cls}"><span class="dr-light__glyph">${m.glyph}</span>
    <div><div class="dr-light__kicker">Validación general</div>
    <div class="dr-light__label">${escapeHtml(m.text)}</div></div></div>`;
}

function renderJobSummary(job) {
  const host = $("drJobSummary");
  if (!host) return;
  const r = job?.report || {};
  const err = job?.error_message || r.apply_error;

  if (["queued", "uploading", "importing", "comparing"].includes(job?.status) && r.production_count == null) {
    host.innerHTML = `
      <div class="dr-info">
        <span class="dr-info__tag">En curso</span>
        ${escapeHtml(r.label || labelFromJob(job))}
        · Destino: <code>${escapeHtml(job.target_table || r.target_table || "—")}</code>
      </div>`;
    return;
  }

  if (job?.status === "applied" && r.apply_summary) {
    const s = r.apply_summary;
    const checks = (s.checks || [])
      .map(
        (c) =>
          `<li class="${c.ok ? "dr-check--ok" : "dr-check--warn"}">${c.ok ? "✔" : "△"} ${escapeHtml(c.label)}</li>`
      )
      .join("");
    const title =
      r.kind === "indicator"
        ? "Indicadores actualizados"
        : r.kind === "derived"
          ? "Tabla derivada recalculada"
          : "Swap completado";
    host.innerHTML = `
      <div class="dr-report__card dr-report__card--success">
        <h2 class="dr-report__h">${escapeHtml(title)}</h2>
        <ul class="dr-check-list">${checks}</ul>
        <p class="dr-report__time">Tiempo total: <strong>${escapeHtml(String(s.elapsed_seconds ?? "—"))} s</strong>
          ${
            r.kind === "indicator"
              ? ""
              : r.kind === "derived"
                ? `· Municipios: <strong>${fmtInt(r.rows_written)}</strong>`
                : `· Registros finales: <strong>${fmtInt(r.final_count)}</strong>`
          }</p>
      </div>`;
    return;
  }

  if (r.kind === "indicator") {
    const validation = r.validation || {};
    const checks = validation.checks || {};
    const level = validation.level || "ok";
    const isNat =
      r.scope === "nacional" ||
      r.target_table === "tab_nacional" ||
      job?.target_table === "tab_nacional";
    const unitOk = isNat ? "Entidades OK" : "Municipios OK";
    const unitMatch = isNat ? "Entidades coincidentes" : "Municipios coincidentes";
    const matched = r.entities_matched ?? r.municipal_matched;
    const missingArr = r.entities_missing || r.municipal_missing || [];
    const checkRow = (ok, label, value) =>
      `<div class="dr-sum-row"><span class="dr-sum-row__mark">${ok ? "✔" : "△"}</span>
        <span class="dr-sum-row__label">${escapeHtml(label)}</span>
        <span class="dr-sum-row__val">${value}</span></div>`;
    const infos = (r.infos || [])
      .map((t) => `<div class="dr-info"><span class="dr-info__tag">Información</span> ${escapeHtml(t)}</div>`)
      .join("");
    const warnings = (r.warnings || [])
      .map((t) => `<div class="dr-warn"><span class="dr-warn__tag">Advertencia</span> ${escapeHtml(t)}</div>`)
      .join("");
    const metrics = (r.mapped_metrics || [])
      .map((m) => escapeHtml(m.label || m.column))
      .join(", ");
    const delta0 = (r.deltas || [])[0];
    host.innerHTML = `
      ${renderValidationLight(level, validation.label)}
      <div class="dr-counts">
        <div class="dr-counts__item"><div class="dr-counts__k">${escapeHtml(unitOk)}</div>
          <div class="dr-counts__v">${fmtInt(matched)}</div></div>
        <div class="dr-counts__item"><div class="dr-counts__k">Faltantes</div>
          <div class="dr-counts__v">${fmtInt(missingArr.length)}</div></div>
        <div class="dr-counts__item dr-counts__item--delta"><div class="dr-counts__k">Resumen</div>
          <div class="dr-counts__v" style="font-size:0.85rem">${escapeHtml(r.summary_line || "—")}</div></div>
      </div>
      <div class="dr-sum">
        ${checkRow(true, "Plantilla", escapeHtml(r.template_label || r.template_id || "—"))}
        ${checkRow(true, "Tabla destino", escapeHtml(r.target_table || job?.target_table || "—"))}
        ${checkRow(checks.metrics !== false, "Columnas a actualizar", escapeHtml(metrics || "—"))}
        ${checkRow(checks.municipalities !== false, unitMatch, fmtInt(matched))}
        ${checkRow(checks.types !== false, "Tipos numéricos", checks.types === false ? "Con errores" : "OK")}
        ${checkRow(
          true,
          "Estrategia",
          escapeHtml(r.strategy_label || "Merge por columnas")
        )}
        ${
          delta0
            ? checkRow(
                true,
                `Cambios en ${delta0.column}`,
                fmtInt(delta0.rows_changed)
              )
            : ""
        }
      </div>
      ${infos}${warnings}
    `;
    return;
  }

  const prod = r.production_count;
  const stg = r.staging_count;
  const delta = r.delta_count;
  const geom = (r.geometry_staging || r.geometry_production || "—").toString().toUpperCase();
  const commonN = r.columns_common_count ?? (r.columns_common || []).length;
  const prodCols =
    r.columns_expected_count ??
    commonN + (r.columns_only_production || []).length;
  const validation = r.validation || {};
  const checks = validation.checks || {};
  const level =
    validation.level ||
    (job?.status === "failed" ? "block" : "ok");

  const checkRow = (ok, label, value) =>
    `<div class="dr-sum-row"><span class="dr-sum-row__mark">${ok ? "✔" : "△"}</span>
      <span class="dr-sum-row__label">${escapeHtml(label)}</span>
      <span class="dr-sum-row__val">${value}</span></div>`;

  const infosList = [...(r.infos || [])];
  if (
    !infosList.length &&
    r.key_diff?.skipped &&
    r.key_diff?.reason === "large_table"
  ) {
    infosList.push(
      `Optimización aplicada: debido al tamaño de la tabla (${fmtInt(
        Math.max(Number(prod) || 0, Number(stg) || 0)
      )} registros), no se calculó el diff fila por fila. El reemplazo se realizará mediante intercambio completo de tablas (Swap), lo que garantiza un proceso más rápido y seguro.`
    );
  }
  const warnList = (r.warnings || []).filter(
    (t) => !String(t).includes("Diff detallado omitido")
  );
  const infos = infosList
    .map((t) => `<div class="dr-info"><span class="dr-info__tag">Información</span> ${escapeHtml(t)}</div>`)
    .join("");
  const warnings = warnList
    .map((t) => `<div class="dr-warn"><span class="dr-warn__tag">Advertencia</span> ${escapeHtml(t)}</div>`)
    .join("");
  const errBlock = err
    ? `<div class="dr-warn dr-warn--error">${escapeHtml(err)}</div>`
    : "";

  const geomVal = r.geometry_validation || {};
  const geomDetailProd = (r.geometry_production_detail || r.geometry_production || "—")
    .toString()
    .toUpperCase();
  const geomDetailStg = (r.geometry_staging_detail || r.geometry_staging || "—")
    .toString()
    .toUpperCase();
  const showConvert =
    job?.status === "ready" &&
    geomVal.can_convert_to_point &&
    !geomVal.conversion_applied &&
    !geomVal.user_declined;

  let geomCard = "";
  if (geomVal.status || geomVal.original_type) {
    const rows = [
      ["Tipo original", geomVal.original_type || geomDetailStg],
      [
        "Elementos por geometría",
        geomVal.elements_per_geometry != null ? String(geomVal.elements_per_geometry) : "—",
      ],
      [
        "Conversión automática",
        geomVal.conversion_applied
          ? "Sí"
          : geomVal.user_declined
            ? "No (declinada)"
            : showConvert
              ? "Pendiente"
              : geomVal.can_convert_to_point
                ? "Disponible"
                : "No aplica",
      ],
      ["Tipo final", geomVal.final_type || geomDetailStg],
    ];
    const rowsHtml = rows
      .map(
        ([k, v]) =>
          `<div class="dr-geom-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(
            String(v)
          )}</strong></div>`
      )
      .join("");
    const actions = showConvert
      ? `<div class="dr-geom-actions mt-2">
          <p class="small mb-2">¿Convertir automáticamente a POINT?</p>
          <button type="button" class="btn btn-sm btn-primary me-1" id="drGeomYes">Sí</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="drGeomNo">No</button>
        </div>`
      : "";
    const tone =
      geomVal.status === "unsafe"
        ? "dr-geom-card--warn"
        : geomVal.conversion_applied
          ? "dr-geom-card--ok"
          : showConvert
            ? "dr-geom-card--offer"
            : "";
    geomCard = `
      <div class="dr-geom-card ${tone}">
        <div class="dr-geom-card__title">Validación de geometría</div>
        <p class="small mb-2 opacity-75">Producción: <code>${escapeHtml(
          geomDetailProd
        )}</code> · Staging: <code>${escapeHtml(geomDetailStg)}</code></p>
        ${rowsHtml}
        ${
          geomVal.message
            ? `<p class="small mt-2 mb-0">${escapeHtml(geomVal.message)}</p>`
            : ""
        }
        ${actions}
      </div>`;
  }

  host.innerHTML = `
    ${renderValidationLight(level, validation.label)}
    <div class="dr-counts">
      <div class="dr-counts__item"><div class="dr-counts__k">Producción</div>
        <div class="dr-counts__v">${fmtInt(prod)}</div></div>
      <div class="dr-counts__item"><div class="dr-counts__k">Nuevo conjunto</div>
        <div class="dr-counts__v">${fmtInt(stg)}</div></div>
      <div class="dr-counts__item dr-counts__item--delta"><div class="dr-counts__k">Diferencia</div>
        <div class="dr-counts__v">${fmtDelta(delta)}</div></div>
    </div>
    <div class="dr-sum">
      ${checkRow(
        checks.geometry !== false,
        "Geometría compatible",
        escapeHtml((geomDetailStg || geom).toString())
      )}
      ${checkRow(checks.columns !== false, "Columnas compatibles", `${fmtInt(commonN)} / ${fmtInt(prodCols)}`)}
      ${checkRow(checks.srid !== false, "SRID consistente", escapeHtml(
        r.srid_production != null
          ? `${r.srid_production} → ${r.srid_staging ?? "—"}`
          : "—"
      ))}
      ${checkRow(checks.counts !== false, "Registros (nuevo)", fmtInt(stg))}
      ${checkRow(
        checks.duplicates !== false,
        "Duplicados de clave",
        r.duplicate_keys ? `${fmtInt(r.duplicate_keys)}` : "0"
      )}
      ${checkRow(true, "Diferencia", fmtDelta(delta))}
      ${checkRow(checks.swap_available !== false, "Estrategia", escapeHtml(r.strategy_label || "Reemplazo completo (Swap)"))}
    </div>
    ${geomCard}
    ${infos}
    ${warnings}
    ${errBlock}
  `;

  if (showConvert) {
    $("drGeomYes")?.addEventListener("click", () => void normalizeGeometry(true));
    $("drGeomNo")?.addEventListener("click", () => void normalizeGeometry(false));
  }
}

function renderJob(job) {
  _currentJobId = job?.id || null;
  const rk = job?.report?.kind;
  _currentJobKind =
    rk === "indicator" ? "indicator" : rk === "derived" ? "derived" : "spatial";
  const empty = $("drJobEmpty");
  const panel = $("drJobPanel");
  if (!job) {
    empty?.classList.remove("d-none");
    panel?.classList.add("d-none");
    return;
  }
  empty?.classList.add("d-none");
  panel?.classList.remove("d-none");
  if ($("drJobId")) $("drJobId").textContent = job.id;
  if ($("drJobStatus")) $("drJobStatus").textContent = job.status;
  const report = {
    ...(job.report || {}),
    error_message: job.error_message || undefined,
  };
  if ($("drJobReport")) $("drJobReport").textContent = JSON.stringify(report, null, 2);
  renderJobSummary(job);
  const blocked = (job.report?.validation?.level || "") === "block";
  const isDerived = _currentJobKind === "derived";
  const canApply = !isDerived && job.status === "ready" && !_busy && !blocked;
  const canCancel =
    !isDerived &&
    !["applied", "cancelled", "applying"].includes(job.status) &&
    !_busy;
  if ($("drApplyBtn")) $("drApplyBtn").disabled = !canApply;
  if ($("drCancelBtn")) $("drCancelBtn").disabled = !canCancel;
}

async function normalizeGeometry(accept) {
  if (!_currentJobId || _busy) return;
  setBusyUi(true);
  setProgress(50, accept ? "Convirtiendo a POINT…" : "Registrando preferencia…", {
    indeterminate: true,
  });
  try {
    const q = accept ? "true" : "false";
    const { res, data, networkError } = await adminFetch(
      `/api/data-refresh/jobs/${encodeURIComponent(_currentJobId)}/normalize-geometry?accept=${q}`,
      { method: "POST", body: "{}" }
    );
    if (networkError || !res) {
      setMsg($("drApplyMsg"), "Error de red al normalizar geometría.", false);
      return;
    }
    if (!res.ok) {
      setMsg(
        $("drApplyMsg"),
        data?.detail?.message || `No se pudo normalizar (HTTP ${res.status})`,
        false
      );
      if (data?.detail?.job) renderJob(data.detail.job);
      return;
    }
    setMsg(
      $("drApplyMsg"),
      accept
        ? "Geometría convertida a POINT."
        : "Conversión declinada; puede aplicar el swap igualmente.",
      true
    );
    renderJob(data.job);
  } finally {
    setBusyUi(false);
  }
}

async function openJob(jobId) {
  const { res, data } = await adminFetch(`/api/data-refresh/jobs/${encodeURIComponent(jobId)}`);
  if (!res?.ok) {
    setMsg($("drApplyMsg"), data?.detail?.message || "Job no encontrado", false);
    return;
  }
  renderJob(data.job);
}

function xhrPostForm(url, formData, { onUploadProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    const token = getAdminToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("X-Atlas-Authorization", `Bearer ${token}`);
    }
    xhr.responseType = "json";
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || typeof onUploadProgress !== "function") return;
      onUploadProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        data: xhr.response && typeof xhr.response === "object" ? xhr.response : null,
      });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.timeout = 0;
    xhr.send(formData);
  });
}

function sleep(ms) {
  return new Promise((r) => {
    _pollTimer = setTimeout(r, ms);
  });
}

async function pollUntilTerminal(jobId) {
  const started = Date.now();
  const maxMs = 12 * 60 * 1000;
  let lastStatus = "";
  let statusSince = Date.now();
  while (Date.now() - started < maxMs) {
    const { res, data } = await adminFetch(`/api/data-refresh/jobs/${encodeURIComponent(jobId)}`);
    if (!res?.ok) {
      throw new Error(data?.detail?.message || `No se pudo consultar job (${res?.status})`);
    }
    const job = data.job;
    if (job.status !== lastStatus) {
      lastStatus = job.status;
      statusSince = Date.now();
    }
    setProgress(progressFromJob(job), labelFromJob(job), {
      indeterminate: ["importing", "comparing"].includes(job.status),
    });
    if (TERMINAL.has(job.status)) return job;
    // comparing no debería pasar de ~1 min con el resumen rápido
    if (job.status === "comparing" && Date.now() - statusSince > 90_000) {
      throw new Error(
        "La comparación lleva demasiado tiempo (posible lock en Postgres). " +
          "Cancele el job, recree api_backend y vuelva a intentar."
      );
    }
    await sleep(1500);
  }
  throw new Error("Tiempo de espera agotado consultando el job. Revise Jobs recientes.");
}

async function uploadAndCompare() {
  if (_busy) return;
  if (_mode === "indicators") {
    await uploadIndicatorCsv();
    return;
  }
  const table = $("drTarget")?.value?.trim();
  const file = $("drFile")?.files?.[0];
  if (!table) {
    setMsg($("drUploadMsg"), "Seleccione una tabla destino.", false);
    return;
  }
  if (!file) {
    setMsg($("drUploadMsg"), "Seleccione un archivo .zip o .shp.", false);
    return;
  }

  setBusyUi(true);
  setProgress(2, "Subiendo archivo…");
  setMsg($("drUploadMsg"), "", true);

  const fd = new FormData();
  fd.append("target_table", table);
  fd.append("file", file, file.name);

  let job = null;
  try {
    const { status, data } = await xhrPostForm(apiUrl("/api/data-refresh/jobs"), fd, {
      onUploadProgress: (ratio) => {
        const pct = Math.round(ratio * 20);
        setProgress(pct, `Subiendo archivo… ${Math.round(ratio * 100)}%`);
      },
    });
    if (status >= 400 || !data?.job) {
      const msg =
        data?.detail?.message ||
        (typeof data?.detail === "string" ? data.detail : null) ||
        data?.message ||
        `HTTP ${status}`;
      throw new Error(msg);
    }
    job = data.job;
    setProgress(progressFromJob(job), labelFromJob(job));
    if (!TERMINAL.has(job.status)) {
      job = await pollUntilTerminal(job.id);
    }
  } catch (err) {
    stopPoll();
    setBusyUi(false);
    setMsg($("drUploadMsg"), err?.message || "Error al subir / comparar.", false);
    await loadJobs();
    return;
  }

  stopPoll();
  setProgress(100, labelFromJob(job));
  setBusyUi(false);
  renderJob(job);
  await loadJobs();

  if (job.status === "failed") {
    setMsg(
      $("drUploadMsg"),
      job.error_message || job.report?.error || "El job falló.",
      false
    );
  } else if (job.status === "ready") {
    setMsg($("drUploadMsg"), "Comparación lista. Revise el informe antes de aplicar.", true);
  } else {
    setMsg($("drUploadMsg"), `Job terminó en estado: ${job.status}`, false);
  }
}

async function uploadIndicatorCsv() {
  const templateId = $("drTemplate")?.value?.trim();
  const file = $("drIndFile")?.files?.[0];
  if (!templateId) {
    setMsg($("drUploadMsg"), "Seleccione una plantilla / indicador.", false);
    return;
  }
  if (!file) {
    setMsg($("drUploadMsg"), "Seleccione un archivo .xlsx o .csv.", false);
    return;
  }
  setBusyUi(true);
  setProgress(10, "Subiendo archivo…");
  setMsg($("drUploadMsg"), "", true);
  const fd = new FormData();
  fd.append("template_id", templateId);
  fd.append("file", file, file.name);
  try {
    const { status, data } = await xhrPostForm(
      apiUrl("/api/data-refresh/indicators/jobs"),
      fd,
      {
        onUploadProgress: (ratio) => {
          setProgress(Math.round(ratio * 40), `Subiendo archivo… ${Math.round(ratio * 100)}%`);
        },
      }
    );
    if (status >= 400 || !data?.job) {
      const msg =
        data?.detail?.message ||
        (typeof data?.detail === "string" ? data.detail : null) ||
        data?.message ||
        `HTTP ${status}`;
      throw new Error(msg);
    }
    setProgress(100, "Validación lista");
    renderJob(data.job);
    await loadJobs();
    setMsg(
      $("drUploadMsg"),
      data.job.report?.summary_line || "CSV validado. Revise el informe antes de aplicar.",
      true
    );
  } catch (err) {
    setMsg($("drUploadMsg"), err?.message || "Error al validar CSV.", false);
    await loadJobs();
  } finally {
    setBusyUi(false);
  }
}

async function applyCurrent() {
  if (!_currentJobId || _busy) return;
  if (_currentJobKind === "derived") {
    setMsg($("drApplyMsg"), "Este job ya está aplicado (recálculo derivado).", false);
    return;
  }
  const kind = _currentJobKind === "indicator" ? "indicator" : "spatial";

  if (
    !confirm(
      kind === "indicator"
        ? "¿Aplicar actualización de indicadores? Solo se actualizarán las columnas del archivo. Se creará un snapshot restaurable (máx. 3)."
        : "¿Aplicar swap a producción? La tabla actual se conservará como versión restaurable (máx. 3)."
    )
  ) {
    return;
  }
  setBusyUi(true);
  setProgress(40, kind === "indicator" ? "Aplicando merge de indicadores…" : "Aplicando swap…", {
    indeterminate: true,
  });
  setMsg($("drApplyMsg"), "", true);
  const path =
    kind === "indicator"
      ? `/api/data-refresh/indicators/jobs/${encodeURIComponent(_currentJobId)}/apply`
      : `/api/data-refresh/jobs/${encodeURIComponent(_currentJobId)}/apply`;
  try {
    const { res, data, networkError } = await adminFetch(path, {
      method: "POST",
      body: "{}",
    });
    if (networkError || !res) {
      setMsg(
        $("drApplyMsg"),
        "Error de red / timeout al aplicar. Revise Jobs recientes.",
        false
      );
      await loadJobs();
      await openJob(_currentJobId);
      return;
    }
    if (data?.job) renderJob(data.job);
    if (!res.ok) {
      const msg =
        data?.detail?.message ||
        (typeof data?.detail === "string" ? data.detail : null) ||
        data?.message ||
        `Fallo al aplicar (HTTP ${res.status})`;
      setMsg($("drApplyMsg"), msg, false);
      return;
    }
    setProgress(100, "Aplicado");
    const tgt = String(data.job?.target_table || "").toLowerCase();
    const needsConteos =
      kind === "spatial" && (tgt === "c_loc_punto" || tgt === "c_denue");
    setMsg(
      $("drApplyMsg"),
      kind === "indicator"
        ? "Indicadores actualizados correctamente."
        : needsConteos
          ? "Swap aplicado. Recuerde recalcular municipio_conteos (tarjeta Tablas derivadas) para actualizar los KPIs del explorador."
          : "Swap aplicado correctamente.",
      true
    );
    if (needsConteos) {
      setMsg(
        $("drDerivedMsg"),
        "Origen actualizado: use «Recalcular municipio_conteos» para refrescar localidades / DENUE del explorador.",
        true
      );
      $("drDerivedConteosBtn")?.focus();
    }
    renderJob(data.job);
    if (kind === "spatial") await loadTargets();
    await loadJobs();
    await loadVersions();
  } finally {
    setBusyUi(false);
    if (_currentJobId) {
      const canApply = $("drJobStatus")?.textContent === "ready";
      if ($("drApplyBtn")) $("drApplyBtn").disabled = !canApply || _busy;
    }
  }
}

async function cancelCurrent() {
  if (!_currentJobId || _busy) return;
  if (_currentJobKind === "derived") {
    setMsg($("drApplyMsg"), "Los jobs derivados no se cancelan (ya son síncronos).", false);
    return;
  }
  const { res, data } = await adminFetch(
    `/api/data-refresh/jobs/${encodeURIComponent(_currentJobId)}/cancel`,
    { method: "POST", body: "{}" }
  );
  if (!res?.ok) {
    setMsg($("drApplyMsg"), data?.detail?.message || "No se pudo cancelar", false);
    return;
  }
  setMsg($("drApplyMsg"), "Job cancelado.", true);
  renderJob(data.job);
  await loadJobs();
}

async function refreshMunicipioConteos() {
  if (_busy) return;
  if (
    !window.confirm(
      "¿Recalcular atlas.municipio_conteos?\n\nActualiza n_localidades y n_denue por municipio (KPIs del explorador). Puede tardar si c_denue es grande."
    )
  ) {
    return;
  }
  setBusyUi(true);
  setProgress(30, "Recalculando municipio_conteos…", { indeterminate: true });
  setMsg($("drDerivedMsg"), "", true);
  try {
    const { res, data, networkError } = await adminFetch(
      "/api/data-refresh/derived/municipio-conteos/refresh",
      { method: "POST", body: "{}" }
    );
    if (networkError || !res) {
      setMsg($("drDerivedMsg"), "Error de red / timeout al recalcular.", false);
      return;
    }
    if (!res.ok) {
      setMsg(
        $("drDerivedMsg"),
        data?.detail?.message || data?.message || `Fallo (HTTP ${res.status})`,
        false
      );
      if (data?.detail?.job) renderJob(data.detail.job);
      return;
    }
    const n = data.municipios_actualizados ?? data.job?.report?.rows_written;
    const sec = data.elapsed_seconds ?? data.job?.report?.elapsed_seconds;
    setProgress(100, "Listo");
    setMsg(
      $("drDerivedMsg"),
      `✓ ${n ?? "—"} municipios procesados · ${sec ?? "—"} s. KPIs del explorador actualizados.`,
      true
    );
    if (data.job) renderJob(data.job);
    await loadJobs();
  } finally {
    setBusyUi(false);
  }
}

async function bootDashboard() {
  const user = getAdminUser();
  if ($("drWelcome")) {
    $("drWelcome").textContent = user?.username
      ? `Sesión: ${user.username}`
      : "Sesión admin activa";
  }
  mountStudioNav($("drStudioNav"), { active: "data-refresh" });
  showLogin(false);
  setMode(_mode);

  const sel = $("drTarget");
  if (sel) sel.innerHTML = `<option value="">Cargando tablas…</option>`;
  const jobsHost = $("drJobsList");
  if (jobsHost) {
    jobsHost.innerHTML = `<p class="small text-muted mb-0">Cargando jobs…</p>`;
  }

  try {
    await loadTargets();
  } catch (err) {
    if (sel) {
      sel.innerHTML = `<option value="">(error al cargar tablas)</option>`;
    }
    setMsg($("drUploadMsg"), err?.message || "No se pudieron listar tablas", false);
  }

  try {
    await loadTemplates();
  } catch (err) {
    const tsel = $("drTemplate");
    if (tsel) {
      tsel.innerHTML = `<option value="">(error al cargar plantillas)</option>`;
    }
    console.warn(err);
  }

  try {
    await loadJobs();
  } catch (err) {
    if (jobsHost) {
      jobsHost.innerHTML = `<tr><td colspan="7" class="text-danger px-2">${escapeHtml(
        err?.message || "Error al listar jobs"
      )}</td></tr>`;
    }
  }
  try {
    await loadVersions();
  } catch (err) {
    const vh = $("drVersionsList");
    if (vh) {
      vh.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(
        err?.message || "Error al listar versiones"
      )}</p>`;
    }
  }
}

async function init() {
  const footer = $("drLoginFooter");
  if (footer) footer.innerHTML = studioLoginFooterHtml("data-refresh");

  $("drLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr($("drLoginError"), "");
    try {
      await loginAdmin($("drUser").value.trim(), $("drPass").value);
      await bootDashboard();
    } catch (err) {
      showErr($("drLoginError"), err.message || String(err));
    }
  });
  $("drLogoutBtn")?.addEventListener("click", () => {
    if (_busy) return;
    clearAdminSession();
    showLogin(true);
  });
  $("drUploadBtn")?.addEventListener("click", () => void uploadAndCompare());
  $("drApplyBtn")?.addEventListener("click", () => void applyCurrent());
  $("drCancelBtn")?.addEventListener("click", () => void cancelCurrent());
  $("drModeSpatial")?.addEventListener("click", () => {
    if (!_busy) setMode("spatial");
  });
  $("drModeIndicators")?.addEventListener("click", () => {
    if (!_busy) setMode("indicators");
  });
  $("drScopeEstatal")?.addEventListener("click", () => {
    if (!_busy) setIndScope("estatal");
  });
  $("drScopeNacional")?.addEventListener("click", () => {
    if (!_busy) setIndScope("nacional");
  });
  $("drMoldBtn")?.addEventListener("click", () => void downloadIndicatorMold());
  $("drSynthBtn")?.addEventListener("click", () => void downloadSyntheticIndicator());
  $("drHistoryRefresh")?.addEventListener("click", () => void loadJobs());
  $("drVersionsRefresh")?.addEventListener("click", () => void loadVersions());
  $("drDerivedConteosBtn")?.addEventListener("click", () => void refreshMunicipioConteos());

  if (isVisorAdminLoggedIn()) {
    try {
      await verifyAdminSession();
    } catch {
      clearAdminSession();
      showLogin(true);
      return;
    }
    await bootDashboard();
  } else {
    showLogin(true);
  }
}

void init();
