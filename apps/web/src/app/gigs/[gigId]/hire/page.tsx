"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { DataGate } from "@/components/app/data-gate";
import { Empty, HashBadge, KeyValue, PersonChip, TxButton, TxError } from "@/components/proove/primitives";
import { SpecView } from "@/components/gig/spec-report";
import { CoinDropVault, Scene3D, VaultPoster } from "@/components/three";
import { useGig, useSession } from "@/hooks/use-chain";
import { useTransaction, PHASE_LABEL } from "@/lib/tx";
import { useChain } from "@/lib/mock/store";
import { formatDuration, formatUsdc } from "@proove/types/format";
import { ZERO_HASH } from "@proove/types/types";

const STEPS = ["Confirm milestone", "Fund escrow", "Locked"];

function Hire({ gigId }: { gigId: string }) {
  const params = useSearchParams();
  const { gig, milestones } = useGig(gigId);
  const { address, balance } = useSession();
  const protocol = useChain((s) => s.protocol);
  const tx = useTransaction();
  const requested = params.get("milestone");
  const candidates = milestones.filter((m) => m.status === "pendingFunding");
  // Lock the choice so the page doesn't jump to the next milestone once this one is funded.
  const [chosen] = useState(() => requested ?? candidates[0]?.address ?? null);
  const m = milestones.find((x) => x.address === chosen);
  const [step, setStep] = useState(0);
  const confirmed = tx.phase === "confirmed" || tx.phase === "finalized";
  const currentStep = confirmed ? 2 : step;

  if (!gig) return <Empty title="Gig not found" />;
  if (!m) return <div className="max-w-[640px] mx-auto"><Empty title="Nothing to fund" action={<Link href={`/gigs/${gigId}`} className="text-xs text-[#FF6FAF]">Back to gig →</Link>}>Every milestone on this gig is already funded. Add one from the gig page.</Empty></div>;

  const isClient = address === gig.client;
  const needsTerms = m.specHash !== ZERO_HASH && !m.termsAccepted;
  const fundedNow = m.status !== "pendingFunding";

  return (
    <div className="max-w-[980px] mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">Hire &amp; fund escrow</h1>
      <p className="text-sm text-[#A1A1AA] text-center mb-8">{gig.title}</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {STEPS.map((label, i) => (
          <div key={label} className="text-center text-[10px] sm:text-[11px] uppercase tracking-widest text-[#A1A1AA]">
            <span className={i <= currentStep ? "text-[#FF6FAF]" : ""}>Step {i + 1}</span>
            <span className="hidden sm:inline"> · {label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        <div className="flex flex-col gap-5">
          <GlassCard tone={currentStep === 0 ? "accent" : "default"}>
            <Eyebrow>Step 1 · Confirm milestone</Eyebrow>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-base font-semibold text-white">{m.title}</div>
              <div className="text-lg font-bold text-white tabular-nums">{formatUsdc(m.amount)}</div>
            </div>
            {gig.freelancer && <PersonChip address={gig.freelancer} sub="Assigned freelancer" />}
            {m.spec && (
              <div className="mt-4">
                <SpecView spec={m.spec} />
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4 items-center">
              <HashBadge label="spec" hash={m.specHash} doc={m.spec} />
              {m.specHash !== ZERO_HASH &&
                (m.termsAccepted ? (
                  <span className="text-[11px] text-emerald-300 inline-flex items-center gap-1">
                    <ShieldCheck size={12} /> freelancer signed this hash
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-300">freelancer hasn&apos;t accepted these terms yet</span>
                ))}
            </div>
            {step === 0 && !fundedNow && (
              <Button size="sm" className="mt-4" onClick={() => setStep(1)} disabled={!isClient || needsTerms || !gig.freelancer}>
                {needsTerms ? "Waiting for the freelancer to accept" : "Continue"}
              </Button>
            )}
          </GlassCard>

          <GlassCard tone={currentStep === 1 ? "accent" : "default"}>
            <Eyebrow>Step 2 · Fund escrow</Eyebrow>
            <KeyValue
              rows={[
                ["Amount", formatUsdc(m.amount)],
                ["Your balance", formatUsdc(balance)],
                ["First release", `${protocol.partialBps / 100}% after ${formatDuration(protocol.partialTimeout)} from delivery`],
                ["Full release", `${formatDuration(protocol.fullTimeout)} from delivery`],
                ["Protocol fee", `${protocol.feeBps / 100}% of each release`],
              ]}
            />
            <p className="text-[11px] text-[#71717A] mt-3">These terms are copied onto the milestone when it&apos;s funded. Later DAO votes never change money that&apos;s already locked.</p>
            {step >= 1 && !confirmed && !fundedNow && (
              <TxButton className="mt-4" phase={tx.phase} onClick={() => tx.run("fundMilestone", { milestone: m.address }, `Fund ${m.title}`)}>
                Confirm payment
              </TxButton>
            )}
            <TxError error={tx.error} />
          </GlassCard>

          <GlassCard tone={confirmed || fundedNow ? "good" : "default"}>
            <Eyebrow>Step 3 · Locked</Eyebrow>
            {confirmed || fundedNow ? (
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 size={16} /> {formatUsdc(m.amount)} locked in a vault no one holds a key to.
              </div>
            ) : (
              <p className="text-sm text-[#71717A]">{tx.phase === "idle" ? "Waiting…" : PHASE_LABEL[tx.phase]}</p>
            )}
            {(confirmed || fundedNow) && (
              <Link href={`/gigs/${gigId}`}>
                <Button className="mt-4">Back to gig</Button>
              </Link>
            )}
          </GlassCard>
        </div>

        <GlassCard className="p-0 overflow-hidden h-[320px] lg:h-auto lg:min-h-[420px]">
          <Scene3D className="h-full min-h-[320px]" label={confirmed || fundedNow ? "Coin inside the sealed vault: funds are locked" : "Open vault waiting for the funding transaction"} poster={<VaultPoster />}>
            {(on) => <CoinDropVault active={on} dropped={confirmed || fundedNow} />}
          </Scene3D>
        </GlassCard>
      </div>
    </div>
  );
}

export default function HireFlowPage({ params }: { params: Promise<{ gigId: string }> }) {
  const { gigId } = use(params);
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DataGate requireWallet>
        <Suspense>
          <Hire gigId={gigId} />
        </Suspense>
      </DataGate>
    </section>
  );
}
