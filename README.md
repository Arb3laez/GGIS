# Cotizador GGIS

Cotizador de GYG Innova Solutions SAS (CCTV, incendios, control de acceso, antihurto, SOLT). Es la versión modular del cotizador de un solo archivo (`cotizador-ggis-v68.html`).

Es un **monolito**: un solo despliegue, con el código dividido en dos carpetas.

| Carpeta | Qué contiene |
|---|---|
| **`backend/`** | API en Express 5 + SQLite (`node:sqlite`). En producción también sirve el front. |
| **`backend/domain/`** | Reglas de negocio puras: precios, nómina 2026, AIU, cierre real, indicadores. El front las importa para calcular en vivo. |
| **`front/`** | Interfaz en React 18 + Vite + TanStack Query + Zustand. Solo habla con el backend por `/api`. |

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Requisitos

- Node.js 22.13 o superior (recomendado 24).
- Opcional: Docker.

## Arranque en desarrollo

```bash
npm install
```

```bash
copy .env.example .env
```

```bash
npm run dev
```

- Web: http://localhost:5173 (con recarga en vivo)
- API: http://127.0.0.1:4000/api/health

Los datos quedan en `backend/data/` (base SQLite y adjuntos). Esa carpeta no se versiona.

### Lectura de cotizaciones de proveedor con IA (opcional)

Define `ANTHROPIC_API_KEY` en `.env` (nunca en el código ni en el navegador). Sin la llave, la importación de PDF usa el lector de texto del PDF y las imágenes quedan solo como adjunto.

### Logos

Los logos de la oferta están en `front/public/brand/`. Si cambian, se pueden volver a extraer del HTML original:

```bash
npm run legacy:extract-assets -- "C:\ruta\cotizador-ggis-v68.html"
```

## Migrar los datos del cotizador anterior (v40–v68)

1. En el cotizador anterior: **Cotizaciones guardadas → Exportar todas (respaldo)**. Se descarga `cotizaciones-ggis-AAAA-MM-DD.json`.
2. En este cotizador: **Cotizaciones → Importar respaldo** y elige ese archivo.

Se conservan los números OT (si están libres), los estados, la bitácora de cierre y los adjuntos. El archivo de respaldo contiene datos de clientes: guárdalo solo en el almacenamiento corporativo aprobado y bórralo de Descargas después de importarlo.

### Cotizaciones con licitación / APU (función retirada)

La tarjeta **Licitación / APU** ya no existe. Las cotizaciones que se guardaron con el método `AIU licitación` (precio unitario = costo directo) se convierten a **AIU** al abrir la base o importar un respaldo, y se descartan los insumos y el APU. El precio de esas cotizaciones se recalcula: revísalo antes de reenviarlas.

## Producción

```bash
npm run build
```

```bash
npm start
```

O con Docker (datos en el volumen `ggis-data`; solo escucha en este equipo):

```bash
docker compose up -d --build
```

Luego abre http://localhost:4000.

## Calidad

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

- 245 pruebas del dominio, incluidas 200 de **paridad** del método simple contra las fórmulas originales de la v68.
- 19 pruebas de integración HTTP del backend (SQLite en memoria).
- El AIU se calcula en una sola capa sobre el costo directo: A + I + U, con IVA solo sobre la U y redondeo del IVA desde la utilidad exacta.

## Estructura

```
backend/
  src/
    main.ts               arranque del servidor
    app.ts                composición del monolito (módulos + middleware)
    config.ts             configuración validada
    db/                   conexión SQLite y migraciones
    modules/<módulo>/     routes → service → repositorio
  domain/src/             reglas de negocio (compartidas con el front)
    constants.ts          catálogos, parámetros laborales 2026, plantillas
    schemas.ts            esquemas zod (fuente única de la forma de los datos)
    pricing/              motor de precios, nómina, sugerencias y alertas
    closure/              costo real, auditoría paralela, precio objetivo
    analytics/            indicadores, seguimientos, recomendación histórica
    importers/            lectores de Excel, texto de PDF y filas pegadas
    legacy/               migración del respaldo v68
front/
  src/
    api/                  único punto de contacto con el backend
    features/editor       edición de la cotización (secciones)
    features/quotes       listado, indicadores, respaldo
    features/offer        oferta al cliente (imprimir/HTML/correo)
    features/settings     datos de la empresa
  public/brand/           logos
```

## Pendientes recomendados

1. **Autenticación** (SSO corporativo o detrás de un proxy con autenticación) antes de exponer la app en la red. Hoy solo escucha en el equipo local.
2. **Validar con el área comercial/contable** dos reglas heredadas de la v68:
   - El IVA del proveedor (`¿+IVA 19%?`) se suma como costo; si es IVA descontable, infla el costo.
   - Los márgenes del cierre y de los indicadores comparan contra el total **con IVA** (igual que la v68).
3. PostgreSQL si varias personas van a usarlo a la vez desde distintos equipos.
4. Pruebas de interfaz (Playwright) para los flujos principales.
