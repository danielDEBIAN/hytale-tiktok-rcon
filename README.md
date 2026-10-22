# ⚔️ Hytale x TikTok Live (RCON Bridge + HyRCON Plugin — 100% Gratis)

Herramienta completa y **100% gratuita** desarrollada en **Node.js (ES Modules)** y **Java 25** para conectar cualquier directo de **TikTok Live** con un servidor dedicado de **Hytale** mediante **RCON** (sin pagar suscripciones como TikFinity Pro ni planes de pago de EulerStream).

Permite spawnear enemigos en la posición exacta del jugador, entregar armas/comida/pociones y anunciar eventos en el chat del servidor en tiempo real cuando los espectadores envían regalos, siguen el canal o alcanzan metas de likes.

---

## ✨ Características Principales

- **100% Gratuito y Sin Límites:** Incluye un bypass en [`src/index.js`](src/index.js) para obtener el catálogo de regalos directamente desde la API Webcast de TikTok (`signRequest = false`), evitando el bloqueo de pago (*Business Plan*) de EulerStream.
- **Plugin RCON Propio para Hytale (`TikTokBridge:HyRCON`):** Código fuente en Java incluido en [`plugin-src/`](plugin-src/) que implementa el protocolo Source RCON en `127.0.0.1:25575` y añade el prefijo especial `as <jugador> <comando>` para ejecutar comandos como `/npc spawn` exactamente en las coordenadas donde está parado el jugador.
- **Recarga en Caliente (Hot-Reload):** Puedes editar [`config/gifts.json`](config/gifts.json) en pleno directo y los cambios se aplican al instante en el siguiente regalo sin reiniciar el bot ni el servidor.
- **Manejo Inteligente de Combos y Seguridad:** Espera a que termine la racha (`repeatEnd`) en regalos de combo, escala la recompensa/castigo con límite de seguridad (máx. 20 iteraciones) y sanitiza nombres de usuario para evitar inyección de comandos RCON.
- **Simulador Interactivo Integrado:** Prueba todos tus regalos y comandos desde la terminal con `npm run simulate` sin necesidad de estar en directo en TikTok.

---

## 📂 Estructura del Proyecto

```text
hytale-tiktok-rcon/
├── config/
│   └── gifts.json               # Mapeo de regalos, likes y follows -> comandos de Hytale
├── plugin-src/                  # Código fuente del plugin RCON para Hytale (Java 25)
│   ├── manifest.json            # Manifiesto del plugin (TikTokBridge:HyRCON)
│   ├── README.md                # Documentación independiente del mod HyRCON
│   └── com/daniel/hyrcon/
│       └── HyRconPlugin.java    # Servidor RCON TCP + ejecutor de comandos en contexto de jugador
├── src/
│   ├── index.js                 # Conector principal a TikTok Live + RCON
│   ├── giftHandler.js           # Procesador de regalos, combos, likes y follows
│   ├── rconClient.js            # Cliente RCON con reconexión automática y modo simulador
│   └── simulate.js              # Simulador interactivo por consola
├── .env.example                 # Plantilla de variables de entorno
└── package.json
```

---

## 🚀 Guía de Instalación Paso a Paso

### 1. Configurar el Servidor Dedicado de Hytale
1. Copia `HytaleServer.jar` y `Assets.zip` (desde tu instalación del Hytale Launcher o usando `hytale-downloader`) en una carpeta para tu servidor (ej. `~/hytale-server`).
2. Inicia el servidor con **Java 25**:
   ```bash
   java -Xms4G -Xmx6G -jar HytaleServer.jar --assets Assets.zip
   ```
3. En la consola del servidor de Hytale, autentica el servidor y guarda la sesión para no tener que repetirlo:
   ```text
   /auth login device
   /auth persistence Encrypted
   ```
4. Date permisos de administrador (OP) usando tu nombre de usuario (si ya estás dentro del servidor) o tu UUID:
   ```text
   op add <tu_usuario_o_UUID>
   ```

### 2. Compilar e Instalar el Plugin `HyRCON` en Hytale
Puedes compilar el archivo `HyRCON.jar` directamente contra tu `HytaleServer.jar`:

```bash
npm run build:plugin
```
*(Por defecto compila usando `~/hytale-server/HytaleServer.jar` y genera `~/hytale-server/mods/HyRCON.jar`).*

Para activarlo sin reiniciar el servidor de Hytale, escribe en la consola del servidor:
```text
plugin load TikTokBridge:HyRCON
```
Verás el mensaje:
`[HyRCON] Servidor RCON escuchando en 127.0.0.1:25575`

> **Nota importante sobre los puertos:**
> - **Puerto del juego (Multiplayer en Hytale):** `127.0.0.1:5520` (UDP/QUIC)
> - **Puerto RCON (Exclusivo para el bot de Node.js):** `127.0.0.1:25575` (TCP)

### 3. Configurar el Puente de Node.js
1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Crea tu archivo `.env` a partir de la plantilla:
   ```bash
   cp .env.example .env
   ```
3. Edita `.env` con tus datos:
   ```env
   TIKTOK_USERNAME=tu_usuario_tiktok
   PLAYER_NAME=TuNombreEnHytale
   RCON_HOST=127.0.0.1
   RCON_PORT=25575
   RCON_PASSWORD=hytale_rcon_local
   MOCK_RCON=false
   ```

---

## 🎮 Uso

### Probar regalos sin estar en directo en TikTok
Con tu servidor de Hytale encendido y tu personaje dentro del mundo (`127.0.0.1:5520`), ejecuta:
```bash
npm run simulate
```
Elige una opción del menú (`1` al `8`) y verás cómo aparecen enemigos frente a ti o recibes objetos en tu inventario.

*(Si quieres probar sin tener el servidor de Hytale abierto, pon `MOCK_RCON=true` en `.env`).*

### Conectar a un directo real de TikTok Live
Cuando estés en vivo en TikTok, ejecuta:
```bash
npm start
```

---

## 🎁 Personalización de Regalos y Comandos (`config/gifts.json`)

En Hytale, los comandos para dar objetos y spawnear NPCs funcionan así:

| Acción | Sintaxis del Comando RCON | Ejemplo Real en Hytale |
| :--- | :--- | :--- |
| **Mensaje global** | `say <mensaje>` | `say [TikTok] ¡{user} envió {repeatCount}x {giftName}!` |
| **Dar objeto** | `give {player} <ID_Item>` | `give {player} Food_Pie_Apple`<br>`give {player} Weapon_Sword_Iron`<br>`give {player} Potion_Health` |
| **Spawnear NPC en tu posición** | `as {player} npc spawn <ID_Role>` | `as {player} npc spawn Skeleton`<br>`as {player} npc spawn Trork_Warrior`<br>`as {player} npc spawn Dungeon_Goblin_Scrapper`<br>`as {player} npc spawn Shadow_Knight` |

Variables dinámicas disponibles en [`config/gifts.json`](config/gifts.json):
- `{player}`: Tu nombre de jugador configurado en `.env`.
- `{user}`: Nombre del espectador en TikTok.
- `{giftName}`: Nombre del regalo enviado.
- `{repeatCount}`: Cantidad enviada en combo.
