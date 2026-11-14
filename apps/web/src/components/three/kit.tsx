"use client";

/**
 * Shared 3D kit. Every scene uses <Stage>, so all scenes share one lighting
 * setup (a procedural PMREM environment built from emissive panels: no HDR
 * file, no loaders, no network fetch), the Proove palette, capped DPR and
 * on-demand rendering. Only three.js core + its own jsm add-ons are used, to
 * stay inside the 250 KB gzipped budget for the 3D chunk.
 *
 * Animation rule: scenes render on demand. A component that is moving toward
 * a target calls `keepAnimating()` (invalidate) from useFrame until it has
 * settled, so the GPU idles whenever nothing is changing.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export const PINK = new THREE.Color("#FF6FAF");
export const PINK_SOFT = new THREE.Color("#FF9FCB");
export const INK = new THREE.Color("#050505");

export function Stage({
  children,
  camera = { position: [0, 1.2, 6] as [number, number, number], fov: 38 },
  active = true,
  continuous = false,
  bloom = true,
}: {
  children: React.ReactNode;
  camera?: { position: [number, number, number]; fov: number };
  active?: boolean;
  continuous?: boolean;
  bloom?: boolean;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={!active ? "never" : continuous ? "always" : "demand"}
      camera={camera}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <SharedLighting />
      {children}
      {bloom && <Bloom />}
    </Canvas>
  );
}

function SharedLighting() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <pointLight position={[-4, 2, -2]} intensity={12} color={PINK} distance={14} />
      <ProceduralEnvironment />
    </>
  );
}

/**
 * One shared environment map for every scene: a few bright panels and a
 * pink ring rendered into a PMREM cube, so glass and metal pick up the
 * same reflections everywhere.
 */
function ProceduralEnvironment() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new THREE.Scene();
    const panel = (w: number, h: number, color: string, intensity: number, pos: [number, number, number], rot: [number, number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.rotation.set(...rot);
      env.add(m);
    };
    panel(10, 3, "#ffffff", 2.2, [0, 4, -6], [0, 0, 0]);
    panel(6, 4, "#ffd1e6", 1.6, [-6, 1, 0], [0, Math.PI / 2, 0]);
    panel(10, 10, "#1a1a1a", 0.6, [0, -4, 0], [Math.PI / 2, 0, 0]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.25, 12, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color("#FF6FAF").multiplyScalar(3) }));
    ring.position.set(5, 2, 2);
    ring.rotation.y = -Math.PI / 2;
    env.add(ring);
    const rt = pmrem.fromScene(env, 0.04);
    scene.environment = rt.texture;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      env.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    };
  }, [get]);
  return null;
}

/** Soft bloom via three's UnrealBloomPass; takes over rendering (priority 1). */
function Bloom({ strength = 0.45, radius = 0.35, threshold = 0.92 }: { strength?: number; radius?: number; threshold?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), strength, radius, threshold));
    c.addPass(new OutputPass());
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(gl.getPixelRatio());
  }, [composer, size, gl]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);
  return null;
}

/** Rounded box from three's own geometry add-on. */
export function RoundedBox({
  args = [1, 1, 1],
  radius = 0.05,
  smoothness = 4,
  children,
  ...props
}: Omit<React.ComponentProps<"mesh">, "args"> & { args?: [number, number, number]; radius?: number; smoothness?: number }) {
  const geo = useMemo(() => new RoundedBoxGeometry(args[0], args[1], args[2], smoothness, radius), [args, radius, smoothness]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} {...props}>
      {children}
    </mesh>
  );
}

/** Frame-rate independent exponential damping. */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Request another frame while `stillMoving` is true (on-demand loop). */
export function useKeepAnimating() {
  const invalidate = useThree((s) => s.invalidate);
  return (stillMoving: boolean) => {
    if (stillMoving) invalidate();
  };
}

export function GlassMaterial({ tint = "#ffffff", opacity = 1 }: { tint?: string; opacity?: number }) {
  return (
    <meshPhysicalMaterial
      color={tint}
      transmission={1}
      thickness={0.6}
      roughness={0.18}
      ior={1.35}
      clearcoat={1}
      clearcoatRoughness={0.15}
      attenuationColor="#ffd6ea"
      attenuationDistance={4}
      transparent={opacity < 1}
      opacity={opacity}
    />
  );
}

/** Pink emissive material for "active" things. */
export function GlowMaterial({ intensity = 1.6, color = PINK }: { intensity?: number; color?: THREE.Color }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} roughness={0.35} metalness={0.2} />;
}

export function Coin({ glow = 1.1, ...props }: React.ComponentProps<"group"> & { glow?: number }) {
  return (
    <group {...props}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.32, 0.32, 0.07, 40]} />
        <meshStandardMaterial color="#FF8CBF" emissive={PINK} emissiveIntensity={glow * 0.55} metalness={0.75} roughness={0.25} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-z={0.036}>
        <torusGeometry args={[0.22, 0.018, 8, 40]} />
        <meshStandardMaterial color="#ffe1ef" emissive={PINK_SOFT} emissiveIntensity={glow} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Rounded glass vault body; `open` (0–1) lifts the lid. */
export function Vault({ open = 0, fill = 0, size = 1.6 }: { open?: number; fill?: number; size?: number }) {
  const lid = useRef<THREE.Group>(null);
  const level = useRef<THREE.Mesh>(null);
  const keep = useKeepAnimating();
  useFrame((_, dt) => {
    let moving = false;
    if (lid.current) {
      const targetY = size * 0.55 + open * 0.55;
      const targetR = -open * 0.5;
      lid.current.position.y = damp(lid.current.position.y, targetY, 6, dt);
      lid.current.rotation.z = damp(lid.current.rotation.z, targetR, 6, dt);
      moving ||= Math.abs(lid.current.position.y - targetY) > 0.002;
    }
    if (level.current) {
      const target = Math.max(0.001, fill);
      level.current.scale.y = damp(level.current.scale.y, target, 4, dt);
      level.current.position.y = -size * 0.5 + 0.06 + (level.current.scale.y * (size * 0.8)) / 2;
      moving ||= Math.abs(level.current.scale.y - target) > 0.002;
    }
    keep(moving);
  });
  return (
    <group>
      <RoundedBox args={[size, size, size]} radius={0.16} smoothness={4}>
        <GlassMaterial />
      </RoundedBox>
      {/* liquid-like fill showing locked value */}
      <mesh ref={level} position-y={-size * 0.5} scale-y={0.001}>
        <boxGeometry args={[size * 0.82, size * 0.8, size * 0.82]} />
        <meshStandardMaterial color={PINK} emissive={PINK} emissiveIntensity={0.6} transparent opacity={0.55} roughness={0.2} />
      </mesh>
      <group ref={lid} position-y={size * 0.55}>
        <RoundedBox args={[size * 1.04, 0.14, size * 1.04]} radius={0.06} smoothness={3}>
          <meshStandardMaterial color="#d9d9de" metalness={0.9} roughness={0.22} />
        </RoundedBox>
        <mesh position-y={0.08} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.16, 0.03, 10, 32]} />
          <GlowMaterial intensity={open > 0.5 ? 0.4 : 2} />
        </mesh>
      </group>
    </group>
  );
}

export function Floor({ y = -1.2 }: { y?: number }) {
  const geo = useMemo(() => new THREE.CircleGeometry(4.5, 64), []);
  return (
    <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={y}>
      <meshStandardMaterial color="#0b0b0c" metalness={0.6} roughness={0.55} />
    </mesh>
  );
}

/** Draws text onto a canvas texture (no font fetch). */
export function makeLabelTexture(lines: { text: string; size: number; color?: string; weight?: number }[], w = 1024, h = 640, bg = "rgba(12,12,14,0.92)") {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  let y = 70;
  for (const l of lines) {
    ctx.font = `${l.weight ?? 500} ${l.size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = l.color ?? "#F5F5F5";
    ctx.fillText(l.text, 64, y);
    y += l.size * 1.45;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
