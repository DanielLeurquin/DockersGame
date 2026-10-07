import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { definition } from '../engine/catalogue';
import { groups, visible } from '../engine/geometry';
import type { Color, Crate, Face, Game, Move } from '../engine/types';
export type InspectionView = View | 'dessous';
export type View = 'libre' | 'dessus' | 'nord' | 'est' | 'sud' | 'ouest';
export const PALETTE: Record<Color, string> = { bleu: '#5085af', rouge: '#b95949', jaune: '#d5aa4b', vert: '#528b76' };
export const LABELS: Record<Color, string> = { bleu: 'Bleu', rouge: 'Rouge', jaune: 'Jaune', vert: 'Vert' };
export const SYMBOLS: Record<Color, string> = { bleu: '◆', rouge: '●', jaune: '✦', vert: '▲' };
const cache = new Map<string, THREE.CanvasTexture>();
const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
function texture(face: Face, name: string) {
  const key = face || name; if (cache.has(key)) return cache.get(key)!;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = face ? PALETTE[face] : '#d2af78'; ctx.fillRect(0, 0, 256, 256);
  // Deterministic grain avoids external image/font dependencies.
  for (let i = 0; i < 35; i++) { ctx.strokeStyle = `rgba(75,46,19,${i % 3 === 0 ? '.07' : '.025'})`; ctx.beginPath(); const y = (i * 29) % 256; ctx.moveTo(0, y); ctx.bezierCurveTo(75, y + 5, 180, y - 5, 256, y + 1); ctx.stroke(); }
  ctx.strokeStyle = face ? '#b99365' : '#8b6d46'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 242, 242);
  ctx.strokeStyle = 'rgba(57,43,25,.3)'; ctx.lineWidth = 2; ctx.strokeRect(17, 17, 222, 222);
  ctx.fillStyle = face ? 'rgba(255,255,255,.68)' : '#51472e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (face) { ctx.font = 'bold 48px sans-serif'; ctx.fillText(SYMBOLS[face], 128, 104); ctx.font = 'bold 22px sans-serif'; ctx.fillText(LABELS[face].toUpperCase(), 128, 158); }
  else {
    const lines = name.includes(' ') ? name.split(' ') : [name];
    let fontSize = 48;
    ctx.font = `bold ${fontSize}px Georgia`;
    while (fontSize > 28 && lines.some(line => ctx.measureText(line).width > 200)) {
      fontSize--; ctx.font = `bold ${fontSize}px Georgia`;
    }
    ctx.fillStyle = '#49351f';
    lines.forEach((line, i) => ctx.fillText(line, 128, 128 + (i - (lines.length - 1) / 2) * fontSize * 1.12));
  }
  ctx.fillStyle = '#785c3d'; for (const x of [20, 236]) for (const y of [20, 236]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; cache.set(key, tex); return tex;
}
const vectors = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)];
function quaternion(c: Crate) { const e = vectors[c.orientation.indexOf(2)], t = vectors[c.orientation.indexOf(0)], s = vectors[c.orientation.indexOf(3)]; return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e, t, s)); }
function CrateMesh({ crate, selected, customs, grouped, onSelect, reduced, ghost = false }: { crate: Crate; selected: boolean; customs: boolean; grouped: boolean; onSelect: (id: number) => void; reduced: boolean; ghost?: boolean }) {
  const group = useRef<THREE.Group>(null); const target = useMemo(() => new THREE.Vector3(crate.x, crate.z + .5, -crate.y), [crate.x, crate.y, crate.z]);
  const rotation = useMemo(() => quaternion(crate), [crate.orientation]);
  const data = definition(crate.id); const maps = useMemo(() => [2, 4, 0, 5, 3, 1].map(i => texture(data.faces[i], data.name)), [data]);
  const [hover, setHover] = useState(false);
  const invalidate = useThree(state => state.invalidate);
  useFrame((_, delta) => { if (!group.current) return; const alpha = reduced ? 1 : 1 - Math.exp(-delta * 14); group.current.position.lerp(target, alpha); group.current.quaternion.slerp(rotation, alpha); if (group.current.position.distanceToSquared(target) > .00001 || group.current.quaternion.angleTo(rotation) > .001) invalidate(); });
  useEffect(() => { if (group.current) { group.current.position.copy(target); group.current.quaternion.copy(rotation); } }, []);
  return <>
    <group ref={group}>
      <mesh castShadow={!ghost} receiveShadow raycast={ghost ? () => {} : undefined} onClick={e => { e.stopPropagation(); onSelect(crate.id); }} onPointerOver={e => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}>
        {/* Match the grid spacing exactly: gaps would reveal hidden face colours. */}
        <boxGeometry args={[1, 1, 1]} />
        {maps.map((map, i) => <meshStandardMaterial key={i} attach={`material-${i}`} map={map} transparent={ghost} opacity={ghost ? .38 : 1} depthWrite={!ghost} roughness={.87} color={hover ? '#fff8d9' : '#ffffff'} />)}
      </mesh>
    </group>
    {(selected || hover) && <lineSegments raycast={() => {}} position={target} scale={1.025} geometry={outlineGeometry}><lineBasicMaterial color={selected ? '#163f35' : '#fff7d8'} /></lineSegments>}
    {grouped && <mesh position={[crate.x, crate.z + 1.01, -crate.y]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.06, .1, 20]} /><meshBasicMaterial color="#ffffff" /></mesh>}
    {customs && <group position={[crate.x, crate.z + 1.06, -crate.y]}><mesh castShadow><cylinderGeometry args={[.25, .25, .09, 32]} /><meshStandardMaterial color="#243e36" /></mesh><mesh position={[0, .05, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.14, .18, 24]} /><meshBasicMaterial color="#efcc78" /></mesh></group>}
  </>;
}
function CameraRig({ view, onPose }: { view: View; onPose?: (pose: [number, number, number]) => void }) {
  const { camera, size, invalidate } = useThree(); const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => { const positions: Record<View, [number, number, number]> = { libre: [9, 9, 11], dessus: [0, 14, .001], nord: [0, 4, -13], sud: [0, 4, 13], est: [13, 4, 0], ouest: [-13, 4, 0] }; camera.position.set(...positions[view]); controls.current?.target.set(0, .6, 0); controls.current?.update(); }, [view, camera]);
  useEffect(() => { if (camera instanceof THREE.OrthographicCamera) { camera.zoom = Math.max(25, Math.min(95, size.width / 11, size.height / 10)); camera.updateProjectionMatrix(); invalidate(); } }, [camera, size.width, size.height, invalidate]);
  return <OrbitControls ref={controls} makeDefault onChange={() => { const t = controls.current?.target; if (t) onPose?.([camera.position.x - t.x, camera.position.y - t.y, camera.position.z - t.z]); }} target={[0, .6, 0]} enablePan={false} enableRotate={view === 'libre'} minZoom={28} maxZoom={92} minPolarAngle={.05} maxPolarAngle={Math.PI / 2.1} />;
}
function Scene({ board, selected, customsId, onSelect, reduced, view, interaction, onCameraPose }: { board: Crate[]; selected: number | null; customsId: number | null; onSelect: (id: number) => void; reduced: boolean; view: View; interaction?: BoardInteraction; onCameraPose?: (pose: [number, number, number]) => void }) {
  const grouped = useMemo(() => new Set(groups(board).flatMap(g => g.ids)), [board]);
  return <>
    <color attach="background" args={['#eadfcb']} /><ambientLight intensity={1.4} /><directionalLight position={[5, 10, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.04} />
    <mesh receiveShadow position={[0, -.38, 0]}><boxGeometry args={[7.4, .55, 7.4]} /><meshStandardMaterial color="#344f5a" roughness={.85} /></mesh>
    {Array.from({ length: 49 }, (_, i) => { const x = i % 7 - 3, y = Math.floor(i / 7) - 3; return <mesh key={i} receiveShadow position={[x, -.075, -y]}><boxGeometry args={[.988, .06, .988]} /><meshStandardMaterial color={(x + y) % 2 ? '#caa575' : '#dfbc8c'} roughness={1} /></mesh>; })}
    <mesh receiveShadow position={[0, -.69, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#eadfcb" /></mesh>
    {board.map(c => <CrateMesh key={c.id} crate={c} selected={selected === c.id} customs={customsId === c.id} grouped={grouped.has(c.id) && visible(board, c)} onSelect={onSelect} reduced={reduced} />)}
    {interaction && <InteractionLayer interaction={interaction} />}
    <CameraRig view={view} onPose={onCameraPose} />
  </>;
}
class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? this.props.fallback : this.props.children; } }
export function Board({ game, board, selected, onSelect, view, reduced, interaction, onCameraPose }: { game?: Game | null; board: Crate[]; selected: number | null; onSelect: (id: number) => void; view: View; reduced: boolean; interaction?: BoardInteraction; onCameraPose?: (pose: [number, number, number]) => void }) {
  const fallback = <div className="canvas-fallback">La vue 3D n’est pas disponible dans ce navigateur. Utilisez la liste des caisses et leurs fiches pour jouer.</div>;
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const safeSelect = (id: number) => { if (!dragged.current) onSelect(id); };
  return <div className="board-canvas" onClickCapture={e => { if (e.detail > 0 && dragged.current) { e.preventDefault(); e.stopPropagation(); } }} onPointerDownCapture={e => { pointer.current = { x: e.clientX, y: e.clientY }; dragged.current = false; }} onPointerMoveCapture={e => { if (pointer.current && Math.hypot(e.clientX - pointer.current.x, e.clientY - pointer.current.y) > 6) dragged.current = true; }} onPointerUpCapture={() => { pointer.current = null; }}><CanvasBoundary fallback={fallback}><Suspense fallback={<div className="canvas-fallback">Ouverture de l’entrepôt…</div>}><Canvas frameloop="demand" orthographic shadows dpr={[1, 1.8]} camera={{ position: [9, 9, 11], zoom: 48, near: .1, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: false }} fallback={fallback} onPointerMissed={() => safeSelect(0)} aria-label="Plateau de DOCKERS en trois dimensions. Sélectionnez une caisse ou utilisez la liste accessible."><Scene onCameraPose={onCameraPose} interaction={interaction} board={board} selected={selected} customsId={game?.customsId ?? null} onSelect={safeSelect} reduced={reduced} view={view} /></Canvas></Suspense></CanvasBoundary></div>;
}


export interface Destination { move: Move; crate: Crate; label: string }
export interface PivotControl { move: Move; label: string; enabled: boolean; reason?: string; left: boolean }
export interface BoardInteraction {
  destinations: Destination[]; pivots: PivotControl[]; selectedCrate?: Crate; ghost: Crate | null;
  busy: boolean; onActivate: (move: Move) => void; onPreview: (crate: Crate | null) => void;
}
function InteractionLayer({ interaction: i }: { interaction: BoardInteraction }) {
  return <>
    {i.destinations.map(d => <group key={`${d.move.kind}-${d.crate.x}-${d.crate.y}`}>
      <mesh position={[d.crate.x, d.crate.z + .025, -d.crate.y]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}><ringGeometry args={[.29, .41, 4, 1, Math.PI / 4]} /><meshBasicMaterial color="#206a58" transparent opacity={.85} /></mesh>
      <Html center occlude position={[d.crate.x, d.crate.z + .12, -d.crate.y]} zIndexRange={[30, 20]}><button className="destination-target" aria-label={d.label} disabled={i.busy} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); i.onActivate(d.move); }} onMouseEnter={() => i.onPreview(d.crate)} onMouseLeave={() => i.onPreview(null)} onFocus={() => i.onPreview(d.crate)} onBlur={() => i.onPreview(null)}>{d.move.kind === 'chute' ? '↓' : '↷'}</button></Html>
    </group>)}
    {i.selectedCrate && i.pivots.length > 0 && <Html center position={[i.selectedCrate.x, i.selectedCrate.z + 1.45, -i.selectedCrate.y]} zIndexRange={[35, 25]}><div className="plateau-pivots">{i.pivots.map(p => <button key={p.label} aria-label={p.label} title={p.reason} disabled={i.busy || !p.enabled} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); i.onActivate(p.move); }}>{p.left ? '↶' : '↷'}</button>)}</div></Html>}
    {i.ghost && <CrateMesh crate={i.ghost} ghost selected={false} customs={false} grouped={false} onSelect={() => {}} reduced />}
  </>;
}
export function CubeInspector({ crate, view, reduced, reset, pose }: { crate: Crate; view: InspectionView; reduced: boolean; reset: number; pose?: [number, number, number] }) {
  const c = { ...crate, x: 0, y: 0, z: 0 };
  const fallback = <p>L’inspection 3D est indisponible dans ce navigateur.</p>;
  return <div className="inspector-canvas"><CanvasBoundary fallback={fallback}><Suspense fallback={fallback}><Canvas key={reset} frameloop="demand" orthographic camera={{ position: [3, 3, 4], zoom: 130, near: .1, far: 100 }} dpr={[1, 1.8]} aria-label="Cube sélectionné, inspection 3D indépendante"><color attach="background" args={['#f1e5d0']} /><ambientLight intensity={1.7} /><directionalLight position={[4, 6, 3]} intensity={2} /><CrateMesh crate={c} selected={false} customs={false} grouped={false} onSelect={() => {}} reduced={reduced} /><InspectorCamera view={view} pose={pose} /><mesh position={[0, 1.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.1, .15, 32]} /><meshBasicMaterial color="#ffffff" /></mesh></Canvas></Suspense></CanvasBoundary></div>;
}
function InspectorCamera({ view, pose }: { view: InspectionView; pose?: [number, number, number] }) {
  const { camera, invalidate } = useThree(); const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => { const positions: Record<InspectionView, [number, number, number]> = { dessous: [0, -5, .001], libre: [3, 3, 4], dessus: [0, 5, .001], nord: [0, 2, -5], est: [5, 2, 0], sud: [0, 2, 5], ouest: [-5, 2, 0] }; if (pose) { const d = new THREE.Vector3(...pose).normalize().multiplyScalar(5); camera.position.set(d.x, d.y + .49, d.z); } else camera.position.set(...positions[view]); controls.current?.update(); invalidate(); }, [view, pose, camera, invalidate]);
  return <OrbitControls ref={controls} makeDefault target={[0, .49, 0]} enablePan={false} minZoom={75} maxZoom={190} />;
}
