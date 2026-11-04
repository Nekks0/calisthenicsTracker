'use strict';
// Laufendes Training, Pausentimer und Plan-Editor.

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
