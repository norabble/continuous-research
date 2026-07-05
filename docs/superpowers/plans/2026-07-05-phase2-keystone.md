# Phase 2 Keystone — Mechanical Impact Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic engine half of Phase 2's mechanical impact
layer — the `impact` command (results diff → affected claims) + the
consistency-linter + the `impact` config toggle — as pure, unit-tested TS.

**Architecture:** Pure cores (results diff, annotation parser, affected-claim
selection, linter) behind a thin injectable command (`runImpact`, mirroring
`runSense`) and CLI shell, per ports-and-adapters (design rule 1). The command
takes its diff **baseline explicitly** (`--against <prior descriptor>`); when
omitted it is the first edition (no diff — fail closed, never a guessed
baseline). Reading the prior edition's `results.json` off the default branch is
the one new port method.

**Tech Stack:** TypeScript ESM (strict) · Node ≥ 22 · vitest · Octokit.

## Global Constraints

- Repo: the framework `norabble/continuous-research`. Work on `main`; commit
  per task; **do not push** until the plan is complete and reviewed.
- ESM only; `import type` for type-only imports (`verbatimModuleSyntax`).
- Ports-and-adapters: the diff / parser / affected / linter cores stay **pure**
  (no I/O), unit-tested with injected facts — no GitHub, no fs. I/O lives in the
  CLI shell (`cli.ts`) and the Octokit adapter (`github.ts`).
- Vocabulary: CONCEPT.md canonical terms + the [Phase 2 glossary](../../phase-2-plan.md#glossary). No synonyms.
- `npm run check` (typecheck + lint + format + tests) must pass before each commit.
- Commit trailer naming the working model, e.g.
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Scope (per the roadmap seam + advisor):** this plan is the **deterministic
  engine only**. The agent-body rewire and the dual-engine (`gh-aw` /
  `claude-code-action`) scaffold wiring are a **separate follow-on plan** — they
  are live-qualified, not unit-tested, and depend on these commands existing.
  **Auto-discovery of the previous edition is out of scope** (deferred; the
  baseline is explicit here).

## File structure

- `src/config.ts` (modify) — add optional `impact` block to `ResearchConfig`.
- `src/results.ts` (create) — `flattenResults`, `diffResults`, `resolveResultsPath`, `ChangedKey`.
- `src/annotations.ts` (create) — `parseAnnotations`, `ClaimIndex`, `Annotation`.
- `src/impact.ts` (create) — `affectedClaims` (segment-boundary matching).
- `src/linter.ts` (create) — `lintConsistency`, `LintFinding`.
- `src/ports.ts` (modify) — add `readFileFromRef`.
- `src/github.ts` (modify) — implement `readFileFromRef` (Octokit `getContent`).
- `src/commands.ts` (modify) — add `runImpact` + `ImpactArtifact` / `ImpactDeps`.
- `src/cli.ts` (modify) — `impact <descriptor> [--against <prior>]` dispatch.
- Co-located `src/*.test.ts` for each.

---

### Task 1: config — optional `impact` block

**Files:** Modify `src/config.ts`; Modify `src/config.test.ts`.

**Interfaces:**
- Produces: `ResearchConfig.impact?: ImpactConfig` where
  `ImpactConfig = { enabled: boolean; resultsPath?: string; findings?: string; linter?: boolean; agentEngine?: "gh-aw" | "claude-code" }`.

- [ ] **Step 1: Failing tests** — append to `src/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig — impact block", () => {
  it("defaults impact to absent (layer off) for a Phase-1 config", () => {
    expect(parseConfig('{"sensor":"x"}').impact).toBeUndefined();
  });

  it("parses an impact block", () => {
    const c = parseConfig(
      '{"sensor":"x","impact":{"enabled":true,"resultsPath":"data/${descriptor}.json","linter":true,"agentEngine":"claude-code"}}',
    );
    expect(c.impact).toEqual({
      enabled: true,
      resultsPath: "data/${descriptor}.json",
      linter: true,
      agentEngine: "claude-code",
    });
  });

  it("rejects a non-boolean impact.enabled", () => {
    expect(() => parseConfig('{"sensor":"x","impact":{"enabled":"yes"}}')).toThrow(/impact.enabled/);
  });

  it("rejects an unknown agentEngine", () => {
    expect(() => parseConfig('{"sensor":"x","impact":{"enabled":true,"agentEngine":"copilot"}}')).toThrow(
      /agentEngine/,
    );
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/config.test.ts` — FAIL (`impact` not on the type / not parsed).

- [ ] **Step 3: Implement** — replace the body of `src/config.ts` with:

```ts
/**
 * `.research/config` — the instance's declaration of its hooks (design rule 2:
 * hooks are declared, not discovered) plus the optional Phase-2 `impact` toggle
 * block (every disableable Phase-2 feature hangs here — CONCEPT Phasing).
 */

export type AgentEngine = "gh-aw" | "claude-code";

export interface ImpactConfig {
  /** Master toggle for the mechanical impact layer + linter. Default off. */
  enabled: boolean;
  /** Where the edition's results.json lives; `${descriptor}` is substituted. */
  resultsPath?: string;
  /** Prose file the claim index is parsed from. Default "findings.md". */
  findings?: string;
  /** Consistency-linter on/off. Default true when enabled. */
  linter?: boolean;
  /** Which substrate `init` scaffolds the agent body for (engine unaffected). */
  agentEngine?: AgentEngine;
}

export interface ResearchConfig {
  /** Shell command the engine runs to detect new data (writes JSON to stdout). */
  sensor: string;
  /** Optional Phase-2 impact layer config; absent ⇒ layer off. */
  impact?: ImpactConfig;
}

function parseImpact(raw: unknown): ImpactConfig {
  if (typeof raw !== "object" || raw === null) throw new Error('config "impact" must be an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") throw new Error('config "impact.enabled" must be a boolean');
  const out: ImpactConfig = { enabled: o.enabled };
  if (o.resultsPath !== undefined) {
    if (typeof o.resultsPath !== "string") throw new Error('config "impact.resultsPath" must be a string');
    out.resultsPath = o.resultsPath;
  }
  if (o.findings !== undefined) {
    if (typeof o.findings !== "string") throw new Error('config "impact.findings" must be a string');
    out.findings = o.findings;
  }
  if (o.linter !== undefined) {
    if (typeof o.linter !== "boolean") throw new Error('config "impact.linter" must be a boolean');
    out.linter = o.linter;
  }
  if (o.agentEngine !== undefined) {
    if (o.agentEngine !== "gh-aw" && o.agentEngine !== "claude-code") {
      throw new Error('config "impact.agentEngine" must be "gh-aw" or "claude-code"');
    }
    out.agentEngine = o.agentEngine;
  }
  return out;
}

export function parseConfig(json: string): ResearchConfig {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null) throw new Error("config must be a JSON object");
  const obj = data as Record<string, unknown>;
  const sensor = obj.sensor;
  if (typeof sensor !== "string" || sensor.trim() === "") {
    throw new Error('config "sensor" must be a non-empty string command');
  }
  const config: ResearchConfig = { sensor };
  if (obj.impact !== undefined) config.impact = parseImpact(obj.impact);
  return config;
}
```

- [ ] **Step 4: Run** `npx vitest run src/config.test.ts` — PASS.
- [ ] **Step 5: Commit** — `git add src/config.ts src/config.test.ts && git commit` (`config: optional impact toggle block`).

### Task 2: results — flatten, diff, path resolution

**Files:** Create `src/results.ts`, `src/results.test.ts`.

**Interfaces:**
- Produces: `interface ChangedKey { key: string; from: unknown; to: unknown }`;
  `flattenResults(obj: unknown): Map<string, unknown>` (dotted leaf paths;
  recurses plain objects only, arrays/primitives are leaves);
  `diffResults(prev: unknown, next: unknown): ChangedKey[]`;
  `resolveResultsPath(template: string, descriptor: string): string`.

- [ ] **Step 1: Failing tests** — `src/results.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { flattenResults, diffResults, resolveResultsPath } from "./results";

describe("flattenResults", () => {
  it("dots nested objects, leaves arrays/primitives whole", () => {
    const m = flattenResults({ close: 100, recent: { "2026-06-30": 110 }, tags: [1, 2] });
    expect(m.get("close")).toBe(100);
    expect(m.get("recent.2026-06-30")).toBe(110);
    expect(m.get("tags")).toEqual([1, 2]);
  });
});

describe("diffResults", () => {
  it("reports changed, added, and removed leaves", () => {
    const prev = { close: 100, ma7: 90, gone: 1 };
    const next = { close: 110, ma7: 90, added: 2 };
    expect(diffResults(prev, next)).toEqual([
      { key: "close", from: 100, to: 110 },
      { key: "gone", from: 1, to: undefined },
      { key: "added", from: undefined, to: 2 },
    ]);
  });

  it("no changes → empty", () => {
    expect(diffResults({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toEqual([]);
  });
});

describe("resolveResultsPath", () => {
  it("substitutes ${descriptor}", () => {
    expect(resolveResultsPath("data/btcusd/${descriptor}.json", "btcusd-2026-07-01")).toBe(
      "data/btcusd/btcusd-2026-07-01.json",
    );
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/results.test.ts` — FAIL (module absent).

- [ ] **Step 3: Implement** `src/results.ts`:

```ts
/**
 * The mechanical results diff (Phase 2, Q-B). Pure: flatten each results.json
 * to dotted leaf paths, then compare. The diffable unit is the committed
 * results.json (CONCEPT canonical term).
 */

export interface ChangedKey {
  key: string;
  from: unknown;
  to: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Dotted leaf paths → values. Recurses plain objects only; arrays are leaves. */
export function flattenResults(obj: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!isPlainObject(obj)) {
    if (prefix !== "") out.set(prefix, obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix === "" ? k : `${prefix}.${k}`;
    if (isPlainObject(v)) for (const [ik, iv] of flattenResults(v, key)) out.set(ik, iv);
    else out.set(key, v);
  }
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function diffResults(prev: unknown, next: unknown): ChangedKey[] {
  const p = flattenResults(prev);
  const n = flattenResults(next);
  const changed: ChangedKey[] = [];
  for (const [key, to] of n) {
    if (!p.has(key)) changed.push({ key, from: undefined, to });
    else if (!same(p.get(key), to)) changed.push({ key, from: p.get(key), to });
  }
  for (const [key, from] of p) if (!n.has(key)) changed.push({ key, from, to: undefined });
  return changed;
}

export function resolveResultsPath(template: string, descriptor: string): string {
  return template.replaceAll("${descriptor}", descriptor);
}
```

- [ ] **Step 4: Run** `npx vitest run src/results.test.ts` — PASS.
- [ ] **Step 5: Commit** (`results: pure results.json flatten + diff`).

### Task 3: annotations — parse the claim grammar

**Files:** Create `src/annotations.ts`, `src/annotations.test.ts`.

**Interfaces:**
- Produces: `interface Annotation { claimId: string; backs: string[]; status: string; line: number }`;
  `interface ClaimIndex { byId: Map<string, Annotation>; duplicates: string[]; malformed: { line: number; text: string }[] }`;
  `parseAnnotations(findingsMd: string): ClaimIndex`.
- Grammar: an HTML comment
  `<!-- claim: <id> | backs: <key>[, <key>...] | status: <status> -->`. `backs`
  keys are dotted result paths or the literal `(prose)`. Tolerant: comment-ish
  lines that don't match are collected in `malformed`, not thrown.

- [ ] **Step 1: Failing tests** — `src/annotations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAnnotations } from "./annotations";

describe("parseAnnotations", () => {
  it("parses flat keys, dotted paths, and (prose)", () => {
    const md = [
      "Prose about BTC.",
      "<!-- claim: btc-short-term-trend | backs: close, ma7, close_vs_ma7_pct, ma7_trend | status: supported -->",
      "More prose.",
      "<!-- claim: google-rpd | backs: google.free.gemini-3.1-flash-lite.rpd | status: supported -->",
      "<!-- claim: session-budget | backs: (prose) | status: supported -->",
    ].join("\n");
    const idx = parseAnnotations(md);
    expect(idx.byId.get("btc-short-term-trend")?.backs).toEqual([
      "close",
      "ma7",
      "close_vs_ma7_pct",
      "ma7_trend",
    ]);
    expect(idx.byId.get("btc-short-term-trend")?.status).toBe("supported");
    expect(idx.byId.get("btc-short-term-trend")?.line).toBe(2);
    expect(idx.byId.get("google-rpd")?.backs).toEqual(["google.free.gemini-3.1-flash-lite.rpd"]);
    expect(idx.byId.get("session-budget")?.backs).toEqual(["(prose)"]);
  });

  it("collects malformed annotation-ish lines, records duplicates, does not throw", () => {
    const md = [
      "<!-- claim: a | backs: x | status: supported -->",
      "<!-- claim: a | backs: y | status: weakened -->",
      "<!-- claim: broken | status: supported -->",
    ].join("\n");
    const idx = parseAnnotations(md);
    expect(idx.byId.get("a")?.backs).toEqual(["x"]); // first wins
    expect(idx.duplicates).toEqual(["a"]);
    expect(idx.malformed).toHaveLength(1);
    expect(idx.malformed[0].line).toBe(3);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/annotations.test.ts` — FAIL (module absent).

- [ ] **Step 3: Implement** `src/annotations.ts`:

```ts
/**
 * The inline claim annotation (Phase 2, Q-B): structure holds only the linkage,
 * never the claim. Pure parser → the derived claim index (a cache, never a
 * source of truth). Tolerant by design (graceful degradation).
 */

export interface Annotation {
  claimId: string;
  backs: string[];
  status: string;
  line: number;
}

export interface ClaimIndex {
  byId: Map<string, Annotation>;
  duplicates: string[];
  malformed: { line: number; text: string }[];
}

// <!-- claim: <id> | backs: <keys> | status: <status> -->
const RE = /^<!--\s*claim:\s*(.+?)\s*\|\s*backs:\s*(.+?)\s*\|\s*status:\s*(.+?)\s*-->$/;
const looksLikeAnnotation = (t: string) => /^<!--\s*claim:/.test(t);

export function parseAnnotations(findingsMd: string): ClaimIndex {
  const byId = new Map<string, Annotation>();
  const duplicates: string[] = [];
  const malformed: { line: number; text: string }[] = [];
  findingsMd.split("\n").forEach((raw, i) => {
    const text = raw.trim();
    const m = RE.exec(text);
    if (!m) {
      if (looksLikeAnnotation(text)) malformed.push({ line: i + 1, text });
      return;
    }
    const claimId = m[1];
    const backs = m[2].split(",").map((s) => s.trim()).filter((s) => s !== "");
    const annotation: Annotation = { claimId, backs, status: m[3], line: i + 1 };
    if (byId.has(claimId)) {
      if (!duplicates.includes(claimId)) duplicates.push(claimId);
      return; // first wins
    }
    byId.set(claimId, annotation);
  });
  return { byId, duplicates, malformed };
}
```

- [ ] **Step 4: Run** `npx vitest run src/annotations.test.ts` — PASS.
- [ ] **Step 5: Commit** (`annotations: pure claim-annotation parser`).

### Task 4: impact — affected claims (segment-boundary matching)

**Files:** Create `src/impact.ts`, `src/impact.test.ts`.

**Interfaces:**
- Consumes: `ChangedKey` (Task 2), `ClaimIndex` / `Annotation` (Task 3).
- Produces: `affectedClaims(changed: ChangedKey[], index: ClaimIndex): Annotation[]`
  — an annotation is affected iff some non-`(prose)` backs key `b` and some
  changed key `c` satisfy `c === b || c.startsWith(b + ".")`.

- [ ] **Step 1: Failing tests** — `src/impact.test.ts` (note the adversarial pair):

```ts
import { describe, it, expect } from "vitest";
import { affectedClaims } from "./impact";
import { parseAnnotations } from "./annotations";
import type { ChangedKey } from "./results";

const index = parseAnnotations(
  [
    "<!-- claim: trend | backs: close, ma7 | status: supported -->",
    "<!-- claim: derived | backs: close_vs_ma7_pct | status: supported -->",
    "<!-- claim: subtree | backs: google.free | status: supported -->",
    "<!-- claim: proseonly | backs: (prose) | status: supported -->",
  ].join("\n"),
);
const chg = (key: string): ChangedKey => ({ key, from: 1, to: 2 });

describe("affectedClaims", () => {
  it("matches exact keys", () => {
    expect(affectedClaims([chg("close")], index).map((a) => a.claimId)).toEqual(["trend"]);
  });

  it("does NOT match on substring — close must not hit close_vs_ma7_pct", () => {
    const ids = affectedClaims([chg("close")], index).map((a) => a.claimId);
    expect(ids).not.toContain("derived");
  });

  it("matches a subtree backs key when a leaf under it changes", () => {
    const ids = affectedClaims([chg("google.free.gemini-3.1-flash-lite.rpd")], index).map((a) => a.claimId);
    expect(ids).toEqual(["subtree"]);
  });

  it("never matches (prose) claims", () => {
    expect(affectedClaims([chg("anything")], index).map((a) => a.claimId)).not.toContain("proseonly");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/impact.test.ts` — FAIL (module absent).

- [ ] **Step 3: Implement** `src/impact.ts`:

```ts
/**
 * Affected-claim selection (Phase 2, Q-B): given the results diff and the
 * derived claim index, the claims whose backing changed — the exact passages the
 * agent re-examines. Pure. Segment-boundary matching so `close` does not match
 * `close_vs_ma7_pct`.
 */

import type { ChangedKey } from "./results";
import type { Annotation, ClaimIndex } from "./annotations";

const backed = (backsKey: string, changed: ChangedKey[]): boolean =>
  backsKey !== "(prose)" &&
  changed.some((c) => c.key === backsKey || c.key.startsWith(`${backsKey}.`));

export function affectedClaims(changed: ChangedKey[], index: ClaimIndex): Annotation[] {
  return [...index.byId.values()].filter((a) => a.backs.some((b) => backed(b, changed)));
}
```

- [ ] **Step 4: Run** `npx vitest run src/impact.test.ts` — PASS.
- [ ] **Step 5: Commit** (`impact: affected-claim selection (segment-boundary)`).

### Task 5: linter — deterministic consistency checks

**Files:** Create `src/linter.ts`, `src/linter.test.ts`.

**Interfaces:**
- Consumes: `flattenResults` (Task 2), `ChangedKey` (Task 2), `ClaimIndex` (Task 3).
- Produces: `type LintLevel = "error" | "warn"`;
  `interface LintFinding { level: LintLevel; claimId?: string; message: string }`;
  `interface LintInput { results: unknown; index: ClaimIndex; changed: ChangedKey[]; priorIndex?: ClaimIndex }`;
  `lintConsistency(input: LintInput): LintFinding[]`.
- Checks (CONCEPT Q-D): (a) every non-`(prose)` backs key resolves in
  `results.json`; (b) duplicate/malformed annotations (ill-formed ids); (c)
  **stale status** — a claim whose backing changed but whose `status` equals its
  `priorIndex` status (only when `priorIndex` given). Advisory; never a gate.

- [ ] **Step 1: Failing tests** — `src/linter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lintConsistency } from "./linter";
import { parseAnnotations } from "./annotations";
import type { ChangedKey } from "./results";

const chg = (key: string): ChangedKey => ({ key, from: 1, to: 2 });

describe("lintConsistency", () => {
  it("flags a backs key missing from results.json", () => {
    const index = parseAnnotations("<!-- claim: c | backs: nope | status: supported -->");
    const out = lintConsistency({ results: { close: 100 }, index, changed: [] });
    expect(out).toContainEqual({ level: "error", claimId: "c", message: expect.stringContaining("nope") });
  });

  it("accepts a subtree backs key resolved by a nested result", () => {
    const index = parseAnnotations("<!-- claim: c | backs: google.free | status: supported -->");
    const out = lintConsistency({ results: { google: { free: { rpd: 500 } } }, index, changed: [] });
    expect(out).toEqual([]);
  });

  it("reports duplicates and malformed annotations", () => {
    const index = parseAnnotations(
      [
        "<!-- claim: a | backs: close | status: supported -->",
        "<!-- claim: a | backs: close | status: supported -->",
        "<!-- claim: bad | status: supported -->",
      ].join("\n"),
    );
    const out = lintConsistency({ results: { close: 1 }, index, changed: [] });
    expect(out.some((f) => f.message.includes("duplicate"))).toBe(true);
    expect(out.some((f) => f.message.includes("malformed"))).toBe(true);
  });

  it("warns when a claim's backing changed but its status was not touched", () => {
    const priorIndex = parseAnnotations("<!-- claim: c | backs: close | status: supported -->");
    const index = parseAnnotations("<!-- claim: c | backs: close | status: supported -->");
    const out = lintConsistency({ results: { close: 2 }, index, changed: [chg("close")], priorIndex });
    expect(out).toContainEqual({ level: "warn", claimId: "c", message: expect.stringContaining("status") });
  });

  it("no warning when status was touched", () => {
    const priorIndex = parseAnnotations("<!-- claim: c | backs: close | status: supported -->");
    const index = parseAnnotations("<!-- claim: c | backs: close | status: weakened -->");
    const out = lintConsistency({ results: { close: 2 }, index, changed: [chg("close")], priorIndex });
    expect(out.filter((f) => f.level === "warn")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/linter.test.ts` — FAIL (module absent).

- [ ] **Step 3: Implement** `src/linter.ts`:

```ts
/**
 * Deterministic consistency-linter (Phase 2, Q-D). Advisory — it produces
 * findings, never a merge gate (human review is the spine). Pure.
 */

import { flattenResults, type ChangedKey } from "./results";
import type { ClaimIndex } from "./annotations";

export type LintLevel = "error" | "warn";

export interface LintFinding {
  level: LintLevel;
  claimId?: string;
  message: string;
}

export interface LintInput {
  results: unknown;
  index: ClaimIndex;
  changed: ChangedKey[];
  priorIndex?: ClaimIndex;
}

const resolves = (backsKey: string, keys: string[]): boolean =>
  keys.some((k) => k === backsKey || k.startsWith(`${backsKey}.`));

export function lintConsistency(input: LintInput): LintFinding[] {
  const findings: LintFinding[] = [];
  const resultKeys = [...flattenResults(input.results).keys()];

  for (const claimId of input.index.duplicates) {
    findings.push({ level: "error", claimId, message: `duplicate claim id "${claimId}"` });
  }
  for (const m of input.index.malformed) {
    findings.push({ level: "error", message: `malformed annotation at line ${m.line}: ${m.text}` });
  }

  for (const a of input.index.byId.values()) {
    for (const b of a.backs) {
      if (b === "(prose)") continue;
      if (!resolves(b, resultKeys)) {
        findings.push({ level: "error", claimId: a.claimId, message: `backs key "${b}" not found in results.json` });
      }
    }
  }

  if (input.priorIndex) {
    const changedBacked = (backs: string[]): boolean =>
      backs.some((b) => b !== "(prose)" && input.changed.some((c) => c.key === b || c.key.startsWith(`${b}.`)));
    for (const a of input.index.byId.values()) {
      const prior = input.priorIndex.byId.get(a.claimId);
      if (prior && changedBacked(a.backs) && prior.status === a.status) {
        findings.push({
          level: "warn",
          claimId: a.claimId,
          message: `backing changed but status "${a.status}" was not touched`,
        });
      }
    }
  }

  return findings;
}
```

- [ ] **Step 4: Run** `npx vitest run src/linter.test.ts` — PASS.
- [ ] **Step 5: Commit** (`linter: deterministic advisory consistency checks`).

### Task 6: port — read a file from a ref

**Files:** Modify `src/ports.ts`; Modify `src/github.ts`; Modify `src/github.test.ts` (if present — otherwise assert via the fake in Task 7).

**Interfaces:**
- Produces on `GitHubPort`: `readFileFromRef(ref: string, path: string): Promise<string | null>`
  — the UTF-8 content of `path` at `ref`, or `null` if it does not exist.

- [ ] **Step 1: Add to the `GitHubPort` interface** in `src/ports.ts`, under `// --- reads ---`:

```ts
  /** UTF-8 content of `path` at `ref` (branch/sha/tag), or null if absent. */
  readFileFromRef(ref: string, path: string): Promise<string | null>;
```

- [ ] **Step 2: Implement in `src/github.ts`** on `OctokitGitHubPort`, mirroring
  the existing `putFile` `getContent` idiom (fields `this.octokit`/`this.owner`/
  `this.repo`; reuse the file-level `isNotFoundError` helper and the already-
  imported `Buffer` — both present in the file):

```ts
  async readFileFromRef(ref: string, path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });
      if (Array.isArray(data) || data.type !== "file") return null;
      return Buffer.from(data.content, data.encoding as BufferEncoding).toString("utf8");
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }
```

- [ ] **Step 3: Typecheck** `npm run typecheck` — PASS (the interface and adapter agree). If a `github.test.ts` exercises the port, add a case that a 404 yields `null`; otherwise the fake in Task 7 covers the contract.
- [ ] **Step 4: Commit** (`port: readFileFromRef for prior-edition reads`).

### Task 7: runImpact — the injectable command body

**Files:** Modify `src/commands.ts`; Modify `src/commands.test.ts`.

**Interfaces:**
- Consumes: `ResearchConfig` (Task 1), `GitHubPort.readFileFromRef` (Task 6),
  `diffResults` / `resolveResultsPath` (Task 2), `parseAnnotations` (Task 3),
  `affectedClaims` (Task 4), `lintConsistency` (Task 5).
- Produces:
  `interface ImpactArtifact { edition: string; baseline: string | null; changed: ChangedKey[]; affected: { claimId: string; backs: string[]; status: string }[]; lint: LintFinding[] }`;
  `interface ImpactDeps { config: ResearchConfig; port: GitHubPort; readWorkingFile: (path: string) => Promise<string>; descriptor: string; against?: string }`;
  `runImpact(deps: ImpactDeps): Promise<ImpactArtifact>`.
- Behavior: requires `config.impact?.enabled` (else throws). `against` given ⇒
  read prior results + prior findings from the default branch and diff; absent ⇒
  `baseline: null`, `changed: []` (first edition — no guessed baseline).

- [ ] **Step 1: Failing tests** — append to `src/commands.test.ts` (reuse its
  `portWith`; add `readFileFromRef` to the fake's defaults first — see Step 3):

```ts
import { runImpact } from "./commands";

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
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/commands.test.ts` — FAIL (`runImpact`
  missing; `readFileFromRef` missing on the fake).

- [ ] **Step 3: Add `readFileFromRef` to the `portWith` fake defaults** in
  `src/commands.test.ts` (inside the returned object):

```ts
    readFileFromRef: () => Promise.resolve(null),
```

- [ ] **Step 4: Implement `runImpact`** — append to `src/commands.ts` (add the
  imports at the top: `import type { ChangedKey } from "./results";`
  `import { diffResults, resolveResultsPath } from "./results";`
  `import { parseAnnotations, type ClaimIndex } from "./annotations";`
  `import { affectedClaims } from "./impact";`
  `import { lintConsistency, type LintFinding } from "./linter";`):

```ts
export interface ImpactArtifact {
  edition: string;
  baseline: string | null;
  changed: ChangedKey[];
  affected: { claimId: string; backs: string[]; status: string }[];
  lint: LintFinding[];
}

export interface ImpactDeps {
  config: ResearchConfig;
  port: GitHubPort;
  /** Reads a file from the PR working tree (the checked-out branch). */
  readWorkingFile: (path: string) => Promise<string>;
  descriptor: string;
  /** The prior merged edition to diff against; absent ⇒ first edition. */
  against?: string;
}

export async function runImpact(deps: ImpactDeps): Promise<ImpactArtifact> {
  const impact = deps.config.impact;
  if (!impact?.enabled) throw new Error("impact layer is disabled (config.impact.enabled)");
  if (!impact.resultsPath) throw new Error("config.impact.resultsPath is required");
  const findingsPath = impact.findings ?? "findings.md";

  const next: unknown = JSON.parse(await deps.readWorkingFile(resolveResultsPath(impact.resultsPath, deps.descriptor)));
  const index = parseAnnotations(await deps.readWorkingFile(findingsPath));

  let changed: ChangedKey[] = [];
  let baseline: string | null = null;
  let priorIndex: ClaimIndex | undefined;
  if (deps.against) {
    const base = await deps.port.defaultBranch();
    const priorRaw = await deps.port.readFileFromRef(base, resolveResultsPath(impact.resultsPath, deps.against));
    const prev: unknown = priorRaw ? JSON.parse(priorRaw) : {};
    changed = diffResults(prev, next);
    baseline = deps.against;
    const priorFindings = await deps.port.readFileFromRef(base, findingsPath);
    if (priorFindings !== null) priorIndex = parseAnnotations(priorFindings);
  }

  const affected = affectedClaims(changed, index).map((a) => ({
    claimId: a.claimId,
    backs: a.backs,
    status: a.status,
  }));
  const lint = impact.linter === false ? [] : lintConsistency({ results: next, index, changed, priorIndex });

  return { edition: deps.descriptor, baseline, changed, affected, lint };
}
```

- [ ] **Step 5: Run** `npx vitest run src/commands.test.ts` — PASS.
- [ ] **Step 6: Commit** (`commands: runImpact wires diff + affected + lint`).

### Task 8: CLI — `impact <descriptor> [--against <prior>]`

**Files:** Modify `src/cli.ts`.

**Interfaces:**
- Consumes: `runImpact` (Task 7), `parseConfig` (Task 1),
  `createGitHubPortFromEnv` (existing).
- Produces: the `impact` command — writes
  `.research/impact/<descriptor>.impact.json` into the working tree and logs a
  one-line summary. Exit 0 on success, 1 on error (existing top-level handler).

- [ ] **Step 1: Implement `cmdImpact`** in `src/cli.ts` — add the import
  `import { runSense, runRecordDecline, runInit, runImpact } from "./commands";`
  (extend the existing import), then add:

```ts
function parseImpactArgs(argv: string[]): { descriptor: string; against?: string } {
  const descriptor = argv[3];
  if (!descriptor || descriptor.startsWith("-")) throw new Error("usage: impact <descriptor> [--against <prior>]");
  const i = argv.indexOf("--against");
  const against = i !== -1 ? argv[i + 1] : undefined;
  if (i !== -1 && !against) throw new Error("--against requires a prior descriptor");
  return { descriptor, against };
}

async function cmdImpact(): Promise<number> {
  const { descriptor, against } = parseImpactArgs(process.argv);
  const config = parseConfig(await readFile(".research/config.json", "utf8"));
  const port = createGitHubPortFromEnv(process.env);
  const artifact = await runImpact({
    config,
    port,
    readWorkingFile: (path) => readFile(path, "utf8"),
    descriptor,
    against,
  });
  const outPath = `.research/impact/${descriptor}.impact.json`;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `[impact] ${descriptor} baseline=${artifact.baseline ?? "none"} changed=${artifact.changed.length} affected=${artifact.affected.length} lint=${artifact.lint.length} → ${outPath}`,
  );
  return 0;
}
```

- [ ] **Step 2: Register the command** — add `impact: cmdImpact,` to the `COMMANDS` map in `src/cli.ts`.

- [ ] **Step 3: Verify wiring** `npm run typecheck` — PASS. Then a no-network
  smoke run of the arg parser + disabled-layer path:

```bash
npm run cli -- impact 2>&1 | grep -q "usage: impact" && echo "usage guard OK"
```

Expected: `usage: impact` guard fires (no descriptor). (A full run needs
`.research/config.json` with the layer enabled + GitHub env; that is the Task 9
live check.)

- [ ] **Step 4:** `npm run check` — PASS. Commit (`cli: impact command`).

### Task 9: end-to-end verification on the sample

**Files:** none (verification only).

- [ ] **Step 1:** In a scratch checkout of `continuous-research-sample`, add an
  `impact` block to `.research/config.json`
  (`"impact": { "enabled": true, "resultsPath": "data/btcusd/${descriptor}.json" }`),
  pick two real consecutive merged editions (e.g. the two most recent
  `data/btcusd/*.json`), and with `GITHUB_TOKEN`/`GITHUB_REPOSITORY` set run:

```bash
npm run cli -- impact <newer-descriptor> --against <older-descriptor>
```

- [ ] **Step 2: Confirm** the printed summary and open
  `.research/impact/<newer-descriptor>.impact.json`: `baseline` is the older
  descriptor; `changed` lists the real numeric deltas (e.g. `close`, `ma7`);
  `affected` includes `btc-short-term-trend` (its backing changed); `lint` is
  empty or only the expected stale-status warning. This is the "saw it emit a
  correct `.impact.json`" bar — units alone do not clear it.

- [ ] **Step 3:** Do NOT commit anything in the sample (scratch only). In the
  framework repo, final `npm run check` — PASS. The plan's commits stay local
  until reviewed; the agent-body + dual-engine scaffold wiring is the follow-on
  plan.

---

## Self-review

- **Spec coverage:** F0 config toggle → Task 1. F1 results diff → Task 2;
  annotation grammar → Task 3; affected claims → Task 4; the `impact` command +
  prior-edition read → Tasks 6–8. F2 linter → Task 5 (wired in Task 7). Dual
  engine / agent-body rewire / auto-discovery → explicitly out of scope
  (follow-on), per the roadmap seam and the advisor. Validation (sample) →
  Task 9; tsr stress → deferred to the follow-on that adds auto-discovery, where
  a real baseline mechanism exists to stress.
- **Placeholder scan:** none — every step carries full code and exact commands.
- **Type consistency:** `ChangedKey` (results.ts) is imported by impact.ts,
  linter.ts, commands.ts; `ClaimIndex`/`Annotation` (annotations.ts) by
  impact.ts, linter.ts, commands.ts; `LintFinding` (linter.ts) by commands.ts;
  `readFileFromRef` signature identical in ports.ts, github.ts, the fake, and the
  Task 7 test; `resolveResultsPath` / `affectedClaims` / `lintConsistency`
  signatures match their call sites.
