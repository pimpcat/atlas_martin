# GroSIG Studio (Home administrativo)

Punto de entrada único para administración del framework.

| Campo | Valor |
|-------|--------|
| URL canónica (v2) | `/atlas_gro/grosig-studio.html` → redirect a `grosig-studio-v2.html` si `GROSIG_STUDIO_UI=v2` |
| URL shell v2 | `/atlas_gro/grosig-studio-v2.html` |
| Auth | JWT admin (`visorAdminAuth.js`, misma sesión en v2 y legacy) |
| Nav v2 | Menú lateral (`studio-v2/js/shell/navigation.js`) |
| Nav legacy | `js/studioNav.js` (hub tarjetas + barra compartida) |

## GroSIG Studio 2 (recomendado)

Con cutover Fase D, el shell **v2** unifica módulos en sidebar:

| Grupo | Módulos |
|-------|---------|
| Contenido | Resumen, Visor geográfico, Datos geográficos, Indicadores, INV, Explorador municipal |
| Diseño | Cartografía, Tema |
| Operaciones | Actualización de datos, Studio Respaldo, Atlas (portal) |
| Administración | **Usuarios y roles**, Instancias (Nodo) |

- **Visor geográfico** — catálogo de capas (Publicar / Gestionar inline) + enlace al mapa admin.  
- **Usuarios y roles** — cuentas admin y Mi contraseña (ya no en Visor geográfico).  
- **Mapa** (`index.html?visor=1`) — iconos + / engranaje en panel Capas (mismo asistente, modal).

Variables: `GROSIG_STUDIO_UI`, `GROSIG_NODO_STUDIO_UI` en `.env`. Doc: `docs/GroSIG_Studio_2_Fase_D_Cierre_y_Cutover.md`.

## Hub legacy (contingencia)

Si `GROSIG_STUDIO_UI=legacy` o `?ui=legacy`, tarjetas hacia `*-studio.html`:

- Visor Studio — capas, simbología *(usuarios solo en legacy o v2 Administración)*  
- Geography, INV, Explorer, Indicators, Theme, Data Refresh, Cartography, Backup  
- **Generar cartografía** — atajo a `index.html?visor=1`  
- **Atlas** — portal público (`index.html`)

Bloque de estado (legacy hub): health Atlas API, Geography Context, Cartography Engine (`GET /api/cartography/health`).

## Norma canónica — Atlas vs Abrir visor (1.0)

| Acción | Efecto |
|--------|--------|
| Nav **Atlas (portal)** / tarjeta Atlas | Vista ciudadana. Login en Studios no cambia esta página. |
| **Abrir visor en el mapa** (Visor geográfico v2 o legacy) | `?visor=1` → Visor geográfico; con JWT → Capas admin + Generate |

Congelado 2026-08-12 (endurecimiento Internet S1). No mezclar portal público con herramientas de dependencia.

## Navegación

- **v2:** router `?view=…` en `#grosig-workspace` (`workspaceRouter.js`).  
- **legacy:** `mountStudioNav(..., { active })` en cada `*-studio.html`.

## Relacionado

- [DATA_REFRESH_STUDIO.md](./DATA_REFRESH_STUDIO.md)
- [GEOGRAPHY_CONTEXT.md](./GEOGRAPHY_CONTEXT.md)
- [INV_ENGINE.md](./INV_ENGINE.md)
- [EXPLORER_STUDIO.md](./EXPLORER_STUDIO.md)
- [Manual del Administrador](../../docs/manuales/MANUAL_ADMINISTRADOR_GroSIG.md) § acceso a Studios
