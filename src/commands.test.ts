import { describe, it, expect } from "vitest";
import { runSense, runRecordDecline, runInit, runImpact } from "./commands";
import type { GitHubPort } from "./ports";

/** A full GitHubPort with succeeding inert defaults; override per test. */
function portWith(overrides: Partial<GitHubPort>): GitHubPort {
  return {
    listPullRequestsByLabel: () => Promise.resolve([]),
    provenanceStubExists: () => Promise.resolve(false),
    latestTrustedComment: () => Promise.resolve(null),
    readFileFromRef: () => Promise.resolve(null),
    defaultBranch: () => Promise.resolve("main"),
    branchHeadSha: () => Promise.resolve("sha"),
    createBranch: () => Promise.resolve(),
    putFile: () => Promise.resolve(),
    openPullRequest: () => Promise.resolve(7),
    addLabels: () => Promise.resolve(),
    ...overrides,
  };
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
      { path: ".github/workflows/interpretation.md", created: true },
      { path: ".github/workflows/comment-resolution.md", created: true },
    ]);
    expect(written).toEqual([
      ".github/workflows/sense.yml",
      ".github/workflows/decline.yml",
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
