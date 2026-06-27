# Administración del Visor geográfico (Visor Studio)

Guía operativa para publicar capas desde la UI sin editar `catalog.json` a mano.

## Acceso

- **Portal público:** sin login (`index.html`).
- **Login admin (ruta oculta):**  
  `http://localhost:850/atlas_gro/visor-studio.html`  
  (ajuste el puerto según `PORT_NGINX` en `.env`).

No hay enlace en el menú. Guarde la URL en favoritos.

Tras iniciar sesión, el token queda en `sessionStorage` y verá el botón **verde (+)** en la barra del panel **Capas**, junto a Visor estatal y demás.

## Requisitos previos de una capa nueva

1. Tabla en PostGIS esquema `atlas` (convención `c_*`).
2. Campos mínimos: `gid`, `the_geom` (SRID 3857). Para capas **municipales**, incluir `cve_mun` (o `cvegeo`). Las capas **estatales** (sin `cve_mun`) deben publicarse con alcance **Estatal** (`mun_filter: false`).
3. Martin reiniciado y tabla visible en tiles (`auto_publish` o `martin.yaml`).
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
4. Asistente: tabla → datos → estilo → **columnas** → revisar → **Publicar**.
5. **Ctrl+F5** si la capa no aparece de inmediato.

### Gestionar capas (Fase 2)

- Botón **engranaje** junto al **+** en la barra del panel Capas.
- Lista solo capas publicadas desde Visor Studio (`layer_publications`).
- **Editar:** cambia etiqueta, grupo, estilo, alcance territorial, columnas identify/export.
- **Quitar:** despublica del catálogo (no borra la tabla en PostGIS).

Las capas del catálogo original (colonias, DENUE, etc.) **no** aparecen en el gestor.

### Paso columnas (Fase 2)

- **Título del popup:** texto en negrita (como colonias, DENUE, etc.).
- **Identificación:** marque columnas y edite la **etiqueta visible** (alias antes de los dos puntos).
- **Etiquetas en mapa:** active letreritos automáticos, elija campo y **zoom mínimo** (p. ej. 12–14 en puntos densos).
- **Exportación:** columnas en KML/SHP; si no marca ninguna, se exportan todas.

Tras guardar basta **Ctrl+F5** en el visor. Martin usa `auto_publish` del esquema `atlas` (todas las columnas en el MVT); **no** hace falta reiniciar Martin al editar identify, etiquetas o estilo. Solo reinicie Martin si publica una **tabla nueva** en PostGIS y aún no aparece en tiles (`docker compose restart martin`, una vez).

El popup usa el mismo CSS que el resto del visor: título en negrita (`atlas-loc-tip__title`), etiquetas de campo en negrita (`atlas-loc-tip__lbl`).

Presets disponibles: punto círculo, punto con icono, **por atributo** (punto/línea/polígono), líneas y polígonos básicos.

## Fase 2 — API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/visor/admin/layers` | Capas gestionables |
| GET | `/api/visor/admin/layers/{id}` | Detalle para editar |
| PUT | `/api/visor/admin/layers/{id}` | Actualizar |
| DELETE | `/api/visor/admin/layers/{id}` | Despublicar |

## Fase 3 — simbología avanzada y DENUE

Implementado en Visor Studio (asistente paso **Estilo**):

- **Presets por atributo** (`point_by_attribute`, `line_by_attribute`, `polygon_by_attribute`): campo MVT + clases valor/color/leyenda.
- **Vista previa** en canvas (sin MapLibre) al editar color o clases.
- **Aviso Martin** al elegir tabla nueva (`GET /api/visor/admin/tables/{tabla}/status`): si la tabla no está en tiles, recuerda `docker compose restart martin`.
- **Plantillas DENUE** para tabla `c_denue`: códigos SCIAN, icono sugerido y popup con plantilla `denue`.
- **Subir shapefile** (paso 1, pestaña «Subir shapefile»): `.shp` o `.zip` → tabla `c_*` en PostGIS (`ogr2ogr`).
- **Icono SVG custom** (paso Estilo, preset «Punto con icono»): registra clave + `.svg` en `icons.json`.

Tras importar SHP o tabla nueva: `docker compose restart martin`. Tras icono custom: **Ctrl+F5** en el visor.

En el paso **Estilo**, con preset **por atributo**: al elegir el campo se consultan valores únicos en PostGIS; use **Autoclasificar** para generar clases valor/color/leyenda (editable después).

### API Fase 3

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/visor/admin/tables/{tabla}/status` | ¿Tabla en Martin? aviso reinicio |
| POST | `/api/visor/admin/upload/shp` | Importar shapefile a PostGIS |
| POST | `/api/visor/admin/upload/icon` | Registrar icono SVG |
| GET | `/api/visor/admin/tables/{tabla}/columns/{columna}/distinct` | Valores únicos (autoclasificar) |
| GET | `/api/visor/admin/meta` | Incluye `phase: 3` y presets por atributo |

Tras publicar o editar: **Ctrl+F5** en el visor. Martin **no** requiere reinicio al cambiar estilo, identify o etiquetas; solo si la **tabla es nueva** en PostGIS.

## API (referencia)

| Método | Ruta | Auth |
|--------|------|------|
| POST | `/api/admin/login` | No |
| GET | `/api/admin/me` | Bearer JWT |
| GET | `/api/visor/admin/meta` | Admin |
| GET | `/api/visor/admin/tables` | Admin |
| GET | `/api/visor/admin/tables/{tabla}/status` | Admin — estado Martin |
| GET | `/api/visor/admin/layers` | Admin — listar gestionables |
| GET | `/api/visor/admin/layers/{id}` | Admin — detalle |
| PUT | `/api/visor/admin/layers/{id}` | Admin — actualizar |
| DELETE | `/api/visor/admin/layers/{id}` | Admin — despublicar |
| POST | `/api/visor/admin/layers` | Admin — publicar |
| POST | `/api/visor/admin/upload/shp` | Admin — importar shapefile |
| POST | `/api/visor/admin/upload/icon` | Admin — icono SVG |

## Licencias de componentes nuevos

| Paquete | Licencia |
|---------|----------|
| python-jose | MIT |
| passlib | *(reemplazado por bcrypt directo)* |
| bcrypt | Apache 2.0 |

## Auditoría

Cada alta queda en `atlas_admin.catalog_audit` y `atlas_admin.layer_publications`.  
Copia de seguridad automática: `config/visor/catalog.json.bak` (+ timestamp).
