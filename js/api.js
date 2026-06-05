/**
 * Cliente HTTP del Atlas: catálogo del menú y consultas al API FastAPI.
 * Centraliza URLs y el parseo uniforme de respuestas { ok, rows, message }.
 *
 * Consumido por app.js, geoContext.js, homeView.js y los módulos *Viz.js.
 */

import { apiUrl } from "./atlasConfig.js";

// --- Rutas REST FastAPI (Nginx /api/… → app_api; sin carpeta PHP) ---

const DATA_URL = "./data/mock.json";
const API_INDICATOR_URL = apiUrl("/api/indicators");
const API_MUNICIPIOS_URL = apiUrl("/api/municipios");
const API_MUNICIPIO_EXTENT_URL = apiUrl("/api/municipio/extent");
const API_GEO_CONTEXTO_URL = apiUrl("/api/geo/contexto");
const API_SUPERFICIE_COMPARATIVA_URL = apiUrl("/api/comparativas/superficie");
const API_POBLACION_URL = apiUrl("/api/comparativas/poblacion");
const API_CRECIMIENTO_URL = apiUrl("/api/comparativas/crecimiento");
const API_EDAD_MEDIANA_URL = apiUrl("/api/comparativas/edad-mediana");
const API_NACIMIENTOS_URL = apiUrl("/api/vistas/nacimientos");
const API_DEFUNCIONES_URL = apiUrl("/api/vistas/defunciones");
const API_ESCOLARIDAD_URL = apiUrl("/api/vistas/escolaridad");
const API_ANALFABETISMO_URL = apiUrl("/api/vistas/analfabetismo");
const API_UNIDADES_MEDICAS_URL = apiUrl("/api/vistas/unidades-medicas");
const API_VIVIENDA_PARTICIPACION_URL = apiUrl("/api/vistas/vivienda-participacion");
const API_VIVIENDA_SERVICIOS_URL = apiUrl("/api/vistas/vivienda-servicios");
const API_POBLACION_OCUPADA_URL = apiUrl("/api/vistas/poblacion-ocupada");
const API_CARACTERISTICAS_ECONOMICAS_URL = apiUrl("/api/vistas/caracteristicas-economicas");
const API_UNIDADES_ECONOMICAS_URL = apiUrl("/api/vistas/unidades-economicas");
const API_SUPERFICIE_AGRICULTURA_URL = apiUrl("/api/vistas/superficie-agricultura");
const API_INVERSION_PUBLICA_URL = apiUrl("/api/vistas/inversion-publica");
const API_INSTITUCIONES_ADMIN_PUBLICA_MUNICIPAL_URL = apiUrl(
  "/api/vistas/instituciones-admin-publica"
);
const API_HABITANTES_POR_POLICIA_URL = apiUrl("/api/vistas/habitantes-por-policia");
const API_EXPLORADOR_MUNICIPAL_URL = apiUrl("/api/explorador/municipal");

// --- Menú lateral (estructura estática; flags activan vistas en app.js) ---

/**
 * Modelo del menú (temáticas -> indicadores).
 * viewParam se manda al mapa como parámetro codificado en base64.
 */
export function getMenuModel() {
  return [
    {
      id: "geo",
      title: "Geografía",
      items: [
        {
          id: "geo_datos_geo",
          title: "Datos Geográficos",
          subtitle: "Ubicación, clima, relieve y más",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          geoContext: true,
        },
        {
          id: "geo_visor",
          title: "Visor Geográfico",
          subtitle: "Mapa ampliado y capas",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          visor: true,
        },
        {
          id: "geo_inv_viv",
          title: "Inventario de Viviendas",
          subtitle: "INV 2020 · Manzanas",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          invViv: true,
        },
      ],
    },
    {
      id: "socio",
      title: "Sociodemografía",
      items: [
        {
          id: "socio_poblacion",
          title: "Población",
          subtitle: "INEGI · Censos 2010 y 2020",
          unit: "personas",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo2LGw6YzEwMA==",
          poblacionComparativa: true,
        },
        {
          id: "socio_crecimiento",
          title: "Población y crecimiento",
          subtitle: "Distribución % y tasas (INEGI)",
          unit: "%",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          crecimientoComparativa: true,
        },
        {
          id: "socio_edad_mediana",
          title: "Edad mediana",
          subtitle: "INEGI · Censo 2020",
          unit: "años",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          edadMedianaComparativa: true,
        },
        {
          id: "socio_nacimientos",
          title: "Nacimientos",
          subtitle: "Por entidad y municipio (INEGI 2024)",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          nacimientosVista: true,
        },
        {
          id: "socio_defunciones",
          title: "Defunciones",
          subtitle: "Por entidad y municipio (INEGI 2024)",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          defuncionesVista: true,
        },
        {
          id: "socio_unidades_medicas",
          title: "Unidades médicas en servicio",
          subtitle: 'CLUES Secretaría de Salud · Dic 2025',
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          unidadesMedicasVista: true,
        },
        {
          id: "socio_escolaridad",
          title: "Grado promedio de escolaridad",
          subtitle: "INEGI · Censo 2020",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          escolaridadVista: true,
        },
        {
          id: "socio_analfabetismo",
          title: "Tasa de analfabetismo",
          subtitle: "INEGI · Censos 2010 y 2020",
          unit: "%",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          analfabetismoVista: true,
        },
      ],
    },
    {
      id: "viv",
      title: "Vivienda",
      items: [
        {
          id: "viv_participacion_vivh",
          title: "Participación viviendas particulares habitadas",
          subtitle: "Participación % y tasas de crecimiento (INEGI)",
          unit: "%",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo2LGw6YzEwMA==",
          viviendaParticipacionVista: true,
        },
        {
          id: "viv_servicios_vivh",
          title: "Servicios en viviendas particulares habitadas",
          subtitle: "Electricidad, agua entubada y drenaje (INEGI 2020)",
          unit: "%",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo2LGw6YzEwMA==",
          viviendaServiciosVista: true,
        },
      ],
    },
    {
      id: "eco",
      title: "Economía",
      items: [
        {
          id: "eco_poblacion_ocupada",
          title: "Población ocupada",
          subtitle: "Por escolaridad y municipio (INEGI 2020)",
          unit: "personas",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          poblacionOcupadaVista: true,
        },
        {
          id: "eco_caracteristicas_economicas",
          title: "Características económicas",
          subtitle: "UE, empleo y producción bruta (INEGI · Censos Económicos)",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          caracteristicasEconomicasVista: true,
        },
        {
          id: "eco_unidades_economicas",
          title: "Unidades económicas",
          subtitle: "DENUE por municipio",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          unidadesEconomicasVista: true,
        },
        {
          id: "eco_superficie_agricultura",
          title: "Superficie con agricultura",
          subtitle: "AMCA 2016 · hectáreas",
          unit: "ha",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          superficieAgriculturaVista: true,
        },
      ],
    },
    {
      id: "gov",
      title: "Gobierno",
      items: [
        {
          id: "gov_inversion_publica",
          title: "Inversión pública",
          subtitle: "Miles de pesos · INEGI 2024",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          inversionPublicaVista: true,
        },
        {
          id: "gov_instituciones_admin_publica",
          title: "Instituciones administración pública municipal",
          subtitle: "CNGG 2022 · instituciones y personal",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          institucionesAdminPublicaMunicipalVista: true,
        },
        {
          id: "gov_habitantes_por_policia",
          title: "Habitantes por policía",
          subtitle: "CNGG 2022 · habitantes por policía preventiva",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
          habitantesPorPoliciaVista: true,
        },
      ],
    },
    {
      id: "contacto",
      title: "Contacto",
      items: [
        {
          id: "contacto_directorio",
          title: "Directorio",
          subtitle: "Ejemplo",
          unit: "",
          viewParam: "bGF0OjE3LjQ5MTA0LGxvbjotOTkuOTMzNzAsejo1LGw6YzEwMA==",
        },
      ],
    },
  ];
}

/** Parsea respuesta JSON de vistas ({ ok, top5, states, … }). */
async function parseVistaJsonResponse(res) {
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const d = json && json.detail;
    const msg =
      (d && (d.message || d.error)) ||
      (json && (json.message || json.error)) ||
      `HTTP ${res.status}`;
    return { ok: false, message: String(msg) };
  }
  if (!json || json.ok !== true) {
    const msg =
      json && (json.message || json.error)
        ? String(json.message || json.error)
        : "Respuesta inválida";
    return { ok: false, message: msg };
  }
  return json;
}

async function fetchVistaSelected(baseUrl, selected) {
  const url = new URL(baseUrl, window.location.href);
  if (selected && selected.cve_mun) {
    url.searchParams.set("cve_mun", String(selected.cve_mun).trim());
  }
  if (selected && selected.nomgeo) {
    url.searchParams.set("nom_mun", String(selected.nomgeo).trim());
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  return parseVistaJsonResponse(res);
}

// --- Catálogo y contexto territorial ---

/**
 * Catálogo de municipios (PostgreSQL, atlas.c_mun).
 */
export async function fetchMunicipios() {
  const url = new URL(API_MUNICIPIOS_URL, window.location.href);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json || !json.ok || !Array.isArray(json.rows)) {
    throw new Error(json && json.message ? String(json.message) : "Respuesta inválida");
  }
  return json.rows;
}

/** Bbox WGS84 del municipio (atlas.c_mun) para encuadre sin depender de teselas MVT. */
export async function fetchMunicipioExtent(cve_mun) {
  const cve = String(cve_mun ?? "").trim();
  if (!cve) throw new Error("cve_mun requerido");
  const url = new URL(API_MUNICIPIO_EXTENT_URL, window.location.href);
  url.searchParams.set("cve_mun", cve);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok || !json.bbox) {
    throw new Error(json?.message || json?.detail || "Sin extensión municipal");
  }
  return json;
}

// --- Vistas comparativas y paneles (por indicador del menú) ---

/**
 * Participación viviendas habitadas + tasas (top/middle/bottom + Nacional/Estatal).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchViviendaParticipacionVista(selected) {
  return fetchVistaSelected(API_VIVIENDA_PARTICIPACION_URL, selected);
}

/**
 * Servicios en viviendas habitadas (Nacional, Estatal, municipio seleccionado).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchViviendaServiciosVista(selected) {
  return fetchVistaSelected(API_VIVIENDA_SERVICIOS_URL, selected);
}

export async function fetchCrecimientoComparativa(selected) {
  return fetchVistaSelected(API_CRECIMIENTO_URL, selected);
}

/**
 * Top 5 / municipio seleccionado / bottom 5 por % superficie estatal (atlas.c_mun.porcsup).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchSuperficieComparativa(selected) {
  return fetchVistaSelected(API_SUPERFICIE_COMPARATIVA_URL, selected);
}

export async function fetchEdadMedianaComparativa(selected) {
  return fetchVistaSelected(API_EDAD_MEDIANA_URL, selected);
}

export async function fetchDefuncionesVista(selected) {
  return fetchVistaSelected(API_DEFUNCIONES_URL, selected);
}

export async function fetchEscolaridadVista(selected) {
  return fetchVistaSelected(API_ESCOLARIDAD_URL, selected);
}

export async function fetchPoblacionOcupadaVista(selected) {
  return fetchVistaSelected(API_POBLACION_OCUPADA_URL, selected);
}

/**
 * Características económicas (tab_municipal: ue, pers_ocup, prod_brut).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchCaracteristicasEconomicasVista(selected) {
  return fetchVistaSelected(API_CARACTERISTICAS_ECONOMICAS_URL, selected);
}

/**
 * Unidades económicas DENUE (tab_municipal.ue_den): top 5 / seleccionado / bottom 5.
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchUnidadesEconomicasVista(selected) {
  return fetchVistaSelected(API_UNIDADES_ECONOMICAS_URL, selected);
}

/**
 * Superficie con agricultura a cielo abierto (tab_municipal, AMCA 2016).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchSuperficieAgriculturaVista(selected) {
  return fetchVistaSelected(API_SUPERFICIE_AGRICULTURA_URL, selected);
}

/**
 * Inversión pública ejercida según finalidad (tab_municipal).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchInversionPublicaVista(selected) {
  return fetchVistaSelected(API_INVERSION_PUBLICA_URL, selected);
}

/**
 * Instituciones administración pública municipal (tab_municipal, CNGG).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchInstitucionesAdminPublicaMunicipalVista(selected) {
  return fetchVistaSelected(API_INSTITUCIONES_ADMIN_PUBLICA_MUNICIPAL_URL, selected);
}

/**
 * Habitantes por policía preventiva (tab_municipal: habxpol, pob_tot, pol_prev).
 * @param {{ cve_mun?: string, nomgeo?: string } | null} selected
 */
export async function fetchHabitantesPorPoliciaVista(selected) {
  return fetchVistaSelected(API_HABITANTES_POR_POLICIA_URL, selected);
}

export async function fetchAnalfabetismoVista(selected) {
  return fetchVistaSelected(API_ANALFABETISMO_URL, selected);
}

export async function fetchUnidadesMedicasVista(selected) {
  return fetchVistaSelected(API_UNIDADES_MEDICAS_URL, selected);
}

export async function fetchNacimientosVista(selected) {
  return fetchVistaSelected(API_NACIMIENTOS_URL, selected);
}

export async function fetchPoblacionComparativa(selected) {
  return fetchVistaSelected(API_POBLACION_URL, selected);
}

// --- Datos geográficos y explorador municipal ---

function normCveMun3(cve_mun) {
  const raw = String(cve_mun || "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits ? (digits.length >= 3 ? digits.slice(-3) : ("000" + digits).slice(-3)) : raw;
}

const _geoContextoCache = new Map();
let _geoContextoBulkPromise = null;

/** @param {string} cve_mun */
export function getGeoContextoCached(cve_mun) {
  const cve = normCveMun3(cve_mun);
  return _geoContextoCache.has(cve) ? _geoContextoCache.get(cve) : undefined;
}

/** Precarga todos los textos de c_contexto (85 municipios) en una sola petición. */
export async function ensureGeoContextoBulk() {
  if (_geoContextoCache.size > 0) return _geoContextoCache;
  if (!_geoContextoBulkPromise) {
    _geoContextoBulkPromise = (async () => {
      const url = new URL(`${API_GEO_CONTEXTO_URL}/all`, window.location.href);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !json.ok) {
        throw new Error(json && json.message ? String(json.message) : "Respuesta inválida");
      }
      const rows = json.rows || {};
      for (const [cve, row] of Object.entries(rows)) {
        _geoContextoCache.set(normCveMun3(cve), row || null);
      }
      return _geoContextoCache;
    })().catch((err) => {
      _geoContextoBulkPromise = null;
      throw err;
    });
  }
  return _geoContextoBulkPromise;
}

/**
 * Devuelve el registro de atlas.c_contexto para un municipio.
 * @param {string} cve_mun - clave 001..085 (se envía como texto; el backend hace TRIM).
 */
export async function fetchGeoContexto(cve_mun) {
  const cve = normCveMun3(cve_mun);
  if (_geoContextoCache.has(cve)) return _geoContextoCache.get(cve);
  try {
    await ensureGeoContextoBulk();
    if (_geoContextoCache.has(cve)) return _geoContextoCache.get(cve);
  } catch {
    /* fallback a consulta individual */
  }
  const url = new URL(API_GEO_CONTEXTO_URL, window.location.href);
  url.searchParams.set("cve_mun", cve);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json || !json.ok) {
    throw new Error(json && json.message ? String(json.message) : "Respuesta inválida");
  }
  const row = json.row || null;
  _geoContextoCache.set(cve, row);
  return row;
}

/**
 * Explorador municipal (Inicio): panel + KPI 1–5.
 * @param {string} [cve_mun]
 * @param {{ signal?: AbortSignal }} [opts]
 */
const _exploradorCache = new Map();
let _exploradorBulkPromise = null;

/** @param {string} cve_mun */
export function getExploradorCached(cve_mun) {
  const cve = normCveMun3(cve_mun);
  return _exploradorCache.has(cve) ? _exploradorCache.get(cve) : undefined;
}

/** Precarga panel + KPIs de los ~85 municipios en una sola petición. */
export async function ensureExploradorBulk() {
  const hasMunData = [..._exploradorCache.keys()].some((k) => k !== "__ctx__");
  if (hasMunData) return _exploradorCache;
  if (!_exploradorBulkPromise) {
    _exploradorBulkPromise = (async () => {
      const url = new URL(`${API_EXPLORADOR_MUNICIPAL_URL}/all`, window.location.href);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !json.ok) {
        throw new Error(json && json.message ? String(json.message) : "Respuesta inválida");
      }
      if (json.context) {
        _exploradorCache.set("__ctx__", { ok: true, context: json.context, selected: null });
      }
      const selected = json.selected || {};
      for (const [cve, payload] of Object.entries(selected)) {
        const key = normCveMun3(cve);
        _exploradorCache.set(key, {
          ok: true,
          context: json.context,
          selected: payload,
        });
      }
      return _exploradorCache;
    })().catch((err) => {
      _exploradorBulkPromise = null;
      throw err;
    });
  }
  return _exploradorBulkPromise;
}

/** Precalienta explorador + contexto geográfico para un municipio (sin bloquear UI). */
export function prefetchMunicipioData(cve_mun) {
  const cve = normCveMun3(cve_mun);
  if (!cve) return;
  if (!getExploradorCached(cve)) {
    void ensureExploradorBulk().catch(() => {
      void fetchExploradorMunicipal(cve).catch(() => {});
    });
  }
  if (!_geoContextoCache.has(cve)) {
    void ensureGeoContextoBulk().catch(() => {});
  }
}

export async function fetchExploradorMunicipal(cve_mun, opts = {}) {
  const url = new URL(API_EXPLORADOR_MUNICIPAL_URL, window.location.href);
  let cacheKey = "__ctx__";
  if (cve_mun) {
    const cve = normCveMun3(cve_mun);
    url.searchParams.set("cve_mun", cve);
    cacheKey = cve;
    if (!opts.signal) {
      const hit = getExploradorCached(cve);
      if (hit !== undefined) return hit;
      try {
        await ensureExploradorBulk();
        const bulkHit = getExploradorCached(cve);
        if (bulkHit !== undefined) return bulkHit;
      } catch {
        /* fallback a consulta individual */
      }
    }
  } else if (!opts.signal && _exploradorCache.has("__ctx__")) {
    return _exploradorCache.get("__ctx__");
  }
  const res = await fetch(url.toString(), { cache: "no-store", signal: opts.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json || !json.ok) {
    throw new Error(json && json.message ? String(json.message) : "Respuesta inválida");
  }
  if (!opts.signal) _exploradorCache.set(cacheKey, json);
  return json;
}

let _cache = null;

async function loadMock() {
  if (_cache) return _cache;
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${DATA_URL}`);
  _cache = await res.json();
  return _cache;
}

/**
 * Devuelve filas [{ municipio, valor }] para un indicador.
 */
// --- Indicadores genéricos (mock / tabla + gráfica Chart.js) ---

export async function getIndicatorData(indicatorId) {
  // 1) Intenta desde API (PostgreSQL, server-side).
  try {
    const url = new URL(API_INDICATOR_URL, window.location.href);
    url.searchParams.set("indicatorId", indicatorId);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      if (json?.ok && Array.isArray(json.rows)) {
        const rows = json.rows
          .map((r) => ({ municipio: r.municipio, valor: r.valor }))
          .filter((r) => r.municipio);
        rows.sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0));
        return rows;
      }
    }
  } catch {
    // silencioso: hacemos fallback a mock local
  }

  // 2) Fallback a mock local (para que el atlas no se rompa mientras mapeas queries reales).
  const data = await loadMock();
  const series = data?.indicators?.[indicatorId]?.values;
  if (!series) return [];
  const rows = Object.entries(series).map(([municipio, valor]) => ({ municipio, valor }));
  rows.sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0));
  return rows;
}

