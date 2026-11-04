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
  settings: {
    name: '', weight: 75, kcalGoal: 2500, proteinGoal: 140, carbsGoal: 300, fatGoal: 75, stepGoal: 10000, waterGoal: 8, stepLength: 75,
    sex: 'm', age: 25, height: 180, activity: 1.55, calGoal: 'bulk',
  },
  customPlans: [],
  activePlanId: 'b-beginner',
  workouts: [],
  activeWorkout: null,
  nutrition: {},
  favorites: [],
  steps: {},
  water: {},
  restDays: {},
  products: {},
};

let state = load();
const ui = { tab: 'home', planId: null, nutDate: today(), editing: null, meal: mealByTime(), scanned: null };

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
const sumFoods = foods => foods.reduce((a, f) => ({
  kcal: a.kcal + num(f.kcal), protein: a.protein + num(f.protein), carbs: a.carbs + num(f.carbs), fat: a.fat + num(f.fat),
}), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
const dayTotals = k => sumFoods(dayFoods(k));
const round1 = n => Math.round(num(n) * 10) / 10;
const fmt1 = n => round1(n).toLocaleString('de-DE');
const macroLine = f => `P ${fmt1(f.protein)} · K ${fmt1(f.carbs)} · F ${fmt1(f.fat)} g`;

// Mahlzeit nach Uhrzeit vorschlagen; alte Einträge ohne Gruppe werden über die Uhrzeit zugeordnet
function mealByTime(h = new Date().getHours()) {
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}
const mealOf = f => f.meal || (f.time ? mealByTime(parseInt(f.time, 10)) : 'snack');
const mealSelect = (selected, attrs = '') => `<select name="meal" ${attrs}>${MEALS.map(m =>
  `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${m.ico} ${m.name}</option>`).join('')}</select>`;
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
    const prevFoods = dayFoods(addDays(k, -1));
    const macroRow = (label, value, goal, color) => `
      <div class="macro-row">
        <div class="row between"><small>${label}</small><small><b>${fmtNum(value)}</b> / ${fmtNum(goal)} g</small></div>
        ${pbar(value, goal, color)}
      </div>`;

    return `
      <div class="row between">
        <h1>Ernährung</h1>
        <button class="btn sm ghost" data-action="calc-open">🧮 Ziele berechnen</button>
      </div>
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
        <div class="macros">
          ${macroRow('Kohlenhydrate', tot.carbs, s.carbsGoal, 'var(--carbs)')}
          ${macroRow('Fett', tot.fat, s.fatGoal, 'var(--fat)')}
        </div>
      </div>

      <div class="card" id="foodCard">
        <div class="row between" style="margin-bottom:12px">
          <h3>Eintrag hinzufügen</h3>
          <button class="btn sm" data-action="scan-open">📷 Barcode scannen</button>
        </div>
        <form data-form="food">
          <label class="field"><span>Lebensmittel / Mahlzeit</span><input type="text" name="name" placeholder="z. B. Hähnchen mit Reis" required></label>
          <label class="field"><span>Mahlzeit</span>${mealSelect(ui.meal, 'data-meal-select')}</label>
          <div class="grid2">
            <label class="field"><span>Kalorien (kcal)</span><input type="number" name="kcal" inputmode="numeric" min="0" placeholder="0"></label>
            <label class="field"><span>Protein (g)</span><input type="number" name="protein" inputmode="decimal" min="0" step="0.1" placeholder="0"></label>
            <label class="field"><span>Kohlenhydrate (g)</span><input type="number" name="carbs" inputmode="decimal" min="0" step="0.1" placeholder="0"></label>
            <label class="field"><span>Fett (g)</span><input type="number" name="fat" inputmode="decimal" min="0" step="0.1" placeholder="0"></label>
          </div>
          <label class="checkbox"><input type="checkbox" name="fav"> Als Favorit speichern</label>
          <button class="btn block">Hinzufügen</button>
        </form>
        <div class="section-head" style="margin-top:16px"><small>${state.favorites.length ? 'MEINE FAVORITEN' : 'SCHNELL HINZUFÜGEN'}</small>
          ${state.favorites.length ? '<button class="btn sm icon" data-action="show-presets">Vorlagen</button>' : ''}</div>
        <div class="chips">${favs.map((f, i) => `<button class="chip" data-action="add-fav" data-i="${i}" data-src="${state.favorites.length ? 'fav' : 'preset'}">${esc(f.name)}<small>${fmtNum(f.kcal)} kcal · ${fmt1(f.protein)} g P</small></button>`).join('')}</div>
        <small class="tip">Favoriten und Vorlagen landen in der oben gewählten Mahlzeit.</small>
      </div>

      <div class="card">
        <div class="row between"><h3>Einträge</h3><small>${foods.length}</small></div>
        ${MEALS.map(m => {
          const items = foods.filter(f => mealOf(f) === m.id);
          const sub = sumFoods(items);
          const canCopy = !items.length && prevFoods.some(f => mealOf(f) === m.id);
          return `<div class="meal-group">
            <div class="row between meal-head">
              <div class="grow"><b>${m.ico} ${m.name}</b>${items.length ? `<br><small>${fmtNum(sub.kcal)} kcal · ${macroLine(sub)}</small>` : ''}</div>
              ${canCopy ? `<button class="btn sm ghost" data-action="meal-copy" data-meal="${m.id}" title="Einträge vom Vortag übernehmen">↻ Wie gestern</button>` : ''}
              <button class="btn sm ghost" data-action="meal-add" data-meal="${m.id}" aria-label="${m.name} hinzufügen">+</button>
            </div>
            ${items.length ? `<ul class="list">${items.map(f => `
              <li>
                <div class="grow"><b>${esc(f.name)}</b><br><small>${f.time ? f.time + ' · ' : ''}${macroLine(f)}</small></div>
                <div style="text-align:right;white-space:nowrap"><b>${fmtNum(f.kcal)} kcal</b></div>
                <button class="btn icon" data-action="delete-food" data-id="${f.id}" aria-label="Löschen">✕</button>
              </li>`).join('')}</ul>` : ''}
          </div>`;
        }).join('')}
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
            <label class="field"><span>Kohlenhydratziel (g)</span><input type="number" name="carbsGoal" min="0" value="${s.carbsGoal}"></label>
            <label class="field"><span>Fettziel (g)</span><input type="number" name="fatGoal" min="0" value="${s.fatGoal}"></label>
            <label class="field"><span>Schrittziel</span><input type="number" name="stepGoal" min="100" step="100" value="${s.stepGoal}"></label>
            <label class="field"><span>Wasserziel (Gläser à 250 ml)</span><input type="number" name="waterGoal" min="1" max="24" value="${s.waterGoal}"></label>
          </div>
          <p class="tip">💡 Empfehlung für Muskelaufbau: ca. 1,6–2,2 g Protein pro kg, bei ${s.weight} kg also rund <b>${recProtein} g</b> am Tag.</p>
          <button type="button" class="btn ghost block mt" data-action="calc-open">🧮 Kalorien- & Makrorechner</button>
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
function closeModal() { stopScanner(); $('#modal').hidden = true; $('#modalCard').innerHTML = ''; ui.editing = null; ui.scanned = null; }

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

// ---------- Barcode-Scanner (Nährwerte von Open Food Facts) ----------
// Chrome/Android hat einen eingebauten BarcodeDetector, sonst wird ein Polyfill (ZXing/WASM) nachgeladen.
const BARCODE_POLYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@2.2.11/dist/es/pure.min.js';
const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const scan = { id: 0, stream: null, timer: null, detector: null };

async function getDetector() {
  if (scan.detector) return scan.detector;
  let Detector = window.BarcodeDetector;
  if (Detector) {
    try { if (!(await Detector.getSupportedFormats()).includes('ean_13')) Detector = null; }
    catch (e) { Detector = null; }
  }
  if (!Detector) Detector = (await import(BARCODE_POLYFILL)).BarcodeDetector;
  scan.detector = new Detector({ formats: BARCODE_FORMATS });
  return scan.detector;
}

// Jeder Aufruf macht laufende Scans und Suchen ungültig (scan.id)
function stopScanner() {
  scan.id++;
  clearTimeout(scan.timer);
  scan.stream?.getTracks().forEach(t => t.stop());
  scan.stream = null;
}

function openScanner() {
  openModal('Barcode scannen', `
    <div class="scanner" id="scanBox"><video id="scanVideo" playsinline muted></video><div class="scan-frame"></div></div>
    <p class="tip" id="scanMsg">Kamera wird gestartet …</p>
    <form data-form="barcode" class="row mt">
      <input type="text" name="code" inputmode="numeric" autocomplete="off" placeholder="Oder Barcode eintippen" class="grow">
      <button class="btn">Suchen</button>
    </form>
    <small class="tip">Nährwerte von Open Food Facts. Gescannte Produkte bleiben auch offline gespeichert.</small>`);
  startScanner();
}

async function startScanner() {
  stopScanner();
  const id = scan.id;
  const msg = text => { const el = $('#scanMsg'); if (el) el.textContent = text; };
  const fail = text => { stopScanner(); msg(text); $('#scanBox')?.remove(); };
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    fail('📷 Die Kamera braucht HTTPS oder localhost. Gib den Barcode unten ein.');
    return;
  }
  try {
    const detector = await getDetector();
    if (id !== scan.id) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (id !== scan.id) { stream.getTracks().forEach(t => t.stop()); return; }
    scan.stream = stream;
    const video = $('#scanVideo');
    video.srcObject = stream;
    await video.play();
    if (id !== scan.id) return;
    msg('Halte den Barcode in den Rahmen.');
    let errors = 0;
    const loop = async () => {
      if (id !== scan.id) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (id !== scan.id) return;
          errors = 0;
          if (codes.length) {
            if (navigator.vibrate) navigator.vibrate(60);
            lookupBarcode(codes[0].rawValue);
            return;
          }
        }
      } catch (e) {
        if (++errors > 15) { fail('Scanner funktioniert hier nicht. Gib den Barcode unten ein.'); return; }
      }
      scan.timer = setTimeout(loop, 200);
    };
    loop();
  } catch (e) {
    if (id !== scan.id) return;
    fail(e?.name === 'NotAllowedError' ? '🚫 Kamerazugriff verweigert. Erlaube die Kamera in den Browser-Einstellungen oder gib den Barcode unten ein.'
      : e?.name === 'NotFoundError' ? 'Keine Kamera gefunden. Gib den Barcode unten ein.'
      : 'Scanner konnte nicht gestartet werden (offline?). Gib den Barcode unten ein.');
  }
}

async function lookupBarcode(raw) {
  const code = String(raw || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) { toast('Ungültiger Barcode (8–14 Ziffern)'); return; }
  stopScanner();
  const id = scan.id;
  if (state.products[code]) { showProduct(state.products[code]); return; }
  openModal('Produkt wird gesucht …', `<div class="empty">⏳ Lade Nährwerte für ${code} …</div>`);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_de,brands,nutriments,serving_quantity`);
    const data = await res.json();
    if (id !== scan.id) return;
    if (data.status !== 1 || !data.product) {
      openModal('Produkt nicht gefunden', `
        <p class="muted">Zum Barcode <b>${code}</b> gibt es keine Daten bei Open Food Facts. Trag die Nährwerte von der Verpackung manuell ein.</p>
        <div class="row mt"><button class="btn ghost grow" data-action="scan-open">Erneut scannen</button><button class="btn grow" data-action="food-focus">Manuell eintragen</button></div>`);
      return;
    }
    const prod = parseProduct(code, data.product);
    state.products[code] = prod;
    save();
    showProduct(prod);
  } catch (e) {
    if (id !== scan.id) return;
    openModal('Keine Verbindung', `
      <p class="muted">Die Produktdaten konnten nicht geladen werden. Prüfe deine Internetverbindung.</p>
      <div class="row mt"><button class="btn ghost grow" data-action="close-modal">Schließen</button><button class="btn grow" data-action="scan-lookup" data-code="${code}">Erneut versuchen</button></div>`);
  }
}

function parseProduct(code, p) {
  const n = p.nutriments || {};
  const val = key => (n[key] == null || n[key] === '' ? null : num(n[key], null));
  let kcal = val('energy-kcal_100g');
  if (kcal == null && val('energy_100g') != null) kcal = val('energy_100g') / 4.184; // energy_100g ist in kJ
  const name = String(p.product_name_de || p.product_name || '').trim();
  const brand = String(p.brands || '').split(',')[0].trim();
  return {
    code,
    name: [name, brand].filter(Boolean).join(' · ') || `Produkt ${code}`,
    per100: { kcal: kcal == null ? null : Math.round(kcal), protein: val('proteins_100g'), carbs: val('carbohydrates_100g'), fat: val('fat_100g') },
    serving: Math.max(0, num(p.serving_quantity)),
  };
}

function portion(prod, g) {
  const v = k => num(prod.per100[k]) * g / 100;
  return { name: `${prod.name} (${fmt1(g)} g)`, kcal: Math.round(v('kcal')), protein: round1(v('protein')), carbs: round1(v('carbs')), fat: round1(v('fat')) };
}

function scanPreview(prod, g) {
  const f = portion(prod, g);
  return `
    <div class="stat"><b style="color:var(--kcal)">${fmtNum(f.kcal)}</b><small>kcal</small></div>
    <div class="stat"><b style="color:var(--protein)">${fmt1(f.protein)} g</b><small>Protein</small></div>
    <div class="stat"><b style="color:var(--carbs)">${fmt1(f.carbs)} g</b><small>Kohlenhydrate</small></div>
    <div class="stat"><b style="color:var(--fat)">${fmt1(f.fat)} g</b><small>Fett</small></div>`;
}

function showProduct(prod) {
  ui.scanned = prod;
  const p = prod.per100;
  const incomplete = Object.values(p).some(v => v == null);
  const amount = prod.serving || 100;
  openModal('Produkt gefunden', `
    <h3>${esc(prod.name)}</h3>
    <small>Pro 100 g: ${p.kcal == null ? '?' : fmtNum(p.kcal)} kcal · ${macroLine(p)}</small>
    ${incomplete ? '<p class="tip">⚠️ Nicht alle Nährwerte sind hinterlegt. Fehlende Werte zählen als 0.</p>' : ''}
    <form data-form="scanned" data-live="scanned" class="mt">
      <div class="grid2">
        <label class="field"><span>Menge (g / ml)</span><input type="number" name="amount" inputmode="decimal" min="1" step="any" value="${amount}" required></label>
        <label class="field"><span>Mahlzeit</span>${mealSelect(ui.meal)}</label>
      </div>
      <div class="chips" style="margin-bottom:12px">
        ${prod.serving ? `<button type="button" class="chip" data-action="scan-amount" data-g="${prod.serving}">1 Portion (${fmt1(prod.serving)} g)</button>` : ''}
        ${[50, 100, 200].map(g => `<button type="button" class="chip" data-action="scan-amount" data-g="${g}">${g} g</button>`).join('')}
      </div>
      <div class="grid2" id="scanPreview">${scanPreview(prod, amount)}</div>
      <label class="checkbox mt"><input type="checkbox" name="fav"> Als Favorit speichern</label>
      <button class="btn block">Hinzufügen</button>
    </form>`);
}

// ---------- Kalorienrechner (Mifflin-St-Jeor) ----------
const calcInput = fd => ({
  sex: fd.get('sex') === 'f' ? 'f' : 'm',
  age: num(fd.get('age')),
  height: num(fd.get('height')),
  weight: num(fd.get('weight')),
  activity: num(fd.get('activity'), 1.55),
  calGoal: fd.get('calGoal'),
});
const calcValid = o => o.age >= 14 && o.age <= 100 && o.height >= 120 && o.height <= 230 && o.weight >= 30 && o.weight <= 300;

function calcTargets(o) {
  const goal = CALORIE_GOALS.find(g => g.id === o.calGoal) || CALORIE_GOALS[2];
  const bmr = 10 * o.weight + 6.25 * o.height - 5 * o.age + (o.sex === 'f' ? -161 : 5);
  const tdee = bmr * o.activity;
  const kcal = Math.max(o.sex === 'f' ? 1200 : 1500, Math.round((tdee + goal.delta) / 10) * 10);
  const protein = Math.round(o.weight * goal.protein);
  const fat = Math.round(kcal * 0.25 / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbs, fat };
}

function calcResult(o) {
  if (!calcValid(o)) return '<p class="tip">Bitte gib gültige Werte ein (Alter 14–100, Größe 120–230 cm, Gewicht 30–300 kg).</p>';
  const r = calcTargets(o);
  return `
    <div class="grid2">
      <div class="stat"><b>${fmtNum(r.bmr)}</b><small>Grundumsatz (kcal)</small></div>
      <div class="stat"><b>${fmtNum(r.tdee)}</b><small>Gesamtumsatz (kcal)</small></div>
    </div>
    <div class="stat mt"><b style="color:var(--kcal)">${fmtNum(r.kcal)} kcal</b><small>Dein Tagesziel</small></div>
    <div class="grid3 mt">
      <div class="stat"><b style="color:var(--protein)">${r.protein} g</b><small>Protein</small></div>
      <div class="stat"><b style="color:var(--carbs)">${r.carbs} g</b><small>Kohlenhydrate</small></div>
      <div class="stat"><b style="color:var(--fat)">${r.fat} g</b><small>Fett</small></div>
    </div>`;
}

function openCalculator() {
  const s = state.settings;
  openModal('Kalorienrechner', `
    <form data-form="calc" data-live="calc">
      <div class="grid2">
        <label class="field"><span>Geschlecht</span><select name="sex">
          <option value="m" ${s.sex !== 'f' ? 'selected' : ''}>Männlich</option>
          <option value="f" ${s.sex === 'f' ? 'selected' : ''}>Weiblich</option>
        </select></label>
        <label class="field"><span>Alter</span><input type="number" name="age" inputmode="numeric" min="14" max="100" value="${s.age}" required></label>
        <label class="field"><span>Größe (cm)</span><input type="number" name="height" inputmode="numeric" min="120" max="230" value="${s.height}" required></label>
        <label class="field"><span>Gewicht (kg)</span><input type="number" name="weight" inputmode="decimal" min="30" max="300" step="0.1" value="${s.weight}" required></label>
      </div>
      <label class="field"><span>Aktivität</span><select name="activity">${ACTIVITY_LEVELS.map(a =>
        `<option value="${a.value}" ${+a.value === +s.activity ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
      <label class="field"><span>Ziel</span><select name="calGoal">${CALORIE_GOALS.map(g =>
        `<option value="${g.id}" ${g.id === s.calGoal ? 'selected' : ''}>${g.name}</option>`).join('')}</select></label>
      <div id="calcOut">${calcResult(s)}</div>
      <p class="tip">Berechnung nach Mifflin-St-Jeor. Protein je nach Ziel 1,8–2,2 g pro kg, Fett 25 % der Kalorien, der Rest Kohlenhydrate. Das sind Richtwerte – passe sie nach 2–3 Wochen an deinen Fortschritt an.</p>
      <button class="btn block mt">Als Ziele übernehmen</button>
    </form>`);
}

function focusFoodForm() {
  const sel = $('[data-meal-select]');
  if (sel) sel.value = ui.meal;
  $('#foodCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('[data-form=food] input[name=name]')?.focus({ preventScroll: true }), 350);
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
        <li><div class="grow"><b>${esc(f.name)}</b><br><small>${fmtNum(f.kcal)} kcal · ${macroLine(f)}</small></div>
        <button class="btn icon" data-action="delete-fav" data-i="${i}">✕</button></li>`).join('')}</ul>` : ''}
      <h3 class="mt">Vorlagen</h3>
      <div class="chips mt">${FOOD_PRESETS.map((f, i) => `<button class="chip" data-action="add-fav" data-i="${i}" data-src="preset">${esc(f.name)}<small>${fmtNum(f.kcal)} kcal · ${fmt1(f.protein)} g P</small></button>`).join('')}</div>
    `);
  },
  'meal-add': d => { ui.meal = d.meal; focusFoodForm(); },
  'meal-copy': d => {
    const k = ui.nutDate;
    const items = dayFoods(addDays(k, -1)).filter(f => mealOf(f) === d.meal);
    if (!items.length) return;
    state.nutrition[k] = [...dayFoods(k), ...items.map(f => ({ ...f, id: uid(), meal: d.meal, time: '' }))];
    save(); render();
    toast(`✓ ${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'} übernommen`);
  },
  'scan-open': () => openScanner(),
  'scan-lookup': d => lookupBarcode(d.code),
  'scan-amount': d => {
    const inp = $('#modalCard input[name=amount]');
    if (!inp) return;
    inp.value = d.g;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  },
  'food-focus': () => { closeModal(); focusFoodForm(); },
  'calc-open': () => openCalculator(),
  'delete-fav': d => { state.favorites.splice(+d.i, 1); save(); closeModal(); render(); },
  'delete-food': d => {
    const k = ui.nutDate;
    state.nutrition[k] = dayFoods(k).filter(f => f.id !== d.id);
    if (!state.nutrition[k].length) delete state.nutrition[k];
    save(); render();
  },
  'quick-food': () => { ui.nutDate = today(); ui.meal = mealByTime(); go('nutrition'); setTimeout(() => $('[data-form=food] input[name=name]')?.focus(), 50); },
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

function addFood(k, f, meal = ui.meal) {
  const now = new Date();
  (state.nutrition[k] = state.nutrition[k] || []).push({
    id: uid(), name: f.name, kcal: num(f.kcal), protein: round1(f.protein), carbs: round1(f.carbs), fat: round1(f.fat),
    meal: MEALS.some(m => m.id === meal) ? meal : 'snack',
    time: k === today() ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '',
  });
  save(); render();
  toast(`✓ ${f.name} hinzugefügt`);
}

// ---------- Formulare ----------
const forms = {
  food(fd, form) {
    const f = {
      name: fd.get('name').trim(), kcal: Math.max(0, num(fd.get('kcal'))), protein: Math.max(0, round1(fd.get('protein'))),
      carbs: Math.max(0, round1(fd.get('carbs'))), fat: Math.max(0, round1(fd.get('fat'))),
    };
    if (!f.name) return;
    ui.meal = fd.get('meal') || ui.meal;
    if (fd.get('fav') && !state.favorites.some(x => x.name === f.name)) state.favorites.push({ ...f });
    addFood(ui.nutDate, f);
  },
  scanned(fd) {
    const prod = ui.scanned;
    if (!prod) return;
    const g = num(fd.get('amount'));
    if (g <= 0) { toast('Bitte eine Menge eingeben'); return; }
    const f = portion(prod, g);
    ui.meal = fd.get('meal') || ui.meal;
    if (fd.get('fav') && !state.favorites.some(x => x.name === f.name)) state.favorites.push({ ...f });
    closeModal();
    addFood(ui.nutDate, f);
  },
  barcode(fd) { lookupBarcode(fd.get('code')); },
  calc(fd) {
    const o = calcInput(fd);
    if (!calcValid(o)) { toast('Bitte gültige Werte eingeben'); return; }
    const r = calcTargets(o);
    Object.assign(state.settings, o, { kcalGoal: r.kcal, proteinGoal: r.protein, carbsGoal: r.carbs, fatGoal: r.fat });
    save(); closeModal(); render(); toast('Ziele übernommen ✓');
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
    s.carbsGoal = Math.max(0, num(fd.get('carbsGoal'), s.carbsGoal));
    s.fatGoal = Math.max(0, num(fd.get('fatGoal'), s.fatGoal));
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
  if (t.matches('[data-meal-select]')) ui.meal = t.value;
  const live = t.closest('[data-live]');
  if (live?.dataset.live === 'calc') $('#calcOut').innerHTML = calcResult(calcInput(new FormData(live)));
  if (live?.dataset.live === 'scanned' && ui.scanned) $('#scanPreview').innerHTML = scanPreview(ui.scanned, Math.max(0, num(live.elements.amount.value)));
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
