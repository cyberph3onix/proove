"use client";

import { useMemo } from "react";
import type { Address } from "@proove/types/types";
import { ZERO_HASH } from "@proove/types/types";
import { useChain } from "@/lib/mock/store";
import { formatUsdc } from "@proove/types/format";

export interface ActionItem {
  id: string;
  kind: "approve" | "fund" | "assign" | "accept" | "deliver" | "evidence" | "appeal" | "verdict" | "tieBreak" | "rate" | "refund" | "claimBadge" | "receivable";
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
  due?: number;
}

/** Everything waiting on this wallet, derived from chain state. */
export function useActionItems(address: Address | null, now: number): ActionItem[] {
  const gigs = useChain((s) => s.gigs);
  const milestones = useChain((s) => s.milestones);
  const cases = useChain((s) => s.cases);
  const ratings = useChain((s) => s.ratings);
  const badges = useChain((s) => s.badges);
  const evidence = useChain((s) => s.evidence);
  const grace = useChain((s) => s.protocol.noDeliveryGrace);

  return useMemo(() => {
    if (!address) return [];
    const items: ActionItem[] = [];
    for (const m of Object.values(milestones)) {
      const g = gigs[m.gig];
      if (!g) continue;
      const href = `/gigs/${g.address}`;
      if (g.client === address) {
        if (m.status === "submitted" || m.status === "partialReleased")
          items.push({ id: `approve:${m.address}`, kind: "approve", title: `Review delivery: ${m.title}`, detail: `${g.title} · ${formatUsdc(m.amount)} · approve, wait, or dispute`, href, due: (m.submittedAt ?? 0) + (m.terms?.fullTimeout ?? 0) });
        if (m.status === "pendingFunding" && (m.termsAccepted || m.specHash === ZERO_HASH) && g.freelancer)
          items.push({ id: `fund:${m.address}`, kind: "fund", title: `Fund ${m.title}`, detail: `${g.title} · terms accepted · ${formatUsdc(m.amount)}`, href: `${href}/hire` });
        if (m.status === "funded" && now > g.deadline + grace)
          items.push({ id: `refund:${m.address}`, kind: "refund", title: `Refund available: ${m.title}`, detail: `Nothing delivered by the deadline + grace period`, href, urgent: true });
      }
      if (g.freelancer === address) {
        if (m.status === "pendingFunding" && m.specHash !== ZERO_HASH && !m.termsAccepted)
          items.push({ id: `accept:${m.address}`, kind: "accept", title: `Accept terms: ${m.title}`, detail: `${g.title} · ${formatUsdc(m.amount)} · read the criteria first`, href });
        if (m.status === "funded")
          items.push({ id: `deliver:${m.address}`, kind: "deliver", title: `Deliver ${m.title}`, detail: `${g.title} · ${formatUsdc(m.amount)} locked for you`, href, due: g.deadline });
        if (m.status === "submitted" && !m.receivable && m.termsAccepted)
          items.push({ id: `rcv:${m.address}`, kind: "receivable", title: `Get paid early on ${m.title}`, detail: `Mint the pending payout as a receivable and sell it`, href: "/receivables" });
      }
    }
    for (const g of Object.values(gigs)) {
      if (g.client === address && g.status === "published" && g.applicants.length)
        items.push({ id: `assign:${g.address}`, kind: "assign", title: `${g.applicants.length} applicant${g.applicants.length === 1 ? "" : "s"} for ${g.title}`, detail: "Pick a freelancer to assign", href: `/gigs/${g.address}` });
      if (g.client === address && g.status === "completed" && g.freelancer && !ratings.some((r) => r.gig === g.address))
        items.push({ id: `rate:${g.address}`, kind: "rate", title: `Rate ${g.title}`, detail: "Your rating updates the freelancer's on-chain reputation", href: `/gigs/${g.address}` });
    }
    for (const c of Object.values(cases)) {
      const href = `/disputes/${c.address}`;
      const party = c.client === address || c.freelancer === address;
      if (party && c.status === "evidence") {
        const mine = evidence.filter((e) => e.case === c.address && e.party === address).length;
        items.push({ id: `ev:${c.address}`, kind: "evidence", title: `Dispute: submit evidence`, detail: `${mine}/10 items submitted`, href, urgent: mine === 0, due: c.deadlines.evidence });
      }
      if (party && c.status === "appealWindow" && !c.waivedBy.includes(address))
        items.push({ id: `appeal:${c.address}`, kind: "appeal", title: `Verdict reached: appeal or waive`, detail: `Appeal window closes soon`, href, due: c.deadlines.appeal });
      if (c.status === "arbitration" && c.arbitrators.includes(address) && !c.verdicts.some((v) => v.arbitrator === address))
        items.push({ id: `verdict:${c.address}`, kind: "verdict", title: `Sign a verdict`, detail: `Case ${c.address.slice(0, 4)}… · round ${c.round}`, href, urgent: true, due: c.deadlines.arbitration });
      if (c.status === "tieBreak" && c.fallback === address)
        items.push({ id: `tie:${c.address}`, kind: "tieBreak", title: `Break a tie`, detail: `Pick one of two signed rulings`, href, urgent: true, due: c.deadlines.tieBreak });
    }
    for (const b of badges) {
      if (b.profile === address && !b.minted && b.version === "v2")
        items.push({ id: `badge:${b.type}`, kind: "claimBadge", title: `Claim your ${b.type} badge`, detail: "Mint it as a non-transferable NFT", href: `/reputation/${address}` });
    }
    return items.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || (a.due ?? Infinity) - (b.due ?? Infinity));
  }, [address, gigs, milestones, cases, ratings, badges, evidence, grace, now]);
}
