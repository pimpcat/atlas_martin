/**
 * Cartography Studio — pestaña Datos (P9 / P9b).
 * Ciclo de capas en GroSIG_Cartography. Independiente de Data Refresh del portal.
 */
import { adminFetch, adminUpload } from "./visorAdminAuth.js";

const $ = (id) => document.getElementById(id);

function showMsg(kind, msg) {
  const ok = $("cartoDatosOk");
  const err = $("cartoDatosError");
  if (ok) {
    ok.classList.add("d-none");
    ok.textContent = "";
  }
  if (err) {
    err.classList.add("d-none");
    err.textContent = "";
  }
  if (!msg) return;
  const el = kind === "ok" ? ok : err;
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Etiqueta UI para source_kind del catálogo (atlas = legado; fuente real = AMIGO geo). */
function origenLabel(kind, layer) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "atlas") {
    const role = String(layer?.amigo_source_role || "").toLowerCase();
    if (role === "core") return "AMIGO / geo (CORE)";
    if (role === "impl") return "AMIGO / geo (IMPL)";
    return "AMIGO / geo";
  }
  if (k === "gdb") return "GDB / SHP";
  if (k === "derived") return "Derivada";
  return kind || "—";
}

async function fetchStatus() {
  const { res, data, networkError } = await adminFetch(
    "/api/cartography/data-ops/status"
  );
  if (networkError || !res) throw new Error("No se pudo contactar al API");
  if (!res.ok) {
    throw new Error(
      data?.detail?.message || data?.message || `HTTP ${res.status}`
    );
  }
  return data;
}

async function refreshLayer(schema, table) {
  const { res, data, networkError } = await adminFetch(
    "/api/cartography/data-ops/refresh",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema_name: schema, table }),
    }
  );
  if (networkError || !res) throw new Error("No se pudo contactar al API");
  if (!res.ok) {
    throw new Error(
      data?.detail?.message ||
        data?.message ||
        (typeof data?.detail === "string" ? data.detail : null) ||
        `HTTP ${res.status}`
    );
  }
  return data;
}

async function uploadLayerShp(schema, table, file) {
  const fd = new FormData();
  fd.append("schema_name", schema);
  fd.append("table", table);
  fd.append("file", file, file.name || "upload.zip");
  fd.append("dbf_encoding", "auto");
  const { status, data, networkError, ok } = await adminUpload(
    "/api/cartography/data-ops/upload",
    fd
  );
  if (networkError) throw new Error("No se pudo contactar al API");
  if (!ok) {
    throw new Error(
      data?.detail?.message ||
        data?.message ||
        (typeof data?.detail === "string" ? data.detail : null) ||
        `HTTP ${status}`
    );
  }
  return data;
}

function renderStatus(snap) {
  const host = $("cartoDatosStatus");
  if (!host) return;
  if (!snap?.enabled) {
    host.innerHTML = `<p class="small text-muted mb-0">Operaciones de datos deshabilitadas
      (<code>CARTOGRAPHY_DATA_OPS_ENABLED=false</code>).</p>`;
    return;
  }
  const db = snap.cartography_db || {};
  const fdw = snap.fdw || {};
  const reg = snap.registry || {};
  const dbLabel = db.ok
    ? `<span class="text-success">● OK</span> · ${escapeHtml(db.database || "GroSIG_Cartography")}`
    : `<span class="text-danger">● Error</span> · ${escapeHtml(db.error || "—")}`;
  const coreDb = fdw.core_dbname || "AMIGO-CORE";
  const implDb = fdw.impl_dbname || "AMIGO-IMPL";
  const fdwLabel = fdw.ready
    ? `<span class="text-success">● Listo</span> · CORE <code>${escapeHtml(coreDb)}</code> + IMPL <code>${escapeHtml(implDb)}</code> (schema geo)`
    : `<span class="text-warning">● No listo</span> · ${escapeHtml(fdw.error || "revise AMIGO_CORE_* / AMIGO_IMPL_* y postgres_fdw")}`;
  host.innerHTML = `
    <dl class="row small mb-0">
      <dt class="col-sm-4">Alcance</dt>
      <dd class="col-sm-8">Solo <strong>GroSIG_Cartography</strong> · <em>no</em> es Data Refresh del portal · <em>no</em> BD atlas</dd>
      <dt class="col-sm-4">BD cartográfica</dt><dd class="col-sm-8">${dbLabel}</dd>
      <dt class="col-sm-4">Rematerializar (AMIGO)</dt><dd class="col-sm-8">${fdwLabel}</dd>
      <dt class="col-sm-4">Subir SHP (GDB)</dt>
      <dd class="col-sm-8"><span class="text-success">● Disponible</span> · ZIP con .shp+.shx+.dbf</dd>
      <dt class="col-sm-4">Fuentes en registry</dt>
      <dd class="col-sm-8">${escapeHtml(String(reg.sources_count ?? "—"))}</dd>
      <dt class="col-sm-4">Tablas con geometría</dt>
      <dd class="col-sm-8">${escapeHtml(String(reg.discover_tables ?? "—"))}</dd>
    </dl>
    <p class="small text-muted mt-2 mb-0">${escapeHtml(snap.note || "")}</p>
  `;
}

function actionCell(L) {
  const parts = [];
  if (L.can_refresh) {
    parts.push(`<button type="button" class="btn btn-sm btn-outline-primary carto-datos-refresh"
             data-schema="${escapeHtml(L.schema)}" data-table="${escapeHtml(L.table)}">
             Actualizar
           </button>`);
  }
  if (L.can_upload) {
    parts.push(`<button type="button" class="btn btn-sm btn-outline-secondary carto-datos-upload"
             data-schema="${escapeHtml(L.schema)}" data-table="${escapeHtml(L.table)}"
             title="Subir ZIP/SHP y reemplazar en GroSIG_Cartography">
             Subir SHP
           </button>`);
  }
  if (!parts.length) {
    return `<span class="text-muted">—</span>`;
  }
  return `<div class="d-flex flex-wrap gap-1">${parts.join("")}</div>`;
}

function renderCatalog(snap) {
  const host = $("cartoDatosCatalog");
  if (!host) return;
  const cat = snap?.catalog || {};
  if (!cat.ok) {
    host.innerHTML = `<p class="small text-muted mb-0">${escapeHtml(
      cat.error || "Catálogo no disponible"
    )}</p>`;
    return;
  }
  const layers = Array.isArray(cat.layers) ? cat.layers : [];
  if (!layers.length) {
    host.innerHTML = `<p class="small text-muted mb-0">aux.layer_catalog vacío.</p>`;
    return;
  }
  const rows = layers
    .map((L) => {
      const sid = escapeHtml(L.source_id || `${L.schema}.${L.table}`);
      const kind = escapeHtml(origenLabel(L.source_kind, L));
      const st = escapeHtml(L.status || "—");
      const atlas = escapeHtml(L.atlas_table || "—");
      return `<tr>
        <td><code>${sid}</code></td>
        <td>${kind}</td>
        <td>${st}</td>
        <td><code>${atlas}</code></td>
        <td>${actionCell(L)}</td>
      </tr>`;
    })
    .join("");
  host.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Capa (carto)</th>
            <th>Origen</th>
            <th>Estado</th>
            <th>Tabla fuente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <input type="file" id="cartoDatosShpInput" class="d-none"
           accept=".zip,.shp,application/zip" />
    <p class="small text-muted mt-2 mb-0">
      <strong>Actualizar</strong> = rematerializar desde <code>geo</code> en AMIGO
      (CORE: <code>c_ent</code>/<code>c_mun</code>; IMPL: resto, p. ej. <code>hcorrientes</code>).
      <strong>Subir SHP</strong> = capas GDB (p. ej. <code>info50k.carreteras_l</code>).
      No usa la BD <code>atlas</code> deprecada ni Data Refresh del portal.
    </p>
  `;
  host.querySelectorAll(".carto-datos-refresh").forEach((btn) => {
    btn.addEventListener("click", () => {
      const schema = btn.getAttribute("data-schema");
      const table = btn.getAttribute("data-table");
      void onRefreshOne(schema, table);
    });
  });
  host.querySelectorAll(".carto-datos-upload").forEach((btn) => {
    btn.addEventListener("click", () => {
      const schema = btn.getAttribute("data-schema");
      const table = btn.getAttribute("data-table");
      void onUploadOne(schema, table);
    });
  });
}

async function onRefreshOne(schema, table) {
  if (
    !window.confirm(
      `¿Rematerializar ${schema}.${table} desde AMIGO (geo) hacia GroSIG_Cartography?\n` +
        `Esto reemplaza la tabla cartográfica (CORE: c_ent/c_mun; IMPL: resto). ` +
        `No toca Data Refresh ni la BD atlas.`
    )
  ) {
    return;
  }
  showMsg("ok", `Actualizando ${schema}.${table}…`);
  try {
    const data = await refreshLayer(schema, table);
    const n = data?.row_count != null ? ` · ${data.row_count} filas` : "";
    showMsg("ok", (data?.message || "OK") + n);
    await loadDatosPanel();
  } catch (e) {
    showMsg("error", e?.message || String(e));
  }
}

async function onUploadOne(schema, table) {
  const input = $("cartoDatosShpInput");
  if (!input) {
    showMsg("error", "Selector de archivo no disponible");
    return;
  }
  input.value = "";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    input.onchange = null;
    if (!file) return;
    if (
      !window.confirm(
        `¿Subir «${file.name}» y reemplazar ${schema}.${table} en GroSIG_Cartography?\n` +
          `La tabla anterior se sustituye. No afecta Data Refresh del portal.`
      )
    ) {
      return;
    }
    showMsg("ok", `Importando SHP → ${schema}.${table}…`);
    try {
      const data = await uploadLayerShp(schema, table, file);
      const n = data?.row_count != null ? ` · ${data.row_count} filas` : "";
      showMsg("ok", (data?.message || "OK") + n);
      await loadDatosPanel();
    } catch (e) {
      showMsg("error", e?.message || String(e));
    }
  };
  input.click();
}

export async function loadDatosPanel() {
  showMsg();
  const snap = await fetchStatus();
  renderStatus(snap);
  renderCatalog(snap);
  return snap;
}

export async function enterDatosPanel() {
  try {
    await loadDatosPanel();
  } catch (e) {
    showMsg("error", e?.message || String(e));
  }
}

export function bindDatosPanelUi() {
  $("cartoDatosReloadBtn")?.addEventListener("click", () => {
    void enterDatosPanel();
  });
  $("cartoDatosGoFuentesBtn")?.addEventListener("click", () => {
    document.querySelector('[data-carto-tab="fuentes"]')?.click();
  });
}
