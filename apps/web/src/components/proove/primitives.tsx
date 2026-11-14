"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ShieldCheck, ShieldAlert, X, Loader2 } from "lucide-react";
import type { Address, CaseStatus, GigStatus, Hash, MilestoneStatus, TxPhase } from "@proove/types/types";
import { formatDuration, formatRelative, isZeroHash, shortAddress, shortHash } from "@proove/types/format";
import { hashDocument } from "@proove/types/hash";
import { CASE_STATUS_LABEL } from "@proove/types/dispute";
import { usePerson } from "@/hooks/use-chain";
import { Pill } from "@/components/ui/pill";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PHASE_LABEL } from "@/lib/tx";

// ─── Identity ───────────────────────────────────────────────────────────────

export function Avatar({ address, size = 36, className }: { address: Address | null | undefined; size?: number; className?: string }) {
  const person = usePerson(address);
  const hue = person?.hue ?? (address ? address.charCodeAt(0) * 7 + address.charCodeAt(1) * 3 : 0) % 360;
  const initials = person ? person.name.split(" ").map((w) => w[0]).slice(0, 2).join("") : address ? address.slice(0, 2) : "?";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.34),
        background: `radial-gradient(120% 120% at 30% 20%, hsl(${hue} 70% 62% / 0.55), hsl(${(hue + 40) % 360} 60% 22% / 0.6))`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function PersonName({ address, link = true, className }: { address: Address | null | undefined; link?: boolean; className?: string }) {
  const person = usePerson(address);
  const label = person?.name ?? shortAddress(address);
  if (!address || !link) return <span className={className}>{label}</span>;
  return (
    <Link href={`/reputation/${address}`} className={cn("hover:text-[#FF6FAF] transition-colors", className)}>
      {label}
    </Link>
  );
}

export function PersonChip({ address, sub }: { address: Address | null | undefined; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar address={address} />
      <div className="min-w-0">
        <PersonName address={address} className="text-sm font-semibold text-white block truncate" />
        <div className="text-xs text-[#A1A1AA] truncate">{sub ?? <AddressText address={address} />}</div>
      </div>
    </div>
  );
}

export function AddressText({ address, chars = 4, className }: { address: Address | null | undefined; chars?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <span className={className}>—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(address).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={cn("inline-flex items-center gap-1 font-mono text-[11px] text-[#A1A1AA] hover:text-white", className)}
      title={`${address} (click to copy)`}
    >
      {shortAddress(address, chars)}
      {copied ? <Check size={11} className="text-emerald-300" /> : <Copy size={10} className="opacity-50" />}
    </button>
  );
}

// ─── Hashes & provenance ────────────────────────────────────────────────────

/**
 * Shows an on-chain commitment and, when the stored document is available,
 * recomputes SHA-256 over its canonical JSON in the browser and compares.
 */
export function HashBadge({ label, hash, doc, className }: { label: string; hash: Hash | undefined; doc?: unknown; className?: string }) {
  const [state, setState] = useState<"idle" | "checking" | "match" | "mismatch">("idle");
  if (isZeroHash(hash)) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#71717A]", className)}>
        {label}: none
      </span>
    );
  }
  const verify = () => {
    if (!doc) return;
    setState("checking");
    setTimeout(() => setState(hashDocument(doc) === hash ? "match" : "mismatch"), 350);
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] text-[#D4D4D8]", className)}>
      <span className="text-[#A1A1AA]">{label}</span>
      <span className="font-mono" title={hash}>{shortHash(hash)}</span>
      {doc !== undefined && (
        <button type="button" onClick={verify} className="inline-flex items-center gap-1 text-[#FF6FAF] hover:underline disabled:opacity-60" disabled={state === "checking"}>
          {state === "idle" && "verify"}
          {state === "checking" && <Loader2 size={11} className="animate-spin" />}
          {state === "match" && (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <ShieldCheck size={12} /> matches
            </span>
          )}
          {state === "mismatch" && (
            <span className="inline-flex items-center gap-1 text-red-300">
              <ShieldAlert size={12} /> mismatch
            </span>
          )}
        </button>
      )}
    </span>
  );
}

export function SourceNote({ account, slot, label = "source" }: { account: Address; slot?: number; label?: string }) {
  return (
    <span className="text-[10px] text-[#71717A] font-mono" title={account}>
      {label}: {shortAddress(account, 4)}
      {slot !== undefined && ` @ slot ${slot.toLocaleString()}`}
    </span>
  );
}

// ─── Status ─────────────────────────────────────────────────────────────────

const GIG_TONE: Record<GigStatus, Parameters<typeof Pill>[0]["tone"]> = {
  draft: "default",
  published: "accent",
  assigned: "accent",
  inProgress: "accent",
  completed: "good",
  cancelled: "default",
  archived: "default",
  disputed: "warn",
};
const GIG_LABEL: Record<GigStatus, string> = {
  draft: "Draft",
  published: "Open",
  assigned: "Assigned",
  inProgress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
  disputed: "Disputed",
};
export function GigStatusPill({ status }: { status: GigStatus }) {
  return <Pill tone={GIG_TONE[status]}>{GIG_LABEL[status]}</Pill>;
}

export const MILESTONE_LABEL: Record<MilestoneStatus, string> = {
  pendingFunding: "Awaiting funding",
  funded: "Funded · in progress",
  submitted: "Delivered",
  partialReleased: "20% released",
  completed: "Paid",
  disputed: "Frozen · disputed",
  refunded: "Refunded",
  resolved: "Settled by ruling",
};
const MILESTONE_TONE: Record<MilestoneStatus, Parameters<typeof Pill>[0]["tone"]> = {
  pendingFunding: "default",
  funded: "accent",
  submitted: "accent",
  partialReleased: "accent",
  completed: "good",
  disputed: "warn",
  refunded: "default",
  resolved: "good",
};
export function MilestoneStatusPill({ status }: { status: MilestoneStatus }) {
  return <Pill tone={MILESTONE_TONE[status]}>{MILESTONE_LABEL[status]}</Pill>;
}

export function CaseStatusPill({ status }: { status: CaseStatus }) {
  const tone = status === "settled" || status === "defaulted" ? "good" : status === "appealed" ? "default" : "warn";
  return <Pill tone={tone}>{CASE_STATUS_LABEL[status]}</Pill>;
}

// ─── Time ───────────────────────────────────────────────────────────────────

export function Countdown({ to, now, className, doneLabel = "due now" }: { to: number; now: number; className?: string; doneLabel?: string }) {
  const left = to - now;
  return (
    <span className={cn("tabular-nums", left <= 0 ? "text-amber-300" : "text-[#D4D4D8]", className)} title={new Date(to * 1000).toLocaleString()}>
      {left <= 0 ? doneLabel : formatDuration(left)}
    </span>
  );
}

export function Relative({ at, now }: { at: number; now: number }) {
  return (
    <span className="tabular-nums" title={new Date(at * 1000).toLocaleString()}>
      {formatRelative(at, now)}
    </span>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF6FAF] mb-2">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-[28px] font-bold text-white tracking-tight">{title}</h1>
        {description && <p className="text-sm text-[#A1A1AA] mt-1.5 max-w-[640px] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.03] p-4", className)}>
      <div className="text-[10px] uppercase tracking-widest text-[#A1A1AA] mb-1.5">{label}</div>
      <div className="text-xl font-bold text-white tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-[#71717A] mt-1">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
      <div className="text-sm font-medium text-white">{title}</div>
      {children && <div className="text-xs text-[#A1A1AA] mt-1 max-w-[380px] mx-auto">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KeyValue({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[#A1A1AA]">{k}</dt>
          <dd className="text-white text-right tabular-nums min-w-0 truncate">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Forms ──────────────────────────────────────────────────────────────────

export const inputClass =
  "w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-4 text-sm text-white placeholder:text-[#71717A] outline-none focus:border-[#FF6FAF]/50 transition-colors";
export const textareaClass =
  "w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-[#71717A] outline-none focus:border-[#FF6FAF]/50 resize-none transition-colors";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#A1A1AA] mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <div className="text-[11px] text-[#71717A] mt-1.5">{hint}</div>}
    </div>
  );
}

// ─── Transactions ───────────────────────────────────────────────────────────

/** A button bound to a transaction's phase. */
export function TxButton({ phase, children, pendingLabel, ...props }: ButtonProps & { phase: TxPhase; pendingLabel?: string }) {
  const busy = phase === "signing" || phase === "sent";
  return (
    <Button {...props} disabled={props.disabled || busy}>
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {pendingLabel ?? PHASE_LABEL[phase]}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

export function TxError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-xs text-red-300 mt-2 leading-relaxed">{error}</p>;
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className={cn(
              "relative w-full max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0B0B0C] p-5 sm:p-6 outline-none",
              wide ? "sm:max-w-[720px]" : "sm:max-w-[480px]",
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="text-[#71717A] hover:text-white">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[] }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-white text-[#050505]" : "text-[#A1A1AA] hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
