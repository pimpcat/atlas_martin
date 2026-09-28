/**
 * Cartography Studio — branding + editor productos oficiales (P3).
 * Gate: GET /api/cartography/health. Draft/preview/publish vía product store (P2).
 */
import { adminDownloadBlob, adminFetch } from "./visorAdminAuth.js";
import {
  createStudioShell,
  studioIdsFromPrefix,
} from "./studioShell.js";
import {
  probeCartographyHealth,
  summarizeCartographyHealth,
} from "./cartographyHealth.js";
import {
  bindProductEditorUi,
  enterProductEditor,
} from "./cartographyProductEditor.js";
import {
  bindCustomBuilderUi,
  enterCustomBuilder,
} from "./cartographyCustomBuilder.js";
import {
  bindFuentesPanelUi,
} from "./cartographyFuentesPanel.js";
import {
  bindDatosPanelUi,
} from "./cartographyDatosPanel.js";

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
  const phase = health?.registry_phase || "—";
  const statusDot = summary.alive
    ? `<span class="text-success">● ${escapeHtml(summary.statusLabel)}</span>`
    : `<span class="text-secondary">● ${escapeHtml(summary.statusLabel)}</span>`;
  const products = Array.isArray(health?.official_products)
    ? health.official_products.length
    : "—";
  dl.innerHTML = `
    <dt class="col-sm-4">Estado</dt><dd class="col-sm-8">${statusDot}</dd>
    <dt class="col-sm-4">Versión</dt><dd class="col-sm-8">${escapeHtml(summary.version)}</dd>
    <dt class="col-sm-4">Fase Studio</dt><dd class="col-sm-8"><code>${escapeHtml(phase)}</code></dd>
    <dt class="col-sm-4">Productos oficiales</dt><dd class="col-sm-8">${escapeHtml(String(products))}</dd>
    <dt class="col-sm-4">Plantillas</dt><dd class="col-sm-8">${escapeHtml(String(summary.templatesCount))}</dd>
    <dt class="col-sm-4">Logos</dt><dd class="col-sm-8">${escapeHtml(String(summary.logosCount))}</dd>
    <dt class="col-sm-4">Última modificación</dt><dd class="col-sm-8"><code>${escapeHtml(mtime)}</code></dd>
  `;

  const hint = $("cartoStudioApiHint");
  if (hint) {
    const ver = String(health?.version || "");
    const needsReload =
      summary.alive &&
      (!health?.registry_phase ||
        !Array.isArray(health?.official_products) ||
        !String(health.registry_phase).startsWith("P"));
    if (needsReload) {
      hint.classList.remove("d-none");
      hint.innerHTML =
        `El API en memoria sigue en <code>${escapeHtml(ver || "?")}</code> sin fase P2/P3. ` +
        `Reinicie el backend y recargue esta página:<br>` +
        `<code>docker restart fastapi_backend</code>`;
    } else {
      hint.classList.add("d-none");
      hint.textContent = "";
    }
  }
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
  void loadProfiles().catch(() => renderProfiles([]));
  void loadLogoGallery().catch(() => renderLogoGallery({ logos: [] }));
  const caps = Array.isArray(probe.health?.capabilities)
    ? probe.health.capabilities
    : [];
  const datosOn = caps.includes("cartography_data_ops");
  $("cartoTabDatosItem")?.classList.toggle("d-none", !datosOn);
  try {
    await enterProductEditor();
  } catch (e) {
    showErr($("cartoProdError"), e?.message || String(e));
  }
  try {
    await enterCustomBuilder();
  } catch (e) {
    showErr($("cartoCustomError"), e?.message || String(e));
  }
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

const logoState = { items: [], urls: {}, previews: {}, bgMode: "umbral", reviewing: null };

function fmtKb(bytes) {
  return `${Math.max(1, Math.round((Number(bytes) || 0) / 1024))} KB`;
}

async function sha256Hex(file) {
  if (!globalThis.crypto?.subtle) return null;
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadLogoThumb(name) {
  if (logoState.urls[name]) return logoState.urls[name];
  const r = await adminDownloadBlob(`/api/cartography/admin/logos/${encodeURIComponent(name)}/file`, {
    triggerDownload: false,
  });
  if (!r.ok || !r.blob) return null;
  logoState.urls[name] = URL.createObjectURL(r.blob);
  return logoState.urls[name];
}

function renderLogoGallery(data) {
  const host = $("cartoLogoGallery");
  if (!host) return;
  const items = data?.logos || [];
  logoState.items = items;
  const known = new Set(items.map((x) => x.name));
  Object.keys(logoState.urls).forEach((n) => {
    if (!known.has(n)) {
      URL.revokeObjectURL(logoState.urls[n]);
      delete logoState.urls[n];
    }
  });
  const missing = data?.missing_in_use || [];
  const warn = missing.length
    ? `<div class="w-100 small text-danger">En uso pero no está en disco: ${escapeHtml(missing.join(", "))}</div>`
    : "";
  logoState.bgMode = data?.bg_mode || "umbral";
  const sel = $("cartoLogoBgMode");
  if (sel) sel.value = logoState.bgMode;
  renderLogoUsage(data);
  if (!items.length) {
    host.innerHTML = `${warn}<span class="small text-muted">No hay logos en <code>assets/logos/</code>.</span>`;
    return;
  }
  host.innerHTML =
    warn +
    items
      .map((it) => {
        const lvl = CHECK_LEVELS[it.check?.level] || CHECK_LEVELS.ok;
        const tip = (it.check?.checks || []).map((c) => `• ${c.msg}`).join("\n");
        const name = escapeHtml(it.name);
        return `<div class="border rounded p-1 text-center small ${it.primary ? "border-primary border-2" : it.in_use ? "border-success" : ""}" style="width:160px">
      <div class="carto-logo-checker" style="height:64px;display:flex;align-items:center;justify-content:center">
        <img data-logo="${name}" alt="${name}" style="max-height:60px;max-width:150px;object-fit:contain" />
      </div>
      <div class="text-truncate fw-semibold" title="${name}">${name}</div>
      <div class="text-muted">${it.width && it.height ? `${it.width}×${it.height} px · ` : ""}${fmtKb(it.bytes)}</div>
      <div class="d-flex flex-wrap justify-content-center gap-1">
        <span class="badge ${lvl.cls}" title="${escapeHtml(tip)}">${lvl.label}</span>
        ${it.primary ? `<span class="badge text-bg-primary">principal</span>` : ""}
        ${it.in_use ? `<span class="badge text-bg-success">en uso #${it.order}</span>` : ""}
      </div>
      ${
        (it.duplicates || []).length
          ? `<div class="text-warning" title="Mismo contenido">= ${escapeHtml(it.duplicates.join(", "))}</div>`
          : ""
      }
      <div class="d-flex flex-wrap justify-content-center gap-1 mt-1">
        <button type="button" class="btn btn-sm py-0 btn-outline-dark carto-logo-review" data-name="${name}">Revisar</button>
        ${
          it.primary
            ? ""
            : `<button type="button" class="btn btn-sm py-0 btn-outline-primary carto-logo-primary" data-name="${name}" title="Usar en tira, croquis y condensado">Principal</button>`
        }
        <button type="button" class="btn btn-sm py-0 ${it.in_use ? "btn-outline-secondary" : "btn-outline-success"} carto-logo-use" data-name="${name}" data-use="${it.in_use ? "0" : "1"}">${it.in_use ? "Quitar de tiras" : "Usar en tiras"}</button>
      </div>
    </div>`;
      })
      .join("");
  host.querySelectorAll("img[data-logo]").forEach((img) => {
    void loadLogoThumb(img.getAttribute("data-logo")).then((url) => {
      if (url && img.isConnected) img.src = url;
    });
  });
  if (logoState.reviewing && known.has(logoState.reviewing)) void showLogoPreview(logoState.reviewing);
  else closeLogoPreview();
}

const CHECK_LEVELS = {
  ok: { cls: "text-bg-success", label: "OK" },
  warn: { cls: "text-bg-warning", label: "Revisar" },
  bad: { cls: "text-bg-danger", label: "Problema" },
};

function renderLogoUsage(data) {
  const el = $("cartoLogoUsage");
  if (!el) return;
  const u = data?.usage || {};
  const head = (u.encabezado_hojas || []).map(escapeHtml).join(", ") || "—";
  const cfg = data?.primary_configured;
  const auto = !cfg || cfg !== data?.primary_logo ? ' <span class="text-muted">(automático: nombre con «cesieg» o el primero en uso)</span>' : "";
  el.innerHTML = `<div><strong>Tira, croquis y condensado:</strong> ${escapeHtml(u.tira_croquis_condensado || "— (texto de respaldo)")}${auto}</div>
    <div><strong>Encabezado de hojas:</strong> ${head}</div>`;
}

function previewKey(name, variant, mode) {
  return `${name}|${variant}|${mode}`;
}

async function loadLogoPreview(name, variant, mode) {
  const key = previewKey(name, variant, mode);
  if (logoState.previews[key]) return logoState.previews[key];
  const q = new URLSearchParams({ variant, bg_mode: mode });
  const r = await adminDownloadBlob(`/api/cartography/admin/logos/${encodeURIComponent(name)}/preview?${q}`, {
    triggerDownload: false,
  });
  if (!r.ok || !r.blob) return null;
  logoState.previews[key] = URL.createObjectURL(r.blob);
  return logoState.previews[key];
}

function forgetLogoPreviews(name) {
  Object.keys(logoState.previews).forEach((k) => {
    if (k.startsWith(`${name}|`)) {
      URL.revokeObjectURL(logoState.previews[k]);
      delete logoState.previews[k];
    }
  });
}

function closeLogoPreview() {
  logoState.reviewing = null;
  const box = $("cartoLogoPreview");
  if (!box) return;
  box.classList.add("d-none");
  box.innerHTML = "";
}

async function showLogoPreview(name) {
  const box = $("cartoLogoPreview");
  const it = logoState.items.find((x) => x.name === name);
  if (!box || !it) return;
  logoState.reviewing = name;
  const checks = (it.check?.checks || [])
    .map((c) => `<li class="${c.level === "bad" ? "text-danger" : c.level === "warn" ? "text-warning-emphasis" : "text-success"}">${escapeHtml(c.msg)}</li>`)
    .join("");
  const slot = (id, label, bg) =>
    `<figure class="m-0 text-center"><div class="carto-logo-slot border ${bg}"><img data-pv="${id}" alt="" /></div><figcaption class="small text-muted">${label}</figcaption></figure>`;
  const modeRow = (mode, label) => `<div class="small fw-semibold mt-2">${label}${mode === logoState.bgMode ? ' <span class="badge text-bg-primary">vigente</span>' : ""}</div>
    <div class="d-flex flex-wrap gap-2">
      ${slot(`strip|${mode}`, "Tira de localidad", "carto-logo-checker")}
      ${slot(`croquis|${mode}`, "Croquis / condensado", "carto-logo-checker")}
      ${slot(`croquis|${mode}|w`, "Croquis sobre blanco", "bg-white")}
    </div>`;
  box.innerHTML = `<div class="d-flex justify-content-between align-items-center">
      <strong class="small">Vista previa de «${escapeHtml(name)}» tal como sale en el PDF</strong>
      <button type="button" class="btn-close carto-logo-preview-close" aria-label="Cerrar"></button>
    </div>
    <ul class="small mb-1 mt-1 ps-3">${checks}</ul>
    <div class="d-flex flex-wrap gap-2">${slot("orig", "Original (sin tratar)", "carto-logo-checker")}</div>
    ${modeRow("umbral", "Quitar fondo en toda la imagen")}
    ${modeRow("bordes", "Quitar fondo solo desde los bordes")}`;
  box.classList.remove("d-none");
  const orig = box.querySelector('img[data-pv="orig"]');
  void loadLogoThumb(name).then((url) => {
    if (url && orig?.isConnected) orig.src = url;
  });
  box.querySelectorAll("img[data-pv]").forEach((img) => {
    const [variant, mode] = img.dataset.pv.split("|");
    if (variant === "orig") return;
    void loadLogoPreview(name, variant, mode).then((url) => {
      if (url && img.isConnected) img.src = url;
    });
  });
}

async function postLogoSettings(body, okMsg) {
  showErr($("cartoStudioFormError"));
  showOk($("cartoStudioFormOk"));
  const { res, data } = await adminFetch("/api/cartography/admin/logos/settings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res?.ok) {
    showErr($("cartoStudioFormError"), data?.detail?.message || data?.message || `Error HTTP ${res?.status}`);
    const sel = $("cartoLogoBgMode");
    if (sel) sel.value = logoState.bgMode;
    return;
  }
  renderLogoGallery(data);
  await loadBranding();
  showOk($("cartoStudioFormOk"), okMsg);
}

async function loadLogoGallery() {
  const { res, data } = await adminFetch("/api/cartography/admin/logos");
  if (!res?.ok) {
    const host = $("cartoLogoGallery");
    if (host) host.innerHTML = `<span class="small text-danger">No se pudo leer la galería de logos.</span>`;
    return;
  }
  renderLogoGallery(data);
}

async function onToggleLogo(name, use) {
  showErr($("cartoStudioFormError"));
  showOk($("cartoStudioFormOk"));
  const { res, data } = await adminFetch(`/api/cartography/admin/logos/${encodeURIComponent(name)}/use`, {
    method: "POST",
    body: JSON.stringify({ in_use: use }),
  });
  if (!res?.ok) {
    showErr($("cartoStudioFormError"), data?.detail?.message || data?.message || `Error HTTP ${res?.status}`);
    return;
  }
  renderLogoGallery(data);
  await loadBranding();
  showOk($("cartoStudioFormOk"), use ? `«${name}» añadido a las tiras.` : `«${name}» quitado de las tiras.`);
}

async function onPickLogoFile() {
  const file = $("fLogoFile")?.files?.[0];
  const box = $("cartoLogoPending");
  const img = $("cartoLogoPendingImg");
  const info = $("cartoLogoPendingInfo");
  if (img?.src?.startsWith("blob:")) URL.revokeObjectURL(img.src);
  if (!file || !box || !img || !info) {
    box?.classList.add("d-none");
    box?.classList.remove("d-flex");
    return;
  }
  img.src = URL.createObjectURL(file);
  box.classList.remove("d-none");
  box.classList.add("d-flex");
  const notes = [`${escapeHtml(file.name)} · ${fmtKb(file.size)}`];
  const digest = await sha256Hex(file).catch(() => null);
  const same = digest ? logoState.items.find((x) => x.sha256 === digest) : null;
  if (same) {
    notes.push(`<span class="text-danger">Ya existe idéntico: «${escapeHtml(same.name)}»${same.in_use ? " (en uso)" : ""}</span>`);
  } else if (logoState.items.some((x) => x.name === file.name)) {
    notes.push(`<span class="text-warning">Hay otro logo con el mismo nombre (se pedirá confirmar)</span>`);
  } else {
    notes.push(`<span class="text-success">Nuevo</span>`);
  }
  info.innerHTML = notes.join("<br>");
}

async function onUploadLogo(overwrite = false) {
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
  if (overwrite) fd.append("overwrite", "true");
  const { res, data, networkError } = await adminFetch("/api/cartography/admin/logos", {
    method: "POST",
    body: fd,
  });
  if (networkError || !res) {
    showErr($("cartoStudioFormError"), "No se pudo contactar al API");
    return;
  }
  if (!res.ok) {
    const msg = data?.detail?.message || data?.message || `Error HTTP ${res.status}`;
    if (!overwrite && /sobrescribir/i.test(msg) && confirm(`${msg}.\n¿Sobrescribir el archivo existente?`)) {
      return onUploadLogo(true);
    }
    showErr($("cartoStudioFormError"), msg);
    return;
  }
  const saved = data?.file || file.name;
  if (logoState.urls[saved]) {
    URL.revokeObjectURL(logoState.urls[saved]);
    delete logoState.urls[saved];
  }
  forgetLogoPreviews(saved);
  if (input) input.value = "";
  void onPickLogoFile();
  await bootOnline();
  showOk($("cartoStudioFormOk"), `Logo «${data?.file || file.name}» registrado.`);
}

function profileMsg(kind, msg) {
  const el = $("cartoBrandProfileMsg");
  if (!el) return;
  el.className = `small mb-2 ${kind === "ok" ? "text-success" : "text-danger"}${msg ? "" : " d-none"}`;
  el.textContent = msg || "";
}

function renderProfiles(list) {
  const host = $("cartoBrandProfiles");
  if (!host) return;
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Sin perfiles guardados.</p>`;
    return;
  }
  host.innerHTML = `<ul class="list-unstyled small mb-0">${items
    .map(
      (p) => `<li class="d-flex flex-wrap align-items-center gap-2 py-1 border-bottom">
        <strong>${escapeHtml(p.name)}</strong>${p.auto ? ' <span class="badge text-bg-secondary">auto</span>' : ""}
        <span class="text-muted">${escapeHtml(p.brand_line)} · ${escapeHtml((p.logos || []).join(", ") || "sin logos")} · ${escapeHtml(
          p.fecha_actualizacion || ""
        )}</span>
        <span class="text-muted">${escapeHtml(p.saved_at ? new Date(p.saved_at).toLocaleString() : "")}${
          p.saved_by ? ` · ${escapeHtml(p.saved_by)}` : ""
        }</span>
        <button type="button" class="btn btn-outline-success btn-sm py-0 ms-auto carto-bp-apply" data-slug="${escapeHtml(
          p.slug
        )}" data-name="${escapeHtml(p.name)}">Aplicar</button>
        ${
          p.auto
            ? ""
            : `<button type="button" class="btn btn-outline-danger btn-sm py-0 carto-bp-del" data-slug="${escapeHtml(
                p.slug
              )}" data-name="${escapeHtml(p.name)}">Borrar</button>`
        }
      </li>`
    )
    .join("")}</ul>`;
}

async function loadProfiles() {
  const { res, data } = await adminFetch("/api/cartography/admin/branding/profiles");
  if (!res?.ok) {
    renderProfiles([]);
    return;
  }
  renderProfiles(data.profiles);
}

async function onSaveProfile(overwrite = false) {
  profileMsg();
  const name = $("cartoBrandProfileName")?.value?.trim() || "";
  if (!name) {
    profileMsg("err", "Escriba un nombre para el perfil.");
    return;
  }
  const { res, data } = await adminFetch("/api/cartography/admin/branding/profiles", {
    method: "POST",
    body: JSON.stringify({ name, overwrite }),
  });
  if (!res?.ok) {
    const msg = data?.detail?.message || data?.message || `Error HTTP ${res?.status}`;
    if (!overwrite && /sobrescribir/i.test(msg) && confirm(`${msg}.\n¿Sobrescribir?`)) {
      await onSaveProfile(true);
      return;
    }
    profileMsg("err", msg);
    return;
  }
  if ($("cartoBrandProfileName")) $("cartoBrandProfileName").value = "";
  renderProfiles(data.profiles);
  profileMsg("ok", `Perfil «${data.name}» guardado.`);
}

async function onApplyProfile(slug, name) {
  if (!confirm(`¿Aplicar el perfil «${name}»?\nEl branding actual se guardará en «Respaldo automático».`)) return;
  profileMsg();
  const { res, data } = await adminFetch(
    `/api/cartography/admin/branding/profiles/${encodeURIComponent(slug)}/apply`,
    { method: "POST" }
  );
  if (!res?.ok) {
    profileMsg("err", data?.detail?.message || data?.message || `Error HTTP ${res?.status}`);
    return;
  }
  fillForm(data.branding);
  renderProfiles(data.profiles);
  const missing = data.missing_logos || [];
  profileMsg(
    "ok",
    `Perfil «${name}» aplicado.${missing.length ? ` Atención: faltan logos en disco: ${missing.join(", ")}.` : ""}`
  );
  const probe = await probeCartographyHealth({ force: true });
  renderPhase0(probe.health, data);
}

async function onDeleteProfile(slug, name) {
  if (!confirm(`¿Borrar el perfil «${name}»? No afecta al branding vigente.`)) return;
  profileMsg();
  const { res, data } = await adminFetch(
    `/api/cartography/admin/branding/profiles/${encodeURIComponent(slug)}`,
    { method: "DELETE" }
  );
  if (!res?.ok) {
    profileMsg("err", data?.detail?.message || data?.message || `Error HTTP ${res?.status}`);
    return;
  }
  renderProfiles(data.profiles);
  profileMsg("ok", `Perfil «${name}» borrado.`);
}

function bindProfilesUi() {
  const btn = $("cartoBrandProfileSaveBtn");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => void onSaveProfile(false));
  $("cartoBrandProfiles")?.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const slug = t.getAttribute("data-slug");
    const name = t.getAttribute("data-name") || slug;
    if (!slug) return;
    if (t.classList.contains("carto-bp-apply")) void onApplyProfile(slug, name);
    else if (t.classList.contains("carto-bp-del")) void onDeleteProfile(slug, name);
  });
}

function bindUi() {
  bindProfilesUi();
  $("cartoStudioForm")?.addEventListener("submit", (ev) => void onSave(ev));
  $("cartoStudioReloadBtn")?.addEventListener("click", () => {
    void bootOnline().catch((e) =>
      showErr($("cartoStudioFormError"), e.message || String(e))
    );
  });
  const logoBtn = $("cartoStudioUploadLogoBtn");
  if (logoBtn && !logoBtn.dataset.bound) {
    logoBtn.dataset.bound = "1";
    logoBtn.addEventListener("click", () => void onUploadLogo());
    $("fLogoFile")?.addEventListener("change", () => void onPickLogoFile());
    $("cartoLogoGallery")?.addEventListener("click", (ev) => {
      const b = ev.target.closest?.("button[data-name]");
      if (!b) return;
      const name = b.dataset.name;
      if (b.classList.contains("carto-logo-use")) void onToggleLogo(name, b.dataset.use === "1");
      else if (b.classList.contains("carto-logo-review")) {
        if (logoState.reviewing === name) closeLogoPreview();
        else void showLogoPreview(name);
      } else if (b.classList.contains("carto-logo-primary")) {
        void postLogoSettings({ primary_logo: name }, `«${name}» es ahora el logo principal (tira, croquis y condensado).`);
      }
    });
    $("cartoLogoPreview")?.addEventListener("click", (ev) => {
      if (ev.target.closest?.(".carto-logo-preview-close")) closeLogoPreview();
    });
    $("cartoLogoBgMode")?.addEventListener("change", (ev) => {
      const mode = ev.target.value;
      const label = mode === "bordes" ? "solo desde los bordes" : "en toda la imagen";
      void postLogoSettings({ bg_mode: mode }, `Fondo de logos: se quitará ${label}. Aplica al siguiente PDF generado.`);
    });
  }
  bindProductEditorUi();
  bindCustomBuilderUi();
  bindFuentesPanelUi();
  bindDatosPanelUi();
}

/** Shell v2 — enlazar UI tras montar panel en #gs2StudioMount */
export function bindCartographyStudioUi() {
  bindUi();
  bindCollapsibleCards();
}

/** Shell v2 — health + branding + productos */
export function enterCartographyStudioDashboard() {
  return bootOnline();
}

function bindCollapsibleCards() {
  document.querySelectorAll(".card.carto-collapsible").forEach((card) => {
    const header = card.querySelector(":scope > .card-header");
    if (!header || header.dataset.collapsibleBound) return;
    header.dataset.collapsibleBound = "1";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    const setOpen = (open) => {
      card.classList.toggle("carto-collapsed", !open);
      header.setAttribute("aria-expanded", open ? "true" : "false");
    };
    setOpen(card.classList.contains("carto-open"));
    const toggle = () => setOpen(card.classList.contains("carto-collapsed"));
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle();
      }
    });
  });
}

async function init() {
  bindUi();
  bindCollapsibleCards();

  const shell = createStudioShell(studioIdsFromPrefix("cartoStudio"), {
    activeNav: "cartography",
    onEnterDashboard: () => bootOnline(),
    onDashboardError: (err) =>
      showErr($("cartoStudioLoginError"), err?.message || String(err)),
  });
  await shell.boot();
}

if (document.getElementById("cartoStudioLoginForm")) {
  void init();
}
