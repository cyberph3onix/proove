"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, PenLine, X, XCircle } from "lucide-react";
import { PHASE_LABEL, useToasts } from "@/lib/tx";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-16 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[360px] z-[70] flex flex-col gap-2 pointer-events-none" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            className={cn(
              "pointer-events-auto rounded-2xl border bg-[#0A0A0B]/95 backdrop-blur-xl px-4 py-3 shadow-2xl flex items-start gap-3",
              t.phase === "failed" ? "border-red-400/30" : t.phase === "confirmed" || t.phase === "finalized" ? "border-emerald-400/30" : "border-white/10",
            )}
          >
            <span className="mt-0.5">
              {t.phase === "signing" && <PenLine size={16} className="text-[#FF6FAF]" />}
              {t.phase === "sent" && <Loader2 size={16} className="text-[#FF6FAF] animate-spin" />}
              {(t.phase === "confirmed" || t.phase === "finalized") && <CheckCircle2 size={16} className="text-emerald-300" />}
              {t.phase === "failed" && <XCircle size={16} className="text-red-300" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{t.label}</div>
              <div className={cn("text-xs mt-0.5", t.phase === "failed" ? "text-red-300" : "text-[#A1A1AA]")}>{t.error ?? PHASE_LABEL[t.phase]}</div>
            </div>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-[#71717A] hover:text-white">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
