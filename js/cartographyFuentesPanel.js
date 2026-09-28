/**
 * Cartography Studio — Fuentes (UX amigable).
 * Combos carpeta + capa; source_id y etiqueta se arman solos.
 */
import * as api from "./cartographyProductApi.js";

const $ = (id) => document.getElementById(id);

const state = {
  sources: [],
  overridesSummary: null,
  cveEnt: "12",
  bound: false,
  discover: { schemas: [], tables: [], ok: false, error: null },
  labelTouched: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showMsg(kind, msg) {
  const err = $("cartoFuentesError");
  const ok = $("cartoFuentesOk");
  if (err) {
    err.classList.toggle("d-none", kind !== "error" || !msg);
    err.textContent = kind === "error" ? msg || "" : "";
  }
  if (ok) {
    ok.classList.toggle("d-none", kind !== "ok" || !msg);
    ok.textContent = kind === "ok" ? msg || "" : "";
  }
}

function originLabel(origin) {
  if (origin === "managed") return "Incorporada";
  if (origin === "builtin") return "Del sistema";
  return origin || "—";
}

function geomLabel(kind) {
  const k = String(kind || "auto");
  if (k === "point") return "Puntos";
  if (k === "line") return "Líneas";
  if (k === "polygon") return "Áreas";
  return "Auto";
}

function selectedDiscoverRow() {
  const schema = $("cartoFuentesSchema")?.value || "";
  const table = $("cartoFuentesTable")?.value || "";
  if (!schema || !table) return null;
  return (
    (state.discover.tables || []).find(
      (t) => t.schema === schema && t.table === table
    ) || null
  );
}

function updatePreviewFromCombos() {
  const row = selectedDiscoverRow();
  const preview = $("cartoFuentesPreviewId");
  if (!row) {
    if (preview) preview.textContent = "Identificador: —";
    return;
  }
  if (preview) {
    preview.innerHTML = `Identificador: <code>${escapeHtml(row.source_id)}</code>`;
  }
  if (!state.labelTouched && $("cartoFuentesNewLabel")) {
    $("cartoFuentesNewLabel").value = row.label || "";
  }
  if ($("cartoFuentesNewGeom") && row.geom_kind) {
    const g = row.geom_kind;
    const sel = $("cartoFuentesNewGeom");
    if ([...sel.options].some((o) => o.value === g)) sel.value = g;
  }
}

function fillSchemaCombo() {
  const sel = $("cartoFuentesSchema");
  if (!sel) return;
  const schemas = state.discover.schemas || [];
  const cur = sel.value;
  sel.innerHTML = schemas.length
    ? `<option value="">— Elija carpeta —</option>${schemas
        .map(
          (s) =>
            `<option value="${escapeHtml(s.schema)}">${escapeHtml(
              s.label || s.schema
            )}</option>`
        )
        .join("")}`
    : `<option value="">Sin carpetas</option>`;
  if (cur && schemas.some((s) => s.schema === cur)) sel.value = cur;
}

function fillTableCombo() {
  const sel = $("cartoFuentesTable");
  const schema = $("cartoFuentesSchema")?.value || "";
  if (!sel) return;
  if (!schema) {
    sel.innerHTML = `<option value="">Elija carpeta primero…</option>`;
    updatePreviewFromCombos();
    return;
  }
  const showReg = Boolean($("cartoFuentesShowRegistered")?.checked);
  const rows = (state.discover.tables || []).filter((t) => {
    if (t.schema !== schema) return false;
    if (!showReg && t.already_registered) return false;
    return true;
  });
  if (!rows.length) {
    sel.innerHTML = showReg
      ? `<option value="">No hay capas en esta carpeta</option>`
      : `<option value="">No hay capas nuevas (marque «ya incorporadas» para ver todas)</option>`;
    updatePreviewFromCombos();
    return;
  }
  const cur = sel.value;
  sel.innerHTML = `<option value="">— Elija capa —</option>${rows
    .map((t) => {
      const mark = t.already_registered ? " · ya en catálogo" : "";
      const geom = t.geom_kind && t.geom_kind !== "auto" ? ` · ${geomLabel(t.geom_kind)}` : "";
      return `<option value="${escapeHtml(t.table)}">${escapeHtml(
        t.label || t.table
      )}${escapeHtml(geom)}${escapeHtml(mark)}</option>`;
    })
    .join("")}`;
  if (cur && rows.some((r) => r.table === cur)) sel.value = cur;
  else sel.selectedIndex = 0;
  updatePreviewFromCombos();
}

function renderCatalog() {
  const host = $("cartoFuentesCatalog");
  if (!host) return;
  if (!state.sources.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Aún no hay capas en el catálogo.</p>`;
    return;
  }

  const groups = {
    managed: { title: "Incorporadas por usted", rows: [] },
    builtin_on: { title: "Del sistema (activas)", rows: [] },
    builtin_off: { title: "Del sistema (desactivadas)", rows: [] },
  };
  for (const s of state.sources) {
    const origin = s.origin || (s.in_code_allowlist ? "builtin" : "managed");
    const on = s.enabled !== false;
    if (origin === "managed") groups.managed.rows.push(s);
    else if (on) groups.builtin_on.rows.push(s);
    else groups.builtin_off.rows.push(s);
  }

  host.innerHTML = Object.values(groups)
    .filter((g) => g.rows.length)
    .map((g) => {
      const rows = g.rows
        .map((s) => {
          const id = s.source_id || "";
          const origin = s.origin || (s.in_code_allowlist ? "builtin" : "managed");
          const on = s.enabled !== false;
          const name = s.label || id;
          const actions =
            origin === "managed"
              ? `<button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 carto-ds-del" data-id="${escapeHtml(
                  id
                )}">Quitar</button>`
              : on
                ? `<button type="button" class="btn btn-outline-warning btn-sm py-0 px-2 carto-ds-off" data-id="${escapeHtml(
                    id
                  )}">Dejar de usar</button>`
                : `<button type="button" class="btn btn-outline-success btn-sm py-0 px-2 carto-ds-on" data-id="${escapeHtml(
                    id
                  )}">Volver a usar</button>`;
          return `<tr class="${on ? "" : "table-secondary"}">
          <td>
            <div class="fw-semibold">${escapeHtml(name)}</div>
            <div class="text-muted" style="font-size:0.75rem">${escapeHtml(
              originLabel(origin)
            )}</div>
          </td>
          <td class="text-nowrap">${on ? "Disponible" : "No disponible"}</td>
          <td class="text-end">${actions}</td>
        </tr>`;
        })
        .join("");
      return `<div class="mb-3">
        <div class="fw-semibold small mb-1">${escapeHtml(g.title)} (${g.rows.length})</div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead><tr><th>Capa</th><th>Estado</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    })
    .join("");

  host.querySelectorAll(".carto-ds-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!window.confirm("¿Quitar esta capa del catálogo de productos?")) return;
      void api
        .deleteDatasource(id)
        .then(() => refreshAll())
        .then(() => showMsg("ok", "Capa quitada del catálogo"))
        .catch((e) => showMsg("error", e.message || String(e)));
    });
  });
  host.querySelectorAll(".carto-ds-off").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      void api
        .deleteDatasource(id)
        .then(() => refreshAll())
        .then(() => showMsg("ok", "Capa dejada de usar (puede reactivarla)"))
        .catch((e) => showMsg("error", e.message || String(e)));
    });
  });
  host.querySelectorAll(".carto-ds-on").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      void api
        .updateDatasource(id, { enabled: true })
        .then(() => refreshAll())
        .then(() => showMsg("ok", "Capa disponible de nuevo"))
        .catch((e) => showMsg("error", e.message || String(e)));
    });
  });
}

async function onRegisterSource() {
  showMsg();
  const row = selectedDiscoverRow();
  if (!row) {
    showMsg("error", "Elija carpeta y capa en los menús");
    return;
  }
  if (row.already_registered) {
    showMsg("error", "Esa capa ya está en el catálogo");
    return;
  }
  const label =
    $("cartoFuentesNewLabel")?.value?.trim() || row.label || row.table;
  const body = {
    source_id: row.source_id,
    label,
    geom_kind: $("cartoFuentesNewGeom")?.value || row.geom_kind || "auto",
    verify: true,
    enabled: true,
  };
  const res = await api.registerDatasource(body);
  state.labelTouched = false;
  if ($("cartoFuentesNewLabel")) $("cartoFuentesNewLabel").value = "";
  await refreshAll();
  showMsg(
    "ok",
    `Listo: «${res.source?.label || label}» ya puede usarse en Productos / Custom`
  );
}

function renderDisableChecks(disabledSet) {
  const host = $("cartoFuentesDisabled");
  if (!host) return;
  const active = state.sources.filter((s) => s.enabled !== false);
  host.innerHTML = active
    .map((s) => {
      const id = s.source_id;
      const name = s.label || id;
      const checked = disabledSet.has(id) ? "checked" : "";
      return `<div class="form-check">
        <input class="form-check-input carto-fuentes-dis" type="checkbox" value="${escapeHtml(
          id
        )}" id="fd_${escapeHtml(id)}" ${checked} />
        <label class="form-check-label small" for="fd_${escapeHtml(id)}">
          ${escapeHtml(name)}
        </label>
      </div>`;
    })
    .join("");
}

function aliasesToText(aliases) {
  const lines = [];
  for (const [from, to] of Object.entries(aliases || {})) {
    lines.push(`${from} => ${to}`);
  }
  return lines.join("\n");
}

function textToAliases(text) {
  const out = {};
  String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const m = line.split(/\s*=>\s*|\s*=\s*/);
      if (m.length >= 2) {
        const from = m[0].trim();
        const to = m.slice(1).join("=").trim();
        if (from && to) out[from] = to;
      }
    });
  return out;
}

async function loadOverrideForm() {
  const cve = ($("cartoFuentesCveEnt")?.value || state.cveEnt || "12").trim();
  state.cveEnt = cve;
  const data = await api.getInstanceOverride(cve);
  const ov = data?.override || {};
  if ($("cartoFuentesLabel")) $("cartoFuentesLabel").value = ov.label || "";
  const disabled = new Set(ov.disabled_sources || []);
  renderDisableChecks(disabled);
  if ($("cartoFuentesAliases")) {
    $("cartoFuentesAliases").value = aliasesToText(ov.table_aliases || {});
  }
}

async function onSaveOverride() {
  showMsg();
  const cve = ($("cartoFuentesCveEnt")?.value || "").trim();
  if (!/^\d{1,3}$/.test(cve)) {
    showMsg("error", "Entidad inválida (use código numérico, ej. 12)");
    return;
  }
  const disabled = [];
  document.querySelectorAll(".carto-fuentes-dis:checked").forEach((cb) => {
    disabled.push(cb.value);
  });
  const body = {
    label: $("cartoFuentesLabel")?.value?.trim() || undefined,
    disabled_sources: disabled,
    table_aliases: textToAliases($("cartoFuentesAliases")?.value),
  };
  await api.putInstanceOverride(cve, body);
  showMsg("ok", `Ajustes guardados para la entidad ${cve}`);
  await refreshAll();
}

async function onDeleteOverride() {
  showMsg();
  const cve = ($("cartoFuentesCveEnt")?.value || "").trim();
  if (!cve) return;
  if (!window.confirm(`¿Borrar ajustes especiales de la entidad ${cve}?`)) return;
  await api.deleteInstanceOverride(cve);
  showMsg("ok", `Ajustes eliminados: ${cve}`);
  await loadOverrideForm();
  await refreshAll();
}

function renderOverridesList() {
  const host = $("cartoFuentesOverridesList");
  if (!host) return;
  const instances = state.overridesSummary?.instances || [];
  if (!instances.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Sin ajustes por entidad.</p>`;
    return;
  }
  host.innerHTML = `<ul class="small mb-0">${instances
    .map(
      (ent) =>
        `<li><button type="button" class="btn btn-link btn-sm p-0 carto-fuentes-pick" data-ent="${escapeHtml(
          ent
        )}">Entidad ${escapeHtml(ent)}</button></li>`
    )
    .join("")}</ul>`;
  host.querySelectorAll(".carto-fuentes-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ent = btn.getAttribute("data-ent");
      if ($("cartoFuentesCveEnt")) $("cartoFuentesCveEnt").value = ent;
      void loadOverrideForm().catch((e) => showMsg("error", e.message || String(e)));
    });
  });
}

async function loadDiscover() {
  const hint = $("cartoFuentesDiscoverHint");
  try {
    const data = await api.discoverDatasources();
    state.discover = data || { schemas: [], tables: [], ok: false };
    if (hint) {
      if (!data?.ok) {
        hint.innerHTML = `<span class="text-danger">${escapeHtml(
          data?.error || "No se pudo leer la base cartográfica"
        )}</span>`;
      } else {
        const avail = data.available_count ?? 0;
        const total = data.total_count ?? 0;
        hint.textContent =
          avail > 0
            ? `${avail} capa(s) nuevas listas para incorporar (${total} con geometría en total).`
            : total > 0
              ? "Todas las capas detectadas ya están en el catálogo. Cargue un shape nuevo en la BD para ver más."
              : "No se detectaron capas con geometría. Cargue un shape a la BD cartography (p.ej. esquema Auxiliar).";
      }
    }
  } catch (e) {
    state.discover = { schemas: [], tables: [], ok: false, error: e.message };
    if (hint) {
      hint.innerHTML = `<span class="text-danger">${escapeHtml(
        e.message || String(e)
      )}</span>`;
    }
  }
  fillSchemaCombo();
  fillTableCombo();
}

async function refreshAll() {
  const full = await api.getDatasourcesPayload();
  state.sources = full.sources || [];
  state.overridesSummary = full.instance_overrides || null;
  renderCatalog();
  renderOverridesList();
  await loadDiscover();
}

function bindEvents() {
  if (state.bound) return;
  state.bound = true;
  $("cartoFuentesSchema")?.addEventListener("change", () => {
    state.labelTouched = false;
    fillTableCombo();
  });
  $("cartoFuentesTable")?.addEventListener("change", () => {
    state.labelTouched = false;
    updatePreviewFromCombos();
  });
  $("cartoFuentesNewLabel")?.addEventListener("input", () => {
    state.labelTouched = true;
  });
  $("cartoFuentesShowRegistered")?.addEventListener("change", () => fillTableCombo());
  $("cartoFuentesLoadBtn")?.addEventListener("click", () => {
    void loadOverrideForm().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoFuentesSaveBtn")?.addEventListener("click", () => {
    void onSaveOverride().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoFuentesDeleteBtn")?.addEventListener("click", () => {
    void onDeleteOverride().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoFuentesReloadBtn")?.addEventListener("click", () => {
    void enterFuentesPanel().catch((e) => showMsg("error", e.message || String(e)));
  });
  $("cartoFuentesRegisterBtn")?.addEventListener("click", () => {
    void onRegisterSource().catch((e) => showMsg("error", e.message || String(e)));
  });
}

export function bindFuentesPanelUi() {
  bindEvents();
}

export async function enterFuentesPanel() {
  bindEvents();
  showMsg();
  await refreshAll();
  if ($("cartoFuentesCveEnt") && !$("cartoFuentesCveEnt").value) {
    $("cartoFuentesCveEnt").value = state.cveEnt;
  }
  await loadOverrideForm();
}
