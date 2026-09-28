import { apiUrl } from "./atlasConfig.js";
import { initThemeSelector, readStoredTheme } from "./theme.js";
import {
  KIT_GRO_PANEL_INNER_HTML,
  mountKitGroPanel,
  nodoKitGroEndpoints,
} from "./kitGroStudio.js";

if (!document.getElementById("gs2Dashboard")) {
  document.documentElement.setAttribute("data-theme", readStoredTheme());
  initThemeSelector();
}

const TOKEN_KEY = "grosigNodoSuperadminToken";
const USER_KEY = "grosigNodoSuperadminUser";

const hints = [
  "1 / 5 — Entidad",
  "2 / 5 — Identidad",
  "3 / 5 — Provisionamiento",
  "4 / 5 — Administrador inicial",
  "5 / 5 — Validar y crear",
];

let step = 1;
let entidades = [];
let _nodoKitGroModal = null;

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function apiMessage(data, fallback) {
  if (!data) return fallback;
  const d = data.detail;
  if (d && typeof d === "object") return d.message || d.error || fallback;
  if (typeof d === "string") return d;
  return data.message || fallback;
}

function martinReconcileHint(martin) {
  if (!martin || typeof martin !== "object") return "";
  const federated = Array.isArray(martin.federated) ? martin.federated : [];
  const dbs = federated.map((f) => f.database_name).filter(Boolean).join(", ");
  const dbsBit = dbs ? ` Conexiones federadas: ${dbs}.` : "";
  const st = String(martin.status || "");
  const restarted = Boolean(martin.restart?.thematic?.ok);
  if (st === "RESTART_REQUIRED") {
    return ` YAML Martin actualizado.${dbsBit} Reinicia martin_thematic si el visor MVT no lista la entidad.`;
  }
  if (st === "MARTIN_UNHEALTHY") {
    return ` YAML escrito.${dbsBit} martin_thematic no arrancó (revisa logs: DSN / YAML).`;
  }
  if (restarted) {
    return ` YAML Martin + martin_thematic reiniciado.${dbsBit}`;
  }
  if (st === "RECONCILED" || st === "ALREADY_RECONCILED") {
    return ` YAML Martin reconciliado.${dbsBit}`;
  }
  if (martin.error) return ` Martin: ${martin.error}`;
  return "";
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

async function nodoFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Atlas-Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(apiUrl(path), { ...options, headers, cache: "no-store" });
  let data = null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) data = await res.json();
  return { res, data };
}

function selectedEntity() {
  const cve = document.getElementById("nodoEnt").value;
  return entidades.find((e) => String(e.cve_ent) === cve) || null;
}

function fillIdentity() {
  const e = selectedEntity();
  if (!e || !e.suggested) return;
  const s = e.suggested;
  document.getElementById("nodoClave").value = s.clave;
  document.getElementById("nodoNombre").value = s.nombre;
  document.getElementById("nodoDb").value = s.database_name;
  document.getElementById("nodoKey").value = s.connection_key;
}

function payload() {
  return {
    cve_ent: document.getElementById("nodoEnt").value,
    clave: document.getElementById("nodoClave").value.trim().toUpperCase(),
    nombre: document.getElementById("nodoNombre").value.trim(),
    database_name: document.getElementById("nodoDb").value.trim(),
    connection_key: document.getElementById("nodoKey").value.trim().toLowerCase(),
    modo: document.getElementById("nodoModo").value,
    admin_username: document.getElementById("nodoAdminUser").value.trim(),
    admin_password: document.getElementById("nodoAdminPass").value,
    admin_display_name: document.getElementById("nodoAdminDisplay").value.trim(),
  };
}

function renderStep() {
  document.getElementById("nodoStepHint").textContent = hints[step - 1];
  for (let i = 1; i <= 5; i += 1) {
    document.getElementById(`nodoStep${i}`).classList.toggle("d-none", i !== step);
  }
  document.getElementById("nodoPrevBtn").disabled = step === 1;
  document.getElementById("nodoNextBtn").textContent = step === 5 ? "Crear instancia" : "Siguiente";
  if (step === 2) fillIdentity();
  if (step === 5) {
    const p = payload();
    const safe = { ...p, admin_password: p.admin_password ? "••••" : "" };
    document.getElementById("nodoResumen").textContent = JSON.stringify(safe, null, 2);
  }
}

async function loadLists() {
  const ents = await nodoFetch("/api/amigo/nodo/entidades");
  const inst = await nodoFetch("/api/amigo/nodo/instancias");
  if (ents.res.status === 401) {
    clearSession();
    gate();
    return;
  }
  entidades = (ents.data && ents.data.entidades) || [];
  document.getElementById("nodoEnt").innerHTML = entidades
    .filter((e) => !e.has_instance)
    .map((e) => `<option value="${e.cve_ent}">[${e.cve_ent}] ${e.nomgeo || ""}</option>`)
    .join("");
  const rows = (inst.data && inst.data.instancias) || [];
  fillAnalyticsEntSelect(rows);
  document.getElementById("nodoInstanciasBody").innerHTML = rows
    .map((r) => {
      const inact = String(r.estado || "").toUpperCase() === "INACTIVA";
      const kit = `<button type="button" class="btn btn-sm btn-outline-primary" data-kit="${r.cve_ent}">Kit XLSX</button>`;
      const seedGro = `<button type="button" class="btn btn-sm btn-outline-info" data-seed-gro="${r.cve_ent}" title="Kit Base: sembrar o borrar catálogos">Kit Base…</button>`;
      const repair = `<button type="button" class="btn btn-sm btn-outline-secondary" data-repair="${r.cve_ent}" title="Schema tiles + GRANT grosig_martin (no borra datos)">Reparar Martin</button>`;
      const btn = inact
        ? `<button type="button" class="btn btn-sm btn-outline-success" data-act="PILOTO" data-ent="${r.cve_ent}">Reactivar</button>`
        : `<button type="button" class="btn btn-sm btn-outline-warning" data-act="INACTIVA" data-ent="${r.cve_ent}">Despublicar</button>`;
      return `<tr>
        <td>${r.cve_ent}</td>
        <td>${r.clave || ""}</td>
        <td>${r.estado || ""}</td>
        <td><code>${r.database_name || ""}</code></td>
        <td class="text-nowrap">${kit} ${seedGro} ${repair} ${btn}</td>
      </tr>`;
    })
    .join("");
  await loadAnalytics();
}

function fillAnalyticsEntSelect(instancias) {
  const sel = document.getElementById("nodoAnalyticsEnt");
  if (!sel) return;
  const cur = sel.value;
  const opts = ['<option value="">Nacional (todas)</option>'];
  for (const r of instancias || []) {
    const ent = String(r.cve_ent || "").padStart(2, "0");
    opts.push(
      `<option value="${ent}">[${ent}] ${r.nombre || r.clave || ""}</option>`
    );
  }
  sel.innerHTML = opts.join("");
  if (cur && [...sel.options].some((o) => o.value === cur)) {
    sel.value = cur;
  }
}

function renderTopRows(tbodyId, rows) {
  const tb = document.getElementById(tbodyId);
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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isDateFilterOn() {
  return Boolean(document.getElementById("nodoAnalyticsDateFilter")?.checked);
}

function syncDateFilterUi() {
  const on = isDateFilterOn();
  const wrap = document.getElementById("nodoAnalyticsDateWrap");
  const fromEl = document.getElementById("nodoAnalyticsFrom");
  const toEl = document.getElementById("nodoAnalyticsTo");
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
  const ent = (document.getElementById("nodoAnalyticsEnt")?.value || "").trim();
  if (ent) q.set("cve_ent", ent);
  if (isDateFilterOn()) {
    syncDateFilterUi();
    const from = (document.getElementById("nodoAnalyticsFrom")?.value || "").trim();
    const to = (document.getElementById("nodoAnalyticsTo")?.value || "").trim();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
  }
  return q;
}

function setNodoTab(tab) {
  const analitica = tab === "analitica";
  document.getElementById("nodoPaneAnalitica")?.classList.toggle("d-none", !analitica);
  document.getElementById("nodoPaneInstancias")?.classList.toggle("d-none", analitica);
  const btnA = document.getElementById("nodoTabAnaliticaBtn");
  const btnI = document.getElementById("nodoTabInstanciasBtn");
  btnA?.classList.toggle("active", analitica);
  btnI?.classList.toggle("active", !analitica);
  if (btnA) btnA.setAttribute("aria-selected", analitica ? "true" : "false");
  if (btnI) btnI.setAttribute("aria-selected", analitica ? "false" : "true");
  if (analitica) void loadAnalytics();
}

async function loadAnalytics() {
  const errEl = document.getElementById("nodoAnalyticsError");
  if (errEl) {
    errEl.classList.add("d-none");
    errEl.textContent = "";
  }
  syncDateFilterUi();
  const q = analyticsQueryParams();
  const path = `/api/amigo/nodo/analytics/summary${q.toString() ? `?${q}` : ""}`;
  try {
    const { res, data } = await nodoFetch(path);
    if (res.status === 401) {
      clearSession();
      gate();
      return;
    }
    if (!res.ok) {
      if (errEl) {
        errEl.textContent = apiMessage(data, "No se pudo cargar analítica");
        errEl.classList.remove("d-none");
      }
      return;
    }
    const m = data.metrics || {};
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v == null ? "—" : String(v);
    };
    set("nodoKpiSessions", m.sessions);
    set("nodoKpiIndicators", m.indicator_opens);
    set("nodoKpiLayers", m.layer_activations);
    set("nodoKpiExports", m.exports);
    const period = data.period || {};
    if (isDateFilterOn()) {
      const fromEl = document.getElementById("nodoAnalyticsFrom");
      const toEl = document.getElementById("nodoAnalyticsTo");
      if (fromEl && period.from) fromEl.value = period.from;
      if (toEl && period.to) toEl.value = period.to;
    }
    const pEl = document.getElementById("nodoAnalyticsPeriod");
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
    renderTopRows("nodoTopIndicadores", data.top_indicadores);
    renderTopRows("nodoTopCapas", data.top_capas);
  } catch {
    if (errEl) {
      errEl.textContent = "Sin conexión con la API de analítica";
      errEl.classList.remove("d-none");
    }
  }
}

async function exportAnalyticsXlsx() {
  const errEl = document.getElementById("nodoAnalyticsError");
  if (errEl) {
    errEl.classList.add("d-none");
    errEl.textContent = "";
  }
  const q = analyticsQueryParams();
  try {
    const headers = new Headers();
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("X-Atlas-Authorization", `Bearer ${token}`);
    }
    const res = await fetch(
      apiUrl(`/api/amigo/nodo/analytics/export.xlsx?${q.toString()}`),
      { headers, cache: "no-store" }
    );
    if (res.status === 401) {
      clearSession();
      gate();
      return;
    }
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

function gate() {
  const token = getToken();
  document.getElementById("nodoLoginView")?.classList.toggle("d-none", Boolean(token));
  document.getElementById("nodoDashboard")?.classList.toggle("d-none", !token);
  if (!token) return;
  let user = {};
  try {
    user = JSON.parse(sessionStorage.getItem(USER_KEY) || "{}");
  } catch {
    user = {};
  }
  const welcome = document.getElementById("nodoWelcome");
  if (welcome) {
    welcome.textContent = `${user.display_name || user.username || ""} · SuperAdmin`;
  }
  loadLists();
}

function wireNodoStudioUi() {
  document.getElementById("nodoLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showError("nodoLoginError", "");
    try {
      const { res, data } = await nodoFetch("/api/amigo/nodo/login", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("nodoUser").value,
          password: document.getElementById("nodoPass").value,
        }),
      });
      if (!res.ok) {
        showError("nodoLoginError", apiMessage(data, "No se pudo entrar"));
        return;
      }
      setSession(data.token, data.user);
      gate();
    } catch {
      showError("nodoLoginError", "Sin conexión con la API");
    }
  });

  document.getElementById("nodoLogoutBtn")?.addEventListener("click", () => {
    clearSession();
    gate();
  });

  document.getElementById("nodoAnalyticsRefresh")?.addEventListener("click", () => {
    void loadAnalytics();
  });
  document.getElementById("nodoAnalyticsEnt")?.addEventListener("change", () => {
    void loadAnalytics();
  });
  document.getElementById("nodoAnalyticsFrom")?.addEventListener("change", () => {
    if (isDateFilterOn()) void loadAnalytics();
  });
  document.getElementById("nodoAnalyticsTo")?.addEventListener("change", () => {
    if (isDateFilterOn()) void loadAnalytics();
  });
  document.getElementById("nodoAnalyticsDateFilter")?.addEventListener("change", () => {
    syncDateFilterUi();
    void loadAnalytics();
  });
  document.getElementById("nodoAnalyticsExport")?.addEventListener("click", () => {
    void exportAnalyticsXlsx();
  });
  document.getElementById("nodoMainTabs")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-nodo-tab]");
    if (!btn) return;
    setNodoTab(btn.getAttribute("data-nodo-tab") || "analitica");
  });
  document.querySelectorAll(".nodo-date-input").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.disabled) return;
      try {
        if (typeof el.showPicker === "function") el.showPicker();
      } catch {
        /* ignore */
      }
    });
  });

  document.getElementById("nodoPrevBtn")?.addEventListener("click", () => {
    if (step > 1) {
      step -= 1;
      renderStep();
    }
  });

  document.getElementById("nodoNextBtn")?.addEventListener("click", async () => {
    showError("nodoWizardError", "");
    if (step < 5) {
      if (step === 1 && !document.getElementById("nodoEnt").value) {
        showError("nodoWizardError", "Elija una entidad sin instancia.");
        return;
      }
      if (step === 4) {
        const u = document.getElementById("nodoAdminUser").value.trim();
        const p = document.getElementById("nodoAdminPass").value;
        if (u.length < 2 || p.length < 8) {
          showError("nodoWizardError", "Usuario ≥ 2 caracteres y contraseña ≥ 8.");
          return;
        }
      }
      step += 1;
      renderStep();
      return;
    }
    const btn = document.getElementById("nodoNextBtn");
    btn.disabled = true;
    btn.textContent = "Creando…";
    try {
      const { res, data } = await nodoFetch("/api/amigo/nodo/instancias", {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      const box = document.getElementById("nodoChecks");
      box.classList.remove("d-none");
      if (!res.ok) {
        showError("nodoWizardError", apiMessage(data, "Falló el provisionamiento"));
        box.textContent = JSON.stringify(data, null, 2);
        return;
      }
      box.textContent = JSON.stringify(data.checks, null, 2);
      step = 1;
      await loadLists();
    } catch {
      showError("nodoWizardError", "Sin conexión con la API");
    } finally {
      btn.disabled = false;
      renderStep();
    }
  });

  document.getElementById("nodoInstanciasBody")?.addEventListener("click", async (ev) => {
    const kitBtn = ev.target.closest("button[data-kit]");
    if (kitBtn) {
      const ent = kitBtn.getAttribute("data-kit");
      try {
        const headers = new Headers();
        const token = getToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
          headers.set("X-Atlas-Authorization", `Bearer ${token}`);
        }
        const res = await fetch(apiUrl(`/api/amigo/nodo/instancias/${ent}/kit-xlsx`), {
          headers,
          cache: "no-store",
        });
        if (!res.ok) {
          let msg = "No se pudo generar el kit";
          try {
            const err = await res.json();
            msg = apiMessage(err, msg);
          } catch {
            /* ignore */
          }
          window.alert(msg);
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("content-disposition") || "";
        const m = /filename="([^"]+)"/.exec(cd);
        const name = (m && m[1]) || `AMIGO_kit_captura_${ent}.xlsx`;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        window.alert("Sin conexión con la API");
      }
      return;
    }
    const seedGroBtn = ev.target.closest("button[data-seed-gro]");
    if (seedGroBtn) {
      openNodoKitGroModal(seedGroBtn.getAttribute("data-seed-gro"));
      return;
    }
    const repairBtn = ev.target.closest("button[data-repair]");
    if (repairBtn) {
      const ent = repairBtn.getAttribute("data-repair");
      repairBtn.disabled = true;
      try {
        const out = await nodoFetch(`/api/amigo/nodo/instancias/${ent}/repair`, { method: "POST" });
        if (!out.res.ok) {
          window.alert(apiMessage(out.data, "No se pudo reparar Martin en la instancia"));
          return;
        }
        window.alert(
          `Listo ${ent}: schema tiles + grants Martin (${(out.data && out.data.martin_grants) ?? "ok"}).${martinReconcileHint(out.data && out.data.martin)} La instancia sigue publicada.`
        );
      } catch {
        window.alert("Sin conexión con la API");
      } finally {
        repairBtn.disabled = false;
      }
      return;
    }
    const btn = ev.target.closest("button[data-ent]");
    if (!btn) return;
    await nodoFetch(`/api/amigo/nodo/instancias/${btn.getAttribute("data-ent")}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado: btn.getAttribute("data-act") }),
    });
    await loadLists();
  });
}

function openNodoKitGroModal(cve_ent) {
  const ent = String(cve_ent || "").padStart(2, "0");
  if (ent === "12") {
    window.alert("Guerrero ya usa catálogos globales del nodo.");
    return;
  }
  const modalEl = document.getElementById("nodoKitGroModal");
  const panel = document.getElementById("nodoKitGroPanel");
  const title = document.getElementById("nodoKitGroModalLabel");
  if (!modalEl || !panel) return;
  if (modalEl.parentElement !== document.body) {
    document.body.appendChild(modalEl);
  }
  if (title) title.textContent = `Kit Base · entidad ${ent}`;
  panel.innerHTML = KIT_GRO_PANEL_INNER_HTML;
  mountKitGroPanel(panel, {
    ...nodoKitGroEndpoints(ent),
    fetchFn: nodoFetch,
  });
  if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
    _nodoKitGroModal = bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: true,
      focus: true,
      keyboard: true,
    });
    _nodoKitGroModal.show();
  } else {
    modalEl.classList.add("show");
    modalEl.style.display = "block";
  }
}

/** Shell v2 — enlazar UI tras montar panel en #gs2StudioMount */
export function bindNodoStudioUi() {
  wireNodoStudioUi();
}

/** Shell v2 — sesión Nodo + analítica / instancias */
export function enterNodoStudioDashboard() {
  syncDateFilterUi();
  renderStep();
  gate();
}

/** Shell v2 — cerrar modal Kit Base al cambiar de vista */
export function teardownNodoStudioUi() {
  if (_nodoKitGroModal) {
    try {
      _nodoKitGroModal.hide();
    } catch {
      /* ignore */
    }
  }
}

if (document.getElementById("nodoLoginForm") && !document.getElementById("gs2Dashboard")) {
  wireNodoStudioUi();
  syncDateFilterUi();
  renderStep();
  gate();
}
