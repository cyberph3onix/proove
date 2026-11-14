"use client";

import { use } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { DataGate } from "@/components/app/data-gate";
import { CaseStatusPill, Countdown, Empty, HashBadge, KeyValue, PersonChip } from "@/components/proove/primitives";
import { AiPanel, BriefPanel, EvidencePanel, Section, Timeline, VerdictList } from "@/components/dispute/case-panels";
import { AppealBox, EvidenceForm, HumanOnlyButton, KeeperActions, TieBreak, VerdictEditor } from "@/components/dispute/case-actions";
import { DisputeChamber, Poster, Scene3D } from "@/components/three";
import { useCase, useNow, useSession } from "@/hooks/use-chain";
import { formatRuling, formatUsdc, shortAddress, DAY } from "@proove/types/format";

function Case({ caseId }: { caseId: string }) {
  const { c, evidence, previous, milestone, gig } = useCase(caseId);
  const { address } = useSession();
  const now = useNow();
  if (!c || !milestone || !gig) return <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-10"><Empty title="Case not found" /></div>;

  const isParty = address === c.client || address === c.freelancer;
  const isHolder = address === c.holder;
  const isArbitrator = !!address && c.arbitrators.includes(address);
  const signed = !!address && c.verdicts.some((v) => v.arbitrator === address);
  const mine = evidence.filter((e) => e.party === address && e.case === c.address).length;
  const final = c.status === "settled" || c.status === "defaulted";
  const ruling = c.status === "appealWindow" || final ? c.finalRuling : null;

  const deadlines: [string, number | undefined, boolean][] = [
    ["Evidence closes", c.deadlines.evidence, c.status === "evidence"],
    ["AI phase", c.mode === "humanOnly" && c.humanOnlyReason === "chosen" ? undefined : c.deadlines.ai, c.status === "aiEvaluation"],
    ["Verdict due", c.deadlines.arbitration || undefined, c.status === "arbitration"],
    ["Tie-break due", c.deadlines.tieBreak, c.status === "tieBreak"],
    ["Appeal window", c.deadlines.appeal || undefined, c.status === "appealWindow"],
    ["Hard deadline", c.deadlines.hard, !final],
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <CaseStatusPill status={c.status} />
        <Pill>Round {c.round}</Pill>
        <Pill tone={c.mode === "humanOnly" ? "warn" : "accent"}>{c.mode === "humanOnly" ? (c.humanOnlyReason === "aiFailed" ? "Human-only (AI failed)" : "Human-only (chosen)") : "AI-assisted"}</Pill>
        {c.requiredArbitrators === 2 && <Pill>Two arbitrators</Pill>}
      </div>
      <h1 className="text-2xl sm:text-[28px] font-bold text-white tracking-tight">
        Case {shortAddress(c.address)} · {milestone.title}
      </h1>
      <p className="text-sm text-[#A1A1AA] mt-1">
        on <Link href={`/gigs/${gig.address}`} className="text-[#FF6FAF] hover:underline">{gig.title}</Link>
      </p>
      {c.appealedTo && (
        <Link href={`/disputes/${c.appealedTo}`} className="inline-block mt-3 text-sm text-[#FF6FAF]">
          This verdict was appealed. Go to round 2 →
        </Link>
      )}
      {previous && (
        <Link href={`/disputes/${previous.address}`} className="inline-block mt-3 text-sm text-[#A1A1AA] hover:text-white">
          ← Round 1 verdict: {previous.finalRuling !== null ? formatRuling(previous.finalRuling) : "—"}
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 mt-6">
        <div className="flex flex-col gap-5 min-w-0">
          <GlassCard className="p-0 overflow-hidden">
            <Scene3D
              className="h-[260px] sm:h-[300px]"
              label={`Dispute chamber: ${c.seats.filter((s) => s.status === "posted").length} of 3 AI seats posted, ${c.verdicts.length} of ${c.requiredArbitrators} arbitrator signatures${ruling !== null ? `, ruling ${formatRuling(ruling)}` : ", no verdict yet"}`}
              poster={<Poster />}
            >
              {(on) => <DisputeChamber active={on} seats={c.seats.map((s) => s.status)} arbitratorsSigned={c.verdicts.length + (c.tieBreakPick !== undefined ? 1 : 0)} arbitratorsRequired={c.requiredArbitrators} ruling={ruling} />}
            </Scene3D>
            <div className="px-5 pb-4 grid grid-cols-3 gap-2 text-center text-[11px] text-[#A1A1AA]">
              <span>AI seats: {c.seats.filter((s) => s.status === "posted").length}/3 posted</span>
              <span>Arbitrators: {c.verdicts.length}/{c.requiredArbitrators} signed</span>
              <span>{ruling !== null ? formatRuling(ruling) : "No verdict yet"}</span>
            </div>
          </GlassCard>

          {c.status === "appealWindow" && isParty && <AppealBox c={c} me={address!} />}
          {c.status === "tieBreak" && address === c.fallback && <TieBreak c={c} />}

          <Section title="What's disputed">
            <p className="text-sm text-[#D4D4D8] leading-relaxed">“{c.reason}”</p>
            <div className="text-[11px] text-[#71717A] mt-2">Raised by the {c.raiserRole}{c.appeal ? ` · appeal grounds: “${c.appeal.grounds}”` : ""}</div>
            {milestone.spec && (
              <ul className="mt-4 flex flex-col gap-1">
                {milestone.spec.criteria.map((cr) => (
                  <li key={cr.id} className="text-sm text-[#D4D4D8]">
                    <span className="font-mono text-[11px] text-[#71717A] mr-2">{cr.id}</span>
                    {cr.text}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5 mt-4">
              <HashBadge label="spec" hash={c.hashes.spec} doc={milestone.spec} />
              <HashBadge label="delivery" hash={c.hashes.delivery} />
              <HashBadge label="report" hash={c.hashes.report} doc={milestone.report} />
            </div>
          </Section>

          <Section title={`Evidence (${evidence.length})`}>
            <EvidencePanel c={c} evidence={evidence} now={now} />
          </Section>

          {(isParty || isHolder) && c.status === "evidence" && <EvidenceForm c={c} mine={mine} />}

          <Section title="Neutral brief">
            <BriefPanel brief={c.brief} status={c.briefStatus} hash={c.hashes.brief} />
          </Section>

          <Section title="AI jurors">
            <AiPanel c={c} spec={milestone.spec} isArbitrator={isArbitrator && !signed} />
          </Section>

          {isArbitrator && !signed && c.status === "arbitration" && <VerdictEditor c={c} spec={milestone.spec} />}

          {(c.verdicts.length > 0 || (previous && previous.verdicts.length > 0)) && (
            <Section title="Verdicts">
              <div className="flex flex-col gap-3">
                {previous && <VerdictList verdicts={previous.verdicts} spec={milestone.spec} round={1} />}
                {/* Parties see verdicts only once signed; there is no draft state on-chain. */}
                <VerdictList verdicts={c.verdicts} spec={milestone.spec} round={c.round} />
              </div>
            </Section>
          )}

          <KeeperActions c={c} now={now} />
        </div>

        <aside className="flex flex-col gap-4">
          <GlassCard tone={final ? "good" : "warn"}>
            <Eyebrow>Funds</Eyebrow>
            <KeyValue
              rows={[
                ["Frozen", formatUsdc(c.frozenAmount)],
                ["Raiser's bond", formatUsdc(c.bond)],
                ["Arbitration fee", `${formatUsdc(c.feeAmount)} (${c.feeBps / 100}%)`],
                ...(c.finalRuling !== null ? ([["Ruling", formatRuling(c.finalRuling)]] as [string, string][]) : []),
              ]}
            />
            <p className="text-[11px] text-[#71717A] mt-3">Escrow is the only program that moves this money. The dispute program settles by calling escrow&apos;s execute_ruling.</p>
          </GlassCard>

          <GlassCard>
            <Eyebrow>Deadlines</Eyebrow>
            <ul className="flex flex-col gap-2">
              {deadlines
                .filter(([, at]) => at !== undefined)
                .map(([label, at, current]) => (
                  <li key={label} className={`flex items-center justify-between text-sm ${current ? "text-white" : "text-[#71717A]"}`}>
                    <span className="flex items-center gap-1.5">
                      {current && <Clock size={12} className="text-[#FF6FAF]" />}
                      {label}
                    </span>
                    {final && label !== "Hard deadline" ? <span className="text-[11px]">done</span> : <Countdown to={at!} now={now} doneLabel={current ? "due now" : "passed"} />}
                  </li>
                ))}
            </ul>
            <div className="text-[11px] text-[#71717A] mt-3">
              Reassignments {c.reassignments}/2{c.noShows.length ? ` · no-shows: ${c.noShows.map((n) => shortAddress(n)).join(", ")}` : ""}. Opened {Math.floor((now - c.openedAt) / DAY)} days ago.
            </div>
            {isParty && c.status === "evidence" && c.mode === "aiAssisted" && now < c.openedAt + DAY && (
              <div className="mt-3">
                <HumanOnlyButton c={c} />
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <Eyebrow>Parties</Eyebrow>
            <div className="flex flex-col gap-3">
              <PersonChip address={c.client} sub="Client" />
              <PersonChip address={c.freelancer} sub="Freelancer" />
              {c.holder && <PersonChip address={c.holder} sub="Receivable holder (evidence only)" />}
            </div>
            <Eyebrow className="mt-5">Arbitrators</Eyebrow>
            <div className="flex flex-col gap-3">
              {c.arbitrators.map((a) => (
                <PersonChip key={a} address={a} sub={c.verdicts.some((v) => v.arbitrator === a) ? "Signed" : "Assigned"} />
              ))}
              {c.fallback && <PersonChip address={c.fallback} sub="Fallback (tie-break)" />}
              {c.arbitrators.length === 0 && <p className="text-xs text-[#A1A1AA]">Assigned when the {c.mode === "humanOnly" ? "evidence window" : "AI phase"} closes: round-robin, skipping anyone with a past counterparty link.</p>}
            </div>
          </GlassCard>

          <GlassCard>
            <Eyebrow>Timeline</Eyebrow>
            <Timeline c={c} now={now} />
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

export default function DisputePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = use(params);
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DataGate>
        <Case caseId={caseId} />
      </DataGate>
    </section>
  );
}
