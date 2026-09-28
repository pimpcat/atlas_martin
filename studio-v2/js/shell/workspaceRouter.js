/**
 * Router de workspace — carga módulos nativos v2 (Fase D).
 */
import { initOverview, teardownOverview } from "../grosigOverviewApp.js";
import {
  mountVisorStudioV2,
  teardownVisorStudioV2,
  VIEW_META as VISOR_META,
} from "../viewer/visorStudioV2Module.js";
import {
  mountUsersStudioV2,
  teardownUsersStudioV2,
  VIEW_META as USERS_META,
} from "../users/usersStudioV2Module.js";
import {
  mountGeographyStudioV2,
  teardownGeographyStudioV2,
  VIEW_META as GEOGRAPHY_META,
} from "../geography/geographyStudioV2Module.js";
import {
  mountIndicatorsStudioV2,
  teardownIndicatorsStudioV2,
  VIEW_META as INDICATORS_META,
} from "../indicators/indicatorsStudioV2Module.js";
import {
  mountInvStudioV2,
  teardownInvStudioV2,
  VIEW_META as INV_META,
} from "../inv/invStudioV2Module.js";
import {
  mountExplorerStudioV2,
  teardownExplorerStudioV2,
  VIEW_META as EXPLORER_META,
} from "../explorer/explorerStudioV2Module.js";
import {
  mountCartographyStudioV2,
  teardownCartographyStudioV2,
  VIEW_META as CARTOGRAPHY_META,
} from "../cartography/cartographyStudioV2Module.js";
import {
  mountThemeStudioV2,
  teardownThemeStudioV2,
  VIEW_META as THEME_META,
} from "../theme/themeStudioV2Module.js";
import {
  mountDataRefreshStudioV2,
  teardownDataRefreshStudioV2,
  VIEW_META as DATA_REFRESH_META,
} from "../dataRefresh/dataRefreshStudioV2Module.js";
import {
  mountBackupStudioV2,
  teardownBackupStudioV2,
  VIEW_META as BACKUP_META,
} from "../backup/backupStudioV2Module.js";
import {
  mountNodoStudioV2,
  teardownNodoStudioV2,
  VIEW_META as NODO_META,
} from "../nodo/nodoStudioV2Module.js";
import {
  nextMountToken,
  staleCheck,
  StaleMountError,
} from "./mountGuard.js";

export const VIEWS = {
  overview: {
    id: "overview",
    title: "Resumen",
    subtitle: "Centro de control de la plataforma",
    navActiveId: "overview",
  },
  visor: VISOR_META,
  users: USERS_META,
  geography: GEOGRAPHY_META,
  indicators: INDICATORS_META,
  inv: INV_META,
  explorer: EXPLORER_META,
  cartography: CARTOGRAPHY_META,
  theme: THEME_META,
  "data-refresh": DATA_REFRESH_META,
  backup: BACKUP_META,
  nodo: NODO_META,
};

/** @returns {keyof typeof VIEWS} */
export function getViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") || "overview").trim().toLowerCase();
  return view in VIEWS ? /** @type {keyof typeof VIEWS} */ (view) : "overview";
}

/**
 * @param {keyof typeof VIEWS} viewId
 */
export function getViewMeta(viewId) {
  return VIEWS[viewId] || VIEWS.overview;
}

/**
 * @param {keyof typeof VIEWS} viewId
 */
export function applyShellChrome(viewId) {
  const meta = getViewMeta(viewId);
  const topbarTitle = document.getElementById("gs2TopbarTitle");
  const topbarSub = document.getElementById("gs2TopbarSub");
  const refreshBtn = document.getElementById("gs2OverviewRefresh");
  if (topbarTitle) topbarTitle.textContent = meta.title;
  if (topbarSub) topbarSub.textContent = meta.subtitle;
  refreshBtn?.classList.toggle("d-none", viewId !== "overview");
  document.title = `GroSIG Studio 2 — ${meta.title}`;
}

function hideStudioMount(studioMount) {
  if (!studioMount) return;
  studioMount.classList.add("d-none");
  studioMount.hidden = true;
  studioMount.innerHTML = "";
}

function showStudioMount(studioMount) {
  if (!studioMount) return;
  studioMount.classList.remove("d-none");
  studioMount.hidden = false;
}

/**
 * @param {HTMLElement|null} studioMount
 * @param {Error} err
 */
function showMountError(studioMount, err) {
  if (!studioMount) return;
  showStudioMount(studioMount);
  const msg = err?.message || String(err);
  studioMount.innerHTML = `<div class="alert alert-danger m-2 mb-0" role="alert">${escapeHtml(msg)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @type {Promise<void>} */
let _mountQueue = Promise.resolve();

/**
 * @param {keyof typeof VIEWS} viewId
 */
export function mountWorkspaceView(viewId) {
  const mountToken = nextMountToken();
  _mountQueue = _mountQueue
    .then(() => mountWorkspaceViewInner(viewId, mountToken))
    .catch((err) => {
      if (err instanceof StaleMountError) return;
      console.error("[gs2] mountWorkspaceView", err);
      showMountError(document.getElementById("gs2StudioMount"), err);
    });
  return _mountQueue;
}

/**
 * @param {keyof typeof VIEWS} viewId
 * @param {number} mountToken
 */
async function mountWorkspaceViewInner(viewId, mountToken) {
  const workspace = document.getElementById("gs2Workspace");
  const overviewRoot = document.getElementById("gs2OverviewRoot");
  const studioMount = document.getElementById("gs2StudioMount");

  applyShellChrome(viewId);
  teardownOverview();
  teardownVisorStudioV2();
  teardownUsersStudioV2();
  teardownGeographyStudioV2();
  teardownIndicatorsStudioV2();
  teardownInvStudioV2();
  teardownExplorerStudioV2();
  teardownCartographyStudioV2();
  teardownThemeStudioV2();
  teardownDataRefreshStudioV2();
  teardownBackupStudioV2();
  teardownNodoStudioV2();
  staleCheck(mountToken);

  if (
    viewId === "visor" ||
    viewId === "users" ||
    viewId === "geography" ||
    viewId === "indicators" ||
    viewId === "inv" ||
    viewId === "explorer" ||
    viewId === "cartography" ||
    viewId === "theme" ||
    viewId === "data-refresh" ||
    viewId === "backup" ||
    viewId === "nodo"
  ) {
    overviewRoot?.classList.add("d-none");
    workspace?.classList.remove("gs2-overview-fit");
    showStudioMount(studioMount);
    staleCheck(mountToken);
    if (viewId === "visor") {
      await mountVisorStudioV2(studioMount, mountToken);
    } else if (viewId === "users") {
      await mountUsersStudioV2(studioMount, mountToken);
    } else if (viewId === "geography") {
      await mountGeographyStudioV2(studioMount, mountToken);
    } else if (viewId === "indicators") {
      await mountIndicatorsStudioV2(studioMount, mountToken);
    } else if (viewId === "inv") {
      await mountInvStudioV2(studioMount, mountToken);
    } else if (viewId === "explorer") {
      await mountExplorerStudioV2(studioMount, mountToken);
    } else if (viewId === "cartography") {
      await mountCartographyStudioV2(studioMount, mountToken);
    } else if (viewId === "theme") {
      await mountThemeStudioV2(studioMount, mountToken);
    } else if (viewId === "data-refresh") {
      await mountDataRefreshStudioV2(studioMount, mountToken);
    } else if (viewId === "backup") {
      await mountBackupStudioV2(studioMount, mountToken);
    } else {
      await mountNodoStudioV2(studioMount, mountToken);
    }
    staleCheck(mountToken);
    return;
  }

  hideStudioMount(studioMount);
  overviewRoot?.classList.remove("d-none");
  workspace?.classList.add("gs2-overview-fit");
  staleCheck(mountToken);
  await initOverview();
  staleCheck(mountToken);
}

