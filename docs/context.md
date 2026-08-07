# Context — GroSIG Cartography Engine (índice handoff)

> **Handoff vigente condensado estatal:**  
> **[`context-condensado.md`](./context-condensado.md)** (cómo lo construimos) ·  
> [`CONTEXT_CONDENSADO_ESTATAL.md`](./CONTEXT_CONDENSADO_ESTATAL.md) (checklist corto)  
> **Handoff vigente croquis municipal:**  
> **[`CONTEXT_CROQUIS_MUNICIPAL.md`](./CONTEXT_CROQUIS_MUNICIPAL.md)** ← croquis 90×70  
> Handoff planos / PLR / PLU / multipágina: [`CONTEXT_PLANO_LOCALIDAD_PLU.md`](./CONTEXT_PLANO_LOCALIDAD_PLU.md)  
> Doc operativa completa: [`CARTOGRAPHY_ENGINE.md`](./CARTOGRAPHY_ENGINE.md)  
> Installer / respaldos del stack: [`docs/STACK_INSTALLER_Y_RESPALDOS.md`](../../../docs/STACK_INSTALLER_Y_RESPALDOS.md)  
> Theme Studio (colores claro/oscuro data-driven): [`THEME_STUDIO.md`](./THEME_STUDIO.md)  
> Engine al corte: **1.12.49** (22 jul 2026, noche)

---

## Qué es

Motor de cartografía vectorial (`app_api/cartography_engine/`).  
No imprime MapLibre: PDF/GeoPDF/SVG desde PostGIS (`GroSIG_Cartography`).

Productos: plano de localidad (PLR/PLU ± multipágina ± paquete índice 90×120), croquis municipal, condensado estatal, atlas municipal.

---

## Decisiones base

| Tema | Valor |
|------|--------|
| BD cartografía | `CARTOGRAPHY_DATABASE_URL` (separada del Atlas) |
| Flag | `CARTOGRAPHY_ENGINE_ENABLED=true` |
| GeoPDF | pikepdf + pyproj (sin GDAL Python) |
| Plano localidad | Papel `dcarta_42x28` landscape |
| Croquis municipal | Plotter `90×70`, `pad_ratio=0.04` (no abrir zoom sin pedirlo) |
| Condensado estatal | Plotter `90×120` landscape = **120×90 cm**; handoff [`CONTEXT_CONDENSADO_ESTATAL.md`](./CONTEXT_CONDENSADO_ESTATAL.md) |
| Idioma | Español |

---

## Rutas

```
app_api/cartography_engine/
htdocs/atlas_gro/docs/CARTOGRAPHY_ENGINE.md
htdocs/atlas_gro/docs/context-condensado.md
htdocs/atlas_gro/docs/CONTEXT_CONDENSADO_ESTATAL.md
htdocs/atlas_gro/docs/CONTEXT_CROQUIS_MUNICIPAL.md
htdocs/atlas_gro/docs/CONTEXT_PLANO_LOCALIDAD_PLU.md
htdocs/atlas_gro/js/cartographyClient.js
sql/cartography/
docs/STACK_INSTALLER_Y_RESPALDOS.md
```
