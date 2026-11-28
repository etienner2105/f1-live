// Coque de l'application : menu latéral, routage par hash, chargement et actualisation des données.

import { h, s, clear, store, fmtStamp, spinner } from './util.js';
import { loadRaw, loadCachedRaw, describeError } from './api.js';
import { buildSeason } from './model.js';
import * as dashboard from './views/dashboard.js';
import * as standings from './views/standings.js';
import * as gp from './views/gp.js';
import * as live from './views/live.js';
import * as drivers from './views/drivers.js';
import * as teams from './views/teams.js';
import * as quali from './views/quali.js';
import * as weather from './views/weather.js';
import * as news from './views/news.js';
import * as compare from './views/compare.js';

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  list: 'M4 6h16M4 12h16M4 18h10',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  live: 'M12 12m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l3 2M9 2h6',
  cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z',
  news: 'M5 4h11v16H7a2 2 0 0 1-2-2zM16 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3',
  scale: 'M12 4v16M6 20h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
};

const NAV = [
  { id: 'accueil', label: 'Tableau de bord', icon: 'home', view: dashboard },
  { id: 'classements', label: 'Classements', icon: 'list', view: standings },
  { id: 'gp', label: 'Grands Prix', icon: 'flag', view: gp },
  { id: 'direct', label: 'Direct', icon: 'live', view: live },
  { id: 'pilotes', label: 'Pilotes', icon: 'user', view: drivers },
  { id: 'ecuries', label: 'Écuries', icon: 'shield', view: teams },
  { id: 'qualifs', label: 'Qualifications', icon: 'timer', view: quali },
  { id: 'meteo', label: 'Météo', icon: 'cloud', view: weather },
  { id: 'actus', label: 'Actualités', icon: 'news', view: news },
  { id: 'comparateur', label: 'Comparateur', icon: 'scale', view: compare },
];

const state = { S: null, raw: null, loading: false, error: null, offline: false, updatedAt: null };
const ctx = { get S() { return state.S; }, state, refresh: (o) => refresh(o) };

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refresh');
let current = null;
let lastSig = '';

// ---------- thème ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'light' ? '#f4f4f2' : '#0a0a0b');
}
let theme = store.get('f1v2:theme') || 'dark';
applyTheme(theme);

// ---------- menu ----------
NAV.forEach((n) => {
  const svg = s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'ico' }, s('path', { d: ICONS[n.icon] }));
  nav.append(h('li', null, h('a', { href: n.id === 'accueil' ? '#/' : `#/${n.id}`, 'data-id': n.id }, svg, h('span', null, n.label))));
});
const closeNav = () => document.body.classList.remove('nav-open');
document.getElementById('menu-btn').addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  document.getElementById('menu-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
});
document.getElementById('scrim').addEventListener('click', closeNav);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
nav.addEventListener('click', closeNav);
const themeBtn = document.getElementById('theme-btn');
const syncThemeBtn = () => { themeBtn.textContent = theme === 'light' ? 'Passer en thème sombre' : 'Passer en thème clair'; };
syncThemeBtn();
themeBtn.addEventListener('click', () => { theme = theme === 'light' ? 'dark' : 'light'; store.set('f1v2:theme', theme); applyTheme(theme); syncThemeBtn(); });

// ---------- routage ----------
function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });
  const id = parts[0] || 'accueil';
  return { id, args: parts.slice(1) };
}

function errorScreen() {
  const e = state.error;
  return h('div', { class: 'empty big' },
    h('strong', null, 'Les données de la saison ne sont pas disponibles'),
    h('p', null, `Le service qui fournit les classements n’a pas répondu (${describeError(e)}). Aucune donnée n’est affichée plutôt que des chiffres incertains.`),
    h('button', { type: 'button', class: 'btn', onclick: () => refresh({ force: true }) }, 'Réessayer'));
}

function renderRoute({ keepScroll = false, focus = false } = {}) {
  if (current && current.destroy) { try { current.destroy(); } catch (e) { /* ignore */ } }
  current = null;
  const { id, args } = parse();
  const item = NAV.find((n) => n.id === id) || NAV[0];
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.id === item.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${item.label} · Classement F1 2026`;
  const y = window.scrollY;
  clear(main);
  if (!state.S) {
    main.append(state.error ? errorScreen() : spinner('Chargement de la saison…'));
    return;
  }
  let el;
  try { el = item.view.render(ctx, args); } catch (e) {
    console.error(e);
    el = h('div', { class: 'empty big' }, h('strong', null, 'Cette page n’a pas pu s’afficher'), h('p', null, 'Une donnée inattendue a bloqué l’affichage. Recharge la page ou choisis une autre rubrique.'));
  }
  if (state.S.warnings && state.S.warnings.length) {
    main.append(h('p', { class: 'notice' }, `Certaines données n’ont pas pu être chargées (${state.S.warnings.join(', ')}). Elles seront redemandées à la prochaine actualisation.`));
  }
  current = el;
  main.append(el);
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  if (focus) main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => renderRoute({ focus: true }));

// ---------- données ----------
function paintStatus() {
  if (state.loading) { statusEl.textContent = 'Actualisation en cours…'; statusEl.className = 'status busy'; }
  else if (state.offline && state.updatedAt) { statusEl.textContent = `Hors ligne, données du ${fmtStamp(state.updatedAt)}`; statusEl.className = 'status warn'; }
  else if (state.updatedAt) { statusEl.textContent = `Dernière actualisation : ${fmtStamp(state.updatedAt)}`; statusEl.className = 'status'; }
  else { statusEl.textContent = 'Aucune donnée chargée'; statusEl.className = 'status warn'; }
  refreshBtn.disabled = state.loading;
}

const sig = (S) => (S ? `${S.season}|${S.lastRound}|${S.driverList.map((d) => (d.standing ? d.standing.points : 0)).join(',')}|${S.races.length}` : '');

async function refresh({ force = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  paintStatus();
  try {
    const raw = await loadRaw(state.raw, { force });
    state.raw = raw;
    state.S = buildSeason(raw);
    state.updatedAt = raw.fetchedAt;
    state.error = null;
    state.offline = false;
  } catch (e) {
    console.error(e);
    state.error = state.S ? null : e;
    state.offline = !!state.S;
  }
  state.loading = false;
  paintStatus();
  const next = sig(state.S);
  const changed = next !== lastSig || !current;
  lastSig = next;
  if (changed) renderRoute({ keepScroll: true });
}
refreshBtn.addEventListener('click', () => refresh({ force: true }));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.updatedAt && Date.now() - state.updatedAt > 10 * 60e3) refresh();
});
window.addEventListener('online', () => refresh());
setInterval(() => { if (!document.hidden) refresh(); }, 15 * 60e3);

// ---------- démarrage ----------
(function start() {
  const cached = loadCachedRaw();
  if (cached) {
    try { state.raw = cached; state.S = buildSeason(cached); state.updatedAt = cached.fetchedAt; state.offline = true; lastSig = sig(state.S); } catch (e) { state.raw = null; state.S = null; store.del('f1v2:raw'); }
  }
  paintStatus();
  renderRoute();
  refresh();
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
