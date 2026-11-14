"use client";

import { use, useEffect, useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { Award, Lock } from "lucide-react";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Pill, Stars } from "@/components/ui/pill";
import { DataGate } from "@/components/app/data-gate";
import { AddressText, Avatar, Empty, PersonName, SourceNote, TxButton, TxError } from "@/components/proove/primitives";
import { Poster, Scene3D, ScoreCrystal } from "@/components/three";
import { useProfile, useSession, usePerson } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { BADGE_META, MAX_REPUTATION_SCORE, scoreBreakdown } from "@proove/types/reputation";
import { formatDate, formatStars, formatUsdc } from "@proove/types/format";
import { mockAddress } from "@proove/types/hash";
import { useTransaction } from "@/lib/tx";
import { deriveProfile } from "@/lib/anchor/pdas";
import { isChainMode } from "@/lib/chain/mode";
import { watchWallet } from "@/lib/chain/sync";
import { CHAIN_REFRESH_EVENT } from "@/components/wallet/chain-sync";

function Profile({ wallet }: { wallet: string }) {
  const { profile, badges, ratings } = useProfile(wallet);
  const person = usePerson(wallet);
  const { address } = useSession();
  const allCredentials = useChain((s) => s.credentials);
  const credentials = useMemo(() => allCredentials.filter((c) => c.subject === wallet && !c.revoked), [allCredentials, wallet]);
  const tx = useTransaction();
  const pda = isChainMode ? deriveProfile(new PublicKey(wallet)).toBase58() : mockAddress(`profile-pda:${wallet}`);
  const mine = address === wallet;

  useEffect(() => {
    if (!isChainMode) return;
    watchWallet(wallet);
    window.dispatchEvent(new Event(CHAIN_REFRESH_EVENT));
  }, [wallet]);

  if (!profile) {
    return (
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-4 mb-6">
          <Avatar address={wallet} size={64} />
          <div>
            <div className="text-lg font-semibold text-white">{person?.name ?? "Unknown wallet"}</div>
            <AddressText address={wallet} chars={6} />
          </div>
        </div>
        <Empty title="No reputation profile yet">This wallet hasn&apos;t completed a job on Proove. Profiles are created on first assignment.</Empty>
      </div>
    );
  }

  const b = scoreBreakdown(profile);
  const facts: [string, React.ReactNode][] = [
    ["Reputation score", `${profile.reputationScore} / ${MAX_REPUTATION_SCORE}`],
    ["Completed jobs", profile.completedJobs],
    ["Successful jobs", profile.successfulJobs],
    ["On-time deliveries", `${profile.onTimeJobs} (${Math.round((profile.onTimeJobs / Math.max(1, profile.completedJobs)) * 100)}%)`],
    ["Average rating", `${formatStars(profile.averageRating)}★ from ${profile.ratingCount}`],
    ["Disputes won / lost", `${profile.disputesWon} / ${profile.disputesLost}`],
    ["Cancelled jobs", profile.cancelledJobs],
    ["Total earnings", formatUsdc(profile.totalEarnings)],
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        <div>
          <div className="flex items-center gap-4 mb-6">
            <Avatar address={wallet} size={72} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white">{person?.name ?? "Freelancer"}</h1>
              {person?.headline && <p className="text-sm text-[#A1A1AA]">{person.headline}</p>}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <AddressText address={wallet} chars={6} />
                <Stars filled={Math.round(profile.averageRating / 100)} />
              </div>
            </div>
          </div>

          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <Eyebrow className="mb-0">On-chain record</Eyebrow>
              <SourceNote account={pda} slot={profile.slot} label="UserProfile PDA" />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-sm border-b border-white/[0.04] pb-2">
                  <dt className="text-[#A1A1AA]">{k}</dt>
                  <dd className="text-white tabular-nums text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-[#71717A] mt-3">
              Every value is read from this wallet&apos;s UserProfile account at the slot shown. The score is a pure function of these counters:
              3×success ({b.successRate}) + 3×rating ({b.ratingScore}) + 2×volume ({b.volumeScore}) + 2×earnings ({b.earningsScore}) − 2×cancellations ({b.cancellationPenalty}) = {b.total}.
            </p>
          </GlassCard>

          <GlassCard className="mt-5">
            <Eyebrow>Badges ({badges.length})</Eyebrow>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {badges.map((bd) => (
                <div key={bd.type} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3">
                  <div className={`h-9 w-9 rounded-full border flex items-center justify-center ${bd.minted ? "border-[#FF6FAF] text-[#FF6FAF]" : "border-white/15 text-[#71717A]"}`}>
                    <Award size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white flex items-center gap-1.5 flex-wrap">
                      {BADGE_META[bd.type].label}
                      {bd.version === "v1" ? <Pill className="text-[9px] px-1.5 py-0">v1 badge · transferable</Pill> : bd.minted ? <Pill tone="accent" className="text-[9px] px-1.5 py-0"><Lock size={9} /> non-transferable</Pill> : null}
                    </div>
                    <div className="text-[11px] text-[#71717A]">{BADGE_META[bd.type].description} · {formatDate(bd.issuedAt)}</div>
                  </div>
                  {mine && !bd.minted && (
                    <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("claimBadge", { type: bd.type }, `Claim ${BADGE_META[bd.type].label}`)}>
                      Claim NFT
                    </TxButton>
                  )}
                </div>
              ))}
              {badges.length === 0 && <p className="text-sm text-[#A1A1AA]">No badges yet.</p>}
            </div>
            <TxError error={tx.error} />
          </GlassCard>

          <GlassCard className="mt-5">
            <Eyebrow>Ratings</Eyebrow>
            {ratings.length === 0 && <p className="text-sm text-[#A1A1AA]">No v2 ratings yet; v1 ratings are counted in the totals above.</p>}
            <div className="flex flex-col gap-3">
              {ratings.map((r) => (
                <div key={r.address}>
                  <Stars filled={r.score} />
                  {r.review && <p className="text-sm text-[#D4D4D8] mt-1">“{r.review}”</p>}
                  <p className="text-[11px] text-[#71717A]">
                    <PersonName address={r.client} /> · {formatDate(r.submittedAt)} · review hash {r.reviewHash.slice(0, 8)}…
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="flex flex-col gap-5">
          <GlassCard className="p-0 overflow-hidden">
            <Scene3D className="h-[340px]" label={`Score crystal: facets sized by success ${b.successRate}, rating ${b.ratingScore}, volume ${b.volumeScore} and earnings ${b.earningsScore}; ${badges.length} badge medals`} poster={<Poster />}>
              {(on) => <ScoreCrystal active={on} components={{ success: b.successRate, rating: b.ratingScore, volume: b.volumeScore, earnings: b.earningsScore }} medals={badges.map((x) => ({ minted: x.minted }))} />}
            </Scene3D>
            <div className="px-5 pb-5 -mt-6 relative">
              <div className="text-4xl font-bold text-white tabular-nums">{profile.reputationScore}</div>
              <div className="text-xs text-[#A1A1AA]">reputation score, recomputable by anyone</div>
            </div>
          </GlassCard>
          <GlassCard>
            <Eyebrow>Verifiable credentials</Eyebrow>
            {credentials.length === 0 ? (
              <p className="text-sm text-[#A1A1AA]">No active credentials. {mine && <Link href="/credentials" className="text-[#FF6FAF]">Issue one →</Link>}</p>
            ) : (
              credentials.map((c) => (
                <div key={c.address} className="text-sm text-[#D4D4D8] flex justify-between gap-2 py-1">
                  <span className="font-mono text-xs">{c.schema}</span>
                  <span className="text-[11px] text-[#71717A]">expires {formatDate(c.expiresAt)}</span>
                </div>
              ))
            )}
            <p className="text-[11px] text-[#71717A] mt-2">Also served at <span className="font-mono">GET /v1/reputation/{wallet.slice(0, 4)}…</span> by the indexer, with account and slot for every value.</p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = use(params);
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DataGate>
        <Profile wallet={wallet} />
      </DataGate>
    </section>
  );
}
