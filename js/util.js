// Petits utilitaires partagés : DOM, formats, dates, maths.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [p, val] of Object.entries(v)) {
          if (p.startsWith('--')) el.style.setProperty(p, val);
          else el.style[p] = val;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

// ---------- formats ----------
export function parseLap(t) {
  if (t == null || t === '') return null;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(t).trim());
  if (!m) return null;
  return Math.round(((+m[1] || 0) * 60 + parseFloat(m[2])) * 1000);
}

export function fmtLap(ms) {
  if (ms == null || isNaN(ms)) return '–';
  const m = Math.floor(ms / 60000);
  const sec = (ms - m * 60000) / 1000;
  return m ? `${m}:${sec.toFixed(3).padStart(6, '0')}` : sec.toFixed(3);
}

export function fmtDelta(ms) {
  if (ms == null || isNaN(ms)) return '–';
  if (ms === 0) return '–';
  const sec = ms / 1000;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    return `+${m}:${(sec - m * 60).toFixed(3).padStart(6, '0')}`;
  }
  return `+${sec.toFixed(3)}`;
}

export const fmtInt = (n) => (n == null || isNaN(n) ? '–' : String(Math.round(n)));
export const fmtNum = (n, d = 1) => (n == null || isNaN(n) ? '–' : n.toFixed(d).replace('.', ','));
export const minus = (n) => String(n).replace('-', '−');
export const signed = (n) => (n > 0 ? '+' + n : n < 0 ? minus(n) : '0');

// ---------- dates ----------
export function parseUTC(date, time) {
  if (!date) return null;
  if (!time) return null;
  const t = /Z$|[+-]\d\d:?\d\d$/.test(time) ? time : time + 'Z';
  const d = new Date(`${date}T${t}`);
  return isNaN(d) ? null : d;
}

const F = {
  day: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  dayShort: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
  dm: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }),
  dmy: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
  time: new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  full: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  stamp: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
};
const asDate = (x) => (x instanceof Date ? x : new Date(/^\d{4}-\d\d-\d\d$/.test(x) ? x + 'T12:00:00' : x));
export const fmtDay = (x) => F.day.format(asDate(x));
export const fmtDayShort = (x) => F.dayShort.format(asDate(x));
export const fmtDM = (x) => F.dm.format(asDate(x));
export const fmtDMY = (x) => F.dmy.format(asDate(x));
export const fmtTimeOfDay = (x) => F.time.format(asDate(x));
export const fmtFull = (x) => F.full.format(asDate(x));
export const fmtStamp = (x) => F.stamp.format(asDate(x));

export function countdownParts(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
export const pad2 = (n) => String(n).padStart(2, '0');

// ---------- maths ----------
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : null);
export function std(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / a.length);
}
export function niceStep(range) {
  const p = Math.pow(10, Math.floor(Math.log10(range)));
  const f = range / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export const compass = (deg) => (deg == null || isNaN(deg) ? '–' : DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]);
export function circMean(degs) {
  const v = degs.filter((d) => d != null && !isNaN(d));
  if (!v.length) return null;
  const x = sum(v.map((d) => Math.cos((d * Math.PI) / 180)));
  const y = sum(v.map((d) => Math.sin((d * Math.PI) / 180)));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// ---------- pays ----------
const COUNTRY_FR = {
  Australia: 'Australie', China: 'Chine', Japan: 'Japon', Bahrain: 'Bahreïn', 'Saudi Arabia': 'Arabie saoudite',
  USA: 'États-Unis', 'United States': 'États-Unis', Italy: 'Italie', Monaco: 'Monaco', Spain: 'Espagne', Canada: 'Canada',
  Austria: 'Autriche', UK: 'Royaume-Uni', 'United Kingdom': 'Royaume-Uni', Hungary: 'Hongrie', Belgium: 'Belgique',
  Netherlands: 'Pays-Bas', Azerbaijan: 'Azerbaïdjan', Singapore: 'Singapour', Mexico: 'Mexique', Brazil: 'Brésil',
  Qatar: 'Qatar', UAE: 'Émirats arabes unis', Portugal: 'Portugal', Malaysia: 'Malaisie', France: 'France', Germany: 'Allemagne',
  Turkey: 'Turquie', Russia: 'Russie', Korea: 'Corée du Sud', India: 'Inde', Argentina: 'Argentine', Sweden: 'Suède',
};
export const countryFR = (c) => COUNTRY_FR[c] || c || '';

// ---------- stockage local (jamais bloquant) ----------
export const store = {
  get(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
  del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
};

// ---------- composants DOM récurrents ----------
export function notice(text, kind = 'info') {
  return h('p', { class: 'notice ' + kind, role: kind === 'error' ? 'alert' : null }, text);
}
export function unavailable(what, why) {
  return h('div', { class: 'unavail' }, h('strong', null, what), why ? h('span', null, why) : null);
}
export function spinner(text = 'Chargement…') {
  return h('div', { class: 'loading', role: 'status' }, h('span', { class: 'dot' }), text);
}
export function posBadge(pos) {
  const p = String(pos);
  return h('span', { class: 'pos' + (p === '1' ? ' p1' : p === '2' ? ' p2' : p === '3' ? ' p3' : '') }, p);
}
export function section(title, ...kids) {
  return h('section', { class: 'card' }, title ? h('h2', null, title) : null, ...kids);
}
