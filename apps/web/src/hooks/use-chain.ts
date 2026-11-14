"use client";

/**
 * Read hooks over the data layer. Pages only use these (never the store
 * directly), so swapping mock data for the indexer + RPC later is a change
 * inside this file and the store, not across every page.
 */
import { useEffect, useMemo, useState } from "react";
import type { Address, DisputeCase, Gig, Milestone, Role } from "@proove/types/types";
import { useChain, useChainStore, wallNow } from "@/lib/mock/store";
import { lockedRemaining } from "@proove/types/dispute";

export function useHydrated() {
  return useChainStore((s) => s.hydrated);
}

/** Current (time-travelled) clock, ticking once a second. */
export function useNow(intervalMs = 1000) {
  const offset = useChain((s) => s.clockOffset);
  const [wall, setWall] = useState(() => wallNow());
  useEffect(() => {
    const id = setInterval(() => setWall(wallNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return wall + offset;
}

export function useSession() {
  const persona = useChain((s) => s.persona);
  const role = useChain((s) => s.role);
  const personas = useChain((s) => s.personas);
  const people = useChain((s) => s.people);
  const balances = useChain((s) => s.balances);
  const arbitrators = useChain((s) => s.arbitrators);
  const me = personas.find((p) => p.address === persona) ?? null;
  return {
    address: persona,
    role: role as Role,
    persona: me,
    profile: persona ? people[persona] : undefined,
    balance: persona ? balances[persona] ?? 0 : 0,
    isArbitrator: !!(persona && arbitrators[persona]),
    isCouncil: !!me?.council,
  };
}

export function usePerson(address: Address | null | undefined) {
  const people = useChain((s) => s.people);
  if (!address) return undefined;
  return people[address];
}

export function useGigs(filter?: (g: Gig) => boolean) {
  const gigs = useChain((s) => s.gigs);
  return useMemo(() => {
    const list = Object.values(gigs).sort((a, b) => b.createdAt - a.createdAt);
    return filter ? list.filter(filter) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gigs]);
}

export function useGig(address: Address) {
  const gig = useChain((s) => s.gigs[address]);
  const all = useChain((s) => s.milestones);
  const milestones = useMemo(
    () => Object.values(all).filter((m) => m.gig === address).sort((a, b) => a.index - b.index),
    [all, address],
  );
  return { gig, milestones };
}

export function useAllMilestones() {
  return useChain((s) => s.milestones);
}

export interface GigWithMilestones extends Gig {
  milestones: Milestone[];
  locked: number;
}

/** Gigs where the wallet is the client or freelancer, with derived escrow info. */
export function useMyGigs(address: Address | null, role: Role) {
  const gigs = useChain((s) => s.gigs);
  const milestones = useChain((s) => s.milestones);
  return useMemo<GigWithMilestones[]>(() => {
    if (!address) return [];
    return Object.values(gigs)
      .filter((g) => (role === "client" ? g.client === address : g.freelancer === address || g.applicants.includes(address)))
      .map((g) => {
        const ms = Object.values(milestones).filter((m) => m.gig === g.address).sort((a, b) => a.index - b.index);
        const locked = ms
          .filter((m) => ["funded", "submitted", "partialReleased", "disputed"].includes(m.status))
          .reduce((sum, m) => sum + lockedRemaining(m), 0);
        return { ...g, milestones: ms, locked };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [gigs, milestones, address, role]);
}

export function useProfile(address: Address | null | undefined) {
  const profile = useChain((s) => (address ? s.profiles[address] : undefined));
  const allBadges = useChain((s) => s.badges);
  const allRatings = useChain((s) => s.ratings);
  const badges = useMemo(() => allBadges.filter((b) => b.profile === address), [allBadges, address]);
  const ratings = useMemo(() => allRatings.filter((r) => r.freelancer === address), [allRatings, address]);
  return { profile, badges, ratings };
}

export function useProfiles() {
  return useChain((s) => s.profiles);
}

export function useCase(address: Address) {
  const c = useChain((s) => s.cases[address]);
  const allEvidence = useChain((s) => s.evidence);
  const evidence = useMemo(
    () => (c ? allEvidence.filter((e) => e.case === address || e.case === c.previousRound) : []),
    [allEvidence, address, c],
  );
  const previous = useChain((s) => (c?.previousRound ? s.cases[c.previousRound] : undefined));
  const milestone = useChain((s) => (c ? s.milestones[c.milestone] : undefined));
  const gig = useChain((s) => (c ? s.gigs[c.gig] : undefined));
  return { c, evidence, previous, milestone, gig };
}

export function useCases(filter?: (c: DisputeCase) => boolean) {
  const cases = useChain((s) => s.cases);
  return useMemo(() => {
    const list = Object.values(cases).sort((a, b) => b.openedAt - a.openedAt);
    return filter ? list.filter(filter) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases]);
}

export function useEvents(filter?: (e: { actors: Address[]; gig?: Address; case?: Address }) => boolean) {
  const events = useChain((s) => s.events);
  return useMemo(() => (filter ? events.filter(filter) : events), [events, filter]);
}

export function useNotifications(address: Address | null) {
  const all = useChain((s) => s.notifications);
  return useMemo(() => (address ? all.filter((n) => n.to === address) : []), [all, address]);
}
