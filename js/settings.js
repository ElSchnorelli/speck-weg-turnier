import { dbGet, dbPut } from './db.js';

const SETTINGS_ID = 'settings';

export async function getSettings() {
  const settings = await dbGet('meta', SETTINGS_ID);
  return settings || null;
}

export function saveSettings({ mode, vorrundenAnzahl, anzahlFelder }) {
  return dbPut('meta', { id: SETTINGS_ID, mode, vorrundenAnzahl, anzahlFelder });
}

// Zeigt konkret, wie viele Spieler pro Runde bei Mix bzw. Doppel pausieren
// müssten, damit die Entscheidung nachvollziehbar ist (statt einer reinen
// Blackbox-Empfehlung).
export function computeRecommendation(participants) {
  const active = participants.filter((p) => p.active);
  const women = active.filter((p) => p.gender === 'W').length;
  const men = active.filter((p) => p.gender === 'M').length;

  // Mix-Team = 1 Dame + 1 Herr -> der Überschuss der häufigeren Gruppe
  // kann kein Mix-Team bilden und müsste pausieren.
  const mixPausing = Math.abs(women - men);

  // Doppel-Team = 2 Damen oder 2 Herren -> nur bei ungerader Anzahl
  // innerhalb einer Gruppe bleibt eine Person ohne Partner übrig.
  const doppelPausing = (women % 2) + (men % 2);

  let recommendation = 'gleich';
  if (mixPausing < doppelPausing) recommendation = 'mix';
  else if (doppelPausing < mixPausing) recommendation = 'doppel';

  return { women, men, mixPausing, doppelPausing, recommendation };
}
