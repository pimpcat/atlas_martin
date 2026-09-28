/**
 * Bootstrap AMIGO: deployment_mode, default_ent y entidad activa del explorador.
 * Sin DSN ni connection_key en el cliente.
 */

import { apiUrl, setApiCveEnt, setMartinSourcePrefix } from "./atlasConfig.js";

const API_CONFIG = apiUrl("/api/amigo/config");
const API_ENTIDADES = apiUrl("/api/amigo/entidades");
const API_MUNICIPIOS = apiUrl("/api/amigo/municipios");
const API_PAIS_EXTENT = apiUrl("/api/amigo/pais/extent");
const API_ENT_EXTENT = apiUrl("/api/amigo/entidad/extent");
const API_MUN_EXTENT = apiUrl("/api/amigo/municipio/extent");

/** Bounds México aproximados (WGS84) si falla el API. */
export const MX_FALLBACK_BOUNDS = [
  [-118.45, 14.53],
  [-86.46, 32.72],
];

/** Bounds Guerrero (legacy) si falla extent de entidad. */
export const GRO_FALLBACK_BOUNDS = [
  [-102.18435117971923, 16.315952579781328],
  [-98.00727640026655, 18.88784678039839],
];

let _cfg = {
  deployment_mode: "estatal",
  default_ent: "",
  configured: false,
  loaded: false,
  catalog_package: null,
  martin_source_prefix_by_ent: {},
};

/** Entidad activa en mapa/combo (2 dígitos). Vacío hasta pick en modo nacional. */
let _activeEnt = "";
setApiCveEnt(_activeEnt);

/** En modo nacional: ya eligió entidad (muestra municipios). */
let _entityPicked = false;

const _listeners = new Set();

function pad2(cve) {
  const d = String(cve ?? "").replace(/\D/g, "");
  return d.length >= 2 ? d.slice(-2) : ("00" + d).slice(-2);
}

export function getDeploymentMode() {
  return _cfg.deployment_mode === "nacional" ? "nacional" : "estatal";
}

export function isNationalMode() {
  return getDeploymentMode() === "nacional";
}

export function getDefaultEnt() {
  const raw = String(_cfg.default_ent ?? "").replace(/\D/g, "");
  return raw ? pad2(raw) : "";
}

export function getActiveCveEnt() {
  const active = String(_activeEnt ?? "").replace(/\D/g, "");
  if (active) return pad2(active);
  return getDefaultEnt();
}

export function isEntityPicked() {
  if (!isNationalMode()) return true;
  return _entityPicked;
}

export function onAmigoTerritoryChange(fn) {
  if (typeof fn === "function") _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function notify() {
  const byEnt = _cfg.martin_source_prefix_by_ent || {};
  const ent = getActiveCveEnt();
  setMartinSourcePrefix(byEnt[ent] || "");
  setApiCveEnt(ent);
  for (const fn of _listeners) {
    try {
      fn({
        mode: getDeploymentMode(),
        cve_ent: getActiveCveEnt(),
        entityPicked: isEntityPicked(),
      });
    } catch (e) {
      console.warn("[amigo] territory listener:", e);
    }
  }
}

export function setActiveCveEnt(cve_ent, { picked = true } = {}) {
  const raw = String(cve_ent ?? "").replace(/\D/g, "");
  _activeEnt = raw ? pad2(raw) : getDefaultEnt();
  if (isNationalMode()) {
    _entityPicked = Boolean(picked && _activeEnt);
  } else {
    _entityPicked = true;
  }
  notify();
}

export function clearNationalEntityPick() {
  if (!isNationalMode()) return;
  _entityPicked = false;
  notify();
}

export function getCatalogPackage() {
  return _cfg.catalog_package || null;
}

export function getCatalogPackageId() {
  const p = getCatalogPackage();
  return p?.package_id || null;
}

export async function loadAmigoConfig() {
  try {
    const res = await fetch(API_CONFIG, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      if (json?.ok) {
        _cfg = {
          deployment_mode:
            String(json.deployment_mode || "estatal").toLowerCase() === "nacional"
              ? "nacional"
              : "estatal",
          default_ent: (() => {
            const raw = String(json.default_ent ?? "").replace(/\D/g, "");
            return raw ? pad2(raw) : "";
          })(),
          configured: Boolean(json.configured),
          loaded: true,
          catalog_package: json.catalog_package || null,
          martin_source_prefix_by_ent: json.martin_source_prefix_by_ent || {},
        };
      }
    }
  } catch (e) {
    console.warn("[amigo] config:", e);
    _cfg.loaded = true;
  }
  _activeEnt = getDefaultEnt();
  _entityPicked = !isNationalMode();
  notify();
  return { ..._cfg, active_ent: _activeEnt, entity_picked: _entityPicked };
}

/** Mapa cve_ent → nomgeo (CORE), para branding sin reconsultar. */
let _entNames = new Map();

export function setEntidadNameCache(rows) {
  _entNames = new Map();
  for (const r of rows || []) {
    const cve = pad2(r.cve_ent);
    const nom = (r.nomgeo || "").trim();
    if (cve && nom) _entNames.set(cve, nom);
  }
}

export function getEntidadNombre(cve_ent) {
  const cve = pad2(cve_ent || getActiveCveEnt());
  return _entNames.get(cve) || "";
}

export function rememberEntidadNombre(cve_ent, nomgeo) {
  const cve = pad2(cve_ent);
  const nom = (nomgeo || "").trim();
  if (cve && nom) _entNames.set(cve, nom);
}

export async function fetchEntidadesAmigo() {
  const res = await fetch(API_ENTIDADES, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok || !Array.isArray(json.rows)) {
    throw new Error(json?.message || "Respuesta inválida entidades");
  }
  setEntidadNameCache(json.rows);
  return json.rows;
}

export async function fetchMunicipiosAmigo(cve_ent) {
  const ent = pad2(cve_ent || getActiveCveEnt());
  const url = new URL(API_MUNICIPIOS, window.location.href);
  url.searchParams.set("cve_ent", ent);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok || !Array.isArray(json.rows)) {
    throw new Error(json?.message || "Respuesta inválida municipios");
  }
  return json.rows.map((r) => ({
    cve_mun: r.cve_mun,
    nomgeo: r.nomgeo,
    cve_ent: r.cve_ent || ent,
  }));
}

async function fetchBboxJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok || !json.bbox) throw new Error(json?.message || "Sin bbox");
  return json.bbox;
}

export function bboxToBounds(bbox) {
  if (!bbox) return null;
  return [
    [bbox.west, bbox.south],
    [bbox.east, bbox.north],
  ];
}

export async function fetchPaisBounds() {
  try {
    return bboxToBounds(await fetchBboxJson(API_PAIS_EXTENT)) || MX_FALLBACK_BOUNDS;
  } catch {
    return MX_FALLBACK_BOUNDS;
  }
}

export async function fetchEntidadBounds(cve_ent) {
  const ent = pad2(cve_ent || getActiveCveEnt());
  try {
    const url = new URL(API_ENT_EXTENT, window.location.href);
    url.searchParams.set("cve_ent", ent);
    return bboxToBounds(await fetchBboxJson(url.toString())) || GRO_FALLBACK_BOUNDS;
  } catch {
    return ent === "12" ? GRO_FALLBACK_BOUNDS : MX_FALLBACK_BOUNDS;
  }
}

export async function fetchAmigoMunicipioExtent(cve_mun, cve_ent) {
  const mun = String(cve_mun ?? "").trim();
  if (!mun) throw new Error("cve_mun requerido");
  const ent = pad2(cve_ent || getActiveCveEnt());
  const url = new URL(API_MUN_EXTENT, window.location.href);
  url.searchParams.set("cve_mun", mun);
  url.searchParams.set("cve_ent", ent);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok || !json.bbox) {
    throw new Error(json?.message || "Sin extensión municipal");
  }
  return json;
}

/** Bounds iniciales del explorador según modo. */
export async function fetchExplorerHomeBounds() {
  if (isNationalMode() && !isEntityPicked()) {
    return fetchPaisBounds();
  }
  return fetchEntidadBounds(getActiveCveEnt());
}
