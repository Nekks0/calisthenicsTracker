'use strict';
// Hilfsfunktionen, Zustand (localStorage) und Berechnungen. Wird als erstes geladen.

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
    theme: 'system', notifyStreak: false, notifyTime: '18:00', notifyWater: false,
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
  backup: { last: 0, snoozeUntil: 0 },
  notified: { streak: '', water: '' },
  meta: { updatedAt: 0 },
};

let state = load();
const ui = { tab: 'home', planId: null, nutDate: today(), editing: null, meal: mealByTime(), scanned: null };

// Ergänzt fehlende Felder aus älteren Versionen bzw. Backups
function hydrate(raw) {
  return {
    ...clone(DEFAULT_STATE), ...raw,
    settings: { ...DEFAULT_STATE.settings, ...(raw.settings || {}) },
    backup: { ...DEFAULT_STATE.backup, ...(raw.backup || {}) },
    notified: { ...DEFAULT_STATE.notified, ...(raw.notified || {}) },
    meta: { ...DEFAULT_STATE.meta, ...(raw.meta || {}) },
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && typeof raw === 'object') return hydrate(raw);
  } catch (e) { console.warn('Laden fehlgeschlagen', e); }
  return clone(DEFAULT_STATE);
}
// Für echte Änderungen durch den Nutzer: Zeitstempel setzen und Cloud-Sync anstoßen
function save(now = true) {
  state.meta.updatedAt = Date.now();
  writeState(now);
  scheduleSync();
}

// Nur auf die Festplatte schreiben (z. B. nach einem Download aus der Cloud), ohne als Änderung zu zählen
let saveTimer = null;
function writeState(now = true) {
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
