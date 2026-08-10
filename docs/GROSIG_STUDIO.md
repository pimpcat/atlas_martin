# GroSIG Studio (Home administrativo)

Punto de entrada único para administración del framework.

| Campo | Valor |
|-------|--------|
| URL | `/atlas_gro/grosig-studio.html` |
| Auth | JWT admin (`visorAdminAuth.js`, misma sesión que el resto de Studios) |
| Nav | `js/studioNav.js` (compartida) |

## Qué incluye el hub

Tarjetas hacia:

- **Visor Studio** — capas, simbología, usuarios
- **Geography Studio** — pestañas Datos Geográficos
- **INV Studio** — Inventario de Viviendas (secciones / campos `c_inv`)
- **Explorer Studio** — colores/grosores del Explorador Municipal
- **Indicators Studio** — catálogo de indicadores
- **Theme Studio** — colores claro/oscuro
- **Data Refresh Studio** — ETL espacial (SHP/ZIP)
- **Cartography Studio** — branding de tiras (logo, institución, advertencias, fechas); solo si `GET /api/cartography/health` indica Engine vivo. La generación de PDF/SVG sigue en el panel Cartografía del Visor
- **Atlas** — portal público
- **Usuarios** — atajo a Visor Studio

Bloque de estado: health Atlas API, Geography Context, **Cartography Engine** vía el contrato Core `GET /api/cartography/health` (mismo sondeo que el Visor; ver [`cartographyHealth.js`](../js/cartographyHealth.js)).

## Navegación

Todos los Studios montan `mountStudioNav(..., { active })` para no depender de URLs sueltas.

## Relacionado

- [DATA_REFRESH_STUDIO.md](./DATA_REFRESH_STUDIO.md)
- [GEOGRAPHY_CONTEXT.md](./GEOGRAPHY_CONTEXT.md)
- [INV_ENGINE.md](./INV_ENGINE.md)
- [EXPLORER_STUDIO.md](./EXPLORER_STUDIO.md)
- Manual del Administrador § acceso a Studios
