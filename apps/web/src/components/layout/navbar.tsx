"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Menu, X, Bell, Mail, Heart, Flame, ChevronDown, LogOut } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { NAV_CATEGORIES, type NavSubmenuItem } from "@/components/layout/nav-categories";
import { useHydrated, useNotifications, useNow, useSession } from "@/hooks/use-chain";
import { useChainStore } from "@/lib/mock/store";
import { Avatar } from "@/components/proove/primitives";
import { formatRelative, formatUsdc } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const TALENT_CATEGORIES = [
  { label: "Smart Contract Dev", description: "Solana, EVM & audits" },
  { label: "Frontend Engineering", description: "React, Next.js, wallets" },
  { label: "Protocol Design", description: "Tokenomics & architecture" },
  { label: "Security Audits", description: "Program & contract review" },
];

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [ref, onOutside]);
}

function DisabledIcon({ icon: Icon, label, title }: { icon: typeof Bell; label: string; title: string }) {
  return (
    <button aria-label={label} title={title} disabled className="text-[#D4D4D8] opacity-40 cursor-not-allowed">
      <Icon size={19} strokeWidth={2} />
    </button>
  );
}

function NotificationsButton({ placeholderWhenSignedOut = false }: { placeholderWhenSignedOut?: boolean }) {
  const { address } = useSession();
  const list = useNotifications(address);
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const unread = list.filter((n) => !n.read).length;
  if (!address) {
    return placeholderWhenSignedOut ? <DisabledIcon icon={Bell} label="Notifications" title="Sign in to see notifications" /> : null;
  }
  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setTimeout(() => useChainStore.getState().markNotificationsRead(address), 1500);
        }}
        className="relative text-[#D4D4D8] hover:text-white"
      >
        <Bell size={19} strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-[#FF6FAF] text-[10px] font-bold text-[#050505] flex items-center justify-center">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-[340px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#0A0A0B]/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 text-[10px] uppercase tracking-widest text-[#A1A1AA] border-b border-white/[0.06]">Notifications</div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.06]">
            {list.length === 0 && <div className="px-4 py-6 text-sm text-[#A1A1AA]">Nothing yet.</div>}
            {list.slice(0, 20).map((n) => (
              <Link key={n.id} href={n.href ?? "#"} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-white/[0.03]">
                <div className="flex gap-2">
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6FAF]" />}
                  <div>
                    <div className="text-[13px] text-[#E4E4E7] leading-snug">{n.text}</div>
                    <div className="text-[11px] text-[#71717A] mt-1">{formatRelative(n.at, now)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const { address, persona, balance, role, isArbitrator, isCouncil } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useOutside(ref, () => setOpen(false));

  if (!hydrated) return <div className={cn("h-8 w-28 rounded-full bg-white/[0.05]", className)} />;
  if (!address) {
    return (
      <Link href="/role" className={className}>
        <Button variant="secondary" size="sm" className="rounded-full font-semibold w-full">
          Sign in
        </Button>
      </Link>
    );
  }

  const links = [
    { href: role === "client" ? "/client" : "/dashboard", label: "Dashboard" },
    { href: `/reputation/${address}`, label: "Public profile" },
    { href: "/disputes", label: "Disputes" },
    ...(isArbitrator ? [{ href: "/arbitrate", label: "Arbitrate" }] : []),
    { href: "/receivables", label: "Receivables" },
    { href: "/credentials", label: "Credentials" },
    { href: "/governance", label: isCouncil ? "Governance (council)" : "Governance" },
    { href: "/wallet", label: "Wallet" },
  ];

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pl-1 pr-3 py-1 hover:border-[#FF6FAF]/40 transition-colors w-full"
        aria-expanded={open}
      >
        <Avatar address={address} size={26} />
        <span className="text-sm font-medium text-white truncate max-w-[120px]">{persona?.name.split(" ")[0]}</span>
        <span className="text-xs text-[#A1A1AA] tabular-nums">{formatUsdc(balance, { unit: false, compact: true })}</span>
        <ChevronDown size={14} className="text-[#A1A1AA] ml-auto" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-white/10 bg-[#0A0A0B]/95 backdrop-blur-xl p-2 shadow-2xl z-50">
          <div className="px-3 py-2">
            <div className="text-sm font-semibold text-white">{persona?.name}</div>
            <div className="text-[11px] text-[#A1A1AA]">{formatUsdc(balance)}</div>
          </div>
          <div className="px-2 pb-2">
            <div className="inline-flex rounded-full border border-white/10 p-0.5 text-[11px]">
              {(["client", "freelancer"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    useChainStore.getState().setRole(r);
                    router.push(r === "client" ? "/client" : "/dashboard");
                    setOpen(false);
                  }}
                  className={cn("rounded-full px-3 py-1 capitalize", role === r ? "bg-white text-[#050505]" : "text-[#A1A1AA]")}
                >
                  {r === "client" ? "Hiring" : "Working"}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm text-[#D4D4D8] hover:bg-white/5 hover:text-white">
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => {
                useChainStore.getState().setPersona(null);
                setOpen(false);
                router.push("/");
              }}
              className="w-full text-left rounded-xl px-3 py-2 text-sm text-[#A1A1AA] hover:bg-white/5 hover:text-white flex items-center gap-2"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavCategoryDropdown({ label, items }: { label: string; items: NavSubmenuItem[] }) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="text-[#D4D4D8] data-[state=open]:text-[#FF6FAF] whitespace-nowrap">{label}</NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="grid w-[440px] grid-cols-2 gap-1 p-2">
          {items.map((item) => (
            <li key={item.title}>
              <NavigationMenuLink href={`/gigs?category=${encodeURIComponent(label)}&q=${encodeURIComponent(item.title)}`} className="flex-col items-start gap-0.5">
                <span className="text-sm font-medium text-[#F5F5F5]">{item.title}</span>
                <span className="text-xs text-[#A1A1AA]">{item.subtitle}</span>
              </NavigationMenuLink>
            </li>
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

function SearchBox({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/gigs?q=${encodeURIComponent(q.trim())}`);
        onDone?.();
      }}
      className="w-full flex items-center h-11 rounded-full bg-white/[0.04] border border-white/10 focus-within:border-[#FF6FAF]/60 transition-colors duration-200"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        placeholder="What service are you looking for today?"
        aria-label="Search gigs"
        className="flex-1 min-w-0 bg-transparent px-5 text-sm text-[#F5F5F5] placeholder:text-[#71717A] outline-none"
      />
      <button aria-label="Search" className="h-11 w-11 flex items-center justify-center flex-shrink-0 rounded-full bg-[#FF6FAF] text-[#050505] hover:bg-[#FF8CBF]">
        <Search size={16} strokeWidth={2.5} />
      </button>
    </form>
  );
}

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-[#050505]/95 backdrop-blur-md border-b border-white/[0.06] font-[family-name:var(--font-roboto)]">
      <div className="w-full flex items-center justify-center">
        <div className="w-full max-w-[1440px] h-[72px] px-4 sm:px-6 md:px-[48px] flex items-center gap-6">
          <Link href="/" className="flex-shrink-0" aria-label="PROOVE home">
            <span className="text-white font-bold text-xl tracking-tight">
              PROOVE<span className="text-[#FF6FAF]">.</span>
            </span>
          </Link>

          <div className="hidden md:flex flex-1 max-w-[640px] items-center">
            <SearchBox />
          </div>

          <div className="hidden md:flex items-center gap-5 ml-auto">
            <NotificationsButton placeholderWhenSignedOut />
            <DisabledIcon icon={Mail} label="Messages" title="Messaging isn't implemented yet" />
            <DisabledIcon icon={Heart} label="Saved" title="Saved items aren't implemented yet" />
            <Link href="/transactions" className="text-[#D4D4D8] font-medium text-sm transition-colors duration-200 hover:text-[#FF6FAF]">
              Orders
            </Link>
            <div className="w-px h-6 bg-white/10" />
            <AccountMenu />
          </div>

          <div className="flex md:hidden items-center gap-4 ml-auto">
            <NotificationsButton />
            <button aria-label="Toggle menu" className="text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      <div className="hidden md:flex w-full items-center justify-center border-t border-white/[0.06]">
        <div className="w-full max-w-[1440px] px-6 md:px-[48px] overflow-x-auto scrollbar-none">
          <NavigationMenu className="max-w-none justify-start w-max min-w-full">
            <NavigationMenuList className="justify-start gap-1 h-12 flex-nowrap">
              <NavigationMenuItem>
                <NavigationMenuLink href="/gigs" className="flex items-center gap-1.5 text-sm font-medium text-[#F5F5F5] hover:bg-white/5">
                  <Flame size={14} className="text-[#FF6FAF]" />
                  Trending
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-[#D4D4D8] data-[state=open]:text-[#FF6FAF]">Find Talent</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[440px] grid-cols-2 gap-1 p-2">
                    {TALENT_CATEGORIES.map((item) => (
                      <li key={item.label}>
                        <NavigationMenuLink href="/talent" className="flex-col items-start gap-0.5">
                          <span className="text-sm font-medium text-[#F5F5F5]">{item.label}</span>
                          <span className="text-xs text-[#A1A1AA]">{item.description}</span>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {NAV_CATEGORIES.map((category) => (
                <NavCategoryDropdown key={category.label} label={category.label} items={category.items} />
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 flex flex-col p-4 gap-4 bg-[#050505] max-h-[calc(100vh-72px)] overflow-y-auto">
          <SearchBox onDone={() => setMobileMenuOpen(false)} />
          <AccountMenu className="w-full" />
          {[
            ["/gigs", "Browse jobs"],
            ["/talent", "Find talent"],
            ["/disputes", "Disputes"],
            ["/transactions", "Orders"],
            ["/governance", "Governance"],
            ["/receivables", "Receivables"],
          ].map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="text-[#D4D4D8] font-medium text-base hover:text-[#FF6FAF]">
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
