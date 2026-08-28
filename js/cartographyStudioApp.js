/**
 * Cartography Studio — branding 1.0 (tiras / logo / institución / advertencias / fechas).
 * Gate: mismo contrato Core GET /api/cartography/health.
 */
import { adminFetch } from "./visorAdminAuth.js";
import {
  createStudioShell,
  studioIdsFromPrefix,
} from "./studioShell.js";
import {
  probeCartographyHealth,
  summarizeCartographyHealth,
} from "./cartographyHealth.js";

const $ = (id) => document.getElementById(id);

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

function showOk(el, msg) {
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("d-none");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPhase0(health, brandingMeta) {
  const summary = summarizeCartographyHealth(health);
  const dl = $("cartoStudioHealthDl");
  if (!dl) return;
  const mtime = brandingMeta?.branding_updated_at || summary.brandingUpdatedAt || "—";
  const statusDot = summary.alive
    ? `<span class="text-success">● ${escapeHtml(summary.statusLabel)}</span>`
    : `<span class="text-secondary">● ${escapeHtml(summary.statusLabel)}</span>`;
  dl.innerHTML = `
    <dt class="col-sm-4">Estado</dt><dd class="col-sm-8">${statusDot}</dd>
    <dt class="col-sm-4">Versión</dt><dd class="col-sm-8">${escapeHtml(summary.version)}</dd>
    <dt class="col-sm-4">Plantillas</dt><dd class="col-sm-8">${escapeHtml(String(summary.templatesCount))}</dd>
    <dt class="col-sm-4">Logos</dt><dd class="col-sm-8">${escapeHtml(String(summary.logosCount))}</dd>
    <dt class="col-sm-4">Última modificación</dt><dd class="col-sm-8"><code>${escapeHtml(mtime)}</code></dd>
  `;
}

function fillForm(branding) {
  const b = branding || {};
  if ($("fBrandLine")) $("fBrandLine").value = b.brand_line || "";
  if ($("fEngineLine")) $("fEngineLine").value = b.engine_line || "";
  if ($("fAdvertencia")) $("fAdvertencia").value = b.advertencia || "";
  if ($("fFechaAct")) $("fFechaAct").value = b.fecha_actualizacion || "";
  const list = $("cartoStudioLogosList");
  if (list) {
    const logos = b.logos || [];
    list.innerHTML = logos.length
      ? logos.map((n) => `<li><code>${escapeHtml(n)}</code></li>`).join("")
      : "<li class='text-muted'>Sin logos declarados</li>";
  }
}

async function loadBranding() {
  const { res, data } = await adminFetch("/api/cartography/admin/branding");
  if (!res?.ok) {
    throw new Error(data?.detail?.message || data?.message || `HTTP ${res?.status}`);
  }
  fillForm(data.branding);
  return data;
}

async function bootOnline() {
  const probe = await probeCartographyHealth({ force: true });
  const offline = $("cartoStudioOffline");
  const online = $("cartoStudioOnline");
  if (!probe.ok) {
    offline?.classList.remove("d-none");
    online?.classList.add("d-none");
    renderPhase0(probe.health, null);
    return;
  }
  offline?.classList.add("d-none");
  online?.classList.remove("d-none");
  const meta = await loadBranding();
  renderPhase0(probe.health, meta);
}

async function onSave(ev) {
  ev.preventDefault();
  showErr($("cartoStudioFormError"));
  showOk($("cartoStudioFormOk"));
  const body = {
    brand_line: $("fBrandLine")?.value?.trim() || "",
    engine_line: $("fEngineLine")?.value?.trim() || "",
    advertencia: $("fAdvertencia")?.value?.trim() || "",
    fecha_actualizacion: $("fFechaAct")?.value?.trim() || "",
  };
  const { res, data } = await adminFetch("/api/cartography/admin/branding", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res?.ok) {
    showErr(
      $("cartoStudioFormError"),
      data?.detail?.message || data?.message || `Error HTTP ${res?.status}`
    );
    return;
  }
  fillForm(data.branding);
  const probe = await probeCartographyHealth({ force: true });
  renderPhase0(probe.health, data);
  showOk($("cartoStudioFormOk"), "Branding guardado. Genere un PDF en el Visor para ver los cambios.");
}

async function onUploadLogo() {
  showErr($("cartoStudioFormError"));
  showOk($("cartoStudioFormOk"));
  const input = $("fLogoFile");
  const file = input?.files?.[0];
  if (!file) {
    showErr($("cartoStudioFormError"), "Seleccione un archivo de logo.");
    return;
  }
  const fd = new FormData();
  fd.append("file", file);
  const { res, data, networkError } = await adminFetch("/api/cartography/admin/logos", {
    method: "POST",
    body: fd,
  });
  if (networkError || !res) {
    showErr($("cartoStudioFormError"), "No se pudo contactar al API");
    return;
  }
  if (!res.ok) {
    showErr(
      $("cartoStudioFormError"),
      data?.detail?.message || data?.message || `Error HTTP ${res.status}`
    );
    return;
  }
  if (input) input.value = "";
  await bootOnline();
  showOk($("cartoStudioFormOk"), `Logo «${data?.file || file.name}» registrado.`);
}

function bindUi() {
  $("cartoStudioForm")?.addEventListener("submit", (ev) => void onSave(ev));
  $("cartoStudioReloadBtn")?.addEventListener("click", () => {
    void bootOnline().catch((e) =>
      showErr($("cartoStudioFormError"), e.message || String(e))
    );
  });
  $("cartoStudioUploadLogoBtn")?.addEventListener("click", () => void onUploadLogo());
}

async function main() {
  bindUi();
  const shell = createStudioShell(studioIdsFromPrefix("cartoStudio"), {
    activeNav: "cartography",
    onEnterDashboard: () => bootOnline(),
    onDashboardError: (err) =>
      showErr($("cartoStudioLoginError"), err?.message || String(err)),
  });
  await shell.boot();
}

main();
