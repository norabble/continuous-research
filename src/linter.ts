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
  /**
   * Descriptors of the accepted editions, for checking annotations' `editions:`
   * field. Injected (design rule 1) — absent ⇒ the rule is skipped entirely, so
   * a caller with no cheap way to enumerate editions loses nothing else.
   */
  knownEditions?: string[];
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

  // The only automated defence against a mistyped or invented descriptor. A
  // wrong citation is worse than an absent one (trust honesty), and nothing
  // downstream can tell the two apart — the export just believes the field.
  if (input.knownEditions !== undefined) {
    const known = new Set(input.knownEditions);
    for (const a of input.index.byId.values()) {
      for (const d of a.editions) {
        if (!known.has(d)) {
          findings.push({
            level: "error",
            claimId: a.claimId,
            message: `editions entry "${d}" is not an accepted edition`,
          });
        }
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
