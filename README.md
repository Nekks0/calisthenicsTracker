# CaliTrack – Calisthenics Tracker

Eine Web-App für Calisthenics-Training, Ernährung und Alltagsbewegung. Läuft komplett im Browser, ohne Konto und ohne Installation. Alle Daten bleiben lokal auf deinem Gerät.

## Starten

**Am PC:** Doppelklick auf `index.html` genügt.

**Mit Server (empfohlen, nötig für Offline-Modus und App-Installation):**

```bash
node server.js
```

Dann <http://localhost:8080> öffnen. Der Server zeigt auch eine Adresse wie `http://192.168.x.x:8080` an, die du auf dem Handy im selben WLAN öffnen kannst.

**Als App aufs Handy:** Seite öffnen, dann „Zum Startbildschirm hinzufügen“ (iPhone: Teilen-Menü, Android: Menü ⋮).

## Bereiche

| Bereich | Inhalt |
|---|---|
| **Heute** | Tages-Streak mit Wochenübersicht, nächstes Training aus deinem aktiven Plan, Ringe für Kalorien, Protein und Schritte, Schnellzugriff auf Mahlzeit und Wasser |
| **Pläne** | 5 fertige Calisthenics-Pläne (Anfänger bis Profi), eigene Pläne erstellen oder Vorlagen kopieren, freies Training |
| **Training** | Sätze abhaken, Wiederholungen anpassen, automatischer Pausentimer mit Ton und Vibration, Trainingsdauer, Übungen spontan hinzufügen |
| **Ernährung** | Kalorien und Protein pro Tag, Favoriten und Vorlagen, Wassertracker, 7-Tage-Diagramme, frühere Tage nachtragen |
| **Schritte** | Live-Schrittzähler über den Bewegungssensor, manuelles Eintragen, Distanz und Kalorien, 7-Tage-Diagramm |
| **Profil** | Statistiken, 14 Erfolge, Trainingsverlauf, Ziele einstellen, Backup exportieren und importieren |

## Wie die Streak funktioniert

Ein Tag zählt, wenn du **trainiert**, dein **Schrittziel erreicht** oder einen **Ruhetag** eingetragen hast. Solange der heutige Tag noch läuft, bricht die Streak nicht ab.

## Hinweise zum Schrittzähler

- Die Live-Zählung nutzt den Beschleunigungssensor und funktioniert nur, **solange die App geöffnet ist**. Für ganztägiges Zählen trägst du die Schritte aus deiner Uhr oder Health-App ein.
- Browser erlauben den Sensor nur über **HTTPS oder localhost**. Über die WLAN-Adresse (`http://192.168…`) geht die Live-Zählung deshalb nicht. Für vollen Funktionsumfang auf dem Handy die App kostenlos per HTTPS hosten, z. B. mit GitHub Pages oder Netlify (einfach den Ordner hochladen).

## Daten

Alles liegt im `localStorage` des Browsers. Wenn du Browserdaten löschst, sind auch die Trainingsdaten weg. Nutze im Profil regelmäßig **Exportieren** für ein Backup.
