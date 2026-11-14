"use client";

import { useRef, useState } from "react";
import { Lock, Upload, Wand2 } from "lucide-react";
import type { DeliveryFile, Milestone, VerificationReport } from "@proove/types/types";
import { Modal, Field, HashBadge, TxButton, TxError, textareaClass } from "@/components/proove/primitives";
import { Button } from "@/components/ui/button";
import { ReportView } from "./spec-report";
import { hashDocument, mockHash, sha256Hex } from "@proove/types/hash";
import { verifyDelivery } from "@/lib/mock/ai";
import { useChain } from "@/lib/mock/store";
import { useTransaction } from "@/lib/tx";
import { ZERO_HASH } from "@proove/types/types";
import { slotAt } from "@/lib/mock/instructions";
import { useNow } from "@/hooks/use-chain";

/**
 * Delivery flow (Feature 1, steps 4–5): hash each file's plaintext in the
 * browser, encrypt (AES-256-GCM, fresh key per milestone) and upload to
 * Arweave via Irys (mocked), run the Delivery Verifier, then commit
 * delivery_hash (manifest) and report_hash on-chain.
 */
export function DeliveryModal({ milestone, open, onClose }: { milestone: Milestone; open: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<DeliveryFile[]>([]);
  const [note, setNote] = useState("");
  const [hashing, setHashing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [skipAi, setSkipAi] = useState(false);
  const quality = useChain((s) => s.dev.deliveryQuality);
  const input = useRef<HTMLInputElement>(null);
  const tx = useTransaction();
  const now = useNow();

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setHashing(true);
    setReport(null);
    const added: DeliveryFile[] = [];
    for (const f of Array.from(list)) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const plaintextHash = sha256Hex(bytes);
      added.push({ name: f.name, size: f.size, mime: f.type || "application/octet-stream", plaintextHash, uri: `ar://${mockHash(plaintextHash + "ct").slice(0, 43)}` });
    }
    setFiles((prev) => [...prev, ...added]);
    setHashing(false);
  }

  function addSample() {
    setReport(null);
    setFiles((prev) => [...prev, { name: `delivery-${prev.length + 1}.zip`, size: 2_400_000, mime: "application/zip", plaintextHash: mockHash(`sample:${milestone.address}:${prev.length}:${Date.now()}`), uri: `ar://${mockHash(`ct:${prev.length}:${Date.now()}`).slice(0, 43)}` }]);
  }

  const manifest = { schema: "proove.delivery-manifest.v1", milestone: milestone.address, files: files.map((f) => ({ name: f.name, sha256: f.plaintextHash, size: f.size })) };
  const deliveryHash = files.length ? hashDocument(manifest) : ZERO_HASH;

  async function verify() {
    if (!milestone.spec) return;
    setVerifying(true);
    const r = await verifyDelivery({ milestone: milestone.address, spec: milestone.spec, files, note, submittedSlot: slotAt(now), quality });
    setReport(r);
    setVerifying(false);
  }

  async function submit() {
    const res = await tx.run(
      "submitDelivery",
      { milestone: milestone.address, files, note, deliveryHash, reportHash: report ? hashDocument(report) : ZERO_HASH, report: report ?? undefined },
      `Commit delivery: ${milestone.title}`,
    );
    if (res.ok) onClose();
  }

  const canSubmit = files.length > 0 && (report !== null || skipAi || !milestone.spec);

  return (
    <Modal open={open} onClose={onClose} title={`Deliver “${milestone.title}”`} wide>
      <div className="flex flex-col gap-4">
        <div
          className="rounded-2xl border border-dashed border-white/15 p-6 text-center hover:border-[#FF6FAF]/50 transition-colors cursor-pointer"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <Upload size={20} className="mx-auto text-[#FF6FAF] mb-2" />
          <div className="text-sm text-white">Drop files or click to choose</div>
          <div className="text-[11px] text-[#71717A] mt-1">
            Hashed and encrypted in your browser (AES-256-GCM). The key is wrapped for you and the client only, and later for dispute reviewers. Max 200 MB.
          </div>
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>
        <button onClick={addSample} className="self-start text-[11px] text-[#A1A1AA] hover:text-white -mt-2">
          No files handy? Add a sample file
        </button>

        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <Lock size={13} className="text-emerald-300 shrink-0" />
                  <span className="truncate text-white">{f.name}</span>
                </span>
                <span className="text-[10px] font-mono text-[#71717A]">sha256 {f.plaintextHash.slice(0, 10)}…</span>
              </li>
            ))}
          </ul>
        )}
        {hashing && <p className="text-xs text-[#A1A1AA]">Hashing…</p>}

        <Field label="Note to the client">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={textareaClass} placeholder="What's included, anything to look at first…" />
        </Field>

        {milestone.spec && (
          <div className="rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-sm font-semibold text-white">Delivery Verifier</div>
              <Button size="sm" variant="ghost" className="border border-white/10" disabled={!files.length || verifying} onClick={verify}>
                <Wand2 size={13} className="mr-1.5" />
                {verifying ? "Checking against the spec…" : report ? "Re-run check" : "Run check"}
              </Button>
            </div>
            {report ? (
              <ReportView report={report} spec={milestone.spec} />
            ) : (
              <p className="text-xs text-[#A1A1AA]">
                Gemini checks each acceptance criterion and cites where in your files it found the answer. The client sees this report; it never moves funds.{" "}
                <label className="inline-flex items-center gap-1.5 ml-1 cursor-pointer">
                  <input type="checkbox" checked={skipAi} onChange={(e) => setSkipAi(e.target.checked)} className="accent-[#FF6FAF]" /> deliver without a report
                </label>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <HashBadge label="delivery_hash" hash={deliveryHash} doc={files.length ? manifest : undefined} />
          <HashBadge label="report_hash" hash={report ? hashDocument(report) : ZERO_HASH} doc={report ?? undefined} />
        </div>

        <TxButton phase={tx.phase} size="lg" className="w-full" disabled={!canSubmit} onClick={submit}>
          Commit delivery on-chain
        </TxButton>
        <TxError error={tx.error} />
        <p className="text-[11px] text-[#71717A]">Submitting starts the clock: 20% releases to you after 72 h and the rest after 7 days unless the client approves sooner or raises a dispute.</p>
      </div>
    </Modal>
  );
}
