"use client";

import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { LogOut } from "lucide-react";
import { useChainStore } from "@/lib/mock/store";

/** Sign-out button for chain mode: clears the Privy session, then the persona. */
export function ChainSignOut({ onDone }: { onDone?: () => void }) {
  const { logout } = usePrivy();
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await logout();
        useChainStore.getState().setPersona(null);
        onDone?.();
        router.push("/");
      }}
      className="w-full text-left rounded-xl px-3 py-2 text-sm text-[#A1A1AA] hover:bg-white/5 hover:text-white flex items-center gap-2"
    >
      <LogOut size={14} /> Sign out
    </button>
  );
}
