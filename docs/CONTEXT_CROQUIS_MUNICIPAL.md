# Context — Croquis municipal + Cartography Engine (handoff)

> **Usar este archivo al abrir un chat nuevo** para continuar el afinado del croquis / engine.  
> Fecha de corte: **22 jul 2026** · Engine: **`1.12.37`**  
> Doc operativa general: [`CARTOGRAPHY_ENGINE.md`](./CARTOGRAPHY_ENGINE.md)  
> Handoff planos localidad: [`CONTEXT_PLANO_LOCALIDAD_PLU.md`](./CONTEXT_PLANO_LOCALIDAD_PLU.md)  
> Índice: [`context.md`](./context.md)

---

## Prompt corto para pegar en un chat nuevo

```
Continúa el afinado del GroSIG Cartography Engine en C:\Stack_Martin.
Lee primero: htdocs/atlas_gro/docs/CONTEXT_CROQUIS_MUNICIPAL.md
Producto activo: grosig_croquis_municipal (plotter 90×70).
Versión engine esperada: 1.12.37.
No mencionar nombres de sistemas legacy en código/UI.
Responde en español. No cambiar zoom del croquis (pad_ratio=0.04) sin pedirlo.
```

---

## Qué es / dónde vive

| Pieza | Ruta |
|-------|------|
| Engine | `app_api/cartography_engine/` |
| Versión | `app_api/cartography_engine/__init__.py` → `__version__` |
| Plantilla croquis | `app_api/cartography_engine/templates/grosig_croquis_municipal.json` |
| Orquestación croquis | `services/__init__.py` → `_generate_grosig_croquis` |
| Fetch capas/etiquetas | `datasource/__init__.py` (`fetch_layer`, `fetch_layers_in_bbox`, `fetch_labels_in_bbox`) |
| Panel leyenda croquis | `pdf/croquis_panel.py` |
| UI Visor | `htdocs/atlas_gro/js/cartographyClient.js` |
| BD | `GroSIG_Cartography` vía `CARTOGRAPHY_DATABASE_URL` |
| Flag | `CARTOGRAPHY_ENGINE_ENABLED=true` en `.env` |

**Idea clave:** no imprime MapLibre; reconstruye PDF vectorial desde PostGIS.

Tras cambios de código del engine (volumen montado): reiniciar `api_backend`  
(`docker compose restart api_backend` o `fix_cartography_502.bat`).

---

## Estado actual del croquis (`grosig_croquis_municipal`)

### Vista / zoom (NO tocar sin acuerdo)

- Encuadre: `padded_bounds(..., pad_ratio=0.04)` centrado en el municipio **foco**.
- El usuario pidió explícitamente **no abrir el zoom** para “meter” vecinos.

### Colores / estilos aceptados

| Elemento | Valor |
|----------|--------|
| Límite / etiquetas municipio | `#24C200` |
| AGEB rural (trazo) | `#FFAA00`, width **2.6**, dash `[10, 6]` |
| Carretera doble | decoration `double`, width ~0.85 |
| Carretera 3866 | decoration `double_dash` (paralelas: continua + discontinua), width ~0.72, `simplify: 55` |
| Brechas | solo en **foco** (`caminos`); **no** hay ctx de brechas a propósito |

### Capas foco (municipio)

`municipio`, `ageb_rural`, `corrientes`, `cuerpos`, `localidades_urbana|rural|p`,  
`carreteras_doble|dash|otra`, `caminos`, `via_ferrea`, `municipio_limite`, `aeropuertos`.

### Capas contexto vecinos (`ctx_*`, debajo del foco)

`ctx_municipio_limite`, `ctx_municipios` (etiquetas), `ctx_corrientes`,  
`ctx_localidades_urbana` + `ctx_localidades_rural` (`ambito` = Urbana/Rural),  
`ctx_carreteras_doble|dash|otra`, `ctx_cuerpos`.

### Fetch de contexto (crítico — **1.12.25**)

**Regla:** `ST_Intersects(geom, envelope)` y `ST_Intersects(geom, Difference(envelope, foco))`.

- **Extent visible = marco completo:** `expand_bounds_to_frame_aspect` (sin letterbox N/S).
- Localidades de área: `mgn.localidades_a`. El filtro `ambito` **no** se aplica en SQL (vaciaba capas); se trae geometría + `ambito` y se clasifica en Python (`Urbana` / `Rural`).
  - Urbana: relleno `#FFF59D`, contorno sólido `#EF6C00`.
  - Rural amanzanada: mismo relleno, contorno `#616161` + rayado; swatch de tira con hatch clipado.
- Sin clip municipal; pase de dibujo **después** del AGEB.
- Zoom: pad 0.04 intacto.

Etiquetas municipio vecino: centroide de la **porción visible** (`ST_Intersection` con envelope).

Localidades de área (urbana/rural + ctx): etiqueta tipo insumo — `cve_loc` en 1.ª línea; nombre en Title Case partido en hasta **3** renglones proporcionales (`format_localidad_area_label` / `wrap_name_lines`). Centradas.

Localidades punto: formato etiqueta `cve_loc` + salto + `nomgeo`.

---

## Decisiones de producto (no romper)

- No nombrar sistemas legacy en código, plantillas, leyendas ni UI.
- No cambiar PLU/PLR/condensado salvo que se pida.
- Croquis: plotter **90×70**, panel lateral propio (`CroquisPanelContent`).
- Contexto vecinos: **sin brechas**.
- Preferir soluciones de **consulta/filtros** antes que abrir zoom.
- Contexto = lo visible en el extend; no dump de municipios vecinos.

---

## Cómo validar rápido

1. `.env`: `CARTOGRAPHY_ENGINE_ENABLED=true` + `CARTOGRAPHY_DATABASE_URL` OK.
2. Reiniciar `api_backend` (docker / bat).
3. Health: `GET /api/cartography/health` → version `1.12.37`
4. Generar `grosig_croquis_municipal` para un mun con vecinos densos (p. ej. Acapulco / Chilpancingo).
5. Smoke: `app_api/cartography_engine/scripts/smoke_grosig.bat` / `fix_cartography_502.bat`

---

## Roadmap sugerido (priorizado)

### P0 — Cerrar croquis visual vs referencia

- [ ] Validar en PDF real que 1.12.16 completa el margen (límites, carreteras, localidades, corrientes).
- [ ] Lista de “faltantes” por municipio de prueba (nombre + tipo de capa) → ajustar filtros/`codigo_m`/límites, **sin** tocar `pad_ratio`.
- [ ] Si aún trunca: subir `limit` de capas ctx densas o afinar `ORDER BY` (longitud visible).
- [ ] Colisión de etiquetas ctx (`label_collision.py`; incluir `ctx_localidades_p` / `ctx_cuerpos` si hace falta).

### P1 — Paridad de capas croquis

- [ ] Confirmar que `ctx_cuerpos`, `ctx_via_ferrea`, `ctx_aeropuertos` se dibujan bien en vecinos.
- [ ] Decidir si AGEB rural de vecinos debe aparecer (hoy solo foco) — probablemente **no**.
- [ ] Simbología fina 3866 / doble vs referencia (grosor, dash, caps).
- [ ] Etiquetas de corrientes/cuerpos en ctx (along / density).

### P2 — Robustez del engine

- [ ] Tests unitarios del predicado ctx (mock SQL o fixtures geométricas).
- [ ] Logging de `feature_count` por capa ctx en `/generate` (debug sin abrir PDF).
- [ ] Timeouts Nginx ya altos en `/api/cartography/`; monitorear `ST_CoveredBy` / `ST_Distance`.
- [x] Versión en `CARTOGRAPHY_ENGINE.md` alineada.

### P3 — Otros productos / plataforma

- [ ] Alinear condensado / planos con aprendizajes del croquis (doble_dash, labels newline).
- [ ] Catálogo de productos estable en UI (nombres GroSIG únicamente).
- [ ] GeoPDF: smoke de viewport en Acrobat.
- [ ] Paquete instalable del stack (ver `docs/STACK_INSTALLER_Y_RESPALDOS.md`) — aparcado si PS bloqueado.

### P4 — Datos

- [ ] `sql/cartography/` — capas `pending` en `aux.layer_catalog` (GDB).
- [ ] Índices GIST en tablas `info50k.*` / `mgn.*` si el ctx escala mal.
- [ ] Política de refresh MGN / info50k (no solo clonar una vez).

---

## Archivos tocados en la racha croquis (referencia)

- `templates/grosig_croquis_municipal.json`
- `datasource/__init__.py` (ctx por **map extent**)
- `services/__init__.py` (`_generate_grosig_croquis`)
- `pdf/croquis_panel.py`, `pdf/__init__.py`
- `renderers/__init__.py`, `symbols/__init__.py` (`double_dash`)
- `label_collision.py`
- `tests/test_engine.py`
- `__init__.py` (`1.12.37`)

---

## Anti-patrones (evitar)

- Abrir `pad_ratio` “para que se vean vecinos” sin pedirlo.
- Filtrar ctx **solo** por anillo espacial / `ST_Buffer` alrededor del foco.
- Filtrar ctx **solo** por lista `ST_Touches` (pierde mal atribuidos).
- Traer municipios vecinos enteros (fuera del extent).
- Reintroducir brechas en ctx.
- Mencionar nombres de software legacy en entregables visibles.
- Commits / push sin pedirlo el usuario.
- Romper PLU/PLR/condensado al tocar `fetch_layer` (el modo extent solo corre con `focus_geom`+`bbox`).
