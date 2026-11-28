// Transformation des réponses d'API en données exploitables par l'interface.
// Fonctions pures : aucune donnée n'est inventée, ce qui manque reste null.

import { parseLap, parseUTC, mean, std, sum, countryFR, circMean } from './util.js';

const OK_STATUS = /^(Finished|\+\d+ Laps?|Lapped)$/i;
const isInt = (v) => /^\d+$/.test(String(v));

// ---------- calendrier ----------
function normRace(r) {
  const loc = (r.Circuit && r.Circuit.Location) || {};
  const sessions = [];
  const add = (key, label, o) => {
    if (o && o.date) sessions.push({ key, label, date: o.date, at: parseUTC(o.date, o.time) });
  };
  add('fp1', 'Essais libres 1', r.FirstPractice);
  add('fp2', 'Essais libres 2', r.SecondPractice);
  add('fp3', 'Essais libres 3', r.ThirdPractice);
  add('sq', 'Qualifications sprint', r.SprintQualifying || r.SprintShootout);
  add('sprint', 'Course sprint', r.Sprint);
  add('q', 'Qualifications', r.Qualifying);
  add('race', 'Course', { date: r.date, time: r.time });
  const when = (x) => (x.at ? x.at.getTime() : Date.parse(x.date + 'T12:00:00Z'));
  sessions.sort((a, b) => when(a) - when(b));
  const raceSession = sessions.find((x) => x.key === 'race');
  return {
    round: +r.round,
    rawName: r.raceName,
    country: loc.country || '',
    locality: loc.locality || '',
    circuit: (r.Circuit && r.Circuit.circuitName) || '',
    lat: loc.lat != null ? +loc.lat : null,
    lon: loc.long != null ? +loc.long : null,
    date: r.date,
    start: sessions.length ? sessions[0].date : r.date,
    at: raceSession ? raceSession.at : null,
    sessions,
    hasSprint: !!r.Sprint,
  };
}

function nameRaces(races) {
  const count = {};
  races.forEach((r) => { count[r.country] = (count[r.country] || 0) + 1; });
  races.forEach((r) => {
    const base = countryFR(r.country) || r.rawName.replace(/ Grand Prix$/, '');
    r.short = count[r.country] > 1 && r.locality ? r.locality : base;
    r.title = count[r.country] > 1 && r.locality ? `GP ${base} (${r.locality})` : `GP ${base}`;
  });
}

// ---------- résultats ----------
function driverInfo(d) {
  return {
    id: d.driverId,
    code: d.code || (d.familyName || '???').slice(0, 3).toUpperCase(),
    number: d.permanentNumber || '',
    first: d.givenName,
    last: d.familyName,
    full: `${d.givenName} ${d.familyName}`,
    nat: d.nationality || '',
  };
}

function normResult(x) {
  const info = driverInfo(x.Driver);
  const posText = x.positionText != null ? x.positionText : x.position;
  const status = x.status || '';
  const abandon = !isInt(posText) || (status !== '' && !OK_STATUS.test(status));
  const fl = x.FastestLap
    ? {
        rank: +x.FastestLap.rank || null,
        lap: +x.FastestLap.lap || null,
        time: (x.FastestLap.Time && x.FastestLap.Time.time) || null,
        ms: parseLap(x.FastestLap.Time && x.FastestLap.Time.time),
        speed: x.FastestLap.AverageSpeed ? +x.FastestLap.AverageSpeed.speed : null,
      }
    : null;
  return {
    ...info,
    driverId: info.id,
    pos: isInt(x.position) ? +x.position : null,
    posText,
    num: x.number,
    team: x.Constructor ? x.Constructor.name : '',
    teamId: x.Constructor ? x.Constructor.constructorId : '',
    grid: x.grid != null ? +x.grid : null,
    laps: x.laps != null ? +x.laps : null,
    status,
    abandon,
    time: x.Time ? x.Time.time : null,
    millis: x.Time && x.Time.millis != null ? +x.Time.millis : null,
    pts: +x.points || 0,
    fl,
  };
}

function normQuali(rows) {
  const out = rows.map((x) => {
    const info = driverInfo(x.Driver);
    const q = [x.Q1 || '', x.Q2 || '', x.Q3 || ''];
    const ms = q.map(parseLap);
    return {
      ...info,
      driverId: info.id,
      pos: +x.position,
      num: x.number,
      team: x.Constructor ? x.Constructor.name : '',
      teamId: x.Constructor ? x.Constructor.constructorId : '',
      q, ms,
      out: ms[2] != null ? 0 : ms[1] != null ? 2 : ms[0] != null ? 1 : null,
    };
  }).sort((a, b) => a.pos - b.pos);
  // Écart au meilleur temps de la séance où le pilote a été éliminé (comme à l'écran des chronos).
  const best = [0, 1, 2].map((i) => {
    const v = out.map((r) => r.ms[i]).filter((v) => v != null);
    return v.length ? Math.min(...v) : null;
  });
  out.forEach((r) => {
    const i = r.ms[2] != null ? 2 : r.ms[1] != null ? 1 : r.ms[0] != null ? 0 : -1;
    r.session = i + 1;
    r.time = i >= 0 ? r.ms[i] : null;
    r.gap = i >= 0 && best[i] != null ? r.ms[i] - best[i] : null;
  });
  return out;
}

// ---------- saison ----------
export function buildSeason(raw) {
  const races = raw.schedule.map(normRace);
  nameRaces(races);
  const last = raw.lastRound || 0;
  const drivers = new Map();
  const teams = new Map();

  const ensureDriver = (info) => {
    if (!drivers.has(info.id)) drivers.set(info.id, { ...info, team: '', teamId: '', standing: null, rows: [], cum: [] });
    return drivers.get(info.id);
  };
  const ensureTeam = (id, name) => {
    if (!teams.has(id)) teams.set(id, { id, name, standing: null, rows: [], cum: [], driverIds: new Set() });
    return teams.get(id);
  };

  for (const s of raw.dStand) {
    const d = ensureDriver(driverInfo(s.Driver));
    const cs = s.Constructors || [];
    const c = cs[cs.length - 1] || null;
    d.team = c ? c.name : '';
    d.teamId = c ? c.constructorId : '';
    d.standing = { pos: +s.position, points: +s.points, wins: +s.wins || 0 };
  }
  for (const s of raw.cStand) {
    const t = ensureTeam(s.Constructor.constructorId, s.Constructor.name);
    t.standing = { pos: +s.position, points: +s.points, wins: +s.wins || 0 };
  }

  const rounds = {};
  for (let n = 1; n <= last; n++) {
    const rd = raw.rounds[n];
    if (!rd) continue;
    const results = (rd.results || []).map(normResult).sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999));
    const sprint = (rd.sprint || []).map(normResult).sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999));
    const quali = normQuali(rd.quali || []);
    rounds[n] = { n, race: races[n - 1], results, sprint, quali };

    const qBy = new Map(quali.map((q) => [q.driverId, q]));
    const sBy = new Map(sprint.map((x) => [x.driverId, x]));
    const seen = new Set();
    const put = (res, q, sp) => {
      const base = res || q || sp;
      const d = ensureDriver(base);
      seen.add(d.id);
      d.rows.push({
        round: n,
        inRace: !!res,
        grid: res ? res.grid : null,
        pos: res ? res.pos : null,
        posText: res ? res.posText : null,
        status: res ? res.status : '',
        abandon: res ? res.abandon : false,
        pts: res ? res.pts : 0,
        sPts: sp ? sp.pts : 0,
        sPos: sp ? sp.pos : null,
        sAbandon: sp ? sp.abandon : false,
        qpos: q ? q.pos : null,
        qgap: q ? q.gap : null,
        qTime: q ? q.time : null,
        fl: res && res.fl ? res.fl.rank : null,
        team: base.team,
        teamId: base.teamId,
      });
      const tid = base.teamId;
      if (tid) {
        const t = ensureTeam(tid, base.team);
        t.driverIds.add(d.id);
        let tr = t.rows.find((x) => x.round === n);
        if (!tr) { tr = { round: n, pts: 0, wins: 0, podiums: 0, poles: 0, cars: [] }; t.rows.push(tr); }
        tr.pts += (res ? res.pts : 0) + (sp ? sp.pts : 0);
        if (res && res.pos === 1) tr.wins++;
        if (res && res.pos != null && res.pos <= 3 && !res.abandon) tr.podiums++;
        if (q && q.pos === 1) tr.poles++;
        tr.cars.push(d.id);
      }
    };
    for (const res of results) put(res, qBy.get(res.driverId), sBy.get(res.driverId));
    for (const q of quali) if (!seen.has(q.driverId)) put(null, q, sBy.get(q.driverId));
    for (const sp of sprint) if (!seen.has(sp.driverId)) put(null, qBy.get(sp.driverId), sp);
  }

  // Cumul des points par manche (courses + sprints).
  const cumOf = (rows, field) => {
    const by = new Map(rows.map((r) => [r.round, r]));
    let acc = 0;
    const out = [];
    for (let n = 1; n <= last; n++) {
      const r = by.get(n);
      acc += r ? field(r) : 0;
      out.push(acc);
    }
    return out;
  };
  for (const d of drivers.values()) d.cum = cumOf(d.rows, (r) => r.pts + r.sPts);
  for (const t of teams.values()) t.cum = cumOf(t.rows, (r) => r.pts);

  const driverList = [...drivers.values()].sort((a, b) => (a.standing ? a.standing.pos : 999) - (b.standing ? b.standing.pos : 999));
  const teamList = [...teams.values()].sort((a, b) => (a.standing ? a.standing.pos : 999) - (b.standing ? b.standing.pos : 999));

  return {
    season: raw.season, races, lastRound: last, rounds,
    drivers, teams, driverList, teamList,
    fetchedAt: raw.fetchedAt, warnings: raw.warnings || [],
  };
}

// ---------- statistiques ----------
export function driverStats(d) {
  const starts = d.rows.filter((r) => r.inRace);
  const classified = starts.filter((r) => !r.abandon && r.pos != null);
  const grids = starts.filter((r) => r.grid > 0).map((r) => r.grid);
  const qs = d.rows.filter((r) => r.qpos != null).map((r) => r.qpos);
  const finishes = classified.map((r) => r.pos);
  return {
    points: d.standing ? d.standing.points : sum(d.rows.map((r) => r.pts + r.sPts)),
    starts: starts.length,
    wins: starts.filter((r) => r.pos === 1).length,
    podiums: classified.filter((r) => r.pos <= 3).length,
    poles: d.rows.filter((r) => r.qpos === 1).length,
    fastest: starts.filter((r) => r.fl === 1).length,
    dnf: starts.filter((r) => r.abandon).length,
    avgFinish: mean(finishes),
    avgGrid: mean(grids),
    avgQuali: mean(qs),
    bestFinish: finishes.length ? Math.min(...finishes) : null,
    pointsRate: starts.length ? starts.filter((r) => r.pts > 0).length / starts.length : null,
    stdFinish: std(finishes),
  };
}

export function teamStats(t, S) {
  const rows = t.rows;
  return {
    points: t.standing ? t.standing.points : sum(rows.map((r) => r.pts)),
    wins: sum(rows.map((r) => r.wins)),
    podiums: sum(rows.map((r) => r.podiums)),
    poles: sum(rows.map((r) => r.poles)),
    races: rows.length,
  };
}

export function headToHead(a, b) {
  const byB = new Map(b.rows.map((r) => [r.round, r]));
  const rounds = [];
  let qa = 0, qb = 0, ra = 0, rb = 0;
  const key = (r) => (r.abandon || r.pos == null ? Infinity : r.pos);
  for (const ra_ of a.rows) {
    const rb_ = byB.get(ra_.round);
    if (!rb_) continue;
    rounds.push({ round: ra_.round, a: ra_, b: rb_ });
    if (ra_.qpos != null && rb_.qpos != null && ra_.qpos !== rb_.qpos) ra_.qpos < rb_.qpos ? qa++ : qb++;
    if (ra_.inRace && rb_.inRace) {
      const ka = key(ra_), kb = key(rb_);
      if (ka !== kb) ka < kb ? ra++ : rb++;
    }
  }
  return { rounds, qa, qb, ra, rb };
}

// Barème 2026 : 25 points au vainqueur, 18 au deuxième ; sprint : 8 et 7. Pas de point pour le meilleur tour.
const MAX_RACE_DRIVER = 25, MAX_SPRINT_DRIVER = 8, MAX_RACE_TEAM = 43, MAX_SPRINT_TEAM = 15;

export function seasonInfo(S) {
  const remaining = S.races.filter((r) => r.round > S.lastRound);
  const remainingSprints = remaining.filter((r) => r.hasSprint).length;
  const maxDriver = remaining.length * MAX_RACE_DRIVER + remainingSprints * MAX_SPRINT_DRIVER;
  const maxTeam = remaining.length * MAX_RACE_TEAM + remainingSprints * MAX_SPRINT_TEAM;
  const dl = S.driverList, tl = S.teamList;
  const clinch = (list, max, get) => {
    if (list.length < 2 || !list[0].standing) return null;
    return get(list[0]) - get(list[1]) > max ? list[0] : null;
  };
  const stats = dl.map((d) => ({ d, s: driverStats(d) }));
  const top = (k) => {
    const best = stats.slice().sort((a, b) => b.s[k] - a.s[k])[0];
    return best && best.s[k] > 0 ? { d: best.d, n: best.s[k] } : null;
  };
  return {
    total: S.races.length,
    done: S.lastRound,
    remaining: remaining.length,
    remainingSprints,
    maxDriver, maxTeam,
    driverChampion: clinch(dl, maxDriver, (d) => d.standing.points),
    teamChampion: clinch(tl, maxTeam, (t) => t.standing.points),
    leader: dl[0] || null,
    mostWins: top('wins'), mostPoles: top('poles'), mostPodiums: top('podiums'), mostFastest: top('fastest'),
  };
}

export function raceSummary(S, n) {
  const rd = S.rounds[n];
  if (!rd) return null;
  return {
    race: rd.race,
    winner: rd.results.find((r) => r.pos === 1) || null,
    podium: rd.results.filter((r) => r.pos != null && r.pos <= 3 && !r.abandon),
    pole: rd.quali.find((q) => q.pos === 1) || rd.results.find((r) => r.grid === 1) || null,
    fastest: rd.results.find((r) => r.fl && r.fl.rank === 1) || null,
    abandons: rd.results.filter((r) => r.abandon),
    sprintWinner: rd.sprint.find((r) => r.pos === 1) || null,
  };
}

export function nextSession(S, now = Date.now()) {
  for (const race of S.races) {
    for (const s of race.sessions) {
      const t = s.at ? s.at.getTime() : null;
      if (t != null && t > now) return { race, session: s };
    }
  }
  return null;
}

export function nextRace(S, now = Date.now()) {
  const upcoming = S.races.filter((r) => (r.at ? r.at.getTime() : Date.parse(r.date + 'T23:59:00Z')) > now);
  return upcoming[0] || null;
}

// ---------- OpenF1 ----------
export function matchMeeting(sessions, race) {
  if (!sessions || !sessions.length || !race) return null;
  const target = Date.parse(race.date + 'T12:00:00Z');
  let best = null;
  for (const s of sessions) {
    if (s.session_name !== 'Race') continue;
    const dt = Math.abs(Date.parse(s.date_start) - target);
    if (dt < 40 * 3600e3 && (!best || dt < best.dt)) best = { s, dt };
  }
  if (!best) return null;
  const mk = best.s.meeting_key;
  const list = sessions.filter((s) => s.meeting_key === mk);
  const byName = {};
  list.forEach((s) => { byName[s.session_name] = s; });
  return { meetingKey: mk, byName, list };
}

export const OF_NAMES = { fp1: 'Practice 1', fp2: 'Practice 2', fp3: 'Practice 3', sq: 'Sprint Qualifying', sprint: 'Sprint', q: 'Qualifying', race: 'Race' };

export const COMPOUNDS = {
  SOFT: { letter: 'T', name: 'Tendres' },
  MEDIUM: { letter: 'M', name: 'Mediums' },
  HARD: { letter: 'D', name: 'Dures' },
  INTERMEDIATE: { letter: 'I', name: 'Intermédiaires' },
  WET: { letter: 'P', name: 'Pluie' },
};

export function tyreAt(stints, number, lap) {
  const st = (stints || []).find((x) => +x.driver_number === +number && x.lap_start <= lap && (x.lap_end == null || lap <= x.lap_end));
  if (!st) return null;
  const age = st.tyre_age_at_start != null ? st.tyre_age_at_start + (lap - st.lap_start) : lap - st.lap_start;
  return { compound: String(st.compound || '').toUpperCase(), age, stint: st.stint_number };
}

export function weatherSummary(rows) {
  if (!rows || !rows.length) return null;
  const col = (k) => rows.map((r) => r[k]).filter((v) => v != null && !isNaN(v));
  const stat = (a) => (a.length ? { min: Math.min(...a), max: Math.max(...a), avg: mean(a) } : null);
  const wind = col('wind_speed').map((v) => v * 3.6);
  const rain = col('rainfall');
  const step = Math.max(1, Math.ceil(rows.length / 70));
  return {
    n: rows.length,
    air: stat(col('air_temperature')),
    track: stat(col('track_temperature')),
    humidity: stat(col('humidity')),
    wind: wind.length ? { avg: mean(wind), max: Math.max(...wind), dir: circMean(col('wind_direction')) } : null,
    rainShare: rain.length ? rain.filter((v) => v > 0).length / rain.length : null,
    series: rows.filter((_, i) => i % step === 0).map((r) => ({
      t: Date.parse(r.date), air: r.air_temperature, track: r.track_temperature, rain: r.rainfall, wind: r.wind_speed != null ? r.wind_speed * 3.6 : null,
    })),
  };
}

// Prévisions Open-Meteo (heures en secondes epoch) autour d'une séance.
export function forecastAround(f, at, hours = 1) {
  const h = f && f.hourly;
  if (!h || !h.time || !at) return null;
  const t0 = at.getTime(), t1 = t0 + hours * 3600e3;
  const idx = [];
  h.time.forEach((t, i) => {
    const ms = t * 1000;
    if (ms + 3600e3 > t0 && ms < t1) idx.push(i);
  });
  if (!idx.length) return null;
  const pick = (k) => idx.map((i) => h[k][i]).filter((v) => v != null);
  const temps = pick('temperature_2m'), pops = pick('precipitation_probability'), prec = pick('precipitation'), winds = pick('wind_speed_10m'), codes = pick('weather_code');
  return {
    temp: temps.length ? mean(temps) : null,
    pop: pops.length ? Math.max(...pops) : null,
    precip: prec.length ? sum(prec) : null,
    wind: winds.length ? mean(winds) : null,
    dir: circMean(pick('wind_direction_10m')),
    code: codes.length ? Math.max(...codes) : null,
  };
}

export function wmoLabel(code) {
  if (code == null) return '–';
  if (code === 0) return 'Ciel dégagé';
  if (code <= 2) return 'Peu nuageux';
  if (code === 3) return 'Couvert';
  if (code === 45 || code === 48) return 'Brouillard';
  if (code >= 51 && code <= 57) return 'Bruine';
  if (code >= 61 && code <= 67) return 'Pluie';
  if (code >= 71 && code <= 77) return 'Neige';
  if (code >= 80 && code <= 82) return 'Averses';
  if (code >= 95) return 'Orage';
  return 'Variable';
}

// ---------- rejeu d'une course ----------
const TRACK_LABEL = { GREEN: 'Piste libre', SC: 'Safety car', VSC: 'Safety car virtuel', RED: 'Drapeau rouge', FINISH: 'Arrivée' };

export function trackStatusByLap(rc, n) {
  const rows = (rc || []).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const out = new Array(n + 1).fill('GREEN');
  let cur = 'GREEN';
  let idx = 0;
  const lapOf = (r) => (r.lap_number == null ? 0 : r.lap_number);
  for (let L = 1; L <= n; L++) {
    while (idx < rows.length && lapOf(rows[idx]) <= L) {
      const r = rows[idx++];
      const msg = String(r.message || '').toUpperCase();
      const flag = String(r.flag || '').toUpperCase();
      if (r.category === 'SafetyCar' || /SAFETY CAR/.test(msg)) {
        if (/VIRTUAL SAFETY CAR DEPLOYED/.test(msg)) cur = 'VSC';
        else if (/VIRTUAL SAFETY CAR ENDING/.test(msg)) cur = 'GREEN';
        else if (/SAFETY CAR DEPLOYED/.test(msg)) cur = 'SC';
        else if (/SAFETY CAR IN THIS LAP|SAFETY CAR ENDING|IN THIS LAP/.test(msg)) cur = 'GREEN';
      } else if (flag === 'RED') cur = 'RED';
      else if (flag === 'CHEQUERED') cur = 'FINISH';
      else if ((flag === 'GREEN' || flag === 'CLEAR') && String(r.scope || '').toLowerCase() === 'track' && cur === 'RED') cur = 'GREEN';
    }
    out[L] = cur;
  }
  return out;
}
export const trackLabel = (k) => TRACK_LABEL[k] || TRACK_LABEL.GREEN;

const NOISY_FLAG = /^(BLUE|CLEAR|GREEN)$/;
const RC_WORDS = /PENALTY|INVESTIGATION|COLLISION|INCIDENT|NO FURTHER|DELETED|DISQUALIFIED|RETIRED|STOP\/GO|DRIVE THROUGH|RACE START|RED FLAG/;

export function buildReplay({ laps, results, pits = [], stints = [], rc = [] }) {
  const n = laps.n;
  const ids = Object.keys(laps.d);
  const resBy = new Map(results.map((r) => [r.driverId, r]));
  const track = trackStatusByLap(rc, n);

  const cum = {};
  const lastIdx = {};
  for (const id of ids) {
    let acc = 0;
    cum[id] = laps.d[id].t.map((x) => (x == null ? null : (acc += x)));
    lastIdx[id] = -1;
    laps.d[id].p.forEach((p, i) => { if (p != null) lastIdx[id] = i; });
  }
  const pitsBy = {};
  pits.forEach((p) => { (pitsBy[p.id] || (pitsBy[p.id] = [])).push(p); });

  // événements
  const events = [];
  pits.forEach((p) => {
    const r = resBy.get(p.id);
    events.push({ lap: p.lap, type: 'pit', who: r ? r.code : p.id, text: `${r ? r.code : p.id} aux stands, arrêt n°${p.stop}${p.dur ? ' (' + p.dur.toFixed(1).replace('.', ',') + ' s)' : ''}` });
  });
  for (const id of ids) {
    const r = resBy.get(id);
    if (r && r.abandon && lastIdx[id] >= 0 && lastIdx[id] + 1 < n) {
      events.push({ lap: Math.min(n, lastIdx[id] + 2), type: 'out', who: r.code, text: `${r.code} abandonne (${r.status || 'abandon'})` });
    }
  }
  for (let L = 2; L <= n; L++) {
    for (const id of ids) {
      const a = laps.d[id].p[L - 2], b = laps.d[id].p[L - 1];
      if (a == null || b == null || a === b || Math.min(a, b) > 10) continue;
      const r = resBy.get(id);
      if (b < a) events.push({ lap: L, type: 'pos', who: r ? r.code : id, text: `${r ? r.code : id} passe de P${a} à P${b}` });
    }
  }
  rc.forEach((x) => {
    if (x.lap_number == null) return;
    const flag = String(x.flag || '').toUpperCase();
    const msg = String(x.message || '');
    const keep = x.category === 'SafetyCar' || (x.category === 'Flag' && !NOISY_FLAG.test(flag)) || RC_WORDS.test(msg.toUpperCase());
    if (!keep) return;
    events.push({ lap: x.lap_number, type: x.category === 'SafetyCar' ? 'sc' : flag === 'RED' ? 'flag' : x.category === 'Flag' ? 'flag' : 'rc', text: msg, official: true });
  });
  events.sort((a, b) => a.lap - b.lap);

  function frame(L) {
    const rows = [];
    for (const id of ids) {
      const d = laps.d[id];
      const r = resBy.get(id) || {};
      const base = { id, code: r.code || id, name: r.last || id, team: r.team || '', num: r.num };
      const p = d.p[L - 1];
      const stops = (pitsBy[id] || []).filter((x) => x.lap <= L);
      const common = { stops: stops.length, inPit: (pitsBy[id] || []).some((x) => x.lap === L), tyre: tyreAt(stints, r.num, L) };
      if (p != null) {
        rows.push({ ...base, ...common, pos: p, cum: cum[id][L - 1], lastMs: d.t[L - 1], state: 'run' });
      } else if (r.abandon) {
        rows.push({ ...base, ...common, pos: null, state: 'out', outLap: lastIdx[id] + 2, status: r.status, sortKey: 1000 - lastIdx[id] });
      } else if (lastIdx[id] >= 0 && L > lastIdx[id] + 1) {
        rows.push({ ...base, ...common, pos: r.pos, cum: null, state: 'done', sortKey: r.pos || 500 });
      }
    }
    const live = rows.filter((x) => x.state !== 'out').sort((a, b) => (a.pos ?? 500) - (b.pos ?? 500));
    const out = rows.filter((x) => x.state === 'out').sort((a, b) => a.sortKey - b.sortKey);
    const leader = live.find((x) => x.state === 'run' && x.pos === 1) || null;
    let prev = null;
    live.forEach((x, i) => {
      x.rank = i + 1;
      if (x.state === 'run' && leader && leader.cum != null && x.cum != null) {
        x.gap = x.pos === 1 ? 0 : x.cum - leader.cum;
        x.interval = prev && prev.cum != null ? x.cum - prev.cum : null;
      }
      if (x.state === 'run') prev = x;
    });
    return { lap: L, n, rows: live.concat(out), leader, track: track[L], events: events.filter((e) => e.lap <= L) };
  }
  return { n, frame, events, track };
}
