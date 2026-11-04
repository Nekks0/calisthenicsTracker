'use strict';
// Die Ansichten der einzelnen Tabs.

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

      ${backupCard()}
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

      <div class="section-head"><h2>Darstellung & Erinnerungen</h2></div>
      ${prefsCard()}

      <div class="section-head"><h2>Daten & Sync</h2></div>
      ${syncCard()}

      <div class="card">
        <h3 style="margin-bottom:6px">Daten</h3>
        <p class="tip" style="margin-top:0">Deine Daten liegen nur in diesem Browser. Exportiere sie regelmäßig als Backup oder um sie auf ein anderes Gerät zu übertragen.</p>
        <p class="tip">Letztes Backup: <b>${backupAgeText()}</b>${storageInfo.persisted ? ' · 🔒 Speicher vom Browser geschützt' : ''}</p>
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
