/**
 * Cliente API P2 — productos oficiales (draft / preview / publish).
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

export async function listProducts() {
  const data = await jsonOrThrow(
    "/api/cartography/products",
    {},
    "No se pudo listar productos"
  );
  return data?.products || [];
}

/** P5 — catálogo allow-list de tablas/orígenes. */
export async function listDatasources() {
  const data = await jsonOrThrow(
    "/api/cartography/datasources",
    {},
    "No se pudo listar fuentes de datos"
  );
  return data?.sources || [];
}

/** P5 — payload completo (sources + instance_overrides summary). */
export async function getDatasourcesPayload() {
  return jsonOrThrow(
    "/api/cartography/datasources",
    {},
    "No se pudo listar fuentes de datos"
  );
}

/** Tablas reales en BD cartography (combos schema + tabla). */
export async function discoverDatasources() {
  return jsonOrThrow(
    "/api/cartography/datasources/discover",
    {},
    "No se pudieron descubrir tablas en la BD"
  );
}

/** Columnas atributivas de una fuente (combo campo de etiqueta). */
export async function listSourceColumns(sourceId) {
  return jsonOrThrow(
    `/api/cartography/datasources/columns?source_id=${encodeURIComponent(sourceId)}`,
    {},
    "No se pudieron leer las columnas de la fuente"
  );
}

export async function listInstanceOverrides() {
  const data = await jsonOrThrow(
    "/api/cartography/instance-overrides",
    {},
    "No se pudieron listar overrides"
  );
  return data;
}

export async function getInstanceOverride(cveEnt) {
  return jsonOrThrow(
    `/api/cartography/instance-overrides/${encodeURIComponent(cveEnt)}`,
    {},
    "No se pudo leer override"
  );
}

export async function putInstanceOverride(cveEnt, body) {
  return jsonOrThrow(
    `/api/cartography/instance-overrides/${encodeURIComponent(cveEnt)}`,
    {
      method: "PUT",
      body: JSON.stringify(body || {}),
    },
    "No se pudo guardar override"
  );
}

export async function deleteInstanceOverride(cveEnt) {
  return jsonOrThrow(
    `/api/cartography/instance-overrides/${encodeURIComponent(cveEnt)}`,
    { method: "DELETE" },
    "No se pudo borrar override"
  );
}

export async function registerDatasource(body) {
  return jsonOrThrow(
    "/api/cartography/datasources",
    { method: "POST", body: JSON.stringify(body || {}) },
    "No se pudo registrar fuente"
  );
}

export async function updateDatasource(sourceId, body) {
  return jsonOrThrow(
    `/api/cartography/datasources/${encodeURIComponent(sourceId)}`,
    { method: "PUT", body: JSON.stringify(body || {}) },
    "No se pudo actualizar fuente"
  );
}

export async function deleteDatasource(sourceId) {
  return jsonOrThrow(
    `/api/cartography/datasources/${encodeURIComponent(sourceId)}`,
    { method: "DELETE" },
    "No se pudo eliminar/desactivar fuente"
  );
}

export async function getProductStatus(productKey, templateId) {
  const q = templateId
    ? `?template_id=${encodeURIComponent(templateId)}`
    : "";
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}${q}`,
    {},
    "No se pudo leer estado del producto"
  );
}

export async function getDraft(productKey, templateId) {
  const q = templateId
    ? `?template_id=${encodeURIComponent(templateId)}`
    : "";
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/draft${q}`,
    {},
    "No se pudo cargar draft"
  );
}

export async function saveDraft(productKey, template, opts = {}) {
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/draft`,
    {
      method: "PUT",
      body: JSON.stringify({
        template,
        template_id: opts.templateId || undefined,
        comment: opts.comment || undefined,
      }),
    },
    "No se pudo guardar draft"
  );
}

export async function discardDraft(productKey, templateId) {
  const q = templateId
    ? `?template_id=${encodeURIComponent(templateId)}`
    : "";
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/draft${q}`,
    { method: "DELETE" },
    "No se pudo descartar draft"
  );
}

export async function validateProduct(productKey, template, templateId) {
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/validate`,
    {
      method: "POST",
      body: JSON.stringify({
        template: template || undefined,
        template_id: templateId || undefined,
      }),
    },
    "Validación fallida"
  );
}

export async function publishProduct(productKey, opts = {}) {
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/publish`,
    {
      method: "POST",
      body: JSON.stringify({
        template_id: opts.templateId || undefined,
        comment: opts.comment || undefined,
      }),
    },
    "No se pudo publicar"
  );
}

export async function listVersions(productKey, templateId) {
  const q = templateId
    ? `?template_id=${encodeURIComponent(templateId)}`
    : "";
  const data = await jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/versions${q}`,
    {},
    "No se pudieron listar versiones"
  );
  return data?.versions || [];
}

/** P11: checklist de salud bajo demanda. */
export async function runChecklist({ includePreview = false, paramsByTemplate } = {}) {
  return jsonOrThrow(
    "/api/cartography/checklist/run",
    {
      method: "POST",
      body: JSON.stringify({
        include_preview: !!includePreview,
        params_by_template: paramsByTemplate || undefined,
      }),
    },
    "No se pudo ejecutar el checklist"
  );
}

/** P13: simbología de fábrica del panel lateral (croquis | condensado). */
export async function panelSymbologyDefaults(kind = "croquis") {
  const q = new URLSearchParams({ kind });
  return jsonOrThrow(
    `/api/cartography/admin/panel-symbology/defaults?${q}`,
    {},
    "No se pudo leer la simbología de fábrica"
  );
}

/** P14: columna LÍMITES de fábrica de la tira. */
export async function stripSymbologyDefaults() {
  return jsonOrThrow(
    "/api/cartography/admin/strip-symbology/defaults",
    {},
    "No se pudo leer la simbología de la tira"
  );
}

/** P13: incongruencias simbología del panel ↔ capas del draft en edición. */
export async function checkPanelSymbology(template) {
  return jsonOrThrow(
    "/api/cartography/admin/panel-symbology/check",
    { method: "POST", body: JSON.stringify({ template }) },
    "No se pudo revisar la simbología"
  );
}

export async function lastChecklist() {
  return jsonOrThrow("/api/cartography/checklist/last", {}, "No se pudo leer el último checklist");
}

/** P10: cambios legibles left → right (draft | active | factory | vN). */
export async function diffProduct(productKey, { templateId, left = "active", right = "draft" } = {}) {
  const q = new URLSearchParams({ left, right });
  if (templateId) q.set("template_id", templateId);
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/diff?${q.toString()}`,
    {},
    "No se pudieron calcular los cambios"
  );
}

/** P10: cambios left → plantilla del editor (incluye lo no guardado). */
export async function diffProductInline(productKey, template, { templateId, left = "active" } = {}) {
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/diff`,
    {
      method: "POST",
      body: JSON.stringify({ template, left, template_id: templateId || undefined }),
    },
    "No se pudieron calcular los cambios"
  );
}

export async function restoreVersion(productKey, version, opts = {}) {
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/restore/${version}`,
    {
      method: "POST",
      body: JSON.stringify({
        template_id: opts.templateId || undefined,
        comment: opts.comment || undefined,
        as_draft: Boolean(opts.asDraft),
      }),
    },
    "No se pudo restaurar versión"
  );
}

/** Vuelve al JSON canónico GroSIG (fábrica). asDraft=true por defecto. */
export async function restoreFactory(productKey, opts = {}) {
  return jsonOrThrow(
    `/api/cartography/products/${encodeURIComponent(productKey)}/restore-factory`,
    {
      method: "POST",
      body: JSON.stringify({
        template_id: opts.templateId || undefined,
        comment: opts.comment || undefined,
        as_draft: opts.asDraft !== false,
      }),
    },
    "No se pudo restaurar canónico"
  );
}

/**
 * Preview PDF/SVG — descarga blob; no altera active.
 */
export async function previewProduct(productKey, body) {
  const { res, data, networkError } = await adminFetch(
    `/api/cartography/products/${encodeURIComponent(productKey)}/preview`,
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
  const filename = m ? m[1] : `preview_${productKey}.pdf`;
  let report = null;
  try {
    const raw = res.headers.get("X-GroSIG-Render-Report");
    report = raw ? JSON.parse(raw) : null;
  } catch {
    report = null;
  }
  return { blob, filename, mediaType: res.headers.get("Content-Type") || blob.type, report };
}
