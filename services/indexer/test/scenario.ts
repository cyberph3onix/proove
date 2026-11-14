import { profilePda } from "../src/handlers/util";
import type { TxRecord } from "../src/rpc/source";
import { PublicKey, bn, eventLine, invocation, pk, programIds, tx } from "./helpers";

/** A small but complete v1 history: three gigs, one milestone settled, one cancelled, one rating. */
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

  const created = (g: PublicKey, id: number) => eventLine("gig", "GigCreated", { gig: g, id: bn(id), client, freelancer: PublicKey.default, created_at: bn(1_000 + id) });
  const updated = (g: PublicKey, id: number, title: string, description: string, skills: string, category: string, budget: number) =>
    eventLine("gig", "GigUpdated", { gig: g, id: bn(id), title, description, skills, category, budget: bn(budget), deadline: bn(9_999) });

  const txs: TxRecord[] = [
    tx(10, invocation("gig", [created(gig, 1), updated(gig, 1, "Solana escrow dashboard", "Build a dashboard for milestone escrow vaults.", "rust, react", "Development", 900_000_000)])),
    tx(11, invocation("gig", [eventLine("gig", "GigPublished", { gig, id: bn(1) })])),
    tx(12, invocation("gig", [eventLine("gig", "FreelancerAssigned", { gig, id: bn(1), freelancer })])),
    tx(
      13,
      invocation("escrow", [
        eventLine("escrow", "MilestoneCreated", { gig, milestone: m0, index: 0, amount: bn(400) }),
        eventLine("escrow", "MilestoneCreated", { gig, milestone: m1, index: 1, amount: bn(500) }),
      ]),
    ),
    tx(
      14,
      invocation("escrow", [
        ...invocation("gig", [eventLine("gig", "GigInProgress", { gig, id: bn(1) })], 2),
        eventLine("escrow", "MilestoneFunded", { gig, milestone: m0, amount: bn(400) }),
      ]),
    ),
    tx(15, invocation("escrow", [eventLine("escrow", "DeliverySubmitted", { gig, milestone: m0, submitted_at: bn(2_000) })])),
    tx(16, invocation("escrow", [eventLine("escrow", "PartialReleaseExecuted", { gig, milestone: m0, amount_released: bn(100) })])),
    tx(17, invocation("escrow", [eventLine("escrow", "MilestoneApproved", { gig, milestone: m0, amount_released: bn(300), approved_at: bn(2_100) })])),
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

  return { client, freelancer, gig, gig2, gig3, m0, m1, rating, profile, txs };
}
