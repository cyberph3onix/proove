"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, RotateCcw, XCircle, FileText, Eye } from "lucide-react";
import type { AiSeat, DisputeCase, EvidenceItem, MilestoneSpec, NeutralBrief, Verdict } from "@proove/types/types";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { HashBadge, PersonName, Relative } from "@/components/proove/primitives";
import { formatRuling, formatDateTime } from "@proove/types/format";
import { cn } from "@/lib/utils";

const OUTCOME_LABEL: Record<string, string> = {
  ok: "ok",
  timeout: "timeout (120 s)",
  rateLimited: "429 rate limited",
  serverError: "5xx",
  schemaInvalid: "schema invalid",
  refusal: "safety refusal",
};

export function EvidencePanel({ c, evidence, now }: { c: DisputeCase; evidence: EvidenceItem[]; now: number }) {
  const sides: { role: EvidenceItem["role"]; who: string | undefined; label: string }[] = [
    { role: "client", who: c.client, label: "Client" },
    { role: "freelancer", who: c.freelancer, label: "Freelancer" },
    ...(c.holder ? [{ role: "holder" as const, who: c.holder, label: "Receivable holder" }] : []),
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sides.map((s) => {
        const items = evidence.filter((e) => e.role === s.role);
        return (
          <div key={s.role}>
            <div className="text-[11px] uppercase tracking-widest text-[#A1A1AA] mb-2">
              {s.label} · <PersonName address={s.who} className="normal-case tracking-normal" /> · {items.length}/10
            </div>
            <ul className="flex flex-col gap-2">
              {items.map((e) => (
                <li key={e.address} className="rounded-xl border border-white/[0.08] p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <FileText size={13} className="text-[#FF6FAF]" /> {e.label}
                    {e.case !== c.address && <Pill className="text-[9px] px-1.5 py-0">round 1</Pill>}
                  </div>
                  <p className="text-sm text-[#D4D4D8] mt-1.5 leading-relaxed">{e.text}</p>
                  <div className="text-[10px] font-mono text-[#71717A] mt-2">
                    sha256 {e.contentHash.slice(0, 12)}… · {e.uri.slice(0, 18)}… · <Relative at={e.submittedAt} now={now} />
                  </div>
                </li>
              ))}
              {items.length === 0 && <li className="text-xs text-[#71717A] rounded-xl border border-dashed border-white/10 p-3">No evidence submitted.</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function BriefPanel({ brief, status, hash }: { brief?: NeutralBrief; status: DisputeCase["briefStatus"]; hash: string }) {
  if (status === "skipped") return <p className="text-sm text-[#A1A1AA]">Human-only arbitration: no brief is generated and nothing is sent to Gemini.</p>;
  if (status === "failed") return <p className="text-sm text-amber-300">The brief failed after retries and the backup model. Seats and arbitrators proceed without it.</p>;
  if (!brief) return <p className="text-sm text-[#A1A1AA]">The neutral brief is written when the evidence window closes, before any AI seat runs.</p>;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <HashBadge label="brief_hash" hash={hash} doc={brief} />
        <Pill>recommends nothing · no ruling field</Pill>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-[#A1A1AA] mb-1.5">Criteria in plain words</div>
        <ul className="flex flex-col gap-1">
          {brief.criteria.map((c) => (
            <li key={c.id} className="text-[#D4D4D8]">
              <span className="font-mono text-[11px] text-[#71717A] mr-2">{c.id}</span>
              {c.plain}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-[#A1A1AA] mb-1.5">Each side&apos;s claims</div>
        <ul className="flex flex-col gap-1.5">
          {brief.claims.map((cl, i) => (
            <li key={i} className="text-[#D4D4D8]">
              <Pill className="mr-2 text-[10px] px-2 py-0" tone={cl.party === "client" ? "default" : "accent"}>
                {cl.party}
              </Pill>
              {cl.text} <span className="text-[11px] text-[#71717A]">→ {cl.criteria.join(", ")}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-[#A1A1AA] mb-1.5">Where the sides contradict each other</div>
        <ul className="list-disc pl-5 text-[#D4D4D8] flex flex-col gap-1">
          {brief.contradictions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-[#A1A1AA] mb-1.5">Gaps in the evidence</div>
        <ul className="list-disc pl-5 text-[#D4D4D8]">
          {brief.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
      <div className="text-[10px] text-[#71717A]">
        {brief.model} · prompt {brief.prompt_version.slice(0, 8)}… · {brief.input_hashes.length} input hashes. Either party can object to the brief by submitting an evidence item.
      </div>
    </div>
  );
}

const FINDING_ICON = { pass: CheckCircle2, fail: XCircle, unclear: CircleHelp } as const;
const FINDING_CLS = { pass: "text-emerald-300", fail: "text-red-300", unclear: "text-amber-300" } as const;

export function SeatCard({ seat, spec, incomplete }: { seat: AiSeat; spec?: MilestoneSpec; incomplete?: boolean }) {
  const [open, setOpen] = useState(false);
  const ev = seat.evaluation;
  return (
    <div className={cn("rounded-2xl border p-4", seat.status === "posted" ? "border-[#FF6FAF]/30" : seat.status === "failed" ? "border-red-400/20" : "border-white/10")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">Seat {seat.seat}</div>
          <div className="text-[11px] text-[#A1A1AA]">{seat.label}</div>
          <div className="text-[10px] font-mono text-[#71717A] mt-0.5">{ev?.model ?? seat.model}</div>
        </div>
        <Pill tone={seat.status === "posted" ? "accent" : seat.status === "failed" ? "bad" : "default"}>{seat.status === "posted" ? "posted" : seat.status === "failed" ? "failed · abstains" : seat.status === "running" ? "evaluating…" : "waiting"}</Pill>
      </div>

      {ev && (
        <>
          <div className="mt-3 text-base font-bold text-white">{formatRuling(ev.ruling)}</div>
          <div className="text-[11px] text-[#A1A1AA]">confidence {Math.round(ev.confidence * 100)}%{incomplete ? " · incomplete AI phase" : ""}</div>
          <p className="text-sm text-[#D4D4D8] mt-2 leading-relaxed">{ev.reasoning}</p>
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-[#FF6FAF] mt-2">
            {open ? "Hide" : "Show"} findings per criterion
          </button>
          {open && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {ev.findings.map((f) => {
                const Icon = FINDING_ICON[f.verdict];
                return (
                  <li key={f.criterion} className="flex gap-2 text-xs">
                    <Icon size={13} className={cn("mt-0.5 shrink-0", FINDING_CLS[f.verdict])} />
                    <span className="text-[#D4D4D8]">
                      <span className="font-mono text-[#71717A] mr-1">{f.criterion}</span>
                      {spec?.criteria.find((c) => c.id === f.criterion)?.text}: {f.note}
                      {f.evidence.length > 0 && <span className="text-[#71717A]"> [{f.evidence.map((e) => e.file).join(", ")}]</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3">
            <HashBadge label="evaluation" hash={seat.hash} doc={ev} />
          </div>
        </>
      )}

      {seat.attempts.length > 0 && (
        <div className="mt-3 rounded-xl bg-white/[0.02] border border-white/[0.06] p-2.5">
          <div className="text-[10px] uppercase tracking-widest text-[#71717A] mb-1 flex items-center gap-1">
            <RotateCcw size={10} /> attempts (idempotency key: case · seat · n)
          </div>
          <ol className="flex flex-col gap-0.5">
            {seat.attempts.map((a) => (
              <li key={a.n} className="text-[11px] font-mono flex justify-between gap-2">
                <span className={a.outcome === "ok" ? "text-emerald-300" : "text-[#A1A1AA]"}>
                  #{a.n} {a.backup ? "backup " : ""}
                  {a.model}
                </span>
                <span className={a.outcome === "ok" ? "text-emerald-300" : "text-red-300/80"}>{OUTCOME_LABEL[a.outcome]}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function AiPanel({ c, spec, isArbitrator }: { c: DisputeCase; spec?: MilestoneSpec; isArbitrator: boolean }) {
  const [revealed, setRevealed] = useState(!isArbitrator);
  if (c.aiPhase === "skipped" && c.humanOnlyReason === "chosen") {
    return <p className="text-sm text-[#A1A1AA]">A party chose human-only arbitration. No deliverable or evidence was sent to Gemini.</p>;
  }
  if (!revealed) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
        <Eye size={18} className="mx-auto text-[#FF6FAF] mb-2" />
        <div className="text-sm text-white">AI evaluations are hidden until you&apos;ve read the evidence</div>
        <p className="text-xs text-[#A1A1AA] mt-1 max-w-[420px] mx-auto">This keeps your first read independent. You&apos;ll need to answer each juror&apos;s main finding if your ruling ends up far from their recommendation.</p>
        <Button size="sm" className="mt-4" onClick={() => setRevealed(true)}>
          I&apos;ve read the evidence, show AI evaluations
        </Button>
      </div>
    );
  }
  return (
    <div>
      {c.aiPhase === "failed" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.05] p-3 mb-4 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          AI evaluation failed: fewer than two valid seats, or two that disagree. The case switched to human-only with two arbitrators at the standard 3% fee. Valid evaluations below are shown as incomplete.
        </div>
      )}
      {(c.aiPhase === "done" || c.recommendation !== null) && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
          <span className="text-[#A1A1AA]">Recommendation (median of valid seats):</span>
          <span className="font-semibold text-white">{c.recommendation !== null ? formatRuling(c.recommendation) : "—"}</span>
          {c.split && <Pill tone="warn">seats split ≥ 50 pts · two arbitrators</Pill>}
          <Pill>proposal only · AI never settles a case</Pill>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {c.seats.map((s) => (
          <SeatCard key={s.seat} seat={s} spec={spec} incomplete={c.aiPhase === "failed"} />
        ))}
      </div>
    </div>
  );
}

export function VerdictList({ verdicts, spec, round }: { verdicts: Verdict[]; spec?: MilestoneSpec; round: number }) {
  if (verdicts.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {verdicts.map((v) => (
        <div key={v.arbitrator} className="rounded-2xl border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-white">
              Round {round} · <PersonName address={v.arbitrator} className="font-semibold" />
            </div>
            <div className="text-sm font-semibold text-white">{formatRuling(v.ruling)}</div>
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {v.reasons.map((r) => (
              <li key={r.criterion} className="text-[#D4D4D8]">
                <span className="font-mono text-[#71717A] mr-1.5">{r.criterion}</span>
                <span className="text-[#A1A1AA]">{spec?.criteria.find((c) => c.id === r.criterion)?.text}:</span> {r.text}
              </li>
            ))}
          </ul>
          {v.seatAnswers && Object.keys(v.seatAnswers).length > 0 && (
            <div className="mt-2 text-xs">
              <div className="text-[10px] uppercase tracking-widest text-[#71717A] mb-1">Answers to the AI jurors</div>
              {Object.entries(v.seatAnswers).map(([seat, text]) => (
                <div key={seat} className="text-[#D4D4D8]">
                  <span className="text-[#71717A]">Seat {seat}:</span> {text}
                </div>
              ))}
            </div>
          )}
          <div className="text-[10px] font-mono text-[#71717A] mt-2">
            reason_hash {v.reasonHash.slice(0, 12)}… · signed {formatDateTime(v.signedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Timeline({ c, now }: { c: DisputeCase; now: number }) {
  return (
    <ol className="relative border-l border-white/10 ml-1.5 flex flex-col gap-3">
      {[...c.timeline].reverse().map((t, i) => (
        <li key={i} className="pl-4 relative">
          <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#FF6FAF]/80" />
          <div className="text-sm text-[#D4D4D8] leading-snug">{t.text}</div>
          <div className="text-[10px] text-[#71717A] mt-0.5">
            <Relative at={t.at} now={now} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-2 mb-4">
        <Eyebrow className="mb-0">{title}</Eyebrow>
        {aside}
      </div>
      {children}
    </GlassCard>
  );
}
