"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, AnimatePresence } from "framer-motion";
import { FileCheck2, Gavel, Landmark, BadgeCheck, Receipt, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroVault, Scene3D, VaultPoster } from "@/components/three";
import { useCases, useHydrated, useAllMilestones } from "@/hooks/use-chain";
import { lockedRemaining } from "@proove/types/dispute";
import { formatUsdc } from "@proove/types/format";
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
  const storyRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: storyRef, offset: ["start start", "end end"] });
  const [step, setStep] = useState(-1);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const s = v < 0.08 ? -1 : Math.min(3, Math.floor(((v - 0.08) / 0.92) * 4));
    setStep(s);
  });
  const stage = Math.max(0, step);

  return (
    <>
      <section ref={storyRef} className="relative h-[500vh]">
        <div className="sticky top-[72px] md:top-[120px] h-[calc(100vh-72px)] md:h-[calc(100vh-120px)] overflow-hidden">
          {/* wordmark behind the vault */}
          <div
            aria-hidden
            className="pointer-events-none select-none absolute inset-x-0 top-[18%] md:top-[14%] text-center font-bold lowercase tracking-[-0.06em] text-[#FF6FAF] transition-opacity duration-700"
            style={{ fontSize: "clamp(96px, 24vw, 380px)", lineHeight: 0.9, opacity: step < 0 ? 0.92 : 0.12 }}
          >
            proove
          </div>

          <Scene3D className="absolute inset-0" label="A glass vault holding milestone coins; it seals, glows and opens as the story progresses" poster={<VaultPoster />}>
            {(active) => <HeroVault active={active} stage={stage} />}
          </Scene3D>

          <div className="relative h-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-12 flex flex-col justify-end pb-10 sm:pb-14">
            <AnimatePresence mode="wait">
              {step < 0 ? (
                <motion.div key="hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col items-center text-center gap-5">
                  <h1 className="text-white font-semibold tracking-tight max-w-[720px]" style={{ fontSize: "clamp(22px, 3vw, 34px)", lineHeight: 1.2 }}>
                    Freelance work you can prove: agreed terms, checked deliveries, fair disputes.
                  </h1>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <Link href="/role" className="w-full sm:w-auto">
                      <Button size="lg" className="w-full sm:w-auto rounded-full px-8">
                        Start Hiring →
                      </Button>
                    </Link>
                    <Link href="/talent" className="w-full sm:w-auto">
                      <Button size="lg" variant="ghost" className="w-full sm:w-auto rounded-full px-8 border border-white/10 bg-black/30 backdrop-blur">
                        Browse Talent
                      </Button>
                    </Link>
                  </div>
                  <div className="text-[11px] uppercase tracking-widest text-[#71717A] mt-2">Scroll to see how the money moves ↓</div>
                </motion.div>
              ) : (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35 }}
                  className="max-w-[520px] rounded-3xl border border-white/10 bg-black/50 backdrop-blur-xl p-6"
                >
                  <div className="flex items-center gap-2 mb-3">
                    {STEPS.map((s, i) => (
                      <span key={s.eyebrow} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[#FF6FAF]" : "bg-white/10"}`} />
                    ))}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF6FAF] mb-2">
                    {step + 1} · {STEPS[step].eyebrow}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">{STEPS[step].title}</h2>
                  <p className="text-sm text-[#D4D4D8] mt-3 leading-relaxed">{STEPS[step].body}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
        <LiveStats />
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
