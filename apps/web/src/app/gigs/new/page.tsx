"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Mic, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { DataGate } from "@/components/app/data-gate";
import { Field, HashBadge, PageHeader, TxButton, TxError, inputClass, textareaClass } from "@/components/proove/primitives";
import { CriteriaStack, Poster, Scene3D } from "@/components/three";
import { compileScope, parseBudget, MOCK_MODELS, PROMPT_HASHES } from "@/lib/mock/ai";
import { hashDocument } from "@/lib/domain/hash";
import { DAY, formatUsdc, usdcToBase, USDC } from "@/lib/domain/format";
import type { Criterion, CriterionCheck, Deliverable, MilestoneSpec } from "@/lib/domain/types";
import { ZERO_HASH } from "@/lib/domain/types";
import { useNow, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { useTransaction } from "@/lib/tx";
import { USDC_MINT } from "@/lib/mock/state";
import { NAV_CATEGORIES } from "@/components/layout/nav-categories";

interface DraftMilestone {
  title: string;
  amount: string;
  deliverables: Deliverable[];
  criteria: Criterion[];
}

const CATEGORIES = ["AI Services", "Programming & Tech", ...NAV_CATEGORIES.map((c) => c.label).filter((l) => !["AI Services", "Programming & Tech"].includes(l))];

const EXAMPLES = [
  "Label 500 product images with bounding boxes following our guideline v3, COCO JSON, budget 300 USDC.",
  "Logo and a one-page brand guide for a specialty coffee roaster. Warm, minimal. 900 USDC.",
  "A Next.js dashboard for our Solana program's events, mobile friendly, 1500 USDC.",
];

function PostGig() {
  const router = useRouter();
  const { address } = useSession();
  const now = useNow(60_000);
  const minMilestone = useChain((s) => s.protocol.minMilestone);
  const tx = useTransaction();

  const [brief, setBrief] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("14");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[1]);
  const [skills, setSkills] = useState("");
  const [milestones, setMilestones] = useState<DraftMilestone[]>([]);
  const [compiling, setCompiling] = useState(false);
  const [compiled, setCompiled] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [edited, setEdited] = useState(false);
  const [firstAt, setFirstAt] = useState<number | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const deadline = now + Math.max(1, Number(days) || 14) * DAY;
  const totalBudget = milestones.reduce((s, m) => s + usdcToBase(m.amount), 0);
  const allCriteria = milestones.flatMap((m) => m.criteria);
  const invalid =
    !title.trim() ||
    milestones.length === 0 ||
    milestones.some((m) => !m.title.trim() || usdcToBase(m.amount) < minMilestone || m.criteria.some((c) => !c.text.trim()));

  async function runCompiler() {
    if (!brief.trim()) return;
    setCompiling(true);
    setCompiled(false);
    setAiUsed(true);
    setEdited(false);
    const t0 = performance.now();
    let first = true;
    for await (const r of compileScope(brief, budget ? Number(budget) : undefined)) {
      if (first) {
        setFirstAt(Math.round(performance.now() - t0));
        first = false;
        setTitle((t) => t || r.title);
        setCategory(r.category);
        setDescription((d) => d || brief.slice(0, 480));
        if (!budget) setBudget(String(r.milestones.reduce((s, m) => s + m.amount, 0)));
      }
      setMilestones(r.milestones.map((m) => ({ title: m.title, amount: String(m.amount), deliverables: m.deliverables, criteria: m.criteria })));
    }
    setCompiling(false);
    setCompiled(true);
  }

  function update(i: number, patch: Partial<DraftMilestone>) {
    setEdited(true);
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }
  function updateCriterion(i: number, ci: number, patch: Partial<Criterion>) {
    update(i, { criteria: milestones[i].criteria.map((c, k) => (k === ci ? { ...c, ...patch } : c)) });
  }

  const specs = useMemo<MilestoneSpec[]>(
    () =>
      milestones.map((m, i) => ({
        schema: "proove.milestone-spec.v1",
        gig: "<assigned at publish>",
        index: i,
        title: m.title,
        amount: String(usdcToBase(m.amount)),
        mint: USDC_MINT,
        deliverables: m.deliverables,
        criteria: m.criteria,
        deadline,
        generated_by: aiUsed ? { model: MOCK_MODELS.scope, prompt_version: PROMPT_HASHES.scope } : null,
        edited_by_client: edited || !aiUsed,
      })),
    [milestones, deadline, aiUsed, edited],
  );

  async function publish() {
    if (invalid || !address) return;
    setStep("Creating gig");
    const created = await tx.run(
      "createGig",
      { title: title.trim(), description: description.trim(), category, skills: skills.split(",").map((s) => s.trim()).filter(Boolean), budget: totalBudget, deadline, brief: brief.trim() || undefined },
      `Publish “${title.trim()}”`,
    );
    if (!created.ok) return setStep(null);
    const gig = created.result as string;
    for (let i = 0; i < specs.length; i++) {
      setStep(`Committing milestone ${i + 1} of ${specs.length}`);
      const spec: MilestoneSpec = { ...specs[i], gig };
      const hasCriteria = spec.criteria.length > 0;
      const r = await tx.run(
        "createMilestone",
        { gig, title: spec.title, amount: Number(spec.amount), spec: hasCriteria ? spec : undefined, specHash: hasCriteria ? hashDocument(spec) : ZERO_HASH },
        `Commit spec: ${spec.title}`,
      );
      if (!r.ok) return setStep(null);
    }
    router.push(`/gigs/${gig}`);
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader eyebrow="Post a gig" title="Describe the work. Agree what “done” means." description="The Scope Compiler drafts milestones with testable acceptance criteria. You edit everything; the final spec is hashed on-chain and the freelancer signs that exact hash." />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="flex flex-col gap-5">
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <Eyebrow className="mb-0">1 · Brief</Eyebrow>
              <Pill tone="accent">
                <Sparkles size={11} /> Scope Compiler
              </Pill>
            </div>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="A few sentences about what you need, for whom, and your budget…" className={textareaClass} aria-label="Brief" />
            <div className="flex flex-wrap gap-2 mt-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => { setBrief(ex); const b = parseBudget(ex); if (b) setBudget(String(b)); }} className="text-[11px] text-[#A1A1AA] border border-white/10 rounded-full px-2.5 py-1 hover:text-white hover:border-white/20 text-left">
                  {ex.slice(0, 46)}…
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 mt-4 items-end">
              <Field label="Budget (USDC)">
                <input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" min="0" className={inputClass} placeholder="500" />
              </Field>
              <Field label="Deadline (days)">
                <input value={days} onChange={(e) => setDays(e.target.value)} type="number" min="1" className={inputClass} />
              </Field>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => setAttachments([...attachments, ...Array.from(e.target.files ?? []).map((f) => f.name)])} />
              <Button variant="ghost" className="border border-white/10 h-11" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={15} className="mr-1.5" /> Attach
              </Button>
              <Button variant="ghost" className="border border-white/10 h-11" onClick={() => setAttachments([...attachments, `voice-note-${attachments.length + 1}.m4a`])} title="Records in the browser; mocked here">
                <Mic size={15} className="mr-1.5" /> Voice
              </Button>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {attachments.map((a, i) => (
                  <Pill key={`${a}-${i}`}>{a}</Pill>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Button onClick={runCompiler} disabled={!brief.trim() || compiling}>
                <Wand2 size={15} className="mr-2" />
                {compiling ? "Compiling…" : compiled ? "Recompile" : "Compile scope"}
              </Button>
              <button
                onClick={() => {
                  setAiUsed(false);
                  setMilestones([{ title: "Milestone 1", amount: budget || "100", deliverables: [], criteria: [] }]);
                }}
                className="text-xs text-[#A1A1AA] hover:text-white"
              >
                Skip AI and write milestones myself
              </button>
              {firstAt !== null && <span className="text-[11px] text-[#71717A]">first milestone in {firstAt} ms</span>}
            </div>
          </GlassCard>

          {milestones.length > 0 && (
            <GlassCard>
              <Eyebrow>2 · Milestones &amp; acceptance criteria</Eyebrow>
              <div className="flex flex-col gap-4">
                {milestones.map((m, i) => (
                  <div key={i} className="rounded-2xl border border-white/[0.08] p-4">
                    <div className="flex gap-2 mb-3">
                      <input value={m.title} onChange={(e) => update(i, { title: e.target.value })} className={`${inputClass} flex-[2] h-10`} aria-label={`Milestone ${i + 1} title`} />
                      <div className="flex-1 relative">
                        <input value={m.amount} onChange={(e) => update(i, { amount: e.target.value })} type="number" min="0" className={`${inputClass} h-10 pr-14`} aria-label={`Milestone ${i + 1} amount`} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#71717A]">USDC</span>
                      </div>
                      <button aria-label="Remove milestone" onClick={() => { setEdited(true); setMilestones(milestones.filter((_, j) => j !== i)); }} className="text-[#71717A] hover:text-red-300 px-1">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {usdcToBase(m.amount) > 0 && usdcToBase(m.amount) < minMilestone && <p className="text-[11px] text-amber-300 mb-2">Minimum milestone is {formatUsdc(minMilestone)} (governed).</p>}
                    {m.deliverables.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {m.deliverables.map((d) => (
                          <Pill key={d.id}>
                            {d.kind} · {d.format}
                          </Pill>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      {m.criteria.map((c, ci) => (
                        <div key={c.id} className={`rounded-xl border p-3 ${c.hard_to_test ? "border-amber-400/40 bg-amber-400/[0.04]" : "border-white/[0.06]"}`}>
                          <div className="flex gap-2">
                            <span className="text-[11px] font-mono text-[#71717A] pt-2.5">{c.id}</span>
                            <textarea value={c.text} onChange={(e) => updateCriterion(i, ci, { text: e.target.value, hard_to_test: false })} rows={1} className={`${textareaClass} py-2 min-h-[40px]`} aria-label={`Criterion ${c.id}`} />
                            <button aria-label="Remove criterion" onClick={() => update(i, { criteria: m.criteria.filter((_, k) => k !== ci) })} className="text-[#71717A] hover:text-red-300 px-1">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-2 pl-7">
                            <select value={c.check} onChange={(e) => updateCriterion(i, ci, { check: e.target.value as CriterionCheck })} className="h-8 rounded-lg bg-white/[0.04] border border-white/10 px-2 text-xs text-white" aria-label="Check type">
                              <option className="bg-[#0A0A0B]" value="automatic">Automatic check</option>
                              <option className="bg-[#0A0A0B]" value="sampled">Random sample audit</option>
                              <option className="bg-[#0A0A0B]" value="manual">Client judgement</option>
                            </select>
                            {c.check === "sampled" && (
                              <>
                                <label className="text-[11px] text-[#A1A1AA]">
                                  sample{" "}
                                  <input type="number" min={1} value={c.sample_size ?? 50} onChange={(e) => updateCriterion(i, ci, { sample_size: Number(e.target.value) })} className="w-14 h-8 rounded-lg bg-white/[0.04] border border-white/10 px-2 text-xs text-white" />
                                </label>
                                <label className="text-[11px] text-[#A1A1AA]">
                                  pass ≥{" "}
                                  <input type="number" min={0} max={100} value={Math.round((c.pass_threshold ?? 0.9) * 100)} onChange={(e) => updateCriterion(i, ci, { pass_threshold: Number(e.target.value) / 100 })} className="w-14 h-8 rounded-lg bg-white/[0.04] border border-white/10 px-2 text-xs text-white" />
                                  %
                                </label>
                              </>
                            )}
                            {c.hard_to_test && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                                <AlertTriangle size={12} /> Hard to test. Rewrite it so a third party could check it.
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      <button onClick={() => update(i, { criteria: [...m.criteria, { id: `c${m.criteria.length + 1}`, text: "", check: "manual" }] })} className="self-start text-xs font-semibold text-[#FF6FAF] mt-1">
                        + Add criterion
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => { setEdited(true); setMilestones([...milestones, { title: `Milestone ${milestones.length + 1}`, amount: "100", deliverables: [], criteria: [] }]); }} className="self-start text-xs font-semibold text-[#FF6FAF] inline-flex items-center gap-1">
                  <Plus size={13} /> Add milestone
                </button>
              </div>
            </GlassCard>
          )}

          {milestones.length > 0 && (
            <GlassCard>
              <Eyebrow>3 · Gig details</Eyebrow>
              <div className="flex flex-col gap-4">
                <Field label="Title">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={inputClass} />
                </Field>
                <Field label="Description" hint={`${description.length}/500`}>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className={textareaClass} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Category">
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                      {CATEGORIES.map((c) => (
                        <option key={c} className="bg-[#0A0A0B]">
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Skills (comma separated)">
                    <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputClass} placeholder="Figma, Brand systems" />
                  </Field>
                </div>
              </div>
            </GlassCard>
          )}
        </div>

        <div className="lg:sticky lg:top-[140px] flex flex-col gap-4">
          <GlassCard className="p-0 overflow-hidden">
            <Scene3D className="h-[220px]" label={`${allCriteria.length} acceptance criteria stacked; amber cards are flagged as hard to test`} poster={<Poster />}>
              {(on) => <CriteriaStack active={on} count={allCriteria.length} flagged={allCriteria.map((c) => !!c.hard_to_test)} />}
            </Scene3D>
            <div className="p-5 pt-2">
              <Eyebrow>Summary</Eyebrow>
              <div className="text-2xl font-bold text-white tabular-nums">{formatUsdc(totalBudget)}</div>
              <div className="text-xs text-[#A1A1AA] mb-4">
                {milestones.length} milestone{milestones.length === 1 ? "" : "s"} · {allCriteria.length} criteria · {allCriteria.filter((c) => c.hard_to_test).length} flagged
              </div>
              <div className="flex flex-col gap-1.5 mb-4">
                {specs.map((s, i) => (
                  <HashBadge key={i} label={`spec ${i + 1}`} hash={s.criteria.length ? hashDocument(s) : ZERO_HASH} />
                ))}
              </div>
              <p className="text-[11px] text-[#71717A] mb-4 leading-relaxed">
                Hashes are SHA-256 over the canonical (RFC 8785) spec JSON. They update as you edit and are final once committed. Funding needs the freelancer to sign the same hash.
              </p>
              <TxButton phase={tx.phase} className="w-full" size="lg" disabled={invalid || !address} onClick={publish} pendingLabel={step ?? undefined}>
                {!address ? "Sign in to publish" : "Publish gig & commit specs"}
              </TxButton>
              <TxError error={tx.error} />
              {totalBudget > 0 && totalBudget < 5 * USDC && <p className="text-[11px] text-amber-300 mt-2">Budget is below the minimum milestone.</p>}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export default function PostGigPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DataGate requireWallet>
        <PostGig />
      </DataGate>
    </section>
  );
}
