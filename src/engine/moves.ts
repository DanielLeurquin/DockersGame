import { at, connected, DELTAS, DIRECTIONS, groups, roll, stateKey, visible, yaw } from './geometry';
import type { Crate, Game, Move, MoveResult } from './types';
type Position = Pick<Game, 'board' | 'customsId' | 'visited' | 'opened' | 'movesMade'>;
export function evaluateMove(state: Position, move: Move, checkFinal = true): MoveResult {
  const c = state.board.find(c => c.id === move.crateId);
  if (!c) return { ok: false, reason: 'Cette caisse n’existe pas.' };
  if (c.id === state.customsId) return { ok: false, reason: 'La Douane interdit tout mouvement de cette caisse.' };
  if (!visible(state.board, c)) return { ok: false, reason: 'Une autre caisse repose dessus : cette caisse est immobile.' };
  if (move.kind !== 'chute' && groups(state.board).some(g => g.ids.includes(c.id))) return { ok: false, reason: 'Cette caisse est rangée dans un groupe de couleur : seule la chute est autorisée.' };
  if (!state.opened && (move.kind !== 'chute' || c.z !== 2)) return { ok: false, reason: 'Pour ouvrir la partie, faites chuter une caisse du sommet.' };
  let moved: Crate = { ...c, orientation: [...c.orientation] };
  if (move.kind === 'pivot') {
    if (![1, 2, 3].includes(move.quarterTurns)) return { ok: false, reason: 'Un tour complet sans changement ne compte pas comme un coup.' };
    moved.orientation = yaw(c.orientation, move.quarterTurns);
  } else {
    const delta = DELTAS[move.direction]; if (!delta) return { ok: false, reason: 'Les diagonales ne sont pas autorisées.' };
    const [dx, dy] = delta; moved.x += dx; moved.y += dy;
    if (Math.abs(moved.x) > 3 || Math.abs(moved.y) > 3) return { ok: false, reason: 'La caisse doit rester sur le plateau de 7 × 7.' };
    if (at(state.board, moved.x, moved.y, c.z)) return { ok: false, reason: 'La destination est occupée.' };
    const customs = state.board.find(v => v.id === state.customsId);
    if (customs && customs.x === moved.x && customs.y === moved.y && customs.z <= c.z) return { ok: false, reason: 'Il est interdit de passer au-dessus de la Douane.' };
    const supports = state.board.filter(v => v.x === moved.x && v.y === moved.y && v.z < c.z);
    const landingZ = supports.length ? Math.max(...supports.map(v => v.z)) + 1 : 0;
    if (landingZ < c.z) {
      if (move.kind !== 'chute') return { ok: false, reason: 'Cette destination entraîne une chute, pas une bascule.' };
      if (![0, 1, 2, 3].includes(move.quarterTurns)) return { ok: false, reason: 'Orientation de chute invalide.' };
      moved.z = landingZ; moved.orientation = yaw(c.orientation, move.quarterTurns);
    } else {
      if (move.kind !== 'bascule') return { ok: false, reason: 'Cette destination est au même étage : choisissez une bascule.' };
      moved.orientation = roll(c.orientation, move.direction);
    }
  }
  const visited = state.visited[c.id] ?? [stateKey(c)];
  if (visited.includes(stateKey(moved))) return { ok: false, reason: 'Cette caisse a déjà occupé cette position et cette orientation pendant le tour.' };
  const board = state.board.map(v => v.id === c.id ? moved : v);
  if (checkFinal && state.movesMade === 2 && !connected(board)) return { ok: false, reason: 'Le troisième coup doit réunir toutes les caisses par leurs faces.' };
  return { ok: true, board, moved };
}
export function candidates(state: Position, crateId?: number): Move[] {
  const result: Move[] = [];
  for (const c of state.board) {
    if (crateId != null && c.id !== crateId) continue;
    if (c.id === state.customsId || !visible(state.board, c)) continue;
    for (const quarterTurns of [1, 2, 3] as const) { const move: Move = { kind: 'pivot', crateId: c.id, quarterTurns }; if (evaluateMove(state, move).ok) result.push(move); }
    for (const direction of DIRECTIONS) {
      const rollMove: Move = { kind: 'bascule', direction, crateId: c.id }; if (evaluateMove(state, rollMove).ok) result.push(rollMove);
      for (const quarterTurns of [0, 1, 2, 3] as const) { const fall: Move = { kind: 'chute', direction, quarterTurns, crateId: c.id }; if (evaluateMove(state, fall).ok) result.push(fall); }
    }
  }
  return result;
}
export function hasContinuation(state: Position, remaining = 3 - state.movesMade, memo = new Map<string, boolean>(), needsTranslation = false): boolean {
  if (remaining === 0) return !needsTranslation && connected(state.board);
  // Pivots preserve positions and groups. If no geometric translation exists,
  // no sequence of pivots can create one; ignore history for this safe pruning.
  if (needsTranslation && !candidates({ ...state, visited: {}, movesMade: 0 }).some(m => m.kind !== 'pivot')) return false;
  const key = `${remaining}|${needsTranslation}|${state.opened}|${state.customsId}|${state.board.map(c => `${c.id}:${stateKey(c)}`).join(';')}|${JSON.stringify(state.visited)}`;
  const cached = memo.get(key); if (cached !== undefined) return cached;
  for (const move of candidates(state)) {
    const result = evaluateMove(state, move); if (!result.ok) continue;
    const next: Position = { ...state, board: result.board!, opened: true, movesMade: state.movesMade + 1, visited: { ...state.visited, [move.crateId]: [...(state.visited[move.crateId] ?? []), stateKey(result.moved!)] } };
    if (hasContinuation(next, remaining - 1, memo, needsTranslation && move.kind === 'pivot')) { memo.set(key, true); return true; }
  }
  memo.set(key, false); return false;
}

export function hasProgressingContinuation(state: Position, translationAlreadyPlayed = false): boolean {
  return hasContinuation(state, 3 - state.movesMade, new Map(), !translationAlreadyPlayed);
}
