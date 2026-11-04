'use strict';
// Darstellung (Hell/Dunkel) und Erinnerungen per Benachrichtigung.

// ---------- Design ----------
const THEME_KEY = 'calitrack-theme'; // Kopie für das Inline-Skript im <head> (verhindert Aufblitzen)
const THEMES = [{ id: 'system', name: 'System' }, { id: 'light', name: '☀️ Hell' }, { id: 'dark', name: '🌙 Dunkel' }];

function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
  $('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);

// ---------- Erinnerungen ----------
// Ohne eigenen Push-Server prüft die App selbst – das klappt nur, solange sie geöffnet ist oder im Hintergrund läuft.
const WATER_HOURS = [10, 12, 14, 16, 18, 20];
const notifySupported = () => 'Notification' in window;
const notifyBlocked = () => notifySupported() && Notification.permission === 'denied';

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
const waterSlot = (d = new Date()) => [...WATER_HOURS].reverse().find(h => d.getHours() >= h) ?? null;

async function notify(title, body) {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  const opts = { body, icon: 'icons/icon.svg', badge: 'icons/icon.svg', tag: title };
  // Android erlaubt Benachrichtigungen nur über den Service Worker
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch (e) { }
  try { new Notification(title, opts); } catch (e) { }
}

// Bereits verstrichene Termine als erledigt markieren, damit nach dem Einschalten nicht sofort alles feuert
function markRemindersDone() {
  const t = today(), n = state.notified;
  const due = minutesOf(state.settings.notifyTime);
  if (due != null && nowMinutes() >= due) n.streak = t;
  const slot = waterSlot();
  if (slot != null) n.water = `${t}-${slot}`;
}

function checkReminders() {
  const s = state.settings, n = state.notified, t = today();
  if (s.notifyStreak && n.streak !== t) {
    const due = minutesOf(s.notifyTime);
    if (due != null && nowMinutes() >= due) {
      n.streak = t;
      writeState(); // nur gerätebezogen, zählt nicht als Änderung für den Sync
      if (!isActive(t)) notify('🔥 Deine Streak wartet', `Trainiere heute, schaffe ${fmtNum(s.stepGoal)} Schritte oder trag einen Ruhetag ein.`);
    }
  }
  if (s.notifyWater) {
    const slot = waterSlot();
    const key = slot != null ? `${t}-${slot}` : null;
    if (key && n.water !== key) {
      n.water = key;
      writeState();
      const glasses = state.water[t] || 0;
      if (glasses < s.waterGoal) notify('💧 Zeit für ein Glas Wasser', `${glasses} von ${s.waterGoal} Gläsern geschafft.`);
    }
  }
}

async function setPref(name, value) {
  const s = state.settings;
  if (name === 'notifyTime' && minutesOf(value) == null) { render(); return; }
  if ((name === 'notifyStreak' || name === 'notifyWater') && value) {
    if (!notifySupported()) { toast('Dieser Browser unterstützt keine Benachrichtigungen.'); render(); return; }
    if (Notification.permission !== 'granted') {
      let p = 'denied';
      try { p = await Notification.requestPermission(); } catch (e) { }
      if (p !== 'granted') { toast('Benachrichtigungen wurden nicht erlaubt.'); render(); return; }
    }
  }
  s[name] = value;
  markRemindersDone();
  save(); render();
  if (value === true) notify('CalixTrack', 'Erinnerungen sind aktiv ✓');
}

function prefsCard() {
  const s = state.settings;
  const anyOn = s.notifyStreak || s.notifyWater;
  return `
    <div class="card">
      <small>DESIGN</small>
      <div class="segmented" style="margin:8px 0 18px">${THEMES.map(t =>
        `<button class="${s.theme === t.id ? 'active' : ''}" data-action="set-theme" data-value="${t.id}">${t.name}</button>`).join('')}</div>
      <small>ERINNERUNGEN</small>
      ${notifySupported() ? `
        <div class="pref-row mt">
          <label class="checkbox"><input type="checkbox" data-pref="notifyStreak" ${s.notifyStreak ? 'checked' : ''}> 🔥 Streak-Erinnerung um</label>
          <input type="time" data-pref="notifyTime" value="${esc(s.notifyTime)}" aria-label="Uhrzeit der Streak-Erinnerung">
        </div>
        <label class="checkbox"><input type="checkbox" data-pref="notifyWater" ${s.notifyWater ? 'checked' : ''}> 💧 Wasser-Erinnerung (10–20 Uhr, alle 2 Std.)</label>
        ${anyOn && notifyBlocked() ? '<p class="tip" style="color:var(--danger)">⚠️ Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen.</p>' : ''}
        <p class="tip">Erinnerungen kommen, solange die App geöffnet ist oder im Hintergrund läuft. Die Streak-Erinnerung kommt nur, wenn du an dem Tag noch nichts eingetragen hast.</p>`
      : '<p class="tip">Dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone geht das nur, wenn die App zum Home-Bildschirm hinzugefügt ist.</p>'}
    </div>`;
}
