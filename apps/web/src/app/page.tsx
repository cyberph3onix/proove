"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { FileCheck2, Gavel, Landmark, BadgeCheck, Receipt, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import {
  CredentialCard3D,
  CriteriaStack,
  DisputeChamber,
  HeroLaptop,
  MilestoneTrack,
  Poster,
  ReceivableHandoff,
  Scene3D,
  SettingDials,
} from "@/components/three";
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

/** Step shown for a scroll position; boundaries line up with the laptop poses in laptop-scenes.tsx. */
function stepAt(p: number) {
  if (p < 0.06) return -1;
  if (p < 0.26) return 0;
  if (p < 0.47) return 1;
  if (p < 0.66) return 2;
  return 3;
}

/** Fallback: clean background before three.js loads or with reduced motion. */
function HeroPoster() {
  return <div className="absolute inset-0" />;
}

/** Small looping 3D illustration for each feature card. */
function FeatureScene({ index }: { index: number }) {
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setFlip((f) => !f), 3200);
    return () => clearInterval(id);
  }, []);
  const scenes: [string, (on: boolean) => React.ReactNode][] = [
    ["Four criteria cards stacking up; one is flagged", (on) => <CriteriaStack active={on} count={4} flagged={[false, false, flip, false]} />],
    ["Three AI juror seats and an arbitrator bench", (on) => <DisputeChamber active={on} seats={flip ? ["posted", "posted", "posted"] : ["posted", "running", "pending"]} arbitratorsSigned={flip ? 1 : 0} arbitratorsRequired={2} ruling={null} />],
    ["Milestone rings filling toward their automatic release", (on) => <MilestoneTrack active={on} nodes={[{ progress: 1, state: "done" }, { progress: flip ? 0.8 : 0.45, state: "active" }, { progress: 0, state: "idle" }]} />],
    ["Protocol setting dials", (on) => <SettingDials active={on} values={flip ? [0.3, 0.7, 0.5] : [0.45, 0.55, 0.65]} />],
    ["A credential card flipping between front and fields", (on) => <CredentialCard3D active={on} flipped={flip} front={{ title: "Work record", subject: "Kai Mensah", schema: "proove.work-summary.v1" }} fields={[["completed_jobs", "15"], ["on_time", "93%"], ["average_rating", "4.7"]]} />],
    ["A receivable passing from freelancer to buyer", (on) => <ReceivableHandoff active={on} toBuyer={flip} />],
  ];
  const [label, render] = scenes[index];
  return (
    <Scene3D className="h-[160px] -mx-5 -mt-5 mb-4 border-b border-white/[0.06]" label={label} poster={<Poster />}>
      {render}
    </Scene3D>
  );
}

export default function Home() {
  const storyRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [step, setStep] = useState(-1);
  const { scrollYProgress } = useScroll({ target: storyRef, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progress.current = v;
    setStep(stepAt(v));
  });
  const wordmarkFaded = step >= 0;

  return (
    <>
      <section ref={storyRef} className="relative h-[500vh]">
        <div className="sticky top-[72px] md:top-[120px] h-[calc(100vh-72px)] md:h-[calc(100vh-120px)] overflow-hidden">
          {/* wordmark behind the laptop, matching previous commit */}
          <div
            aria-hidden
            className="pointer-events-none select-none absolute inset-x-0 top-[18%] md:top-[14%] text-center font-bold lowercase tracking-[-0.06em] text-[#FF6FAF] transition-opacity duration-700"
            style={{ fontSize: "clamp(96px, 24vw, 380px)", lineHeight: 0.9, opacity: wordmarkFaded ? 0.12 : 0.92 }}
          >
            proove
          </div>

          <Scene3D
            className="absolute inset-0"
            label="A silver laptop that turns to face you, closes on the locked payment, reopens for delivery and releases the coins as you scroll"
            poster={<HeroPoster />}
          >
            {(active) => <HeroLaptop active={active} progress={progress} step={step} steps={STEPS} />}
          </Scene3D>

          <div className="relative h-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-12 flex flex-col justify-end pb-8 sm:pb-12 md:pb-16 pointer-events-none">
            <AnimatePresence mode="wait">
              {step < 0 ? (
                <motion.div key="hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col items-center gap-4 pointer-events-auto">
                  <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full sm:w-auto">
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
                  <div className="text-[11px] uppercase tracking-widest text-[#71717A]">Scroll to see how the money moves ↓</div>
                </motion.div>
              ) : (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35 }}
                  className="max-w-[440px] rounded-3xl border border-white/10 bg-black/55 backdrop-blur-xl p-6 pointer-events-auto"
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
          {FEATURES.map((f, i) => (
            <GlassCard key={f.title} className="hover:border-[#FF6FAF]/40 transition-colors overflow-hidden">
              <FeatureScene index={i} />
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
