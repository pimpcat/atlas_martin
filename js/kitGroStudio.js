/**
 * Panel reutilizable: sembrar / borrar kit base con selección de catálogos.
 */

const STATE_BADGES = {
  gro_kit: { cls: "text-bg-primary", text: "Kit Base" },
  empty: { cls: "text-bg-secondary", text: "Vacío" },
  custom: { cls: "text-bg-info", text: "Personalizado" },
  missing: { cls: "text-bg-warning", text: "Sin archivo" },
  invalid: { cls: "text-bg-danger", text: "Inválido" },
};

function apiMessage(data, fallback) {
  return data?.detail?.message || data?.message || fallback;
}

function selectedDomains(root) {
  const boxes = root.querySelectorAll('input[type="checkbox"][data-kit-domain]:checked');
  return Array.from(boxes).map((el) => el.getAttribute("data-kit-domain")).filter(Boolean);
}

function renderDomainRows(root, status) {
  const host = root.querySelector("[data-kit-domains]");
  if (!host) return;
  host.innerHTML = "";
  const options = status?.domain_options || [];
  const domains = status?.domains || {};
  for (const opt of options) {
    const id = opt.id;
    const info = domains[id] || {};
    const badge = STATE_BADGES[info.state] || STATE_BADGES.empty;
    const row = document.createElement("label");
    row.className = "d-flex align-items-start gap-2 small kit-gro-domain-row mb-1";
    row.innerHTML = `
      <input type="checkbox" class="form-check-input mt-1" data-kit-domain="${id}" checked />
      <span class="flex-grow-1">
        <span class="fw-medium">${opt.label || id}</span>
        <span class="badge ${badge.cls} ms-1">${badge.text}</span>
      </span>
    `;
    host.appendChild(row);
  }
}

function setMsg(root, text, ok) {
  const el = root.querySelector("[data-kit-msg]");
  if (!el) return;
  el.classList.remove("d-none", "text-success", "text-danger", "text-muted");
  if (!text) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.add(ok ? "text-success" : "text-danger");
}

function syncUploadGuideButton(root, status, options) {
  const btn = root.querySelector('[data-kit-action="download-guide"]');
  if (!btn) return;
  const guide = status?.upload_guide || {};
  const visor = status?.domains?.visor || {};
  const canShow =
    Boolean(guide.can_generate) ||
    Boolean(guide.available) ||
    visor.state === "gro_kit" ||
    (visor.state === "custom" && !visor.empty);
  btn.classList.toggle("d-none", !canShow);
  btn.disabled = !canShow;
  const url = options.uploadGuideUrl || options.uploadGuideDownloadUrl;
  btn.dataset.downloadUrl = url || "";
}

function setBusy(root, busy) {
  root.querySelectorAll("button[data-kit-action]").forEach((btn) => {
    btn.disabled = busy;
  });
}

async function defaultFetchStatus(url, fetchFn) {
  const { res, data } = await fetchFn(url, { method: "GET" });
  if (!res?.ok) {
    throw new Error(apiMessage(data, `HTTP ${res?.status || "?"}`));
  }
  return data;
}

async function refreshPanel(root, options) {
  const status = await (typeof options.fetchStatus === "function"
    ? options.fetchStatus()
    : defaultFetchStatus(options.statusUrl, options.fetchFn));
  renderDomainRows(root, status);
  syncUploadGuideButton(root, status, options);
  return status;
}

async function downloadUploadGuide(root, options) {
  const btn = root.querySelector('[data-kit-action="download-guide"]');
  const url =
    btn?.dataset?.downloadUrl ||
    options.uploadGuideUrl ||
    options.uploadGuideDownloadUrl;
  if (!url) {
    setMsg(root, "No hay URL de guía configurada.", false);
    return;
  }
  setBusy(root, true);
  setMsg(root, "Generando guía Excel…", true);
  try {
    const { res, data } = await options.fetchFn(url, { method: "GET" });
    if (!res?.ok) {
      throw new Error(apiMessage(data, `HTTP ${res?.status || "?"}`));
    }
    const blob = data instanceof Blob ? data : await res.blob();
    const dispo = res.headers.get("Content-Disposition") || "";
    const m = /filename=\"?([^\";]+)\"?/i.exec(dispo);
    const filename = m?.[1] || "guia_carga_capas_kit_gro.xlsx";
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
    setMsg(root, "Guía descargada. Revise la hoja «Capas kit base».", true);
  } catch (err) {
    setMsg(root, err?.message || "No se pudo descargar la guía", false);
  } finally {
    setBusy(root, false);
  }
}

async function postAction(root, options, action) {
  const domains = selectedDomains(root);
  if (!domains.length) {
    setMsg(root, "Seleccione al menos un catálogo.", false);
    return;
  }
  const isSeed = action === "seed";
  const confirmText = isSeed
    ? `¿Copiar ${domains.length} catálogo(s) desde el kit base?\n\nSolo definiciones; no trae datos de BD.`
    : `¿Restaurar ${domains.length} catálogo(s) a plantilla vacía?\n\nSe quitará el kit base en esos dominios.`;
  if (!window.confirm(confirmText)) return;

  setBusy(root, true);
  setMsg(root, isSeed ? "Sembrando…" : "Restaurando vacíos…", true);
  try {
    const url = isSeed ? options.seedUrl : options.clearUrl;
    const { res, data } = await options.fetchFn(url, {
      method: "POST",
      body: JSON.stringify({ domains }),
    });
    if (!res?.ok) {
      throw new Error(apiMessage(data, `HTTP ${res?.status || "?"}`));
    }
    let msg = data?.hint || (isSeed ? "Kit aplicado." : "Catálogos restaurados.");
    if (isSeed && data?.upload_guide?.available) {
      msg += " Guía de carga de capas lista — use el botón «Descargar guía Excel».";
    }
    setMsg(root, msg, true);
    await refreshPanel(root, options);
    options.onSuccess?.(action, data);
  } catch (err) {
    setMsg(root, err?.message || "Operación fallida", false);
  } finally {
    setBusy(root, false);
  }
}

/**
 * Monta panel kit base en un contenedor existente.
 * @param {HTMLElement|string} rootOrId
 * @param {{
 *   fetchFn: (url: string, init?: RequestInit) => Promise<{res: Response, data: any}>,
 *   statusUrl?: string,
 *   seedUrl?: string,
 *   clearUrl?: string,
 *   fetchStatus?: () => Promise<object>,
 *   onSuccess?: (action: 'seed'|'clear', data: object) => void,
 * }} options
 */
export function mountKitGroPanel(rootOrId, options) {
  const root =
    typeof rootOrId === "string"
      ? document.getElementById(rootOrId.replace(/^#/, ""))
      : rootOrId;
  if (!root || !options?.fetchFn) return null;

  const seedBtn = root.querySelector('[data-kit-action="seed"]');
  const clearBtn = root.querySelector('[data-kit-action="clear"]');
  const refreshBtn = root.querySelector('[data-kit-action="refresh"]');
  const guideBtn = root.querySelector('[data-kit-action="download-guide"]');

  seedBtn?.addEventListener("click", () => void postAction(root, options, "seed"));
  clearBtn?.addEventListener("click", () => void postAction(root, options, "clear"));
  guideBtn?.addEventListener("click", () => void downloadUploadGuide(root, options));
  refreshBtn?.addEventListener("click", () => {
    setBusy(root, true);
    refreshPanel(root, options)
      .then(() => setMsg(root, "Estado actualizado.", true))
      .catch((err) => setMsg(root, err?.message || "No se pudo leer estado", false))
      .finally(() => setBusy(root, false));
  });

  setBusy(root, true);
  refreshPanel(root, options)
    .catch((err) => setMsg(root, err?.message || "No se pudo leer estado del kit", false))
    .finally(() => setBusy(root, false));

  return root;
}

/** URLs admin (Data Refresh / GroSIG) según sesión de instancia. */
export function adminKitGroEndpoints() {
  return {
    statusUrl: "/api/admin/package/kit-status",
    seedUrl: "/api/admin/package/seed-from-gro",
    clearUrl: "/api/admin/package/clear-gro-kit",
    uploadGuideUrl: "/api/admin/package/kit-upload-guide",
  };
}

/** Rutas Nodo Studio para una entidad. */
export function nodoKitGroEndpoints(cve_ent) {
  const ent = String(cve_ent || "").padStart(2, "0");
  const base = `/api/amigo/nodo/instancias/${ent}/package`;
  return {
    statusUrl: `${base}/kit-status`,
    seedUrl: `${base}/seed-gro`,
    clearUrl: `${base}/clear-gro-kit`,
    uploadGuideUrl: `${base}/kit-upload-guide`,
  };
}

/** HTML estándar del panel (insertar en card-body). */
export const KIT_GRO_PANEL_INNER_HTML = `
  <p class="small text-muted mb-2 mb-md-0">
    Copie definiciones del kit base o restaure plantillas vacías por catálogo.
    No trae datos de base de datos.
  </p>
  <div data-kit-domains class="kit-gro-domains border rounded p-2 bg-body-tertiary mb-2"></div>
  <div class="d-flex flex-wrap gap-2 align-items-center">
    <button type="button" class="btn btn-sm btn-outline-primary" data-kit-action="seed">Sembrar seleccionados</button>
    <button type="button" class="btn btn-sm btn-outline-danger" data-kit-action="clear">Restaurar vacíos</button>
    <button type="button" class="btn btn-sm btn-outline-success d-none" data-kit-action="download-guide">Descargar guía Excel</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-kit-action="refresh" title="Actualizar estado">↻</button>
  </div>
  <p class="small text-muted mt-2 mb-0">
    Tras sembrar el visor, la guía Excel lista cada capa con el tipo de shape y el nombre exacto de tabla para Visor Studio (+).
  </p>
  <div data-kit-msg class="small mt-2 d-none" role="status"></div>
`;

/**
 * Enlaza cabecera colapsable del card kit base (cerrado por defecto).
 * @param {HTMLElement} card
 * @param {{ onFirstExpand?: () => void, defaultExpanded?: boolean }} [options]
 */
export function bindKitGroCollapsible(card, options = {}) {
  if (!card) return;
  const toggle = card.querySelector("[data-kit-gro-toggle], .kit-gro-card-toggle");
  const body = card.querySelector(".kit-gro-card-body");
  if (!toggle || !body) return;

  let expanded = Boolean(options.defaultExpanded);
  let firstExpandDone = false;

  const apply = () => {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    body.classList.toggle("d-none", !expanded);
    if (expanded) {
      body.removeAttribute("hidden");
      if (!firstExpandDone) {
        firstExpandDone = true;
        options.onFirstExpand?.();
      }
    } else {
      body.setAttribute("hidden", "");
    }
  };

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    apply();
  });

  apply();
}
