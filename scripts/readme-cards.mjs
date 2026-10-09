#!/usr/bin/env node
/**
 * readme-cards.mjs - self-hosted live SVG cards for the Korivash GitHub profile README.
 *
 * Usage:  node scripts/readme-cards.mjs [outDir]      (default ./out)
 * Runtime: Node 20+, no npm dependencies (uses global fetch).
 *
 * Writes:
 *   miko-live.svg     Miko Radio live numbers (servers, shards, listeners, 30d uptime)
 *   status-grid.svg   every public service + Miko monitor as a status pill
 *   github-pulse.svg  public GitHub stats (repos, stars, followers, newest repo)
 *   now-playing.svg   Spotify-style card (placeholder until the integration is approved)
 *   cache.json        last good data per source (used when a source is down / rate-limited)
 *
 * Set CARDS_OFFLINE=1 to simulate every source failing (tests the fallback path).
 * Every card renders with "-" placeholders when data is missing, and falls back to the
 * cached values from a previous run so a flaky upstream never blanks the README.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || './out');
const CACHE_FILE = path.join(OUT, 'cache.json');
const TIMEOUT_MS = 12_000;
const UA = 'korivash-readme-cards/2.0 (+https://korivash.com)';

// Brand
const C = {
  bg: '#05070d',
  panel: '#0b0f1a',
  panel2: '#101626',
  line: '#1c2438',
  text: '#e8e8f0',
  muted: '#8b91a7',
  dim: '#5b617a',
  pink: '#ff2fa8',
  violet: '#b44aff',
  cyan: '#22d3ee',
  green: '#34d399',
  red: '#fb7185',
  amber: '#fbbf24',
  grey: '#6b7280',
};
const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace";

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '-');
const pct = (n) => (typeof n === 'number' && Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '') + '%' : '-');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = new Date();
const stamp = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;

function fmtUptime(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return '-';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function ago(iso) {
  if (!iso) return '-';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '-';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 30) return `${Math.floor(d / 30)}mo ago`;
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${Math.max(m, 1)}m ago`;
}
function truncate(s, max) {
  s = String(s ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function getJSON(url, headers = {}) {
  if (process.env.CARDS_OFFLINE) throw new Error('offline (CARDS_OFFLINE set)');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function loadCache() {
  try { return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')); } catch { return {}; }
}

/** Fetch with cache fallback. Returns { data, fromCache, error } */
async function source(name, cache, fn) {
  try {
    const data = await fn();
    cache[name] = { at: new Date().toISOString(), data };
    return { data, fromCache: false };
  } catch (err) {
    const cached = cache[name]?.data;
    console.warn(`[cards] ${name}: ${err.message}${cached ? ' (using cached values)' : ' (no cache, rendering placeholders)'}`);
    return { data: cached ?? null, fromCache: !!cached, error: err.message };
  }
}

let avatarDataUri = '';
async function loadAvatar() {
  try {
    const buf = await fs.readFile(path.join(__dirname, 'miko-96.webp'));
    avatarDataUri = `data:image/webp;base64,${buf.toString('base64')}`;
  } catch { avatarDataUri = ''; }
}

// ---------------------------------------------------------------- shared SVG chrome
function defs(id) {
  return `<defs>
  <linearGradient id="${id}-brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.pink}"/><stop offset=".5" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
  <linearGradient id="${id}-pink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.violet}"/></linearGradient>
  <linearGradient id="${id}-cyan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.violet}"/></linearGradient>
  <linearGradient id="${id}-glowbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.violet}" stop-opacity=".16"/><stop offset=".55" stop-color="${C.bg}" stop-opacity="0"/><stop offset="1" stop-color="${C.pink}" stop-opacity=".10"/></linearGradient>
  <linearGradient id="${id}-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="${id}-softglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="${id}-clip"><rect width="480" height="100%" rx="18"/></clipPath>
</defs>`;
}

function frame(id, W, H, { title, icon, accent = C.pink, stampText = stamp }) {
  return `<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="18" fill="${C.bg}" stroke="url(#${id}-brand)" stroke-width="1.5"/>
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17" fill="url(#${id}-glowbg)"/>
<g clip-path="url(#${id}-clip)" opacity=".9">
  <rect x="-140" y="0" width="160" height="${H}" fill="url(#${id}-sweep)" opacity=".035" transform="skewX(-18)">
    <animate attributeName="x" values="-140;${W + 60}" dur="7s" repeatCount="indefinite"/>
  </rect>
</g>
<g font-family="${FONT}">
  ${icon}
  <text x="54" y="31" font-size="15" font-weight="700" fill="${C.text}" letter-spacing=".2">${esc(title)}</text>
  <text x="${W - 18}" y="30" text-anchor="end" font-size="10.5" fill="${C.dim}" font-family="${MONO}">updated ${esc(stampText)}</text>
</g>`;
}

function icon(id, kind, color) {
  const g = `transform="translate(18,13)" filter="url(#${id}-glow)"`;
  switch (kind) {
    case 'radio': return `<g ${g}><rect width="26" height="26" rx="8" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".6"/><path d="M6.5 16v-2.5a6.5 6.5 0 0 1 13 0V16" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/><rect x="5" y="14" width="4.5" height="6.5" rx="1.6" fill="${color}"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6" fill="${color}"/></g>`;
    case 'grid': return `<g ${g}><rect width="26" height="26" rx="8" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".6"/><rect x="6" y="6" width="6" height="6" rx="1.5" fill="${color}"/><rect x="14" y="6" width="6" height="6" rx="1.5" fill="${color}" fill-opacity=".6"/><rect x="6" y="14" width="6" height="6" rx="1.5" fill="${color}" fill-opacity=".6"/><rect x="14" y="14" width="6" height="6" rx="1.5" fill="${color}"/></g>`;
    case 'github': return `<g ${g}><rect width="26" height="26" rx="8" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".6"/><path d="M13 5.5a7.5 7.5 0 0 0-2.4 14.6c.4.1.5-.2.5-.4v-1.4c-2.1.5-2.5-.9-2.5-.9-.3-.9-.8-1.1-.8-1.1-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.8.8 2.2.6.1-.5.3-.8.5-1-1.7-.2-3.4-.8-3.4-3.7 0-.8.3-1.5.8-2-.1-.2-.3-1 .1-2 0 0 .6-.2 2.1.8a7 7 0 0 1 3.8 0c1.4-1 2.1-.8 2.1-.8.4 1 .2 1.8.1 2 .5.5.8 1.2.8 2 0 2.9-1.8 3.5-3.4 3.7.3.2.5.7.5 1.4v2.1c0 .2.1.5.5.4A7.5 7.5 0 0 0 13 5.5z" fill="${color}"/></g>`;
    case 'spotify': return `<g ${g}><rect width="26" height="26" rx="8" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".6"/><circle cx="13" cy="13" r="7.5" fill="${color}"/><path d="M8.8 10.6c3-.9 6.3-.6 8.6.8M9.3 13.2c2.4-.7 5-.4 7 .7M9.8 15.6c1.9-.5 3.9-.3 5.5.6" fill="none" stroke="${C.bg}" stroke-width="1.4" stroke-linecap="round"/></g>`;
    default: return '';
  }
}

function wrap(id, W, H, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-title">
<title id="${id}-title">${esc(body.title)}</title>
${defs(id)}
${body.svg}
</svg>
`;
}

function eqBars(x, y, color, n = 5, h = 18) {
  const seeds = [0.55, 0.95, 0.7, 1, 0.6, 0.85, 0.5];
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = seeds[i % seeds.length];
    const v = [h * 0.25, h * a, h * 0.4, h * (a * 0.8), h * 0.25];
    const dur = (1.1 + (i % 3) * 0.25).toFixed(2);
    s += `<rect x="${x + i * 6}" y="${y + h - v[0]}" width="4" height="${v[0]}" rx="1.5" fill="${color}">
  <animate attributeName="height" values="${v.map((q) => q.toFixed(1)).join(';')}" dur="${dur}s" repeatCount="indefinite"/>
  <animate attributeName="y" values="${v.map((q) => (y + h - q).toFixed(1)).join(';')}" dur="${dur}s" repeatCount="indefinite"/>
</rect>`;
  }
  return s;
}

function pill(x, y, label, state, width) {
  // state: 'up' | 'down' | 'retired' | 'unknown'
  const col = { up: C.green, down: C.red, retired: C.grey, unknown: C.dim }[state] || C.dim;
  const txt = { up: 'online', down: 'down', retired: 'retired', unknown: '-' }[state] || '-';
  const dot = state === 'up'
    ? `<circle cx="${x + 13}" cy="${y + 12}" r="4" fill="${col}"><animate attributeName="opacity" values="1;.35;1" dur="2.2s" repeatCount="indefinite"/></circle><circle cx="${x + 13}" cy="${y + 12}" r="4" fill="none" stroke="${col}" stroke-width="1"><animate attributeName="r" values="4;9" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0" dur="2.2s" repeatCount="indefinite"/></circle>`
    : `<circle cx="${x + 13}" cy="${y + 12}" r="4" fill="${col}"${state === 'down' ? `><animate attributeName="opacity" values="1;.2;1" dur=".9s" repeatCount="indefinite"/></circle` : '/'}>`;
  return `<g font-family="${FONT}">
  <rect x="${x}" y="${y}" width="${width}" height="24" rx="12" fill="${C.panel}" stroke="${col}" stroke-opacity="${state === 'retired' ? '.35' : '.55'}"/>
  ${dot}
  <text x="${x + 24}" y="${y + 16}" font-size="11.5" font-weight="600" fill="${state === 'retired' ? C.muted : C.text}">${esc(label)}</text>
  <text x="${x + width - 10}" y="${y + 16}" text-anchor="end" font-size="10" font-weight="700" fill="${col}" letter-spacing=".4">${txt.toUpperCase()}</text>
</g>`;
}

function uptimeBar(id, x, y, w, label, value, color) {
  const v = typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : null;
  const fill = v == null ? 0 : (w * v) / 100;
  return `<g font-family="${FONT}">
  <text x="${x}" y="${y}" font-size="10.5" fill="${C.muted}">${esc(label)}</text>
  <text x="${x + w}" y="${y}" text-anchor="end" font-size="10.5" font-weight="700" fill="${v == null ? C.dim : color}" font-family="${MONO}">${pct(v)}</text>
  <rect x="${x}" y="${y + 6}" width="${w}" height="5" rx="2.5" fill="${C.line}"/>
  <rect x="${x}" y="${y + 6}" width="${fill.toFixed(1)}" height="5" rx="2.5" fill="${color}" filter="url(#${id}-glow)">
    <animate attributeName="width" from="0" to="${fill.toFixed(1)}" dur="1.2s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1"/>
  </rect>
</g>`;
}

// ---------------------------------------------------------------- CARD 1: miko-live
function cardMikoLive({ miko, monitors, cached }) {
  const id = 'ml', W = 480, H = 230;
  const guilds = miko?.guilds, shards = miko?.shardCount, healthy = miko?.healthyShards, players = miko?.activePlayers;
  const mon = (name) => monitors?.find((m) => m.name === name)?.uptime?.['30d'];
  const up = { bot: mon('Discord Bot'), voice: mon('Voice (Lavalink)'), site: mon('Website') };
  const live = !!miko && !cached;
  const liveLabel = live ? 'LIVE' : miko ? 'CACHED' : 'OFFLINE';
  const liveCol = live ? C.pink : miko ? C.grey : C.red;
  const shardDots = (() => {
    const n = typeof shards === 'number' ? clamp(shards, 1, 20) : 10;
    let s = '';
    for (let i = 0; i < n; i++) {
      const ok = typeof healthy === 'number' ? i < healthy : null;
      const col = ok == null ? C.dim : ok ? C.cyan : C.red;
      s += `<rect x="${i * 11}" y="0" width="8" height="8" rx="2" fill="${col}"${ok ? ` filter="url(#${id}-glow)"><animate attributeName="opacity" values="1;.55;1" dur="${(1.6 + (i % 4) * 0.3).toFixed(1)}s" begin="${(i * 0.12).toFixed(2)}s" repeatCount="indefinite"/></rect` : '/'}>`;
    }
    return s;
  })();
  const avatar = avatarDataUri
    ? `<clipPath id="${id}-av"><circle cx="48" cy="48" r="46"/></clipPath><circle cx="48" cy="48" r="48" fill="url(#${id}-brand)" filter="url(#${id}-softglow)"/><image href="${avatarDataUri}" x="2" y="2" width="92" height="92" clip-path="url(#${id}-av)"/>`
    : `<circle cx="48" cy="48" r="46" fill="${C.panel2}" stroke="url(#${id}-brand)" stroke-width="2"/><text x="48" y="56" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="800" fill="${C.pink}">M</text>`;

  const svg = `${frame(id, W, H, { title: 'Miko Radio', icon: icon(id, 'radio', C.pink) })}
<!-- live pill -->
<g transform="translate(150,16)" font-family="${FONT}">
  <rect width="${liveLabel.length * 8.5 + 24}" height="22" rx="11" fill="${liveCol}" fill-opacity=".16" stroke="${liveCol}" stroke-opacity=".7"/>
  <circle cx="13" cy="11" r="3.5" fill="${liveCol}">${live ? `<animate attributeName="opacity" values="1;.3;1" dur="1.4s" repeatCount="indefinite"/>` : ''}</circle>
  <text x="23" y="15" font-size="10.5" font-weight="800" fill="${live ? C.pink : miko ? C.muted : C.red}" letter-spacing="1">${liveLabel}</text>
</g>
<!-- avatar -->
<g transform="translate(18,58)">${avatar}</g>
<!-- stats -->
<g font-family="${FONT}" transform="translate(132,66)">
  <text x="0" y="0" font-size="10.5" fill="${C.muted}" letter-spacing=".8">SERVERS</text>
  <text x="0" y="30" font-size="30" font-weight="800" fill="${C.text}" font-family="${MONO}">${num(guilds)}</text>

  <text x="170" y="0" font-size="10.5" fill="${C.muted}" letter-spacing=".8">SHARDS HEALTHY</text>
  <text x="170" y="30" font-size="30" font-weight="800" fill="${typeof healthy === 'number' && typeof shards === 'number' && healthy < shards ? C.amber : C.cyan}" font-family="${MONO}">${num(healthy)}<tspan font-size="16" fill="${C.muted}" font-weight="600">/${num(shards)}</tspan></text>
  <g transform="translate(170,38)">${shardDots}</g>

  <text x="0" y="66" font-size="10.5" fill="${C.muted}" letter-spacing=".8">LISTENING RIGHT NOW</text>
  <text x="0" y="96" font-size="30" font-weight="800" fill="${C.pink}" font-family="${MONO}">${num(players)}</text>
  <g transform="translate(${typeof players === 'number' ? 12 + String(num(players)).length * 18 : 40},76)">${eqBars(0, 0, C.pink, 6, 20)}</g>

  <text x="170" y="66" font-size="10.5" fill="${C.muted}" letter-spacing=".8">BOT UPTIME</text>
  <text x="170" y="96" font-size="30" font-weight="800" fill="${C.violet}" font-family="${MONO}">${esc(fmtUptime(miko?.uptimeSec))}</text>
</g>
<!-- divider -->
<line x1="18" y1="178" x2="${W - 18}" y2="178" stroke="${C.line}"/>
<!-- 30-day uptime bars -->
${uptimeBar(id, 18, 196, 136, 'Bot · 30d', up.bot, C.pink)}
${uptimeBar(id, 172, 196, 136, 'Voice · 30d', up.voice, C.violet)}
${uptimeBar(id, 326, 196, 136, 'Website · 30d', up.site, C.cyan)}`;
  return wrap(id, W, H, { title: `Miko Radio live: ${num(guilds)} servers, ${num(players)} listening now`, svg });
}

// ---------------------------------------------------------------- CARD 2: status-grid
function cardStatusGrid({ services, monitors }) {
  const id = 'sg', W = 480;
  const RETIRED = new Set(['kittyverse bot']);
  const svc = (services || []).map((s) => ({
    label: s.name,
    state: RETIRED.has(String(s.name).toLowerCase()) ? 'retired' : s.online === true ? 'up' : s.online === false ? 'down' : 'unknown',
  }));
  const mons = (monitors || []).map((m) => ({
    label: m.name === 'Voice (Lavalink)' ? 'Voice / Lavalink' : m.name,
    state: m.state === 'up' ? 'up' : m.state === 'down' ? 'down' : 'unknown',
    d24: m.uptime?.['24h'],
  }));
  const noData = !svc.length && !mons.length;
  if (!svc.length) svc.push({ label: 'Services', state: 'unknown' });
  if (!mons.length) mons.push({ label: 'Monitors', state: 'unknown' });

  const colW = 214, rowH = 28, top = 66;
  const rows = Math.max(svc.length, mons.length);
  const H = top + rows * rowH + 24;
  const online = svc.filter((s) => s.state === 'up').length + mons.filter((m) => m.state === 'up').length;
  const total = svc.filter((s) => s.state !== 'retired').length + mons.length;
  const allGood = online === total;

  let body = '';
  svc.forEach((s, i) => { body += pill(18, top + i * rowH, s.label, s.state, colW); });
  mons.forEach((m, i) => {
    body += pill(18 + colW + 16, top + i * rowH, m.label, m.state, colW);
  });
  const svg = `${frame(id, W, H, { title: 'Service status', icon: icon(id, 'grid', C.cyan) })}
<g font-family="${FONT}">
  <text x="18" y="54" font-size="10.5" font-weight="700" fill="${C.muted}" letter-spacing="1.2">SERVICES · ADMIN.KORIVASH.COM</text>
  <text x="${18 + colW + 16}" y="54" font-size="10.5" font-weight="700" fill="${C.muted}" letter-spacing="1.2">MIKO RADIO MONITORS</text>
</g>
${body}
<g font-family="${FONT}" transform="translate(18,${H - 10})">
  <circle cx="5" cy="-4" r="4" fill="${noData ? C.red : allGood ? C.green : C.amber}" filter="url(#${id}-glow)"><animate attributeName="opacity" values="1;.4;1" dur="2s" repeatCount="indefinite"/></circle>
  <text x="15" y="0" font-size="11" fill="${C.muted}">${noData ? 'Status feed unavailable right now' : allGood ? 'All systems operational' : `${online}/${total} systems online`} · retired services are intentionally offline</text>
</g>`;
  return wrap(id, W, H, { title: `Service status: ${online}/${total} online`, svg });
}

// ---------------------------------------------------------------- CARD 3: github-pulse
function cardGithubPulse({ user, repos, cached }) {
  const id = 'gp', W = 480, H = 230;
  const publicRepos = user?.public_repos;
  const followers = user?.followers;
  const list = Array.isArray(repos) ? repos : [];
  const stars = list.length ? list.reduce((a, r) => a + (r.stargazers_count || 0), 0) : undefined;
  const forks = list.length ? list.reduce((a, r) => a + (r.forks_count || 0), 0) : undefined;
  const newest = list.filter((r) => !r.fork && !r.private).sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))[0];
  const langs = {};
  for (const r of list) if (r.language && !r.fork) langs[r.language] = (langs[r.language] || 0) + 1;
  const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const langTotal = topLangs.reduce((a, [, n]) => a + n, 0) || 1;
  const langColors = [C.pink, C.violet, C.cyan, C.amber];

  // ECG-ish pulse path
  const pulse = 'M0 20 H40 L48 20 L54 4 L60 36 L66 12 L72 20 H120 L128 20 L134 6 L140 34 L146 14 L152 20 H200 L208 20 L214 4 L220 36 L226 12 L232 20 H280 L288 20 L294 6 L300 34 L306 14 L312 20 H360 L368 20 L374 4 L380 36 L386 12 L392 20 H444';

  const stat = (x, label, value, color) => `<g transform="translate(${x},0)" font-family="${FONT}">
  <rect x="0" y="0" width="104" height="62" rx="12" fill="${C.panel}" stroke="${C.line}"/>
  <rect x="0" y="0" width="104" height="62" rx="12" fill="${color}" fill-opacity=".05"/>
  <text x="52" y="30" text-anchor="middle" font-size="24" font-weight="800" fill="${color}" font-family="${MONO}">${num(value)}</text>
  <text x="52" y="50" text-anchor="middle" font-size="10" fill="${C.muted}" letter-spacing="1">${label}</text>
</g>`;

  let langBar = '', lx = 0;
  topLangs.forEach(([name, n], i) => {
    const w = (n / langTotal) * 220;
    langBar += `<rect x="${lx.toFixed(1)}" y="0" width="${Math.max(w - 2, 2).toFixed(1)}" height="6" rx="3" fill="${langColors[i]}"/>`;
    lx += w;
  });
  const langLegend = topLangs.map(([name, n], i) => `<tspan fill="${langColors[i]}">●</tspan> ${esc(name)}  `).join('');

  const svg = `${frame(id, W, H, { title: 'GitHub pulse', icon: icon(id, 'github', C.violet) })}
<g transform="translate(18,52)">
  ${stat(0, 'PUBLIC REPOS', publicRepos, C.cyan)}
  ${stat(113, 'STARS', stars, C.pink)}
  ${stat(226, 'FORKS', forks, C.violet)}
  ${stat(339, 'FOLLOWERS', followers, C.amber)}
</g>
<g transform="translate(18,124)" opacity=".9">
  <path d="${pulse}" fill="none" stroke="${C.line}" stroke-width="1.5"/>
  <path d="${pulse}" fill="none" stroke="url(#${id}-pink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#${id}-glow)" stroke-dasharray="120 1200">
    <animate attributeName="stroke-dashoffset" from="1320" to="0" dur="3.2s" repeatCount="indefinite"/>
  </path>
</g>
<g font-family="${FONT}" transform="translate(18,186)">
  <text x="0" y="0" font-size="10.5" fill="${C.muted}" letter-spacing=".8">LATEST PUSH</text>
  <text x="0" y="19" font-size="14" font-weight="700" fill="${C.text}">${esc(truncate(newest?.name, 26) || '-')}<tspan font-size="11" font-weight="500" fill="${C.muted}"> ${newest ? ` · ${esc(newest.language || 'repo')} · ${esc(ago(newest.pushed_at))}` : ''}</tspan></text>
  <text x="240" y="0" font-size="10.5" fill="${C.muted}" letter-spacing=".8">LANGUAGES (PUBLIC)</text>
  <g transform="translate(240,6)">${langBar || `<rect width="220" height="6" rx="3" fill="${C.line}"/>`}</g>
  <text x="240" y="26" font-size="10.5" fill="${C.muted}">${langLegend || '-'}</text>
</g>
${cached ? `<text x="${W - 18}" y="${H - 10}" text-anchor="end" font-family="${MONO}" font-size="9" fill="${C.dim}">cached</text>` : ''}`;
  return wrap(id, W, H, { title: `GitHub: ${num(publicRepos)} public repos, ${num(stars)} stars, ${num(followers)} followers`, svg });
}

// ---------------------------------------------------------------- CARD 4: now-playing
/**
 * Spotify-style card. `track` may be null (placeholder) or:
 * { title, artist, album, artDataUri?, progressMs, durationMs, isPlaying, url? }
 */
function cardNowPlaying(track) {
  const id = 'np', W = 480, H = 230, ART = 132;
  const playing = !!track?.isPlaying;
  const title = track?.title || 'Spotify now playing';
  const sub = track?.artist || 'Korivash · live Spotify feed coming soon';
  const album = track?.album || 'Live track, artist and album art will show up here';
  const prog = track?.durationMs ? clamp(track.progressMs / track.durationMs, 0, 1) : 0.38;
  const mmss = (ms) => (typeof ms === 'number' ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}` : '-:--');
  const art = track?.artDataUri
    ? `<clipPath id="${id}-art"><rect width="${ART}" height="${ART}" rx="16"/></clipPath><image href="${track.artDataUri}" width="${ART}" height="${ART}" clip-path="url(#${id}-art)"/>`
    : `<clipPath id="${id}-art"><rect width="${ART}" height="${ART}" rx="16"/></clipPath>
       <g clip-path="url(#${id}-art)">
         <rect width="${ART}" height="${ART}" fill="url(#${id}-brand)" opacity=".9"/>
         <rect width="${ART}" height="${ART}" fill="${C.bg}" opacity=".35"/>
         <circle cx="${ART / 2}" cy="${ART / 2}" r="46" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="10"/>
         <circle cx="${ART / 2}" cy="${ART / 2}" r="46" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="10" stroke-dasharray="40 250" stroke-linecap="round">
           <animateTransform attributeName="transform" type="rotate" from="0 ${ART / 2} ${ART / 2}" to="360 ${ART / 2} ${ART / 2}" dur="6s" repeatCount="indefinite"/>
         </circle>
         <circle cx="${ART / 2}" cy="${ART / 2}" r="18" fill="${C.bg}" fill-opacity=".7"/>
         <g transform="translate(${ART / 2 - 15},${ART / 2 - 16})" fill="#fff" opacity=".95"><path d="M10 28V6l20-4v22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="29" r="5.5"/><circle cx="25" cy="25" r="5.5"/></g>
         <rect x="-${ART}" width="${ART}" height="${ART}" fill="url(#${id}-sweep)" opacity=".45" transform="skewX(-20)"><animate attributeName="x" values="-${ART * 1.5};${ART * 1.5}" dur="3.2s" repeatCount="indefinite"/></rect>
       </g>
       <rect x=".5" y=".5" width="${ART - 1}" height="${ART - 1}" rx="16" fill="none" stroke="#fff" stroke-opacity=".15"/>`;
  const label = playing ? 'NOW PLAYING' : track ? 'LAST PLAYED' : 'COMING SOON';
  const labelCol = playing ? C.green : track ? C.muted : C.cyan;
  const labelW = label.length * 7 + 18;
  const TX = 18 + ART + 18, TW = W - 18 - TX;

  const svg = `${frame(id, W, H, { title: 'Spotify', icon: icon(id, 'spotify', '#1DB954') })}
<g transform="translate(18,56)">${art}</g>
<g font-family="${FONT}" transform="translate(${TX},70)">
  <rect x="0" y="-12" width="${labelW}" height="19" rx="9.5" fill="${labelCol}" fill-opacity=".14" stroke="${labelCol}" stroke-opacity=".6"/>
  <text x="${labelW / 2}" y="2" text-anchor="middle" font-size="9.5" font-weight="800" fill="${labelCol}" letter-spacing="1.2">${label}</text>
  <g transform="translate(${labelW + 12},-9)">${eqBars(0, 0, playing ? C.green : C.pink, 5, 15)}</g>
  <text x="0" y="36" font-size="19" font-weight="800" fill="${C.text}">${esc(truncate(title, 30))}</text>
  <text x="0" y="58" font-size="13" fill="${C.muted}">${esc(truncate(sub, 44))}</text>
  <text x="0" y="76" font-size="10.5" fill="${C.dim}">${esc(truncate(album, 52))}</text>
  <rect x="0" y="90" width="${TW}" height="5" rx="2.5" fill="${C.line}"/>
  <rect x="0" y="90" width="${(TW * prog).toFixed(1)}" height="5" rx="2.5" fill="url(#${id}-pink)" filter="url(#${id}-glow)">
    ${track ? '' : `<animate attributeName="width" values="0;${TW};0" dur="6s" repeatCount="indefinite" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1"/>`}
  </rect>
  <text x="0" y="108" font-size="9.5" fill="${C.dim}" font-family="${MONO}">${track ? mmss(track.progressMs) : '-:--'}</text>
  <text x="${TW}" y="108" text-anchor="end" font-size="9.5" fill="${C.dim}" font-family="${MONO}">${track ? mmss(track.durationMs) : '-:--'}</text>
</g>
<line x1="18" y1="200" x2="${W - 18}" y2="200" stroke="${C.line}"/>
<g font-family="${FONT}" transform="translate(18,218)">
  <circle cx="5" cy="-4" r="4" fill="#1DB954"/>
  <text x="15" y="0" font-size="11" fill="${C.muted}">Korivash on Spotify · phonk / wave-trap / anime-inspired originals</text>
</g>`;
  return wrap(id, W, H, { title: playing ? `Now playing: ${title} - ${sub}` : 'Spotify now playing: coming soon', svg });
}

// ---------------------------------------------------------------- main
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await loadAvatar();
  const cache = await loadCache();
  const ghHeaders = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

  const [admin, miko, ghUser, ghRepos] = await Promise.all([
    source('admin', cache, () => getJSON('https://admin.korivash.com/api/public/status')),
    source('miko', cache, () => getJSON('https://mikoradio.com/api/status')),
    source('ghUser', cache, () => getJSON('https://api.github.com/users/Korivash', ghHeaders)),
    source('ghRepos', cache, () => getJSON('https://api.github.com/users/Korivash/repos?per_page=100&type=owner&sort=pushed', ghHeaders)),
  ]);

  const cards = {
    'miko-live.svg': cardMikoLive({ miko: admin.data?.miko, monitors: miko.data?.monitors, cached: admin.fromCache }),
    'status-grid.svg': cardStatusGrid({ services: admin.data?.services, monitors: miko.data?.monitors }),
    'github-pulse.svg': cardGithubPulse({ user: ghUser.data, repos: ghRepos.data, cached: ghUser.fromCache || ghRepos.fromCache }),
    'now-playing.svg': cardNowPlaying(null),
  };

  // Keep the cache small (only the fields we use).
  if (Array.isArray(cache.miko?.data?.monitors)) {
    cache.miko.data = { monitors: cache.miko.data.monitors.map((m) => ({ name: m.name, state: m.state, uptime: m.uptime })) };
  }
  if (Array.isArray(cache.ghRepos?.data)) {
    cache.ghRepos.data = cache.ghRepos.data.map((r) => ({
      name: r.name, fork: r.fork, private: r.private, language: r.language,
      stargazers_count: r.stargazers_count, forks_count: r.forks_count, pushed_at: r.pushed_at,
    }));
  }

  for (const [name, svg] of Object.entries(cards)) {
    const tmp = path.join(OUT, name + '.tmp');
    await fs.writeFile(tmp, svg, 'utf8');
    await fs.rename(tmp, path.join(OUT, name)); // atomic swap so IIS never serves a half-written file
    console.log(`[cards] wrote ${name} (${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB)`);
  }
  await fs.writeFile(CACHE_FILE, JSON.stringify({ ...cache, generatedAt: new Date().toISOString() }, null, 0));
  console.log(`[cards] done ${stamp} -> ${OUT}`);
}

main().catch((err) => { console.error('[cards] fatal', err); process.exit(1); });
