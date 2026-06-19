# Identificación por clic en el visor geográfico (map-on-click)

Documentación para desarrolladores: cómo funciona la ficha bajo el buscador al hacer clic en un elemento temático, el acercamiento al mapa, el resaltado temporal y cómo agregar o modificar los datos que muestra.

---

## Resumen

| Aspecto | Detalle |
|--------|---------|
| **Qué hace** | Al hacer clic en una feature visible del mapa, muestra una ficha fija **debajo del buscador** con la misma información que el tooltip al pasar el mouse, más coordenadas del clic y botón **Acercar al elemento**. |
| **Resaltado** | Solo al pulsar **Acercar al elemento** (no en el clic inicial). Polígonos, líneas y puntos symbol se resaltan con capas GeoJSON temporales (cyan). |
| **Dónde se ve** | Panel `.atlas-map-identify`, anclado bajo `.maplibregl-ctrl-geocoder`. |
| **Atributos (texto)** | **Cliente, sin HTTP extra**: vienen de las teselas Martin (PostGIS → MVT). Lo que no esté en la capa Martin **no** llegará al navegador. |
| **Geometría (resaltado/zoom)** | Si la feature tiene `gid`, se pide geometría completa a **`GET /api/visor/feature-geometry`** (PostGIS). Sin `gid`, se usa la geometría de la tesela. |
| **Activación** | Solo en el indicador **Visor geográfico** (`indicator.visor === true`). |
| **Cierre automático** | Si se **desactiva** en el panel lateral la capa del elemento identificado, el panel y el resaltado se cierran solos. |

---

## Archivos del sistema

| Archivo | Rol |
|---------|-----|
| [`js/mapOverlayTips.js`](../js/mapOverlayTips.js) | **Registro central** de capas (`TIP_DEFS`), funciones `*TipHtml(props)`, hover + clic por capa. Pasa `meta.layerId` y `meta.point` al handler de identificación. |
| [`js/visorMapIdentify.js`](../js/visorMapIdentify.js) | **Panel UI** (montaje, coordenadas, zoom, cerrar), precarga de geometría, cierre si la capa se apaga. |
| [`js/visorMapIdentifyHighlight.js`](../js/visorMapIdentifyHighlight.js) | **Resaltado temporal** (GeoJSON + capas fill/line/symbol/circle), caché y prefetch de geometría PostGIS. |
| [`js/visorBufferApi.js`](../js/visorBufferApi.js) | `fetchVisorFeatureGeometry()` — geometría completa desde PostGIS. |
| [`js/visorFeaturePickBuffer.js`](../js/visorFeaturePickBuffer.js) | `resolveVisorApiLayerId()`, `pickVisorFeatureGid()` — mapeo capa MapLibre ↔ API (compartido con buffer). |
| [`js/visorMapUi.js`](../js/visorMapUi.js) | `notifyVisorLayerToggled()` llama `dismissVisorMapIdentifyIfLayerHidden()`. |
| [`js/app.js`](../js/app.js) | `attachVisorMapIdentify()` / `teardown` al entrar o salir del visor. |
| [`js/visorGeocoder.js`](../js/visorGeocoder.js) | `getVisorGeocoderContainer()` — ancla del panel. |
| [`css/main.css`](../css/main.css) | Estilos `.atlas-map-identify` (bloque ~5485). |
| [`js/map.js`](../js/map.js) | Capas Martin, `OVERLAY_DEFS`, etiquetas `-labels`; `refreshOverlayTipBindings`. |
| [`js/martinLayerStyle.js`](../js/martinLayerStyle.js) | Tablas Martin, simbología. |
| [`js/denueLayers.js`](../js/denueLayers.js) | Patrón DENUE (`buildDenueTipDefs`). |
| [`martin.yaml`](../../martin.yaml) | Catálogo de capas PostGIS expuestas como MVT. |

---

## Flujo de datos (diagrama)

```
PostGIS (atlas.*)
    ↓
Martin (teselas .pbf → properties + geometría simplificada)
    ↓
MapLibre (capa ly-* visible)
    ↓
Clic en capa → mapOverlayTips.js (tipHtml + properties + meta)
    ↓
visorMapIdentify.js
    · Panel + coordenadas
    · prefetchIdentifyGeometry (POSTGIS en segundo plano)
    ↓
Botón «Acercar al elemento»
    · flyTo / fitMapToFeatures
    · showIdentifyHighlight (tesela al instante → refina con PostGIS)
```

**Atributos de la ficha:** solo MVT (sin fetch extra).  
**Resaltado y encuadre preciso:** PostGIS vía `/api/visor/feature-geometry` cuando existe `gid` en `properties`.

---

## Ciclo de vida (clic → panel → acercar → cerrar)

| Paso | Qué ocurre |
|------|------------|
| **1. Clic** | Se abre el panel. **No** hay resaltado. Se inicia `prefetchIdentifyGeometry` y `warmIdentifyHighlightLayers`. |
| **2. Acercar al elemento** | `flyTo` / `fitMapToFeatures` + resaltado cyan. Vista previa inmediata (tesela); si hay caché o prefetch listo, geometría PostGIS al instante. |
| **3. Cerrar (×)** | Panel oculto, resaltado quitado, selección reseteada. |
| **4. Desactivar capa** | `notifyVisorLayerToggled()` → `dismissVisorMapIdentifyIfLayerHidden()` cierra panel y resaltado. |
| **5. Nuevo clic** | Reemplaza la selección anterior; cancela prefetch/resaltado previos. |

---

## Resaltado temporal (`visorMapIdentifyHighlight.js`)

Fuente GeoJSON: `atlas-identify-highlight-src`.

| Geometría | Capas | Apariencia |
|-----------|-------|------------|
| **Polígono** | `fill` + contorno (`poly-line` / halo) | Relleno cyan semitransparente + borde |
| **Línea** | `line` + halo | Trazo cyan oscuro con halo claro |
| **Punto (symbol)** | `symbol` + `symbol-halo` | Mismo SVG que la capa origen (~10 % más grande) + halo; **debajo** de `-labels` para no tapar etiquetas |
| **Punto (sin symbol)** | `circle` | Círculo cyan (fallback) |

### Geometría fiel (PostGIS)

Las teselas MVT simplifican polígonos y líneas según el zoom. El resaltado:

1. Muestra **de inmediato** la geometría de la tesela (sin bloquear la UI).
2. Si hay `gid`, llama a `fetchVisorFeatureGeometry` y **refina** el resaltado.
3. **Precarga** al abrir el panel (`prefetchIdentifyGeometry`) para que «Acercar» sea más rápido.
4. **Caché en memoria** (hasta 48 entradas, clave `layer_id:gid`).

Mapeo capa → API: `resolveVisorApiLayerId()` en `visorFeaturePickBuffer.js` (mismo criterio que buffer por selección).

### Orden de capas (puntos con etiqueta)

Para capas `symbol` con etiquetas (`ly-*-labels`, `ly-*-visor-labels`), el resaltado se inserta **debajo** de la etiqueta (`stackHighlightLayers`), no encima del texto.

Polígonos y líneas se elevan al tope del estilo (por encima de capas temáticas).

### Limpieza

- `clearIdentifyHighlight()` — quita datos y cancela fetches en curso.
- `teardownIdentifyHighlight()` — al salir del visor; elimina capas, fuente y caché.

---

## Punto único de verdad: `TIP_DEFS`

Tanto el **hover** (globo flotante) como el **clic** (ficha bajo buscador) usan la **misma** función `tipHtml(properties)`.

Registro en `mapOverlayTips.js`:

```javascript
const TIP_DEFS = [
  { primary: "ly-locsPunto", tipHtml: locsPuntoTipHtml },
  { primary: "ly-clues", tipHtml: cluesTipHtml },
  { primary: "ly-hidro", tipHtml: hidroCorrienteTipHtml, visorOnly: true },
  ...buildDenueTipDefs(),
  // ...
];
```

| Campo | Significado |
|-------|-------------|
| `primary` | Id base MapLibre: `ly-{clave}` (ej. `ly-colonias`, `lyr_usosuelo` para uso de suelo). |
| `tipHtml` | `(props) => string` — HTML de la ficha. |
| `visorOnly` | Opcional. Si es `true`, hover/clic solo cuando el visor geográfico está activo (hidrografía, curvas, etc.). |

Al cambiar `coloniasTipHtml` (o cualquier `*TipHtml`), **cambian hover y clic a la vez**. No hace falta tocar `visorMapIdentify.js` para agregar campos de texto.

### Handler de clic (`bindLayerIdentifyClick`)

```javascript
_onIdentifyClick(map, e.lngLat, html, f, { layerId, point: e.point });
```

| Campo `meta` | Uso |
|--------------|-----|
| `layerId` | Capa MapLibre clicada (resaltado, prefetch, cierre por capa). |
| `point` | Pixel del clic (`queryRenderedFeatures` en contornos de polígono). |

---

## Helpers internos (`mapOverlayTips.js`)

### `featureProp(props, ...keys)`

Lee propiedades del MVT probando minúsculas y MAYÚSCULAS (PostGIS a veces devuelve `NOM_LOC`, a veces `nom_loc`):

```javascript
featureProp(props, "nom_loc", "NOM_LOC");
```

### `tipValue(props, ...keys)`

Igual que `featureProp`, pero escapa HTML y devuelve `"—"` si vacío.

### `overlayTipShell(title, bodyHtml)`

Plantilla estándar de la ficha:

```html
<div class="atlas-loc-tip">
  <div class="atlas-loc-tip__title">Título</div>
  <div class="atlas-loc-tip__body">…cuerpo…</div>
</div>
```

### `appendIdentifyCoords(tipHtml, lng, lat)`

Solo en **clic**: añade bloque `.atlas-loc-tip__coords` con Lat/Lon (6 decimales). Lo llama `visorMapIdentify.js`; no hace falta invocarlo en `tipHtml`.

---

## Cómo agregar más datos a una capa existente

### Paso 1 — Verificar que el campo existe en Martin

1. Tabla en PostGIS (`atlas.c_*`).
2. Capa listada en [`martin.yaml`](../../martin.yaml).
3. Tras cambios en BD/Martin: reiniciar Martin y recargar el visor.

Comprobar en consola del navegador (con capa activa):

```javascript
// Tras clic, en DevTools → capa ly-* → properties de la feature
```

### Paso 2 — Editar la función `*TipHtml` en `mapOverlayTips.js`

**Ejemplo:** localidades (`locsPuntoTipHtml`) — agregar población (`pob_total`):

```javascript
export function locsPuntoTipHtml(props) {
  const line = [featureProp(props, "cvegeo"), featureProp(props, "nom_loc")]
    .filter(Boolean)
    .join(" ");
  const pob = tipValue(props, "pob_total", "POB_TOTAL");
  const body = [
    escapeHtml(line || "—"),
    `Población: ${pob}`,
  ].join("<br>");
  return overlayTipShell("Localidad:", body);
}
```

Usa siempre `escapeHtml` / `tipValue` para texto libre; en el cuerpo puedes usar `<br>` entre líneas.

### Paso 3 — Probar

1. Recarga forzada (`Ctrl + Shift + R`).
2. Activa la capa en el panel **Capas**.
3. Clic en un elemento → ficha bajo el buscador (y hover debe coincidir).
4. **Acercar al elemento** → zoom + resaltado.

---

## Cómo registrar una capa nueva

Checklist completo:

### A) Capa en el mapa (`map.js` + `martinLayerStyle.js`)

1. Entrada en `MARTIN_TABLES` y `OVERLAY_DEFS` (tipo `symbol`, `line`, `fill`, etc.).
2. Id de capa MapLibre: `ly-{clave}` (convención del proyecto).
3. Panel del visor en [`js/visorLayers.js`](../js/visorLayers.js) si debe aparecer en **Capas**.
4. Tabla con columna **`gid`** (o `ogc_fid`) si se espera resaltado/zoom preciso vía PostGIS.

### B) Tooltip + clic (`mapOverlayTips.js`)

1. Crear función exportada, p. ej. `miCapaTipHtml(props)`.
2. Añadir a `TIP_DEFS`:

```javascript
{ primary: "ly-miCapa", tipHtml: miCapaTipHtml },
```

3. Si la capa usa sufijos (`-fill`, `-halo`, `-labels`), no hace falta registrarlos: `overlayLayerIds()` en `map.js` ya expande subcapas; `normalizeIdentifyPrimary()` en `visorMapIdentifyHighlight.js` resuelve el `primary`.

### C) Capa en API de geometría (resaltado fiel)

Si la capa es nueva para el visor, añadir el id en `resolveVisorApiLayerId()` (`visorFeaturePickBuffer.js`) y en el backend (`visor_buffer.py` / `layer_config`) para que `/api/visor/feature-geometry` la reconozca.

### D) Capas solo visor (hidro, curvas)

Añadir `visorOnly: true` en `TIP_DEFS`.

### E) Varias capas desde un array (patrón DENUE)

Ver [`js/denueLayers.js`](../js/denueLayers.js):

```javascript
export function buildDenueTipDefs() {
  return DENUE_LAYER_SPECS.map((spec) => ({
    primary: `ly-${spec.key}`,
    tipHtml: (props) => denueTipHtml(spec.tipTitle, props),
  }));
}
```

En `mapOverlayTips.js`: `...buildDenueTipDefs()` dentro de `TIP_DEFS`.

---

## Panel de clic (`visorMapIdentify.js`)

| Responsabilidad | Detalle |
|-----------------|---------|
| UI | Montaje bajo buscador, `appendIdentifyCoords`, botones **×** y **Acercar al elemento**. |
| Zoom | `fitMapToFeatures` / `flyTo` vía [`js/mapGeo.js`](../js/mapGeo.js). |
| Resaltado | Delegado a `showIdentifyHighlight` **solo** en `zoomToLastFeature`. |
| Prefetch | `prefetchLastFeatureGeometry` al abrir panel; actualiza `_lastFeature` con geometría PostGIS. |
| Cierre por capa | `dismissVisorMapIdentifyIfLayerHidden()` — comprueba estado del panel lateral (`getOverlayActive`, capas hidro/uso suelo, etc.). |

**No** dupliques lógica de campos de texto aquí; mantenla en `tipHtml`.

Exports públicos relevantes:

- `attachVisorMapIdentify` / `teardownVisorMapIdentify` / `refreshVisorMapIdentify`
- `setVisorMapIdentifyActive`
- `dismissVisorMapIdentifyIfLayerHidden`

---

## Estilos CSS

| Clase | Uso |
|-------|-----|
| `.atlas-map-identify` | Contenedor del panel bajo buscador |
| `.atlas-map-identify__content` | Donde se inyecta el HTML de `tipHtml` |
| `.atlas-loc-tip__title` | Título (dentro del content) |
| `.atlas-loc-tip__body` | Cuerpo |
| `.atlas-loc-tip__coords` | Lat/Lon (solo clic) |
| `.atlas-map-identify__zoom` | Botón acercar |

Hover flotante (distinto del panel): `.atlas-overlay-tip` en el mismo `main.css`.

Capas de resaltado MapLibre: prefijo `atlas-identify-highlight-*` (no requieren CSS adicional).

---

## Integración en `app.js`

Al entrar al visor geográfico (`attachMapViewerPlugins({ includeMapUi: true })`):

```javascript
setVisorMapIdentifyActive(() => isVisorIndicator(state.activeIndicator));
attachVisorMapIdentify();
```

Al salir: `teardownVisorMapIdentify()` y `setVisorMapIdentifyActive(() => false)`.

No suele hacer falta modificar `app.js` al agregar capas; basta con `TIP_DEFS` y la capa en el mapa.

---

## Cuándo NO responde el clic

| Condición | Motivo |
|-----------|--------|
| No estás en **Visor geográfico** | `_identifyActiveFn` devuelve false |
| Panel **buffer por selección** abierto | `isVisorFeaturePickBusy()` |
| **Mapbox Draw** en modo dibujo | `isDrawModeBlocking()` |
| Capa invisible o sin hit | Sin feature bajo el cursor |
| Campo vacío en MVT | Columna no publicada en Martin |

---

## Cuándo el resaltado usa solo tesela (sin PostGIS)

| Condición | Efecto |
|-----------|--------|
| Sin `gid` / `ogc_fid` en `properties` | Resaltado con geometría MVT (puede verse simplificado en polígonos) |
| Capa no mapeada en `resolveVisorApiLayerId` | Igual |
| Error de red en `/api/visor/feature-geometry` | Se mantiene la vista previa de tesela |

---

## Tráfico de red esperado

| Momento | Petición |
|---------|----------|
| **Clic en mapa (solo ficha)** | Ninguna (atributos del MVT). |
| **Tras clic (prefetch)** | Opcional: `GET /api/visor/feature-geometry?layer_id=…&gid=…` |
| **Acercar al elemento** | Misma URL si no estaba en caché; si el prefetch terminó, puede no haber petición nueva. |

Ver peticiones en DevTools → Network filtrando `feature-geometry`.

---

## Ejemplos rápidos por capa

| Capa | Función | Archivo |
|------|---------|---------|
| Localidades punto | `locsPuntoTipHtml` | `mapOverlayTips.js` |
| Localidades polígono | `locsAtlasTipHtml` | `mapOverlayTips.js` |
| Colonias | `coloniasTipHtml` | `mapOverlayTips.js` |
| CLUES | `cluesTipHtml` | `mapOverlayTips.js` |
| DENUE (varias) | `denueTipHtml` + `buildDenueTipDefs` | `denueLayers.js` |
| Uso de suelo | `usoSueloTipHtml` | `mapOverlayTips.js` |
| Manzanas (varios campos) | `manzanasTipHtml` | `mapOverlayTips.js` |

Referencia multilínea existente (`manzanasTipHtml`):

```javascript
export function manzanasTipHtml(props) {
  const body = [
    `Clave de manzana: ${tipValue(props, "cvegeo")}`,
    `Ambito: ${tipValue(props, "ambito", "ámbito")}`,
    `Tipo de manzana: ${tipValue(props, "tipomza")}`,
  ].join("<br>");
  return overlayTipShell("Manzana", body);
}
```

---

## Checklist al agregar un campo de BD

- [ ] Columna existe en PostGIS (`atlas.*`)
- [ ] Capa expuesta en `martin.yaml`
- [ ] Martin reiniciado si hubo cambio de esquema
- [ ] Función `*TipHtml` actualizada en `mapOverlayTips.js` (o módulo tipo `denueLayers.js`)
- [ ] Entrada en `TIP_DEFS` si es capa nueva
- [ ] Capa activable en visor (`map.js` / `visorLayers.js`)
- [ ] Prueba hover + clic + **Acercar** + recarga forzada del navegador

## Checklist al agregar capa con resaltado fiel

- [ ] Columna `gid` (u `ogc_fid`) en MVT
- [ ] Capa registrada en `resolveVisorApiLayerId()` y backend `layer_config`
- [ ] Prueba polígono/línea/punto según tipo de geometría
- [ ] Si es `symbol` con `-labels`, comprobar que la etiqueta queda legible sobre el resaltado

---

## Ubicación de esta documentación

```
Stack_Martin/htdocs/atlas_gro/docs/MAP_ON_CLICK.md
```

Ruta absoluta en este entorno:

`c:\Stack_Martin\htdocs\atlas_gro\docs\MAP_ON_CLICK.md`

---

## Preguntas frecuentes

**¿Puedo mostrar más atributos con otra llamada API al hacer clic?**  
El texto de la ficha sigue viniendo del MVT. Para atributos que no van en tesela habría que extender el handler en `visorMapIdentify.js` con un fetch adicional — fuera del patrón estándar documentado aquí.

**¿El resaltado puede mostrarse al clic, sin «Acercar»?**  
Hoy **no**: el diseño actual reserva el resaltado para el botón **Acercar al elemento** (decisión de UX).

**¿Por qué a veces veo el contorno un instante y luego se ajusta?**  
Primero se pinta la tesela (inmediato); cuando llega PostGIS se reemplaza por la geometría completa. Si el prefetch al abrir el panel terminó antes de pulsar Acercar, el ajuste suele ser imperceptible.

**¿El clic y el hover pueden mostrar cosas distintas?**  
Hoy comparten `tipHtml`. Para separarlos habría que añadir p. ej. `identifyHtml` en `TIP_DEFS` y ramificar en `bindLayerIdentifyClick`.

**¿Network vacío al solo clic es un error?**  
No para la **ficha** (MVT). Puede aparecer `feature-geometry` en segundo plano (prefetch) si hay `gid`; es normal.

**¿Resaltado naranja del buffer y cyan del identify?**  
Son sistemas distintos: buffer por selección (`visorFeaturePickBuffer.js`, naranja) vs. identify (`visorMapIdentifyHighlight.js`, cyan). No comparten fuente GeoJSON.
