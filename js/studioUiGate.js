/**
 * Gate legacy ↔ v2 para GroSIG Studio y Nodo Studio.
 * Override: ?ui=legacy | ?ui=v2
 *
 * Con GROSIG_STUDIO_UI=v2 el hub legacy debe redirigir a v2.
 * Si el API no responde, se usa cache de sesión o data-studio-ui-fallback en <html>.
 */
import { apiUrl } from "./atlasConfig.js";

const LEGACY = {
  grosig: "./grosig-studio.html",
  nodo: "./nodo-studio.html",
};
const V2 = {
  grosig: "./grosig-studio-v2.html",
  nodo: "./grosig-studio-v2.html?view=nodo",
};

function urlOverride() {
  const q = new URLSearchParams(window.location.search).get("ui");
  if (q === "legacy" || q === "v2") return q;
  return null;
}

function isV2Path(kind) {
  const path = window.location.pathname || "";
  if (kind === "grosig") return path.includes("grosig-studio-v2");
  if (path.includes("nodo-studio-v2")) return true;
  if (path.includes("grosig-studio-v2")) {
    return (new URLSearchParams(window.location.search).get("view") || "") === "nodo";
  }
  return false;
}

function cacheKey(kind) {
  return `grosigStudioUiMode:${kind}`;
}

function readCachedMode(kind) {
  try {
    const v = sessionStorage.getItem(cacheKey(kind));
    if (v === "legacy" || v === "v2") return v;
  } catch {
    /* ignore */
  }
  const fb = document.documentElement.getAttribute("data-studio-ui-fallback");
  if (fb === "legacy" || fb === "v2") return fb;
  return null;
}

function writeCachedMode(kind, mode) {
  if (mode !== "legacy" && mode !== "v2") return;
  try {
    sessionStorage.setItem(cacheKey(kind), mode);
  } catch {
    /* ignore */
  }
}

export async function fetchStudioUiConfig() {
  try {
    const res = await fetch(apiUrl("/api/grosig/studio-ui-config"), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/**
 * @param {"grosig"|"nodo"} kind
 */
export async function applyStudioUiGate(kind) {
  const override = urlOverride();
  let mode = override;
  if (!mode) {
    const cfg = await fetchStudioUiConfig();
    if (cfg) {
      mode = kind === "grosig" ? cfg.studio_ui : cfg.nodo_ui;
      writeCachedMode(kind, mode);
    } else {
      // Antes: return temprano dejaba abiertos legacy y v2 a la vez.
      mode = readCachedMode(kind);
      if (!mode) return null;
    }
  }
  const wantV2 = mode === "v2";
  const onV2 = isV2Path(kind);
  if (wantV2 && !onV2) {
    window.location.replace(V2[kind] + window.location.search);
    return null;
  }
  if (!wantV2 && onV2) {
    window.location.replace(LEGACY[kind] + window.location.search);
    return null;
  }
  return { mode, kind };
}
