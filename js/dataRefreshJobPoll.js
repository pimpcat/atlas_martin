/**
 * Poll de jobs Data Refresh — extract Fase 4.3 (bajo riesgo).
 * La UI (setProgress / labels) se inyecta por callbacks.
 */
import { adminFetch } from "./visorAdminAuth.js";

export const DATA_REFRESH_TERMINAL = new Set([
  "ready",
  "failed",
  "cancelled",
  "applied",
]);

/**
 * @param {string} jobId
 * @param {{
 *   onTick?: (job: object) => void,
 *   sleepMs?: number,
 *   maxMs?: number,
 *   comparingTimeoutMs?: number,
 *   createSleep?: (ms: number) => Promise<void>,
 * }} [opts]
 */
export async function pollDataRefreshJobUntilTerminal(jobId, opts = {}) {
  const onTick = opts.onTick;
  const sleepMs = opts.sleepMs ?? 1500;
  const maxMs = opts.maxMs ?? 12 * 60 * 1000;
  const comparingTimeoutMs = opts.comparingTimeoutMs ?? 90_000;
  const sleep =
    opts.createSleep ||
    ((ms) => new Promise((r) => setTimeout(r, ms)));

  const started = Date.now();
  let lastStatus = "";
  let statusSince = Date.now();

  while (Date.now() - started < maxMs) {
    const { res, data } = await adminFetch(
      `/api/data-refresh/jobs/${encodeURIComponent(jobId)}`
    );
    if (!res?.ok) {
      throw new Error(
        data?.detail?.message || `No se pudo consultar job (${res?.status})`
      );
    }
    const job = data.job;
    if (job.status !== lastStatus) {
      lastStatus = job.status;
      statusSince = Date.now();
    }
    if (typeof onTick === "function") onTick(job);
    if (DATA_REFRESH_TERMINAL.has(job.status)) return job;
    if (job.status === "comparing" && Date.now() - statusSince > comparingTimeoutMs) {
      throw new Error(
        "La comparación lleva demasiado tiempo (posible lock en Postgres). " +
          "Cancele el job, recree api_backend y vuelva a intentar."
      );
    }
    await sleep(sleepMs);
  }
  throw new Error(
    "Tiempo de espera agotado consultando el job. Revise Jobs recientes."
  );
}
