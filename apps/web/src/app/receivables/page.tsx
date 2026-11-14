"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { Countdown, Empty, PageHeader, PersonName, TxButton, TxError, Tabs, inputClass } from "@/components/proove/primitives";
import { Poster, ReceivableHandoff, Scene3D } from "@/components/three";
import { useNow, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { formatUsdc, usdcToBase } from "@/lib/domain/format";
import { lockedRemaining, releaseFee } from "@/lib/domain/dispute";
import { useTransaction } from "@/lib/tx";
import type { Receivable } from "@/lib/domain/types";

function Receivables() {
  const { address } = useSession();
  const now = useNow();
  const receivables = useChain((s) => s.receivables);
  const milestones = useChain((s) => s.milestones);
  const gigs = useChain((s) => s.gigs);
  const cases = useChain((s) => s.cases);
  const feeBps = useChain((s) => s.protocol.feeBps);
  const [tab, setTab] = useState<"market" | "mine">("market");
  const [lastBought, setLastBought] = useState<string | null>(null);

  const list = Object.values(receivables);
  const market = list.filter((r) => r.status === "active" && r.askPrice !== null);
  const held = list.filter((r) => r.owner === address);
  const mintable = useMemo(
    () => Object.values(milestones).filter((m) => gigs[m.gig]?.freelancer === address && m.status === "submitted" && m.termsAccepted && !m.receivable),
    [milestones, gigs, address],
  );

  const clientHistory = (client: string) => {
    const cs = Object.values(cases).filter((c) => c.client === client && c.round === 1);
    const raised = cs.filter((c) => c.raisedBy === client).length;
    const won = cs.filter((c) => c.finalRuling !== null && c.finalRuling < 5000).length;
    return { raised, won };
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader
        eyebrow="Receivables · Phase 3 preview"
        title="Get paid early, or buy funded receivables"
        description="A delivered milestone's pending payout can be minted as an NFT and sold at a discount. The money is already locked in escrow, so the buyer's only risk is a dispute's outcome. Escrow pays whoever holds the NFT."
      />

      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-4 mb-6 text-xs text-amber-200">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        Devnet only. Selling receivables can count as factoring or a regulated financial product in some jurisdictions; this isn&apos;t legal advice. Proove shows facts only and never rates what a receivable is worth.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="flex flex-col gap-5 min-w-0">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "market", label: `Market (${market.length})` },
              { value: "mine", label: `Mine (${held.length + mintable.length})` },
            ]}
          />

          {tab === "market" && (
            <div className="flex flex-col gap-3">
              {market.map((r) => (
                <MarketRow key={r.address} r={r} now={now} me={address} history={clientHistory(gigs[r.gig].client)} onBought={() => setLastBought(r.address)} />
              ))}
              {market.length === 0 && <Empty title="Nothing listed right now" />}
            </div>
          )}

          {tab === "mine" && (
            <div className="flex flex-col gap-5">
              <GlassCard>
                <Eyebrow>Delivered milestones you can tokenize ({mintable.length})</Eyebrow>
                <div className="flex flex-col gap-2">
                  {mintable.map((m) => {
                    const remaining = lockedRemaining(m);
                    return <MintRow key={m.address} milestone={m.address} title={m.title} gigTitle={gigs[m.gig].title} face={remaining - releaseFee(remaining, { feeBps })} />;
                  })}
                  {mintable.length === 0 && <p className="text-sm text-[#A1A1AA]">Only Submitted milestones with accepted terms and no open dispute qualify. Before delivery the payout is too uncertain to sell.</p>}
                </div>
              </GlassCard>
              <GlassCard>
                <Eyebrow>Receivables you hold ({held.length})</Eyebrow>
                <div className="flex flex-col gap-2">
                  {held.map((r) => (
                    <HeldRow key={r.address} r={r} title={milestones[r.milestone]?.title} />
                  ))}
                  {held.length === 0 && <p className="text-sm text-[#A1A1AA]">None yet.</p>}
                </div>
              </GlassCard>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <GlassCard className="p-0 overflow-hidden">
            <Scene3D className="h-[220px]" label={lastBought ? "Receivable card handed over to the buyer's wallet" : "Receivable card resting on the seller's wallet"} poster={<Poster />}>
              {(on) => <ReceivableHandoff active={on} toBuyer={!!lastBought} />}
            </Scene3D>
            <div className="px-5 pb-5 text-xs text-[#A1A1AA]">
              {lastBought ? "Purchase confirmed: the NFT is in your wallet, and escrow will pay you on release." : "When a purchase confirms, the card moves to the buyer."}
            </div>
          </GlassCard>
          <GlassCard>
            <Eyebrow>Rules</Eyebrow>
            <ul className="text-xs text-[#A1A1AA] flex flex-col gap-1.5 list-disc pl-4">
              <li>One receivable per milestone. Face value = remaining locked amount minus the protocol fee.</li>
              <li>Approval, timeouts and dispute rulings pay the holder exactly as they would the freelancer.</li>
              <li>Burned on full release. Reputation stays with the freelancer.</li>
              <li>After a sale, only the client can raise a dispute; the holder can submit evidence.</li>
            </ul>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

function MarketRow({ r, now, me, history, onBought }: { r: Receivable; now: number; me: string | null; history: { raised: number; won: number }; onBought: () => void }) {
  const m = useChain((s) => s.milestones[r.milestone]);
  const gig = useChain((s) => s.gigs[r.gig]);
  const tx = useTransaction();
  const discount = ((r.faceValue - r.askPrice!) / r.faceValue) * 100;
  const fullAt = (m.submittedAt ?? now) + (m.terms?.fullTimeout ?? 0);
  const passRate = m.report ? m.report.findings.filter((f) => f.verdict === "pass").length / Math.max(1, m.report.findings.length) : null;
  return (
    <GlassCard className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{m.title}</div>
          <div className="text-xs text-[#A1A1AA]">
            <Link href={`/gigs/${gig.address}`} className="hover:text-[#FF6FAF]">{gig.title}</Link> · freelancer <PersonName address={r.freelancer} link={false} /> · client <PersonName address={gig.client} link={false} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-white tabular-nums">{formatUsdc(r.askPrice!)}</div>
          <div className="text-[11px] text-[#A1A1AA]">face {formatUsdc(r.faceValue)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Fact label="Implied discount" value={`${discount.toFixed(1)}%`} />
        <Fact label="Full release in" value={<Countdown to={fullAt} now={now} doneLabel="due" />} />
        <Fact label="Report pass rate" value={passRate === null ? "no report" : `${Math.round(passRate * 100)}%`} />
        <Fact label="Client disputes" value={`${history.raised} raised · ${history.won} won`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {m.status === "disputed" && <Pill tone="warn">disputed, can&apos;t buy</Pill>}
        <TxButton
          size="sm"
          phase={tx.phase}
          disabled={!me || r.owner === me || m.status === "disputed"}
          onClick={async () => {
            const res = await tx.run("buyReceivable", { receivable: r.address }, `Buy receivable: ${m.title}`);
            if (res.ok) onBought();
          }}
        >
          {r.owner === me ? "You hold this" : `Buy for ${formatUsdc(r.askPrice!)}`}
        </TxButton>
      </div>
      <TxError error={tx.error} />
    </GlassCard>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
      <div className="text-[10px] text-[#71717A]">{label}</div>
      <div className="text-sm text-white tabular-nums">{value}</div>
    </div>
  );
}

function MintRow({ milestone, title, gigTitle, face }: { milestone: string; title: string; gigTitle: string; face: number }) {
  const tx = useTransaction();
  return (
    <div className="rounded-xl border border-white/[0.08] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm text-white">{title}</div>
        <div className="text-xs text-[#A1A1AA]">
          {gigTitle} · face value {formatUsdc(face)}
        </div>
      </div>
      <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("mintReceivable", { milestone }, `Mint receivable: ${title}`)}>
        Mint receivable NFT
      </TxButton>
      <TxError error={tx.error} />
    </div>
  );
}

function HeldRow({ r, title }: { r: Receivable; title?: string }) {
  const [price, setPrice] = useState(String(Math.floor((r.faceValue * 0.96) / 1_000_000)));
  const tx = useTransaction();
  return (
    <div className="rounded-xl border border-white/[0.08] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-white">{title}</div>
          <div className="text-xs text-[#A1A1AA]">
            face {formatUsdc(r.faceValue)} · {r.status}
            {r.askPrice !== null && ` · listed at ${formatUsdc(r.askPrice)}`}
            {r.sales.length > 0 && ` · bought for ${formatUsdc(r.sales[r.sales.length - 1].price)}`}
          </div>
        </div>
        <Pill tone={r.status === "active" ? "accent" : "good"}>{r.status === "active" ? "pays you on release" : "paid out"}</Pill>
      </div>
      {r.status === "active" && (
        <div className="flex flex-wrap gap-2 mt-3">
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" className={`${inputClass} h-9 w-32`} aria-label="Ask price" />
          <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("listReceivable", { receivable: r.address, price: usdcToBase(price) }, "List receivable")}>
            {r.askPrice !== null ? "Update price" : "List for sale"}
          </TxButton>
          {r.askPrice !== null && (
            <TxButton size="sm" variant="ghost" className="border border-white/10" phase={tx.phase} onClick={() => tx.run("delistReceivable", { receivable: r.address }, "Delist receivable")}>
              Delist
            </TxButton>
          )}
        </div>
      )}
      <TxError error={tx.error} />
    </div>
  );
}

export default function ReceivablesPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav />
      <DataGate requireWallet>
        <Receivables />
      </DataGate>
    </section>
  );
}
