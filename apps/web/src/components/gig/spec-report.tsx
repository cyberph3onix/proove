"use client";

import { CheckCircle2, CircleHelp, FileText, XCircle, Dices } from "lucide-react";
import type { DeliveryFile, MilestoneSpec, VerificationReport } from "@/lib/domain/types";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { shortHash } from "@/lib/domain/format";

const CHECK_LABEL = { automatic: "automatic", sampled: "sample audit", manual: "client judgement" } as const;

export function SpecView({ spec }: { spec: MilestoneSpec }) {
  return (
    <div className="flex flex-col gap-2">
      {spec.deliverables.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {spec.deliverables.map((d) => (
            <Pill key={d.id}>
              {d.kind} · {d.format}
            </Pill>
          ))}
        </div>
      )}
      <ol className="flex flex-col gap-1.5">
        {spec.criteria.map((c) => (
          <li key={c.id} className="flex gap-2 text-sm">
            <span className="font-mono text-[11px] text-[#71717A] pt-0.5 w-6 shrink-0">{c.id}</span>
            <span className="text-[#E4E4E7] flex-1">{c.text}</span>
            <span className="text-[10px] text-[#A1A1AA] whitespace-nowrap pt-0.5">
              {CHECK_LABEL[c.check]}
              {c.check === "sampled" && ` · n=${c.sample_size} · ≥${Math.round((c.pass_threshold ?? 0.9) * 100)}%`}
            </span>
          </li>
        ))}
      </ol>
      {spec.generated_by && (
        <div className="text-[10px] text-[#71717A] mt-1">
          Drafted by {spec.generated_by.model} (prompt {shortHash(spec.generated_by.prompt_version)}){spec.edited_by_client ? ", edited by the client" : ""}
        </div>
      )}
    </div>
  );
}

const VERDICT = {
  pass: { icon: CheckCircle2, cls: "text-emerald-300", label: "pass" },
  fail: { icon: XCircle, cls: "text-red-300", label: "fail" },
  unclear: { icon: CircleHelp, cls: "text-amber-300", label: "unclear" },
} as const;

/** Criterion-by-criterion report next to the delivered files. Advisory only. */
export function ReportView({ report, spec, files }: { report: VerificationReport; spec?: MilestoneSpec; files?: DeliveryFile[] }) {
  const passed = report.findings.filter((f) => f.verdict === "pass").length;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
      <div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-sm font-semibold text-white">
            {passed}/{report.findings.length} criteria pass
          </span>
          <Pill>advice only · moves no funds</Pill>
        </div>
        <ul className="flex flex-col gap-2">
          {report.findings.map((f) => {
            const v = VERDICT[f.verdict];
            const crit = spec?.criteria.find((c) => c.id === f.criterion);
            return (
              <li key={f.criterion} className="rounded-xl border border-white/[0.06] p-3">
                <div className="flex items-start gap-2">
                  <v.icon size={16} className={cn("mt-0.5 shrink-0", v.cls)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">{crit?.text ?? f.criterion}</div>
                    <div className="text-xs text-[#A1A1AA] mt-0.5">{f.note}</div>
                    {f.evidence.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {f.evidence.map((e, i) => (
                          <span key={i} className="text-[10px] font-mono text-[#D4D4D8] rounded-md bg-white/[0.05] px-1.5 py-0.5">
                            {e.file}
                            {e.locator ? ` › ${e.locator}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={cn("text-[11px] tabular-nums", v.cls)}>{Math.round(f.confidence * 100)}%</span>
                </div>
              </li>
            );
          })}
        </ul>
        {report.samples.map((s) => (
          <div key={s.criterion} className="mt-3 rounded-xl border border-white/[0.06] p-3 text-xs text-[#A1A1AA]">
            <div className="flex items-center gap-1.5 text-[#D4D4D8] mb-1">
              <Dices size={13} className="text-[#FF6FAF]" /> Random sample audit for {s.criterion}: {Math.round(s.agreementRate * 100)}% agreement
            </div>
            Seed = slot hash of slot {s.seedSlot.toLocaleString()} (submission + 2), <span className="font-mono">{shortHash(s.seed)}</span>. Neither side could pick or re-roll it. {s.items.length} items: <span className="font-mono">{s.items.slice(0, 6).join(", ")}…</span>
          </div>
        ))}
        <p className="text-sm text-[#D4D4D8] mt-3 leading-relaxed">{report.summary}</p>
        <div className="text-[10px] text-[#71717A] mt-2">
          {report.model} · prompt {shortHash(report.prompt_version)} · {report.input_hashes.length} input hashes recorded, so anyone can rerun it
        </div>
      </div>
      {files && files.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#A1A1AA] mb-2">Delivered files</div>
          <ul className="flex flex-col gap-1.5">
            {files.map((f) => (
              <li key={f.name} className="rounded-xl border border-white/[0.06] p-2.5">
                <div className="flex items-center gap-2 text-sm text-white min-w-0">
                  <FileText size={14} className="text-[#FF6FAF] shrink-0" />
                  <span className="truncate">{f.name}</span>
                </div>
                <div className="text-[10px] text-[#71717A] mt-1 font-mono truncate" title={f.plaintextHash}>
                  {(f.size / 1_000_000).toFixed(1)} MB · sha256 {shortHash(f.plaintextHash)}
                </div>
                <div className="text-[10px] text-[#71717A] font-mono truncate">AES-256-GCM · {f.uri.slice(0, 22)}…</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
