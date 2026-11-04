'use strict';
// Zugangsdaten für den Cloud-Sync mit Supabase (Einrichtung: siehe README, Abschnitt „Cloud-Sync“).
// Leer lassen = kein Cloud-Sync, die App speichert dann nur lokal.
// Der „publishable“/„anon“-Key darf öffentlich sein: Die Datenbank-Regeln (RLS) erlauben jedem nur seine eigenen Daten.

const SUPABASE_URL = 'https://bnighrrqrlaansllsyyo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cpziE3tW5LKzB9SbMYejsg_5jzuufL9';
