import { describe, it, expect } from "vitest";
import { proposeDataPR, recordDecline, recordVerification, buildProposalContent } from "./flows";
import type { GitHubPort } from "./ports";
import { buildProvenanceStub, parseProvenanceStub, serializeProvenanceStub } from "./provenance";

const provenance = buildProvenanceStub({
  descriptor: "oews-2026",
  source: "https://example.test/oesm26.zip",
  retrievedAt: "2026-06-27T00:00:00Z",
  hash: "sha256:abc123",
});

/** A fake port that records the sequence and arguments of every call. */
function recordingPort(): { port: GitHubPort; calls: string[] } {
  const calls: string[] = [];
  const port: GitHubPort = {
    listPullRequestsByLabel: () => Promise.resolve([]),
    listOpenPullRequests: () => Promise.resolve([]),
    provenanceStubExists: () => Promise.resolve(false),
    latestTrustedComment: () => Promise.resolve(null),
    readFileFromRef: () => Promise.resolve(null),
    defaultBranch: () => {
      calls.push("defaultBranch");
      return Promise.resolve("main");
    },
    branchHeadSha: (branch) => {
      calls.push(`sha:${branch}`);
      return Promise.resolve("base-sha");
    },
    createBranch: (branch, fromSha) => {
      calls.push(`createBranch:${branch}@${fromSha}`);
      return Promise.resolve();
    },
    putFile: (i) => {
      calls.push(`putFile:${i.branch}:${i.path}`);
      return Promise.resolve();
    },
    openPullRequest: (i) => {
      calls.push(`openPR:${i.head}->${i.base}:${i.title}`);
      return Promise.resolve(42);
    },
    addLabels: (n, labels) => {
      calls.push(`addLabels:${n}:${labels.join(",")}`);
      return Promise.resolve();
    },
    // flows.ts never calls these (drift escalation lives in commands.ts) —
    // inert, like the other reads/writes above that this file's flows don't touch.
    listOpenIssueNumbersByLabel: () => Promise.resolve([]),
    ensureLabel: () => Promise.resolve(),
    createIssue: () => Promise.resolve(0),
    commentOnIssue: () => Promise.resolve(),
    lockIssue: () => Promise.resolve(),
  };
  return { port, calls };
}

describe("buildProposalContent", () => {
  it("titles by descriptor and embeds provenance", () => {
    const { title, body } = buildProposalContent({ descriptor: "oews-2026", provenance });
    expect(title).toBe("data: oews-2026");
    expect(body).toContain("## New data: oews-2026");
    expect(body).toContain("https://example.test/oesm26.zip");
    expect(body).toContain("sha256:abc123");
  });
});

describe("proposeDataPR", () => {
  it("creates the branch, commits files, opens the PR, then labels it — in order", async () => {
    const { port, calls } = recordingPort();
    const result = await proposeDataPR(port, {
      descriptor: "oews-2026",
      provenance,
      artifacts: [{ path: "data/placeholder.txt", content: "x" }],
    });
    expect(result).toEqual({ prNumber: 42, branch: "data/oews-2026" });
    expect(calls).toEqual([
      "defaultBranch",
      "sha:main",
      "createBranch:data/oews-2026@base-sha",
      "putFile:data/oews-2026:.research/provenance/oews-2026.json",
      "putFile:data/oews-2026:data/placeholder.txt",
      "openPR:data/oews-2026->main:data: oews-2026",
      "addLabels:42:data:oews-2026",
    ]);
  });
});

describe("recordDecline", () => {
  it("commits the decline record to the default branch", async () => {
    const { port, calls } = recordingPort();
    await recordDecline(port, {
      descriptor: "oews-2026",
      reason: "not yet",
      declinedAt: "2026-06-27T00:00:00Z",
    });
    expect(calls).toEqual(["defaultBranch", "putFile:main:.research/decisions/oews-2026.md"]);
  });
});

describe("recordVerification", () => {
  /** A port whose default branch holds `stub`, capturing what gets written back. */
  function portWithStub(stubJson: string | null) {
    const { port, calls } = recordingPort();
    const written: string[] = [];
    return {
      calls,
      written,
      port: {
        ...port,
        readFileFromRef: (ref: string, path: string) => {
          calls.push(`read:${ref}:${path}`);
          return Promise.resolve(stubJson);
        },
        putFile: (i: { branch: string; path: string; content: string; message: string }) => {
          calls.push(`putFile:${i.branch}:${i.path}:${i.message}`);
          written.push(i.content);
          return Promise.resolve();
        },
      } satisfies GitHubPort,
    };
  }

  const merge = { by: "human:rbaker5", at: "2026-07-28T09:00:00Z" };

  it("appends the merge to the edition's own stub on the default branch", async () => {
    const { port, calls, written } = portWithStub(serializeProvenanceStub(provenance));
    expect(await recordVerification(port, { descriptor: "oews-2026", ...merge })).toEqual({
      recorded: true,
    });
    expect(calls).toEqual([
      "defaultBranch",
      "read:main:.research/provenance/oews-2026.json",
      "putFile:main:.research/provenance/oews-2026.json:verify(oews-2026): record merge",
    ]);
    expect(parseProvenanceStub(written[0] as string).verified).toEqual([merge]);
  });

  it("does not write when that exact verification is already recorded", async () => {
    const already = serializeProvenanceStub({ ...provenance, verified: [merge] });
    const { port, calls, written } = portWithStub(already);
    expect(await recordVerification(port, { descriptor: "oews-2026", ...merge })).toEqual({
      recorded: false,
    });
    expect(written).toEqual([]);
    expect(calls.some((c) => c.startsWith("putFile"))).toBe(false);
  });

  it("keeps an earlier verification when a second, different one arrives", async () => {
    const first = { by: "process:auto-merge", at: "2026-07-01T00:00:00Z" };
    const { port, written } = portWithStub(
      serializeProvenanceStub({ ...provenance, verified: [first] }),
    );
    await recordVerification(port, { descriptor: "oews-2026", ...merge });
    expect(parseProvenanceStub(written[0] as string).verified).toEqual([first, merge]);
  });

  // A merge we cannot attach to an edition must fail the workflow, not pass
  // quietly — the decline path already lost records exactly that way.
  it("throws rather than inventing a stub when none is on the default branch", async () => {
    const { port } = portWithStub(null);
    await expect(recordVerification(port, { descriptor: "oews-2026", ...merge })).rejects.toThrow(
      /is not on main/,
    );
  });
});
