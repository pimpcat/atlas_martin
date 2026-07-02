/**
 * Quita backdrops huérfanos de Bootstrap que bloquean clics en el sidebar (combo municipios).
 */
export function purgeOrphanModalBackdrops() {
  const tabular = document.getElementById("visorTabularModal");
  const spatial = document.getElementById("visorSpatialModal");
  const adminModal = document.querySelector(".visor-admin-modal");
  const tabularOpen = Boolean(tabular?.classList.contains("show"));
  const spatialOpen = Boolean(spatial?.classList.contains("show"));
  const adminOpen = Boolean(adminModal && !adminModal.classList.contains("d-none"));
  if (!tabularOpen && !spatialOpen && !adminOpen) {
    document.querySelectorAll("body > .modal-backdrop").forEach((el) => el.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");
  }
}
