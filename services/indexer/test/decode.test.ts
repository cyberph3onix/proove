import { describe, expect, it } from "vitest";
import { decodeAccount, decodeEventsFromLogs, toPlain } from "../src/decode";
import { ACCOUNT_HANDLERS } from "../src/handlers/accounts";
import { EVENT_HANDLERS } from "../src/handlers/events";
import { programById } from "../src/programs";
import { BN, PublicKey, bn, encodeAccount, eventLine, invocation, pk, program, programs } from "./helpers";

const byId = programById(programs);

describe("decodeEventsFromLogs", () => {
  it("decodes an Anchor event emitted by a top-level instruction", () => {
    const gig = pk();
    const client = pk();
    const logs = invocation("gig", [
      eventLine("gig", "GigCreated", { gig, id: bn(7), client, freelancer: PublicKey.default, created_at: bn(1_700_000_000) }),
    ]);
    const events = decodeEventsFromLogs(logs, byId);
    expect(events).toEqual([
      {
        program: "gig",
        name: "GigCreated",
        index: 0,
        data: { gig: gig.toBase58(), id: 7, client: client.toBase58(), freelancer: PublicKey.default.toBase58(), created_at: 1_700_000_000 },
      },
    ]);
  });

  it("attributes events through the CPI stack and numbers them in log order", () => {
    const gig = pk();
    const milestone = pk();
    const logs = invocation("escrow", [
      ...invocation("gig", [eventLine("gig", "GigInProgress", { gig, id: bn(1) })], 2),
      eventLine("escrow", "MilestoneFunded", { gig, milestone, amount: bn(5_000_000) }),
    ]);
    const events = decodeEventsFromLogs(logs, byId);
    expect(events.map((e) => [e.index, e.program, e.name])).toEqual([
      [0, "gig", "GigInProgress"],
      [1, "escrow", "MilestoneFunded"],
    ]);
    expect(events[1]!.data.amount).toBe(5_000_000);
  });

  it("skips data from unknown programs and lines that are not IDL events", () => {
    const stranger = pk().toBase58();
    const line = eventLine("gig", "GigPublished", { gig: pk(), id: bn(1) });
    const logs = [
      `Program ${stranger} invoke [1]`,
      line, // emitted by a program we do not index
      `Program ${stranger} success`,
      ...invocation("gig", ["Program data: AAAAAAAAAAAAAAAA", "Program data: not-base64!!", line]),
    ];
    const events = decodeEventsFromLogs(logs, byId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ program: "gig", name: "GigPublished", index: 0 });
  });

  it("decodes enum payloads (BadgeAwarded) to their variant name", () => {
    const logs = invocation("reputation", [
      eventLine("reputation", "BadgeAwarded", { badge: pk(), profile: pk(), badge_type: { TopRated: {} }, issued_at: bn(5) }),
    ]);
    expect(decodeEventsFromLogs(logs, byId)[0]!.data.badge_type).toBe("TopRated");
  });
});

describe("toPlain", () => {
  it("keeps safe integers as numbers and larger ones as strings", () => {
    expect(toPlain(new BN("9007199254740991"))).toBe(9007199254740991);
    expect(toPlain(new BN("18446744073709551615"))).toBe("18446744073709551615");
  });
  it("flattens unit enum variants and keeps byte arrays", () => {
    expect(toPlain({ InProgress: {} })).toBe("InProgress");
    expect(toPlain({ review_hash: [1, 2, 3] })).toEqual({ review_hash: [1, 2, 3] });
  });
});

describe("decodeAccount", () => {
  it("identifies and decodes a Gig account by discriminator", async () => {
    const data = await encodeAccount("gig", "Gig", {
      id: bn(3),
      client: pk(),
      freelancer: PublicKey.default,
      mint: pk(),
      status: { Published: {} },
      created_at: bn(10),
      updated_at: bn(11),
      title: "Logo design",
      description: "A logo",
      skills: "design, branding",
      category: "Design",
      budget: bn(250_000_000),
      deadline: bn(99),
      bump: 255,
    });
    const decoded = decodeAccount(program("gig"), data);
    expect(decoded).toMatchObject({ program: "gig", type: "Gig", data: { id: 3, status: "Published", budget: 250_000_000 } });
  });

  it("returns null for data with an unknown discriminator", () => {
    expect(decodeAccount(program("gig"), Buffer.alloc(64))).toBeNull();
  });
});

describe("handler tables", () => {
  it("has an event handler for every event in every IDL", () => {
    const missing = programs.flatMap((p) => (p.idl.events ?? []).map((e) => `${p.name}.${e.name}`)).filter((k) => !(k in EVENT_HANDLERS));
    expect(missing).toEqual([]);
  });

  it("has an account handler for every stateful IDL account", () => {
    const skipped = new Set(["achievement.AchievementConfig"]);
    const missing = programs
      .flatMap((p) => (p.idl.accounts ?? []).map((a) => `${p.name}.${a.name}`))
      .filter((k) => !skipped.has(k) && !(k in ACCOUNT_HANDLERS));
    expect(missing).toEqual([]);
  });
});
