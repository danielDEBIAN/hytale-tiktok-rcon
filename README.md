# ⚔️ Hytale × TikTok Live Studio (`v2.0.0` — App de Escritorio, Web GUI + Plugin HyRCON)

Estudio visual y aplicación de escritorio **100% gratuita** desarrollada en **Node.js (ES Modules)**, **Electron** y **Java 25** para conectar cualquier directo de **TikTok Live** con un servidor dedicado de **Hytale** mediante **RCON** (sin pagar suscripciones como TikFinity Pro ni planes de pago de EulerStream).

Permite iniciar y configurar tu servidor de Hytale con un clic, explorar visualmente los **281+ Mobs de Hytale con su imagen oficial**, buscar entre **1,690+ Regalos de TikTok con su precio en monedas**, asignarlos visualmente y spawnear enemigos o dar objetos en la posición exacta del jugador en tiempo real.

---

## 📦 Opción 1: Descargar el Ejecutable Listo para Usar (Recomendado)

No necesitas instalar Node.js ni escribir comandos en una terminal. Descarga la última versión directamente desde la sección **[Releases](../../releases)**:

| Plataforma | Archivo en Releases | Cómo abrirlo |
| :--- | :--- | :--- |
| 🪟 **Windows** | **`HytaleTikTokLive-Windows-Portable.exe`** | Haz doble clic sobre el archivo `.exe` y se abrirá la ventana de la aplicación. |
| 🐧 **Linux** | **`HytaleTikTokLive-Linux.AppImage`** | Dale permiso de ejecución (`chmod +x HytaleTikTokLive-Linux.AppImage` o *Propiedades → Permitir ejecutar como un programa*) y haz doble clic. |
| 🏰 **Mod RCON (Opcional)** | **`HyRCON.jar`** | Ya viene incluido dentro de la aplicación (se instala con 1 clic desde la pestaña **🏰 Servidor Hytale**), o puedes descargarlo por separado para copiarlo en `mods/`. |

### 📋 ¿Qué necesitas para usar el Ejecutable?
1. **Java 25 (JDK/JRE 25):** Requerido por el servidor dedicado de Hytale (`HytaleServer.jar`).
2. **Archivos del Servidor Dedicado de Hytale:** Una carpeta en tu PC que contenga `HytaleServer.jar` y `Assets.zip` (obtenidos desde tu instalación del Hytale Launcher o con `hytale-downloader`).

### 🚀 Pasos dentro de la Aplicación:
1. Abre la aplicación y entra a la pestaña **🏰 Servidor Hytale (Control y Ajustes)**.
2. Haz clic en **📂 Elegir Carpeta...** y selecciona la carpeta donde tienes tu `HytaleServer.jar` y `Assets.zip`.
3. Haz clic en **▶️ Iniciar Servidor Hytale**:
   - La aplicación instalará automáticamente el plugin `HyRCON.jar` en la carpeta `mods/` de tu servidor si aún no lo tenías.
   - Desde la consola en vivo de esa misma pestaña puedes ejecutar `/auth login device` y `/auth persistence Encrypted` (solo la primera vez) y darte permisos de administrador con el botón **👑 Dar OP a mi Jugador**.
4. En la barra superior derecha, escribe tu **👤 Jugador Hytale** y tu **🎥 Usuario TikTok** y presiona **💾 Guardar Ajustes**.
5. Ve a **🎛️ Mis Reglas Configuradas** (o a los catálogos de **👾 Mobs** y **🎁 Regalos**) para elegir qué criatura aparecerá con cada regalo y pruébalo al instante con el botón **⚡ Probar en Hytale**.

> **Nota importante sobre los puertos:**
> - **Puerto para entrar a jugar desde tu cliente de Hytale:** `127.0.0.1:5520`
> - **Puerto RCON interno (usado automáticamente por la app):** `127.0.0.1:25575`

---

## 💻 Opción 2: Ejecutar desde el Código Fuente (Desarrolladores / Terminal)

Si prefieres clonar el repositorio y correrlo o modificarlo desde el código fuente:

### 📋 Requisitos Previos
- **Node.js v20 o superior** (y `npm`).
- **Java 25 (JDK 25)** para correr el servidor de Hytale (y `javac` / `jar` si deseas recompilar el plugin [`plugin-src/`](plugin-src/)).
- Servidor dedicado de Hytale (`HytaleServer.jar` + `Assets.zip`).

### 🛠️ Instalación y Ejecución
1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone https://github.com/danielDEBIAN/hytale-tiktok-rcon.git
   cd hytale-tiktok-rcon
   npm install
   ```

2. **Configurar variables de entorno (opcional, también editable desde la interfaz gráfica):**
   ```bash
   cp .env.example .env
   ```

3. **Formas de iniciar el proyecto:**

   | Comando / Archivo | Descripción |
   | :--- | :--- |
   | **`npm run desktop`** | Abre la aplicación en su ventana nativa de escritorio con **Electron**. |
   | **`npm run app`** *(o `./launch-app.sh` / `Start-Windows.bat`)* | Levanta el servidor y abre la interfaz en modo ventana de aplicación dedicada (`--app=http://localhost:3000`). |
   | **`npm run gui`** | Inicia el servidor del panel visual web en **`http://localhost:3000`**. |
   | **`npm start`** | Conecta al directo de **TikTok Live** en consola y levanta simultáneamente el panel web en **`http://localhost:3000`**. |
   | **`npm run simulate`** | Abre un simulador interactivo en la terminal para probar regalos sin estar en directo en TikTok. |

4. **Compilar tus propios ejecutables (`.AppImage` / `.exe`) o el plugin Java:**
   ```bash
   # Generar ejecutable .AppImage para Linux en dist/
   npm run dist:linux

   # Generar ejecutable .exe portable para Windows en dist/
   npm run dist:win

   # Recompilar el plugin HyRCON.jar desde el código fuente en Java
   npm run build:plugin
   ```

---

## ✨ Características Principales

- **Estética Inspirada en Hytale (Orbis):** Interfaz gráfica con acabados dorados, estado en vivo de RCON y TikTok Live, editor visual de reglas en 2 pasos y consola del servidor integrada.
- **Catálogos Dinámicos en Tiempo Real:**
  - **281+ Mobs de Hytale** con imagen, nombre, categoría y `Role ID` validado contra `Assets.zip`.
  - **1,690+ Regalos de TikTok** con imagen oficial y filtro por costo en monedas.
- **Gestor del Servidor Hytale Integrado:** Inicia/detén `HytaleServer.jar` sin usar terminal, instala `HyRCON.jar` con 1 clic y edita visualmente `config.json` y `universe/worlds/default/config.json` (PvP, modo de juego, RAM, daño por caída, spawneo de NPCs, ciclo día/noche).
- **100% Gratuito y Sin Límites:** Incluye un bypass en [`src/index.js`](src/index.js) para obtener el catálogo de regalos directamente desde la API Webcast de TikTok (`signRequest = false`), evitando el bloqueo de pago (*Business Plan*) de EulerStream.
- **Plugin RCON Propio (`TikTokBridge:HyRCON`):** Código fuente en Java incluido en [`plugin-src/`](plugin-src/) que implementa el protocolo Source RCON en `127.0.0.1:25575` y añade el prefijo `as <jugador> <comando>` para spawnear criaturas en las coordenadas exactas del jugador.

---

## 📂 Estructura del Proyecto

```text
hytale-tiktok-rcon/
├── .github/workflows/
│   └── release.yml              # GitHub Action que compila y publica .exe, .AppImage y HyRCON.jar
├── config/
│   └── gifts.json               # Mapeo recargable en caliente de regalos y eventos -> comandos Hytale
├── plugin-src/                  # Código fuente y binario del plugin RCON para Hytale (Java 25)
│   ├── HyRCON.jar               # Mod precompilado listo para instalar en mods/
│   ├── manifest.json            # Manifiesto del plugin (TikTokBridge:HyRCON)
│   ├── README.md                # Documentación técnica del mod HyRCON
│   └── com/daniel/hyrcon/
│       └── HyRconPlugin.java    # Servidor RCON TCP + ejecutor en posición del jugador
├── public/                      # Interfaz Gráfica Estilo Hytale (Frontend)
│   ├── index.html               # Panel de reglas, catálogos y gestor del servidor
│   ├── styles.css               # Tema visual RPG inspirado en Hytale
│   ├── app.js                   # Lógica del cliente web y comunicación con la API
│   └── icon.svg / icon.png      # Icono oficial de la aplicación
├── src/
│   ├── electronMain.js          # Proceso principal de la App de Escritorio (Electron)
│   ├── index.js                 # Conector principal a TikTok Live + RCON + GUI
│   ├── guiServer.js             # Servidor HTTP local y API REST (http://localhost:3000)
│   ├── hytaleServerManager.js   # Control de proceso HytaleServer.jar, consola, config.json e instalador de mod
│   ├── catalogService.js        # Obtención dinámica de Mobs de Hytale y Regalos de TikTok
│   ├── giftHandler.js           # Procesador de regalos, combos, likes y follows
│   ├── rconClient.js            # Cliente RCON con reconexión automática y modo simulador
│   └── simulate.js              # Simulador interactivo por consola
├── launch-app.sh                # Lanzador de 1 clic en modo Web App para Linux
├── Start-Windows.bat            # Lanzador de 1 clic en modo Web App para Windows
├── .env.example                 # Plantilla de variables de entorno
└── package.json
```

---

## 🎁 Referencia Rápida de Comandos en Hytale (`config/gifts.json`)

| Acción | Sintaxis del Comando RCON | Ejemplo Real en Hytale |
| :--- | :--- | :--- |
| **Mensaje global** | `say <mensaje>` | `say [TikTok] ¡{user} envió {repeatCount}x {giftName}!` |
| **Dar objeto** | `give {player} <ID_Item>` | `give {player} Food_Pie_Apple`<br>`give {player} Weapon_Sword_Steel`<br>`give {player} Potion_Health` |
| **Spawnear Mob en tu posición** | `as {player} npc spawn <ID_Role>` | `as {player} npc spawn Goblin_Burner`<br>`as {player} npc spawn Trork_Warrior`<br>`as {player} npc spawn Shadow_Knight` |

Variables dinámicas disponibles: `{player}`, `{user}`, `{giftName}`, `{repeatCount}`.
