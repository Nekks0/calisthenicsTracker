'use strict';
// Schrittzähler über den Bewegungssensor.

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
