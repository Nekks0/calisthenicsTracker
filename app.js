'use strict';
/* CaliTrack – Calisthenics Tracker
 * Alle Daten liegen lokal im Browser (localStorage). Kein Server, kein Konto nötig. */

// ---------- Hilfsfunktionen ----------
const STORAGE_KEY = 'calitrack-v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
const fmtDate = (k, opts = { weekday: 'short', day: '2-digit', month: '2-digit' }) => parseKey(k).toLocaleDateString('de-DE', opts);
const fmtNum = n => Math.round(n || 0).toLocaleString('de-DE');
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const clone = o => JSON.parse(JSON.stringify(o));
const fmtDur = sec => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};
const today = () => dateKey();

// ---------- Zustand ----------
const DEFAULT_STATE = {
  settings: { name: '', weight: 75, kcalGoal: 2500, proteinGoal: 140, stepGoal: 10000, waterGoal: 8, stepLength: 75 },
  customPlans: [],
  activePlanId: 'b-beginner',
  workouts: [],
  activeWorkout: null,
  nutrition: {},
  favorites: [],
  steps: {},
  water: {},
  restDays: {},
};

let state = load();
const ui = { tab: 'home', planId: null, nutDate: today(), editing: null };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && typeof raw === 'object') {
      return { ...clone(DEFAULT_STATE), ...raw, settings: { ...DEFAULT_STATE.settings, ...(raw.settings || {}) } };
    }
  } catch (e) { console.warn('Laden fehlgeschlagen', e); }
  return clone(DEFAULT_STATE);
}
let saveTimer = null;
function save(now = true) {
  const write = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️ Speichern fehlgeschlagen'); }
  };
  clearTimeout(saveTimer);
  if (now) write(); else saveTimer = setTimeout(write, 800);
}

const allPlans = () => [...BUILTIN_PLANS, ...state.customPlans];
const getPlan = id => allPlans().find(p => p.id === id);

// ---------- Berechnungen ----------
const dayFoods = k => state.nutrition[k] || [];
const dayTotals = k => dayFoods(k).reduce((a, f) => ({ kcal: a.kcal + num(f.kcal), protein: a.protein + num(f.protein) }), { kcal: 0, protein: 0 });
const workoutsOn = k => state.workouts.filter(w => w.date === k);
const stepsOn = k => state.steps[k] || 0;

function dayStatus(k) {
  if (workoutsOn(k).length) return 'workout';
  if (stepsOn(k) >= state.settings.stepGoal) return 'steps';
  if (state.restDays[k]) return 'rest';
  return null;
}
const isActive = k => dayStatus(k) !== null;

function getStreaks() {
  const t = today();
  let current = 0;
  let k = isActive(t) ? t : addDays(t, -1);
  while (isActive(k)) { current++; k = addDays(k, -1); }

  const keys = new Set([
    ...state.workouts.map(w => w.date),
    ...Object.keys(state.steps).filter(d => state.steps[d] >= state.settings.stepGoal),
    ...Object.keys(state.restDays).filter(d => state.restDays[d]),
  ]);
  const sorted = [...keys].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest: Math.max(longest, current), todayDone: isActive(t) };
}

function workoutReps(w) {
  return w.exercises.reduce((a, e) => a + (e.unit === 'Wdh' ? e.sets.filter(s => s.done).reduce((b, s) => b + num(s.reps), 0) : 0), 0);
}
function workoutSets(w) { return w.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0); }

function getStats() {
  const st = getStreaks();
  const s = state.settings;
  return {
    workouts: state.workouts.length,
    longest: st.longest,
    reps: state.workouts.reduce((a, w) => a + workoutReps(w), 0),
    sets: state.workouts.reduce((a, w) => a + workoutSets(w), 0),
    minutes: Math.round(state.workouts.reduce((a, w) => a + (w.duration || 0), 0) / 60),
    stepGoalDays: Object.values(state.steps).filter(v => v >= s.stepGoal).length,
    maxSteps: Math.max(0, ...Object.values(state.steps)),
    proteinDays: Object.keys(state.nutrition).filter(k => dayTotals(k).protein >= s.proteinGoal).length,
    waterDays: Object.values(state.water).filter(v => v >= s.waterGoal).length,
  };
}

function nextDayIndex(plan) {
  const last = state.workouts.find(w => w.planId === plan.id);
  if (!last || last.dayIndex == null) return 0;
  return (last.dayIndex + 1) % plan.days.length;
}

// ---------- UI-Bausteine ----------
function ring(value, goal, color, size, big, small) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r;
  const p = goal > 0 ? Math.min(value / goal, 1) : 0;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}">
      <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="10"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-txt"><b>${big}</b><small>${small}</small></div>
  </div>`;
}

function pbar(value, goal, color) {
  const p = goal > 0 ? Math.min(value / goal * 100, 100) : 0;
  return `<div class="pbar"><div style="width:${p}%;background:${color}"></div></div>`;
}

function bars(items, goal, color) {
  const max = Math.max(goal || 0, ...items.map(i => i.value), 1) * 1.08;
  return `<div class="bars">${items.map(i => `
    <div class="bar-col">
      <div class="bar-track" title="${esc(i.title || '')}">
        <div class="bar" style="height:${i.value / max * 100}%;background:${goal && i.value >= goal ? 'var(--ok)' : color}"></div>
        ${goal ? `<div class="goal-line" style="bottom:${goal / max * 100}%"></div>` : ''}
      </div>
      <span>${esc(i.label)}</span>
    </div>`).join('')}</div>`;
}

function last7(fn) {
  const t = today();
  return Array.from({ length: 7 }, (_, i) => {
    const k = addDays(t, i - 6);
    return { key: k, label: fmtDate(k, { weekday: 'short' }).replace('.', ''), value: fn(k) };
  });
}

function weekStrip() {
  const t = today();
  return `<div class="week">${last7(() => 0).map(d => {
    const st = dayStatus(d.key);
    const cls = st === 'rest' ? 'rest' : st ? 'on' : '';
    const ico = st === 'workout' ? '💪' : st === 'steps' ? '👟' : st === 'rest' ? '😴' : parseKey(d.key).getDate();
    return `<div class="week-day">${d.label}<div class="week-dot ${cls} ${d.key === t ? 'today' : ''}">${ico}</div></div>`;
  }).join('')}</div>`;
}

function levelTag(level) { return `<span class="tag lvl-${level}">${LEVELS[level] || 'Eigener'}</span>`; }

// ---------- Ansichten ----------
const views = {
  home() {
    const s = state.settings, t = today();
    const st = getStreaks();
    const tot = dayTotals(t);
    const steps = stepsOn(t);
    const plan = getPlan(state.activePlanId);
    const hour = new Date().getHours();
    const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
    const aw = state.activeWorkout;
    const todayWorkouts = workoutsOn(t);

    let trainCard;
    if (aw) {
      trainCard = `<div class="card accent">
        <div class="row between"><h2>Training läuft</h2><span class="tag active pulse">LIVE</span></div>
        <p class="muted">${esc(aw.planName)} · ${esc(aw.dayName)} · <span data-live-duration>${fmtDur((Date.now() - aw.start) / 1000)}</span></p>
        <button class="btn block" data-action="open-workout">Weiter trainieren →</button>
      </div>`;
    } else if (plan) {
      const di = nextDayIndex(plan), day = plan.days[di];
      trainCard = `<div class="card accent">
        <div class="row between"><small>NÄCHSTES TRAINING</small>${todayWorkouts.length ? '<span class="tag lvl-1">Heute erledigt ✓</span>' : ''}</div>
        <h2 style="margin:6px 0 2px">${esc(day.name)}</h2>
        <p class="muted" style="margin:0 0 12px">${esc(plan.name)} · ${day.exercises.length} Übungen · ca. ${estMinutes(day)} min</p>
        <div class="row">
          <button class="btn grow" data-action="start-day" data-plan="${plan.id}" data-day="${di}">▶ Training starten</button>
          <button class="btn ghost" data-action="open-plan" data-id="${plan.id}">Plan</button>
        </div>
      </div>`;
    } else {
      trainCard = `<div class="card accent"><h2>Kein aktiver Plan</h2><p class="muted">Wähle unter „Pläne“ einen Trainingsplan.</p>
        <button class="btn" data-action="tab" data-tab="plans">Pläne ansehen</button></div>`;
    }

    return `
      <h1>${greet}${s.name ? ', ' + esc(s.name) : ''} 👋</h1>
      <p class="muted" style="margin:4px 0 16px">${fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      <div class="card">
        <div class="streak-card">
          <div class="flame ${st.current ? '' : 'off'}">🔥</div>
          <div class="grow">
            <div class="big-num">${st.current} <small style="font-size:1rem">${st.current === 1 ? 'Tag' : 'Tage'}</small></div>
            <small>Streak · Rekord: ${st.longest} ${st.longest === 1 ? 'Tag' : 'Tage'}</small>
          </div>
          ${st.todayDone ? '<span class="tag lvl-1">Heute ✓</span>'
            : `<button class="btn sm ghost" data-action="rest-day" title="Geplanter Ruhetag zählt für die Streak">😴 Ruhetag</button>`}
        </div>
        ${weekStrip()}
        ${st.todayDone ? '' : `<p class="tip" style="margin-top:12px">Halte deine Streak: trainiere, erreiche ${fmtNum(s.stepGoal)} Schritte oder trage einen Ruhetag ein.</p>`}
      </div>

      ${trainCard}

      <div class="section-head"><h2>Heute</h2></div>
      <div class="card click" data-action="tab" data-tab="nutrition">
        <div class="rings">
          <div>${ring(tot.kcal, s.kcalGoal, 'var(--kcal)', 96, fmtNum(tot.kcal), `/ ${fmtNum(s.kcalGoal)}`)}<div class="ring-label">Kalorien</div></div>
          <div>${ring(tot.protein, s.proteinGoal, 'var(--protein)', 96, fmtNum(tot.protein) + ' g', `/ ${s.proteinGoal} g`)}<div class="ring-label">Protein</div></div>
          <div>${ring(steps, s.stepGoal, 'var(--steps)', 96, `<span data-live-steps>${fmtNum(steps)}</span>`, `/ ${fmtNum(s.stepGoal)}`)}<div class="ring-label">Schritte</div></div>
        </div>
      </div>

      <div class="grid2">
        <button class="card click" style="text-align:left" data-action="quick-food">
          <div style="font-size:1.4rem">🍽️</div><b>Mahlzeit</b><br><small>schnell eintragen</small>
        </button>
        <button class="card click" style="text-align:left" data-action="water-add">
          <div style="font-size:1.4rem">💧</div><b>${state.water[t] || 0} / ${s.waterGoal} Gläser</b><br><small>+1 Glas Wasser</small>
        </button>
      </div>

      ${todayWorkouts.length ? `<div class="section-head"><h2>Heute trainiert</h2></div>
        ${todayWorkouts.map(workoutCard).join('')}` : ''}
    `;
  },

  plans() {
    if (ui.planId) return planDetail(getPlan(ui.planId));
    const plans = allPlans();
    const card = p => `
      <div class="card click" data-action="open-plan" data-id="${p.id}">
        <div class="row between">
          <div class="row wrap" style="gap:6px">${levelTag(p.level)}${p.id === state.activePlanId ? '<span class="tag active">Aktiv</span>' : ''}</div>
          <small>${p.days.length} ${p.days.length === 1 ? 'Tag' : 'Tage'}${p.perWeek ? ` · ${p.perWeek}×/Woche` : ''}</small>
        </div>
        <h2 style="margin:8px 0 4px">${esc(p.name)}</h2>
        <p class="muted" style="margin:0">${esc(p.description || '')}</p>
      </div>`;
    return `
      <div class="row between" style="margin-bottom:14px">
        <h1>Trainingspläne</h1>
        <button class="btn sm" data-action="new-plan">+ Neuer Plan</button>
      </div>
      <button class="card click" style="width:100%;text-align:left" data-action="start-free">
        <div class="row"><span style="font-size:1.5rem">⚡</span><div class="grow"><b>Freies Training</b><br><small>Ohne Plan starten und Übungen spontan hinzufügen</small></div><span>→</span></div>
      </button>
      ${state.customPlans.length ? `<div class="section-head"><h2>Meine Pläne</h2></div>${state.customPlans.map(card).join('')}` : ''}
      <div class="section-head"><h2>Vorlagen</h2></div>
      ${BUILTIN_PLANS.map(card).join('')}
    `;
  },

  workout() {
    const aw = state.activeWorkout;
    if (!aw) { ui.tab = 'home'; return views.home(); }
    const total = aw.exercises.reduce((a, e) => a + e.sets.length, 0);
    const done = aw.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
    return `
      <div class="card accent">
        <div class="row between">
          <div class="grow"><small>${esc(aw.planName)}</small><h2>${esc(aw.dayName)}</h2></div>
          <div class="timer-big" data-live-duration>${fmtDur((Date.now() - aw.start) / 1000)}</div>
        </div>
        <div class="mt">${pbar(done, total, 'var(--accent)')}</div>
        <small>${done} / ${total} Sätze erledigt</small>
      </div>

      ${aw.exercises.map((e, ei) => {
        const complete = e.sets.length && e.sets.every(s => s.done);
        return `<div class="card ex-card ${complete ? 'complete' : ''}">
          <div class="row between">
            <div class="grow"><h3>${complete ? '✅ ' : ''}${esc(e.name)}</h3>
              <small>Ziel: ${e.sets.length} × ${e.target} ${e.unit === 'Sek' ? 'Sek.' : 'Wdh.'} · Pause ${e.rest} s</small>
              ${e.tip ? `<div class="tip">💡 ${esc(e.tip)}</div>` : ''}
            </div>
            <button class="btn icon" data-action="remove-exercise" data-ex="${ei}" title="Übung entfernen">✕</button>
          </div>
          <div class="mt">
            ${e.sets.map((s, si) => `
              <div class="set-row ${s.done ? 'done' : ''}">
                <span class="set-idx">Satz ${si + 1}</span>
                <input type="number" inputmode="numeric" min="0" value="${s.reps}" data-set-input="${ei},${si}" aria-label="${e.unit === 'Sek' ? 'Sekunden' : 'Wiederholungen'}">
                <button class="check ${s.done ? 'done' : ''}" data-action="toggle-set" data-ex="${ei}" data-set="${si}" aria-label="Satz erledigt">✓</button>
              </div>`).join('')}
          </div>
          <div class="row mt">
            <button class="btn sm ghost" data-action="add-set" data-ex="${ei}">+ Satz</button>
            ${e.sets.length > 1 ? `<button class="btn sm ghost" data-action="remove-set" data-ex="${ei}">− Satz</button>` : ''}
            <small class="grow" style="text-align:right">${e.unit === 'Sek' ? 'Sekunden' : 'Wiederholungen'}</small>
          </div>
        </div>`;
      }).join('')}

      <button class="btn ghost block" data-action="add-exercise">+ Übung hinzufügen</button>
      <div class="row mt">
        <button class="btn danger" data-action="cancel-workout">Abbrechen</button>
        <button class="btn grow" data-action="finish-workout">🏁 Training beenden</button>
      </div>
    `;
  },

  nutrition() {
    const s = state.settings, k = ui.nutDate, t = today();
    const foods = dayFoods(k);
    const tot = dayTotals(k);
    const water = state.water[k] || 0;
    const kcalLeft = s.kcalGoal - tot.kcal, protLeft = s.proteinGoal - tot.protein;
    const favs = state.favorites.length ? state.favorites : FOOD_PRESETS;

    return `
      <h1>Ernährung</h1>
      <div class="date-nav mt">
        <button class="btn sm ghost" data-action="nut-prev">‹</button>
        <b>${k === t ? 'Heute' : k === addDays(t, -1) ? 'Gestern' : fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
        <button class="btn sm ghost" data-action="nut-next" ${k >= t ? 'disabled style="opacity:.3"' : ''}>›</button>
      </div>

      <div class="card">
        <div class="rings">
          <div>${ring(tot.kcal, s.kcalGoal, 'var(--kcal)', 120, fmtNum(tot.kcal), 'kcal')}<div class="ring-label">${kcalLeft >= 0 ? `noch ${fmtNum(kcalLeft)} kcal` : `${fmtNum(-kcalLeft)} kcal drüber`}</div></div>
          <div>${ring(tot.protein, s.proteinGoal, 'var(--protein)', 120, fmtNum(tot.protein) + ' g', 'Protein')}<div class="ring-label">${protLeft > 0 ? `noch ${fmtNum(protLeft)} g` : 'Ziel erreicht 🎉'}</div></div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:12px">Eintrag hinzufügen</h3>
        <form data-form="food">
          <label class="field"><span>Lebensmittel / Mahlzeit</span><input type="text" name="name" placeholder="z. B. Hähnchen mit Reis" required></label>
          <div class="grid2">
            <label class="field"><span>Kalorien (kcal)</span><input type="number" name="kcal" inputmode="numeric" min="0" placeholder="0"></label>
            <label class="field"><span>Protein (g)</span><input type="number" name="protein" inputmode="decimal" min="0" step="0.1" placeholder="0"></label>
          </div>
          <label class="checkbox"><input type="checkbox" name="fav"> Als Favorit speichern</label>
          <button class="btn block">Hinzufügen</button>
        </form>
        <div class="section-head" style="margin-top:16px"><small>${state.favorites.length ? 'MEINE FAVORITEN' : 'SCHNELL HINZUFÜGEN'}</small>
          ${state.favorites.length ? '<button class="btn sm icon" data-action="show-presets">Vorlagen</button>' : ''}</div>
        <div class="chips">${favs.map((f, i) => `<button class="chip" data-action="add-fav" data-i="${i}" data-src="${state.favorites.length ? 'fav' : 'preset'}">${esc(f.name)}<small>${f.kcal} kcal · ${f.protein} g</small></button>`).join('')}</div>
      </div>

      <div class="card">
        <div class="row between"><h3>Einträge</h3><small>${foods.length}</small></div>
        ${foods.length ? `<ul class="list">${foods.map(f => `
          <li>
            <div class="grow"><b>${esc(f.name)}</b><br><small>${f.time || ''}</small></div>
            <div style="text-align:right"><b>${fmtNum(f.kcal)} kcal</b><br><small style="color:var(--protein)">${num(f.protein)} g Protein</small></div>
            <button class="btn icon" data-action="delete-food" data-id="${f.id}" aria-label="Löschen">✕</button>
          </li>`).join('')}</ul>` : '<div class="empty">Noch nichts eingetragen.</div>'}
      </div>

      <div class="card">
        <div class="row between"><h3>💧 Wasser</h3><small>${(water * 0.25).toLocaleString('de-DE')} L von ${(s.waterGoal * 0.25).toLocaleString('de-DE')} L</small></div>
        <div class="water mt">${Array.from({ length: Math.max(s.waterGoal, water) + 1 }, (_, i) =>
          `<button class="glass ${i < water ? 'full' : ''}" data-action="water-set" data-n="${i < water && i === water - 1 ? i : i + 1}" aria-label="Glas ${i + 1}"></button>`).join('')}</div>
        <small class="tip">1 Glas = 250 ml. Tippe auf ein Glas zum Setzen.</small>
      </div>

      <div class="card">
        <h3 style="margin-bottom:12px">Letzte 7 Tage · Protein</h3>
        ${bars(last7(d => dayTotals(d).protein), s.proteinGoal, 'var(--protein)')}
        <h3 style="margin:18px 0 12px">Letzte 7 Tage · Kalorien</h3>
        ${bars(last7(d => dayTotals(d).kcal), s.kcalGoal, 'var(--kcal)')}
      </div>
    `;
  },

  steps() {
    const s = state.settings, t = today();
    const steps = stepsOn(t);
    const km = steps * s.stepLength / 100000;
    const kcal = steps * 0.04 * (s.weight / 70);
    const week = last7(stepsOn);
    const avg = week.reduce((a, d) => a + d.value, 0) / 7;
    return `
      <h1>Schrittzähler</h1>
      <div class="card mt" style="text-align:center">
        <div style="display:flex;justify-content:center">${ring(steps, s.stepGoal, 'var(--steps)', 190, `<span style="font-size:2rem" data-live-steps>${fmtNum(steps)}</span>`, `von ${fmtNum(s.stepGoal)} Schritten`)}</div>
        <div class="grid3 mt">
          <div class="stat"><b data-live-km>${km.toLocaleString('de-DE', { maximumFractionDigits: 2 })}</b><small>km</small></div>
          <div class="stat"><b data-live-kcal>${fmtNum(kcal)}</b><small>kcal</small></div>
          <div class="stat"><b>${steps >= s.stepGoal ? '✅' : Math.round(steps / s.stepGoal * 100) + ' %'}</b><small>Ziel</small></div>
        </div>
      </div>

      <div class="card">
        <div class="row between">
          <div class="grow"><h3>📱 Live-Zählung</h3>
            <small>Zählt Schritte über den Bewegungssensor deines Handys, solange die App geöffnet ist.</small></div>
          <button class="btn ${pedo.on ? 'danger' : ''}" data-action="pedo-toggle">${pedo.on ? '■ Stopp' : '▶ Start'}</button>
        </div>
        ${pedo.on ? `<p class="tip pulse">Zählung aktiv · in dieser Sitzung: <b data-live-session>${pedo.session}</b> Schritte</p>` : ''}
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px">Schritte eintragen</h3>
        <p class="tip" style="margin-top:0">Übertrage die Schritte aus deiner Uhr oder Health-App.</p>
        <div class="chips" style="margin-bottom:12px">
          ${[500, 1000, 2500, 5000].map(n => `<button class="chip" data-action="steps-add" data-n="${n}">+${fmtNum(n)}</button>`).join('')}
        </div>
        <form data-form="steps" class="row">
          <input type="number" name="steps" inputmode="numeric" min="0" placeholder="Tagesgesamt, z. B. 8500" class="grow">
          <button class="btn">Setzen</button>
        </form>
      </div>

      <div class="card">
        <div class="row between" style="margin-bottom:12px"><h3>Letzte 7 Tage</h3><small>Ø ${fmtNum(avg)} / Tag</small></div>
        ${bars(week, s.stepGoal, 'var(--steps)')}
      </div>
    `;
  },

  profile() {
    const s = state.settings;
    const st = getStats();
    const streak = getStreaks();
    const unlocked = ACHIEVEMENTS.filter(a => a.check(st)).length;
    const recProtein = Math.round(s.weight * 1.8);
    return `
      <h1>Profil & Statistik</h1>
      <div class="grid3 mt">
        <div class="stat"><b>${st.workouts}</b><small>Trainings</small></div>
        <div class="stat"><b>${fmtNum(st.reps)}</b><small>Wiederholungen</small></div>
        <div class="stat"><b>${fmtNum(st.minutes)}</b><small>Minuten</small></div>
        <div class="stat"><b>${streak.current} 🔥</b><small>Streak</small></div>
        <div class="stat"><b>${streak.longest}</b><small>Rekord-Streak</small></div>
        <div class="stat"><b>${fmtNum(st.sets)}</b><small>Sätze</small></div>
      </div>

      <div class="section-head"><h2>Erfolge</h2><small>${unlocked} / ${ACHIEVEMENTS.length}</small></div>
      <div class="badges">${ACHIEVEMENTS.map(a => `<div class="badge ${a.check(st) ? '' : 'locked'}"><span class="b-ico">${a.ico}</span>${esc(a.name)}</div>`).join('')}</div>

      <div class="section-head"><h2>Trainingsverlauf</h2></div>
      ${state.workouts.length ? state.workouts.slice(0, 30).map(workoutCard).join('') : '<div class="card empty">Noch keine Trainings. Leg los! 💪</div>'}
      ${state.workouts.length > 30 ? `<p class="muted" style="text-align:center">+ ${state.workouts.length - 30} ältere Trainings</p>` : ''}

      <div class="section-head"><h2>Einstellungen & Ziele</h2></div>
      <div class="card">
        <form data-form="settings">
          <label class="field"><span>Name</span><input type="text" name="name" value="${esc(s.name)}" placeholder="Dein Name"></label>
          <div class="grid2">
            <label class="field"><span>Körpergewicht (kg)</span><input type="number" name="weight" step="0.1" min="20" value="${s.weight}"></label>
            <label class="field"><span>Schrittlänge (cm)</span><input type="number" name="stepLength" min="30" max="150" value="${s.stepLength}"></label>
            <label class="field"><span>Kalorienziel (kcal)</span><input type="number" name="kcalGoal" min="500" value="${s.kcalGoal}"></label>
            <label class="field"><span>Proteinziel (g)</span><input type="number" name="proteinGoal" min="10" value="${s.proteinGoal}"></label>
            <label class="field"><span>Schrittziel</span><input type="number" name="stepGoal" min="100" step="100" value="${s.stepGoal}"></label>
            <label class="field"><span>Wasserziel (Gläser à 250 ml)</span><input type="number" name="waterGoal" min="1" max="24" value="${s.waterGoal}"></label>
          </div>
          <p class="tip">💡 Empfehlung für Muskelaufbau: ca. 1,6–2,2 g Protein pro kg, bei ${s.weight} kg also rund <b>${recProtein} g</b> am Tag.</p>
          <button class="btn block mt">Speichern</button>
        </form>
      </div>

      <div class="card">
        <h3 style="margin-bottom:6px">Daten</h3>
        <p class="tip" style="margin-top:0">Deine Daten liegen nur in diesem Browser. Exportiere sie regelmäßig als Backup oder um sie auf ein anderes Gerät zu übertragen.</p>
        <div class="row wrap mt">
          <button class="btn ghost" data-action="export">⬇ Exportieren</button>
          <button class="btn ghost" data-action="import">⬆ Importieren</button>
          <button class="btn danger" data-action="reset-all">Alles löschen</button>
        </div>
      </div>
    `;
  },
};

function estMinutes(day) {
  const sec = day.exercises.reduce((a, e) => a + e.sets * ((e.unit === 'Sek' ? e.reps : e.reps * 3) + e.rest), 0);
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

function workoutCard(w) {
  return `<div class="card click" data-action="view-workout" data-id="${w.id}">
    <div class="row between">
      <div class="grow"><b>${esc(w.dayName)}</b> <small>· ${esc(w.planName)}</small><br>
        <small>${fmtDate(w.date)} · ${fmtDur(w.duration)} · ${workoutSets(w)} Sätze · ${fmtNum(workoutReps(w))} Wdh</small></div>
      <span class="muted">›</span>
    </div>
  </div>`;
}

function planDetail(p) {
  if (!p) { ui.planId = null; return views.plans(); }
  const next = nextDayIndex(p);
  const isActive = p.id === state.activePlanId;
  return `
    <button class="btn sm ghost" data-action="back-plans">‹ Alle Pläne</button>
    <div class="card accent mt">
      <div class="row wrap" style="gap:6px">${levelTag(p.level)}${isActive ? '<span class="tag active">Aktiver Plan</span>' : ''}</div>
      <h1 style="margin:10px 0 6px">${esc(p.name)}</h1>
      <p class="muted" style="margin:0 0 14px">${esc(p.description || '')}</p>
      <div class="row wrap">
        ${isActive ? '' : `<button class="btn" data-action="set-active" data-id="${p.id}">Als aktiven Plan wählen</button>`}
        ${p.builtin
          ? `<button class="btn ghost" data-action="duplicate-plan" data-id="${p.id}">Kopieren & anpassen</button>`
          : `<button class="btn ghost" data-action="edit-plan" data-id="${p.id}">Bearbeiten</button>
             <button class="btn danger" data-action="delete-plan" data-id="${p.id}">Löschen</button>`}
      </div>
    </div>
    ${p.days.map((d, di) => `
      <div class="card">
        <div class="row between">
          <div><h2>${esc(d.name)}</h2><small>${d.exercises.length} Übungen · ca. ${estMinutes(d)} min</small></div>
          ${di === next ? '<span class="tag active">Als Nächstes</span>' : ''}
        </div>
        <ul class="list mt">${d.exercises.map((e, ei) => `
          <li><span class="ex-num">${ei + 1}</span>
            <div class="grow"><b>${esc(e.name)}</b>${e.tip ? `<div class="tip">${esc(e.tip)}</div>` : ''}</div>
            <small style="white-space:nowrap">${e.sets} × ${e.reps}${e.unit === 'Sek' ? ' s' : ''}</small>
          </li>`).join('')}</ul>
        <button class="btn block mt" data-action="start-day" data-plan="${p.id}" data-day="${di}">▶ ${esc(d.name)} starten</button>
      </div>`).join('')}
  `;
}

// ---------- Rendern ----------
function render() {
  const view = $('#view');
  const fn = views[ui.tab] || views.home;
  view.innerHTML = fn();
  $$('#tabbar button').forEach(b => {
    const t = b.dataset.tab;
    b.classList.toggle('active', t === ui.tab || (ui.tab === 'workout' && t === 'plans'));
  });
  const st = getStreaks();
  $('#topStreak').innerHTML = `<span class="streak-pill" title="Tages-Streak">${st.current ? '🔥' : '🩶'} ${st.current}</span>`;
}

function go(tab) {
  ui.tab = tab;
  if (tab !== 'plans') ui.planId = null;
  render();
  window.scrollTo({ top: 0 });
}

// ---------- Modal & Toast ----------
function openModal(title, body) {
  $('#modalCard').innerHTML = `<div class="modal-title"><h2>${title}</h2><button class="btn icon" data-action="close-modal" aria-label="Schließen">✕</button></div>${body}`;
  $('#modal').hidden = false;
  const first = $('#modalCard input[type=text]');
  if (first && matchMedia('(pointer:fine)').matches) first.focus();
}
function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; ui.editing = null; }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}

// ---------- Training ----------
function startWorkout(plan, dayIndex) {
  if (state.activeWorkout && !confirm('Es läuft bereits ein Training. Verwerfen und neu starten?')) return;
  const day = plan ? plan.days[dayIndex] : { name: 'Freies Training', exercises: [] };
  state.activeWorkout = {
    planId: plan ? plan.id : null,
    planName: plan ? plan.name : 'Ohne Plan',
    dayIndex: plan ? dayIndex : null,
    dayName: day.name,
    start: Date.now(),
    exercises: day.exercises.map(e => ({
      name: e.name, unit: e.unit, rest: e.rest, tip: e.tip || '', target: e.reps,
      sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, done: false })),
    })),
  };
  save();
  go('workout');
  if (!plan) openAddExercise();
}

function finishWorkout() {
  const aw = state.activeWorkout;
  if (!aw) return;
  const doneSets = aw.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  if (!doneSets && !confirm('Du hast noch keinen Satz abgehakt. Trotzdem beenden?')) return;
  const w = {
    id: uid(), date: today(), planId: aw.planId, planName: aw.planName, dayIndex: aw.dayIndex, dayName: aw.dayName,
    duration: Math.round((Date.now() - aw.start) / 1000),
    exercises: aw.exercises.map(e => ({ name: e.name, unit: e.unit, sets: e.sets.map(s => ({ reps: num(s.reps), done: s.done })) })),
  };
  const before = getStats();
  state.workouts.unshift(w);
  state.activeWorkout = null;
  delete state.restDays[w.date];
  save();
  stopRest();
  go('home');
  const after = getStats();
  const newBadges = ACHIEVEMENTS.filter(a => a.check(after) && !a.check(before));
  openModal('Starkes Training! 🎉', `
    <div class="grid3">
      <div class="stat"><b>${fmtDur(w.duration)}</b><small>Dauer</small></div>
      <div class="stat"><b>${workoutSets(w)}</b><small>Sätze</small></div>
      <div class="stat"><b>${fmtNum(workoutReps(w))}</b><small>Wdh</small></div>
    </div>
    <p style="text-align:center;margin:18px 0">🔥 Deine Streak: <b>${getStreaks().current} ${getStreaks().current === 1 ? 'Tag' : 'Tage'}</b></p>
    ${newBadges.length ? `<p style="text-align:center"><b>Neue Erfolge:</b><br>${newBadges.map(a => `${a.ico} ${esc(a.name)}`).join('<br>')}</p>` : ''}
    <button class="btn block" data-action="close-modal">Weiter</button>
  `);
}

function openAddExercise() {
  openModal('Übung hinzufügen', `
    <form data-form="add-exercise">
      <label class="field"><span>Übung</span><input type="text" name="name" list="exList" required placeholder="z. B. Klimmzüge"></label>
      <datalist id="exList">${[...new Set(allPlans().flatMap(p => p.days.flatMap(d => d.exercises.map(e => e.name))))].sort().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="grid3">
        <label class="field"><span>Sätze</span><input type="number" name="sets" min="1" value="3"></label>
        <label class="field"><span>Ziel</span><input type="number" name="reps" min="1" value="10"></label>
        <label class="field"><span>Einheit</span><select name="unit"><option value="Wdh">Wdh</option><option value="Sek">Sek</option></select></label>
      </div>
      <label class="field"><span>Pause (Sekunden)</span><input type="number" name="rest" min="0" value="90"></label>
      <button class="btn block">Hinzufügen</button>
    </form>`);
}

// ---------- Pausentimer ----------
const rest = { end: 0, total: 0, timer: null };
function startRest(sec) {
  if (!sec) return;
  rest.total = sec;
  rest.end = Date.now() + sec * 1000;
  $('#restBar').hidden = false;
  document.body.classList.add('resting');
  tickRest();
}
function stopRest() {
  rest.end = 0;
  $('#restBar').hidden = true;
  document.body.classList.remove('resting');
}
function tickRest() {
  if (!rest.end) return;
  const left = (rest.end - Date.now()) / 1000;
  if (left <= 0) {
    stopRest();
    beep();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    toast('⏰ Pause vorbei – nächster Satz!');
    return;
  }
  $('#restTime').textContent = fmtDur(Math.ceil(left));
  $('#restFill').style.width = `${left / rest.total * 100}%`;
}
let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(t => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch (e) { /* kein Audio verfügbar */ }
}

// ---------- Schrittzähler (Bewegungssensor) ----------
const pedo = { on: false, avg: 9.81, above: false, last: 0, session: 0, wakeLock: null };

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const mag = Math.hypot(a.x, a.y, a.z);
  pedo.avg = pedo.avg * 0.95 + mag * 0.05;
  const diff = mag - pedo.avg;
  const now = performance.now();
  if (!pedo.above && diff > 1.3 && now - pedo.last > 280) {
    pedo.above = true;
    pedo.last = now;
    pedo.session++;
    addSteps(1, true);
  } else if (pedo.above && diff < 0.3) {
    pedo.above = false;
  }
}

async function togglePedometer() {
  if (pedo.on) {
    window.removeEventListener('devicemotion', onMotion);
    pedo.on = false;
    try { await pedo.wakeLock?.release(); } catch (e) { }
    pedo.wakeLock = null;
    save();
    toast(`Zählung gestoppt · ${pedo.session} Schritte gezählt`);
    render();
    return;
  }
  if (!('DeviceMotionEvent' in window)) { toast('Dieses Gerät hat keinen Bewegungssensor. Trage die Schritte manuell ein.'); return; }
  if (!window.isSecureContext) { toast('Live-Zählung braucht HTTPS oder localhost. Siehe README.'); return; }
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') { toast('Zugriff auf Bewegungssensor verweigert.'); return; }
    }
  } catch (e) { toast('Sensor-Zugriff nicht möglich.'); return; }

  let gotData = false;
  const probe = () => { gotData = true; };
  window.addEventListener('devicemotion', probe, { once: true });
  window.addEventListener('devicemotion', onMotion);
  pedo.on = true;
  pedo.session = 0;
  try { pedo.wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { }
  render();
  toast('Zählung gestartet – Handy in die Tasche und los!');
  setTimeout(() => {
    if (pedo.on && !gotData) {
      window.removeEventListener('devicemotion', onMotion);
      pedo.on = false;
      render();
      toast('Kein Sensor gefunden (z. B. am PC). Bitte manuell eintragen.');
    }
  }, 2500);
}

function addSteps(n, live = false) {
  const k = today();
  const before = stepsOn(k);
  state.steps[k] = Math.max(0, before + n);
  if (live) {
    save(false);
    updateLiveSteps();
    if (before < state.settings.stepGoal && state.steps[k] >= state.settings.stepGoal) {
      toast('🎉 Schrittziel erreicht!');
      render();
    }
  } else {
    save();
    render();
  }
}

function updateLiveSteps() {
  const s = state.settings, steps = stepsOn(today());
  $$('[data-live-steps]').forEach(el => (el.textContent = fmtNum(steps)));
  $$('[data-live-km]').forEach(el => (el.textContent = (steps * s.stepLength / 100000).toLocaleString('de-DE', { maximumFractionDigits: 2 })));
  $$('[data-live-kcal]').forEach(el => (el.textContent = fmtNum(steps * 0.04 * (s.weight / 70))));
  $$('[data-live-session]').forEach(el => (el.textContent = pedo.session));
}

// ---------- Plan-Editor ----------
function openPlanEditor(plan) {
  ui.editing = plan;
  renderEditor();
}
function renderEditor() {
  const p = ui.editing;
  openModal(p._new ? 'Neuer Trainingsplan' : 'Plan bearbeiten', `
    <label class="field"><span>Name</span><input type="text" data-edit="name" value="${esc(p.name)}" placeholder="z. B. Mein Push-Pull-Plan"></label>
    <label class="field"><span>Beschreibung</span><textarea data-edit="description" placeholder="Ziel, Hinweise …">${esc(p.description)}</textarea></label>
    <div class="grid2">
      <label class="field"><span>Level</span><select data-edit="level">${Object.entries(LEVELS).map(([v, n]) => `<option value="${v}" ${+v === +p.level ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>Einheiten pro Woche</span><input type="number" min="1" max="7" data-edit="perWeek" value="${p.perWeek || 3}"></label>
    </div>
    ${p.days.map((d, di) => `
      <div class="editor-day">
        <div class="row" style="margin-bottom:10px">
          <input type="text" class="grow" data-edit-day="${di}" value="${esc(d.name)}" placeholder="Name des Trainingstags">
          <button class="btn icon" data-action="ed-remove-day" data-day="${di}" title="Tag löschen">🗑</button>
        </div>
        ${d.exercises.length ? `<div class="editor-ex editor-ex-head"><span>Übung</span><span>Sätze</span><span>Ziel</span><span>Pause s</span><span></span></div>` : ''}
        ${d.exercises.map((e, ei) => `
          <div class="editor-ex">
            <input type="text" data-edit-ex="${di},${ei}" data-field="name" value="${esc(e.name)}" placeholder="Übung" list="exList">
            <input type="number" min="1" data-edit-ex="${di},${ei}" data-field="sets" value="${e.sets}">
            <div class="row" style="gap:2px">
              <input type="number" min="1" data-edit-ex="${di},${ei}" data-field="reps" value="${e.reps}">
            </div>
            <input type="number" min="0" data-edit-ex="${di},${ei}" data-field="rest" value="${e.rest}">
            <button class="btn icon" style="padding:4px" data-action="ed-remove-ex" data-day="${di}" data-ex="${ei}">✕</button>
          </div>
          <div style="margin:-2px 0 8px">
            <select data-edit-ex="${di},${ei}" data-field="unit" style="width:auto;padding:4px 8px;font-size:.8rem">
              <option value="Wdh" ${e.unit === 'Wdh' ? 'selected' : ''}>Wiederholungen</option>
              <option value="Sek" ${e.unit === 'Sek' ? 'selected' : ''}>Sekunden</option>
            </select>
          </div>`).join('')}
        <button class="btn sm ghost" data-action="ed-add-ex" data-day="${di}">+ Übung</button>
      </div>`).join('')}
    <datalist id="exList">${[...new Set(BUILTIN_PLANS.flatMap(pl => pl.days.flatMap(d => d.exercises.map(e => e.name))))].sort().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <button class="btn ghost block" data-action="ed-add-day">+ Trainingstag hinzufügen</button>
    <button class="btn block mt" data-action="ed-save">Plan speichern</button>
  `);
}

// ---------- Aktionen ----------
const actions = {
  'tab': d => go(d.tab),
  'close-modal': () => closeModal(),
  'open-plan': d => { ui.tab = 'plans'; ui.planId = d.id; render(); scrollTo({ top: 0 }); },
  'back-plans': () => { ui.planId = null; render(); },
  'set-active': d => { state.activePlanId = d.id; save(); toast('Aktiver Plan gesetzt ✓'); render(); },
  'start-day': d => startWorkout(getPlan(d.plan), +d.day),
  'start-free': () => startWorkout(null, 0),
  'open-workout': () => go('workout'),

  'toggle-set': d => {
    const e = state.activeWorkout.exercises[+d.ex], s = e.sets[+d.set];
    s.done = !s.done;
    save();
    if (s.done) {
      if (navigator.vibrate) navigator.vibrate(30);
      const allDone = state.activeWorkout.exercises.every(x => x.sets.every(y => y.done));
      if (allDone) { stopRest(); toast('Alle Sätze erledigt! Beende dein Training 🏁'); }
      else startRest(e.rest);
    }
    render();
  },
  'add-set': d => {
    const e = state.activeWorkout.exercises[+d.ex];
    const lastReps = e.sets.length ? e.sets[e.sets.length - 1].reps : e.target;
    e.sets.push({ reps: lastReps, done: false });
    save(); render();
  },
  'remove-set': d => {
    const e = state.activeWorkout.exercises[+d.ex];
    if (e.sets.length > 1) e.sets.pop();
    save(); render();
  },
  'remove-exercise': d => {
    const e = state.activeWorkout.exercises[+d.ex];
    if (!confirm(`„${e.name}“ aus diesem Training entfernen?`)) return;
    state.activeWorkout.exercises.splice(+d.ex, 1);
    save(); render();
  },
  'add-exercise': () => openAddExercise(),
  'finish-workout': () => finishWorkout(),
  'cancel-workout': () => {
    if (!confirm('Training abbrechen? Der Fortschritt wird nicht gespeichert.')) return;
    state.activeWorkout = null; save(); stopRest(); go('home');
  },
  'rest-skip': () => stopRest(),
  'rest-add': () => { rest.end += 15000; rest.total += 15; tickRest(); },

  'view-workout': d => {
    const w = state.workouts.find(x => x.id === d.id);
    if (!w) return;
    openModal(esc(w.dayName), `
      <p class="muted" style="margin-top:-8px">${esc(w.planName)} · ${fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <div class="grid3" style="margin-bottom:12px">
        <div class="stat"><b>${fmtDur(w.duration)}</b><small>Dauer</small></div>
        <div class="stat"><b>${workoutSets(w)}</b><small>Sätze</small></div>
        <div class="stat"><b>${fmtNum(workoutReps(w))}</b><small>Wdh</small></div>
      </div>
      <ul class="list">${w.exercises.map(e => `
        <li><div class="grow"><b>${esc(e.name)}</b><br>
          <small>${e.sets.map(s => `<span style="${s.done ? '' : 'text-decoration:line-through;opacity:.5'}">${s.reps}${e.unit === 'Sek' ? 's' : ''}</span>`).join(' · ')}</small></div></li>`).join('')}</ul>
      <button class="btn danger block mt" data-action="delete-workout" data-id="${w.id}">Training löschen</button>
    `);
  },
  'delete-workout': d => {
    if (!confirm('Dieses Training endgültig löschen?')) return;
    state.workouts = state.workouts.filter(w => w.id !== d.id);
    save(); closeModal(); render(); toast('Training gelöscht');
  },

  'new-plan': () => openPlanEditor({ _new: true, id: 'c-' + uid(), name: '', description: '', level: 1, perWeek: 3, days: [{ name: 'Tag A', exercises: [{ name: '', sets: 3, reps: 10, unit: 'Wdh', rest: 90 }] }] }),
  'edit-plan': d => openPlanEditor(clone(getPlan(d.id))),
  'duplicate-plan': d => {
    const p = clone(getPlan(d.id));
    openPlanEditor({ ...p, _new: true, builtin: false, id: 'c-' + uid(), name: p.name + ' (Kopie)' });
  },
  'delete-plan': d => {
    const p = getPlan(d.id);
    if (!confirm(`Plan „${p.name}“ löschen? Dein Trainingsverlauf bleibt erhalten.`)) return;
    state.customPlans = state.customPlans.filter(x => x.id !== d.id);
    if (state.activePlanId === d.id) state.activePlanId = BUILTIN_PLANS[0].id;
    ui.planId = null; save(); render(); toast('Plan gelöscht');
  },
  'ed-add-day': () => { ui.editing.days.push({ name: `Tag ${String.fromCharCode(65 + ui.editing.days.length)}`, exercises: [] }); renderEditor(); },
  'ed-remove-day': d => { ui.editing.days.splice(+d.day, 1); renderEditor(); },
  'ed-add-ex': d => { ui.editing.days[+d.day].exercises.push({ name: '', sets: 3, reps: 10, unit: 'Wdh', rest: 90 }); renderEditor(); },
  'ed-remove-ex': d => { ui.editing.days[+d.day].exercises.splice(+d.ex, 1); renderEditor(); },
  'ed-save': () => {
    const p = ui.editing;
    p.name = p.name.trim();
    if (!p.name) { toast('Bitte gib dem Plan einen Namen.'); return; }
    p.days.forEach(d => { d.name = d.name.trim() || 'Training'; d.exercises = d.exercises.filter(e => e.name.trim()); });
    p.days = p.days.filter(d => d.exercises.length);
    if (!p.days.length) { toast('Füge mindestens eine Übung hinzu.'); return; }
    delete p._new;
    p.builtin = false;
    const idx = state.customPlans.findIndex(x => x.id === p.id);
    if (idx >= 0) state.customPlans[idx] = p; else state.customPlans.push(p);
    save(); closeModal();
    ui.tab = 'plans'; ui.planId = p.id; render();
    toast('Plan gespeichert ✓');
  },

  'nut-prev': () => { ui.nutDate = addDays(ui.nutDate, -1); render(); },
  'nut-next': () => { if (ui.nutDate < today()) { ui.nutDate = addDays(ui.nutDate, 1); render(); } },
  'add-fav': d => {
    const f = (d.src === 'fav' ? state.favorites : FOOD_PRESETS)[+d.i];
    addFood(ui.nutDate, f);
  },
  'show-presets': () => {
    openModal('Vorlagen & Favoriten', `
      ${state.favorites.length ? `<h3>Meine Favoriten</h3><ul class="list">${state.favorites.map((f, i) => `
        <li><div class="grow"><b>${esc(f.name)}</b><br><small>${f.kcal} kcal · ${f.protein} g</small></div>
        <button class="btn icon" data-action="delete-fav" data-i="${i}">✕</button></li>`).join('')}</ul>` : ''}
      <h3 class="mt">Vorlagen</h3>
      <div class="chips mt">${FOOD_PRESETS.map((f, i) => `<button class="chip" data-action="add-fav" data-i="${i}" data-src="preset">${esc(f.name)}<small>${f.kcal} kcal · ${f.protein} g</small></button>`).join('')}</div>
    `);
  },
  'delete-fav': d => { state.favorites.splice(+d.i, 1); save(); closeModal(); render(); },
  'delete-food': d => {
    const k = ui.nutDate;
    state.nutrition[k] = dayFoods(k).filter(f => f.id !== d.id);
    if (!state.nutrition[k].length) delete state.nutrition[k];
    save(); render();
  },
  'quick-food': () => { ui.nutDate = today(); go('nutrition'); setTimeout(() => $('[data-form=food] input[name=name]')?.focus(), 50); },
  'water-add': () => { const k = today(); state.water[k] = (state.water[k] || 0) + 1; save(); render(); toast(`💧 ${state.water[k]} / ${state.settings.waterGoal} Gläser`); },
  'water-set': d => { state.water[ui.nutDate] = +d.n; save(); render(); },

  'steps-add': d => { addSteps(+d.n); toast(`+${fmtNum(+d.n)} Schritte`); },
  'pedo-toggle': () => togglePedometer(),
  'rest-day': () => {
    state.restDays[today()] = true; save(); render();
    toast('😴 Ruhetag eingetragen – Regeneration gehört dazu!');
  },

  'export': () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `calitrack-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'import': () => $('#importFile').click(),
  'reset-all': () => {
    if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
    state = clone(DEFAULT_STATE); save(); go('home'); toast('Alle Daten gelöscht');
  },
};

function addFood(k, f) {
  const now = new Date();
  (state.nutrition[k] = state.nutrition[k] || []).push({
    id: uid(), name: f.name, kcal: num(f.kcal), protein: num(f.protein),
    time: k === today() ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '',
  });
  save(); render();
  toast(`✓ ${f.name} hinzugefügt`);
}

// ---------- Formulare ----------
const forms = {
  food(fd, form) {
    const f = { name: fd.get('name').trim(), kcal: num(fd.get('kcal')), protein: num(fd.get('protein')) };
    if (!f.name) return;
    if (fd.get('fav') && !state.favorites.some(x => x.name === f.name)) state.favorites.push({ ...f });
    addFood(ui.nutDate, f);
  },
  steps(fd) {
    const v = Math.round(num(fd.get('steps'), -1));
    if (v < 0) return;
    state.steps[today()] = v; save(); render(); toast('Schritte gespeichert ✓');
  },
  settings(fd) {
    const s = state.settings;
    s.name = fd.get('name').trim();
    s.weight = num(fd.get('weight'), s.weight);
    s.stepLength = num(fd.get('stepLength'), s.stepLength);
    s.kcalGoal = num(fd.get('kcalGoal'), s.kcalGoal);
    s.proteinGoal = num(fd.get('proteinGoal'), s.proteinGoal);
    s.stepGoal = num(fd.get('stepGoal'), s.stepGoal);
    s.waterGoal = Math.round(num(fd.get('waterGoal'), s.waterGoal));
    save(); render(); toast('Einstellungen gespeichert ✓');
  },
  'add-exercise'(fd) {
    const sets = Math.max(1, Math.round(num(fd.get('sets'), 3)));
    const reps = Math.max(1, Math.round(num(fd.get('reps'), 10)));
    state.activeWorkout.exercises.push({
      name: fd.get('name').trim(), unit: fd.get('unit'), rest: Math.round(num(fd.get('rest'), 90)), tip: '', target: reps,
      sets: Array.from({ length: sets }, () => ({ reps, done: false })),
    });
    save(); closeModal(); render();
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  },
};

// ---------- Events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form]?.(new FormData(form), form);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.setInput && state.activeWorkout) {
    const [ei, si] = t.dataset.setInput.split(',').map(Number);
    state.activeWorkout.exercises[ei].sets[si].reps = Math.max(0, Math.round(num(t.value)));
    save(false);
  }
  const p = ui.editing;
  if (!p) return;
  if (t.dataset.edit) p[t.dataset.edit] = t.dataset.edit === 'level' || t.dataset.edit === 'perWeek' ? +t.value : t.value;
  if (t.dataset.editDay) p.days[+t.dataset.editDay].name = t.value;
  if (t.dataset.editEx) {
    const [di, ei] = t.dataset.editEx.split(',').map(Number);
    const f = t.dataset.field;
    p.days[di].exercises[ei][f] = ['sets', 'reps', 'rest'].includes(f) ? Math.max(f === 'rest' ? 0 : 1, Math.round(num(t.value))) : t.value;
  }
});
document.addEventListener('change', e => {
  // Selects lösen in manchen Browsern nur "change" aus
  if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true }));
});

$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.settings || !Array.isArray(data.workouts)) throw new Error('Ungültig');
    if (!confirm('Backup importieren? Deine aktuellen Daten werden ersetzt.')) return;
    state = { ...clone(DEFAULT_STATE), ...data, settings: { ...DEFAULT_STATE.settings, ...data.settings } };
    save(); go('home'); toast('Backup importiert ✓');
  } catch (err) { toast('⚠️ Datei konnte nicht gelesen werden'); }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

// Live-Updates: Trainingsdauer, Pausentimer, Tageswechsel
let lastDay = today();
setInterval(() => {
  const aw = state.activeWorkout;
  if (aw) $$('[data-live-duration]').forEach(el => (el.textContent = fmtDur((Date.now() - aw.start) / 1000)));
  tickRest();
  if (today() !== lastDay) {
    if (ui.nutDate === lastDay) ui.nutDate = today();
    lastDay = today();
    if ($('#modal').hidden && !document.activeElement?.matches('input,textarea,select')) render();
  }
}, 250);

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

// Offline-Unterstützung
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

// Start: laufendes Training direkt fortsetzen
if (state.activeWorkout) ui.tab = 'workout';
render();
