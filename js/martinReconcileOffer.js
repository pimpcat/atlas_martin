/**
 * Ofrece reconcile Martin confirmado (vistas tiles shared/filtered).
 * Usado tras import SHP Visor y Apply geo de Data Refresh.
 */
import { adminFetch } from "./visorAdminAuth.js";

/**
 * @param {{ reason?: string, hint?: string, onStatus?: (msg: string, ok?: boolean) => void }} [opts]
 * @returns {Promise<{ accepted: boolean, ok?: boolean, data?: any, cancelled?: boolean, networkError?: boolean }>}
 */
export async function offerMartinReconcile(opts = {}) {
  const reason = String(opts.reason || "manual").trim() || "manual";
  const hint = String(opts.hint || "").trim();
  const lines = [
    "¿Actualizar publicación Martin (reconcile)?",
    "",
    "Regenera vistas tiles.* (compartidas y filtradas) para que el mapa use geometrías y valores actuales. Puede tardar unos segundos.",
    "",
    "Cancelar deja el mapa con las vistas previas.",
  ];
  if (hint) {
    lines.splice(3, 0, hint, "");
  }
  if (!window.confirm(lines.join("\n"))) {
    return { accepted: false, cancelled: true };
  }
  opts.onStatus?.("Ejecutando reconcile Martin…", true);
  const { res, data, networkError } = await adminFetch("/api/visor/admin/martin/reconcile", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (networkError || !res) {
    const msg = "No se pudo contactar al servidor para reconcile.";
    opts.onStatus?.(msg, false);
    window.alert(msg);
    return { accepted: true, ok: false, networkError: true };
  }
  if (!res.ok) {
    const msg =
      data?.detail?.message ||
      (typeof data?.detail === "string" ? data.detail : null) ||
      data?.message ||
      `Reconcile falló (HTTP ${res.status})`;
    opts.onStatus?.(msg, false);
    window.alert(msg);
    return { accepted: true, ok: false, data };
  }
  const fl = data?.publication_views?.filtered_layers || {};
  const fed = data?.publication_views?.filtered_layers_federated || {};
  const parts = [
    data?.message || "Reconcile completado.",
    fl.created_count != null ? `Filtered: ${fl.created_count} vista(s)` : null,
    fl.failed_count ? `fallos filtered: ${fl.failed_count}` : null,
    fed.targets ? `Federado: ${fed.ok_count || 0}/${fed.targets} OK` : null,
  ].filter(Boolean);
  const summary = parts.join(" · ");
  opts.onStatus?.(summary, Boolean(data?.ok !== false && !(fl.failed_count > 0)));
  window.alert(summary);
  return { accepted: true, ok: Boolean(data?.ok !== false), data };
}
