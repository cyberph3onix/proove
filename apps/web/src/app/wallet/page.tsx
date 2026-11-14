"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Plus, ArrowDownToLine, Activity, EyeOff } from "lucide-react";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { DataGate } from "@/components/app/data-gate";
import { AddressText, KeyValue, Relative } from "@/components/proove/primitives";
import { Scene3D, TokenStack, Poster } from "@/components/three";
import { useEvents, useMyGigs, useNow, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { formatUsdc, USDC } from "@proove/types/format";

function Wallet() {
  const { address, balance } = useSession();
  const now = useNow(30_000);
  const asFreelancer = useMyGigs(address, "freelancer");
  const asClient = useMyGigs(address, "client");
  const receivables = useChain((s) => s.receivables);
  const arbitrator = useChain((s) => (address ? s.arbitrators[address] : undefined));
  const filter = useMemo(() => (e: { actors: string[] }) => !!address && e.actors.includes(address), [address]);
  const events = useEvents(filter).filter((e) => e.amount).slice(0, 8);

  const lockedForMe = asFreelancer.filter((g) => g.freelancer === address).reduce((s, g) => s + g.locked, 0);
  const lockedByMe = asClient.reduce((s, g) => s + g.locked, 0);
  const heldReceivables = Object.values(receivables).filter((r) => r.owner === address && r.status === "active");
  const receivableFace = heldReceivables.reduce((s, r) => s + r.faceValue, 0);

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-[1fr_380px] gap-6">
      <div className="flex flex-col gap-5">
        <GlassCard className="p-0 overflow-hidden">
          <Scene3D className="h-[240px]" label={`Token stack sized to a balance of ${formatUsdc(balance)}`} poster={<Poster />}>
            {(on) => <TokenStack active={on} coins={Math.log10(Math.max(10, balance / USDC)) * 9} />}
          </Scene3D>
          <div className="px-5 pb-5">
            <Eyebrow>Wallet</Eyebrow>
            <div className="text-3xl font-bold text-white tabular-nums">{formatUsdc(balance)}</div>
            <AddressText address={address} chars={6} />
          </div>
        </GlassCard>
        <GlassCard>
          <Eyebrow>Recent money movement</Eyebrow>
          <ul className="divide-y divide-white/[0.06]">
            {events.map((e) => (
              <li key={e.signature} className="py-2.5 first:pt-0 flex justify-between gap-3 text-sm">
                <span className="text-[#D4D4D8] min-w-0">{e.receipt}</span>
                <span className="text-[11px] text-[#71717A] whitespace-nowrap">
                  <Relative at={e.blockTime} now={now} />
                </span>
              </li>
            ))}
            {events.length === 0 && <li className="text-sm text-[#A1A1AA]">Nothing yet.</li>}
          </ul>
          <Link href="/transactions" className="text-xs text-[#FF6FAF] mt-3 inline-block">
            All transactions →
          </Link>
        </GlassCard>
      </div>

      <div className="flex flex-col gap-5">
        <GlassCard>
          <Eyebrow>Positions</Eyebrow>
          <KeyValue
            rows={[
              ["Locked for you (as freelancer)", formatUsdc(lockedForMe)],
              ["Locked by you (as client)", formatUsdc(lockedByMe)],
              ["Receivables held (face)", formatUsdc(receivableFace)],
              ...(arbitrator ? ([["Arbitrator stake", formatUsdc(arbitrator.stake)], ["Fees to claim", formatUsdc(arbitrator.feesEarned)]] as [string, string][]) : []),
            ]}
          />
        </GlassCard>
        <GlassCard>
          <div className="flex flex-col gap-2.5">
            <Button className="w-full" disabled title="Fiat on-ramp is Phase 3 (link-out provider)">
              <Plus size={16} className="mr-2" /> Add funds (Phase 3)
            </Button>
            <Button variant="ghost" className="w-full border border-white/10" disabled title="Fiat off-ramp is Phase 3 (link-out provider)">
              <ArrowDownToLine size={16} className="mr-2" /> Cash out (Phase 3)
            </Button>
            <Link href="/transactions">
              <Button variant="ghost" className="w-full border border-white/10">
                <Activity size={16} className="mr-2" /> View wallet activity
              </Button>
            </Link>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-start gap-3">
            <EyeOff size={18} className="text-[#14F195] mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-white">Confidential withdrawal</div>
              <p className="text-xs text-[#A1A1AA] mt-1">
                After a release, move earnings through Umbra so where they go next can&apos;t be traced. Escrow amounts stay public so anyone can check funds exist. Needs Umbra&apos;s devnet mint; wired in Phase 1.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DataGate requireWallet>
        <Wallet />
      </DataGate>
    </section>
  );
}
