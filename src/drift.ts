/**
 * Drift escalation planner (pure). A sensor that cannot produce an edition
 * writes a drift report (DRIFT_REPORT_PATH, working tree only — never
 * committed); the escalate-drift command turns it into the single open
 * sensor-drift issue a repair workflow consumes. Proven instance-side on
 * continuous-research-sample (docs/superpowers/specs 2026-07-03 there)
 * before being promoted here.
 */

export const DRIFT_LABEL = "sensor-drift";
export const DRIFT_LABEL_DESCRIPTION = "Sensor cannot produce an edition from its declared source";
export const DRIFT_LABEL_COLOR = "B60205";
export const DRIFT_REPORT_PATH = ".research/drift/report.json";
export const DRIFT_ISSUE_TITLE = "sensor drift: cannot produce an edition";

export interface DriftEscalationPlan {
  action: "create" | "comment";
  /** Set when action is "comment": the existing open drift issue. */
  issueNumber?: number;
  title: string;
  body: string;
}

/**
 * Decide how a drift report escalates. One open issue is the dedup unit:
 * re-runs comment on it instead of re-filing. Throws TypeError if
 * reportJson is not a JSON object (the report is sensor-authored; a broken
 * report should fail the run loudly, not file a garbage issue).
 */
export function planDriftEscalation(
  reportJson: string,
  openIssueNumbers: number[],
): DriftEscalationPlan {
  const parsed: unknown = JSON.parse(reportJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("drift report must be a JSON object");
  }
  const body = [
    "The sense run could not produce an edition — the sensor is broken or its",
    "source moved.",
    "",
    "Drift report:",
    "",
    "```json",
    JSON.stringify(parsed, null, 2),
    "```",
    "",
    "Repair contract: propose a fix PR that changes the sensor only, and close",
    'this issue via "Fixes #N" in the PR body. This issue is locked: it is',
    "consumed by an automated repair agent, so its content is maintainer- and",
    "sensor-authored only.",
  ].join("\n");
  const oldest = openIssueNumbers.length > 0 ? Math.min(...openIssueNumbers) : undefined;
  return oldest === undefined
    ? { action: "create", title: DRIFT_ISSUE_TITLE, body }
    : {
        action: "comment",
        issueNumber: oldest,
        title: DRIFT_ISSUE_TITLE,
        body,
      };
}
