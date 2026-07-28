import { describe, it, expect } from "vitest";
import { extractDeclineFromEvent, extractVerificationFromEvent } from "./event";

const baseEvent = {
  pull_request: {
    number: 12,
    merged: false,
    closed_at: "2026-06-27T10:00:00Z",
    labels: [{ name: "data:btcusd-2026-06-27" }, { name: "other" }],
  },
  sender: { login: "octocat" },
};

const withPr = (overrides: Record<string, unknown>) => ({
  ...baseEvent,
  pull_request: { ...baseEvent.pull_request, ...overrides },
});

describe("extractDeclineFromEvent", () => {
  it("extracts inputs for a closed-unmerged data-PR", () => {
    expect(extractDeclineFromEvent(baseEvent)).toEqual({
      descriptor: "btcusd-2026-06-27",
      prNumber: 12,
      declinedAt: "2026-06-27T10:00:00Z",
      declinedBy: "octocat",
    });
  });

  it("returns null when the PR was merged", () => {
    expect(extractDeclineFromEvent(withPr({ merged: true }))).toBeNull();
  });

  it("returns null when there is no data label", () => {
    expect(extractDeclineFromEvent(withPr({ labels: [{ name: "bug" }] }))).toBeNull();
  });

  it("returns null for a non-object event or a missing pull_request", () => {
    expect(extractDeclineFromEvent(null)).toBeNull();
    expect(extractDeclineFromEvent({})).toBeNull();
  });

  it("tolerates a missing sender (declinedBy undefined)", () => {
    const { sender: _sender, ...noSender } = baseEvent;
    expect(extractDeclineFromEvent(noSender)?.declinedBy).toBeUndefined();
  });
});

describe("extractVerificationFromEvent", () => {
  const merged = {
    ...baseEvent,
    pull_request: {
      ...baseEvent.pull_request,
      merged: true,
      merged_at: "2026-06-27T10:00:00Z",
      merged_by: { login: "rbaker5" } as { login: string } | undefined,
    },
  };

  it("extracts inputs for a merged data-PR", () => {
    expect(extractVerificationFromEvent(merged)).toEqual({
      descriptor: "btcusd-2026-06-27",
      prNumber: 12,
      mergedAt: "2026-06-27T10:00:00Z",
      mergedBy: "human:rbaker5",
    });
  });

  // The two extractors are complements: every closed data-PR feeds exactly one.
  it("returns null for the unmerged case decline handles", () => {
    expect(extractVerificationFromEvent(baseEvent)).toBeNull();
    expect(extractDeclineFromEvent(merged)).toBeNull();
  });

  it("returns null when there is no data label", () => {
    expect(
      extractVerificationFromEvent({
        ...merged,
        pull_request: { ...merged.pull_request, labels: [{ name: "bug" }] },
      }),
    ).toBeNull();
  });

  // An auto-merge is a machine confirmation. Emitting `human:` for it would hand
  // the bundle OKF's human-reviewed tier on the strength of nobody's judgment.
  const mergedByUser = (user: Record<string, unknown>) => ({
    ...merged,
    pull_request: { ...merged.pull_request, merged_by: user as unknown as { login: string } },
  });

  it("attests a bot merge as a process, never as a human", () => {
    expect(extractVerificationFromEvent(mergedByUser({ login: "dependabot[bot]" }))?.mergedBy).toBe(
      "process:dependabot",
    );
  });

  // `type` is GitHub's own answer, and it holds where the login gives nothing away.
  it("reads the payload's type field, not just the login suffix", () => {
    expect(
      extractVerificationFromEvent(mergedByUser({ login: "some-service", type: "Bot" }))?.mergedBy,
    ).toBe("process:some-service");
    expect(
      extractVerificationFromEvent(mergedByUser({ login: "rbaker5", type: "User" }))?.mergedBy,
    ).toBe("human:rbaker5");
  });

  it("falls back to the event sender when merged_by is absent", () => {
    const { merged_by: _m, ...pr } = merged.pull_request;
    expect(extractVerificationFromEvent({ ...merged, pull_request: pr })?.mergedBy).toBe(
      "human:octocat",
    );
  });

  it("throws rather than attesting a merge to nobody", () => {
    const { merged_by: _m, ...pr } = merged.pull_request;
    const { sender: _s, ...noSender } = merged;
    expect(() => extractVerificationFromEvent({ ...noSender, pull_request: pr })).toThrow(
      /names no merging actor/,
    );
  });
});
