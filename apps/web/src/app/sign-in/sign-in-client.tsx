"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ParticleBackdrop } from "@/components/proove/particle-backdrop";
import { Avatar } from "@/components/proove/primitives";
import { useHydrated } from "@/hooks/use-chain";
import { useChain, useChainStore } from "@/lib/mock/store";
import { isChainMode } from "@/lib/chain/mode";
import { ChainSignIn } from "@/components/wallet/chain-sign-in";

/**
 * Mock mode: pick a demo persona (each has its own wallet, gigs and cases).
 * Chain mode restores v1's Privy email/Google sign-in with an embedded wallet.
 */
function MockSignIn({ role }: { role: "freelancer" | "client" }) {
  const isFreelancer = role === "freelancer";
  const dest = isFreelancer ? "/dashboard" : "/client";
  const router = useRouter();
  const hydrated = useHydrated();
  const personas = useChain((s) => s.personas);
  const ordered = [...personas].sort((a, b) => Number(b.defaultRole === role) - Number(a.defaultRole === role));

  return (
    <section className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center px-4 sm:px-6 py-24 overflow-hidden">
      <ParticleBackdrop />
      <GlassCard className="relative w-full max-w-[420px] text-center py-8 bg-[#0A0A0B]/80">
        <Pill tone="accent" className="mx-auto mb-5">
          Devnet preview
        </Pill>
        <h1 className="text-xl font-semibold text-white mb-1">Sign in to start {isFreelancer ? "working" : "hiring"}</h1>
        <p className="text-sm text-[#A1A1AA] mb-6">
          {isFreelancer ? "Accept clear terms and get paid on approval or on the clock." : "Post gigs and pay through protected on-chain escrow."}
        </p>

        <div className="flex flex-col gap-2.5">
          <Button className="w-full" size="lg" disabled title="Privy email sign-in is enabled when the app runs against a live cluster">
            <Mail size={16} className="mr-2" /> Continue with Email
          </Button>
          <Button variant="ghost" className="w-full border border-white/10" size="lg" disabled title="Privy Google sign-in is enabled when the app runs against a live cluster">
            Continue with Google
          </Button>
        </div>

        <div className="flex items-center gap-3 my-6 text-[10px] uppercase tracking-widest text-[#71717A]">
          <span className="h-px flex-1 bg-white/10" /> or use a demo wallet <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="flex flex-col gap-2 text-left">
          {!hydrated && <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />}
          {hydrated &&
            ordered.map((p) => (
              <button
                key={p.address}
                onClick={() => {
                  useChainStore.getState().setPersona(p.address, role);
                  router.push(dest);
                }}
                className="flex items-center gap-3 text-left rounded-xl border border-white/[0.08] px-3 py-2.5 hover:border-[#FF6FAF]/50 hover:bg-white/[0.03] transition-colors"
              >
                <Avatar address={p.address} size={32} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  <div className="text-[11px] text-[#A1A1AA] truncate">{p.description}</div>
                </div>
              </button>
            ))}
        </div>

        <p className="text-[11px] text-[#71717A] mt-5">No wallet needed: one is set up for you automatically.</p>

        <Link href="/role" className="inline-block mt-6 text-[11px] text-[#A1A1AA] hover:text-white border border-white/10 rounded-full px-3 py-1">
          ← Back to role select
        </Link>
      </GlassCard>
    </section>
  );
}

export default function SignInClient({ role }: { role: "freelancer" | "client" }) {
  if (isChainMode) return <ChainSignIn role={role} />;
  return <MockSignIn role={role} />;
}
