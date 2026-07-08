import { describe, it, expect } from "vitest";
import { runSense, runRecordDecline, runInit, runImpact, runSite, escalateDrift } from "./commands";
import type { GitHubPort, OpenPullRequest, OpenPullRequestInput, PutFileInput } from "./ports";
import type { Descriptor, PullRequest } from "./types";
import { provenancePathFor } from "./descriptor";
import { buildProvenanceStub, serializeProvenanceStub } from "./provenance";
import { COPY } from "./site-render";

/** A full GitHubPort with succeeding inert defaults; override per test. */
function portWith(overrides: Partial<GitHubPort>): GitHubPort {
  return {
    listPullRequestsByLabel: () => Promise.resolve([]),
    listOpenPullRequests: () => Promise.resolve([]),
    provenanceStubExists: () => Promise.resolve(false),
    latestTrustedComment: () => Promise.resolve(null),
    readFileFromRef: () => Promise.resolve(null),
    defaultBranch: () => Promise.resolve("main"),
    branchHeadSha: () => Promise.resolve("sha"),
    createBranch: () => Promise.resolve(),
    putFile: () => Promise.resolve(),
    openPullRequest: () => Promise.resolve(7),
    addLabels: () => Promise.resolve(),
    listOpenIssueNumbersByLabel: () => Promise.resolve([]),
    ensureLabel: () => Promise.resolve(),
    createIssue: () => Promise.resolve(7),
    commentOnIssue: () => Promise.resolve(),
    lockIssue: () => Promise.resolve(),
    ...overrides,
  };
}

/**
 * A recording GitHubPort for the issue-operations surface (drift escalation,
 * consumed by the upcoming `escalateDrift` command). Every other member is
 * inert, matching `portWith`'s defaults; these five record what was called
 * so a test can assert against them.
 */
class FakeGitHubPort implements GitHubPort {
  /** Settable: what listOpenIssueNumbersByLabel resolves to. */
  openDriftIssues: number[] = [];
  createdIssues: { title: string; body: string; labels: string[] }[] = [];
  issueComments: { issueNumber: number; body: string }[] = [];
  lockedIssues: number[] = [];
  ensuredLabels: { name: string; description: string; color: string }[] = [];

  listPullRequestsByLabel(_label: string): Promise<PullRequest[]> {
    return Promise.resolve([]);
  }
  listOpenPullRequests(): Promise<OpenPullRequest[]> {
    return Promise.resolve([]);
  }
  provenanceStubExists(_descriptor: Descriptor): Promise<boolean> {
    return Promise.resolve(false);
  }
  latestTrustedComment(_prNumber: number): Promise<string | null> {
    return Promise.resolve(null);
  }
  readFileFromRef(_ref: string, _path: string): Promise<string | null> {
    return Promise.resolve(null);
  }
  defaultBranch(): Promise<string> {
    return Promise.resolve("main");
  }
  branchHeadSha(_branch: string): Promise<string> {
    return Promise.resolve("sha");
  }
  createBranch(_branch: string, _fromSha: string): Promise<void> {
    return Promise.resolve();
  }
  putFile(_input: PutFileInput): Promise<void> {
    return Promise.resolve();
  }
  openPullRequest(_input: OpenPullRequestInput): Promise<number> {
    return Promise.resolve(7);
  }
  addLabels(_prNumber: number, _labels: string[]): Promise<void> {
    return Promise.resolve();
  }

  listOpenIssueNumbersByLabel(_label: string): Promise<number[]> {
    return Promise.resolve(this.openDriftIssues);
  }
  ensureLabel(name: string, description: string, color: string): Promise<void> {
    this.ensuredLabels.push({ name, description, color });
    return Promise.resolve();
  }
  createIssue(title: string, body: string, labels: string[]): Promise<number> {
    this.createdIssues.push({ title, body, labels });
    return Promise.resolve(42);
  }
  commentOnIssue(issueNumber: number, body: string): Promise<void> {
    this.issueComments.push({ issueNumber, body });
    return Promise.resolve();
  }
  lockIssue(issueNumber: number): Promise<void> {
    this.lockedIssues.push(issueNumber);
    return Promise.resolve();
  }
}

const sensorOutput = JSON.stringify({
  changed: true,
  descriptor: "btcusd-2026-06-27",
  source: "https://api.example/btc",
  retrievedAt: "2026-06-27T00:00:00Z",
  hash: "sha256:ab",
  artifacts: ["data/btcusd-2026-06-27.json"],
});

describe("runSense", () => {
  it("no change → action none", async () => {
    const out = await runSense({
      config: { sensor: "x" },
      runSensor: () => Promise.resolve('{"changed":false}'),
      port: portWith({}),
      readArtifact: () => Promise.resolve(""),
    });
    expect(out).toEqual({ action: "none", reason: "sensor reported no change" });
  });

  it("already pending → action skip (no proposal)", async () => {
    const out = await runSense({
      config: { sensor: "x" },
      runSensor: () => Promise.resolve(sensorOutput),
      port: portWith({
        listPullRequestsByLabel: () =>
          Promise.resolve([{ number: 1, state: "open", labels: ["data:btcusd-2026-06-27"] }]),
      }),
      readArtifact: () => Promise.resolve(""),
    });
    expect(out).toEqual({ action: "skip", state: "pending", descriptor: "btcusd-2026-06-27" });
  });

  it("new → proposes, reads artifacts, returns PR info", async () => {
    const read: string[] = [];
    const out = await runSense({
      config: { sensor: "x" },
      runSensor: () => Promise.resolve(sensorOutput),
      port: portWith({}),
      readArtifact: (path) => {
        read.push(path);
        return Promise.resolve("{}");
      },
    });
    expect(out).toEqual({
      action: "proposed",
      descriptor: "btcusd-2026-06-27",
      prNumber: 7,
      branch: "data/btcusd-2026-06-27",
    });
    expect(read).toEqual(["data/btcusd-2026-06-27.json"]);
  });
});

describe("runRecordDecline", () => {
  it("uses the latest comment as the reason", async () => {
    let committed = "";
    const port = portWith({
      latestTrustedComment: () => Promise.resolve("looks anomalous, wait for revision"),
      putFile: (i) => {
        committed = i.content;
        return Promise.resolve();
      },
    });
    await runRecordDecline({
      port,
      descriptor: "btcusd-2026-06-27",
      prNumber: 3,
      declinedAt: "2026-06-27T00:00:00Z",
    });
    expect(committed).toContain("looks anomalous, wait for revision");
  });

  it("falls back to a default when there are no comments", async () => {
    let committed = "";
    const port = portWith({
      latestTrustedComment: () => Promise.resolve(null),
      putFile: (i) => {
        committed = i.content;
        return Promise.resolve();
      },
    });
    await runRecordDecline({
      port,
      descriptor: "btcusd-2026-06-27",
      prNumber: 3,
      declinedAt: "2026-06-27T00:00:00Z",
    });
    expect(committed).toContain("Closed without merge");
  });
});

describe("runInit", () => {
  it("writes every scaffold file and reports created vs existing", async () => {
    const written: string[] = [];
    const existing = new Set([".research/config.json"]);
    const results = await runInit({
      writeIfAbsent: (path, _content) => {
        if (existing.has(path)) return Promise.resolve(false);
        written.push(path);
        return Promise.resolve(true);
      },
    });
    expect(results).toEqual([
      { path: ".research/config.json", created: false },
      { path: ".github/workflows/sense.yml", created: true },
      { path: ".github/workflows/decline.yml", created: true },
      { path: ".github/workflows/site.yml", created: true },
      { path: ".github/workflows/interpretation.md", created: true },
      { path: ".github/workflows/comment-resolution.md", created: true },
    ]);
    expect(written).toEqual([
      ".github/workflows/sense.yml",
      ".github/workflows/decline.yml",
      ".github/workflows/site.yml",
      ".github/workflows/interpretation.md",
      ".github/workflows/comment-resolution.md",
    ]);
  });
});

describe("runImpact", () => {
  const config = {
    sensor: "x",
    impact: { enabled: true, resultsPath: "data/${descriptor}.json", findings: "findings.md" },
  };
  const findings = "<!-- claim: trend | backs: close | status: supported -->\n";

  it("throws when the impact layer is disabled", async () => {
    await expect(
      runImpact({
        config: { sensor: "x" },
        port: portWith({}),
        readWorkingFile: () => Promise.resolve("{}"),
        descriptor: "btcusd-2026-07-01",
      }),
    ).rejects.toThrow(/impact layer/);
  });

  it("first edition (no --against) → baseline null, no changed keys", async () => {
    const out = await runImpact({
      config,
      port: portWith({}),
      readWorkingFile: (p) =>
        Promise.resolve(p === "findings.md" ? findings : JSON.stringify({ close: 100 })),
      descriptor: "btcusd-2026-07-01",
    });
    expect(out.baseline).toBeNull();
    expect(out.changed).toEqual([]);
    expect(out.affected).toEqual([]);
  });

  it("diffs against the prior edition and flags the affected claim", async () => {
    const priorResults = JSON.stringify({ close: 90 });
    const out = await runImpact({
      config,
      port: portWith({
        defaultBranch: () => Promise.resolve("main"),
        readFileFromRef: (ref, path) => {
          expect(ref).toBe("main");
          if (path === "data/btcusd-2026-06-30.json") return Promise.resolve(priorResults);
          if (path === "findings.md") return Promise.resolve(findings);
          return Promise.resolve(null);
        },
      }),
      readWorkingFile: (p) =>
        Promise.resolve(p === "findings.md" ? findings : JSON.stringify({ close: 100 })),
      descriptor: "btcusd-2026-07-01",
      against: "btcusd-2026-06-30",
    });
    expect(out.baseline).toBe("btcusd-2026-06-30");
    expect(out.changed).toEqual([{ key: "close", from: 90, to: 100 }]);
    expect(out.affected).toEqual([{ claimId: "trend", backs: ["close"], status: "supported" }]);
    expect(out.lint).toEqual([
      {
        level: "warn",
        claimId: "trend",
        message: 'backing changed but status "supported" was not touched',
      },
    ]);
  });

  it("throws when --against names a baseline whose results are absent (fail closed)", async () => {
    await expect(
      runImpact({
        config,
        port: portWith({ readFileFromRef: () => Promise.resolve(null) }),
        readWorkingFile: (p) =>
          Promise.resolve(p === "findings.md" ? findings : JSON.stringify({ close: 100 })),
        descriptor: "btcusd-2026-07-01",
        against: "btcusd-2026-06-30",
      }),
    ).rejects.toThrow(/btcusd-2026-06-30/);
  });

  it("rejects an invalid descriptor before touching the filesystem", async () => {
    await expect(
      runImpact({
        config,
        port: portWith({}),
        readWorkingFile: () => Promise.resolve("{}"),
        descriptor: "../evil",
      }),
    ).rejects.toThrow(/Invalid descriptor/);
  });
});

describe("runSite", () => {
  const T = "2026-07-06T00:00:00Z";

  function pr(overrides: Partial<OpenPullRequest>): OpenPullRequest {
    return {
      number: 1,
      title: "untitled",
      labels: [],
      authorLogin: "continuous-research-bot[bot]",
      createdAt: T,
      headRef: "data/x",
      htmlUrl: "https://github.com/o/r/pull/1",
      ...overrides,
    };
  }

  function indexOf(files: Awaited<ReturnType<typeof runSite>>): string {
    const file = files?.find((f) => f.path === "index.html");
    if (!file) throw new Error("index.html missing from rendered site");
    return file.content;
  }

  it("returns null when the site block is absent", async () => {
    expect(
      await runSite({
        config: { sensor: "x" },
        port: portWith({}),
        generatedAt: T,
        fallbackTitle: "o/r",
        repoSlug: null,
      }),
    ).toBeNull();
  });

  it("returns null when the site block is present but disabled", async () => {
    expect(
      await runSite({
        config: { sensor: "x", site: { enabled: false } },
        port: portWith({}),
        generatedAt: T,
        fallbackTitle: "o/r",
        repoSlug: null,
      }),
    ).toBeNull();
  });

  it("excludes non-bot PRs entirely, even data-labeled ones", async () => {
    const files = await runSite({
      config: { sensor: "x", site: { enabled: true } },
      port: portWith({
        listOpenPullRequests: () =>
          Promise.resolve([
            pr({
              title: "Add Q3 data",
              labels: ["data:btcusd-2026-06-27"],
              authorLogin: "ryan-technorabble",
            }),
          ]),
      }),
      generatedAt: T,
      fallbackTitle: "o/r",
      repoSlug: null,
    });
    expect(files).not.toBeNull();
    const index = indexOf(files);
    expect(index).toContain(COPY.pendingEmpty);
    expect(index).not.toContain(COPY.maintenanceHeading);
    expect(index).not.toContain("Add Q3 data");
  });

  it("builds a PendingUpdate from a bot data-PR's branch files, not the default branch", async () => {
    const provenance = buildProvenanceStub({
      descriptor: "btcusd-2026-06-27",
      source: "https://api.example/btc",
      retrievedAt: "2026-06-27T00:00:00Z",
      hash: "sha256:ab",
    });
    const refsByPath: Record<string, string[]> = {};
    const files = await runSite({
      config: { sensor: "x", site: { enabled: true } },
      port: portWith({
        listOpenPullRequests: () =>
          Promise.resolve([
            pr({
              title: "data: btcusd-2026-06-27",
              labels: ["data:btcusd-2026-06-27"],
              headRef: "data/btcusd-2026-06-27",
              htmlUrl: "https://github.com/o/r/pull/2",
            }),
          ]),
        readFileFromRef: (ref, path) => {
          (refsByPath[path] ??= []).push(ref);
          if (path === ".research/impact/btcusd-2026-06-27.md") {
            return Promise.resolve("The close price moved from 90 to 100, an 11% increase.");
          }
          if (path === provenancePathFor("btcusd-2026-06-27")) {
            return Promise.resolve(serializeProvenanceStub(provenance));
          }
          if (path === "findings.md") return Promise.resolve("# Findings\n");
          return Promise.resolve(null);
        },
      }),
      generatedAt: T,
      fallbackTitle: "o/r",
      repoSlug: null,
    });
    expect(files).not.toBeNull();
    const index = indexOf(files);
    expect(index).toContain("close price moved");
    // The head-ref-vs-default-branch rule, pinned: impact + provenance come
    // from the PR's branch; only findings.md comes from the default branch.
    expect(refsByPath[".research/impact/btcusd-2026-06-27.md"]).toEqual(["data/btcusd-2026-06-27"]);
    expect(refsByPath[provenancePathFor("btcusd-2026-06-27")]).toEqual(["data/btcusd-2026-06-27"]);
    expect(refsByPath["findings.md"]).toEqual(["main"]);
  });

  it("treats a bot PR without a data label as maintenance", async () => {
    const readPaths: string[] = [];
    const files = await runSite({
      config: { sensor: "x", site: { enabled: true } },
      port: portWith({
        listOpenPullRequests: () =>
          Promise.resolve([
            pr({
              title: "Bump dependency",
              labels: ["chore"],
              authorLogin: "dependabot[bot]",
              headRef: "dependabot/npm/foo",
              htmlUrl: "https://github.com/o/r/pull/3",
            }),
          ]),
        readFileFromRef: (_ref, path) => {
          readPaths.push(path);
          return Promise.resolve(null);
        },
      }),
      generatedAt: T,
      fallbackTitle: "o/r",
      repoSlug: null,
    });
    expect(files).not.toBeNull();
    const index = indexOf(files);
    expect(index).toContain(COPY.maintenanceHeading);
    expect(index).toContain("Bump dependency");
    // no impact/provenance lookups for a PR that never had a descriptor
    expect(readPaths).toEqual(["findings.md"]);
  });

  it("marks impact and provenance as null when absent on the branch", async () => {
    const files = await runSite({
      config: { sensor: "x", site: { enabled: true } },
      port: portWith({
        listOpenPullRequests: () =>
          Promise.resolve([
            pr({
              title: "data: btcusd-2026-07-04",
              labels: ["data:btcusd-2026-07-04"],
              headRef: "data/btcusd-2026-07-04",
              htmlUrl: "https://github.com/o/r/pull/4",
            }),
          ]),
        readFileFromRef: () => Promise.resolve(null),
      }),
      generatedAt: T,
      fallbackTitle: "o/r",
      repoSlug: null,
    });
    expect(files).not.toBeNull();
    const index = indexOf(files);
    expect(index).toContain(COPY.assessmentPending);
  });

  it("propagates a provenance parse error (fail closed)", async () => {
    await expect(
      runSite({
        config: { sensor: "x", site: { enabled: true } },
        port: portWith({
          listOpenPullRequests: () =>
            Promise.resolve([
              pr({
                title: "data: btcusd-2026-07-05",
                labels: ["data:btcusd-2026-07-05"],
                headRef: "data/btcusd-2026-07-05",
                htmlUrl: "https://github.com/o/r/pull/5",
              }),
            ]),
          readFileFromRef: (_ref, path) =>
            path === provenancePathFor("btcusd-2026-07-05")
              ? Promise.resolve("not json")
              : Promise.resolve(null),
        }),
        generatedAt: T,
        fallbackTitle: "o/r",
        repoSlug: null,
      }),
    ).rejects.toThrow();
  });

  it("uses config.site.title when present, else the CLI-supplied fallback", async () => {
    const withTitle = await runSite({
      config: { sensor: "x", site: { enabled: true, title: "BTC-USD, continuously" } },
      port: portWith({}),
      generatedAt: T,
      fallbackTitle: "o/r",
      repoSlug: null,
    });
    expect(indexOf(withTitle)).toContain("BTC-USD, continuously");

    const withoutTitle = await runSite({
      config: { sensor: "x", site: { enabled: true } },
      port: portWith({}),
      generatedAt: T,
      fallbackTitle: "o/r",
      repoSlug: null,
    });
    expect(indexOf(withoutTitle)).toContain("o/r");
  });
});

describe("FakeGitHubPort (recording fake for the issue-operations surface)", () => {
  it("records createIssue/commentOnIssue/lockIssue and returns settable openDriftIssues", async () => {
    const github = new FakeGitHubPort();
    expect(await github.listOpenIssueNumbersByLabel("sensor-drift")).toEqual([]);

    github.openDriftIssues = [17];
    expect(await github.listOpenIssueNumbersByLabel("sensor-drift")).toEqual([17]);

    const issueNumber = await github.createIssue("t", "b", ["sensor-drift"]);
    expect(issueNumber).toBe(42);
    expect(github.createdIssues).toEqual([{ title: "t", body: "b", labels: ["sensor-drift"] }]);

    await github.commentOnIssue(17, "hello");
    expect(github.issueComments).toEqual([{ issueNumber: 17, body: "hello" }]);

    await github.lockIssue(17);
    expect(github.lockedIssues).toEqual([17]);

    await github.ensureLabel("sensor-drift", "desc", "B60205");
    expect(github.ensuredLabels).toEqual([
      { name: "sensor-drift", description: "desc", color: "B60205" },
    ]);
  });
});

describe("escalateDrift", () => {
  const report = JSON.stringify({ reason: "fetch-failed", detail: "x" });

  it("no-ops without a report", async () => {
    const github = new FakeGitHubPort();
    const out = await escalateDrift({
      github,
      readReport: () => Promise.resolve(null),
      log: () => {},
    });
    expect(out).toEqual({ outcome: "no-drift" });
    expect(github.createdIssues).toHaveLength(0);
  });

  it("creates, labels, and locks the first drift issue", async () => {
    const github = new FakeGitHubPort(); // fake returns e.g. number 42 on create
    const out = await escalateDrift({
      github,
      readReport: () => Promise.resolve(report),
      log: () => {},
    });
    expect(out).toEqual({ outcome: "created", issueNumber: 42 });
    expect(github.createdIssues[0]!.labels).toContain("sensor-drift");
    expect(github.lockedIssues).toContain(42);
  });

  it("comments on and re-locks an existing open drift issue", async () => {
    const github = new FakeGitHubPort();
    github.openDriftIssues = [17];
    const out = await escalateDrift({
      github,
      readReport: () => Promise.resolve(report),
      log: () => {},
    });
    expect(out).toEqual({ outcome: "commented", issueNumber: 17 });
    expect(github.issueComments[0]!.issueNumber).toBe(17);
    expect(github.lockedIssues).toContain(17);
  });
});
