'use strict';
// Zugangsdaten für den Cloud-Sync mit Supabase (Einrichtung: siehe README, Abschnitt „Cloud-Sync“).
// Leer lassen = kein Cloud-Sync, die App speichert dann nur lokal.
// Der „publishable“/„anon“-Key darf öffentlich sein: Die Datenbank-Regeln (RLS) erlauben jedem nur seine eigenen Daten.

const SUPABASE_URL = '';  // z. B. 'https://abcdefgh.supabase.co'
const SUPABASE_KEY = '';  // z. B. 'sb_publishable_…' oder der lange „anon“-Key
