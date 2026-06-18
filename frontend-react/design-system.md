# SiteGuard — Landing «Telemetría» · sistema de diseño

Dirección elegida para la landing pública (`/`). El resto de la app mantiene el
sistema HUD existente (`tailwind.config.js` + `src/index.css`); esto es la capa
de marca de la portada.

## Tesis
La landing **es un instrumento de sala de control encendido**: un osciloscopio de
**tres canales iguales** —Obra (EPP), Vía (Conductor), Red (Seguridad)— vigilando
los tres frentes a la vez. Ningún módulo tiene protagonismo; los tres pesan igual.

## Color (tokens)
| token | hex | uso |
|---|---|---|
| `void` | `#07090A` | fondo del instrumento (más negro que el HUD `#0a0a0b`) |
| `phosphor` | `#FFB000` | marca, CTA, palabra-acento del titular (= `amber-400`) |
| `trace` | `#38E1C6` | traza de señal del osciloscopio (las 3 iguales) |
| `alarm` | `#FF3B30` | evento/umbral cruzado (= `alarm-400`) |
| `bone` | `#E8E6DF` | texto principal (= `hud-bone`) |
| `dim` | `#8a9094` | etiquetas mono, secundario (AA sobre void) |

Las 3 trazas comparten color (`trace`) **a propósito**: igualdad = sin jerarquía
de color. Se distinguen por su **forma de señal** (cumplimiento escalonado / onda
EAR / tren de picos) y su etiqueta, no por el tono.

## Tipografía
- **Display:** `Martian Mono` (mono técnico con carácter) — titulares y datos, en mayúsculas, con moderación.
- **Body:** `IBM Plex Sans` — todo el texto corrido legible (no convertir el cuerpo en mono).
- **Datos/UI técnica:** `IBM Plex Mono` — etiquetas de canal, readouts, log, timestamps.

## Firma
Osciloscopio de **3 canales en vivo**. La señal de la Vía es el EAR real del DMS;
cuando los ojos se cierran cruza el `UMBRAL`, se pinta de rojo y **dispara un
evento** en el log de "incidentes detectados". Cada canal (Obra/Vía/Red) alimenta
ese log por igual → el instrumento tiene consecuencia, no es un readout frío.
Es el **único** elemento llamativo; el resto, callado.

## Suelo de calidad
Responsive a móvil · foco de teclado visible (anillo `trace`) · `prefers-reduced-motion`
degrada la onda a estática · contraste AA · el contador/log se etiquetan como
**DEMO** (no son estadística real de flota — honestidad).

## Riesgo estético
Hacer que la portada **sea** un instrumento funcional en vez de una página de
marketing. Encaja porque SiteGuard es, literalmente, una sala de control: enseñar
la señal viva prueba el producto mejor que cualquier titular.
