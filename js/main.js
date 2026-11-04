'use strict';
// Event-Verdrahtung und App-Start. Wird als letztes geladen.

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
  const t = e.target;
  // Selects lösen in manchen Browsern nur "change" aus
  if (t.tagName === 'SELECT') t.dispatchEvent(new Event('input', { bubbles: true }));
  if (t.dataset.pref) setPref(t.dataset.pref, t.type === 'checkbox' ? t.checked : t.value);
});

$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.settings || !Array.isArray(data.workouts)) throw new Error('Ungültig');
    if (!confirm('Backup importieren? Deine aktuellen Daten werden ersetzt.')) return;
    state = hydrate(data);
    save(); go('home'); toast('Backup importiert ✓');
  } catch (err) { toast('⚠️ Datei konnte nicht gelesen werden'); }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

// Live-Updates: Trainingsdauer, Pausentimer, Erinnerungen, Tageswechsel
let lastDay = today();
let lastReminderCheck = 0;
setInterval(() => {
  const aw = state.activeWorkout;
  if (aw) $$('[data-live-duration]').forEach(el => (el.textContent = fmtDur((Date.now() - aw.start) / 1000)));
  tickRest();
  if (Date.now() - lastReminderCheck > 30000) { lastReminderCheck = Date.now(); checkReminders(); }
  if (today() !== lastDay) {
    if (ui.nutDate === lastDay) ui.nutDate = today();
    lastDay = today();
    if ($('#modal').hidden && !document.activeElement?.matches('input,textarea,select')) render();
  }
}, 250);

// App geht in den Hintergrund: sofort speichern und hochladen. Kommt zurück: Änderungen anderer Geräte holen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    writeState();
    if (signedIn() && localChanged()) syncNow();
  } else if (signedIn() && Date.now() - syncMeta.at > 30000) {
    syncNow();
  }
});
window.addEventListener('online', () => { if (signedIn()) syncNow(); });

// Offline-Unterstützung
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

navigator.storage?.persisted?.().then(p => { storageInfo.persisted = p; if (p && ui.tab === 'profile') render(); }).catch(() => { });

// Start: laufendes Training direkt fortsetzen
applyTheme();
if (state.activeWorkout) ui.tab = 'workout';
render();
if (signedIn()) syncNow();
