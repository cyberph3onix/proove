import { describe, expect, it } from "vitest";
import {
  accountedMilestones,
  dueActions,
  isFullDue,
  isPartialDue,
  isSettleDue,
  locked,
  saturatingAddI64,
} from "../src/due";
import { DAY, HOUR, milestone, vault } from "./fixtures";

const T0 = 1_000_000n;
const PARTIAL_AT = T0 + 72n * HOUR;
const FULL_AT = T0 + 7n * DAY;

describe("partial timeout", () => {
  const m = milestone({ submittedAt: T0 });
  it("is due exactly at submitted_at + partial_timeout", () => {
    expect(isPartialDue(m, PARTIAL_AT)).toBe(true);
  });
  it("is not due one second before", () => {
    expect(isPartialDue(m, PARTIAL_AT - 1n)).toBe(false);
  });
  it("is not due once the partial was released", () => {
    expect(isPartialDue({ ...m, status: "PartialReleased", released: 20_000_000n }, PARTIAL_AT + HOUR)).toBe(false);
  });
  it.each(["PendingFunding", "Funded", "Completed", "Refunded", "Disputed", "Resolved"] as const)("is not due when %s", (status) => {
    expect(isPartialDue({ ...m, status }, FULL_AT + DAY)).toBe(false);
  });
  it("uses the snapshotted timeout, not the default", () => {
    const short = { ...m, partialTimeout: DAY };
    expect(isPartialDue(short, T0 + DAY)).toBe(true);
    expect(isPartialDue(short, T0 + DAY - 1n)).toBe(false);
  });
  it("is not due when the partial share rounds to zero", () => {
    expect(isPartialDue({ ...m, amount: 4n, partialBps: 2000 }, PARTIAL_AT)).toBe(false);
    expect(isPartialDue({ ...m, partialBps: 0 }, PARTIAL_AT)).toBe(false);
    expect(isPartialDue({ ...m, amount: 5n, partialBps: 2000 }, PARTIAL_AT)).toBe(true);
  });
});

describe("full timeout", () => {
  const m = milestone({ submittedAt: T0 });
  it("is due exactly at submitted_at + full_timeout", () => {
    expect(isFullDue(m, FULL_AT)).toBe(true);
  });
  it("is not due one second before", () => {
    expect(isFullDue(m, FULL_AT - 1n)).toBe(false);
  });
  it("is due from PartialReleased", () => {
    expect(isFullDue({ ...m, status: "PartialReleased", released: 19_800_000n, feesPaid: 200_000n }, FULL_AT)).toBe(true);
  });
  it.each(["Funded", "Completed", "Refunded", "Disputed", "Resolved"] as const)("is not due when %s", (status) => {
    expect(isFullDue({ ...m, status }, FULL_AT + DAY)).toBe(false);
  });
  it("is not due when nothing is locked", () => {
    expect(isFullDue({ ...m, status: "PartialReleased", released: 99_000_000n, feesPaid: 1_000_000n }, FULL_AT)).toBe(false);
  });
  it("is not due when accounting underflows", () => {
    expect(locked({ ...m, released: m.amount + 1n })).toBeNull();
    expect(isFullDue({ ...m, released: m.amount + 1n }, FULL_AT)).toBe(false);
  });
  it("saturates like i64::saturating_add", () => {
    const max = (1n << 63n) - 1n;
    expect(saturatingAddI64(max - 1n, 10n)).toBe(max);
    expect(isFullDue({ ...m, submittedAt: max - 10n, fullTimeout: 7n * DAY }, max - 1n)).toBe(false);
  });
});

describe("settle_reputation", () => {
  it("is due when every milestone is released and not yet synced", () => {
    expect(isSettleDue(vault({ milestoneCount: 3, activeMilestone: 3 }))).toBe(true);
  });
  it("is not due when already settled", () => {
    expect(isSettleDue(vault({ milestoneCount: 3, activeMilestone: 3, reputationSynced: true }))).toBe(false);
  });
  it("is not due with zero milestones", () => {
    expect(isSettleDue(vault({ milestoneCount: 0, activeMilestone: 0 }))).toBe(false);
  });
  it("is not due while a milestone is outstanding", () => {
    expect(isSettleDue(vault({ milestoneCount: 3, activeMilestone: 2 }))).toBe(false);
  });
  it("counts cancelled and refunded milestones", () => {
    const v = vault({ milestoneCount: 4, activeMilestone: 1, cancelledMilestones: 2, refundedMilestones: 1 });
    expect(accountedMilestones(v)).toBe(4);
    expect(isSettleDue(v)).toBe(true);
    expect(isSettleDue({ ...v, refundedMilestones: 0 })).toBe(false);
    expect(isSettleDue(vault({ milestoneCount: 2, activeMilestone: 0, cancelledMilestones: 2 }))).toBe(true);
    expect(isSettleDue(vault({ milestoneCount: 1, activeMilestone: 0, refundedMilestones: 1 }))).toBe(true);
  });
});

describe("dueActions", () => {
  it("returns nothing when nothing is due", () => {
    expect(dueActions([milestone({ submittedAt: T0 })], [vault({ activeMilestone: 0 })], PARTIAL_AT - 1n)).toEqual([]);
    expect(dueActions([], [], FULL_AT)).toEqual([]);
  });

  it("sends only the full release when both are due", () => {
    const m = milestone({ submittedAt: T0 });
    const actions = dueActions([m], [], FULL_AT);
    expect(actions).toEqual([{ kind: "full_timeout_release", gig: m.gig, milestone: m.address, dueAt: FULL_AT }]);
  });

  it("sends the partial between the two timeouts", () => {
    const m = milestone({ submittedAt: T0 });
    expect(dueActions([m], [], PARTIAL_AT)).toEqual([{ kind: "partial_timeout_release", gig: m.gig, milestone: m.address, dueAt: PARTIAL_AT }]);
  });

  it("de-duplicates a milestone listed twice", () => {
    const m = milestone({ submittedAt: T0 });
    expect(dueActions([m, { ...m }], [], PARTIAL_AT)).toHaveLength(1);
  });

  it("mixes releases and settlements, one action per account", () => {
    const a = milestone({ submittedAt: T0 });
    const b = milestone({ submittedAt: T0, status: "PartialReleased", released: 20_000_000n });
    const done = vault({ milestoneCount: 2, activeMilestone: 2 });
    const synced = vault({ milestoneCount: 2, activeMilestone: 2, reputationSynced: true });
    const actions = dueActions([a, b], [done, synced, done], FULL_AT);
    expect(actions.map((x) => x.kind).sort()).toEqual(["full_timeout_release", "full_timeout_release", "settle_reputation"]);
  });
});
