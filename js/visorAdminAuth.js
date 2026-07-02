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
    const detail = data?.detail;
    const msg =
      (typeof detail === "object" && detail !== null && (detail.message || detail.error)) ||
      (typeof detail === "string" && detail) ||
      (data && data.message) ||
      (res.status === 429
        ? "Demasiados intentos. Espere un minuto e intente de nuevo."
        : "No se pudo iniciar sesión");
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

function _detailMessage(data, fallback) {
  const detail = data?.detail;
  if (typeof detail === "object" && detail !== null) {
    return detail.message || detail.error || fallback;
  }
  if (typeof detail === "string" && detail) return detail;
  return data?.message || fallback;
}

export async function fetchAdminUsers() {
  const { res, data, networkError } = await adminFetch("/api/admin/users");
  if (networkError || !res) throw new Error("No se pudo contactar al servidor");
  if (!res.ok) throw new Error(_detailMessage(data, "No se pudo listar usuarios"));
  return data?.users || [];
}

export async function createAdminUserAccount(payload) {
  const { res, data, networkError } = await adminFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (networkError || !res) throw new Error("No se pudo contactar al servidor");
  if (!res.ok) throw new Error(_detailMessage(data, "No se pudo crear el usuario"));
  return data;
}

export async function patchAdminUserAccount(userId, payload) {
  const { res, data, networkError } = await adminFetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (networkError || !res) throw new Error("No se pudo contactar al servidor");
  if (!res.ok) throw new Error(_detailMessage(data, "No se pudo actualizar el usuario"));
  return data;
}

export async function changeMyAdminPassword(currentPassword, newPassword) {
  const { res, data, networkError } = await adminFetch("/api/admin/me/password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (networkError || !res) throw new Error("No se pudo contactar al servidor");
  if (!res.ok) throw new Error(_detailMessage(data, "No se pudo cambiar la contraseña"));
  return data;
}

export async function resetAdminUserPassword(userId, newPassword) {
  const { res, data, networkError } = await adminFetch(`/api/admin/users/${userId}/password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (networkError || !res) throw new Error("No se pudo contactar al servidor");
  if (!res.ok) throw new Error(_detailMessage(data, "No se pudo restablecer la contraseña"));
  return data;
}
