# Recarga ETL de indicadores (`tab_municipal`)

Guía operativa para mantener precalculados los indicadores que **no deben calcularse en la API**.

## Por qué existe

En Fase 5 se normalizó la base para que el backend no invente totales ni ratios en runtime:

| Columna en `atlas.tab_municipal` | Contenido | Antes (incorrecto a largo plazo) |
|----------------------------------|-----------|-----------------------------------|
| `total_unidades_medicas` | `imss + issste + semar + imb + sesa + ssa` | Suma en Python al servir la vista |
| `habxpol` | Habitantes por policía preventiva | Ratio `pop_tot / pol_prev` si venía NULL |

La API **aún tiene fallback** por seguridad, pero el gate de calidad es:

```
http://localhost:850/api/indicators/validate
```

Debe responder `"etl_ready": true` y `"etl_pending": 0`.

## Cuándo ejecutar el script

Ejecuta `sql/007_tab_municipal_etl_columns.sql` **siempre que**:

1. Sea la primera vez (instalación Fase 5), o
2. Recargues / reimportes `atlas.tab_municipal` desde el proceso ETL de datos, o
3. Corrijas a mano columnas `imss`, `issste`, `semar`, `imb`, `sesa`, `ssa`, `pop_tot` / `pob_tot`, `pol_prev` o `habxpol`, o
4. `validate` muestre `column_missing`, `needs_backfill` o `etl_pending > 0`.

El script es **idempotente**: se puede correr las veces que haga falta.

## Cómo ejecutarlo (CMD, equipo institucional)

Desde `C:\Stack_Martin`:

```bat
type sql\007_tab_municipal_etl_columns.sql | docker exec -i db_atlas psql -U postgres -d atlas
```

Salida esperada (ejemplo con 81 municipios cargados y 4 pendientes de datos):

```
BEGIN
ALTER TABLE
COMMENT
UPDATE 83
COMMENT
UPDATE 0
COMMIT
 filas_municipales | total_um_null | habxpol_null
-------------------+---------------+--------------
                81 |             0 |            0
```

Interpretación:

| Columna | Ideal | Notas |
|---------|-------|--------|
| `filas_municipales` | ≈ municipios con `cve_mun` de 3 dígitos | Si faltan municipios en la tabla, el número será menor que 85 |
| `total_um_null` | `0` | Si no es 0, la columna no se pobló bien |
| `habxpol_null` | `0` (o pocos) | Filas sin `pol_prev` / población no se pueden calcular; la API usa 0 |

`UPDATE 0` en el segundo `UPDATE` de `habxpol` es normal si **ya no había NULLs** que rellenar.

## Después del SQL

Reinicia el backend para limpiar la caché de columnas en memoria:

```bat
docker compose restart api_backend
```

## Verificación

En el navegador:

```
http://localhost:850/api/indicators/validate
```

Checklist:

- `"ok": true`
- `"valid": true`
- `"etl_ready": true`
- `"summary.fields_missing": 0`
- `"summary.etl_pending": 0`
- En `etl[]`, ambos ítems con `"status": "ready"`:
  - `total_unidades_medicas`
  - `habxpol`

## Qué hace el script (resumen técnico)

Archivo: `sql/007_tab_municipal_etl_columns.sql`

1. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS total_unidades_medicas`
2. `UPDATE` de esa columna con la suma de instituciones
3. `UPDATE habxpol` solo donde es `NULL` y hay `pop_tot` y `pol_prev > 0`
4. `SELECT` de verificación de nulos en filas municipales

## Responsabilidad del proceso ETL de datos

Al diseñar o modificar el cargador de `tab_municipal`, conviene:

1. **Incluir** `total_unidades_medicas` ya calculada en el archivo/origen, **o**
2. **Llamar siempre** este script al final del pipeline de carga, **y**
3. **Exigir** `habxpol` completo en origen (o aceptar el backfill del script).

Regla de producto: el usuario final no debe depender de cálculos ocultos en la API. Si un indicador se muestra, la columna debe existir y estar poblada en BD.

## Fallos frecuentes

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| `column_missing` en validate | No se corrió el `007` | Ejecutar el script |
| `needs_backfill` | Recarga de tabla sin re-correr el script | Re-ejecutar `007` |
| `etl_ready: false` tras recarga | Olvidaron el paso post-ETL | Script + `restart api_backend` |
| Vistas con totales en 0 | Columnas fuente (`imss`, etc.) vacías en origen | Corregir ETL de datos, luego `007` |

## Referencias

- Script: `sql/007_tab_municipal_etl_columns.sql`
- Índice SQL del repo: `sql/README.md`
- Catálogo y fases: `htdocs/atlas_gro/docs/INDICADORES_CATALOGO.md`
- Gate API: `GET /api/indicators/validate`
