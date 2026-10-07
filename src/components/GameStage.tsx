import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleHelp, Clock3, Flag, History, Layers3, RotateCcw, RotateCw, ShieldCheck, SlidersHorizontal, Trophy, X, Eye, ChevronDown } from 'lucide-react';
import { definition } from '../engine/catalogue';
import { connected, top, visible } from '../engine/geometry';
import { candidates, evaluateMove } from '../engine/moves';
import type { Crate, Game, Move } from '../engine/types';
import { Board, CubeInspector, LABELS, PALETTE, SYMBOLS, type BoardInteraction, type View, type InspectionView } from './Board';
type Panel = 'mouvements' | 'outils' | 'scores' | 'journal' | 'caisses' | 'inspection' | null;
const actions = [['bascule', RotateCw, 'Basculer'], ['chute', ChevronDown, 'Chuter'], ['pivot', RotateCcw, 'Pivoter']] as const;
function time(ms: number) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; }
export function GameStage({ game, selected, onSelect, now, view, setView, reduced, setReduced, onMove, onCustoms, onHelp, onAbandon, saveStatus }: {
  game: Game; selected: number | null; onSelect: (id: number) => void; now: number; view: View; setView: (v: View) => void;
  reduced: boolean; setReduced: (v: boolean) => void; onMove: (move: Move) => void; onCustoms: (id: number | null) => void;
  onHelp: () => void; onAbandon: () => void; saveStatus: string;
}) {
  const [kind, setKind] = useState<Move['kind']>('chute');
  const [turns, setTurns] = useState<0 | 1 | 2 | 3>(0); const [half, setHalf] = useState(false);
  const [panel, setPanel] = useState<Panel>(null); const [ghost, setGhost] = useState<Crate | null>(null);
  const [busy, setBusy] = useState(false); const gate = useRef(false); const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraPose = useRef<[number, number, number]>([9, 8.4, 11]); const [inspectPose, setInspectPose] = useState<[number, number, number] | undefined>();
  const [inspectorReset, setInspectorReset] = useState(0); const [inspectView, setInspectView] = useState<InspectionView>(view);
  const player = game.players[game.activePlayer]; const crate = game.board.find(c => c.id === selected);
  const available = useMemo(() => game.phase === 'mouvements' && selected ? candidates(game, selected) : [], [game, selected]);
  const inspectable = game.difficulty === 'facile' && available.length > 0;
  useEffect(() => { if (!inspectable && panel === 'inspection') setPanel(null); }, [inspectable, panel]);
  const shown = available.filter(m => m.kind === kind && (m.kind !== 'chute' || m.quarterTurns === turns));
  useEffect(() => { setTurns(0); setGhost(null); setHalf(false); setInspectView(view); setInspectPose([...cameraPose.current]); setInspectorReset(n => n + 1); }, [selected, game.events.length]);
  useEffect(() => { if (game.phase !== 'mouvements') setGhost(null); }, [game.phase]);
  useEffect(() => () => { if (release.current) clearTimeout(release.current); }, []);
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return; if (panel) setPanel(null); else { onSelect(0); setGhost(null); } }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [panel, onSelect]);
  function activate(move: Move) {
    if (gate.current || game.phase !== 'mouvements') return;
    gate.current = true; setBusy(true); setGhost(null); onMove(move);
    release.current = setTimeout(() => { gate.current = false; setBusy(false); }, reduced ? 250 : 450);
  }
  const pivots = crate && kind === 'pivot' && game.phase === 'mouvements' ? ([true, false] as const).map(left => {
    const move: Move = { kind: 'pivot', crateId: crate.id, quarterTurns: half ? 2 : left ? 3 : 1 };
    const result = evaluateMove(game, move);
    return { move, left, label: `Pivoter à ${left ? 'gauche' : 'droite'}${half ? ' — demi-tour' : ''}`, enabled: result.ok, reason: result.reason };
  }) : [];
  const destinations = shown.filter(m => m.kind !== 'pivot').map(move => {
    const result = evaluateMove(game, move); const c = result.moved!;
    return { move, crate: c, label: `${move.kind === 'chute' ? 'Chuter' : 'Basculer'} sur la case X ${c.x}, Y ${c.y}, ${c.z === 0 ? 'sol' : `étage ${c.z}`}` };
  });
  const interaction: BoardInteraction = { destinations, pivots, selectedCrate: crate, ghost, busy, onActivate: activate, onPreview: c => { if (inspectable) setGhost(c); } };
  const reason = crate && game.phase === 'mouvements' && !shown.length ? available.some(m => m.kind === 'chute') && kind === 'chute' ? 'Changez l’orientation d’arrivée.' : evaluateMove(game, kind === 'pivot' ? { kind, crateId: crate.id, quarterTurns: 1 } : kind === 'chute' ? { kind, crateId: crate.id, direction: 'nord', quarterTurns: turns } : { kind, crateId: crate.id, direction: 'nord' }).reason : '';
  const last = game.events.at(-1); const [toast, setToast] = useState('');
  useEffect(() => { setToast(''); if (!last?.gains?.length || last.reverted) return; setToast(last.gains.map(g => `${game.players[g.playerId].name} +${g.points} pts`).join(' · ')); const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [last?.id]);
  function open(p: Panel) { if (p === 'inspection' && !inspectable) return; setPanel(panel === p ? null : p); if (p === 'inspection') { setInspectPose([...cameraPose.current]); setInspectView(view); setInspectorReset(n => n + 1); } }
  return <main className="immersive-game" aria-label="Écran de jeu">
    <div className="immersive-scene"><Board onCameraPose={pose => { cameraPose.current = pose; }} game={game} board={game.board} selected={selected} onSelect={id => { if (!gate.current) onSelect(id); }} view={view} reduced={reduced} interaction={interaction} /></div>
    <header className="floating-top">
      <div className="turn-badge" aria-live="polite"><span className="player-symbol" style={{ background: PALETTE[player.color] }}>{SYMBOLS[player.color]}</span><strong>{player.name}</strong><small className="turn-number">TOUR {String(game.turn).padStart(2, '0')}</small></div>
      <div className="essential-progress" aria-live="polite" aria-label={`${game.movesMade} mouvements effectués sur trois`}>{[0,1,2].map(i => <span key={i} className={i < game.movesMade ? 'done' : i === game.movesMade ? 'current' : ''}>{i < game.movesMade ? <Check size={13} /> : i + 1}</span>)}<ShieldCheck className={game.phase === 'douane' ? 'current' : ''} size={19} /></div>
      <div className={`compact-timer ${game.deadline - now <= 60_000 ? 'urgent' : ''}`} role="timer" aria-label={`Temps restant : ${time(game.deadline - now)}`}><Clock3 size={16} /><strong>{time(game.deadline - now)}</strong></div>
      <button className="tool-toggle" onClick={() => open('outils')} aria-label="Ouvrir les outils" aria-expanded={panel === 'outils'}><SlidersHorizontal size={19} /></button>
    </header>
    <div className="persistent-scores" aria-label="Scores des joueurs" aria-live="polite">{game.players.map(p => <div key={p.id} className={`live-score ${p.abandonedAt !== null ? 'departed' : ''}`}><span style={{ background: PALETTE[p.color] }}>{SYMBOLS[p.color]}</span><strong>{p.name}</strong><b>{p.score}<small> pts</small></b>{p.abandonedAt !== null && <small>Abandon</small>}</div>)}</div>
    {toast && <div className="gain-toast" role="status">{toast}</div>}
    {saveStatus.includes('indisponible') && <div className="save-warning" role="alert">{saveStatus}</div>}
    {!connected(game.board) && <div className="connect-warning">Reconnectez les caisses avant le troisième coup.</div>}
    <div className="floating-bottom">
      <div className="selection-strip">{crate ? <><strong>{definition(crate.id).name}</strong>{inspectable && <button aria-label="Inspecter la caisse" onClick={() => open('inspection')}><Eye size={17} /></button>}<button aria-label="Désélectionner la caisse" onClick={() => onSelect(0)}><X size={16} /></button></> : <span>{game.phase === 'douane' ? 'Sélectionnez une caisse pour la Douane' : 'Sélectionnez une caisse'}</span>}</div>
      {game.phase === 'mouvements' ? <>
        <div className="floating-actions">{actions.map(([k, Icon, label]) => <button key={k} aria-pressed={kind === k} className={`${kind === k ? 'active' : ''} ${crate && !available.some(m => m.kind === k) ? 'unavailable' : ''}`} title={crate && !available.some(m => m.kind === k) ? 'Action indisponible pour cette caisse. Sélectionnez ce mode pour voir l’explication.' : undefined} onClick={() => { setKind(k); setTurns(0); setGhost(null); setHalf(false); }}><Icon size={19} />{label}</button>)}</div>
        {crate && kind === 'pivot' && <label className="amplitude"><input type="checkbox" checked={half} onChange={e => { setHalf(e.target.checked); setGhost(null); }} />Demi-tour</label>}
        {crate && kind === 'chute' && <div className="fall-orientation"><span>Orientation d’arrivée · gratuite</span><button aria-label="Tourner l’arrivée à gauche" onClick={() => { setTurns(t => ((t + 3) % 4) as typeof turns); setGhost(null); }}>↶</button><button aria-label="Conserver l’orientation d’arrivée" onClick={() => { setTurns(0); setGhost(null); }}>{turns === 0 ? 'Sans rotation' : `${turns * 90}°`}</button><button aria-label="Tourner l’arrivée à droite" onClick={() => { setTurns(t => ((t + 1) % 4) as typeof turns); setGhost(null); }}>↷</button></div>}
        {reason && <p className="compact-reason" role="status">{reason}</p>}
        {!game.opened && <p className="opening-hint">Ouvrez l’entrepôt : faites chuter une caisse du sommet.</p>}
      </> : <div className="customs-compact"><strong>La Douane, à vous de décider.</strong>{crate && <button className="primary" disabled={!visible(game.board, crate)} onClick={() => { onCustoms(crate.id); onSelect(0); }}>{crate.id === game.customsId ? 'Conserver la Douane ici' : 'Placer la Douane ici'}</button>}{game.customsId !== null && <button className="secondary" onClick={() => { onCustoms(null); onSelect(0); }}>Conserver la Douane en place</button>}</div>}
    </div>
    {panel && <section className={`floating-panel panel-${panel}`} aria-label={panel === 'inspection' ? 'Inspection de la caisse' : 'Outils de jeu'}><div className="panel-heading"><h2>{{ outils: 'Outils', scores: 'Scores', journal: 'Journal', caisses: 'Caisses', inspection: crate ? definition(crate.id).name : 'Inspection', mouvements: 'Mouvements' }[panel]}</h2><button aria-label="Fermer le panneau" onClick={() => setPanel(null)}><X size={19} /></button></div>
      {panel === 'outils' && <><div className="tools-grid"><button onClick={() => open('mouvements')}>Commandes accessibles</button><button onClick={() => open('scores')}><Trophy size={18} />Scores</button><button onClick={() => open('journal')}><History size={18} />Journal</button><button onClick={() => open('caisses')}><Layers3 size={18} />Liste des caisses</button><button onClick={() => { setPanel(null); onHelp(); }}><CircleHelp size={18} />Les règles</button></div><div className="view-bar"><button onClick={() => setView('libre')}>3D libre</button><button onClick={() => setView('dessus')}>Dessus</button></div><label className="reduce-motion"><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} />Animations réduites</label><p className="muted">Glissez pour tourner le plateau ; pincez ou utilisez la molette pour zoomer.</p><button className="abandon-button" onClick={() => { setPanel(null); onAbandon(); }}><Flag size={15} />Abandonner la partie</button><p className="save-status" role="status">{saveStatus}</p></>}
      {panel === 'scores' && <div className="scores">{game.players.map(p => <div key={p.id} className={`score-row ${p.abandonedAt !== null ? 'departed' : ''}`}><span className="score-dot" style={{ background: PALETTE[p.color] }}>{SYMBOLS[p.color]}</span><div><strong>{p.name}</strong><small>{p.abandonedAt !== null ? 'A abandonné' : LABELS[p.color]}</small></div><b>{p.score}<small>PTS</small></b></div>)}</div>}
      {panel === 'journal' && <ol className="compact-journal">{[...game.events].reverse().map(e => <li key={e.id} className={e.reverted ? 'reverted' : ''}><small>Tour {e.turn} · {game.players[e.playerId].name}</small><p>{e.text}{e.reverted && ' — Annulé après abandon'}</p>{e.gains?.map((g, index) => <p key={index}>{game.players[g.playerId].name} +{g.points} pts · {g.size} caisses ×{g.multiplier} · {g.trigger}</p>)}</li>)}</ol>}
      {panel === 'caisses' && <><div className="crate-list-grid">{game.board.map(c => <button key={c.id} onClick={() => { onSelect(c.id); setPanel(null); }} aria-pressed={c.id === selected}><span>{c.id}</span>{definition(c.id).name}<small>{c.z === 0 ? 'Sol' : `Étage ${c.z}`} · {visible(game.board,c) ? top(c) ? LABELS[top(c)!] : 'Neutre' : 'Surmontée'}</small></button>)}</div></>}
      {panel === 'inspection' && inspectable && (crate ? <><CubeInspector pose={inspectPose} crate={crate} view={inspectView} reset={inspectorReset} reduced={reduced} /><p className="inspection-note">Tournez ce cube pour observer ses faces. Ce geste ne joue aucun coup.</p><div className="inspection-controls"><button onClick={() => { setInspectPose([...cameraPose.current]); setInspectView(view); setInspectorReset(n => n + 1); }}>Revenir à la vue du plateau</button><button onClick={() => { setInspectPose(undefined); setInspectView('dessus'); setInspectorReset(n => n + 1); }}>Voir le dessus</button><button onClick={() => { setInspectPose(undefined); setInspectView('dessous'); setInspectorReset(n => n + 1); }}>Voir le dessous</button><button onClick={() => { setInspectPose(undefined); const angles: InspectionView[] = ['sud','est','nord','ouest']; setInspectView(angles[(angles.indexOf(inspectView) + 1) % 4]); setInspectorReset(n => n + 1); }}>Tourner l’observation</button></div></> : <p>Sélectionnez une caisse à inspecter.</p>)}
      {(panel === 'mouvements' || panel === 'caisses') && crate && game.phase === 'mouvements' && <details className="accessible-moves"><summary>Commandes accessibles du mouvement</summary>{kind === 'pivot' ? pivots.map(p => <button key={p.label} disabled={busy || !p.enabled} title={p.reason} onClick={() => activate(p.move)}>{p.label}</button>) : destinations.map(d => <button key={d.label} disabled={busy} onClick={() => activate(d.move)}>{d.label}</button>)}</details>}
      {panel === 'mouvements' && !crate && <p>Sélectionnez d’abord une caisse sur le plateau ou dans la liste.</p>}
    </section>}
  </main>;
}
