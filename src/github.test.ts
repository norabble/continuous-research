import { describe, it, expect } from "vitest";
import {
  labelNamesOf,
  pullStateOf,
  mapIssueToPullRequest,
  isNotFoundError,
  type RawIssue,
} from "./github";

describe("labelNamesOf", () => {
  it("handles string and object labels, dropping empty/null names", () => {
    expect(labelNamesOf(["a", { name: "b" }, { name: null }, { name: "" }])).toEqual(["a", "b"]);
  });
});

describe("pullStateOf", () => {
  it("open stays open", () => {
    expect(pullStateOf("open", null)).toBe("open");
  });
  it("closed with merged_at => merged", () => {
    expect(pullStateOf("closed", "2026-01-01T00:00:00Z")).toBe("merged");
  });
  it("closed without merged_at => closed_unmerged", () => {
    expect(pullStateOf("closed", null)).toBe("closed_unmerged");
    expect(pullStateOf("closed", undefined)).toBe("closed_unmerged");
  });
});

describe("mapIssueToPullRequest", () => {
  const prItem: RawIssue = {
    number: 5,
    state: "open",
    labels: [{ name: "data:oews-2026" }],
    pull_request: { merged_at: null },
  };

  it("maps a PR item to the engine's PullRequest shape", () => {
    expect(mapIssueToPullRequest(prItem)).toEqual({
      number: 5,
      state: "open",
      labels: ["data:oews-2026"],
    });
  });

  it("returns null for a plain issue (no pull_request)", () => {
    expect(mapIssueToPullRequest({ ...prItem, pull_request: undefined })).toBeNull();
  });

  it("classifies a merged PR via merged_at", () => {
    const merged = mapIssueToPullRequest({
      ...prItem,
      state: "closed",
      pull_request: { merged_at: "2026-01-01T00:00:00Z" },
    });
    expect(merged?.state).toBe("merged");
  });
});

describe("isNotFoundError", () => {
  it("true only for a 404-status object", () => {
    expect(isNotFoundError({ status: 404 })).toBe(true);
    expect(isNotFoundError({ status: 500 })).toBe(false);
    expect(isNotFoundError(new Error("nope"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
