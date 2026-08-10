# Explorer Studio

Estilos visuales **mínimos** del **Explorador Municipal** (home del Atlas).

| Campo | Valor |
|-------|--------|
| Studio | `/atlas_gro/explorer-studio.html` |
| Catálogo | `config/explorer/catalog.json` (`EXPLORER_CATALOG_PATH`) |
| Público | `GET /api/explorer/catalog` |
| Admin | `GET\|PUT /api/explorer/admin/catalog` (JWT) |
| Runtime | `js/explorerCatalog.js` → `map.js` (modo home) |

## Qué configura (1.0)

| Bloque | Controles |
|--------|-----------|
| Estado | Color y grosor de línea estatal |
| Municipios | Color y grosor de línea municipal |
| Selección | Color de relleno al seleccionar municipio (opacidad fija 0.42) |

**No incluye:** KPIs, layout, extent, Theme UI, Visor statewide, flag/health.

## Contrato del catálogo

```json
{
  "version": 1,
  "estado": { "line_color": "#0f172a", "line_width": 2.4 },
  "municipios": { "line_color": "#475569", "line_width": 1.25 },
  "municipio_seleccionado": { "fill_color": "#008b8b", "fill_opacity": 0.42 }
}
```

Validación: hex `#RRGGBB`, grosores `0.5–12`, opacity `0–1`.

## Compose

```env
EXPLORER_CATALOG_PATH=/config/explorer/catalog.json
```

Bind `./config/explorer` en `api_backend` (y Apache ro). Tras el volumen nuevo:

```bash
docker compose up -d api_backend web_apache
```

## Smoke

1. Abrir Explorer Studio → cambiar color de selección → **Publicar**.
2. Atlas Ctrl+F5 → Inicio (Explorador) → seleccionar municipio → relleno nuevo.
3. Cambiar grosor/color de líneas estatal y municipal → verificar a vista estatal.
4. **Restaurar defaults** + publicar → vuelve al look original.
