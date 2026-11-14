/**
 * Milestone specs committed before a freelancer is assigned.
 *
 * `create_milestone` requires the gig to be Assigned/InProgress, but the UI
 * commits specs right after publishing. Keep them locally, show them as
 * pending, and create them on-chain inside `assignFreelancer`.
 */
export interface PendingMilestone {
  amount: string;
  specHash: string;
  index: number;
  title: string;
}

const KEY = "proove:pending-milestones";

export function readPending(): Record<string, PendingMilestone[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, PendingMilestone[]>;
  } catch {
    return {};
  }
}

export function writePending(all: Record<string, PendingMilestone[]>) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function queueMilestone(gig: string, item: PendingMilestone) {
  const all = readPending();
  all[gig] = [...(all[gig] ?? []), item];
  writePending(all);
}

export function takePending(gig: string): PendingMilestone[] {
  const all = readPending();
  const items = all[gig] ?? [];
  delete all[gig];
  writePending(all);
  return items;
}
