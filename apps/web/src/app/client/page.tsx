"use client";

import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { DataGate } from "@/components/app/data-gate";
import { ActionList } from "@/components/proove/action-list";
import { GigRow } from "@/components/proove/gig-row";
import { Empty, PageHeader, Stat } from "@/components/proove/primitives";
import { MiniVaults, Scene3D, VaultPoster } from "@/components/three";
import { useMyGigs, useNow, useSession } from "@/hooks/use-chain";
import { useActionItems } from "@/hooks/use-action-items";
import { useChain } from "@/lib/mock/store";
import { formatUsdc } from "@/lib/domain/format";

function ClientDashboard() {
  const { address, persona } = useSession();
  const now = useNow();
  const gigs = useMyGigs(address, "client");
  const ratings = useChain((s) => s.ratings);
  const actions = useActionItems(address, now);

  const active = gigs.filter((g) => ["assigned", "inProgress", "disputed"].includes(g.status));
  const open = gigs.filter((g) => g.status === "published");
  const completed = gigs.filter((g) => g.status === "completed");
  const locked = gigs.reduce((s, g) => s + g.locked, 0);
  const spent = gigs.reduce((s, g) => s + g.milestones.reduce((a, m) => a + m.released + m.feesPaid, 0), 0);
  const talentHired = new Set(gigs.filter((g) => g.freelancer).map((g) => g.freelancer)).size;
  const given = ratings.filter((r) => r.client === address);
  const avgGiven = given.length ? given.reduce((s, r) => s + r.score, 0) / given.length : null;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader
        eyebrow="Hiring"
        title={`Welcome back, ${persona?.name.split(" ")[0] ?? ""}`}
        description="Everything you've locked in escrow, what's waiting on you, and what's settled."
        actions={
          <Link href="/gigs/new">
            <Button>Post a gig</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-5 mb-6">
        <GlassCard tone={actions.length ? "accent" : "default"}>
          <Eyebrow>Action needed ({actions.length})</Eyebrow>
          <ActionList items={actions} now={now} />
        </GlassCard>
        <GlassCard className="p-0 overflow-hidden">
          <div className="p-5 pb-0">
            <Eyebrow>Locked in escrow</Eyebrow>
            <div className="text-2xl font-bold text-white tabular-nums">{formatUsdc(locked)}</div>
            <div className="text-xs text-[#A1A1AA]">across {active.length} active gig{active.length === 1 ? "" : "s"}</div>
          </div>
          <Scene3D className="h-[220px]" label={`${active.length} vaults, each filled to the share of its gig budget still locked`} poster={<VaultPoster />}>
            {(on) => <MiniVaults active={on} fills={active.map((g) => (g.budget ? Math.min(1, g.locked / g.budget) : 0))} />}
          </Scene3D>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <GlassCard>
          <Eyebrow>Active ({active.length})</Eyebrow>
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {active.map((g) => (
              <GigRow key={g.address} g={g} counterpart="freelancer" />
            ))}
            {active.length === 0 && <Empty title="No active gigs" />}
          </div>
        </GlassCard>
        <GlassCard>
          <Eyebrow>Open for applications ({open.length})</Eyebrow>
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {open.map((g) => (
              <Link key={g.address} href={`/gigs/${g.address}`} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate group-hover:text-[#FF6FAF]">{g.title}</div>
                  <div className="text-xs text-[#A1A1AA]">{formatUsdc(g.budget)} budget</div>
                </div>
                <span className="text-xs text-[#FF6FAF] whitespace-nowrap">
                  {g.applicants.length} applicant{g.applicants.length === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
            {open.length === 0 && (
              <Empty title="No open gigs" action={<Link href="/gigs/new" className="text-xs font-semibold text-[#FF6FAF]">Post one →</Link>} />
            )}
          </div>
        </GlassCard>
      </div>

      <Eyebrow>Quick stats</Eyebrow>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Talent hired" value={talentHired} />
        <Stat label="Total paid out" value={formatUsdc(spent, { compact: true })} hint="incl. 0.5% protocol fee" />
        <Stat label="Completed gigs" value={completed.length} />
        <Stat label="Avg rating given" value={avgGiven === null ? "—" : `${avgGiven.toFixed(1)}★`} />
      </div>
    </div>
  );
}

export default function ClientDashboardPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav role="client" />
      <DataGate requireWallet>
        <ClientDashboard />
      </DataGate>
    </section>
  );
}
