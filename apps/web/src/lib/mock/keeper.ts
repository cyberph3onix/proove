/**
 * Mock of services/keeper plus the AI service's dispute pipeline.
 *
 * The real keeper sends only permissionless instructions that are due
 * (releases, settle_case, reassign_arbitrator, apply_default_outcome …).
 * The AI phase posts one artifact per tick (brief, then seat A, B, C) so the
 * UI can show evaluations landing one at a time.
 */
import type { AiAttempt, AttemptOutcome, Bps, DisputeCase, SeatId } from "@proove/types/types";
import { aiRecommendation, arbitrationFee, defaultTieBreak, lockedRemaining } from "@proove/types/dispute";
import { hashDocument } from "@proove/types/hash";
import { formatRuling, formatUsdc, shortAddress } from "@proove/types/format";
import { neutralBrief, seatEvaluation } from "./ai";
import { applyDefault, assignArbitrators, emit, executeChanges, executeRuling, instructions, notify, type Ctx } from "./instructions";
import { KEEPER, AI_SERVICE, type ChainState } from "./state";

function attempt(n: number, model: string, backup: boolean, outcome: AttemptOutcome, at: number): AiAttempt {
  return { n, model, backup, outcome, at };
}

function runSeat(s: ChainState, ctx: Ctx, c: DisputeCase, seat: SeatId) {
  const st = c.seats.find((x) => x.seat === seat)!;
  const mode = s.dev.aiFailure;
  const failSeat = (mode === "oneSeat" && seat === "C") || (mode === "twoSeats" && seat !== "A");
  const m = s.milestones[c.milestone];
  const evidence = s.evidence.filter((e) => e.case === (c.previousRound ?? c.address) || e.case === c.address);
  const at = ctx.now;
  if (failSeat) {
    // 3 attempts with backoff, then the backup model twice — all fail.
    st.attempts = [
      attempt(1, st.model, false, "timeout", at),
      attempt(2, st.model, false, "rateLimited", at + 60),
      attempt(3, st.model, false, "serverError", at + 360),
      attempt(4, st.backupModel, true, "schemaInvalid", at + 1560),
      attempt(5, st.backupModel, true, "schemaInvalid", at + 1680),
    ];
    st.status = "failed";
    c.timeline.push({ at, kind: "seatFailed", text: `AI seat ${seat} failed after 3 attempts and 2 backup attempts; it abstains.` });
    emit(s, { ...ctx, actor: KEEPER }, { program: "dispute", name: "AiSeatFailed", case: c.address, receipt: `AI seat ${seat} was marked failed on case ${shortAddress(c.address)}.` });
    return;
  }
  if (mode === "retries" && seat === "B") {
    st.attempts = [attempt(1, st.model, false, "timeout", at), attempt(2, st.model, false, "schemaInvalid", at + 60), attempt(3, st.backupModel, true, "ok", at + 120)];
  } else {
    st.attempts = [attempt(1, st.model, false, "ok", at)];
  }
  const forced: Record<SeatId, Bps> | null = mode === "split" ? { A: 10000, B: 5000, C: 0 } : null;
  const ev = seatEvaluation(c, seat, m.spec, evidence, forced?.[seat]);
  if (st.attempts.some((x) => x.backup)) ev.model = st.backupModel;
  st.evaluation = ev;
  st.hash = hashDocument(ev);
  st.status = "posted";
  c.timeline.push({ at, kind: "seatPosted", text: `AI seat ${seat} posted a proposed ruling (${formatRuling(ev.ruling)}), hash ${st.hash.slice(0, 8)}…${st.attempts.length > 1 ? ` after ${st.attempts.length} attempts` : ""}.` });
  emit(s, { ...ctx, actor: AI_SERVICE }, { program: "dispute", name: "AiEvaluationSubmitted", case: c.address, actors: [AI_SERVICE], receipt: `AI seat ${seat} posted its evaluation for case ${shortAddress(c.address)}. It proposes; it doesn't decide.` });
}

function advanceAiPhase(s: ChainState, ctx: Ctx, c: DisputeCase) {
  if (c.briefStatus === "pending") {
    const m = s.milestones[c.milestone];
    const evidence = s.evidence.filter((e) => e.case === c.address);
    c.brief = neutralBrief(c, m.spec, evidence);
    c.hashes.brief = hashDocument(c.brief);
    c.briefStatus = "posted";
    c.aiPhase = "running";
    c.timeline.push({ at: ctx.now, kind: "brief", text: `Neutral brief posted (hash ${c.hashes.brief.slice(0, 8)}…). It recommends nothing; seats and arbitrators all start from it.` });
    emit(s, { ...ctx, actor: AI_SERVICE }, { program: "dispute", name: "BriefSubmitted", case: c.address, actors: [AI_SERVICE], receipt: `Neutral brief committed for case ${shortAddress(c.address)}.` });
    return;
  }
  const next = c.seats.find((x) => x.status === "pending");
  if (next) {
    runSeat(s, ctx, c, next.seat);
    return;
  }
  // close_ai_phase
  const { recommendation, split, failed } = aiRecommendation(c.seats);
  c.recommendation = recommendation;
  c.split = split;
  if (failed) {
    c.aiPhase = "failed";
    c.mode = "humanOnly";
    c.humanOnlyReason = "aiFailed";
    // Parties didn't choose the slower path: fee stays at the standard rate.
    c.feeBps = s.disputeConfig.feeBps;
    c.feeAmount = arbitrationFee(c.frozenAmount, s.disputeConfig, false);
    c.timeline.push({ at: ctx.now, kind: "aiFailed", text: "AI evaluation failed (fewer than two valid seats, or two that disagree). Switched to human-only: two arbitrators, 96 h, standard 3% fee. Valid evaluations are shown as incomplete." });
  } else {
    c.aiPhase = "done";
    c.timeline.push({ at: ctx.now, kind: "aiDone", text: `AI phase closed. Recommendation (median): ${formatRuling(recommendation!)}${split ? " — seats split, two arbitrators required" : ""}.` });
  }
  for (const who of [c.client, c.freelancer]) notify(s, ctx, who, `AI phase finished on case ${shortAddress(c.address)}.`, `/disputes/${c.address}`);
  assignArbitrators(s, ctx, c);
}

/** Run every due permissionless action once. Returns true if anything changed. */
export function keeperTick(s: ChainState, now: number): boolean {
  const ctx: Ctx = { actor: KEEPER, now };
  let changed = false;

  for (const m of Object.values(s.milestones)) {
    if (!m.terms || m.submittedAt === null) continue;
    try {
      if (m.status === "submitted" && now >= m.submittedAt + m.terms.partialTimeout) {
        instructions.partialTimeoutRelease(s, ctx, { milestone: m.address });
        changed = true;
      }
      if ((m.status === "submitted" || m.status === "partialReleased") && now >= m.submittedAt + m.terms.fullTimeout) {
        instructions.fullTimeoutRelease(s, ctx, { milestone: m.address });
        changed = true;
      }
    } catch {
      /* not due */
    }
  }

  for (const c of Object.values(s.cases)) {
    if (["settled", "defaulted", "appealed"].includes(c.status)) continue;
    if (now >= c.deadlines.hard) {
      applyDefault(s, ctx, c);
      changed = true;
      continue;
    }
    switch (c.status) {
      case "evidence":
        if (now >= c.deadlines.evidence) {
          c.timeline.push({ at: now, kind: "evidenceClosed", text: `Evidence window closed with ${s.evidence.filter((e) => e.case === c.address).length} items.` });
          if (c.mode === "humanOnly") assignArbitrators(s, ctx, c);
          else {
            c.status = "aiEvaluation";
            c.aiPhase = "running";
            c.deadlines.ai = now + s.disputeConfig.aiWindow;
          }
          changed = true;
        }
        break;
      case "aiEvaluation":
        advanceAiPhase(s, ctx, c);
        changed = true;
        break;
      case "arbitration":
        if (now > c.deadlines.arbitration && c.reassignments < 2) {
          instructions.reassignArbitrator(s, ctx, { case: c.address });
          changed = true;
        }
        break;
      case "tieBreak":
        if (c.deadlines.tieBreak && now > c.deadlines.tieBreak) {
          const [a, b] = c.verdicts.map((v) => v.ruling);
          const pick = defaultTieBreak(a, b, c.recommendation);
          if (c.fallback && s.arbitrators[c.fallback]) {
            s.arbitrators[c.fallback].noShows += 1;
            c.noShows.push(c.fallback);
          }
          c.timeline.push({ at: now, kind: "tieDefault", text: `Fallback arbitrator didn't act; the ruling closer to the ${c.recommendation !== null ? "AI recommendation" : "midpoint"} wins: ${formatRuling(pick)}.` });
          c.tieBreakPick = pick;
          c.finalRuling = pick;
          if (c.round === 2) executeRuling(s, ctx, c, pick);
          else {
            c.status = "appealWindow";
            c.deadlines.appeal = now + s.disputeConfig.appealWindow;
          }
          changed = true;
        }
        break;
      case "appealWindow": {
        const bothWaived = c.waivedBy.includes(c.client) && c.waivedBy.includes(c.freelancer);
        if (bothWaived || now >= c.deadlines.appeal) {
          executeRuling(s, ctx, c, c.finalRuling!);
          changed = true;
        }
        break;
      }
    }
  }

  for (const p of s.proposals) {
    if (p.status === "voting" && now >= p.votingEndsAt) {
      const total = p.votesFor + p.votesAgainst;
      p.status = total >= p.quorum && p.votesFor > p.votesAgainst ? "timelock" : "defeated";
      if (p.status === "timelock") p.timelockEndsAt = now + 48 * 3600;
      changed = true;
    } else if (p.status === "timelock" && p.timelockEndsAt && now >= p.timelockEndsAt) {
      try {
        executeChanges(s, ctx, p);
      } catch {
        p.status = "defeated";
      }
      changed = true;
    }
  }

  return changed;
}

export const _debug = { lockedRemaining, formatUsdc };
