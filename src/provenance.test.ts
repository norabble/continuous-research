import { describe, it, expect } from "vitest";
import {
  sha256,
  buildProvenanceStub,
  serializeProvenanceStub,
  parseProvenanceStub,
  primarySource,
  provenanceFile,
  PROVENANCE_SCHEMA,
  PROVENANCE_SCHEMA_V1,
  PROVENANCE_SCHEMA_V2,
  type ProvenanceInput,
} from "./provenance";
import { provenancePathFor } from "./descriptor";
import { classify } from "./dedup";

const valid: ProvenanceInput = {
  descriptor: "oews-2026",
  source: "https://www.bls.gov/oes/special.requests/oesm26all.zip",
  retrievedAt: "2026-06-26T00:00:00Z",
  hash: "sha256:deadbeef",
};

describe("sha256", () => {
  it("matches known vectors and is prefixed", () => {
    expect(sha256("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("buildProvenanceStub", () => {
  it("writes the v2 schema and upcasts a flat source to one named entry", () => {
    const stub = buildProvenanceStub(valid);
    expect(stub.schema).toBe(PROVENANCE_SCHEMA_V2);
    expect(stub.sources).toEqual([{ id: "oews-2026", resource: valid.source }]);
    expect(primarySource(stub)).toBe(valid.source);
    expect(stub.generated).toBeUndefined();
    expect(stub.verified).toBeUndefined();
  });

  it("keeps multiple named sources with their optional signals", () => {
    const stub = buildProvenanceStub({
      ...valid,
      source: undefined,
      sources: [
        { id: "rate-limits", resource: "https://docs.claude.com/en/api/rate-limits" },
        {
          id: "model-card",
          resource: "https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash",
          title: "Gemini 3.5 Flash model card",
          lastModified: "2026-07-12",
          hash: "sha256:02d5a6",
        },
      ],
    });
    expect(stub.sources).toHaveLength(2);
    expect(stub.sources[1]).toEqual({
      id: "model-card",
      resource: "https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash",
      title: "Gemini 3.5 Flash model card",
      lastModified: "2026-07-12",
      hash: "sha256:02d5a6",
    });
    // `sources` wins over a flat `source` when both are supplied.
    expect(primarySource(stub)).toBe("https://docs.claude.com/en/api/rate-limits");
  });

  it("rejects empty source / hash and a malformed hash", () => {
    expect(() => buildProvenanceStub({ ...valid, source: "  " })).toThrow(
      /sources\[0\]\.resource must not be empty/,
    );
    expect(() => buildProvenanceStub({ ...valid, hash: "" })).toThrow(/hash must not be empty/);
    expect(() => buildProvenanceStub({ ...valid, hash: "not-a-hash" })).toThrow(/algo:hexdigest/);
  });

  it("rejects an invalid descriptor and a non-ISO date", () => {
    expect(() => buildProvenanceStub({ ...valid, descriptor: "Bad Desc" })).toThrow(
      /Invalid descriptor/,
    );
    expect(() => buildProvenanceStub({ ...valid, retrievedAt: "yesterday" })).toThrow(
      /ISO-8601 date/,
    );
  });

  it("requires at least one source, and rejects duplicate or unsafe source ids", () => {
    expect(() => buildProvenanceStub({ ...valid, source: undefined })).toThrow(
      /requires "source" or a non-empty "sources"/,
    );
    expect(() =>
      buildProvenanceStub({
        ...valid,
        sources: [
          { id: "dup", resource: "https://a.test" },
          { id: "dup", resource: "https://b.test" },
        ],
      }),
    ).toThrow(/sources\[1\]\.id is duplicated/);
    expect(() =>
      buildProvenanceStub({ ...valid, sources: [{ id: "not a key", resource: "https://a.test" }] }),
    ).toThrow(/is not a safe key/);
  });

  it("rejects a non-date lastModified", () => {
    expect(() =>
      buildProvenanceStub({
        ...valid,
        sources: [{ resource: "https://a.test", lastModified: "2026-07-12T00:00:00Z" }],
      }),
    ).toThrow(/lastModified must be YYYY-MM-DD/);
  });
});

describe("actor grammar", () => {
  it("accepts the three OKF actor forms", () => {
    for (const by of ["human:rbaker5", "process:trip-wire", "gh-aw/gemini-3.1-flash-lite"]) {
      const stub = buildProvenanceStub({ ...valid, generated: { by, at: valid.retrievedAt } });
      expect(stub.generated?.by).toBe(by);
    }
  });

  it("rejects a bare actor name and a non-ISO timestamp", () => {
    expect(() =>
      buildProvenanceStub({ ...valid, generated: { by: "somebody", at: valid.retrievedAt } }),
    ).toThrow(/generated\.by must be/);
    expect(() =>
      buildProvenanceStub({ ...valid, generated: { by: "human:x", at: "whenever" } }),
    ).toThrow(/generated\.at must be an ISO-8601 date/);
  });

  it("carries verification entries as a list", () => {
    const stub = buildProvenanceStub({
      ...valid,
      verified: [{ by: "human:rbaker5", at: "2026-07-06T11:29:48Z" }],
    });
    expect(stub.verified).toEqual([{ by: "human:rbaker5", at: "2026-07-06T11:29:48Z" }]);
  });
});

describe("serialize / parse round-trip", () => {
  it("serializes to pretty JSON with a trailing newline", () => {
    const out = serializeProvenanceStub(buildProvenanceStub(valid));
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain('"schema": "continuous-research/provenance@v2"');
  });

  it("parse(serialize(x)) === x, including the trust families", () => {
    const stub = buildProvenanceStub({
      ...valid,
      sources: [{ id: "a", resource: "https://a.test", title: "A", lastModified: "2026-07-01" }],
      generated: { by: "process:trip-wire", at: valid.retrievedAt },
      verified: [{ by: "human:rbaker5", at: valid.retrievedAt }],
    });
    expect(parseProvenanceStub(serializeProvenanceStub(stub))).toEqual(stub);
  });

  it("rejects non-object, wrong schema, and a missing field", () => {
    expect(() => parseProvenanceStub("42")).toThrow(/must be an object/);
    expect(() => parseProvenanceStub('{"schema":"nope"}')).toThrow(/Unexpected provenance schema/);
    expect(() =>
      parseProvenanceStub(
        JSON.stringify({
          schema: PROVENANCE_SCHEMA,
          sources: [{ resource: "x" }],
          retrievedAt: valid.retrievedAt,
          hash: "sha256:ab",
        }),
      ),
    ).toThrow(/"descriptor" must be a string/);
  });
});

// The compatibility contract: v1 stubs already merged onto `main` must keep
// working untouched, or the sensing loop would re-propose settled editions.
describe("v1 compatibility", () => {
  // Verbatim from the live instances (token-source-review, sample).
  const v1Anthropic = `{
  "schema": "continuous-research/provenance@v1",
  "descriptor": "limits-anthropic-46305ced",
  "source": "https://docs.claude.com/en/api/rate-limits",
  "retrievedAt": "2026-07-03T17:23:06.002Z",
  "hash": "sha256:46305ced46e5ab8a9620fd4b060353aa057d297a6978dc727afbfb4f36f9ee54"
}
`;
  const v1Btc = `{
  "schema": "continuous-research/provenance@v1",
  "descriptor": "btcusd-2026-07-01",
  "source": "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400",
  "retrievedAt": "2026-07-02T18:30:04.515Z",
  "hash": "sha256:3dbfa653015e25310eab0e058a8a69cb936e5605bec02ae534c45406a7f8e96a"
}
`;

  it("parses a real v1 stub and upcasts its flat source", () => {
    const stub = parseProvenanceStub(v1Anthropic);
    expect(stub.schema).toBe(PROVENANCE_SCHEMA_V2);
    expect(stub.descriptor).toBe("limits-anthropic-46305ced");
    expect(stub.sources).toEqual([
      { id: "limits-anthropic-46305ced", resource: "https://docs.claude.com/en/api/rate-limits" },
    ]);
    expect(primarySource(stub)).toBe("https://docs.claude.com/en/api/rate-limits");
    expect(stub.retrievedAt).toBe("2026-07-03T17:23:06.002Z");
  });

  it("preserves source, retrievedAt and hash across the v1 → v2 upcast", () => {
    for (const raw of [v1Anthropic, v1Btc]) {
      const original = JSON.parse(raw) as Record<string, string>;
      const stub = parseProvenanceStub(raw);
      expect(primarySource(stub)).toBe(original.source);
      expect(stub.retrievedAt).toBe(original.retrievedAt);
      expect(stub.hash).toBe(original.hash);
      expect(stub.descriptor).toBe(original.descriptor);
    }
  });

  it("still recognizes the v1 constant, distinct from what we write", () => {
    expect(PROVENANCE_SCHEMA_V1).toBe("continuous-research/provenance@v1");
    expect(PROVENANCE_SCHEMA).toBe(PROVENANCE_SCHEMA_V2);
    expect(PROVENANCE_SCHEMA_V1).not.toBe(PROVENANCE_SCHEMA_V2);
  });

  it("leaves the dedup marker path byte-identical", () => {
    // If this path ever moves, every already-merged edition reads as `new`.
    expect(provenancePathFor("limits-anthropic-46305ced")).toBe(
      ".research/provenance/limits-anthropic-46305ced.json",
    );
    // ...and the stub's presence on `main` still classifies as merged.
    expect(classify("limits-anthropic-46305ced", [], true)).toEqual({
      descriptor: "limits-anthropic-46305ced",
      state: "merged",
      action: "skip",
    });
  });
});

describe("provenanceFile", () => {
  it("derives the canonical path + content", () => {
    const f = provenanceFile(buildProvenanceStub(valid));
    expect(f.path).toBe(".research/provenance/oews-2026.json");
    expect(f.content.endsWith("\n")).toBe(true);
  });
});
