import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../src/engine/catalogue';
import { abandon, clone, createGame, customs, gainsForMove, playMove, ranking, resumeGame, snapshotOf, tick, TURN_DURATION } from '../src/engine/game';
import { at, connected, faceAt, groups, initialBoard, roll, stateKey, top, VALID_ORIENTATIONS, visible, yaw } from '../src/engine/geometry';
import { candidates, evaluateMove, hasContinuation } from '../src/engine/moves';
import { COLORS, type Game, type Move } from '../src/engine/types';
import { upgradeSave, validateSave } from '../src/storage/save';
import { beforeRoll, cube, fixture } from './helpers';
const move = (g: Game, m: Move) => playMove(g, m, 1100);
const resetTurn = (g: Game) => { g.movesMade = 0; g.phase = 'mouvements'; g.visited = Object.fromEntries(g.board.map(c => [c.id, [stateKey(c)]])); g.snapshot = snapshotOf(g); return g; };
describe('Catalogue, préparation et orientation (AC-01, 21, 22)', () => {
  it('transcrit les 162 faces, trois caisses spéciales et 33 faces de chaque couleur', () => {
    expect(CATALOGUE).toHaveLength(27); expect(new Set(CATALOGUE.map(c => c.name)).size).toBe(27);
    expect(CATALOGUE[0].faces).toEqual([null, 'bleu', 'jaune', 'jaune', 'vert', 'bleu']);
    for (const c of CATALOGUE) { expect(c.faces.filter(f => f === null)).toHaveLength([5, 14, 23].includes(c.id) ? 2 : 1); expect(new Set(c.faces.filter(Boolean)).size).toBe([5, 14, 23].includes(c.id) ? 4 : 3); }
    for (const color of COLORS) expect(CATALOGUE.flatMap(c => c.faces).filter(c => c === color)).toHaveLength(33);
  });
  it('place le premier cube au nord-est et les centres à chaque niveau', () => { const b = initialBoard(); expect(b[0]).toMatchObject({ x: 1, y: 1, z: 0 }); expect(b[2]).toMatchObject({ x: -1, y: 1 }); expect(b[4]).toMatchObject({ x: 0, y: 0, z: 0 }); expect(b[13]).toMatchObject({ x: 0, y: 0, z: 1 }); expect(b[22]).toMatchObject({ x: 0, y: 0, z: 2 }); expect(b.every(c => top(c) === null)).toBe(true); });
  it.each([2, 3, 4])('tire des couleurs distinctes pour %i joueurs et conserve 300 secondes', n => { const g = createGame(Array(n).fill('Docker'), 1000, () => .3); expect(new Set(g.players.map(p => p.color)).size).toBe(n); expect(g.deadline).toBe(301000); expect(g.customsId).toBeNull(); expect(g.movesMade).toBe(0); });
  it('refuse un nombre de joueurs hors limites', () => { expect(() => createGame(['A'])).toThrow(); expect(() => createGame(Array(5).fill('A'))).toThrow(); });
  it('ne permet que les 24 orientations physiques, sans miroir', () => { expect(VALID_ORIENTATIONS.size).toBe(24); const o = initialBoard()[0].orientation; expect(yaw(o, 4)).toEqual(o); expect(roll(roll(o, 'nord'), 'sud')).toEqual(o); expect(roll(o, 'est')).toEqual([4, 1, 0, 3, 5, 2]); });
  it('le pivot conserve une face physique supérieure même avec couleurs répétées', () => { const c = cube(1, 0, 0, 0, 'bleu'); const changed = { ...c, orientation: yaw(c.orientation, 1) }; expect(changed.orientation[0]).toBe(c.orientation[0]); expect(top(changed)).toBe('bleu'); expect(faceAt(changed, 1)).toBe(faceAt(c, 4)); });
});
describe('Bascule, chute, pivot et Douane (AC-02–07, 15, 23, 25, 29, 32, 34)', () => {
  it('impose la chute d’ouverture au sommet', () => { const g = createGame(['A', 'B'], 1000); expect(evaluateMove(g, { kind: 'pivot', crateId: 19, quarterTurns: 1 }).ok).toBe(false); const options = candidates(g); expect(options.length).toBeGreaterThan(0); expect(options.every(m => m.kind === 'chute' && m.crateId >= 19)).toBe(true); });
  it('une chute initiale préserve le dessus et permet le premier tour normal', () => { const g = createGame(['A', 'B'], 1000); const m = candidates(g)[0]; const next = move(g, m); expect(top(next.board.find(c => c.id === m.crateId)!)).toBeNull(); expect(next.opened).toBe(true); expect(next.movesMade).toBe(1); expect(next.players.every(p => p.score === 0)).toBe(true); });
  it.each(['pivot','bascule','chute'] as const)('une caisse surmontée ne peut effectuer %s', kind => { const g = fixture([cube(1, 0, 0), cube(2, 0, 0, 1)]); const m: Move = kind === 'pivot' ? { kind, crateId: 1, quarterTurns: 1 } : kind === 'chute' ? { kind, crateId: 1, direction: 'est', quarterTurns: 0 } : { kind, crateId: 1, direction: 'est' }; expect(evaluateMove(g, m).reason).toContain('repose dessus'); });
  it.each(['nord', 'est', 'sud', 'ouest'] as const)('roule orthogonalement vers %s sur un sol libre', direction => { const g = fixture([cube(1, 0, 0)]); const result = evaluateMove(g, { kind: 'bascule', crateId: 1, direction }); expect(result.ok).toBe(true); expect(result.moved!.z).toBe(0); expect(result.moved!.orientation).toEqual(roll(g.board[0].orientation, direction)); });
  it('refuse les diagonales et destinations occupées', () => { const g = fixture([cube(1, 0, 0), cube(2, 1, 0)]); expect(evaluateMove(g, { kind: 'bascule', crateId: 1, direction: 'est' }).reason).toContain('occupée'); expect(evaluateMove(g, { kind: 'bascule', crateId: 1, direction: 'diagonale' } as unknown as Move).reason).toContain('diagonales'); });
  it('ne permet pas de sortir du plateau, à tous les étages', () => { for (const z of [0,1,2]) { const g = fixture([cube(1,3,0,z)]); expect(evaluateMove(g, z ? {kind:'chute',crateId:1,direction:'est',quarterTurns:0} : {kind:'bascule',crateId:1,direction:'est'}).reason).toContain('7 × 7'); } });
  it('une chute descend au premier support et offre un pivot libre au contact', () => { const g = fixture([cube(1, 0, 0, 2, 'bleu'), cube(2, 1, 0, 0), cube(3, 1, 1, 1)]); const a = evaluateMove(g, { kind:'chute', crateId:1, direction:'est', quarterTurns:0 }); const b = evaluateMove(g, { kind:'chute', crateId:1, direction:'est', quarterTurns:3 }); expect(a.moved).toMatchObject({x:1,y:0,z:1}); expect(b.moved).toMatchObject({x:1,y:0,z:1}); expect(b.moved!.orientation[0]).toBe(g.board[0].orientation[0]); expect(a.moved!.orientation).not.toEqual(b.moved!.orientation); });
  it('descend au sol sans support et refuse de présenter cette chute comme bascule', () => { const g = fixture([cube(1, 0, 0, 2)]); expect(evaluateMove(g, {kind:'chute',crateId:1,direction:'est',quarterTurns:0}).moved!.z).toBe(0); expect(evaluateMove(g, {kind:'bascule',crateId:1,direction:'est'}).reason).toContain('chute'); });
  it('le pivot autonome reste possible au contact de la Douane hors groupe', () => { const g = fixture([cube(1,0,0,0,'bleu'),cube(7,1,0,0,'bleu')]); g.board[1]=cube(7,1,0,0,'rouge'); g.customsId=7; expect(evaluateMove(g,{kind:'pivot',crateId:1,quarterTurns:1}).ok).toBe(true); expect(evaluateMove(g,{kind:'bascule',crateId:1,direction:'est'}).ok).toBe(false); });
  it('refuse le pivot sans changement et tout mouvement de la Douane', () => { const g=fixture([cube(1,0,0,1)]); expect(evaluateMove(g,{kind:'pivot',crateId:1,quarterTurns:4} as unknown as Move).ok).toBe(false); g.customsId=1; for(const m of [{kind:'pivot',crateId:1,quarterTurns:1},{kind:'bascule',crateId:1,direction:'est'},{kind:'chute',crateId:1,direction:'est',quarterTurns:0}] as Move[]) expect(evaluateMove(g,m).reason).toContain('Douane'); });
  it('interdit une chute sur la Douane même depuis un étage plus haut', () => { const g=fixture([cube(1,0,0,2),cube(2,1,0,0)]); g.customsId=2; expect(evaluateMove(g,{kind:'chute',crateId:1,direction:'est',quarterTurns:0}).reason).toContain('Douane'); });
  it('ne vérifie pas le volume balayé d’une bascule', () => { const g=fixture([cube(1,0,0),cube(2,1,1)]); expect(evaluateMove(g,{kind:'bascule',crateId:1,direction:'est'}).ok).toBe(true); });
});
describe('Groupes, score et déblocage (AC-08–13, 24, 30, 31, 42)', () => {
  it('ne groupe que les dessus visibles par contact latéral au même étage', () => { expect(groups([cube(1,0,0,0,'bleu'),cube(7,1,1,0,'bleu')])).toHaveLength(0); expect(groups([cube(1,0,0,0,'bleu'),cube(7,0,0,1,'bleu')])).toHaveLength(0); expect(groups([cube(1,0,0,0,null),cube(7,1,0,0,null)])).toHaveLength(0); expect(groups([cube(1,0,0,0,'bleu'),cube(7,1,0,0,'bleu')])[0].ids).toEqual([1,7]); });
  it.each([0,1,2])('crédite une paire au niveau %i, au propriétaire même adverse', z => { const g=fixture([beforeRoll(2,-1,0,'est','bleu',z),cube(1,1,0,z,'bleu')]); if(z)g.board.push(cube(3,0,0,z-1)); const result=evaluateMove(g,{kind:'bascule',crateId:2,direction:'est'}); const gains=gainsForMove(g,{...g,board:result.board!},{kind:'bascule',crateId:2,direction:'est'}); expect(gains[0]).toMatchObject({playerId:0,points:[2,6,10][z]}); });
  it('figure 7 : 3 puis 4 points, puis masquage et gain rouge de 2', () => {
    const A=beforeRoll(2,-1,-1,'nord','bleu'), B=cube(1,0,0,0,'bleu'), C=cube(7,1,0,0,'bleu'), D=beforeRoll(12,2,1,'sud','bleu');
    const E=cube(5,1,1,1), F=cube(9,2,2,0,'rouge'), support=cube(3,1,1);
    let g=fixture([A,B,C,D,E,F,support]); g=move(g,{kind:'bascule',crateId:2,direction:'nord'}); expect(g.players[0].score).toBe(3);
    g=move(g,{kind:'bascule',crateId:12,direction:'sud'}); expect(g.players[0].score).toBe(7);
    g=resetTurn(g); g=move(g,{kind:'bascule',crateId:5,direction:'sud'}); expect(visible(g.board,g.board.find(c=>c.id===7)!)).toBe(false); expect(groups(g.board).some(group=>group.ids.includes(12))).toBe(false);
    // D's south face after its previous roll must become red on the north roll. Set a physically valid reference orientation for the second printed sub-scenario.
    g.board=g.board.map(c=>c.id===12?beforeRoll(12,2,0,'nord','rouge'):c); g=resetTurn(g);
    g=move(g,{kind:'bascule',crateId:12,direction:'nord'}); expect(g.players[1].score).toBe(2); expect(g.players[0].score).toBe(7);
  });
  it('figure 8 : chute de A débloque B, paire verte au niveau 1 = 6', () => {
    const A=cube(2,0,0,1,'rouge'),B=beforeRoll(9,1,0,'nord','vert',1),C=cube(5,1,2,1,'vert');
    // B's starting red top is required in this figure; choose an orientation satisfying both faces.
    const orientation=[...VALID_ORIENTATIONS].map(o=>o.split(',').map(Number) as typeof B.orientation).find(o=>CATALOGUE[8].faces[o[0]]==='rouge' && CATALOGUE[8].faces[roll(o,'nord')[0]]==='vert')!; B.orientation=orientation;
    let g=fixture([A,B,C,cube(1,0,0),cube(3,1,0),cube(4,1,1),cube(6,1,2)]);
    expect(groups(g.board).some(group=>group.ids.includes(9))).toBe(true); g=move(g,{kind:'chute',crateId:2,direction:'ouest',quarterTurns:0}); expect(groups(g.board).some(group=>group.ids.includes(9))).toBe(false);
    g=move(g,{kind:'bascule',crateId:9,direction:'nord'}); expect(g.players[3].score).toBe(6);
  });
  it('fusion de deux paires compte les cinq caisses une fois', () => { const g=fixture([cube(1,-2,0,0,'bleu'),cube(7,-1,0,0,'bleu'),cube(12,1,0,0,'bleu'),cube(2,2,0,0,'bleu'),beforeRoll(5,0,-1,'nord','bleu')]); const next=move(g,{kind:'bascule',crateId:5,direction:'nord'}); expect(next.players[0].score).toBe(5); expect(next.events.find(e=>e.kind==='mouvement')!.gains).toHaveLength(1); });
  it('ne recompte pas un groupe inchangé quand une autre caisse pivote', () => { const g=fixture([cube(1,0,0,0,'bleu'),cube(7,1,0,0,'bleu'),cube(2,0,1)]); const next=move(g,{kind:'pivot',crateId:2,quarterTurns:1}); expect(next.players[0].score).toBe(0); });
  it('les couleurs sans joueur bloquent mais ne créditent personne', () => { const g=fixture([cube(5,0,0,0,'vert'),cube(9,1,0,0,'vert')],2); expect(evaluateMove(g,{kind:'bascule',crateId:5,direction:'ouest'}).reason).toContain('rangée'); const before=fixture([beforeRoll(5,0,-1,'nord','vert'),cube(9,1,0,0,'vert')],2); const next=move(before,{kind:'bascule',crateId:5,direction:'nord'}); expect(next.players.map(p=>p.score)).toEqual([0,0]); });
  it('dévoilement bleu + groupe rouge : crédits ordonnés et nouveau gain possible', () => {
    const g=fixture([cube(1,0,0,0,'bleu'),cube(7,1,0,0,'bleu'),cube(2,0,0,1,'rouge'),cube(9,-2,0,0,'rouge')]);
    const m:Move={kind:'chute',crateId:2,direction:'ouest',quarterTurns:0}; const next=move(g,m); const gains=next.events[0].gains!;
    expect(gains.map(g=>g.color)).toEqual(['rouge','bleu']); expect(next.players.map(p=>p.score)).toEqual([2,2,0,0]);
    const previouslyCredited=clone(g); previouslyCredited.players[0].score=8; const again=move(previouslyCredited,m); expect(again.players[0].score).toBe(10);
  });
  it('un masquage libère une caisse au sol sans effacer les gains', () => { const g=fixture([cube(1,0,0,0,'bleu'),cube(7,1,0,0,'bleu'),cube(5,1,1,1),cube(3,1,1)]); g.players[0].score=8; const next=move(g,{kind:'bascule',crateId:5,direction:'sud'}); expect(groups(next.board)).toHaveLength(0); expect(evaluateMove(next,{kind:'bascule',crateId:1,direction:'ouest'}).ok).toBe(true); expect(next.players[0].score).toBe(8); });
});
describe('Tours, recherche de suite, histoire et terminal (AC-16–18)', () => {
  it('contact vertical compte, diagonale et deux amas distincts ne comptent pas', () => { expect(connected([cube(1,0,0),cube(2,0,0,1)])).toBe(true); expect(connected([cube(1,0,0),cube(2,1,1)])).toBe(false); expect(connected([cube(1,0,0),cube(2,1,0),cube(3,3,3),cube(4,2,3)])).toBe(false); });
  it('autorise une déconnexion temporaire mais exige la reconnexion au troisième coup', () => { const g=fixture([cube(1,0,0),cube(2,1,0)]); const first=move(g,{kind:'bascule',crateId:1,direction:'nord'}); expect(connected(first.board)).toBe(false); expect(first.phase).toBe('mouvements'); const second=move(first,{kind:'pivot',crateId:1,quarterTurns:1}); expect(second.movesMade).toBe(2); expect(evaluateMove(second,{kind:'pivot',crateId:1,quarterTurns:1}).reason).toContain('réunir'); expect(candidates(second).some(m=>evaluateMove(second,m).ok)).toBe(true); });
  it('mémorise les orientations, les coups intercalés ne permettent pas un retour exact', () => { let g=fixture([cube(1,0,0),cube(2,1,0)]); g=move(g,{kind:'pivot',crateId:1,quarterTurns:1}); g=move(g,{kind:'pivot',crateId:2,quarterTurns:1}); expect(evaluateMove(g,{kind:'pivot',crateId:1,quarterTurns:3}).reason).toContain('déjà occupé'); expect(evaluateMove(g,{kind:'pivot',crateId:1,quarterTurns:1}).ok).toBe(true); });
  it('recherche une séquence complète, pas seulement un coup', () => {
    const g=fixture([cube(1,0,0,1,'bleu'),cube(7,0,0,0,'bleu')]);
    g.visited[1]=[stateKey(g.board[0]),...candidates(g,1).filter(m=>!(m.kind==='chute' && m.direction==='est' && m.quarterTurns===0)).map(m=>stateKey(evaluateMove(g,m).moved!))];
    expect(candidates(g)).toHaveLength(1); expect(hasContinuation(g)).toBe(false);
  });
  it('conserve les gains d’une impasse normale, sans restaurer', () => { const g=fixture([cube(1,0,0,1,'bleu'),cube(7,0,0,0,'bleu')]); g.players[0].score=10; const next=move(g,{kind:'chute',crateId:1,direction:'est',quarterTurns:0}); expect(next.phase).toBe('terminée'); expect(next.board[0].z).toBe(0); expect(next.players[0].score).toBe(12); expect(next.result!.winners).toEqual([0]); });
  it('partage une victoire à égalité', () => { const g=fixture([cube(1,0,0,1,'bleu'),cube(7,0,0,0,'bleu')]); g.players.slice(1).forEach(p=>p.score=2); const next=move(g,{kind:'chute',crateId:1,direction:'est',quarterTurns:0}); expect(next.result!.winners).toEqual([0,1,2,3]); });
});
describe('Douane, délai inclusif, abandon et scores restaurés (AC-14, 27, 33, 35, 37–43)', () => {
  it('nécessite trois coups avant de décider la Douane, puis un premier placement', () => { const g=fixture([cube(1,0,0),cube(2,1,0)]); expect(()=>customs(g,1,1000)).toThrow('trois coups'); g.movesMade=3;g.phase='douane';expect(()=>customs(g,null,1000)).toThrow('obligatoire'); const next=customs(g,1,1000); expect(next.customsId).toBe(1);expect(next.turn).toBe(3);expect(next.movesMade).toBe(0); });
  it('maintien du jeton autorisé et placement sur caisse recouverte refusé', () => { const g=fixture([cube(1,0,0),cube(2,1,0),cube(3,0,0,1)]);g.phase='douane';g.movesMade=3;g.customsId=2;expect(()=>customs(g,1,1000)).toThrow('recouvert');expect(customs(g,null,1000).customsId).toBe(2); });
  it('accepte à l’échéance exacte et expire strictement après', () => { const g=fixture([cube(1,0,0),cube(2,1,0)],2);const next=playMove(g,{kind:'pivot',crateId:1,quarterTurns:1},g.deadline);expect(next.movesMade).toBe(1);expect(tick(g,g.deadline)).toBe(g);expect(tick(g,g.deadline+1).phase).toBe('terminée'); });
  it('trois coups ne suffisent pas sans Douane dans le même délai', () => { const g=fixture([cube(1,0,0),cube(2,1,0)],2);g.movesMade=3;g.phase='douane';const next=tick(g,g.deadline+1);expect(next.players[0].abandonedAt).toBe(1);expect(next.result!.winners).toEqual([1]); });
  it('Douane à l’échéance exacte termine le tour et démarre 300 secondes pour le suivant', () => { const g=fixture([cube(1,0,0),cube(2,1,0)]);g.movesMade=3;g.phase='douane';const next=customs(g,1,g.deadline);expect(next.activePlayer).toBe(1);expect(next.deadline).toBe(g.deadline+TURN_DURATION); });
  it.each([1,2,3])('restaure plateau et tous les gains après %i coups puis abandon', n => { const g=fixture([cube(1,0,0),cube(2,1,0)]);g.players[0].score=10;g.players[1].score=12;g.snapshot=snapshotOf(g);let playing=move(g,{kind:'pivot',crateId:1,quarterTurns:1});playing.movesMade=n;if(n===3)playing.phase='douane';playing.players[0].score+=3;playing.players[1].score+=6;const restored=abandon(playing,2000);expect(restored.board).toEqual(g.board);expect(restored.players.map(p=>p.score)).toEqual([10,12,0,0]);expect(restored.events[0].reverted).toBe(true);expect(restored.movesMade).toBe(0);expect(restored.activePlayer).toBe(1);expect(restored.deadline).toBe(302000); });
  it('la première Douane est transmise si le premier joueur abandonne', () => { const g=createGame(['A','B','C'],1000,()=>.1);const next=abandon(g,2000);expect(next.customsId).toBeNull();expect(next.opened).toBe(false);expect(candidates(next).every(m=>m.kind==='chute')).toBe(true);next.movesMade=3;next.phase='douane';expect(()=>customs(next,null,2000)).toThrow('obligatoire'); });
  it('saute les joueurs abandonnés et le dernier gagne indépendamment des scores', () => { let g=fixture([cube(1,0,0),cube(2,1,0)]);g.players[0].score=999;g.snapshot=snapshotOf(g);g=abandon(g,2000);g=abandon(g,3000);g=abandon(g,4000);expect(g.result!.winners).toEqual([3]);expect(ranking(g).map(v=>v.player.id)).toEqual([3,2,1,0]);expect(ranking(g).map(v=>v.rank)).toEqual([1,2,3,4]); });
  it('une couleur abandonnée ne reçoit plus de nouveaux points', () => { const g=fixture([beforeRoll(2,-1,0,'est','bleu'),cube(1,1,0,0,'bleu')]);g.players[0].abandonedAt=1;g.activePlayer=1;const next=move(g,{kind:'bascule',crateId:2,direction:'est'});expect(next.players[0].score).toBe(0);expect(groups(next.board)).toHaveLength(1); });
});
describe('Sauvegarde cohérente et refus sans mutation', () => {
  it('accepte une partie complète et refuse catalogue, version, orientation et support invalides', () => { const g=createGame(['A','B'],1000);expect(validateSave(g)).toBe(true);const bad=clone(g);bad.board[0].orientation=[0,1,4,3,2,5];expect(validateSave(bad)).toBe(false); const badId=clone(g);badId.board[0].id=100;expect(validateSave(badId)).toBe(false);const corrupt=clone(g);corrupt.deadline++;expect(validateSave(corrupt)).toBe(false); });
  it('enregistre un tour incomplet sans exiger connexité finale', () => { const g=createGame(['A','B'],1000);const next=move(g,candidates(g)[0]);expect(validateSave(next)).toBe(true);expect(next.visited).not.toEqual(g.visited); });
  it('conserve l’original lors d’un refus et d’un mouvement accepté', () => { const g=createGame(['A','B'],1000);const original=clone(g);expect(()=>move(g,{kind:'pivot',crateId:1,quarterTurns:1})).toThrow();expect(g).toEqual(original);move(g,candidates(g)[0]);expect(g).toEqual(original); });
  it('une partie terminée par abandon se restaure avec ses scores et gagnants', () => { const g=createGame(['A','B'],1000);const after=abandon(move(g,candidates(g)[0]),2000);expect(validateSave(after)).toBe(true); });
});


describe('Parties complètes et intégrité du journal', () => {
  it('contrôle tous les états d’une partie de 27 caisses sur plusieurs tours', () => {
    let g = createGame(['A', 'B', 'C', 'D'], 1000, () => .25);
    let seed = 12345; let changes = 0;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 80 && g.phase !== 'terminée'; i++) {
      if (g.phase === 'douane') { const exposed = g.board.filter(c => visible(g.board, c)); g = customs(g, exposed[Math.floor(random() * exposed.length)].id, 1000 + i); }
      else { const options = candidates(g); expect(options.length).toBeGreaterThan(0); g = playMove(g, options[Math.floor(random() * options.length)], 1000 + i); changes++; }
      expect(g.board).toHaveLength(27); expect(new Set(g.board.map(c => `${c.x},${c.y},${c.z}`)).size).toBe(27);
      expect(g.board.every(c => c.z === 0 || !!at(g.board, c.x, c.y, c.z - 1))).toBe(true);
      expect(validateSave(g)).toBe(true);
      if (g.phase === 'douane') expect(connected(g.board)).toBe(true);
    }
    expect(changes).toBeGreaterThan(3);
  });
  it('rejette un score ou un instantané incohérent avec les gains confirmés', () => { const g = createGame(['A', 'B'], 1000); const corrupt = clone(g); corrupt.players[0].score = 10; expect(validateSave(corrupt)).toBe(false); const wrongStart = clone(g); wrongStart.snapshot.scores[0] = 2; expect(validateSave(wrongStart)).toBe(false); });
});


describe('modes de jeu et reprise', () => {
  it('conserve le mode choisi après mouvement et abandon', () => {
    for (const difficulty of ['normal', 'facile'] as const) {
      const g = createGame(['A','B','C'], 1000, () => .2, difficulty);
      expect(g.difficulty).toBe(difficulty); expect(validateSave(g)).toBe(true);
      const moved = move(g, candidates(g)[0]); expect(moved.difficulty).toBe(difficulty);
      expect(abandon(moved, 2000).difficulty).toBe(difficulty);
    }
  });
  it('reprend les anciennes parties en Facile sans modifier les données originales', () => {
    const legacy = createGame(['A','B'], 1000) as Partial<Game>;
    delete legacy.difficulty;
    const upgraded = upgradeSave(legacy) as Game;
    expect(validateSave(upgraded)).toBe(true); expect(upgraded.difficulty).toBe('facile');
    expect(legacy.difficulty).toBeUndefined(); expect(upgraded.board).toEqual(legacy.board);
  });
  it('refuse les modes invalides sans les traiter comme une sauvegarde ancienne', () => {
    const g = createGame(['A','B'], 1000); (g as unknown as {difficulty:string}).difficulty = 'autre';
    expect(validateSave(upgradeSave(g))).toBe(false);
  });
});


describe('caisse rangée : seule la chute est autorisée', () => {
  it.each([0,1,2])('interdit tous les pivots et bascules du groupe au niveau %i', z => {
    const g=fixture([cube(1,0,0,z,'bleu'),cube(7,1,0,z,'bleu')]);
    for(const quarterTurns of [1,2,3] as const) expect(evaluateMove(g,{kind:'pivot',crateId:1,quarterTurns}).reason).toContain('seule la chute');
    expect(evaluateMove(g,{kind:'bascule',crateId:1,direction:'ouest'}).reason).toContain('seule la chute');
    expect(candidates(g,1).every(m=>m.kind==='chute')).toBe(true);
    expect(evaluateMove(g,{kind:'chute',crateId:1,direction:'ouest',quarterTurns:2}).ok).toBe(z>0);
    if(z===0) expect(candidates(g)).toEqual([]);
    expect(()=>move(g,{kind:'pivot',crateId:1,quarterTurns:1})).toThrow('seule la chute');
  });
  it('un masquage débloque immédiatement le pivot de la caisse restante', () => {
    const g=fixture([cube(1,0,0,0,'bleu'),cube(7,1,0,0,'bleu')]);
    expect(evaluateMove(g,{kind:'pivot',crateId:1,quarterTurns:1}).ok).toBe(false);
    g.board.push(cube(2,1,0,1));
    expect(evaluateMove(g,{kind:'pivot',crateId:1,quarterTurns:1}).ok).toBe(true);
  });
  it('une couleur sans propriétaire reste bloquante pour le pivot', () => {
    const g=fixture([cube(5,0,0,0,'vert'),cube(9,1,0,0,'vert')],2);
    expect(evaluateMove(g,{kind:'pivot',crateId:5,quarterTurns:1}).reason).toContain('seule la chute');
  });
});


it('une reprise sans suite légale termine aux scores acquis, sans restauration', () => {
  const g=fixture([cube(1,0,0,0,'bleu'),cube(7,1,0,0,'bleu')]); g.players[0].score=7;
  const resumed=resumeGame(g,1100);
  expect(resumed.phase).toBe('terminée'); expect(resumed.players[0].score).toBe(7);
  expect(resumed.board).toEqual(g.board); expect(g.phase).toBe('mouvements');
  expect(resumeGame(resumed,1200)).toBe(resumed);
});
