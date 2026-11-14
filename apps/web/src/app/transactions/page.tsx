"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { Pill } from "@/components/ui/pill";
import { Empty, PageHeader, Relative, Tabs } from "@/components/proove/primitives";
import { useEvents, useNow, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { formatUsdc } from "@/lib/domain/format";
import type { ChainEvent, ProgramName } from "@/lib/domain/types";

type Filter = "all" | "money" | "disputes" | "governance";
const MONEY = new Set(["MilestoneFunded", "MilestoneApproved", "PartialReleaseExecuted", "FullReleaseExecuted", "RefundedAfterDeadline", "RulingExecuted", "ReceivableSold", "FeesClaimed", "DevnetAirdrop"]);
const TONE: Partial<Record<ProgramName, "accent" | "warn" | "good" | "default">> = { escrow: "accent", dispute: "warn", governance: "good", receivables: "accent" };

function Transactions() {
  const { address } = useSession();
  const now = useNow(30_000);
  const gigs = useChain((s) => s.gigs);
  const cases = useChain((s) => s.cases);
  const [filter, setFilter] = useState<Filter>("all");
  const mine = useMemo(() => {
    const myGigs = new Set(Object.values(gigs).filter((g) => g.client === address || g.freelancer === address).map((g) => g.address));
    const myCases = new Set(Object.values(cases).filter((c) => c.client === address || c.freelancer === address || c.arbitrators.includes(address ?? "")).map((c) => c.address));
    return (e: ChainEvent) => !!address && (e.actors.includes(address) || (e.gig !== undefined && myGigs.has(e.gig)) || (e.case !== undefined && myCases.has(e.case)));
  }, [gigs, cases, address]);
  const rows = useEvents(mine as (e: { actors: string[] }) => boolean).filter(
    (e) => filter === "all" || (filter === "money" && MONEY.has(e.name)) || (filter === "disputes" && e.program === "dispute") || (filter === "governance" && e.program === "governance"),
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader eyebrow="Orders" title="Transactions" description="Each row is a plain-language receipt over an on-chain event involving you. In production Gemini Flash-Lite writes the sentence from the decoded event; the data is from the chain." />
      <div className="mb-5">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "money", label: "Money movement" },
            { value: "disputes", label: "Disputes" },
            { value: "governance", label: "Governance" },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <Empty title="No transactions yet" />
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <ul className="divide-y divide-white/[0.06]">
            {rows.map((r) => (
              <li key={r.signature} className="px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors grid grid-cols-[1fr_auto] sm:grid-cols-[110px_1fr_auto] gap-x-4 gap-y-1">
                <div className="text-xs text-[#A1A1AA] order-3 sm:order-none col-span-2 sm:col-span-1">
                  <Relative at={r.blockTime} now={now} /> · slot {r.slot.toLocaleString()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{r.name.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
                    <Pill tone={TONE[r.program] ?? "default"} className="text-[10px] px-2 py-0">
                      {r.program}
                    </Pill>
                  </div>
                  <p className="text-sm text-[#D4D4D8] mt-0.5">{r.receipt}</p>
                  <div className="text-[10px] font-mono text-[#71717A] mt-1 truncate">
                    sig {r.signature.slice(0, 20)}…
                    {r.gig && (
                      <>
                        {" · "}
                        <Link href={`/gigs/${r.gig}`} className="hover:text-[#FF6FAF]">gig</Link>
                      </>
                    )}
                    {r.case && (
                      <>
                        {" · "}
                        <Link href={`/disputes/${r.case}`} className="hover:text-[#FF6FAF]">case</Link>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-sm text-white tabular-nums text-right">{r.amount ? formatUsdc(r.amount) : ""}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav />
      <DataGate requireWallet>
        <Transactions />
      </DataGate>
    </section>
  );
}
