import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { abandonPlayer, createGame, customs, playMove, tick } from '../src/engine/game';
import type { Difficulty, Game, Move } from '../src/engine/types';
import type { OnlineCommand, OnlineResponse, OnlineRoom, OnlineSession } from '../src/online/types';
export const RESERVATION = 60_000;
export const HEARTBEAT = 5_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class OnlineError extends Error { constructor(message: string, public status = 400) { super(message); } }
const fail = (message: string, status = 400): never => { throw new OnlineError(message, status); };
export const normalizeName = (name: string) => name.trim().normalize('NFC').toLocaleLowerCase('fr');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const code = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const token = () => randomBytes(32).toString('base64url');
export function nickname(value: unknown): string {
  if (typeof value !== 'string') return fail('Saisissez un pseudo de 4 à 20 caractères.');
  const name = value.trim().normalize('NFC');
  const length = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(name)].length;
  if (length < 4 || length > 20 || /[\p{Cc}\p{Cf}]/u.test(name)) return fail('Le pseudo doit comporter de 4 à 20 caractères visibles.');
  return name;
}
export function roomCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-HJ-NP-Z2-9]{8}$/.test(value.trim().toUpperCase())) return fail('Le code comporte 8 caractères sans caractères ambigus.');
  return value.trim().toUpperCase();
}
function validMove(value: unknown): Move {
  if (!value || typeof value !== 'object') return fail('Mouvement invalide.');
  const m = value as Record<string, unknown>;
  if (!Number.isInteger(m.crateId) || Number(m.crateId) < 1 || Number(m.crateId) > 27) return fail('Caisse invalide.');
  if (m.kind === 'pivot' && [1, 2, 3].includes(Number(m.quarterTurns)) && typeof m.quarterTurns === 'number') return { kind: m.kind, crateId: m.crateId as number, quarterTurns: m.quarterTurns as 1 | 2 | 3 };
  if ((m.kind === 'chute' || m.kind === 'bascule') && ['nord', 'est', 'sud', 'ouest'].includes(String(m.direction))) {
    if (m.kind === 'bascule') return { kind: m.kind, crateId: m.crateId as number, direction: m.direction as 'nord' | 'est' | 'sud' | 'ouest' };
    if (typeof m.quarterTurns === 'number' && [0, 1, 2, 3].includes(m.quarterTurns)) return { kind: m.kind, crateId: m.crateId as number, direction: m.direction as 'nord', quarterTurns: m.quarterTurns as 0 | 1 | 2 | 3 };
  }
  return fail('Mouvement invalide.');
}
interface Member { id: string; name: string; role: 'player' | 'spectator'; ready: boolean; playerId: number | null; tokenHash: string; recoveryHash: string | null; connected: boolean; lastSeen: number; disconnectedAt: number | null; requests: string[]; }
interface Room { code: string; hostId: string | null; count: number; difficulty: Difficulty; members: Member[]; game: Game | null; finishedAt: number | null; emptyAt: number | null; }
export interface RoomSnapshot { version: 1; rooms: Room[]; }
export class Rooms {
  readonly rooms = new Map<string, Room>();
  private durable: RoomSnapshot = { version: 1, rooms: [] };
  constructor(private persist: (snapshot: RoomSnapshot) => void = () => {}, snapshot?: RoomSnapshot, now = Date.now()) {
    if (snapshot) {
      this.durable = structuredClone(snapshot);
      if (snapshot.version !== 1 || !Array.isArray(snapshot.rooms)) throw new Error('Sauvegarde serveur incompatible.');
      for (const room of snapshot.rooms) {
        for (const member of room.members) { member.connected = false; member.disconnectedAt = member.disconnectedAt ?? now; }
        room.emptyAt ??= now; this.rooms.set(room.code, room);
      }
      this.sweep(now);
    }
  }
  private save() {
    const snapshot: RoomSnapshot = { version: 1, rooms: [...this.rooms.values()] };
    try { this.persist(snapshot); this.durable = structuredClone(snapshot); }
    catch (error) {
      this.rooms.clear();
      for (const room of this.durable.rooms) this.rooms.set(room.code, structuredClone(room));
      throw error;
    }
  }
  private get(value: unknown): Room { const c = roomCode(value); return this.rooms.get(c) ?? fail('Partie introuvable ou code expiré.', 404); }
  private view(room: Room, now: number): OnlineRoom {
    return { code: room.code, status: room.game ? room.game.phase === 'terminée' ? 'finished' : 'playing' : 'lobby', hostId: room.hostId, count: room.count, difficulty: room.difficulty,
      members: room.members.map(m => ({ id: m.id, name: m.name, role: m.role, ready: m.ready, connected: m.connected, playerId: m.playerId })), game: room.game, finishedAt: room.finishedAt, serverNow: now };
  }
  private markEnd(room: Room, now: number) { if (room.game?.phase === 'terminée' && room.finishedAt === null) room.finishedAt = room.game.events.at(-1)?.at ?? now; }
  private rotate(room: Room, member: Member, now: number, recovery: string | null): OnlineResponse {
    const secret = token(); member.tokenHash = hash(secret); member.connected = true; member.lastSeen = now; member.disconnectedAt = null; room.emptyAt = null; this.save();
    return { room: this.view(room, now), session: { room: room.code, member: member.id, token: secret, recovery } };
  }
  private newMember(room: Room, name: string, role: Member['role'], now: number): OnlineResponse {
    if (room.members.some(m => normalizeName(m.name) === normalizeName(name))) return fail('Ce pseudo est déjà utilisé dans le salon.');
    let recovery: string | null = null;
    if (role === 'player') {
      do { recovery = code(); } while (recovery === room.code || [...this.rooms.values()].some(r => r.members.some(m => m.recoveryHash === hash(recovery!))));
    }
    const member: Member = { id: randomUUID(), name, role, ready: false, playerId: null, tokenHash: '', recoveryHash: recovery ? hash(recovery) : null, connected: true, lastSeen: now, disconnectedAt: null, requests: [] };
    room.members.push(member); if (role === 'player' && !room.hostId) room.hostId = member.id;
    return this.rotate(room, member, now, recovery);
  }
  create(name: unknown, count: unknown, difficulty: unknown, now = Date.now()): OnlineResponse {
    const n = nickname(name); this.settings(count, difficulty); let c: string;
    do { c = code(); } while (this.rooms.has(c));
    const room: Room = { code: c, count: count as number, difficulty: difficulty as Difficulty, hostId: null, members: [], game: null, finishedAt: null, emptyAt: null };
    this.rooms.set(c, room); return this.newMember(room, n, 'player', now);
  }
  join(value: unknown, name: unknown, role: unknown, now = Date.now()): OnlineResponse {
    this.sweep(now); const room = this.get(value); const n = nickname(name);
    if (room.finishedAt !== null) return fail('Le code du salon a expiré.', 410);
    if (role !== 'player' && role !== 'spectator') return fail('Choisissez joueur ou spectateur.');
    if (role === 'player' && room.game) return fail('La partie a commencé. Vous pouvez la regarder comme spectateur.');
    if (role === 'player' && room.members.filter(m => m.role === 'player').length >= room.count) return fail('Le salon est complet.');
    return this.newMember(room, n, role, now);
  }
  private auth(room: Room, value: unknown, connected = true): Member {
    if (typeof value !== 'string' || value.length > 100) return fail('Session invalide.', 401);
    const member = room.members.find(m => m.tokenHash === hash(value));
    if (!member) return fail('Cette connexion a été remplacée. Reprenez votre place.', 401);
    if (connected && !member.connected) return fail('Connexion interrompue. Reprise nécessaire.', 428);
    return member;
  }
  resume(value: unknown, secret: unknown, recovery: unknown, now = Date.now()): OnlineResponse {
    this.sweep(now); const room = this.get(value);
    if (room.finishedAt !== null) return fail('Les codes de récupération ont expiré.', 410);
    let member: Member | undefined;
    if (typeof secret === 'string') member = room.members.find(m => m.tokenHash === hash(secret));
    if (!member && typeof recovery === 'string') { const c = roomCode(recovery); member = room.members.find(m => m.recoveryHash === hash(c)); }
    if (!member) return fail('Code personnel ou session invalide.', 401);
    return this.rotate(room, member, now, typeof recovery === 'string' && member.recoveryHash === hash(recovery.trim().toUpperCase()) ? recovery.trim().toUpperCase() : null);
  }
  poll(value: unknown, secret: unknown, now = Date.now()): OnlineResponse {
    this.sweep(now); const room = this.get(value); const member = this.auth(room, secret);
    // Refresh the live connection lease.
    member.lastSeen = now; room.emptyAt = null; this.sweep(now);
    if (!this.rooms.has(room.code)) return fail('Le salon est fermé.', 410);
    return { room: this.view(room, now) };
  }
  disconnect(value: unknown, secret: unknown, now = Date.now()) {
    const room = this.get(value); const member = this.auth(room, secret);
    member.connected = false; member.disconnectedAt = now; member.ready = false;
    if (!room.members.some(m => m.connected)) room.emptyAt ??= now;
    this.save();
  }
  leave(value: unknown, secret: unknown, now = Date.now()) {
    this.sweep(now); const room = this.get(value); const member = this.auth(room, secret, false);
    if (room.game && member.playerId !== null && room.game.phase !== 'terminée') room.game = abandonPlayer(room.game, member.playerId, now);
    if (room.game && member.playerId !== null) { member.connected = false; member.disconnectedAt = now; member.tokenHash = ''; member.recoveryHash = null; }
    else room.members = room.members.filter(m => m !== member);
    this.host(room); if (!room.members.some(m => m.connected)) room.emptyAt ??= now;
    this.markEnd(room, now); this.save();
  }
  private settings(count: unknown, difficulty: unknown) { if (![2, 3, 4].includes(Number(count)) || typeof count !== 'number' || (difficulty !== 'normal' && difficulty !== 'facile')) return fail('Choisissez 2 à 4 joueurs et le mode Normal ou Facile.'); }
  private host(room: Room) { if (!room.members.some(m => m.id === room.hostId && m.role === 'player')) room.hostId = room.members.find(m => m.role === 'player')?.id ?? null; }
  command(value: unknown, secret: unknown, requestId: unknown, command: OnlineCommand, now = Date.now()): OnlineResponse {
    this.sweep(now); const room = this.get(value); const member = this.auth(room, secret);
    if (typeof requestId !== 'string' || !/^[\w-]{8,80}$/.test(requestId)) return fail('Identifiant de commande invalide.');
    if (member.requests.includes(requestId)) return { room: this.view(room, now) };
    if (!command || typeof command !== 'object' || member.role !== 'player') return fail('Les spectateurs ne peuvent pas jouer.', 403);
    if (command.kind === 'ready' || command.kind === 'configure' || command.kind === 'start') {
      if (room.game) return fail('La partie a déjà démarré.');
      if (command.kind === 'ready') { if (typeof command.ready !== 'boolean') return fail('État Prêt invalide.'); member.ready = command.ready; }
      else {
        if (member.id !== room.hostId) return fail('Seul le responsable du salon peut faire cela.', 403);
        const players = room.members.filter(m => m.role === 'player');
        if (command.kind === 'configure') {
          this.settings(command.count, command.difficulty);
          if (players.length > command.count) return fail('Il y a déjà plus de joueurs dans le salon.');
          room.count = command.count; room.difficulty = command.difficulty; players.forEach(m => { m.ready = false; });
        } else {
          if (players.length < 2 || players.some(m => !m.ready || !m.connected)) return fail('Au moins deux joueurs présents et prêts sont nécessaires.');
          // A departure can reduce the original invitation target. All remaining seats must be ready.
          room.count = players.length; players.forEach((m, i) => { m.playerId = i; });
          room.game = createGame(players.map(m => m.name), now, Math.random, room.difficulty); this.markEnd(room, now);
        }
      }
    } else {
      const game = room.game;
      if (!game || game.phase === 'terminée' || member.playerId === null || game.players[member.playerId].abandonedAt !== null) return fail('Vous ne pouvez pas jouer dans cette partie.', 403);
      if (command.event !== game.events.length) return fail('Le plateau a changé. La partie a été actualisée ; choisissez à nouveau.', 409);
      if (command.kind !== 'abandon' && member.playerId !== game.activePlayer) return fail('Ce n’est pas votre tour.', 403);
      if (now > game.deadline) return fail('Les cinq minutes sont écoulées.', 409);
      if (command.kind === 'move') room.game = playMove(game, validMove(command.move), now);
      else if (command.kind === 'customs') {
        if (command.crateId !== null && (!Number.isInteger(command.crateId) || command.crateId < 1 || command.crateId > 27)) return fail('Caisse invalide.');
        room.game = customs(game, command.crateId, now);
      } else if (command.kind === 'abandon') room.game = abandonPlayer(game, member.playerId, now);
      else return fail('Commande inconnue.');
      this.markEnd(room, now);
    }
    member.lastSeen = now; member.requests.push(requestId); member.requests = member.requests.slice(-128); this.save();
    return { room: this.view(room, now) };
  }
  sweep(now = Date.now()) {
    let changed = false;
    for (const room of this.rooms.values()) {
      for (const m of room.members) if (m.connected && now - m.lastSeen > HEARTBEAT) { m.connected = false; m.disconnectedAt = m.lastSeen + HEARTBEAT; m.ready = false; changed = true; }
      if (!room.game) {
        const length = room.members.length;
        room.members = room.members.filter(m => m.disconnectedAt === null || now - m.disconnectedAt < RESERVATION);
        if (length !== room.members.length) { changed = true; this.host(room); }
        if (!room.members.some(m => m.connected)) {
          if (room.emptyAt === null) { room.emptyAt = Math.max(...room.members.map(m => m.disconnectedAt ?? now), now - RESERVATION); changed = true; }
          if (now - room.emptyAt >= RESERVATION) { this.rooms.delete(room.code); changed = true; }
        } else room.emptyAt = null;
      } else {
        const next = tick(room.game, now);
        if (next !== room.game) { room.game = next; this.markEnd(room, now); changed = true; }
        if (room.finishedAt !== null && now >= room.finishedAt + RESERVATION) { this.rooms.delete(room.code); changed = true; }
      }
    }
    if (changed) this.save();
  }
}
