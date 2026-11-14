"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Search } from "lucide-react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { Stars, Pill } from "@/components/ui/pill";
import { Avatar, Empty, PageHeader } from "@/components/proove/primitives";
import { useProfiles } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { BADGE_META } from "@proove/types/reputation";
import { formatStars, formatUsdc } from "@proove/types/format";
import type { BadgeType, PersonaProfile, UserProfile } from "@proove/types/types";
import { useReducedMotion } from "@/components/three";

function TiltCard({ children, href }: { children: React.ReactNode; href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 20 });
  return (
    <motion.a
      ref={ref}
      href={href}
      style={reduced ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className="block rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5 hover:border-[#FF6FAF]/40 transition-colors will-change-transform"
    >
      {children}
    </motion.a>
  );
}

type Row = UserProfile & { person?: PersonaProfile; badgeTypes: BadgeType[] };

function Talent() {
  const profiles = useProfiles();
  const people = useChain((s) => s.people);
  const badges = useChain((s) => s.badges);
  const [query, setQuery] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [minOnTime, setMinOnTime] = useState(0);
  const [maxLost, setMaxLost] = useState(100);
  const [badge, setBadge] = useState<BadgeType | "">("");

  const rows: Row[] = Object.values(profiles)
    .filter((p) => p.completedJobs > 0)
    .map((p) => ({ ...p, person: people[p.authority], badgeTypes: badges.filter((b) => b.profile === p.authority).map((b) => b.type) }))
    .sort((a, b) => b.reputationScore - a.reputationScore);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((p) => {
    const onTime = p.completedJobs ? (p.onTimeJobs / p.completedJobs) * 100 : 0;
    const lost = p.completedJobs ? (p.disputesLost / p.completedJobs) * 100 : 0;
    return (
      p.averageRating / 100 >= minRating &&
      onTime >= minOnTime &&
      lost <= maxLost &&
      (!badge || p.badgeTypes.includes(badge)) &&
      (q === "" || `${p.person?.name ?? ""} ${p.person?.headline ?? ""} ${(p.person?.skills ?? []).join(" ")} ${p.authority}`.toLowerCase().includes(q))
    );
  });

  const sel = "h-11 rounded-full bg-white/[0.04] border border-white/10 px-4 text-sm text-[#F5F5F5] outline-none min-w-0";

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader eyebrow="Talent" title="Browse talent" description="Every number is recomputed from on-chain reputation accounts: jobs, on-time rate, disputes and ratings. Nothing here is AI-generated." />

      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <div className="flex-1 flex items-center h-11 rounded-full bg-white/[0.04] border border-white/10 px-4 focus-within:border-[#FF6FAF]/50">
          <Search size={16} className="text-[#71717A] mr-2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, skill or wallet…" aria-label="Search talent" className="flex-1 bg-transparent text-sm text-[#F5F5F5] placeholder:text-[#71717A] outline-none" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex gap-2">
          <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className={sel} aria-label="Minimum rating">
            {[0, 4, 4.5, 4.8].map((r) => (
              <option key={r} value={r} className="bg-[#0A0A0B]">
                {r === 0 ? "Any rating" : `${r}★ & up`}
              </option>
            ))}
          </select>
          <select value={minOnTime} onChange={(e) => setMinOnTime(Number(e.target.value))} className={sel} aria-label="On-time rate">
            {[0, 80, 90, 95].map((r) => (
              <option key={r} value={r} className="bg-[#0A0A0B]">
                {r === 0 ? "Any on-time rate" : `${r}%+ on time`}
              </option>
            ))}
          </select>
          <select value={maxLost} onChange={(e) => setMaxLost(Number(e.target.value))} className={sel} aria-label="Disputes lost">
            {[100, 5, 0].map((r) => (
              <option key={r} value={r} className="bg-[#0A0A0B]">
                {r === 100 ? "Any dispute history" : r === 0 ? "No disputes lost" : `≤${r}% disputes lost`}
              </option>
            ))}
          </select>
          <select value={badge} onChange={(e) => setBadge(e.target.value as BadgeType | "")} className={sel} aria-label="Badge">
            <option value="" className="bg-[#0A0A0B]">
              Any badge
            </option>
            {Object.entries(BADGE_META).map(([k, v]) => (
              <option key={k} value={k} className="bg-[#0A0A0B]">
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <TiltCard key={p.authority} href={`/reputation/${p.authority}`}>
            <div className="flex items-center gap-3">
              <Avatar address={p.authority} size={44} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{p.person?.name ?? p.authority.slice(0, 8)}</div>
                <div className="flex items-center gap-2">
                  <Stars filled={Math.round(p.averageRating / 100)} />
                  <span className="text-[11px] text-[#A1A1AA]">{formatStars(p.averageRating)}</span>
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-lg font-bold text-white tabular-nums">{p.reputationScore}</div>
                <div className="text-[10px] text-[#71717A]">/ 1000</div>
              </div>
            </div>
            {p.person?.headline && <p className="text-xs text-[#D4D4D8] mt-3 line-clamp-2">{p.person.headline}</p>}
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <Mini label="Jobs" value={p.completedJobs} />
              <Mini label="On time" value={`${Math.round((p.onTimeJobs / Math.max(1, p.completedJobs)) * 100)}%`} />
              <Mini label="Disputes" value={`${p.disputesWon}W · ${p.disputesLost}L`} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {p.badgeTypes.slice(0, 4).map((b) => (
                <Pill key={b} tone="accent" className="text-[10px] px-2 py-0.5">
                  {BADGE_META[b].label}
                </Pill>
              ))}
            </div>
            <div className="text-[11px] text-[#71717A] mt-3">{formatUsdc(p.totalEarnings, { compact: true })} earned</div>
          </TiltCard>
        ))}
        {filtered.length === 0 && <Empty title={rows.length === 0 ? "No talent profiles yet" : "No talent matches your filters"} />}
      </div>
      <p className="text-[11px] text-[#71717A] mt-6">
        Looking for a specific wallet? Open <Link href="/reputation/" className="text-[#FF6FAF]">/reputation/&lt;wallet&gt;</Link> directly; it works for any address.
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-2">
      <div className="text-[13px] font-semibold text-white tabular-nums">{value}</div>
      <div className="text-[10px] text-[#71717A]">{label}</div>
    </div>
  );
}

export default function BrowseTalentPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav role="client" />
      <DataGate>
        <Talent />
      </DataGate>
    </section>
  );
}
