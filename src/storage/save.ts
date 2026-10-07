import { openDB } from 'idb';
import { CATALOGUE } from '../engine/catalogue';
import { at, stateKey, VALID_ORIENTATIONS } from '../engine/geometry';
import { RULES_VERSION } from '../engine/game';
import { COLORS, type Crate, type Game } from '../engine/types';
const database = () => openDB('dockers-parties', 1, { upgrade(db) { db.createObjectStore('parties'); } });
function validBoard(value: unknown): value is Crate[] {
  if (!Array.isArray(value) || value.length !== 27) return false;
  const ids = new Set(); const positions = new Set();
  for (const c of value) {
    if (!c || !CATALOGUE.some(v => v.id === c.id) || ids.has(c.id) || ![c.x, c.y, c.z].every(Number.isInteger) || Math.abs(c.x) > 3 || Math.abs(c.y) > 3 || c.z < 0 || c.z > 2 || !Array.isArray(c.orientation) || !VALID_ORIENTATIONS.has(c.orientation.join(','))) return false;
    const pos = `${c.x},${c.y},${c.z}`; if (positions.has(pos)) return false; ids.add(c.id); positions.add(pos);
  }
  return value.every(c => c.z === 0 || !!at(value, c.x, c.y, c.z - 1));
}
export function validateSave(value: unknown): value is Game {
  if (!value || typeof value !== 'object') return false;
  const g = value as Game;
  if (!['facile', 'normal'].includes(g.difficulty)) return false;
  if (g.version !== 1 || g.rulesVersion !== RULES_VERSION || typeof g.id !== 'string' || !validBoard(g.board) || !validBoard(g.snapshot?.board)) return false;
  if (!Array.isArray(g.players) || g.players.length < 2 || g.players.length > 4 || new Set(g.players.map(p => p.color)).size !== g.players.length) return false;
  if (!g.players.every((p, i) => p.id === i && typeof p.name === 'string' && p.name.length <= 30 && COLORS.includes(p.color) && Number.isSafeInteger(p.score) && p.score >= 0 && (p.abandonedAt === null || (Number.isInteger(p.abandonedAt) && p.abandonedAt > 0)))) return false;
  if (!Number.isInteger(g.activePlayer) || !g.players[g.activePlayer] || !Number.isInteger(g.turn) || g.turn < 1 || !Number.isInteger(g.movesMade) || g.movesMade < 0 || g.movesMade > 3 || !['mouvements', 'douane', 'terminée'].includes(g.phase)) return false;
  if (!Number.isFinite(g.deadline) || g.deadline - g.turnStartedAt !== 300_000 || typeof g.opened !== 'boolean') return false;
  if (!Array.isArray(g.snapshot.scores) || g.snapshot.scores.length !== g.players.length || !g.snapshot.scores.every(s => Number.isSafeInteger(s) && s >= 0) || typeof g.snapshot.opened !== 'boolean') return false;
  if (g.customsId !== null && !g.board.some(c => c.id === g.customsId)) return false;
  if (g.snapshot.customsId !== null && !g.snapshot.board.some(c => c.id === g.snapshot.customsId)) return false;
  if (!g.visited || !g.board.every(c => Array.isArray(g.visited[c.id]) && g.visited[c.id].includes(stateKey(c)))) return false;
  if ((g.phase === 'douane' && g.movesMade !== 3) || (g.phase === 'mouvements' && (g.movesMade === 3 || g.players[g.activePlayer].abandonedAt !== null))) return false;
  if (!Array.isArray(g.events) || !g.events.every((e, i) => e && e.id === i + 1 && Number.isFinite(e.at) && Number.isInteger(e.turn) && e.turn > 0 && typeof e.text === 'string' && !!g.players[e.playerId] && ['début','mouvement','douane','abandon','fin'].includes(e.kind))) return false;
  const totals = g.players.map(() => 0); const startTotals = g.players.map(() => 0);
  for (const e of g.events) {
    if (e.gains !== undefined && !Array.isArray(e.gains)) return false;
    for (const gain of e.gains ?? []) {
      if (!g.players[gain.playerId] || g.players[gain.playerId].color !== gain.color || !Number.isSafeInteger(gain.points) || gain.points < 2 || ![1, 3, 5].includes(gain.multiplier) || !Array.isArray(gain.crateIds) || new Set(gain.crateIds).size !== gain.size || gain.size < 2 || gain.points !== gain.size * gain.multiplier || !gain.crateIds.every(id => CATALOGUE.some(c => c.id === id)) || !['rangement', 'dévoilement'].includes(gain.trigger)) return false;
      if (!e.reverted) { totals[gain.playerId] += gain.points; if (e.turn < g.turn) startTotals[gain.playerId] += gain.points; }
    }
  }
  if (!g.players.every((p, i) => p.score === totals[i]) || !g.snapshot.scores.every((score, i) => score === startTotals[i])) return false;
  if (g.phase === 'terminée' && (!g.result || !Array.isArray(g.result.winners) || !g.result.winners.length || !g.result.winners.every(id => g.players[id]?.abandonedAt === null))) return false;
  return true;
}
export function upgradeSave(value: unknown): unknown {
  if (value && typeof value === 'object' && (value as Game).version === 1 && !Object.hasOwn(value, 'difficulty')) return { ...value, difficulty: 'facile' };
  return value;
}
// Immediate recovery copy bridges a reload before the asynchronous IDB write completes.
export function stageGame(game: Game): boolean { try { localStorage.setItem('dockers-secours-v1', JSON.stringify(game)); return true; } catch { return false; } }
export async function loadGame(): Promise<Game | null> {
  let recovery: unknown = null;
  try { const data = localStorage.getItem('dockers-secours-v1'); if (data) recovery = upgradeSave(JSON.parse(data)); } catch { /* Preserve unreadable recovery; IDB may still be valid. */ }
  let saved: unknown = null;
  try { const db = await database(); saved = upgradeSave(await db.get('parties', 'courante')); }
  catch { if (validateSave(recovery)) return recovery; throw new Error('Le stockage local est indisponible dans ce navigateur.'); }
  if (validateSave(recovery) && (!validateSave(saved) || recovery.id !== saved.id || recovery.events.length >= saved.events.length)) return recovery;
  if (validateSave(saved)) return saved;
  if (saved == null && recovery == null) return null;
  throw new Error('La sauvegarde est incompatible ou endommagée. Elle est conservée ; une nouvelle partie l’archivera.');
}
export async function saveGame(game: Game) { const db = await database(); const tx = db.transaction('parties', 'readwrite'); const old = await tx.store.get('courante'); if (old && (!validateSave(old) || old.id !== game.id)) await tx.store.put(old, `archive-${Date.now()}`); await tx.store.put(game, 'courante'); await tx.done; }
