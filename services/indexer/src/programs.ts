import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import { PROGRAM_IDS, type ProgramIds } from "@proove/config";
import type { ProgramName } from "@proove/types/types";
import achievementIdl from "./idl/achievement.json" with { type: "json" };
import escrowIdl from "./idl/escrow.json" with { type: "json" };
import gigIdl from "./idl/gig.json" with { type: "json" };
import reputationIdl from "./idl/reputation.json" with { type: "json" };

/** Programs the indexer decodes. Add a new program here with its IDL. */
export type IndexedProgram = keyof ProgramIds & ProgramName;

export interface ProgramDef {
  name: IndexedProgram;
  programId: string;
  idl: Idl;
  coder: BorshCoder;
}

const IDLS: Record<IndexedProgram, Idl> = {
  gig: gigIdl as Idl,
  escrow: escrowIdl as Idl,
  reputation: reputationIdl as Idl,
  achievement: achievementIdl as Idl,
};

export function buildPrograms(ids: ProgramIds = PROGRAM_IDS): ProgramDef[] {
  return (Object.keys(IDLS) as IndexedProgram[]).map((name) => {
    // The IDL's own address is the build-time one; the config is authoritative.
    const idl = { ...IDLS[name], address: ids[name] };
    return { name, programId: ids[name], idl, coder: new BorshCoder(idl) };
  });
}

export function programById(programs: ProgramDef[]): Map<string, ProgramDef> {
  return new Map(programs.map((p) => [p.programId, p]));
}
