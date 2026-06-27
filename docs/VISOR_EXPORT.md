# Exportación KML / SHP del Visor geográfico

Guía para configurar la descarga de capas desde el **Visor geográfico** usando solo el catálogo (`catalog.json`). El backend (`visor_export.py`) lee la misma configuración vía `visor_catalog_loader.py`.

**Alcance:** solo visor geográfico. Endpoint: `GET /api/visor/export?layer=<id>&format=kml|shp&cve_mun=001`.

**Documentos relacionados:** [AGREGAR_CAPA.md](./AGREGAR_CAPA.md), [VISOR_CATALOG.md](./VISOR_CATALOG.md).

---

## Resumen para el usuario final

| Formato | Comportamiento por defecto | Geometría en archivo |
|---------|---------------------------|----------------------|
| **SHP** (ZIP) | Todas las columnas de la tabla **excepto** geometría (`the_geom`, tipos geometry/geography) | WGS84 (EPSG:4326) en el ZIP |
| **KML** | Igual: **todos los atributos** de la tabla (sin geometría como columna) | WGS84 en cada Placemark |

No hace falta listar columnas una por una salvo que quiera un subconjunto.

---

## Activar botones en el panel

En la capa del catálogo:

```json
"capabilities": {
  "export": ["kml", "shp"],
  "tabular": false,
  "spatial_analysis": true
}
```

| Valor | Efecto |
|-------|--------|
| `["kml"]` | Solo botón KML |
| `["shp"]` | Solo botón SHP (descarga `.zip`) |
| `["kml", "shp"]` | Ambos |

El usuario debe tener **municipio seleccionado**; la exportación filtra por `cve_mun` (o `cvegeo` en capas del marco).

---

## Configuración data-driven (`data.export`)

Bloque dentro de `data` de cada capa.

### Modo automático (recomendado)

Omita `export` o use:

```json
"data": {
  "table": "c_mi_capa",
  "mun_filter": "cve_mun",
  "export": { "mode": "all" }
}
```

**KML y SHP** incluyen todas las columnas publicadas en PostGIS, en orden de la tabla, **sin** `the_geom` ni columnas de tipo geometría/geography/bytea.

### Excluir columnas concretas

```json
"export": {
  "mode": "all",
  "exclude": ["campo_interno", "hash_revision"]
}
```

### Lista explícita de columnas

Cuando solo deben salir algunos campos (p. ej. datos sensibles):

```json
"export": {
  "mode": "columns",
  "columns": ["gid", "cve_mun", "nombre", "tipo"]
}
```

Listas distintas por formato (opcional):

```json
"export": {
  "mode": "columns",
  "columns_kml": ["gid", "nombre", "tipo"],
  "columns_shp": ["gid", "cve_mun", "nombre", "tipo", "area_ha"]
}
```

### Atajo de texto

```json
"export": "all"
```

equivale a `{ "mode": "all" }`.

---

## Ejemplo completo (capa nueva)

```json
"zonas_verde": {
  "label": "Zonas verdes",
  "overlay_key": "zonasVerde",
  "geometry": "polygon",
  "renderer": "overlay",
  "style_preset": "polygon_fill",
  "data": {
    "table": "c_zonas_verde",
    "mun_filter": "cve_mun",
    "export": { "mode": "all" }
  },
  "identify": {
    "title": "Zona verde",
    "fields": [{ "column": "nombre" }]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "spatial_analysis": true
  }
}
```

No necesita `export_columns`.

---

## Casos especiales

### DENUE (filtro `codigo_act`)

```json
"data": {
  "table": "c_denue",
  "filter": { "codigo_act": [468411] },
  "gid_table": "c_denue",
  "mun_filter_cvegeo": false,
  "export": { "mode": "all" }
}
```

La consulta usa un subquery `SELECT *`, pero las columnas se leen de `c_denue`. Con `export.mode: all` se exportan **todos** los atributos de la tabla (excepto geometría): `nom_estab`, `codigo_act`, `municipio`, `localidad`, etc.

### RNC (`from_sql_preset: rnc_simplified`)

La geometría exportada va simplificada. Atributos por defecto: `gid`, `cve_mun`, `tipo_vial` (los del SQL preset). Para ampliar, use `export.mode: columns` con la lista deseada.

### Tabla distinta para listar columnas

Si las columnas a exportar deben inferirse de otra tabla:

```json
"export_table": "c_otra_tabla"
```

Por defecto se usa `gid_table` o `table`.

---

## Compatibilidad (claves antiguas)

Siguen funcionando; el loader las convierte a `export`:

| Clave legacy | Equivalente |
|--------------|-------------|
| `export_columns` | `export.mode: "columns"` + `columns` (KML; también lista base) |
| `export_columns_kml` | `columns_kml` |
| `shp_all_table_columns: true` | `export.mode: "all"` |
| `export_exclude` | `export.exclude` |

Puede migrar capas antiguas eliminando listas largas y poniendo `"export": { "mode": "all" }`.

---

## Requisitos técnicos

| Requisito | Detalle |
|-----------|---------|
| PostGIS | Tabla con `the_geom` y `gid` |
| Filtro municipal | `cve_mun` en la tabla (o `mun_filter_cvegeo: false` en excepciones) |
| Límite | Máximo **12 000** features por exportación |
| KML en terreno | Líneas y polígonos usan `clampToGround` + `tessellate`; `MultiLineString` se descompone como en SHP |
| Reinicio API | Tras cambiar `catalog.json` en Docker: `docker restart fastapi_backend` (`@lru_cache` en el loader) |
| Sincronizar JSON | `config/visor/catalog.json` ↔ `htdocs/atlas_gro/config/visor/catalog.json` si no usa volumen Docker |

---

## Flujo

```
catalog.json (data.export, capabilities.export)
        ↓
visor_catalog_loader.py → layer_catalog()
        ↓
GET /api/visor/export
        ↓
visor_export.py → KML o ZIP SHP (WGS84)
```

El frontend (`visorExport.js`) solo envía `layer`, `format` y `cve_mun`; **no** lista columnas.

---

## Validación en el navegador

Al cargar el visor, `visorExportRegistry.js` emite warnings `[visor-export]` si:

- La capa tiene `capabilities.export` pero falta `data.table` / `from_sql_preset`
- `export.mode: "columns"` sin ninguna lista de columnas

---

## Problemas frecuentes

| Síntoma | Revisar |
|---------|---------|
| Botones no aparecen | `capabilities.export` |
| «Capa no exportable» | Id de capa en URL = id del catálogo (`zonas_verde`, no `ly-zonas`) |
| «No hay elementos» | Municipio correcto, datos con `cve_mun` |
| «No se encontraron atributos» | `data.table` / `export_table` |
| Columnas faltan en KML/SHP | ¿`mode: columns` con lista corta? Pase a `mode: all` |
| Cambio en catálogo no aplica | Reiniciar `fastapi_backend` |

---

## Archivos

| Archivo | Rol |
|---------|-----|
| `app_api/visor_export.py` | SQL, KML, Shapefile |
| `app_api/visor_catalog_loader.py` | Parseo de `data.export` |
| `app_api/visor_layers.py` | `layer_config()` |
| `htdocs/atlas_gro/js/visorExport.js` | Descarga en el navegador |
| `htdocs/atlas_gro/js/visorExportRegistry.js` | Validación al cargar catálogo |
