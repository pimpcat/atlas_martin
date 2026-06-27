/**
 * Sesión admin del Visor (JWT en sessionStorage).
 * Login en ruta oculta: visor-studio.html (no enlazada desde el portal).
 */
import { apiUrl } from "./atlasConfig.js";

const TOKEN_KEY = "atlasVisorAdminToken";
const USER_KEY = "atlasVisorAdminUser";

export function getAdminToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function getAdminUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAdminSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  document.dispatchEvent(new CustomEvent("atlasgro-visor-admin-auth-change"));
}

export function clearAdminSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  document.dispatchEvent(new CustomEvent("atlasgro-visor-admin-auth-change"));
}

export function isVisorAdminLoggedIn() {
  return Boolean(getAdminToken());
}

export async function adminFetch(path, options = {}) {
  const { clearOn401 = true, ...fetchOptions } = options;
  const token = getAdminToken();
  const headers = new Headers(fetchOptions.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Atlas-Authorization", `Bearer ${token}`);
  }
  if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res;
  let data = null;
  try {
    res = await fetch(apiUrl(path), { ...fetchOptions, headers, cache: "no-store" });
  } catch {
    return { res: null, data: null, networkError: true };
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    data = await res.json();
  }
  if (clearOn401 && res.status === 401) {
    clearAdminSession();
  }
  return { res, data, networkError: false };
}

export async function loginAdmin(username, password) {
  const { res, data, networkError } = await adminFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    clearOn401: false,
  });
  if (networkError || !res) {
    throw new Error("No se pudo contactar al servidor de autenticación");
  }
  if (!res.ok) {
    const msg =
      (data && data.detail && (data.detail.message || data.detail.error)) ||
      (data && data.message) ||
      "No se pudo iniciar sesión";
    throw new Error(String(msg));
  }
  if (!data?.token) throw new Error("Respuesta de login inválida");
  setAdminSession(data.token, data.user);
  return data.user;
}

export async function verifyAdminSession() {
  if (!getAdminToken()) return null;
  const { res, data, networkError } = await adminFetch("/api/admin/me", { clearOn401: false });
  if (networkError || !res) {
    return getAdminUser();
  }
  if (res.status === 401) {
    const errCode = data?.detail?.error || "UNAUTHORIZED";
    const errMsg = data?.detail?.message || "Sesión admin inválida";
    console.warn("[visor-admin] 401:", errCode, errMsg);
    clearAdminSession();
    return null;
  }
  if (!res.ok || !data?.user) {
    return getAdminUser();
  }
  setAdminSession(getAdminToken(), data.user);
  return data.user;
}

export async function logoutAdmin() {
  clearAdminSession();
}
