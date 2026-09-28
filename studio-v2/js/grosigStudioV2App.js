/**
 * GroSIG Studio 2 — shell + workspace router (Fase A–D).
 */
import { createStudioShell } from "../../js/studioShell.js";
import { initThemeSelector, readStoredTheme } from "../../js/theme.js";
import { getAdminUser } from "../../js/visorAdminAuth.js";
import { renderSidebarNavWithFlags } from "./shell/navigation.js";
import { initShellLayout } from "./shell/layout.js";
import { mountBrandLogos } from "./shell/brandLogo.js";
import { initShellSpaNavigation } from "./shell/spaNavigation.js";
import {
  getViewFromUrl,
  getViewMeta,
  mountWorkspaceView,
} from "./shell/workspaceRouter.js";

const $ = (id) => document.getElementById(id);

/** @type {Promise<void>} */
let _dashboardQueue = Promise.resolve();

async function mountShellDashboardImpl(viewId = getViewFromUrl()) {
  const meta = getViewMeta(viewId);
  await renderSidebarNavWithFlags($("gs2SidebarNav"), { activeId: meta.navActiveId });
  const user = getAdminUser();
  initShellLayout({ user });
  await mountWorkspaceView(viewId);
}

function mountShellDashboard(viewId = getViewFromUrl()) {
  _dashboardQueue = _dashboardQueue
    .then(() => mountShellDashboardImpl(viewId))
    .catch((err) => {
      console.error("[gs2] mountShellDashboard", err);
    });
  return _dashboardQueue;
}

async function init() {
  document.documentElement.setAttribute("data-theme", readStoredTheme());
  initThemeSelector();
  void mountBrandLogos();

  const shell = createStudioShell(
    {
      loginView: "gs2LoginView",
      dashboard: "gs2Dashboard",
      loginForm: "gs2LoginForm",
      entidad: "gs2Entidad",
      user: "gs2User",
      pass: "gs2Pass",
      loginError: "gs2LoginError",
      loginFooter: "gs2LoginFooter",
      logoutBtn: "gs2LogoutBtn",
      nav: "gs2NavHidden",
      welcome: "gs2WelcomeHidden",
    },
    {
      activeNav: "hub",
      themePicker: false,
      instanceBadge: false,
      onEnterDashboard: () => mountShellDashboard(),
      formatWelcome: (user) =>
        user?.username ? `${user.username} · SuperAdmin` : "Sesión admin",
    },
  );

  await shell.boot();
  initShellSpaNavigation((viewId) => mountShellDashboard(viewId));
}

init();
