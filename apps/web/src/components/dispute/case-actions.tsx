"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Bps, DisputeCase, MilestoneSpec, SeatId } from "@/lib/domain/types";
import { ALLOWED_RULINGS } from "@/lib/domain/dispute";
import { Field, TxButton, TxError, inputClass, textareaClass } from "@/components/proove/primitives";
import { Button } from "@/components/ui/button";
import { formatBps, formatRuling, formatUsdc } from "@/lib/domain/format";
import { hashDocument, sha256Hex } from "@/lib/domain/hash";
import { useTransaction } from "@/lib/tx";
import { cn } from "@/lib/utils";
import { Section } from "./case-panels";

export function EvidenceForm({ c, mine }: { c: DisputeCase; mine: number }) {
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const tx = useTransaction();
  return (
    <Section title={`Submit evidence (${mine}/10)`}>
      <div className="flex flex-col gap-3">
        <Field label="Label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="e.g. Feedback email, revision log, screenshot" />
        </Field>
        <Field label="Content" hint="Hashed (SHA-256) and committed on-chain the moment you submit, so nobody can quietly edit it later. Files go to Arweave encrypted.">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={textareaClass} placeholder="What it shows, and which criterion it relates to…" />
        </Field>
        <TxButton
          phase={tx.phase}
          disabled={!label.trim() || !text.trim() || mine >= 10}
          onClick={async () => {
            const r = await tx.run("submitEvidence", { case: c.address, label, text, contentHash: sha256Hex(text) }, `Submit evidence: ${label}`);
            if (r.ok) {
              setLabel("");
              setText("");
            }
          }}
        >
          Commit evidence
        </TxButton>
        <TxError error={tx.error} />
      </div>
    </Section>
  );
}

export function VerdictEditor({ c, spec }: { c: DisputeCase; spec?: MilestoneSpec }) {
  const criteria = spec?.criteria ?? [{ id: "overall", text: "Overall delivery against the agreed scope", check: "manual" as const }];
  const [ruling, setRuling] = useState<Bps | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Partial<Record<SeatId, string>>>({});
  const tx = useTransaction();
  const posted = c.seats.filter((s) => s.status === "posted");
  const far = ruling !== null && c.recommendation !== null && Math.abs(ruling - c.recommendation) >= 2500;
  const complete = ruling !== null && criteria.every((cr) => reasons[cr.id]?.trim()) && (!far || posted.every((s) => answers[s.seat]?.trim()));
  const reasonDoc = { schema: "proove.verdict-reason.v1", case: c.address, round: c.round, ruling, reasons: criteria.map((cr) => ({ criterion: cr.id, text: reasons[cr.id] ?? "" })), seatAnswers: far ? answers : undefined };

  return (
    <Section title="Your verdict" aside={<span className="text-[11px] text-[#A1A1AA]">Fee share: {formatUsdc(Math.floor(c.feeAmount / Math.max(1, c.requiredArbitrators)))}</span>}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-xs text-[#A1A1AA] mb-2">Freelancer&apos;s share of {formatUsdc(c.frozenAmount)}</div>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Ruling">
            {ALLOWED_RULINGS.map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={ruling === r}
                onClick={() => setRuling(r)}
                className={cn("rounded-xl border py-3 text-sm font-semibold transition-colors", ruling === r ? "border-[#FF6FAF] bg-[#FF6FAF]/15 text-white" : "border-white/10 text-[#D4D4D8] hover:border-white/25")}
              >
                {formatBps(r)}
              </button>
            ))}
          </div>
          {ruling !== null && <div className="text-xs text-[#A1A1AA] mt-2">{formatRuling(ruling)}</div>}
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-[11px] uppercase tracking-widest text-[#A1A1AA]">A reason for every criterion</div>
          {criteria.map((cr) => (
            <Field key={cr.id} label={`${cr.id} · ${cr.text}`}>
              <textarea value={reasons[cr.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [cr.id]: e.target.value })} rows={2} className={textareaClass} />
            </Field>
          ))}
        </div>

        {far && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4">
            <div className="text-xs text-amber-200">Your ruling is {formatBps(Math.abs(ruling! - c.recommendation!))} from the AI recommendation, so you must answer each juror&apos;s main finding.</div>
            {posted.map((s) => (
              <Field key={s.seat} label={`Seat ${s.seat} proposed ${formatBps(s.evaluation!.ruling)}: “${s.evaluation!.reasoning.slice(0, 120)}…”`}>
                <textarea value={answers[s.seat] ?? ""} onChange={(e) => setAnswers({ ...answers, [s.seat]: e.target.value })} rows={2} className={textareaClass} />
              </Field>
            ))}
          </div>
        )}

        <TxButton
          size="lg"
          phase={tx.phase}
          disabled={!complete}
          onClick={() =>
            tx.run(
              "submitVerdict",
              { case: c.address, ruling: ruling!, reasons: criteria.map((cr) => ({ criterion: cr.id, text: reasons[cr.id] })), seatAnswers: far ? answers : undefined, reasonHash: hashDocument(reasonDoc) },
              "Sign verdict",
            )
          }
        >
          Sign verdict
        </TxButton>
        <TxError error={tx.error} />
        <RecuseButton c={c} />
      </div>
    </Section>
  );
}

function RecuseButton({ c }: { c: DisputeCase }) {
  const tx = useTransaction();
  return (
    <button onClick={() => tx.run("recuse", { case: c.address }, "Recuse")} className="self-start text-xs text-[#A1A1AA] hover:text-white">
      Conflicted? Recuse from this case
    </button>
  );
}

export function TieBreak({ c }: { c: DisputeCase }) {
  const tx = useTransaction();
  return (
    <Section title="Tie-break: pick one of the two signed rulings">
      <p className="text-sm text-[#A1A1AA] mb-4">The two arbitrators disagree. You can&apos;t invent a third ruling; choose the one the evidence supports better.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {c.verdicts.map((v) => (
          <TxButton key={v.arbitrator} phase={tx.phase} variant="ghost" className="border border-white/10 h-auto py-4 whitespace-normal" onClick={() => tx.run("breakTie", { case: c.address, pick: v.ruling }, "Break tie")}>
            {formatRuling(v.ruling)}
          </TxButton>
        ))}
      </div>
      <TxError error={tx.error} />
    </Section>
  );
}

export function AppealBox({ c, me }: { c: DisputeCase; me: string }) {
  const [grounds, setGrounds] = useState("");
  const tx = useTransaction();
  const router = useRouter();
  const waived = c.waivedBy.includes(me);
  return (
    <Section title="Verdict reached">
      <div className="text-lg font-bold text-white mb-1">{formatRuling(c.finalRuling!)}</div>
      <p className="text-sm text-[#A1A1AA] mb-4">
        {c.round === 1 ? "You can appeal once. Two fresh arbitrators decide round 2 using the same AI evaluations plus your written grounds; round 2 is final." : "Round 2 is final."}
      </p>
      {c.round === 1 && (
        <div className="flex flex-col gap-3">
          <Field label={`Grounds for appeal (bond ${formatUsdc(c.bond * 2)}, twice the original)`}>
            <textarea value={grounds} onChange={(e) => setGrounds(e.target.value)} rows={3} className={textareaClass} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <TxButton
              phase={tx.phase}
              disabled={!grounds.trim()}
              onClick={async () => {
                const r = await tx.run("appeal", { case: c.address, grounds }, "Appeal verdict");
                if (r.ok) router.push(`/disputes/${r.result as string}`);
              }}
            >
              Appeal
            </TxButton>
            <Button variant="ghost" className="border border-white/10" disabled={waived} onClick={() => tx.run("waiveAppeal", { case: c.address }, "Waive appeal")}>
              {waived ? "You waived; waiting on the other side" : "Accept & waive appeal"}
            </Button>
          </div>
          <p className="text-[11px] text-[#71717A]">If both parties waive, the case settles immediately instead of after 48 h.</p>
        </div>
      )}
      <TxError error={tx.error} />
    </Section>
  );
}

/** Instructions anyone (usually the keeper) can send. They never change an outcome. */
export function KeeperActions({ c, now }: { c: DisputeCase; now: number }) {
  const tx = useTransaction();
  const bothWaived = c.waivedBy.includes(c.client) && c.waivedBy.includes(c.freelancer);
  const settleable = c.status === "appealWindow" && (bothWaived || now >= c.deadlines.appeal);
  const reassignable = c.status === "arbitration" && now > c.deadlines.arbitration && c.reassignments < 2;
  const defaultable = !["settled", "defaulted", "appealed"].includes(c.status) && now >= c.deadlines.hard;
  if (!settleable && !reassignable && !defaultable) return null;
  return (
    <Section title="Permissionless actions">
      <p className="text-xs text-[#A1A1AA] mb-3">The keeper sends these every 5 minutes. Anyone can; none of them changes an outcome.</p>
      <div className="flex flex-wrap gap-2">
        {settleable && (
          <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("settleCase", { case: c.address }, "Settle case")}>
            Settle case
          </TxButton>
        )}
        {reassignable && (
          <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("reassignArbitrator", { case: c.address }, "Reassign arbitrator")}>
            Reassign to fallback
          </TxButton>
        )}
        {defaultable && (
          <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("applyDefaultOutcome", { case: c.address }, "Apply default outcome")}>
            Apply default outcome
          </TxButton>
        )}
      </div>
      <TxError error={tx.error} />
    </Section>
  );
}

export function HumanOnlyButton({ c }: { c: DisputeCase }) {
  const tx = useTransaction();
  return (
    <div>
      <TxButton size="sm" variant="ghost" className="border border-white/10" phase={tx.phase} onClick={() => tx.run("chooseHumanOnly", { case: c.address }, "Choose human-only arbitration")}>
        Switch to human-only (no AI)
      </TxButton>
      <TxError error={tx.error} />
    </div>
  );
}
