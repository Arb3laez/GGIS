# Arquitectura del Cotizador GGIS

Este proyecto es un **monolito**: se despliega como un solo proceso. El código está dividido en dos carpetas, `backend/` y `front/`. En producción el backend sirve la API y también el front compilado.

```
Cotizador-GyG/                         (un solo despliegue: Docker o `npm start`)
│
├── front/      React + Vite            ─ features/editor · quotes · offer · settings
│     │                                  ─ api/  ← único punto que llama al backend
│     │   HTTP /api
│     ▼
├── backend/    Express 5               ─ modules/quotes · catalog · attachments · imports
│     │                                  ─ modules/exchange-rate · analytics · backup · reports · settings
│     │                                  ─ db/  SQLite (data/cotizador.sqlite) + data/attachments/
│     │
│     └── domain/  TypeScript puro, sin I/O
│                  esquemas · motor de precios · nómina · cierre · indicadores · importadores
│                  (lo usa el backend y lo importa el front para calcular en vivo)
```

## Capas

| Capa | Dónde | Responsabilidad | Regla |
|---|---|---|---|
| **Dominio** | `backend/domain` | Fórmulas de precio, nómina (CST 2026), AIU, cierre real, indicadores, lectores de Excel/PDF/texto, migración del formato v68 | Sin I/O, sin React, sin Express. 100% probado con pruebas unitarias. |
| **Backend** | `backend/src/modules/*` | Persistencia, numeración consecutiva, adjuntos, IA, TRM, reportes Excel, respaldo | Cada módulo tiene `*.routes.ts` (HTTP) → `*.service.ts` (casos de uso) → repositorio/SQL. Las rutas no tienen lógica de negocio. |
| **Front** | `front/src/features/*` | Interfaz | Calcula en vivo con el **mismo** dominio; el servidor recalcula al guardar. |

### Por qué el dominio es compartido
En la v68 las fórmulas vivían mezcladas con el DOM. Ahora hay una sola implementación (`computeQuote`), y la usan:
- la web, para mostrar los totales mientras se edita;
- la API, para guardar los totales del listado sin confiar en lo que envía el navegador;
- los reportes (Excel de análisis de costos y oferta).

La prueba `backend/domain/src/pricing/engine.test.ts` compara el motor nuevo contra una copia de las fórmulas originales de la v68 en 200 cotizaciones aleatorias. Si alguien cambia una fórmula sin querer, esa prueba falla.

## Módulos de la API

| Ruta | Módulo | Qué hace |
|---|---|---|
| `GET/POST /api/quotes`, `GET/PUT/DELETE /api/quotes/:id` | quotes | CRUD. El número `OT-0001` lo asigna el servidor en una transacción. `PUT` exige `version` (control de concurrencia optimista: 409 si otra persona guardó antes). `DELETE` es borrado lógico. |
| `PATCH /api/quotes/:id/status`, `POST /api/quotes/:id/duplicate`, `POST /api/quotes/:id/supersede` | quotes | Cambio rápido de estado, duplicado y sustitución (la anterior queda como Sustituida y vinculada a la nueva). |
| `GET /api/quotes/:id/cost-analysis.xlsx` | reports | Hoja interna de análisis de costos (4 pestañas). |
| `GET/POST /api/quotes/:id/attachments`, `GET /api/attachments/:id/file` | attachments | Adjuntos en disco. El tipo real se detecta por los primeros bytes del archivo. |
| `POST /api/imports/spreadsheet` · `/document` · `/text` | imports | Previsualización de ítems desde Excel/CSV, PDF/imagen (IA en el servidor, o texto del PDF como respaldo) o filas pegadas. |
| `GET /api/catalog` | catalog | Catálogo de materiales que se aprende al guardar. |
| `GET /api/exchange-rate` | exchange-rate | TRM oficial (Superfinanciera vía datos.gov.co) con respaldo de tasa de mercado; caché en memoria. |
| `GET /api/analytics/dashboard` · `/history` | analytics | Indicadores comerciales, precisión del presupuesto y recomendación histórica. |
| `GET /api/backup/export`, `POST /api/backup/import` | backup | Respaldo JSON. Importa también el formato del cotizador v40–v68. |
| `GET/PUT /api/settings/company` | settings | Datos de la empresa y firma para la oferta (antes estaban fijos en el código). |

Errores: siempre `{"error": {"code", "message", "details?"}}`, con códigos HTTP correctos (422 validación, 404, 409 conflicto, 413 archivo grande, 503 servicio externo).

## Datos

- **SQLite** usando el módulo que trae Node (`node:sqlite`), sin dependencias nativas. Las migraciones están en `backend/src/db/migrations.ts` y se versionan con `PRAGMA user_version`.
- La tabla `quotes` guarda la cotización completa como JSON (`data`), más columnas de resumen indexadas (estado, unidad, totales) para el listado y los indicadores.
- Los adjuntos van en `backend/data/attachments/` (en Docker, en el volumen `/data`) (no en la base ni en el navegador).
- La migración `v3` retiró la función de licitación/APU: las cotizaciones guardadas con el método `aiu_bid` pasan a `aiu` y se descartan los campos `bid`, `supplies` y `apuParams`.
- **Para varios usuarios en red:** el acceso a datos está aislado en repositorios/servicios. Pasar a PostgreSQL implica cambiar `db/` y los repositorios, sin tocar dominio ni web.

## Seguridad

- La llave de la IA (`ANTHROPIC_API_KEY`) vive **solo** en el servidor (variable de entorno). El navegador nunca la ve.
- Por defecto la API escucha en `127.0.0.1` (solo este equipo). **No hay autenticación de usuarios todavía**: antes de exponerla en red, pon un proxy con autenticación (SSO corporativo) o agrega el módulo de autenticación (ver pendientes en el README).
- Validación con zod en toda entrada, cabeceras de seguridad con helmet (CSP), CORS restringido, límite de tamaño de archivos, límite de frecuencia en la lectura con IA, detección del tipo real de los archivos y nombres en disco sin datos del usuario.
- El repositorio **no contiene datos de clientes**. La v68 traía 28 cotizaciones reales embebidas; aquí se cargan solo importando un respaldo, y `data/` y los respaldos `.json` están en `.gitignore`.

## Decisiones que cambiaron respecto a la v68

| v68 | Ahora | Motivo |
|---|---|---|
| `localStorage` del navegador | SQLite en el servidor | Los datos ya no se pierden al borrar el navegador, se comparten y se pueden respaldar. |
| Número OT por navegador | Consecutivo en el servidor | Evita números duplicados entre equipos. |
| Adjuntos en base64 dentro de la cotización | Archivos en disco | El tamaño de las cotizaciones ya no llena el almacenamiento. |
| `fetch` a la API de IA desde el navegador, sin llave | Proxy en el servidor con SDK oficial y salida estructurada | Funciona fuera de claude.ai y no expone credenciales. |
| TRM de mercado (open.er-api) | TRM oficial con respaldo | Es la tasa que aplica en Colombia. |
| PDF con html2pdf (imagen rasterizada) | Imprimir → Guardar como PDF (texto real) + HTML descargable | El PDF queda con texto seleccionable y más liviano. |
| Datos de la empresa y firma en el código | Pantalla de Configuración | Se cambian sin tocar código. |
| Recalcular todo O(n²) en cada tecla | Una pasada O(n) memoizada | Rendimiento con muchos ítems. |
