import { definition } from './catalogue';
import type { Crate, Direction, Face, Group, Orientation } from './types';
export const INITIAL_ORIENTATION: Orientation = [0, 1, 2, 3, 4, 5];
export const DIRECTIONS: Direction[] = ['nord', 'est', 'sud', 'ouest'];
export const DELTAS: Record<Direction, [number, number]> = { nord: [0, 1], est: [1, 0], sud: [0, -1], ouest: [-1, 0] };
export function initialBoard(): Crate[] { return Array.from({ length: 27 }, (_, i) => ({ id: i + 1, x: 1 - i % 3, y: 1 - Math.floor(i % 9 / 3), z: Math.floor(i / 9), orientation: [...INITIAL_ORIENTATION] })); }
export function yaw(o: Orientation, turns: number): Orientation { let result: Orientation = [...o]; for (let i = 0; i < ((turns % 4) + 4) % 4; i++) { const [t, n, e, s, w, b] = result; result = [t, w, n, e, s, b]; } return result; }
export function roll(o: Orientation, direction: Direction): Orientation {
  const [t, n, e, s, w, b] = o;
  switch (direction) { case 'nord': return [s, t, e, b, w, n]; case 'sud': return [n, b, e, t, w, s]; case 'est': return [w, n, t, s, b, e]; case 'ouest': return [e, n, b, s, t, w]; }
}
export const stateKey = (c: Crate) => `${c.x},${c.y},${c.z}:${c.orientation.join(',')}`;
export const at = (board: Crate[], x: number, y: number, z: number) => board.find(c => c.x === x && c.y === y && c.z === z);
export const visible = (board: Crate[], c: Crate) => !at(board, c.x, c.y, c.z + 1);
export const top = (c: Crate): Face => definition(c.id).faces[c.orientation[0]];
export const faceAt = (c: Crate, slot: number): Face => definition(c.id).faces[c.orientation[slot]];
export const neighbors = (a: Crate, b: Crate) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
export function connected(board: Crate[]): boolean {
  if (!board.length) return false;
  const visited = new Set<number>([board[0].id]); const pending = [board[0]];
  while (pending.length) { const c = pending.pop()!; for (const other of board) if (!visited.has(other.id) && neighbors(c, other)) { visited.add(other.id); pending.push(other); } }
  return visited.size === board.length;
}
export function groups(board: Crate[]): Group[] {
  const visited = new Set<number>(); const result: Group[] = [];
  for (const start of board) {
    const color = top(start); if (!color || visited.has(start.id) || !visible(board, start)) continue;
    const ids: number[] = []; const pending = [start]; visited.add(start.id);
    while (pending.length) { const c = pending.pop()!; ids.push(c.id); for (const n of board) if (!visited.has(n.id) && n.z === c.z && neighbors(c, n) && top(n) === color && visible(board, n)) { visited.add(n.id); pending.push(n); } }
    if (ids.length >= 2) result.push({ color, z: start.z, ids: ids.sort((a, b) => a - b) });
  }
  return result;
}
export const groupKey = (g: Group) => `${g.color}:${g.z}:${g.ids.join(',')}`;
export const multiplier = (z: number) => [1, 3, 5][z] ?? 0;
// Proper cube orientations (no mirrored face permutations).
export const VALID_ORIENTATIONS = (() => { const found = new Map<string, Orientation>(); const pending: Orientation[] = [[...INITIAL_ORIENTATION]]; while (pending.length) { const o = pending.pop()!; const key = o.join(','); if (found.has(key)) continue; found.set(key, o); pending.push(yaw(o, 1), roll(o, 'nord'), roll(o, 'est')); } return new Set(found.keys()); })();
