"use client";

import Image from "next/image";
import Link from "next/link";
import { FileCheck2, Gavel, Landmark, BadgeCheck, Receipt, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useCases, useHydrated, useAllMilestones } from "@/hooks/use-chain";
import { lockedRemaining } from "@/lib/domain/dispute";
import { formatUsdc } from "@/lib/domain/format";
import { useChain } from "@/lib/mock/store";

const STEPS = [
  {
    eyebrow: "Fund",
    title: "Agree what “done” means. Then lock the money.",
    body: "Gemini turns a few sentences into milestones with testable criteria. The freelancer signs the exact spec on-chain before a single USDC moves.",
  },
  {
    eyebrow: "Lock",
    title: "Held by a vault nobody has the key to.",
    body: "Funds sit in a program-owned vault. No admin withdrawal exists. Anyone can check the money is there and earmarked.",
  },
  {
    eyebrow: "Deliver",
    title: "Every delivery comes with a criterion-by-criterion check.",
    body: "The freelancer commits the delivery and an AI verification report by hash. The report is advice; it never moves funds.",
  },
  {
    eyebrow: "Release",
    title: "Approve, or let the clock pay out. Disagree? Humans decide.",
    body: "20% releases after 72 h and the rest after 7 days unless someone disputes. Three AI jurors propose; staked human arbitrators sign the verdict.",
  },
];

const FEATURES = [
  { icon: FileCheck2, title: "Agreement layer", body: "Specs, deliveries and verification reports are hashed on-chain the moment they exist." },
  { icon: Gavel, title: "Disputes with a human final say", body: "Three differently configured AI jurors, one or two staked arbitrators, one appeal, a 21-day hard stop." },
  { icon: ShieldCheck, title: "Every step has a fallback", body: "Deadlines, retries and a defined default outcome, so no case can freeze funds forever." },
  { icon: Landmark, title: "DAO-governed settings", body: "Timeouts, fees and approved AI prompts change only by public proposal, within ranges enforced in code." },
  { icon: BadgeCheck, title: "Credentials you carry", body: "Work history issued as Solana Attestation Service credentials. Badges can't be sold." },
  { icon: Receipt, title: "Get paid early", body: "Sell a delivered milestone as a receivable NFT. Escrow pays whoever holds it." },
];

function LiveStats() {
  const hydrated = useHydrated();
  const milestones = useAllMilestones();
  const cases = useCases();
  const treasury = useChain((s) => s.treasury.balance);
  if (!hydrated) return <div className="h-[92px]" />;
  const locked = Object.values(milestones)
    .filter((m) => ["funded", "submitted", "partialReleased", "disputed"].includes(m.status))
    .reduce((s, m) => s + lockedRemaining(m), 0);
  const open = cases.filter((c) => !["settled", "defaulted", "appealed"].includes(c.status)).length;
  const settled = cases.filter((c) => c.status === "settled" || c.status === "defaulted").length;
  const stats = [
    ["Locked in escrow", formatUsdc(locked, { compact: true })],
    ["Open disputes", String(open)],
    ["Cases settled by deadline", settled ? "100%" : "—"],
    ["DAO treasury", formatUsdc(treasury, { compact: true })],
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(([k, v]) => (
        <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-[#A1A1AA]">{k}</div>
          <div className="text-lg font-bold text-white mt-1 tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <div className="relative mx-auto w-full max-w-[1600px]">
        <Image
          src="/images/hero-banner.png"
          alt="PROOVE"
          width={1600}
          height={900}
          className="w-full h-[60vh] min-h-[320px] sm:h-[70vh] md:h-auto object-cover"
          priority
        />

        <div className="absolute inset-0 flex flex-col items-center justify-end px-4 pb-8 sm:pb-12 md:pb-16 gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <Link href="/role" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto rounded-full px-8">
                Start Hiring →
              </Button>
            </Link>
            <Link href="/talent" className="w-full sm:w-auto">
              <Button size="lg" variant="ghost" className="w-full sm:w-auto rounded-full px-8 border border-white/10">
                Browse Talent
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
        <LiveStats />
        <div className="mt-14 mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF6FAF] mb-2">How the money moves</div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight max-w-[640px]">
            Freelance work you can prove: agreed terms, checked deliveries, fair disputes.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s, i) => (
            <GlassCard key={s.eyebrow}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF6FAF] mb-2">
                {i + 1} · {s.eyebrow}
              </div>
              <div className="text-sm font-semibold text-white mb-2 leading-snug">{s.title}</div>
              <p className="text-sm text-[#A1A1AA] leading-relaxed">{s.body}</p>
            </GlassCard>
          ))}
        </div>
        <div className="mt-14 mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF6FAF] mb-2">What Proove adds</div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight max-w-[640px]">v1 handled money. Proove adds the trust layer around it.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <GlassCard key={f.title} className="hover:border-[#FF6FAF]/40 transition-colors">
              <f.icon size={20} className="text-[#FF6FAF] mb-3" />
              <div className="text-sm font-semibold text-white mb-1">{f.title}</div>
              <p className="text-sm text-[#A1A1AA] leading-relaxed">{f.body}</p>
            </GlassCard>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/gigs/new">
            <Button>Post a gig</Button>
          </Link>
          <Link href="/gigs">
            <Button variant="ghost" className="border border-white/10">
              Browse open jobs
            </Button>
          </Link>
          <Link href="/governance">
            <Button variant="ghost" className="border border-white/10">
              See the protocol settings
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
