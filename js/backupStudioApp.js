/**
 * Backup Studio — ZIP dumps + config (+ MBTiles opcional).
 */
import {
  adminFetch,
  clearAdminSession,
  getAdminToken,
  isVisorAdminLoggedIn,
  loginAdmin,
  verifyAdminSession,
} from "./visorAdminAuth.js";
import { mountStudioNav, studioLoginFooterHtml } from "./studioNav.js";
import { apiUrl } from "./atlasConfig.js";

const $ = (id) => document.getElementById(id);

let _pollTimer = null;
let _activeId = null;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

function setMsg(el, msg, ok = true) {
  if (!el) return;
  el.textContent = msg || "";
  el.className = `small ${ok ? "text-success" : "text-danger"}`;
}

function showLogin(show) {
  $("bkLoginView")?.classList.toggle("d-none", !show);
  $("bkDashboard")?.classList.toggle("d-none", show);
}

function fmtBytes(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return "—";
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / (1024 * 1024)).toFixed(1)} MB`;
  return `${(x / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("es-MX");
  } catch {
    return String(iso);
  }
}

async function loadMeta() {
  const { res, data } = await adminFetch("/api/admin/backups/meta");
  const hint = $("bkMetaHint");
  if (!res?.ok) {
    if (hint) hint.textContent = "No se pudo cargar meta.";
    return;
  }
  const d = data.defaults || {};
  if ($("bkAtlas")) $("bkAtlas").checked = d.include_atlas !== false;
  if ($("bkCarto")) {
    $("bkCarto").checked = !!d.include_cartography;
    $("bkCarto").disabled = !data.cartography_configured;
  }
  if ($("bkConfig")) $("bkConfig").checked = d.include_config !== false;
  if ($("bkMbtiles")) {
    $("bkMbtiles").checked = false;
    if (!data.mbtiles_available) {
      $("bkMbtiles").disabled = true;
    }
  }
  if (hint) {
    const parts = [
      data.pg_dump_available ? "pg_dump OK" : "⚠ pg_dump no disponible en API",
      `retención ${data.keep || 5}`,
      data.mbtiles_available ? "MBTiles montado" : "MBTiles no montado",
    ];
    hint.textContent = parts.join(" · ");
  }
}

async function loadList() {
  const host = $("bkList");
  if (!host) return;
  const { res, data } = await adminFetch("/api/admin/backups/?limit=20");
  if (!res?.ok) {
    host.innerHTML = `<p class="small text-danger mb-0">Error al listar</p>`;
    return;
  }
  const items = data.backups || [];
  if (!items.length) {
    host.innerHTML = `<p class="small text-muted mb-0">Sin respaldos aún.</p>`;
    return;
  }
  host.innerHTML = items
    .map((b) => {
      const opts = b.options || {};
      const bits = [
        opts.include_atlas ? "atlas" : null,
        opts.include_cartography ? "carto" : null,
        opts.include_config ? "config" : null,
        opts.include_mbtiles ? "mbtiles" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const ready = b.status === "ready";
      const failed = b.status === "failed";
      return `<div class="border rounded p-2 mb-2 small">
        <div class="d-flex justify-content-between gap-2">
          <div>
            <div><code>${escapeHtml(b.id)}</code> · <strong>${escapeHtml(
        b.status || ""
      )}</strong></div>
            <div class="text-muted">${escapeHtml(formatWhen(b.created_at))} · ${escapeHtml(
        bits || "—"
      )} · ${escapeHtml(fmtBytes(b.size_bytes))}</div>
            <div>${escapeHtml(b.label || "")}</div>
            ${
              failed && b.error
                ? `<div class="text-danger">${escapeHtml(b.error)}</div>`
                : ""
            }
            ${
              b.progress != null && !ready && !failed
                ? `<div class="progress mt-1" style="height:6px"><div class="progress-bar" style="width:${Math.min(
                    100,
                    Number(b.progress) || 0
                  )}%"></div></div>`
                : ""
            }
          </div>
          <div class="flex-shrink-0">
            ${
              ready
                ? `<button type="button" class="btn btn-success btn-sm" data-dl="${escapeHtml(
                    b.id
                  )}">Descargar</button>`
                : ""
            }
          </div>
        </div>
      </div>`;
    })
    .join("");
  host.querySelectorAll("[data-dl]").forEach((btn) => {
    btn.addEventListener("click", () => void downloadBackup(btn.getAttribute("data-dl")));
  });
}

async function downloadBackup(id) {
  const token = getAdminToken();
  if (!token || !id) return;
  setMsg($("bkCreateMsg"), "Descargando…", true);
  try {
    const res = await fetch(apiUrl(`/api/admin/backups/${encodeURIComponent(id)}/download`), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Atlas-Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      let detail = "Error al descargar";
      try {
        const j = await res.json();
        detail = j?.detail?.message || detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = /filename="?([^"]+)"?/i.exec(cd);
    const filename = m?.[1] || `grosig_backup_${id}.zip`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg($("bkCreateMsg"), "Descarga iniciada.", true);
  } catch (err) {
    setMsg($("bkCreateMsg"), err?.message || "Error", false);
  }
}

function stopPoll() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  _activeId = null;
}

function startPoll(id) {
  stopPoll();
  _activeId = id;
  _pollTimer = setInterval(() => void pollActive(), 2500);
  void pollActive();
}

async function pollActive() {
  if (!_activeId) return;
  const { res, data } = await adminFetch(
    `/api/admin/backups/${encodeURIComponent(_activeId)}`
  );
  if (!res?.ok) return;
  const b = data.backup || {};
  setMsg(
    $("bkCreateMsg"),
    `${b.label || b.status || "…"} (${b.progress ?? 0}%)`,
    b.status !== "failed"
  );
  await loadList();
  if (b.status === "ready" || b.status === "failed") {
    stopPoll();
  }
}

async function createBackup() {
  const body = {
    include_atlas: !!$("bkAtlas")?.checked,
    include_cartography: !!$("bkCarto")?.checked,
    include_config: !!$("bkConfig")?.checked,
    include_mbtiles: !!$("bkMbtiles")?.checked,
  };
  if (!Object.values(body).some(Boolean)) {
    setMsg($("bkCreateMsg"), "Seleccione al menos un componente.", false);
    return;
  }
  setMsg($("bkCreateMsg"), "Encolando…", true);
  const { res, data } = await adminFetch("/api/admin/backups/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res?.ok) {
    setMsg(
      $("bkCreateMsg"),
      data?.detail?.message || "No se pudo crear el respaldo",
      false
    );
    return;
  }
  const id = data.backup?.id;
  setMsg($("bkCreateMsg"), `Job ${id} en curso…`, true);
  if (id) startPoll(id);
  await loadList();
}

async function enterApp() {
  mountStudioNav($("bkStudioNav"), { active: "backup" });
  showLogin(false);
  try {
    await loadMeta();
  } catch (err) {
    console.warn(err);
  }
  try {
    await loadList();
  } catch (err) {
    const host = $("bkList");
    if (host) {
      host.innerHTML = `<p class="small text-danger mb-0">${escapeHtml(
        err?.message || "Error"
      )}</p>`;
    }
  }
}

async function init() {
  const footer = $("bkLoginFooter");
  if (footer) footer.innerHTML = studioLoginFooterHtml("backup");

  $("bkLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr($("bkLoginError"), "");
    try {
      await loginAdmin($("bkUser").value.trim(), $("bkPass").value);
      await enterApp();
    } catch (err) {
      showErr($("bkLoginError"), err?.message || "Login fallido");
    }
  });
  $("bkLogoutBtn")?.addEventListener("click", () => {
    stopPoll();
    clearAdminSession();
    showLogin(true);
  });
  $("bkCreateBtn")?.addEventListener("click", () => void createBackup());
  $("bkRefreshBtn")?.addEventListener("click", () => void loadList());

  if (isVisorAdminLoggedIn()) {
    try {
      await verifyAdminSession();
      await enterApp();
    } catch {
      clearAdminSession();
      showLogin(true);
    }
  } else {
    showLogin(true);
  }
}

void init();
