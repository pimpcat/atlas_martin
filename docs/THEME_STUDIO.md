# Theme Studio — identidad de color (data-driven)

Wizard admin para personalizar colores de los temas **claro** y **oscuro** sin editar CSS.
Misma sesión JWT (`visor_admin`) que Visor Studio e Indicators Studio.

**Documentos relacionados:** [`SEGURIDAD.md`](./SEGURIDAD.md) · [`VISOR_STUDIO.md`](./VISOR_STUDIO.md) · catálogo en `config/theme/README.md`

---

## Por qué data-driven

La identidad visual es **estado de la instalación**, no código del front. Cada institución personaliza su despliegue; el toggle claro/oscuro del usuario final se mantiene.

---

## Arranque

URL (no enlazada desde el portal público):

```text
http://127.0.0.1:850/atlas_gro/theme-studio.html
```

También desde Visor Studio / Indicators Studio (botones cruzados).

Tras cambios de backend/compose (CMD):

```bat
cd /d C:\Stack_Martin
docker compose up -d --force-recreate api_backend
```

Luego **Ctrl+F5** en el portal.

---

## Catálogo canónico

| Pieza | Ruta host |
|-------|-----------|
| Catálogo | `C:\Stack_Martin\config\theme\catalog.json` |
| Defaults de fábrica | `C:\Stack_Martin\config\theme\catalog.defaults.json` |
| Schema (whitelist) | `C:\Stack_Martin\config\theme\schema.json` |
| Docker | `./config/theme` → `/config/theme` · `THEME_CATALOG_PATH` |

Al guardar: `catalog.json.bak` + `catalog.json.bak.{timestamp}`.

Fallback: si el API no responde, siguen los valores de `css/layout.css`.

---

## API

| Método | Ruta | Auth |
|--------|------|------|
| GET | `/api/theme/catalog` | Público (portal) |
| GET | `/api/theme/schema` | Público |
| GET | `/api/theme/admin/meta` | JWT admin (schema + defaults) |
| GET | `/api/theme/admin/catalog` | JWT admin |
| PUT | `/api/theme/admin/catalog` | JWT admin · body `{ "catalog": { ... } }` |

Runtime portal: [`js/theme.js`](../js/theme.js) carga el catálogo y aplica `document.documentElement.style.setProperty` tras `data-theme`.

---

## Alcance v1

Incluye: shell, texto, acentos, tarjetas, gráficas, Bootstrap body.  
No incluye: logos, tipografía, branding PDF (`cartography_engine/assets/branding.json`).

---

## Checklist de prueba

1. Abrir Theme Studio → login admin.
2. Editar `--shell-bg` del tema claro → vista previa cambia.
3. Guardar → comprobar `config/theme/catalog.json` y `.bak`.
4. Abrir Atlas (Ctrl+F5) → colores aplicados; toggle claro/oscuro sigue funcionando.
5. Tema oscuro: mismo flujo.
6. Restaurar defaults → editor vuelve a fábrica → Guardar para persistir.

---

## Installer / release

- `pack_stack.bat` copia `config\theme` (y `config\visor`) al stack del release.
- Manifest `resources.theme_config`: `resources/config/theme` → `config/theme` en el destino.
- En destino: `C:\GroSIG\config\theme` + bind en `docker-compose.yml` del stack.

Para refrescar el resource del kit (CMD):

```bat
mkdir "d:\...\GroSIG_releases\1.0.0\resources\config\theme" 2>nul
xcopy /E /I /Y "C:\Stack_Martin\config\theme\*" "d:\...\GroSIG_releases\1.0.0\resources\config\theme\"
```
