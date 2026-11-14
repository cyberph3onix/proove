import { describe, expect, it } from "vitest";
import { PROGRAM_IDS } from "@proove/config";
import { IDLS } from "./index";

describe("@proove/idl", () => {
  it("IDL addresses match the program IDs in @proove/config", () => {
    for (const [name, idl] of Object.entries(IDLS)) {
      expect(idl.address, name).toBe(PROGRAM_IDS[name as keyof typeof PROGRAM_IDS]);
    }
  });

  it("escrow exposes the agreement-layer instructions", () => {
    const names = IDLS.escrow.instructions.map((i) => i.name);
    for (const n of ["accept_terms", "refund_after_deadline", "init_protocol_config", "update_protocol_config"]) {
      expect(names).toContain(n);
    }
  });
});
