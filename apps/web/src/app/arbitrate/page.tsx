"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { CaseStatusPill, Countdown, Empty, Field, KeyValue, PageHeader, Stat, TxButton, TxError, inputClass } from "@/components/proove/primitives";
import { Poster, Scene3D, StakeColumn } from "@/components/three";
import { useCases, useNow, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { formatUsdc, formatBps, shortAddress, usdcToBase } from "@proove/types/format";
import { useTransaction } from "@/lib/tx";

function Arbitrate() {
  const { address } = useSession();
  const now = useNow();
  const arb = useChain((s) => (address ? s.arbitrators[address] : undefined));
  const cfg = useChain((s) => s.disputeConfig);
  const milestones = useChain((s) => s.milestones);
  const cases = useCases();
  const tx = useTransaction();
  const [stake, setStake] = useState(String(cfg.arbitratorStake / 1_000_000));
  const [topUp, setTopUp] = useState("50");

  if (!arb) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-10">
        <PageHeader eyebrow="Arbitration" title="Become an arbitrator" description="Arbitrators are people the DAO approves. You stake USDC, sign verdicts with written reasons, and earn a share of the arbitration fee." />
        <GlassCard>
          <KeyValue
            rows={[
              ["Minimum stake", formatUsdc(cfg.arbitratorStake)],
              ["Fee per case", `${formatBps(cfg.feeBps)} of frozen amount (min ${formatUsdc(cfg.feeMin)}), split among signers`],
              ["Missed deadline", `no-show, ${formatBps(cfg.noShowSlashBps)} of stake slashed`],
              ["Removal", "3 no-shows in 90 days"],
            ]}
          />
          <div className="mt-5 flex flex-col gap-3">
            <Field label="Stake (USDC)">
              <input value={stake} onChange={(e) => setStake(e.target.value)} type="number" className={inputClass} />
            </Field>
            <TxButton phase={tx.phase} onClick={() => tx.run("registerArbitrator", { stake: usdcToBase(stake) }, "Register as arbitrator")}>
              Stake &amp; apply
            </TxButton>
            <TxError error={tx.error} />
            <p className="text-[11px] text-[#71717A]">After you stake, a council proposal approves you (set_arbitrator_status). Until then you&apos;re in cooldown and get no cases.</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  const assigned = cases.filter((c) => (c.arbitrators.includes(address!) && ["arbitration"].includes(c.status) && !c.verdicts.some((v) => v.arbitrator === address)) || (c.status === "tieBreak" && c.fallback === address));
  const history = cases.filter((c) => c.verdicts.some((v) => v.arbitrator === address) || (c.fallback === address && c.tieBreakPick !== undefined));

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader eyebrow="Arbitration" title="Your cases" description="Read the evidence and the brief first. The AI evaluations are proposals; you decide, and you write why." />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="flex flex-col gap-5">
          <GlassCard tone={assigned.length ? "accent" : "default"}>
            <Eyebrow>Assigned, waiting on you ({assigned.length})</Eyebrow>
            <div className="flex flex-col gap-2">
              {assigned.map((c) => (
                <Link key={c.address} href={`/disputes/${c.address}`} className="rounded-xl border border-white/[0.08] px-4 py-3 hover:bg-white/[0.03] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <CaseStatusPill status={c.status} />
                      <span className="text-[11px] font-mono text-[#71717A]">{shortAddress(c.address)} · round {c.round}</span>
                    </div>
                    <div className="text-sm text-white truncate">{milestones[c.milestone]?.title}</div>
                    <div className="text-xs text-[#A1A1AA]">
                      {formatUsdc(c.frozenAmount)} frozen · {c.requiredArbitrators === 2 ? "two arbitrators" : "sole arbitrator"} · your fee ≈ {formatUsdc(Math.floor(c.feeAmount / c.requiredArbitrators))}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#A1A1AA] shrink-0">
                    due <Countdown to={c.status === "tieBreak" ? c.deadlines.tieBreak! : c.deadlines.arbitration} now={now} doneLabel="overdue" />
                  </div>
                </Link>
              ))}
              {assigned.length === 0 && <Empty title="No cases waiting">Reminders go out at 24 h, 6 h and 1 h before each deadline.</Empty>}
            </div>
          </GlassCard>
          <GlassCard>
            <Eyebrow>History ({history.length})</Eyebrow>
            <div className="flex flex-col divide-y divide-white/[0.06]">
              {history.map((c) => {
                const v = c.verdicts.find((x) => x.arbitrator === address);
                return (
                  <Link key={c.address} href={`/disputes/${c.address}`} className="py-3 first:pt-0 flex justify-between gap-3 text-sm">
                    <span className="text-white truncate">{milestones[c.milestone]?.title}</span>
                    <span className="text-xs text-[#A1A1AA] whitespace-nowrap">
                      you: {v ? formatBps(v.ruling) : "tie-break"} · final {c.finalRuling !== null ? formatBps(c.finalRuling) : "pending"}
                    </span>
                  </Link>
                );
              })}
              {history.length === 0 && <p className="text-sm text-[#A1A1AA]">No signed verdicts yet.</p>}
            </div>
          </GlassCard>
        </div>

        <div className="flex flex-col gap-4">
          <GlassCard className="p-0 overflow-hidden">
            <Scene3D className="h-[220px]" label={`Stake column at ${formatUsdc(arb.stake)} against the ${formatUsdc(cfg.arbitratorStake)} minimum`} poster={<Poster />}>
              {(on) => <StakeColumn active={on} stake={arb.stake} required={cfg.arbitratorStake} />}
            </Scene3D>
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between">
                <Eyebrow className="mb-0">Stake</Eyebrow>
                <Pill tone={arb.status === "active" ? "good" : "warn"}>{arb.status}</Pill>
              </div>
              <div className="text-2xl font-bold text-white tabular-nums mt-1">{formatUsdc(arb.stake)}</div>
              <div className="flex gap-2 mt-3">
                <input value={topUp} onChange={(e) => setTopUp(e.target.value)} type="number" className={`${inputClass} h-9`} aria-label="Top-up amount" />
                <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("addStake", { amount: usdcToBase(topUp) }, "Add stake")}>
                  Add
                </TxButton>
              </div>
            </div>
          </GlassCard>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Cases decided" value={arb.casesDecided} />
            <Stat label="Overturned" value={arb.overturnedOnAppeal} />
            <Stat label="No-shows" value={arb.noShows} hint="3 in 90 days removes you" />
            <Stat label="Active cases" value={arb.activeCases} />
          </div>
          <GlassCard>
            <Eyebrow>Fees earned</Eyebrow>
            <div className="text-xl font-bold text-white tabular-nums">{formatUsdc(arb.feesEarned)}</div>
            <TxButton size="sm" className="mt-3" phase={tx.phase} disabled={arb.feesEarned <= 0} onClick={() => tx.run("claimFees", {}, "Claim fees")}>
              Claim
            </TxButton>
            <TxError error={tx.error} />
            <Link href="/credentials" className="block text-xs text-[#FF6FAF] mt-4">
              Get a proove.arbitrator.v1 credential →
            </Link>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export default function ArbitratePage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav />
      <DataGate requireWallet>
        <Arbitrate />
      </DataGate>
    </section>
  );
}
