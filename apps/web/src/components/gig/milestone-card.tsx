"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Gavel, Receipt as ReceiptIcon } from "lucide-react";
import type { Gig, Milestone } from "@proove/types/types";
import { ZERO_HASH } from "@proove/types/types";
import { Button } from "@/components/ui/button";
import { Countdown, HashBadge, MilestoneStatusPill, TxButton, TxError, Modal } from "@/components/proove/primitives";
import { SpecView, ReportView } from "./spec-report";
import { DeliveryModal } from "./delivery-modal";
import { DisputeModal } from "./dispute-modal";
import { formatUsdc, formatDuration } from "@proove/types/format";
import { lockedRemaining } from "@proove/types/dispute";
import { useTransaction } from "@/lib/tx";
import { useChain } from "@/lib/mock/store";
import { cn } from "@/lib/utils";

export function nextRelease(m: Milestone): { label: string; at: number; start: number } | null {
  if (!m.terms || m.submittedAt === null) return null;
  if (m.status === "submitted") return { label: `${m.terms.partialBps / 100}% auto-release`, at: m.submittedAt + m.terms.partialTimeout, start: m.submittedAt };
  if (m.status === "partialReleased") return { label: "Full auto-release", at: m.submittedAt + m.terms.fullTimeout, start: m.submittedAt + m.terms.partialTimeout };
  return null;
}

export function MilestoneCard({ m, gig, me, now, defaultOpen }: { m: Milestone; gig: Gig; me: string | null; now: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [delivering, setDelivering] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reviewTerms, setReviewTerms] = useState(false);
  const tx = useTransaction();
  const grace = useChain((s) => s.protocol.noDeliveryGrace);
  const receivable = useChain((s) => (m.receivable ? s.receivables[m.receivable] : undefined));
  const isClient = me === gig.client;
  const isFreelancer = me === gig.freelancer;
  const next = nextRelease(m);
  const due = next && now >= next.at;
  const remaining = lockedRemaining(m);
  const refundable = m.status === "funded" && now > gig.deadline + grace;
  const clientCanDisputeUndelivered = isClient && m.status === "funded" && now > gig.deadline;
  const delivered = m.status === "submitted" || m.status === "partialReleased";

  return (
    <div className={cn("rounded-2xl border transition-colors", m.status === "disputed" ? "border-amber-400/30" : "border-white/10", open && "bg-white/[0.02]")}>
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="h-7 w-7 shrink-0 rounded-full border border-white/10 flex items-center justify-center text-xs text-[#A1A1AA]">{m.index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{m.title}</div>
          <div className="text-xs text-[#A1A1AA] mt-0.5 flex flex-wrap gap-x-3">
            <span className="tabular-nums">{formatUsdc(m.amount)}</span>
            {m.released > 0 && <span className="tabular-nums">{formatUsdc(m.released)} released</span>}
            {next && (
              <span>
                {next.label} <Countdown to={next.at} now={now} doneLabel="due now" />
              </span>
            )}
            {m.status === "pendingFunding" && m.specHash !== ZERO_HASH && <span className={m.termsAccepted ? "text-emerald-300" : "text-amber-300"}>{m.termsAccepted ? "terms accepted" : "terms not accepted yet"}</span>}
          </div>
        </div>
        <MilestoneStatusPill status={m.status} />
        <ChevronDown size={16} className={cn("text-[#71717A] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            <HashBadge label="spec" hash={m.specHash} doc={m.spec} />
            <HashBadge label="delivery" hash={m.deliveryHash} />
            <HashBadge label="report" hash={m.reportHash} doc={m.report} />
            {m.submittedSlot && <span className="text-[11px] text-[#71717A] self-center">submitted at slot {m.submittedSlot.toLocaleString()}</span>}
          </div>

          {m.terms && (
            <div className="text-[11px] text-[#71717A]">
              Terms locked at funding: {m.terms.partialBps / 100}% after {formatDuration(m.terms.partialTimeout)}, rest after {formatDuration(m.terms.fullTimeout)}, {m.terms.feeBps / 100}% protocol fee. Later DAO votes can&apos;t change these.
            </div>
          )}

          {m.spec ? (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#A1A1AA] mb-2">Acceptance criteria</div>
              <SpecView spec={m.spec} />
            </div>
          ) : (
            <p className="text-xs text-[#A1A1AA]">No spec committed for this milestone (v1-style). Disputes will have less to go on.</p>
          )}

          {m.report && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#A1A1AA] mb-2">Verification report</div>
              <ReportView report={m.report} spec={m.spec} files={m.files} />
            </div>
          )}
          {!m.report && m.files && m.files.length > 0 && (
            <div className="text-xs text-[#A1A1AA]">
              {m.files.length} file(s) delivered with no verification report{m.deliveryNote ? ` · “${m.deliveryNote}”` : ""}.
            </div>
          )}

          {receivable && receivable.status === "active" && (
            <div className="flex items-center gap-2 text-xs text-[#D4D4D8] rounded-xl border border-white/10 px-3 py-2">
              <ReceiptIcon size={13} className="text-[#FF6FAF]" /> Tokenized as a receivable. Releases pay its current holder.
              <Link href="/receivables" className="text-[#FF6FAF] ml-auto">
                View
              </Link>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {isFreelancer && m.status === "pendingFunding" && m.specHash !== ZERO_HASH && !m.termsAccepted && (
              <Button size="sm" onClick={() => setReviewTerms(true)}>
                Review &amp; accept terms
              </Button>
            )}
            {isClient && m.status === "pendingFunding" && (
              <Link href={`/gigs/${gig.address}/hire?milestone=${m.address}`}>
                <Button size="sm" disabled={!gig.freelancer || (m.specHash !== ZERO_HASH && !m.termsAccepted)}>
                  {!gig.freelancer ? "Assign a freelancer first" : m.specHash !== ZERO_HASH && !m.termsAccepted ? "Waiting on terms" : `Fund ${formatUsdc(m.amount)}`}
                </Button>
              </Link>
            )}
            {isFreelancer && m.status === "funded" && (
              <Button size="sm" onClick={() => setDelivering(true)}>
                Submit delivery
              </Button>
            )}
            {isClient && delivered && (
              <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("approveMilestone", { milestone: m.address }, `Approve ${m.title}`)}>
                Approve &amp; release {formatUsdc(remaining)}
              </TxButton>
            )}
            {(isClient || isFreelancer) && (delivered || clientCanDisputeUndelivered) && (
              <Button size="sm" variant="ghost" className="border border-white/10" onClick={() => setDisputing(true)}>
                <Gavel size={13} className="mr-1.5" /> Raise dispute
              </Button>
            )}
            {due && m.status === "submitted" && (
              <TxButton size="sm" variant="ghost" className="border border-white/10" phase={tx.phase} onClick={() => tx.run("partialTimeoutRelease", { milestone: m.address }, "Partial timeout release")}>
                Release {m.terms!.partialBps / 100}% now (anyone)
              </TxButton>
            )}
            {due && m.status === "partialReleased" && (
              <TxButton size="sm" variant="ghost" className="border border-white/10" phase={tx.phase} onClick={() => tx.run("fullTimeoutRelease", { milestone: m.address }, "Full timeout release")}>
                Release remainder (anyone)
              </TxButton>
            )}
            {isClient && refundable && (
              <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("refundAfterDeadline", { milestone: m.address }, `Refund ${m.title}`)}>
                Refund {formatUsdc(remaining)} (no delivery)
              </TxButton>
            )}
            {m.status === "disputed" && m.disputeCase && (
              <Link href={`/disputes/${m.disputeCase}`}>
                <Button size="sm" variant="ghost" className="border border-amber-400/30 text-amber-200">
                  <Gavel size={13} className="mr-1.5" /> Open case
                </Button>
              </Link>
            )}
            {m.status === "resolved" && m.disputeCase && (
              <Link href={`/disputes/${m.disputeCase}`} className="text-xs text-[#FF6FAF] self-center">
                Settled by ruling, view case →
              </Link>
            )}
          </div>
          <TxError error={tx.error} />
        </div>
      )}

      {delivering && <DeliveryModal milestone={m} open={delivering} onClose={() => setDelivering(false)} />}
      {disputing && <DisputeModal milestone={m} open={disputing} onClose={() => setDisputing(false)} asClient={isClient} />}
      <Modal open={reviewTerms} onClose={() => setReviewTerms(false)} title={`Accept terms: ${m.title}`} wide>
        {m.spec && <SpecView spec={m.spec} />}
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <HashBadge label="you are signing spec" hash={m.specHash} doc={m.spec} />
        </div>
        <p className="text-xs text-[#A1A1AA] mt-3">An arbitrator can only hold you to terms you signed. Signing records that you saw this exact hash; the client can fund only after you accept.</p>
        <TxButton
          className="w-full mt-4"
          size="lg"
          phase={tx.phase}
          onClick={async () => {
            const r = await tx.run("acceptTerms", { milestone: m.address, specHash: m.specHash }, `Accept terms: ${m.title}`);
            if (r.ok) setReviewTerms(false);
          }}
        >
          Sign &amp; accept these terms
        </TxButton>
        <TxError error={tx.error} />
      </Modal>
    </div>
  );
}
