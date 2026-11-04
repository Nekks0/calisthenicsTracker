'use strict';
// Vorinstallierte Trainingspläne, Lebensmittel-Vorlagen und Erfolge.

function ex(name, sets, reps, unit = 'Wdh', rest = 90, tip = '') {
  return { name, sets, reps, unit, rest, tip };
}

const LEVELS = { 1: 'Anfänger', 2: 'Fortgeschritten', 3: 'Profi' };

const BUILTIN_PLANS = [
  {
    id: 'b-beginner',
    builtin: true,
    name: 'Ganzkörper Grundlagen',
    level: 1,
    perWeek: 3,
    description: 'Der perfekte Einstieg: 2 Ganzkörper-Einheiten im Wechsel, 3× pro Woche. Baut Grundkraft für Liegestütze, Klimmzüge und Dips auf.',
    days: [
      { name: 'Tag A', exercises: [
        ex('Liegestütze (ggf. auf Knien)', 3, 8, 'Wdh', 90, 'Körper bildet eine Linie, Ellbogen ca. 45° zum Körper.'),
        ex('Australian Pull-ups', 3, 8, 'Wdh', 90, 'Unter einer Tischkante oder niedrigen Stange, Brust zur Stange ziehen.'),
        ex('Kniebeugen', 3, 15, 'Wdh', 60, 'Fersen am Boden, Hüfte unter Kniehöhe.'),
        ex('Glute Bridge', 3, 12, 'Wdh', 60, 'Oben 1 Sekunde den Po anspannen.'),
        ex('Plank', 3, 30, 'Sek', 60, 'Bauch und Po fest, kein Hohlkreuz.'),
      ]},
      { name: 'Tag B', exercises: [
        ex('Bank-Dips', 3, 10, 'Wdh', 90, 'Schultern weg von den Ohren, Ellbogen nach hinten.'),
        ex('Negative Klimmzüge', 3, 4, 'Wdh', 120, 'Hochspringen, dann 3–5 Sekunden kontrolliert ablassen.'),
        ex('Ausfallschritte', 3, 10, 'Wdh', 60, 'Pro Bein. Hinteres Knie fast bis zum Boden.'),
        ex('Hollow Hold', 3, 20, 'Sek', 60, 'Lendenwirbel in den Boden drücken.'),
        ex('Superman', 3, 12, 'Wdh', 60, 'Arme und Beine gleichzeitig anheben.'),
      ]},
    ],
  },
  {
    id: 'b-ppl',
    builtin: true,
    name: 'Push · Pull · Legs',
    level: 2,
    perWeek: 6,
    description: 'Klassischer Split für Fortgeschrittene. Jede Muskelgruppe 2× pro Woche, ideal für Muskelaufbau mit dem eigenen Körpergewicht.',
    days: [
      { name: 'Push', exercises: [
        ex('Dips', 4, 10, 'Wdh', 120, 'Leicht nach vorne lehnen für mehr Brust.'),
        ex('Pike Push-ups', 4, 8, 'Wdh', 90, 'Hüfte hoch, Kopf zwischen die Hände senken.'),
        ex('Diamond Push-ups', 3, 12, 'Wdh', 90, 'Hände bilden eine Raute unter der Brust.'),
        ex('Pseudo Planche Push-ups', 3, 8, 'Wdh', 90, 'Hände auf Hüfthöhe, Schultern vor die Hände.'),
        ex('L-Sit', 3, 15, 'Sek', 60, 'Auf Parallettes oder Stühlen, Beine gestreckt.'),
      ]},
      { name: 'Pull', exercises: [
        ex('Klimmzüge', 4, 8, 'Wdh', 120, 'Volle Bewegung: unten aushängen, Kinn über die Stange.'),
        ex('Chin-ups', 3, 8, 'Wdh', 120, 'Untergriff, Fokus auf Bizeps.'),
        ex('Australian Rows', 3, 12, 'Wdh', 90, 'Schulterblätter zusammenziehen.'),
        ex('Hanging Leg Raises', 3, 10, 'Wdh', 90, 'Kein Schwung, Beine kontrolliert heben.'),
        ex('Dead Hang', 2, 45, 'Sek', 60, 'Für Griffkraft und Schultergesundheit.'),
      ]},
      { name: 'Legs', exercises: [
        ex('Bulgarian Split Squats', 4, 10, 'Wdh', 90, 'Pro Bein. Hinterer Fuß auf Bank oder Stuhl.'),
        ex('Pistol Squat Progression', 3, 6, 'Wdh', 90, 'Pro Bein. Anfangs auf eine Box absetzen.'),
        ex('Nordic Curls (negativ)', 3, 5, 'Wdh', 120, 'Füße fixieren, langsam nach vorne ablassen.'),
        ex('Wadenheben einbeinig', 4, 15, 'Wdh', 60, 'Pro Bein, auf einer Stufe.'),
        ex('Wall Sit', 3, 45, 'Sek', 60, 'Oberschenkel parallel zum Boden.'),
      ]},
    ],
  },
  {
    id: 'b-upperlower',
    builtin: true,
    name: 'Oberkörper / Unterkörper',
    level: 2,
    perWeek: 4,
    description: '4 Tage pro Woche im Wechsel. Gute Balance zwischen Kraft, Volumen und Regeneration.',
    days: [
      { name: 'Oberkörper Kraft', exercises: [
        ex('Klimmzüge', 5, 5, 'Wdh', 150, 'Langsam und sauber, ggf. mit Zusatzgewicht.'),
        ex('Dips', 5, 6, 'Wdh', 150),
        ex('Archer Push-ups', 3, 6, 'Wdh', 90, 'Pro Seite. Ein Arm macht die Arbeit.'),
        ex('Australian Rows', 3, 10, 'Wdh', 90),
        ex('Hollow Body Rocks', 3, 20, 'Wdh', 60),
      ]},
      { name: 'Unterkörper', exercises: [
        ex('Jump Squats', 4, 12, 'Wdh', 90, 'Weich landen.'),
        ex('Shrimp Squats', 3, 6, 'Wdh', 90, 'Pro Bein.'),
        ex('Single Leg Glute Bridge', 3, 12, 'Wdh', 60, 'Pro Bein.'),
        ex('Cossack Squats', 3, 8, 'Wdh', 60, 'Pro Seite, für Mobilität.'),
        ex('Side Plank', 3, 30, 'Sek', 45, 'Pro Seite.'),
      ]},
      { name: 'Oberkörper Volumen', exercises: [
        ex('Liegestütze', 4, 20, 'Wdh', 75),
        ex('Chin-ups', 4, 10, 'Wdh', 90),
        ex('Pike Push-ups', 3, 10, 'Wdh', 75),
        ex('Commando Pull-ups', 3, 6, 'Wdh', 90, 'Seitlich an der Stange, Kopf links/rechts.'),
        ex('Knee Raises', 3, 15, 'Wdh', 60),
      ]},
      { name: 'Beine & Core', exercises: [
        ex('Pistol Squats', 4, 5, 'Wdh', 120, 'Pro Bein.'),
        ex('Nordic Curls (negativ)', 3, 6, 'Wdh', 120),
        ex('Ausfallschritte gehend', 3, 20, 'Wdh', 60),
        ex('Dragon Flag Negativ', 3, 5, 'Wdh', 90, 'Auf einer Bank, langsam ablassen.'),
        ex('Plank', 3, 60, 'Sek', 60),
      ]},
    ],
  },
  {
    id: 'b-muscleup',
    builtin: true,
    name: 'Muscle-Up Programm',
    level: 3,
    perWeek: 3,
    description: 'Skill-Programm für den ersten Muscle-Up. Voraussetzung: ca. 10 saubere Klimmzüge und 15 Dips.',
    days: [
      { name: 'Explosivkraft', exercises: [
        ex('Explosive Klimmzüge (Brust zur Stange)', 5, 5, 'Wdh', 150, 'So hoch wie möglich ziehen, Bauchnabel zur Stange.'),
        ex('Straight Bar Dips', 4, 8, 'Wdh', 120, 'An der Klimmzugstange, wichtig für die Übergangsphase.'),
        ex('Negative Muscle-ups', 4, 3, 'Wdh', 150, 'Oben starten, Übergang langsam ablassen.'),
        ex('Kipping Swings', 3, 10, 'Wdh', 60, 'Hollow/Arch-Rhythmus üben.'),
      ]},
      { name: 'Technik & Übergang', exercises: [
        ex('Muscle-up Versuche (Band)', 5, 3, 'Wdh', 150, 'Mit Widerstandsband für das Bewegungsmuster.'),
        ex('False Grip Hang', 3, 20, 'Sek', 90, 'Handgelenk über der Stange.'),
        ex('Russian Dips', 3, 6, 'Wdh', 90, 'Unterarme ablegen und wieder hochdrücken.'),
        ex('Hanging Leg Raises', 3, 10, 'Wdh', 60),
      ]},
      { name: 'Kraftbasis', exercises: [
        ex('Klimmzüge weit', 4, 8, 'Wdh', 120),
        ex('Dips tief', 4, 12, 'Wdh', 120),
        ex('Archer Pull-ups', 3, 4, 'Wdh', 120, 'Pro Seite.'),
        ex('L-Sit', 3, 20, 'Sek', 60),
      ]},
    ],
  },
  {
    id: 'b-handstand',
    builtin: true,
    name: 'Handstand & Core',
    level: 2,
    perWeek: 4,
    description: 'Kurze, häufige Skill-Einheiten (20–30 min) für Handstand, Schulterkraft und eine starke Körpermitte. Gut mit anderen Plänen kombinierbar.',
    days: [
      { name: 'Balance', exercises: [
        ex('Handgelenk-Aufwärmen', 1, 60, 'Sek', 15, 'Kreisen, Dehnen, Vor- und Zurücklehnen.'),
        ex('Wandhandstand (Bauch zur Wand)', 5, 30, 'Sek', 60, 'Körper gestreckt, Rippen rein.'),
        ex('Kick-up Versuche', 6, 5, 'Wdh', 45, 'Freie Balance üben, sicher abrollen lernen.'),
        ex('Hollow Hold', 3, 30, 'Sek', 45),
      ]},
      { name: 'Schulterkraft', exercises: [
        ex('Pike Push-ups erhöht', 4, 8, 'Wdh', 90, 'Füße auf einer Box.'),
        ex('Wall Walks', 3, 4, 'Wdh', 90),
        ex('Handstand Shoulder Taps', 3, 10, 'Wdh', 90, 'An der Wand, Gewicht verlagern.'),
        ex('Arch Hold', 3, 30, 'Sek', 45),
        ex('L-Sit', 3, 15, 'Sek', 60),
      ]},
    ],
  },
];

const FOOD_PRESETS = [
  { name: 'Magerquark 250 g', kcal: 170, protein: 30, carbs: 10, fat: 0.5 },
  { name: 'Proteinshake', kcal: 120, protein: 24, carbs: 3, fat: 1.5 },
  { name: 'Hähnchenbrust 150 g', kcal: 165, protein: 35, carbs: 0, fat: 2 },
  { name: 'Haferflocken 80 g', kcal: 300, protein: 11, carbs: 47, fat: 5.6 },
  { name: '3 Eier', kcal: 230, protein: 20, carbs: 1.5, fat: 16 },
  { name: 'Skyr 200 g', kcal: 125, protein: 22, carbs: 8, fat: 0.4 },
  { name: 'Thunfisch (Dose)', kcal: 116, protein: 26, carbs: 0, fat: 1 },
  { name: 'Reis gekocht 200 g', kcal: 260, protein: 5, carbs: 57, fat: 0.6 },
  { name: 'Banane', kcal: 105, protein: 1, carbs: 27, fat: 0.4 },
  { name: 'Linsen gekocht 200 g', kcal: 230, protein: 18, carbs: 40, fat: 0.8 },
  { name: 'Erdnussbutter 30 g', kcal: 180, protein: 8, carbs: 4, fat: 15 },
  { name: 'Vollkornbrot (2 Scheiben)', kcal: 220, protein: 8, carbs: 40, fat: 2.5 },
];

const MEALS = [
  { id: 'breakfast', ico: '🌅', name: 'Frühstück' },
  { id: 'lunch', ico: '☀️', name: 'Mittagessen' },
  { id: 'dinner', ico: '🌙', name: 'Abendessen' },
  { id: 'snack', ico: '🍎', name: 'Snacks' },
];

// Faktoren für den Grundumsatz (PAL-Werte)
const ACTIVITY_LEVELS = [
  { value: 1.2, name: 'Kaum aktiv (Bürojob, wenig Bewegung)' },
  { value: 1.375, name: 'Leicht aktiv (1–3× Training pro Woche)' },
  { value: 1.55, name: 'Mäßig aktiv (3–5× Training pro Woche)' },
  { value: 1.725, name: 'Sehr aktiv (6–7× Training pro Woche)' },
  { value: 1.9, name: 'Extrem aktiv (körperliche Arbeit + Training)' },
];

// delta: kcal zum Gesamtumsatz, protein: g pro kg Körpergewicht
const CALORIE_GOALS = [
  { id: 'cut', name: 'Abnehmen (−500 kcal)', delta: -500, protein: 2.2 },
  { id: 'mildcut', name: 'Leicht abnehmen (−250 kcal)', delta: -250, protein: 2.0 },
  { id: 'maintain', name: 'Gewicht halten', delta: 0, protein: 1.8 },
  { id: 'bulk', name: 'Muskelaufbau (+300 kcal)', delta: 300, protein: 1.8 },
];

// check(stats) erhält vorberechnete Kennzahlen aus app.js
const ACHIEVEMENTS = [
  { id: 'first', ico: '🎯', name: 'Erstes Training', check: s => s.workouts >= 1 },
  { id: 'w10', ico: '💪', name: '10 Trainings', check: s => s.workouts >= 10 },
  { id: 'w50', ico: '🏋️', name: '50 Trainings', check: s => s.workouts >= 50 },
  { id: 'w100', ico: '👑', name: '100 Trainings', check: s => s.workouts >= 100 },
  { id: 's3', ico: '🔥', name: '3 Tage Streak', check: s => s.longest >= 3 },
  { id: 's7', ico: '⚡', name: '7 Tage Streak', check: s => s.longest >= 7 },
  { id: 's30', ico: '🌋', name: '30 Tage Streak', check: s => s.longest >= 30 },
  { id: 'r1000', ico: '🔁', name: '1.000 Wdh', check: s => s.reps >= 1000 },
  { id: 'r10000', ico: '🚀', name: '10.000 Wdh', check: s => s.reps >= 10000 },
  { id: 'steps', ico: '👟', name: 'Schrittziel erreicht', check: s => s.stepGoalDays >= 1 },
  { id: 'steps20', ico: '🥾', name: '20.000 Schritte', check: s => s.maxSteps >= 20000 },
  { id: 'protein', ico: '🥩', name: 'Proteinziel erreicht', check: s => s.proteinDays >= 1 },
  { id: 'protein7', ico: '🍗', name: '7× Proteinziel', check: s => s.proteinDays >= 7 },
  { id: 'water', ico: '💧', name: 'Wasserziel erreicht', check: s => s.waterDays >= 1 },
];
