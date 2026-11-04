'use strict';
// Wiederverwendbare UI-Bausteine, Rendern, Modal und Toast.

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
