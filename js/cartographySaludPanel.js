/**
 * Cartography Studio — pestaña Salud (P11).
 * Checklist bajo demanda: no publica ni sincroniza nada.
 */
import * as api from "./cartographyProductApi.js";

const $ = (id) => document.getElementById(id);

const ICON = { ok: "✔", warn: "⚠", fail: "✖", skip: "–" };
const CLS = { ok: "text-success", warn: "text-warning", fail: "text-danger", skip: "text-muted" };
function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showErr(msg) {
  const el = $("cartoSaludError");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("d-none", !msg);
}

function issuesList(issues) {
  if (!Array.isArray(issues) || !issues.length) return "";
  const items = issues
    .map(
      (i) => `<li class="${i.level === "warn" ? "text-warning-emphasis" : "text-muted"}">${i.level === "warn" ? "⚠" : "ⓘ"} ${
        i.label ? `<strong>${escapeHtml(i.label)}</strong>: ` : ""
      }${escapeHtml(i.msg)}</li>`
    )
    .join("");
  return `<details class="w-100 ms-4"><summary class="small">Ver detalle (${issues.length})</summary><ul class="small mb-1">${items}</ul></details>`;
}

function checkRow(c) {
  const st = c.status || "skip";
  return `<li class="d-flex flex-wrap gap-2 py-1 border-bottom">
    <span class="${CLS[st] || ""}" style="width:1.2em">${ICON[st] || "•"}</span>
    <span class="fw-semibold" style="min-width:16rem">${escapeHtml(c.label)}</span>
    <span class="text-muted">${escapeHtml(c.detail || "")}</span>
    ${issuesList(c.issues)}
  </li>`;
}

function renderResult(r) {
  const host = $("cartoSaludResult");
  const meta = $("cartoSaludMeta");
  if (!host) return;
  if (!r || r.empty) {
    host.innerHTML = `<p class="small text-muted">Aún no se ha ejecutado el checklist.</p>`;
    if (meta) meta.textContent = "";
    return;
  }
  if (meta) {
    const when = r.ran_at ? new Date(r.ran_at).toLocaleString() : "—";
    meta.innerHTML = `Última revisión: <strong>${escapeHtml(when)}</strong>${
      r.ran_by ? ` · ${escapeHtml(r.ran_by)}` : ""
    } · ${escapeHtml(String(r.seconds ?? ""))} s${r.include_preview ? " · con preview real" : ""} · estado <span class="${
      CLS[r.status] || ""
    }">${ICON[r.status] || ""} ${escapeHtml(r.status || "")}</span>`;
  }
  const engine = `<div class="card shadow-sm visor-studio-card mb-3">
    <div class="card-header fw-semibold">Motor y datos</div>
    <div class="card-body"><ul class="list-unstyled small mb-0">${(r.engine || []).map(checkRow).join("")}</ul></div>
  </div>`;
  const products = (r.products || [])
    .map(
      (p) => `<div class="card shadow-sm visor-studio-card mb-3">
      <div class="card-header fw-semibold"><span class="${CLS[p.status] || ""}">${ICON[p.status] || ""}</span> ${escapeHtml(
        p.name
      )} <code class="small">${escapeHtml(p.product_key)}</code></div>
      <div class="card-body">
        ${(p.templates || [])
          .map(
            (t) => `<div class="small fw-semibold mt-1">${escapeHtml(t.template_id)}${
              t.active_version ? ` <span class="badge text-bg-light border">v${t.active_version}</span>` : ""
            }${t.fingerprint ? ` <span class="text-muted">huella ${escapeHtml(t.fingerprint)}</span>` : ""}</div>
            <ul class="list-unstyled small mb-2">${(t.checks || []).map(checkRow).join("")}</ul>`
          )
          .join("")}
      </div>
    </div>`
    )
    .join("");
  host.innerHTML = engine + products;
}

async function onRun() {
  const btn = $("cartoSaludRunBtn");
  const includePreview = !!$("cartoSaludPreview")?.checked;
  showErr("");
  if (btn) {
    btn.disabled = true;
    btn.textContent = includePreview ? "Ejecutando (con preview)…" : "Ejecutando…";
  }
  try {
    renderResult(await api.runChecklist({ includePreview }));
  } catch (e) {
    showErr(e?.message || String(e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Ejecutar checklist";
    }
  }
}

export async function enterSaludPanel() {
  const btn = $("cartoSaludRunBtn");
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => void onRun());
  }
  try {
    renderResult(await api.lastChecklist());
  } catch (e) {
    showErr(e?.message || String(e));
  }
}
