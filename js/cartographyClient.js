/**
 * Cliente GroSIG Cartography Engine (opcional).
 * Solo se activa si GET /api/cartography/health responde OK (contrato Core).
 * Controles y formatos se arman desde health (feature-detect).
 */
import { apiUrl } from "./atlasConfig.js";
import { fetchLocsAtlasLabels } from "./api.js";
import { canPickFolder, estimateBatch, formatDuration, pickFolder, runBatch } from "./cartographyBatch.js";
import {
  getCartographyHealth,
  isCartographyEnabled,
  probeCartographyEngine,
  probeCartographyHealth,
} from "./cartographyHealth.js";
import { getAdminToken, isVisorAdminLoggedIn, isVisorAdminUiAllowed, verifyAdminSession } from "./visorAdminAuth.js";

export { getCartographyHealth, isCartographyEnabled, probeCartographyEngine, probeCartographyHealth };

/** Cache de localidades amanzanadas por municipio (cve_mun → lista). */
const _locCache = new Map();

const FORMAT_ACCEPT = {
  pdf: "application/pdf",
  geopdf: "application/pdf",
  svg: "image/svg+xml",
};

const FORMAT_LABELS = {
  pdf: "PDF",
  geopdf: "GeoPDF",
  svg: "SVG",
};

const CROQUIS_TEMPLATE_LABELS = {
  croquis_municipal: "Croquis Atlas (estándar)",
  croquis_map_focus: "Croquis Atlas (mapa ampliado)",
  grosig_croquis_municipal: "Croquis municipal GroSIG (90×70)",
};

const PRODUCT_LABELS = {
  localidad: "Plano de localidad (GroSIG)",
  grosig_croquis: "Croquis municipal GroSIG (90×70)",
  condensado: "Condensado estatal",
  croquis: "Croquis municipal (Atlas)",
  atlas: "Atlas multipágina",
};

function _normCve3(cveMun) {
  const cve = String(cveMun || "").replace(/\D/g, "").slice(-3).padStart(3, "0");
  if (!cve || cve === "000") return null;
  return cve;
}

function _normCve4(cveLoc) {
  const cve = String(cveLoc || "").replace(/\D/g, "").slice(-4).padStart(4, "0");
  if (!cve || cve === "0000") return null;
  return cve;
}

function _cveLocFromCvegeo(cvegeo) {
  const d = String(cvegeo || "").replace(/\D/g, "");
  if (d.length < 4) return null;
  return _normCve4(d.slice(-4));
}

function _filenameFromDisposition(header, fallback) {
  if (!header) return fallback;
  const m =
    /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(header);
  const raw = decodeURIComponent((m && (m[1] || m[2] || m[3]) || "").trim());
  return raw || fallback;
}

function _extForFormat(format) {
  if (format === "svg") return "svg";
  return "pdf";
}

function _formatBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

/**
 * Genera un producto y dispara descarga.
 */
export async function generateAndDownload(opts) {
  const { blob, filename, format } = await generateBlob(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { filename, size: blob.size, format };
}

/**
 * Genera un producto y devuelve el archivo sin descargarlo (lotes).
 * Errores HTTP llevan ``status`` (p. ej. 429 límite, 401 sesión).
 */
export async function generateBlob(opts) {
  const format = String(opts.format || "pdf").toLowerCase();
  const template_id = String(opts.template_id || "").trim();
  if (!template_id) throw new Error("Falta plantilla de cartografía.");

  const token = getAdminToken();
  if (!token) {
    throw new Error(
      "Se requiere sesión admin (Visor Studio) para generar cartografía."
    );
  }

  const accept = FORMAT_ACCEPT[format] || "application/pdf";
  const body = {
    template_id,
    format,
    params: opts.params || {},
  };
  if (opts.paper) body.paper = opts.paper;
  if (opts.orientation) body.orientation = opts.orientation;

  const res = await fetch(apiUrl("/api/cartography/generate"), {
    method: "POST",
    headers: {
      Accept: accept,
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Atlas-Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.detail?.message || err?.detail?.error || err?.detail || detail;
      if (typeof detail === "object") {
        detail = detail.message || detail.error || JSON.stringify(detail);
      }
    } catch {
      /* cuerpo no JSON */
    }
    const error = new Error(String(detail));
    error.status = res.status;
    throw error;
  }

  const blob = await res.blob();
  const minSize = format === "svg" ? 200 : 500;
  if (!blob || blob.size < minSize) {
    throw new Error("El archivo recibido está vacío o es inválido.");
  }

  const fallback =
    opts.fallbackName || `${template_id}.${_extForFormat(format)}`;
  const filename = _filenameFromDisposition(
    res.headers.get("Content-Disposition"),
    fallback
  );
  return { blob, filename, format };
}

/** @deprecated Usar generateAndDownload */
export async function downloadCroquisMunicipal(cveMun, opts = {}) {
  const cve = _normCve3(cveMun);
  if (!cve) throw new Error("Selecciona un municipio válido.");
  return generateAndDownload({
    template_id: "croquis_municipal",
    format: "pdf",
    params: { cve_mun: cve },
    paper: opts.paper,
    orientation: opts.orientation,
    fallbackName: `croquis_municipal_${cve}.pdf`,
  });
}

function _availableFormats(health) {
  const raw = Array.isArray(health?.formats) ? health.formats : ["pdf"];
  return raw.filter((f) => FORMAT_ACCEPT[f]);
}

function _templates(health) {
  return Array.isArray(health?.templates) ? health.templates : [];
}

function _has(templates, id) {
  return templates.includes(id);
}

function _hasCap(health, cap) {
  const caps = Array.isArray(health?.capabilities) ? health.capabilities : [];
  return caps.includes(cap);
}

function _productOptionsHtml(tpls, atlasOk, locOk, condensadoOk, grosigCroquisOk) {
  const parts = [];
  if (locOk) {
    parts.push(
      `<option value="localidad">${PRODUCT_LABELS.localidad}</option>`
    );
  }
  if (grosigCroquisOk) {
    parts.push(
      `<option value="grosig_croquis">${PRODUCT_LABELS.grosig_croquis}</option>`
    );
  }
  if (condensadoOk) {
    parts.push(
      `<option value="condensado">${PRODUCT_LABELS.condensado}</option>`
    );
  }
  if (_has(tpls, "croquis_municipal") || _has(tpls, "croquis_map_focus")) {
    parts.push(`<option value="croquis">${PRODUCT_LABELS.croquis}</option>`);
  }
  if (atlasOk) {
    parts.push(`<option value="atlas">${PRODUCT_LABELS.atlas}</option>`);
  }
  return parts.join("");
}

function _renderControls(host, health) {
  const formats = _availableFormats(health);
  const tpls = _templates(health);
  const atlasOk =
    _has(tpls, "atlas_municipal") || _hasCap(health, "multi_page_atlas");
  const locOk = _has(tpls, "plano_localidad");
  const condensadoOk = _has(tpls, "condensado_estatal");
  const grosigCroquisOk = _has(tpls, "grosig_croquis_municipal");
  const ver = health?.version ? ` v${health.version}` : "";
  const dbOk = health?.cartography_db?.ok;

  const formatOpts = formats
    .map((f) => `<option value="${f}">${FORMAT_LABELS[f] || f}</option>`)
    .join("");

  const croquisOpts = [
    "croquis_municipal",
    "croquis_map_focus",
    "grosig_croquis_municipal",
  ]
    .filter((id) => tpls.includes(id))
    .map(
      (id) =>
        `<option value="${id}">${CROQUIS_TEMPLATE_LABELS[id] || id}</option>`
    )
    .join("");

  const productOpts = _productOptionsHtml(
    tpls,
    atlasOk,
    locOk,
    condensadoOk,
    grosigCroquisOk
  );

  host.innerHTML = `
    <div class="cartography-ui__head">
      Cartografía GroSIG${ver}${
        dbOk === false
          ? ' <span class="text-warning">(BD cartografía no ok)</span>'
          : ""
      }
    </div>
    <div id="cartographyContext" class="cartography-ui__context" aria-live="polite">
      Municipio: <strong>—</strong>
    </div>
    <div class="cartography-ui__row">
      <label class="cartography-ui__label" for="cartographyProduct">Producto</label>
      <select id="cartographyProduct" class="form-select form-select-sm cartography-ui__select" aria-label="Producto cartográfico">
        ${productOpts || `<option value="croquis">${PRODUCT_LABELS.croquis}</option>`}
      </select>
    </div>
    <div class="cartography-ui__row" id="cartographyTemplateRow" hidden>
      <label class="cartography-ui__label" for="cartographyTemplate">Plantilla</label>
      <select id="cartographyTemplate" class="form-select form-select-sm cartography-ui__select" aria-label="Plantilla">
        ${croquisOpts || '<option value="croquis_municipal">Estándar</option>'}
      </select>
    </div>
    <div class="cartography-ui__row" id="cartographyAmbitoRow" hidden>
      <label class="cartography-ui__label" for="cartographyAmbito">Ámbito</label>
      <select id="cartographyAmbito" class="form-select form-select-sm cartography-ui__select" aria-label="Ámbito de la localidad">
        <option value="" selected>Todos</option>
        <option value="U">Urbano</option>
        <option value="R">Rural</option>
      </select>
    </div>
    <div class="cartography-ui__row" id="cartographyLocRow" hidden>
      <label class="cartography-ui__label" for="cartographyCveLoc">Localidad</label>
      <div class="cartography-ui__loc-wrap">
        <select id="cartographyCveLoc" class="form-select form-select-sm cartography-ui__select" aria-label="Localidad amanzanada">
          <option value="">— Selecciona municipio —</option>
        </select>
        <input id="cartographyCveLocManual" type="text" maxlength="4" inputmode="numeric"
          placeholder="o clave 4 dígitos" class="form-control form-control-sm cartography-ui__select cartography-ui__loc-manual"
          aria-label="Clave de localidad manual" hidden />
      </div>
    </div>
    <div class="cartography-ui__hint" id="cartographyLocHint" hidden>
      Solo localidades amanzanadas del municipio seleccionado.
    </div>
    <details id="cartographyBatchRow" class="cartography-ui__hint mb-1" hidden>
      <summary style="cursor:pointer;user-select:none">Más opciones</summary>
      <button type="button" id="btnCartographyBatch" class="btn btn-sm btn-outline-info w-100 mt-1">
        Generar todas las localidades…
      </button>
      <div id="cartographyBatchConfirm" class="cartography-ui__hint border rounded p-2 mt-1" hidden>
        <div id="cartographyBatchSummary"></div>
        <div class="d-flex gap-1 mt-2">
          <button type="button" id="btnCartographyBatchStart" class="btn btn-sm btn-info flex-grow-1">Empezar</button>
          <button type="button" id="btnCartographyBatchCancel" class="btn btn-sm btn-outline-secondary">Cancelar</button>
        </div>
      </div>
    </details>
    <div class="cartography-ui__row cartography-ui__row--check" id="cartographyMpRow" hidden>
      <label class="cartography-ui__check" for="cartographyMultipage"
        title="Multipágina a escala aproximada 1:7 500 (solo localidades urbanas)">
        <input type="checkbox" id="cartographyMultipage" class="form-check-input" />
        <span>Cartas detalle (solo urbanas)</span>
      </label>
    </div>
    <div class="cartography-ui__row" id="cartographyPkgRow" hidden>
      <label class="cartography-ui__label" for="cartographyPackage">Armado</label>
      <select id="cartographyPackage" class="form-select form-select-sm cartography-ui__select" aria-label="Formato de armado multipágina">
        <option value="index_plotter" selected>Paquete plotter 90×120 + cartas</option>
        <option value="sheets_only">Doble carta (cartas sueltas)</option>
      </select>
    </div>
    <div class="cartography-ui__hint" id="cartographyPkgHint" hidden>
      1ª hoja: índice de armado 90×120; resto: cartas 42×28.
    </div>
    <div class="cartography-ui__row" id="cartographyAtlasScopeRow" hidden>
      <label class="cartography-ui__label" for="cartographyAtlasScope">Alcance</label>
      <select id="cartographyAtlasScope" class="form-select form-select-sm cartography-ui__select" aria-label="Alcance del atlas">
        <option value="current">Municipio actual</option>
        <option value="state">Todo el estado</option>
      </select>
    </div>
    <div class="cartography-ui__row">
      <label class="cartography-ui__label" for="cartographyFormat">Formato</label>
      <select id="cartographyFormat" class="form-select form-select-sm cartography-ui__select" aria-label="Formato de descarga">
        ${formatOpts || '<option value="pdf">PDF</option>'}
      </select>
    </div>
    <button type="button" id="btnCartographyDownload" class="btn btn-sm cartography-ui__btn w-100 mt-1">
      Descargar
    </button>
    <div id="cartographyUiStatus" class="cartography-ui__status small text-muted mt-1" role="status" aria-live="polite"></div>
  `;
}

function _syncProductRows(root) {
  const product = root.querySelector("#cartographyProduct")?.value || "croquis";
  const tplRow = root.querySelector("#cartographyTemplateRow");
  const atlasRow = root.querySelector("#cartographyAtlasScopeRow");
  const locRow = root.querySelector("#cartographyLocRow");
  const locHint = root.querySelector("#cartographyLocHint");
  const mpRow = root.querySelector("#cartographyMpRow");
  const mpChk = root.querySelector("#cartographyMultipage");
  const pkgRow = root.querySelector("#cartographyPkgRow");
  const pkgHint = root.querySelector("#cartographyPkgHint");
  const formatSel = root.querySelector("#cartographyFormat");
  if (tplRow) tplRow.hidden = product !== "croquis";
  if (atlasRow) atlasRow.hidden = product !== "atlas";
  if (locRow) locRow.hidden = product !== "localidad";
  const ambitoRow = root.querySelector("#cartographyAmbitoRow");
  if (ambitoRow) ambitoRow.hidden = product !== "localidad";
  const batchRow = root.querySelector("#cartographyBatchRow");
  if (batchRow) batchRow.hidden = product !== "localidad";
  if (product !== "localidad") {
    const confirmBox = root.querySelector("#cartographyBatchConfirm");
    if (confirmBox) confirmBox.hidden = true;
    if (batchRow) batchRow.open = false;
  }
  if (locHint) locHint.hidden = product !== "localidad";
  if (mpRow) mpRow.hidden = product !== "localidad";
  if (product !== "localidad" && mpChk) mpChk.checked = false;

  const mpOn = product === "localidad" && !!mpChk?.checked;
  if (pkgRow) pkgRow.hidden = !mpOn;
  if (pkgHint) {
    const pkgVal = root.querySelector("#cartographyPackage")?.value || "index_plotter";
    pkgHint.hidden = !mpOn || pkgVal !== "index_plotter";
  }

  if (formatSel) {
    const hideSvg =
      product === "atlas" || (product === "localidad" && mpChk && mpChk.checked);
    [...formatSel.options].forEach((opt) => {
      opt.hidden = hideSvg && opt.value === "svg";
    });
    if (hideSvg && formatSel.value === "svg") {
      const pdfOpt = [...formatSel.options].find(
        (o) => o.value === "pdf" || o.value === "geopdf"
      );
      if (pdfOpt) formatSel.value = pdfOpt.value;
    }
  }
}

function _updateContext(host, options) {
  const el = host.querySelector("#cartographyContext");
  if (!el) return;
  const cveRaw =
    typeof options.getCveMun === "function" ? options.getCveMun() : null;
  const cve = _normCve3(cveRaw);
  const nom =
    typeof options.getNomgeo === "function" ? options.getNomgeo() : "";
  if (!cve) {
    el.innerHTML =
      'Municipio: <strong class="cartography-ui__warn">ninguno seleccionado</strong>';
    return;
  }
  const label = nom ? `${nom} (${cve})` : cve;
  el.innerHTML = `Municipio: <strong>${label}</strong>`;
}

async function _loadLocalidades(host, cveMun) {
  const sel = host.querySelector("#cartographyCveLoc");
  const manual = host.querySelector("#cartographyCveLocManual");
  if (!sel) return;

  const cve = _normCve3(cveMun);
  if (!cve) {
    sel.innerHTML = '<option value="">— Selecciona municipio —</option>';
    if (manual) {
      manual.hidden = true;
      manual.value = "";
    }
    return;
  }

  host.dataset.locMun = cve;
  const batchBox = host.querySelector("#cartographyBatchConfirm");
  if (batchBox) batchBox.hidden = true;
  if (_locCache.has(cve)) {
    _fillLocSelect(sel, manual, _filterByAmbito(host, _locCache.get(cve)));
    return;
  }

  sel.innerHTML = '<option value="">Cargando localidades…</option>';
  sel.disabled = true;
  try {
    const [fc, ambitos] = await Promise.all([fetchLocsAtlasLabels(cve), _fetchAmbitos(cve)]);
    const items = [];
    const seen = new Set();
    for (const f of fc?.features || []) {
      const props = f?.properties || {};
      const loc =
        _cveLocFromCvegeo(props.cvegeo || props.CVEGEO) ||
        _normCve4(props.cve_loc || props.CVE_LOC);
      if (!loc || seen.has(loc)) continue;
      seen.add(loc);
      const nom = String(props.nomgeo || props.NOMGEO || "").trim() || loc;
      items.push({ cve_loc: loc, nomgeo: nom, ambito: ambitos?.get(loc) || "" });
    }
    items.sort((a, b) => a.cve_loc.localeCompare(b.cve_loc, "es", { numeric: true }));
    _locCache.set(cve, items);
    if (host.dataset.locMun === cve) _fillLocSelect(sel, manual, _filterByAmbito(host, items));
  } catch (err) {
    console.warn("[cartography] localidades", err);
    sel.innerHTML =
      '<option value="">No se pudieron cargar — usa clave manual</option>';
    if (manual) {
      manual.hidden = false;
      manual.value = "";
    }
  } finally {
    sel.disabled = false;
  }
}

/** cve_loc → "U" | "R" desde marco.l (la misma tabla con la que el motor elige plantilla); null si no hay. */
async function _fetchAmbitos(cveMun) {
  const token = getAdminToken();
  if (!token) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/cartography/preview-territory?cve_mun=${encodeURIComponent(cveMun)}`),
      {
        headers: { Authorization: `Bearer ${token}`, "X-Atlas-Authorization": `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const out = new Map();
    for (const r of data?.rows || []) {
      const loc = _normCve4(r.cve);
      if (loc) out.set(loc, /^\s*R/i.test(String(r.ambito || "")) ? "R" : "U");
    }
    return out;
  } catch (err) {
    console.warn("[cartography] ámbito localidades", err);
    return null;
  }
}

function _filterByAmbito(host, items) {
  const want = host.querySelector("#cartographyAmbito")?.value || "";
  if (!want || !items?.some((it) => it.ambito)) return items;
  return items.filter((it) => it.ambito === want);
}

function _fillLocSelect(sel, manual, items) {
  if (!items?.length) {
    sel.innerHTML =
      '<option value="">Sin localidades amanzanadas</option>';
    if (manual) {
      manual.hidden = false;
      manual.value = "";
    }
    return;
  }
  if (manual) {
    manual.hidden = true;
    manual.value = "";
  }
  const opts = ['<option value="">— Elige localidad —</option>'].concat(
    items.map(
      (it) =>
        `<option value="${it.cve_loc}">${it.nomgeo} (${it.cve_loc})</option>`
    )
  );
  opts.push('<option value="__manual__">Otra (escribir clave)…</option>');
  sel.innerHTML = opts.join("");
}

function _resolveCveLoc(host) {
  const sel = host.querySelector("#cartographyCveLoc");
  const manual = host.querySelector("#cartographyCveLocManual");
  const v = sel?.value || "";
  if (v === "__manual__") {
    return _normCve4(manual?.value || "");
  }
  if (v) return _normCve4(v);
  return _normCve4(manual?.value || "");
}

function _busyRoot() {
  return (
    document.querySelector(".visor-map-section") ||
    document.getElementById("dashboardVisor") ||
    document.body
  );
}

function _ensureBusyOverlay() {
  const root = _busyRoot();
  if (!root) return null;
  if (getComputedStyle(root).position === "static") {
    root.style.position = "relative";
  }
  let el = document.getElementById("cartographyBusyOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "cartographyBusyOverlay";
    el.className = "cartography-busy";
    el.hidden = true;
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-live", "assertive");
    el.setAttribute("aria-busy", "true");
    el.innerHTML = `
      <div class="cartography-busy__box">
        <div class="cartography-busy__spinner" aria-hidden="true"></div>
        <p class="cartography-busy__title" id="cartographyBusyTitle">Generando cartografía…</p>
        <p class="cartography-busy__msg" id="cartographyBusyMsg">Puede tardar varios minutos. No pulses de nuevo ni cierres la pestaña.</p>
        <div id="cartographyBusyProgress" hidden style="height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden;margin:.5rem 0">
          <div id="cartographyBusyBar" style="height:100%;width:0;background:#17a2b8;transition:width .3s"></div>
        </div>
        <button type="button" id="cartographyBusyCancel" class="btn btn-sm btn-outline-light mt-1" hidden>Cancelar</button>
      </div>`;
    root.appendChild(el);
  }
  return el;
}

function _setCartographyBusy(host, busy, message) {
  const overlay = _ensureBusyOverlay();
  const title = document.getElementById("cartographyBusyTitle");
  const msg = document.getElementById("cartographyBusyMsg");
  if (overlay) {
    overlay.hidden = !busy;
    overlay.setAttribute("aria-busy", busy ? "true" : "false");
  }
  if (title && message) title.textContent = message;
  if (msg) {
    msg.textContent = busy
      ? "Puede tardar varios minutos. No pulses de nuevo ni cierres la pestaña."
      : "";
  }
  if (host) {
    host.setAttribute("aria-busy", busy ? "true" : "false");
    host.querySelectorAll("select, input, button").forEach((el) => {
      if (busy) {
        el.dataset.cartBusyPrev = el.disabled ? "1" : "0";
        el.disabled = true;
      } else if (el.dataset.cartBusyPrev != null) {
        el.disabled = el.dataset.cartBusyPrev === "1";
        delete el.dataset.cartBusyPrev;
      } else {
        el.disabled = false;
      }
    });
  }
  const toggleBtn = document.getElementById("btnVisorCartography");
  if (toggleBtn) toggleBtn.disabled = !!busy;
}

/**
 * Muestra el botón Cartografía en el Visor si el engine está activo
 * y hay sesión admin verificada (ciudadano no genera; la dependencia sí).
 * @param {{ getCveMun: () => string | null, getNomgeo?: () => string | null }} options
 */
export async function attachCartographyUi(options) {
  const host = document.getElementById("cartographyUiHost");
  const toggleBtn = document.getElementById("btnVisorCartography");
  if (!host) return;

  const engineOk = await probeCartographyEngine();

  const setToggleVisible = (visible) => {
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");
    host.classList.remove("is-open");
    if (toggleBtn) {
      toggleBtn.hidden = !visible;
      toggleBtn.setAttribute("aria-hidden", visible ? "false" : "true");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.classList.remove("is-active");
    }
  };

  // Empezar oculto; solo mostrar tras /me OK (fail-closed).
  setToggleVisible(false);
  if (isVisorAdminLoggedIn()) {
    await verifyAdminSession({ failClosed: true });
  }
  const adminOk = isVisorAdminUiAllowed();
  const ok = engineOk && adminOk;
  setToggleVisible(ok);

  if (!document.documentElement.dataset.cartographyAuthBound) {
    document.documentElement.dataset.cartographyAuthBound = "1";
    document.addEventListener("atlasgro-visor-admin-auth-change", () => {
      void (async () => {
        if (isVisorAdminLoggedIn() && !isVisorAdminUiAllowed()) {
          await verifyAdminSession({ failClosed: true });
        }
        const show = engineOk && isVisorAdminUiAllowed();
        setToggleVisible(show);
        if (!show) return;
        if (host.dataset.bound !== "1") {
          void attachCartographyUi(options);
        }
      })();
    });
  }

  if (!ok) return;

  if (host.dataset.bound === "1") return;
  host.dataset.bound = "1";

  _renderControls(host, getCartographyHealth() || {});
  _syncProductRows(host);
  _updateContext(host, options);

  const productSel = host.querySelector("#cartographyProduct");
  productSel?.addEventListener("change", () => {
    _syncProductRows(host);
    if (productSel.value === "localidad") {
      const cveRaw =
        typeof options.getCveMun === "function" ? options.getCveMun() : null;
      void _loadLocalidades(host, cveRaw);
    }
  });

  host.querySelector("#cartographyMultipage")?.addEventListener("change", () => {
    _syncProductRows(host);
  });
  host.querySelector("#cartographyAmbito")?.addEventListener("change", () => {
    const cve = host.dataset.locMun;
    const sel = host.querySelector("#cartographyCveLoc");
    const batchBox = host.querySelector("#cartographyBatchConfirm");
    if (batchBox) batchBox.hidden = true;
    if (!cve || !sel || !_locCache.has(cve)) return;
    _fillLocSelect(sel, host.querySelector("#cartographyCveLocManual"), _filterByAmbito(host, _locCache.get(cve)));
  });
  host.querySelector("#cartographyPackage")?.addEventListener("change", () => {
    _syncProductRows(host);
  });

  host.querySelector("#cartographyCveLoc")?.addEventListener("change", (ev) => {
    const manual = host.querySelector("#cartographyCveLocManual");
    if (!manual) return;
    const isManual = ev.target.value === "__manual__";
    manual.hidden = !isManual;
    if (isManual) manual.focus();
  });

  const setPanelOpen = (open) => {
    host.hidden = !open;
    host.setAttribute("aria-hidden", open ? "false" : "true");
    host.classList.toggle("is-open", open);
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      toggleBtn.classList.toggle("is-active", open);
    }
    if (open) {
      _updateContext(host, options);
      const product = host.querySelector("#cartographyProduct")?.value;
      if (product === "localidad") {
        const cveRaw =
          typeof options.getCveMun === "function" ? options.getCveMun() : null;
        void _loadLocalidades(host, cveRaw);
      }
    }
  };

  toggleBtn?.addEventListener("click", () => {
    const open = host.hidden;
    setPanelOpen(open);
  });

  const btn = host.querySelector("#btnCartographyDownload");
  const status = host.querySelector("#cartographyUiStatus");

  btn?.addEventListener("click", async () => {
    if (host.dataset.generating === "1") return;

    const product =
      host.querySelector("#cartographyProduct")?.value || "croquis";
    const format = host.querySelector("#cartographyFormat")?.value || "pdf";
    const template =
      host.querySelector("#cartographyTemplate")?.value || "croquis_municipal";
    const atlasScope =
      host.querySelector("#cartographyAtlasScope")?.value || "current";

    _updateContext(host, options);

    const cveRaw =
      typeof options.getCveMun === "function" ? options.getCveMun() : null;
    const cve = _normCve3(cveRaw);
    const cveLoc = _resolveCveLoc(host);
    const nom =
      typeof options.getNomgeo === "function" ? options.getNomgeo() : "";

    let template_id;
    let params = {};
    let fallbackName;

    if (product === "atlas") {
      template_id = "atlas_municipal";
      if (format === "svg") {
        if (status) status.textContent = "El atlas no admite SVG; elige PDF o GeoPDF.";
        return;
      }
      if (atlasScope === "state") {
        const okState = window.confirm(
          "Se generará el atlas de todos los municipios de Guerrero. Puede tardar. ¿Continuar?"
        );
        if (!okState) {
          if (status) status.textContent = "Cancelado.";
          return;
        }
        params = { scope: "state", cover: true };
        fallbackName = `atlas_municipal_estado.${_extForFormat(format)}`;
      } else {
        if (!cve) {
          if (status) status.textContent = "Selecciona un municipio primero.";
          return;
        }
        params = { cve_mun_list: [cve], cover: true };
        fallbackName = `atlas_municipal_${cve}.${_extForFormat(format)}`;
      }
    } else if (product === "condensado") {
      const okCond = window.confirm(
        "El condensado estatal es un plano de gran formato (120×90 cm). Objetivo: menos de 3 minutos. ¿Continuar?"
      );
      if (!okCond) {
        if (status) status.textContent = "Cancelado.";
        return;
      }
      template_id = "condensado_estatal";
      params = {};
      fallbackName = `condensado_estatal.${_extForFormat(format)}`;
    } else if (product === "localidad") {
      if (!cve) {
        if (status) status.textContent = "Selecciona un municipio primero.";
        return;
      }
      if (!cveLoc) {
        if (status) {
          status.textContent =
            "Elige una localidad de la lista o escribe la clave de 4 dígitos.";
        }
        return;
      }
      template_id = "plano_localidad";
      params = { cve_mun: cve, cve_loc: cveLoc, cve_ent: "12" };
      const mpOn = !!host.querySelector("#cartographyMultipage")?.checked;
      if (mpOn) {
        params.multipage = true;
        const pkg =
          host.querySelector("#cartographyPackage")?.value || "index_plotter";
        if (pkg === "index_plotter") {
          params.package = "index_plotter";
        }
        if (format === "svg") {
          if (status) {
            status.textContent =
              "Multipágina solo admite PDF/GeoPDF. Cambia el formato.";
          }
          return;
        }
      }
      fallbackName = mpOn
        ? params.package === "index_plotter"
          ? `plano_localidad_${cve}_${cveLoc}_pkg.${_extForFormat(format)}`
          : `plano_localidad_${cve}_${cveLoc}_mp.${_extForFormat(format)}`
        : `plano_localidad_${cve}_${cveLoc}.${_extForFormat(format)}`;
    } else if (product === "grosig_croquis") {
      if (!cve) {
        if (status) status.textContent = "Selecciona un municipio primero.";
        return;
      }
      template_id = "grosig_croquis_municipal";
      params = { cve_mun: cve };
      fallbackName = `grosig_croquis_${cve}.${_extForFormat(format)}`;
    } else {
      if (!cve) {
        if (status) status.textContent = "Selecciona un municipio primero.";
        return;
      }
      template_id = template;
      params = { cve_mun: cve };
      fallbackName = `${template_id}_${cve}.${_extForFormat(format)}`;
    }

    const mpOn = !!host.querySelector("#cartographyMultipage")?.checked;
    const pkgOn = params?.package === "index_plotter";
    let busyMsg = "Generando cartografía…";
    if (product === "condensado") {
      busyMsg =
        "Generando condensado estatal (gran formato; puede tardar varios minutos)…";
    } else if (product === "localidad") {
      busyMsg = mpOn
        ? pkgOn
          ? `Generando paquete índice + cartas ${cve}-${cveLoc}…`
          : `Generando cartas detalle ${cve}-${cveLoc}…`
        : `Generando plano localidad ${cve}-${cveLoc}…`;
    } else if (nom) {
      busyMsg = `Generando ${PRODUCT_LABELS[product] || product} de ${nom}…`;
    }

    host.dataset.generating = "1";
    _setCartographyBusy(host, true, busyMsg);
    if (status) status.textContent = busyMsg;

    try {
      const result = await generateAndDownload({
        template_id,
        format,
        params,
        fallbackName,
      });
      if (status) {
        status.textContent = `Listo: ${result.filename} (${_formatBytes(result.size)})`;
      }
    } catch (err) {
      console.warn("[cartography]", err);
      if (status) {
        status.textContent = err?.message || "No se pudo generar el archivo.";
      }
    } finally {
      host.dataset.generating = "0";
      _setCartographyBusy(host, false);
    }
  });

  _bindBatch(host, options, status);
}

function _escapeText(value) {
  const d = document.createElement("div");
  d.textContent = String(value ?? "");
  return d.innerHTML;
}

function _batchItems(host) {
  const cve = host.dataset.locMun || "";
  if (!cve || !_locCache.has(cve)) return { cve, items: [] };
  return { cve, items: _filterByAmbito(host, _locCache.get(cve)) };
}

function _bindBatch(host, options, status) {
  const btn = host.querySelector("#btnCartographyBatch");
  const box = host.querySelector("#cartographyBatchConfirm");
  const summary = host.querySelector("#cartographyBatchSummary");
  const start = host.querySelector("#btnCartographyBatchStart");
  const cancel = host.querySelector("#btnCartographyBatchCancel");
  if (!btn || !box || !summary || !start) return;

  btn.addEventListener("click", () => {
    if (host.dataset.generating === "1") return;
    const { items } = _batchItems(host);
    if (!items.length) {
      box.hidden = true;
      if (status) status.textContent = "Elige un municipio con localidades amanzanadas primero.";
      return;
    }
    const est = estimateBatch(items);
    const nom = typeof options.getNomgeo === "function" ? options.getNomgeo() : "";
    const kinds = [];
    if (est.urban) kinds.push(`${est.urban} ${est.urban === 1 ? "urbana" : "urbanas"}`);
    if (est.rural) kinds.push(`${est.rural} ${est.rural === 1 ? "rural" : "rurales"}`);
    summary.innerHTML = `
      <strong>${items.length} ${items.length === 1 ? "plano" : "planos"}</strong>${
        nom ? ` de ${_escapeText(nom)}` : ""
      } (${kinds.join(", ")}).<br />
      Tiempo estimado: <strong>~${formatDuration(est.seconds)}</strong>${
        est.measured ? "" : " (aproximado; se ajusta con los primeros planos)"
      }.<br />
      ${
        canPickFolder()
          ? "Al empezar elegirás la carpeta donde se guardará cada PDF."
          : "Al terminar se descargará un ZIP con todos los PDF."
      }<br />
      Sin cartas de detalle. Se genera un plano a la vez; puedes cancelar.`;
    box.hidden = false;
  });

  cancel?.addEventListener("click", () => {
    box.hidden = true;
  });
  host.querySelector("#cartographyBatchRow")?.addEventListener("toggle", (ev) => {
    if (!ev.target.open) box.hidden = true;
  });

  start.addEventListener("click", async () => {
    if (host.dataset.generating === "1") return;
    const { cve, items } = _batchItems(host);
    if (!items.length) return;

    let folder = null;
    if (canPickFolder()) {
      try {
        folder = await pickFolder();
        if (!folder) {
          if (status) status.textContent = "Lote cancelado: no se eligió carpeta.";
          return;
        }
      } catch (err) {
        console.warn("[cartography] carpeta no disponible; se usará ZIP", err);
        folder = null;
      }
    }
    box.hidden = true;

    const format = host.querySelector("#cartographyFormat")?.value || "pdf";
    const ext = _extForFormat(format);
    const amb = host.querySelector("#cartographyAmbito")?.value || "";
    const zipName = `planos_localidad_${cve}${amb === "U" ? "_urbanas" : amb === "R" ? "_rurales" : ""}.zip`;
    const ctrl = new AbortController();

    host.dataset.generating = "1";
    _setCartographyBusy(host, true, "Generando planos de localidad…");
    const title = document.getElementById("cartographyBusyTitle");
    const msg = document.getElementById("cartographyBusyMsg");
    const progress = document.getElementById("cartographyBusyProgress");
    const bar = document.getElementById("cartographyBusyBar");
    const cancelBtn = document.getElementById("cartographyBusyCancel");
    const onCancel = () => {
      ctrl.abort();
      if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.textContent = "Cancelando…";
      }
    };
    const warnUnload = (ev) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    if (cancelBtn) {
      cancelBtn.hidden = false;
      cancelBtn.disabled = false;
      cancelBtn.textContent = "Cancelar";
      cancelBtn.addEventListener("click", onCancel);
    }
    if (progress) progress.hidden = false;
    if (bar) bar.style.width = "0";
    window.addEventListener("beforeunload", warnUnload);

    try {
      const result = await runBatch({
        items,
        folder,
        zipName,
        signal: ctrl.signal,
        generate: (item, signal) =>
          generateBlob({
            template_id: "plano_localidad",
            format,
            params: { cve_mun: cve, cve_loc: item.cve_loc, cve_ent: "12" },
            fallbackName: `plano_localidad_${cve}_${item.cve_loc}.${ext}`,
            signal,
          }),
        onProgress: ({ done, total, current, etaSec, ok, failed }) => {
          if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
          if (title) {
            title.textContent = current
              ? `Generando ${done + 1} de ${total}: ${current.nomgeo} (${current.cve_loc})`
              : folder
                ? "Terminando…"
                : "Armando ZIP…";
          }
          if (msg) {
            msg.textContent = current
              ? `Listos ${ok}${failed ? ` · con error ${failed}` : ""} · faltan ~${formatDuration(
                  etaSec
                )}. No cierres la pestaña.`
              : "";
          }
        },
      });
      const where = folder
        ? " en la carpeta elegida"
        : result.zipName
          ? ` en ${result.zipName}`
          : "";
      const errs = result.failed.length
        ? ` · ${result.failed.length} con error (ver _errores.txt): ${result.failed
            .slice(0, 5)
            .map((f) => f.item.cve_loc)
            .join(", ")}${result.failed.length > 5 ? "…" : ""}`
        : "";
      if (status) {
        status.textContent = `${result.cancelled ? "Lote cancelado" : "Lote terminado"}: ${result.ok} de ${
          items.length
        } planos${where}${errs}.${result.aborted ? ` ${result.aborted}` : ""}`;
      }
    } catch (err) {
      console.warn("[cartography] lote", err);
      if (status) status.textContent = `El lote se detuvo: ${err?.message || err}`;
    } finally {
      window.removeEventListener("beforeunload", warnUnload);
      if (cancelBtn) {
        cancelBtn.removeEventListener("click", onCancel);
        cancelBtn.hidden = true;
      }
      if (progress) progress.hidden = true;
      host.dataset.generating = "0";
      _setCartographyBusy(host, false);
    }
  });
}
