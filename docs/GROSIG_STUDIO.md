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
- **Generar cartografía** — atajo a `index.html?visor=1` (Visor; Generate solo con JWT)
- **Atlas** — portal **público** (`index.html`). **No** eleva a Capas admin ni Cartografía. Para eso: Visor Studio → **Abrir visor**
- **Usuarios** — atajo a Visor Studio

Bloque de estado: health Atlas API, Geography Context, **Cartography Engine** vía el contrato Core `GET /api/cartography/health` (mismo sondeo que el Visor; ver [`cartographyHealth.js`](../js/cartographyHealth.js)).

## Norma canónica — Atlas vs Abrir visor (1.0)

| Acción | Efecto |
|--------|--------|
| Nav **Atlas** / tarjeta Atlas | Vista ciudadana. Login en Studios no cambia esta página. |
| **Abrir visor** (Visor Studio) o tarjeta Generar cartografía | `?visor=1` → Visor geográfico; con JWT → Capas admin + Generate |

Congelado 2026-08-12 (endurecimiento Internet S1). No mezclar portal público con herramientas de dependencia.

## Navegación

Todos los Studios montan `mountStudioNav(..., { active })` para no depender de URLs sueltas.

## Relacionado

- [DATA_REFRESH_STUDIO.md](./DATA_REFRESH_STUDIO.md)
- [GEOGRAPHY_CONTEXT.md](./GEOGRAPHY_CONTEXT.md)
- [INV_ENGINE.md](./INV_ENGINE.md)
- [EXPLORER_STUDIO.md](./EXPLORER_STUDIO.md)
- Manual del Administrador § acceso a Studios
