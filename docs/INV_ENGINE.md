# GroSIG INV Engine

Módulo plugin del **Inventario Nacional de Viviendas** (manzanas `atlas.c_inv`).

| Campo | Valor |
|-------|--------|
| Engine | `grosig-inv` |
| Flag | `INV_ENGINE_ENABLED` (default **true**) |
| Catálogo | `config/inv/catalog.json` (`INV_CATALOG_PATH`) |
| Health | `GET /api/inv/health` |
| Studio | `/atlas_gro/inv-studio.html` |
| Mapa runtime | `invViv.js` (GeoJSON bbox, zoom ≥ 14) |

## Qué hace

- Declara **grupos/secciones** del panel INV (orden, etiqueta).
- Declara **indicadores** ligados a columnas reales de `atlas.c_inv` (`field`, label, kind, render, color, icon, hover, enabled).
- Whitelist dinámica de `GET /api/inv/bbox` desde el catálogo (no hardcode).
- Hover: `hover_defaults` + indicadores `hover: true` de la **sección activa** (+ el seleccionado).
- Se enciende/apaga como Geography/Cartography: flag → mount → health → probe UI.

**Fuera de alcance 1.0:** Visor Catalog, Indicators Studio, `analysis_catalog`, MVT/Martin.

## Health

```json
{
  "engine": "grosig-inv",
  "version": "1.0.0",
  "enabled": true,
  "catalog_ok": true,
  "columns_count": 42,
  "catalog": { "ok": true, "path": "...", "indicators_count": 17 }
}
```

Si el flag es `false` o el router no monta, el probe (`invHealth.js`) oculta el ítem **Inventario de Viviendas** del menú.

## Catálogo (contrato)

```json
{
  "version": 1,
  "menu": {
    "id": "geo_inv_viv",
    "label": "Inventario de Viviendas",
    "subtitle": "INV 2020 · Manzanas",
    "enabled": true
  },
  "groups": [
    { "id": "poblacion", "label": "Población", "order": 1 }
  ],
  "indicators": [
    {
      "id": "pobtot",
      "field": "pobtot",
      "label": "Población total",
      "group_id": "poblacion",
      "enabled": true,
      "kind": "count",
      "render": "point",
      "color": "#66bb6a",
      "icon": "person",
      "hover": true
    }
  ],
  "hover_defaults": ["cvegeo", "ambito"]
}
```

- `render=polygon` solo con `kind=entorno`.
- Al publicar, cada `field` debe existir en `atlas.c_inv`.

## Tipos de valor (`kind`)

| Valor | Etiqueta en Studio | Qué hace |
|-------|--------------------|----------|
| `count` | Conteo / cantidad | Número por manzana (población, viviendas…). Etiqueta numérica. |
| `percent` | Porcentaje | Misma presentación numérica; use cuando la columna ya es %. |
| `grade` | Promedio / grado | Decimales (p. ej. escolaridad). |
| `entorno` | Entorno urbano | Códigos 1–9 → clase + color de polígono (`alumpub_c`, `recucall_c`). |

## Iconos del panel

Ids en `invVivIcons.js` (`INV_ICON_OPTIONS`): `person*`, `house*`, `entorno-alum`, `entorno-pav`. INV Studio ofrece desplegable + preview SVG.

## Sobre `character varying` en `c_inv`

INEGI suele cargar muchas columnas INV como **texto** aunque el contenido sea numérico (`"120"`, códigos `"1"`…`"9"`).

- El **bbox** no agrega (no hace SUM/AVG): solo lee el valor de cada manzana.
- El **front** convierte con `Number(...)` / `parseEntornoCode` al pintar etiquetas o clases de entorno.
- No hace falta que la columna sea `integer`/`numeric` en Postgres para que el mapa INV funcione; sí conviene no mezclar textos no numéricos en indicadores `count`/`grade`.

## API

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/api/inv/health` | público |
| GET | `/api/inv/catalog` | público |
| GET | `/api/inv/bbox` | público |
| GET | `/api/inv/admin/meta` | JWT admin |
| GET/PUT | `/api/inv/admin/catalog` | JWT admin |
| GET | `/api/inv/admin/columns` | JWT admin |

## Compose / env

```env
INV_ENGINE_ENABLED=true
INV_CATALOG_PATH=/config/inv/catalog.json
```

Compose monta `./config/inv:/config/inv` en `api_backend` (rw) y espejo ro en Apache bajo `atlas_gro/config/inv`.

Tras añadir el volumen por primera vez:

```bash
docker compose up -d api_backend web_apache
# o al menos recreate api_backend
docker compose restart api_backend
```

## Smoke checklist (cierre 1.0)

1. `GET /api/inv/health` → `engine=grosig-inv`, `catalog_ok=true`.
2. Menú Atlas muestra **Inventario de Viviendas**; panel lista Población / Viviendas / Entorno con colores de la semilla.
3. Zoom ≥ 14 + municipio: etiquetas/polígonos cargan vía bbox.
4. Hover muestra ámbito + campos de la sección activa.
5. INV Studio: publicar un campo extra existente en `c_inv` (p. ej. `vph_*` si existe) → aparece en panel/mapa tras recargar Atlas.
6. `INV_ENGINE_ENABLED=false` + restart API → health 404/no mount → menú INV desaparece; Visor y Geography no se afectan.

### Columnas reales de `c_inv` (correrlo en DBeaver)

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'atlas' AND table_name = 'c_inv'
ORDER BY ordinal_position;
```

Usar el listado para elegir campos nuevos en Studio (no inventar columnas).
