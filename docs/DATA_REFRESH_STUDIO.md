# Data Refresh Studio

ETL asistido para **actualizar tablas espaciales** e **indicadores tabulares** en `atlas`, con historial, validaciones, rollback (N=3) y enlace a Backup Studio.

| Campo | Valor |
|-------|--------|
| URL | `/atlas_gro/data-refresh-studio.html` |
| API | `/api/data-refresh/*` (JWT admin) |
| Backup Studio | `/atlas_gro/backup-studio.html` · `/api/admin/backups/*` |

## Flujo espacial

1. Elegir tabla destino (lista desde `geometry_columns`; excluye núcleo marco/ruteo/`c_contexto`/tabs).
2. Subir `.zip` o `.shp` (overlay + barra de progreso; el POST solo encola el job).
3. Background: `queued` → `importing` → `comparing` → `ready`/`failed`.
4. Informe + checklist (`ok` / `warn` / `block`): geometría, SRID, columnas, conteos, duplicados, nulos, GIST.
5. **Aplicar** → swap atómico; **retiene** backup versionado (no DROP); `ANALYZE`; poll Martin. Si `validation.level == "block"`, el servidor rechaza el apply.
6. **Cancelar** → drop staging (no disponible mientras `applying`).

## Historial

`GET /api/data-refresh/history` — Fecha, usuario, tabla, tipo (`spatial` \| `indicator` \| `derived`), resumen, duración, estado. La UI muestra tabla en lugar del listado compacto de jobs.

## Tablas derivadas (KPIs explorador)

Tras actualizar **`c_loc_punto`** o **`c_denue`**, los KPIs del explorador municipal (localidades y unidades económicas) leen **`atlas.municipio_conteos`**, no un COUNT en vivo.

| Campo | Valor |
|-------|--------|
| Origen | `c_mun` + `c_loc_punto` + `c_denue` |
| Derivada | `atlas.municipio_conteos` (`n_localidades`, `n_denue`) |
| Función SQL | `atlas.refresh_municipio_conteos()` (`sql/001_municipio_conteos.sql`) |
| UI | Data Refresh → tarjeta **Tablas derivadas** → «Recalcular municipio_conteos» |
| API | `GET /api/data-refresh/derived` · `POST /api/data-refresh/derived/municipio-conteos/refresh` |
| Efecto | Recalcula filas, invalida caché del explorador, registra job `kind=derived` en historial |

**Fuera de 1.0:** motor genérico de dependencias entre tablas. Las columnas ETL de indicadores (`007`) ya se refrescan al aplicar Indicator Refresh.

## Rollback (últimas 3)

Tras apply exitoso, la producción anterior queda como `atlas.{table}__dr_ver_{YYYYMMDD}_{jobId8}` y se registra en `atlas_admin.data_refresh_versions`. Al crear la 4ª versión de la misma tabla se hace `DROP` de la más antigua.

- `GET /api/data-refresh/versions`
- `POST /api/data-refresh/versions/{id}/restore` — swap producción ↔ backup; la prod actual pasa a nueva versión (rota N=3).

**Indicadores:** antes del merge se hace `CREATE TABLE … AS TABLE` snapshot de `tab_municipal` / `tab_nacional`. El merge no es reversible fila-a-fila sin ese snapshot.

DENUE × 3 ocupa disco; las tablas bloqueadas del refresh no generan versiones.

## Endpoints espaciales / comunes

| Método | Ruta |
|--------|------|
| GET | `/api/data-refresh/meta` |
| GET | `/api/data-refresh/targets` |
| GET | `/api/data-refresh/jobs` |
| GET | `/api/data-refresh/history` |
| GET | `/api/data-refresh/derived` |
| POST | `/api/data-refresh/derived/{id}/refresh` |
| GET | `/api/data-refresh/versions` |
| POST | `/api/data-refresh/versions/{id}/restore` |
| POST | `/api/data-refresh/jobs` (multipart: `target_table`, `file`) |
| GET | `/api/data-refresh/jobs/{id}` |
| POST | `/api/data-refresh/jobs/{id}/apply` |
| POST | `/api/data-refresh/jobs/{id}/normalize-geometry?accept=true\|false` |
| POST | `/api/data-refresh/jobs/{id}/cancel` |

Jobs: `atlas_admin.data_refresh_jobs`. Versiones: `atlas_admin.data_refresh_versions`.

## Indicator Refresh (tabular)

Pestañas **Estatal** (`tab_municipal`) y **Nacional** (`tab_nacional`). Merge por columnas; especiales por nombre. Checklist incluye métricas, claves, duplicados y tipos.

### Endpoints indicadores

| Método | Ruta |
|--------|------|
| GET | `/api/data-refresh/indicators/templates` |
| GET | `/api/data-refresh/indicators/templates/{id}/mold` |
| POST | `/api/data-refresh/indicators/synthetic` |
| GET | `/api/data-refresh/indicators/jobs` |
| POST | `/api/data-refresh/indicators/jobs` |
| POST | `/api/data-refresh/indicators/jobs/{id}/apply` |

## Backup Studio

ZIP local bajo volumen `data_backups/` (montado en API como `/data/backups`).

| Checkbox | Default |
|----------|---------|
| `atlas` pg_dump | on |
| `GroSIG_Cartography` | on si hay URL |
| Config (`/config/*` + martin.yaml sanitizado) | on |
| MBTiles | **off** (async / grande) |

| Método | Ruta |
|--------|------|
| GET | `/api/admin/backups/meta` |
| GET | `/api/admin/backups` |
| POST | `/api/admin/backups` |
| GET | `/api/admin/backups/{id}` |
| DELETE | `/api/admin/backups/{id}` |
| GET | `/api/admin/backups/{id}/download` |

Retención automática: al terminar un job se conservan los últimos `BACKUP_STUDIO_KEEP` (default **5**) y se borran los más viejos. Además, la UI permite **Eliminar** un respaldo concreto (`ready` o `failed`). Requiere `postgresql-client` en la imagen API. No incluye `.env` ni sustituye política DR offsite.

## Código

- `app_api/data_refresh/service.py` — espacial + gate validación + retención
- `app_api/data_refresh/versions.py` — N=3 + restore
- `app_api/data_refresh/jobs_store.py` — historial enriquecido
- `app_api/data_refresh/indicator_refresh.py` / `indicator_nacional.py`
- `app_api/data_refresh/backup_studio.py` + `routers/admin_backups.py`
