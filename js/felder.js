// Verwaltet, welches Spielfeld für ein Spiel vorgeschlagen wird.
//
// Ein Feld gilt als "belegt", solange ein Spiel mit diesem Feld noch nicht
// abgeschlossen ist (status === 'offen'). Sobald ein Ergebnis gespeichert
// wird und das Spiel damit "abgeschlossen" ist, zählt es nicht mehr als
// belegt - das Feld ist also automatisch wieder frei, ohne dass extra
// etwas zurückgesetzt werden muss.

import { dbGetAll, dbGet, dbPut } from './db.js';
import { getSettings } from './settings.js';

export function suggestFreeField(allMatches, anzahlFelder) {
  if (!anzahlFelder) return null;

  const belegteFelder = new Set(
    allMatches
      .filter((m) => m.status === 'offen' && m.feldNummer != null)
      .map((m) => m.feldNummer)
  );

  for (let feld = 1; feld <= anzahlFelder; feld++) {
    if (!belegteFelder.has(feld)) return feld;
  }
  return null;
}

export async function startMatchOnField(matchId) {
  const settings = await getSettings();
  const anzahlFelder = settings?.anzahlFelder || 0;

  const allMatches = await dbGetAll('matches');
  const feld = suggestFreeField(allMatches, anzahlFelder);
  if (!feld) throw new Error('Aktuell ist kein Feld frei.');

  const match = await dbGet('matches', matchId);
  if (!match) throw new Error('Spiel nicht gefunden.');

  match.feldNummer = feld;
  await dbPut('matches', match);
  return match;
}
