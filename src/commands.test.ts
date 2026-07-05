import { describe, it, expect } from "vitest";
import { runSense, runRecordDecline, runInit } from "./commands";
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
