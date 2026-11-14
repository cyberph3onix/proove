"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Floor, GlassMaterial, GlowMaterial, PINK, Stage, damp, useKeepAnimating, RoundedBox } from "./kit";

export type SeatVisual = "pending" | "running" | "posted" | "failed";

/**
 * Three AI seats and an arbitrator bench. Seats light up as their
 * evaluations land on-chain; the scales settle to the ruling only once a
 * verdict is signed (null = level, still undecided).
 */
export function DisputeChamber({
  active,
  seats,
  arbitratorsSigned,
  arbitratorsRequired,
  ruling,
}: {
  active: boolean;
  seats: SeatVisual[];
  arbitratorsSigned: number;
  arbitratorsRequired: number;
  ruling: number | null;
}) {
  return (
    <Stage active={active} camera={{ position: [0, 2.6, 7.2], fov: 34 }}>
      <group position-y={-0.2}>
        {seats.map((s, i) => (
          <Seat key={i} x={(i - 1) * 1.7} z={-1.2} state={s} />
        ))}
        <Bench signed={arbitratorsSigned} required={arbitratorsRequired} />
        <Scales ruling={ruling} />
      </group>
      <Floor y={-0.85} />
    </Stage>
  );
}

function Seat({ x, z, state }: { x: number; z: number; state: SeatVisual }) {
  const orb = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const keep = useKeepAnimating();
  const target = state === "posted" ? 1.4 : state === "running" ? 1.0 : state === "failed" ? 0.0 : 0.15;
  useFrame((st, dt) => {
    if (!mat.current || !orb.current) return;
    mat.current.emissiveIntensity = damp(mat.current.emissiveIntensity, target, 4, dt);
    const pulse = state === "running" ? 0.08 * Math.sin(st.clock.elapsedTime * 4) : 0;
    orb.current.scale.setScalar(1 + pulse);
    keep(Math.abs(mat.current.emissiveIntensity - target) > 0.01 || state === "running");
  });
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.9, 1.1, 0.9]} radius={0.12} position-y={-0.3}>
        <GlassMaterial />
      </RoundedBox>
      <mesh ref={orb} position-y={0.55}>
        <icosahedronGeometry args={[0.28, 2]} />
        <meshStandardMaterial
          ref={mat}
          color={state === "failed" ? "#3f3f46" : "#FF8CBF"}
          emissive={state === "failed" ? new THREE.Color("#000000") : PINK}
          emissiveIntensity={0.15}
          toneMapped={false}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

function Bench({ signed, required }: { signed: number; required: number }) {
  return (
    <group position={[0, -0.45, 1.3]}>
      <RoundedBox args={[3.2, 0.5, 0.7]} radius={0.1}>
        <meshStandardMaterial color="#8a8a92" metalness={0.85} roughness={0.35} />
      </RoundedBox>
      {Array.from({ length: Math.max(required, 1) }, (_, i) => (
        <mesh key={i} position={[(i - (Math.max(required, 1) - 1) / 2) * 0.9, 0.32, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 32]} />
          {i < signed ? <GlowMaterial intensity={1.3} /> : <meshStandardMaterial color="#27272a" />}
        </mesh>
      ))}
    </group>
  );
}

function Scales({ ruling }: { ruling: number | null }) {
  const beam = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  // Freelancer pan on the left; tilt toward whoever gets more.
  const target = ruling === null ? 0 : ((ruling - 5000) / 5000) * 0.38;
  useFrame((_, dt) => {
    if (!beam.current || !left.current || !right.current) return;
    beam.current.rotation.z = damp(beam.current.rotation.z, target, 2.5, dt);
    const r = beam.current.rotation.z;
    left.current.position.y = -Math.sin(r) * 1.1 * -1 - 0.5;
    right.current.position.y = Math.sin(r) * 1.1 * -1 - 0.5;
    keep(Math.abs(beam.current.rotation.z - target) > 0.0015);
  });
  return (
    <group position={[0, 1.15, 0.2]}>
      <mesh position-y={-0.9}>
        <cylinderGeometry args={[0.04, 0.06, 1.8, 16]} />
        <meshStandardMaterial color="#d9d9de" metalness={0.9} roughness={0.2} />
      </mesh>
      <group ref={beam}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.035, 0.035, 2.3, 16]} />
          <meshStandardMaterial color="#d9d9de" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
      <group ref={left} position={[-1.1, -0.5, 0]}>
        <mesh>
          <cylinderGeometry args={[0.38, 0.3, 0.06, 32]} />
          <GlowMaterial intensity={ruling !== null && ruling >= 5000 ? 1.8 : 0.4} />
        </mesh>
      </group>
      <group ref={right} position={[1.1, -0.5, 0]}>
        <mesh>
          <cylinderGeometry args={[0.38, 0.3, 0.06, 32]} />
          <meshStandardMaterial color="#e4e4e7" metalness={0.8} roughness={0.25} emissive="#ffffff" emissiveIntensity={ruling !== null && ruling < 5000 ? 0.5 : 0.05} />
        </mesh>
      </group>
    </group>
  );
}
