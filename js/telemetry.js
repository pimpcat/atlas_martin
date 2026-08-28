/**
 * Telemetría de uso del portal (eventos anónimos → CORE).
 * No envía PII. Fallos de red se ignoran.
 */
import { apiUrl } from "./atlasConfig.js";
import { getActiveCveEnt } from "./amigoDeployment.js";

const SESSION_KEY = "amigoTelemetrySessionId";
const STARTED_KEY = "amigoTelemetrySessionStarted";

function uuidv4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getTelemetrySessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuidv4();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return uuidv4();
  }
}

function pad2(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length ? d.padStart(2, "0").slice(-2) : "";
}

function pad3(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length ? d.padStart(3, "0").slice(-3) : "";
}

/**
 * @param {string} type
 * @param {{
 *   cve_ent?: string,
 *   cve_mun?: string,
 *   resourceType?: string,
 *   resourceKey?: string,
 *   metadata?: object,
 * }} [opts]
 */
export function trackEvent(type, opts = {}) {
  const tipo = String(type || "").trim().toUpperCase();
  if (!tipo) return;
  const ent = pad2(opts.cve_ent != null ? opts.cve_ent : getActiveCveEnt());
  const mun = pad3(opts.cve_mun || "");
  const body = {
    type: tipo,
    session_id: getTelemetrySessionId(),
    territory: {
      cve_ent: ent || undefined,
      cve_mun: mun || undefined,
    },
  };
  if (opts.resourceType || opts.resourceKey) {
    body.resource = {
      type: String(opts.resourceType || "").slice(0, 30),
      key: String(opts.resourceKey || "").slice(0, 120),
    };
  }
  if (opts.metadata && typeof opts.metadata === "object") {
    body.metadata = opts.metadata;
  }
  try {
    const url = apiUrl("/api/telemetry/events");
    const payload = JSON.stringify(body);
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: payload,
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
  } catch {
    /* noop */
  }
}

/** Una vez por pestaña: SESION_INICIADA. */
export function trackSessionStart() {
  try {
    if (sessionStorage.getItem(STARTED_KEY)) return;
    sessionStorage.setItem(STARTED_KEY, "1");
  } catch {
    /* still fire */
  }
  trackEvent("SESION_INICIADA");
}
