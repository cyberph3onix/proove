"use client";

import { useEffect, useMemo, useRef } from "react";
import { prng } from "@/lib/domain/hash";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GlowMaterial, PINK, Stage, damp, makeLabelTexture, useKeepAnimating, RoundedBox } from "./kit";

/**
 * Score crystal: four facet clusters sized by the score components
 * (success, rating, volume, earnings), plus earned badges as medals.
 */
export function ScoreCrystal({
  active,
  components,
  medals,
}: {
  active: boolean;
  components: { success: number; rating: number; volume: number; earnings: number };
  medals: { minted: boolean }[];
}) {
  return (
    <Stage active={active} camera={{ position: [0, 0.6, 5.4], fov: 36 }}>
      <Crystal components={components} />
      {medals.slice(0, 7).map((m, i) => (
        <Medal key={i} index={i} total={Math.min(medals.length, 7)} minted={m.minted} />
      ))}
    </Stage>
  );
}

function Crystal({ components }: { components: { success: number; rating: number; volume: number; earnings: number } }) {
  const group = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  const values = [components.success, components.rating, components.volume, components.earnings];
  const facets = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    let moving = false;
    facets.current.forEach((f, i) => {
      if (!f) return;
      const target = 0.35 + (values[i] / 100) * 0.9;
      f.scale.y = damp(f.scale.y, target, 3, dt);
      moving ||= Math.abs(f.scale.y - target) > 0.002;
    });
    if (group.current) {
      const targetRot = 0.6;
      group.current.rotation.y = damp(group.current.rotation.y, targetRot, 1.5, dt);
      moving ||= Math.abs(group.current.rotation.y - targetRot) > 0.002;
    }
    keep(moving);
  });
  return (
    <group ref={group}>
      {values.map((_, i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} ref={(el) => { facets.current[i] = el; }} position={[Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32]} rotation={[0, -a, 0.12]} scale={[1, 0.35, 1]}>
            <octahedronGeometry args={[0.62, 0]} />
            <meshPhysicalMaterial color="#ffe3f0" transmission={0.92} thickness={0.8} roughness={0.08} ior={1.6} clearcoat={1} attenuationColor="#FF6FAF" attenuationDistance={1.4} />
          </mesh>
        );
      })}
      <mesh>
        <icosahedronGeometry args={[0.22, 1]} />
        <GlowMaterial intensity={2.2} />
      </mesh>
    </group>
  );
}

function Medal({ index, total, minted }: { index: number; total: number; minted: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const a = (index / total) * Math.PI * 2;
  useFrame((st) => {
    if (!ref.current) return;
    ref.current.rotation.y = st.clock.elapsedTime * 0.6 + index;
  });
  return (
    <group ref={ref} position={[Math.cos(a) * 1.9, Math.sin(a) * 0.5 - 0.1, Math.sin(a) * 0.6]}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.24, 0.24, 0.05, 32]} />
        <meshStandardMaterial color={minted ? "#f0c7da" : "#52525b"} metalness={0.85} roughness={0.25} emissive={minted ? PINK : new THREE.Color("#000")} emissiveIntensity={minted ? 0.4 : 0} />
      </mesh>
    </group>
  );
}

/** Credential card that flips to show the attested fields. */
export function CredentialCard3D({
  active,
  front,
  fields,
  flipped,
  revoked,
}: {
  active: boolean;
  front: { title: string; subject: string; schema: string };
  fields: [string, string][];
  flipped: boolean;
  revoked?: boolean;
}) {
  const textures = useMemo(() => {
    const f = makeLabelTexture(
      [
        { text: "PROOVE · VERIFIABLE CREDENTIAL", size: 30, color: "#FF6FAF", weight: 700 },
        { text: front.title, size: 64, weight: 700 },
        { text: front.schema, size: 30, color: "#A1A1AA" },
        { text: "", size: 30 },
        { text: `subject ${front.subject}`, size: 30, color: "#D4D4D8" },
        { text: revoked ? "REVOKED" : "Solana Attestation Service", size: 30, color: revoked ? "#fca5a5" : "#A1A1AA" },
      ],
      1024,
      640,
    );
    const b = makeLabelTexture(
      [{ text: "ATTESTED FIELDS", size: 30, color: "#FF6FAF", weight: 700 }, ...fields.slice(0, 9).map(([k, v]) => ({ text: `${k}: ${v}`, size: 36, color: "#F5F5F5" }))],
      1024,
      640,
    );
    return { f, b };
  }, [front.title, front.subject, front.schema, fields, revoked]);
  useEffect(
    () => () => {
      textures.f.dispose();
      textures.b.dispose();
    },
    [textures],
  );
  return (
    <Stage active={active} camera={{ position: [0, 0, 5], fov: 32 }}>
      <Card flipped={flipped} front={textures.f} back={textures.b} />
    </Stage>
  );
}

function Card({ flipped, front, back }: { flipped: boolean; front: THREE.Texture; back: THREE.Texture }) {
  const ref = useRef<THREE.Group>(null);
  const keep = useKeepAnimating();
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = flipped ? Math.PI : 0;
    ref.current.rotation.y = damp(ref.current.rotation.y, target, 5, dt);
    keep(Math.abs(ref.current.rotation.y - target) > 0.002);
  });
  return (
    <group ref={ref} rotation-x={-0.08}>
      <RoundedBox args={[3.2, 2, 0.06]} radius={0.08} smoothness={4}>
        <meshStandardMaterial color="#141416" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      <mesh position-z={0.032}>
        <planeGeometry args={[3.05, 1.9]} />
        <meshBasicMaterial map={front} toneMapped={false} />
      </mesh>
      <mesh position-z={-0.032} rotation-y={Math.PI}>
        <planeGeometry args={[3.05, 1.9]} />
        <meshBasicMaterial map={back} toneMapped={false} />
      </mesh>
      <mesh position={[1.3, 0.72, 0.04]}>
        <circleGeometry args={[0.1, 32]} />
        <GlowMaterial intensity={2} />
      </mesh>
    </group>
  );
}

/** Pink particle field for /role and /sign-in. */
export function ParticleField({ active }: { active: boolean }) {
  return (
    <Stage active={active} continuous bloom={false} camera={{ position: [0, 0, 6], fov: 50 }}>
      <Particles />
    </Stage>
  );
}

function Particles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 900;
    const rand = prng(0x70726f6f);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() - 0.5) * 14;
      pos[i * 3 + 1] = (rand() - 0.5) * 8;
      pos[i * 3 + 2] = (rand() - 0.5) * 6;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((st) => {
    if (ref.current) {
      ref.current.rotation.y = st.clock.elapsedTime * 0.02;
      ref.current.rotation.x = Math.sin(st.clock.elapsedTime * 0.1) * 0.05;
    }
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.035} color="#FF6FAF" transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}
