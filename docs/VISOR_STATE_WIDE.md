# Vista estatal del Visor geográfico

Guía del botón **Visor estatal** (vista de todo Guerrero): qué cambia en el mapa, cómo interactúa con capas **data-driven**, clusters y qué servicios **siguen filtrando por municipio**.

**Alcance:** solo el **Visor geográfico** (`geo_visor`). No aplica al explorador municipal (Inicio), Datos geográficos ni Inventario de viviendas.

**Documentos relacionados:** [VISOR_CATALOG.md](./VISOR_CATALOG.md), [VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md), [VISOR_SEARCH.md](./VISOR_SEARCH.md), [AGREGAR_CAPA.md](./AGREGAR_CAPA.md) (Caso **5C**).

---

## Resumen

| Modo | Filtro `cve_mun` en capas temáticas (MVT) | GeoJSON cluster (zoom alejado) | Municipio en explorador |
|------|-------------------------------------------|--------------------------------|-------------------------|
| **Municipal** (default) | Solo features del municipio activo | `GET …/points?cve_mun=…` | Resaltado / contorno del municipio |
| **Vista estatal** | Sin filtro municipal (`filter: null`) | `GET …/points?scope=estatal` | Se oculta contorno municipal; encuadre a Guerrero |

El municipio **sigue seleccionado** en el explorador (para tabular, export KML/SHP, etc.), pero las **capas del mapa temático** dejan de recortarse por `cve_mun` mientras la vista estatal esté activa.

---

## Interfaz

- Botón en la barra del panel **Capas** (icono de mapa / entidad), id `#visorStateWideToggleBtn`.
- Implementación: `js/visorStateWide.js` → `setVisorStateWideMode()` en `js/map.js`.
- Estado visual: clase `is-active` cuando está encendido.
- Hint bajo el zoom: *«Vista estatal de Guerrero — capas sin filtro municipal.»* (`visorMapUi.js`).
- Al activar: encuadre automático a Guerrero (`refitVisorStateWideView`).

**Activar capas sin municipio:** en modo municipal, marcar una capa sin `cve_mun` en el explorador la desmarca sola. En **vista estatal** sí se pueden activar capas aunque no haya municipio elegido (`visorLayers.js`).

---

## Comportamiento en capas temáticas (MVT)

Todas las capas overlay del catálogo (`renderer: "overlay"`) pasan por `syncOverlayLayersFromState()` y `applyOverlayLayerMunFilter()`:

```
Vista estatal ON  →  resolveVisorOverlayCve() devuelve null
                  →  map.setFilter(ly-*, null)  (sin cve_mun)
Vista estatal OFF →  filtro municipal habitual (munFilter)
```

**Excepciones:**

| Caso | Comportamiento |
|------|----------------|
| `data.mun_filter: false` en catálogo | La capa **nunca** filtra por municipio (`def.skipMunFilter`) |
| Capas cluster (`-clusters`, `-unclustered`, …) | Filtro MapLibre siempre `null`; el recorte es por **datos del GeoJSON** |
| RNC por niveles (`rncTiered`) | Reglas propias de tier + vista estatal en tramo `warm` |
| Etiquetas GeoJSON colonias / locsAtlas | Se **desactivan** en vista estatal (solo municipio) |

Capas **nuevas data-driven** heredan el comportamiento sin código extra: basta `mun_filter: "cve_mun"` (default) en el catálogo.

---

## Clusters y vista estatal

Las capas con `style.cluster.enabled` usan **dos fuentes** según el zoom (ver [VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md)):

| Zoom | Fuente | Vista municipal | Vista estatal |
|------|--------|-----------------|---------------|
| &lt; entrega (p. ej. &lt; 14) | GeoJSON cluster (API) | Puntos del municipio | **Todos** los puntos de la tabla* |
| ≥ entrega | MVT (Martin) | Filtrado por `cve_mun` | **Sin** filtro `cve_mun` |

\*Hasta **12 000** features en el GeoJSON (`MAX_FEATURES`). Si la entidad supera ese tope, la respuesta se trunca; al acercar (MVT) se ve el detalle completo.

### Flujo al conmutar vista estatal

```
Usuario pulsa «Visor estatal»
        │
        ▼
setVisorStateWideMode(true)
        │
        ├─ applyVisorStateWideChrome()     (marco entidad, sin contorno mun)
        ├─ syncOverlayLayersFromState()    (MVT sin filtro municipal)
        └─ refreshActiveClusterOverlayData()
                 │
                 └─ fetch …/points?scope=estatal
                    → src-cluster-{key}.setData(fc)
```

Al **desactivar** vista estatal se repite el flujo con `scope` municipal (`cve_mun` del explorador).

### API (clusters)

| Alcance | Petición |
|---------|----------|
| Municipal | `GET /api/visor/layers/{layer_id}/points?cve_mun=001` |
| Estatal (visor) | `GET /api/visor/layers/{layer_id}/points?scope=estatal` |

Backend: `fetch_layer_points_geojson(..., state_wide=True)` omite el `WHERE` municipal aunque la capa tenga `data.mun_filter` en el catálogo. El parámetro `scope=estatal` es **solo runtime del visor**, no se guarda en `catalog.json`.

---

## Qué no cambia con la vista estatal

| Función | Alcance |
|---------|---------|
| **Export KML / SHP** (botones del panel) | Sigue el **municipio del explorador** |
| **Consulta tabular** | Registros del **municipio activo** |
| **Análisis espacial** (polígono dibujado) | Según configuración de la herramienta |
| **Buscador geográfico** | Fuentes con `search.scope: estatal` o `both`; en estatal aparecen más fuentes — ver [VISOR_SEARCH.md](./VISOR_SEARCH.md) |
| **Selección en explorador** | El `cve_mun` elegido no se borra |

Para capas publicadas como **alcance estatal** en Visor Studio (`mun_filter: false`), el mapa ya mostraba todo el estado; la vista estatal no añade un segundo corte, pero **sí** alinea clusters GeoJSON con el mismo alcance.

---

## Catálogo vs. runtime

| Concepto | Dónde se define | Efecto |
|----------|-----------------|--------|
| Capa municipal | `data.mun_filter: "cve_mun"` (default) | Filtrada por municipio **salvo** vista estatal activa |
| Capa estatal | `data.mun_filter: false` | Sin filtro municipal **siempre** |
| Clusters | `style.cluster.enabled` | GeoJSON + MVT; vista estatal recarga GeoJSON con `scope=estatal` |
| Buscador estatal | `search.scope: "estatal"` \| `"both"` | Fuente visible en búsqueda con visor estatal |

No hace falta republicar la capa para usar vista estatal: es conmutación **en el cliente** + parámetro de API en clusters.

---

## Eventos y sincronización

| Evento | Cuándo | Suscriptores típicos |
|--------|--------|----------------------|
| `atlasgro-visor-statewide-change` | Tras cambiar modo | `visorStateWide.js`, `visorMapUi.js`, comparador de mapas |
| `atlasgro-visor-layers-panel-refresh` | Tras cambio estatal | Panel Capas |

Comparador de mapas INEGI: `scheduleVisorCompareSync()` replica visibilidad/filtros en la copia del visor.

---

## Archivos del motor

| Archivo | Rol |
|---------|-----|
| `js/visorStateWide.js` | Botón toggle, UI |
| `js/map.js` | `_visorStateWideMode`, `setVisorStateWideMode`, filtros MVT, `refreshActiveClusterOverlayData` |
| `js/visorClusterLayer.js` | `fetchClusterGeoJson` con `scope=estatal` |
| `js/visorLayers.js` | Activar capas sin municipio si estatal |
| `js/visorMapUi.js` | Hint «Vista estatal de Guerrero…» |
| `js/visorSearchCatalog.js` | Fuentes de búsqueda según `scope` |
| `js/mapCatalogPolygonLabels.js` | Etiquetas centroide con `stateWide` |
| `app_api/visor_cluster.py` | `state_wide` en consulta GeoJSON |
| `app_api/routers/api.py` | Query `scope=estatal` en `/points` |

---

## Validación y pruebas

**Checklist general**

1. Seleccionar municipio (p. ej. Acapulco) y activar una capa municipal densa (p. ej. **Localidades RNC**).
2. Confirmar que solo se ven datos de ese municipio.
3. Pulsar **Visor estatal** → encuadre Guerrero, hint estatal, capa muestra **todo el estado**.
4. Desactivar vista estatal → vuelve el recorte al municipio del paso 1.

**Checklist clusters (Caso 5C)**

1. Con capa RNC activa en zoom 9–13, anotar clusters del municipio.
2. Activar vista estatal → clusters deben **cambiar** (más puntos / distinta distribución).
3. Red: `GET /api/visor/layers/rnc_loc/points?scope=estatal` → `ok: true`, `featureCollection` poblada.
4. Desactivar estatal → petición con `cve_mun` del municipio activo.
5. Zoom ≥ 14 → MVT sin filtro en estatal; clusters GeoJSON ocultos (handoff normal).

**Tras cambios en backend:** `docker compose restart api_backend`.  
**Frontend:** Ctrl+F5.

---

## Solución de problemas

| Síntoma | Revisar |
|---------|---------|
| Clusters siguen mostrando solo el municipio anterior | ¿Vista estatal realmente activa (`is-active`)? ¿Respuesta API con `scope=estatal`? Reiniciar API si el endpoint no acepta `scope` |
| Capa MVT estatal OK pero clusters no | `refreshActiveClusterOverlayData` — desactivar/reactivar capa o togglear vista estatal |
| No puedo activar capa sin municipio | Normal en modo municipal; activar **Visor estatal** primero |
| Export / tabular muestran solo un municipio | Comportamiento esperado — no dependen del toggle estatal |
| Etiquetas colonias/locsAtlas desaparecen en estatal | Comportamiento esperado |
| GeoJSON estatal vacío o truncado | `NO_FEATURES` o límite 12 000; revisar logs `[visor-cluster]` |
| Error `MISSING_CVE_MUN` en `/points` | Falta `cve_mun` **y** no se envió `scope=estatal` |

---

## Referencia rápida para operadores

1. **Ver todo Guerrero en el mapa** → Visor estatal ON + activar capas deseadas.
2. **Volver al municipio de trabajo** → Visor estatal OFF (el explorador conserva la selección).
3. **Localidades RNC estatales con clusters** → Caso 5C en [AGREGAR_CAPA.md](./AGREGAR_CAPA.md) + esta guía.

---

*Implementación: toggle estatal en barra Capas, filtros MVT data-driven, recarga GeoJSON cluster con `scope=estatal`, coherente con capas publicadas desde catálogo / Visor Studio.*
