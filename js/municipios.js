/**
 * Selector de municipio en el sidebar (#selectMunicipio).
 * Formato de etiquetas y sincronización con selección desde el mapa.
 */

function padCve3(cve) {
  const s = String(cve);
  if (s.length >= 3) return s;
  return ("000" + s).slice(-3);
}

function padCve2(cve) {
  const d = String(cve ?? "").replace(/\D/g, "");
  return d.length >= 2 ? d.slice(-2) : ("00" + d).slice(-2);
}

/**
 * Texto de opción: Nombre de municipio (cve_mun).
 */
export function formatMunicipioLabel(nomgeo, cve_mun) {
  const nom = nomgeo != null ? String(nomgeo) : "";
  const cve = padCve3(cve_mun != null ? cve_mun : "");
  return `${nom} (${cve})`;
}

export function formatEntidadLabel(nomgeo, cve_ent) {
  const nom = nomgeo != null ? String(nomgeo) : "";
  const cve = padCve2(cve_ent);
  return `${nom} (${cve})`;
}

/**
 * Desplegable de entidades (modo nacional).
 */
export function renderEntidadesSelect(selectEl, statusEl, rows, { onSelect, selected } = {}) {
  if (!selectEl) return;

  selectEl.innerHTML = "";
  selectEl.disabled = true;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— Selecciona entidad —";
  selectEl.append(placeholder);

  if (!rows || !rows.length) {
    if (statusEl) statusEl.textContent = "Sin datos de entidades.";
    return;
  }

  const unique = [];
  const seen = new Set();
  for (const r of rows) {
    const cve = padCve2(r.cve_ent);
    if (!cve || seen.has(cve)) continue;
    seen.add(cve);
    unique.push({ cve_ent: cve, nomgeo: r.nomgeo != null ? String(r.nomgeo) : "" });
  }

  for (const r of unique) {
    const opt = document.createElement("option");
    opt.value = r.cve_ent;
    opt.textContent = formatEntidadLabel(r.nomgeo, r.cve_ent);
    selectEl.append(opt);
  }

  selectEl.disabled = false;
  if (statusEl) statusEl.textContent = `${unique.length} entidades cargadas`;

  const sel = selected ? padCve2(selected) : "";
  if (sel) {
    for (let i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].value === sel) {
        selectEl.value = sel;
        break;
      }
    }
  }

  selectEl.onchange = () => {
    const v = selectEl.value;
    if (!v) {
      if (typeof onSelect === "function") onSelect(null);
      return;
    }
    const found = unique.find((u) => u.cve_ent === padCve2(v));
    if (typeof onSelect === "function") {
      onSelect(
        found
          ? { cve_ent: found.cve_ent, nomgeo: found.nomgeo }
          : { cve_ent: padCve2(v), nomgeo: "" },
      );
    }
  };
}

/**
 * Desplegable de municipios (sidebar superior).
 */
export function renderMunicipiosSelect(selectEl, statusEl, rows, { onSelect } = {}) {
  if (!selectEl) return;

  selectEl.innerHTML = "";
  selectEl.disabled = true;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— Selecciona municipio —";
  selectEl.append(placeholder);

  if (!rows || !rows.length) {
    if (statusEl) statusEl.textContent = "Sin datos de municipios.";
    return;
  }

  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    const cve = r.cve_mun != null ? padCve3(String(r.cve_mun).replace(/\D/g, "")) : "";
    if (!cve || seen.has(cve)) continue;
    seen.add(cve);
    unique.push({
      cve_mun: cve,
      nomgeo: r.nomgeo != null ? String(r.nomgeo) : "",
      cve_ent: r.cve_ent != null ? padCve2(r.cve_ent) : undefined,
    });
  }

  for (const r of unique) {
    const opt = document.createElement("option");
    opt.value = r.cve_mun;
    opt.textContent = formatMunicipioLabel(r.nomgeo, r.cve_mun);
    selectEl.append(opt);
  }

  selectEl.disabled = false;

  if (statusEl) {
    statusEl.textContent = `${unique.length} municipios cargados`;
  }

  const emit = () => {
    const v = selectEl.value;
    if (!v) {
      if (typeof onSelect === "function") onSelect(null);
      return;
    }
    let found = null;
    for (let i = 0; i < unique.length; i++) {
      if (String(unique[i].cve_mun) === v || padCve3(unique[i].cve_mun) === padCve3(v)) {
        found = unique[i];
        break;
      }
    }
    if (typeof onSelect === "function") {
      onSelect(
        found
          ? {
              cve_mun: String(found.cve_mun),
              nomgeo: String(found.nomgeo != null ? found.nomgeo : ""),
              cve_ent: found.cve_ent,
            }
          : { cve_mun: v, nomgeo: "" },
      );
    }
  };

  selectEl.onchange = () => {
    emit();
  };
}

/**
 * Sincroniza el combo con la selección programática (mapa / inicio).
 * @param {HTMLSelectElement|null} selectEl
 * @param {{ cve_mun?: string, nomgeo?: string } | null} m
 */
export function setMunicipioSelectValue(selectEl, m) {
  if (!selectEl) return;
  if (!m || m.cve_mun == null || m.cve_mun === "") {
    selectEl.value = "";
    return;
  }
  const raw = String(m.cve_mun).trim();
  const padded = padCve3(raw);
  const opts = selectEl.options;
  for (let i = 0; i < opts.length; i++) {
    const v = String(opts[i].value);
    if (v === raw || v === padded || padCve3(v) === padded) {
      selectEl.value = v;
      return;
    }
  }
  selectEl.value = raw;
}

export function setEntidadSelectValue(selectEl, cve_ent) {
  if (!selectEl) return;
  if (cve_ent == null || cve_ent === "") {
    selectEl.value = "";
    return;
  }
  const padded = padCve2(cve_ent);
  for (let i = 0; i < selectEl.options.length; i++) {
    if (padCve2(selectEl.options[i].value) === padded) {
      selectEl.value = selectEl.options[i].value;
      return;
    }
  }
}
