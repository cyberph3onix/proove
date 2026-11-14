"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Empty, PageHeader, PersonName, Relative } from "@/components/proove/primitives";
import { useGigs, useNow, useProfiles } from "@/hooks/use-chain";
import { NAV_CATEGORIES } from "@/components/layout/nav-categories";
import { formatUsdc, formatStars, USDC } from "@proove/types/format";

const MIN_BUDGETS = [0, 100, 500, 1000];
const CATEGORIES = ["All", "AI Services", "Programming & Tech", ...NAV_CATEGORIES.map((c) => c.label).filter((l) => !["AI Services", "Programming & Tech"].includes(l))];

/**
 * Mock mode filters in memory. Chain mode calls the indexer's Postgres
 * full-text search (GET /v1/gigs?q=&category=&min_budget=&skill=).
 */
function Jobs() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "All");
  const [minBudget, setMinBudget] = useState(0);
  const [skill, setSkill] = useState("");
  const now = useNow(60_000);
  const gigs = useGigs();
  const profiles = useProfiles();
  const open = gigs.filter((g) => g.status === "published");
  const skills = useMemo(() => [...new Set(open.flatMap((g) => g.skills))].sort(), [open]);

  const q = query.trim().toLowerCase();
  const filtered = open.filter(
    (j) =>
      j.budget >= minBudget * USDC &&
      (category === "All" || j.category === category) &&
      (!skill || j.skills.includes(skill)) &&
      (q === "" || `${j.title} ${j.description} ${j.skills.join(" ")} ${j.category}`.toLowerCase().includes(q)),
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader eyebrow="Marketplace" title="Browse jobs" description="Every job here pays through escrow. Milestones and criteria are agreed before any money is locked." />

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex-1 flex items-center h-11 rounded-full bg-white/[0.04] border border-white/10 px-4 focus-within:border-[#FF6FAF]/50">
          <Search size={16} className="text-[#71717A] mr-2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search jobs, skills…" aria-label="Search jobs" className="flex-1 bg-transparent text-sm text-[#F5F5F5] placeholder:text-[#71717A] outline-none" />
        </div>
        <div className="grid grid-cols-3 md:flex gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="h-11 rounded-full bg-white/[0.04] border border-white/10 px-4 text-sm text-[#F5F5F5] outline-none min-w-0">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-[#0A0A0B]">
                {c === "All" ? "All categories" : c}
              </option>
            ))}
          </select>
          <select value={minBudget} onChange={(e) => setMinBudget(Number(e.target.value))} aria-label="Minimum budget" className="h-11 rounded-full bg-white/[0.04] border border-white/10 px-4 text-sm text-[#F5F5F5] outline-none min-w-0">
            {MIN_BUDGETS.map((b) => (
              <option key={b} value={b} className="bg-[#0A0A0B]">
                {b === 0 ? "Any budget" : `${b}+ USDC`}
              </option>
            ))}
          </select>
          <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill" className="h-11 rounded-full bg-white/[0.04] border border-white/10 px-4 text-sm text-[#F5F5F5] outline-none min-w-0">
            <option value="" className="bg-[#0A0A0B]">
              Any skill
            </option>
            {skills.map((s) => (
              <option key={s} value={s} className="bg-[#0A0A0B]">
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="text-xs text-[#71717A] mb-4">
        {filtered.length} of {open.length} open jobs
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((j) => {
          const cp = profiles[j.client];
          return (
            <Link key={j.address} href={`/gigs/${j.address}`} className="group rounded-2xl border border-white/10 bg-white/[0.02] hover:border-[#FF6FAF]/40 hover:bg-white/[0.03] transition-colors p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Pill>{j.category}</Pill>
                  {j.skills.slice(0, 3).map((s) => (
                    <span key={s} className="text-[11px] text-[#A1A1AA]">
                      #{s}
                    </span>
                  ))}
                </div>
                <div className="text-base font-semibold text-white group-hover:text-[#FF6FAF] transition-colors">{j.title}</div>
                <p className="text-sm text-[#A1A1AA] mt-1 line-clamp-2">{j.description}</p>
                <div className="text-xs text-[#71717A] mt-2">
                  <PersonName address={j.client} link={false} className="text-[#D4D4D8]" />
                  {cp && cp.ratingCount > 0 && ` · ${formatStars(cp.averageRating)}★ as client`} · posted <Relative at={j.createdAt} now={now} /> · {j.applicants.length} applicant{j.applicants.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                <div className="text-lg font-bold text-white tabular-nums">{formatUsdc(j.budget)}</div>
                <Button size="sm" variant="ghost" className="border border-white/10">
                  View &amp; apply
                </Button>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && <Empty title={open.length === 0 ? "No open jobs right now" : "No jobs match your filters"} />}
      </div>
    </div>
  );
}

export function BrowseJobs() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav role="freelancer" />
      <DataGate>
        <Jobs />
      </DataGate>
    </section>
  );
}
