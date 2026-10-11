import { uuid } from '../uuid';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Eye, Globe, LogOut, ShieldCheck } from 'lucide-react';
import { ranking } from '../engine/game';
import type { Difficulty } from '../engine/types';
import type { View } from '../components/Board';
import { GameStage } from '../components/GameStage';
import { Modal } from '../components/Modal';
import { forget, remember, remembered, request, RequestError } from './client';
import type { OnlineCommand, OnlineResponse, OnlineRoom, OnlineSession } from './types';
export function OnlineApp({ onBack }: { onBack: () => void }) {
  const [room, setRoom] = useState<OnlineRoom | null>(null); const [session, setSession] = useState<OnlineSession | null>(null);
  const sessionRef = useRef<OnlineSession | null>(null); const mounted = useRef(true); const replacing = useRef(false);
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [recovery, setRecovery] = useState('');
  const [count, setCount] = useState(2); const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [role, setRole] = useState<'player' | 'spectator'>('player'); const [screen, setScreen] = useState<'create' | 'join' | 'recover'>('create');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [connected, setConnected] = useState(false);
  const [clipboard, setClipboard] = useState(''); const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<View>('libre'); const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [modal, setModal] = useState<'leave' | 'help' | 'recovery' | null>(null); const [now, setNow] = useState(Date.now()); const offset = useRef(0);
  const roomRef = useRef<OnlineRoom | null>(null);
  function accept(value: OnlineResponse, previous?: OnlineSession) {
    if (!mounted.current) return;
    if (!roomRef.current || value.room.serverNow >= roomRef.current.serverNow) {
      offset.current = value.room.serverNow - Date.now(); setNow(value.room.serverNow);
      const previousGame = roomRef.current?.game;
      const nextRoom = previousGame && value.room.game?.id === previousGame.id && value.room.game.events.length === previousGame.events.length ? { ...value.room, game: previousGame } : value.room;
      roomRef.current = nextRoom; setRoom(nextRoom);
    }
    setConnected(true);
    if (value.session) {
      const next = { ...value.session, recovery: value.session.recovery ?? previous?.recovery ?? null };
      sessionRef.current = next; setSession(next); remember(next);
    }
  }
  async function copy(text: string) {
    try { if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(text); setClipboard('Code personnel copié. Conservez-le pour reprendre sur un autre appareil.'); }
    catch { setClipboard('Copie automatique indisponible. Utilisez « Copier » ou sélectionnez votre code personnel.'); }
  }
  async function restore(saved: OnlineSession, manual = false) {
    let value: OnlineResponse;
    try { value = await request('resume', { room: saved.room, token: saved.token }); }
    catch (e) {
      if (!manual || !(e instanceof RequestError) || e.status !== 401 || !saved.recovery) throw e;
      value = await request('resume', { room: saved.room, recovery: saved.recovery });
    }
    accept(value, saved); setError('');
  }
  useEffect(() => {
    mounted.current = true; let cancelled = false;
    const saved = remembered();
    if (saved) {
      setBusy(true); void request('resume', { room: saved.room, token: saved.token }).then(value => { if (!cancelled) accept(value, saved); }).catch(e => { if (!cancelled) { setError((e as Error).message); setScreen('recover'); setCode(saved.room); if (e instanceof RequestError && [404,410].includes(e.status)) forget(saved.token); } }).finally(() => { if (!cancelled) setBusy(false); });
    }
    const disconnect = () => { const current = sessionRef.current; if (current) void request('disconnect', { room: current.room, token: current.token }, true).catch(() => {}); };
    window.addEventListener('pagehide', disconnect);
    return () => { cancelled = true; mounted.current = false; window.removeEventListener('pagehide', disconnect); disconnect(); };
  }, []);
  useEffect(() => {
    if (!session) return; let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const value = await request('poll', { room: session!.room, token: session!.token }); if (!cancelled) { accept(value); setConnected(true); } }
      catch (e) {
        if (cancelled) return;
        setConnected(false); const err = e as RequestError;
        if (err.status === 428) {
          try { await restore(session!); } catch (failure) { setError((failure as Error).message); }
          return;
        }
        if ([401,404,410].includes(err.status)) {
          setError(err.message); forget(session!.token); // Do not auto-take over a replacement session.
          if ([404,410].includes(err.status)) { sessionRef.current = null; roomRef.current = null; setSession(null); setRoom(null); setModal(null); setError('Le salon est fermé. Ses codes ont expiré.'); }
          return;
        }
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    }
    timer = setTimeout(poll, 500);
    const clock = setInterval(() => setNow(Date.now() + offset.current), 200);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(clock); };
  }, [session]);
  const member = room?.members.find(m => m.id === session?.member);
  const game = room?.game; const player = member?.playerId !== null && member?.playerId !== undefined ? game?.players[member.playerId] : undefined;
  const spectator = member?.role === 'spectator' || player?.abandonedAt !== null && player?.abandonedAt !== undefined;
  const canPlay = connected && !!game && member?.playerId === game.activePlayer && !spectator;
  async function enter() {
    if (busy) return; setBusy(true); setError(''); setClipboard('');
    try {
      const value = screen === 'create' ? await request('create', { name, count, difficulty }) : screen === 'join' ? await request('join', { room: code, name, role }) : await request('resume', { room: code, recovery });
      accept(value); if (value.session?.recovery) { await copy(value.session.recovery); setModal('recovery'); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function command(c: OnlineCommand) {
    if (!session || busy || !connected) return; setBusy(true); setError('');
    try { accept(await request('command', { room: session.room, token: session.token, requestId: uuid(), command: c })); }
    catch (e) { setError((e as Error).message); try { accept(await request('poll', { room: session.room, token: session.token })); } catch {} }
    finally { setBusy(false); }
  }
  async function leave() {
    if (session) {
      try { await request('leave', { room: session.room, token: session.token }); }
      catch (e) { if (!(e instanceof RequestError) || ![401,404,410,428].includes(e.status)) { setError((e as Error).message); return; } }
    }
    if (session) forget(session.token); sessionRef.current = null; roomRef.current = null; setSession(null); setRoom(null); setModal(null); onBack();
  }
  return <div className={`online-app ${game && game.phase !== 'terminée' ? 'online-playing' : ''}`}>
    <div className="online-toolbar"><span><Globe size={17} /> {room ? `Partie privée ${room.code}` : 'Sur les quais, en ligne'}</span>{member && <span>{member.name} · {spectator ? 'Spectateur' : 'Joueur'}{!connected && ' · Déconnecté'}</span>}<div>{session?.recovery && game?.phase !== 'terminée' && <button onClick={() => setModal('recovery')}><ShieldCheck size={16} /> Mon code personnel</button>}<button onClick={() => room ? setModal('leave') : onBack()}>{room ? <LogOut size={16} /> : <ArrowLeft size={16} />}{room ? 'Quitter' : 'Retour au jeu local'}</button></div></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {room && !connected && game?.phase !== 'terminée' && <div className="online-offline" role="status">Le temps continue. <button disabled={busy} onClick={async () => { if (!session || replacing.current) return; replacing.current = true; setBusy(true); try { await restore(session, true); } catch (e) { setError((e as Error).message); } finally { replacing.current = false; setBusy(false); } }}>Reprendre ma place ici</button></div>}
    {!room ? <main className="online-entry"><div className="eyebrow">PARTIES PRIVÉES · SANS COMPTE</div><h1>Retrouvez vos dockers.</h1><p>Un pseudo, un code partagé et vos amis autour du même entrepôt.</p><div className="segmented">{([['create','Créer'],['join','Rejoindre'],['recover','Reprendre ma place']] as const).map(([key,label]) => <button key={key} onClick={() => setScreen(key)} className={screen === key ? 'active' : ''} aria-pressed={screen === key}>{label}</button>)}</div>
      <form className="online-form" onSubmit={e => { e.preventDefault(); void enter(); }}>
        {screen !== 'recover' && <label>Pseudo<input aria-label="Pseudo en ligne" value={name} onChange={e => setName(e.target.value)} required minLength={4} maxLength={80} autoComplete="nickname" /><small>4 à 20 caractères · unique dans le salon</small></label>}
        {screen !== 'create' && <label>Code de la partie<input aria-label="Code de la partie" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required minLength={8} maxLength={8} autoCapitalize="characters" spellCheck={false} /></label>}
        {screen === 'recover' && <label>Code personnel de récupération<input aria-label="Code personnel de récupération" value={recovery} onChange={e => setRecovery(e.target.value.toUpperCase())} required minLength={8} maxLength={8} autoCapitalize="characters" spellCheck={false} /><small>Ce code privé retrouve votre place sur cet appareil.</small></label>}
        {screen === 'create' && <><label>Nombre de joueurs<select value={count} onChange={e => setCount(Number(e.target.value))}>{[2,3,4].map(n => <option key={n} value={n}>{n} joueurs</option>)}</select></label><label>Mode<select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="normal">Normal</option><option value="facile">Facile</option></select></label></>}
        {screen === 'join' && <fieldset><legend>Participer comme</legend><label><input type="radio" name="role" checked={role === 'player'} onChange={() => setRole('player')} /> Joueur</label><label><input type="radio" name="role" checked={role === 'spectator'} onChange={() => setRole('spectator')} /> Spectateur <Eye size={16} /></label></fieldset>}
        <button className="primary" disabled={busy}>{busy ? 'Connexion…' : screen === 'create' ? 'Créer la partie privée' : screen === 'join' ? 'Rejoindre la partie' : 'Reprendre ma place'}<ArrowRight size={18} /></button>
      </form></main> : !game ? <main className="online-lobby"><div className="eyebrow">SALON PRIVÉ</div><h1>Tout le monde à bord ?</h1><p>Partagez ce code pour inviter vos joueurs et spectateurs.</p><div className="invite-code"><strong>{room.code}</strong><button aria-label="Copier le code de la partie" onClick={async () => { try { await navigator.clipboard.writeText(room.code); setError(''); } catch { setError('Sélectionnez le code pour le copier manuellement.'); } }}><Copy size={18} /></button></div>
      <ul className="online-members">{room.members.map(m => <li key={m.id}><strong>{m.name}{m.id === room.hostId && ' · Responsable'}</strong><span>{m.role === 'spectator' ? 'Spectateur' : !m.connected ? 'Place réservée · retour sous 60 s' : m.ready ? 'Prêt ✓' : 'En préparation'}</span></li>)}</ul>
      <p>{room.members.filter(m => m.role === 'player').length} / {room.count} joueurs · {room.difficulty === 'normal' ? 'Normal' : 'Facile'}</p>
      {member?.id === room.hostId && <div className="lobby-settings"><label>Places<select disabled={busy || !connected} value={room.count} onChange={e => void command({ kind: 'configure', count: Number(e.target.value), difficulty: room.difficulty })}>{[2,3,4].map(n => <option key={n} value={n}>{n} joueurs</option>)}</select></label><label>Mode<select disabled={busy || !connected} value={room.difficulty} onChange={e => void command({ kind: 'configure', count: room.count, difficulty: e.target.value as Difficulty })}><option value="normal">Normal</option><option value="facile">Facile</option></select></label></div>}
      {member?.role === 'player' && <button className={member.ready ? 'secondary' : 'primary'} disabled={busy || !connected} onClick={() => void command({ kind: 'ready', ready: !member.ready })}><Check size={18} />{member.ready ? 'Je ne suis plus prêt' : 'Je suis prêt'}</button>}
      {member?.id === room.hostId && <button className="primary" disabled={busy || !connected || room.members.filter(m => m.role === 'player').length < 2 || room.members.some(m => m.role === 'player' && (!m.connected || !m.ready))} onClick={() => void command({ kind: 'start' })}>Lancer la partie <ArrowRight size={18} /></button>}
      <p className="muted">Tous les joueurs présents doivent être prêts. Les spectateurs ne prennent pas de place.</p></main> : game.phase === 'terminée' ? <main className="final-screen"><div className="results"><h1>{game.result!.winners.length > 1 ? 'Victoire partagée !' : `${game.players[game.result!.winners[0]].name} gagne !`}</h1><p>{game.result!.reason}</p><ol>{ranking(game).map(({player:p,rank}) => <li key={p.id}><b>{rank}</b><span>{p.name}<small>{p.abandonedAt !== null ? 'Abandon' : 'En lice'}</small></span><strong>{p.score} pts</strong></li>)}</ol><p>Le code de la partie et les codes personnels ont expiré.</p><p role="timer">Fermeture du salon dans {Math.max(0, Math.ceil(((room.finishedAt ?? now) + 60_000 - now) / 1000))} s.</p><button className="primary" onClick={() => void leave()}>Retour aux quais</button></div></main> : <GameStage game={game} selected={selected} onSelect={id => setSelected(id || null)} now={now} view={view} setView={setView} reduced={reduced} setReduced={setReduced} readOnly={!canPlay || busy} canAbandon={connected && member?.role === 'player' && player?.abandonedAt === null} onMove={move => void command({ kind: 'move', move, event: game.events.length })} onCustoms={crateId => void command({ kind: 'customs', crateId, event: game.events.length })} onHelp={() => setModal('help')} onAbandon={() => setModal('leave')} saveStatus={connected ? spectator ? 'Observation en ligne' : canPlay ? 'À vous de jouer · État validé par le serveur' : 'Tour adverse · Observation libre' : 'Connexion indisponible · Le temps continue'} />}
    {modal === 'recovery' && <Modal title="Votre code personnel" onClose={() => setModal(null)}><p>Ce code retrouve votre place sur un autre appareil. Gardez-le pour vous.</p><code className="personal-code">{session?.recovery}</code><p role="status">{clipboard}</p><button className="primary" onClick={() => session?.recovery && void copy(session.recovery)}><Copy size={18} /> Copier le code personnel</button><p>Il expire en fin de partie. Un seul appareil peut rester connecté.</p></Modal>}
    {modal === 'leave' && <Modal title={game && game.phase !== 'terminée' && !spectator ? 'Abandonner la partie ?' : 'Quitter le salon ?'} onClose={() => setModal(null)}><p>{game && game.phase !== 'terminée' && !spectator ? 'Vous ne pourrez plus gagner. Si c’est votre tour, le plateau et les scores du début de tour seront restaurés. Vous pouvez rester comme spectateur.' : 'Votre départ est immédiat. Avant démarrage, les autres joueurs peuvent commencer sans vous.'}</p><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Rester</button>{game && game.phase !== 'terminée' && !spectator && <button className="secondary" disabled={busy} onClick={() => { setModal(null); void command({ kind: 'abandon', event: game.events.length }); }}>Abandonner et regarder</button>}<button className="danger" disabled={busy} onClick={() => void leave()}>Quitter</button></div></Modal>}
    {modal === 'help' && <Modal title="Jouer en ligne" onClose={() => setModal(null)}><p>Seul le joueur actif peut déplacer les caisses et décider de la Douane. Chaque tour dure cinq minutes sans pause, même après déconnexion. Les actions reçues par le serveur à l’échéance exacte sont acceptées.</p><p>Normal ne permet pas d’inspection. En Facile, joueurs et spectateurs peuvent inspecter uniquement les caisses déplaçables. Les trois coups restent irréversibles ; un abandon restaure le tour du joueur actif.</p></Modal>}
  </div>;
}
