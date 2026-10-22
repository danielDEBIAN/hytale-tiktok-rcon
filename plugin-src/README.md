# 🔌 HyRCON — Lightweight RCON Server Plugin for Hytale (`TikTokBridge:HyRCON`)

**HyRCON** es un plugin ligero, sin dependencias externas y **100% gratuito / Open Source** para servidores dedicados de **Hytale** (`HytaleServer.jar`). Implementa el protocolo estándar **Source RCON (TCP)** y añade soporte nativo para ejecutar comandos en el contexto y posición exacta de cualquier jugador conectado.

Ideal para integraciones con **TikTok Live**, **Twitch**, **Discord bots**, tiendas web o paneles de administración.

---

## ✨ Características

- **Protocolo Source RCON Estándar:** Compatible con cualquier cliente RCON existente (`rcon-client` en Node.js, `mcrcon`, Python `rcon`, etc.).
- **Ejecución en Contexto de Jugador (`as <jugador> <comando>`):**
  En Hytale, comandos como `/npc spawn <Role>` requieren ejecutarse desde la entidad de un jugador dentro del mundo (`AbstractPlayerCommand`). HyRCON resuelve esto automáticamente permitiendo:
  ```text
  as <NombreJugador> npc spawn Skeleton
  ```
  También detecta automáticamente comandos que empiezan por `npc ` y los ejecuta sobre el jugador activo en el mundo.
- **Seguro por Defecto:** Escucha únicamente en `127.0.0.1` (localhost) por defecto y requiere autenticación por contraseña.
- **Cero Dependencias Externas:** Compilado únicamente con la librería estándar de Java 25 y la API nativa `JavaPlugin` de `HytaleServer.jar`.

---

## 📦 Instalación (Para Usuarios)

1. Descarga el archivo `HyRCON.jar`.
2. Cópialo dentro de la carpeta `mods/` de tu servidor dedicado de Hytale:
   ```text
   hytale-server/
   ├── HytaleServer.jar
   ├── Assets.zip
   └── mods/
       └── HyRCON.jar
   ```
3. Si tu servidor ya está encendido, cárgalo en caliente desde la consola del servidor con:
   ```text
   plugin load TikTokBridge:HyRCON
   ```
   *(O simplemente reinicia el servidor).*
4. En el primer arranque, el plugin generará automáticamente el archivo `rcon.properties` en la raíz de tu servidor:
   ```properties
   host=127.0.0.1
   port=25575
   password=hytale_rcon_local
   ```
   *(Cambia `password` por una contraseña segura propia y reinicia el plugin con `plugin reload TikTokBridge:HyRCON`).*

---

## 🛠️ Uso de Comandos por RCON

Una vez conectado mediante cualquier cliente RCON al puerto `25575`:

| Tipo de Comando | Ejemplo enviado por RCON | Descripción |
| :--- | :--- | :--- |
| **Comando de Consola** | `say ¡Hola desde RCON!` | Envía un anuncio global a todos los mundos. |
| **Dar Ítems** | `give NombreJugador Food_Pie_Apple` | Entrega un ítem directamente al inventario del jugador. |
| **Spawnear NPC en un jugador específico** | `as NombreJugador npc spawn Skeleton` | Ejecuta `/npc spawn Skeleton` en las coordenadas exactas de `NombreJugador`. *(El jugador debe tener permisos de OP: `op add NombreJugador`)*. |
| **Spawnear NPC en el primer jugador activo** | `npc spawn Trork_Warrior` | Busca automáticamente al primer jugador conectado en el mundo y spawnea el NPC junto a él. |

---

## 🔨 Cómo Compilar desde el Código Fuente

### Requisitos:
- **Java JDK 25** (`javac` y `jar`).
- El archivo `HytaleServer.jar` de tu servidor dedicado de Hytale.

### Pasos de compilación:
```bash
mkdir -p build
javac -cp /ruta/a/HytaleServer.jar -d build com/daniel/hyrcon/HyRconPlugin.java
cp manifest.json build/manifest.json
jar cf HyRCON.jar -C build .
rm -rf build
```
Esto generará el archivo `HyRCON.jar` listo para colocarse en la carpeta `mods/` o distribuirse a la comunidad.
