/**
 * Editor Identify/Hover (campos + etiquetas) — extract Fase 4.1.
 * Sin dependencia de `wizard` / `_meta`: el fallback lo pasa el caller.
 */

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function defaultIdentifyFields(cols) {
  const preferred = [
    "gid",
    "cvegeo",
    "cve_mun",
    "cve_ent",
    "nomgeo",
    "nom_loc",
    "nom_mun",
    "nombre",
  ];
  const picked = preferred.filter((p) =>
    cols.map((c) => c.toLowerCase()).includes(p)
  );
  return picked.length ? picked : cols.slice(0, Math.min(6, cols.length));
}

export function defaultFieldLabel(col) {
  const key = String(col || "").toLowerCase();
  const defaults = {
    gid: "Identificador",
    nombre: "Nombre",
    nomgeo: "Nombre geoestadístico",
    nom_loc: "Localidad",
    nom_mun: "Municipio",
    cvegeo: "Clave geoestadística",
    cve_ent: "Clave entidad",
    cve_mun: "Clave municipio",
    cve_loc: "Clave localidad",
    tipo: "Tipo",
    ent: "Entidad",
  };
  if (defaults[key]) return defaults[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeIdentifyFieldObjects(fields) {
  const list = fields?.length
    ? fields
    : [{ column: "gid", label: defaultFieldLabel("gid") }];
  return list
    .map((f) => {
      if (typeof f === "string") {
        const col = f.trim();
        return col ? { column: col, label: defaultFieldLabel(col) } : null;
      }
      if (f && typeof f === "object") {
        const col = String(f.column || f.field || f.name || "").trim();
        if (!col) return null;
        const label = String(f.label || "").trim() || defaultFieldLabel(col);
        return { column: col, label };
      }
      return null;
    })
    .filter(Boolean);
}

/** @deprecated use normalizeIdentifyFieldObjects — solo nombres de columna. */
export function normalizeIdentifyFieldNames(fields) {
  return normalizeIdentifyFieldObjects(fields).map((f) => f.column);
}

/** Columnas del editor: primero las ya elegidas (en su orden), luego el resto. */
export function orderedIdentifyEditorColumns(cols, selected) {
  const all = Array.isArray(cols)
    ? cols.filter(Boolean).map((c) => String(c))
    : [];
  const selectedObjs = normalizeIdentifyFieldObjects(selected);
  const seen = new Set();
  const ordered = [];
  for (const f of selectedObjs) {
    const match = all.find((c) => c.toLowerCase() === f.column.toLowerCase());
    const name = match || f.column;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(name);
  }
  for (const c of all) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(c);
  }
  return ordered;
}

export function identifyFieldsEditorHtml(cols, selected, idPrefix = "idf") {
  const map = new Map(
    normalizeIdentifyFieldObjects(selected).map((f) => [
      f.column.toLowerCase(),
      f,
    ])
  );
  const prefix =
    String(idPrefix || "idf").replace(/[^a-z0-9_-]/gi, "") || "idf";
  return orderedIdentifyEditorColumns(cols, selected)
    .map((col) => {
      const saved = map.get(col.toLowerCase());
      const checked = saved ? "checked" : "";
      const labelVal = escapeHtml(saved?.label || defaultFieldLabel(col));
      const disabled = saved ? "" : "disabled";
      const cid = `${prefix}_${escapeHtml(col)}`;
      return `<div class="visor-admin-identify-row">
        <div class="visor-admin-idf-move" role="group" aria-label="Orden">
          <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1 visor-admin-idf-grip" draggable="true" title="Arrastrar para reordenar" aria-label="Arrastrar">☰</button>
          <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1" data-idf-move="up" title="Subir" aria-label="Subir">▲</button>
          <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1" data-idf-move="down" title="Bajar" aria-label="Bajar">▼</button>
        </div>
        <div class="form-check form-check-sm mb-0">
          <input class="form-check-input visor-admin-idf-check" type="checkbox" id="${cid}" value="${escapeHtml(col)}" ${checked} />
          <label class="form-check-label small font-monospace" for="${cid}">${escapeHtml(col)}</label>
        </div>
        <input type="text" class="form-control form-control-sm visor-admin-idf-label" data-for="${escapeHtml(col)}" placeholder="Etiqueta visible" value="${labelVal}" ${disabled} />
      </div>`;
    })
    .join("");
}

export function moveIdentifyRow(row, direction) {
  if (!row) return;
  const parent = row.parentElement;
  if (!parent) return;
  if (direction === "up") {
    const prev = row.previousElementSibling;
    if (prev) parent.insertBefore(row, prev);
  } else if (direction === "down") {
    const next = row.nextElementSibling;
    if (next) parent.insertBefore(next, row);
  }
}

export function bindIdentifyFieldEditors(root) {
  if (!root) return;
  root.querySelectorAll(".visor-admin-idf-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".visor-admin-identify-row");
      const labelInput = row?.querySelector(".visor-admin-idf-label");
      if (!labelInput) return;
      labelInput.disabled = !cb.checked;
      if (cb.checked && !labelInput.value.trim()) {
        labelInput.value = defaultFieldLabel(cb.value);
      }
    });
  });
  root.querySelectorAll("[data-idf-move]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const row = btn.closest(".visor-admin-identify-row");
      moveIdentifyRow(row, btn.getAttribute("data-idf-move"));
    });
  });
  let dragRow = null;
  root.querySelectorAll(".visor-admin-idf-grip").forEach((grip) => {
    grip.addEventListener("dragstart", (ev) => {
      const row = grip.closest(".visor-admin-identify-row");
      if (!row) {
        ev.preventDefault();
        return;
      }
      dragRow = row;
      row.classList.add("is-dragging");
      try {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData(
          "text/plain",
          row.querySelector(".visor-admin-idf-check")?.value || ""
        );
      } catch {
        /* ignore */
      }
    });
    grip.addEventListener("dragend", () => {
      const row = grip.closest(".visor-admin-identify-row");
      row?.classList.remove("is-dragging");
      root
        .querySelectorAll(".visor-admin-identify-row.is-drag-over")
        .forEach((el) => {
          el.classList.remove("is-drag-over");
        });
      dragRow = null;
    });
  });
  root.querySelectorAll(".visor-admin-identify-row").forEach((row) => {
    row.addEventListener("dragover", (ev) => {
      if (!dragRow || dragRow === row) return;
      ev.preventDefault();
      row.classList.add("is-drag-over");
      try {
        ev.dataTransfer.dropEffect = "move";
      } catch {
        /* ignore */
      }
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("is-drag-over");
    });
    row.addEventListener("drop", (ev) => {
      ev.preventDefault();
      row.classList.remove("is-drag-over");
      if (!dragRow || dragRow === row) return;
      const parent = row.parentElement;
      if (!parent || dragRow.parentElement !== parent) return;
      const rows = [...parent.querySelectorAll(".visor-admin-identify-row")];
      const from = rows.indexOf(dragRow);
      const to = rows.indexOf(row);
      if (from < 0 || to < 0) return;
      if (from < to) parent.insertBefore(dragRow, row.nextElementSibling);
      else parent.insertBefore(dragRow, row);
    });
  });
}

/**
 * @param {string} [rootId]
 * @param {unknown} [fallbackFields] — p. ej. wizard.identify_fields / hover_fields
 */
export function readIdentifyFieldsFromDom(
  rootId = "visorAdminIdentifyCols",
  fallbackFields = null
) {
  const root = document.getElementById(rootId);
  if (!root) {
    return normalizeIdentifyFieldObjects(fallbackFields);
  }
  const out = [];
  root.querySelectorAll(".visor-admin-identify-row").forEach((row) => {
    const cb = row.querySelector(".visor-admin-idf-check");
    if (!cb?.checked) return;
    const col = cb.value;
    const labelInput = row.querySelector(".visor-admin-idf-label");
    const label = labelInput?.value?.trim() || defaultFieldLabel(col);
    out.push({ column: col, label });
  });
  return out;
}
