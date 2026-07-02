# Agrupación de puntos (clusters) en el Visor geográfico

Guía del **modo híbrido de clusters** para capas de **punto** con muchos elementos por municipio: círculos agrupados en zoom alejado, iconos en puntos sueltos y capa **MVT** completa al acercar.

**Alcance:** solo el **Visor geográfico** (`geo_visor`). No aplica a Datos geográficos, explorador municipal ni Inventario de viviendas.

**Documentos relacionados:** [VISOR_CATALOG.md](./VISOR_CATALOG.md), [VISOR_SYMBOLOGY.md](./VISOR_SYMBOLOGY.md), [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md), [VISOR_LAYER_STACK.md](./VISOR_LAYER_STACK.md), [VISOR_STATE_WIDE.md](./VISOR_STATE_WIDE.md), [AGREGAR_CAPA.md](./AGREGAR_CAPA.md) (Caso **5C**), [VISOR_STUDIO.md](./VISOR_STUDIO.md).

---

## Resumen

| Situación | Qué ve el usuario | Interacción |
|-----------|-------------------|-------------|
| Varios puntos cercanos (zoom alejado) | Círculo teal con número | Clic → acerca el mapa; **sin** hover ni identify |
| Punto suelto (zoom alejado) | Icono del catálogo (p. ej. pin naranja) | Hover e identify **completos** |
| Zoom ≥ entrega (`maxZoom` del preset) | Todos los puntos vía **MVT** | Hover e identify como capa overlay normal |
| **Vista estatal** activa | Clusters / MVT de **todo Guerrero** | Igual que arriba; ver [VISOR_STATE_WIDE.md](./VISOR_STATE_WIDE.md) |

MapLibre **solo agrupa fuentes GeoJSON** en el cliente. Por eso el visor usa un **GeoJSON** cargado desde la API (por municipio o por **vista estatal**) por debajo del zoom de entrega y la **capa MVT de Martin** a partir de ese zoom.

**Capa de referencia en producción:** `rnc_loc` (Localidades RNC), preset `point_symbol`, icono `locs_punto_pin`, preset de cluster `standard` (entrega en zoom **14**).

**Guía paso a paso (SIG / operador):** [AGREGAR_CAPA.md — Caso 5C](./AGREGAR_CAPA.md#5c--puntos-densos-con-clusters-agrupación).

---

## Modo híbrido (arquitectura)

```
PostGIS (c_* por municipio)
        │
        ├─ GET /api/visor/layers/{id}/points?cve_mun=…  (municipio)
        │       GET /api/visor/layers/{id}/points?scope=estatal  (vista estatal)
        │       → FeatureCollection GeoJSON (gid + columnas identify/labels)
        │       → src-cluster-{overlay_key}
        │              ├─ ly-{key}-clusters        (círculos)
        │              ├─ ly-{key}-cluster-count    (número)
        │              └─ ly-{key}-unclustered     (icono en hojas sueltas)
        │
        └─ Martin MVT (ly-{key})  ← visible solo desde zoom de entrega
               └─ ly-{key}-labels (etiquetas MVT, si hay bloque labels)
```

**Orden de pintado (de abajo a arriba):** MVT → sueltos symbol → clusters → contador → etiquetas.

---

## Comportamiento por zoom

Cada preset define `maxZoom` (**zoom de entrega**). Por debajo de ese valor rige el GeoJSON clusterizado; a partir de ahí, la capa MVT.

| Preset | `clusterRadius` | `maxZoom` (entrega) | `minPoints` |
|--------|-----------------|---------------------|-------------|
| `standard` (default) | 50 px | **14** | 2 |
| `compact` | 35 px | 15 | 2 |
| `wide` | 70 px | 13 | 2 |
| `sparse` | 45 px | 12 | 3 |

Constantes en frontend: `VISOR_CLUSTER_PRESETS` (`js/visorClusterLayer.js`).

### Por debajo del zoom de entrega

- **Clusters:** círculos teal escalados por `point_count` + número blanco.
- **Sueltos:** capa `-unclustered` tipo **symbol** con el mismo icono que la capa MVT (`style.icon_key`).
- **MVT (`ly-{key}`):** oculta (`visibility: none`).

### En o por encima del zoom de entrega

- **GeoJSON cluster:** oculto (clusters, contador y sueltos).
- **MVT:** visible con todos los puntos del tile.
- **Etiquetas:** si hay `labels`, pasan de `-labels-loose` (solo sueltos) a `-labels` (MVT).

El cambio se sincroniza en cada movimiento de zoom (`syncClusterHandoffVisibility` en `map.js`).

---

## Interacción (hover, identify, clic)

| Capa MapLibre | Hover | Identify (clic) | Clic extra |
|---------------|-------|-----------------|------------|
| `-clusters` | No | No | Sí — expande cluster (`getClusterExpansionZoom`) |
| `-cluster-count` | No | No | — |
| `-labels-loose` | No | No | — |
| `-unclustered` | Sí | Sí | — |
| `ly-{key}` (MVT) | Sí | Sí | — |

Las capas interactivas se resuelven con `overlayPickLayerIds()` → `clusterPickLayerIds()`: solo **`-unclustered`** y **MVT**. Las capas de agrupación se excluyen con `isClusterNonPickLayerId()`.

Con **polígonos u otras capas activas**, `restackVisorOverlayLayersByGeometry` apila en dos fases (polígonos → puntos/clusters completos) y `repairPointLayersBelowPolygons` corrige cualquier subcapa cluster (`-clusters`, contador, pins) que haya quedado bajo un polígono tras `addLayer` async. Los handlers de hover/identify se re-enlazan al crear `-unclustered` y al terminar de cargar el GeoJSON municipal.

### Identify y hover con datos completos

En zoom alejado, el GeoJSON puede traer pocas columnas en `properties` (p. ej. solo `nombre` si `data.export.columns` es mínimo). Para mostrar **todos los campos de `identify.fields`**:

1. **Backend:** el endpoint de puntos incluye siempre **`gid`** y resuelve contra PostGIS las columnas de `identify`, `labels` y export (`visor_cluster.py`).
2. **Identify (clic):** tras abrir el panel, el frontend llama `GET /api/visor/feature-geometry?layer_id=…&gid=…` y refresca la ficha (`visorMapIdentify.js`).
3. **Hover:** mismo enriquecimiento asíncrono al pasar el ratón (`mapOverlayTips.js` → `maybeEnrichHoverTip`).

Si un campo del catálogo no existe en la tabla (p. ej. `id_loc` en `c_rnc_loc`), seguirá mostrando `—` aunque el resto esté completo.

---

## Configuración en `catalog.json`

Solo capas con **`geometry: "point"`** y preset con icono (`point_symbol` u otro `symbol`).

```json
"style": {
  "opacity": 0.9,
  "icon_key": "locs_punto_pin",
  "cluster": {
    "enabled": true,
    "preset": "standard"
  }
}
```

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `cluster.enabled` | Sí | `true` activa el modo híbrido |
| `cluster.preset` | No | `standard` \| `compact` \| `wide` \| `sparse` |

El bloque vive dentro de `style` (no en la raíz de la capa). `visorStyleRegistry.js` lo copia a `OVERLAY_DEFS` dinámico como `def.cluster`.

### Requisitos de datos

| Requisito | Motivo |
|-----------|--------|
| `geometry: "point"` | Clusters solo en puntos |
| `gid` en PostGIS | Identify, enriquecimiento API y export |
| `cve_mun` (capas municipales) | Filtro del GeoJSON por municipio activo |
| Municipio seleccionado en el visor | Sin municipio, la capa no carga puntos cluster (**salvo vista estatal**) |
| Icono registrado (`style.icon_key`) | Sueltos y MVT usan el mismo símbolo |
| Tabla publicada en **Martin** | Capa MVT desde zoom de entrega |

### Identify y export

- Declare **`identify.fields`** con las columnas que debe ver el usuario.
- En **`data.export`**, incluya al menos `gid` y las columnas de identify si quiere coherencia en MVT y export KML/SHP.
- Al **publicar desde Visor Studio**, el asistente puede añadir automáticamente las columnas de identify a `export_columns`.

---

## Etiquetas con clusters

Si la capa tiene bloque `labels`:

| Zoom | Capa de etiquetas | Alcance |
|------|-------------------|---------|
| &lt; entrega | `ly-{key}-labels-loose` | Solo **puntos sueltos** del GeoJSON |
| ≥ entrega | `ly-{key}-labels` | Todos los puntos vía MVT |

Las columnas de texto necesarias se incluyen en el GeoJSON del cluster (backend). Ver [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md).

---

## Simbología y leyenda

En el panel **Simbología** (`visorMapLegend.js`):

- **Icono** del catálogo (elemento suelto / MVT).
- **Círculo teal** — «Grupo de puntos (cluster)» (solo si `style.cluster.enabled`).

Entrada generada en `buildGenericLegendForLayer` cuando `preset.type === "symbol"` y hay cluster activo (`visorStyleRegistry.js`).

---

## Visor Studio

En el paso **Mapa** del asistente de publicación (solo geometría **punto**):

- Casilla **Agrupar puntos (clusters)**.
- Selector de **preset** (`standard`, `compact`, `wide`, `sparse`).

Al publicar se escribe `style.cluster` en el catálogo. Si la capa tiene etiquetas, el asistente advierte que en zoom alejado solo se etiquetan sueltos.

Tras publicar o editar: **Ctrl+F5** en el visor y **desactivar/reactivar** la capa (recarga GeoJSON del municipio). Reinicie el **API** si cambió código Python en `visor_cluster.py`.

---

## API backend

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/visor/layers/{layer_id}/points?cve_mun=001` | FeatureCollection EPSG:4326 (municipio) |
| GET | `/api/visor/layers/{layer_id}/points?scope=estatal` | FeatureCollection sin filtro municipal (vista estatal) |

Implementación: `app_api/visor_cluster.py` → `fetch_layer_points_geojson`.

**Columnas del GeoJSON:** export configurado + columnas de `labels` + columnas de `identify.fields`, resueltas con `resolve_column` contra la tabla. Siempre incluye **`gid`**.

**Límite:** 12 000 puntos por petición (`MAX_FEATURES`) — por municipio o por alcance estatal. Si se alcanza, la respuesta se trunca y se registra warning en log.

**Errores habituales:**

| Código | Significado |
|--------|-------------|
| `MISSING_CVE_MUN` | No hay municipio y no se envió `scope=estatal` |
| `CLUSTER_DISABLED` | La capa no tiene `cluster.enabled` |
| `NOT_POINT_LAYER` | Geometría distinta de punto |
| `NO_FEATURES` | Sin puntos en el municipio |

Enriquecimiento puntual (identify/hover):

| GET | `/api/visor/feature-geometry?layer_id=rnc_loc&gid=123` |

Implementación: `app_api/visor_buffer.py` → `_fetch_identify_properties`.

---

## Ejemplo completo (`rnc_loc`)

```json
"rnc_loc": {
  "label": "Localidades RNC",
  "overlay_key": "rncLoc",
  "geometry": "point",
  "renderer": "overlay",
  "style_preset": "point_symbol",
  "data": {
    "table": "c_rnc_loc",
    "mun_filter": "cve_mun",
    "export": {
      "mode": "columns",
      "columns": ["nombre"]
    }
  },
  "style": {
    "opacity": 0.9,
    "icon_key": "locs_punto_pin",
    "cluster": {
      "enabled": true,
      "preset": "standard"
    }
  },
  "identify": {
    "title": "Localidad (RNC)",
    "fields": [
      { "column": "nombre", "label": "Nombre" },
      { "column": "tipo", "label": "Tipo" },
      { "column": "cvegeo", "label": "Clave geoestadística" },
      { "column": "cve_ent", "label": "Clave entidad" },
      { "column": "cve_mun", "label": "Clave municipio" },
      { "column": "cve_loc", "label": "Clave localidad" }
    ]
  },
  "labels": {
    "field": "nombre",
    "minzoom": 12,
    "above_icon": true,
    "color": "#2c3e50"
  }
}
```

A zoom **9–13**: clusters + pins sueltos; identify/hover completos en sueltos (vía GeoJSON + API). A zoom **≥ 14**: MVT con todos los puntos.

---

## Vista estatal del visor

Cuando el usuario activa **Visor estatal** (botón en la barra del panel Capas), las capas con clusters se comportan igual que el resto de overlays temáticos: **sin filtro `cve_mun` en MVT** y **GeoJSON recargado** para todo el estado.

| Componente | Modo municipal | Vista estatal |
|------------|----------------|---------------|
| MVT `ly-{key}` | `filter` por `cve_mun` | `filter: null` |
| GeoJSON cluster | `?cve_mun=001` | `?scope=estatal` |
| Recarga automática | Al cambiar municipio / activar capa | Al togglear vista estatal (`refreshActiveClusterOverlayData`) |

**Límite estatal:** el GeoJSON admite hasta **12 000** puntos por petición. Tablas más grandes (p. ej. todas las localidades RNC de Guerrero) pueden truncarse en zoom alejado; al superar el zoom de entrega, el **MVT** muestra el detalle completo sin ese tope.

Guía general de vista estatal (export, tabular, buscador, UI): **[VISOR_STATE_WIDE.md](./VISOR_STATE_WIDE.md)**.

---

## Capas MapLibre generadas

Para `overlay_key: "rncLoc"` → base `ly-rncLoc`:

| Id | Tipo | Fuente | Visible |
|----|------|--------|---------|
| `src-cluster-rncLoc` | geojson (cluster) | API puntos | — |
| `ly-rncLoc-clusters` | circle | cluster source | &lt; entrega |
| `ly-rncLoc-cluster-count` | symbol | cluster source | &lt; entrega |
| `ly-rncLoc-unclustered` | symbol (icono) | cluster source | &lt; entrega |
| `ly-rncLoc-labels-loose` | symbol (texto) | cluster source | &lt; entrega, si `labels` |
| `ly-rncLoc` | symbol (MVT) | Martin | ≥ entrega |
| `ly-rncLoc-labels` | symbol (texto) | Martin | ≥ entrega, si `labels` |

Capas legadas (`-hit`, `-loose-probe`) se eliminan al cargar (`purgeClusterLegacySubLayers`).

---

## Archivos del motor

| Archivo | Rol |
|---------|-----|
| `js/visorClusterLayer.js` | Fuente GeoJSON, capas cluster/sueltos, presets, fetch municipal/estatal |
| `js/map.js` | Handoff zoom MVT ↔ GeoJSON, vista estatal, `refreshActiveClusterOverlayData` |
| `js/visorStyleRegistry.js` | `def.cluster` desde catálogo; leyenda cluster + icono |
| `js/mapOverlayTips.js` | Hover/identify; enriquecimiento async; exclusión capas cluster |
| `js/visorMapIdentify.js` | Panel identify; fetch `feature-geometry` tras clic |
| `js/visorIdentifyCatalog.js` | HTML de identify desde catálogo |
| `js/visorCatalogAdmin.js` | UI clusters en Visor Studio |
| `js/visorStateWide.js` | Botón toggle vista estatal |
| `app_api/visor_cluster.py` | GeoJSON con columnas resueltas (municipio o estatal) |
| `app_api/visor_buffer.py` | Atributos identify por `gid` |
| `app_api/routers/api.py` | Ruta `GET …/layers/{id}/points` |
| `app_api/visor_catalog_validate.py` | Validación de `style.cluster` al publicar |

---

## Validación y pruebas

**Checklist:**

1. Municipio seleccionado en el explorador.
2. Activar capa con cluster en el panel.
3. Zoom alejado → círculos con número; pins en puntos aislados.
4. Clic en cluster → mapa se acerca (no abre identify).
5. Hover / identify en pin suelto → campos de `identify` completos (puede tardar un instante el hover).
6. Zoom ≥ entrega → iconos MVT densos; clusters desaparecen.
7. Panel **Simbología** → icono + «Grupo de puntos (cluster)».
8. **Vista estatal:** togglear boton → clusters/MVT de todo Guerrero; togglear off → municipio activo.

**Tras cambios en backend:** reiniciar contenedor `api_backend`.  
**Tras cambios en catálogo o JS:** Ctrl+F5; desactivar y reactivar la capa (o conmutar vista estatal).

---

## Solución de problemas

| Síntoma | Revisar |
|---------|---------|
| Sin clusters (solo MVT o nada) | `cluster.enabled`, municipio o vista estatal, consola `[visor-cluster]`, `/points?cve_mun=` o `?scope=estatal` |
| Clusters del municipio previo en vista estatal | API sin `scope=estatal`; reiniciar backend; togglear vista estatal — ver [VISOR_STATE_WIDE.md](./VISOR_STATE_WIDE.md) |
| Clusters sin número | Glyphs MapLibre; `ensureClusterMapGlyphs` |
| Pin encima del círculo de cluster | Orden de capas: `orderClusterOverlayLayers` |
| Hover/identify en círculos teal | Debe estar corregido: solo `-unclustered` y MVT en `clusterPickLayerIds` |
| Hover/identify solo muestran nombre | ¿`gid` en GeoJSON? ¿API `feature-geometry`? Columnas en `identify.fields` vs PostGIS |
| Campos con `—` | Nombre de columna incorrecto o inexistente en tabla |
| Sin puntos sueltos visibles | ¿Icono cargado? `ensureVisorIconKeyOnMap`; preset `point_symbol` |
| Leyenda sin cluster | `style.cluster.enabled` + preset `symbol`; recargar visor |
| GeoJSON vacío | `NO_FEATURES`, filtro `cve_mun`, geometría nula |
| Truncado a 12 000 | Densidad extrema; valorar preset `sparse` o capa sin cluster |

---

## Limitaciones actuales

- Solo **puntos** y capas con filtro municipal en catálogo (`data.mun_filter` / `cve_mun`).
- En **vista estatal**, el GeoJSON cluster omite el filtro municipal (igual que el MVT); puede truncarse a 12 000 features.
- Agrupación **client-side** (MapLibre); no sustituye análisis espacial agregado en servidor.
- El **identify en MVT** sigue dependiendo de `gid` en tiles; el enriquecimiento por API compensa atributos faltantes.

---

*Implementación: modo híbrido GeoJSON cluster + MVT, identify/hover en sueltos, entrega por preset, vista estatal con `scope=estatal`, Visor Studio y API.*
