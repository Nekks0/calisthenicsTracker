'use strict';
// Klick-Aktionen (data-action) und Formular-Handler (data-form).

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

  'sync-signup': (d, el) => submitAuth(el.closest('form'), 'signup'),
  'sync-now': () => syncNow({ manual: true }),
  'sync-logout': () => {
    if (!confirm('Abmelden? Deine Daten bleiben auf diesem Gerät und in der Cloud erhalten.')) return;
    signOut(); toast('Abgemeldet');
  },
  'sync-keep-local': () => resolveConflict(false),
  'sync-keep-remote': () => resolveConflict(true),
  'set-theme': d => { state.settings.theme = d.value; applyTheme(); save(); render(); },
  'export': () => exportBackup(),
  'backup-snooze': () => {
    state.backup.snoozeUntil = Date.now() + 3 * DAY_MS;
    save(); render(); toast('Erinnerung in 3 Tagen');
  },
  'import': () => $('#importFile').click(),
  'reset-all': () => {
    const cloud = signedIn() ? ' Auch die Daten in der Cloud werden überschrieben.' : '';
    if (!confirm(`Wirklich ALLE Daten löschen?${cloud} Das kann nicht rückgängig gemacht werden.`)) return;
    state = clone(DEFAULT_STATE); save(); applyTheme(); go('home'); toast('Alle Daten gelöscht');
  },
};

// ---------- Formulare ----------
const forms = {
  'sync-auth'(fd, form) { submitAuth(form, 'signin'); },
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
