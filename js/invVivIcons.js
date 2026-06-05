/**
 * Iconos SVG compactos para el panel INV (personas / viviendas / entorno).
 */

/**
 * @param {string} type
 * @param {string} [color]
 */
export function invLayerIconSvg(type, color) {

  const c = color || "currentColor";

  const t = String(type || "person");



  if (t === "entorno-alum") {

    const stroke = color || "#ffb300";

    return `<svg class="invviv-ico-svg" viewBox="0 0 24 24" aria-hidden="true">

      <path d="M12 2.5a4.5 4.5 0 0 0-4.5 4.5c0 2.1 1.5 3.85 3.5 4.25V18h2v-6.75c2-.4 3.5-2.15 3.5-4.25A4.5 4.5 0 0 0 12 2.5z" fill="${stroke}" opacity="0.95"/>

      <path d="M9 21h6" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>

      <path d="M10 18h4" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>

    </svg>`;

  }



  if (t === "entorno-pav") {

    const stroke = color || "#8d6e63";

    return `<svg class="invviv-ico-svg" viewBox="0 0 24 24" aria-hidden="true">

      <path d="M3 15.5h18" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>

      <path d="M5 18h14" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>

      <rect x="5" y="10" width="14" height="4.5" rx="0.8" fill="${stroke}" opacity="0.35"/>

      <path d="M7 12h2M11 12h2M15 12h2" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>

    </svg>`;

  }



  if (t.startsWith("house")) {

    const stroke =

      t === "house-par"

        ? "#ec407a"

        : t === "house-hab"

          ? "#42a5f5"

          : t === "house-nohab"

            ? "#2e7d32"

            : c;

    return `<svg class="invviv-ico-svg" viewBox="0 0 24 24" aria-hidden="true">

      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5z" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/>

      <path d="M10 21v-7h4v7" fill="none" stroke="${stroke}" stroke-width="1.8"/>

    </svg>`;

  }



  const headR = t === "person-child" ? 2.4 : 2.8;

  const gradCap =

    t === "person-grad" || t === "person-grad-f" || t === "person-grad-m"

      ? `<path d="M6 6.5h12l-6-3.5z" fill="${c}" opacity="0.9"/>`

      : "";



  const dress =

    t === "person-f" || t === "person-grad-f"

      ? `<ellipse cx="12" cy="13.5" rx="5" ry="4.2" fill="${c}"/>`

      : `<ellipse cx="12" cy="13" rx="5.5" ry="3.8" fill="${c}"/>`;



  return `<svg class="invviv-ico-svg" viewBox="0 0 24 24" aria-hidden="true">

    ${gradCap}

    <circle cx="12" cy="7.5" r="${headR}" fill="${c}"/>

    ${dress}

  </svg>`;

}


