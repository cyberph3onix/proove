"use client";

import Link from "next/link";
import { Award } from "lucide-react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Stars } from "@/components/ui/pill";
import { ProgressBar } from "@/components/ui/progress";
import { DataGate } from "@/components/app/data-gate";
import { ActionList } from "@/components/proove/action-list";
import { GigRow } from "@/components/proove/gig-row";
import { Empty, PageHeader, PersonName, Stat } from "@/components/proove/primitives";
import { MiniVaults, Scene3D, VaultPoster } from "@/components/three";
import { useMyGigs, useNow, useProfile, useSession } from "@/hooks/use-chain";
import { useActionItems } from "@/hooks/use-action-items";
import { formatStars, formatUsdc } from "@/lib/domain/format";
import { MAX_REPUTATION_SCORE } from "@/lib/domain/reputation";

function FreelancerDashboard() {
  const { address, persona } = useSession();
  const now = useNow();
  const gigs = useMyGigs(address, "freelancer");
  const { profile, badges, ratings } = useProfile(address);
  const actions = useActionItems(address, now);

  const mine = gigs.filter((g) => g.freelancer === address);
  const ongoing = mine.filter((g) => ["assigned", "inProgress", "disputed"].includes(g.status));
  const completed = mine.filter((g) => g.status === "completed");
  const applied = gigs.filter((g) => g.freelancer !== address && g.status === "published");
  const pending = mine.reduce((s, g) => s + g.locked, 0);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader
        eyebrow="Working"
        title={`Welcome back, ${persona?.name.split(" ")[0] ?? ""}`}
        description="Terms to accept, work to deliver, and money already locked for you."
        actions={
          <Link href="/gigs" className="text-sm font-semibold text-[#FF6FAF]">
            Browse jobs →
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
            <Eyebrow>Locked for you</Eyebrow>
            <div className="text-2xl font-bold text-white tabular-nums">{formatUsdc(pending)}</div>
            <div className="text-xs text-[#A1A1AA]">funded by clients, waiting on delivery, approval or the clock</div>
          </div>
          <Scene3D className="h-[220px]" label={`${ongoing.length} vaults showing the money locked for each ongoing gig`} poster={<VaultPoster />}>
            {(on) => <MiniVaults active={on} fills={ongoing.map((g) => (g.budget ? Math.min(1, g.locked / g.budget) : 0))} />}
          </Scene3D>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <GlassCard>
          <Eyebrow>Ongoing ({ongoing.length})</Eyebrow>
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {ongoing.map((g) => (
              <GigRow key={g.address} g={g} counterpart="client" />
            ))}
            {ongoing.length === 0 && <Empty title="No ongoing gigs" />}
          </div>
        </GlassCard>
        <GlassCard>
          <Eyebrow>Applications ({applied.length})</Eyebrow>
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {applied.map((g) => (
              <Link key={g.address} href={`/gigs/${g.address}`} className="py-3 first:pt-0 last:pb-0 flex justify-between gap-3">
                <span className="text-sm text-white truncate">{g.title}</span>
                <span className="text-xs text-[#A1A1AA] whitespace-nowrap">Waiting on <PersonName address={g.client} link={false} /></span>
              </Link>
            ))}
            {applied.length === 0 && <Empty title="No pending applications" />}
          </div>
          <Eyebrow className="mt-6">Completed ({completed.length})</Eyebrow>
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {completed.slice(0, 4).map((g) => (
              <Link key={g.address} href={`/gigs/${g.address}`} className="py-2.5 first:pt-0 flex justify-between gap-3">
                <span className="text-sm text-white truncate">{g.title}</span>
                <span className="text-xs text-[#A1A1AA] tabular-nums">{formatUsdc(g.milestones.reduce((s, m) => s + m.released, 0))}</span>
              </Link>
            ))}
          </div>
        </GlassCard>
      </div>

      {profile && (
        <GlassCard className="mb-6" tone="accent">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full border-2 border-[#FF6FAF] flex items-center justify-center text-[#FF6FAF]">
                <Award size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {profile.reputationScore} / {MAX_REPUTATION_SCORE} reputation · {badges.length} badge{badges.length === 1 ? "" : "s"}
                </div>
                <div className="text-xs text-[#A1A1AA]">
                  {profile.completedJobs} jobs · {formatStars(profile.averageRating)}★ · {Math.round((profile.onTimeJobs / Math.max(1, profile.completedJobs)) * 100)}% on time · {profile.disputesLost} disputes lost
                </div>
              </div>
            </div>
            <Link href={`/reputation/${address}`} className="text-xs font-semibold text-[#FF6FAF]">
              View public profile →
            </Link>
          </div>
          <div className="mt-4">
            <ProgressBar value={profile.reputationScore} max={MAX_REPUTATION_SCORE} />
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
        <div className="grid grid-cols-2 gap-3 content-start">
          <Stat label="Lifetime earnings" value={formatUsdc(profile?.totalEarnings ?? 0, { compact: true })} />
          <Stat label="On-time deliveries" value={profile ? `${profile.onTimeJobs}/${profile.completedJobs}` : "—"} />
          <Stat label="Disputes won" value={profile?.disputesWon ?? 0} />
          <Stat label="Disputes lost" value={profile?.disputesLost ?? 0} />
        </div>
        <GlassCard>
          <Eyebrow>Feedback</Eyebrow>
          <div className="flex flex-col gap-4">
            {ratings.length === 0 ? (
              <p className="text-sm text-[#A1A1AA]">No v2 ratings yet. Ratings from v1 are counted in your score.</p>
            ) : (
              ratings.slice(0, 4).map((r) => (
                <div key={r.address}>
                  <Stars filled={r.score} />
                  <p className="text-sm text-[#D4D4D8] mt-1">“{r.review}”</p>
                  <p className="text-[11px] text-[#71717A] mt-0.5">
                    <PersonName address={r.client} /> · review hash {r.reviewHash.slice(0, 8)}… on-chain
                  </p>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export default function FreelancerDashboardPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav role="freelancer" />
      <DataGate requireWallet>
        <FreelancerDashboard />
      </DataGate>
    </section>
  );
}
