import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { definition } from '../engine/catalogue';
import { groups, visible } from '../engine/geometry';
import type { Color, Crate, Face, Game } from '../engine/types';
export type View = 'libre' | 'dessus' | 'nord' | 'est' | 'sud' | 'ouest';
export const PALETTE: Record<Color, string> = { bleu: '#5085af', rouge: '#b95949', jaune: '#d5aa4b', vert: '#528b76' };
export const LABELS: Record<Color, string> = { bleu: 'Bleu', rouge: 'Rouge', jaune: 'Jaune', vert: 'Vert' };
export const SYMBOLS: Record<Color, string> = { bleu: '◆', rouge: '●', jaune: '✦', vert: '▲' };
const cache = new Map<string, THREE.CanvasTexture>();
const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
function texture(face: Face, name: string) {
  const key = face || name; if (cache.has(key)) return cache.get(key)!;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = face ? PALETTE[face] : '#c9a574'; ctx.fillRect(0, 0, 256, 256);
  // Deterministic grain avoids external image/font dependencies.
  for (let i = 0; i < 35; i++) { ctx.strokeStyle = `rgba(75,46,19,${i % 3 === 0 ? '.07' : '.025'})`; ctx.beginPath(); const y = (i * 29) % 256; ctx.moveTo(0, y); ctx.bezierCurveTo(75, y + 5, 180, y - 5, 256, y + 1); ctx.stroke(); }
  ctx.strokeStyle = face ? '#b99365' : '#8b6d46'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 242, 242);
  ctx.strokeStyle = 'rgba(57,43,25,.3)'; ctx.lineWidth = 2; ctx.strokeRect(17, 17, 222, 222);
  ctx.fillStyle = face ? 'rgba(255,255,255,.68)' : '#51472e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (face) { ctx.font = 'bold 48px sans-serif'; ctx.fillText(SYMBOLS[face], 128, 104); ctx.font = 'bold 22px sans-serif'; ctx.fillText(LABELS[face].toUpperCase(), 128, 158); }
  else { ctx.font = 'bold 15px sans-serif'; ctx.fillText('DOCKERS · PORT', 128, 82); ctx.font = `bold ${name.length > 10 ? 24 : 28}px Georgia`; ctx.fillText(name, 128, 126, 207); ctx.font = '13px monospace'; ctx.fillText('MARCHANDISES', 128, 170); }
  ctx.fillStyle = '#785c3d'; for (const x of [20, 236]) for (const y of [20, 236]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; cache.set(key, tex); return tex;
}
const vectors = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)];
function quaternion(c: Crate) { const e = vectors[c.orientation.indexOf(2)], t = vectors[c.orientation.indexOf(0)], s = vectors[c.orientation.indexOf(3)]; return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e, t, s)); }
function CrateMesh({ crate, selected, customs, grouped, onSelect, reduced }: { crate: Crate; selected: boolean; customs: boolean; grouped: boolean; onSelect: (id: number) => void; reduced: boolean }) {
  const group = useRef<THREE.Group>(null); const target = useMemo(() => new THREE.Vector3(crate.x, crate.z + .49, -crate.y), [crate.x, crate.y, crate.z]);
  const rotation = useMemo(() => quaternion(crate), [crate.orientation]);
  const data = definition(crate.id); const maps = useMemo(() => [2, 4, 0, 5, 3, 1].map(i => texture(data.faces[i], data.name)), [data]);
  const [hover, setHover] = useState(false);
  const invalidate = useThree(state => state.invalidate);
  useFrame((_, delta) => { if (!group.current) return; const alpha = reduced ? 1 : 1 - Math.exp(-delta * 14); group.current.position.lerp(target, alpha); group.current.quaternion.slerp(rotation, alpha); if (group.current.position.distanceToSquared(target) > .00001 || group.current.quaternion.angleTo(rotation) > .001) invalidate(); });
  useEffect(() => { if (group.current) { group.current.position.copy(target); group.current.quaternion.copy(rotation); } }, []);
  return <>
    <group ref={group}>
      <mesh castShadow receiveShadow onClick={e => { e.stopPropagation(); onSelect(crate.id); }} onPointerOver={e => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}>
        <boxGeometry args={[.965, .965, .965]} />
        {maps.map((map, i) => <meshStandardMaterial key={i} attach={`material-${i}`} map={map} roughness={.87} color={hover ? '#fff8d9' : '#ffffff'} />)}
      </mesh>
    </group>
    {(selected || hover) && <lineSegments position={target} scale={1.025} geometry={outlineGeometry}><lineBasicMaterial color={selected ? '#163f35' : '#fff7d8'} /></lineSegments>}
    {grouped && <mesh position={[crate.x, crate.z + 1.01, -crate.y]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.06, .1, 20]} /><meshBasicMaterial color="#ffffff" /></mesh>}
    {customs && <group position={[crate.x, crate.z + 1.06, -crate.y]}><mesh castShadow><cylinderGeometry args={[.25, .25, .09, 32]} /><meshStandardMaterial color="#243e36" /></mesh><mesh position={[0, .05, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.14, .18, 24]} /><meshBasicMaterial color="#efcc78" /></mesh></group>}
  </>;
}
function CameraRig({ view }: { view: View }) {
  const { camera } = useThree(); const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => { const positions: Record<View, [number, number, number]> = { libre: [9, 9, 11], dessus: [0, 14, .001], nord: [0, 4, -13], sud: [0, 4, 13], est: [13, 4, 0], ouest: [-13, 4, 0] }; camera.position.set(...positions[view]); controls.current?.target.set(0, .6, 0); controls.current?.update(); }, [view, camera]);
  return <OrbitControls ref={controls} makeDefault target={[0, .6, 0]} enablePan={false} enableRotate={view === 'libre'} minZoom={28} maxZoom={92} minPolarAngle={.05} maxPolarAngle={Math.PI / 2.1} />;
}
function Scene({ board, selected, customsId, onSelect, reduced, view }: { board: Crate[]; selected: number | null; customsId: number | null; onSelect: (id: number) => void; reduced: boolean; view: View }) {
  const grouped = useMemo(() => new Set(groups(board).flatMap(g => g.ids)), [board]);
  return <>
    <color attach="background" args={['#e4e9df']} /><ambientLight intensity={1.4} /><directionalLight position={[5, 10, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.04} />
    <mesh receiveShadow position={[0, -.38, 0]}><boxGeometry args={[7.4, .55, 7.4]} /><meshStandardMaterial color="#6b7863" roughness={.85} /></mesh>
    {Array.from({ length: 49 }, (_, i) => { const x = i % 7 - 3, y = Math.floor(i / 7) - 3; return <mesh key={i} receiveShadow position={[x, -.075, -y]}><boxGeometry args={[.988, .06, .988]} /><meshStandardMaterial color={(x + y) % 2 ? '#d7ddc8' : '#e3e5d3'} roughness={1} /></mesh>; })}
    <mesh receiveShadow position={[0, -.69, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#e4e9df" /></mesh>
    {board.map(c => <CrateMesh key={c.id} crate={c} selected={selected === c.id} customs={customsId === c.id} grouped={grouped.has(c.id) && visible(board, c)} onSelect={onSelect} reduced={reduced} />)}
    <CameraRig view={view} />
  </>;
}
class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? this.props.fallback : this.props.children; } }
export function Board({ game, board, selected, onSelect, view, reduced }: { game?: Game | null; board: Crate[]; selected: number | null; onSelect: (id: number) => void; view: View; reduced: boolean }) {
  const fallback = <div className="canvas-fallback">La vue 3D n’est pas disponible dans ce navigateur. Utilisez la liste des caisses et leurs fiches pour jouer.</div>;
  return <CanvasBoundary fallback={fallback}><Suspense fallback={<div className="canvas-fallback">Ouverture de l’entrepôt…</div>}><Canvas frameloop="demand" orthographic shadows dpr={[1, 1.8]} camera={{ position: [9, 9, 11], zoom: 48, near: .1, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: false }} fallback={fallback} onPointerMissed={() => onSelect(0)} aria-label="Plateau de DOCKERS en trois dimensions. Sélectionnez une caisse ou utilisez la liste accessible."><Scene board={board} selected={selected} customsId={game?.customsId ?? null} onSelect={onSelect} reduced={reduced} view={view} /></Canvas></Suspense></CanvasBoundary>;
}
