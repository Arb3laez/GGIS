# Reunión 2026-10-18 10:04 — Cotizador GGIS

**Fuente:** `Grabación 2026-10-18 100404.mp4` (11:35 min, 708 MB)
**Transcripción:** [transcripcion-reunion-2026-10-18.txt](transcripcion-reunion-2026-10-18.txt) (Whisper `small`, español; hay voz cruzada y errores de reconocimiento).

## Estado de implementación

- **Tarea 2 (Sustituida + vínculo):** implementada. La lista tiene la acción “Sustituir”, la anterior queda como Sustituida y ambas quedan vinculadas por número de OT.
- **Tarea 4 (tubería por longitud):** implementada. En ítems de tubería con unidad ML se elige la longitud comercial (6, 5,8, 3, 2 o 1 m) y se calculan los tubos necesarios.

## Contexto

Revisión del cotizador en `localhost:3000` entre Diego y León. Se confirma que la sección **APU ya no está**. La conversación mezcla cuatro frentes: tablero por unidad de negocio, estados/servicio de la cotización, cálculo de tubería y horas, y una propuesta comercial con CRM. Hay tramos de conversación personal que no son instrucciones.

## Instrucciones detectadas

### 1. Tablero por unidad de negocio (00:31–00:59)

- No quieren un tablero genérico: **un tablero por cada unidad de negocio** (CCTV, incendios, control de acceso, antihurto, SOLT).
- Hoy el tablero es uno solo con filtros por unidad.
- Falta definir qué indicadores propios tendría cada tablero; la conversación no lo detalla.

### 2. Estado “Sustituida” (01:01–01:33)

- Cambiar la etiqueta **“Reemplazada” por “Sustituida”**.
- Una cotización con un nuevo requerimiento **sustituye** a la anterior, no la “reemplaza”.
- Se menciona que “las que están juntas” van en negociación; no queda claro si piden agrupar o vincular la cotización nueva con la sustituida.

### 3. Servicio por unidad de negocio (02:00–03:57)

- Agregar el **tipo de servicio** de la cotización, junto a la unidad de negocio.
- Opciones mencionadas: **suministro, suministro + instalación, mantenimiento preventivo, mantenimiento correctivo y solo suministro**.
- Se debe leer como “CCTV · Mantenimiento preventivo” en el encabezado y en el listado.
- Falta confirmar el catálogo exacto y si “instalación” puede ir sola.

### 4. Tubería por longitudes comerciales (04:00–05:30)

- Idea de una **casilla para dividir** la tubería por longitudes de **6 m, 5.8 m y 3 m**; la unidad siempre es **ML**.
- Se menciona “6 la va a dividir entre esas ML y pongamos un metro”.
- No queda claro si el cálculo es número de tubos, precio por tubo o metros de desperdicio. **Requiere la regla exacta.**

### 5. Calculadora de horas (05:40–07:20)

- Piden una calculadora de **horas extras, recargo nocturno y dominical**.
- El editor ya tiene el desglose de 7 tipos de horas al marcar “Extra/noche” en **Personal**, con hora ordinaria y costo extra.
- Confirmar si se refieren a esa misma calculadora o a una nueva (por ejemplo, a partir de hora de entrada y salida).

### 6. Oferta comercial + CRM + fotos (07:50–10:15)

- La oferta actual “es solo un PDF” y “no es comercial”.
- Quieren una propuesta con datos del cliente, historial/ofertas (CRM), contenido explicativo y **fotos por solución** (ejemplo: extinción de incendios según la norma).
- Es un alcance grande y separado del cotizador actual. Falta definir si el CRM será un módulo de esta app o un proyecto aparte, y cuál sería la primera versión.

### 7. APU (01:49–01:54 y 09:36–09:48)

- Confirman que el APU ya no está. No es una tarea nueva; coincide con el cambio ya hecho.

## Lo que ya existe

- Filtros por unidad en el tablero (pero no tableros independientes).
- Resumen de cotización con el nuevo formato.
- Calculadora de horas extras y recargos en **Personal**.
- Sección APU retirada.

## Ruido

Las referencias a una muñequera, una hamburguesa, una llamada personal y la despedida no son instrucciones.

## Preguntas para cerrar el alcance

1. **Tablero:** ¿qué métricas debe tener cada unidad? ¿Los mismos KPIs filtrados o indicadores propios?
2. **Servicio:** ¿lista definitiva y si depende de la unidad de negocio?
3. **Tubería:** ¿cuál es la regla exacta de división y qué debe mostrar (tubos, precio o desperdicio)?
4. **Horas:** ¿la calculadora actual o una nueva desde horas de entrada/salida?
5. **CRM / oferta:** ¿qué debe incluir la primera versión y si entra en este proyecto?
