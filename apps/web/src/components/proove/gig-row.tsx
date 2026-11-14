"use client";

import Link from "next/link";
import type { GigWithMilestones } from "@/hooks/use-chain";
import { formatUsdc } from "@/lib/domain/format";
import { GigStatusPill, PersonName } from "./primitives";
import { ProgressBar } from "@/components/ui/progress";

export function GigRow({ g, counterpart }: { g: GigWithMilestones; counterpart: "client" | "freelancer" }) {
  const released = g.milestones.reduce((s, m) => s + m.released, 0);
  const who = counterpart === "client" ? g.client : g.freelancer;
  return (
    <Link href={`/gigs/${g.address}`} className="block py-3 first:pt-0 last:pb-0 group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate group-hover:text-[#FF6FAF] transition-colors">{g.title}</div>
          <div className="text-xs text-[#A1A1AA] mt-0.5 truncate">
            {who ? <PersonName address={who} link={false} /> : "Unassigned"} · {g.milestones.length} milestone{g.milestones.length === 1 ? "" : "s"}
          </div>
        </div>
        <GigStatusPill status={g.status} />
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={released} max={Math.max(1, g.budget)} />
        </div>
        <div className="text-[11px] text-[#A1A1AA] tabular-nums whitespace-nowrap">
          {formatUsdc(g.locked, { unit: false })} locked · {formatUsdc(released, { unit: false })}/{formatUsdc(g.budget, { unit: false })}
        </div>
      </div>
    </Link>
  );
}
