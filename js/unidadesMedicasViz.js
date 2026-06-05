/**
 * Unidades médicas en servicio: tabla (8 columnas) con entidad + top5 + seleccionado + bottom5.
 */

function fmtInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function el(tag, className, children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (children) for (const ch of children) if (ch !== null && ch !== undefined) node.append(ch);
  return node;
}

function cell(text, right) {
  return el("div", right ? "um-tbl-cell um-tbl-cell--r" : "um-tbl-cell", [
    document.createTextNode(text),
  ]);
}

function rowCls({ highlight, mid, head, ent, section }) {
  const base = ["um-tbl-row"];
  if (head) base.push("um-tbl-row--head");
  if (ent) base.push("um-tbl-row--ent");
  if (section) base.push("um-tbl-row--section");
  if (highlight) base.push("um-tbl-row--hl");
  if (mid) base.push("um-tbl-row--mid");
  return base.join(" ");
}

function dataRow(r) {
  const row = el("div", rowCls(r));
  row.append(
    cell(r.nom_mun || "—", false),
    cell(fmtInt(r.total), true),
    cell(fmtInt(r.imss), true),
    cell(fmtInt(r.issste), true),
    cell(fmtInt(r.semar), true),
    cell(fmtInt(r.imb), true),
    cell(fmtInt(r.sesa), true),
    cell(fmtInt(r.ssa), true)
  );
  return row;
}

function sectionRow(text) {
  const row = el("div", rowCls({ section: true }));
  row.append(el("div", "um-tbl-section", [document.createTextNode(text)]));
  return row;
}

export function renderUnidadesMedicasVista(root, payload) {
  if (!root) return;
  root.innerHTML = "";

  if (!payload || !payload.ok) {
    const msg =
      payload && payload.message ? String(payload.message) : "No se pudo cargar la información.";
    root.append(el("div", "unimed-viz-error", [document.createTextNode(msg)]));
    return;
  }

  const wrap = el("div", "unimed-viz");
  wrap.append(
    el("h3", "unimed-viz-title", [
      document.createTextNode(
        "Unidades médicas en servicio de las instituciones del sector público de salud,\npor municipios seleccionados según institución"
      ),
    ])
  );

  const tbl = el("div", "um-tbl");

  // Encabezado
  const head = el("div", rowCls({ head: true }));
  head.append(
    cell("Municipio", false),
    cell("Total", true),
    cell("IMSS", true),
    cell("ISSSTE", true),
    cell("SEMAR", true),
    cell("IMSS BIENESTAR", true),
    cell("SSA (ESTATAL)", true),
    cell("SSA (FEDERAL)", true)
  );
  tbl.append(head);

  // Entidad Federativa
  if (payload.entidad) {
    tbl.append(
      dataRow({
        nom_mun: "Entidad Federativa",
        total: payload.entidad.total,
        imss: payload.entidad.imss,
        issste: payload.entidad.issste,
        semar: payload.entidad.semar,
        imb: payload.entidad.imb,
        sesa: payload.entidad.sesa,
        ssa: payload.entidad.ssa,
        ent: true,
      })
    );
  }

  tbl.append(sectionRow("Municipios con mayor cantidad de unidades médicas"));
  for (const r of payload.top5 || []) tbl.append(dataRow(r));

  if (payload.middle) {
    const midWrap = el("div", "um-middle-wrap");
    midWrap.append(dataRow(payload.middle));
    tbl.append(midWrap);
  }

  tbl.append(sectionRow("Municipios con menor cantidad de unidades médicas"));
  for (const r of payload.bottom5 || []) tbl.append(dataRow(r));

  wrap.append(tbl);
  wrap.append(
    el("p", "unimed-viz-pie", [
      document.createTextNode('Fuente: "CLUES Secretaría de Salud- Diciembre 2025 (depurando bajas)".'),
    ])
  );

  root.append(wrap);
}

