# Administración del Visor geográfico (Visor Studio)

Guía operativa para publicar capas desde la UI sin editar `catalog.json` a mano.

## Acceso

- **Portal público:** sin login (`index.html`).
- **Login admin (ruta oculta):**  
  `http://localhost:850/atlas_gro/visor-studio.html`  
  (ajuste el puerto según `PORT_NGINX` en `.env`).

No hay enlace en el menú. Guarde la URL en favoritos.

Tras iniciar sesión, el token queda en `sessionStorage` y verá el botón **verde (+)** en la barra del panel **Capas**, junto al botón **Visor estatal** (vista de todo Guerrero sin filtro municipal en el mapa — ver **[VISOR_STATE_WIDE.md](./VISOR_STATE_WIDE.md)**).

En la misma página `visor-studio.html` puede **gestionar usuarios** y cambiar contraseñas. Guía completa: **[VISOR_STUDIO_CUENTAS.md](./VISOR_STUDIO_CUENTAS.md)**.

## Requisitos previos de una capa nueva

1. Tabla en PostGIS esquema `atlas` (convención `c_*`) **con geometría** (`the_geom` / `geom` / `geometry_columns`). Tablas sin geometría (p. ej. catálogos auxiliares) no aparecen en el wizard.
2. Campos mínimos: `gid`, `the_geom` (SRID 3857). Para capas **municipales**, incluir `cve_mun` (o `cvegeo`). Las capas **estatales** (sin `cve_mun`) deben publicarse con alcance **Estatal** (`mun_filter: false`).
3. Tabla visible en tiles Martin (`auto_publish` del esquema `atlas` + `reload_interval`). **No** hace falta reiniciar Martin al importar un SHP nuevo: el discovery automático la lista en ≤ ~30 s. En el wizard: **en Martin** = ya hay tiles; **pendiente Martin** = en PostGIS, discovery aún no la listó (~30 s).
4. La tabla **no** debe estar ya registrada en `catalog.json`.

## Puesta en marcha (una vez)

### 1. SQL (ya ejecutado)

Esquema `atlas_admin` con `users`, `catalog_audit`, `layer_publications`.

### 2. Variables en `.env`

```env
JWT_SECRET=<cadena larga aleatoria>
JWT_EXPIRE_HOURS=8
ATLAS_ADMIN_SCHEMA=atlas_admin
```

Generar secreto:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 3. Reconstruir API (nuevas dependencias)

```bash
docker compose build api_backend
docker compose up -d api_backend
```

### 4. Crear usuario admin

Desde el host, con acceso a la base (o dentro del contenedor):

```bash
cd app_api
python scripts/create_admin_user.py -u admin -d "Administrador Visor"
```

O dentro de Docker:

```bash
docker exec -it fastapi_backend python scripts/create_admin_user.py -u admin
```

### 5. Probar login

Abrir `visor-studio.html`, entrar, ir al Visor geográfico y comprobar el botón verde **+**.

## Publicar una capa (Fase 1–2)

1. Inicie sesión en `visor-studio.html`.
2. Abra **Visor geográfico**.
3. Clic en **+** (publicar) o en el **engranaje** (gestionar capas ya publicadas).
4. Asistente: tabla → datos → estilo → **identificación** (identify, etiquetas, búsqueda, **análisis espacial**) → revisar → **Publicar**.
5. **Ctrl+F5** si la capa no aparece de inmediato.

### Gestionar capas (Fase 2)

- Botón **engranaje** junto al **+** en la barra del panel Capas.
- Pestaña **Capas:** solo capas publicadas desde Visor Studio (`layer_publications`).
- **Editar:** cambia etiqueta, grupo, estilo, alcance territorial, columnas identify/export.
- **Despublicar:** quita la capa del `catalog.json` / panel del visor. **No** borra la tabla en PostGIS; vuelve a aparecer en el asistente **+** (paso Tabla) para republicarla.
- **Borrar tabla:** despublica **y** ejecuta `DROP TABLE` en PostGIS (con confirmación doble). Martin deja de listarla en ≤ `reload_interval` (~30 s). Las tablas del **núcleo del Atlas** (`c_mun`, `c_denue`, etc.) están protegidas.
- En el paso **Tabla** del asistente **+**, también puede **Eliminar tabla seleccionada de PostGIS** si ya está despublicada (huérfana).

Las capas del catálogo original (colonias, DENUE, etc.) **no** aparecen en el gestor.

### Gestionar grupos del panel Capas

- Pestaña **Grupos** en el mismo modal de gestión.
- **Crear:** nombre visible + id técnico opcional (si se omite, se genera en minúsculas con guiones bajos).
- **Renombrar:** cambia solo el texto del encabezado colapsable en el visor (el `id` no cambia).
- **Eliminar:** solo si el grupo **no tiene capas** asignadas. Los grupos integrados (Marco, DENUE, etc.) suelen tener capas y no se pueden borrar hasta vaciarlos — en la práctica no conviene eliminarlos.
- Al publicar o editar una capa, el desplegable **Grupo** incluye los grupos nuevos de inmediato tras crear uno.

Tras crear o eliminar un grupo, el panel **Capas** del visor se actualiza sin reiniciar Docker (recargue con **Ctrl+F5** si no ve el apartado nuevo).

### Paso identificación (columnas)

- **Título del popup:** texto en negrita (como colonias, DENUE, etc.).
- **Identificación:** marque columnas y edite la **etiqueta visible** (alias antes de los dos puntos).
- **Etiquetas en mapa:** active letreritos automáticos, elija campo y **zoom mínimo** (p. ej. 12–14 en puntos densos).
- **Buscador del visor:** marque **Incluir en buscador** para publicar el bloque `search` en `catalog.json` (campo nombre, tipo en resultados, columnas ILIKE). El alcance municipal/estatal sigue el de la capa.
- **Análisis espacial:** active para incluir la capa en la herramienta de polígono del visor. Elija **conteo** (puntos) o **agregación** (suma/promedio de columnas numéricas), tabla detalle opcional y textos de UI. Detalle en **[VISOR_SPATIAL_ANALYSIS.md](./VISOR_SPATIAL_ANALYSIS.md)**.
- **Exportación:** columnas en KML/SHP; si no marca ninguna, se exportan todas.

Tras guardar basta **Ctrl+F5** en el visor. Martin usa `auto_publish` del esquema `atlas` (todas las columnas en el MVT) y `reload_interval: 30s` para descubrir tablas nuevas **sin reiniciar** el contenedor. **No** hace falta reiniciar Martin al editar identify, etiquetas, estilo, ni al importar un SHP nuevo. Solo reinicie Martin si cambia `martin.yaml` o fuentes MBTiles.

El popup usa el mismo CSS que el resto del visor: título en negrita (`atlas-loc-tip__title`), etiquetas de campo en negrita (`atlas-loc-tip__lbl`).

Presets disponibles: punto círculo, punto con icono, **por atributo** (punto/línea/polígono), líneas y polígonos básicos.

## Fase 2 — API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/visor/admin/layers` | Capas gestionables |
| GET | `/api/visor/admin/layers/{id}` | Detalle para editar |
| PUT | `/api/visor/admin/layers/{id}` | Actualizar |
| DELETE | `/api/visor/admin/layers/{id}` | Despublicar |
| GET | `/api/visor/admin/groups` | Grupos del catálogo (con conteo de capas) |
| POST | `/api/visor/admin/groups` | Crear grupo vacío |
| PATCH | `/api/visor/admin/groups/{id}` | Renombrar grupo |
| DELETE | `/api/visor/admin/groups/{id}` | Eliminar grupo (solo si está vacío) |

## Fase 3 — simbología avanzada y DENUE

Implementado en Visor Studio (asistente paso **Estilo**):

- **Presets por atributo** (`point_by_attribute`, `line_by_attribute`, `polygon_by_attribute`): campo MVT + clases valor/color/leyenda.
- **Zoom mínimo de capa** (pestaña Básico del paso Estilo): escribe `style.minzoom` en el catálogo; debajo de ese zoom la geometría no se dibuja y el mapa muestra el aviso «Acerca el mapa a zoom N+ para ver …» (igual que **Manzanas**). Distinto de `labels.minzoom` (solo letreritos).
- **Vista previa** en canvas (sin MapLibre) al editar color o clases.
- **Aviso Martin** al elegir tabla nueva (`GET /api/visor/admin/tables/{tabla}/status`): si aún no está en tiles, ofrece **Reintentar detección** (`POST …/wait-martin`). El discovery es automático (`reload_interval`); no pide reiniciar el contenedor.
- **Plantillas DENUE** para tabla `c_denue`: códigos SCIAN, icono sugerido y popup con plantilla `denue`.
- **Subir shapefile** (paso 1, pestaña «Subir shapefile»): `.shp` o `.zip` → tabla `c_*` en PostGIS (`ogr2ogr`). El API espera a que Martin liste la tabla antes de devolver el resultado.
- **Icono SVG custom** (paso Estilo, preset «Punto con icono»): registra clave + `.svg` en `icons.json`. El asistente advierte si el SVG tiene trazo fino, viewBox desfavorable o formato Potrace.
- **Clusters** (paso **Mapa**, solo puntos): casilla «Agrupar puntos» + preset (`standard`, `compact`, `wide`, `sparse`); escribe `style.cluster` en el catálogo. Ver **[VISOR_CLUSTERS.md](./VISOR_CLUSTERS.md)**.

### Catálogo de iconos SVG (referencia)

Los iconos del visor viven en disco y se sirven por Apache (mismo origen que el portal):

| Ubicación | Ruta |
|-----------|------|
| **URL** (puerto según `.env`, p. ej. 850) | `http://localhost:850/atlas_gro/assets/icons/map/` |
| **En el proyecto (Stack_Martin)** | `htdocs/atlas_gro/assets/icons/map/` |
| **Registro (clave → archivo)** | `config/visor/icons.json` |

Iconos incluidos (entre otros): `locs-punto-pin`, `clues-health`, `denue-*`, `agua-*`, `residuo-*`, y los que registre desde Visor Studio.

Reutilizar: copie un `.svg` de esa carpeta, edítelo (viewBox 32×32, trazo grueso) y súbalo con otra clave, o selecciónelo en el desplegable si ya está en `icons.json`.

Tras importar SHP o tabla nueva: el API/wizard espera el discovery de Martin (`reload_interval`); use **Reintentar detección** si hace falta. Solo reinicie Martin si cambió `martin.yaml` o MBTiles. Tras icono custom: **Ctrl+F5** en el visor.

En el paso **Estilo**, con preset **por atributo**: al elegir el campo se consultan valores únicos en PostGIS; use **Autoclasificar** para generar clases valor/color/leyenda (editable después).

### Paso revisión — índices PostgreSQL

En el paso **Revisión**, el panel **Índices PostgreSQL** (informativo):

- Lista los índices que **ya existen** en la tabla PostGIS.
- Sugiere índices según la configuración (geom, `cve_mun`, filtros, búsqueda, análisis, etc.).
- Permite **crearlos en caliente** desde la UI (solo admin), sin pegar SQL a mano.
- El índice GIST en `the_geom` es el más importante para que el análisis espacial responda rápido.

Ver **[VISOR_SPATIAL_ANALYSIS.md](./VISOR_SPATIAL_ANALYSIS.md)** (sección índices y API admin).

### API Fase 3

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/visor/admin/tables/{tabla}/status` | ¿Tabla en Martin? / pendiente discovery |
| POST | `/api/visor/admin/tables/{tabla}/wait-martin` | Esperar discovery de Martin (sin restart) |
| POST | `/api/visor/admin/upload/shp` | Importar shapefile a PostGIS (+ wait Martin) |
| POST | `/api/visor/admin/upload/icon` | Registrar icono SVG |
| GET | `/api/visor/admin/tables/{tabla}/columns/{columna}/distinct` | Valores únicos (autoclasificar) |
| GET | `/api/visor/admin/tables/{tabla}/indexes` | Índices existentes en PostGIS |
| POST | `/api/visor/admin/tables/{tabla}/indexes/plan` | Plan de índices según config de capa |
| POST | `/api/visor/admin/tables/{tabla}/indexes` | Crear índices sugeridos |
| GET | `/api/visor/admin/meta` | Incluye `phase: 3`, presets y `db_schema` |

Tras publicar o editar: **Ctrl+F5** en el visor. Martin **no** requiere reinicio al cambiar estilo, identify o etiquetas; solo si la **tabla es nueva** en PostGIS.

## API (referencia)

| Método | Ruta | Auth |
|--------|------|------|
| POST | `/api/admin/login` | No |
| GET | `/api/admin/me` | Bearer JWT |
| GET | `/api/admin/users` | Admin — listar cuentas |
| POST | `/api/admin/users` | Admin — crear cuenta |
| PATCH | `/api/admin/users/{id}` | Admin — nombre, rol, activo |
| POST | `/api/admin/me/password` | Admin — cambiar contraseña propia |
| POST | `/api/admin/users/{id}/password` | Admin — restablecer contraseña |
| GET | `/api/visor/admin/meta` | Admin |
| GET | `/api/visor/admin/tables` | Admin |
| GET | `/api/visor/admin/tables/{tabla}/status` | Admin — estado Martin |
| GET | `/api/visor/admin/tables/{tabla}/indexes` | Admin — índices PostGIS |
| POST | `/api/visor/admin/tables/{tabla}/indexes/plan` | Admin — plan de índices |
| POST | `/api/visor/admin/tables/{tabla}/indexes` | Admin — crear índices |
| GET | `/api/visor/admin/layers` | Admin — listar gestionables |
| GET | `/api/visor/admin/layers/{id}` | Admin — detalle |
| PUT | `/api/visor/admin/layers/{id}` | Admin — actualizar |
| DELETE | `/api/visor/admin/layers/{id}` | Admin — despublicar (`?drop_table=true` también borra PostGIS) |
| DELETE | `/api/visor/admin/tables/{tabla}` | Admin — borrar tabla huérfana (no publicada en catálogo) |
| POST | `/api/visor/admin/layers` | Admin — publicar |
| GET | `/api/visor/admin/audit` | Admin — registro de actividad (`limit`, `offset`, `action`, `layer_id`, `table`) |
| POST | `/api/visor/admin/upload/shp` | Admin — importar shapefile |
| POST | `/api/visor/admin/upload/icon` | Admin — icono SVG |
| GET | `/api/visor/layers/{id}/points?cve_mun=…` | Público — GeoJSON cluster (municipio) |
| GET | `/api/visor/layers/{id}/points?scope=estatal` | Público — GeoJSON cluster (vista estatal del visor) |

## Licencias de componentes nuevos

| Paquete | Licencia |
|---------|----------|
| python-jose | MIT |
| passlib | *(reemplazado por bcrypt directo)* |
| bcrypt | Apache 2.0 |

## Auditoría

Las acciones administrativas quedan en `atlas_admin.catalog_audit` (usuario, acción, recurso, JSON antes/después, fecha).

| `action` | Descripción |
|----------|-------------|
| `create_layer` | Publicó capa en el catálogo |
| `update_layer` | Editó capa publicada |
| `delete_layer` | Despublicó capa |
| `drop_table` | Eliminó tabla PostGIS |
| `import_shp` | Importó shapefile a PostGIS |
| `create_indexes` | Creó índices PostgreSQL en una tabla |
| `create_admin_user` | Creó usuario admin |
| `update_admin_user` | Actualizó usuario admin |
| `change_password` | Cambió su contraseña |
| `reset_password` | Restableció contraseña de otro usuario |

Consulta desde Visor Studio: **Gestionar** → pestaña **Registro de actividad**, o vía API `GET /api/visor/admin/audit`.

Consulta SQL directa (ejemplo):

```sql
SELECT a.created_at, u.username, a.action, a.layer_id, a.after_json
  FROM atlas_admin.catalog_audit a
  LEFT JOIN atlas_admin.users u ON u.id = a.user_id
 ORDER BY a.created_at DESC
 LIMIT 50;
```

También se mantiene `atlas_admin.layer_publications` con el snapshot de cada publicación.  
Copia de seguridad automática del catálogo: `config/visor/catalog.json.bak` (+ timestamp).

Medidas de seguridad del stack (CORS, JWT, rate limit, subidas, etc.): **[SEGURIDAD.md](./SEGURIDAD.md)**.  
Login y cuentas admin: **[VISOR_STUDIO_CUENTAS.md](./VISOR_STUDIO_CUENTAS.md)**.
