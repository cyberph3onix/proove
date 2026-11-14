"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { Milestone } from "@proove/types/types";
import { Modal, Field, KeyValue, TxButton, TxError, textareaClass } from "@/components/proove/primitives";
import { arbitrationFee, disputeBond, lockedRemaining } from "@proove/types/dispute";
import { formatUsdc } from "@proove/types/format";
import { useChain } from "@/lib/mock/store";
import { useTransaction } from "@/lib/tx";

export function DisputeModal({ milestone, open, onClose, asClient }: { milestone: Milestone; open: boolean; onClose: () => void; asClient: boolean }) {
  const cfg = useChain((s) => s.disputeConfig);
  const [reason, setReason] = useState("");
  const [humanOnly, setHumanOnly] = useState(false);
  const [ack, setAck] = useState(false);
  const tx = useTransaction();
  const router = useRouter();
  const frozen = lockedRemaining(milestone);
  const bond = disputeBond(frozen, cfg);
  const fee = arbitrationFee(frozen, cfg, humanOnly);
  const two = humanOnly || frozen >= cfg.highValueThreshold;

  async function submit() {
    const r = await tx.run("raiseDispute", { milestone: milestone.address, reason, humanOnly }, `Raise dispute: ${milestone.title}`);
    if (r.ok) {
      onClose();
      router.push(`/disputes/${r.result as string}`);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Raise a dispute">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[#A1A1AA]">
          {asClient
            ? "Use this if the delivery doesn't meet the agreed criteria. Funds already released stay released."
            : "Use this if the client is withholding approval of work that meets the criteria."}
        </p>
        <div className="rounded-2xl border border-white/10 p-4">
          <KeyValue
            rows={[
              ["Frozen until verdict", formatUsdc(frozen)],
              ["Your bond (5%, min 2 USDC)", formatUsdc(bond)],
              ["Bond returned if you get", "≥ 50% of the ruling"],
              ["Arbitrators", two ? "two (both must sign)" : "one"],
              ["Arbitration fee", `${formatUsdc(fee)} (${humanOnly ? "5% human-only" : "3%"})`],
              ["Hard deadline", "21 days, then v1 terms apply"],
            ]}
          />
        </div>
        <Field label="What's wrong? Map it to the acceptance criteria if you can.">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className={textareaClass} placeholder="e.g. c2: the dark variant is missing from the delivered files…" />
        </Field>
        <label className="flex items-start gap-3 rounded-2xl border border-white/10 p-4 cursor-pointer">
          <input type="checkbox" checked={humanOnly} onChange={(e) => setHumanOnly(e.target.checked)} className="mt-1 accent-[#FF6FAF]" />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-white">
              <ShieldCheck size={14} className="text-[#FF6FAF]" /> Human-only arbitration
            </span>
            <span className="text-xs text-[#A1A1AA] block mt-0.5">Nothing is sent to Gemini. Two arbitrators, a 96 h window and a 5% fee. Good for confidential work. The other party can also choose this within 24 h.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4 cursor-pointer">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-[#FF6FAF]" />
          <span className="text-xs text-amber-200/90">
            <AlertTriangle size={13} className="inline mr-1 -mt-0.5" />
            I understand the deliverable&apos;s decryption key will be shared with the assigned arbitrators{humanOnly ? "" : " and the AI service (with request storage off)"}. Leaks can&apos;t be technically prevented.
          </span>
        </label>
        <TxButton phase={tx.phase} size="lg" className="w-full" disabled={!reason.trim() || !ack} onClick={submit}>
          Freeze funds &amp; open case ({formatUsdc(bond)} bond)
        </TxButton>
        <TxError error={tx.error} />
      </div>
    </Modal>
  );
}
