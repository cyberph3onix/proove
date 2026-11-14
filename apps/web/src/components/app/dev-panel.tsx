"use client";

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { useChain, useChainStore } from "@/lib/mock/store";
import { DAY, HOUR, formatDateTime, formatUsdc, USDC } from "@/lib/domain/format";
import { useHydrated, useNow } from "@/hooks/use-chain";
import type { AiFailureMode } from "@/lib/mock/state";
import { cn } from "@/lib/utils";

const JUMPS = [
  { label: "+1 h", s: HOUR },
  { label: "+12 h", s: 12 * HOUR },
  { label: "+1 d", s: DAY },
  { label: "+3 d", s: 3 * DAY },
  { label: "+7 d", s: 7 * DAY },
];

const AI_MODES: { value: AiFailureMode; label: string }[] = [
  { value: "none", label: "All seats OK" },
  { value: "retries", label: "Seat B retries, then backup" },
  { value: "oneSeat", label: "Seat C fails" },
  { value: "twoSeats", label: "Seats B+C fail (AI failed)" },
  { value: "split", label: "Seats split 0 / 50 / 100" },
];

/**
 * Mock-mode control panel: switch persona, time-travel the chain clock (so
 * 72 h / 7 d timeouts and dispute windows can be watched), inject failures,
 * reset the dataset. Removed when the app runs against a real cluster.
 */
export function DevPanel() {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const personas = useChain((s) => s.personas);
  const persona = useChain((s) => s.persona);
  const dev = useChain((s) => s.dev);
  const offset = useChain((s) => s.clockOffset);
  const store = useChainStore.getState;
  const now = useNow();

  if (!hydrated) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-[65] h-10 rounded-full border border-white/10 bg-[#0A0A0B]/90 backdrop-blur-xl px-3 flex items-center gap-2 text-xs text-[#D4D4D8] hover:border-[#FF6FAF]/50 transition-colors"
        aria-expanded={open}
        aria-label="Open demo controls"
      >
        <FlaskConical size={14} className="text-[#FF6FAF]" />
        <span className="hidden sm:inline">Demo</span>
        {offset !== 0 && <span className="text-[#FF6FAF]">+{Math.round(offset / HOUR)}h</span>}
      </button>

      {open && (
        <div className="fixed bottom-16 left-4 right-4 sm:right-auto sm:w-[340px] z-[66] max-h-[75vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0A0A0B]/95 backdrop-blur-xl p-4 shadow-2xl text-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Demo controls · mock devnet</div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-[#71717A] hover:text-white">
              <X size={14} />
            </button>
          </div>

          <Label>Signed in as</Label>
          <div className="grid grid-cols-1 gap-1 mb-4">
            {personas.map((p) => (
              <button
                key={p.address}
                onClick={() => store().setPersona(p.address)}
                className={cn(
                  "text-left rounded-xl px-3 py-2 border transition-colors",
                  p.address === persona ? "border-[#FF6FAF]/50 bg-[#FF6FAF]/10" : "border-white/[0.06] hover:bg-white/5",
                )}
              >
                <div className="text-white text-[13px] font-medium">{p.name}</div>
                <div className="text-[11px] text-[#A1A1AA]">{p.description}</div>
              </button>
            ))}
          </div>

          <Label>Chain clock · {formatDateTime(now)}</Label>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {JUMPS.map((j) => (
              <button key={j.label} onClick={() => store().advanceClock(j.s)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#D4D4D8] hover:border-[#FF6FAF]/50 hover:text-white">
                {j.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#71717A] mb-4">The keeper runs after every jump and sends whatever is due: releases, AI phase, reassignments, settlement.</p>

          <Label>AI juror behaviour (next AI phase)</Label>
          <select
            value={dev.aiFailure}
            onChange={(e) => store().setDev({ aiFailure: e.target.value as AiFailureMode })}
            className="w-full h-9 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-xs text-white mb-4"
          >
            {AI_MODES.map((m) => (
              <option key={m.value} value={m.value} className="bg-[#0A0A0B]">
                {m.label}
              </option>
            ))}
          </select>

          <Label>Delivery quality (mock verifier)</Label>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={dev.deliveryQuality}
            onChange={(e) => store().setDev({ deliveryQuality: Number(e.target.value) })}
            className="w-full accent-[#FF6FAF] mb-4"
            aria-label="Delivery quality"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => store().setDev({ failNextTx: !dev.failNextTx })}
              className={cn("rounded-full border px-3 py-1 text-xs", dev.failNextTx ? "border-red-400/40 text-red-300" : "border-white/10 text-[#D4D4D8]")}
            >
              {dev.failNextTx ? "Next tx will fail" : "Fail next tx"}
            </button>
            {persona && (
              <button onClick={() => store().exec("airdrop", { amount: 1000 * USDC })} className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#D4D4D8]">
                Airdrop {formatUsdc(1000 * USDC, { unit: false })} USDC
              </button>
            )}
            <button onClick={() => store().reset()} className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#D4D4D8]">
              Reset data
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-[#A1A1AA] mb-1.5">{children}</div>;
}
