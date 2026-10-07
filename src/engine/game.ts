import { definition } from './catalogue';
import { connected, groupKey, groups, initialBoard, multiplier, stateKey, visible } from './geometry';
import { evaluateMove, hasContinuation } from './moves';
import { COLORS, type Difficulty, type Game, type GameEvent, type Gain, type Move, type Player, type Snapshot } from './types';
export const TURN_DURATION = 300_000;
export const RULES_VERSION = 'dockers-2026-10-07' as const;
export const clone = <T,>(v: T): T => structuredClone(v);
const shuffle = <T,>(items: T[], random: () => number): T[] => { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
export const snapshotOf = (game: Game): Snapshot => ({ board: clone(game.board), scores: game.players.map(p => p.score), customsId: game.customsId, opened: game.opened });
function initHistory(game: Game) { game.visited = Object.fromEntries(game.board.map(c => [c.id, [stateKey(c)]])); }
function log(game: Game, event: Omit<GameEvent, 'id' | 'turn' | 'playerId'>) { game.events.push({ id: (game.events.at(-1)?.id ?? 0) + 1, turn: game.turn, playerId: game.activePlayer, ...event }); }
export function createGame(names: string[], now = Date.now(), random = Math.random, difficulty: Difficulty = 'normal'): Game {
  if (!['facile', 'normal'].includes(difficulty)) throw new Error('Mode de jeu invalide.');
  if (names.length < 2 || names.length > 4) throw new Error('Une partie nécessite de 2 à 4 joueurs.');
  const colors = shuffle([...COLORS], random);
  const players: Player[] = names.map((name, id) => ({ id, name: name.trim().slice(0, 30) || `Docker ${id + 1}`, color: colors[id], score: 0, abandonedAt: null }));
  const game: Game = { difficulty, version: 1, rulesVersion: RULES_VERSION, id: crypto.randomUUID(), board: initialBoard(), players, activePlayer: Math.floor(random() * names.length), turn: 1, movesMade: 0, phase: 'mouvements', customsId: null, opened: false, visited: {}, turnStartedAt: now, deadline: now + TURN_DURATION, snapshot: null as unknown as Snapshot, events: [], result: null };
  initHistory(game); game.snapshot = snapshotOf(game);
  log(game, { kind: 'début', at: now, text: `Début de partie en mode ${difficulty}. ${players[game.activePlayer].name} ouvre le jeu ; les couleurs et le premier joueur ont été tirés au sort.` });
  if (!hasContinuation(game)) finish(game, now, 'Aucune séquence de trois coups n’est possible.');
  return game;
}
export function gainsForMove(before: Game, after: Game, move: Move): Gain[] {
  const result: Gain[] = []; const seen = new Set<string>(); const newGroups = groups(after.board); const oldKeys = new Set(groups(before.board).map(groupKey));
  const credit = (crateId: number, trigger: Gain['trigger']) => {
    const group = newGroups.find(g => g.ids.includes(crateId)); if (!group) return;
    const key = groupKey(group); if (seen.has(key)) return;
    if (trigger === 'rangement' && oldKeys.has(key)) return;
    seen.add(key);
    const player = after.players.find(p => p.color === group.color && p.abandonedAt === null); if (!player) return;
    result.push({ playerId: player.id, color: group.color, points: group.ids.length * multiplier(group.z), size: group.ids.length, multiplier: multiplier(group.z), crateIds: group.ids, trigger });
  };
  if (move.kind !== 'pivot') credit(move.crateId, 'rangement');
  for (const c of after.board) { const old = before.board.find(v => v.id === c.id)!; if (!visible(before.board, old) && visible(after.board, c)) credit(c.id, 'dévoilement'); }
  return result;
}
function finish(game: Game, now: number, reason: string, survivor?: number) {
  const active = game.players.filter(p => p.abandonedAt === null); const best = Math.max(...active.map(p => p.score));
  game.phase = 'terminée'; game.result = { reason, winners: survivor !== undefined ? [survivor] : active.filter(p => p.score === best).map(p => p.id) };
  log(game, { at: now, kind: 'fin', text: reason });
}
export function tick(game: Game, now = Date.now()): Game { return game.phase !== 'terminée' && now > game.deadline ? abandon(game, now, true) : game; }
export function playMove(input: Game, move: Move, now = Date.now()): Game {
  if (input.phase === 'terminée') throw new Error('La partie est terminée.');
  if (now > input.deadline) return abandon(input, now, true);
  if (input.phase !== 'mouvements') throw new Error('Les trois mouvements sont effectués. Terminez la décision Douane.');
  const check = evaluateMove(input, move); if (!check.ok) throw new Error(check.reason);
  const game = clone(input); const before = clone(input.board.find(c => c.id === move.crateId)!);
  game.board = check.board!; game.opened = true; game.movesMade++;
  game.visited[move.crateId] = [...(game.visited[move.crateId] ?? [stateKey(before)]), stateKey(check.moved!)];
  const gains = gainsForMove(input, game, move); for (const gain of gains) game.players[gain.playerId].score += gain.points;
  log(game, { kind: 'mouvement', at: now, text: `${definition(move.crateId).name} : ${move.kind}${move.kind === 'pivot' ? ` de ${move.quarterTurns * 90}°` : ` vers le ${move.direction}`}.`, move, before, after: clone(check.moved!), gains });
  if (game.movesMade === 3) game.phase = 'douane';
  else if (!hasContinuation(game)) finish(game, now, 'Impossible de compléter les trois coups : la partie se termine aux scores acquis.');
  return game;
}
export function customs(input: Game, crateId: number | null, now = Date.now()): Game {
  if (input.phase === 'terminée') throw new Error('La partie est terminée.');
  if (now > input.deadline) return abandon(input, now, true);
  if (input.phase !== 'douane') throw new Error('La Douane se décide après les trois coups.');
  if (!connected(input.board)) throw new Error('Toutes les caisses doivent être connectées en fin de tour.');
  if (crateId === null && input.customsId === null) throw new Error('Le premier placement de la Douane est obligatoire.');
  const nextId = crateId ?? input.customsId;
  const c = input.board.find(c => c.id === nextId); if (!c || !visible(input.board, c)) throw new Error('Choisissez une caisse au dessus non recouvert.');
  const game = clone(input); game.customsId = c.id;
  log(game, { kind: 'douane', at: now, text: input.customsId === c.id ? `Douane maintenue sur ${definition(c.id).name}.` : `Douane placée sur ${definition(c.id).name}.` });
  beginNextTurn(game, now); return game;
}
function beginNextTurn(game: Game, now: number) {
  let next = (game.activePlayer + 1) % game.players.length;
  while (game.players[next].abandonedAt !== null) next = (next + 1) % game.players.length;
  game.activePlayer = next; game.turn++; game.movesMade = 0; game.phase = 'mouvements'; game.turnStartedAt = now; game.deadline = now + TURN_DURATION;
  initHistory(game); game.snapshot = snapshotOf(game);
  if (!hasContinuation(game)) finish(game, now, 'Aucune séquence de trois coups n’est possible : décompte final.');
}
export function abandon(input: Game, now = Date.now(), expired = false): Game {
  if (input.phase === 'terminée') return input;
  const game = clone(input); const player = game.players[game.activePlayer];
  game.board = clone(game.snapshot.board); game.customsId = game.snapshot.customsId; game.opened = game.snapshot.opened;
  game.players.forEach((p, i) => { p.score = game.snapshot.scores[i]; });
  for (const e of game.events) if (e.turn === game.turn && (e.kind === 'mouvement' || e.kind === 'douane')) e.reverted = true;
  player.abandonedAt = game.players.filter(p => p.abandonedAt !== null).length + 1;
  log(game, { kind: 'abandon', at: now, text: `${player.name} abandonne${expired ? ' : les cinq minutes sont écoulées' : ''}. Le plateau et tous les scores de début de tour sont restaurés.` });
  const active = game.players.filter(p => p.abandonedAt === null);
  if (active.length === 1) finish(game, now, `${active[0].name} remporte la partie : les autres joueurs ont abandonné.`, active[0].id);
  else beginNextTurn(game, now);
  return game;
}
export function ranking(game: Game): { player: Player; rank: number }[] {
  const active = game.players.filter(p => p.abandonedAt === null).sort((a, b) => b.score - a.score);
  const departed = game.players.filter(p => p.abandonedAt !== null).sort((a, b) => b.abandonedAt! - a.abandonedAt!);
  return [...active, ...departed].map((player, i, all) => ({ player, rank: player.abandonedAt === null && i > 0 && all[i - 1].score === player.score ? all.findIndex(p => p.abandonedAt === null && p.score === player.score) + 1 : i + 1 }));
}
