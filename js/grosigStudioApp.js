/**
 * GroSIG Studio — home administrativo (hub de Studios).
 */
import { createStudioShell } from "./studioShell.js";
import { apiUrl } from "./atlasConfig.js";
import {
  adminFetch,
  getAdminToken,
  getAdminUser,
} from "./visorAdminAuth.js";
import {
  probeCartographyHealth,
  summarizeCartographyHealth,
} from "./cartographyHealth.js";

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function apiMessage(data, fallback) {
  if (!data) return fallback;
  const d = data.detail;
  if (typeof d === "object" && d) return d.message || d.error || fallback;
  if (typeof d === "string" && d) return d;
  return data.message || fallback;
}

async function probeJson(path) {
  try {
    const res = await fetch(apiUrl(path), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

function pill(label, ok, detail) {
  const cls = ok ? "text-bg-success" : "text-bg-secondary";
  const extra = detail ? ` · ${detail}` : "";
  return `<span class="badge ${cls} grosig-status-pill">${label}${extra}</span>`;
}

async function refreshHealth() {
  const host = $("grosigHealthPills");
  if (!host) return;
  host.innerHTML = `<span class="badge text-bg-secondary grosig-status-pill">Comprobando…</span>`;

  const [atlas, geo, cartoProbe] = await Promise.all([
    probeJson("/api/health"),
    probeJson("/api/geography-context/health"),
    probeCartographyHealth({ force: true }),
  ]);

  const parts = [];
  parts.push(
    pill(
      "Atlas API",
      Boolean(atlas.ok && (atlas.data?.ok !== false)),
      atlas.ok ? "ok" : "off"
    )
  );
  const geoOn =
    geo.ok &&
    geo.data?.enabled &&
    geo.data?.engine === "grosig-geography-context";
  parts.push(pill("Geography Context", geoOn, geoOn ? "enabled" : "off"));

  const cartoSummary = summarizeCartographyHealth(cartoProbe.health);
  const cartoDetail = cartoProbe.ok
    ? `${cartoSummary.statusLabel} · ${cartoSummary.version}`
    : "off";
  parts.push(pill("Cartography Engine", cartoProbe.ok, cartoDetail));
  host.innerHTML = parts.join("");
}

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isDateFilterOn() {
  return Boolean($("grosigAnalyticsDateFilter")?.checked);
}

function syncDateFilterUi() {
  const on = isDateFilterOn();
  const wrap = $("grosigAnalyticsDateWrap");
  const fromEl = $("grosigAnalyticsFrom");
  const toEl = $("grosigAnalyticsTo");
  wrap?.classList.toggle("opacity-50", !on);
  if (fromEl) fromEl.disabled = !on;
  if (toEl) toEl.disabled = !on;
  if (on) {
    if (toEl && !toEl.value) toEl.value = new Date().toISOString().slice(0, 10);
    if (fromEl && !fromEl.value) fromEl.value = isoDateDaysAgo(30);
  }
}

function analyticsQueryParams() {
  const q = new URLSearchParams();
  if (isDateFilterOn()) {
    syncDateFilterUi();
    const from = ($("grosigAnalyticsFrom")?.value || "").trim();
    const to = ($("grosigAnalyticsTo")?.value || "").trim();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
  }
  return q;
}

function renderTopRows(tbodyId, rows) {
  const tb = $(tbodyId);
  if (!tb) return;
  if (!rows || !rows.length) {
    tb.innerHTML = '<tr><td colspan="3" class="text-muted">Sin datos</td></tr>';
    return;
  }
  tb.innerHTML = rows
    .map((r) => {
      const nombre = r.nombre || r.clave || "";
      const clave = r.clave || "";
      return `<tr>
        <td>${escapeHtml(nombre)}</td>
        <td class="small text-muted"><code>${escapeHtml(clave)}</code></td>
        <td class="text-end">${r.n}</td>
      </tr>`;
    })
    .join("");
}

function updateAnalyticsScopeLabel() {
  const user = getAdminUser() || {};
  const ent = user.cve_ent || "—";
  const name = user.entidad || user.instancia_clave || "";
  const el = $("grosigAnalyticsScope");
  if (el) {
    el.textContent = name
      ? `Solo ${name} (${ent}) · lectura en CORE`
      : `Solo entidad ${ent} · lectura en CORE`;
  }
}

async function loadAnalytics() {
  const errEl = $("grosigAnalyticsError");
  if (errEl) {
    errEl.classList.add("d-none");
    errEl.textContent = "";
  }
  syncDateFilterUi();
  updateAnalyticsScopeLabel();
  const q = analyticsQueryParams();
  const path = `/api/admin/analytics/summary${q.toString() ? `?${q}` : ""}`;
  try {
    const { res, data } = await adminFetch(path);
    if (!res || !res.ok) {
      if (errEl) {
        errEl.textContent = apiMessage(data, "No se pudo cargar analítica");
        errEl.classList.remove("d-none");
      }
      return;
    }
    const m = data.metrics || {};
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v == null ? "—" : String(v);
    };
    set("grosigKpiSessions", m.sessions);
    set("grosigKpiIndicators", m.indicator_opens);
    set("grosigKpiLayers", m.layer_activations);
    set("grosigKpiExports", m.exports);
    const period = data.period || {};
    if (isDateFilterOn()) {
      const fromEl = $("grosigAnalyticsFrom");
      const toEl = $("grosigAnalyticsTo");
      if (fromEl && period.from) fromEl.value = period.from;
      if (toEl && period.to) toEl.value = period.to;
    }
    const pEl = $("grosigAnalyticsPeriod");
    if (pEl) {
      if (period.historico) {
        const span =
          period.from && period.to
            ? ` (datos desde ${period.from} hasta ${period.to})`
            : "";
        pEl.textContent = `Histórico completo${span} · uso del portal (CORE)`;
      } else {
        pEl.textContent = `Periodo ${period.from || "?"} → ${period.to || "?"} · uso del portal (CORE)`;
      }
    }
    const scope = data.scope || {};
    if (scope.cve_ent) {
      const sc = $("grosigAnalyticsScope");
      if (sc) {
        const label = scope.entidad || scope.instancia_clave || "";
        sc.textContent = label
          ? `Solo ${label} (${scope.cve_ent}) · lectura en CORE`
          : `Solo entidad ${scope.cve_ent} · lectura en CORE`;
      }
    }
    renderTopRows("grosigTopIndicadores", data.top_indicadores);
    renderTopRows("grosigTopCapas", data.top_capas);
  } catch {
    if (errEl) {
      errEl.textContent = "Sin conexión con la API de analítica";
      errEl.classList.remove("d-none");
    }
  }
}

async function exportAnalyticsXlsx() {
  const errEl = $("grosigAnalyticsError");
  if (errEl) {
    errEl.classList.add("d-none");
    errEl.textContent = "";
  }
  const q = analyticsQueryParams();
  try {
    const headers = new Headers();
    const token = getAdminToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("X-Atlas-Authorization", `Bearer ${token}`);
    }
    const res = await fetch(
      apiUrl(`/api/admin/analytics/export.xlsx?${q.toString()}`),
      { headers, cache: "no-store" }
    );
    if (!res.ok) {
      let msg = "No se pudo exportar";
      try {
        const err = await res.json();
        msg = apiMessage(err, msg);
      } catch {
        /* ignore */
      }
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove("d-none");
      }
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") || "";
    const m = /filename="([^"]+)"/.exec(cd);
    const name = (m && m[1]) || "amigo_telemetria.xlsx";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    if (errEl) {
      errEl.textContent = "Sin conexión al exportar XLSX";
      errEl.classList.remove("d-none");
    }
  }
}

function bindAnalyticsUi() {
  $("grosigAnalyticsRefresh")?.addEventListener("click", () => void loadAnalytics());
  $("grosigAnalyticsExport")?.addEventListener("click", () => void exportAnalyticsXlsx());
  $("grosigAnalyticsDateFilter")?.addEventListener("change", () => {
    syncDateFilterUi();
    void loadAnalytics();
  });
  $("grosigAnalyticsFrom")?.addEventListener("change", () => {
    if (isDateFilterOn()) void loadAnalytics();
  });
  $("grosigAnalyticsTo")?.addEventListener("change", () => {
    if (isDateFilterOn()) void loadAnalytics();
  });
  document.querySelectorAll("#grosigDashboard .nodo-date-input").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.disabled) return;
      try {
        if (typeof el.showPicker === "function") el.showPicker();
      } catch {
        /* ignore */
      }
    });
  });
  syncDateFilterUi();
}

async function onEnterDashboard() {
  await refreshHealth();
  await loadAnalytics();
}

async function init() {
  bindAnalyticsUi();
  const shell = createStudioShell(
    {
      loginView: "grosigLoginView",
      dashboard: "grosigDashboard",
      loginForm: "grosigLoginForm",
      entidad: "grosigEntidad",
      user: "grosigUser",
      pass: "grosigPass",
      loginError: "grosigLoginError",
      loginFooter: "grosigLoginFooter",
      logoutBtn: "grosigLogoutBtn",
      nav: "grosigStudioNav",
      welcome: "grosigWelcome",
    },
    {
      activeNav: "hub",
      onEnterDashboard: () => onEnterDashboard(),
    }
  );
  await shell.boot();
}

void init();
