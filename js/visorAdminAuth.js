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

/**
 * Upload autenticado con progreso (XHR). Misma forma de auth que adminFetch.
 * @param {string} path
 * @param {FormData} formData
 * @param {{ method?: string, clearOn401?: boolean, onProgress?: (ratio: number) => void }} [options]
 * @returns {Promise<{ status: number, ok: boolean, data: any, networkError: boolean }>}
 */
export function adminUpload(path, formData, options = {}) {
  const {
    method = "POST",
    clearOn401 = true,
    onProgress = null,
  } = options;
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, apiUrl(path));
    const token = getAdminToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("X-Atlas-Authorization", `Bearer ${token}`);
    }
    xhr.responseType = "json";
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || typeof onProgress !== "function") return;
      onProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      const status = xhr.status;
      if (clearOn401 && status === 401) {
        clearAdminSession();
      }
      const data =
        xhr.response && typeof xhr.response === "object" ? xhr.response : null;
      resolve({
        status,
        ok: status >= 200 && status < 300,
        data,
        networkError: false,
      });
    };
    xhr.onerror = () => {
      resolve({ status: 0, ok: false, data: null, networkError: true });
    };
    xhr.ontimeout = () => {
      resolve({ status: 0, ok: false, data: null, networkError: true });
    };
    xhr.timeout = 0;
    xhr.send(formData);
  });
}

/**
 * Descarga autenticada como Blob (p. ej. ZIP de Backup Studio).
 * @param {string} path
 * @param {{ clearOn401?: boolean, filename?: string, triggerDownload?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, blob?: Blob, filename?: string, status?: number, message?: string, networkError?: boolean }>}
 */
export async function adminDownloadBlob(path, options = {}) {
  const {
    clearOn401 = true,
    filename: forcedName = "",
    triggerDownload = true,
  } = options;
  const token = getAdminToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Atlas-Authorization", `Bearer ${token}`);
  }
  let res;
  try {
    res = await fetch(apiUrl(path), { headers, cache: "no-store" });
  } catch {
    return { ok: false, networkError: true, message: "No se pudo contactar al servidor" };
  }
  if (clearOn401 && res.status === 401) {
    clearAdminSession();
  }
  if (!res.ok) {
    let message = `Error HTTP ${res.status}`;
    try {
      const j = await res.json();
      message = j?.detail?.message || j?.message || message;
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, message };
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename="?([^";]+)"?/i.exec(cd);
  const filename = forcedName || (m?.[1] || "download.bin");
  if (triggerDownload) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return { ok: true, blob, filename, status: res.status };
}

/**
 * Combo de entidades con instancia ACTIVA/PILOTO (CORE).
 * @param {HTMLSelectElement|HTMLFormElement|null} target
 */
export async function fillLoginInstanciasSelect(target) {
  let select = null;
  if (target && target.tagName === "SELECT") {
    select = target;
  } else if (target && target.tagName === "FORM") {
    select =
      target.querySelector("select[id$='Entidad']") ||
      target.querySelector("select");
    if (!select) {
      const wrap = document.createElement("div");
      const formId = target.id || "studio";
      const sid = formId.replace(/LoginForm$/, "") + "Entidad";
      wrap.innerHTML =
        `<label class="form-label small" for="${sid}">Entidad</label>` +
        `<select id="${sid}" class="form-select form-select-sm" required>` +
        `<option value="">Cargando instancias…</option></select>`;
      target.insertBefore(wrap, target.firstElementChild);
      select = wrap.querySelector("select");
    }
  }
  if (!select) return;
  try {
    const { res, data, networkError } = await adminFetch(
      "/api/admin/login-instancias",
      { clearOn401: false }
    );
    if (networkError || !res || !res.ok) {
      select.innerHTML =
        '<option value="">No se pudieron cargar instancias</option>';
      return;
    }
    const items = data?.instancias || [];
    if (!items.length) {
      select.innerHTML =
        '<option value="">No hay instancias activas o piloto</option>';
      return;
    }
    select.innerHTML = items
      .map((it) => {
        const v = String(it.cve_ent || "").padStart(2, "0");
        const label = it.label || `[${v}] ${it.nombre || ""} · ${it.estado || ""}`;
        return `<option value="${v}">${label}</option>`;
      })
      .join("");
    const gro = items.find((it) => String(it.cve_ent).padStart(2, "0") === "12");
    if (gro) select.value = "12";
  } catch {
    select.innerHTML = '<option value="">Error al cargar instancias</option>';
  }
}

export async function loginAdmin(username, password, cveEnt) {
  const body = { username, password };
  const ent = String(cveEnt || "").trim();
  if (ent) body.cve_ent = ent;
  const { res, data, networkError } = await adminFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify(body),
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
