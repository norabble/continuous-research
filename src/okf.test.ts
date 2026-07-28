import { describe, it, expect } from "vitest";
import { buildOkfBundle, citedEditions, okfStatusFor, splitFindings, type OkfFacts } from "./okf";
import { buildProvenanceStub, type ProvenanceStub } from "./provenance";
import { parseDocument } from "./frontmatter";

function edition(descriptor: string, retrievedAt: string, resource: string): ProvenanceStub {
  return buildProvenanceStub({ descriptor, source: resource, retrievedAt, hash: "sha256:ab" });
}

const btc = edition(
  "btcusd-2026-07-01",
  "2026-07-02T18:30:04.515Z",
  "https://api.exchange.coinbase.com/products/BTC-USD/candles",
);
const older = edition("btcusd-2026-06-27", "2026-06-28T00:00:00Z", "https://api.exchange/older");

const SAMPLE_FINDINGS = `# Findings — BTC-USD daily trend

> Demonstration content, not financial analysis.

## Short-term trend

**BTC's short-term downtrend persists.** As of the \`btcusd-2026-07-01\` edition, BTC-USD closed at **$59,961**.

<!-- claim: btc-short-term-trend | backs: close, ma7 | status: supported -->

---

*Impact declarations live in the data-PR history.*
`;

// Verbatim shape from token-source-review: no descriptor is ever named in prose.
const TSR_FINDINGS = `# Findings — provider limits

## GitHub Copilot — Free plan

**Copilot Free cannot run gh-aw at all**: it offers auto-model-selection only.

<!-- claim: copilot-free-incompatible | backs: github.free.model-selection | status: supported -->

## Google — Gemini API free tier

Rests on the last published per-model figures.

<!-- claim: google-free-flash-lite-sessions | backs: (prose) | status: weakened -->
`;

const base: OkfFacts = { title: "T", editions: [], declines: [], findingsMd: null };

describe("okfStatusFor", () => {
  it("maps the epistemic axis onto the lifecycle axis", () => {
    // A weakened claim is still a *current* claim — it must not read as deprecated.
    expect(okfStatusFor("supported")).toBe("stable");
    expect(okfStatusFor("weakened")).toBe("stable");
    expect(okfStatusFor("overturned")).toBe("deprecated");
    expect(okfStatusFor("open")).toBe("draft");
    expect(okfStatusFor("  OVERTURNED ")).toBe("deprecated");
    expect(okfStatusFor("something-new")).toBe("stable"); // tolerant
  });
});

describe("splitFindings", () => {
  it("takes the heading section containing the annotation, minus the annotation line", () => {
    const { sections } = splitFindings(SAMPLE_FINDINGS);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe("Short-term trend");
    expect(sections[0]?.prose).toContain("downtrend persists");
    expect(sections[0]?.prose).not.toContain("<!-- claim:");
    // The horizontal rule ends the section, so the footer is not swallowed.
    expect(sections[0]?.prose).not.toContain("Impact declarations");
  });

  it("returns nothing for prose with no annotations", () => {
    expect(splitFindings("# Title\n\nJust prose.\n").sections).toEqual([]);
  });
});

// The correctness rule of this stage: never invent a citation.
describe("citation honesty", () => {
  it("cites only descriptors the prose actually names", () => {
    const known = new Set(["btcusd-2026-07-01", "btcusd-2026-06-27"]);
    expect(citedEditions("As of the `btcusd-2026-07-01` edition", known)).toEqual([
      "btcusd-2026-07-01",
    ]);
  });

  it("returns nothing for backticked tokens that are not descriptors", () => {
    // `backs` keys and file names are backticked all over the live prose.
    expect(
      citedEditions("the `results.json` file and `close`", new Set(["btcusd-2026-07-01"])),
    ).toEqual([]);
  });

  it("emits NO sources key when the prose names no edition", () => {
    const files = buildOkfBundle({
      ...base,
      editions: [btc, older],
      findingsMd: TSR_FINDINGS,
    });
    for (const name of ["copilot-free-incompatible", "google-free-flash-lite-sessions"]) {
      const doc = files.find((f) => f.path === `findings/${name}.md`);
      expect(doc, name).toBeDefined();
      const { data } = parseDocument(doc?.content ?? "");
      // Not an empty list, not the newest edition — absent entirely.
      expect(data).not.toHaveProperty("sources");
      expect(data.backs).toBeDefined();
    }
  });

  it("cites only the named edition, not every edition on disk", () => {
    const files = buildOkfBundle({ ...base, editions: [btc, older], findingsMd: SAMPLE_FINDINGS });
    const { data } = parseDocument(
      files.find((f) => f.path === "findings/btc-short-term-trend.md")?.content ?? "",
    );
    expect(data.sources).toEqual([
      {
        id: "btcusd-2026-07-01",
        resource: "https://api.exchange.coinbase.com/products/BTC-USD/candles",
      },
    ]);
  });
});

// Stage 2b: linkage is recorded by the step that knew it, not inferred later.
describe("recorded linkage", () => {
  const withEditions = (annotation: string) =>
    TSR_FINDINGS.replace(
      "<!-- claim: copilot-free-incompatible | backs: github.free.model-selection | status: supported -->",
      annotation,
    );

  const sourcesOf = (findingsMd: string, claim: string) => {
    const files = buildOkfBundle({ ...base, editions: [btc, older], findingsMd });
    const doc = files.find((f) => f.path === `findings/${claim}.md`);
    expect(doc, claim).toBeDefined();
    return parseDocument(doc?.content ?? "").data;
  };

  it("attributes a claim whose prose names nothing, once the field is recorded", () => {
    // The exact gap Stage 2 measured: 0 of 5 attributed in token-source-review.
    const data = sourcesOf(
      withEditions(
        "<!-- claim: copilot-free-incompatible | backs: github.free.model-selection | status: supported | editions: btcusd-2026-06-27 -->",
      ),
      "copilot-free-incompatible",
    );
    expect(data.sources).toEqual([
      { id: "btcusd-2026-06-27", resource: "https://api.exchange/older" },
    ]);
  });

  it("prefers the recorded field over a prose scan that would say otherwise", () => {
    const findingsMd = SAMPLE_FINDINGS.replace(
      "<!-- claim: btc-short-term-trend | backs: close, ma7 | status: supported -->",
      "<!-- claim: btc-short-term-trend | backs: close, ma7 | status: supported | editions: btcusd-2026-06-27 -->",
    );
    // The prose still backticks btcusd-2026-07-01; the record wins outright.
    const data = sourcesOf(findingsMd, "btc-short-term-trend");
    expect(data.sources).toEqual([
      { id: "btcusd-2026-06-27", resource: "https://api.exchange/older" },
    ]);
  });

  it("drops an entry naming an edition with no stub, and falls back when none survive", () => {
    const data = sourcesOf(
      withEditions(
        "<!-- claim: copilot-free-incompatible | backs: github.free.model-selection | status: supported | editions: never-merged-1 -->",
      ),
      "copilot-free-incompatible",
    );
    // The linter reports the unknown descriptor; the offline exporter must not
    // publish a citation it cannot resolve.
    expect(data).not.toHaveProperty("sources");
  });
});

describe("buildOkfBundle", () => {
  it("emits index, log, one finding per claim, one edition per stub", () => {
    const files = buildOkfBundle({ ...base, editions: [btc, older], findingsMd: SAMPLE_FINDINGS });
    expect(files.map((f) => f.path).sort()).toEqual([
      "editions/btcusd-2026-06-27.md",
      "editions/btcusd-2026-07-01.md",
      "findings/btc-short-term-trend.md",
      "index.md",
      "log.md",
    ]);
  });

  it("logs accepted and declined editions newest-first, but concepts only for accepted", () => {
    const files = buildOkfBundle({
      ...base,
      editions: [btc, older],
      declines: [
        {
          descriptor: "btcusd-2026-06-28",
          declinedAt: "2026-06-29T00:00:00Z",
          reason: "anomalous",
        },
      ],
    });
    const log = files.find((f) => f.path === "log.md")?.content ?? "";
    const dates = [...log.matchAll(/^## (\d{4}-\d{2}-\d{2})$/gm)].map((m) => m[1]);
    expect(dates).toEqual(["2026-07-02", "2026-06-29", "2026-06-28"]);
    expect(log).toContain("**Declined** edition `btcusd-2026-06-28` — anomalous");
    // A declined edition never merged, so it is not a concept (Decision 3).
    expect(files.some((f) => f.path.includes("btcusd-2026-06-28"))).toBe(false);
  });

  it("never synthesizes a verified entry", () => {
    const files = buildOkfBundle({ ...base, editions: [btc] });
    const { data } = parseDocument(
      files.find((f) => f.path === "editions/btcusd-2026-07-01.md")?.content ?? "",
    );
    expect(data).not.toHaveProperty("verified");
  });

  it("carries generated / verified through when the stub really has them", () => {
    const stub = buildProvenanceStub({
      descriptor: "d1",
      source: "https://x.test",
      retrievedAt: "2026-07-02T00:00:00Z",
      hash: "sha256:ab",
      generated: { by: "process:trip-wire", at: "2026-07-02T00:00:00Z" },
      verified: [{ by: "human:rbaker5", at: "2026-07-03T00:00:00Z" }],
    });
    const { data } = parseDocument(
      buildOkfBundle({ ...base, editions: [stub] }).find((f) => f.path === "editions/d1.md")
        ?.content ?? "",
    );
    expect(data.generated).toEqual({ by: "process:trip-wire", at: "2026-07-02T00:00:00Z" });
    expect(data.verified).toEqual([{ by: "human:rbaker5", at: "2026-07-03T00:00:00Z" }]);
  });

  it("drops a claim whose id is unsafe as a path", () => {
    const evil = `## Bad

text

<!-- claim: ../../etc/passwd | backs: x | status: supported -->
`;
    const files = buildOkfBundle({ ...base, findingsMd: evil });
    expect(files.every((f) => !f.path.includes(".."))).toBe(true);
    expect(files.some((f) => f.path.startsWith("findings/"))).toBe(false);
  });

  it("produces a conformant bundle with no editions and no findings", () => {
    const files = buildOkfBundle(base);
    expect(files.map((f) => f.path)).toEqual(["index.md", "log.md"]);
  });
});

describe("freshness", () => {
  const editionData = (facts: OkfFacts) =>
    parseDocument(
      buildOkfBundle(facts).find((f) => f.path === "editions/btcusd-2026-07-01.md")?.content ?? "",
    ).data;

  it("emits no stale_after at all when no window is configured", () => {
    expect(editionData({ ...base, editions: [btc] })).not.toHaveProperty("stale_after");
  });

  it("dates the window from the edition's own retrieval, in UTC", () => {
    // Retrieved 2026-07-02T18:30Z — a naive local-time addition slips a day.
    expect(editionData({ ...base, editions: [btc], staleAfterDays: 30 }).stale_after).toBe(
      "2026-08-01",
    );
  });

  // A finding has no timestamp of its own; its freshness follows from the
  // editions it cites, and inventing a date for it would be a guess.
  it("puts the window on editions only, never on findings", () => {
    const files = buildOkfBundle({
      ...base,
      editions: [btc],
      findingsMd: SAMPLE_FINDINGS,
      staleAfterDays: 30,
    });
    for (const f of files.filter((f) => !f.path.startsWith("editions/"))) {
      expect(parseDocument(f.content).data, f.path).not.toHaveProperty("stale_after");
    }
  });
});

describe("the sensor as an Attested Computation", () => {
  const sensor = { command: "node sensor.mjs", attester: null };
  const files = buildOkfBundle({ ...base, editions: [btc], sensor });
  const doc = (path: string) => parseDocument(files.find((f) => f.path === path)?.content ?? "");

  it("emits nothing when the instance supplies no sensor facts", () => {
    expect(
      buildOkfBundle({ ...base, editions: [btc] }).some((f) => f.path.startsWith("computations/")),
    ).toBe(false);
  });

  it("declares the runtime, executor and attester OKF §10 requires", () => {
    const { data } = doc("computations/sensor.md");
    expect(data.type).toBe("Attested Computation");
    expect(data.runtime).toBe("shell");
    expect(data.executor).toEqual({
      resource: "https://github.com/norabble/continuous-research/blob/main/docs/cli.md#sense",
      // The receipt is literally the detection-result contract the engine enforces.
      receipt: ["changed", "descriptor", "source", "retrievedAt", "hash", "artifacts"],
    });
    expect(data.attester).toEqual({ resource: "attester.md" });
  });

  // CR is the degenerate, stricter case of OKF's model: no parameters exist for
  // an agent to bind. The empty list states that; omitting it would not.
  it("states the empty parameter list rather than omitting it", () => {
    expect(doc("computations/sensor.md").data.parameters).toEqual([]);
  });

  it("carries the declared command as the single fenced block", () => {
    const { body } = doc("computations/sensor.md");
    expect(body).toContain("# Computation");
    expect([...body.matchAll(/^```/gm)]).toHaveLength(2);
    expect(body).toContain("node sensor.mjs");
  });

  // A command containing a fence would otherwise break the "single fenced
  // block" rule silently, which is the failure mode this whole layer avoids.
  it("survives a sensor command containing a code fence", () => {
    const evil = buildOkfBundle({
      ...base,
      sensor: { command: 'sh -c "echo ``` hi"', attester: null },
    });
    const { body } = parseDocument(
      evil.find((f) => f.path === "computations/sensor.md")?.content ?? "",
    );
    const fences = [...body.matchAll(/^`{4,}/gm)];
    expect(fences).toHaveLength(2);
    expect(body).toContain('sh -c "echo ``` hi"');
  });

  it("resolves attester.resource to a real document in the bundle", () => {
    const { data } = doc("computations/sensor.md");
    const target = `computations/${(data.attester as { resource: string }).resource}`;
    expect(files.some((f) => f.path === target)).toBe(true);
    expect(doc(target).data.type).toBe("Reference");
  });

  it("uses the instance's own attester description when it has one", () => {
    const mine = buildOkfBundle({
      ...base,
      sensor: { command: "x", attester: "# Mine\n\nThe scheme hashes the source." },
    });
    const content = mine.find((f) => f.path === "computations/attester.md")?.content ?? "";
    expect(content).toContain("The scheme hashes the source.");
    expect(content).not.toContain("descriptor scheme, which the framework does not define");
  });
});

// docs/okf-interop.md → Conformance. OKF ships no validator, so we assert our own.
//
// Run over both shapes: OKF mandates no particular concepts, so a bundle with
// no computations and no freshness window must be exactly as conformant as one
// carrying everything. That is what makes those fields safely optional.
const CONFORMANCE_CASES = {
  "every family present": {
    ...base,
    editions: [btc, older],
    declines: [{ descriptor: "d9", declinedAt: "2026-06-29T00:00:00Z", reason: "no" }],
    findingsMd: SAMPLE_FINDINGS,
    sensor: { command: "node sensor.mjs", attester: null },
    staleAfterDays: 30,
  },
  "no sensor, no freshness window": {
    ...base,
    editions: [btc, older],
    declines: [{ descriptor: "d9", declinedAt: "2026-06-29T00:00:00Z", reason: "no" }],
    findingsMd: SAMPLE_FINDINGS,
  },
} satisfies Record<string, OkfFacts>;

describe.each(Object.entries(CONFORMANCE_CASES))("conformance — %s", (_name, facts) => {
  const files = buildOkfBundle(facts);

  it("gives every non-reserved document a non-empty type", () => {
    for (const file of files) {
      const { data } = parseDocument(file.content);
      if (file.path === "index.md") continue; // reserved: no type
      expect(typeof data.type, file.path).toBe("string");
      expect((data.type as string).length, file.path).toBeGreaterThan(0);
    }
  });

  it("puts okf_version only in the bundle-root index.md, and nothing else there", () => {
    const index = files.find((f) => f.path === "index.md");
    expect(parseDocument(index?.content ?? "").data).toEqual({ okf_version: "0.2" });
    for (const file of files.filter((f) => f.path !== "index.md")) {
      expect(parseDocument(file.content).data).not.toHaveProperty("okf_version");
    }
  });

  it("uses only index.md and log.md as reserved names", () => {
    const reserved = files.filter((f) => /(^|\/)(index|log)\.md$/.test(f.path)).map((f) => f.path);
    expect(reserved).toEqual(["index.md", "log.md"]);
  });

  it("dates log headings ISO, newest first", () => {
    const log = files.find((f) => f.path === "log.md")?.content ?? "";
    const dates = [...log.matchAll(/^## (.+)$/gm)].map((m) => m[1] as string);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect([...dates]).toEqual([...dates].sort().reverse());
  });

  it("keeps every cross-link inside the bundle", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const file of files) {
      for (const [, target] of file.content.matchAll(/\]\((\.\.\/[^)]+|[a-z][^):]*\.md)\)/g)) {
        const resolved = (target as string).replace(/^\.\.\//, "");
        expect(paths.has(resolved), `${file.path} -> ${target}`).toBe(true);
      }
    }
  });

  it("dates every stale_after as an absolute YYYY-MM-DD", () => {
    for (const file of files) {
      const { stale_after: value } = parseDocument(file.content).data;
      if (value === undefined) continue;
      expect(value, file.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
