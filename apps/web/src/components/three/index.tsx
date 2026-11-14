"use client";

/**
 * Lazy entry points for every 3D scene. three.js and friends live in their
 * own chunks (next/dynamic, ssr: false) so page text and buttons never wait
 * on them. Use inside <Scene3D>, which supplies the poster fallback.
 */
import dynamic from "next/dynamic";

const none = () => null;

export const HeroLaptop = dynamic(() => import("./laptop-scenes").then((m) => m.HeroLaptop), { ssr: false, loading: none });
export const HeroVault =dynamic(() => import("./vault-scenes").then((m) => m.HeroVault), { ssr: false, loading: none });
export const MiniVaults = dynamic(() => import("./vault-scenes").then((m) => m.MiniVaults), { ssr: false, loading: none });
export const CoinDropVault = dynamic(() => import("./vault-scenes").then((m) => m.CoinDropVault), { ssr: false, loading: none });
export const DisputeChamber = dynamic(() => import("./dispute-chamber").then((m) => m.DisputeChamber), { ssr: false, loading: none });
export const ScoreCrystal = dynamic(() => import("./identity-scenes").then((m) => m.ScoreCrystal), { ssr: false, loading: none });
export const CredentialCard3D = dynamic(() => import("./identity-scenes").then((m) => m.CredentialCard3D), { ssr: false, loading: none });
export const ParticleField = dynamic(() => import("./identity-scenes").then((m) => m.ParticleField), { ssr: false, loading: none });
export const TokenStack = dynamic(() => import("./value-scenes").then((m) => m.TokenStack), { ssr: false, loading: none });
export const StakeColumn = dynamic(() => import("./value-scenes").then((m) => m.StakeColumn), { ssr: false, loading: none });
export const SettingDials = dynamic(() => import("./value-scenes").then((m) => m.SettingDials), { ssr: false, loading: none });
export const ReceivableHandoff = dynamic(() => import("./value-scenes").then((m) => m.ReceivableHandoff), { ssr: false, loading: none });
export const CriteriaStack = dynamic(() => import("./value-scenes").then((m) => m.CriteriaStack), { ssr: false, loading: none });
export const MilestoneTrack = dynamic(() => import("./value-scenes").then((m) => m.MilestoneTrack), { ssr: false, loading: none });

export { Scene3D, Poster, VaultPoster, useReducedMotion } from "./scene-3d";
