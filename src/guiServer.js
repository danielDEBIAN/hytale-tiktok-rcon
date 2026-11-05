import 'dotenv/config';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection } from 'tiktok-live-connector';
import { HytaleRconClient } from './rconClient.js';
import { GiftHandler } from './giftHandler.js';
import { fetchHytaleMobs, fetchTikTokGifts } from './catalogService.js';
import { HytaleServerManager } from './hytaleServerManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const CONFIG_PATH = path.resolve(__dirname, '../config/gifts.json');
const ENV_PATH = path.resolve(__dirname, '../.env');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Caché breve para estado de TikTok Live (evita bloqueos por exceso de peticiones)
let tiktokStatusCache = {
  username: '',
  timestamp: 0,
  data: null,
};

/**
 * Verifica mediante socket TCP si el puerto RCON del servidor de Hytale está escuchando
 */
function checkTcpPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(ok);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/**
 * Consulta si el usuario configurado en TIKTOK_USERNAME está actualmente en directo (LIVE)
 */
async function checkTikTokLiveStatus(rawUsername, force = false) {
  const username = String(rawUsername || '').trim().replace(/^@/, '');

  if (!username || username === 'tu_usuario_tiktok') {
    return {
      configured: false,
      username: '',
      isLive: false,
      status: 'unconfigured',
      title: 'Usuario de TikTok sin configurar',
      message: 'Escribe tu usuario de TikTok arriba y haz clic en Guardar Ajustes.',
    };
  }

  const now = Date.now();
  if (
    !force &&
    tiktokStatusCache.data &&
    tiktokStatusCache.username.toLowerCase() === username.toLowerCase() &&
    now - tiktokStatusCache.timestamp < 15000
  ) {
    return tiktokStatusCache.data;
  }

  try {
    const conn = new TikTokLiveConnection(username, { processInitialData: false });
    const isLive = await conn.fetchIsLive();
    const result = isLive
      ? {
          configured: true,
          username,
          isLive: true,
          roomId: conn.roomId || null,
          status: 'live',
          title: `¡@${username} está EN VIVO en TikTok!`,
          message: `Transmisión activa detectada (Room ID: ${conn.roomId || 'Activo'}). Lista para recibir regalos.`,
        }
      : {
          configured: true,
          username,
          isLive: false,
          status: 'offline',
          title: `@${username} NO está en directo ahora mismo`,
          message: `La cuenta @${username} está fuera de línea en TikTok Live. Aún puedes usar los botones "Probar en Hytale" para testear tus mobs.`,
        };

    tiktokStatusCache = { username, timestamp: now, data: result };
    return result;
  } catch (err) {
    const result = {
      configured: true,
      username,
      isLive: false,
      status: 'error',
      title: `@${username} fuera de línea o no encontrado`,
      message: `No se detectó un directo activo para @${username} (${err.message || 'Sin transmisión activa'}).`,
    };
    tiktokStatusCache = { username, timestamp: now, data: result };
    return result;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function updateEnvFile(updates) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=${value}\n`;
    }
    process.env[key] = String(value);
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}

export async function startGuiServer(options = {}) {
  const port = Number(options.port || process.env.GUI_PORT || 3000);

  let rconClient = options.rconClient;
  if (!rconClient) {
    const mockMode = String(process.env.MOCK_RCON).toLowerCase() !== 'false';
    rconClient = new HytaleRconClient({
      host: process.env.RCON_HOST || '127.0.0.1',
      port: Number(process.env.RCON_PORT) || 25575,
      password: process.env.RCON_PASSWORD || '',
      mockMode,
    });
    await rconClient.connect();
  }

  let giftHandler = options.giftHandler;
  if (!giftHandler) {
    giftHandler = new GiftHandler(rconClient, process.env.PLAYER_NAME || 'PaletaChupada');
  }

  const serverManager = new HytaleServerManager();

  /**
   * Evalúa en vivo el estado real del servidor RCON de Hytale
   */
  async function evaluateRconStatus() {
    const host = rconClient.host || '127.0.0.1';
    const rconPort = rconClient.port || 25575;
    const portReachable = await checkTcpPort(host, rconPort, 1200);
    const procStatus = serverManager.getStatus();

    if (rconClient.mockMode) {
      return {
        mockMode: true,
        serverUp: portReachable,
        connected: false,
        host,
        port: rconPort,
        status: 'mock',
        title: 'Modo Simulador RCON Activo',
        message: portReachable
          ? `Tu servidor Hytale (${host}:${rconPort}) SÍ está encendido, pero estás en Modo Simulador. Haz clic en el botón de Modo RCON arriba para conectarte al servidor real.`
          : `Simulando comandos en consola (El servidor de Hytale en ${host}:${rconPort} está apagado).`,
      };
    }

    if (!portReachable) {
      rconClient.isConnected = false;
      if (procStatus.pid) {
        return {
          mockMode: false,
          serverUp: false,
          connected: false,
          host,
          port: rconPort,
          status: 'mock',
          title: '⏳ Servidor de Hytale Iniciando...',
          message: `El proceso HytaleServer.jar está cargando el mundo (PID: ${procStatus.pid}). RCON se conectará automáticamente apenas termine de iniciar.`,
        };
      }
      return {
        mockMode: false,
        serverUp: false,
        connected: false,
        host,
        port: rconPort,
        status: 'offline',
        title: 'Servidor de Hytale / RCON Apagado',
        message: `No hay respuesta en ${host}:${rconPort}. Puedes iniciarlo directamente haciendo clic en "▶️ Iniciar Servidor Hytale".`,
      };
    }

    // Si el puerto está abierto pero aún no estaba conectado el cliente RCON, reconectar automáticamente
    if (!rconClient.isConnected || !rconClient.rcon) {
      await rconClient.connect();
    }

    if (rconClient.isConnected) {
      return {
        mockMode: false,
        serverUp: true,
        connected: true,
        host,
        port: rconPort,
        status: 'online',
        title: 'Servidor de Hytale y RCON Activos',
        message: `Conectado exitosamente a HyRCON en ${host}:${rconPort}. Los mobs aparecerán en la posición de ${giftHandler.playerName}.`,
      };
    }

    return {
      mockMode: false,
      serverUp: true,
      connected: false,
      host,
      port: rconPort,
      status: 'error',
      title: 'Error de autenticación RCON',
      message: `El puerto ${host}:${rconPort} está abierto pero rechazó la conexión RCON. Verifica RCON_PASSWORD en tu archivo .env.`,
    };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      // 0. Verificar estado en tiempo real de RCON (Hytale) y TikTok Live
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const force = url.searchParams.get('force') === '1';
        const [rconStatus, tiktokStatus] = await Promise.all([
          evaluateRconStatus(),
          checkTikTokLiveStatus(process.env.TIKTOK_USERNAME, force),
        ]);
        return sendJson(res, 200, {
          ok: true,
          rcon: rconStatus,
          tiktok: tiktokStatus,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.1 Iniciar el servidor dedicado de Hytale desde la web
      if (req.method === 'POST' && url.pathname === '/api/hytale/start') {
        const body = await readBody(req);
        if (rconClient.mockMode) {
          rconClient.mockMode = false;
          updateEnvFile({ MOCK_RCON: 'false' });
        }
        const result = serverManager.start(body);
        return sendJson(res, result.ok ? 200 : 400, {
          ...result,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.2 Detener el servidor dedicado de Hytale desde la web
      if (req.method === 'POST' && url.pathname === '/api/hytale/stop') {
        await rconClient.disconnect();
        const result = await serverManager.stop();
        return sendJson(res, result.ok ? 200 : 400, {
          ...result,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.3 Obtener logs de la consola del servidor de Hytale
      if (req.method === 'GET' && url.pathname === '/api/hytale/logs') {
        return sendJson(res, 200, {
          ok: true,
          serverProcess: serverManager.getStatus(),
          logs: serverManager.getLogs(),
        });
      }

      // 0.4 Enviar comando a la consola del servidor de Hytale (vía stdin o RCON)
      if (req.method === 'POST' && url.pathname === '/api/hytale/console') {
        const body = await readBody(req);
        const cmd = String(body.command || '').trim();
        if (!cmd) {
          return sendJson(res, 400, { ok: false, error: 'Escribe un comando para enviar' });
        }
        const directRes = serverManager.sendConsoleCommand(cmd);
        if (directRes.ok) {
          return sendJson(res, 200, directRes);
        }
        // Si el servidor fue iniciado fuera del panel, intentar enviarlo por RCON
        const rconOut = await rconClient.sendCommand(cmd);
        if (rconOut !== null) {
          serverManager.appendLog(`[RCON >] ${cmd}`);
          if (rconOut) serverManager.appendLog(`[RCON <] ${rconOut}`);
          return sendJson(res, 200, { ok: true, message: `Comando ejecutado vía RCON: ${cmd}`, response: rconOut });
        }
        return sendJson(res, 400, directRes);
      }

      // 0.5 Leer configuración del servidor Hytale (config.json + mundo + RAM)
      if (req.method === 'GET' && url.pathname === '/api/hytale/config') {
        const data = serverManager.readServerConfigs();
        return sendJson(res, 200, {
          ok: true,
          ...data,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.6 Guardar configuración del servidor Hytale (config.json + mundo + RAM)
      if (req.method === 'POST' && url.pathname === '/api/hytale/config') {
        const body = await readBody(req);
        const updated = serverManager.saveServerConfigs(body);
        return sendJson(res, 200, {
          ok: true,
          ...updated,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 0.7 Seleccionar o cambiar la carpeta del servidor de Hytale
      if (req.method === 'POST' && url.pathname === '/api/hytale/server-dir') {
        const body = await readBody(req);
        let result;
        if (body.pickDialog) {
          result = await serverManager.pickServerFolderDialog();
        } else {
          result = serverManager.setServerDir(body.serverDir);
        }
        if (result.ok) {
          updateEnvFile({ HYTALE_SERVER_DIR: result.serverDir });
          return sendJson(res, 200, {
            ...result,
            ...serverManager.readServerConfigs(),
            serverProcess: serverManager.getStatus(),
          });
        }
        return sendJson(res, result.cancelled ? 200 : 400, result);
      }

      // 0.8 Instalar automáticamente el mod HyRCON.jar en la carpeta mods/ del servidor
      if (req.method === 'POST' && url.pathname === '/api/hytale/install-mod') {
        const result = serverManager.installHyRconMod();
        return sendJson(res, result.ok ? 200 : 400, {
          ...result,
          serverProcess: serverManager.getStatus(),
        });
      }

      // 1. Obtener catálogo dinámico de Mobs de Hytale (hytaleguide.net + Assets.zip)
      if (req.method === 'GET' && url.pathname === '/api/mobs') {
        const refresh = url.searchParams.get('refresh') === '1';
        const mobs = await fetchHytaleMobs(refresh);
        return sendJson(res, 200, { ok: true, total: mobs.length, mobs });
      }

      // 2. Obtener catálogo dinámico de Regalos de TikTok (streamtoearn.io + TikTok Webcast API)
      if (req.method === 'GET' && url.pathname === '/api/tiktok-gifts') {
        const refresh = url.searchParams.get('refresh') === '1';
        const gifts = await fetchTikTokGifts(refresh);
        return sendJson(res, 200, { ok: true, total: gifts.length, gifts });
      }

      // 3. Obtener configuración actual (gifts.json + .env)
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const config = giftHandler.loadConfig();
        return sendJson(res, 200, {
          ok: true,
          config,
          env: {
            tiktokUsername: process.env.TIKTOK_USERNAME || '',
            playerName: giftHandler.playerName || process.env.PLAYER_NAME || 'PaletaChupada',
            rconHost: rconClient.host,
            rconPort: rconClient.port,
            mockMode: rconClient.mockMode,
            rconConnected: rconClient.isConnected,
          },
        });
      }

      // 4. Guardar configuración de regalos y eventos (gifts.json)
      if (req.method === 'POST' && url.pathname === '/api/config') {
        const body = await readBody(req);
        if (!body || typeof body.config !== 'object') {
          return sendJson(res, 400, { ok: false, error: 'Formato de configuración inválido' });
        }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(body.config, null, 2) + '\n', 'utf-8');
        giftHandler.config = giftHandler.loadConfig();
        return sendJson(res, 200, { ok: true, config: giftHandler.config });
      }

      // 5. Actualizar ajustes de jugador / TikTok / modo simulador (.env)
      if (req.method === 'POST' && url.pathname === '/api/env') {
        const body = await readBody(req);
        const updates = {};
        if (typeof body.playerName === 'string' && body.playerName.trim()) {
          updates.PLAYER_NAME = body.playerName.trim();
          giftHandler.playerName = updates.PLAYER_NAME;
        }
        if (typeof body.tiktokUsername === 'string') {
          updates.TIKTOK_USERNAME = body.tiktokUsername.trim().replace(/^@/, '');
          tiktokStatusCache.timestamp = 0; // Forzar re-verificación del nuevo usuario
        }
        if (typeof body.mockMode === 'boolean') {
          updates.MOCK_RCON = String(body.mockMode);
          rconClient.mockMode = body.mockMode;
          await rconClient.connect();
        }
        updateEnvFile(updates);
        return sendJson(res, 200, {
          ok: true,
          env: {
            tiktokUsername: process.env.TIKTOK_USERNAME || '',
            playerName: giftHandler.playerName,
            mockMode: rconClient.mockMode,
            rconConnected: rconClient.isConnected,
          },
        });
      }

      // 6. Probar regalo, evento o spawnear mob directamente en Hytale
      if (req.method === 'POST' && url.pathname === '/api/test') {
        const body = await readBody(req);
        const type = body.type;

        if (type === 'gift') {
          await giftHandler.handleGift({
            user: { nickname: body.user || 'TesterGUI' },
            giftName: body.giftName || 'Rose',
            repeatCount: Number(body.repeatCount) || 1,
            diamondCount: Number(body.coins) || 1,
            giftType: 1,
            repeatEnd: true,
          });
          return sendJson(res, 200, {
            ok: true,
            message: `Regalo "${body.giftName}" ejecutado para ${giftHandler.playerName}`,
          });
        }

        if (type === 'follow') {
          await giftHandler.handleFollow({
            user: { nickname: body.user || 'SeguidorGUI' },
          });
          return sendJson(res, 200, {
            ok: true,
            message: 'Evento de Nuevo Seguidor (Follow) ejecutado',
          });
        }

        if (type === 'like') {
          const step = Number(giftHandler.loadConfig().specialEvents?.likeMilestone?.everyLikes) || 100;
          await giftHandler.handleLike({
            user: { nickname: body.user || 'FanGUI' },
            likeCount: step,
          });
          return sendJson(res, 200, {
            ok: true,
            message: `Meta de Likes (+${step}) ejecutada`,
          });
        }

        if (type === 'mob') {
          const roleId = String(body.roleId || 'Skeleton').replace(/[;"\\]/g, '').trim();
          const count = Math.min(Math.max(Number(body.count) || 1, 1), 20);
          for (let i = 0; i < count; i++) {
            await rconClient.sendCommand(`as ${giftHandler.playerName} npc spawn ${roleId}`);
          }
          return sendJson(res, 200, {
            ok: true,
            message: `Spawneado ${count}x ${roleId} en la posición de ${giftHandler.playerName}`,
          });
        }

        if (type === 'command') {
          const rawCmd = String(body.command || '');
          const formatted = giftHandler.formatCommand(rawCmd, {
            user: body.user || 'TesterGUI',
            giftName: body.giftName || 'Test',
            repeatCount: 1,
          });
          await rconClient.sendCommand(formatted);
          return sendJson(res, 200, {
            ok: true,
            message: `Comando ejecutado: ${formatted}`,
          });
        }

        return sendJson(res, 400, { ok: false, error: 'Tipo de prueba no reconocido' });
      }

      // Archivos estáticos del Frontend
      let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const resolvedPath = path.resolve(PUBLIC_DIR, `.${filePath}`);
      if (!resolvedPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const ext = path.extname(resolvedPath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        return fs.createReadStream(resolvedPath).pipe(res);
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      console.error('❌ Error en GUI Server:', err.message);
      sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`🌐 Interfaz Gráfica (Dashboard Web) activa en: http://localhost:${port}`);
      resolve(server);
    });
  });
}

// Si se ejecuta directamente con `node src/guiServer.js` (`npm run gui`)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startGuiServer();
}
