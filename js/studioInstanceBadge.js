/**
 * Banner de instancia AMIGO activa (JWT admin).
 */
import { getAdminUser } from "./visorAdminAuth.js";

const BADGE_ID = "studioInstanceBadge";

export function studioInstanceBadgeHtml(user) {
  const u = user || getAdminUser();
  if (!u?.cve_ent && !u?.instancia_clave) return "";
  const clave = (u.instancia_clave || u.connection_key || "INST").toUpperCase();
  const ent = String(u.cve_ent || "").padStart(2, "0");
  const name = u.entidad || "";
  const estado = u.estado_instancia ? ` · ${u.estado_instancia}` : "";
  return `
    <div id="${BADGE_ID}" class="studio-instance-badge alert alert-info py-2 px-3 mb-3 d-flex flex-wrap align-items-center gap-2" role="status">
      <span class="badge text-bg-primary">${clave}</span>
      <span class="small mb-0">
        <strong>Instancia activa</strong>
        ${name ? ` — ${name}` : ""}
        <span class="text-muted">(cve_ent ${ent}${estado})</span>
      </span>
      <span class="small text-muted ms-auto">Sus cambios van a la base de esta entidad, no a Guerrero.</span>
    </div>`;
}

export function mountStudioInstanceBadge(hostEl, user) {
  if (!hostEl) return;
  const html = studioInstanceBadgeHtml(user);
  const existing = hostEl.querySelector(`#${BADGE_ID}`);
  if (existing) existing.remove();
  if (!html) return;
  hostEl.insertAdjacentHTML("afterbegin", html);
}

export function refreshStudioInstanceBadge(hostEl) {
  mountStudioInstanceBadge(hostEl, getAdminUser());
}
