import { dbGet, dbPut } from './db.js';

const STATUS_ID = 'status';
const DEFAULT_STATUS = { id: STATUS_ID, phase: 'setup', aktuelleRunde: 0, koBrackets: {} };

export async function getStatus() {
  const status = await dbGet('meta', STATUS_ID);
  if (!status) return { ...DEFAULT_STATUS, koBrackets: {} };
  return { ...DEFAULT_STATUS, ...status, koBrackets: status.koBrackets || {} };
}

export async function updateStatus(patch) {
  const current = await getStatus();
  const merged = { ...current, ...patch };
  await dbPut('meta', merged);
  return merged;
}
