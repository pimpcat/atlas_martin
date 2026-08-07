# GroSIG Geography Context

Módulo data-driven del apartado **Datos Geográficos** del Atlas.

| Campo | Valor |
|-------|--------|
| Engine | `grosig-geography-context` |
| Flag | `GEOGRAPHY_CONTEXT_ENABLED` (default **true**) |
| Catálogo | `config/geography/catalog.json` (`GEOGRAPHY_CATALOG_PATH`) |
| Health | `GET /api/geography-context/health` |
| Studio | `/atlas_gro/geography-studio.html` |

## Qué hace

- Declara **pestañas** (orden, etiqueta, enabled).
- Por pestaña: **tabla + campo** de texto narrativo y **capas Visor** a mostrar al activarla.
- Conserva el layout 50/50 (mapa municipal con geo-lock + panel) y el mini-mapa estatal.
- Se enciende/apaga como el Cartography Engine: flag → mount → health → probe UI.

## Health

```json
{
  "engine": "grosig-geography-context",
  "version": "1.0.0",
  "enabled": true,
  "capabilities": ["tabs", "macro_map", "detail_map", "visor_layers", "dynamic_text", "legend"],
  "catalog": { "ok": true, "path": "...", "tabs_count": 6 },
  "contexto_db": { "ok": true, "sample_table": "c_contexto" }
}
```

Si el flag es `false` o el router no monta, el probe del cliente oculta el ítem **Datos Geográficos** del menú (Visor e Inventario siguen).

## Catálogo (contrato)

```json
{
  "version": 1,
  "menu": {
    "id": "geo_datos_geo",
    "label": "Datos Geográficos",
    "subtitle": "…",
    "section_id": "geo",
    "section_label": "Geografía"
  },
  "layout": { "macro_map": true, "detail_map_lock": true },
  "defaults": {
    "key_column": "cve_mun",
    "ent_column": "ent",
    "ent_value": "12"
  },
  "tabs": [
    {
      "id": "relieve",
      "label": "Relieve",
      "enabled": true,
      "order": 30,
      "text": { "table": "c_contexto", "field": "relieve", "key_column": "cve_mun" },
      "layers": ["curvas_nivel"],
      "show_legend": true
    }
  ]
}
```

### Capas

Solo IDs de [`config/visor/catalog.json`](../../../config/visor/catalog.json):

- **Studio** (`managed: true`): publicadas vía Visor Studio.
- **Núcleo / legacy** (`managed: false`): presentes en el catálogo pero no editables en Visor Studio. Geography Studio **sí** puede seleccionarlas.

Capa añadida en la migración: **`clima`** (tabla Martin `clima`), grupo Medio físico, legacy/núcleo.

### Texto

No hay editor de contenido narrativo. El Studio solo elige **tabla** y **campo**; los valores viven en PostGIS (`atlas.c_contexto` en el seed).

## API

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/api/geography-context/health` | público |
| GET | `/api/geography-context/catalog` | público |
| GET | `/api/geography-context/contexto?cve_mun=` | público |
| GET | `/api/geography-context/contexto/all` | público |
| GET | `/api/geography-context/admin/meta` | JWT admin |
| GET/PUT | `/api/geography-context/admin/catalog` | JWT admin |
| GET | `/api/geography-context/admin/tables/{table}/columns` | JWT admin |

Aliases legacy `/api/geo/contexto` se mantienen en el router principal (datos fijos de `c_contexto`). El frontend preferente usa las rutas Geography Context.

## Frontend

- `geographyContextClient.js` — probe + carga de catálogo.
- `geoContext.js` — pestañas desde catálogo.
- `map.js` — `syncGeoThematicLayers(tab, cve, inGeo, layerIds)`.
- `geoMapLegend.js` — leyenda según `show_legend` + `layers`.
- `api.js` — menú Geografía condicionado al health.

## Docker / env

```env
GEOGRAPHY_CONTEXT_ENABLED=true
GEOGRAPHY_CATALOG_PATH=/config/geography/catalog.json
```

Compose monta `./config/geography:/config/geography` en `api_backend`.

## Geography Studio

URL: `/atlas_gro/geography-studio.html`

1. Login admin (misma JWT que Visor Studio).
2. Editar menú / mini-mapa.
3. Alta, baja, reorden de pestañas.
4. Por pestaña: tabla/campo texto + capas Visor + leyenda.
5. **Publicar catálogo** → escribe JSON + auditoría `replace_geography_catalog`.
6. Recargar el Atlas para ver cambios.

## Fuera de alcance (v1)

- CRUD de textos por municipio.
- Cambiar layout del mapa o basemap.
- Editar simbología de capas (sigue en Visor Studio, solo gestionadas).
