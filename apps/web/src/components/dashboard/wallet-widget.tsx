"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Plus, ArrowDownToLine, Activity } from "lucide-react";
import { useSession } from "@/hooks/use-chain";
import { Avatar } from "@/components/proove/primitives";
import { formatUsdc } from "@proove/types/format";
import { cn } from "@/lib/utils";

export function WalletWidget() {
  const [open, setOpen] = useState(false);
  const { address, balance } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);

  const label = address ? formatUsdc(balance) : "Not signed in";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pl-1.5 pr-3 py-1.5 text-sm hover:border-[#FF6FAF]/40 transition-colors"
      >
        <Avatar address={address} size={24} />
        <span className="font-medium text-[#F5F5F5] tabular-nums">{label}</span>
        <ChevronDown size={14} className="text-[#A1A1AA]" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-[#0A0A0B]/95 backdrop-blur-xl p-3 shadow-2xl z-50">
          <div className="px-2 pb-2 text-[11px] uppercase tracking-widest text-[#A1A1AA]">Balance</div>
          <div className="px-2 pb-3 text-lg font-semibold text-white tabular-nums">{label}</div>
          <div className="flex flex-col gap-1">
            <WalletAction icon={<Plus size={14} />} label="Add funds (on-ramp, Phase 3)" disabled />
            <WalletAction icon={<ArrowDownToLine size={14} />} label="Cash out (off-ramp, Phase 3)" disabled />
            <Link href="/wallet" onClick={() => setOpen(false)}>
              <WalletAction icon={<Activity size={14} />} label="Wallet & activity" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletAction({ icon, label, className, disabled }: { icon: React.ReactNode; label: string; className?: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-[#D4D4D8] hover:bg-white/5 hover:text-white transition-colors text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed",
        className,
      )}
    >
      <span className="text-[#FF6FAF]">{icon}</span>
      {label}
    </button>
  );
}
