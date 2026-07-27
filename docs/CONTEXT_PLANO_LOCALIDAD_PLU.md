# Context — Plano de localidad PLR/PLU + multipágina (handoff)

**Fecha corte:** 20 jul 2026  
**Proyecto:** `C:\Stack_Martin`  
**Engine:** `app_api/cartography_engine/` v**1.11.0**  
**Doc operativa:** [`CARTOGRAPHY_ENGINE.md`](./CARTOGRAPHY_ENGINE.md)

Usar este archivo al abrir un chat nuevo. **No** re-explorar el stack desde cero.

---

## Resumen ejecutivo

| Producto | Estado |
|----------|--------|
| **PLR 1 hoja** (`001/0143`) | Validado / **congelado** |
| **PLU 1 hoja** overview (`029/0001`) | Validado / **congelado** (zoom L+PE) |
| **PLU multipágina** detalle | Usable; tipografía y vialidad propias |
| **PLU paquete** | 1ª hoja plotter **90×120** (índice) + N cartas **42×28** (`package=index_plotter`) |

---

## Casos de prueba

| Caso | Mun/Loc | Params | Notas |
|------|---------|--------|--------|
| Rural | `001` / `0143` | sin multipage | Regresión |
| Urbano overview | `029` / `0001` | sin multipage | Armado `1 de 1` |
| Urbano detalle | `029` / `0001` | `multipage: true` | Cartas sueltas ~1:7 500 |
| Urbano paquete | `029` / `0001` | `multipage` + `package: index_plotter` | Índice 90×120 + cartas |

---

## Arquitectura

```
plano_localidad
  ├─ ámbito rural  → plano_localidad_rural.json   (PLR, 1 hoja)
  └─ ámbito urbano → plano_localidad_urbana.json  (PLU)
                       ├─ default                    → 1 hoja overview (dcarta)
                       ├─ multipage=true             → N cartas detalle (dcarta)
                       └─ multipage + package        → 1 plotter 90×120 + N cartas
```

Grilla de tiles **siempre** con `map_frame` de doble carta (no cambia N/escala al añadir el índice).

---

## Portal

- Checkbox «Cartas detalle (solo urbanas)»
- Selector **Armado**: paquete plotter 90×120 + cartas (default) | doble carta sueltas

---

## Smoke

```cmd
smoke_out\smoke_plu_multipage.bat
```

Paquete:

```cmd
curl.exe -s -w "\nHTTP:%{http_code} SIZE:%{size_download}\n" -X POST http://localhost:850/api/cartography/generate -H "Content-Type: application/json" -d "{\"template_id\":\"plano_localidad\",\"format\":\"pdf\",\"params\":{\"cve_mun\":\"029\",\"cve_loc\":\"0001\",\"cve_ent\":\"12\",\"multipage\":true,\"package\":\"index_plotter\"}}" --output smoke_out\plano_029_0001_pkg.pdf --max-time 600
```

---

## Pendiente (opcional)

- Igualar N/orden de grilla a la referencia Chilpancingo (~7 hojas).
- Croquis / condensado (fuera del foco plano localidad).

---

## Prompt corto siguiente chat

> Retoma `CONTEXT_PLANO_LOCALIDAD_PLU.md` y `CARTOGRAPHY_ENGINE.md`. Engine **1.11.0**. PLR/PLU 1 hoja congelados. Paquete: índice 90×120 + cartas dcarta. No romper overview ni tipografía MP. Responder en español.
