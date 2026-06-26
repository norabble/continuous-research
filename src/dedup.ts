/**
 * Three-state dedup (CONCEPT.md → "Three-state dedup, keyed off the data-PR's
 * own state").
 *
 * The dedup decision is keyed off the data-PR's own state plus the
 * always-present provenance stub — never the bulk data, which Q-E may
 * legitimately not store. Precedence:
 *
 *   merged / on-main  >  pending (open)  >  declined (closed-unmerged)  >  new
 */

import type { Descriptor, DedupResult, DedupState, PrState, PullRequest } from "./types";
import { labelFor } from "./descriptor";
import type { GitHubPort } from "./ports";

/**
 * Pure classifier. Does NO I/O — all facts are injected so the novel logic is
 * unit-testable locally (Phase-1 plan, design rule 1).
 *
 * @param provenanceStubExistsOnMain  true if `.research/provenance/<descriptor>.json`
 *   is committed on the default branch (the durable "merged" marker, present
 *   even when the bulk data is not stored).
 */
export function classify(
  descriptor: Descriptor,
  pullRequests: readonly PullRequest[],
  provenanceStubExistsOnMain: boolean,
): DedupResult {
  const label = labelFor(descriptor);
  const relevant = pullRequests.filter((pr) => pr.labels.includes(label));
  const has = (state: PrState): boolean => relevant.some((pr) => pr.state === state);

  let state: DedupState;
  if (provenanceStubExistsOnMain || has("merged")) {
    state = "merged";
  } else if (has("open")) {
    state = "pending";
  } else if (has("closed_unmerged")) {
    state = "declined";
  } else {
    state = "new";
  }

  return { descriptor, state, action: state === "new" ? "propose" : "skip" };
}

/**
 * Orchestrates the port, then classifies. Thin by design: the I/O lives in the
 * adapter behind {@link GitHubPort}, the decision lives in {@link classify}.
 */
export async function dedupe(port: GitHubPort, descriptor: Descriptor): Promise<DedupResult> {
  const [pullRequests, stubExists] = await Promise.all([
    port.listPullRequestsByLabel(labelFor(descriptor)),
    port.provenanceStubExists(descriptor),
  ]);
  return classify(descriptor, pullRequests, stubExists);
}
