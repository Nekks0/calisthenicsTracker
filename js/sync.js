'use strict';
// Cloud-Sync über Supabase (Auth- und REST-API direkt per fetch, ohne zusätzliche Bibliothek).
// Ablauf: Jedes Gerät merkt sich, welchen Cloud-Stand es zuletzt kannte. Hat sich nur eine Seite
// geändert, wird automatisch hoch- bzw. heruntergeladen. Haben sich beide geändert, entscheidet der Nutzer.

// ---------- Cloud-Sync ----------
const AUTH_KEY = 'calitrack-auth';  // Anmelde-Tokens bewusst getrennt vom Zustand (landen nicht im Backup)
const SYNC_KEY = 'calitrack-sync';
const SYNC_TABLE = 'calitrack_data';
const SYNC_DELAY = 4000;
const EMPTY_SYNC = { remote: '', local: 0, at: 0 };
const sync = { busy: false, timer: null, error: '', pending: null, authBusy: false };

const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const writeJSON = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

let auth = readJSON(AUTH_KEY, null);                       // { access_token, refresh_token, expires_at, user: { id, email } }
let syncMeta = { ...EMPTY_SYNC, ...readJSON(SYNC_KEY, {}) }; // remote: zuletzt bekannter Cloud-Stand, local: lokaler Stand dabei

const syncConfigured = () => typeof SUPABASE_URL === 'string' && !!SUPABASE_URL && typeof SUPABASE_KEY === 'string' && !!SUPABASE_KEY;
const signedIn = () => syncConfigured() && !!auth?.refresh_token && !!auth?.user?.id;
const saveSyncMeta = () => writeJSON(SYNC_KEY, syncMeta);

function authErrorText(d, status) {
  const code = d?.error_code || d?.error;
  const known = {
    invalid_credentials: 'E-Mail oder Passwort ist falsch.',
    invalid_grant: 'E-Mail oder Passwort ist falsch.',
    email_not_confirmed: 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Mail).',
    user_already_exists: 'Dieses Konto gibt es schon – melde dich an.',
    weak_password: 'Das Passwort ist zu schwach (mindestens 6 Zeichen).',
    over_email_send_rate_limit: 'Zu viele E-Mails verschickt – versuch es später noch einmal.',
    over_request_rate_limit: 'Zu viele Anfragen – versuch es gleich noch einmal.',
    validation_failed: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    signup_disabled: 'Registrierung ist in Supabase deaktiviert.',
  };
  if (status === 404 && d?.code === '42P01') return 'Tabelle fehlt – bitte supabase-setup.sql ausführen (siehe README).';
  return known[code] || d?.msg || d?.error_description || d?.message || `Serverfehler (${status})`;
}

async function sbFetch(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(SUPABASE_URL.replace(/\/+$/, '') + path, {
      method,
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body == null ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw Object.assign(new Error('Keine Verbindung zum Server.'), { network: true });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { }
  if (!res.ok) throw Object.assign(new Error(authErrorText(data, res.status)), { status: res.status });
  return data;
}

// ---------- Anmeldung ----------
function setSession(s) {
  auth = s ? {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
    user: s.user ? { id: s.user.id, email: s.user.email } : auth?.user,
  } : null;
  writeJSON(AUTH_KEY, auth);
}

async function accessToken() {
  if (!auth) throw new Error('Nicht angemeldet.');
  if (auth.expires_at - 60 > Date.now() / 1000) return auth.access_token;
  try {
    setSession(await sbFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } }));
  } catch (e) {
    if (e.status === 400 || e.status === 401 || e.status === 403) {
      signOutLocal();
      throw new Error('Cloud-Sitzung abgelaufen – bitte neu anmelden.');
    }
    throw e;
  }
  return auth.access_token;
}

function startFresh() {
  syncMeta = { ...EMPTY_SYNC };
  saveSyncMeta();
}

async function signIn(email, password) {
  setSession(await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
  startFresh();
  render();
  await syncNow({ manual: true });
}

// true = sofort angemeldet, false = Bestätigungs-Mail wurde verschickt
async function signUp(email, password) {
  const r = await sbFetch('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!r?.access_token) return false;
  setSession(r);
  startFresh();
  render();
  await syncNow({ manual: true });
  return true;
}

function signOutLocal() {
  setSession(null);
  startFresh();
  clearTimeout(sync.timer);
  sync.error = '';
  render();
}

function signOut() {
  const token = auth?.access_token;
  signOutLocal();
  if (token) sbFetch('/auth/v1/logout', { method: 'POST', token }).catch(() => { });
}

// ---------- Abgleich ----------
function scheduleSync() {
  if (!signedIn()) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(() => syncNow(), SYNC_DELAY);
}

const localChanged = () => state.meta.updatedAt > syncMeta.local;

async function pushState(token) {
  const localAt = state.meta.updatedAt;
  const rows = await sbFetch(`/rest/v1/${SYNC_TABLE}?on_conflict=user_id&select=updated_at`, {
    method: 'POST', token,
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: { user_id: auth.user.id, data: state, updated_at: new Date().toISOString() },
  });
  syncMeta.remote = rows?.[0]?.updated_at || '';
  syncMeta.local = localAt; // Änderungen während des Uploads gelten weiter als neu
}

function pullState(remote) {
  state = hydrate(remote.data);
  writeState();
  syncMeta.remote = remote.updated_at;
  syncMeta.local = state.meta.updatedAt;
  applyTheme();
  render();
}

async function syncNow({ manual = false } = {}) {
  if (!signedIn() || sync.busy) return;
  clearTimeout(sync.timer);
  sync.busy = true;
  updateSyncStatus();
  try {
    const token = await accessToken();
    const rows = await sbFetch(`/rest/v1/${SYNC_TABLE}?select=data,updated_at`, { token });
    const remote = rows?.[0] && rows[0].data && typeof rows[0].data === 'object' ? rows[0] : null;
    const remoteChanged = !!remote && remote.updated_at !== syncMeta.remote;
    const identical = !!remote && remote.data.meta?.updatedAt > 0 && remote.data.meta.updatedAt === state.meta.updatedAt;
    if (identical) {
      // z. B. nach erneuter Anmeldung auf demselben Gerät: nichts zu übertragen
      syncMeta.remote = remote.updated_at;
      syncMeta.local = state.meta.updatedAt;
    } else if (!remote || (!remoteChanged && localChanged())) {
      await pushState(token);
    } else if (remoteChanged && !localChanged()) {
      pullState(remote);
      if (manual) toast('☁️ Daten aus der Cloud geladen');
    } else if (remoteChanged) {
      askConflict(remote);
      return;
    }
    syncMeta.at = Date.now();
    saveSyncMeta();
    sync.error = '';
    if (manual) toast('☁️ Synchronisiert');
  } catch (e) {
    sync.error = e.message;
    if (manual) toast('⚠️ ' + e.message);
  } finally {
    sync.busy = false;
    updateSyncStatus();
    // Während des Abgleichs Geändertes nachschieben (nicht bei Fehlern oder offener Rückfrage)
    if (signedIn() && localChanged() && !sync.error && !sync.pending) scheduleSync();
  }
}

function dataSummary(d) {
  const w = d?.workouts?.length || 0, n = Object.keys(d?.nutrition || {}).length;
  const changed = d?.meta?.updatedAt ? new Date(d.meta.updatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
  return `${w} ${w === 1 ? 'Training' : 'Trainings'}<br>${n} Ernährungstage<br>geändert ${changed}`;
}

function askConflict(remote) {
  sync.pending = remote;
  openModal('Daten abgleichen', `
    <p class="muted" style="margin-top:0">Auf diesem Gerät und in der Cloud gibt es unterschiedliche Daten. Welche Version soll gelten?</p>
    <div class="grid2">
      <div class="stat"><b>📱 Dieses Gerät</b><small>${dataSummary(state)}</small></div>
      <div class="stat"><b>☁️ Cloud</b><small>${dataSummary(remote.data)}</small></div>
    </div>
    <p class="tip">Die andere Version wird überschrieben. Wenn du unsicher bist: vorher im Profil ein Backup exportieren.</p>
    <div class="row mt">
      <button class="btn ghost grow" data-action="sync-keep-local">📱 Gerät behalten</button>
      <button class="btn grow" data-action="sync-keep-remote">☁️ Cloud laden</button>
    </div>`);
}

async function resolveConflict(useRemote) {
  const remote = sync.pending;
  sync.pending = null;
  closeModal();
  if (!remote || sync.busy) return;
  if (useRemote) {
    pullState(remote);
    syncMeta.at = Date.now();
    saveSyncMeta();
    toast('☁️ Daten aus der Cloud geladen');
    return;
  }
  sync.busy = true;
  updateSyncStatus();
  try {
    await pushState(await accessToken());
    syncMeta.at = Date.now();
    saveSyncMeta();
    sync.error = '';
    toast('☁️ Daten dieses Geräts hochgeladen');
  } catch (e) {
    sync.error = e.message;
    toast('⚠️ ' + e.message);
  } finally {
    sync.busy = false;
    updateSyncStatus();
  }
}

// ---------- Anzeige ----------
function syncStatusText() {
  if (sync.busy) return '🔄 Synchronisiere …';
  if (sync.error) return '⚠️ ' + esc(sync.error);
  if (!syncMeta.at) return 'Noch nicht synchronisiert';
  const d = new Date(syncMeta.at);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `✓ Zuletzt synchronisiert: ${dateKey(d) === today() ? 'heute' : fmtDate(dateKey(d))}, ${time}`;
}

function updateSyncStatus() {
  $$('[data-sync-status]').forEach(el => (el.innerHTML = syncStatusText()));
}

function syncCard() {
  if (!syncConfigured()) {
    return `<div class="card">
      <h3 style="margin-bottom:6px">☁️ Cloud-Sync</h3>
      <p class="tip" style="margin-top:0">Noch nicht eingerichtet. Wie das geht, steht in der README im Abschnitt „Cloud-Sync“.</p>
    </div>`;
  }
  if (!signedIn()) {
    return `<div class="card">
      <h3 style="margin-bottom:6px">☁️ Cloud-Sync</h3>
      <p class="tip" style="margin-top:0">Melde dich an, um deine Daten automatisch in der Cloud zu sichern und auf mehreren Geräten zu nutzen.</p>
      <form data-form="sync-auth" class="mt">
        <label class="field"><span>E-Mail</span><input type="email" name="email" autocomplete="email" required></label>
        <label class="field"><span>Passwort (mind. 6 Zeichen)</span><input type="password" name="password" autocomplete="current-password" minlength="6" required></label>
        <div class="row">
          <button type="button" class="btn ghost grow" data-action="sync-signup">Registrieren</button>
          <button class="btn grow">Anmelden</button>
        </div>
      </form>
    </div>`;
  }
  return `<div class="card">
    <h3 style="margin-bottom:6px">☁️ Cloud-Sync</h3>
    <p class="tip" style="margin-top:0">Angemeldet als <b>${esc(auth.user.email || '')}</b><br><span data-sync-status>${syncStatusText()}</span></p>
    <p class="tip">Änderungen werden automatisch nach wenigen Sekunden hochgeladen und beim Öffnen der App abgeglichen.</p>
    <div class="row mt">
      <button class="btn ghost" data-action="sync-logout">Abmelden</button>
      <button class="btn grow" data-action="sync-now">🔄 Jetzt synchronisieren</button>
    </div>
  </div>`;
}

async function submitAuth(form, mode) {
  if (sync.authBusy) return;
  if (!form.reportValidity()) return;
  const email = form.elements.email.value.trim(), password = form.elements.password.value;
  sync.authBusy = true;
  $$('button', form).forEach(b => (b.disabled = true));
  try {
    if (mode === 'signup') {
      const direct = await signUp(email, password);
      if (!direct) {
        toast('📧 Fast fertig: Bestätige deine E-Mail und melde dich dann an.');
        $$('button', form).forEach(b => (b.disabled = false));
      }
    } else {
      await signIn(email, password);
    }
  } catch (e) {
    toast('⚠️ ' + e.message);
    $$('button', form).forEach(b => (b.disabled = false));
  } finally {
    sync.authBusy = false;
  }
}
