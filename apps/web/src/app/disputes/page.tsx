"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { CaseStatusPill, Countdown, Empty, PageHeader, PersonName, Tabs } from "@/components/proove/primitives";
import { Pill } from "@/components/ui/pill";
import { useCases, useNow, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { formatRuling, formatUsdc, shortAddress } from "@proove/types/format";
import type { DisputeCase } from "@proove/types/types";

type View = "party" | "arbitrating" | "all";

function nextDeadline(c: DisputeCase): number | null {
  switch (c.status) {
    case "evidence":
      return c.deadlines.evidence;
    case "aiEvaluation":
      return c.deadlines.ai;
    case "arbitration":
      return c.deadlines.arbitration;
    case "tieBreak":
      return c.deadlines.tieBreak ?? null;
    case "appealWindow":
      return c.deadlines.appeal;
    default:
      return null;
  }
}

function Disputes() {
  const { address, isArbitrator } = useSession();
  const now = useNow();
  const cases = useCases();
  const milestones = useChain((s) => s.milestones);
  const [view, setView] = useState<View>(isArbitrator ? "arbitrating" : "party");
  const list = cases.filter((c) =>
    view === "party" ? c.client === address || c.freelancer === address || c.holder === address : view === "arbitrating" ? c.arbitrators.includes(address ?? "") || c.fallback === address : true,
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader
        eyebrow="Disputes"
        title="Cases"
        description="Three AI jurors propose, one or two human arbitrators sign, the dispute program records it, and escrow pays. Every case ends by its 21-day hard deadline."
      />
      <div className="mb-5">
        <Tabs<View>
          value={view}
          onChange={setView}
          options={[
            { value: "party", label: "I'm a party" },
            ...(isArbitrator ? [{ value: "arbitrating" as View, label: "I'm arbitrating" }] : []),
            { value: "all", label: "All public cases" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-3">
        {list.map((c) => {
          const m = milestones[c.milestone];
          const due = nextDeadline(c);
          return (
            <Link key={c.address} href={`/disputes/${c.address}`} className="group rounded-2xl border border-white/10 bg-white/[0.02] hover:border-[#FF6FAF]/40 transition-colors p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <CaseStatusPill status={c.status} />
                  <Pill>Round {c.round}</Pill>
                  {c.mode === "humanOnly" && <Pill tone="warn">human-only</Pill>}
                  <span className="text-[11px] font-mono text-[#71717A]">{shortAddress(c.address)}</span>
                </div>
                <div className="text-sm font-semibold text-white group-hover:text-[#FF6FAF] transition-colors">{m?.title ?? "Milestone"}</div>
                <div className="text-xs text-[#A1A1AA] mt-0.5">
                  <PersonName address={c.client} link={false} /> vs <PersonName address={c.freelancer} link={false} /> · {formatUsdc(c.frozenAmount)} frozen
                </div>
              </div>
              <div className="text-right text-sm shrink-0">
                {c.finalRuling !== null ? (
                  <div className="text-white font-medium">{formatRuling(c.finalRuling)}</div>
                ) : due ? (
                  <div className="text-[#A1A1AA] text-xs">
                    next deadline <Countdown to={due} now={now} />
                  </div>
                ) : null}
                <div className="text-[11px] text-[#71717A]">
                  hard stop <Countdown to={c.deadlines.hard} now={now} doneLabel="reached" />
                </div>
              </div>
            </Link>
          );
        })}
        {list.length === 0 && <Empty title="No cases here">Disputes you raise, respond to or arbitrate will show up here.</Empty>}
      </div>
    </div>
  );
}

export default function DisputesPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav />
      <DataGate requireWallet>
        <Disputes />
      </DataGate>
    </section>
  );
}
