import { describe, it, expect } from "vitest";
import {
  sha256,
  buildProvenanceStub,
  serializeProvenanceStub,
  parseProvenanceStub,
  provenanceFile,
  PROVENANCE_SCHEMA,
  type ProvenanceInput,
} from "./provenance";

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
  it("builds a stub with the schema marker", () => {
    expect(buildProvenanceStub(valid)).toEqual({ schema: PROVENANCE_SCHEMA, ...valid });
  });

  it("rejects empty source / hash and a malformed hash", () => {
    expect(() => buildProvenanceStub({ ...valid, source: "  " })).toThrow(
      /source must not be empty/,
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
});

describe("serialize / parse round-trip", () => {
  it("serializes to pretty JSON with a trailing newline", () => {
    const out = serializeProvenanceStub(buildProvenanceStub(valid));
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain('"schema": "continuous-research/provenance@v1"');
  });

  it("parse(serialize(x)) === x", () => {
    const stub = buildProvenanceStub(valid);
    expect(parseProvenanceStub(serializeProvenanceStub(stub))).toEqual(stub);
  });

  it("rejects non-object, wrong schema, and a missing field", () => {
    expect(() => parseProvenanceStub("42")).toThrow(/must be a JSON object/);
    expect(() => parseProvenanceStub('{"schema":"nope"}')).toThrow(/Unexpected provenance schema/);
    // descriptor absent → not a string (must not silently become "undefined")
    expect(() =>
      parseProvenanceStub(
        JSON.stringify({
          schema: PROVENANCE_SCHEMA,
          source: "x",
          retrievedAt: valid.retrievedAt,
          hash: "sha256:ab",
        }),
      ),
    ).toThrow(/"descriptor" must be a string/);
  });
});

describe("provenanceFile", () => {
  it("derives the canonical path + content", () => {
    const f = provenanceFile(buildProvenanceStub(valid));
    expect(f.path).toBe(".research/provenance/oews-2026.json");
    expect(f.content.endsWith("\n")).toBe(true);
  });
});
