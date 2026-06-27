import { describe, it, expect } from "vitest";
import { classify, dedupe } from "./dedup";
import type { GitHubPort } from "./ports";
import type { PrState, PullRequest } from "./types";

let n = 0;
const pr = (state: PrState, descriptor = "oews-2026"): PullRequest => ({
  number: ++n,
  state,
  labels: [`data:${descriptor}`],
});

describe("classify — the three states + new (pure, injected facts)", () => {
  it("new: no PRs, no stub → propose", () => {
    expect(classify("oews-2026", [], false)).toEqual({
      descriptor: "oews-2026",
      state: "new",
      action: "propose",
    });
  });

  it("pending: an open labeled PR → skip", () => {
    const r = classify("oews-2026", [pr("open")], false);
    expect(r.state).toBe("pending");
    expect(r.action).toBe("skip");
  });

  it("declined: a closed-unmerged labeled PR → skip (no auto re-propose)", () => {
    const r = classify("oews-2026", [pr("closed_unmerged")], false);
    expect(r.state).toBe("declined");
    expect(r.action).toBe("skip");
  });

  it("merged via a merged PR → skip", () => {
    expect(classify("oews-2026", [pr("merged")], false).state).toBe("merged");
  });

  // The reason the skeleton exists: a merged edition whose bulk data was NOT
  // stored must still read as `merged` via the always-present provenance stub.
  it("merged via provenance stub with NO PR and NO bulk data → skip (Q-A/Q-E fix)", () => {
    const r = classify("oews-2026", [], true);
    expect(r.state).toBe("merged");
    expect(r.action).toBe("skip");
  });
});

describe("classify — precedence and descriptor isolation", () => {
  it("precedence: merged > pending > declined", () => {
    expect(
      classify("oews-2026", [pr("closed_unmerged"), pr("open"), pr("merged")], false).state,
    ).toBe("merged");
    expect(classify("oews-2026", [pr("closed_unmerged"), pr("open")], false).state).toBe("pending");
  });

  it("ignores PRs for other descriptors", () => {
    expect(classify("oews-2026", [pr("open", "onet-29.0")], false).state).toBe("new");
  });

  it("a revision is a distinct descriptor (a declined original does not block it)", () => {
    expect(classify("oews-2026r1", [pr("closed_unmerged", "oews-2026")], false).state).toBe("new");
  });
});

describe("dedupe — orchestrates the port, then classifies", () => {
  it("queries by label + stub existence and returns the classification", async () => {
    const calls: string[] = [];
    const fake: GitHubPort = {
      listPullRequestsByLabel: (label) => {
        calls.push(label);
        return Promise.resolve(label === "data:oews-2026" ? [pr("open")] : []);
      },
      provenanceStubExists: () => Promise.resolve(false),
    };
    const r = await dedupe(fake, "oews-2026");
    expect(calls).toEqual(["data:oews-2026"]);
    expect(r.state).toBe("pending");
  });

  it("respects the provenance stub from the port (merged)", async () => {
    const fake: GitHubPort = {
      listPullRequestsByLabel: () => Promise.resolve([]),
      provenanceStubExists: () => Promise.resolve(true),
    };
    expect((await dedupe(fake, "oews-2026")).state).toBe("merged");
  });
});
