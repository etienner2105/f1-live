// Suivi des Grands Prix : calendrier, programme, résultats de chaque séance, arrêts, incidents, temps au tour.

import { h, fmtDM, fmtDMY, fmtDay, fmtFull, fmtTimeOfDay, fmtLap, fmtDelta, fmtInt, parseLap, mean, posBadge, unavailable, store } from '../util.js';
import { loadPitStops, loadLaps, ofSessionResult, ofDrivers, ofRaceControl, describeError } from '../api.js';
import { OF_NAMES, nextSession } from '../model.js';
import { pageHead, table, driverLink, gpSelect, tabs, emptyState, link } from './common.js';
import { qualiPanel } from './quali.js';
import { meetingFor, ttlFor } from './openf1.js';
import { lineChart, SERIES_COLORS } from '../charts.js';

const STATUS_FR = {
  Finished: '', Retired: 'Abandon', Accident: 'Accident', Collision: 'Collision', 'Collision damage': 'Dégâts de collision', Engine: 'Moteur',
  Gearbox: 'Boîte de vitesses', Brakes: 'Freins', Hydraulics: 'Hydraulique', Electrical: 'Électrique', Suspension: 'Suspension',
  'Power Unit': 'Groupe motopropulseur', Disqualified: 'Disqualifié', 'Did not start': 'Non-partant', Puncture: 'Crevaison',
  Overheating: 'Surchauffe', Wheel: 'Roue', Mechanical: 'Problème mécanique', Transmission: 'Transmission', Clutch: 'Embrayage',
  Spun: 'Tête-à-queue', Withdrew: 'Forfait', Damage: 'Dégâts', Vibrations: 'Vibrations', 'Fuel pressure': 'Pression d’essence',
};
export function statusFR(s) {
  if (s == null) return '';
  const lap = /^\+(\d+) Laps?$/i.exec(s);
  if (lap) return `+${lap[1]} tour${+lap[1] > 1 ? 's' : ''}`;
  return s in STATUS_FR ? STATUS_FR[s] : s;
}

const guard = (fn) => async () => {
  try { return await fn(); } catch (e) { return unavailable('Données indisponibles', describeError(e)); }
};

const now = () => Date.now();

// ---------- liste ----------
function listView(S) {
  const next = nextSession(S);
  const root = h('div');
  root.append(pageHead('Grands Prix', `Calendrier ${S.season} : ${S.races.length} manches.`));
  if (!S.races.length) { root.append(emptyState('Calendrier indisponible', 'Le calendrier n’a pas pu être chargé.')); return root; }
  root.append(h('div', { class: 'cards' }, S.races.map((r) => {
    const rd = S.rounds[r.round];
    const w = rd && rd.results.find((x) => x.pos === 1);
    const state = rd ? 'done' : next && next.race.round === r.round ? 'next' : '';
    return h('a', { class: 'gp-card ' + state, href: `#/gp/${r.round}` },
      h('span', { class: 'rnd' }, String(r.round)),
      h('span', { class: 'gp-body' },
        h('b', null, r.title),
        h('small', null, `${r.circuit}, ${r.locality}`),
        h('small', null, `${fmtDM(r.start)} au ${fmtDM(r.date)}`)),
      h('span', { class: 'gp-state' },
        r.hasSprint ? h('span', { class: 'tag' }, 'Sprint') : null,
        state === 'done' && w ? h('span', null, w.last) : state === 'next' ? h('span', { class: 'tag hot' }, 'Prochain') : h('span', null, rd ? 'Terminé' : 'À venir')));
  })));
  return root;
}

// ---------- tableaux de résultats ----------
function resultsTable(rows, { sprint = false } = {}) {
  const win = rows.find((r) => r.pos === 1);
  const flBest = Math.min(...rows.filter((r) => r.fl && r.fl.ms).map((r) => r.fl.ms), Infinity);
  const timeCell = (r) => {
    if (r.pos === 1 && r.time) return r.time;
    if (r.abandon) return statusFR(r.status) || 'Abandon';
    if (win && win.millis != null && r.millis != null) return fmtDelta(r.millis - win.millis);
    if (r.time) return r.time.startsWith('+') ? '+' + r.time.slice(1) : r.time;
    return statusFR(r.status);
  };
  const cols = [
    { label: 'Pos.', get: (r) => (r.pos != null && !r.abandon ? posBadge(r.pos) : h('span', { class: 'pos out' }, 'Ab.')) },
    { label: 'Pilote', align: 'l', get: (r) => h('span', { class: 'who' }, driverLink(r, r.full), h('small', null, r.team)) },
    { label: 'Grille', hide: 'hide-s', get: (r) => (r.grid === 0 ? 'Stands' : r.grid) },
    { label: 'Tours', hide: 'hide-s', get: (r) => r.laps },
    { label: 'Temps / écart', cls: 'num', get: timeCell },
    { label: 'Pts', cls: 'strong', get: (r) => r.pts },
  ];
  if (!sprint) cols.push(
    { label: 'Meilleur tour', hide: 'hide-s', get: (r) => (r.fl && r.fl.time ? h('span', { class: r.fl.rank === 1 ? 'fl best' : 'fl' }, r.fl.time) : null) },
    { label: 'Écart MT', hide: 'hide-m', title: 'Écart au meilleur tour de la course', get: (r) => (r.fl && r.fl.ms && isFinite(flBest) ? (r.fl.ms === flBest ? '' : fmtDelta(r.fl.ms - flBest)) : null) });
  return table(cols, rows, { caption: sprint ? 'Résultats du sprint' : 'Résultats de la course' });
}

function pending(race, title) {
  return unavailable(title, race.at ? `Rendez-vous le ${fmtFull(race.at)} : les résultats s’afficheront ici après la séance.` : 'Les résultats s’afficheront ici après la séance.');
}

// ---------- essais libres (OpenF1) ----------
async function practicePanel(S, race, key) {
  const sched = race.sessions.find((x) => x.key === key);
  if (sched && sched.at && sched.at.getTime() > now()) return unavailable('Séance pas encore disputée', `${sched.label} : ${fmtFull(sched.at)}.`);
  const m = await meetingFor(S, race);
  const sess = m && m.byName[OF_NAMES[key]];
  if (!sess) return unavailable('Résultats indisponibles', 'OpenF1 n’a pas (encore) publié cette séance.');
  const [res, drs] = await Promise.all([ofSessionResult(sess.session_key, ttlFor(sess)), ofDrivers(sess.session_key)]);
  if (!res.length) return unavailable('Résultats indisponibles', 'OpenF1 n’a pas encore publié le classement de cette séance.');
  const by = new Map(drs.map((d) => [d.driver_number, d]));
  const rows = res.slice().sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const best = rows.find((r) => typeof r.duration === 'number');
  return table([
    { label: 'Pos.', get: (r) => (r.position != null ? posBadge(r.position) : '–') },
    { label: 'Pilote', align: 'l', get: (r) => { const d = by.get(r.driver_number); return h('span', { class: 'who' }, d ? d.full_name : `#${r.driver_number}`, d ? h('small', null, d.team_name) : null); } },
    { label: 'Meilleur temps', cls: 'num', get: (r) => (typeof r.duration === 'number' ? fmtLap(Math.round(r.duration * 1000)) : null) },
    { label: 'Écart', get: (r) => (typeof r.duration === 'number' && best && r !== best ? fmtDelta(Math.round((r.duration - best.duration) * 1000)) : '') },
    { label: 'Tours', hide: 'hide-s', get: (r) => r.number_of_laps },
  ], rows, { caption: sched ? sched.label : 'Essais libres' });
}

// ---------- arrêts aux stands ----------
async function pitsPanel(S, n, rd) {
  if (!rd) return unavailable('Course pas encore disputée', 'Les arrêts aux stands seront affichés après la course.');
  const stops = await loadPitStops(S.season, n);
  if (!stops.length) return unavailable('Arrêts indisponibles', 'Aucun arrêt aux stands n’est publié pour cette course.');
  const wrap = h('div', { class: 'stack' });
  const by = new Map();
  stops.forEach((p) => { (by.get(p.id) || by.set(p.id, []).get(p.id)).push(p); });
  const order = rd.results.filter((r) => by.has(r.driverId));
  wrap.append(table([
    { label: 'Pilote', align: 'l', get: (r) => h('span', { class: 'who' }, driverLink(r, r.full), h('small', null, r.team)) },
    { label: 'Arrêts', get: (r) => by.get(r.driverId).length },
    { label: 'Détail (tour, durée)', align: 'l', get: (r) => by.get(r.driverId).sort((a, b) => a.stop - b.stop).map((p) => `T${p.lap}${p.dur ? ' · ' + p.dur.toFixed(1).replace('.', ',') + ' s' : ''}`).join('   ') },
  ], order, { caption: 'Arrêts aux stands' }));
  const fast = stops.filter((p) => p.dur).sort((a, b) => a.dur - b.dur).slice(0, 5);
  const names = new Map(rd.results.map((r) => [r.driverId, r]));
  if (fast.length) wrap.append(h('div', null, h('h3', null, 'Arrêts les plus rapides'),
    h('ol', { class: 'plain num' }, fast.map((p) => h('li', null, `${(names.get(p.id) || {}).full || p.id} : ${p.dur.toFixed(1).replace('.', ',')} s, tour ${p.lap}`))),
    h('p', { class: 'note' }, 'La durée comprend le passage dans la voie des stands, pas seulement l’immobilisation.')));
  return wrap;
}

// ---------- abandons, pénalités et incidents ----------
const FLAGGED = /PENALTY|INVESTIGATION|COLLISION|INCIDENT|NO FURTHER|DELETED|DISQUALIFIED|STOP\/GO|DRIVE THROUGH|RED FLAG|SAFETY CAR/;
async function incidentsPanel(S, race, rd) {
  if (!rd) return unavailable('Course pas encore disputée', 'Les abandons et incidents seront affichés après la course.');
  const wrap = h('div', { class: 'stack' });
  const out = rd.results.filter((r) => r.abandon);
  wrap.append(h('div', null, h('h3', null, 'Abandons'),
    out.length
      ? h('ul', { class: 'plain' }, out.map((r) => h('li', null, h('b', null, r.full), ` (${r.team}) : ${statusFR(r.status) || 'abandon'}, ${r.laps != null ? r.laps + ' tour' + (r.laps > 1 ? 's' : '') + ' parcouru' + (r.laps > 1 ? 's' : '') : ''}.`)))
      : h('p', { class: 'sub' }, 'Tous les pilotes ont vu l’arrivée.')));
  const box = h('div', null, h('h3', null, 'Direction de course'));
  wrap.append(box);
  try {
    const m = await meetingFor(S, race);
    const sess = m && m.byName.Race;
    if (!sess) throw new Error('none');
    const rc = await ofRaceControl(sess.session_key, ttlFor(sess));
    const rows = rc.filter((x) => x.category === 'SafetyCar' || FLAGGED.test(String(x.message || '').toUpperCase()));
    if (!rows.length) box.append(h('p', { class: 'sub' }, 'Aucun message de la direction de course à signaler.'));
    else {
      const count = (re) => rows.filter((x) => re.test(String(x.message || '').toUpperCase())).length;
      box.append(h('p', { class: 'sub' }, `${count(/SAFETY CAR DEPLOYED/) - count(/VIRTUAL SAFETY CAR DEPLOYED/)} safety car, ${count(/VIRTUAL SAFETY CAR DEPLOYED/)} safety car virtuel, ${count(/RED FLAG/)} drapeau rouge, ${count(/PENALTY/)} pénalité(s) annoncée(s).`),
        table([
          { label: 'Tour', cls: 'num', get: (x) => x.lap_number },
          { label: 'Message officiel (anglais)', align: 'l', get: (x) => x.message },
        ], rows, { caption: 'Messages de la direction de course' }));
    }
  } catch (e) {
    box.append(unavailable('Messages indisponibles', e && e.message === 'none' ? 'OpenF1 n’a pas publié cette course.' : describeError(e)));
  }
  return wrap;
}

// ---------- temps au tour ----------
function lapsPanel(S, n, rd) {
  if (!rd) return unavailable('Course pas encore disputée', 'Les temps au tour seront disponibles après la course.');
  const wrap = h('div', { class: 'stack' });
  const body = h('div', { class: 'stack' });
  wrap.append(body);
  const show = (laps) => {
    body.replaceChildren();
    const ids = rd.results.filter((r) => laps.d[r.driverId]).map((r) => r.driverId);
    const by = new Map(rd.results.map((r) => [r.driverId, r]));
    const all = ids.flatMap((id) => laps.d[id].t.filter((x) => x != null)).sort((a, b) => a - b);
    const med = all.length ? all[Math.floor(all.length / 2)] : null;
    if (!med) { body.append(unavailable('Temps au tour indisponibles', 'Le fournisseur n’a pas publié les temps de cette course.')); return; }
    const lim = med * 1.12;
    const stat = ids.map((id) => {
      const t = laps.d[id].t.filter((x) => x != null);
      const ok = t.filter((x) => x <= lim);
      return { id, r: by.get(id), best: t.length ? Math.min(...t) : null, avg: ok.length ? mean(ok) : null, laps: t.length };
    });
    const globalBest = Math.min(...stat.filter((x) => x.best != null).map((x) => x.best));
    let sel = new Set(rd.results.filter((r) => laps.d[r.driverId] && !r.abandon).slice(0, 3).map((r) => r.driverId));
    const labels = Array.from({ length: laps.n }, (_, i) => String(i + 1));
    const seriesFor = () => [...sel].map((id, k) => ({
      id, name: by.get(id).last, color: SERIES_COLORS[k % SERIES_COLORS.length],
      values: laps.d[id].t.map((x) => (x != null && x <= lim ? x / 1000 : null)),
    }));
    const chart = lineChart({
      series: seriesFor(), labels, titles: labels.map((l) => `Tour ${l}`), height: 300, ariaLabel: 'Temps au tour',
      yFmt: (v) => fmtLap(Math.round(v * 1000)),
    });
    const chips = h('div', { class: 'legend' }, ids.map((id) => {
      const b = h('button', { type: 'button', 'aria-pressed': sel.has(id) ? 'true' : 'false' }, by.get(id).code);
      b.addEventListener('click', () => {
        if (sel.has(id)) { if (sel.size > 1) sel.delete(id); } else if (sel.size < 5) sel.add(id);
        chips.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', sel.has(ids[i]) ? 'true' : 'false'));
        chart.setSeries(seriesFor());
      });
      return b;
    }));
    body.append(
      h('p', { class: 'sub' }, 'Choisis jusqu’à cinq pilotes. Les tours très lents (arrêts aux stands, safety car) sont masqués pour garder le graphique lisible.'),
      chips, chart,
      table([
        { label: 'Pilote', align: 'l', get: (x) => h('span', { class: 'who' }, driverLink(x.r, x.r.full), h('small', null, x.r.team)) },
        { label: 'Meilleur tour', cls: 'num', get: (x) => fmtLap(x.best) },
        { label: 'Écart', get: (x) => (x.best === globalBest ? '' : fmtDelta(x.best - globalBest)) },
        { label: 'Rythme moyen', title: 'Moyenne des tours hors arrêts et neutralisations', cls: 'num', get: (x) => fmtLap(x.avg) },
        { label: 'Tours', hide: 'hide-s', get: (x) => x.laps },
      ], stat, { caption: 'Temps au tour par pilote' }));
  };
  const cached = store.get(`f1v2:laps:${S.season}:${n}`);
  if (cached) { show(cached); return wrap; }
  const btn = h('button', { type: 'button', class: 'btn' }, 'Charger les temps au tour');
  const prog = h('progress', { max: '1', value: '0', hidden: true, 'aria-label': 'Chargement des temps au tour' });
  btn.addEventListener('click', async () => {
    btn.disabled = true; prog.hidden = false;
    try { show(await loadLaps(S.season, n, (p) => { prog.value = p; })); }
    catch (e) { btn.disabled = false; prog.hidden = true; body.prepend(unavailable('Chargement impossible', describeError(e))); }
  });
  body.append(
    h('p', { class: 'sub' }, 'Les temps de chaque tour représentent environ 15 requêtes : ils ne sont chargés que sur demande, puis gardés sur cet appareil.'),
    btn, prog);
  return wrap;
}

// ---------- détail ----------
function detailView(S, n, ctx) {
  const race = S.races[n - 1];
  const root = h('div');
  if (!race) { root.append(pageHead('Grand Prix introuvable'), emptyState('Manche introuvable', 'Choisis un Grand Prix dans la liste.'), link('#/gp', 'Retour au calendrier', 'btn')); return root; }
  const rd = S.rounds[n];
  root.append(pageHead(race.title, `${race.circuit}, ${race.locality}. Du ${fmtDM(race.start)} au ${fmtDMY(race.date)}.`,
    gpSelect(S, n, (v) => { location.hash = `#/gp/${v}`; })));

  const ns = nextSession(S);
  root.append(h('section', { class: 'card' }, h('h2', null, 'Programme du week-end'),
    h('ol', { class: 'sched wide' }, race.sessions.map((s) => {
      const state = s.at ? (s.at.getTime() < now() ? 'done' : ns && ns.session === s ? 'next' : '') : '';
      return h('li', { class: state },
        h('span', { class: 'sn' }, s.label),
        h('span', { class: 'st' }, s.at ? `${fmtDay(s.at)}, ${fmtTimeOfDay(s.at)}` : fmtDay(s.date)),
        h('span', { class: 'ss' }, state === 'done' ? 'Terminée' : state === 'next' ? 'Prochaine séance' : s.at ? 'À venir' : 'Horaire à confirmer'));
    })),
    h('p', { class: 'note' }, 'Horaires affichés dans le fuseau de ton appareil. ', link(`#/meteo/${n}`, 'Voir la météo de ce week-end'))));

  const defs = [];
  defs.push({ id: 'course', label: 'Course', build: () => (rd && rd.results.length ? resultsTable(rd.results) : pending(race, 'Course pas encore disputée')) });
  defs.push({ id: 'quali', label: 'Qualifications', build: () => qualiPanel(S, n) });
  if (race.hasSprint) defs.push({ id: 'sprint', label: 'Sprint', build: () => (rd && rd.sprint.length ? resultsTable(rd.sprint, { sprint: true }) : pending(race, 'Sprint pas encore disputé')) });
  race.sessions.filter((s) => /^fp\d$/.test(s.key)).forEach((s) => defs.push({ id: s.key, label: s.label.replace('Essais libres', 'EL'), build: guard(() => practicePanel(S, race, s.key)) }));
  defs.push({ id: 'stands', label: 'Arrêts aux stands', build: guard(() => pitsPanel(S, n, rd)) });
  defs.push({ id: 'incidents', label: 'Abandons et incidents', build: guard(() => incidentsPanel(S, race, rd)) });
  defs.push({ id: 'tours', label: 'Temps au tour', build: guard(() => lapsPanel(S, n, rd)) });
  root.append(h('section', { class: 'card' }, h('h2', null, 'Résultats détaillés'), tabs(defs, { label: 'Séances du Grand Prix' })));
  return root;
}

export function render(ctx, args) {
  const S = ctx.S;
  const n = +args[0];
  return n ? detailView(S, n, ctx) : listView(S);
}
