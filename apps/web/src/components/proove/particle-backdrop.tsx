"use client";

import { ParticleField, Poster, Scene3D } from "@/components/three";

export function ParticleBackdrop() {
  return (
    <Scene3D className="absolute inset-0 pointer-events-none opacity-80" label="Soft pink particle field" poster={<Poster />}>
      {(active) => <ParticleField active={active} />}
    </Scene3D>
  );
}
