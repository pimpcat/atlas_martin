/**
 * Contrato AMIGO (CORE) dentro de Indicators Studio — métricas, niveles, molde Refresh.
 */

const NIVELES = ["NACIONAL", "ENTIDAD", "MUNICIPIO"];

/** @type {Array<{clave:string,nombre:string,periodo:string,principal:boolean,orden:number,niveles:string[]}>} */
let _metrics = [];

export function getCoreMetricsState() {
  return _metrics.map((m) => ({ ...m, niveles: [...(m.niveles || [])] }));
}

export function setCoreMetricsState(rows) {
  _metrics = (rows || []).map((m, i) => normalizeMetricRow(m, i));
}

function normalizeMetricRow(m, i = 0) {
  const clave = String(m?.clave || m?.metrica_clave || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  let niveles = m?.niveles;
  if (!Array.isArray(niveles)) niveles = ["MUNICIPIO"];
  niveles = niveles.map((n) => String(n).toUpperCase()).filter((n) => NIVELES.includes(n));
  if (!niveles.length) niveles = ["MUNICIPIO"];
  return {
    clave,
    nombre: String(m?.nombre || m?.metrica_nombre || clave || "").trim() || clave,
    periodo: String(m?.periodo || "").trim(),
    principal: Boolean(m?.principal ?? i === 0),
    orden: Number.isFinite(Number(m?.orden)) ? Number(m.orden) : i + 1,
    niveles,
  };
}

export function emptyMetricRow() {
  return normalizeMetricRow(
    {
      clave: "",
      nombre: "",
      periodo: "",
      principal: _metrics.length === 0,
      niveles: ["MUNICIPIO", "ENTIDAD"],
    },
    _metrics.length
  );
}

export function metricsFromCatalogEntry(ind) {
  const mold = ind?.refresh_mold || ind?.amigo?.mold;
  if (mold?.metrics && typeof mold.metrics === "object") {
    return Object.entries(mold.metrics).map(([col, meta], i) => {
      const m = typeof meta === "object" && meta ? meta : {};
      return normalizeMetricRow(
        {
          clave: m.metrica_clave || col,
          nombre: m.nombre || m.metrica_clave || col,
          periodo: m.periodo || "",
          principal: i === 0,
          orden: i + 1,
          niveles: m.niveles || ["MUNICIPIO", "ENTIDAD"],
        },
        i
      );
    });
  }
  if (Array.isArray(ind?.fields) && ind.fields.length) {
    return ind.fields.map((f, i) =>
      normalizeMetricRow(
        {
          clave: f.key || f.column,
          nombre: f.label || f.key || f.column,
          periodo: "",
          principal: i === 0,
          orden: i + 1,
          niveles: ["MUNICIPIO", "ENTIDAD"],
        },
        i
      )
    );
  }
  return [];
}

export function coreContractFromBundle(bundle) {
  const ind = bundle?.indicator || {};
  const rows = metricsFromCoreBundle(bundle).filter((m) => m.clave);
  return {
    clave: String(ind.clave || "").trim().toLowerCase(),
    nombre: String(ind.nombre || ind.clave || "").trim(),
    tema: ind.tema || null,
    descripcion: ind.descripcion || null,
    activo: ind.activo !== false,
    replace_metrics: true,
    metrics: rows.map((m, i) => ({
      clave: m.clave,
      nombre: m.nombre || m.clave,
      principal: Boolean(m.principal),
      orden: i + 1,
      niveles: m.niveles,
      periodo: m.periodo || "",
    })),
  };
}

export function metricsFromCoreBundle(bundle) {
  const rows = bundle?.metrics || [];
  return rows.map((r, i) =>
    normalizeMetricRow(
      {
        clave: r.metrica_clave,
        nombre: r.metrica_nombre || r.metrica_clave,
        periodo: r.periodo || "",
        principal: Boolean(r.principal),
        orden: r.orden ?? i + 1,
        niveles: r.niveles || ["MUNICIPIO"],
      },
      i
    )
  );
}

function readDomIntoState(host) {
  if (!host) return;
  const next = [];
  host.querySelectorAll("[data-metric-row]").forEach((row, i) => {
    const clave = row.querySelector("[data-m-clave]")?.value?.trim() || "";
    const nombre = row.querySelector("[data-m-nombre]")?.value?.trim() || "";
    const periodo = row.querySelector("[data-m-periodo]")?.value?.trim() || "";
    const principal = Boolean(row.querySelector("[data-m-principal]")?.checked);
    const niveles = [];
    row.querySelectorAll("[data-m-nivel]:checked").forEach((cb) => {
      niveles.push(cb.value);
    });
    next.push(
      normalizeMetricRow({ clave, nombre, periodo, principal, orden: i + 1, niveles }, i)
    );
  });
  // Una sola principal
  const idx = next.findIndex((m) => m.principal);
  next.forEach((m, i) => {
    m.principal = idx < 0 ? i === 0 : i === idx;
  });
  _metrics = next;
}

export function syncMetricsFromDom(host = document.getElementById("indStudioMetricsHost")) {
  readDomIntoState(host);
}

export function renderMetricsEditor(host, opts = {}) {
  if (!host) return;
  readDomIntoState(host);
  if (opts.replaceState) {
    _metrics = (opts.replaceState || []).map((m, i) => normalizeMetricRow(m, i));
  }
  if (!_metrics.length) _metrics = [emptyMetricRow()];

  host.innerHTML = "";
  _metrics.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "ind-studio-metric-row border rounded p-2 mb-2";
    row.setAttribute("data-metric-row", String(i));
    const nivChecks = NIVELES.map(
      (n) =>
        `<label class="form-check form-check-inline small mb-0">
          <input type="checkbox" class="form-check-input" data-m-nivel value="${n}" ${
          (m.niveles || []).includes(n) ? "checked" : ""
        } /> ${n}
        </label>`
    ).join("");
    row.innerHTML = `
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small mb-0">Clave métrica</label>
          <input class="form-control form-control-sm" data-m-clave pattern="[a-z][a-z0-9_]*"
            value="${escapeAttr(m.clave)}" placeholder="pob_tot" />
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-0">Nombre</label>
          <input class="form-control form-control-sm" data-m-nombre
            value="${escapeAttr(m.nombre)}" placeholder="Población total" />
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-0">Periodo molde</label>
          <input class="form-control form-control-sm" data-m-periodo
            value="${escapeAttr(m.periodo)}" placeholder="2020" />
        </div>
        <div class="col-md-2">
          <label class="form-check small mt-4">
            <input type="radio" class="form-check-input" name="coreMetricPrincipal" data-m-principal
              ${m.principal ? "checked" : ""} /> Principal
          </label>
        </div>
        <div class="col-md-2 text-end">
          <button type="button" class="btn btn-sm btn-outline-danger" data-m-remove title="Quitar métrica">Quitar</button>
        </div>
        <div class="col-12">${nivChecks}</div>
      </div>`;
    row.querySelector("[data-m-remove]")?.addEventListener("click", () => {
      readDomIntoState(host);
      if (_metrics.length <= 1) {
        _metrics = [emptyMetricRow()];
      } else {
        _metrics.splice(i, 1);
        _metrics.forEach((x, j) => {
          x.orden = j + 1;
          if (!_metrics.some((y) => y.principal)) _metrics[0].principal = true;
        });
      }
      renderMetricsEditor(host);
    });
    host.append(row);
  });
}

export function addMetricRow(host) {
  readDomIntoState(host);
  _metrics.push(emptyMetricRow());
  renderMetricsEditor(host);
}

export function buildCoreContractFromForm(formIds) {
  const host = document.getElementById("indStudioMetricsHost");
  readDomIntoState(host);
  const clave = (formIds.coreClave?.value || formIds.id?.value || "").trim().toLowerCase();
  const nombre = (formIds.nombre?.value || clave).trim();
  const tema = (formIds.tema?.value || "").trim() || null;
  const descripcion = (formIds.descripcion?.value || "").trim() || null;
  const metrics = _metrics.filter((m) => m.clave);
  if (!clave) throw new Error("Indique la clave CORE del indicador.");
  if (!/^[a-z][a-z0-9_]*$/.test(clave)) {
    throw new Error("Clave CORE inválida (minúsculas, números y _).");
  }
  if (!metrics.length) throw new Error("Añada al menos una métrica con clave.");
  for (const m of metrics) {
    if (!/^[a-z][a-z0-9_]*$/.test(m.clave)) {
      throw new Error(`Clave de métrica inválida: ${m.clave}`);
    }
    if (!m.niveles?.length) {
      throw new Error(`La métrica «${m.clave}» necesita al menos un nivel.`);
    }
  }
  return {
    clave,
    nombre,
    tema,
    descripcion,
    activo: true,
    replace_metrics: true,
    metrics: metrics.map((m, i) => ({
      clave: m.clave,
      nombre: m.nombre || m.clave,
      principal: Boolean(m.principal),
      orden: i + 1,
      niveles: m.niveles,
      periodo: m.periodo || "",
    })),
  };
}

export function buildRefreshMold(coreContract) {
  const metrics = {};
  for (const m of coreContract.metrics || []) {
    metrics[m.clave] = {
      periodo: m.periodo || "",
      metrica_clave: m.clave,
      niveles: m.niveles,
    };
  }
  return {
    core_clave: coreContract.clave,
    metrics,
  };
}

/** Genera fields del catálogo a partir de métricas CORE (para paso Datos / portal). */
export function fieldsFromCoreMetrics(coreContract, sourceTable = "tab_municipal") {
  return (coreContract.metrics || []).map((m) => ({
    key: m.clave,
    column: m.clave,
    label: m.nombre || m.clave,
    type: "float",
    source_table: sourceTable,
  }));
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function validateCoreContractStep(formIds) {
  try {
    buildCoreContractFromForm(formIds);
    return "";
  } catch (e) {
    return e.message || String(e);
  }
}
