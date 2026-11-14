"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ParticleBackdrop } from "@/components/proove/particle-backdrop";
import { useChainStore } from "@/lib/mock/store";
import { storeRole } from "@/lib/chain/mode";

export function ChainSignIn({ role }: { role: "freelancer" | "client" }) {
  const isFreelancer = role === "freelancer";
  const dest = isFreelancer ? "/dashboard" : "/client";
  const router = useRouter();
  const { ready, authenticated, login, user } = usePrivy();
  const { publicKey } = useWallet();

  useEffect(() => {
    if (!authenticated || !publicKey) return;
    storeRole(role);
    useChainStore.getState().setPersona(publicKey.toBase58(), role);
    router.replace(dest);
  }, [authenticated, publicKey, role, router, dest]);

  return (
    <section className="relative min-h-[calc(100vh-72px)] flex flex-col items-center justify-center px-4 sm:px-6 py-24 overflow-hidden">
      <ParticleBackdrop />
      <GlassCard className="relative w-full max-w-[420px] text-center py-8 bg-[#0A0A0B]/80">
        <Pill tone="accent" className="mx-auto mb-5">
          On-chain
        </Pill>
        <h1 className="text-xl font-semibold text-white mb-1">Sign in to start {isFreelancer ? "working" : "hiring"}</h1>
        <p className="text-sm text-[#A1A1AA] mb-6">
          {isFreelancer ? "Accept clear terms and get paid on approval or on the clock." : "Post gigs and pay through protected on-chain escrow."}
        </p>

        {authenticated && !publicKey ? (
          <div className="h-24 flex items-center justify-center text-sm text-[#A1A1AA]">Setting up your wallet…</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <Button className="w-full" size="lg" disabled={!ready} onClick={() => login()}>
              <Mail size={16} className="mr-2" /> Continue with Email
            </Button>
            <Button
              variant="ghost"
              className="w-full border border-white/10"
              size="lg"
              disabled={!ready}
              onClick={() => login({ loginMethods: ["google"] })}
            >
              Continue with Google
            </Button>
          </div>
        )}

        {authenticated && user?.email?.address && (
          <p className="text-[11px] text-[#71717A] mt-4">Signed in as {user.email.address}</p>
        )}

        <p className="text-[11px] text-[#71717A] mt-5">Your wallet is created and secured by Privy.</p>

        <Link href="/role" className="inline-block mt-6 text-[11px] text-[#A1A1AA] hover:text-white border border-white/10 rounded-full px-3 py-1">
          ← Back to role select
        </Link>
      </GlassCard>
    </section>
  );
}
