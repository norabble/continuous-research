import { describe, it, expect } from "vitest";
import {
  labelNamesOf,
  pullStateOf,
  mapIssueToPullRequest,
  isNotFoundError,
  latestTrustedCommentBody,
  mapPullRequestToOpenPullRequest,
  isPlainIssue,
  type RawIssue,
  type RawPullRequest,
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

describe("latestTrustedCommentBody", () => {
  it("returns the most recent trusted comment, skipping untrusted ones after it", () => {
    const comments = [
      { body: "old owner note", author_association: "OWNER" },
      { body: "maintainer reason", author_association: "COLLABORATOR" },
      { body: "drive-by spam", author_association: "NONE" },
      { body: "first-time contributor", author_association: "FIRST_TIME_CONTRIBUTOR" },
    ];
    expect(latestTrustedCommentBody(comments)).toBe("maintainer reason");
  });

  it("accepts OWNER, MEMBER, COLLABORATOR", () => {
    for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      expect(latestTrustedCommentBody([{ body: "ok", author_association: assoc }])).toBe("ok");
    }
  });

  it("returns null when no trusted comment exists (untrusted text never becomes a decline record)", () => {
    expect(latestTrustedCommentBody([])).toBeNull();
    expect(latestTrustedCommentBody([{ body: "spam", author_association: "NONE" }])).toBeNull();
    expect(latestTrustedCommentBody([{ body: "x", author_association: null }])).toBeNull();
  });

  it("skips empty bodies", () => {
    expect(
      latestTrustedCommentBody([
        { body: "real", author_association: "OWNER" },
        { body: "", author_association: "OWNER" },
      ]),
    ).toBe("real");
  });
});

describe("mapPullRequestToOpenPullRequest", () => {
  const prItem: RawPullRequest = {
    number: 7,
    title: "data: limits-google-d1992c4c",
    labels: [{ name: "data:limits-google-d1992c4c" }],
    user: { login: "continuous-research-bot[bot]" },
    created_at: "2026-07-06T12:00:00Z",
    head: { ref: "data/limits-google-d1992c4c" },
    html_url: "https://github.com/o/r/pull/7",
  };

  it("maps a pulls-list item to the site layer's OpenPullRequest shape", () => {
    expect(mapPullRequestToOpenPullRequest(prItem)).toEqual({
      number: 7,
      title: "data: limits-google-d1992c4c",
      labels: ["data:limits-google-d1992c4c"],
      authorLogin: "continuous-research-bot[bot]",
      createdAt: "2026-07-06T12:00:00Z",
      headRef: "data/limits-google-d1992c4c",
      htmlUrl: "https://github.com/o/r/pull/7",
    });
  });

  it("defaults authorLogin to empty string when user is null", () => {
    const result = mapPullRequestToOpenPullRequest({ ...prItem, user: null });
    expect(result.authorLogin).toBe("");
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

describe("isPlainIssue", () => {
  it("true for a plain issue (no pull_request)", () => {
    expect(isPlainIssue({ number: 1, state: "open", labels: [], pull_request: undefined })).toBe(
      true,
    );
    expect(isPlainIssue({ number: 1, state: "open", labels: [], pull_request: null })).toBe(true);
  });

  it("false for a PR item (listForRepo returns PRs too; drift issues are plain issues)", () => {
    expect(
      isPlainIssue({
        number: 1,
        state: "open",
        labels: [],
        pull_request: { merged_at: null },
      }),
    ).toBe(false);
  });
});
