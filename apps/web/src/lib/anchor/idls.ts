// idl/*.{json,ts} are copied from target/idl and target/types -- Turbopack's
// root is pinned to apps/web (next.config.ts), so it can't resolve imports
// outside this directory. Re-copy after `anchor build` changes an IDL.
import { PublicKey } from "@solana/web3.js";

import gigIdl from "./idl/gig.json" with { type: "json" };
import escrowIdl from "./idl/escrow.json" with { type: "json" };
import reputationIdl from "./idl/reputation.json" with { type: "json" };
import achievementIdl from "./idl/achievement.json" with { type: "json" };

import type { Gig } from "./idl/gig";
import type { Escrow } from "./idl/escrow";
import type { Reputation } from "./idl/reputation";
import type { Achievement } from "./idl/achievement";

export { gigIdl, escrowIdl, reputationIdl, achievementIdl };
export type { Gig, Escrow, Reputation, Achievement };

export const PROGRAM_IDS = {
  gig: new PublicKey(gigIdl.address),
  escrow: new PublicKey(escrowIdl.address),
  reputation: new PublicKey(reputationIdl.address),
  achievement: new PublicKey(achievementIdl.address),
};
