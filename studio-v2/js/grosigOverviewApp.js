/**
 * GroSIG Studio 2 — Overview / Control Center (Fase C).
 */
import { apiUrl } from "../../js/atlasConfig.js";
import {
  adminFetch,
  getAdminToken,
  getAdminUser,
} from "../../js/visorAdminAuth.js";
import {
  probeCartographyHealth,
  summarizeCartographyHealth,
} from "../../js/cartographyHealth.js";

const TOP_ROWS = 4;
const ACTIVITY_ROWS = 5;

const $ = (id) => document.getElementById(id);

/** @type {ReturnType<typeof setInterval>|null} */
let _autoRefreshTimer = null;

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

function sessionCveEnt() {
  const user = getAdminUser() || {};
  return String(user.cve_ent || "").padStart(2, "0").slice(-2);
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

async function fetchCatalog(path) {
  const ent = sessionCveEnt();
  const url = new URL(apiUrl(path), window.location.href);
  if (ent) url.searchParams.set("cve_ent", ent);
  const headers = { Accept: "application/json" };
  const token = getAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-Atlas-Authorization"] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: data?.ok !== false, data };
  } catch {
    return { ok: false };
  }
}

function countVisorLayers(data) {
  if (!data) return 0;
  if (Array.isArray(data.layers)) return data.layers.length;
  if (data.layers && typeof data.layers === "object") {
    return Object.keys(data.layers).length;
  }
  return 0;
}

function countIndicators(data) {
  return Array.isArray(data?.indicators) ? data.indicators.length : 0;
}

function countGeographyTabs(data) {
  const tabs = data?.catalog?.tabs ?? data?.tabs;
  return Array.isArray(tabs) ? tabs.length : 0;
}

function countInvSections(data) {
  const cat = data?.catalog;
  if (!cat) return 0;
  if (Array.isArray(cat.indicators)) return cat.indicators.length;
  if (Array.isArray(cat.groups)) return cat.groups.length;
  return 0;
}

function countExplorerItems(data) {
  const cat = data?.catalog;
  if (!cat || typeof cat !== "object") return 0;
  return Object.keys(cat).filter((k) => !["version", "description"].includes(k)).length;
}

function statusTone(ok, degraded = false) {
  if (ok && !degraded) return "success";
  if (ok && degraded) return "warning";
  return "danger";
}

function renderStatusBadge(label, tone) {
  const cls =
    tone === "success"
      ? "gs2-status--success"
      : tone === "warning"
        ? "gs2-status--warning"
        : tone === "info"
          ? "gs2-status--info"
          : tone === "muted"
            ? "gs2-status--muted"
            : "gs2-status--danger";
  return `<span class="gs2-status ${cls}">${escapeHtml(label)}</span>`;
}

function renderHealthItem(name, tone, detail) {
  return `<div class="gs2-health-item">
    <div class="gs2-health-item__label">${escapeHtml(name)}</div>
    ${renderStatusBadge(tone === "success" ? "Operacional" : tone === "warning" ? "Degradado" : "No disponible", tone)}
    ${detail ? `<div class="gs2-health-item__detail">${escapeHtml(detail)}</div>` : ""}
  </div>`;
}

function formatTs(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
    return d.toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function jobStatusTone(status) {
  const s = String(status || "").toLowerCase();
  if (["completed", "ready", "applied", "success", "ok"].includes(s)) return "success";
  if (["running", "queued", "pending", "processing"].includes(s)) return "warning";
  if (["failed", "error", "cancelled", "canceled"].includes(s)) return "danger";
  return "muted";
}

function jobStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  const map = {
    applied: "Aplicado",
    completed: "Completado",
    ready: "Listo",
    running: "En curso",
    queued: "En cola",
    pending: "Pendiente",
    processing: "Procesando",
    failed: "Fallido",
    error: "Error",
    cancelled: "Cancelado",
    canceled: "Cancelado",
  };
  return map[s] || String(status || "—");
}

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isLast30DaysOn() {
  return Boolean($("gs2AnalyticsLast30")?.checked);
}

function analyticsQueryParams() {
  const q = new URLSearchParams();
  if (isLast30DaysOn()) {
    q.set("from", isoDateDaysAgo(30));
    q.set("to", new Date().toISOString().slice(0, 10));
  }
  return q;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value == null ? "—" : String(value);
}

function renderTopTable(tbodyId, rows) {
  const tb = $(tbodyId);
  if (!tb) return;
  if (!rows?.length) {
    tb.innerHTML = '<tr><td colspan="3" style="color:var(--gs2-text-muted)">Sin datos</td></tr>';
    return;
  }
  tb.innerHTML = rows.slice(0, TOP_ROWS)
    .map((r) => {
      const nombre = r.nombre || r.clave || "";
      const clave = r.clave || "";
      return `<tr>
        <td>${escapeHtml(nombre)}</td>
        <td><code>${escapeHtml(clave)}</code></td>
        <td class="gs2-td-num">${r.n ?? 0}</td>
      </tr>`;
    })
    .join("");
}

async function loadSystemHealth() {
  const grid = $("gs2HealthGrid");
  const overall = $("gs2HealthOverall");
  if (!grid) return { criticalOk: false };

  grid.innerHTML = `<span class="gs2-status gs2-status--muted">Comprobando…</span>`;

  const [atlas, amigo, geo, cartoProbe] = await Promise.all([
    probeJson("/api/health"),
    probeJson("/api/amigo/health"),
    probeJson("/api/geography-context/health"),
    probeCartographyHealth({ force: true }),
  ]);

  const atlasOk = Boolean(atlas.ok && atlas.data?.ok !== false);
  const amigoOk = Boolean(amigo.ok && amigo.data?.ok);
  const amigoCore = amigo.data?.core?.ok !== false && amigoOk;
  const geoOn =
    geo.ok &&
    geo.data?.enabled &&
    geo.data?.engine === "grosig-geography-context";
  const cartoSummary = summarizeCartographyHealth(cartoProbe.health);
  const cartoTone = cartoProbe.ok
    ? cartoSummary.status === "degraded"
      ? "warning"
      : "success"
    : "danger";

  const items = [
    renderHealthItem(
      "API Atlas",
      statusTone(atlasOk),
      atlasOk ? "HTTP ok" : `HTTP ${atlas.status || "apagado"}`,
    ),
    renderHealthItem(
      "AMIGO CORE",
      statusTone(amigoCore),
      amigoOk
        ? amigo.data?.core_database || amigo.data?.core?.database || "conectado"
        : amigo.data?.error || "sin conexión",
    ),
    renderHealthItem(
      "Contexto geográfico",
      statusTone(geoOn),
      geoOn ? geo.data?.version || "activo" : "apagado",
    ),
    renderHealthItem(
      "Motor de cartografía",
      cartoTone,
      cartoProbe.ok
        ? `${cartoSummary.statusLabel} · v${cartoSummary.version}`
        : "apagado",
    ),
  ];

  grid.innerHTML = items.join("");

  const criticalOk = atlasOk && amigoCore;
  const anyWarn = cartoTone === "warning" || !geoOn;
  if (overall) {
    overall.className = `gs2-status gs2-status--${criticalOk ? (anyWarn ? "warning" : "success") : "danger"}`;
    overall.textContent = criticalOk
      ? anyWarn
        ? "Operacional con advertencias"
        : "Operacional"
      : "Revisar servicios";
  }

  return { criticalOk, cartoEnabled: cartoProbe.ok, geoOn };
}

async function loadStudioStatus() {
  const host = $("gs2StudioStatus");
  if (!host) return;

  host.innerHTML = `<span class="gs2-status gs2-status--muted">Cargando…</span>`;

  const [visor, indicators, geography, inv, explorer, cartoProbe] =
    await Promise.all([
      fetchCatalog("/api/visor/catalog"),
      fetchCatalog("/api/indicators/catalog"),
      fetchCatalog("/api/geography-context/catalog"),
      fetchCatalog("/api/inv/catalog"),
      fetchCatalog("/api/explorer/catalog"),
      probeCartographyHealth(),
    ]);

  const cartoSummary = summarizeCartographyHealth(cartoProbe.health);

  const rows = [
    {
      name: "Studio Visor",
      tone: visor.ok ? "success" : "danger",
      status: visor.ok ? "Operacional" : "Error catálogo",
      detail: visor.ok ? `${countVisorLayers(visor.data)} capas` : "—",
      href: "./grosig-studio-v2.html?view=visor",
    },
    {
      name: "Studio Indicadores",
      tone: indicators.ok ? "success" : "danger",
      status: indicators.ok ? "Operacional" : "Error catálogo",
      detail: indicators.ok ? `${countIndicators(indicators.data)} indicadores` : "—",
      href: "./indicators-studio.html",
    },
    {
      name: "Studio Geografía",
      tone: geography.ok ? "success" : "muted",
      status: geography.ok ? "Operacional" : "Sin catálogo",
      detail: geography.ok ? `${countGeographyTabs(geography.data)} pestañas` : "—",
      href: "./geography-studio.html",
    },
    {
      name: "Studio INV",
      tone: inv.ok ? "success" : "muted",
      status: inv.ok ? "Operacional" : "Sin catálogo",
      detail: inv.ok ? `${countInvSections(inv.data)} indicadores INV` : "—",
      href: "./inv-studio.html",
    },
    {
      name: "Studio Explorador",
      tone: explorer.ok ? "success" : "muted",
      status: explorer.ok ? "Operacional" : "Sin catálogo",
      detail: explorer.ok ? `${countExplorerItems(explorer.data)} estilos` : "—",
      href: "./explorer-studio.html",
    },
  ];

  if (cartoProbe.ok) {
    rows.push({
      name: "Studio Cartografía",
      tone: cartoSummary.status === "degraded" ? "warning" : "success",
      status: cartoSummary.statusLabel,
      detail: `v${cartoSummary.version} · ${cartoSummary.templatesCount} plantillas`,
      href: "./grosig-studio-v2.html?view=cartography",
    });
  }

  host.innerHTML = `<div class="gs2-table-wrap"><table class="gs2-table">
    <thead><tr><th>Studio</th><th>Estado</th><th>Detalle</th></tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
          <td><a href="${r.href}" class="gs2-btn gs2-btn--ghost gs2-btn--sm" style="padding-left:0">${escapeHtml(r.name)}</a></td>
          <td>${renderStatusBadge(r.status, r.tone)}</td>
          <td class="gs2-td-num">${escapeHtml(r.detail)}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

async function loadRecentActivity() {
  const host = $("gs2RecentActivity");
  if (!host) return;

  host.innerHTML = `<span class="gs2-status gs2-status--muted">Cargando…</span>`;

  try {
    const { res, data } = await adminFetch(`/api/data-refresh/jobs?limit=${ACTIVITY_ROWS}`);
    if (!res?.ok) {
      host.innerHTML = `<p class="gs2-card__body">${escapeHtml(apiMessage(data, "No se pudo cargar actividad"))}</p>`;
      return;
    }
    const jobs = (data.jobs || []).slice(0, ACTIVITY_ROWS);
    if (!jobs.length) {
      host.innerHTML =
        '<p class="gs2-card__body">Sin jobs recientes de actualización de datos.</p>';
      return;
    }
    host.innerHTML = `<div class="gs2-table-wrap"><table class="gs2-table">
      <thead><tr><th>Destino</th><th>Estado</th><th>Fecha</th></tr></thead>
      <tbody>${jobs
        .map((j) => {
          const tone = jobStatusTone(j.status);
          return `<tr>
            <td><code>${escapeHtml(j.target_table || j.id)}</code></td>
            <td>${renderStatusBadge(jobStatusLabel(j.status), tone)}</td>
            <td>${escapeHtml(formatTs(j.created_at || j.updated_at))}</td>
          </tr>`;
        })
        .join("")}</tbody>
    </table></div>
    <div class="gs2-quick-links">
      <a class="gs2-btn gs2-btn--ghost gs2-btn--sm" href="./grosig-studio-v2.html?view=data-refresh">Actualización de datos</a>
    </div>`;
  } catch {
    host.innerHTML =
      '<p class="gs2-card__body">Sin conexión con la API de actualización de datos.</p>';
  }
}

async function loadAnalytics() {
  const errEl = $("gs2AnalyticsError");
  if (errEl) {
    errEl.classList.add("d-none");
    errEl.textContent = "";
  }

  const user = getAdminUser() || {};
  const scopeEl = $("gs2AnalyticsScope");
  if (scopeEl) {
    const name = user.entidad || user.instancia_clave || "";
    const ent = user.cve_ent || "—";
    scopeEl.textContent = name
      ? `${name} (${ent}) · telemetría CORE`
      : `Entidad ${ent} · telemetría CORE`;
  }

  const q = analyticsQueryParams();
  const path = `/api/admin/analytics/summary${q.toString() ? `?${q}` : ""}`;

  try {
    const { res, data } = await adminFetch(path);
    if (!res?.ok) {
      if (errEl) {
        errEl.textContent = apiMessage(data, "No se pudo cargar analítica");
        errEl.classList.remove("d-none");
      }
      return;
    }

    const m = data.metrics || {};
    setText("gs2KpiSessions", m.sessions);
    setText("gs2KpiIndicators", m.indicator_opens);
    setText("gs2KpiLayers", m.layer_activations);
    setText("gs2KpiExports", m.exports);

    const period = data.period || {};
    const pEl = $("gs2AnalyticsPeriod");
    if (pEl) {
      if (isLast30DaysOn()) {
        pEl.textContent = `Últimos 30 días · ${period.from || "?"} → ${period.to || "?"}`;
      } else if (period.historico) {
        const span =
          period.from && period.to
            ? ` (${period.from} → ${period.to})`
            : "";
        pEl.textContent = `Histórico completo${span}`;
      } else {
        pEl.textContent = `${period.from || "?"} → ${period.to || "?"}`;
      }
    }

    renderTopTable("gs2TopIndicadores", data.top_indicadores);
    renderTopTable("gs2TopCapas", data.top_capas);
  } catch {
    if (errEl) {
      errEl.textContent = "Sin conexión con la API de analítica";
      errEl.classList.remove("d-none");
    }
  }
}

async function exportAnalyticsXlsx() {
  const errEl = $("gs2AnalyticsError");
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
      { headers, cache: "no-store" },
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

function markUpdated() {
  const el = $("gs2OverviewUpdated");
  if (el) {
    el.textContent = `Actualizado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
  }
}

export async function refreshOverview() {
  const btn = $("gs2OverviewRefresh");
  btn?.setAttribute("disabled", "true");
  try {
    await Promise.all([
      loadSystemHealth(),
      loadStudioStatus(),
      loadRecentActivity(),
      loadAnalytics(),
    ]);
    markUpdated();
  } finally {
    btn?.removeAttribute("disabled");
  }
}

let _overviewUiBound = false;

export function bindOverviewUi() {
  if (_overviewUiBound) return;
  _overviewUiBound = true;
  $("gs2OverviewRefresh")?.addEventListener("click", () => {
    void refreshOverview();
  });
  $("gs2OverviewExport")?.addEventListener("click", () => {
    void exportAnalyticsXlsx();
  });
  $("gs2AnalyticsLast30")?.addEventListener("change", () => {
    void loadAnalytics();
  });

  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    void refreshOverview();
  }, 5 * 60 * 1000);
}

export function teardownOverview() {
  if (_autoRefreshTimer) {
    clearInterval(_autoRefreshTimer);
    _autoRefreshTimer = null;
  }
}

export async function initOverview() {
  bindOverviewUi();
  await refreshOverview();
}
