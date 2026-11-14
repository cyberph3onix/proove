"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Coin, Floor, Stage, Vault, damp, useKeepAnimating } from "./kit";

/**
 * Landing hero. `stage` comes from scroll position:
 * 0 fund (coins orbit outside) → 1 lock (coins inside, lid sealed)
 * → 2 deliver (vault glows) → 3 release (lid opens, coins rise out).
 */
export function HeroVault({ active, stage }: { active: boolean; stage: number }) {
  return (
    <Stage active={active} continuous camera={{ position: [0, 1.4, 6.4], fov: 36 }}>
      <HeroContent stage={stage} />
      <Floor y={-1.15} />
    </Stage>
  );
}

function HeroContent({ stage }: { stage: number }) {
  const group = useRef<THREE.Group>(null);
  const coins = useRef<(THREE.Group | null)[]>([]);
  const N = 7;
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (group.current) group.current.rotation.y = damp(group.current.rotation.y, Math.sin(t * 0.15) * 0.35, 2, dt);
    coins.current.forEach((c, i) => {
      if (!c) return;
      const a = (i / N) * Math.PI * 2 + t * 0.35;
      const orbit = { x: Math.cos(a) * 2.2, y: Math.sin(a * 2) * 0.25 + 0.2, z: Math.sin(a) * 2.2 };
      const inside = { x: ((i % 3) - 1) * 0.36, y: -0.45 + Math.floor(i / 3) * 0.1, z: ((i % 2) - 0.5) * 0.3 };
      const out = { x: Math.cos(a) * 1.4, y: 1.8 + (i % 3) * 0.3 + Math.sin(t + i) * 0.1, z: Math.sin(a) * 1.4 };
      const target = stage < 0.5 ? orbit : stage < 2.5 ? inside : out;
      c.position.x = damp(c.position.x, target.x, 3, dt);
      c.position.y = damp(c.position.y, target.y, 3, dt);
      c.position.z = damp(c.position.z, target.z, 3, dt);
      c.rotation.y += dt * (stage < 0.5 || stage >= 2.5 ? 1.2 : 0.2);
      c.rotation.x = stage >= 0.5 && stage < 2.5 ? damp(c.rotation.x, Math.PI / 2, 4, dt) : damp(c.rotation.x, 0.3, 4, dt);
    });
  });
  return (
    <group ref={group}>
      <Vault open={stage >= 2.5 ? 1 : 0} fill={stage >= 0.5 && stage < 2.5 ? 0.45 : stage >= 2.5 ? 0.05 : 0} />
      {Array.from({ length: N }, (_, i) => (
        <group key={i} ref={(el) => { coins.current[i] = el; }} position={[Math.cos((i / N) * Math.PI * 2) * 2.2, 0.2, Math.sin((i / N) * Math.PI * 2) * 2.2]}>
          <Coin glow={stage >= 1.5 && stage < 2.5 ? 1.8 : 0.9} scale={0.72} />
        </group>
      ))}
    </group>
  );
}

/** Dashboard: one small vault per active gig, filled to its locked share. */
export function MiniVaults({ active, fills }: { active: boolean; fills: number[] }) {
  const n = Math.max(1, Math.min(fills.length, 5));
  const spacing = 2.1;
  return (
    <Stage active={active} bloom={false} camera={{ position: [0, 1.6, 4.2 + n * 1.3], fov: 34 }}>
      {fills.slice(0, 5).map((f, i) => (
        <group key={i} position-x={(i - (n - 1) / 2) * spacing} scale={0.9}>
          <Vault fill={f} />
        </group>
      ))}
      <Floor y={-0.85} />
    </Stage>
  );
}

/**
 * Hire flow. `dropped` turns true only when the funding tx is confirmed:
 * then a coin falls in and the lid seals.
 */
export function CoinDropVault({ active, dropped }: { active: boolean; dropped: boolean }) {
  return (
    <Stage active={active} camera={{ position: [0, 1.6, 5.6], fov: 36 }}>
      <CoinDrop dropped={dropped} />
      <Vault open={dropped ? 0 : 1} fill={dropped ? 0.5 : 0} />
      <Floor y={-1.1} />
    </Stage>
  );
}

function CoinDrop({ dropped }: { dropped: boolean }) {
  const coin = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  useFrame((_, dt) => {
    if (!coin.current) return;
    const targetY = dropped ? -0.4 : 2.1;
    coin.current.position.y = damp(coin.current.position.y, targetY, dropped ? 3.5 : 6, dt);
    coin.current.rotation.y += dt * 0.8;
    keep(Math.abs(coin.current.position.y - targetY) > 0.003);
  });
  return (
    <group ref={coin} position-y={2.1}>
      <Coin glow={1.6} scale={1.3} />
    </group>
  );
}
