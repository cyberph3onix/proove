"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { produce } from "immer";
import type { Address, Role } from "@/lib/domain/types";
import { buildSeed, emptyState } from "./seed";
import { instructions, ProgramError, type InstructionArgs, type InstructionName } from "./instructions";
import { keeperTick } from "./keeper";
import { STATE_VERSION, type ChainState, type DevSettings } from "./state";

export const wallNow = () => Math.floor(Date.now() / 1000);

interface Store {
  chain: ChainState;
  hydrated: boolean;
  init: () => void;
  now: () => number;
  /** Preflight: run the instruction on a throwaway copy. Throws on failure. */
  simulate: <K extends InstructionName>(name: K, args: InstructionArgs<K>, actor?: Address) => void;
  exec: <K extends InstructionName>(name: K, args: InstructionArgs<K>, actor?: Address) => unknown;
  tick: () => void;
  setPersona: (address: Address | null, role?: Role) => void;
  setRole: (role: Role) => void;
  advanceClock: (seconds: number) => void;
  setDev: (patch: Partial<DevSettings>) => void;
  markNotificationsRead: (to: Address) => void;
  reset: () => void;
}

type Handler = (s: ChainState, ctx: { actor: Address; now: number }, args: unknown) => unknown;

function run(chain: ChainState, name: InstructionName, args: unknown, actor: Address, now: number) {
  let result: unknown;
  const next = produce(chain, (draft) => {
    result = (instructions[name] as unknown as Handler)(draft as ChainState, { actor, now }, args);
  });
  return { next, result };
}

export const useChainStore = create<Store>()(
  persist(
    (set, get) => ({
      // Deterministic placeholder so server and first client render match.
      chain: emptyState(0),
      hydrated: false,

      init: () => {
        if (get().hydrated) return;
        const fresh = get().chain.version !== STATE_VERSION || Object.keys(get().chain.gigs).length === 0;
        if (fresh) set({ chain: buildSeed(wallNow()) });
        set({ hydrated: true });
        get().tick();
      },

      now: () => wallNow() + get().chain.clockOffset,

      simulate: (name, args, actor) => {
        const { chain } = get();
        const who = actor ?? chain.persona;
        if (!who) throw new ProgramError("gig", "NoWallet", "Connect a wallet first");
        run(chain, name, args, who, get().now());
      },

      exec: (name, args, actor) => {
        const { chain } = get();
        const who = actor ?? chain.persona;
        if (!who) throw new ProgramError("gig", "NoWallet", "Connect a wallet first");
        const { next, result } = run(chain, name, args, who, get().now());
        set({ chain: next });
        // A state change can make keeper work due immediately (e.g. settle after both waive).
        setTimeout(() => get().tick(), 0);
        return result;
      },

      tick: () => {
        const { chain } = get();
        const now = get().now();
        let changed = false;
        const next = produce(chain, (draft) => {
          for (let i = 0; i < 10; i++) {
            if (!keeperTick(draft as ChainState, now)) break;
            changed = true;
            // AI phase posts one artifact per tick: stop so the UI can show each one land.
            if (Object.values(draft.cases).some((c) => c.status === "aiEvaluation")) break;
          }
        });
        if (changed) set({ chain: next });
      },

      setPersona: (address, role) =>
        set((st) => ({
          chain: {
            ...st.chain,
            persona: address,
            role: role ?? st.chain.personas.find((p) => p.address === address)?.defaultRole ?? st.chain.role,
          },
        })),

      setRole: (role) => set((st) => ({ chain: { ...st.chain, role } })),

      advanceClock: (seconds) => {
        set((st) => ({ chain: { ...st.chain, clockOffset: st.chain.clockOffset + seconds } }));
        get().tick();
      },

      setDev: (patch) => set((st) => ({ chain: { ...st.chain, dev: { ...st.chain.dev, ...patch } } })),

      markNotificationsRead: (to) =>
        set((st) => ({
          chain: produce(st.chain, (d) => {
            for (const n of d.notifications) if (n.to === to) n.read = true;
          }),
        })),

      reset: () => {
        const persona = get().chain.persona;
        const seeded = buildSeed(wallNow());
        set({ chain: { ...seeded, persona, role: get().chain.role } });
      },
    }),
    {
      name: "proove-mock-chain",
      version: STATE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ chain: st.chain }),
      skipHydration: true,
      // Older shapes are discarded and reseeded.
      migrate: () => ({ chain: emptyState(0) }) as unknown as Store,
    },
  ),
);

export function useChain<T>(selector: (s: ChainState) => T): T {
  return useChainStore((st) => selector(st.chain));
}
