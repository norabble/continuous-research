import { describe, it, expect } from "vitest";
import {
  isValidDescriptor,
  labelFor,
  descriptorFromLabel,
  branchFor,
  provenancePathFor,
  declinePathFor,
} from "./descriptor";

describe("descriptor validation", () => {
  it("accepts scheme-style ids (incl. revision and dotted)", () => {
    for (const d of ["oews-2026", "oews-2026r1", "onet-29.0", "a"]) {
      expect(isValidDescriptor(d)).toBe(true);
    }
  });

  it("rejects unsafe ids", () => {
    for (const d of ["", "Oews-2026", "-oews", "oews-", "oe ws", "data/oews", "a/b"]) {
      expect(isValidDescriptor(d)).toBe(false);
    }
  });
});

describe("descriptor <-> label round-trip", () => {
  it("labelFor / descriptorFromLabel are inverses", () => {
    expect(labelFor("oews-2026")).toBe("data:oews-2026");
    expect(descriptorFromLabel("data:oews-2026")).toBe("oews-2026");
  });

  it("descriptorFromLabel rejects non-data and malformed labels", () => {
    expect(descriptorFromLabel("bug")).toBeNull();
    expect(descriptorFromLabel("data:Bad Label")).toBeNull();
  });

  it("labelFor throws on an invalid descriptor", () => {
    expect(() => labelFor("Bad Label")).toThrow(/Invalid descriptor/);
  });
});

describe("canonical location helpers", () => {
  it("derive branch / provenance / decline paths", () => {
    expect(branchFor("oews-2026")).toBe("data/oews-2026");
    expect(provenancePathFor("oews-2026")).toBe(".research/provenance/oews-2026.json");
    expect(declinePathFor("oews-2026")).toBe(".research/decisions/oews-2026.md");
  });
});
