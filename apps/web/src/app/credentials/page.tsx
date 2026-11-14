"use client";

import { useMemo, useState } from "react";
import { Download, FlipHorizontal2, ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { DataGate } from "@/components/app/data-gate";
import { GlassCard, Eyebrow } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, SourceNote, TxButton, TxError } from "@/components/proove/primitives";
import { CredentialCard3D, Poster, Scene3D } from "@/components/three";
import { useNow, useProfile, useSession } from "@/hooks/use-chain";
import { useChain } from "@/lib/mock/store";
import { formatDate, shortAddress } from "@proove/types/format";
import { hashDocument } from "@proove/types/hash";
import { useTransaction } from "@/lib/tx";
import type { Credential, CredentialSchema } from "@proove/types/types";

const SCHEMAS: { id: CredentialSchema; title: string; body: string; arbitratorOnly?: boolean }[] = [
  { id: "proove.work-summary.v1", title: "Work summary", body: "Jobs, on-time rate, rating, score and dispute record. No earnings." },
  { id: "proove.work-full.v1", title: "Work summary + earnings", body: "Everything above plus total earnings. Opt in only if you want to share it." },
  { id: "proove.arbitrator.v1", title: "Arbitrator record", body: "Cases decided, overturned on appeal, no-shows, stake.", arbitratorOnly: true },
];

/** W3C Verifiable Credential export (did:pkh subject) for verifiers outside Solana. */
function toW3C(c: Credential) {
  const doc = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", c.schema === "proove.arbitrator.v1" ? "ProoveArbitratorCredential" : "ProoveWorkCredential"],
    issuer: `did:pkh:solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:${c.issuer}`,
    validFrom: new Date(c.issuedAt * 1000).toISOString(),
    validUntil: new Date(c.expiresAt * 1000).toISOString(),
    credentialSubject: { id: `did:pkh:solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:${c.subject}`, schema: c.schema, ...c.fields, as_of_slot: c.asOfSlot },
    evidence: c.sources.map((s) => ({ type: "SolanaAccount", account: s.account, label: s.label, slot: c.asOfSlot })),
    credentialStatus: { type: "SolanaAttestation", id: c.address },
  };
  return { ...doc, proof: { type: "Ed25519Signature2020", verificationMethod: `${doc.issuer}#key-1`, proofValue: `z${hashDocument(doc).slice(0, 86)}` } };
}

function Credentials() {
  const { address, isArbitrator } = useSession();
  const now = useNow(60_000);
  const { profile } = useProfile(address);
  const all = useChain((s) => s.credentials);
  const mine = useMemo(() => all.filter((c) => c.subject === address), [all, address]);
  const [selected, setSelected] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [check, setCheck] = useState<Record<string, "ok" | "stale">>({});
  const tx = useTransaction();
  const current = mine.find((c) => c.address === selected) ?? mine[0];

  const verify = (c: Credential) => {
    if (!profile || c.schema === "proove.arbitrator.v1") return setCheck({ ...check, [c.address]: "ok" });
    const same = Number(c.fields.completed_jobs) === profile.completedJobs && Number(c.fields.reputation_score) === profile.reputationScore;
    setCheck({ ...check, [c.address]: same ? "ok" : "stale" });
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
      <PageHeader eyebrow="Self-sovereign identity" title="Credentials" description="Your Proove record as Solana Attestation Service credentials your wallet holds. Apps that have never heard of Proove can verify them, and every value is copied from on-chain accounts at a stated slot." />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        <div className="flex flex-col gap-5">
          <GlassCard>
            <Eyebrow>Issue a credential</Eyebrow>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SCHEMAS.map((s) => (
                <div key={s.id} className="rounded-2xl border border-white/[0.08] p-4 flex flex-col">
                  <div className="text-sm font-semibold text-white">{s.title}</div>
                  <div className="text-[10px] font-mono text-[#71717A] mb-2">{s.id}</div>
                  <p className="text-xs text-[#A1A1AA] flex-1">{s.body}</p>
                  <TxButton size="sm" className="mt-3" phase={tx.phase} disabled={s.arbitratorOnly && !isArbitrator} onClick={() => tx.run("issueCredential", { schema: s.id }, `Issue ${s.id}`)}>
                    {s.arbitratorOnly && !isArbitrator ? "Arbitrators only" : "Issue"}
                  </TxButton>
                </div>
              ))}
            </div>
            <TxError error={tx.error} />
            <p className="text-[11px] text-[#71717A] mt-3">Issued only when you ask; nothing is attested about a wallet automatically. Valid 90 days; re-issue for fresh numbers.</p>
          </GlassCard>

          <GlassCard>
            <Eyebrow>Your credentials ({mine.length})</Eyebrow>
            <div className="flex flex-col gap-3">
              {mine.map((c) => {
                const expired = now > c.expiresAt;
                return (
                  <div key={c.address} className={`rounded-2xl border p-4 ${current?.address === c.address ? "border-[#FF6FAF]/40" : "border-white/[0.08]"}`}>
                    <button onClick={() => { setSelected(c.address); setFlipped(false); }} className="w-full text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-mono text-white">{c.schema}</span>
                        {c.revoked ? <Pill tone="bad">revoked</Pill> : expired ? <Pill tone="warn">expired</Pill> : <Pill tone="good">active</Pill>}
                      </div>
                      <div className="text-[11px] text-[#71717A] mt-1">
                        attestation {shortAddress(c.address)} · issued {formatDate(c.issuedAt)} · expires {formatDate(c.expiresAt)}
                      </div>
                    </button>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-3">
                      {Object.entries(c.fields).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-[#71717A]">{k}</span> <span className="text-white">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      {c.sources.map((s) => (
                        <SourceNote key={s.account} account={s.account} slot={c.asOfSlot} label={s.label} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant="ghost" className="border border-white/10" onClick={() => verify(c)}>
                        Cross-check against the PDA
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="border border-white/10"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(toW3C(c), null, 2)], { type: "application/json" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `${c.schema}.vc.json`;
                          a.click();
                          URL.revokeObjectURL(a.href);
                        }}
                      >
                        <Download size={13} className="mr-1.5" /> Export W3C VC
                      </Button>
                      {!c.revoked && (
                        <TxButton size="sm" variant="ghost" className="border border-red-400/30 text-red-200" phase={tx.phase} onClick={() => tx.run("revokeCredential", { credential: c.address }, "Revoke credential")}>
                          Revoke
                        </TxButton>
                      )}
                    </div>
                    {check[c.address] === "ok" && (
                      <div className="text-xs text-emerald-300 mt-2 flex items-center gap-1.5">
                        <ShieldCheck size={13} /> Values match the account data at slot {c.asOfSlot.toLocaleString()}.
                      </div>
                    )}
                    {check[c.address] === "stale" && (
                      <div className="text-xs text-amber-300 mt-2 flex items-center gap-1.5">
                        <ShieldAlert size={13} /> Values matched at slot {c.asOfSlot.toLocaleString()}; the profile has changed since. Re-issue for fresh numbers.
                      </div>
                    )}
                  </div>
                );
              })}
              {mine.length === 0 && <Empty title="No credentials yet">Issue one above to carry your record to other apps.</Empty>}
            </div>
          </GlassCard>
        </div>

        <div className="flex flex-col gap-4">
          <GlassCard className="p-0 overflow-hidden">
            {current ? (
              <Scene3D className="h-[300px]" label={`Credential card for ${current.schema}; ${flipped ? "showing attested fields" : "showing front"}`} poster={<Poster />}>
                {(on) => (
                  <CredentialCard3D
                    active={on}
                    flipped={flipped}
                    revoked={current.revoked}
                    front={{ title: current.schema === "proove.arbitrator.v1" ? "Arbitrator record" : "Work record", subject: shortAddress(current.subject, 6), schema: current.schema }}
                    fields={Object.entries(current.fields).map(([k, v]) => [k, String(v)])}
                  />
                )}
              </Scene3D>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-[#71717A]">Issue a credential to see it here</div>
            )}
            {current && (
              <div className="p-4 pt-0">
                <Button size="sm" variant="ghost" className="border border-white/10 w-full" onClick={() => setFlipped((f) => !f)}>
                  <FlipHorizontal2 size={14} className="mr-1.5" /> {flipped ? "Show front" : "Show attested fields"}
                </Button>
              </div>
            )}
          </GlassCard>
          <GlassCard>
            <div className="flex items-center gap-2 mb-2">
              <Lock size={14} className="text-[#FF6FAF]" />
              <Eyebrow className="mb-0">Selective disclosure · Phase 3 stretch</Eyebrow>
            </div>
            <p className="text-xs text-[#A1A1AA]">Prove “score ≥ 700” or “20+ jobs, under 5% disputes lost” without revealing the numbers, with a small zero-knowledge circuit over the attested values.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="ghost" className="border border-white/10" disabled>
                Prove score ≥ 700
              </Button>
              <Button size="sm" variant="ghost" className="border border-white/10" disabled>
                Prove 20+ jobs
              </Button>
            </div>
          </GlassCard>
          <GlassCard>
            <Eyebrow>Verify anywhere</Eyebrow>
            <p className="text-xs text-[#A1A1AA]">
              On Solana: read the attestation from SAS and compare with the PDA at <span className="font-mono">as_of_slot</span>. Elsewhere: the exported W3C credential is signed by the issuer key with your wallet as subject (<span className="font-mono">did:pkh:solana:…</span>).
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export default function CredentialsPage() {
  return (
    <section className="min-h-[calc(100vh-72px)]">
      <DashboardNav role="freelancer" />
      <DataGate requireWallet>
        <Credentials />
      </DataGate>
    </section>
  );
}
