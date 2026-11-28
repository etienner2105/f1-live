// Accès aux données : Jolpica (calendrier, classements, résultats), OpenF1 (séances, météo mesurée,
// pneus, direction de course) et Open-Meteo (prévisions). Tout passe par une file qui respecte
// les limites de débit des API publiques, avec cache local pour ne jamais redemander une course terminée.

import { store, parseLap } from './util.js';

export const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
export const OPENF1 = 'https://api.openf1.org/v1';
export const METEO = 'https://api.open-meteo.com/v1/forecast';

export class HttpError extends Error {
  constructor(status, url) { super('HTTP ' + status); this.status = status; this.url = url; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lanes = {};
async function throttle(host, gap) {
  const lane = lanes[host] || (lanes[host] = { t: 0 });
  const now = Date.now();
  const start = Math.max(now, lane.t);
  lane.t = start + gap;
  if (start > now) await sleep(start - now);
}

const GAPS = { 'api.jolpi.ca': 300, 'api.openf1.org': 450, 'api.open-meteo.com': 120 };
const memo = new Map();

export async function getJSON(url, { retries = 3 } = {}) {
  const host = new URL(url).host;
  const gap = GAPS[host] || 200;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host, gap);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) {
        const ra = +res.headers.get('Retry-After');
        lastErr = new HttpError(res.status, url);
        await sleep((ra > 0 ? ra * 1000 : 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, url);
      return await res.json();
    } catch (e) {
      if (e instanceof HttpError) throw e;
      lastErr = e;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr || new Error('Réseau indisponible');
}

// Réutilise une requête déjà faite (ou en cours) pendant la session.
function once(url) {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.t < 120e3) return hit.p;
  const p = getJSON(url).catch((e) => { memo.delete(url); throw e; });
  memo.set(url, { t: Date.now(), p });
  return p;
}

// Cache localStorage avec durée de vie. ttl = Infinity pour des données qui ne changent plus.
async function cached(key, ttl, fn) {
  const hit = store.get(key);
  if (hit && (ttl === Infinity || Date.now() - hit.t < ttl)) return hit.v;
  try {
    const v = await fn();
    store.set(key, { t: Date.now(), v });
    return v;
  } catch (e) {
    if (hit) return hit.v; // mieux vaut une donnée enregistrée qu'aucune
    throw e;
  }
}

export function describeError(e) {
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403) return 'accès refusé par le fournisseur de données';
    if (e.status === 404) return 'aucune donnée publiée pour cette demande';
    if (e.status === 429) return 'trop de requêtes, réessaie dans une minute';
    return 'le service a répondu avec une erreur (' + e.status + ')';
  }
  return 'impossible de joindre le service';
}

// ---------- Jolpica ----------
async function pagedRaces(path, key) {
  const out = new Map();
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const j = await once(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`);
    const mr = j.MRData;
    total = +mr.total || 0;
    const races = mr.RaceTable.Races || [];
    if (!races.length) break;
    for (const r of races) {
      const n = +r.round;
      if (!out.has(n)) out.set(n, []);
      out.get(n).push(...(r[key] || []));
    }
    offset += 100;
  }
  return out;
}

async function oneRound(season, n, endpoint, key) {
  const j = await getJSON(`${JOLPICA}/${season}/${n}/${endpoint}.json?limit=100`);
  const r = (j.MRData.RaceTable.Races || [])[0];
  return r ? r[key] || [] : [];
}

export async function loadRaw(prev, { force = false, onProgress } = {}) {
  const warnings = [];
  const sj = await getJSON(`${JOLPICA}/current.json?limit=100`);
  const schedule = sj.MRData.RaceTable.Races || [];
  const season = (schedule[0] && schedule[0].season) || String(new Date().getFullYear());
  const dj = await getJSON(`${JOLPICA}/${season}/driverStandings.json?limit=100`);
  const cj = await getJSON(`${JOLPICA}/${season}/constructorStandings.json?limit=100`);
  const dl = (dj.MRData.StandingsTable.StandingsLists || [])[0];
  const cl = (cj.MRData.StandingsTable.StandingsLists || [])[0];
  const lastRound = +((dl && dl.round) || 0);

  const same = prev && prev.season === season;
  const rounds = same ? { ...prev.rounds } : {};
  const need = [];
  for (let n = 1; n <= lastRound; n++) {
    if (!rounds[n] || force || n >= lastRound - 1) need.push(n);
  }
  const hasSprintInfo = schedule.some((r) => r.Sprint);

  if (need.length > 6) {
    onProgress && onProgress('Chargement des résultats de la saison…');
    const res = await pagedRaces(`${JOLPICA}/${season}/results.json`, 'Results');
    const qua = await pagedRaces(`${JOLPICA}/${season}/qualifying.json`, 'QualifyingResults').catch((e) => { warnings.push('qualifications'); return new Map(); });
    const spr = await pagedRaces(`${JOLPICA}/${season}/sprint.json`, 'SprintResults').catch((e) => { warnings.push('sprints'); return new Map(); });
    for (const n of need) {
      if (!res.has(n)) continue;
      rounds[n] = { results: res.get(n), quali: qua.get(n) || [], sprint: spr.get(n) || [] };
    }
  } else {
    for (const n of need) {
      try {
        const results = await oneRound(season, n, 'results', 'Results');
        if (!results.length) continue;
        const quali = await oneRound(season, n, 'qualifying', 'QualifyingResults').catch(() => (rounds[n] ? rounds[n].quali : []));
        const sr = schedule[n - 1];
        const wantSprint = sr ? !!sr.Sprint || !hasSprintInfo : !hasSprintInfo;
        const sprint = wantSprint ? await oneRound(season, n, 'sprint', 'SprintResults').catch(() => (rounds[n] ? rounds[n].sprint : [])) : [];
        rounds[n] = { results, quali, sprint };
      } catch (e) {
        warnings.push('manche ' + n);
      }
    }
  }

  const raw = {
    season,
    schedule,
    dStand: (dl && dl.DriverStandings) || [],
    cStand: (cl && cl.ConstructorStandings) || [],
    lastRound,
    rounds,
    fetchedAt: Date.now(),
    warnings,
  };
  store.set('f1v2:raw', raw);
  return raw;
}

export const loadCachedRaw = () => store.get('f1v2:raw');

// Temps au tour : une course = environ 15 requêtes de 100 lignes. Résultat compacté et mis en cache.
export async function loadLaps(season, round, onProgress) {
  const key = `f1v2:laps:${season}:${round}`;
  const hit = store.get(key);
  if (hit) return hit;
  const byLap = new Map();
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const j = await once(`${JOLPICA}/${season}/${round}/laps.json?limit=100&offset=${offset}`);
    const mr = j.MRData;
    total = +mr.total || 0;
    const race = (mr.RaceTable.Races || [])[0];
    if (!race) break;
    for (const lap of race.Laps || []) {
      const n = +lap.number;
      if (!byLap.has(n)) byLap.set(n, []);
      byLap.get(n).push(...(lap.Timings || []));
    }
    offset += 100;
    onProgress && onProgress(Math.min(1, offset / Math.max(total, 1)));
  }
  const laps = compactLaps(byLap);
  if (laps.n > 0) store.set(key, laps);
  return laps;
}

export function compactLaps(byLap) {
  const nums = [...byLap.keys()].sort((a, b) => a - b);
  const n = nums.length ? nums[nums.length - 1] : 0;
  const d = {};
  for (const num of nums) {
    for (const t of byLap.get(num)) {
      const e = d[t.driverId] || (d[t.driverId] = { p: new Array(n).fill(null), t: new Array(n).fill(null) });
      e.p[num - 1] = +t.position;
      e.t[num - 1] = parseLap(t.time);
    }
  }
  return { n, d };
}

export async function loadPitStops(season, round) {
  const key = `f1v2:pits:${season}:${round}`;
  const hit = store.get(key);
  if (hit) return hit;
  const j = await once(`${JOLPICA}/${season}/${round}/pitstops.json?limit=100`);
  const race = (j.MRData.RaceTable.Races || [])[0];
  const stops = ((race && race.PitStops) || []).map((p) => ({ id: p.driverId, stop: +p.stop, lap: +p.lap, dur: parseFloat(p.duration) || null }));
  if (stops.length) store.set(key, stops);
  return stops;
}

// ---------- OpenF1 ----------
async function ofGet(endpoint, query) {
  const url = `${OPENF1}/${endpoint}?${query}`;
  try {
    const j = await once(url);
    return Array.isArray(j) ? j : [];
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}

export const ofSessions = (year) => cached(`f1v2:of:sessions:${year}`, 6 * 3600e3, () => ofGet('sessions', `year=${year}`));
export const ofWeather = (sk, ttl) => cached(`f1v2:of:weather:${sk}`, ttl, () => ofGet('weather', `session_key=${sk}`));
export const ofStints = (sk, ttl) => cached(`f1v2:of:stints:${sk}`, ttl, () => ofGet('stints', `session_key=${sk}`));
export const ofRaceControl = (sk, ttl) => cached(`f1v2:of:rc:${sk}`, ttl, () => ofGet('race_control', `session_key=${sk}`));
export const ofSessionResult = (sk, ttl) => cached(`f1v2:of:sr:${sk}`, ttl, () => ofGet('session_result', `session_key=${sk}`));
export const ofDrivers = (sk) => cached(`f1v2:of:drivers:${sk}`, Infinity, () => ofGet('drivers', `session_key=${sk}`));

// ---------- Open-Meteo ----------
export function meteoForecast(lat, lon, start, end) {
  const q = new URLSearchParams({
    latitude: lat, longitude: lon,
    hourly: 'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,weather_code',
    timeformat: 'unixtime', timezone: 'auto', wind_speed_unit: 'kmh', start_date: start, end_date: end,
  });
  const url = `${METEO}?${q}`;
  return cached(`f1v2:meteo:${lat}:${lon}:${start}:${end}`, 30 * 60e3, () => getJSON(url));
}
