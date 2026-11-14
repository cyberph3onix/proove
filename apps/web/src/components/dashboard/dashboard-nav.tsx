"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { WalletWidget } from "./wallet-widget";
import { useSession } from "@/hooks/use-chain";

const FREELANCER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/gigs", label: "Browse Jobs" },
  { href: "/disputes", label: "Disputes" },
  { href: "/receivables", label: "Receivables" },
  { href: "/credentials", label: "Credentials" },
];

const CLIENT_LINKS = [
  { href: "/client", label: "Dashboard" },
  { href: "/talent", label: "Browse Talent" },
  { href: "/gigs/new", label: "Post a gig" },
  { href: "/transactions", label: "Transactions" },
  { href: "/services-taken", label: "Services Taken" },
  { href: "/disputes", label: "Disputes" },
];

export function DashboardNav({ role }: { role?: "freelancer" | "client" }) {
  const pathname = usePathname();
  const session = useSession();
  const r = role ?? session.role;
  const links = [...(r === "freelancer" ? FREELANCER_LINKS : CLIENT_LINKS), ...(session.isArbitrator ? [{ href: "/arbitrate", label: "Arbitrate" }] : [])];

  return (
    <div className="border-b border-white/[0.06]">
      <div className="w-full max-w-[1200px] mx-auto flex items-center justify-between gap-4 py-3 px-4 sm:px-6">
        <nav className="flex items-center gap-5 overflow-x-auto scrollbar-none -mx-1 px-1" aria-label="Dashboard">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "text-sm font-medium whitespace-nowrap transition-colors py-1.5",
                pathname === l.href ? "text-white" : "text-[#A1A1AA] hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden sm:block shrink-0">
          <WalletWidget />
        </div>
      </div>
    </div>
  );
}
