/**
 * Tabla genérica de indicadores (modo mock): municipio + valor numérico.
 * Usado por app.js para indicadores sin vista *Viz dedicada.
 */

function fmt(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isFinite(n)) return n.toLocaleString("es-MX");
  return String(value);
}

export function renderTable(containerEl, { title, unit, rows, emptyHtml }) {
  if (!rows?.length) {
    containerEl.innerHTML =
      emptyHtml ||
      `<div class="empty-state">Sin datos para <b>${title || "este indicador"}</b>.</div>`;
    return;
  }

  const table = document.createElement("table");
  table.className = "table table-sm align-middle";

  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 56px">#</th>
        <th>Municipio</th>
        <th class="text-end">Valor ${unit ? `(${unit})` : ""}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-muted">${idx + 1}</td>
      <td>${r.municipio}</td>
      <td class="text-end fw-semibold">${fmt(r.valor)}</td>
    `;
    tbody.append(tr);
  });

  containerEl.innerHTML = "";
  containerEl.append(table);
}

