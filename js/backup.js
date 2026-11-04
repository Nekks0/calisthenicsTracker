'use strict';
// Backup: Datei-Export, Erinnerung auf „Heute“ und dauerhafter Browser-Speicher.

// ---------- Backup ----------
const BACKUP_INTERVAL_DAYS = 7;
const DAY_MS = 86400000;
const storageInfo = { persisted: false };

function oldestDataKey() {
  const keys = [...state.workouts.map(w => w.date), ...Object.keys(state.nutrition), ...Object.keys(state.steps)];
  return keys.length ? keys.sort()[0] : null;
}

// Fällig, wenn das letzte Backup (bzw. der erste Eintrag) 7+ Tage her ist und nicht pausiert wurde
function backupDue() {
  const b = state.backup;
  if (Date.now() < b.snoozeUntil) return false;
  // Ein frischer Cloud-Sync zählt als Backup
  if (signedIn() && syncMeta.at && Date.now() - syncMeta.at < BACKUP_INTERVAL_DAYS * DAY_MS) return false;
  const oldest = oldestDataKey();
  const since = b.last || (oldest ? parseKey(oldest).getTime() : 0);
  return since > 0 && Date.now() - since >= BACKUP_INTERVAL_DAYS * DAY_MS;
}

function backupAgeText() {
  const last = state.backup.last;
  if (!last) return 'noch nie';
  const days = Math.round((parseKey(today()) - parseKey(dateKey(new Date(last)))) / DAY_MS);
  return days <= 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`;
}

function backupCard() {
  if (!backupDue()) return '';
  return `<div class="card warn">
    <div class="row">
      <span style="font-size:1.6rem">💾</span>
      <div class="grow"><b>Zeit für ein Backup</b><br>
        <small>Letztes Backup: ${backupAgeText()}. Deine Daten liegen nur auf diesem Gerät – wenn Browserdaten gelöscht werden, sind sie weg.</small></div>
    </div>
    <div class="row mt">
      <button class="btn sm ghost" data-action="backup-snooze">Später</button>
      <button class="btn sm grow" data-action="export">💾 Jetzt sichern</button>
    </div>
  </div>`;
}

function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Bittet den Browser, die Daten nicht bei Speicherplatzmangel zu löschen
function requestPersist() {
  if (!navigator.storage?.persist) return;
  navigator.storage.persist().then(ok => { storageInfo.persisted = ok; }).catch(() => { });
}

async function exportBackup() {
  const file = new File([JSON.stringify(state, null, 2)], `calitrack-backup-${today()}.json`, { type: 'application/json' });
  requestPersist();
  // Auf dem Handy das Teilen-Menü (Drive, iCloud, Mail …), am PC ein normaler Download
  if (matchMedia('(pointer:coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'CalixTrack Backup' }); }
    catch (e) {
      if (e.name === 'AbortError') return;
      downloadFile(file);
    }
  } else {
    downloadFile(file);
  }
  state.backup.last = Date.now();
  state.backup.snoozeUntil = 0;
  save(); render();
  toast('💾 Backup erstellt');
}
