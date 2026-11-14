"use client";

import { useMemo, useState } from "react";
import { Landmark, ShieldAlert } from "lucide-react";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { DataGate } from "@/components/app/data-gate";
import { Countdown, Empty, Field, Modal, PageHeader, PersonName, Stat, Tabs, TxButton, TxError, inputClass, textareaClass } from "@/components/proove/primitives";
import { Button } from "@/components/ui/button";
import { Poster, Scene3D, SettingDials } from "@/components/three";
import { useNow, useProfile, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { SETTING_RANGES } from "@/lib/mock/ranges";
import { formatUsdc, shortHash, formatDate } from "@/lib/domain/format";
import { voterWeight } from "@/lib/domain/reputation";
import { useTransaction } from "@/lib/tx";
import type { Proposal, SettingChange } from "@/lib/domain/types";

const DIAL_KEYS = ["ProtocolConfig.partialTimeout", "ProtocolConfig.fullTimeout", "ProtocolConfig.partialBps", "ProtocolConfig.feeBps"];
const STATUS_TONE: Record<Proposal["status"], "accent" | "good" | "bad" | "warn" | "default"> = { voting: "accent", succeeded: "good", timelock: "warn", executed: "good", defeated: "bad", vetoed: "bad" };

function Governance() {
  const now = useNow();
  const { address, isCouncil } = useSession();
  const { profile } = useProfile(address);
  const protocol = useChain((s) => s.protocol);
  const dispute = useChain((s) => s.disputeConfig);
  const registry = useChain((s) => s.aiRegistry);
  const proposals = useChain((s) => s.proposals);
  const treasury = useChain((s) => s.treasury);
  const [tab, setTab] = useState<"proposals" | "settings" | "ai">("proposals");
  const [creating, setCreating] = useState(false);

  const current = (key: string) => {
    const [acc, k] = key.split(".");
    return Number((acc === "ProtocolConfig" ? protocol : dispute)[k as keyof typeof protocol & keyof typeof dispute] ?? 0);
  };
  const dialValues = DIAL_KEYS.map((k) => {
    const r = SETTING_RANGES[k];
    return (current(k) - r.min) / (r.max - r.min);
  });

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader
        eyebrow="Proove DAO · SPL Governance"
        title="Governance"
        description="Every protocol setting and the fee treasury are controlled on-chain. Ranges are enforced in program code, every change waits 48 h in a timelock, and changes apply only to milestones funded after they take effect."
        actions={isCouncil ? <Button onClick={() => setCreating(true)}>New proposal</Button> : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="flex flex-col gap-5 min-w-0">
          <GlassCard className="p-0 overflow-hidden">
            <Scene3D className="h-[190px]" label="Four dials showing partial delay, full delay, partial share and protocol fee within their allowed ranges" poster={<Poster />}>
              {(on) => <SettingDials active={on} values={dialValues} />}
            </Scene3D>
            <div className="grid grid-cols-4 gap-2 px-4 pb-4 text-center">
              {DIAL_KEYS.map((k) => (
                <div key={k}>
                  <div className="text-sm font-semibold text-white">{SETTING_RANGES[k].format(current(k))}</div>
                  <div className="text-[10px] text-[#71717A]">{SETTING_RANGES[k].label}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "proposals", label: `Proposals (${proposals.length})` },
              { value: "settings", label: "Settings & ranges" },
              { value: "ai", label: "Approved AI prompts" },
            ]}
          />

          {tab === "proposals" && (
            <div className="flex flex-col gap-3">
              {proposals.map((p) => (
                <ProposalCard key={p.id} p={p} now={now} me={address} council={isCouncil} />
              ))}
              {proposals.length === 0 && <Empty title="No proposals yet" />}
            </div>
          )}

          {tab === "settings" && (
            <GlassCard>
              <div className="flex flex-col divide-y divide-white/[0.06]">
                {Object.entries(SETTING_RANGES).map(([key, r]) => (
                  <div key={key} className="py-3 first:pt-0 grid grid-cols-[1fr_auto] gap-2">
                    <div>
                      <div className="text-sm text-white">{r.label}</div>
                      <div className="text-[11px] text-[#71717A] font-mono">{key}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-white">{r.format(current(key))}</div>
                      <div className="text-[11px] text-[#71717A]">
                        allowed {r.format(r.min)} – {r.format(r.max)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {tab === "ai" && (
            <GlassCard>
              <p className="text-xs text-[#A1A1AA] mb-4">The AI service refuses to run any prompt whose hash isn&apos;t listed here. Changing how the AI jurors evaluate a case is a public proposal, not a silent server deploy.</p>
              <div className="flex flex-col divide-y divide-white/[0.06]">
                {registry.map((e) => (
                  <div key={e.job} className="py-3 first:pt-0 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1">
                    <div>
                      <div className="text-sm text-white">{e.label}</div>
                      <div className="text-[11px] font-mono text-[#71717A]">
                        {e.model}
                        {e.backupModel ? ` · backup ${e.backupModel}` : ""}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-[#A1A1AA] sm:text-right">
                      prompt {shortHash(e.promptHash)}
                      <div className="text-[#71717A]">approved {formatDate(e.approvedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <GlassCard>
            <div className="flex items-center gap-2 mb-2">
              <Landmark size={16} className="text-[#FF6FAF]" />
              <Eyebrow className="mb-0">Treasury</Eyebrow>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">{formatUsdc(treasury.balance)}</div>
            <div className="text-xs text-[#A1A1AA]">+ {formatUsdc(treasury.feePool)} arbitration fee pool (forfeited bonds)</div>
            <p className="text-[11px] text-[#71717A] mt-3">Funded by the {protocol.feeBps / 100}% protocol fee on releases. Pays arbitrator top-ups, Gemini costs, audits and keeper fees; every payment is its own proposal.</p>
          </GlassCard>
          <GlassCard>
            <Eyebrow>Your voting power</Eyebrow>
            {isCouncil ? (
              <p className="text-sm text-white">Council member (2-of-3 multisig). 1 vote.</p>
            ) : (
              <p className="text-sm text-[#A1A1AA]">Phase 2 is council-only, so you can follow proposals but not vote yet.</p>
            )}
            <div className="mt-3 rounded-xl border border-white/[0.06] p-3 text-xs text-[#A1A1AA]">
              Phase 3 reputation weight: floor(√score) × min(jobs, 50)/50 ={" "}
              <span className="text-white font-semibold">{profile ? voterWeight(profile) : 0}</span>
              {profile && (
                <span>
                  {" "}
                  (score {profile.reputationScore}, {profile.completedJobs} jobs)
                </span>
              )}
              . No tradable token; the community mint exists only because Realms needs one.
            </div>
          </GlassCard>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Timelock" value="48 h" hint="minimum, every change" />
            <Stat label="Council veto" value="6 mo" hint="then the DAO votes on it" />
          </div>
        </aside>
      </div>
      {creating && <NewProposal onClose={() => setCreating(false)} current={current} />}
    </div>
  );
}

function ProposalCard({ p, now, me, council }: { p: Proposal; now: number; me: string | null; council: boolean }) {
  const tx = useTransaction();
  const myVote = me ? p.votes[me] : undefined;
  const total = Math.max(1, p.votesFor + p.votesAgainst + p.votesAbstain);
  return (
    <GlassCard>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[11px] font-mono text-[#71717A]">#{p.id}</span>
        <Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill>
        {p.status === "voting" && (
          <span className="text-[11px] text-[#A1A1AA]">
            voting ends in <Countdown to={p.votingEndsAt} now={now} />
          </span>
        )}
        {p.status === "timelock" && p.timelockEndsAt && (
          <span className="text-[11px] text-[#A1A1AA]">
            executes in <Countdown to={p.timelockEndsAt} now={now} />
          </span>
        )}
      </div>
      <div className="text-base font-semibold text-white">{p.title}</div>
      <p className="text-sm text-[#A1A1AA] mt-1">{p.description}</p>
      <div className="flex flex-col gap-1 mt-3">
        {p.changes.map((ch: SettingChange) => {
          const r = SETTING_RANGES[`${ch.account}.${ch.key}`];
          return (
            <div key={ch.key} className="text-xs font-mono text-[#D4D4D8] rounded-lg bg-white/[0.03] px-2.5 py-1.5">
              {ch.account}.{ch.key}: {r ? r.format(Number(ch.from)) : String(ch.from)} → <span className="text-[#FF6FAF]">{r ? r.format(Number(ch.to)) : String(ch.to)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex">
        <div className="bg-emerald-400/70" style={{ width: `${(p.votesFor / total) * 100}%` }} />
        <div className="bg-red-400/70" style={{ width: `${(p.votesAgainst / total) * 100}%` }} />
        <div className="bg-white/20" style={{ width: `${(p.votesAbstain / total) * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-[#A1A1AA]">
        <span>
          {p.votesFor} for · {p.votesAgainst} against · {p.votesAbstain} abstain · quorum {p.quorum} · by <PersonName address={p.author} />
        </span>
        {myVote && <span className="text-[#FF6FAF]">you voted {myVote}</span>}
      </div>
      {council && (p.status === "voting" || p.status === "timelock") && (
        <div className="flex flex-wrap gap-2 mt-4">
          {p.status === "voting" &&
            (["for", "against", "abstain"] as const).map((c) => (
              <TxButton key={c} size="sm" variant={c === "for" ? "primary" : "ghost"} className={c === "for" ? "" : "border border-white/10"} phase={tx.phase} onClick={() => tx.run("castVote", { proposal: p.id, choice: c }, `Vote ${c} on #${p.id}`)}>
                {c}
              </TxButton>
            ))}
          {p.status === "timelock" && p.timelockEndsAt && now >= p.timelockEndsAt && (
            <TxButton size="sm" phase={tx.phase} onClick={() => tx.run("executeProposal", { proposal: p.id }, `Execute #${p.id}`)}>
              Execute
            </TxButton>
          )}
          <TxButton size="sm" variant="ghost" className="border border-red-400/30 text-red-200" phase={tx.phase} onClick={() => tx.run("vetoProposal", { proposal: p.id }, `Veto #${p.id}`)}>
            <ShieldAlert size={13} className="mr-1" /> Council veto
          </TxButton>
        </div>
      )}
      <TxError error={tx.error} />
    </GlassCard>
  );
}

function NewProposal({ onClose, current }: { onClose: () => void; current: (k: string) => number }) {
  const keys = useMemo(() => Object.keys(SETTING_RANGES), []);
  const [key, setKey] = useState(keys[0]);
  const r = SETTING_RANGES[key];
  const [value, setValue] = useState(current(key));
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const tx = useTransaction();
  const [account, k] = key.split(".") as [SettingChange["account"], string];
  return (
    <Modal open onClose={onClose} title="New proposal">
      <div className="flex flex-col gap-4">
        <Field label="Setting">
          <select
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setValue(current(e.target.value));
            }}
            className={inputClass}
          >
            {keys.map((x) => (
              <option key={x} value={x} className="bg-[#0A0A0B]">
                {SETTING_RANGES[x].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`New value: ${r.format(value)} (now ${r.format(current(key))})`} hint={`Allowed ${r.format(r.min)} – ${r.format(r.max)}, enforced in program code.`}>
          <input type="range" min={r.min} max={r.max} step={r.step} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-[#FF6FAF]" />
        </Field>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={`Change ${r.label.toLowerCase()} to ${r.format(value)}`} />
        </Field>
        <Field label="Why">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={textareaClass} />
        </Field>
        <TxButton
          phase={tx.phase}
          onClick={async () => {
            const res = await tx.run("createProposal", { title: title || `Change ${r.label.toLowerCase()} to ${r.format(value)}`, description: desc, changes: [{ account, key: k, from: current(key), to: value }] }, "Create proposal");
            if (res.ok) onClose();
          }}
        >
          Open 3-day vote
        </TxButton>
        <TxError error={tx.error} />
      </div>
    </Modal>
  );
}

export default function GovernancePage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DataGate>
        <Governance />
      </DataGate>
    </section>
  );
}
