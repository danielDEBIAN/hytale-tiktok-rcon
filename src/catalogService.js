import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection } from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, '../config/.cache');
const MOBS_CACHE_FILE = path.join(CACHE_DIR, 'mobs.json');
const GIFTS_CACHE_FILE = path.join(CACHE_DIR, 'tiktok-gifts.json');
const ASSETS_ZIP_PATH =
  process.env.HYTALE_ASSETS_PATH ||
  path.join(process.env.HYTALE_SERVER_DIR || path.join(os.homedir(), 'hytale-server'), 'Assets.zip');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Extrae la lista de Role IDs reales disponibles en el servidor local de Hytale (Assets.zip)
 */
function getLocalHytaleRoles() {
  const roles = new Set();
  try {
    if (fs.existsSync(ASSETS_ZIP_PATH)) {
      const out = execSync(`unzip -l "${ASSETS_ZIP_PATH}" "Server/NPC/Roles/*.json"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of out.split('\n')) {
        const match = line.match(/Server\/NPC\/Roles\/(?:.*\/)?([^/\s]+)\.json$/);
        if (match) {
          roles.add(match[1]);
        }
      }
    }
  } catch {
    // Ignorar si unzip o Assets.zip no está disponible
  }
  return roles;
}

/**
 * Extrae las entidades embebidas en el payload de SvelteKit de hytaleguide.net/mobs
 */
async function fetchHytaleGuideMobsPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al consultar ${url}`);
  }
  const html = await res.text();
  const entitiesIdx = html.indexOf('entities:[');
  if (entitiesIdx === -1) return [];

  const iifeStart = html.lastIndexOf('(function(', entitiesIdx);
  if (iifeStart === -1) return [];

  let depth = 0;
  let iifeEnd = -1;
  for (let i = iifeStart; i < html.length; i++) {
    if (html[i] === '(') depth++;
    else if (html[i] === ')') {
      depth--;
      if (depth === 0) {
        iifeEnd = i + 1;
        break;
      }
    }
  }
  if (iifeEnd === -1) return [];

  const code = html.slice(iifeStart, iifeEnd);
  const evaluated = new Function(`return ${code};`)();
  return evaluated?.data?.entities || [];
}

/**
 * Obtiene dinámicamente todos los mobs de Hytale con su nombre, Role ID e imagen desde hytaleguide.net
 * y los valida/complementa con los roles del servidor local.
 */
export async function fetchHytaleMobs(forceRefresh = false) {
  ensureCacheDir();

  if (!forceRefresh && fs.existsSync(MOBS_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(MOBS_CACHE_FILE, 'utf-8'));
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch {
      // Continuar con descarga fresca
    }
  }

  const localRoles = getLocalHytaleRoles();
  const [page1, page2] = await Promise.all([
    fetchHytaleGuideMobsPage('https://hytaleguide.net/mobs'),
    fetchHytaleGuideMobsPage('https://hytaleguide.net/mobs/2'),
  ]);

  const rawEntities = [...page1, ...page2];
  const seenRoleIds = new Set();
  const mobs = [];

  for (const entity of rawEntities) {
    let roleId = entity.in_game_identifier || entity.name?.replace(/\s+/g, '_');
    if (!roleId) continue;

    // Si el ID de la guía tiene sufijos como _Tutorial o _Patrol y en Assets.zip existe el base, normalizar
    if (localRoles.size > 0 && !localRoles.has(roleId)) {
      const stripped = roleId.replace(/_(Tutorial|Patrol)$/, '');
      if (localRoles.has(stripped)) {
        roleId = stripped;
      }
    }

    seenRoleIds.add(roleId);

    const categories = (entity.latest_version?.categories || []).map(
      (c) => c.label || c.name || c.slug
    );

    mobs.push({
      name: entity.name || roleId.replaceAll('_', ' '),
      roleId,
      slug: entity.slug || roleId.toLowerCase(),
      image: entity.latest_version?.image?.image_url || '',
      categories,
      isNew: Boolean(entity.is_new),
      verifiedInServer: localRoles.size === 0 ? true : localRoles.has(roleId),
    });
  }

  try {
    fs.writeFileSync(MOBS_CACHE_FILE, JSON.stringify(mobs, null, 2), 'utf-8');
  } catch {
    // No bloquear si falla el guardado en caché
  }

  return mobs;
}

/**
 * Descarga regalos desde streamtoearn.io/gifts (más de 2500 regalos con nombre, monedas e imagen)
 */
async function fetchStreamToEarnGifts() {
  try {
    const res = await fetch('https://streamtoearn.io/gifts', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const regex =
      /<div class="gift"[^>]*>\s*<img\s+src="([^"]+)"[^>]*>\s*<p class="gift-name">([^<]+)<\/p>\s*<p class="gift-price">(\d+)/g;
    const list = [];
    for (const m of html.matchAll(regex)) {
      const image = m[1].trim();
      const name = m[2].trim();
      const coins = Number(m[3]) || 1;
      list.push({
        id: `ste_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name,
        coins,
        image: image.startsWith('http') ? image : `https://streamtoearn.io${image}`,
      });
    }
    return list;
  } catch {
    return [];
  }
}

/**
 * Descarga regalos directamente de la API pública de Webcast de TikTok (sin firma de pago)
 */
async function fetchTikTokWebcastGifts() {
  try {
    const conn = new TikTokLiveConnection('tiktok', {});
    const res = await conn.webClient.getJsonObjectFromWebcastApi(
      'gift/list/',
      { ...conn.webClient.clientParams },
      false
    );
    const rawGifts = res?.data?.gifts || [];
    return rawGifts
      .filter((g) => g && g.name)
      .map((g) => ({
        id: g.id,
        name: g.name.trim(),
        coins: Number(g.diamond_count) || 1,
        image: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || '',
      }));
  } catch {
    return [];
  }
}

/**
 * Obtiene dinámicamente todos los regalos de TikTok combinando streamtoearn.io/gifts y la API de TikTok Webcast
 */
export async function fetchTikTokGifts(forceRefresh = false) {
  ensureCacheDir();

  if (!forceRefresh && fs.existsSync(GIFTS_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(GIFTS_CACHE_FILE, 'utf-8'));
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch {
      // Continuar con descarga fresca
    }
  }

  const [steGifts, webcastGifts] = await Promise.all([
    fetchStreamToEarnGifts(),
    fetchTikTokWebcastGifts(),
  ]);

  const byName = new Map();

  // Primero agregamos los de streamtoearn.io (2500+ regalos de todas las regiones)
  for (const gift of steGifts) {
    const key = gift.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, gift);
    }
  }

  // Luego fusionamos/enriquecemos con los regalos directos de la API de TikTok
  for (const gift of webcastGifts) {
    const key = gift.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, gift);
    } else {
      const existing = byName.get(key);
      if (!existing.image && gift.image) existing.image = gift.image;
      if (gift.id && typeof gift.id === 'number') existing.id = gift.id;
    }
  }

  const merged = Array.from(byName.values()).sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name));

  try {
    fs.writeFileSync(GIFTS_CACHE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch {
    // Ignorar error de escritura de caché
  }

  return merged;
}
