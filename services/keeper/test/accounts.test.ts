import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  associatedTokenAddress,
  decodeClockUnixTimestamp,
  decodeConfig,
  decodeGig,
  decodeMilestone,
  decodeVault,
  DISCRIMINATORS,
  OFFSETS,
  profilePda,
  REPUTATION_PROGRAM_ID,
  vaultTokenPda,
} from "../src/accounts";
import { MILESTONE_STATUSES } from "../src/due";
import { clockData, encodeConfig, encodeGig, encodeMilestone, encodeVault, key, milestone, vault } from "./fixtures";

describe("account decoding", () => {
  it("round-trips a milestone in every status", async () => {
    for (const status of MILESTONE_STATUSES) {
      const m = milestone({ status, released: 3n, refunded: 1n, feesPaid: 2n, index: 4 });
      const data = await encodeMilestone(m);
      expect(data.subarray(0, 8)).toEqual(DISCRIMINATORS.Milestone);
      expect(decodeMilestone(m.address, data)).toEqual(m);
    }
  });

  it("puts the milestone status byte at the filter offset", async () => {
    for (const [i, status] of MILESTONE_STATUSES.entries()) {
      const data = await encodeMilestone(milestone({ status }));
      expect(data[OFFSETS.milestoneStatus]).toBe(i);
    }
  });

  it("round-trips a vault and puts reputation_synced at the filter offset", async () => {
    for (const synced of [false, true]) {
      const v = vault({ milestoneCount: 5, activeMilestone: 2, cancelledMilestones: 1, refundedMilestones: 1, reputationSynced: synced });
      const data = await encodeVault(v);
      expect(data.subarray(0, 8)).toEqual(DISCRIMINATORS.EscrowVault);
      expect(decodeVault(v.address, data)).toEqual(v);
      expect(data[OFFSETS.vaultReputationSynced]).toBe(synced ? 1 : 0);
    }
  });

  it("decodes gig freelancer and status, and the config treasury", async () => {
    const f = key();
    const g = decodeGig("g", await encodeGig(f, "Completed"));
    expect(g).toEqual({ address: "g", freelancer: f.toBase58(), status: "Completed" });
    const t = key();
    expect(decodeConfig(await encodeConfig(t))).toEqual({ treasury: t.toBase58() });
  });

  it("reads unix_timestamp from the Clock sysvar", () => {
    expect(decodeClockUnixTimestamp(clockData(1_731_000_000n))).toBe(1_731_000_000n);
    expect(() => decodeClockUnixTimestamp(Buffer.alloc(8))).toThrow();
  });
});

describe("PDAs", () => {
  it("derives the vault token account and profile PDAs", () => {
    const gig = key();
    expect(vaultTokenPda(gig).equals(vaultTokenPda(gig))).toBe(true);
    const owner = key();
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from("profile"), owner.toBuffer()], REPUTATION_PROGRAM_ID);
    expect(profilePda(owner).equals(expected)).toBe(true);
  });

  it("derives a known associated token address", () => {
    // Known pair from the SPL docs / spl-token test vectors.
    const owner = new PublicKey("B8UwBUUnKwCyKuGMbFKWaG7exYdDk2ozZrPg72NyVbfj");
    const mint = new PublicKey("7o36UsWR1JQLpZ9PE2gn9L4SQ69CNNiWAXd4Jt7rqz9Z");
    expect(associatedTokenAddress(owner, mint).toBase58()).toBe("DShWnroshVbeUp28oopA3Pu7oFPDBtC1DBmPECXXAQ9n");
  });
});
