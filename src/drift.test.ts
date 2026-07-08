import { describe, expect, it } from "vitest";
import { DRIFT_ISSUE_TITLE, planDriftEscalation } from "./drift";

const report = JSON.stringify({ reason: "fetch-failed", detail: "ETIMEDOUT" });

describe("planDriftEscalation", () => {
  it("creates when no drift issue is open", () => {
    const plan = planDriftEscalation(report, []);
    expect(plan.action).toBe("create");
    expect(plan.title).toBe(DRIFT_ISSUE_TITLE);
    expect(plan.body).toContain('"reason": "fetch-failed"');
    expect(plan.body).toContain("Repair contract:");
  });

  it("comments on the oldest open drift issue instead of re-filing", () => {
    const plan = planDriftEscalation(report, [17, 23]);
    expect(plan.action).toBe("comment");
    expect(plan.issueNumber).toBe(17);
  });

  it("rejects a report that is not a JSON object", () => {
    expect(() => planDriftEscalation("[]", [])).toThrow(TypeError);
    expect(() => planDriftEscalation("not json", [])).toThrow();
  });
});
