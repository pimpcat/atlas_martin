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
- **Indicators Studio** — catálogo de indicadores
- **Theme Studio** — colores claro/oscuro
- **Data Refresh Studio** — ETL espacial (SHP/ZIP)
- **Cartografía (1.x)** — abre el Visor (`index.html?visor=1`); use el panel Cartografía si el motor está activo. No hay Cartography Studio separado en 1.x.
- **Atlas** — portal público
- **Usuarios** — atajo a Visor Studio

Bloque de estado: health Atlas API, Geography Context, Cartography Engine (informativo).

## Navegación

Todos los Studios montan `mountStudioNav(..., { active })` para no depender de URLs sueltas.

## Relacionado

- [DATA_REFRESH_STUDIO.md](./DATA_REFRESH_STUDIO.md)
- [GEOGRAPHY_CONTEXT.md](./GEOGRAPHY_CONTEXT.md)
- Manual del Administrador § acceso a Studios
