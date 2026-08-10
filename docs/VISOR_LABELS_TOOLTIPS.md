# Tooltips y etiquetas del Visor geográfico

Guía para configurar **desde el catálogo** la interacción al pasar el ratón y los **letreritos** que aparecen en el mapa según el zoom.

**Alcance:** solo el **Visor geográfico** (`geo_visor`). No aplica a Datos geográficos, explorador municipal ni Inventario de viviendas.

**Documentos relacionados:** [VISOR_CATALOG.md](./VISOR_CATALOG.md), [AGREGAR_CAPA.md](./AGREGAR_CAPA.md), [VISOR_SYMBOLOGY.md](./VISOR_SYMBOLOGY.md), [VISOR_LAYER_STACK.md](./VISOR_LAYER_STACK.md), [VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md).

---

## Dos mecanismos distintos

| Mecanismo | Qué ve el usuario | Cuándo aparece | Bloque en `catalog.json` |
|-----------|-------------------|----------------|--------------------------|
| **Hover (globo)** | Cuadro flotante al pasar el ratón | Solo con el cursor encima | `hover` (si falta → mismo que `identify`) |
| **Identify (ficha)** | Panel/ficha al hacer clic | Clic con herramienta identify | `identify` (o `tooltip`) |
| **Etiqueta en mapa** | Texto dibujado sobre el mapa | Capa activa y zoom ≥ `minzoom` | `labels` |

Hover e identify **pueden diferir**: use `hover` para un resumen y `identify` para la ficha completa. Sin `hover`, el globo replica identify (paridad con capas legacy).

```
catalog.json
    │
    ├─ identify  →  clic (ficha)
    ├─ hover     →  mouseenter (globo); si ausente = identify
    │
    └─ labels    →  visorLabelRegistry.js   →  capa ly-{overlay_key}-labels
```

Al abrir el visor, `visorLayers.js` ejecuta en orden: estilos → etiquetas → tooltips.

---

## Tooltips (globo al pasar el ratón)

### Opción A — `identify` + `hover` (recomendada)

`identify` alimenta la ficha al clic. Opcionalmente declare `hover` con menos campos:

```json
"identify": {
  "title": "Pozo de agua",
  "fields": [
    { "column": "nombre" },
    { "label": "Profundidad (m)", "column": "profundidad" },
    { "label": "Estado", "column": "estatus" }
  ]
},
"hover": {
  "title": "Pozo",
  "fields": [{ "column": "nombre" }]
}
```

Si **no** hay bloque `hover`, el globo usa el mismo HTML que identify.

**Variantes** (igual que en [AGREGAR_CAPA.md](./AGREGAR_CAPA.md)):

| Necesidad | Configuración |
|-----------|---------------|
| Un solo campo | `"fields": [{ "column": "nombre" }]` |
| Código + nombre | `"join": { "left": ["tipovial"], "right": ["nomvial"] }` |
| Plantilla fija (capas existentes) | `"template": "clues"` |
| DENUE | `"template": "denue", "title": "Farmacia"` |

### Opción B — `tooltip` (atajo simple)

Si no necesita ficha completa, basta un campo:

```json
"tooltip": {
  "title": "Pozo",
  "field": "nombre"
}
```

Equivalente a `identify` con un solo campo. Si existen **ambos**, gana `identify`.

### Desactivar tooltip

```json
"tooltip": { "enabled": false }
```

(Aunque exista `identify`, no habrá globo ni clic desde catálogo para esa capa.)

### Requisito Martin

Las columnas usadas en `fields`, `join` o `tooltip.field` deben publicarse en el **MVT** de Martin (igual que para identify y export).

### Capas con clusters (`style.cluster.enabled`)

En zoom **alejado** (por debajo del zoom de entrega del preset):

- **No** hay hover ni identify sobre los **círculos de agrupación**; el clic solo acerca el mapa.
- **Sí** hay hover e identify en **puntos sueltos** (capa `-unclustered`), con enriquecimiento async vía `/api/visor/feature-geometry` si faltan atributos en el GeoJSON.
- A partir del zoom de entrega, el comportamiento es el de una capa MVT normal.

Detalle completo: **[VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md)**.

### Apilado con polígonos u otras capas

Si hay **polígonos y puntos** activos a la vez, el visor reordena capas por `geometry` del catálogo (polígono abajo, punto arriba) para que hover e identify reaccionen al elemento visible encima. Ver **[VISOR_LAYER_STACK.md](./VISOR_LAYER_STACK.md)**.

### Capas nuevas (solo catálogo)

Cualquier capa con `renderer: "overlay"` y preset genérico obtiene tooltip automáticamente si define `identify` o `tooltip`. **No hace falta tocar `mapOverlayTips.js`.**

Las capas históricas (colonias, CLUES, RNC…) siguen teniendo plantillas en código; si el catálogo declara `identify`, el contenido data-driven **tiene prioridad** sobre el tooltip fijo.

---

## Etiquetas en mapa (letreritos por zoom)

Bloque `labels` en la entrada de la capa. El texto se muestra en la capa MapLibre `ly-{overlay_key}-labels` cuando:

1. La capa está **activa** en el panel.
2. El zoom del mapa es **≥ `minzoom`**.

### Ejemplo mínimo (punto o polígono)

```json
"labels": {
  "field": "nombre",
  "minzoom": 14
}
```

### Constructor de partes (Visor Studio / multilínea)

Preferido para capas nuevas. Si existe `parts`, tiene prioridad sobre `field` / `fields` / `join`:

```json
"labels": {
  "enabled": true,
  "parts": [
    { "type": "text", "value": "Localidad: " },
    { "type": "field", "column": "nom_loc" },
    { "type": "text", "value": "\n" },
    { "type": "field", "column": "poblacion" }
  ],
  "minzoom": 12,
  "color": "#2c3e50",
  "color_claro": "#2c3e50",
  "above_icon": true
}
```

Legacy con solo `field` / `fields` / `join` / `prefix` **sigue renderizando igual**.

### Ejemplo con estilo

```json
"labels": {
  "field": "nom_asen",
  "minzoom": 14,
  "color": "#2c3e50",
  "halo_color": "#ffffff",
  "size": 13
}
```

### Líneas (texto sobre el trazo)

```json
"geometry": "line",
"labels": {
  "field": "nombre",
  "placement": "line",
  "minzoom": 16,
  "color": "#004080"
}
```

### Dos columnas (tipo + nombre)

```json
"labels": {
  "join": {
    "left": ["tipovial"],
    "right": ["nomvial"],
    "separator": ": "
  },
  "minzoom": 15
}
```

### Varios campos concatenados

```json
"labels": {
  "fields": ["cve_zona", "nom_zona"],
  "minzoom": 14
}
```

### Prefijo (como hidrografía)

```json
"labels": {
  "prefix": "NOMBRE: ",
  "field": "nombre",
  "minzoom": 16
}
```

### Puntos con icono (texto arriba del símbolo)

```json
"labels": {
  "field": "nom_estab",
  "minzoom": 16,
  "above_icon": true,
  "color": "#1b5e20"
}
```

### Desactivar etiquetas

```json
"labels": { "enabled": false }
```

---

## Referencia `labels`

| Campo | Obligatorio | Default | Descripción |
|-------|-------------|---------|-------------|
| `parts` | Uno de parts / field / fields / join | — | Constructor visual: `text` / `field` / `newline` |
| `field` | | — | Columna principal (legacy; se conserva al publicar desde Studio) |
| `fields` | | — | Lista de columnas a concatenar |
| `join` | | — | `{ left: [], right: [], separator?: ": " }` |
| `prefix` | No | — | Texto fijo antes del valor |
| `minzoom` | No | 14 (punto/polígono), 16 (línea) | Zoom a partir del cual se ven las etiquetas |
| `color` | No | `#2c3e50` | Color del texto (tema oscuro) |
| `color_claro` | No | = `color` | Color en tema claro |
| `halo_color` | No | `#ffffff` | Halo del texto |
| `halo_width` | No | `2` | Grosor del halo |
| `size` | No | 13 (punto), 11 (línea) | Tamaño base del texto |
| `placement` | No | `point` o `line` según geometría | `symbol-placement` MapLibre |
| `above_icon` | No | `false` | Texto encima de iconos (puntos symbol) |
| `anchor` | No | `bottom` si `above_icon`, si no `center` | Ancla del texto |
| `max_width` | No | 20 | Ancho máximo en em |
| `allow_overlap` | No | `true` | Permitir solapamiento de etiquetas |
| `fallback` | No | `—` | Texto si el campo está vacío |

---

## Zoom mínimo de referencia (capas actuales en código)

| Capa | Zoom etiquetas |
|------|----------------|
| Localidades (punto / atlas) | 13 |
| Colonias, residuos, agua | 14 |
| CLUES, DENUE, corrientes | 16 |
| Cuerpos de agua | 13 |

Para capas nuevas, elija `minzoom` según densidad: valores altos (15–17) evitan saturar el mapa.

---

## Ejemplo completo (capa nueva)

```json
"pozos_agua": {
  "label": "Pozos de agua",
  "overlay_key": "pozosAgua",
  "geometry": "point",
  "renderer": "overlay",
  "style_preset": "point_default",
  "style": { "color": "#0288d1", "radius": 6 },
  "data": {
    "table": "c_pozos",
    "mun_filter": "cve_mun",
    "export_columns": ["gid", "cve_mun", "nombre", "profundidad"]
  },
  "tooltip": {
    "title": "Pozo",
    "field": "nombre"
  },
  "labels": {
    "field": "nombre",
    "minzoom": 15,
    "above_icon": true,
    "color": "#01579b"
  },
  "identify": {
    "title": "Pozo de agua",
    "fields": [
      { "column": "nombre" },
      { "label": "Profundidad (m)", "column": "profundidad" }
    ]
  },
  "capabilities": {
    "export": ["kml", "shp"],
    "spatial_analysis": true
  }
}
```

---

## Qué sigue en código (no solo catálogo)

| Caso | Motivo |
|------|--------|
| Colonias / localidades atlas con posicionamiento especial | `mapColoniasLabels.js`, `mapLocsAtlasLabels.js` |
| DENUE `label_color` en `style` | Sigue en `denueLayers.js` (equivalente a `labels` con `nom_estab`) |
| Hidrografía / curvas (visor compartido) | `VISOR_ONLY_LABEL_SPECS` en `map.js` |
| Plantillas `identify.template` nombradas | Comportamiento fijo reutilizable |

Si una capa **nueva** usa `overlay_key` ya reservado con etiquetas en código, verá warning `[visor-labels]` y debe omitir `labels` o usar otro `overlay_key`.

---

## Validación y pruebas

| Síntoma | Revisar |
|---------|---------|
| Sin globo al pasar ratón | ¿`identify` o `tooltip`? ¿Columna en MVT? Consola al cargar catálogo |
| Globo solo del polígono (no del punto encima) | Apilado por geometría — [VISOR_LAYER_STACK.md](./VISOR_LAYER_STACK.md); togglear capas o Ctrl+F5 |
| Globo en capa nueva no funciona | Recargar visor (Ctrl+F5); catálogo debe cargar antes de enlazar eventos |
| Sin letreritos | ¿Bloque `labels`? ¿Zoom ≥ `minzoom`? ¿Capa activa? |
| Todo muestra `—` | Nombre de columna (`field`) incorrecto o no publicada en Martin |
| Warning `[visor-labels]` | `overlay_key` duplicado con capa builtin |

**Checklist:** municipio seleccionado → activar capa → acercar zoom → ver etiquetas → pasar ratón → ver tooltip → clic (si identify activo en herramientas).

---

## Archivos del motor

| Archivo | Rol |
|---------|-----|
| `js/visorIdentifyCatalog.js` | `identify` / `tooltip` → HTML del globo |
| `js/visorLabelRegistry.js` | `labels` → capa symbol `-labels` |
| `js/mapOverlayTips.js` | Eventos hover y clic |
| `js/map.js` | Monta `ly-*-labels`, visibilidad por zoom |
| `js/visorLayers.js` | Inicialización al cargar catálogo |
