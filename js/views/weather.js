// Météo des Grands Prix : prévisions (Open-Meteo), mesures sur le circuit (OpenF1) et lecture pour la course.

import { h, fmtFull, fmtDM, fmtDMY, fmtNum, fmtInt, compass, unavailable, spinner, fmtTimeOfDay } from '../util.js';
import { meteoForecast, ofWeather, describeError } from '../api.js';
import { forecastAround, wmoLabel, weatherSummary, OF_NAMES, nextRace } from '../model.js';
import { pageHead, gpSelect, table, emptyState } from './common.js';
import { meetingFor, ttlFor } from './openf1.js';
import { lineChart, SERIES_COLORS } from '../charts.js';

const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

async function forecastSection(S, race, out) {
  const past = Date.parse(race.date + 'T23:59:00Z') < Date.now();
  const box = h('section', { class: 'card' }, h('h2', null, past ? 'Conditions modélisées (Open-Meteo)' : 'Prévisions (Open-Meteo)'));
  if (race.lat == null || race.lon == null) { box.append(unavailable('Position du circuit inconnue', 'Les coordonnées ne sont pas publiées pour ce circuit.')); return box; }
  const t0 = Date.parse(race.start + 'T00:00:00Z'), t1 = Date.parse(race.date + 'T00:00:00Z');
  if ((t0 - Date.now()) / DAY > 15) {
    box.append(unavailable('Prévisions pas encore disponibles', `Les prévisions couvrent 16 jours : elles apparaîtront à partir du ${fmtDM(t0 - 15 * DAY)}.`));
    return box;
  }
  if ((t1 - Date.now()) / DAY < -90) {
    box.append(unavailable('Conditions modélisées indisponibles', 'Cette course est trop ancienne ; les mesures du circuit ci-dessous restent la référence.'));
    return box;
  }
  const lo = Math.max(t0 - DAY, Date.now() - 90 * DAY), hi = Math.min(t1 + DAY, Date.now() + 15 * DAY);
  const f = await meteoForecast(race.lat, race.lon, iso(lo), iso(hi));
  const rows = race.sessions.filter((s) => s.at).map((s) => ({ s, w: forecastAround(f, s.at, s.key === 'race' ? 2 : 1) })).filter((x) => x.w);
  if (!rows.length) { box.append(unavailable('Aucune prévision pour ces horaires', 'Open-Meteo ne renvoie pas de données pour cette période.')); return box; }
  box.append(table([
    { label: 'Séance', align: 'l', get: (x) => x.s.label },
    { label: 'Début', align: 'l', hide: 'hide-s', get: (x) => fmtFull(x.s.at) },
    { label: 'Ciel', align: 'l', get: (x) => wmoLabel(x.w.code) },
    { label: 'Air', get: (x) => (x.w.temp != null ? Math.round(x.w.temp) + ' °C' : null) },
    { label: 'Pluie', title: 'Probabilité de pluie', get: (x) => (x.w.pop != null ? Math.round(x.w.pop) + ' %' : null) },
    { label: 'Cumul', title: 'Précipitations attendues', hide: 'hide-s', get: (x) => (x.w.precip != null ? fmtNum(x.w.precip) + ' mm' : null) },
    { label: 'Vent', get: (x) => (x.w.wind != null ? `${Math.round(x.w.wind)} km/h ${compass(x.w.dir)}` : null) },
  ], rows, { caption: 'Météo par séance' }));
  out.forecastRace = rows.find((x) => x.s.key === 'race');

  // Journée de course : température et probabilité de pluie heure par heure (heure locale du circuit).
  const hh = f.hourly;
  if (race.at && hh) {
    const a = race.at.getTime() - 4 * 3600e3, b = race.at.getTime() + 4 * 3600e3;
    const idx = [];
    hh.time.forEach((t, i) => { if (t * 1000 >= a && t * 1000 <= b) idx.push(i); });
    if (idx.length > 2) {
      const off = (f.utc_offset_seconds || 0) * 1000;
      const labels = idx.map((i) => new Date(hh.time[i] * 1000 + off).getUTCHours() + 'h');
      const titles = idx.map((i, k) => `${labels[k]} (heure du circuit)`);
      box.append(h('div', { class: 'grid-2' },
        h('div', null, h('h3', null, 'Température de l’air, jour de course'),
          lineChart({ series: [{ id: 't', name: 'Air', color: SERIES_COLORS[1], values: idx.map((i) => hh.temperature_2m[i]) }], labels, titles, height: 200, ariaLabel: 'Température de l’air le jour de la course', yFmt: (v) => Math.round(v) + '°' })),
        h('div', null, h('h3', null, 'Probabilité de pluie, jour de course'),
          lineChart({ series: [{ id: 'p', name: 'Pluie', color: SERIES_COLORS[0], values: idx.map((i) => hh.precipitation_probability[i]) }], labels, titles, height: 200, zero: true, ariaLabel: 'Probabilité de pluie le jour de la course', yFmt: (v) => Math.round(v) + ' %' }))));
    }
  }
  return box;
}

async function measuredSection(S, race, out) {
  const box = h('section', { class: 'card' }, h('h2', null, 'Mesures sur le circuit (OpenF1)'));
  const m = await meetingFor(S, race);
  if (!m) { box.append(unavailable('Mesures indisponibles', 'OpenF1 n’a pas publié ce week-end, ou il n’a pas encore commencé.')); return box; }
  const done = race.sessions.filter((s) => s.at && s.at.getTime() < Date.now()).map((s) => ({ s, of: m.byName[OF_NAMES[s.key]] })).filter((x) => x.of);
  if (!done.length) { box.append(unavailable('Aucune séance disputée', 'Les mesures apparaîtront pendant et après les séances.')); return box; }
  const rows = [];
  for (const x of done) {
    try {
      const w = weatherSummary(await ofWeather(x.of.session_key, ttlFor(x.of)));
      if (w) rows.push({ s: x.s, w });
    } catch (e) { rows.push({ s: x.s, err: describeError(e) }); }
  }
  if (!rows.some((r) => r.w)) { box.append(unavailable('Mesures indisponibles', rows[0] && rows[0].err ? rows[0].err : 'OpenF1 n’a pas de relevé météo pour ces séances.')); return box; }
  const range = (st, u) => (st ? `${Math.round(st.min)}–${Math.round(st.max)} ${u}` : null);
  box.append(table([
    { label: 'Séance', align: 'l', get: (r) => r.s.label },
    { label: 'Air', get: (r) => (r.w ? range(r.w.air, '°C') : r.err) },
    { label: 'Piste', get: (r) => (r.w ? range(r.w.track, '°C') : null) },
    { label: 'Humidité', hide: 'hide-s', get: (r) => (r.w && r.w.humidity ? Math.round(r.w.humidity.avg) + ' %' : null) },
    { label: 'Pluie', get: (r) => (r.w && r.w.rainShare != null ? (r.w.rainShare === 0 ? 'Aucune' : Math.round(r.w.rainShare * 100) + ' % du temps') : null) },
    { label: 'Vent', get: (r) => (r.w && r.w.wind ? `${Math.round(r.w.wind.avg)} km/h ${compass(r.w.wind.dir)}` : null) },
  ], rows, { caption: 'Relevés météo mesurés par séance' }));
  const rc = rows.filter((r) => r.w).slice(-1)[0];
  const raceRow = rows.find((r) => r.s.key === 'race' && r.w);
  if (raceRow) out.measuredRace = raceRow.w;
  if (rc && rc.w.series.length > 3) {
    const ser = rc.w.series;
    const labels = ser.map((p) => fmtTimeOfDay(new Date(p.t)));
    box.append(h('div', null, h('h3', null, `Évolution pendant : ${rc.s.label}`),
      lineChart({
        series: [
          { id: 'a', name: 'Air', color: SERIES_COLORS[1], values: ser.map((p) => p.air) },
          { id: 't', name: 'Piste', color: SERIES_COLORS[0], values: ser.map((p) => p.track) },
        ],
        labels, titles: labels, height: 240, ariaLabel: 'Températures de l’air et de la piste pendant la séance', yFmt: (v) => Math.round(v) + '°',
      }),
      h('p', { class: 'note' }, rc.w.rainShare ? `De la pluie a été relevée pendant ${Math.round(rc.w.rainShare * 100)} % de cette séance.` : 'Aucune pluie relevée pendant cette séance.')));
  }
  return box;
}

// Repères généraux de lecture : ce ne sont pas des mesures, ils s'appuient sur les valeurs ci-dessus.
function insights(out) {
  const m = out.measuredRace;
  const f = out.forecastRace && out.forecastRace.w;
  const items = [];
  const track = m && m.track ? m.track.avg : null;
  const wind = m && m.wind ? m.wind.max : f ? f.wind : null;
  const rain = m ? (m.rainShare || 0) > 0 : f ? (f.pop || 0) >= 40 || (f.precip || 0) > 0.5 : null;
  if (track != null && track >= 45) items.push(['Piste chaude', `${Math.round(track)} °C en moyenne : les pneus se dégradent plus vite, les équipes visent des gommes plus dures ou des relais plus courts.`]);
  if (track != null && track <= 25) items.push(['Piste fraîche', `${Math.round(track)} °C en moyenne : les pneus montent plus difficilement en température, avec un risque de grainage.`]);
  if (rain) items.push(['Pluie', m ? 'De la pluie a été relevée : adhérence réduite, pneus intermédiaires ou pluie, safety car plus probable, et un moment de passage aux pneus lisses difficile à choisir.' : 'La pluie est possible : prévoir des stratégies flexibles, avec des arrêts plus nombreux si la piste change.']);
  if (wind != null && wind >= 30) items.push(['Vent fort', `Jusqu’à ${Math.round(wind)} km/h : la stabilité des voitures et les freinages deviennent plus délicats.`]);
  if (!items.length && (track != null || f)) items.push(['Conditions stables', 'Rien de marquant dans les valeurs disponibles : la stratégie dépend surtout de la dégradation des pneus.']);
  return items;
}

export function render(ctx, args) {
  const S = ctx.S;
  const nr = nextRace(S);
  const def = (nr && nr.round) || S.lastRound || (S.races[0] && S.races[0].round);
  const n = +args[0] || def;
  const root = h('div');
  root.append(pageHead('Météo', 'Température, pluie et vent sur chaque circuit.', S.races.length ? gpSelect(S, n, (v) => { location.hash = `#/meteo/${v}`; }) : null));
  if (!n || !S.races[n - 1]) { root.append(emptyState('Calendrier indisponible')); return root; }
  const race = S.races[n - 1];
  root.append(h('p', { class: 'sub' }, `${race.title} : ${race.circuit}, ${race.locality}. ${fmtDMY(race.date)}.`));
  const out = {};
  const slotF = h('div', null, spinner('Chargement des prévisions…'));
  const slotM = h('div', null, spinner('Chargement des mesures…'));
  const slotI = h('div');
  root.append(slotF, slotM, slotI);
  let alive = true;
  const fail = (title, e) => unavailable(title, describeError(e));
  (async () => {
    try { const b = await forecastSection(S, race, out); if (alive) slotF.replaceChildren(b); } catch (e) { if (alive) slotF.replaceChildren(h('section', { class: 'card' }, h('h2', null, 'Prévisions (Open-Meteo)'), fail('Prévisions indisponibles', e))); }
    try { const b = await measuredSection(S, race, out); if (alive) slotM.replaceChildren(b); } catch (e) { if (alive) slotM.replaceChildren(h('section', { class: 'card' }, h('h2', null, 'Mesures sur le circuit (OpenF1)'), fail('Mesures indisponibles', e))); }
    if (!alive) return;
    const ins = insights(out);
    if (ins.length) slotI.append(h('section', { class: 'card' }, h('h2', null, 'Ce que la météo change à la course'),
      h('dl', { class: 'facts wide' }, ins.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
      h('p', { class: 'note' }, 'Repères généraux fondés sur les valeurs ci-dessus ; l’effet réel dépend du circuit et des choix des équipes.')));
  })();
  root.destroy = () => { alive = false; };
  return root;
}
