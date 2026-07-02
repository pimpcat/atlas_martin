# Seguridad del stack Atlas Gro

Documento de referencia sobre las **medidas de seguridad implementadas** en el portal, el API FastAPI, Nginx y los servicios Docker del stack. Complementa la guía operativa de [VISOR_STUDIO.md](./VISOR_STUDIO.md).

**Última revisión:** julio 2026 — cubre endurecimiento del API admin, auditoría reforzada y controles de subida de archivos.

---

## Resumen

| Área | Medida | Estado |
|------|--------|--------|
| Perímetro | Nginx como único punto de entrada público | Implementado |
| CORS | Sin wildcard `*`; orígenes explícitos o derivados de `PORT_NGINX` | Implementado |
| Documentación API | Swagger/ReDoc/OpenAPI deshabilitados por defecto | Implementado |
| Admin | JWT + rol `visor_admin`; ruta de login oculta | Implementado |
| Login | Rate limit por IP (ventana deslizante) | Implementado |
| Usuarios admin | Alta, activar/desactivar y contraseñas vía Visor Studio + API | Implementado |
| Contraseñas | bcrypt (12 rondas) | Implementado |
| Visor Studio | Endpoints `/api/visor/admin/*` exigen Bearer JWT | Implementado |
| Shapefile | Anti zip-slip, validación de nombre de tabla, límite 80 MB | Implementado |
| Iconos SVG | Validación de tipo/tamaño + sanitización anti-XSS | Implementado |
| Índices SQL | `psycopg.sql.Identifier`, tablas publicables, nombres validados | Implementado |
| Análisis espacial | Solo capas del catálogo; columnas contra `information_schema` | Implementado |
| Auditoría | `catalog_audit` + UI «Registro de actividad» + `GET /audit` | Implementado |
| Catálogo | Respaldo automático `.bak` antes de cada escritura | Implementado |
| HTTPS / WAF | No incluido en el compose por defecto | Responsabilidad del despliegue |
| Rate limit global | Solo en login admin (no en todo el API) | Parcial |

---

## Arquitectura y superficie de ataque

```
Navegador
    │
    ▼
nginx_proxy (:PORT_NGINX)
    ├── /              → Apache (htdocs estáticos, visor público)
    ├── /api/*         → FastAPI (público + admin)
    ├── /docs          → FastAPI (solo si ENABLE_API_DOCS=true)
    └── /tiles/*       → Martin (lectura de vector tiles)
```

- **Portal público:** `index.html` y vistas del Atlas **sin login**. Consumen APIs de lectura (`/api/visor/catalog`, análisis espacial, indicadores, etc.).
- **Administración del visor:** login en ruta **no enlazada** desde el menú (`visor-studio.html`). Tras autenticarse, el token JWT habilita Visor Studio (publicar capas, SHP, índices, iconos).
- **Base de datos:** PostGIS en contenedor `db_mapas`. Esquema operativo `atlas` y esquema admin `atlas_admin` separados.

La superficie sensible concentra en: login admin, subida de archivos, escritura del catálogo, `CREATE INDEX` y consultas espaciales parametrizadas.

---

## 1. Perímetro — Nginx

**Archivo:** `nginx/default.conf`

| Control | Descripción |
|---------|-------------|
| Proxy inverso único | Apache, FastAPI y Martin no exponen puertos al host salvo el configurado en `PORT_NGINX`. |
| `client_max_body_size 80m` | Alineado con el límite de shapefile en FastAPI (80 MB). |
| Reenvío de `Authorization` | En `/api/`, Nginx reenvía `Authorization` y `X-Atlas-Authorization` para que el JWT llegue al backend tras el proxy. |
| Rutas `/docs`, `/redoc`, `/openapi.json` | Proxificadas a FastAPI; si el backend tiene docs deshabilitados, responden 404. |

**Verificación:** acceder solo por `http://<host>:<PORT_NGINX>/`; comprobar que `/docs` devuelve `{"detail":"Not Found"}` con la configuración por defecto.

---

## 2. CORS (Cross-Origin Resource Sharing)

**Archivos:** `app_api/main.py`, `app_api/config.py`, `docker-compose.yml`

- **No se usa** `allow_origins=["*"]`.
- Si `CORS_ORIGINS` está vacío en `.env`, se arman orígenes locales a partir de `PORT_NGINX` (`localhost`, `127.0.0.1`, con y sin puerto).
- Si el frontend llama al API desde **otro origen** (IP de intranet, ngrok, dominio distinto), debe listarse explícitamente en `CORS_ORIGINS` (valores separados por coma).

```env
CORS_ORIGINS=http://localhost:850,http://192.168.1.50:850,https://mi-dominio.ngrok.app
```

Tras cambiar `.env` o `docker-compose.yml`:

```bash
docker compose up -d api_backend
```

**Verificación:** uso normal mismo host/puerto no debe mostrar errores CORS en la consola del navegador.

---

## 3. Documentación OpenAPI / Swagger

**Archivos:** `app_api/main.py`, `.env`, `docker-compose.yml`

| Variable | Default | Efecto |
|----------|---------|--------|
| `ENABLE_API_DOCS` | `false` | No expone `/docs`, `/redoc` ni `/openapi.json`. |

Para depuración local temporal:

```env
ENABLE_API_DOCS=true
```

```bash
docker compose up -d api_backend
```

**Verificación:** `http://localhost:850/docs` → 404 con docs deshabilitados.

---

## 4. Autenticación y autorización admin

**Archivos:** `app_api/routers/admin_auth.py`, `app_api/auth/deps.py`, `app_api/auth/jwt_tokens.py`, `app_api/routers/visor_admin.py`

### Login

- Ruta: `POST /api/admin/login`
- Credenciales en `atlas_admin.users` (hash bcrypt, no texto plano).
- Solo usuarios con `active = true` y `role = 'visor_admin'`.
- Respuesta genérica en credenciales incorrectas (no revela si el usuario existe).

### JWT

| Aspecto | Detalle |
|---------|---------|
| Algoritmo | HS256 |
| Secreto | `JWT_SECRET` en `.env` (obligatorio en producción) |
| Expiración | `JWT_EXPIRE_HOURS` (default 8 h) |
| Almacenamiento cliente | `sessionStorage` (Visor Studio) |
| Validación | Token en `Authorization: Bearer …` o `X-Atlas-Authorization` |

### Protección de rutas admin

Todas las rutas bajo `/api/visor/admin/*` usan `Depends(require_admin_user)`:

- Sin token → 401
- Token inválido/expirado → 401
- Usuario inactivo o rol distinto de `visor_admin` → 401/403

Rutas de sesión: `GET /api/admin/me` (requiere JWT).

### Gestión de usuarios (Visor Studio)

Tras login en `visor-studio.html`, pestañas **Usuarios** y **Mi contraseña**:

| Ruta | Uso |
|------|-----|
| `GET /api/admin/users` | Listar cuentas (sin hash de contraseña) |
| `POST /api/admin/users` | Crear usuario (`visor_admin` o `viewer`) |
| `PATCH /api/admin/users/{id}` | `display_name`, `role`, `active` |
| `POST /api/admin/me/password` | Cambio propio (`current_password` + `new_password`) |
| `POST /api/admin/users/{id}/password` | Restablecimiento por otro admin |

Reglas:

- Contraseña mínima **8** caracteres (alta y cambios).
- No desactivar la propia cuenta.
- No dejar sin al menos un `visor_admin` activo.
- Usuario: `2–64` caracteres `[A-Za-z0-9_]`.
- Rol `viewer` existe en BD pero **no** puede iniciar sesión admin (reservado).
- Acciones auditadas en `catalog_audit`.

El script CLI `scripts/create_admin_user.py` sigue disponible para el primer usuario o automatización.

### Acceso a la UI

- URL oculta: `http://<host>:<PORT_NGINX>/atlas_gro/visor-studio.html`
- Sin enlace en el menú público.
- Botones **+** y **Gestionar** en el panel Capas solo visibles con sesión admin válida.

**Verificación:** sin login, `GET /api/visor/admin/layers` → 401; tras login en visor-studio, el wizard funciona.

---

## 5. Rate limiting en login

**Archivos:** `app_api/auth/rate_limit.py`, `app_api/routers/admin_auth.py`

| Variable | Default | Descripción |
|----------|---------|-------------|
| `ADMIN_LOGIN_RATE_LIMIT` | `5` | Intentos máximos por IP |
| `ADMIN_LOGIN_RATE_WINDOW_SEC` | `60` | Ventana en segundos |

- Implementación en memoria (por proceso del contenedor `api_backend`).
- Clave: IP del cliente (`X-Forwarded-For` si Nginx la envía).
- Al superar el límite → HTTP **429** con `error: RATE_LIMITED`.

**Verificación:** 6 intentos fallidos seguidos en un minuto desde la misma IP → mensaje de límite.

---

## 6. APIs públicas vs administrativas

### Públicas (sin JWT)

Ejemplos de lectura para el visor y el portal:

- `GET /api/visor/catalog`
- `GET /api/visor/search`
- Endpoints de análisis espacial configurados en el catálogo
- Indicadores y vistas municipales (`/api/vistas/...`)
- Proxy WMTS INEGI (evita CORS en el navegador)

Estas rutas **no** permiten modificar el catálogo, subir archivos ni ejecutar DDL.

### Administrativas (JWT obligatorio)

Prefijo `/api/visor/admin/` — publicar/editar/despublicar capas, SHP, iconos, índices, auditoría. Ver tabla completa en [VISOR_STUDIO.md](./VISOR_STUDIO.md).

### Capas gestionables

Solo las publicadas desde Visor Studio (`layer_publications`) pueden editarse o despublicarse; capas legacy del `catalog.json` manual no se eliminan por error desde la UI admin.

---

## 7. Validación de entradas — catálogo y capas

**Archivos:** `app_api/visor_catalog_validate.py`, `app_api/visor_catalog_admin_service.py`

Antes de escribir `catalog.json`:

- Validación de `layer_id` (slug seguro).
- Comprobación de geometría, tabla, estilo, iconos conocidos, bloques `search`, `spatial_analysis`, etc.
- Endpoint `POST /api/visor/admin/layers/validate` para pre-revisión en el wizard.
- Errores de validación → HTTP 400 sin persistir cambios.

---

## 8. Importación de shapefile

**Archivos:** `app_api/visor_shp_import.py`, `app_api/routers/visor_admin.py`

| Control | Implementación |
|---------|----------------|
| **Zip slip** | `_safe_zip_extract`: rechaza miembros cuya ruta resuelta salga del directorio destino (`ZIP_PATH_TRAVERSAL`). |
| **Formato** | Solo `.zip` (con `.shp` dentro) o `.shp` suelto. |
| **Nombre de tabla** | Normalizado a `c_*`, caracteres seguros, máx. 63 caracteres. |
| **Tamaño** | Máx. 80 MB en FastAPI; Nginx `client_max_body_size 80m`. |
| **Autenticación** | Solo admin con JWT. |
| **Auditoría** | Acción `import_shp` en `catalog_audit` (usuario, tabla, archivo, features). |

**Verificación:** subir SHP válido desde el wizard → capa importada + fila en **Gestionar → Registro de actividad**.

---

## 9. Iconos SVG personalizados

**Archivos:** `app_api/visor_icon_upload.py`, `POST /api/visor/admin/upload/icon`

| Control | Implementación |
|---------|----------------|
| Clave de icono | Regex `[a-z][a-z0-9_]{1,48}` |
| Tamaño | Máx. 512 KB |
| Tipo | Debe contener `<svg` en el encabezado |
| **Sanitización** | Elimina `<script>`, `foreignObject`, `iframe`, handlers `on*`, URLs `javascript:` en `href` |
| Sobrescritura | Solo si `overwrite=true` |
| Autenticación | Solo admin |

Los SVG se guardan en el volumen de iconos del mapa (`VISOR_ICONS_MAP_DIR`) y se registran en `icons.json`.

---

## 10. Índices PostgreSQL en caliente

**Archivos:** `app_api/visor_table_indexes.py`, `app_api/routers/visor_admin.py`

| Control | Implementación |
|---------|----------------|
| Nombres de tabla/columna/índice | Validación con regex de identificadores PostgreSQL |
| SQL dinámico | `psycopg.sql.Identifier` (sin concatenar identificadores crudos) |
| Alcance | Solo tablas **publicables** (en Martin o ya en catálogo) |
| Operación | `CREATE INDEX IF NOT EXISTS` (no `DROP` arbitrario desde la UI) |
| Autenticación | Solo admin |
| **Auditoría** | Acción `create_indexes` con detalle de creados/omitidos/errores |

**Verificación:** paso **Revisión** del wizard → crear índices → registro en auditoría.

---

## 11. Análisis espacial

**Archivo:** `app_api/spatial_analysis.py`

Controles documentados en el propio módulo:

- Solo tablas registradas en el catálogo de análisis (`CAPAS_ANALISIS` / `catalog.json`).
- Columnas validadas contra `information_schema` antes del `SELECT`.
- Identificadores escapados con `quote_ident()`.
- Agregaciones limitadas a tipos numéricos permitidos; exclusiones de geometría e IDs.

Rutas de consulta espacial son **públicas** (el visor las consume), pero el **conjunto de capas y columnas** está acotado por configuración, no por entrada libre del usuario.

Ver [VISOR_SPATIAL_ANALYSIS.md](./VISOR_SPATIAL_ANALYSIS.md).

---

## 12. Auditoría y trazabilidad

**Archivos:** `app_api/visor_catalog_admin_service.py`, `app_api/routers/visor_admin.py`, `atlas_admin.catalog_audit`

### Acciones registradas

| `action` | Evento |
|----------|--------|
| `create_layer` | Publicó capa |
| `update_layer` | Editó capa |
| `delete_layer` | Despublicó capa |
| `import_shp` | Importó shapefile |
| `create_indexes` | Creó índices PostgreSQL |

Cada fila guarda: `user_id`, `layer_id`, `before_json`, `after_json`, `created_at`.

### Consulta

- **UI:** Gestionar catálogo → pestaña **Registro de actividad**
- **API:** `GET /api/visor/admin/audit?limit=50` (filtros: `action`, `layer_id`, `table`)
- **SQL:** base `atlas`, esquema `atlas_admin` (ver [VISOR_STUDIO.md](./VISOR_STUDIO.md))

Índices recomendados: `idx_catalog_audit_created`, `idx_catalog_audit_action` (`app_api/docs/sql/atlas_admin_schema.sql`).

---

## 13. Respaldo del catálogo

**Archivo:** `app_api/visor_catalog_writer.py`

Antes de cada escritura de `config/visor/catalog.json`:

- Copia con timestamp: `catalog.json.bak.YYYYMMDDTHHMMSSZ`
- Copia rodante: `catalog.json.bak`

Reduce el riesgo de pérdida por error de administración o fallo parcial.

---

## 14. Contraseñas y usuarios admin

**Archivos:** `app_api/auth/passwords.py`, `app_api/docs/sql/atlas_admin_schema.sql`, `scripts/create_admin_user.py`

- Hash **bcrypt** con 12 rondas.
- Tabla `atlas_admin.users` con `active`, `role` (`visor_admin` | `viewer`), `last_login`.
- Creación de usuarios solo por script/operación en servidor (no registro público).

```bash
docker exec -it fastapi_backend python scripts/create_admin_user.py -u admin -d "Administrador Visor"
```

**Buenas prácticas:** `JWT_SECRET` largo y aleatorio; contraseñas fuertes; desactivar usuarios (`active = false`) en lugar de borrarlos si dejan el equipo.

---

## 15. Martin (servidor de tiles)

**Archivo:** `martin.yaml`

- Publicación acotada al esquema `atlas` (`auto_publish` / tablas listadas).
- Límites por capa: `max_feature_count`, `minzoom`/`maxzoom`, `clip_geom`.
- Acceso de lectura vía `/tiles/` (sin autenticación en el stack actual).

Martin **no** debe exponer tablas fuera del esquema operativo ni credenciales en URLs públicas.

---

## 16. Base de datos y red Docker

| Aspecto | Detalle |
|---------|---------|
| Esquemas | `atlas` (datos) y `atlas_admin` (usuarios, auditoría, publicaciones) |
| Red interna | Servicios en red Docker `red_atlas`; comunicación inter-contenedor |
| Puerto host DB | `DB_PORT_HOST` expone PostgreSQL para pgAdmin/QGIS — restringir firewall en producción |
| Credenciales | `DB_PASSWORD`, `JWT_SECRET` solo en `.env` (no versionar `.env`) |

---

## Variables de entorno — resumen de seguridad

```env
# Perímetro y CORS
PORT_NGINX=850
CORS_ORIGINS=                    # opcional; ver sección 2

# API
ENABLE_API_DOCS=false            # Swagger off en producción
ADMIN_LOGIN_RATE_LIMIT=5
ADMIN_LOGIN_RATE_WINDOW_SEC=60

# Admin visor
JWT_SECRET=<secreto_largo>
JWT_EXPIRE_HOURS=8
ATLAS_ADMIN_SCHEMA=atlas_admin

# PostgreSQL (no commitear valores reales)
DB_USER=postgres
DB_PASSWORD=...
DB_NAME=atlas
```

Plantilla: `.env.example` en la raíz del stack.

---

## Checklist de verificación en el portal

1. **Swagger cerrado:** `/docs` → 404.
2. **Login admin:** `visor-studio.html` → sesión OK; panel Capas muestra **+** y **Gestionar**.
3. **Sin JWT:** petición a `/api/visor/admin/layers` → 401.
4. **Rate limit:** 6 logins fallidos/min → 429.
5. **Auditoría:** publicar capa / subir SHP / crear índice → filas en **Registro de actividad**.
6. **CORS:** visor y API en el mismo origen sin errores en consola.
7. **Tema oscuro/claro:** modal Gestionar y auditoría legibles (CSS del visor).

---

## Límites conocidos y recomendaciones

| Tema | Situación actual | Recomendación |
|------|------------------|---------------|
| HTTPS | No configurado en compose | Terminar TLS en Nginx o balanceador frente al stack |
| Rate limit | Solo login; en memoria | Valorar límite en proxy o Redis si hay varias réplicas |
| JWT en `sessionStorage` | Vulnerable si hubiera XSS en el portal | Mantener sanitización SVG; evitar HTML crudo de usuarios |
| APIs públicas de lectura | Sin autenticación | Aceptable para atlas abierto; restringir por red si es intranet sensible |
| Puerto PostgreSQL en host | Abierto para desarrollo | Cerrar en firewall o quitar mapeo en producción |
| `ENABLE_API_DOCS=true` | Expone superficie de ataque | Solo en desarrollo local |
| Backups | Solo `catalog.json` local | Política de backup de PostGIS y `.env` en operaciones |

---

## Archivos de referencia

| Tema | Ruta |
|------|------|
| Compose / env API | `docker-compose.yml`, `.env.example` |
| Nginx | `nginx/default.conf` |
| CORS y settings | `app_api/config.py`, `app_api/main.py` |
| Auth / JWT / rate limit | `app_api/auth/`, `app_api/routers/admin_auth.py` |
| Admin visor | `app_api/routers/visor_admin.py` |
| SHP | `app_api/visor_shp_import.py` |
| SVG | `app_api/visor_icon_upload.py` |
| Índices | `app_api/visor_table_indexes.py` |
| Análisis espacial | `app_api/spatial_analysis.py` |
| Auditoría SQL | `app_api/docs/sql/atlas_admin_schema.sql` |
| UI admin / auditoría | `htdocs/atlas_gro/js/visorCatalogAdmin.js` |
| Guía operativa admin | [VISOR_STUDIO.md](./VISOR_STUDIO.md) |

---

## Documentos relacionados

- [VISOR_STUDIO.md](./VISOR_STUDIO.md) — publicación de capas, API admin, auditoría
- [VISOR_SPATIAL_ANALYSIS.md](./VISOR_SPATIAL_ANALYSIS.md) — análisis espacial e índices
- [VISOR_CATALOG.md](./VISOR_CATALOG.md) — estructura del catálogo data-driven
