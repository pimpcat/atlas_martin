# Guía: crear un indicador nuevo

Guía práctica para publicar un indicador tabular en el Atlas Municipal **sin tocar código**. Todo se hace desde **Indicators Studio** y el catálogo data-driven.

Si solo quieres **redactar textos de apoyo** (resumen, fuente, notas), salta a [Metadatos](#metadatos-botón-en-el-atlas).

---

## Qué necesitas antes de empezar

1. **Sesión de administrador** (la misma que Visor Studio).
2. Los datos ya deben existir en PostgreSQL (`atlas.tab_municipal`, `atlas.tab_nacional` o `atlas.c_mun`).
3. Saber **qué columnas** usarás y cómo se llaman en la base.
4. Abrir el Studio: `indicators-studio.html` (desde el Atlas o la URL del sitio).

Tras publicar, recarga el Atlas con **Ctrl+F5** para ver el menú y la vista actualizados.

---

## En 5 minutos (resumen)

| Paso | Dónde | Qué haces |
|------|--------|-----------|
| 1 | Studio → **+ Nuevo** | Creas la ficha vacía |
| 2 | Formulario | Identidad, grupo, perfil y preset |
| 3 | Campos | Defines columnas (`key\|column\|label\|type`) |
| 4 | Metadatos | Redactas (o dejas el espacio listo) |
| 5 | **Publicar** | Guarda en `catalog.json` |
| 6 | Atlas | Ctrl+F5 y abres el indicador en el menú |

---

## Paso a paso

### 1. Entra a Indicators Studio

1. Abre `indicators-studio.html`.
2. Inicia sesión con tu usuario admin.
3. En la lista izquierda verás los indicadores actuales.

### 2. Pulsa **+ Nuevo**

Se abre el formulario vacío. Completa primero la **identidad**:

| Campo | Qué poner | Ejemplo |
|-------|-----------|---------|
| **id** | Identificador único, en minúsculas, con guiones bajos. **No se puede cambiar después de publicar.** | `eco_mi_indicador` |
| **Grupo** | Temática del menú lateral | Economía |
| **Habilitado** | `Sí` para que aparezca en el menú | Sí |
| **Etiqueta** | Nombre visible en el menú y en el título | Características económicas |
| **Subtítulo** | Texto breve bajo el título (opcional) | UE, empleo y producción bruta |
| **Unidad** | Unidad de medida (opcional) | %, personas, km² |

**Consejo:** el `id` suele ser `grupo_nombre_corto` (`socio_`, `viv_`, `eco_`, `gov_`).

### 3. Elige cómo se calculan los datos (perfil)

**Perfil de datos** define la forma de la respuesta de la API:

| Perfil | Cuándo usarlo |
|--------|----------------|
| `ranking_municipal` | Ranking de municipios (top / medio / bottom) |
| `ranking_with_national_state` | Ranking + filas de nacional y estatal |
| `ranking_with_states` | Ranking + comparación entre entidades |
| `national_state_municipio` | Solo nacional, estatal y municipio (sin ranking largo) |

**Handler (opcional):** déjalo en `(ninguno)` salvo que el equipo te indique uno especial (`analfabetismo`, `escolaridad`, `poblacion_ocupada`).

### 4. Elige cómo se ve (preset de presentación)

**Cómo se ve (preset)** es la plantilla visual. El Studio **solo muestra los campos que aplican** a ese preset (no verá `bar_metrics` en una tabla multi-columna).

| Preset | Qué arma desde el catálogo |
|--------|----------------------------|
| **Barras horizontales** (`horizontal_bars`) | N series (años/métricas); ranking top/seleccionado/bottom opcional |
| **Barras verticales** (`vertical_bars`) | Eje X = categorías; series Y = país / estado / municipio (a elegir) |
| Tabla multi-columna | Cada línea de **Campos** = una columna; ordenar ranking por una de ellas |
| Ranking con tasas | Barras + columnas de detalle |
| Barras entidad + tabla municipal | Entidades a la izquierda, municipios a la derecha |

Colores por serie y por tema (claro/oscuro) se configuran en el Studio y se guardan en `presentation.style.colors`.

### 5. Define el orden y las métricas

| Campo | Qué hace |
|-------|----------|
| **sort_by** | Clave del campo con el que se ordena el ranking (debe existir en **Campos**) |
| **bar_metrics** | Claves de métricas para barras, separadas por coma |
| **chart_metrics** | Igual, si el preset usa gráfica aparte |
| **Título de gráfica / Footer** | Textos opcionales en la vista y en export |

### 6. Tabla y campos

1. Elige la **tabla principal** (`tab_municipal`, `tab_nacional` o `c_mun`).
2. Opcional: **Cargar columnas de tabla** para ver nombres reales en la base.
3. En **Campos**, una línea por columna, con este formato:

```text
clave|columna_bd|Etiqueta visible|tipo
```

Tipos habituales: `integer`, `float`, `percent`, `text`.

Ejemplo:

```text
ue|ue|Unidades económicas|integer
pers_ocup|pers_ocup|Personal ocupado|integer
prod_brut|prod_brut|Producción bruta|float
```

La **clave** (primera parte) es la que usas en `sort_by` y `bar_metrics`.

4. **filename_prefix export:** nombre base de los archivos PNG/CSV/Excel (sin extensión).

### 7. Metadatos (recomendado)

Rellena el bloque ámbar **Metadatos** (ver sección siguiente). Aunque dejes textos vacíos, el botón ya aparece en el Atlas con un espacio listo para redacción.

### 8. Publicar

1. **Vista previa JSON** (opcional): revisa el objeto que se guardará.
2. **Publicar**: escribe en el catálogo del servidor.
3. Si hay error de validación, el Studio lo muestra; corrige y vuelve a publicar.
4. Abre el Atlas, **Ctrl+F5**, y busca el indicador en su grupo del menú.

### 9. Editar o eliminar después

- Clic en el indicador en la lista izquierda → editas → **Publicar**.
- **Eliminar** quita la entrada del catálogo (no borra datos de la base).

---

## Metadatos (botón en el Atlas)

En cada indicador tabular aparece un botón discreto **Metadatos** (píldora ámbar con punto animado) junto a PNG / CSV / Excel.

Al abrirlo se muestra un panel con:

| Sección | Campo en Studio / catálogo | Uso |
|---------|----------------------------|-----|
| Resumen | `metadata.summary` | 1–2 frases para el usuario |
| Descripción | `metadata.body` | Texto completo |
| Fuente | `metadata.source` | Citación oficial |
| Notas metodológicas | `metadata.notes` | Detalles técnicos |
| Actualización | `metadata.updated` | Periodo o fecha de los datos |

### Cómo redactarlos

**Desde Indicators Studio (recomendado)**

1. Abre el indicador.
2. Baja al bloque **Metadatos**.
3. **Mostrar botón:** `Sí` (o `No` para ocultarlo en ese indicador).
4. Completa título, resumen, descripción, fuente, notas y actualización.
5. **Publicar**.

**Desde el catálogo (avanzado)**

En `config/indicators/catalog.json`, dentro de cada indicador:

```json
"metadata": {
  "enabled": true,
  "title": "Características económicas",
  "summary": "",
  "body": "",
  "source": "INEGI. Censos Económicos…",
  "notes": "",
  "updated": "2024"
}
```

Los campos vacíos muestran un texto de ayuda en el panel (*Espacio para redacción…*) para que sepas qué falta.

### Buenas prácticas de redacción

- **Resumen:** qué mide el indicador, en lenguaje claro.
- **Descripción:** cobertura geográfica, años, definiciones importantes.
- **Fuente:** institución y producto estadístico (como en los footers INEGI).
- **Notas:** exclusiones, cambios metodológicos, interpretaciones a evitar.
- **Actualización:** año o corte de los datos mostrados.

---

## Checklist antes de dar por bueno un indicador

- [ ] El `id` es único y estable.
- [ ] Aparece en el menú del grupo correcto.
- [ ] Al elegir un municipio, la vista carga sin error.
- [ ] El ranking / tablas muestran las columnas esperadas.
- [ ] PNG, CSV y Excel descargan con el prefijo correcto.
- [ ] El botón **Metadatos** abre el panel (o está oculto a propósito).
- [ ] Textos de metadatos redactados o conscientemente pendientes.

---

## Problemas frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| No aparece en el menú | `Habilitado = Sí`, grupo correcto, Ctrl+F5 |
| Error al cargar datos | Nombres de columnas en **Campos**, perfil adecuado, datos en la tabla |
| Ranking vacío o raro | `sort_by` coincide con una **clave** de campos |
| No puedo publicar | Sesión admin activa; permisos de escritura del volumen `config/indicators` |
| No veo el botón Metadatos | `Mostrar botón = Sí` y recarga del Atlas |

---

## Dónde vive cada cosa (referencia rápida)

| Pieza | Ubicación |
|-------|-----------|
| Catálogo | `htdocs/atlas_gro/config/indicators/catalog.json` |
| Esquema (contrato) | `…/config/indicators/schema.json` → `$defs.metadata` |
| Presets visuales | `…/config/indicators/presentation_presets.json` |
| Wizard | `indicators-studio.html` + `js/indicatorsStudioApp.js` |
| Registro de actividad | Panel izquierdo del Studio · `GET /api/indicators/admin/audit` · tabla `atlas_admin.catalog_audit` |
| Shell del Atlas | `#dashboardIndicator` + botón `#btnIndicatorMetadata` |
| Lógica del panel | `js/indicatorShell.js` |

Documentación técnica del catálogo: [`INDICADORES_CATALOGO.md`](./INDICADORES_CATALOGO.md).
