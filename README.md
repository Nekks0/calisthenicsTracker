# CalixTrack – Calisthenics Tracker

Eine Web-App für Calisthenics-Training, Ernährung und Alltagsbewegung. Läuft komplett im Browser, ohne Installation. Die Daten liegen lokal auf deinem Gerät, optional zusätzlich in deiner eigenen Supabase-Cloud.

## Starten

**Online (empfohlen):** <https://nekks0.github.io/calisthenicsTracker/> – sobald GitHub Pages aktiviert ist (siehe [Veröffentlichen](#veröffentlichen-mit-github-pages)). Nur über HTTPS funktionieren Kamera-Scanner, Live-Schrittzähler, Benachrichtigungen und die Installation als App.

**Am PC:** Doppelklick auf `index.html` genügt (ohne Offline-Modus und Kamera).

**Lokaler Server:**

```bash
node server.js
```

Dann <http://localhost:8080> öffnen. Der Server zeigt auch eine Adresse wie `http://192.168.x.x:8080` fürs Handy im selben WLAN an – dort gehen Kamera und Sensoren aber nicht, weil die Adresse kein HTTPS ist.

**Als App aufs Handy:** Seite öffnen, dann „Zum Startbildschirm hinzufügen“ (iPhone: Teilen-Menü, Android: Menü ⋮).

## Bereiche

| Bereich | Inhalt |
|---|---|
| **Heute** | Tages-Streak mit Wochenübersicht, nächstes Training aus deinem aktiven Plan, Ringe für Kalorien, Protein und Schritte, Backup-Erinnerung |
| **Pläne** | 5 fertige Calisthenics-Pläne (Anfänger bis Profi), eigene Pläne erstellen oder Vorlagen kopieren, freies Training |
| **Training** | Sätze abhaken, Wiederholungen anpassen, automatischer Pausentimer mit Ton und Vibration, Trainingsdauer, Übungen spontan hinzufügen |
| **Ernährung** | Kalorien, Protein, Kohlenhydrate und Fett · Mahlzeiten (Frühstück, Mittag, Abend, Snacks) mit „Wie gestern“ · Barcode-Scanner mit Open Food Facts · Kalorienrechner · Favoriten, Wassertracker, 7-Tage-Diagramme |
| **Schritte** | Live-Schrittzähler über den Bewegungssensor, manuelles Eintragen, Distanz und Kalorien, 7-Tage-Diagramm |
| **Profil** | Statistiken, 14 Erfolge, Trainingsverlauf, Ziele, Hell/Dunkel-Modus, Erinnerungen, Cloud-Sync, Backup |

## Wie die Streak funktioniert

Ein Tag zählt, wenn du **trainiert**, dein **Schrittziel erreicht** oder einen **Ruhetag** eingetragen hast. Solange der heutige Tag noch läuft, bricht die Streak nicht ab.

## Daten & Sicherheit

- **Lokal:** Alles liegt im `localStorage` des Browsers. Die App bittet den Browser, die Daten dauerhaft zu speichern (nicht bei Speicherplatzmangel löschen).
- **Backup:** Profil → *Exportieren* erzeugt eine JSON-Datei (auf dem Handy über das Teilen-Menü, z. B. direkt in Drive oder iCloud). Liegt das letzte Backup 7 Tage zurück, erinnert die Karte auf „Heute“ daran.
- **Cloud-Sync (optional):** gleicht deine Daten automatisch über alle Geräte ab, siehe unten. Ein aktiver Sync zählt als Backup.

## Cloud-Sync einrichten (Supabase, kostenlos)

1. Auf <https://supabase.com> ein Konto und ein neues Projekt anlegen.
2. Im Projekt **SQL Editor → New query** öffnen, den Inhalt von [`supabase-setup.sql`](supabase-setup.sql) einfügen und **Run** klicken. Das legt die Tabelle mit Zugriffsregeln (Row Level Security) an: Jeder Nutzer sieht nur seine eigenen Daten.
3. Unter **Project Settings → API** (bzw. *API Keys*) die **Project URL** und den **publishable**- oder **anon**-Key kopieren und in [`js/config.js`](js/config.js) eintragen. Dieser Key darf öffentlich im Repo stehen – geschützt wird über die Regeln aus Schritt 2. Den `service_role`/`secret`-Key **niemals** eintragen.
4. Optional unter **Authentication → Sign In / Providers → Email** die Option *Confirm email* ausschalten, dann entfällt die Bestätigungs-Mail bei der Registrierung. Lässt du sie an: Unter **Authentication → URL Configuration** die *Site URL* auf die Adresse der App setzen, damit der Bestätigungslink dorthin führt.
5. In der App: Profil → *Cloud-Sync* → registrieren bzw. anmelden. Auf weiteren Geräten mit demselben Konto anmelden.

**So funktioniert der Abgleich:** Änderungen werden wenige Sekunden später hochgeladen; beim Öffnen der App werden Änderungen anderer Geräte geholt. Wurde auf zwei Geräten gleichzeitig offline etwas geändert, fragt die App, welche Version gelten soll.

## Erinnerungen

Profil → *Darstellung & Erinnerungen*: Streak-Erinnerung zur gewünschten Uhrzeit (nur wenn an dem Tag noch nichts eingetragen ist) und Wasser-Erinnerung alle 2 Stunden. Ohne eigenen Push-Server kommen sie, solange die App geöffnet ist oder im Hintergrund läuft. Auf dem iPhone muss die App dafür zum Home-Bildschirm hinzugefügt sein.

## Hinweise

- **Schrittzähler:** Die Live-Zählung nutzt den Beschleunigungssensor und funktioniert nur, solange die App geöffnet ist. Für ganztägiges Zählen trägst du die Schritte aus deiner Uhr oder Health-App ein.
- **Barcode-Scanner:** Chrome auf Android hat einen eingebauten Barcode-Leser. Auf iPhone und in Firefox wird beim ersten Scan einmalig eine Bibliothek aus dem Internet geladen. Gescannte Produkte werden gespeichert und funktionieren danach auch offline.

## Veröffentlichen mit GitHub Pages

1. Das Repo muss **öffentlich** sein (kostenloses Konto): GitHub → Repo → **Settings → General → Danger Zone → Change visibility → Public**.
2. **Settings → Pages → Build and deployment:** Source *Deploy from a branch*, Branch `main`, Ordner `/ (root)` → **Save**.
3. Nach 1–2 Minuten ist die App unter `https://nekks0.github.io/calisthenicsTracker/` erreichbar. Jedes `git push` aktualisiert sie automatisch; die installierte App holt sich die neue Version beim nächsten Öffnen.

## Projektstruktur

```
index.html            Grundgerüst, lädt die Skripte in fester Reihenfolge
styles.css            Design inkl. Hell/Dunkel-Modus (CSS-Variablen)
data.js               Trainingspläne, Lebensmittel-Vorlagen, Erfolge, Mahlzeiten
js/core.js            Hilfsfunktionen, Zustand (localStorage), Berechnungen – zuerst geladen
js/ui.js              UI-Bausteine, Rendern, Modal, Toast
js/views.js           Ansichten der Tabs
js/training.js        Training, Pausentimer, Plan-Editor
js/steps.js           Schrittzähler
js/nutrition.js       Ernährung, Barcode-Scanner, Kalorienrechner
js/backup.js          Export, Backup-Erinnerung
js/prefs.js           Hell/Dunkel-Modus, Erinnerungen
js/config.js          Supabase-Zugang (optional)
js/sync.js            Cloud-Sync
js/actions.js         Klick-Aktionen und Formulare
js/main.js            Events und App-Start – zuletzt geladen
sw.js                 Service Worker (Offline-Modus, Benachrichtigungs-Klicks)
server.js             Kleiner lokaler Webserver
supabase-setup.sql    Datenbank-Einrichtung für den Cloud-Sync
```

Neue Skripte müssen in `index.html` **und** in der Liste in `sw.js` eingetragen werden (dort auch `CACHE` hochzählen, damit Nutzer die neue Version bekommen).
