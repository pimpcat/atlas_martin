# GroSIG Cartography Engine

Documentación operativa del motor de cartografía vectorial (estado al **22 jul 2026**).  
Código: `app_api/cartography_engine/` · UI generación: panel **Cartografía** del Visor (`htdocs/atlas_gro/js/cartographyClient.js`) · Admin branding 1.0: **Cartography Studio** (`cartography-studio.html`).

**Versión engine:** `1.12.87` (`cartography_engine.__version__`) · historial de fases Studio P0–P15 en `TEMPLATE_SCHEMA_V1.md`  
**P0 Template Schema v1:** [`app_api/cartography_engine/docs/TEMPLATE_SCHEMA_V1.md`](../../../../app_api/cartography_engine/docs/TEMPLATE_SCHEMA_V1.md) · `python -m cartography_engine.scripts.verify_cartography --schema-only`

**Handoff condensado estatal:** [`context-condensado.md`](./context-condensado.md) · [`CONTEXT_CONDENSADO_ESTATAL.md`](./CONTEXT_CONDENSADO_ESTATAL.md)  
**Handoff croquis municipal (chat nuevo):** [`CONTEXT_CROQUIS_MUNICIPAL.md`](./CONTEXT_CROQUIS_MUNICIPAL.md)  
**Handoff plano localidad (PLR/PLU + multipágina):** [`CONTEXT_PLANO_LOCALIDAD_PLU.md`](./CONTEXT_PLANO_LOCALIDAD_PLU.md)  
**Installer / respaldos del stack:** [`docs/STACK_INSTALLER_Y_RESPALDOS.md`](../../../docs/STACK_INSTALLER_Y_RESPALDOS.md)

**Idea clave:** no es “imprimir el mapa del visor”. Reconstruye productos cartográficos desde PostGIS (BD dedicada `GroSIG_Cartography`) con salida **100 % vectorial** (PDF / GeoPDF / SVG).

Relacionado: [sql/cartography/README.md](../../../../sql/cartography/README.md) (scripts de BD).

---

## Resumen rápido

| Pieza | Estado |
|-------|--------|
| API `/api/cartography/health` y `/generate` | Activo con flag |
| BD `GroSIG_Cartography` (esquemas `mgn`, `info50k`, `marco`, `aux`) | Lista; Atlas sigue en BD `atlas` |
| Productos GroSIG v1 | Plano localidad, croquis municipal, condensado estatal |
| Productos Atlas | Croquis estándar / map focus, atlas multipágina |
| Panel Visor | Selector de producto + localidades + descarga |
| Tipografía / leyenda / norte / escala | Escalados a plotter (sesión 13 jul) |
| Condensado | Papel **90×120 landscape** (120 cm ancho × 90 cm alto); preset `grosig_condensado` |
| Deps pip | Ver sección **Dependencias Python** (`requirements-cartography.txt`) |

---

## Principios (diseño)

- Data driven first (plantillas JSON + capas)
- API first / stateless
- Database agnostic (hoy: PostGIS)
- 100 % vector output (ReportLab)
- Configuration over code
- Contenedor Docker + flag de activación (mismo patrón que ruteo)

---

## Dependencias Python (paquetes del engine)

No son “plugins” de QGIS/ArcMap: son **paquetes pip** del backend. El engine tiene su propio archivo para no acoplar deps GIS pesadas al Atlas:

| Archivo | Rol |
|---------|-----|
| `app_api/requirements-cartography.txt` | Solo Cartography Engine |
| `app_api/requirements.txt` | Atlas / FastAPI (compartido) |
| `app_api/Dockerfile` | Instala **ambos**; el router del engine solo se monta si `CARTOGRAPHY_ENGINE_ENABLED=true` |

Instalación local / contenedor:

```bash
pip install -r app_api/requirements-cartography.txt
# en Docker ya se ejecuta en el build del api_backend
```

### Paquetes propios del engine (`requirements-cartography.txt`)

Versiones acotadas a mayo–jul 2026 (ajustar si se actualiza el archivo):

| Paquete | Rango | Para qué se usa en el engine |
|---------|-------|------------------------------|
| **reportlab** | `>=4.0,<5` | Motor de dibujo PDF vectorial: `Canvas`, tipografía, paths, colores, imagenes embebidas. Núcleo de `pdf/`, `renderers/`, `identity.py`, tira informativa (`pdf/strip.py`), leyenda/norte/escala. |
| **shapely** | `>=2.0,<3` | Geometrías en Python (Point/Line/Polygon/Multi*): parseo de GeoJSON desde PostGIS, `unary_union`, clips, centroides/labels, proyección página↔mundo en renderers y SVG. Depende de **GEOS** en el sistema (`libgeos-dev` en la imagen Docker). |
| **pyproj** | `>=3.6,<4` | Transformaciones de CRS para **GeoPDF**: convierte bounds del mapa (p. ej. `EPSG:32614`) a WGS84 para GPTS Adobe. Módulo `geopdf/`. Sin pyproj no hay formato `geopdf`. |
| **pikepdf** | `>=8.0,<10` | Post-proceso del PDF ReportLab: inyecta `Viewport` + `Measure` / `GPTS` / `LPTS` (GeoPDF estilo Acrobat, **sin GDAL**). Módulo `geopdf/tag_pdf`. |
| **Pillow** | `>=10.0,<12` | Declarado para manejar PNG/JPG institucionales. ReportLab usa `ImageReader` sobre archivos en `assets/logos/`. |
| **orjson** | `>=3.9,<4` | Declarado para JSON rápido (plantillas / payloads). El loader actual usa `json` de stdlib; orjson es reserva de rendimiento. |

**Decisiones deliberadas (qué NO se usa):**

| Evitado | Motivo |
|---------|--------|
| **geopandas / Fiona / GDAL Python** | Rompen o pesanan el stack del Atlas (`numpy`/`pandas`). Comentario explícito en `requirements-cartography.txt` y `Dockerfile`. |
| **GDAL para GeoPDF** | GeoPDF se hace con `pikepdf` + `pyproj` sobre un PDF ya dibujado. |
| **cairo / weasyprint / matplotlib** | La salida cartográfica va por ReportLab (paths vectoriales), no raster de plot. |
| **segno / QR** | Retirado (17 jul 2026): el QR no enlazaba a un destino útil. |

En la imagen Docker sí se instala `gdal-bin` (CLI del Atlas histórico) y `libgeos-dev` (runtime de Shapely); **no** se liga el engine a bindings Python de GDAL.

### Paquetes compartidos del API (`requirements.txt`) que el engine aprovecha

| Paquete | Uso respecto al engine |
|---------|------------------------|
| **fastapi** + **uvicorn** | `router.py`: `GET /health`, `POST /generate`, respuestas binarias. |
| **pydantic** | Viene con FastAPI; modelos de request/response en `models/` (`GenerateMapRequest`, etc.). |
| **psycopg[binary]** (v3) | Conexión PostGIS vía `database.get_cartography_db()` / `get_db()`. El datasource arma SQL y lee **`ST_AsBinary` (WKB)** para geometrías (fallback GeoJSON solo donde aplica, p. ej. `localidades_a`). |
| **python-dotenv** | Carga `.env` (`CARTOGRAPHY_*`) en el proceso de settings del API. |
| **pytest** | Tests en `cartography_engine/tests/` (no es runtime de producción). |

### Cadena de generación (dónde entra cada lib)

```
PostGIS (psycopg)
    → ST_AsBinary / WKB [+ ST_SimplifyPreserveTopology en capas]
    → shapely.wkb.loads (shape / unary_union / clip)
    → reportlab Canvas (mapa, leyenda, tira, SIP, logos)
    → PDF bytes
         ├─ format=pdf  → respuesta directa
         ├─ format=svg  → rama propia (shapely + ElementTree stdlib)
         └─ format=geopdf → pyproj (WGS84) + pikepdf (Measure/VP)
```

Capas de mapa usan WKB desde **1.12.42** (`fetch_layer`). Desde **1.12.51** el mismo patrón cubre focos/extents, etiquetas, near-localidad, SIP/CD y vialidad (sin cambiar plantillas ni `simplify`).

### Sistema operativo en el contenedor (`Dockerfile`)

```text
apt: gdal-bin, libgeos-dev
pip: requirements.txt + requirements-cartography.txt
Python: 3.10 (imagen tiangolo/uvicorn-gunicorn-fastapi)
```

### Vérificación rápida de imports

```bash
docker exec -it fastapi_backend python -c "import reportlab, shapely, pyproj, pikepdf; print('cartography deps OK')"
```

(Ajusta el nombre del contenedor si difiere en `docker compose ps`.)

---

## Activación y variables de entorno

| Variable | Rol |
|----------|-----|
| `CARTOGRAPHY_ENGINE_ENABLED` | `true` monta el router; si `false`, el Atlas no se rompe |
| `CARTOGRAPHY_DATABASE_URL` | Conexión a **`GroSIG_Cartography`** (no reutilizar `DATABASE_URL` del visor) |
| `CARTOGRAPHY_TEMPLATES_DIR` | Opcional; default `cartography_engine/templates/` |
| `CARTOGRAPHY_ASSETS_DIR` | Opcional; logos etc. en `assets/` |
| `CARTOGRAPHY_BRANDING_FILE` | Opcional; ruta a JSON de marca (default `assets/branding.json`) |
| `CARTOGRAPHY_MAP_CRS` | Default `EPSG:32614` (UTM 14N) |
| `CARTOGRAPHY_SOURCE_CRS` | Default `EPSG:4326` |

En Docker Compose: el backend debe recibir `CARTOGRAPHY_*`; el visor usa el mismo origen Nginx (`:850`) vía `/api/cartography/...`.

---

## API

### `GET /api/cartography/health`

**Contrato Core** (único mecanismo para saber si vive el Engine). No usar flags paralelos ni “¿existe el engine?” por otra vía.

Consumidores: **Visor**, **GroSIG Studio**, **Cartography Studio**, Deployment Manager e Installer.

| Campo | Descripción |
|-------|-------------|
| `engine` | Debe ser `grosig-cartography` |
| `enabled` | `true` si el router está montado |
| `status` | `available` \| `degraded` (p. ej. BD cartografía no OK) |
| `version` | Versión del engine |
| `templates` / `templates_count` | IDs y conteo |
| `logos_count` | Logos resueltos desde branding |
| `branding_updated_at` | ISO mtime de `branding.json` (o null) |
| `formats` / `capabilities` | Feature-detect del cliente |
| `cartography_db` | Estado de la BD dedicada |

Criterio UI “vivo”: HTTP OK + `enabled` + `engine === "grosig-cartography"`. Cliente compartido: [`js/cartographyHealth.js`](../js/cartographyHealth.js).

### Admin branding (Cartography Studio)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/cartography/admin/branding` | Snapshot branding + logos (JWT admin) |
| PUT | `/api/cartography/admin/branding` | Guarda institución / advertencia / fecha / logos |
| POST | `/api/cartography/admin/logos` | Upload PNG/JPG/WEBP a `assets/logos/` |
| GET | `/api/cartography/admin/logos` | Galería: tamaño, duplicados, `in_use`, `primary`, semáforo `check`, `bg_mode`, `usage` |
| GET | `/api/cartography/admin/logos/{name}/file` | Archivo original |
| GET | `/api/cartography/admin/logos/{name}/preview?variant=strip\|croquis&bg_mode=umbral\|bordes` | Miniatura con el tratamiento aplicado (≤ 480 px) |
| POST | `/api/cartography/admin/logos/{name}/use` | Poner / quitar de «en uso» (orden de encabezado) |
| POST | `/api/cartography/admin/logos/settings` | `{ primary_logo?, bg_mode? }` |
| GET/POST | `/api/cartography/admin/branding/profiles` | Perfiles de branding (P12) · `POST …/{slug}/apply` · `DELETE …/{slug}` |
| GET | `/api/cartography/admin/panel-symbology/defaults?kind=croquis\|condensado` | Simbología de fábrica del panel (P13) |
| POST | `/api/cartography/admin/panel-symbology/check` | `{ template }` → avisos de incongruencia panel ↔ capas (P13) |
| GET | `/api/cartography/admin/strip-symbology/defaults` | Columna LÍMITES de fábrica de la tira (P14) |
| POST | `/api/cartography/products/{key}/preview` | Preview desde draft; encabezado `X-GroSIG-Render-Report` (JSON: etiquetas colocadas / recuadro) |
| GET | `/api/cartography/preview-territory[?cve_mun=]` | Municipios (`mgn.municipios_a`) o localidades amanzanadas de `marco.l` con `ambito`, ordenados por clave (combos del Studio y filtro Ámbito del Visor) |

Config: `assets/branding.json` (`advertencia`, `fecha_actualizacion`, `primary_logo`, `logo_bg_mode`, …). Fallback: `symbols/legal_texts.py`.

### `POST /api/cartography/generate`

**Política de auth (1.0 / Fase 0 refactor):** el endpoint permanece **público** (sin JWT) a propósito: el panel Cartografía del Visor lo llama desde el portal. Mitigación: **rate-limit por IP** (`CARTOGRAPHY_GENERATE_RATE_LIMIT`, default 30 / `CARTOGRAPHY_GENERATE_RATE_WINDOW_SEC`, default 60 s) → HTTP 429. En despliegues expuestos a Internet, preferir además restricción de red / reverse-proxy. No se exige login admin para generar PDF/SVG.


Cuerpo típico:

```json
{
  "template_id": "plano_localidad",
  "format": "pdf",
  "params": {
    "cve_mun": "037",
    "cve_loc": "0001",
    "cve_ent": "12"
  }
}
```

| Campo | Notas |
|-------|--------|
| `template_id` | Ver plantillas abajo |
| `format` | `pdf` · `geopdf` · `svg` (según health) |
| `params` | Claves del producto; condensado puede ir vacío `{}` |
| `paper` / `orientation` | Opcional; croquis GroSIG usa plotter 90×70 landscape |

Respuesta: archivo binario + `Content-Disposition` con nombre sugerido.

---

## Base de datos dedicada

**Nombre:** `GroSIG_Cartography`  
**Scripts:** `sql/cartography/`

| Script | Función |
|--------|---------|
| `01_create_database.sql` | Crear BD |
| `02_init_schemas.sql` | Esquemas `mgn`, `info50k`, `marco`, `aux` |
| `03_clone_from_atlas.sql` | Clonar capas útiles desde `atlas` |
| `04_import_gdb_examples.md` | Notas de import desde GDB (SIP, vialidades, etc.) |
| `05_diagnose_sip.sql` | Diagnóstico SIP |

El visor **sigue** en BD `atlas`. El engine lee capas `schema.table` vía `get_cartography_db()`.

---

## Productos y plantillas

Ubicación: `app_api/cartography_engine/templates/`

### GroSIG (prioridad producto)

| `template_id` | Producto | Layout | Params clave |
|---------------|----------|--------|--------------|
| `plano_localidad` | Plano de localidad (urbana/rural amanzanada) | `grosig_localidad` + tira inferior | `cve_mun`, `cve_loc` |
| `grosig_croquis_municipal` | Croquis municipal | `grosig_croquis_90x70` + panel lateral | `cve_mun` |
| `condensado_estatal` | Condensado estatal (plotter) | `grosig_condensado` | (ninguno obligatorio) |

### Atlas / utilidades

| `template_id` | Notas |
|---------------|--------|
| `croquis_municipal` | Croquis Atlas estándar |
| `croquis_map_focus` | Mapa ampliado |
| `atlas_municipal` | Multipágina; `scope: state` o `cve_mun_list` |
| `demo_blank` | PDF sintético (smoke / tests) |

**Fuera de alcance (por ahora):** AGEB suelto, A. Rural, Proc. Lotes, paridad pixel ArcMap, parseo `.style`.

---

## Arquitectura de código (mapa mental)

```
cartography_engine/
  router.py              # FastAPI
  services/              # Orquestación generate → PDF/SVG/GeoPDF
  assets/branding.json   # marca + lista de logos (plugin-friendly)
  assets/logos/          # PNG institucionales (SEPLADER / CESIEG)
  templates/*.json       # Productos data-driven
  layouts/               # Presets, cajas, papel plotter_90x60
  datasource/            # Consultas PostGIS + merge geometrías
  layers.py              # LayerDef, simplify, tablas permitidas
  renderers/             # Leyenda, norte, escala, geometría
  pdf/                   # Ensamblado + strip.py (tira informativa)
  symbols/               # GroSIG Symbol + sip_icons + legal_texts
  identity.py / branding.py  # Franja institucional (data-driven)
  scripts/               # smoke_grosig.bat, make_logos, verify_*
  tests/test_engine.py
```

**CRS de mapa:** UTM 14N (`EPSG:32614`) al dibujar; fuente habitual 4326/geometrías de capa.

---

## Layouts GroSIG

| Preset | Uso |
|--------|-----|
| `grosig_localidad` | Mapa arriba + **tira inferior** (~24 % altura); papel **D-Carta 42×28** landscape; sin leyenda lateral |
| `grosig_marginalia` | Brand + título + mapa + **columna de leyenda completa** + norte/escala/pie |
| `grosig_croquis_90x70` | Croquis municipal: mapa + **panel estructurado** (simbología, claves, índice, advertencia); papel **90×70** |

Papeles canónicos: `dcarta_42x28` (plano localidad), `plotter_90x70` (croquis municipal), `plotter_90x60` (legacy marginalia), `plotter_90x120` (condensado / índice PLU).

### Tipografía y elementos (13 jul 2026)

Problema previo: fuentes fijas ~4–8 pt en plotter → “letras diminutas” y mucho vacío.

| Elemento | Comportamiento actual |
|----------|----------------------|
| Tira (`pdf/strip.py`) | `_strip_type()` escala título/sección/cuerpo/SIP/norte/QR según altura de franja |
| Leyenda lateral | Columna a **altura del mapa**; tipografía/swatches escalan con ancho; QR al pie del panel |
| Norte / escala | Cajas mayores en plotter; barra segmentada; texto ~9–14 pt |
| Títulos / pies / brand | Escala con ancho o alto del box |
| Etiquetas de mapa | ~7.5–12 pt según `page_width` |
| Iconos SIP en mapa | Tamaño relativo al ancho del marco |

---

## Capas y rendimiento (condensado)

En plantillas JSON, cada capa puede llevar:

```json
"limit": 1200,
"simplify": 40,
"optional": true
```

- `limit` — tope de features
- `simplify` — `ST_SimplifyPreserveTopology` en metros del CRS de mapa (UTM)
- `optional` — si falla la consulta, no tumba el producto

**1.12.40 (enfoque correcto):** recuperar tiempo **&lt;3 min** bajando costo de render/fetch
(sin hatch rural, sin `decoration` double/rail, sin `clip_geom` Python, filtro `cve_ent`,
tope de etiquetas 220, logs `layers/labels/render`). Timeouts Gunicorn/Nginx quedan
como red de seguridad (~300/360 s), no como “solución”.

**1.12.38–39:** bbox statewide + simplify; el 504 (~167 B HTML) era corte de proxy, no PDF vacío.

### PLR vs PLU (plano de localidad)

El portal expone un solo producto (`plano_localidad`). El motor elige plantilla según **ámbito** de la localidad:

| Perfil | Plantilla | Uso |
|--------|-----------|-----|
| **PLR** (rural) | `plano_localidad_rural.json` | Localidades rurales; preset **congelado** (líneas, SIL, etiquetas vialidad `nomvial (cvevial)`). Caso: `001/0143`. |
| **PLU** (urbana) 1 hoja | `plano_localidad_urbana.json` | Overview ciudad (p. ej. Chilpancingo `029/0001`); zoom a L+PE; trazos finos. **Congelado** sin `multipage`. |
| **PLU** multipágina | misma plantilla + `params.multipage: true` | Cartas de detalle ~1:7 500; tipografía y vialidad **propias** (no afectan 1 hoja). |
| **PLU** paquete | `multipage` + `package: "index_plotter"` | 1ª hoja plotter **90×120** (panorama + grilla) + N cartas **doble carta 42×28**. |

Router: [`services/__init__.py`](../../../../app_api/cartography_engine/services/__init__.py) → `_resolve_plano_localidad_template()`.

### Multipágina PLU (cartas de detalle) — v1.11.0

| Tema | Comportamiento |
|------|----------------|
| Activación | Opt-in: `params.multipage: true` (solo urbanas). Plantillas: `"multipage": false`. |
| Paquete plotter | Opt-in: `params.package: "index_plotter"` (o `assembly_sheet: true`). Atlas lo envía por defecto al marcar cartas detalle. |
| Escala cartas | Fija ~**1:7 500** (`detail_scale` en plantilla). Grilla siempre con frame **dcarta**. |
| Hoja índice (paquete) | Papel **90×120** landscape: panorama de toda la localidad + grilla numerada; tira «Índice · N cartas». |
| Cartas | **Doble carta 42×28**; sin cambiar simbología/etiquetas MP. |
| Encuadre overview | L+PE; colindantes **no** abren zoom. |
| Índice en tira (cartas) | Grilla + hatch en hoja activa + silueta L (`pdf/strip.py`). |
| Capas densas | Siguen filtradas por `cve_mun`+`cve_loc`; clip por tile al dibujar. |
| Tipografía (solo MP) | Manzana ~4.8; AGEB ~9.6 (×4); vialidad ~**2.7**. |
| Vialidad (solo MP) | Texto: **`tipovial` + espacio + `nomvial`**. 1 etiqueta al centro del trazo visible en la hoja; si es larga → 2; máx. **3**. Se omiten `nomvial = NINGUNO`. |
| Vialidad (PLR / PLU 1 hoja) | Sin cambio: `nomvial (cvevial)` + colisión/límites de plantilla. |
| Timeout | Nginx: `proxy_read_timeout 600s` en `/api/cartography/` ([`nginx/default.conf`](../../../../nginx/default.conf)). |
| Errores | Rural+MP → `MULTIPAGE_URBAN_ONLY`; SVG+MP → `MULTIPAGE_PDF_ONLY`. |
| Código | [`plu_multipage.py`](../../../../app_api/cartography_engine/plu_multipage.py), `_emit_plu_multipage`, capabilities `plu_multipage` + `plu_assembly_package`. |
| Portal | Checkbox «Cartas detalle» + selector Armado (paquete / cartas sueltas). |
| Smoke | `smoke_out/smoke_plu_multipage.bat` |

Ejemplo cartas sueltas:

```bash
curl -s -X POST http://localhost:850/api/cartography/generate \
  -H "Content-Type: application/json" \
  -d '{"template_id":"plano_localidad","format":"pdf","params":{"cve_mun":"029","cve_loc":"0001","cve_ent":"12","multipage":true}}' \
  --output smoke_out/plano_029_0001_mp.pdf --max-time 600
```

Ejemplo paquete (índice 90×120 + cartas):

```bash
curl -s -X POST http://localhost:850/api/cartography/generate \
  -H "Content-Type: application/json" \
  -d '{"template_id":"plano_localidad","format":"pdf","params":{"cve_mun":"029","cve_loc":"0001","cve_ent":"12","multipage":true,"package":"index_plotter"}}' \
  --output smoke_out/plano_029_0001_pkg.pdf --max-time 600
```

Sin `multipage` (o `false`) se mantiene el PDF de **1 hoja**.

---

## SIP (servicios puntuales)

Clasificación por palabras clave en `symbols/sip_icons.py` (iglesia, escuela, asistencia médica, palacio, mercado, cementerio, plaza, metro/tren, otro).

- Mapa: glifos vectoriales
- Tira del plano: columna **SERVICIOS** con la misma leyenda

---

## Logos institucionales

Config data-driven (plugin-friendly):

| Pieza | Rol |
|-------|-----|
| `assets/branding.json` | `brand_line`, `engine_line`, lista `logos`, `fallback_labels` |
| `assets/logos/` | PNG/JPG referidos por nombre en `branding.json` |
| `CARTOGRAPHY_BRANDING_FILE` | Override opcional de la ruta del JSON |

Actual (SEPLADER / CESIEG):

| Archivo | Uso |
|---------|-----|
| `seplader.png` | Tira / franja brand |
| `cesieg.png` | Tira / franja brand |

Si faltan archivos, la tira usa `fallback_labels` tipográficos.  
`scripts/make_logos.py` solo genera placeholders según `branding.json` (no crea marcas hardcodeadas).

**Recomendación:** PNG con **fondo transparente**. Las versiones con fondo negro se ven como bloque oscuro sobre la franja clara.

**Tratamiento al generar (Engine ≥ 1.12.76, `logo_processing.py`):** el original no se modifica. Tira y panel croquis/condensado usan solo el **logo principal** (`primary_logo`; si falta, el que contenga «cesieg» o el primero en uso) con fondo quitado y recorte; el encabezado de hojas usa todos los «en uso» tal cual. `logo_bg_mode`: `umbral` (histórico) o `bordes` (solo fondo conectado al borde). Caché invalidada por mtime/tamaño. Detalle: [`assets/logos/README.md`](../../../../app_api/cartography_engine/assets/logos/README.md).

```bash
cd app_api
python -m cartography_engine.scripts.make_logos
```

---

## UI del Visor (panel Cartografía)

Archivos:

- `htdocs/atlas_gro/js/cartographyClient.js`
- `htdocs/atlas_gro/js/cartographyBatch.js` (lote «Generar todas las localidades»: cola, carpeta / ZIP, estimación)
- estilos en `htdocs/atlas_gro/css/main.css` (`.cartography-ui*`)
- host: `#cartographyUiHost` / botón `#btnVisorCartography` en `index.html`
- wiring: `app.js` → `attachCartographyUi({ getCveMun, getNomgeo })`

### Comportamiento

1. Solo se muestra si `health` OK (`engine === "grosig-cartography"`).
2. Orden de productos: plano localidad → croquis GroSIG → condensado → croquis Atlas → atlas multipágina.
3. Muestra municipio seleccionado en el panel.
4. **Localidad:** lista desde `GET /api/visor/locs-atlas-labels?cve_mun=` (amanzanadas) + opción clave manual 4 dígitos.
5. Confirmación antes de condensado / atlas estatal (pueden tardar minutos).
6. Descarga con nombre y tamaño (KB/MB).
7. El panel se abre como **overlay** sobre el mapa (no desplaza el layout); ancho acotado (~22 rem).
8. Con «Cartas detalle»: selector **Armado** — paquete plotter 90×120 + cartas (default) o solo cartas doble carta.
9. **Ámbito** (Todos / Urbano / Rural, default Todos): filtra la lista de localidades. El ámbito sale de `marco.l` vía `GET /api/cartography/preview-territory?cve_mun=` (admin), la misma tabla con la que el motor elige plantilla urbana/rural (rural = empieza con «R»). Si esa consulta falla, no filtra. Con Urbano/Rural se ocultan localidades que no están en `marco.l` (no se podrían generar).
10. **Más opciones → Generar todas las localidades…** (`<details>` plegable): lote de planos sin cartas de detalle, respetando Ámbito y Formato.
    - Cola **en el navegador**: un `POST /api/cartography/generate` a la vez (`generateBlob`), así cada petición dura lo de un plano y no se tocan timeouts de Nginx/Gunicorn ni se acaparan workers.
    - Confirmación previa con conteo urbano/rural y tiempo estimado; promedios reales por ámbito en `localStorage` (`grosig.cartography.batchAvgSec`; defaults 25 s urbano / 12 s rural).
    - Guardado: carpeta con `showDirectoryPicker` (Chrome/Edge/Opera) o, si no existe, ZIP sin compresión armado en el navegador (`planos_localidad_{mun}[_urbanas|_rurales].zip`). Al cancelar, carpeta conserva lo guardado y ZIP descarga lo parcial.
    - Overlay con avance, tiempo restante y Cancelar (`AbortController`); aviso `beforeunload`. 429 → espera 15 s y reintenta (hasta 4); 401/403 detiene el lote; otros errores se anotan, se sigue y se escribe `_errores.txt`.

---

## Pruebas y smoke

| Qué | Cómo |
|-----|------|
| Unitarias | `cd app_api && python -m pytest cartography_engine/tests/test_engine.py -q` |
| Integración PostGIS | `CARTOGRAPHY_INTEGRATION=true` (+ CVE de prueba) |
| Smoke GroSIG | `cartography_engine/scripts/smoke_grosig.bat` → carpeta `smoke_out/` (cerrar Acrobat si el PDF queda en 0 bytes) |

Health rápido:

```bash
curl -s http://localhost:850/api/cartography/health
```

Generar plano (ejemplo):

```bash
curl -s -X POST http://localhost:850/api/cartography/generate ^
  -H "Content-Type: application/json" ^
  -d "{\"template_id\":\"plano_localidad\",\"format\":\"pdf\",\"params\":{\"cve_mun\":\"037\",\"cve_loc\":\"0001\",\"cve_ent\":\"12\"}}" ^
  --output plano.pdf
```

Tras cambios de código del engine: **reiniciar `api_backend`**. Tras cambios del panel: recarga dura del Visor (Ctrl+F5).

---

## Lo implementado / afinado el 13 jul 2026

Sesión orientada a **producto usable + formato de plano/croquis/condensado**.

### Portal (UI)

- Panel Cartografía: productos GroSIG primero, contexto municipal, selector de localidades amanzanadas, confirmaciones, tamaños de archivo legibles.
- Hint y opción de clave manual si la lista no carga.

### Calidad PDF / formato

- Tipografía de tira, leyenda, norte, escala, brand y etiquetas **escalada al plotter**.
- Leyenda lateral a **columna completa** (sin franja blanca vacía abajo).
- Condensado: `limit` + `simplify` por capa.
- Logos placeholder + glifos SIP un poco más legibles.
- QR en pie de panel de leyenda (productos marginalia) o en tira (plano localidad). → **retirado el 17 jul**.

### Tests añadidos / extendidos

- `test_condensado_simplify_limits`
- `test_grosig_marginalia_legend_full_column`
- `test_strip_type_scales_with_height`

---

## Cambios sep 2026 — Studio P14–P15 (Engine 1.12.81 → 1.12.87)

| Ver | Qué |
|-----|-----|
| **1.12.81–84** | P14: columna LÍMITES de la tira inferior como datos (`pdf/strip_symbology.py`), editable por plantilla en `layout.strip.simbologia`; sin la clave = salida histórica |
| **1.12.85** | P15 pasos 1–2: motor de etiquetas v2 (`label_placement_v2.py`) opt-in con `label_placement.engine = "v2"`; solo vialidades y `sil_*` a lo largo del trazo; nunca encima, omite si no cabe; cascada nombre+clave → 3.8 pt → solo nombre |
| **1.12.86** | P15 paso 3: recuadro de ampliación de la localidad (`pdf/locality_inset.py`, `layout.inset.enabled`); casillas en el Studio; plano rural sin óvalo duplicado del AGEB propio |
| **1.12.87** | Diagnóstico de la vista previa (`render_diagnostics.py`, encabezado `X-GroSIG-Render-Report`): calles con nombre y ampliación del recuadro en el Studio; logs de P15 en INFO |
| **1.12.87** (UI) | `GET /api/cartography/preview-territory` (municipios `mgn.municipios_a` / localidades `marco.l` con ámbito). Studio: combos Municipio/Localidad en el Preview, filtrados por ámbito de la plantilla. Visor: combo Ámbito y lote «Generar todas las localidades» (carpeta o ZIP) |

Solo `plano_localidad_rural` trae v2 + recuadro de fábrica; los demás productos no cambian. Detalle y contrato: `TEMPLATE_SCHEMA_V1.md` §P14–P15.

---

## Cambios 17–22 jul 2026

### Engine **1.12.x** (croquis municipal 90×70)

| Ver | Qué |
|-----|-----|
| **1.12.51** | Pipeline WKB homogeneizado: focos/extents, labels, near, SIP/CD/vialidad; timing logs en croquis y plano (sin tocar plantillas/simplify) |
| **1.12.43** | Condensado: panel lateral escalado; +++ estatal visible; urbanas completas; aeropuertos overlay; más hidrónimos |
| **1.12.42** | Condensado perf: WKB en `fetch_layer`, simplify por escala (~100–200 m), un `drawPath` por capa de líneas/MultiPolygon |
| **1.12.41** | Condensado reducido: perenne + límites mun/ent + carretera doble línea + loc. urbana + aeropuertos (sin rural/1–2 carril/FFCC) |
| **1.12.40** | Condensado: objetivo &lt;3 min — sin hatch/decoraciones caras; sin clip_geom; cve_ent; timing logs; timeouts safety 300/360 (no 900) |
| **1.12.39** | Condensado: Nginx/Gunicorn 900s + densidad plantilla bajada (evita 504 ~5 min); PDF 167 B era HTML 504 |
| **1.12.38** | Condensado: bbox estado en fetch; simplify/límites plantilla; UI tiempo realista; handoff CONTEXT_CONDENSADO |
| **1.12.37** | Croquis: AGEB mayor; escala ancha; leyenda Carretera×2; entidad `cve_ent`+nomgeo; límite estatal +++ |
| **1.12.36** | Panel: logo croquis con crop blanco+negro (ya no strip); huecos iguales entre 5 bloques; warn/fecha levantadas |
| **1.12.35** | Panel: logo más ancho/centrado y bajado del tope; menos hueco simbología↔claves; AGEB mayor; aire escala/norte; proyección multilínea |
| **1.12.34** | Panel: logo más grande/centrado; aire logo→título; ID centrado; líderes en CLAVES; escala centrada; fecha 2024 |
| **1.12.33** | Panel croquis: logo CESIEG con crop (como tira); advertencia abajo justificada; índice/escala/norte ampliados; ID destacado |
| **1.12.32** | Panel croquis: tipografía plotter + saltos tras secciones (sin solapes); logo ~140 pt |
| **1.12.31** | Localidades urbanas área: etiquetas 8.5; rurales sin cambio |
| **1.12.30** | Localidades área: etiqueta `cve_loc` + nombre Title Case en hasta 3 renglones proporcionales |
| **1.12.29** | Localidades punto: tipografía menor; reacomodo en anillos; omite solo si no hay hueco libre |
| **1.12.28** | Corrientes: menos etiquetas por nombre (espaciado + tope; dedupe foco/ctx) |
| **1.12.27** | Etiquetas: auto-colocación puntos/ríos; italic + Title Case en hidro |
| **1.12.26** | Ajuste visual croquis: AGEB bajo localidades; tipografía punto/AGEB/hidro; contorno loc `#B2B2B2` |
| **1.12.25** | Localidades área: `ambito` se clasifica en Python (SQL ya no vacía capas); simbología Urbana/Rural intacta |
| **1.12.24** | Simbología localidades área: Urbana/Rural por `ambito`; contorno sólido; hatch tira clipado |
| **1.12.23** | Localidades área: sin filtro `ambito` (foco urbana + `ctx_localidades_a`); restaura relleno amarillo |
| **1.12.22** | Localidades área: sin clip mun; dibujo post-AGEB; urbana/rural con simbología distinta (foco+ctx) |
| **1.12.21** | Croquis: `expand_bounds_to_frame_aspect` (sin letterbox); localidades área ctx sin filtro ambito |
| **1.12.20** | Rollback del clip SQL 1.12.19; ctx estable = margen `Difference(extent,foco)` + urbana/rural |
| **1.12.19** | (revertido) Clip/`ORDER BY` con `ST_Intersection` vaciaba ctx → bandas blancas |
| **1.12.18** | Ctx = margen `Difference(extent, foco)`; localidades área y carreteras sin filtros attr; foco desde BD |
| **1.12.17** | Ctx vecinos: quita localidades punto / FFCC / aeropuertos; deja área, carreteras, corrientes, cuerpos, límites |
| **1.12.16** | Ctx vecinos por **extent del mapa** (sin buffer/anillo): `ST_Intersects` marco + excluir interior del foco; `ORDER BY` al borde ante LIMIT; zoom intacto |
| **1.12.15** | Ctx: OR atributo no-foco + anillo espacial |
| **1.12.0** | Croquis GroSIG: papel `plotter_90x70`, preset `grosig_croquis_90x70`, panel lateral estructurado (`pdf/croquis_panel.py`), simbología urbana/rural/AGEB; PLU/PLR/condensado sin cambios |

### Engine **1.11.0** (paquete índice plotter)

| Ver | Qué |
|-----|-----|
| **1.11.0** | Paquete PLU: 1ª hoja `plotter_90x120` (panorama + grilla) + N cartas `dcarta_42x28`; `params.package=index_plotter`; PDF multi-pagesize; UI Armado |

### Engine **1.10.0 → 1.10.7** (PLU multipágina + vialidad detalle)

| Ver | Qué |
|-----|-----|
| **1.10.0** | Fase 3: grilla ~1:7 500, índice hatch, opt-in `multipage`, portal checkbox |
| **1.10.1** | Clip capas por tile + Nginx timeout 600s (evita HTTP 504 ~65s) |
| **1.10.2–1.10.5** | Calles en detalle: re-fetch amplio, reubicar en tile, sin tope SQL 2500, sin colisión que borre nombres |
| **1.10.6** | Por hoja: 1–3 etiquetas/calle; texto `tipovial` + `nomvial` (solo MP) |
| **1.10.7** | Tipografía vialidad detalle ~2.7 pt |

PLR y PLU overview **no** cambiaron su formato de calle ni tipografía fina.

### Otros (17 jul y previos)

- Branding data-driven: `assets/branding.json` + `branding.py` (SEPLADER / CESIEG).
- QR eliminado.
- Condensado: límites/simplify agresivos; papel `plotter_90x120` landscape.
- PLR D-Carta `dcarta_42x28`; caso `001/0143`.

---

## Pendiente / siguiente

1. Ajuste fino N/orden de cartas multipágina (opcional; no bloquea v1).
2. (Hecho en 1.11.0) PDF paquete índice plotter + cartas detalle.
3. SIL tipificado / glifos SIP.
4. Croquis municipal (handoff propio) y condensado (handoff [`CONTEXT_CONDENSADO_ESTATAL.md`](./CONTEXT_CONDENSADO_ESTATAL.md); paridad visual por bloques).
5. Logos PNG con fondo transparente si aún hay fondos opacos.
6. `GET /api/municipios` (BD CORE, `c_mun`) respondió HTTP 500 en este equipo (sep 2026). El Studio ya no depende de él (usa `preview-territory`), pero conviene revisar el log por si otras vistas del Visor lo usan.

---

## Decisiones que no hay que olvidar

1. **No mezclar** `DATABASE_URL` (Atlas) con `CARTOGRAPHY_DATABASE_URL`.
2. Producto “serio” = **3 módulos** (PCE / PCM / plano localidad), no paridad total ArcMap.
3. Cerrar visores PDF al regenerar el mismo nombre en `smoke_out/` (Windows bloquea → size 0).
4. Docker: preferir `build` y `up -d` en pasos separados si falla la cadena.
5. Cambios de tipografía/formato vialidad en **multipágina** no deben tocar PLR ni PLU 1 hoja.
6. Calles sin etiqueta en MP ≈ `nomvial = NINGUNO` en marco (sin nombre oficial INEGI).
7. Motor de etiquetas v2 y recuadro de ampliación son **opt-in por plantilla**; desmarcarlos en el Studio devuelve exactamente la salida anterior.

---

## Checklist rápido al retomar

- [ ] `docker compose ps` → `api_backend` / Nginx `:850` OK  
- [ ] `GET /api/cartography/health` → `enabled`, `version` ~1.12.51, `plu_multipage`, `plu_assembly_package`, `cartography_db.ok`  
- [ ] Visor: municipio → Cartografía → localidad; opcional «Cartas detalle» + Armado paquete  
- [ ] Regresión: PLR `001/0143` y PLU 1 hoja `029/0001` sin `multipage`  
- [ ] MP: `029/0001` + `multipage:true` → PDF N páginas  
- [ ] Paquete: `029/0001` + `multipage` + `package:index_plotter` → 1ª hoja 90×120 + cartas  
- [ ] Si se tocó Python del engine o `nginx/default.conf` → reinicio `api_backend` (+ `nginx_proxy` si timeout)
