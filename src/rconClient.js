import { Rcon } from 'rcon-client';

export class HytaleRconClient {
  /**
   * @param {Object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {string} options.password
   * @param {boolean} options.mockMode
   */
  constructor({ host, port, password, mockMode = true }) {
    this.host = host;
    this.port = Number(port) || 25575;
    this.password = password;
    this.mockMode = mockMode;
    this.rcon = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.mockMode) {
      this.isConnected = true;
      console.log('🧪 [RCON SIMULADOR] Modo de prueba activo. No se requiere servidor de Hytale corriendo.');
      return;
    }

    try {
      console.log(`🔌 [RCON] Conectando a ${this.host}:${this.port}...`);
      this.rcon = await Rcon.connect({
        host: this.host,
        port: this.port,
        password: this.password,
      });

      this.isConnected = true;
      console.log('✅ [RCON] ¡Conectado exitosamente al servidor de Hytale!');

      this.rcon.on('end', () => {
        console.warn('⚠️ [RCON] Conexión cerrada por el servidor.');
        this.isConnected = false;
      });

      this.rcon.on('error', (err) => {
        console.error('❌ [RCON] Error en la conexión:', err.message);
        this.isConnected = false;
      });
    } catch (error) {
      this.isConnected = false;
      console.error(`❌ [RCON] No se pudo conectar a ${this.host}:${this.port} -> ${error.message}`);
      console.log('💡 Tip: Si aún no tienes tu servidor local encendido, deja MOCK_RCON=true en tu archivo .env');
    }
  }

  /**
   * Envía un comando individual al servidor de Hytale o lo simula en consola.
   * @param {string} command
   */
  async sendCommand(command) {
    if (this.mockMode) {
      console.log(`   ⚡ [SIMULADOR RCON -> HYTALE] Ejecutando: /${command}`);
      return `[Simulado OK]: /${command}`;
    }

    if (!this.isConnected || !this.rcon) {
      console.log('🔄 [RCON] Intentando reconectar antes de enviar comando...');
      await this.connect();
    }

    if (!this.isConnected || !this.rcon) {
      console.error(`❌ [RCON] Comando descartado (sin conexión): /${command}`);
      return null;
    }

    try {
      console.log(`   🚀 [RCON -> HYTALE] Enviando: /${command}`);
      const response = await this.rcon.send(command);
      if (response) {
        console.log(`   📩 [RESPUESTA HYTALE]: ${response}`);
      }
      return response;
    } catch (error) {
      console.error(`❌ [RCON] Error enviando comando "/${command}":`, error.message);
      this.isConnected = false;
      return null;
    }
  }

  async disconnect() {
    if (this.rcon && this.isConnected && !this.mockMode) {
      await this.rcon.end();
    }
    this.isConnected = false;
  }
}
