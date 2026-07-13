# Presets de presentación de indicadores (Fase 7)

Contrato de los **estilos de gráficas y tablas** del dashboard. No inventa UI nueva: documenta lo que ya existe en los `*Viz.js` para que Fase 8 implemente un renderer genérico por preset y el futuro Indicators Studio pueda elegir estilo sin código.

## Archivos

| Archivo | Rol |
|---------|-----|
| `config/indicators/presentation_presets.json` | Catálogo de presets (fuente en `htdocs/atlas_gro/config/indicators/`) |
| `config/indicators/presentation_presets.schema.json` | JSON Schema del catálogo de presets |
| `config/indicators/schema.json` | `presentation.*` ampliado (title, footer, bar_metrics, …) |
| `js/presentationPresets.js` | Loader frontend |
| `GET /api/indicators/presentation-presets` | Endpoint API |

## Presets activos

| id | Estado runtime | # indicadores | Perfil(es) de datos |
|----|----------------|---------------|---------------------|
| `ranking_dual_bars` | **implemented** (genérico puro) | 4 | `ranking_municipal` |
| `ranking_with_rates_table` | **implemented** (adaptador → `*Viz.js`) | 3 | `ranking_municipal`, `ranking_with_national_state` |
| `entity_bars_municipal_table` | **implemented** (adaptador → `*Viz.js`) | 4 | `ranking_with_states` |
| `multi_column_table` | **implemented** (adaptador → `*Viz.js`) | 5 | `ranking_entity_only`, `ranking_with_national_state`, … |
| `chartjs_grouped_bars` | **implemented** (adaptador → `*Viz.js`) | 1 | `national_state_municipio` |
| `analfabetismo_composite` | **implemented** (adaptador → `*Viz.js`) | 1 | `ranking_with_states` |

`status`:

- `implemented` — hay renderer en `js/templates/` y se usa en runtime.
- `catalog_only` — contrato listo; la vista aún usa `*Viz.js` legacy.
- `alias` / `reserved` — no usar en indicadores nuevos.

## Cómo se configura un indicador

En `catalog.json`, bloque `presentation`:

```json
"presentation": {
  "template": "ranking_dual_bars",
  "sort_by": "pob_tot",
  "sections": ["top5", "middle", "bottom5"],
  "bar_metrics": ["pob_tot_2010", "pob_tot"],
  "legend_labels": ["2010", "2020"],
  "title": "Población total por municipios seleccionados 2010 y 2020",
  "root_class": "poblacion-viz",
  "footer": "Fuente: INEGI. …"
}
```

Las claves **requeridas** dependen del preset (`config.required` en `presentation_presets.json`). El backend valida al cargar el catálogo:

- `template` debe existir en presets (o reserved/alias).
- Si el preset exige `bar_metrics` / `chart_metrics` / `sort_by`, deben estar presentes.
- Cada `bar_metrics[]` debe coincidir con un `fields[].key` del indicador.

## Verificación

Reinicia el API (módulo nuevo):

```bat
docker compose restart api_backend
```

En el navegador:

```
http://localhost:850/api/indicators/presentation-presets
```

Debe listar 6 presets en `presets[]`.

```
http://localhost:850/api/indicators/validate
```

En `summary.presentation` / `presentation`:

- `presets_total`: 6
- `presets_implemented`: 1
- `presets_catalog_only`: 5
- `indicators_by_preset`: mapa preset → ids de indicadores

Consola (opcional, tras Ctrl+F5):

```js
const m = await import("./js/presentationPresets.js");
const p = await m.loadPresentationPresets();
console.log(p.presets.map(x => x.id + ":" + x.status));
```

## Relación con el roadmap

- **Fase 7:** contrato de presets ✅
- **Fase 8:** las 17 vistas pasan por `runIndicatorView` + presets ✅ (adaptadores a `*Viz.js` para preservar CSS)
- **Fase 10:** unificar CSS y eliminar `*Viz.js`
- **Fase 11 (Studio):** el wizard listará estos presets en el paso “Presentación”

Ver también: `INDICADORES_ROADMAP.md`, `INDICADORES_ETL.md`.
