// Zurücksetzen des Turniers. Beide Funktionen sind absichtlich einfach
// gehalten: die UI fragt vorher per Sicherheits-Dialog nach, da diese
// Aktionen nicht rückgängig gemacht werden können.

import { dbClear, dbDelete } from './db.js';

// Löscht alle Spiele und den Turnierstatus. Teilnehmer und Einstellungen
// (Modus, Vorrundenzahl, Anzahl Felder) bleiben erhalten.
export async function resetTournamentProgress() {
  await dbClear('matches');
  await dbDelete('meta', 'status');
}

// Löscht wirklich alles: Teilnehmer, Spiele, Einstellungen und Turnierstatus.
export async function resetEverything() {
  await dbClear('participants');
  await dbClear('matches');
  await dbClear('meta');
}
