# Apilado de capas temáticas (hover e identify)

Guía del **orden z** de las capas overlay del Visor geográfico: por qué un polígono puede “tapar” puntos al pasar el ratón, y cómo el motor lo resuelve de forma **data-driven** según `geometry` del catálogo.

**Alcance:** solo el **Visor geográfico** (`geo_visor`).

**Documentos relacionados:** [VISOR_CATALOG.md](./VISOR_CATALOG.md), [VISOR_LABELS_TOOLTIPS.md](./VISOR_LABELS_TOOLTIPS.md), [VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md), [VISOR_SYMBOLOGY.md](./VISOR_SYMBOLOGY.md).

---

## Problema que resuelve

MapLibre entrega eventos de **hover** y **clic** a la capa **más arriba** en el estilo. Si una capa de **polígono** (p. ej. Regiones) se activa después que una de **puntos** (p. ej. Localidades RNC), el polígono quedaba encima en el stack y capturaba el tooltip/identify aunque los iconos se vieran pintados encima en algunos casos.

**Síntoma:** con polígono + puntos activos, solo reacciona el polígono (ficha “Regiones”, no la localidad).

**Solución:** reordenar automáticamente las capas temáticas por tipo de geometría:

```
Abajo  →  Polígonos  (geometry: polygon)
Medio  →  Líneas     (geometry: line)
Arriba →  Puntos     (geometry: point, symbols, clusters)
```

Así hover e identify priorizan puntos sobre polígonos subyacentes.

---

## Origen data-driven

El orden se deriva del campo **`geometry`** de cada capa en `catalog.json` (`point`, `line`, `polygon`):

| `geometry` | Rank | Ejemplos |
|------------|------|----------|
| `polygon` | 0 (fondo) | Regiones, colonias relleno, manzanas |
| `line` | 1 | Vialidades, RNC troncal |
| `point` | 2 (frente) | CLUES, DENUE, localidades RNC (MVT / cluster) |

`visorStyleRegistry.js` copia `entry.geometry` al `OVERLAY_DEF` dinámico. Capas legacy sin el campo se infieren por `type` (`fill` → polígono, `symbol` → punto, etc.).

**No hace falta** configurar z-index manual en el catálogo ni en Visor Studio.

---

## Cuándo se reordena

La función `restackVisorOverlayLayersByGeometry(map)` (`js/map.js`) se invoca:

- Al sincronizar visibilidad de overlays (`syncOverlayLayersFromState`, `syncVisorOverlayLayersOnMap`)
- Tras activar una capa (`setLayerVisible` con `visible: true`)
- Tras cambiar handoff de clusters (`syncClusterHandoffVisibility`)

El restack opera en **dos fases** sobre capas **activas**: `applyThematicLayerStackOrder` coloca polígonos **debajo** de la primera capa punto/línea (`moveLayer(id, beforeId)`) y luego sube líneas/puntos/clusters. Si el orden sigue mal, `repairPointLayersBelowPolygons` lo corrige leyendo el índice real en el estilo MapLibre.

Dentro de cada grupo geométrico se conserva el **orden del registro** en el catálogo / `allOverlayDefs()`.

---

## Sub-capas por overlay

Dentro de un mismo overlay, el orden relativo se mantiene (abajo → arriba):

| Tipo | Orden típico |
|------|----------------|
| Polígono | `-fill` → `-outline` → `-halo` → línea → `-labels` |
| Línea | `-fill` (hit) → `-halo` → línea → `-labels` |
| Punto / cluster | clusters → contador → etiquetas → MVT → `-unclustered` (pick al frente) |

Las capas `-clusters` no participan en hover/identify (ver [VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md)). Tras el restack por geometría, `restackVisorOverlayPickLayers` sube **`-unclustered`** y **MVT** al tope del stack temático para que no queden tapados por polígonos ni por etiquetas del propio cluster.

El marco geoestadístico (entidad/municipios) se vuelve a colocar al frente con `bringMarcoEntToFront` después del restack.

---

## Flujo

```
catalog.json  geometry: polygon | line | point
        │
        ▼
visorStyleRegistry  →  def.geometry en OVERLAY_DEF
        │
        ▼
Usuario activa capas en panel
        │
        ▼
restackVisorOverlayLayersByGeometry
        │  sort by geometry rank
        │  moveLayer (abajo → arriba)
        │  restackVisorOverlayPickLayers (MVT + -unclustered al tope)
        │  repairPointLayersBelowPolygons (clusters bajo polígono → arriba)
        ▼
Hover / identify  →  capa superior = punto si hay pin encima
```

---

## Validación

1. Activar **Regiones** (polígono) y **Localidades RNC** (puntos con cluster).
2. Acercar a un pin que caiga sobre un polígono coloreado.
3. **Hover:** debe mostrar datos de la localidad, no solo “Regiones”.
4. **Identify (clic):** ficha de localidad si el pin está encima.
5. Desactivar puntos → hover vuelve al polígono con normalidad.

---

## Solución de problemas

| Síntoma | Revisar |
|---------|---------|
| Solo reacciona el polígono | ¿`geometry` correcto en catálogo? Ctrl+F5; togglear capas para forzar restack |
| Capa nueva sin `geometry` | Debe coincidir con `style_preset`; validación `[visor-style]` en consola |
| Cluster no responde sobre polígono | ¿Capa `-unclustered` visible? ¿Handlers enlazados tras cargar GeoJSON? Ver [VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md) |
| Línea tapa punto | Orden esperado: líneas debajo de puntos; si persiste, reportar preset mixto |

---

## Archivos del motor

| Archivo | Rol |
|---------|-----|
| `js/map.js` | `restackVisorOverlayLayersByGeometry`, ranks, integración en sync/visible |
| `js/visorStyleRegistry.js` | `def.geometry` desde catálogo |
| `js/mapOverlayTips.js` | Hover por capa (respeta orden MapLibre) |
| `js/visorMapIdentify.js` | Identify por clic |
| `config/visor/catalog.json` | Campo `geometry` por capa |

---

*Implementación: apilado automático polígono → línea → punto para hover/identify data-driven.*
