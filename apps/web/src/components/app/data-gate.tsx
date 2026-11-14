"use client";

import Link from "next/link";
import { useHydrated, useSession } from "@/hooks/use-chain";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

/** Skeleton until the client-side data layer is ready. */
export function DataGate({ children, requireWallet = false }: { children: React.ReactNode; requireWallet?: boolean }) {
  const hydrated = useHydrated();
  const { address } = useSession();

  if (!hydrated) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10" aria-busy="true">
        <div className="h-7 w-56 rounded-lg bg-white/[0.05] animate-pulse mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (requireWallet && !address) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-20 flex justify-center">
        <GlassCard className="max-w-[380px] text-center py-8">
          <div className="text-lg font-semibold text-white mb-1">Sign in to continue</div>
          <p className="text-sm text-[#A1A1AA] mb-5">This page shows your gigs, cases and money, so it needs a wallet.</p>
          <Link href="/role">
            <Button>Sign in</Button>
          </Link>
        </GlassCard>
      </div>
    );
  }

  return <>{children}</>;
}
