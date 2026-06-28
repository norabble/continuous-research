import { describe, it, expect } from "vitest";
import { extractDeclineFromEvent } from "./event";

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
