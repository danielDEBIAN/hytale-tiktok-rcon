# Hytale x TikTok Live (Puente RCON 100% Gratis)

Herramienta propia en Node.js que conecta cualquier directo de **TikTok Live** (sin pagar suscripciones ni usar APIs de pago) con un servidor de **Hytale** mediante **RCON** para spawnear enemigos o entregar objetos al jugador en tiempo real.

## Estructura del Proyecto

- `config/gifts.json`: Aquí defines qué regalos de TikTok disparan qué comandos de RCON (spawnear enemigos, dar ítems, mensajes en el chat, follows y metas de likes). Se recarga en vivo sin reiniciar el programa.
- `src/rconClient.js`: Cliente RCON con reconexión automática y **Modo Simulador (`MOCK_RCON=true`)** para probar sin tener el servidor de Hytale encendido.
- `src/giftHandler.js`: Procesador de eventos y combos de TikTok Live con protección contra inyección de comandos.
- `src/index.js`: Conector principal a TikTok Live + RCON.
- `src/simulate.js`: Consola interactiva para simular regalos y probar tus comandos sin necesidad de estar en directo en TikTok.

## Cómo usar

### 1. Probar en el Simulador (Sin servidor de Hytale ni directo activo)
```bash
npm run simulate
```
Escribe un número del `1` al `8` (o el nombre de un regalo) y verás exactamente qué comandos RCON se disparan hacia tu jugador.

### 2. Conectar a un directo real de TikTok
1. Abre el archivo `.env` y coloca tu usuario de TikTok en `TIKTOK_USERNAME` y tu nombre de jugador en `PLAYER_NAME`.
2. Cuando tengas tu servidor local de Hytale encendido con RCON habilitado, cambia `MOCK_RCON=false` y configura `RCON_HOST`, `RCON_PORT` y `RCON_PASSWORD`.
3. Ejecuta:
```bash
npm start
```
