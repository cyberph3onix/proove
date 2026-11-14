import type { DeliveryFile, MilestoneSpec, VerificationReport } from "@proove/types/types";
import { AI_URL } from "@/lib/chain/mode";

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Calls the Phase 1 delivery verifier. The service validates the schema. */
export async function verifyDelivery(params: {
  milestone: string;
  spec: MilestoneSpec;
  files: DeliveryFile[];
  note: string;
  submittedSlot: number;
}): Promise<VerificationReport> {
  if (!AI_URL) throw new AiUnavailableError("AI service is not configured (NEXT_PUBLIC_AI_URL).");
  const res = await fetch(`${AI_URL}/v1/delivery/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { reason?: string; message?: string } | null;
    throw new AiUnavailableError(body?.message ?? body?.reason ?? `AI service returned ${res.status}`);
  }
  const body = (await res.json()) as { doc?: VerificationReport };
  if (!body.doc) throw new AiUnavailableError("AI service returned no report");
  return body.doc;
}
