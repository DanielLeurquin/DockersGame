export const COLORS = ['bleu', 'rouge', 'jaune', 'vert'] as const;
export type Color = typeof COLORS[number];
export type Face = Color | null;
// Stable physical face ids; orientation slots: top, north, east, south, west, bottom.
export type Orientation = [number, number, number, number, number, number];
export interface CrateDefinition { id: number; name: string; faces: [Face, Face, Face, Face, Face, Face] }
export interface Crate { id: number; x: number; y: number; z: number; orientation: Orientation }
export interface Player { id: number; name: string; color: Color; score: number; abandonedAt: number | null }
export type Direction = 'nord' | 'est' | 'sud' | 'ouest';
export type Move = { crateId: number; kind: 'pivot'; quarterTurns: 1 | 2 | 3 } | { crateId: number; kind: 'bascule'; direction: Direction } | { crateId: number; kind: 'chute'; direction: Direction; quarterTurns: 0 | 1 | 2 | 3 };
export interface Group { color: Color; z: number; ids: number[] }
export interface Gain { playerId: number; color: Color; points: number; size: number; multiplier: number; crateIds: number[]; trigger: 'rangement' | 'dévoilement' }
export interface GameEvent { id: number; turn: number; playerId: number; at: number; kind: 'début' | 'mouvement' | 'douane' | 'abandon' | 'fin'; text: string; move?: Move; before?: Crate; after?: Crate; gains?: Gain[]; reverted?: boolean }
export interface Snapshot { board: Crate[]; scores: number[]; customsId: number | null; opened: boolean }
export interface Game {
  version: 1; rulesVersion: 'dockers-2026-10-07'; id: string;
  board: Crate[]; players: Player[]; activePlayer: number; turn: number; movesMade: number;
  phase: 'mouvements' | 'douane' | 'terminée'; customsId: number | null; opened: boolean;
  visited: Record<number, string[]>; turnStartedAt: number; deadline: number; snapshot: Snapshot;
  events: GameEvent[]; result: { reason: string; winners: number[] } | null;
}
export interface MoveResult { ok: boolean; reason?: string; board?: Crate[]; moved?: Crate }
