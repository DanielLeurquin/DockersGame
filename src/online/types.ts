import type { Difficulty, Game, Move } from '../engine/types';
export interface OnlineMember { id: string; name: string; role: 'player' | 'spectator'; ready: boolean; connected: boolean; playerId: number | null; }
export interface OnlineRoom { code: string; status: 'lobby' | 'playing' | 'finished'; hostId: string | null; count: number; difficulty: Difficulty; members: OnlineMember[]; game: Game | null; finishedAt: number | null; serverNow: number; }
export interface OnlineSession { room: string; member: string; token: string; recovery: string | null; }
export type OnlineCommand =
  | { kind: 'ready'; ready: boolean }
  | { kind: 'configure'; count: number; difficulty: Difficulty }
  | { kind: 'start' }
  | { kind: 'move'; move: Move; event: number }
  | { kind: 'customs'; crateId: number | null; event: number }
  | { kind: 'abandon'; event: number };
export interface OnlineResponse { room: OnlineRoom; session?: OnlineSession; }
