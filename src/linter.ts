/**
 * Deterministic consistency-linter (Phase 2, Q-D). Advisory — it produces
 * findings, never a merge gate (human review is the spine). Pure.
 */

import { flattenResults, type ChangedKey } from "./results";
import type { ClaimIndex } from "./annotations";

export type LintLevel = "error" | "warn";

export interface LintFinding {
  level: LintLevel;
  claimId?: string;
  message: string;
}

export interface LintInput {
  results: unknown;
  index: ClaimIndex;
  changed: ChangedKey[];
  priorIndex?: ClaimIndex;
}

const resolves = (backsKey: string, keys: string[]): boolean =>
  keys.some((k) => k === backsKey || k.startsWith(`${backsKey}.`));

export function lintConsistency(input: LintInput): LintFinding[] {
  const findings: LintFinding[] = [];
  const resultKeys = [...flattenResults(input.results).keys()];

  for (const claimId of input.index.duplicates) {
    findings.push({ level: "error", claimId, message: `duplicate claim id "${claimId}"` });
  }
  for (const m of input.index.malformed) {
    findings.push({ level: "error", message: `malformed annotation at line ${m.line}: ${m.text}` });
  }

  for (const a of input.index.byId.values()) {
    for (const b of a.backs) {
      if (b === "(prose)") continue;
      if (!resolves(b, resultKeys)) {
        findings.push({
          level: "error",
          claimId: a.claimId,
          message: `backs key "${b}" not found in results.json`,
        });
      }
    }
  }

  if (input.priorIndex) {
    const changedBacked = (backs: string[]): boolean =>
      backs.some(
        (b) =>
          b !== "(prose)" && input.changed.some((c) => c.key === b || c.key.startsWith(`${b}.`)),
      );
    for (const a of input.index.byId.values()) {
      const prior = input.priorIndex.byId.get(a.claimId);
      if (prior && changedBacked(a.backs) && prior.status === a.status) {
        findings.push({
          level: "warn",
          claimId: a.claimId,
          message: `backing changed but status "${a.status}" was not touched`,
        });
      }
    }
  }

  return findings;
}
