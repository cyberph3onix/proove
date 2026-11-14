import { profilePda } from "../src/handlers/util";
import type { TxRecord } from "../src/rpc/source";
import { PublicKey, bn, eventLine, invocation, pk, programIds, tx } from "./helpers";

/** 32-byte commitment filled with `byte`, and its hex form. */
export const hashOf = (byte: number) => ({ bytes: Array.from({ length: 32 }, () => byte), hex: byte.toString(16).padStart(2, "0").repeat(32) });

/** Protocol terms set at slot 9 (the milestone funded at slot 14 snapshots them). */
export const TERMS = { partial_timeout: 259_200, full_timeout: 604_800, partial_bps: 2_500, fee_bps: 100, min_milestone: 1_000_000, no_delivery_grace: 86_400 };

/**
 * A small but complete history: protocol config, three gigs, one milestone
 * with committed terms settled (partial then approval, with fees), one
 * cancelled, one rating.
 */
export function buildScenario() {
  const client = pk();
  const freelancer = pk();
  const gig = pk();
  const gig2 = pk();
  const gig3 = pk();
  const m0 = pk();
  const m1 = pk();
  const rating = pk();
  const profile = new PublicKey(profilePda(freelancer.toBase58(), programIds.reputation));
  const admin = pk();
  const treasury = pk();
  const spec = hashOf(0xa1);
  const delivery = hashOf(0xd2);
  const report = hashOf(0x7e);

  const created = (g: PublicKey, id: number) => eventLine("gig", "GigCreated", { gig: g, id: bn(id), client, freelancer: PublicKey.default, created_at: bn(1_000 + id) });
  const updated = (g: PublicKey, id: number, title: string, description: string, skills: string, category: string, budget: number) =>
    eventLine("gig", "GigUpdated", { gig: g, id: bn(id), title, description, skills, category, budget: bn(budget), deadline: bn(9_999) });

  const txs: TxRecord[] = [
    tx(
      9,
      invocation("escrow", [
        eventLine("escrow", "ProtocolConfigUpdated", {
          admin,
          treasury,
          partial_timeout: bn(TERMS.partial_timeout),
          full_timeout: bn(TERMS.full_timeout),
          partial_bps: TERMS.partial_bps,
          fee_bps: TERMS.fee_bps,
          min_milestone: bn(TERMS.min_milestone),
          no_delivery_grace: bn(TERMS.no_delivery_grace),
        }),
      ]),
    ),
    tx(10, invocation("gig", [created(gig, 1), updated(gig, 1, "Solana escrow dashboard", "Build a dashboard for milestone escrow vaults.", "rust, react", "Development", 900_000_000)])),
    tx(11, invocation("gig", [eventLine("gig", "GigPublished", { gig, id: bn(1) })])),
    tx(12, invocation("gig", [eventLine("gig", "FreelancerAssigned", { gig, id: bn(1), freelancer })])),
    tx(
      13,
      invocation("escrow", [
        eventLine("escrow", "MilestoneCreated", { gig, milestone: m0, index: 0, amount: bn(400), spec_hash: spec.bytes }),
        eventLine("escrow", "MilestoneCreated", { gig, milestone: m1, index: 1, amount: bn(500), spec_hash: Array(32).fill(0) }),
        eventLine("escrow", "TermsAccepted", { gig, milestone: m0, freelancer, spec_hash: spec.bytes }),
      ]),
    ),
    tx(
      14,
      invocation("escrow", [
        ...invocation("gig", [eventLine("gig", "GigInProgress", { gig, id: bn(1) })], 2),
        eventLine("escrow", "MilestoneFunded", { gig, milestone: m0, amount: bn(400) }),
      ]),
    ),
    tx(
      15,
      invocation("escrow", [
        eventLine("escrow", "DeliverySubmitted", {
          gig,
          milestone: m0,
          submitted_at: bn(2_000),
          submitted_slot: bn(15),
          delivery_hash: delivery.bytes,
          report_hash: report.bytes,
        }),
      ]),
    ),
    // 25% of 400 gross = 100: 99 net + 1 fee (1%). Then the remaining 300: 297 net + 3 fee.
    tx(
      16,
      invocation("escrow", [
        eventLine("escrow", "ProtocolFeeCollected", { gig, milestone: m0, amount: bn(1) }),
        eventLine("escrow", "PartialReleaseExecuted", { gig, milestone: m0, amount_released: bn(99) }),
      ]),
    ),
    tx(
      17,
      invocation("escrow", [
        eventLine("escrow", "ProtocolFeeCollected", { gig, milestone: m0, amount: bn(3) }),
        eventLine("escrow", "MilestoneApproved", { gig, milestone: m0, amount_released: bn(297), approved_at: bn(2_100) }),
      ]),
    ),
    tx(18, invocation("reputation", [eventLine("reputation", "ProfileCreated", { profile, authority: freelancer, created_at: bn(1_500) })])),
    tx(
      19,
      invocation("escrow", [
        ...invocation(
          "reputation",
          [eventLine("reputation", "RatingSubmitted", { rating, job_id: bn(1), client, freelancer, score: 5, new_average_rating: 500 })],
          2,
        ),
      ]),
    ),
    tx(20, invocation("escrow", [eventLine("escrow", "MilestoneCancelledBeforeFunding", { gig, milestone: m1, index: 1 })])),
    tx(21, invocation("gig", [created(gig2, 2), updated(gig2, 2, "Brand identity for a coffee shop", "Logo, palette and menu illustration.", "branding, illustration", "Design", 150_000_000)])),
    tx(22, invocation("gig", [eventLine("gig", "GigPublished", { gig: gig2, id: bn(2) })])),
    tx(23, invocation("gig", [created(gig3, 3), updated(gig3, 3, "Anchor program audit", "Review a small Anchor program.", "Rust, security", "Development", 50_000_000)])),
    // A failed transaction: its events must be ignored.
    tx(24, invocation("gig", [eventLine("gig", "GigCancelled", { gig, id: bn(1) })]), { failed: true }),
  ];

  return { client, freelancer, admin, treasury, gig, gig2, gig3, m0, m1, rating, profile, spec, delivery, report, txs };
}
