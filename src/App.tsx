import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Box, Check, CircleHelp, Clock3, Compass, Layers3, Trophy, X } from 'lucide-react';
import { abandon, createGame, customs, playMove, ranking, tick } from './engine/game';
import { initialBoard } from './engine/geometry';
import type { Game } from './engine/types';
import { loadGame, saveGame, stageGame } from './storage/save';
import { Board, type View } from './components/Board';
import { GameStage } from './components/GameStage';
import { Modal } from './components/Modal';
const HELPTEXT = [
  ['Le but du jeu', 'Rangez les caisses en groupes visibles d’au moins deux caisses de même couleur supérieure, au même étage, en contact par une face latérale. Le meilleur score gagne. Une couleur sur le dessus n’accorde pas un droit exclusif de déplacement.'],
  ['Un tour, trois mouvements', 'Vous disposez de cinq minutes pour effectuer exactement trois coups puis votre décision Douane. Le premier mouvement de la partie est une chute depuis le sommet. Une déconnexion temporaire est permise, mais toutes les caisses doivent former un seul ensemble connecté par faces au troisième coup.'],
  ['Bascule et chute', 'La bascule roule d’une face vers une case voisine libre, sans diagonale ni montée. Le dessus change. Une descente est une chute : elle conserve le dessus et s’arrête au premier support. Le pivot gratuit de chute tourne autour de Z, sans déplacement horizontal supplémentaire.'],
  ['Pivoter', 'Une caisse au dessus non recouvert peut pivoter sur place, même rangée et en contact latéral, sauf si elle porte la Douane. Un pivot effectif coûte un coup. Un tour complet sans changement ne compte pas.'],
  ['Scores et blocages', 'Le groupe complet rapporte sa taille ×1 au sol, ×3 au milieu, ×5 au sommet. Chaque nouveau rangement marque, y compris une fusion ou un groupe reformé par dévoilement. Le groupe de la caisse déplacée est crédité d’abord, celui dévoilé ensuite. Les couleurs adverses reçoivent leurs points. Une caisse rangée ne peut pas basculer ; un masquage ou une chute peut casser son groupe.'],
  ['La Douane', 'Après les trois coups, placez le jeton sur un dessus accessible ou confirmez son maintien. Le premier placement est obligatoire. La Douane interdit tout mouvement de sa caisse et toute arrivée ou passage au-dessus. Cette décision est comprise dans les cinq minutes.'],
  ['État exact et retour arrière', 'Une caisse ne peut retrouver ses mêmes coordonnées et sa même orientation pendant un tour. Les pivots sont inclus. Un mouvement effectué ne s’annule pas manuellement. La caméra et l’inspection ne sont pas des coups.'],
  ['Temps et abandon', 'Pas de pause. Un tour non terminé après cinq minutes vaut abandon ; une décision à l’échéance exacte est acceptée. L’abandon restaure le plateau et tous les scores du début de tour. Le prochain joueur actif reçoit trois coups et cinq minutes. La couleur abandonnée reste bloquante mais ne marque plus. Le dernier joueur actif gagne.'],
  ['Inspection et fin', 'Tous les joueurs peuvent consulter les six faces des caisses au dessus visible, même pendant le tour adverse. S’il n’existe pas de séquence valide pour terminer les trois coups, la partie finit immédiatement aux scores acquis, sans restauration. Les meilleurs scores à égalité partagent la victoire. Les abandons occupent les dernières places, le premier abandon étant dernier.'],
];
export default function App() {
  const [game, setGame] = useState<Game | null>(null); const gameRef = useRef<Game | null>(null);
  const [loaded, setLoaded] = useState(false); const [count, setCount] = useState(2); const [names, setNames] = useState(['', '', '', '']);
  const [selected, setSelected] = useState<number | null>(null); const [view, setView] = useState<View>('libre');
  const [modal, setModal] = useState<'aide' | 'abandon' | 'nouvelle' | null>(null); const [error, setError] = useState(''); const [saveStatus, setSaveStatus] = useState('');
  const [now, setNow] = useState(Date.now()); const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [canEdit, setCanEdit] = useState(false); const lockRelease = useRef<(() => void) | null>(null); const mounted = useRef(true); const writes = useRef(Promise.resolve());
  const commit = useCallback((next: Game) => {
    const staged = stageGame(next);
    setSaveStatus(staged ? 'Sauvegarde en cours…' : 'Sauvegarde de secours indisponible…');
    gameRef.current = next; setGame(next);
    writes.current = writes.current.then(() => saveGame(next)).then(() => { if (mounted.current) setSaveStatus('Partie sauvegardée sur cet appareil'); }).catch(() => { if (mounted.current) setSaveStatus('Sauvegarde indisponible : gardez cet onglet ouvert.'); });
  }, []);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    async function start() {
      try { const saved = await loadGame(); if (!cancelled) { gameRef.current = saved; setGame(saved); } }
      catch (e) { if (!cancelled) setError((e as Error).message); }
      if (!cancelled) setLoaded(true);
    }
    if (navigator.locks) {
      void navigator.locks.request('dockers-partie-locale', { ifAvailable: true }, async lock => {
        if (!lock) { if (!cancelled) { setError('La partie est déjà ouverte dans un autre onglet. Fermez cet onglet puis rechargez ici pour jouer.'); setLoaded(true); } return; }
        if (cancelled) return;
        setCanEdit(true); await start();
        await new Promise<void>(resolve => { lockRelease.current = resolve; if (cancelled) resolve(); });
      });
    } else { setCanEdit(true); void start(); }
    return () => { cancelled = true; mounted.current = false; lockRelease.current?.(); };
  }, []);
  useEffect(() => { if (!canEdit || !loaded) return; const timer = window.setInterval(() => { const time = Date.now(); setNow(time); const current = gameRef.current; if (current) { const next = tick(current, time); if (next !== current) { setSelected(null); setModal(null); commit(next); } } }, 200); return () => clearInterval(timer); }, [canEdit, loaded, commit]);
  const board = game?.board ?? initialBoard();
  const current = game?.players[game.activePlayer]; const finished = game?.phase === 'terminée';
  const select = (id: number) => { setSelected(id || null); setError(''); };
  function act(operation: (g: Game) => Game) { const latest = gameRef.current; if (!latest || !canEdit) return; try { commit(operation(latest)); setError(''); } catch (e) { setError((e as Error).message); } }
  function begin() { try { commit(createGame(names.slice(0, count))); setSelected(null); setModal(null); setError(''); setNow(Date.now()); } catch (e) { setError((e as Error).message); } }
  return <div className={`app-shell ${game && !finished ? 'playing' : ''}`}>
    {(!game || finished) && <header className="app-header"><a className="brand" href={import.meta.env.BASE_URL} onClick={e => { if (game && !finished) e.preventDefault(); }} aria-label="DOCKERS"><span className="brand-icon"><Box size={27} strokeWidth={1.5} /></span><span>DOCKERS<small>LE JEU QUI MUSCLE LE CERVEAU</small></span></a><nav><span className="local-badge"><span /> Partie locale · Français</span><button className="text-button" onClick={() => setModal('aide')}><CircleHelp size={18} /> Les règles</button>{game && <button className="text-button" onClick={() => setModal('nouvelle')}>Nouvelle partie <ArrowRight size={16} /></button>}</nav></header>}
    {error && <div className="notice error" role="alert">{error}<button onClick={() => setError('')} aria-label="Fermer le message"><X size={16} /></button></div>}
    {!loaded ? <div className="loading">Ouverture de l’entrepôt…</div> : !game ? <main className="welcome">
      <section className="welcome-copy"><div className="eyebrow"><span className="short-line" /> BIENVENUE SUR LES QUAIS</div><h1>Un entrepôt.<br />27 caisses.<br /><em>À vous de jouer.</em></h1><p>Faites basculer les caisses, rangez vos couleurs et gardez un coup d’avance. Une affaire de stratégie, sous tous les angles.</p><div className="welcome-facts"><span><Box size={18} /> 27 caisses</span><span><Layers3 size={18} /> 3 étages</span><span><Clock3 size={18} /> 5 min / tour</span></div>
        <form className="setup" onSubmit={e => { e.preventDefault(); begin(); }}><div className="setup-head"><h2>Qui embarque ?</h2><span>2 À 4 JOUEURS</span></div><div className="segmented count-picker" aria-label="Nombre de joueurs">{[2, 3, 4].map(n => <button type="button" key={n} className={count === n ? 'active' : ''} onClick={() => setCount(n)} aria-pressed={count === n}>{n} joueurs</button>)}</div><div className="name-fields">{Array.from({ length: count }, (_, i) => <label key={i}><span>Docker {i + 1}</span><input aria-label={`Nom du joueur ${i + 1}`} maxLength={30} placeholder={`Docker ${i + 1}`} value={names[i]} onChange={e => setNames(names.map((n, j) => i === j ? e.target.value : n))} /></label>)}</div><button className="primary launch" disabled={!canEdit} type="submit">Commencer la partie <ArrowRight size={20} /></button><p className="setup-note">Les couleurs et le premier joueur sont tirés au sort.<br />Un appareil partagé. Aucun compte nécessaire.</p></form>
      </section><section className="welcome-board"><div className="board-kicker"><span>01 / L’ENTREPÔT</span><span>OBSERVEZ SOUS TOUS LES ANGLES</span></div><div className="welcome-canvas"><Board board={board} selected={selected} onSelect={select} view="libre" reduced={reduced} /></div><div className="welcome-caption"><Compass size={22} /><p><strong>Tout commence ici.</strong><br />Tournez le plateau pour explorer les caisses.</p><span>3 × 3 × 3</span></div><div className="welcome-footnote">LE DESSUS CHANGE. LA STRATÉGIE AUSSI.</div></section>
    </main> : finished ? <main className="final-screen"><div className="results"><div className="result-icon"><Trophy size={34} /></div><div className="eyebrow">DÉCOMPTE FINAL</div><h2>{game.result!.winners.length > 1 ? 'Victoire partagée !' : `${game.players[game.result!.winners[0]].name} gagne !`}</h2><p>{game.result!.reason}</p><ol>{ranking(game).map(({ player: p, rank }) => <li key={p.id}><b>{rank}</b><span>{p.name}<small>{p.abandonedAt !== null ? 'Abandon · hors victoire' : 'En lice'}</small></span><strong>{p.score}<small>pts</small></strong></li>)}</ol><button className="primary" onClick={() => setModal('nouvelle')}>Rejouer <ArrowRight size={18} /></button></div></main> : <GameStage game={game} selected={selected} onSelect={select} now={now} view={view} setView={setView} reduced={reduced} setReduced={setReduced} onMove={move => act(g => playMove(g, move))} onCustoms={id => act(g => customs(g, id))} onHelp={() => setModal('aide')} onAbandon={() => setModal('abandon')} saveStatus={saveStatus} />}
    {(!game || finished) && <footer className="app-footer"><span>DOCKERS <i>·</i> Un jeu de Philippe Leurquin</span><span>Observez. Anticipez. Rangez.</span><span>{game ? 'LOCAL · SAUVEGARDE SUR CET APPAREIL' : '2–4 JOUEURS · SUR UN APPAREIL PARTAGÉ'}</span></footer>}
    {modal === 'aide' && <Modal title="Les règles de DOCKERS" onClose={() => setModal(null)}><div className="help-intro">Une partie locale, en trois dimensions. Les règles ci-dessous intègrent les décisions de l’auteur du projet.</div><div className="help-content">{HELPTEXT.map(([title, text], i) => <section key={title}><span>{String(i + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{text}</p></div></section>)}</div><button className="primary" onClick={() => setModal(null)}>Compris, à moi de jouer <Check size={18} /></button></Modal>}
    {modal === 'abandon' && <Modal title="Abandonner ce tour ?" onClose={() => setModal(null)}><p>Le plateau et tous les scores seront restaurés à leur état de début de tour. {current?.name} ne pourra plus gagner cette partie. Les autres joueurs continueront, ou le dernier joueur remportera la victoire.</p><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Continuer à jouer</button><button className="danger" onClick={() => { act(g => abandon(g)); setModal(null); select(0); }}>Confirmer l’abandon</button></div><small>Le chronomètre continue pendant cette confirmation.</small></Modal>}
    {modal === 'nouvelle' && <Modal title="Une nouvelle partie ?" onClose={() => setModal(null)}><p>{finished ? 'Le résultat de cette partie sera archivé sur cet appareil.' : 'La partie actuelle sera archivée. Cette action lance une nouvelle configuration ; elle ne met pas la partie en pause.'}</p><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Revenir</button><button className="primary" onClick={() => { if (game && !finished) { setError('Terminez la partie ou abandonnez avant d’en commencer une nouvelle.'); setModal(null); return; } setGame(null); gameRef.current = null; select(0); setModal(null); }}>Préparer une partie <ArrowRight size={16} /></button></div></Modal>}
  </div>;
}
