"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Coin, PINK, RoundedBox, Stage, damp } from "./kit";

export type LaptopStep = { eyebrow: string; title: string };

/**
 * Landing hero: a procedural laptop driven by scroll.
 *
 * `progress` is a ref (0 → 1 across the sticky story section) so scrolling
 * never re-renders React; the frame loop reads it and damps toward the pose.
 *
 *   0.00  banner pose: lid open, seen from behind at three-quarters
 *   0.12  turns to face the viewer, screen powers on (step 1, Fund)
 *   Lock  lid closes on the coins
 *   Deliv lid reopens, screen shows the checks
 *   Rel.  coins rise out of the screen
 *   0.92+ lid closes for good and the laptop settles
 */
export function HeroLaptop({
  active,
  progress,
  step,
  steps,
}: {
  active: boolean;
  progress: React.RefObject<number>;
  step: number;
  steps: LaptopStep[];
}) {
  return (
    <Stage active={active} continuous camera={{ position: [0, 1.5, 7.2], fov: 34 }}>
      {/* key light from the camera side and a rim light behind, so the lid back reads silver in the banner pose */}
      <directionalLight position={[0, 1.5, 6]} intensity={0.7} />
      <directionalLight position={[-2, 3, -6]} intensity={1.6} />
      <group scale={0.5}>
        <Laptop progress={progress} step={step} steps={steps} />
      </group>
    </Stage>
  );
}

const W = 3.2; // width
const D = 2.15; // depth
const BASE_T = 0.12;
const LID_T = 0.07;
const OPEN = THREE.MathUtils.degToRad(108);

/** Pose targets as a function of scroll progress. */
function poseAt(p: number) {
  const smooth = (a: number, b: number) => THREE.MathUtils.smoothstep(p, a, b);
  // 0 = behind/three-quarters (banner), 1 = facing the viewer
  const face = smooth(0.02, 0.14);
  // lid: open, closes during Lock (≈0.30–0.45), reopens for Deliver, closes at the end
  const lockClose = smooth(0.28, 0.38) * (1 - smooth(0.47, 0.56));
  const finalClose = smooth(0.88, 0.97);
  const lid = OPEN * (1 - Math.max(lockClose, finalClose));
  const screenOn = face * (1 - Math.max(lockClose, finalClose) * 0.9);
  const coinsIn = smooth(0.24, 0.34) * (1 - smooth(0.66, 0.74));
  const coinsOut = smooth(0.66, 0.8) * (1 - smooth(0.9, 0.98));
  return { face, lid, screenOn, coinsIn, coinsOut };
}

function Laptop({ progress, step, steps }: { progress: React.RefObject<number>; step: number; steps: LaptopStep[] }) {
  const root = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const screenMat = useRef<THREE.MeshBasicMaterial>(null);
  const seam = useRef<THREE.MeshStandardMaterial>(null);
  const coins = useRef<(THREE.Group | null)[]>([]);
  const N = 6;

  const chrome = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#c4c4cb",
        metalness: 0.85,
        roughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.5,
      }),
    [],
  );
  const keyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#121214", roughness: 0.55, metalness: 0.2 }), []);
  useEffect(() => () => { chrome.dispose(); keyMat.dispose(); }, [chrome, keyMat]);

  const screenTex = useMemo(() => drawScreen(steps, Math.max(0, step)), [steps, step]);
  useEffect(() => () => screenTex.dispose(), [screenTex]);

  useFrame((state, dt) => {
    const p = progress.current ?? 0;
    const t = state.clock.elapsedTime;
    const pose = poseAt(p);

    if (root.current) {
      const yBack = Math.PI - 0.55; // banner angle: back of the lid toward the camera
      const yFront = -0.28 + Math.sin(t * 0.25) * 0.06;
      const targetY = THREE.MathUtils.lerp(yBack, yFront, pose.face);
      root.current.rotation.y = damp(root.current.rotation.y, targetY, 4, dt);
      root.current.position.y = damp(root.current.position.y, -0.35 + Math.sin(t * 0.8) * 0.03, 3, dt);
      root.current.rotation.x = damp(root.current.rotation.x, 0.08 * pose.face, 3, dt);
    }
    if (lid.current) lid.current.rotation.x = damp(lid.current.rotation.x, -pose.lid, 5, dt);
    if (screenMat.current) {
      const c = screenMat.current.color;
      const v = damp(c.r, 0.08 + pose.screenOn * 0.92, 5, dt);
      c.setRGB(v, v, v);
    }
    if (seam.current) {
      // pink seam glows while the lid is shut on the money
      const closed = 1 - pose.lid / OPEN;
      seam.current.emissiveIntensity = damp(seam.current.emissiveIntensity, closed * 2.4 * pose.face, 5, dt);
    }

    coins.current.forEach((c, i) => {
      if (!c) return;
      const a = (i / N) * Math.PI * 2 + t * 0.4;
      const orbit = new THREE.Vector3(Math.cos(a) * 2.6, 0.55 + Math.sin(a * 2 + i) * 0.25, Math.sin(a) * 1.9);
      const inside = new THREE.Vector3(((i % 3) - 1) * 0.8, 0.1, ((i % 2) - 0.5) * 0.7);
      const out = new THREE.Vector3(((i % 3) - 1) * 0.9, 2.3 + (i % 2) * 0.4 + Math.sin(t * 1.4 + i) * 0.08, -0.9 + (i % 2) * 0.4);
      const target = orbit.clone().lerp(inside, pose.coinsIn).lerp(out, pose.coinsOut);
      c.position.x = damp(c.position.x, target.x, 3.5, dt);
      c.position.y = damp(c.position.y, target.y, 3.5, dt);
      c.position.z = damp(c.position.z, target.z, 3.5, dt);
      const s = 0.55 * (1 - pose.coinsIn * 0.6);
      c.scale.setScalar(damp(c.scale.x, s, 4, dt));
      c.rotation.y += dt * (1.1 - pose.coinsIn);
    });
  });

  const keys = useMemo(() => {
    const cols = 13, rows = 5;
    const kw = 0.18, gap = 0.035;
    const out: { x: number; z: number; w: number }[] = [];
    const total = cols * kw + (cols - 1) * gap;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) out.push({ x: -total / 2 + kw / 2 + c * (kw + gap), z: -0.78 + r * (kw + gap), w: kw });
    out.push({ x: 0, z: -0.78 + rows * (kw + gap), w: 1.2 }); // space bar
    return out;
  }, []);

  return (
    <group ref={root} rotation-y={Math.PI - 0.55} position-y={-0.35}>
      {/* base */}
      <RoundedBox args={[W, BASE_T, D]} radius={0.05} smoothness={4} position-y={BASE_T / 2} material={chrome} />
      {keys.map((k, i) => (
        <mesh key={i} position={[k.x, BASE_T + 0.008, k.z]} material={keyMat}>
          <boxGeometry args={[k.w, 0.016, 0.18]} />
        </mesh>
      ))}
      {/* trackpad */}
      <RoundedBox args={[1.15, 0.006, 0.7]} radius={0.003} smoothness={2} position={[0, BASE_T + 0.003, 0.6]}>
        <meshPhysicalMaterial color="#bfbfc6" metalness={0.8} roughness={0.35} />
      </RoundedBox>
      {/* front seam light */}
      <mesh position={[0, BASE_T + 0.004, D / 2 - 0.02]}>
        <boxGeometry args={[W * 0.4, 0.01, 0.012]} />
        <meshStandardMaterial ref={seam} color={PINK} emissive={PINK} emissiveIntensity={0} toneMapped={false} />
      </mesh>

      {/* lid, hinged on the back edge */}
      <group ref={lid} position={[0, BASE_T + 0.022, -D / 2 + 0.02]} rotation-x={-OPEN}>
        <RoundedBox args={[W, LID_T, D]} radius={0.04} smoothness={4} position={[0, LID_T / 2, D / 2 - 0.02]} material={chrome} />
        {/* display on the inside face */}
        <mesh position={[0, -0.002, D / 2 - 0.02]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[W - 0.16, D - 0.16]} />
          <meshBasicMaterial ref={screenMat} map={screenTex} toneMapped={false} color="#141414" />
        </mesh>
        {/* glowing mark on the back of the lid */}
        <mesh position={[0, LID_T + 0.002, D / 2 - 0.02]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.2, 0.27, 48]} />
          <meshStandardMaterial color={PINK} emissive={PINK} emissiveIntensity={1.8} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {Array.from({ length: N }, (_, i) => (
        <group key={i} ref={(el) => { coins.current[i] = el; }} position={[Math.cos((i / N) * Math.PI * 2) * 2.6, 0.6, Math.sin((i / N) * Math.PI * 2) * 1.9]} scale={0.55}>
          <Coin glow={1.2} />
        </group>
      ))}
    </group>
  );
}

/**
 * The laptop's display: a small Proove UI for the current story step,
 * drawn to a canvas (no font or image fetch).
 */
function drawScreen(steps: LaptopStep[], step: number) {
  const w = 1024, h = 688;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const font = (weight: number, size: number) => `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#0d0d10");
  g.addColorStop(1, "#1a0d14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // top bar
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, w, 70);
  ctx.font = font(800, 30);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("PROOVE", 40, 46);
  ctx.fillStyle = "#FF6FAF";
  ctx.fillText(".", 40 + ctx.measureText("PROOVE").width + 2, 46);

  // progress segments
  const segW = (w - 80 - 3 * 14) / 4;
  steps.forEach((_, i) => {
    ctx.fillStyle = i <= step ? "#FF6FAF" : "rgba(255,255,255,0.12)";
    roundRect(ctx, 40 + i * (segW + 14), 110, segW, 8, 4);
  });

  const s = steps[step] ?? steps[0];
  ctx.font = font(700, 24);
  ctx.fillStyle = "#FF6FAF";
  ctx.fillText(`${step + 1} · ${s.eyebrow.toUpperCase()}`, 40, 178);

  ctx.font = font(700, 50);
  ctx.fillStyle = "#ffffff";
  wrap(ctx, s.title, 40, 248, w - 80, 62);

  // a milestone card that changes with the step
  const states = ["Agreed", "Locked", "Checked", "Released"];
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, 40, 470, w - 80, 170, 22);
  ctx.strokeStyle = "rgba(255,111,175,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(40, 470, w - 80, 170, 22);
  ctx.stroke();
  ctx.font = font(600, 26);
  ctx.fillStyle = "#A1A1AA";
  ctx.fillText("Milestone 1 · Logo system", 76, 520);
  ctx.font = font(800, 54);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("800.00 USDC", 76, 598);
  ctx.font = font(700, 26);
  const pill = states[step] ?? states[0];
  const pw = ctx.measureText(pill).width + 44;
  ctx.fillStyle = "#FF6FAF";
  roundRect(ctx, w - 76 - pw, 560, pw, 48, 24);
  ctx.fillStyle = "#050505";
  ctx.fillText(pill, w - 76 - pw + 22, 593);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
