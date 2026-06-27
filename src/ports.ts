/**
 * The seam between the engine's logic and live GitHub I/O
 * (Phase-1 plan, design rule 1: ports-and-adapters).
 *
 * The Octokit-backed adapter is `OctokitGitHubPort` (`src/github.ts`); tests
 * inject a fake. Keeping I/O behind this port is what lets the dedup classifier
 * AND the write *orchestration* (`src/flows.ts`) be unit-tested without GitHub —
 * the whole point of the B/C distribution choice.
 */

import type { Descriptor, PullRequest } from "./types";

export interface PutFileInput {
  branch: string;
  path: string;
  content: string;
  message: string;
}

export interface OpenPullRequestInput {
  head: string;
  base: string;
  title: string;
  body: string;
}

export interface GitHubPort {
  // --- reads ---
  /** PRs carrying the given label, across open / merged / closed states. */
  listPullRequestsByLabel(label: string): Promise<PullRequest[]>;
  /** Whether this descriptor's provenance stub exists on the default branch. */
  provenanceStubExists(descriptor: Descriptor): Promise<boolean>;

  // --- repo info ---
  defaultBranch(): Promise<string>;
  branchHeadSha(branch: string): Promise<string>;

  // --- writes ---
  createBranch(branch: string, fromSha: string): Promise<void>;
  putFile(input: PutFileInput): Promise<void>;
  /** Opens a PR and returns its number. */
  openPullRequest(input: OpenPullRequestInput): Promise<number>;
  addLabels(prNumber: number, labels: string[]): Promise<void>;
}
