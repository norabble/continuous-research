import { describe, it, expect } from "vitest";
import { proposeDataPR, recordDecline, buildProposalContent } from "./flows";
import type { GitHubPort } from "./ports";
import { buildProvenanceStub } from "./provenance";

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
    provenanceStubExists: () => Promise.resolve(false),
    latestTrustedComment: () => Promise.resolve(null),
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
