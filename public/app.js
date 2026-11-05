const state = {
  config: { gifts: {}, specialEvents: {}, defaultGift: { enabled: true, commands: [] } },
  env: { tiktokUsername: '', playerName: '', mockMode: false, rconConnected: false },
  mobs: [],
  mobsByRole: new Map(),
  items: [],
  itemsById: new Map(),
  giftsCatalog: [],
  giftsByName: new Map(),
  // Filtros en pestañas principales
  mobCatalogCategory: 'all',
  mobCatalogQuery: '',
  itemCatalogCategory: 'all',
  itemCatalogQuery: '',
  giftCatalogPrice: 'all',
  giftCatalogQuery: '',
  // Estado del Modal Editor de Regla
  modal: {
    editingOriginalGiftName: null,
    triggerType: 'gift', // 'gift' | 'follow' | 'likeMilestone' | 'defaultGift'
    rewardTab: 'mobs', // 'mobs' | 'items'
    selectedGiftName: '',
    selectedMobs: [], // [{ roleId, count }]
    selectedItems: [], // [{ itemId, count }]
    giftSearch: '',
    giftPriceFilter: 'all',
    mobSearch: '',
    mobCategoryFilter: 'all',
    itemSearch: '',
    itemCategoryFilter: 'all',
  },
};

const FALLBACK_MOB_IMG =
  'https://cdn.hytaleguide.net/entity-images/ppLBcFQeleGq2yZykaLv1AJ7FujWMndD3lDZLEB2_resized.png';
const FALLBACK_ITEM_IMG =
  'https://cdn.hytaleguide.net/entity-images/s7BBkg9AFSB6J0LHnsQv0chzF6VFDVl2yvugUAQG_resized.png';
const FALLBACK_GIFT_IMG =
  'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.webp';

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function matchPriceFilter(coins, filter) {
  const c = Number(coins) || 1;
  if (filter === '1') return c === 1;
  if (filter === '2-10') return c >= 2 && c <= 10;
  if (filter === '11-99') return c >= 11 && c <= 99;
  if (filter === '100-999') return c >= 100 && c <= 999;
  if (filter === '1000+') return c >= 1000;
  return true;
}

/**
 * Analiza un arreglo de comandos RCON y separa:
 * - sayMessage (texto después de `say `)
 * - mobs ([{ roleId, count }])
 * - items ([{ itemId, count }])
 * - extraCommands
 */
function parseRuleCommands(commands = []) {
  let sayMessage = '';
  const mobCounts = new Map();
  const itemCounts = new Map();
  const extraCommands = [];

  for (const raw of commands) {
    const cmd = String(raw).trim();
    if (!cmd) continue;

    if (cmd.toLowerCase().startsWith('say ')) {
      if (!sayMessage) {
        sayMessage = cmd.slice(4).trim();
      }
      continue;
    }

    const spawnMatch = cmd.match(/^(?:as\s+\S+\s+)?npc\s+spawn\s+([^\s;]+)$/i);
    if (spawnMatch) {
      const roleId = spawnMatch[1].trim();
      mobCounts.set(roleId, (mobCounts.get(roleId) || 0) + 1);
      continue;
    }

    const giveMatch = cmd.match(
      /^(?:as\s+\S+\s+)?give\s+(?:\{player\}|\S+)\s+([^\s;]+)(?:\s+--quantity\s+(\d+)|\s+(\d+))?$/i
    );
    if (giveMatch) {
      const itemId = giveMatch[1].trim();
      const qty = Math.max(1, Number(giveMatch[2] || giveMatch[3]) || 1);
      itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + qty);
      continue;
    }

    extraCommands.push(cmd);
  }

  const mobs = Array.from(mobCounts.entries()).map(([roleId, count]) => ({ roleId, count }));
  const items = Array.from(itemCounts.entries()).map(([itemId, count]) => ({ itemId, count }));
  return { sayMessage, mobs, items, extraCommands };
}

/**
 * Construye el arreglo de comandos RCON a partir de sayMessage, mobs, items y extraCommands
 */
function buildRuleCommands({ sayMessage, mobs = [], items = [], extraCommands = [] }) {
  const commands = [];
  if (sayMessage && sayMessage.trim()) {
    const cleanSay = sayMessage.trim().replace(/^say\s+/i, '');
    commands.push(`say ${cleanSay}`);
  }
  for (const mob of mobs) {
    const count = Math.max(1, Math.min(Number(mob.count) || 1, 25));
    for (let i = 0; i < count; i++) {
      commands.push(`as {player} npc spawn ${mob.roleId}`);
    }
  }
  for (const it of items) {
    const count = Math.max(1, Math.min(Number(it.count) || 1, 100));
    if (count > 1) {
      commands.push(`give {player} ${it.itemId} --quantity ${count}`);
    } else {
      commands.push(`give {player} ${it.itemId}`);
    }
  }
  for (const extra of extraCommands) {
    const clean = extra.trim();
    if (clean) commands.push(clean);
  }
  return commands;
}

function findMobInfo(roleId) {
  if (state.mobsByRole.has(roleId)) return state.mobsByRole.get(roleId);
  const lower = String(roleId).toLowerCase();
  for (const [k, v] of state.mobsByRole.entries()) {
    if (k.toLowerCase() === lower) return v;
  }
  return {
    name: roleId.replaceAll('_', ' '),
    roleId,
    image: FALLBACK_MOB_IMG,
    categories: [],
  };
}

function findItemInfo(itemId) {
  if (state.itemsById.has(itemId)) return state.itemsById.get(itemId);
  const lower = String(itemId).toLowerCase();
  for (const [k, v] of state.itemsById.entries()) {
    if (k.toLowerCase() === lower) return v;
  }
  return {
    name: itemId.replaceAll('_', ' '),
    itemId,
    image: FALLBACK_ITEM_IMG,
    categories: [],
  };
}

function findGiftInfo(giftName) {
  const key = String(giftName || '').toLowerCase();
  return (
    state.giftsByName.get(key) || {
      name: giftName,
      coins: null,
      image: FALLBACK_GIFT_IMG,
    }
  );
}

// ==========================================
// CARGA DE DATOS DESDE EL SERVIDOR
// ==========================================
async function loadConfig() {
  const res = await fetch('/api/config');
  const data = await res.json();
  if (data.ok) {
    state.config = data.config || { gifts: {}, specialEvents: {}, defaultGift: {} };
    state.env = data.env || state.env;
    renderTopbarEnv();
    renderConfiguredRules();
  }
}

async function checkSystemStatus(force = false) {
  const rconCard = document.getElementById('rconStatusCard');
  const tiktokCard = document.getElementById('tiktokStatusCard');

  if (force) {
    document.getElementById('rconStatusTitle').textContent = 'Verificando servidor Hytale...';
    document.getElementById('tiktokStatusTitle').textContent = 'Verificando directo en TikTok...';
  }

  try {
    const res = await fetch(`/api/status${force ? '?force=1' : ''}`);
    const data = await res.json();
    if (!data.ok) return;

    const rcon = data.rcon || {};
    rconCard.className = `status-card status-${rcon.status || 'offline'}`;
    document.getElementById('rconStatusTitle').textContent = rcon.title || 'Estado RCON desconocido';
    document.getElementById('rconStatusMsg').textContent = rcon.message || '';

    const tiktok = data.tiktok || {};
    tiktokCard.className = `status-card status-${tiktok.status || 'offline'}`;
    document.getElementById('tiktokStatusTitle').textContent = tiktok.title || 'Estado TikTok desconocido';
    document.getElementById('tiktokStatusMsg').textContent = tiktok.message || '';

    const proc = data.serverProcess || {};
    state.serverProcess = proc;
    renderServerProcessUI(proc, rcon);
  } catch {
    rconCard.className = 'status-card status-offline';
    document.getElementById('rconStatusTitle').textContent = 'Sin conexión con el servidor local GUI';
    document.getElementById('rconStatusMsg').textContent = 'Verifica que npm run gui esté activo en la terminal.';
  }
}

function renderServerProcessUI(proc, rcon = {}) {
  const quickBtn = document.getElementById('quickToggleServerBtn');
  const badge = document.getElementById('serverProcessBadge');
  const isRunning = Boolean(proc.pid) || Boolean(rcon.serverUp);

  if (quickBtn) {
    if (isRunning) {
      quickBtn.className = 'btn btn-danger btn-sm';
      quickBtn.textContent = '⏹️ Detener Servidor Hytale';
      quickBtn.dataset.running = '1';
    } else {
      quickBtn.className = 'btn btn-primary btn-sm';
      quickBtn.textContent = '▶️ Iniciar Servidor Hytale';
      quickBtn.dataset.running = '0';
    }
  }

  if (badge) {
    if (isRunning && rcon.serverUp) {
      badge.textContent = `🟢 En línea (PID: ${proc.pid || 'Activo'})`;
    } else if (proc.pid) {
      badge.textContent = `⏳ Iniciando mundo... (PID: ${proc.pid})`;
    } else {
      badge.textContent = '🔴 Servidor Apagado';
    }
  }

  const dirInput = document.getElementById('hytaleServerDirInput');
  if (dirInput && proc.serverDir && document.activeElement !== dirInput) {
    dirInput.value = proc.serverDir;
  }

  const checkRow = document.getElementById('serverFilesCheckRow');
  if (checkRow && proc.serverDir) {
    checkRow.innerHTML = `
      <span class="${proc.jarExists ? 'combo-tag' : 'coin-tag'}">
        ${proc.jarExists ? '✅ HytaleServer.jar' : '❌ Falta HytaleServer.jar'}
      </span>
      <span class="${proc.assetsExists ? 'combo-tag' : 'coin-tag'}">
        ${proc.assetsExists ? '✅ Assets.zip' : '❌ Falta Assets.zip'}
      </span>
      <span class="${proc.hyrconInstalled ? 'combo-tag' : 'coin-tag'}">
        ${proc.hyrconInstalled ? '✅ Mod HyRCON.jar instalado' : '⚠️ Mod HyRCON.jar no instalado (Se instalará al iniciar)'}
      </span>
    `;
  }
}

async function loadHytaleServerConfig() {
  try {
    const res = await fetch('/api/hytale/config');
    const data = await res.json();
    if (!data.ok) return;

    const srv = data.serverConfig || {};
    const wld = data.worldConfig || {};
    const ram = data.ram || {};

    document.getElementById('srvName').value = srv.ServerName ?? 'Hytale Server';
    document.getElementById('srvPassword').value = srv.Password ?? '';
    document.getElementById('srvMotd').value = srv.MOTD ?? '';
    document.getElementById('srvGameMode').value = srv.Defaults?.GameMode || 'Adventure';
    document.getElementById('srvMaxPlayers').value = srv.MaxPlayers ?? 100;
    document.getElementById('srvViewRadius').value = srv.MaxViewRadius ?? 32;
    document.getElementById('srvRequirePerm').checked = Boolean(srv.RequireJoinPermission);

    document.getElementById('srvMinRam').value = ram.minRamGb || 4;
    document.getElementById('srvMaxRam').value = ram.maxRamGb || 6;

    document.getElementById('wldPvp').checked = Boolean(wld.IsPvpEnabled);
    document.getElementById('wldFallDamage').checked = wld.IsFallDamageEnabled !== false;
    document.getElementById('wldSpawningNpc').checked = wld.IsSpawningNPC !== false;
    document.getElementById('wldTimePaused').checked = Boolean(wld.IsGameTimePaused);
    document.getElementById('wldNpcFrozen').checked = Boolean(wld.IsAllNPCFrozen);
    document.getElementById('wldSaving').checked = wld.IsSavingPlayers !== false && wld.IsSavingChunks !== false;
  } catch {
    // Ignorar error de lectura inicial
  }
}

async function saveHytaleServerConfig() {
  const payload = {
    serverUpdates: {
      ServerName: document.getElementById('srvName').value.trim(),
      Password: document.getElementById('srvPassword').value,
      MOTD: document.getElementById('srvMotd').value,
      GameMode: document.getElementById('srvGameMode').value,
      MaxPlayers: Number(document.getElementById('srvMaxPlayers').value) || 100,
      MaxViewRadius: Number(document.getElementById('srvViewRadius').value) || 32,
      RequireJoinPermission: document.getElementById('srvRequirePerm').checked,
    },
    worldUpdates: {
      IsPvpEnabled: document.getElementById('wldPvp').checked,
      IsFallDamageEnabled: document.getElementById('wldFallDamage').checked,
      IsSpawningNPC: document.getElementById('wldSpawningNpc').checked,
      IsGameTimePaused: document.getElementById('wldTimePaused').checked,
      IsAllNPCFrozen: document.getElementById('wldNpcFrozen').checked,
      IsSavingPlayers: document.getElementById('wldSaving').checked,
      IsSavingChunks: document.getElementById('wldSaving').checked,
    },
    ramUpdates: {
      minRamGb: Number(document.getElementById('srvMinRam').value) || 4,
      maxRamGb: Number(document.getElementById('srvMaxRam').value) || 6,
    },
  };

  const res = await fetch('/api/hytale/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.ok) {
    showToast('💾 ¡Configuración del servidor de Hytale y del mundo guardada!');
  } else {
    showToast(`❌ Error: ${data.error || 'No se pudo guardar'}`);
  }
}

async function loadHytaleLogs() {
  try {
    const res = await fetch('/api/hytale/logs');
    const data = await res.json();
    if (!data.ok) return;
    const box = document.getElementById('hytaleConsoleBox');
    if (!box) return;
    const lines = data.logs || [];
    if (lines.length === 0) {
      box.textContent =
        'El servidor aún no tiene registros en esta sesión. Haz clic en "▶️ Iniciar Servidor Hytale" para arrancarlo y ver su consola en vivo aquí.';
    } else {
      const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      box.textContent = lines.join('\n');
      if (wasAtBottom) {
        box.scrollTop = box.scrollHeight;
      }
    }
  } catch {
    // Ignorar
  }
}

async function startHytaleServerFromWeb() {
  const minRamGb = Number(document.getElementById('srvMinRam')?.value) || 4;
  const maxRamGb = Number(document.getElementById('srvMaxRam')?.value) || 6;
  showToast('🚀 Iniciando el servidor dedicado de Hytale...');
  const res = await fetch('/api/hytale/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minRamGb, maxRamGb }),
  });
  const data = await res.json();
  if (data.ok) {
    state.env.mockMode = false;
    renderTopbarEnv();
    showToast(`✅ ${data.message}`);
    await checkSystemStatus(true);
    await loadHytaleLogs();
  } else {
    showToast(`❌ ${data.error || 'No se pudo iniciar el servidor'}`);
  }
}

async function stopHytaleServerFromWeb() {
  if (!confirm('¿Deseas detener el servidor de Hytale? (Se guardará el mundo antes de cerrar)')) return;
  showToast('🛑 Deteniendo el servidor de Hytale...');
  const res = await fetch('/api/hytale/stop', { method: 'POST' });
  const data = await res.json();
  if (data.ok) {
    showToast(`⏹️ ${data.message}`);
    setTimeout(() => checkSystemStatus(true), 2000);
    await loadHytaleLogs();
  } else {
    showToast(`❌ ${data.error || 'No se pudo detener el servidor'}`);
  }
}

async function loadMobs(refresh = false) {
  document.getElementById('mobsCountBadge').textContent = '...';
  const res = await fetch(`/api/mobs${refresh ? '?refresh=1' : ''}`);
  const data = await res.json();
  if (data.ok) {
    state.mobs = data.mobs || [];
    state.mobsByRole.clear();
    for (const m of state.mobs) {
      state.mobsByRole.set(m.roleId, m);
    }
    document.getElementById('mobsCountBadge').textContent = state.mobs.length;
    populateMobCategories();
    renderMobsCatalog();
    renderConfiguredRules();
  }
}

async function loadItems(refresh = false) {
  const badge = document.getElementById('itemsCountBadge');
  if (badge) badge.textContent = '...';
  const res = await fetch(`/api/items${refresh ? '?refresh=1' : ''}`);
  const data = await res.json();
  if (data.ok) {
    state.items = data.items || [];
    state.itemsById.clear();
    for (const it of state.items) {
      state.itemsById.set(it.itemId, it);
    }
    if (badge) badge.textContent = state.items.length;
    populateItemCategories();
    renderItemsCatalog();
    renderConfiguredRules();
  }
}

async function loadGiftsCatalog(refresh = false) {
  document.getElementById('giftsCountBadge').textContent = '...';
  const res = await fetch(`/api/tiktok-gifts${refresh ? '?refresh=1' : ''}`);
  const data = await res.json();
  if (data.ok) {
    state.giftsCatalog = data.gifts || [];
    state.giftsByName.clear();
    for (const g of state.giftsCatalog) {
      state.giftsByName.set(g.name.toLowerCase(), g);
    }
    document.getElementById('giftsCountBadge').textContent = state.giftsCatalog.length;
    renderGiftsCatalog();
    renderConfiguredRules();
  }
}

// ==========================================
// RENDERIZADO DE LA BARRA SUPERIOR (.env)
// ==========================================
function updateTopbarTooltips() {
  const playerInput = document.getElementById('envPlayerName');
  const tiktokInput = document.getElementById('envTiktokUser');
  const playerWrap = document.getElementById('playerFieldWrap');
  const tiktokWrap = document.getElementById('tiktokFieldWrap');

  const pVal = playerInput?.value?.trim();
  const tVal = tiktokInput?.value?.trim();

  const pTooltip = pVal
    ? `👤 Jugador Hytale: ${pVal}`
    : '👤 Jugador Hytale: Escribe tu nombre de usuario dentro del servidor de Hytale (Ej. TuNombreEnHytale)';
  const tTooltip = tVal
    ? `🎥 Usuario TikTok: @${tVal.replace(/^@/, '')}`
    : '🎥 Usuario TikTok: Escribe el @usuario de la cuenta que transmitirá en TikTok Live (Ej. @tu_usuario_tiktok)';

  if (playerWrap) playerWrap.setAttribute('data-tooltip', pTooltip);
  if (playerInput) playerInput.title = pTooltip;
  if (tiktokWrap) tiktokWrap.setAttribute('data-tooltip', tTooltip);
  if (tiktokInput) tiktokInput.title = tTooltip;
}

function renderTopbarEnv() {
  document.getElementById('envPlayerName').value = state.env.playerName || '';
  document.getElementById('envTiktokUser').value = state.env.tiktokUsername || '';
  updateTopbarTooltips();
  const btn = document.getElementById('envMockModeBtn');
  if (state.env.mockMode) {
    btn.className = 'status-pill mock';
    btn.textContent = '🧪 SIMULADOR (Click para Real)';
  } else {
    btn.className = 'status-pill real';
    btn.textContent = '🟢 RCON REAL ACTIVO';
  }
}

// ==========================================
// RENDERIZADO PESTAÑA 1: MIS REGLAS CONFIGURADAS
// ==========================================
function renderMobChipsHtml(commands) {
  const { mobs, items, extraCommands } = parseRuleCommands(commands);
  const parts = [];

  for (const item of mobs) {
    const mob = findMobInfo(item.roleId);
    parts.push(`
      <div class="rule-mob-chip">
        <img src="${escapeHtml(mob.image || FALLBACK_MOB_IMG)}" alt="${escapeHtml(mob.name)}" loading="lazy" />
        <div class="rule-mob-chip-info">
          <span class="rule-mob-chip-name">👾 ${item.count}x ${escapeHtml(mob.name)}</span>
          <span class="rule-mob-chip-id">npc spawn ${escapeHtml(item.roleId)}</span>
        </div>
      </div>
    `);
  }

  for (const it of items) {
    const info = findItemInfo(it.itemId);
    parts.push(`
      <div class="rule-mob-chip rule-item-chip">
        <img src="${escapeHtml(info.image || FALLBACK_ITEM_IMG)}" alt="${escapeHtml(info.name)}" loading="lazy" />
        <div class="rule-mob-chip-info">
          <span class="rule-mob-chip-name">🗡️ ${it.count}x ${escapeHtml(info.name)}</span>
          <span class="rule-mob-chip-id">give {player} ${escapeHtml(it.itemId)}</span>
        </div>
      </div>
    `);
  }

  for (const cmd of extraCommands) {
    parts.push(`<div class="rule-cmd-line">⚡ ${escapeHtml(cmd)}</div>`);
  }

  if (parts.length === 0) {
    return `<div class="rule-cmd-line">Sin mobs ni ítems asignados</div>`;
  }
  return parts.join('');
}

function renderConfiguredRules() {
  const giftsObj = state.config.gifts || {};
  const entries = Object.entries(giftsObj);
  document.getElementById('rulesCountBadge').textContent = entries.length;

  const grid = document.getElementById('configuredGiftsGrid');
  if (entries.length === 0) {
    grid.innerHTML = `
      <div class="rule-card">
        <p class="rule-desc">No tienes regalos configurados todavía. Haz clic en <strong>"➕ Agregar Regalo"</strong> para elegir un regalo de TikTok y asignarle un Mob de Hytale.</p>
      </div>
    `;
  } else {
    grid.innerHTML = entries
      .map(([giftName, rule]) => {
        const giftInfo = findGiftInfo(giftName);
        const coinsHtml = giftInfo.coins
          ? `<span class="coin-tag">🪙 ${giftInfo.coins} ${giftInfo.coins === 1 ? 'moneda' : 'monedas'}</span>`
          : '';
        const comboHtml = rule.scaleWithCombo
          ? `<span class="combo-tag">🔥 Escala con Combo</span>`
          : '';

        return `
          <div class="rule-card">
            <div>
              <div class="rule-card-header">
                <div class="rule-gift-info">
                  <img class="rule-gift-thumb" src="${escapeHtml(giftInfo.image || FALLBACK_GIFT_IMG)}" alt="${escapeHtml(giftName)}" loading="lazy" />
                  <div>
                    <div class="rule-gift-title">${escapeHtml(giftName)}</div>
                    <div class="rule-gift-meta">
                      ${coinsHtml}
                      ${comboHtml}
                    </div>
                  </div>
                </div>
              </div>
              <p class="rule-desc mt-sm">${escapeHtml(rule.description || 'Acción personalizada al recibir este regalo')}</p>
              <div class="rule-mobs-preview mt-sm">
                ${renderMobChipsHtml(rule.commands)}
              </div>
            </div>

            <div class="rule-card-actions">
              <button type="button" class="btn btn-success btn-sm" data-action="test-gift" data-gift="${escapeHtml(giftName)}">
                ⚡ Probar en Hytale
              </button>
              <button type="button" class="btn btn-secondary btn-sm" data-action="edit-gift" data-gift="${escapeHtml(giftName)}">
                ✏️ Editar
              </button>
              <button type="button" class="btn btn-danger btn-sm" data-action="delete-gift" data-gift="${escapeHtml(giftName)}">
                🗑️
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Renderizar Eventos Especiales (Follow, Likes, DefaultGift)
  const specialGrid = document.getElementById('specialEventsGrid');
  const followCfg = state.config.specialEvents?.follow || { enabled: false, commands: [] };
  const likeCfg = state.config.specialEvents?.likeMilestone || { enabled: false, everyLikes: 100, commands: [] };
  const defaultCfg = state.config.defaultGift || { enabled: false, commands: [] };

  const specials = [
    {
      key: 'follow',
      icon: '➕',
      title: 'Nuevo Seguidor (Follow)',
      enabled: Boolean(followCfg.enabled),
      subtitle: followCfg.enabled ? '🟢 Activo' : '⚪ Desactivado',
      desc: 'Se ejecuta cada vez que un espectador sigue tu cuenta en directo.',
      commands: followCfg.commands || [],
      testType: 'follow',
    },
    {
      key: 'likeMilestone',
      icon: '❤️',
      title: `Meta de Likes (Cada ${likeCfg.everyLikes || 100} Likes)`,
      enabled: Boolean(likeCfg.enabled),
      subtitle: likeCfg.enabled ? '🟢 Activo' : '⚪ Desactivado',
      desc: `Se ejecuta automáticamente cada ${likeCfg.everyLikes || 100} likes acumulados en el Live.`,
      commands: likeCfg.commands || [],
      testType: 'like',
    },
    {
      key: 'defaultGift',
      icon: '🎲',
      title: 'Regalo por Defecto (No listado)',
      enabled: Boolean(defaultCfg.enabled),
      subtitle: defaultCfg.enabled ? '🟢 Activo' : '⚪ Desactivado',
      desc: defaultCfg.description || 'Se ejecuta cuando envían cualquier regalo que no tenga su propia regla.',
      commands: defaultCfg.commands || [],
      testType: 'defaultGift',
    },
  ];

  specialGrid.innerHTML = specials
    .map(
      (sp) => `
      <div class="rule-card">
        <div>
          <div class="rule-card-header">
            <div class="rule-gift-info">
              <div class="brand-logo">${sp.icon}</div>
              <div>
                <div class="rule-gift-title">${escapeHtml(sp.title)}</div>
                <div class="rule-gift-meta">
                  <span class="coin-tag">${sp.subtitle}</span>
                </div>
              </div>
            </div>
          </div>
          <p class="rule-desc mt-sm">${escapeHtml(sp.desc)}</p>
          <div class="rule-mobs-preview mt-sm">
            ${renderMobChipsHtml(sp.commands)}
          </div>
        </div>
        <div class="rule-card-actions">
          <button type="button" class="btn btn-success btn-sm" data-action="test-special" data-special="${sp.key}">
            ⚡ Probar en Hytale
          </button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="edit-special" data-special="${sp.key}">
            ✏️ Editar Mobs / Evento
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

// ==========================================
// RENDERIZADO PESTAÑA 2: CATÁLOGO DE MOBS HYTALE
// ==========================================
function populateMobCategories() {
  const counts = new Map();
  for (const m of state.mobs) {
    for (const c of m.categories || []) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  const topCategories = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name);

  const pillsContainer = document.getElementById('mobCategoryPills');
  pillsContainer.innerHTML = [
    `<button type="button" class="pill ${state.mobCatalogCategory === 'all' ? 'active' : ''}" data-cat="all">Todos (${state.mobs.length})</button>`,
    ...topCategories.map(
      (cat) =>
        `<button type="button" class="pill ${state.mobCatalogCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
    ),
  ].join('');

  const modalSelect = document.getElementById('modalMobCategoryFilter');
  const allCats = Array.from(counts.keys()).sort();
  modalSelect.innerHTML = [
    `<option value="all">Todas las categorías (${state.mobs.length})</option>`,
    ...allCats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${counts.get(c)})</option>`),
  ].join('');
}

function renderMobsCatalog() {
  const grid = document.getElementById('mobsCatalogGrid');
  const q = state.mobCatalogQuery.trim().toLowerCase();
  const cat = state.mobCatalogCategory;

  const filtered = state.mobs.filter((m) => {
    if (cat !== 'all' && !(m.categories || []).includes(cat)) return false;
    if (q) {
      return (
        m.name.toLowerCase().includes(q) ||
        m.roleId.toLowerCase().includes(q) ||
        (m.categories || []).some((c) => c.toLowerCase().includes(q))
      );
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="rule-desc">No se encontraron mobs con ese filtro.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (m) => `
      <div class="entity-card">
        ${m.isNew ? '<span class="entity-badge-new">NEW</span>' : ''}
        <div class="entity-img-wrap">
          <img src="${escapeHtml(m.image || FALLBACK_MOB_IMG)}" alt="${escapeHtml(m.name)}" loading="lazy" />
        </div>
        <div class="entity-title">${escapeHtml(m.name)}</div>
        <div class="entity-sub">${escapeHtml(m.roleId)}</div>
        <div class="entity-actions">
          <button type="button" class="btn btn-success btn-sm" data-action="spawn-mob-now" data-role="${escapeHtml(m.roleId)}" title="Spawnear ahora mismo cerca de tu jugador">
            ⚡ Spawnear
          </button>
          <button type="button" class="btn btn-primary btn-sm" data-action="assign-mob" data-role="${escapeHtml(m.roleId)}" title="Asignar este mob a un Regalo o Evento">
            🎯 Asignar
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

// ==========================================
// RENDERIZADO PESTAÑA 2.5: CATÁLOGO DE ÍTEMS HYTALE
// ==========================================
function populateItemCategories() {
  const counts = new Map();
  for (const it of state.items) {
    for (const c of it.categories || []) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  const topCategories = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name);

  const pillsContainer = document.getElementById('itemCategoryPills');
  if (pillsContainer) {
    pillsContainer.innerHTML = [
      `<button type="button" class="pill ${state.itemCatalogCategory === 'all' ? 'active' : ''}" data-item-cat="all">Todos (${state.items.length})</button>`,
      ...topCategories.map(
        (cat) =>
          `<button type="button" class="pill ${state.itemCatalogCategory === cat ? 'active' : ''}" data-item-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
      ),
    ].join('');
  }

  const modalSelect = document.getElementById('modalItemCategoryFilter');
  if (modalSelect) {
    const allCats = Array.from(counts.keys()).sort();
    modalSelect.innerHTML = [
      `<option value="all">Todas las categorías (${state.items.length})</option>`,
      ...allCats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${counts.get(c)})</option>`),
    ].join('');
  }
}

function renderItemsCatalog() {
  const grid = document.getElementById('itemsCatalogGrid');
  if (!grid) return;
  const q = state.itemCatalogQuery.trim().toLowerCase();
  const cat = state.itemCatalogCategory;

  const filtered = state.items.filter((it) => {
    if (cat !== 'all' && !(it.categories || []).includes(cat)) return false;
    if (q) {
      return (
        it.name.toLowerCase().includes(q) ||
        it.itemId.toLowerCase().includes(q) ||
        (it.categories || []).some((c) => c.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Mostrar hasta 240 tarjetas en vista para máxima fluidez del DOM (de los 3,873 ítems)
  const visible = filtered.slice(0, 240);

  if (visible.length === 0) {
    grid.innerHTML = `<p class="rule-desc">No se encontraron ítems con ese filtro.</p>`;
    return;
  }

  grid.innerHTML = visible
    .map(
      (it) => `
      <div class="entity-card">
        ${it.isNew ? '<span class="entity-badge-new">NEW</span>' : ''}
        <div class="entity-img-wrap">
          <img src="${escapeHtml(it.image || FALLBACK_ITEM_IMG)}" alt="${escapeHtml(it.name)}" loading="lazy" />
        </div>
        <div class="entity-title">${escapeHtml(it.name)}</div>
        <div class="entity-sub">${escapeHtml(it.itemId)}</div>
        <div class="entity-actions">
          <button type="button" class="btn btn-success btn-sm" data-action="give-item-now" data-item="${escapeHtml(it.itemId)}" title="Dar este ítem ahora mismo a tu jugador en Hytale">
            ⚡ Dar Ítem
          </button>
          <button type="button" class="btn btn-primary btn-sm" data-action="assign-item" data-item="${escapeHtml(it.itemId)}" title="Asignar este ítem a un Regalo o Evento">
            🎯 Asignar
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

// ==========================================
// RENDERIZADO PESTAÑA 3: CATÁLOGO DE REGALOS TIKTOK
// ==========================================
function renderGiftsCatalog() {
  const grid = document.getElementById('giftsCatalogGrid');
  const q = state.giftCatalogQuery.trim().toLowerCase();
  const priceFilter = state.giftCatalogPrice;

  const filtered = state.giftsCatalog.filter((g) => {
    if (!matchPriceFilter(g.coins, priceFilter)) return false;
    if (q && !g.name.toLowerCase().includes(q)) return false;
    return true;
  });

  // Mostrar hasta 240 tarjetas en vista para máxima fluidez del DOM
  const visible = filtered.slice(0, 240);

  if (visible.length === 0) {
    grid.innerHTML = `<p class="rule-desc">No se encontraron regalos con ese filtro.</p>`;
    return;
  }

  grid.innerHTML = visible
    .map((g) => {
      const isConfigured = Boolean(
        Object.keys(state.config.gifts || {}).find((k) => k.toLowerCase() === g.name.toLowerCase())
      );
      return `
        <div class="entity-card">
          ${isConfigured ? '<span class="entity-badge-new">ACTIVO</span>' : ''}
          <div class="entity-img-wrap">
            <img src="${escapeHtml(g.image || FALLBACK_GIFT_IMG)}" alt="${escapeHtml(g.name)}" loading="lazy" />
          </div>
          <div class="entity-title">${escapeHtml(g.name)}</div>
          <div class="coin-tag">🪙 ${g.coins}</div>
          <div class="entity-actions">
            <button type="button" class="btn btn-primary btn-sm" data-action="configure-gift" data-gift="${escapeHtml(g.name)}">
              ${isConfigured ? '✏️ Editar Regla' : '➕ Asignar Mob'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// ==========================================
// MODAL EDITOR VISUAL (REGALO / EVENTO + MOBS O ÍTEMS)
// ==========================================
function openRuleModal(options = {}) {
  const m = state.modal;
  m.editingOriginalGiftName = options.editingGiftName || null;
  m.triggerType = options.triggerType || 'gift';
  m.selectedGiftName = options.giftName || options.editingGiftName || 'Rose';
  m.selectedMobs = [];
  m.selectedItems = [];
  m.rewardTab = options.preselectedItemId ? 'items' : 'mobs';
  m.giftSearch = '';
  m.giftPriceFilter = 'all';
  m.mobSearch = '';
  m.mobCategoryFilter = 'all';
  m.itemSearch = '';
  m.itemCategoryFilter = 'all';

  document.getElementById('modalGiftSearch').value = '';
  document.getElementById('modalGiftPriceFilter').value = 'all';
  document.getElementById('modalMobSearch').value = '';
  document.getElementById('modalMobCategoryFilter').value = 'all';
  const modalItemSearch = document.getElementById('modalItemSearch');
  const modalItemCat = document.getElementById('modalItemCategoryFilter');
  if (modalItemSearch) modalItemSearch.value = '';
  if (modalItemCat) modalItemCat.value = 'all';

  let existingRule = null;
  if (m.triggerType === 'gift') {
    const matchedKey = Object.keys(state.config.gifts || {}).find(
      (k) => k.toLowerCase() === String(m.selectedGiftName).toLowerCase()
    );
    if (matchedKey) {
      m.selectedGiftName = matchedKey;
      existingRule = state.config.gifts[matchedKey];
    }
  } else if (m.triggerType === 'follow') {
    existingRule = state.config.specialEvents?.follow;
  } else if (m.triggerType === 'likeMilestone') {
    existingRule = state.config.specialEvents?.likeMilestone;
  } else if (m.triggerType === 'defaultGift') {
    existingRule = state.config.defaultGift;
  }

  if (existingRule) {
    const parsed = parseRuleCommands(existingRule.commands || []);
    m.selectedMobs = parsed.mobs;
    m.selectedItems = parsed.items;
    if (m.selectedItems.length > 0 && m.selectedMobs.length === 0 && !options.preselectedMobRole) {
      m.rewardTab = 'items';
    }
    document.getElementById('modalDescription').value = existingRule.description || '';
    document.getElementById('modalScaleCombo').checked = existingRule.scaleWithCombo !== false;
    document.getElementById('modalSayMessage').value = parsed.sayMessage || '';
    document.getElementById('modalExtraCommands').value = parsed.extraCommands.join('\n');
    document.getElementById('modalSpecialEnabled').checked = existingRule.enabled !== false;
    document.getElementById('modalEveryLikes').value = existingRule.everyLikes || 100;
  } else {
    document.getElementById('modalDescription').value = '';
    document.getElementById('modalScaleCombo').checked = true;
    document.getElementById('modalSayMessage').value = options.preselectedItemId
      ? '[TikTok] ¡{user} envió {repeatCount}x {giftName}! Entregando ítem a {player}.'
      : '[TikTok] ¡{user} envió {repeatCount}x {giftName}! ¡Aparece un enemigo para {player}!';
    document.getElementById('modalExtraCommands').value = '';
    document.getElementById('modalSpecialEnabled').checked = true;
    document.getElementById('modalEveryLikes').value = 100;
  }

  // Si venimos de hacer clic en "🎯 Asignar" sobre un Mob del catálogo
  if (options.preselectedMobRole) {
    m.rewardTab = 'mobs';
    const exists = m.selectedMobs.find((x) => x.roleId === options.preselectedMobRole);
    if (!exists) {
      m.selectedMobs.push({ roleId: options.preselectedMobRole, count: 1 });
    }
    const mobInfo = findMobInfo(options.preselectedMobRole);
    if (!document.getElementById('modalDescription').value) {
      document.getElementById('modalDescription').value = `Spawnea ${mobInfo.name} cerca del jugador`;
    }
  }

  // Si venimos de hacer clic en "🎯 Asignar" sobre un Ítem del catálogo
  if (options.preselectedItemId) {
    m.rewardTab = 'items';
    const exists = m.selectedItems.find((x) => x.itemId === options.preselectedItemId);
    if (!exists) {
      m.selectedItems.push({ itemId: options.preselectedItemId, count: 1 });
    }
    const itemInfo = findItemInfo(options.preselectedItemId);
    if (!document.getElementById('modalDescription').value) {
      document.getElementById('modalDescription').value = `Da ${itemInfo.name} al jugador`;
    }
  }

  syncModalTriggerUI();
  syncModalRewardTabUI();
  renderModalSelectedGiftBanner();
  renderModalGiftsPicker();
  renderModalSelectedMobs();
  renderModalMobsPicker();
  renderModalItemsPicker();

  document.getElementById('ruleModalBackdrop').classList.remove('hidden');
}

function closeRuleModal() {
  document.getElementById('ruleModalBackdrop').classList.add('hidden');
}

function syncModalTriggerUI() {
  const t = state.modal.triggerType;
  document.querySelectorAll('.trigger-type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.trigger === t);
  });

  document.getElementById('triggerGiftSection').classList.toggle('hidden', t !== 'gift');
  document.getElementById('triggerSpecialSection').classList.toggle('hidden', t === 'gift');
  document.getElementById('modalComboGroup').classList.toggle('hidden', t !== 'gift');
  document.getElementById('modalLikesEveryGroup').classList.toggle('hidden', t !== 'likeMilestone');
}

function syncModalRewardTabUI() {
  const tab = state.modal.rewardTab || 'mobs';
  document.querySelectorAll('.reward-type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rewardTab === tab);
  });
  const mobsSec = document.getElementById('modalMobsSection');
  const itemsSec = document.getElementById('modalItemsSection');
  if (mobsSec) mobsSec.classList.toggle('hidden', tab !== 'mobs');
  if (itemsSec) itemsSec.classList.toggle('hidden', tab !== 'items');
}

function renderModalSelectedGiftBanner() {
  const banner = document.getElementById('selectedGiftBanner');
  const giftName = state.modal.selectedGiftName;
  if (!giftName) {
    banner.innerHTML = `<div class="selected-banner-empty">Selecciona un regalo de TikTok abajo 👇</div>`;
    return;
  }
  const info = findGiftInfo(giftName);
  banner.innerHTML = `
    <div class="selected-banner-item">
      <img src="${escapeHtml(info.image || FALLBACK_GIFT_IMG)}" alt="${escapeHtml(giftName)}" />
      <div>
        <div class="rule-gift-title">🎁 ${escapeHtml(giftName)}</div>
        <div class="coin-tag">🪙 ${info.coins ?? '?'} monedas</div>
      </div>
    </div>
    <span class="combo-tag">Seleccionado</span>
  `;
}

function renderModalGiftsPicker() {
  const grid = document.getElementById('modalGiftsPickerGrid');
  const q = state.modal.giftSearch.trim().toLowerCase();
  const priceFilter = state.modal.giftPriceFilter;

  const filtered = state.giftsCatalog
    .filter((g) => {
      if (!matchPriceFilter(g.coins, priceFilter)) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    })
    .slice(0, 120);

  grid.innerHTML = filtered
    .map((g) => {
      const selected = g.name.toLowerCase() === String(state.modal.selectedGiftName).toLowerCase();
      return `
        <div class="picker-item ${selected ? 'selected' : ''}" data-pick-gift="${escapeHtml(g.name)}">
          <img src="${escapeHtml(g.image || FALLBACK_GIFT_IMG)}" alt="${escapeHtml(g.name)}" loading="lazy" />
          <div class="picker-item-name">${escapeHtml(g.name)}</div>
          <div class="picker-item-sub">🪙 ${g.coins}</div>
        </div>
      `;
    })
    .join('');
}

function renderModalSelectedMobs() {
  const container = document.getElementById('selectedMobsList');
  const mobsList = state.modal.selectedMobs || [];
  const itemsList = state.modal.selectedItems || [];

  if (mobsList.length === 0 && itemsList.length === 0) {
    container.innerHTML = `<p class="hint">Haz clic en uno o más Mobs o Ítems de Hytale abajo para asignarlos a este evento 👇</p>`;
    return;
  }

  const mobRows = mobsList.map((item) => {
    const mob = findMobInfo(item.roleId);
    return `
      <div class="selected-mob-row">
        <div class="selected-mob-left">
          <img src="${escapeHtml(mob.image || FALLBACK_MOB_IMG)}" alt="${escapeHtml(mob.name)}" />
          <div>
            <div class="rule-mob-chip-name">👾 ${escapeHtml(mob.name)}</div>
            <div class="rule-mob-chip-id">npc spawn ${escapeHtml(item.roleId)}</div>
          </div>
        </div>
        <div class="selected-mob-controls">
          <button type="button" class="qty-btn" data-mob-qty="-1" data-role="${escapeHtml(item.roleId)}">-</button>
          <span class="qty-val">${item.count}x</span>
          <button type="button" class="qty-btn" data-mob-qty="1" data-role="${escapeHtml(item.roleId)}">+</button>
          <button type="button" class="qty-btn" data-mob-remove="${escapeHtml(item.roleId)}" title="Quitar">✕</button>
        </div>
      </div>
    `;
  });

  const itemRows = itemsList.map((it) => {
    const info = findItemInfo(it.itemId);
    return `
      <div class="selected-mob-row">
        <div class="selected-mob-left">
          <img src="${escapeHtml(info.image || FALLBACK_ITEM_IMG)}" alt="${escapeHtml(info.name)}" />
          <div>
            <div class="rule-mob-chip-name">🗡️ ${escapeHtml(info.name)}</div>
            <div class="rule-mob-chip-id">give {player} ${escapeHtml(it.itemId)}</div>
          </div>
        </div>
        <div class="selected-mob-controls">
          <button type="button" class="qty-btn" data-item-qty="-1" data-item="${escapeHtml(it.itemId)}">-</button>
          <span class="qty-val">${it.count}x</span>
          <button type="button" class="qty-btn" data-item-qty="1" data-item="${escapeHtml(it.itemId)}">+</button>
          <button type="button" class="qty-btn" data-item-remove="${escapeHtml(it.itemId)}" title="Quitar">✕</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = [...mobRows, ...itemRows].join('');
}

function renderModalMobsPicker() {
  const grid = document.getElementById('modalMobsPickerGrid');
  const q = state.modal.mobSearch.trim().toLowerCase();
  const cat = state.modal.mobCategoryFilter;

  const filtered = state.mobs.filter((m) => {
    if (cat !== 'all' && !(m.categories || []).includes(cat)) return false;
    if (q) {
      return m.name.toLowerCase().includes(q) || m.roleId.toLowerCase().includes(q);
    }
    return true;
  });

  grid.innerHTML = filtered
    .map((m) => {
      const selectedEntry = state.modal.selectedMobs.find((x) => x.roleId === m.roleId);
      return `
        <div class="picker-item ${selectedEntry ? 'selected' : ''}" data-pick-mob="${escapeHtml(m.roleId)}">
          <img src="${escapeHtml(m.image || FALLBACK_MOB_IMG)}" alt="${escapeHtml(m.name)}" loading="lazy" />
          <div class="picker-item-name">${escapeHtml(m.name)}</div>
          <div class="picker-item-sub">${selectedEntry ? `✅ ${selectedEntry.count}x` : escapeHtml(m.roleId)}</div>
        </div>
      `;
    })
    .join('');
}

function renderModalItemsPicker() {
  const grid = document.getElementById('modalItemsPickerGrid');
  if (!grid) return;
  const q = state.modal.itemSearch.trim().toLowerCase();
  const cat = state.modal.itemCategoryFilter;

  const filtered = state.items
    .filter((it) => {
      if (cat !== 'all' && !(it.categories || []).includes(cat)) return false;
      if (q) {
        return it.name.toLowerCase().includes(q) || it.itemId.toLowerCase().includes(q);
      }
      return true;
    })
    .slice(0, 140);

  grid.innerHTML = filtered
    .map((it) => {
      const selectedEntry = state.modal.selectedItems.find((x) => x.itemId === it.itemId);
      return `
        <div class="picker-item ${selectedEntry ? 'selected' : ''}" data-pick-item="${escapeHtml(it.itemId)}">
          <img src="${escapeHtml(it.image || FALLBACK_ITEM_IMG)}" alt="${escapeHtml(it.name)}" loading="lazy" />
          <div class="picker-item-name">${escapeHtml(it.name)}</div>
          <div class="picker-item-sub">${selectedEntry ? `✅ ${selectedEntry.count}x` : escapeHtml(it.itemId)}</div>
        </div>
      `;
    })
    .join('');
}

async function saveConfigToServer() {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: state.config }),
  });
  const data = await res.json();
  if (data.ok) {
    state.config = data.config;
    renderConfiguredRules();
    renderGiftsCatalog();
    return true;
  } else {
    showToast(`❌ Error: ${data.error || 'No se pudo guardar'}`);
    return false;
  }
}

async function handleSaveModalRule() {
  const m = state.modal;
  const description = document.getElementById('modalDescription').value.trim();
  const scaleWithCombo = document.getElementById('modalScaleCombo').checked;
  const sayMessage = document.getElementById('modalSayMessage').value.trim();
  const extraCommands = document
    .getElementById('modalExtraCommands')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const commands = buildRuleCommands({
    sayMessage,
    mobs: m.selectedMobs,
    items: m.selectedItems,
    extraCommands,
  });

  if (commands.length === 0) {
    showToast('⚠️ Selecciona al menos un Mob o Ítem de Hytale, o escribe un comando.');
    return;
  }

  if (m.triggerType === 'gift') {
    if (!m.selectedGiftName) {
      showToast('⚠️ Selecciona un regalo de TikTok en el Paso 1.');
      return;
    }
    if (!state.config.gifts) state.config.gifts = {};
    if (m.editingOriginalGiftName && m.editingOriginalGiftName !== m.selectedGiftName) {
      delete state.config.gifts[m.editingOriginalGiftName];
    }
    const summaryParts = [];
    if (m.selectedMobs.length > 0) {
      summaryParts.push(`Spawnea ${m.selectedMobs.map((x) => `${x.count}x ${findMobInfo(x.roleId).name}`).join(', ')}`);
    }
    if (m.selectedItems.length > 0) {
      summaryParts.push(`Da ${m.selectedItems.map((x) => `${x.count}x ${findItemInfo(x.itemId).name}`).join(', ')}`);
    }
    const autoDesc = description || summaryParts.join(' · ') || `Acción para ${m.selectedGiftName}`;

    state.config.gifts[m.selectedGiftName] = {
      description: autoDesc,
      scaleWithCombo,
      commands,
    };
  } else if (m.triggerType === 'follow') {
    if (!state.config.specialEvents) state.config.specialEvents = {};
    state.config.specialEvents.follow = {
      enabled: document.getElementById('modalSpecialEnabled').checked,
      commands,
    };
  } else if (m.triggerType === 'likeMilestone') {
    if (!state.config.specialEvents) state.config.specialEvents = {};
    state.config.specialEvents.likeMilestone = {
      enabled: document.getElementById('modalSpecialEnabled').checked,
      everyLikes: Math.max(1, Number(document.getElementById('modalEveryLikes').value) || 100),
      commands,
    };
  } else if (m.triggerType === 'defaultGift') {
    state.config.defaultGift = {
      enabled: document.getElementById('modalSpecialEnabled').checked,
      description: description || 'Acción por defecto si envían un regalo que no está en la lista',
      commands,
    };
  }

  const ok = await saveConfigToServer();
  if (ok) {
    closeRuleModal();
    showToast('✅ ¡Regla guardada en config/gifts.json y lista en tiempo real!');
  }
}

// ==========================================
// EVENT LISTENERS E INICIALIZACIÓN
// ==========================================
function setupEventListeners() {
  // Cambio de pestañas
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Botón alternar Mock / Real RCON
  document.getElementById('envMockModeBtn').addEventListener('click', async () => {
    const newMock = !state.env.mockMode;
    const res = await fetch('/api/env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mockMode: newMock }),
    });
    const data = await res.json();
    if (data.ok) {
      state.env = { ...state.env, ...data.env };
      renderTopbarEnv();
      await checkSystemStatus(true);
      showToast(newMock ? '🧪 Modo Simulador activado' : '🟢 Modo RCON Real seleccionado');
    }
  });

  // Guardar ajustes de .env
  document.getElementById('envPlayerName')?.addEventListener('input', updateTopbarTooltips);
  document.getElementById('envTiktokUser')?.addEventListener('input', updateTopbarTooltips);
  document.getElementById('saveEnvBtn').addEventListener('click', async () => {
    const playerName = document.getElementById('envPlayerName').value.trim();
    const tiktokUsername = document.getElementById('envTiktokUser').value.trim();
    const res = await fetch('/api/env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, tiktokUsername }),
    });
    const data = await res.json();
    if (data.ok) {
      state.env = { ...state.env, ...data.env };
      renderTopbarEnv();
      await checkSystemStatus(true);
      showToast('💾 Ajustes guardados y estados actualizados');
    }
  });

  // Botón verificar estado ahora
  document.getElementById('checkStatusNowBtn').addEventListener('click', async () => {
    showToast('🔄 Comprobando servidor Hytale (RCON) y TikTok Live...');
    await checkSystemStatus(true);
  });

  // Botones para Iniciar / Detener el servidor de Hytale desde la web
  document.getElementById('quickToggleServerBtn').addEventListener('click', async (e) => {
    if (e.currentTarget.dataset.running === '1') {
      await stopHytaleServerFromWeb();
    } else {
      await startHytaleServerFromWeb();
    }
  });
  document.getElementById('startServerBtn').addEventListener('click', startHytaleServerFromWeb);
  document.getElementById('stopServerBtn').addEventListener('click', stopHytaleServerFromWeb);
  document.getElementById('saveHytaleConfigBtn').addEventListener('click', saveHytaleServerConfig);

  // Selector de carpeta del servidor Hytale e instalación 1-clic de HyRCON.jar
  document.getElementById('browseServerDirBtn').addEventListener('click', async () => {
    const res = await fetch('/api/hytale/server-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickDialog: true }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('hytaleServerDirInput').value = data.serverDir;
      await loadHytaleServerConfig();
      await checkSystemStatus(true);
      showToast(`📂 Carpeta del servidor actualizada: ${data.serverDir}`);
    } else if (!data.cancelled) {
      showToast(`❌ ${data.error || 'No se pudo cambiar la carpeta'}`);
    }
  });

  document.getElementById('saveServerDirBtn').addEventListener('click', async () => {
    const serverDir = document.getElementById('hytaleServerDirInput').value.trim();
    if (!serverDir) return;
    const res = await fetch('/api/hytale/server-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverDir }),
    });
    const data = await res.json();
    if (data.ok) {
      await loadHytaleServerConfig();
      await checkSystemStatus(true);
      showToast(`📂 Carpeta del servidor guardada: ${data.serverDir}`);
    } else {
      showToast(`❌ ${data.error || 'Ruta inválida'}`);
    }
  });

  document.getElementById('installHyRconModBtn').addEventListener('click', async () => {
    const res = await fetch('/api/hytale/install-mod', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(`⚡ ${data.message}`);
      await checkSystemStatus(true);
    } else {
      showToast(`❌ ${data.error || 'No se pudo instalar HyRCON.jar'}`);
    }
  });

  // Enviar comando desde la consola web del servidor Hytale
  document.getElementById('consoleCommandForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('consoleCommandInput');
    const command = input.value.trim();
    if (!command) return;
    input.value = '';
    const res = await fetch('/api/hytale/console', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`⚡ ${data.message}`);
      await loadHytaleLogs();
    } else {
      showToast(`❌ ${data.error || 'No se pudo enviar el comando'}`);
    }
  });

  // Botones de acciones rápidas del mundo (Día, Noche, Clima, OP)
  document.querySelectorAll('button[data-world-cmd]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const command = btn.dataset.worldCmd;
      const res = await fetch('/api/hytale/console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`🌍 Ejecutado: ${command}`);
        await loadHytaleLogs();
      } else {
        showToast(`⚠️ ${data.error}`);
      }
    });
  });

  document.getElementById('opCurrentPlayerBtn').addEventListener('click', async () => {
    const player = document.getElementById('envPlayerName').value.trim() || state.env.playerName;
    if (!player) {
      showToast('⚠️ Escribe primero tu nombre en "👤 Jugador Hytale" en la barra superior');
      document.getElementById('envPlayerName').focus();
      return;
    }
    const command = `op add ${player}`;
    const res = await fetch('/api/hytale/console', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`👑 Permisos OP enviados para ${player}`);
      await loadHytaleLogs();
    } else {
      showToast(`⚠️ ${data.error}`);
    }
  });

  // Botones de abrir modal Nueva Regla
  document.getElementById('newRuleBtn').addEventListener('click', () => openRuleModal({ triggerType: 'gift' }));
  document.getElementById('addGiftRuleBtn').addEventListener('click', () => openRuleModal({ triggerType: 'gift' }));
  document.getElementById('closeModalBtn').addEventListener('click', closeRuleModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeRuleModal);
  document.getElementById('saveRuleBtn').addEventListener('click', handleSaveModalRule);

  // Delegación de clics en Mis Reglas Configuradas
  document.getElementById('tab-rules').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'test-gift') {
      const giftName = btn.dataset.gift;
      const giftInfo = findGiftInfo(giftName);
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'gift', giftName, repeatCount: 1, coins: giftInfo.coins || 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`⚡ ${data.message}`);
        checkSystemStatus(false);
      } else {
        showToast(data.error || '❌ No se pudo ejecutar en Hytale');
      }
    } else if (action === 'edit-gift') {
      openRuleModal({ triggerType: 'gift', editingGiftName: btn.dataset.gift });
    } else if (action === 'delete-gift') {
      const giftName = btn.dataset.gift;
      if (confirm(`¿Eliminar la regla del regalo "${giftName}"?`)) {
        delete state.config.gifts[giftName];
        await saveConfigToServer();
        showToast(`🗑️ Regla "${giftName}" eliminada`);
      }
    } else if (action === 'test-special') {
      const sp = btn.dataset.special;
      const payload =
        sp === 'defaultGift'
          ? { type: 'gift', giftName: 'RegaloSorpresa', repeatCount: 1 }
          : { type: sp === 'likeMilestone' ? 'like' : 'follow' };
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`⚡ ${data.message}`);
        checkSystemStatus(false);
      } else {
        showToast(data.error || '❌ No se pudo ejecutar en Hytale');
      }
    } else if (action === 'edit-special') {
      openRuleModal({ triggerType: btn.dataset.special });
    }
  });

  // Filtros y acciones en Catálogo de Mobs Hytale
  document.getElementById('mobCatalogSearch').addEventListener('input', (e) => {
    state.mobCatalogQuery = e.target.value;
    renderMobsCatalog();
  });

  document.getElementById('mobCategoryPills').addEventListener('click', (e) => {
    const pill = e.target.closest('button[data-cat]');
    if (!pill) return;
    state.mobCatalogCategory = pill.dataset.cat;
    populateMobCategories();
    renderMobsCatalog();
  });

  document.getElementById('refreshMobsBtn').addEventListener('click', async () => {
    showToast('🔄 Sincronizando Mobs desde hytaleguide.net y Assets.zip...');
    await loadMobs(true);
    showToast(`✅ ${state.mobs.length} Mobs de Hytale actualizados`);
  });

  document.getElementById('mobsCatalogGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const roleId = btn.dataset.role;
    if (btn.dataset.action === 'spawn-mob-now') {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mob', roleId, count: 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`⚡ ${data.message}`);
        checkSystemStatus(false);
      } else {
        showToast(data.error || '❌ No se pudo spawnear en Hytale');
      }
    } else if (btn.dataset.action === 'assign-mob') {
      openRuleModal({ triggerType: 'gift', preselectedMobRole: roleId });
    }
  });

  // Filtros y acciones en Catálogo de Ítems Hytale
  document.getElementById('itemCatalogSearch')?.addEventListener('input', (e) => {
    state.itemCatalogQuery = e.target.value;
    renderItemsCatalog();
  });

  document.getElementById('itemCategoryPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('button[data-item-cat]');
    if (!pill) return;
    state.itemCatalogCategory = pill.dataset.itemCat;
    populateItemCategories();
    renderItemsCatalog();
  });

  document.getElementById('refreshItemsBtn')?.addEventListener('click', async () => {
    showToast('🔄 Sincronizando Ítems desde hytaleguide.net/items y Assets.zip...');
    await loadItems(true);
    showToast(`✅ ${state.items.length} Ítems de Hytale actualizados`);
  });

  document.getElementById('itemsCatalogGrid')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const itemId = btn.dataset.item;
    if (btn.dataset.action === 'give-item-now') {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'item', itemId, count: 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`⚡ ${data.message}`);
        checkSystemStatus(false);
      } else {
        showToast(data.error || '❌ No se pudo entregar el ítem en Hytale');
      }
    } else if (btn.dataset.action === 'assign-item') {
      openRuleModal({ triggerType: 'gift', preselectedItemId: itemId });
    }
  });

  // Filtros y acciones en Catálogo de Regalos TikTok
  document.getElementById('giftCatalogSearch').addEventListener('input', (e) => {
    state.giftCatalogQuery = e.target.value;
    renderGiftsCatalog();
  });

  document.getElementById('giftPricePills').addEventListener('click', (e) => {
    const pill = e.target.closest('button[data-price]');
    if (!pill) return;
    document.querySelectorAll('#giftPricePills .pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    state.giftCatalogPrice = pill.dataset.price;
    renderGiftsCatalog();
  });

  document.getElementById('refreshGiftsBtn').addEventListener('click', async () => {
    showToast('🔄 Sincronizando Regalos desde streamtoearn.io y TikTok Webcast...');
    await loadGiftsCatalog(true);
    showToast(`✅ ${state.giftsCatalog.length} Regalos de TikTok actualizados`);
  });

  document.getElementById('giftsCatalogGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="configure-gift"]');
    if (!btn) return;
    openRuleModal({ triggerType: 'gift', giftName: btn.dataset.gift });
  });

  // Interacciones dentro del Modal
  document.querySelectorAll('.trigger-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openRuleModal({
        triggerType: btn.dataset.trigger,
        giftName: state.modal.selectedGiftName,
      });
    });
  });

  document.querySelectorAll('.reward-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.modal.rewardTab = btn.dataset.rewardTab;
      syncModalRewardTabUI();
    });
  });

  document.getElementById('modalGiftSearch').addEventListener('input', (e) => {
    state.modal.giftSearch = e.target.value;
    renderModalGiftsPicker();
  });

  document.getElementById('modalGiftPriceFilter').addEventListener('change', (e) => {
    state.modal.giftPriceFilter = e.target.value;
    renderModalGiftsPicker();
  });

  document.getElementById('modalGiftsPickerGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-pick-gift]');
    if (!card) return;
    state.modal.selectedGiftName = card.dataset.pickGift;
    renderModalSelectedGiftBanner();
    renderModalGiftsPicker();
  });

  document.getElementById('modalMobSearch').addEventListener('input', (e) => {
    state.modal.mobSearch = e.target.value;
    renderModalMobsPicker();
  });

  document.getElementById('modalMobCategoryFilter').addEventListener('change', (e) => {
    state.modal.mobCategoryFilter = e.target.value;
    renderModalMobsPicker();
  });

  document.getElementById('modalMobsPickerGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-pick-mob]');
    if (!card) return;
    const roleId = card.dataset.pickMob;
    const existing = state.modal.selectedMobs.find((x) => x.roleId === roleId);
    if (existing) {
      existing.count = Math.min(existing.count + 1, 25);
    } else {
      state.modal.selectedMobs.push({ roleId, count: 1 });
    }
    const mobInfo = findMobInfo(roleId);
    const descInput = document.getElementById('modalDescription');
    if (!descInput.value.trim()) {
      descInput.value = `Spawnea ${mobInfo.name} cerca del jugador`;
    }
    renderModalSelectedMobs();
    renderModalMobsPicker();
  });

  document.getElementById('modalItemSearch')?.addEventListener('input', (e) => {
    state.modal.itemSearch = e.target.value;
    renderModalItemsPicker();
  });

  document.getElementById('modalItemCategoryFilter')?.addEventListener('change', (e) => {
    state.modal.itemCategoryFilter = e.target.value;
    renderModalItemsPicker();
  });

  document.getElementById('modalItemsPickerGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-pick-item]');
    if (!card) return;
    const itemId = card.dataset.pickItem;
    const existing = state.modal.selectedItems.find((x) => x.itemId === itemId);
    if (existing) {
      existing.count = Math.min(existing.count + 1, 100);
    } else {
      state.modal.selectedItems.push({ itemId, count: 1 });
    }
    const itemInfo = findItemInfo(itemId);
    const descInput = document.getElementById('modalDescription');
    if (!descInput.value.trim()) {
      descInput.value = `Da ${itemInfo.name} al jugador`;
    }
    renderModalSelectedMobs();
    renderModalItemsPicker();
  });

  document.getElementById('selectedMobsList').addEventListener('click', (e) => {
    const qtyBtn = e.target.closest('[data-mob-qty]');
    if (qtyBtn) {
      const roleId = qtyBtn.dataset.role;
      const delta = Number(qtyBtn.dataset.mobQty);
      const item = state.modal.selectedMobs.find((x) => x.roleId === roleId);
      if (item) {
        item.count += delta;
        if (item.count <= 0) {
          state.modal.selectedMobs = state.modal.selectedMobs.filter((x) => x.roleId !== roleId);
        }
        renderModalSelectedMobs();
        renderModalMobsPicker();
      }
      return;
    }
    const rmBtn = e.target.closest('[data-mob-remove]');
    if (rmBtn) {
      const roleId = rmBtn.dataset.mobRemove;
      state.modal.selectedMobs = state.modal.selectedMobs.filter((x) => x.roleId !== roleId);
      renderModalSelectedMobs();
      renderModalMobsPicker();
      return;
    }

    const itemQtyBtn = e.target.closest('[data-item-qty]');
    if (itemQtyBtn) {
      const itemId = itemQtyBtn.dataset.item;
      const delta = Number(itemQtyBtn.dataset.itemQty);
      const entry = state.modal.selectedItems.find((x) => x.itemId === itemId);
      if (entry) {
        entry.count += delta;
        if (entry.count <= 0) {
          state.modal.selectedItems = state.modal.selectedItems.filter((x) => x.itemId !== itemId);
        }
        renderModalSelectedMobs();
        renderModalItemsPicker();
      }
      return;
    }

    const itemRmBtn = e.target.closest('[data-item-remove]');
    if (itemRmBtn) {
      const itemId = itemRmBtn.dataset.itemRemove;
      state.modal.selectedItems = state.modal.selectedItems.filter((x) => x.itemId !== itemId);
      renderModalSelectedMobs();
      renderModalItemsPicker();
    }
  });

  document.getElementById('clearSelectedMobsBtn').addEventListener('click', () => {
    state.modal.selectedMobs = [];
    state.modal.selectedItems = [];
    renderModalSelectedMobs();
    renderModalMobsPicker();
    renderModalItemsPicker();
  });
}

async function init() {
  setupEventListeners();
  await Promise.all([loadConfig(), loadHytaleServerConfig(), loadHytaleLogs()]);
  checkSystemStatus(false);
  setInterval(() => checkSystemStatus(false), 10000);
  setInterval(() => loadHytaleLogs(), 3000);
  await Promise.all([loadMobs(false), loadItems(false), loadGiftsCatalog(false)]);
}

init();
