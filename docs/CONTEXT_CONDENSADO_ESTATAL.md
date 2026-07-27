# Context — Condensado estatal (handoff)

> **Usar este archivo al abrir un chat nuevo** para continuar el condensado.  
> Fecha de corte: **22 jul 2026 (noche)** · Engine: **`1.12.49`**  
> **Narrativa / diseño detallado:** [`context-condensado.md`](./context-condensado.md)  
> Doc operativa: [`CARTOGRAPHY_ENGINE.md`](./CARTOGRAPHY_ENGINE.md)  
> Croquis (no mezclar): [`CONTEXT_CROQUIS_MUNICIPAL.md`](./CONTEXT_CROQUIS_MUNICIPAL.md)  
> Índice: [`context.md`](./context.md)

---

## Prompt corto

```
Continúa el condensado estatal GroSIG en C:\Stack_Martin.
Lee primero: htdocs/atlas_gro/docs/context-condensado.md
Handoff corto: htdocs/atlas_gro/docs/CONTEXT_CONDENSADO_ESTATAL.md
Producto: condensado_estatal (plotter 90×120 landscape = 120×90 cm).
Versión engine esperada: 1.12.49.
No tocar croquis/PLU/PLR ni pad_ratio del croquis.
Config solo en condensado_estatal.json + _generate_condensado_estatal.
Responde en español.
```

---

## Qué es / dónde vive

| Pieza | Ruta |
|-------|------|
| Plantilla | `app_api/cartography_engine/templates/condensado_estatal.json` |
| Orquestación | `services/__init__.py` → `_generate_condensado_estatal` |
| Panel lateral | `pdf/condensado_panel.py` (inspirado en croquis; escala ×~1.31) |
| Preset layout | `layouts` → `grosig_condensado` / papel `plotter_90x120` |
| UI | `htdocs/atlas_gro/js/cartographyClient.js` (producto `condensado`) |
| Referencia INEGI | `d:\respaldo comite estatal 2025\escritorio\victor\GEPROCEN_CE_2024\PDFS\COND-CROQ\CONDENSADO-ESTATAL\12 Guerrero\Guerrero_GEO_ED.pdf` |
| Smoke engine | `C:\Stack_Martin\smoke_out\condensado.pdf` |

**Aislamiento:** no compartir overrides de panel/simbología con el croquis 90×70.

---

## Estado al cierre (1.12.49) — densificar etiquetas

Pedido del día: **~70–90% localidades urbanas etiquetadas** + **más hidrónimos de corrientes**.

### Cambios hechos (listos para smoke mañana)

1. **Urbana por área:** `fetch_labels` ordena `localidades_urbana/rural` con `ORDER BY ST_Area(geom) DESC`.
2. **Colisión respeta ese orden:** en `label_collision.py`, boost por índice de entrada solo en capas de localidades de área (no municipios).
3. **Presupuestos ↑**
   - Plantilla: urbana `label_limit=500`, corrientes `350`, cuerpos `120`
   - Path condensado: `max_labels` tope **1100**
   - PDF pases: loc ≤**700** (pad 0.4), hidro ≤**400** (pad 0.35)
4. **Along hidro más permisivo** (`corrientes`/`cuerpos`): `min_len≈55`, hasta **6** etiquetas/nombre, `min_separation≈1600`, chunk ~4 km en `_select_spaced_line_components`.

### Validar mañana (primero)

```bat
cd /d C:\Stack_Martin
docker compose up -d --force-recreate api_backend
curl -s http://localhost:850/api/cartography/health
curl -X POST http://localhost:850/api/cartography/generate -H "Content-Type: application/json" -d "{\"template_id\":\"condensado_estatal\",\"format\":\"pdf\",\"params\":{}}" --output smoke_out\condensado.pdf --max-time 360
docker logs --tail 50 fastapi_backend
```

Mirar: `version` **1.12.49**, `labs=…`, tiempo total, y visualmente densidad urbana + ríos.

Si aún &lt;70% urbanas: subir más `label_limit` / bajar pad loc; si solape feo: subir pad o bajar size urbana.

---

## Tamaño de papel (verificado)

| Fuente | Resultado |
|--------|-----------|
| Engine `page_size("plotter_90x120", "landscape")` | **3401.57 × 2551.18 pt** = **120 cm × 90 cm** |
| MediaBox smoke | coincide |
| Croquis | **90×70** — no mezclar |

---

## Capas activas

| Capa | Qué |
|------|-----|
| `cuerpos` / `corrientes` | Solo **PERENNE**; colores `#00ADEE` / fill cuerpos `#7DD4F7` |
| `municipios_l` / `estados_l` | Municipal `#4F9A58` (trim vs estatal); estatal +++ `#EE1C25` encima |
| `carreteras_doble/dash/otra` | Por `codigo_m` (estilo croquis) |
| `localidades_urbana` | Área urbanas (ambito tipado en Python: U/1) |
| `municipios` | Solo etiquetas; color `#4F9A58` |
| `aeropuerto_*` | Overlay encima |

**Fuera del reducido:** rural amanzanada, FFCC (según plantilla actual).

---

## Paridad visual vs Guerrero_GEO_ED

### Bloque 3 — Etiquetas (en curso)

- [x] Municipios: newline + color verde
- [x] Hidrónimos: italic, pase propio, densificación 1.12.49
- [x] Localidades: ORDER área + colisión por tamaño + limits ↑
- [ ] Verificar cobertura ~70–90% en smoke
- [ ] Ajuste fino tamaño/pad vs referencia

### Bloques 1–2 / 4

Panel, simbología base y pie ya en buen estado; afinar vs INEGI solo si sobra tiempo.

---

## Archivos tocados en 1.12.49

- `templates/condensado_estatal.json`
- `datasource/__init__.py` (ORDER área; spacing hidro)
- `label_collision.py` (prioridad por orden entrada en loc área)
- `pdf/__init__.py` (pads/max loc+hidro)
- `services/__init__.py` (`max_labels` 1100)
- `tests/test_engine.py`, `__init__.py` version

---

## No hacer

- Cambiar croquis / PLU / PLR / `pad_ratio` del croquis.
- Quitar `bbox` del path condensado.
- Añadir `simplify` agresivo a urbanas sin acuerdo.
