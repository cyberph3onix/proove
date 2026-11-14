"use client";

import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

import { isConfidentialMintSupported, supportedMintList, UMBRA_NETWORK } from "@/lib/umbra";
import type { ConfidentialProgress } from "@/hooks/use-confidential-payments";

interface ConfidentialToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Mint the gig will be funded in. Gates availability. */
  mint: string;
  progress?: ConfidentialProgress | null;
  error?: string | null;
  disabled?: boolean;
}

/**
 * Confidential Mode switch for the gig-creation form.
 *
 * The copy here is deliberately specific about what stays public. A vague
 * "private payments" claim invites the reasonable assumption that the amounts
 * are hidden too, and they are not -- the vault has to stay auditable.
 */
export function ConfidentialToggle({
  enabled,
  onChange,
  mint,
  progress,
  error,
  disabled,
}: ConfidentialToggleProps) {
  const supported = isConfidentialMintSupported(mint);
  const locked = disabled || !supported;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start gap-4">
        <div className="mt-0.5 rounded-xl bg-white/[0.06] p-2">
          {enabled ? (
            <EyeOff size={18} className="text-[#14F195]" />
          ) : (
            <Eye size={18} className="text-[#A1A1AA]" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Confidential Mode</h3>
              <p className="mt-0.5 text-xs text-[#A1A1AA]">
                Powered by Umbra on Arcium
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Toggle Confidential Mode"
              disabled={locked}
              onClick={() => onChange(!enabled)}
              className={[
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                enabled ? "bg-[#14F195]" : "bg-white/15",
                locked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                  enabled ? "translate-x-[22px]" : "translate-x-0.5",
                ].join(" ")}
              />
            </button>
          </div>

          <dl className="mt-4 space-y-1.5 text-xs">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[#14F195]">Hidden</dt>
              <dd className="text-[#D4D4D8]">
                which wallet funds this gig, and where the freelancer&apos;s
                earnings go afterwards
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[#71717A]">Public</dt>
              <dd className="text-[#A1A1AA]">
                the escrow balance and milestone amounts &mdash; kept verifiable
                on purpose, so anyone can still check the funds exist
              </dd>
            </div>
          </dl>

          {!supported && (
            <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Not available for this token on {UMBRA_NETWORK}. Umbra supports{" "}
              {supportedMintList()
                .map((m) => m.symbol)
                .join(", ")}
              .
            </p>
          )}

          {enabled && supported && (
            <p className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-[#A1A1AA]">
              This gig will be created and funded by a one-time address. Keep
              this browser profile &mdash; it holds the only key that can
              approve milestones on it.
            </p>
          )}

          {progress && progress.step !== "done" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#D4D4D8]">
              <Loader2 size={14} className="animate-spin text-[#14F195]" />
              <span>{progress.label}</span>
              {progress.detail && (
                <span className="text-[#71717A]">&mdash; {progress.detail}</span>
              )}
            </div>
          )}

          {progress?.step === "done" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#14F195]">
              <ShieldCheck size={14} />
              <span>Confidential funding complete</span>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
