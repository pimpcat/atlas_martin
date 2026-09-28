/**
 * Cliente API P6 — Custom Product Builder (aislado de oficiales).
 */
import { adminFetch } from "./visorAdminAuth.js";

function errMsg(data, fallback) {
  return (
    data?.detail?.message ||
    (typeof data?.detail === "string" ? data.detail : null) ||
    data?.message ||
    fallback
  );
}

async function jsonOrThrow(path, options, fallback) {
  const { res, data, networkError } = await adminFetch(path, options);
  if (networkError || !res) throw new Error("No se pudo contactar al API");
  if (!res.ok) throw new Error(errMsg(data, fallback || `HTTP ${res.status}`));
  return data;
}

export async function listCustoms() {
  const data = await jsonOrThrow("/api/cartography/custom", {}, "No se pudo listar customs");
  return data?.customs || [];
}

export async function cloneFromProduct(productKey, opts = {}) {
  return jsonOrThrow(
    `/api/cartography/custom/from-product/${encodeURIComponent(productKey)}`,
    {
      method: "POST",
      body: JSON.stringify({
        template_id: opts.templateId || undefined,
        name: opts.name || undefined,
        custom_id: opts.customId || undefined,
      }),
    },
    "No se pudo clonar producto"
  );
}

export async function getCustom(customId) {
  return jsonOrThrow(
    `/api/cartography/custom/${encodeURIComponent(customId)}`,
    {},
    "No se pudo cargar custom"
  );
}

export async function saveCustomDraft(customId, template, comment) {
  return jsonOrThrow(
    `/api/cartography/custom/${encodeURIComponent(customId)}/draft`,
    {
      method: "PUT",
      body: JSON.stringify({ template, comment: comment || undefined }),
    },
    "No se pudo guardar draft custom"
  );
}

export async function publishCustom(customId, comment) {
  return jsonOrThrow(
    `/api/cartography/custom/${encodeURIComponent(customId)}/publish`,
    {
      method: "POST",
      body: JSON.stringify({ comment: comment || undefined }),
    },
    "No se pudo publicar custom"
  );
}

export async function restoreCustomFactory(customId) {
  return jsonOrThrow(
    `/api/cartography/custom/${encodeURIComponent(customId)}/restore-factory`,
    { method: "POST", body: "{}" },
    "No se pudo restaurar fábrica custom"
  );
}

export async function deleteCustom(customId) {
  return jsonOrThrow(
    `/api/cartography/custom/${encodeURIComponent(customId)}`,
    { method: "DELETE" },
    "No se pudo eliminar custom"
  );
}

/**
 * Preview PDF/SVG — descarga blob; no altera active ni oficiales.
 */
export async function previewCustom(customId, body) {
  const { res, data, networkError } = await adminFetch(
    `/api/cartography/custom/${encodeURIComponent(customId)}/preview`,
    {
      method: "POST",
      body: JSON.stringify(body || {}),
    }
  );
  if (networkError || !res) throw new Error("No se pudo contactar al API");
  if (!res.ok) {
    throw new Error(errMsg(data, `Preview HTTP ${res.status}`));
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename="?([^";]+)"?/i.exec(cd);
  const filename = m ? m[1] : `preview_${customId}.pdf`;
  return { blob, filename, mediaType: res.headers.get("Content-Type") || blob.type };
}
