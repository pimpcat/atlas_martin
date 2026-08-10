/**
 * GroSIG Studio — home administrativo (hub de Studios).
 */
import {
  clearAdminSession,
  getAdminUser,
  isVisorAdminLoggedIn,
  loginAdmin,
  verifyAdminSession,
} from "./visorAdminAuth.js";
import { mountStudioNav, studioLoginFooterHtml } from "./studioNav.js";
import { apiUrl } from "./atlasConfig.js";
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

function showLogin(show) {
  $("grosigLoginView")?.classList.toggle("d-none", !show);
  $("grosigDashboard")?.classList.toggle("d-none", show);
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

function pill(label, ok, detail) {
  const cls = ok ? "text-bg-success" : "text-bg-secondary";
  const extra = detail ? ` · ${detail}` : "";
  return `<span class="badge ${cls} grosig-status-pill">${label}${extra}</span>`;
}

async function refreshHealth() {
  const host = $("grosigHealthPills");
  if (!host) return;
  host.innerHTML = `<span class="badge text-bg-secondary grosig-status-pill">Comprobando…</span>`;

  const [atlas, geo, cartoProbe] = await Promise.all([
    probeJson("/api/health"),
    probeJson("/api/geography-context/health"),
    probeCartographyHealth({ force: true }),
  ]);

  const parts = [];
  parts.push(
    pill(
      "Atlas API",
      Boolean(atlas.ok && (atlas.data?.ok !== false)),
      atlas.ok ? "ok" : "off"
    )
  );
  const geoOn =
    geo.ok &&
    geo.data?.enabled &&
    geo.data?.engine === "grosig-geography-context";
  parts.push(pill("Geography Context", geoOn, geoOn ? "enabled" : "off"));

  const cartoSummary = summarizeCartographyHealth(cartoProbe.health);
  const cartoDetail = cartoProbe.ok
    ? `${cartoSummary.statusLabel} · ${cartoSummary.version}`
    : "off";
  parts.push(pill("Cartography Engine", cartoProbe.ok, cartoDetail));
  host.innerHTML = parts.join("");
}

async function bootDashboard() {
  const user = getAdminUser();
  if ($("grosigWelcome")) {
    $("grosigWelcome").textContent = user?.username
      ? `Sesión: ${user.username}`
      : "Sesión admin activa";
  }
  mountStudioNav($("grosigStudioNav"), { active: "hub" });
  showLogin(false);
  await refreshHealth();
}

async function init() {
  const footer = $("grosigLoginFooter");
  if (footer) footer.innerHTML = studioLoginFooterHtml("hub");

  $("grosigLoginForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showErr($("grosigLoginError"), "");
    try {
      await loginAdmin($("grosigUser").value.trim(), $("grosigPass").value);
      await bootDashboard();
    } catch (err) {
      showErr($("grosigLoginError"), err.message || String(err));
    }
  });

  $("grosigLogoutBtn")?.addEventListener("click", () => {
    clearAdminSession();
    showLogin(true);
  });

  if (isVisorAdminLoggedIn()) {
    try {
      await verifyAdminSession();
      await bootDashboard();
    } catch {
      clearAdminSession();
      showLogin(true);
    }
  } else {
    showLogin(true);
  }
}

void init();
