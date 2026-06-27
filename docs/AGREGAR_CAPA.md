# Agregar capa al Visor geográfico

Guía **práctica** para cargar una capa nueva en el **Visor geográfico** del Atlas Municipal: desde el shapefile hasta verla en el mapa, identificarla, exportarla y (opcional) buscarla.

**Público:** personas que cargan datos (SIG/QGIS) y editan el catálogo. No hace falta ser programador para los casos marcados como **solo catálogo**.

**Documentos de apoyo:**

| Documento | Para qué |
|---------|----------|
| [VISOR_CATALOG.md](./VISOR_CATALOG.md) | Detalle técnico del catálogo |
| [VISOR_SYMBOLOGY.md](./VISOR_SYMBOLOGY.md) | Simbología y presets |
| [VISOR_SEARCH.md](./VISOR_SEARCH.md) | Buscador y campos obligatorios |
| [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md) | Globo al pasar ratón y letreritos por zoom |
| [VISOR_EXPORT.md](./VISOR_EXPORT.md) | Exportación KML y SHP |

---

## Antes de empezar: tres niveles de esfuerzo

| Nivel | Significado | Ejemplos |
|-------|-------------|----------|
| **Solo catálogo** | PostGIS + Martin + editar `catalog.json` | Polígono contorno/relleno simple, línea un color, punto círculo, **color por atributo**, **tooltip**, **etiquetas por zoom** |
| **Catálogo + código (una vez)** | Lo anterior + registro en `map.js` o iconos | Icono PNG/SVG, polígono estilo colonias (doble línea) |
| **Desarrollo a medida** | Lógica especial en mapa | RNC por zoom, uso de suelo con reglas de texto, curvas maestras |

En cada caso de esta guía se indica el nivel.

---

## Pasos comunes (todos los casos)

### 1. Cargar datos a PostGIS

Tabla en esquema `atlas`, nombre recomendado `c_mi_capa`.

| Campo | ¿Obligatorio? | Notas |
|-------|---------------|-------|
| `the_geom` | **Sí** | Geometría válida (en el stack actual, SRID **3857**) |
| `gid` | **Sí** | Entero único por fila |
| `cve_mun` | **Sí** | 3 dígitos (`001`, `012`…) para filtrar por municipio |

Ejemplo con QGIS o `ogr2ogr`:

```bash
ogr2ogr -f PostgreSQL "PG:host=localhost dbname=atlas user=..." mi_capa.shp \
  -nln c_mi_capa -lco SCHEMA=atlas -t_srs EPSG:3857
```

### 2. Publicar en Martin

- Con **auto_publish** en `martin.yaml` suele bastar.
- Si la tabla es grande o usa muchos atributos, añada bloque explícito con las columnas que usará identify, export y buscador.

### 3. Editar el catálogo

Archivo principal:

```
Stack_Martin/config/visor/catalog.json
```

Copia servida por Apache (sincronizar si no usa Docker):

```
htdocs/atlas_gro/config/visor/catalog.json
```

### 4. Poner la capa en un grupo del panel

En `groups`, añada el **id** de su capa al array `layers` del grupo que corresponda (o cree un grupo nuevo):

```json
{
  "id": "servicios",
  "label": "Servicios e instalaciones",
  "collapsed": false,
  "layers": ["clues", "mi_capa_nueva"]
}
```

| Campo de grupo | Uso |
|----------------|-----|
| `collapsed: true` | El grupo inicia plegado (útil para listas largas, ej. DENUE) |
| `collapsible: false` | Sin chevron; lista siempre visible |

### 5. Capacidades (export, tabular, análisis)

```json
"capabilities": {
  "export": ["kml", "shp"],
  "tabular": false,
  "spatial_analysis": true
}
```

| Campo | Efecto en el visor |
|-------|-------------------|
| `export: ["kml","shp"]` | Botones KML y SHP en el panel de capas |
| `tabular: true` | Tabla de atributos (útil en puntos DENUE, CLUES) |
| `spatial_analysis: true` | Disponible en herramientas de análisis espacial |

Para export, con `export.mode: "all"` **no** hace falta listar columnas; con `columns`, declare solo si necesita un subconjunto:

```json
"data": {
  "table": "c_mi_capa",
  "mun_filter": "cve_mun",
  "export": { "mode": "all" }
}
```

O lista explícita:

```json
"export": {
  "mode": "columns",
  "columns": ["gid", "cve_mun", "nombre", "tipo", "area_ha"]
}
```

### 5. Exportación KML / SHP

Active formatos en `capabilities.export` y configure atributos en `data`:

```json
"capabilities": {
  "export": ["kml", "shp"]
},
"data": {
  "table": "c_mi_capa",
  "mun_filter": "cve_mun",
  "export": { "mode": "all" }
}
```

| `export.mode` | Comportamiento |
|---------------|----------------|
| `"all"` (default) | **KML y SHP**: todas las columnas de la tabla excepto `the_geom` y geometrías |
| `"columns"` | Solo las columnas listadas en `columns` (o `columns_kml` / `columns_shp`) |

No hace falta `export_columns` salvo modo `columns`. Guía completa: [VISOR_EXPORT.md](./VISOR_EXPORT.md).

### 6. Probar y reiniciar

| Acción | Cuándo |
|--------|--------|
| Recargar visor (Ctrl+F5) | Siempre tras editar catálogo o JS |
| `docker restart fastapi_backend` | Tras cambios en API o si el buscador no refleja el catálogo |

**Checklist rápido:** municipio seleccionado → activar capa → se ve en mapa → clic identify → export KML/SHP → (si aplica) buscador.

---

## Identify: variaciones que puede usar

El bloque `identify` define la ficha al pasar el mouse y al hacer clic.

### A) Campos simples (el más usado)

```json
"identify": {
  "title": "Parcela",
  "fields": [
    { "column": "folio" },
    { "label": "Uso", "column": "uso_suelo" },
    { "label": "Superficie (ha)", "column": "area_ha" }
  ]
}
```

- `column` debe existir en la tabla **y** publicarse en Martin (MVT).
- `label` es opcional; si se omite, se muestra el nombre de la columna.

### B) Unir dos columnas (etiqueta compuesta)

Útil cuando el valor está en dos campos (código + descripción):

```json
"identify": {
  "title": "Vialidad",
  "join": { "left": ["tipovial"], "right": ["nomvial"] }
}
```

Muestra algo como: `Calle: Juárez`.

### C) Plantilla nombrada (comportamiento fijo en código)

```json
"identify": { "template": "denue", "title": "Farmacia" }
```

Plantillas disponibles hoy: `locs_punto`, `locs_atlas`, `colonias`, `manzanas`, `vialidades`, `rnc`, `clues`, `denue`, `uso_suelo`, `curvas_nivel`, etc.

Use plantilla solo si su capa **reutiliza** la misma lógica que una capa existente. Si no, use campos simples (A).

Para el **globo al pasar el ratón**, el bloque `identify` basta (mismo contenido que la ficha). Atajo opcional: `tooltip: { "field": "nombre" }`. Ver [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md).

### D) Solo visor (no en otros módulos)

```json
"identify_visor_only": true
```

---

## Buscador: con y sin búsqueda

### Sin buscador

No añada bloque `search` (o `"enabled": false`). La capa funciona igual en mapa, identify y export.

### Con buscador

Añada `search` a la capa. Requisitos: [VISOR_SEARCH.md — Requisitos obligatorios](./VISOR_SEARCH.md#requisitos-obligatorios).

**Puntos sin `cvegeo`** (la mayoría de capas propias):

```json
"search": {
  "enabled": true,
  "tipo": "Mi capa",
  "name_column": "nombre",
  "id_column": "gid",
  "geom_mode": "point",
  "scope": "municipio",
  "mun_filter": true,
  "mun_filter_cvegeo": false
}
```

**Polígonos del marco** (con `cvegeo`):

```json
"search": {
  "enabled": true,
  "tipo": "Zona",
  "name_column": "nom_zona",
  "id_column": "cvegeo",
  "geom_mode": "polygon",
  "scope": "both"
}
```

| `scope` | Cuándo aparece |
|---------|----------------|
| `municipio` | Solo con municipio seleccionado |
| `estatal` | Solo en visor de todo Guerrero |
| `both` | En ambos modos |

---

## Etiquetas en mapa (letreritos por zoom)

**Nivel:** solo catálogo  
Bloque `labels` — texto fijo en el mapa a partir de un zoom mínimo (sin pasar el ratón).

```json
"labels": {
  "field": "nombre",
  "minzoom": 14,
  "color": "#2c3e50"
}
```

Para líneas use `"placement": "line"`; para puntos con icono, `"above_icon": true`. Guía completa: [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md).

---

## Variables de atributo: ideas por geometría

Use estas columnas en **identify**, **export** y (si aplica) **search_columns**:

| Geometría | Columnas típicas | Ejemplos de uso |
|-----------|------------------|-----------------|
| **Polígono** | nombre, tipo, uso, superficie, fecha, estado, cvegeo, clave catastral | Parcelas, zonas, áreas protegidas |
| **Línea** | nombre, tipo_vial, longitud, material, estado, velocidad | Caminos, tuberías, ríos propios |
| **Punto** | nombre, categoría, dirección, teléfono, horario, capacidad | Equipamiento, incidentes, muestras |

El **color por atributo** en el mapa (valor de campo → color) **sí** se configura solo con catálogo usando los presets `*_by_attribute` (ver **Caso 6**). Halos, zoom por nivel o reglas de texto siguen requiriendo desarrollo.

---

# Caso 1 — Polígono solo contorno

**Nivel:** solo catálogo  
**Preset:** `polygon_outline`  
**Aspecto:** borde de color con halo claro (similar a colonias, pero sin relleno).

### Ejemplo: zonas reguladoras

**PostGIS:** `c_zonas_reg` — polígonos con `gid`, `cve_mun`, `the_geom`, `nom_zona`, `tipo_zona`.

```json
"zonas_regulatorias": {
  "label": "Zonas regulatorias",
  "overlay_key": "zonasReg",
  "checkbox_id": "visorZonasReg",
  "geometry": "polygon",
  "renderer": "overlay",
  "style_preset": "polygon_outline",
  "style": {
    "color": "#cc5500",
    "halo_color": "#ffffff",
    "width": 1.5,
    "halo_width": 3,
    "opacity": 0.95
  },
  "data": {
    "table": "c_zonas_reg",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun", "nom_zona", "tipo_zona"]
  },
  "identify": {
    "title": "Zona regulatoria",
    "fields": [
      { "column": "nom_zona" },
      { "label": "Tipo", "column": "tipo_zona" }
    ]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": false,
    "spatial_analysis": true
  }
}
```

### Parámetros de estilo (`style`)

| Campo | Efecto | Ejemplo |
|-------|--------|---------|
| `color` | Color del contorno | `#990000` |
| `halo_color` | Color del halo exterior | `#ffffff` |
| `width` | Grosor del contorno | `1.2` |
| `halo_width` | Grosor del halo | `2.5` |
| `opacity` | Opacidad del contorno | `0.95` |

### Variaciones de identify

| Necesidad | Configuración |
|-----------|---------------|
| Un solo nombre | `"fields": [{ "column": "nom_zona" }]` |
| Nombre + tipo | Ver ejemplo arriba |
| Código + descripción | `"join": { "left": ["cve_zona"], "right": ["nom_zona"] }` |

### Con buscador (opcional)

```json
"search": {
  "enabled": true,
  "tipo": "Zona regulatoria",
  "name_column": "nom_zona",
  "search_columns": ["nom_zona", "tipo_zona"],
  "id_column": "cvegeo",
  "geom_mode": "polygon",
  "scope": "municipio"
}
```

> Si no tiene `cvegeo`, use `gid` como `id_column` y `mun_filter_cvegeo: false`.

---

# Caso 2 — Polígono con contorno y relleno

Hay **dos caminos** según el aspecto que busque.

## 2A — Relleno con borde fino (solo catálogo)

**Preset:** `polygon_fill`  
**Aspecto:** área semitransparente con borde del mismo tono (como manzanas simplificado).

```json
"areas_verdes": {
  "label": "Áreas verdes",
  "overlay_key": "areasVerdes",
  "checkbox_id": "visorAreasVerdes",
  "geometry": "polygon",
  "renderer": "overlay",
  "style_preset": "polygon_fill",
  "style": {
    "color": "#a8d5a2",
    "opacity": 0.5,
    "outline_color": "#2d6a2e"
  },
  "data": {
    "table": "c_areas_verdes",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun", "nombre", "area_m2"]
  },
  "identify": {
    "title": "Área verde",
    "fields": [
      { "column": "nombre" },
      { "label": "Área (m²)", "column": "area_m2" }
    ]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": false,
    "spatial_analysis": true
  }
}
```

| Campo `style` | Efecto |
|---------------|--------|
| `color` | Relleno |
| `opacity` | Transparencia del relleno (0–1) |
| `outline_color` | Borde del polígono |

### Con buscador

```json
"search": {
  "enabled": true,
  "tipo": "Área verde",
  "name_column": "nombre",
  "id_column": "gid",
  "geom_mode": "polygon",
  "scope": "municipio",
  "mun_filter": true,
  "mun_filter_cvegeo": false
}
```

## 2B — Doble contorno + relleno para clic (estilo colonias/manzanas)

**Nivel:** catálogo + código (una vez)  
**Cuándo:** necesita el mismo comportamiento que **Colonias** (contorno doble, área clickeable).

1. En catálogo use `"style_preset": "colonias"` o `"manzanas"` como referencia visual.
2. Solicite a desarrollo una entrada en `map.js` (`OVERLAY_DEFS`) que apunte a su tabla reutilizando el paint de colonias o manzanas.
3. `overlay_key` **único** (no reutilizar `colonias`).

Identify y export siguen siendo **solo catálogo**.

---

# Caso 3 — Líneas

## 3A — Color único (solo catálogo)

**Preset:** `line_simple`

```json
"tuberias": {
  "label": "Red de tuberías",
  "overlay_key": "tuberias",
  "checkbox_id": "visorTuberias",
  "geometry": "line",
  "renderer": "overlay",
  "style_preset": "line_simple",
  "style": {
    "color": "#1565c0",
    "width": 2.5,
    "opacity": 0.9
  },
  "data": {
    "table": "c_tuberias",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun", "material", "diametro", "longitud"]
  },
  "identify": {
    "title": "Tubería",
    "fields": [
      { "label": "Material", "column": "material" },
      { "label": "Diámetro", "column": "diametro" },
      { "label": "Longitud", "column": "longitud" }
    ]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": false,
    "spatial_analysis": true
  }
}
```

| Campo `style` | Efecto |
|---------------|--------|
| `color` | Color de la línea |
| `width` | Grosor |
| `opacity` | Transparencia |

### Con buscador

Las líneas suelen buscarse por nombre:

```json
"search": {
  "enabled": true,
  "tipo": "Tubería",
  "name_column": "nombre",
  "search_columns": ["nombre", "material"],
  "id_column": "gid",
  "geom_mode": "point",
  "scope": "municipio",
  "mun_filter": true,
  "mun_filter_cvegeo": false
}
```

> `geom_mode: "point"` usa el **centroide** de la línea para el pin del buscador (comportamiento estándar para geometrías no puntuales).

### Variaciones identify

| Caso | Ejemplo |
|------|---------|
| Solo nombre | `"fields": [{ "column": "nombre" }]` |
| Tipo + nombre | `"join": { "left": ["tipo"], "right": ["nombre"] }` |
| Plantilla vialidad existente | `"template": "vialidades"` (solo si columnas compatibles) |

## 3B — Color según atributo (variable)

**Nivel:** solo catálogo  
**Preset:** `line_by_attribute`  
**Cuándo:** cada valor de una columna lleva un color distinto (ej. tipo 1 verde, tipo 2 amarillo).

Vea el **Caso 6** para el formato completo de `style.field` y `style.classes`. Ejemplo mínimo:

```json
"style_preset": "line_by_attribute",
"style": {
  "field": "tipo",
  "classes": [
    { "value": "1", "color": "#22c55e", "label": "Tipo 1" },
    { "value": "2", "color": "#eab308", "label": "Tipo 2" }
  ],
  "default_color": "#94a3b8",
  "width": 2.5
}
```

**Requisito:** la columna `tipo` debe publicarse en Martin (MVT). Sin halos ni filtros por zoom.

---

# Caso 4 — Puntos (círculo)

**Nivel:** solo catálogo  
**Preset:** `point_default`

```json
"pozos": {
  "label": "Pozos de agua",
  "overlay_key": "pozos",
  "checkbox_id": "visorPozos",
  "geometry": "point",
  "renderer": "overlay",
  "style_preset": "point_default",
  "style": {
    "color": "#0288d1",
    "radius": 6,
    "stroke_color": "#ffffff",
    "stroke_width": 1.5,
    "opacity": 0.95
  },
  "data": {
    "table": "c_pozos",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun", "nombre", "profundidad", "estado"]
  },
  "identify": {
    "title": "Pozo",
    "fields": [
      { "column": "nombre" },
      { "label": "Profundidad (m)", "column": "profundidad" },
      { "label": "Estado", "column": "estado" }
    ]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": true,
    "spatial_analysis": true
  }
}
```

### Parámetros de estilo

| Campo | Efecto | Valores típicos |
|-------|--------|-----------------|
| `color` | Relleno del círculo | `#0d9488`, `#e53935` |
| `radius` | Tamaño en píxeles | `4`–`10` |
| `stroke_color` | Borde | `#ffffff` |
| `stroke_width` | Grosor del borde | `1`–`2` |
| `opacity` | Transparencia | `0.85`–`1` |

### Variaciones de color por categoría (desarrollo)

Si cada `estado` debe tener color distinto (activo=verde, abandonado=gris), hoy requiere código (expresión `match` en MapLibre). Mientras tanto, use **un color único** o varias capas filtradas en PostGIS (una capa por categoría).

### Con buscador

```json
"search": {
  "enabled": true,
  "tipo": "Pozo",
  "name_column": "nombre",
  "search_columns": ["nombre", "estado"],
  "id_column": "gid",
  "geom_mode": "point",
  "scope": "municipio",
  "mun_filter": true,
  "mun_filter_cvegeo": false
}
```

### Sin buscador

Omita el bloque `search`. La capa sigue visible y exportable.

---

# Caso 5 — Puntos con icono (SVG, PNG, JPG)

**Nivel:** catálogo + código (icono una vez por tipo)  
**Mejor calidad:** preferir **SVG** (vector, sin pixelado al hacer zoom).

Raster (PNG/JPG) se cargan con **supersampling** en el mapa para reducir dientes de sierra; aun así SVG es la opción recomendada.

## 5A — Patrón DENUE (varias capas, mismo icono distinto)

Si sus puntos vienen de `c_denue` filtrados por actividad:

```json
"denue_farmacias": {
  "label": "Farmacias",
  "overlay_key": "denueFarmacias",
  "checkbox_id": "visorDenueFarmacias",
  "geometry": "point",
  "renderer": "overlay_denue",
  "data": {
    "table": "c_denue",
    "filter": { "codigo_act": [464112] },
    "gid_table": "c_denue",
    "mun_filter_cvegeo": false,
    "export_columns_kml": ["gid", "cve_mun", "nom_estab", "nombre_act", "localidad"]
  },
  "style": {
    "icon_key": "denueFarmacias",
    "label_color": "#1565c0",
    "tip_title": "Farmacia"
  },
  "identify": { "template": "denue", "title": "Farmacia" },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": true,
    "spatial_analysis": true
  },
  "search": {
    "enabled": true,
    "tipo": "Farmacia",
    "name_column": "nom_estab",
    "search_columns": ["nom_estab", "nombre_act", "localidad"],
    "id_column": "gid",
    "geom_mode": "point",
    "scope": "municipio",
    "mun_filter": true,
    "mun_filter_cvegeo": false
  }
}
```

**Desarrollo (una vez por icono nuevo):** SVG en `js/icons/`, registro en `mapDenueIcons.js`.

## 5B — Capa de puntos propia con icono

**Tabla propia** (`c_miradores`, etc.) + icono personalizado.

**Catálogo (metadatos):**

```json
"miradores": {
  "label": "Miradores",
  "overlay_key": "miradores",
  "checkbox_id": "visorMiradores",
  "geometry": "point",
  "renderer": "overlay",
  "style_preset": "miradores",
  "data": {
    "table": "c_miradores",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun", "nombre", "altura_m"]
  },
  "identify": {
    "title": "Mirador",
    "fields": [
      { "column": "nombre" },
      { "label": "Altura (m)", "column": "altura_m" }
    ]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": false,
    "spatial_analysis": true
  },
  "search": {
    "enabled": true,
    "tipo": "Mirador",
    "name_column": "nombre",
    "id_column": "gid",
    "geom_mode": "point",
    "scope": "municipio",
    "mun_filter": true,
    "mun_filter_cvegeo": false
  }
}
```

**Desarrollo (solicitar una vez):**

| Paso | Dónde |
|------|--------|
| Icono SVG (recomendado) o PNG alta resolución | `js/icons/mirador.svg` |
| Cargador de icono + tamaño según zoom | `js/mapMiradoresIcons.js` (patrón: `mapCluesIcons.js`) |
| Entrada symbol en mapa | `map.js` → `OVERLAY_DEFS` |
| Leyenda | `visorMapLegend.js` |

### Calidad del icono (buenas prácticas)

| Formato | Recomendación |
|---------|----------------|
| **SVG** | Preferido. Escala sin pixelado. Tamaño lógico ~32×32 px en el diseño |
| **PNG** | Mínimo 64×64 px, fondo transparente; el sistema rasteriza con supersampling |
| **JPG** | No recomendado (sin transparencia, artefactos en bordes) |

El tamaño en pantalla se controla con `icon-size` interpolado por zoom (ver iconos CLUES/DENUE). Pida a desarrollo ajustar si el icono se ve pequeño o grande.

### Identify con variaciones

| Necesidad | Solución |
|-----------|----------|
| Campos libres | `fields` en catálogo |
| Mismo formato que CLUES | `"template": "clues"` solo si columnas compatibles |
| Título distinto al label del panel | `"title"` dentro de `identify` |

---

# Caso 6 — Color por atributo (líneas, puntos o polígonos)

**Nivel:** solo catálogo  
**Presets:** `line_by_attribute`, `point_by_attribute`, `polygon_by_attribute`  
**Cuándo:** el usuario define en JSON qué color corresponde a cada valor de un campo (`campo=1` verde, `campo=2` amarillo, etc.).

No incluye halos, simplificación ni niveles de zoom (eso sigue siendo desarrollo a medida, como la RNC).

### Requisito en Martin

La columna usada en `style.field` **debe estar en el MVT** de Martin (igual que las columnas de identify). Si no se ve color o todo sale gris, revise que Martin publique ese atributo.

### Ejemplo: líneas por tipo

**PostGIS:** `c_caminos` con `gid`, `cve_mun`, `the_geom`, `tipo` (entero o texto), `nombre`.

```json
"caminos_tipo": {
  "label": "Caminos por tipo",
  "overlay_key": "caminosTipo",
  "checkbox_id": "visorCaminosTipo",
  "geometry": "line",
  "renderer": "overlay",
  "style_preset": "line_by_attribute",
  "style": {
    "field": "tipo",
    "classes": [
      { "value": 1, "color": "#22c55e", "label": "Empedrado" },
      { "value": 2, "color": "#eab308", "label": "Terracería" },
      { "value": 3, "color": "#78716c", "label": "Sin pavimentar" }
    ],
    "default_color": "#cbd5e1",
    "width": 2.5,
    "opacity": 0.9
  },
  "data": {
    "table": "c_caminos",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun", "tipo", "nombre"]
  },
  "identify": {
    "title": "Camino",
    "fields": [
      { "column": "nombre" },
      { "label": "Tipo", "column": "tipo" }
    ]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": false,
    "spatial_analysis": true
  }
}
```

### Puntos por categoría

Cambie `geometry` a `point` y `style_preset` a `point_by_attribute`:

```json
"style_preset": "point_by_attribute",
"style": {
  "field": "categoria",
  "classes": [
    { "value": "A", "color": "#0d9488", "label": "Categoría A" },
    { "value": "B", "color": "#ea580c", "label": "Categoría B" }
  ],
  "radius": 6,
  "stroke_color": "#ffffff"
}
```

### Polígonos por uso

Cambie `geometry` a `polygon` y `style_preset` a `polygon_by_attribute`:

```json
"style_preset": "polygon_by_attribute",
"style": {
  "field": "uso",
  "classes": [
    { "value": "habitacional", "color": "#fecaca", "label": "Habitacional" },
    { "value": "comercial", "color": "#bfdbfe", "label": "Comercial" }
  ],
  "opacity": 0.5,
  "outline_color": "#64748b"
}
```

### Campos de `style` (por atributo)

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `field` | **Sí** | Nombre de columna en MVT (`tipo`, `categoria`, `uso`…) |
| `classes` | **Sí** | Lista `{ "value", "color", "label"? }` — una entrada por valor a colorear |
| `default_color` | No | Color si el valor no está en `classes` (default `#94a3b8`) |
| `label` en cada clase | No | Texto en la leyenda; si falta, se usa `value` |

Además aplican los parámetros del preset base: `width`/`opacity` (líneas), `radius`/`stroke_*` (puntos), `opacity`/`outline_color` (polígonos).

### Valores numéricos vs texto

Los valores se comparan como **texto** (`1` y `"1"` equivalen). Use el mismo formato que tenga en PostGIS. Si un registro no coincide con ninguna clase, se usa `default_color`.

### Leyenda

La leyenda del visor se genera automáticamente desde `style.classes` (un ítem por clase).

---

## Resumen: qué preset usar

| Lo que necesita | `style_preset` | ¿Solo catálogo? |
|-----------------|----------------|-----------------|
| Polígono solo borde | `polygon_outline` | Sí |
| Polígono relleno + borde fino | `polygon_fill` | Sí |
| Polígono estilo colonias (doble línea) | `colonias` | No (código) |
| Línea un color | `line_simple` | Sí |
| Línea color por atributo | `line_by_attribute` | Sí |
| Punto círculo | `point_default` | Sí |
| Punto color por atributo | `point_by_attribute` | Sí |
| Polígono color por atributo | `polygon_by_attribute` | Sí |
| Punto icono | `clues` / DENUE / custom | No (icono + código) |
| Puntos DENUE por SCIAN | `overlay_denue` | Parcial (icono si es nuevo) |

---

## Plantilla mínima (copiar y adaptar)

```json
"mi_capa_id": {
  "label": "Nombre en el panel",
  "overlay_key": "miCapaCamelCase",
  "checkbox_id": "visorMiCapa",
  "geometry": "polygon|line|point",
  "renderer": "overlay",
  "style_preset": "polygon_outline|polygon_fill|line_simple|point_default",
  "style": { },
  "data": {
    "table": "c_mi_tabla",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun"]
  },
  "identify": {
    "title": "Título ficha",
    "fields": [{ "column": "nombre_columna" }]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "tabular": false,
    "spatial_analysis": true
  }
}
```

Añada `search` { ... } solo si necesita buscador.

---

## ¿RNC o colores por valor de campo solo con catálogo?

### Color por atributo (capas nuevas simples)

**Sí.** Use `line_by_attribute`, `point_by_attribute` o `polygon_by_attribute` con `style.field` y `style.classes` (ver **Caso 6**). Sin halos ni zoom.

### RNC (capa existente)

La RNC **sigue** siendo desarrollo a medida: además del color por `tipo_vial`, tiene tres niveles de detalle por zoom y export simplificado.

| Pieza | ¿Solo catálogo? | Dónde está |
|-------|-----------------|------------|
| Entrada en panel, export, identify | Sí | `catalog.json` |
| Color por `tipo_vial` | Podría migrarse a `line_by_attribute` | Hoy: `martinLayerStyle.js` |
| Tres niveles según zoom | No | `map.js` — `ensureRncOverlayLayers` |
| Export simplificado | No | `from_sql_preset: rnc_simplified` |

Una capa **nueva** de líneas con colores por tipo **no** necesita el patrón RNC: basta el Caso 6.

---

## Problemas frecuentes

| Síntoma | Revisar |
|---------|---------|
| No aparece en el panel | ¿Está el id en algún `groups[].layers`? ¿Sincronizó `catalog.json`? |
| No se ve en el mapa | Martin ¿publica la tabla? ¿`cve_mun` correcto? Consola `[visor-style]` |
| Todo un solo color (gris) en capa por atributo | ¿Martin publica la columna de `style.field`? ¿`classes` con `value` correcto? |
| Sin globo al pasar ratón | ¿`identify` o `tooltip`? [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md) |
| Sin letreritos en mapa | ¿Bloque `labels`? ¿Zoom ≥ `minzoom`? ¿Columna en MVT? |
| Identify vacío | ¿Columna en `identify.fields` existe en MVT? |
| Export falla | `capabilities.export`, `data.table`, `data.export`, reiniciar FastAPI — [VISOR_EXPORT.md](./VISOR_EXPORT.md) |
| Buscador sin resultados | [VISOR_SEARCH.md](./VISOR_SEARCH.md), `mun_filter_cvegeo`, reiniciar FastAPI |
| Icono pixelado | Usar SVG o PNG más grande; ajustar supersampling con desarrollo |

---

## Siguiente paso

1. Elija el caso (1–6) según geometría y aspecto.  
2. Prepare PostGIS con `gid`, `the_geom`, `cve_mun`.  
3. Copie el ejemplo JSON, ajuste nombres y colores.  
4. Añada la capa a un **grupo** del panel.  
5. Decida **con o sin buscador**.  
6. Pruebe en Acapulco u otro municipio con datos reales.

Para detalle técnico adicional: [VISOR_CATALOG.md](./VISOR_CATALOG.md), [VISOR_SYMBOLOGY.md](./VISOR_SYMBOLOGY.md), [VISOR_SEARCH.md](./VISOR_SEARCH.md), [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md).
