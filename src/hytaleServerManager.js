import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_HYRCON_JAR = path.resolve(__dirname, '../plugin-src/HyRCON.jar');

const DEFAULT_SERVER_DIR = process.env.HYTALE_SERVER_DIR || path.join(os.homedir(), 'hytale-server');
const DEFAULT_JAVA_BIN = fs.existsSync('/home/linuxbrew/.linuxbrew/bin/java')
  ? '/home/linuxbrew/.linuxbrew/bin/java'
  : 'java';

export class HytaleServerManager {
  constructor(options = {}) {
    this.serverDir = options.serverDir || DEFAULT_SERVER_DIR;
    this.javaBin = options.javaBin || DEFAULT_JAVA_BIN;
    this.minRamGb = Number(options.minRamGb) || 4;
    this.maxRamGb = Number(options.maxRamGb) || 6;
    this.child = null;
    this.state = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping'
    this.logs = [];
    this.maxLogLines = 300;
  }

  appendLog(text) {
    const lines = String(text)
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => line.trim().length > 0);

    const timestamp = new Date().toLocaleTimeString('es-MX', { hour12: false });
    for (const line of lines) {
      // Limpiar códigos ANSI de colores para que se lea limpio en la web
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
      this.logs.push(`[${timestamp}] ${clean}`);
    }
    if (this.logs.length > this.maxLogLines) {
      this.logs = this.logs.slice(-this.maxLogLines);
    }
  }

  /**
   * Detecta si hay un proceso HytaleServer.jar corriendo en el sistema (iniciado por la GUI o externo)
   */
  findRunningPid() {
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return this.child.pid;
    }
    try {
      const out = execSync('pgrep -f "HytaleServer.jar"', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const firstPid = out.split('\n')[0]?.trim();
      return firstPid ? Number(firstPid) : null;
    } catch {
      return null;
    }
  }

  getStatus() {
    const pid = this.findRunningPid();
    if (!pid && (this.state === 'running' || this.state === 'starting' || this.state === 'stopping')) {
      this.state = 'stopped';
    } else if (pid && this.state === 'stopped') {
      this.state = 'running';
    }
    return {
      state: this.state,
      pid,
      serverDir: this.serverDir,
      minRamGb: this.minRamGb,
      maxRamGb: this.maxRamGb,
      jarExists: fs.existsSync(path.join(this.serverDir, 'HytaleServer.jar')),
      assetsExists: fs.existsSync(path.join(this.serverDir, 'Assets.zip')),
      hyrconInstalled: fs.existsSync(path.join(this.serverDir, 'mods/HyRCON.jar')),
      logsCount: this.logs.length,
    };
  }

  /**
   * Cambia la carpeta del servidor de Hytale
   */
  setServerDir(newDir) {
    const resolved = path.resolve(String(newDir || '').trim());
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `La carpeta "${resolved}" no existe.` };
    }
    this.serverDir = resolved;
    process.env.HYTALE_SERVER_DIR = resolved;
    return {
      ok: true,
      serverDir: this.serverDir,
      status: this.getStatus(),
    };
  }

  /**
   * Abre un selector gráfico nativo de carpetas (Electron, Windows PowerShell, Zenity o KDialog)
   */
  async pickServerFolderDialog() {
    if (typeof globalThis.__electronSelectFolder === 'function') {
      const selected = await globalThis.__electronSelectFolder(this.serverDir);
      if (selected) return this.setServerDir(selected);
      return { ok: false, cancelled: true };
    }
    try {
      if (process.platform === 'win32') {
        const psCmd =
          'Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = "Selecciona la carpeta de tu Servidor de Hytale"; if ($f.ShowDialog() -eq "OK") { Write-Output $f.SelectedPath }';
        const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (out) return this.setServerDir(out);
        return { ok: false, cancelled: true };
      }

      const out = execSync(
        `zenity --file-selection --directory --title="Selecciona la carpeta de tu Servidor de Hytale" --filename="${this.serverDir}/" 2>/dev/null || kdialog --getexistingdirectory "${this.serverDir}" 2>/dev/null`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      if (out) {
        return this.setServerDir(out);
      }
      return { ok: false, cancelled: true };
    } catch {
      return { ok: false, cancelled: true };
    }
  }

  /**
   * Instala automáticamente el plugin HyRCON.jar dentro de <serverDir>/mods/HyRCON.jar
   */
  installHyRconMod() {
    if (!fs.existsSync(this.serverDir)) {
      return { ok: false, error: `La carpeta del servidor (${this.serverDir}) no existe.` };
    }
    if (!fs.existsSync(BUNDLED_HYRCON_JAR)) {
      return { ok: false, error: `No se encontró el archivo base en ${BUNDLED_HYRCON_JAR}.` };
    }
    const modsDir = path.join(this.serverDir, 'mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }
    const targetJar = path.join(modsDir, 'HyRCON.jar');
    fs.copyFileSync(BUNDLED_HYRCON_JAR, targetJar);
    this.appendLog(`✅ Mod HyRCON.jar instalado automáticamente en ${targetJar}`);

    if (this.child && this.child.stdin && !this.child.killed) {
      this.child.stdin.write('plugin load TikTokBridge:HyRCON\n');
    }

    return {
      ok: true,
      targetJar,
      message: `Mod HyRCON.jar instalado exitosamente en ${targetJar}`,
      status: this.getStatus(),
    };
  }

  getLogs() {
    return this.logs;
  }

  /**
   * Inicia el servidor dedicado de Hytale en segundo plano sin necesidad de abrir una terminal
   */
  start({ minRamGb, maxRamGb } = {}) {
    if (minRamGb) this.minRamGb = Math.max(1, Math.min(Number(minRamGb) || 4, 32));
    if (maxRamGb) this.maxRamGb = Math.max(this.minRamGb, Math.min(Number(maxRamGb) || 6, 64));

    const existingPid = this.findRunningPid();
    if (existingPid) {
      return {
        ok: true,
        alreadyRunning: true,
        pid: existingPid,
        message: `El servidor de Hytale ya está en ejecución (PID: ${existingPid}).`,
      };
    }

    const jarPath = path.join(this.serverDir, 'HytaleServer.jar');
    const assetsPath = path.join(this.serverDir, 'Assets.zip');
    if (!fs.existsSync(jarPath) || !fs.existsSync(assetsPath)) {
      return {
        ok: false,
        error: `No se encontró HytaleServer.jar o Assets.zip en ${this.serverDir}`,
      };
    }

    // Instalar automáticamente HyRCON.jar si aún no está en la carpeta mods/ del servidor
    const modPath = path.join(this.serverDir, 'mods/HyRCON.jar');
    if (!fs.existsSync(modPath) && fs.existsSync(BUNDLED_HYRCON_JAR)) {
      this.installHyRconMod();
    }

    const args = [
      `-Xms${this.minRamGb}G`,
      `-Xmx${this.maxRamGb}G`,
      '-jar',
      'HytaleServer.jar',
      '--assets',
      'Assets.zip',
    ];

    this.state = 'starting';
    this.appendLog(`🚀 Iniciando servidor de Hytale: ${this.javaBin} ${args.join(' ')}`);

    this.child = spawn(this.javaBin, args, {
      cwd: this.serverDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      this.appendLog(text);
      if (
        text.includes('Servidor RCON escuchando') ||
        text.includes('Server started') ||
        text.includes('Listening on') ||
        text.includes('Done')
      ) {
        this.state = 'running';
      }
    });

    this.child.stderr.on('data', (chunk) => {
      this.appendLog(chunk.toString());
    });

    this.child.on('exit', (code, signal) => {
      this.appendLog(`⏹️ Servidor de Hytale detenido (código: ${code ?? 'N/A'}, señal: ${signal ?? 'N/A'}).`);
      this.child = null;
      this.state = 'stopped';
    });

    this.child.on('error', (err) => {
      this.appendLog(`❌ Error al iniciar HytaleServer.jar: ${err.message}`);
      this.state = 'stopped';
    });

    return {
      ok: true,
      pid: this.child.pid,
      message: `Iniciando servidor de Hytale (PID: ${this.child.pid}, RAM: ${this.minRamGb}G-${this.maxRamGb}G)...`,
    };
  }

  /**
   * Detiene el servidor de Hytale de forma segura (guardando el mundo)
   */
  async stop() {
    const pid = this.findRunningPid();
    if (!pid) {
      this.state = 'stopped';
      return { ok: true, message: 'El servidor de Hytale ya estaba apagado.' };
    }

    this.state = 'stopping';
    this.appendLog('🛑 Enviando señal de apagado seguro al servidor de Hytale...');

    if (this.child && this.child.stdin && !this.child.killed) {
      try {
        this.child.stdin.write('stop\n');
      } catch {
        // Ignorar
      }
      // Si en 8 segundos no ha cerrado con `stop`, enviar SIGTERM
      setTimeout(() => {
        if (this.child && !this.child.killed && this.child.exitCode === null) {
          this.child.kill('SIGTERM');
        }
      }, 8000);
    } else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (err) {
        return { ok: false, error: `No se pudo detener el proceso ${pid}: ${err.message}` };
      }
    }

    return {
      ok: true,
      message: 'Deteniendo el servidor de Hytale y guardando el mundo...',
    };
  }

  /**
   * Envía un comando directo a la consola del proceso de Hytale
   */
  sendConsoleCommand(cmd) {
    const clean = String(cmd || '').trim();
    if (!clean) return { ok: false, error: 'Comando vacío' };

    if (this.child && this.child.stdin && !this.child.killed) {
      this.appendLog(`> ${clean}`);
      this.child.stdin.write(`${clean}\n`);
      return { ok: true, message: `Comando enviado a consola: ${clean}` };
    }
    return {
      ok: false,
      error: 'El servidor no fue iniciado desde esta sesión web (usa RCON o reinícialo desde el panel).',
    };
  }

  /**
   * Lee la configuración del servidor (`config.json`) y del mundo (`universe/worlds/default/config.json`)
   */
  readServerConfigs() {
    const serverConfigPath = path.join(this.serverDir, 'config.json');
    const worldConfigPath = path.join(this.serverDir, 'universe/worlds/default/config.json');

    let serverConfig = {};
    let worldConfig = {};

    if (fs.existsSync(serverConfigPath)) {
      try {
        serverConfig = JSON.parse(fs.readFileSync(serverConfigPath, 'utf-8'));
      } catch {
        serverConfig = {};
      }
    }

    if (fs.existsSync(worldConfigPath)) {
      try {
        worldConfig = JSON.parse(fs.readFileSync(worldConfigPath, 'utf-8'));
      } catch {
        worldConfig = {};
      }
    }

    return {
      serverConfig,
      worldConfig,
      ram: {
        minRamGb: this.minRamGb,
        maxRamGb: this.maxRamGb,
      },
    };
  }

  /**
   * Guarda los cambios en `config.json` y `universe/worlds/default/config.json`
   */
  saveServerConfigs({ serverUpdates = {}, worldUpdates = {}, ramUpdates = {} }) {
    const serverConfigPath = path.join(this.serverDir, 'config.json');
    const worldConfigPath = path.join(this.serverDir, 'universe/worlds/default/config.json');

    if (ramUpdates.minRamGb) {
      this.minRamGb = Math.max(1, Math.min(Number(ramUpdates.minRamGb) || 4, 32));
    }
    if (ramUpdates.maxRamGb) {
      this.maxRamGb = Math.max(this.minRamGb, Math.min(Number(ramUpdates.maxRamGb) || 6, 64));
    }

    if (fs.existsSync(serverConfigPath) && Object.keys(serverUpdates).length > 0) {
      const current = JSON.parse(fs.readFileSync(serverConfigPath, 'utf-8'));

      if (typeof serverUpdates.ServerName === 'string') current.ServerName = serverUpdates.ServerName;
      if (typeof serverUpdates.MOTD === 'string') current.MOTD = serverUpdates.MOTD;
      if (typeof serverUpdates.Password === 'string') current.Password = serverUpdates.Password;
      if (serverUpdates.MaxPlayers !== undefined) {
        current.MaxPlayers = Math.max(1, Math.min(Number(serverUpdates.MaxPlayers) || 20, 1000));
      }
      if (serverUpdates.MaxViewRadius !== undefined) {
        current.MaxViewRadius = Math.max(4, Math.min(Number(serverUpdates.MaxViewRadius) || 32, 64));
      }
      if (typeof serverUpdates.RequireJoinPermission === 'boolean') {
        current.RequireJoinPermission = serverUpdates.RequireJoinPermission;
      }

      if (!current.Defaults) current.Defaults = {};
      if (typeof serverUpdates.GameMode === 'string') {
        current.Defaults.GameMode = serverUpdates.GameMode;
      }
      if (typeof serverUpdates.HardcoreMode === 'string') {
        current.Defaults.HardcoreMode = serverUpdates.HardcoreMode;
      }

      fs.writeFileSync(serverConfigPath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
    }

    if (fs.existsSync(worldConfigPath) && Object.keys(worldUpdates).length > 0) {
      const currentWorld = JSON.parse(fs.readFileSync(worldConfigPath, 'utf-8'));

      const boolKeys = [
        'IsPvpEnabled',
        'IsFallDamageEnabled',
        'IsGameTimePaused',
        'IsSpawningNPC',
        'IsAllNPCFrozen',
        'IsSavingPlayers',
        'IsSavingChunks',
        'IsCompassUpdating',
        'IsObjectiveMarkersEnabled',
      ];

      for (const key of boolKeys) {
        if (typeof worldUpdates[key] === 'boolean') {
          currentWorld[key] = worldUpdates[key];
        }
      }

      fs.writeFileSync(worldConfigPath, JSON.stringify(currentWorld, null, 2) + '\n', 'utf-8');
    }

    return this.readServerConfigs();
  }
}

