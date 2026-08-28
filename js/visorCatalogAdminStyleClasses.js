/**
 * Helpers puros de clases de estilo (by-attribute) — extract Fase 4.1.
 * Markup idéntico al bloque original de visorCatalogAdmin.js.
 */

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function defaultStyleClasses() {
  return [
    { value: "A", color: "#ef4444", label: "Clase A" },
    { value: "B", color: "#3b82f6", label: "Clase B" },
  ];
}

/** Paleta para autoclasificar (hasta 32 clases). */
export const AUTO_CLASS_COLORS = [
  "#ef4444",
  "#f97316",
  "#ca8a04",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
  "#0d9488",
  "#dc2626",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

export function normalizeStyleClasses(list) {
  return (list || [])
    .map((c) => ({
      value: String(c?.value ?? "").trim(),
      color: String(c?.color ?? "#94a3b8").trim(),
      label: String(c?.label ?? c?.value ?? "").trim(),
    }))
    .filter((c) => c.value);
}

export function styleClassRowsHtml(classes, keepEmpty = false) {
  const rows = keepEmpty
    ? (classes || []).map((c) => ({
        value: String(c?.value ?? ""),
        color: String(c?.color ?? "#94a3b8").trim(),
        label: String(c?.label ?? c?.value ?? ""),
      }))
    : normalizeStyleClasses(classes);
  const list = rows.length ? rows : defaultStyleClasses();
  return list
    .map(
      (cls, idx) => `
      <div class="visor-admin-class-row" data-idx="${idx}">
        <input type="text" class="form-control form-control-sm visor-admin-cls-value" placeholder="Valor" value="${escapeHtml(cls.value)}" />
        <input type="color" class="form-control form-control-color form-control-sm visor-admin-cls-color" value="${escapeHtml(cls.color)}" />
        <input type="text" class="form-control form-control-sm visor-admin-cls-label" placeholder="Leyenda" value="${escapeHtml(cls.label || cls.value)}" />
        <button type="button" class="btn btn-sm btn-outline-danger visor-admin-cls-remove" title="Quitar">×</button>
      </div>`
    )
    .join("");
}

export function buildClassesFromDistinctValues(values) {
  return (values || []).map((val, i) => {
    const text = String(val);
    return {
      value: text,
      color: AUTO_CLASS_COLORS[i % AUTO_CLASS_COLORS.length],
      label: text.length > 48 ? `${text.slice(0, 45)}…` : text,
    };
  });
}

export function distinctValuesChipsHtml(values) {
  return (values || [])
    .map(
      (v) =>
        `<span class="visor-admin-distinct-chip" title="${escapeHtml(String(v))}">${escapeHtml(String(v))}</span>`
    )
    .join("");
}
