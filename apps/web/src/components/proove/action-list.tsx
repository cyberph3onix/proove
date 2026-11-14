"use client";

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import type { ActionItem } from "@/hooks/use-action-items";
import { Countdown, Empty } from "./primitives";
import { cn } from "@/lib/utils";

export function ActionList({ items, now, limit = 6 }: { items: ActionItem[]; now: number; limit?: number }) {
  if (items.length === 0) return <Empty title="Nothing needs you right now">New deliveries, terms to accept and dispute deadlines will show up here.</Empty>;
  return (
    <ul className="flex flex-col gap-2">
      {items.slice(0, limit).map((a) => (
        <li key={a.id}>
          <Link
            href={a.href}
            className={cn(
              "group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
              a.urgent ? "border-[#FF6FAF]/40 bg-[#FF6FAF]/[0.06] hover:bg-[#FF6FAF]/10" : "border-white/[0.08] hover:bg-white/[0.03]",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">{a.title}</div>
              <div className="text-xs text-[#A1A1AA] truncate">{a.detail}</div>
            </div>
            {a.due !== undefined && Number.isFinite(a.due) && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#A1A1AA]">
                <Clock size={11} /> <Countdown to={a.due} now={now} />
              </span>
            )}
            <ArrowRight size={14} className="text-[#71717A] group-hover:text-[#FF6FAF] transition-colors" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
