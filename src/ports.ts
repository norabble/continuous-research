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

export interface OpenPullRequest {
  number: number;
  title: string;
  labels: string[];
  authorLogin: string; // e.g. "continuous-research-bot[bot]"
  createdAt: string; // ISO-8601
  headRef: string; // branch name, e.g. "data/limits-google-d1992c4c"
  htmlUrl: string;
}

export interface GitHubPort {
  // --- reads ---
  /** PRs carrying the given label, across open / merged / closed states. */
  listPullRequestsByLabel(label: string): Promise<PullRequest[]>;
  /** All open PRs (any label/author); the site layer filters. */
  listOpenPullRequests(): Promise<OpenPullRequest[]>;
  /** Whether this descriptor's provenance stub exists on the default branch. */
  provenanceStubExists(descriptor: Descriptor): Promise<boolean>;
  /**
   * The most recent PR comment body written by a TRUSTED author
   * (OWNER / MEMBER / COLLABORATOR), or null if there is none. Untrusted
   * comments must never become decline records committed to main.
   */
  latestTrustedComment(prNumber: number): Promise<string | null>;
  /** UTF-8 content of `path` at `ref` (branch/sha/tag), or null if absent. */
  readFileFromRef(ref: string, path: string): Promise<string | null>;

  // --- repo info ---
  defaultBranch(): Promise<string>;
  branchHeadSha(branch: string): Promise<string>;

  // --- writes ---
  createBranch(branch: string, fromSha: string): Promise<void>;
  putFile(input: PutFileInput): Promise<void>;
  /** Opens a PR and returns its number. */
  openPullRequest(input: OpenPullRequestInput): Promise<number>;
  addLabels(prNumber: number, labels: string[]): Promise<void>;

  // --- issues (drift escalation) ---
  /** Numbers of OPEN issues carrying the given label. */
  listOpenIssueNumbersByLabel(label: string): Promise<number[]>;
  /** Create-or-update the label (idempotent). */
  ensureLabel(name: string, description: string, color: string): Promise<void>;
  /** Opens an issue, returns its number. */
  createIssue(title: string, body: string, labels: string[]): Promise<number>;
  commentOnIssue(issueNumber: number, body: string): Promise<void>;
  /** Locks the conversation; idempotent (REST lock returns 204 either way). */
  lockIssue(issueNumber: number): Promise<void>;
}
