import { CATALOGUE } from '../src/engine/catalogue';
import { clone, createGame, snapshotOf } from '../src/engine/game';
import { INITIAL_ORIENTATION, roll, stateKey, VALID_ORIENTATIONS } from '../src/engine/geometry';
import { COLORS, type Crate, type Face, type Game, type Orientation } from '../src/engine/types';
export function cube(id: number, x: number, y: number, z = 0, color: Face = null): Crate {
  const def = CATALOGUE.find(c => c.id === id)!;
  const orientation = [...VALID_ORIENTATIONS].map(k => k.split(',').map(Number) as Orientation).find(o => def.faces[o[0]] === color);
  if (!orientation) throw new Error(`Face ${color} absente de ${id}`);
  return { id, x, y, z, orientation: [...orientation] };
}
export function fixture(board: Crate[], count = 4): Game {
  const g = createGame(Array.from({ length: count }, (_, i) => `J${i + 1}`), 1000, () => .1);
  g.players.forEach((p, i) => { p.color = COLORS[i]; }); g.activePlayer = 0; g.board = clone(board); g.opened = true; g.turn = 2; g.customsId = null; g.visited = Object.fromEntries(board.map(c => [c.id, [stateKey(c)]])); g.events = []; g.snapshot = snapshotOf(g); return g;
}
export function beforeRoll(id: number, x: number, y: number, direction: 'nord' | 'sud' | 'est' | 'ouest', desiredTop: Face, z = 0): Crate {
  const def = CATALOGUE.find(c => c.id === id)!;
  const o = [...VALID_ORIENTATIONS].map(k => k.split(',').map(Number) as Orientation).find(o => def.faces[roll(o, direction)[0]] === desiredTop)!;
  return { id, x, y, z, orientation: o };
}
export { INITIAL_ORIENTATION };
