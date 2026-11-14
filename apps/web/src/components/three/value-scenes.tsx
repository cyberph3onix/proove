"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Coin, Floor, GlassMaterial, GlowMaterial, PINK, Stage, damp, useKeepAnimating, RoundedBox } from "./kit";

/** /wallet: a token stack sized to the balance. */
export function TokenStack({ active, coins }: { active: boolean; coins: number }) {
  const n = Math.max(0, Math.min(40, Math.round(coins)));
  return (
    <Stage active={active} camera={{ position: [0, 1.6, 5], fov: 34 }}>
      <group position-y={-0.9}>
        {Array.from({ length: n }, (_, i) => (
          <StackCoin key={i} i={i} />
        ))}
      </group>
      <Floor y={-1} />
    </Stage>
  );
}

function StackCoin({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  const col = i % 3;
  const targetY = Math.floor(i / 3) * 0.075;
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.y = damp(ref.current.position.y, targetY, 5 - (i % 5) * 0.4, dt);
    keep(Math.abs(ref.current.position.y - targetY) > 0.001);
  });
  return (
    <group ref={ref} position={[(col - 1) * 0.72, 3 + i * 0.05, (col % 2) * 0.1]} rotation={[-Math.PI / 2, 0, i * 0.4]}>
      <Coin glow={0.6} />
    </group>
  );
}

/** /arbitrate: stake as a glowing column. */
export function StakeColumn({ active, stake, required }: { active: boolean; stake: number; required: number }) {
  const ratio = required > 0 ? stake / required : 0;
  return (
    <Stage active={active} camera={{ position: [0, 0.8, 5.2], fov: 34 }}>
      <Column ratio={ratio} />
      <Floor y={-1.2} />
    </Stage>
  );
}

function Column({ ratio }: { ratio: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const keep = useKeepAnimating();
  const target = Math.max(0.05, Math.min(ratio, 3)) * 0.9;
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.scale.y = damp(ref.current.scale.y, target, 3, dt);
    ref.current.position.y = -1.2 + ref.current.scale.y / 2;
    keep(Math.abs(ref.current.scale.y - target) > 0.002);
  });
  return (
    <group>
      <mesh ref={ref} scale-y={0.05} position-y={-1.2}>
        <cylinderGeometry args={[0.38, 0.38, 1, 48]} />
        <GlowMaterial intensity={1.4} />
      </mesh>
      <mesh position-y={-1.2 + 0.45}>
        <cylinderGeometry args={[0.6, 0.6, 0.02, 48]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.25} />
      </mesh>
      <mesh position-y={0.2}>
        <cylinderGeometry args={[0.62, 0.62, 2.8, 48, 1, true]} />
        <GlassMaterial />
      </mesh>
    </group>
  );
}

/** /governance: settings as dials. Each `value` is 0–1 within its allowed range. */
export function SettingDials({ active, values }: { active: boolean; values: number[] }) {
  const n = values.length;
  return (
    <Stage active={active} camera={{ position: [0, 0, 4.4], fov: 30 }}>
      {values.map((v, i) => (
        <Dial key={i} x={(i - (n - 1) / 2) * 2.05} value={v} />
      ))}
    </Stage>
  );
}

function Dial({ x, value }: { x: number; value: number }) {
  const needle = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  const target = Math.PI * 0.75 - value * Math.PI * 1.5;
  useFrame((_, dt) => {
    if (!needle.current) return;
    needle.current.rotation.z = damp(needle.current.rotation.z, target, 3, dt);
    keep(Math.abs(needle.current.rotation.z - target) > 0.002);
  });
  return (
    <group position-x={x}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.52, 0.52, 0.12, 48]} />
        <meshStandardMaterial color="#d4d4d8" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position-z={0.07} rotation-z={-Math.PI / 4}>
        <torusGeometry args={[0.44, 0.025, 8, 64, Math.PI * 1.5]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <group ref={needle} position-z={0.09} rotation-z={Math.PI * 0.75}>
        <mesh position-y={0.2}>
          <boxGeometry args={[0.05, 0.4, 0.03]} />
          <GlowMaterial intensity={2} />
        </mesh>
      </group>
    </group>
  );
}

/** /receivables: the receivable card hands over between two wallet pads on purchase. */
export function ReceivableHandoff({ active, toBuyer }: { active: boolean; toBuyer: boolean }) {
  return (
    <Stage active={active} camera={{ position: [0, 2, 5.6], fov: 34 }}>
      <Pad x={-1.6} lit={!toBuyer} />
      <Pad x={1.6} lit={toBuyer} />
      <ReceivableCard toBuyer={toBuyer} />
      <Floor y={-0.7} />
    </Stage>
  );
}

function Pad({ x, lit }: { x: number; lit: boolean }) {
  return (
    <mesh position={[x, -0.6, 0]}>
      <cylinderGeometry args={[0.8, 0.85, 0.12, 48]} />
      {lit ? <GlowMaterial intensity={0.9} /> : <meshStandardMaterial color="#27272a" metalness={0.6} roughness={0.4} />}
    </mesh>
  );
}

function ReceivableCard({ toBuyer }: { toBuyer: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  useFrame((st, dt) => {
    if (!ref.current) return;
    const tx = toBuyer ? 1.6 : -1.6;
    ref.current.position.x = damp(ref.current.position.x, tx, 2.2, dt);
    const progress = 1 - Math.abs(ref.current.position.x - tx) / 3.2;
    ref.current.position.y = 0.3 + Math.sin(progress * Math.PI) * 0.9;
    ref.current.rotation.y = damp(ref.current.rotation.y, toBuyer ? -0.3 : 0.3, 3, dt);
    keep(Math.abs(ref.current.position.x - tx) > 0.002);
    void st;
  });
  return (
    <group ref={ref} position={[-1.6, 0.3, 0]}>
      <RoundedBox args={[1.3, 0.85, 0.04]} radius={0.06}>
        <meshPhysicalMaterial color="#ffe3f0" transmission={0.6} roughness={0.2} thickness={0.3} clearcoat={1} />
      </RoundedBox>
      <mesh position={[0.45, 0.25, 0.03]}>
        <circleGeometry args={[0.08, 24]} />
        <meshBasicMaterial color={PINK} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** /gigs/new: criteria cards assemble into a stack as Gemini streams them. */
export function CriteriaStack({ active, count, flagged }: { active: boolean; count: number; flagged: boolean[] }) {
  return (
    <Stage active={active} bloom={false} camera={{ position: [2.4, 2.2, 4.6], fov: 34 }}>
      {Array.from({ length: Math.min(count, 12) }, (_, i) => (
        <CriterionCard key={i} i={i} flagged={flagged[i]} />
      ))}
      <mesh position-y={-0.08} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.6, 48]} />
        <meshStandardMaterial color="#0d0d0f" />
      </mesh>
    </Stage>
  );
}

function CriterionCard({ i, flagged }: { i: number; flagged?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  const targetY = i * 0.09;
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.y = damp(ref.current.position.y, targetY, 5, dt);
    ref.current.rotation.y = damp(ref.current.rotation.y, (i % 2 ? 0.04 : -0.04), 5, dt);
    keep(Math.abs(ref.current.position.y - targetY) > 0.001);
  });
  return (
    <group ref={ref} position-y={2.4} rotation-y={1}>
      <RoundedBox args={[1.6, 0.06, 1]} radius={0.025}>
        {flagged ? (
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.4} />
        ) : (
          <meshPhysicalMaterial color="#ffffff" transmission={0.8} roughness={0.2} thickness={0.2} clearcoat={1} />
        )}
      </RoundedBox>
    </group>
  );
}

/** /gigs/[gigId]: milestone track; each node's ring fills toward its next timeout. */
export function MilestoneTrack({
  active,
  nodes,
}: {
  active: boolean;
  nodes: { progress: number; state: "idle" | "active" | "done" | "frozen" }[];
}) {
  const n = Math.max(1, nodes.length);
  return (
    <Stage active={active} camera={{ position: [0, 0.2, 2.6 + n * 0.9], fov: 34 }}>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.012, 0.012, (n - 1) * 1.5 + 0.4, 8]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      {nodes.map((node, i) => (
        <TrackNode key={i} x={(i - (n - 1) / 2) * 1.5} {...node} />
      ))}
    </Stage>
  );
}

function TrackNode({ x, progress, state }: { x: number; progress: number; state: "idle" | "active" | "done" | "frozen" }) {
  const ring = useRef<THREE.Mesh>(null);
  const keep = useKeepAnimating();
  const shown = useRef(0);
  useFrame((_, dt) => {
    shown.current = damp(shown.current, progress, 3, dt);
    if (ring.current) {
      ring.current.geometry.dispose();
      ring.current.geometry = new THREE.TorusGeometry(0.36, 0.035, 8, 64, Math.max(0.001, shown.current) * Math.PI * 2);
    }
    keep(Math.abs(shown.current - progress) > 0.002);
  });
  return (
    <group position-x={x}>
      <mesh>
        <sphereGeometry args={[0.2, 32, 32]} />
        {state === "done" ? (
          <GlowMaterial intensity={1.2} />
        ) : state === "frozen" ? (
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} />
        ) : state === "active" ? (
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} roughness={0.15} thickness={0.4} />
        ) : (
          <meshStandardMaterial color="#27272a" />
        )}
      </mesh>
      <mesh ref={ring} rotation-z={Math.PI / 2}>
        <torusGeometry args={[0.36, 0.035, 8, 64, 0.001]} />
        <GlowMaterial intensity={state === "frozen" ? 0.3 : 1.8} />
      </mesh>
    </group>
  );
}
