/**
 * Mini-vista previa de simbología para el asistente Visor Studio (Fase 3).
 * Canvas ligero; no requiere MapLibre.
 */

const PREVIEW_W = 280;

function previewHeightForItems(items) {
  const n = Math.max(1, items?.length || 1);
  if (n <= 3) return 100;
  if (n <= 6) return 120;
  return Math.min(180, 80 + Math.ceil(n / 3) * 36);
}

function drawPointPreview(ctx, classes, fallbackColor, previewH) {
  const items =
    Array.isArray(classes) && classes.length
      ? classes
      : [{ value: "A", color: fallbackColor || "#8c5f37", label: "Ejemplo" }];
  const n = items.length;
  const cols = Math.min(n, 6);
  const rows = Math.ceil(n / cols);
  const cellW = PREVIEW_W / cols;
  items.forEach((cls, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = cellW * col + cellW / 2;
    const y = 28 + row * 36;
    const color = cls.color || fallbackColor || "#94a3b8";
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "center";
    const lbl = String(cls.label || cls.value || "").slice(0, 14);
    ctx.fillText(lbl, x, y + 20);
  });
  void previewH;
  void rows;
}

function drawLinePreview(ctx, classes, fallbackColor, previewH) {
  const items =
    Array.isArray(classes) && classes.length
      ? classes
      : [{ value: "A", color: fallbackColor || "#8c5f37", label: "Ejemplo" }];
  const n = items.length;
  const segW = (PREVIEW_W - 40) / n;
  const y = Math.min(previewH * 0.45, 48);
  items.forEach((cls, i) => {
    const x1 = 20 + segW * i;
    const x2 = 20 + segW * (i + 1);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.strokeStyle = cls.color || fallbackColor || "#8c5f37";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(cls.label || cls.value || "").slice(0, 10), (x1 + x2) / 2, y + 18);
  });
}

function drawPolygonPreview(ctx, classes, fallbackColor, previewH) {
  const items =
    Array.isArray(classes) && classes.length
      ? classes
      : [{ value: "A", color: fallbackColor || "#8c5f37", label: "Ejemplo" }];
  const n = items.length;
  const cols = Math.min(n, 5);
  const cellW = PREVIEW_W / cols;
  items.forEach((cls, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = cellW * col + cellW / 2;
    const cy = 24 + row * 34;
    const w = Math.min(32, cellW - 8);
    const h = 22;
    ctx.fillStyle = cls.color || fallbackColor || "#8c5f37";
    ctx.globalAlpha = 0.75;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = "#64748b";
    ctx.font = "8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(cls.label || cls.value || "").slice(0, 10), cx, cy + h / 2 + 12);
  });
  void previewH;
}

/**
 * @param {HTMLElement|null} container
 * @param {{ geometry?: string, preset?: string, color?: string, classes?: object[], defaultColor?: string }} opts
 */
export function renderAdminStylePreview(container, opts = {}) {
  if (!container) return;
  container.innerHTML = "";
  const geometry = String(opts.geometry || "point").toLowerCase();
  const preset = String(opts.preset || "");
  const color = opts.color || "#8c5f37";
  const classes = opts.classes || [];
  const defaultColor = opts.defaultColor || "#94a3b8";
  const byAttr = preset.endsWith("_by_attribute");
  const items = byAttr && Array.isArray(classes) && classes.length ? classes : [];
  const previewH = byAttr ? previewHeightForItems(items) : 100;

  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_W;
  canvas.height = previewH;
  canvas.className = "visor-admin-style-preview__canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, PREVIEW_W, previewH);

  if (byAttr) {
    if (geometry === "line") drawLinePreview(ctx, items, defaultColor, previewH);
    else if (geometry === "polygon") drawPolygonPreview(ctx, items, defaultColor, previewH);
    else drawPointPreview(ctx, items, defaultColor, previewH);
    if (!items.length) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Use Autoclasificar para generar clases", PREVIEW_W / 2, previewH / 2);
    }
    return;
  }

  if (preset === "point_symbol") {
    drawPointPreview(ctx, [{ value: "icon", color: "#cbd5e1", label: "Icono" }], color, previewH);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Símbolo del catálogo", PREVIEW_W / 2, previewH - 8);
    return;
  }

  if (geometry === "line") {
    drawLinePreview(ctx, [{ value: "line", color, label: "Línea" }], color, previewH);
  } else if (geometry === "polygon" && preset === "polygon_fill") {
    drawPolygonPreview(ctx, [{ value: "fill", color, label: "Relleno" }], color, previewH);
  } else if (geometry === "polygon") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 24, PREVIEW_W - 80, previewH - 48);
  } else {
    drawPointPreview(ctx, [{ value: "pt", color, label: "Punto" }], color, previewH);
  }
}

export function destroyAdminStylePreview(container) {
  if (container) container.innerHTML = "";
}
