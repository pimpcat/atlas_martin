/**
 * Theme Studio — modo básico (pocos colores con nombre claro), semáforo de legibilidad,
 * generar oscuro desde claro y lista de cambios sin guardar.
 */

/* ---------- utilidades de color ---------- */

/** @returns {{r:number,g:number,b:number,a:number}|null} */
export function parseColor(value) {
  const v = String(value || "").trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
  m = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/.exec(v);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
  return null;
}

const h2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const toHex = (c) => `#${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
const trip = (c) => `${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}`;
const rgba = (c, a) => `rgba(${trip(c)}, ${a})`;

function over(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function luminance(c) {
  const ch = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function toHsl(c) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function fromHsl({ h, s, l }) {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a: 1 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255, a: 1 };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function shade(c, dl) {
  const hsl = toHsl(c);
  return fromHsl({ ...hsl, l: clamp(hsl.l + dl, 0, 1) });
}

/* ---------- modo básico ---------- */

export const BASICS = [
  { id: "shell", label: "Cabecera y fondo", help: "Barra superior, menú lateral y fondo de la página.", read: "--shell-bg" },
  { id: "text", label: "Texto", help: "Color de las letras (también los textos secundarios, más tenues).", read: "--text" },
  { id: "accent", label: "Color principal", help: "Botones, resaltados y bordes destacados.", read: "--accent-rgb" },
  { id: "card", label: "Tarjetas y paneles", help: "Fondo de gráficas, tablas, paneles del visor y tarjetas del inicio.", read: "--card-background" },
  { id: "highlight", label: "Resaltado", help: "Elemento activo: menú, botones de mapa base, interruptor de tema, íconos y brillo de tarjetas.", read: "--home-highlight" },
  { id: "exportBtn", label: "Botones KML / SHP", help: "Botones de descarga del panel de capas del visor (el fondo al pasar el mouse se ajusta solo).", read: "--export-btn-text" },
  { id: "chart1", label: "Gráficas · color 1", help: "Primera serie de las gráficas.", read: "--chart-palette-1" },
  { id: "chart2", label: "Gráficas · color 2", help: "Segunda serie.", read: "--chart-palette-2" },
  { id: "chart3", label: "Gráficas · color 3", help: "Tercera serie.", read: "--chart-palette-3" },
  { id: "chart4", label: "Gráficas · color 4", help: "Cuarta serie.", read: "--chart-palette-4" },
];

/**
 * Devuelve {token: valor} a escribir al cambiar un color básico (incluye derivados).
 * @param {"claro"|"oscuro"} themeId
 */
export function basicToTokens(themeId, id, hex) {
  const c = parseColor(hex);
  if (!c) return {};
  const dark = themeId === "oscuro";
  switch (id) {
    case "shell":
      return { "--shell-bg": hex, "--bg": hex, "--header-bg": hex, "--sidebar-bg-top": hex, "--sidebar-bg-bottom": hex };
    case "text":
      return {
        "--text": hex,
        "--text-rgb": trip(c),
        "--shell-text": hex,
        "--muted": rgba(c, 0.72),
        "--shell-muted": rgba(c, 0.74),
        "--bs-body-color": hex,
        "--bs-body-color-rgb": trip(c),
        "--bs-secondary-color": rgba(c, dark ? 0.78 : 0.7),
        "--bs-secondary-rgb": trip(c),
        "--bs-tertiary-color": rgba(c, dark ? 0.58 : 0.55),
        "--bs-heading-color": hex,
        "--bs-emphasis-color": hex,
      };
    case "accent":
      return {
        "--accent-rgb": trip(c),
        "--border-accent": rgba(c, dark ? 0.28 : 0.35),
        "--table-row-hover": rgba(c, dark ? 0.06 : 0.1),
      };
    case "card":
      return {
        "--card-background": hex,
        "--card-header-background": toHex(shade(c, dark ? -0.03 : -0.06)),
        "--export-snapshot-bg": hex,
        "--home-card-bg": hex,
        "--home-panel-bg": hex,
      };
    case "highlight":
      return {
        "--home-highlight": hex,
        "--home-stat-icon": hex,
        "--home-sidebar-accent": hex,
        "--menu-active-marker": hex,
        "--active-control-bg": hex,
        "--switch-track": toHex(shade(c, -0.15)),
        "--switch-label-active": toHex(shade(c, dark ? 0.25 : -0.2)),
      };
    case "exportBtn":
      return {
        "--export-btn-text": hex,
        "--export-btn-border": rgba(c, dark ? 0.6 : 0.75),
        "--export-btn-hover-text": hex,
        "--export-btn-hover-border": hex,
        "--export-btn-hover-bg": rgba(c, dark ? 0.18 : 0.12),
      };
    case "chart1":
      return { "--chart-palette-1": hex, "--chart-series-navy-1": hex, "--chart-series-navy-2": toHex(shade(c, -0.1)) };
    case "chart2":
      return { "--chart-palette-2": hex, "--chart-series-teal-1": hex, "--chart-series-teal-2": toHex(shade(c, -0.1)) };
    case "chart3":
      return { "--chart-palette-3": hex };
    case "chart4":
      return { "--chart-palette-4": hex };
    default:
      return {};
  }
}

export function readBasicHex(tokens, basic) {
  const c = parseColor(tokens?.[basic.read]);
  return c ? toHex(c) : "#808080";
}

/* ---------- generar oscuro desde claro ---------- */

/** Propuesta de tokens oscuros a partir de los colores básicos del tema claro. */
export function generateDarkFromLight(claroTokens) {
  const get = (k, fb) => parseColor(claroTokens?.[k]) || parseColor(fb);
  const shell = toHsl(get("--shell-bg", "#40cfc6"));
  const accent = toHsl(get("--accent-rgb", "0, 51, 102"));
  const shellDark = toHex(fromHsl({ h: shell.h, s: Math.min(shell.s, 0.45), l: 0.09 }));
  const cardDark = toHex(fromHsl({ h: shell.h, s: Math.min(shell.s, 0.35), l: 0.15 }));
  const accentDark = fromHsl({ h: accent.h, s: Math.max(accent.s, 0.5), l: clamp(accent.l, 0.36, 0.48) });
  const out = {
    ...basicToTokens("oscuro", "shell", shellDark),
    ...basicToTokens("oscuro", "text", "#ecf1f8"),
    ...basicToTokens("oscuro", "accent", toHex(accentDark)),
    ...basicToTokens("oscuro", "card", cardDark),
    "--accent-secondary-rgb": trip(shade(accentDark, 0.12)),
    "--accent-dim": toHex(shade(accentDark, 0.25)),
    "--accent-on-dark": toHex(shade(accentDark, 0.4)),
    "--shell-border": "rgba(255, 255, 255, 0.11)",
    "--border": "rgba(255, 255, 255, 0.11)",
    "--bs-border-color": "rgba(148, 163, 184, 0.28)",
    "--bs-border-color-translucent": "rgba(148, 163, 184, 0.22)",
    "--page-glow-teal": rgba(accentDark, 0.12),
    "--page-glow-navy": "rgba(0, 51, 102, 0.18)",
    "--page-glow-muted": "rgba(45, 95, 85, 0.07)",
    "--map-frame-bg": "rgba(0, 0, 0, 0.15)",
    "--table-head-bg": "rgba(255, 255, 255, 0.04)",
    "--chart-axis-grid": "rgba(255, 255, 255, 0.08)",
    "--bs-emphasis-color": "#ffffff",
  };
  const hl = toHsl(get("--home-highlight", "#0d8a8a"));
  Object.assign(
    out,
    basicToTokens("oscuro", "highlight", toHex(fromHsl({ ...hl, l: clamp(hl.l + 0.15, 0.5, 0.65) }))),
    { "--switch-thumb": "#b8f0f0" },
  );
  for (let i = 1; i <= 4; i += 1) {
    const c = get(`--chart-palette-${i}`, "#3dbdbd");
    const hsl = toHsl(c);
    const lifted = toHex(fromHsl({ ...hsl, l: clamp(hsl.l + 0.1, 0.45, 0.65) }));
    Object.assign(out, basicToTokens("oscuro", `chart${i}`, lifted));
  }
  return out;
}

/* ---------- semáforo de legibilidad ---------- */

const CHECKS = [
  { label: "Texto sobre el fondo", fg: "--text", bg: "--shell-bg" },
  { label: "Texto tenue sobre el fondo", fg: "--muted", bg: "--shell-bg" },
  { label: "Texto de la cabecera", fg: "--shell-text", bg: "--header-bg" },
  { label: "Texto sobre tarjetas", fg: "--bs-body-color", bg: "--card-background" },
  { label: "Texto secundario sobre tarjetas", fg: "--bs-secondary-color", bg: "--card-background" },
  { label: "Botones (letra blanca sobre color principal)", fg: "#ffffff", bg: "--accent-rgb" },
];

/**
 * @param {Record<string,string>} tokens
 * @param {"claro"|"oscuro"} themeId
 * @returns {Array<{label:string, ratio:number, level:"ok"|"warn"|"bad"}>}
 */
export function legibilityReport(tokens, themeId) {
  const base = parseColor(themeId === "oscuro" ? "#0c141f" : "#ffffff");
  const pageBg = over(parseColor(tokens["--bg"]) || base, base);
  const out = [];
  for (const chk of CHECKS) {
    const fgRaw = chk.fg.startsWith("--") ? tokens[chk.fg] : chk.fg;
    const bgRaw = tokens[chk.bg];
    const fg0 = parseColor(fgRaw);
    const bg0 = parseColor(bgRaw);
    if (!fg0 || !bg0) continue;
    const bg = over(bg0, pageBg);
    const fg = over(fg0, bg);
    const ratio = contrastRatio(fg, bg);
    out.push({ label: chk.label, ratio, level: ratio >= 4.5 ? "ok" : ratio >= 3 ? "warn" : "bad" });
  }
  return out;
}

/* ---------- cambios sin guardar ---------- */

/**
 * @returns {Array<{theme:string, key:string, before:string, after:string}>}
 */
export function catalogDiff(before, after) {
  const out = [];
  if ((before?.default_theme || "claro") !== (after?.default_theme || "claro")) {
    out.push({ theme: "general", key: "default_theme", before: before?.default_theme || "claro", after: after?.default_theme || "claro" });
  }
  for (const t of ["claro", "oscuro"]) {
    const a = before?.themes?.[t]?.tokens || {};
    const b = after?.themes?.[t]?.tokens || {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (String(a[k] ?? "") !== String(b[k] ?? "")) out.push({ theme: t, key: k, before: a[k] ?? "", after: b[k] ?? "" });
    }
  }
  return out;
}
