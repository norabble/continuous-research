/**
 * The seam between the pure dedup core and live GitHub I/O
 * (Phase-1 plan, design rule 1: ports-and-adapters).
 *
 * The Octokit-backed adapter is implemented in a later work-breakdown step
 * (proposal/integration); tests inject a fake. Keeping I/O behind this port is
 * what makes the novel dedup logic unit-testable locally — the whole point of
 * the B/C distribution choice.
 */

import type { Descriptor, PullRequest } from "./types";

export interface GitHubPort {
  /** PRs carrying the given label, across open / merged / closed states. */
  listPullRequestsByLabel(label: string): Promise<PullRequest[]>;
  /** Whether this descriptor's provenance stub exists on the default branch. */
  provenanceStubExists(descriptor: Descriptor): Promise<boolean>;
}
