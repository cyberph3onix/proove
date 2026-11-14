"use client";

import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/ui/pill";
import { Empty, GigStatusPill, PageHeader, PersonChip } from "@/components/proove/primitives";
import { useMyGigs, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { formatDate, formatUsdc } from "@proove/types/format";

function ServicesTaken() {
  const { address } = useSession();
  const gigs = useMyGigs(address, "client");
  const ratings = useChain((s) => s.ratings);
  const done = gigs.filter((g) => g.status === "completed" || g.milestones.some((m) => m.status === "resolved"));

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader eyebrow="History" title="Services taken" description="Completed work, what it cost, and how it ended." />
      <div className="flex flex-col gap-3">
        {done.map((g) => {
          const paid = g.milestones.reduce((s, m) => s + m.released + m.feesPaid, 0);
          const refunded = g.milestones.reduce((s, m) => s + m.refunded, 0);
          const rating = ratings.find((r) => r.gig === g.address);
          const disputed = g.milestones.some((m) => m.status === "resolved");
          return (
            <GlassCard key={g.address} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="text-sm font-semibold text-white">{g.title}</div>
                  <GigStatusPill status={g.status} />
                  {disputed && <span className="text-[11px] text-amber-300">settled by ruling</span>}
                </div>
                <PersonChip address={g.freelancer} sub={`Paid ${formatUsdc(paid)}${refunded ? ` · refunded ${formatUsdc(refunded)}` : ""} · ${formatDate(g.updatedAt)}`} />
              </div>
              <div className="flex items-center gap-3">
                {rating ? <Stars filled={rating.score} /> : g.status === "completed" && <span className="text-xs text-[#FF6FAF]">Not rated yet</span>}
                <Link href={`/gigs/${g.address}`}>
                  <Button size="sm" variant="ghost" className="border border-white/10">
                    View details
                  </Button>
                </Link>
              </div>
            </GlassCard>
          );
        })}
        {done.length === 0 && <Empty title="No completed gigs yet" />}
      </div>
    </div>
  );
}

export default function ServicesTakenPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav role="client" />
      <DataGate requireWallet>
        <ServicesTaken />
      </DataGate>
    </section>
  );
}
