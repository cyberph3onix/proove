"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Plus, Star } from "lucide-react";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Stars, Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { DataGate } from "@/components/app/data-gate";
import { MilestoneCard, nextRelease } from "@/components/gig/milestone-card";
import { Countdown, Empty, Field, GigStatusPill, Modal, PersonChip, Relative, TxButton, TxError, inputClass, textareaClass } from "@/components/proove/primitives";
import { MilestoneTrack, Poster, Scene3D } from "@/components/three";
import { useEvents, useGig, useNow, useProfile, useSession } from "@/hooks/use-chain";
import { useTransaction } from "@/lib/tx";
import { formatDate, formatStars, formatUsdc, usdcToBase } from "@proove/types/format";
import { hashDocument, sha256Hex } from "@proove/types/hash";
import { ZERO_HASH, type MilestoneSpec } from "@proove/types/types";
import { USDC_MINT } from "@/lib/mock/state";
import { useChain } from "@/lib/mock/store";
import { isChainMode } from "@/lib/chain/mode";

function Gig({ gigId }: { gigId: string }) {
  const { gig, milestones } = useGig(gigId);
  const { address } = useSession();
  const now = useNow();
  const { profile: freelancerProfile } = useProfile(gig?.freelancer);
  const filter = useMemo(() => (e: { gig?: string }) => e.gig === gigId, [gigId]);
  const events = useEvents(filter);
  const tx = useTransaction();
  const rated = useChain((s) => s.ratings.find((r) => r.gig === gigId));
  const profiles = useChain((s) => s.profiles);
  const [adding, setAdding] = useState(false);
  const [rating, setRating] = useState(false);
  const [assignee, setAssignee] = useState("");

  if (!gig) return <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-10"><Empty title="Gig not found">It may have been cancelled, or the link is wrong.</Empty></div>;

  const isClient = address === gig.client;
  const isFreelancer = address === gig.freelancer;
  const committed = milestones.reduce((s, m) => s + m.amount, 0);
  const firstActive = milestones.find((m) => !["completed", "resolved", "refunded"].includes(m.status));
  const nodes = milestones.map((m) => {
    const nr = nextRelease(m);
    const progress = ["completed", "resolved", "refunded"].includes(m.status) ? 1 : nr ? Math.min(1, (now - nr.start) / Math.max(1, nr.at - nr.start)) : m.status === "funded" ? 0.08 : 0;
    const state = m.status === "disputed" ? ("frozen" as const) : ["completed", "resolved", "refunded"].includes(m.status) ? ("done" as const) : m.status === "pendingFunding" ? ("idle" as const) : ("active" as const);
    return { progress, state };
  });

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <GigStatusPill status={gig.status} />
          <Pill>{gig.category}</Pill>
          {gig.skills.map((s) => (
            <span key={s} className="text-[11px] text-[#A1A1AA]">
              #{s}
            </span>
          ))}
        </div>
        <h1 className="text-2xl sm:text-[28px] font-bold text-white tracking-tight mb-3">{gig.title}</h1>
        <p className="text-sm text-[#A1A1AA] leading-relaxed max-w-[640px]">{gig.description}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-xs text-[#A1A1AA]">
          <span className="tabular-nums">Budget {formatUsdc(gig.budget)}</span>
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} /> Deadline {formatDate(gig.deadline)} (<Countdown to={gig.deadline} now={now} doneLabel="passed" />)
          </span>
          <span>
            Posted <Relative at={gig.createdAt} now={now} />
          </span>
        </div>

        {milestones.length > 0 && (
          <GlassCard className="mt-6 p-0 overflow-hidden">
            <Scene3D className="h-[150px]" label={`Milestone track: ${milestones.length} milestones; rings fill toward each automatic release`} poster={<Poster />}>
              {(on) => <MilestoneTrack active={on} nodes={nodes} />}
            </Scene3D>
          </GlassCard>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Eyebrow className="mb-0">Milestones ({milestones.length})</Eyebrow>
          {isClient && !["completed", "cancelled", "archived"].includes(gig.status) && committed < gig.budget && (
            <button onClick={() => setAdding(true)} className="text-xs font-semibold text-[#FF6FAF] inline-flex items-center gap-1">
              <Plus size={13} /> Add milestone
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {milestones.map((m) => (
            <MilestoneCard key={m.address} m={m} gig={gig} me={address} now={now} defaultOpen={m.address === firstActive?.address} />
          ))}
          {milestones.length === 0 && <Empty title="No milestones yet">{isClient ? "Add one, or post the gig through the Scope Compiler." : "The client hasn't defined milestones yet."}</Empty>}
        </div>

        <GlassCard className="mt-6">
          <Eyebrow>On-chain activity</Eyebrow>
          <ul className="flex flex-col divide-y divide-white/[0.06]">
            {events.slice(0, 12).map((e) => (
              <li key={e.signature} className="py-2.5 first:pt-0 flex gap-3 text-sm">
                <span className="text-[11px] text-[#71717A] w-16 shrink-0 pt-0.5">
                  <Relative at={e.blockTime} now={now} />
                </span>
                <span className="text-[#D4D4D8] flex-1">{e.receipt}</span>
                <span className="text-[10px] font-mono text-[#71717A] pt-0.5 hidden sm:inline">{e.program}</span>
              </li>
            ))}
            {events.length === 0 && <li className="text-sm text-[#A1A1AA]">No events yet.</li>}
          </ul>
        </GlassCard>
      </div>

      <aside className="flex flex-col gap-4">
        <GlassCard tone="accent">
          <Eyebrow>Client</Eyebrow>
          <PersonChip address={gig.client} sub={profiles[gig.client]?.ratingCount ? `${formatStars(profiles[gig.client].averageRating)}★` : "Client"} />
        </GlassCard>

        <GlassCard>
          <Eyebrow>Freelancer</Eyebrow>
          {gig.freelancer ? (
            <>
              <PersonChip address={gig.freelancer} sub={freelancerProfile ? `${freelancerProfile.reputationScore} rep · ${freelancerProfile.completedJobs} jobs` : undefined} />
              {freelancerProfile && (
                <div className="mt-3">
                  <Stars filled={Math.round(freelancerProfile.averageRating / 100)} />
                </div>
              )}
            </>
          ) : isClient ? (
            <div className="flex flex-col gap-2">
              {isChainMode ? (
                <>
                  <p className="text-xs text-[#A1A1AA]">Applications are off-chain in Phase 1. Assign a wallet directly.</p>
                  <Field label="Freelancer wallet">
                    <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Base58 address" className={inputClass} />
                  </Field>
                  <TxButton
                    size="sm"
                    phase={tx.phase}
                    disabled={!assignee.trim()}
                    onClick={() => tx.run("assignFreelancer", { gig: gig.address, freelancer: assignee.trim() }, "Assign freelancer")}
                  >
                    Assign
                  </TxButton>
                </>
              ) : (
                <>
                  {gig.applicants.length === 0 && <p className="text-xs text-[#A1A1AA]">No applicants yet.</p>}
                  {gig.applicants.map((a) => (
                    <div key={a} className="flex items-center justify-between gap-2">
                      <PersonChip address={a} sub={profiles[a] ? `${profiles[a].reputationScore} rep · ${profiles[a].completedJobs} jobs` : "New"} />
                      <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("assignFreelancer", { gig: gig.address, freelancer: a }, "Assign freelancer")}>
                        Assign
                      </TxButton>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : isChainMode ? null : (
            <div>
              <p className="text-xs text-[#A1A1AA] mb-3">{gig.applicants.length} applicant{gig.applicants.length === 1 ? "" : "s"} so far.</p>
              {address && gig.applicants.includes(address) ? (
                <Pill tone="good">Applied</Pill>
              ) : (
                <TxButton className="w-full" phase={tx.phase} disabled={!address} onClick={() => tx.run("applyToGig", { gig: gig.address }, "Apply")}>
                  {address ? "Apply" : "Sign in to apply"}
                </TxButton>
              )}
            </div>
          )}
          <TxError error={tx.error} />
        </GlassCard>

        {isClient && gig.status === "completed" && gig.freelancer && (
          <GlassCard>
            <Eyebrow>Rating</Eyebrow>
            {rated ? (
              <div>
                <Stars filled={rated.score} />
                <p className="text-sm text-[#D4D4D8] mt-1">“{rated.review}”</p>
              </div>
            ) : (
              <Button className="w-full" onClick={() => setRating(true)}>
                <Star size={14} className="mr-1.5" /> Rate the freelancer
              </Button>
            )}
          </GlassCard>
        )}

        {isClient && ["published", "assigned"].includes(gig.status) && !milestones.some((m) => m.status !== "pendingFunding") && (
          <TxButton variant="ghost" className="border border-white/10" phase={tx.phase} onClick={() => tx.run("cancelGig", { gig: gig.address }, "Cancel gig")}>
            Cancel gig
          </TxButton>
        )}
        {isFreelancer && (
          <Link href="/receivables" className="text-xs text-[#A1A1AA] hover:text-white">
            Delivered and waiting? Get paid early with a receivable →
          </Link>
        )}
      </aside>

      {adding && <AddMilestoneModal gigId={gig.address} deadline={gig.deadline} remaining={gig.budget - committed} index={milestones.length} onClose={() => setAdding(false)} />}
      {rating && <RateModal gigId={gig.address} onClose={() => setRating(false)} />}
    </div>
  );
}

function AddMilestoneModal({ gigId, deadline, remaining, index, onClose }: { gigId: string; deadline: number; remaining: number; index: number; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(String(remaining / 1_000_000));
  const [criteria, setCriteria] = useState("");
  const tx = useTransaction();
  const lines = criteria.split("\n").map((l) => l.trim()).filter(Boolean);
  const spec: MilestoneSpec = {
    schema: "proove.milestone-spec.v1",
    gig: gigId,
    index,
    title,
    amount: String(usdcToBase(amount)),
    mint: USDC_MINT,
    deliverables: [],
    criteria: lines.map((text, i) => ({ id: `c${i + 1}`, text, check: "manual" })),
    deadline,
    generated_by: null,
    edited_by_client: true,
  };
  return (
    <Modal open onClose={onClose} title="Add milestone">
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label={`Amount (USDC, up to ${formatUsdc(remaining, { unit: false })})`}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" className={inputClass} />
        </Field>
        <Field label="Acceptance criteria, one per line (optional)" hint="Leave empty for a v1-style milestone with no committed spec.">
          <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={4} className={textareaClass} />
        </Field>
        <TxButton
          phase={tx.phase}
          disabled={!title.trim()}
          onClick={async () => {
            const r = await tx.run("createMilestone", { gig: gigId, title, amount: usdcToBase(amount), spec: lines.length ? spec : undefined, specHash: lines.length ? hashDocument(spec) : ZERO_HASH }, `Add milestone: ${title}`);
            if (r.ok) onClose();
          }}
        >
          Create milestone
        </TxButton>
        <TxError error={tx.error} />
      </div>
    </Modal>
  );
}

function RateModal({ gigId, onClose }: { gigId: string; onClose: () => void }) {
  const [score, setScore] = useState(5);
  const [review, setReview] = useState("");
  const tx = useTransaction();
  return (
    <Modal open onClose={onClose} title="Rate the freelancer">
      <div className="flex gap-1 mb-4" role="radiogroup" aria-label="Score">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={score === n} onClick={() => setScore(n)} className={n <= score ? "text-[#FF6FAF]" : "text-white/20"}>
            <Star size={26} fill="currentColor" />
          </button>
        ))}
      </div>
      <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={3} className={textareaClass} placeholder="What was it like to work together?" />
      <p className="text-[11px] text-[#71717A] mt-2">Only a hash of your review goes on-chain. The score updates the freelancer&apos;s reputation; no AI is involved.</p>
      <TxButton
        className="w-full mt-4"
        phase={tx.phase}
        onClick={async () => {
          const r = await tx.run("rateFreelancer", { gig: gigId, score, review, reviewHash: sha256Hex(review) }, "Submit rating");
          if (r.ok) onClose();
        }}
      >
        Submit {score}★ rating
      </TxButton>
      <TxError error={tx.error} />
    </Modal>
  );
}

export default function GigDetailPage({ params }: { params: Promise<{ gigId: string }> }) {
  const { gigId } = use(params);
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DataGate>
        <Gig gigId={gigId} />
      </DataGate>
    </section>
  );
}
