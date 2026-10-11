import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Rooms, OnlineError, nickname, normalizeName, type RoomSnapshot } from '../server/rooms';
import { onlineServer } from '../server/http';
import { candidates } from '../src/engine/moves';
import type { Game } from '../src/engine/types';
import type { OnlineCommand, OnlineSession } from '../src/online/types';
const command = (rooms: Rooms, session: OnlineSession, c: OnlineCommand, now = 0, id = randomUUID()) => rooms.command(session.room, session.token, id, c, now);
function started(count = 2, difficulty: 'normal' | 'facile' = 'normal') {
  const rooms = new Rooms(); const host = rooms.create('Camille', count, difficulty, 0).session!;
  const guests = Array.from({length: count - 1}, (_,i) => rooms.join(host.room, `Docker${i}`, 'player', 0).session!);
  const players = [host,...guests]; players.forEach(p => command(rooms,p,{kind:'ready',ready:true}));
  command(rooms,host,{kind:'start'}); return { rooms, host, players, room: rooms.rooms.get(host.room)! };
}
function live(rooms: Rooms, now: number) { for(const r of rooms.rooms.values()) for(const m of r.members) { m.lastSeen = now; m.connected = true; } }
const opening = (g: Game) => g.board.flatMap(c => candidates(g,c.id)).find(m => m.kind === 'chute')!;
describe('salons privés et identité', () => {
  it('valide les pseudos visibles et compare sans casse ni espaces', () => {
    expect(nickname('  Camille  ')).toBe('Camille'); expect(normalizeName(' ALEX ')).toBe('alex');
    for(const value of ['abc',' '.repeat(5),'x'.repeat(21),'abcd\nxyz',null]) expect(() => nickname(value)).toThrow();
    expect(nickname('é'.repeat(20))).toHaveLength(20); expect(nickname('abcd')).toBe('abcd');
  });
  it('crée des codes distincts de huit caractères et ne publie jamais les secrets', () => {
    const rooms = new Rooms(); const result = rooms.create('Camille',2,'normal',0); const other = rooms.create('Daniel',2,'normal',0);
    expect(result.session!.room).toMatch(/^[A-HJ-NP-Z2-9]{8}$/); expect(result.session!.recovery).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(result.session!.room).not.toBe(result.session!.recovery); expect(other.room.code).not.toBe(result.room.code);
    const publicRoom = JSON.stringify(result.room); expect(publicRoom).not.toContain(result.session!.token); expect(publicRoom).not.toContain(result.session!.recovery);
  });
  it('isole les salons et refuse les doublons, même parmi les spectateurs', () => {
    const rooms = new Rooms(); const a=rooms.create('Camille',2,'normal',0), b=rooms.create('Daniel',2,'normal',0);
    expect(rooms.join(a.room.code,'Daniel','player',0).room.members).toHaveLength(2);
    expect(b.room.members).toHaveLength(1); expect(() => rooms.join(a.room.code,' CAMILLE ','spectator',0)).toThrow(/pseudo/);
    expect(() => rooms.join('ABCDEFG2','Dockers','player',0)).toThrow(/introuvable/);
    expect(() => rooms.join('abc','Dockers','player',0)).toThrow(/8 caractères/);
  });
  it('respecte la capacité et ne fixe aucun plafond aux spectateurs', () => {
    const rooms=new Rooms(); const a=rooms.create('Camille',2,'normal',0);
    rooms.join(a.room.code,'Daniel','player',0); expect(() => rooms.join(a.room.code,'Autres','player',0)).toThrow(/complet/);
    for(let i=0;i<50;i++) rooms.join(a.room.code,`Spectateur${i}`,'spectator',0);
    expect(rooms.poll(a.room.code,a.session!.token,0).room.members).toHaveLength(52);
  });
  it('réserve une place pendant 60 secondes et conserve son ordre de retour', () => {
    const rooms=new Rooms(); const host=rooms.create('Camille',3,'normal',0).session!;
    const guest=rooms.join(host.room,'Daniel','player',0).session!;
    rooms.disconnect(host.room,host.token,1000); rooms.poll(guest.room,guest.token,2000);
    const resumed=rooms.resume(host.room,host.token,undefined,59_000);
    expect(resumed.session!.member).toBe(host.member); expect(resumed.room.hostId).toBe(host.member);
    expect(() => rooms.poll(host.room,host.token,59_000)).toThrow(/remplacée/);
  });
  it('retire immédiatement sur Quitter et transfère au premier arrivé', () => {
    const rooms=new Rooms(); const host=rooms.create('Camille',3,'normal',0).session!;
    const first=rooms.join(host.room,'Daniel','player',0).session!, second=rooms.join(host.room,'Autres','player',0).session!;
    rooms.leave(host.room,host.token,1000); const view=rooms.poll(first.room,first.token,1000).room;
    expect(view.hostId).toBe(first.member); expect(view.members).toHaveLength(2);
    command(rooms,first,{kind:'ready',ready:true},1000); command(rooms,second,{kind:'ready',ready:true},1000);
    expect(command(rooms,first,{kind:'start'},1000).room.game!.players).toHaveLength(2);
  });
  it('transfère après expiration, mais ne ferme pas un salon encore occupé', () => {
    const rooms=new Rooms(); const host=rooms.create('Camille',2,'normal',0).session!;
    const guest=rooms.join(host.room,'Daniel','player',0).session!;
    rooms.disconnect(host.room,host.token,0); live(rooms,60_000); const member=rooms.rooms.get(host.room)!.members[0]; member.connected=false; member.disconnectedAt=0;
    rooms.sweep(60_000); expect(rooms.poll(guest.room,guest.token,60_000).room.hostId).toBe(guest.member);
    expect(() => rooms.resume(host.room,host.token,host.recovery,60_000)).toThrow(/invalide/);
  });
  it('ferme le salon vide à 60 secondes et annule le délai lors d’un retour', () => {
    const rooms=new Rooms(); const a=rooms.create('Camille',2,'normal',0).session!;
    rooms.disconnect(a.room,a.token,0); rooms.sweep(59_999); expect(rooms.rooms.has(a.room)).toBe(true);
    rooms.sweep(60_000); expect(rooms.rooms.has(a.room)).toBe(false);
    const b=rooms.create('Daniel',2,'normal',0).session!; rooms.disconnect(b.room,b.token,0);
    const resumed=rooms.resume(b.room,b.token,undefined,59_000).session!; rooms.poll(b.room,resumed.token,60_000);
    expect(rooms.rooms.has(b.room)).toBe(true);
  });
  it('ne démarre qu’avec au moins deux joueurs présents et prêts', () => {
    const rooms=new Rooms(); const a=rooms.create('Camille',2,'normal',0).session!;
    command(rooms,a,{kind:'ready',ready:true}); expect(() => command(rooms,a,{kind:'start'})).toThrow(/deux joueurs/);
    const b=rooms.join(a.room,'Daniel','player',0).session!; expect(() => command(rooms,b,{kind:'start'})).toThrow(/responsable/);
    command(rooms,b,{kind:'ready',ready:true}); rooms.disconnect(b.room,b.token,0); expect(() => command(rooms,a,{kind:'start'})).toThrow(/présents/);
  });
  it('réinitialise Prêt après modification des paramètres et refuse les réglages non autorisés', () => {
    const rooms=new Rooms(); const a=rooms.create('Camille',2,'normal',0).session!, b=rooms.join(a.room,'Daniel','player',0).session!;
    command(rooms,a,{kind:'ready',ready:true}); command(rooms,b,{kind:'ready',ready:true});
    expect(() => command(rooms,b,{kind:'configure',count:3,difficulty:'facile'})).toThrow(/responsable/);
    const result=command(rooms,a,{kind:'configure',count:3,difficulty:'facile'}); expect(result.room.members.every(m=>!m.ready)).toBe(true); expect(result.room.difficulty).toBe('facile');
  });
  it('récupère sur un autre appareil et invalide l’ancienne connexion', () => {
    const {rooms,host,room}=started(); const id=host.member;
    const recovered=rooms.resume(host.room,undefined,host.recovery,1000);
    expect(recovered.session!.member).toBe(id); expect(recovered.room.game!.id).toBe(room.game!.id);
    expect(() => rooms.poll(host.room,host.token,1000)).toThrow(/remplacée/);
    expect(() => rooms.resume(host.room,undefined,host.room,1000)).toThrow(/invalide/);
    expect(rooms.poll(host.room,recovered.session!.token,1000).room.members).toHaveLength(2);
  });
  it('persiste les parties avec empreintes des secrets et reprend sans changer l’échéance', () => {
    let saved: RoomSnapshot | undefined; const rooms=new Rooms(s=>saved=structuredClone(s));
    const host=rooms.create('Camille',2,'normal',0).session!; const guest=rooms.join(host.room,'Daniel','player',0).session!;
    command(rooms,host,{kind:'ready',ready:true}); command(rooms,guest,{kind:'ready',ready:true}); command(rooms,host,{kind:'start'});
    const raw=JSON.stringify(saved); expect(raw).not.toContain(host.token); expect(raw).not.toContain(host.recovery);
    const restart=new Rooms(()=>{},saved,1000); const view=restart.resume(host.room,host.token,undefined,1000).room;
    expect(view.game!.deadline).toBe(300_000); expect(view.members[0].id).toBe(host.member);
  });
});
describe('sauvegarde atomique', () => {
  it('ne laisse pas une place fantôme lorsque l’écriture échoue', () => {
    let fail = false;
    const rooms = new Rooms(() => { if (fail) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); });
    const host = rooms.create('Camille',2,'normal',0).session!;
    fail = true; expect(() => rooms.join(host.room,'Daniel','player',0)).toThrow('disk full');
    expect(rooms.rooms.get(host.room)!.members).toHaveLength(1);
    fail = false; expect(rooms.join(host.room,'Daniel','player',0).room.members).toHaveLength(2);
  });
});
describe('serveur autoritaire et fin', () => {
  it('ferme les sièges après démarrage mais accepte les spectateurs', () => {
    const {rooms,host}=started(); expect(() => rooms.join(host.room,'Autres','player',0)).toThrow(/commencé/);
    const spectator=rooms.join(host.room,'Spectateur','spectator',0).session!;
    expect(() => command(rooms,spectator,{kind:'ready',ready:true})).toThrow(/spectateurs/);
    expect(() => command(rooms,spectator,{kind:'move',move:{kind:'pivot',crateId:20,quarterTurns:1},event:1})).toThrow(/spectateurs/);
  });
  it('valide le joueur actif, synchronise les coups et empêche leur duplication', () => {
    const {rooms,players,room}=started(); const g=room.game!; const active=players[g.activePlayer], other=players[1-g.activePlayer];
    const move=opening(g); const c={kind:'move',move,event:g.events.length} as const;
    expect(() => command(rooms,other,c)).toThrow(/tour/);
    const requestId=randomUUID(); const result=command(rooms,active,c,0,requestId);
    expect(result.room.game!.movesMade).toBe(1); command(rooms,active,c,0,requestId); expect(room.game!.movesMade).toBe(1);
    expect(() => command(rooms,active,c)).toThrow(/changé/);
    expect(rooms.poll(other.room,other.token,0).room.game!.board).toEqual(room.game!.board);
  });
  it('rejette une commande malformée sans changer l’état', () => {
    const {rooms,players,room}=started(); const active=players[room.game!.activePlayer];
    for(const move of [{kind:'pivot',crateId:100,quarterTurns:1},{kind:'chute',crateId:20,direction:'diagonale',quarterTurns:0},{kind:'pivot',crateId:20,quarterTurns:0}]) {
      expect(() => command(rooms,active,{kind:'move',move:move as never,event:room.game!.events.length})).toThrow();
    } expect(room.game!.movesMade).toBe(0);
  });
  it('accepte une action reçue exactement à l’échéance serveur', () => {
    const {rooms,players,room}=started(); const g=room.game!; const active=players[g.activePlayer]; live(rooms,g.deadline);
    const result=command(rooms,active,{kind:'move',move:opening(g),event:g.events.length},g.deadline);
    expect(result.room.game!.movesMade).toBe(1); expect(result.room.game!.events.at(-1)!.at).toBe(g.deadline);
  });
  it('applique le délai sans pause et restaure les scores après déconnexion', () => {
    const {rooms,players,room}=started(); const before=structuredClone(room.game!); const active=players[before.activePlayer];
    command(rooms,active,{kind:'move',move:opening(before),event:before.events.length}); rooms.disconnect(active.room,active.token,1000);
    rooms.sweep(before.deadline+1); expect(room.game!.phase).toBe('terminée'); expect(room.game!.board).toEqual(before.board);
    expect(room.game!.players[before.activePlayer].abandonedAt).toBe(1); expect(room.game!.events.some(e=>e.reverted)).toBe(true);
  });
  it('la reconnexion ne redémarre jamais le chronomètre', () => {
    const {rooms,players,room}=started(); const active=players[room.game!.activePlayer];
    rooms.disconnect(active.room,active.token,10_000); const result=rooms.resume(active.room,active.token,undefined,100_000);
    expect(result.room.game!.deadline).toBe(300_000); expect(result.room.game!.turnStartedAt).toBe(0);
  });
  it('autorise un abandon hors tour sans annuler les coups du joueur actif', () => {
    const {rooms,players,room}=started(3); const active=players[room.game!.activePlayer], other=players[(room.game!.activePlayer+1)%3];
    command(rooms,active,{kind:'move',move:opening(room.game!),event:room.game!.events.length}); const board=structuredClone(room.game!.board);
    command(rooms,other,{kind:'abandon',event:room.game!.events.length}); expect(room.game!.board).toEqual(board); expect(room.game!.movesMade).toBe(1);
    expect(room.game!.players.find(p=>p.name===room.members.find(m=>m.id===other.member)!.name)!.abandonedAt).toBe(1);
  });
  it('fait expirer les codes à la fin et ferme l’observation après une minute', () => {
    const {rooms,host,players,room}=started(); const spectator=rooms.join(host.room,'Spectateur','spectator',0).session!;
    command(rooms,players[room.game!.activePlayer],{kind:'abandon',event:room.game!.events.length},1000);
    expect(() => rooms.join(host.room,'Autres','spectator',1000)).toThrow(/expiré/);
    expect(() => rooms.resume(host.room,undefined,host.recovery,1000)).toThrow(/expiré/);
    expect(rooms.poll(spectator.room,spectator.token,2000).room.status).toBe('finished');
    live(rooms,60_999); expect(rooms.poll(spectator.room,spectator.token,60_999).room.status).toBe('finished');
    rooms.sweep(61_000); expect(rooms.rooms.has(host.room)).toBe(false);
  });
});
const servers: ReturnType<typeof onlineServer>[]=[];
afterEach(async()=>{ await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());}))); });
describe('API HTTP', () => {
  async function endpoint() { const server=onlineServer(new Rooms(),{origins:['http://allowed.test']}); servers.push(server); await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve)); const address=server.address() as {port:number}; return `http://127.0.0.1:${address.port}`; }
  it('crée et récupère une partie entre clients HTTP réels sans exposer de secrets', async () => {
    const base=await endpoint(); const post=async(path:string,data:unknown)=>fetch(base+'/api/online/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const created=await (await post('create',{name:'Camille',count:2,difficulty:'normal'})).json();
    const joined=await (await post('join',{room:created.room.code,name:'Daniel',role:'player'})).json();
    expect(joined.room.members).toHaveLength(2); const resumed=await (await post('resume',{room:created.room.code,recovery:created.session.recovery})).json();
    expect(resumed.session.member).toBe(created.session.member); expect((await post('poll',{room:created.room.code,token:created.session.token})).status).toBe(401);
    const poll=await (await post('poll',{room:created.room.code,token:resumed.session.token})).json(); expect(poll.session).toBeUndefined(); expect(poll.room.members[0].tokenHash).toBeUndefined();
  });
  it('rejette les origines non autorisées et les requêtes invalides', async () => {
    const base=await endpoint(); expect((await fetch(base+'/api/online/create',{method:'POST',headers:{Origin:'http://evil.test','Content-Type':'application/json'},body:'{}'})).status).toBe(403);
    expect((await fetch(base+'/api/online/create',{method:'POST',headers:{'Content-Type':'application/json'},body:'not-json'})).status).toBe(400);
    expect((await fetch(base+'/api/online/create',{method:'POST',body:'{}'})).status).toBe(415);
    const allowed=await fetch(base+'/api/online/create',{method:'OPTIONS',headers:{Origin:'http://allowed.test'}}); expect(allowed.status).toBe(204); expect(allowed.headers.get('access-control-allow-origin')).toBe('http://allowed.test');
  });
  it('limite les tentatives de récupération personnelles', async () => {
    const base=await endpoint(); for(let i=0;i<10;i++) await fetch(base+'/api/online/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:'ABCDEFG2',recovery:'ABCDEFG3'})});
    const response=await fetch(base+'/api/online/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:'ABCDEFG2',recovery:'ABCDEFG3'})}); expect(response.status).toBe(429);
  });
});
