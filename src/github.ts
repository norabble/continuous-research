/**
 * Octokit-backed adapter implementing {@link GitHubPort}.
 *
 * Dedup correctness depends on reading the data-PR's own state *immediately* —
 * so this uses the REST list / contents endpoints (primary store, instantly
 * consistent), never the Search API (indexed, laggy), which would reintroduce
 * the race CONCEPT eliminated.
 *
 * The fiddly response-mapping is extracted into pure helpers (unit-tested);
 * the network methods are thin and are exercised by the step-5 walking skeleton.
 * Auth is the caller's concern — construct the `Octokit` with whatever identity
 * is appropriate (a repo-read token suffices for reads; writes that must trigger
 * downstream workflows need an App identity — see CONCEPT axis 1 / A1).
 */

import { Buffer } from "node:buffer";
import type { Octokit } from "octokit";
import type { Descriptor, PrState, PullRequest } from "./types";
import type { GitHubPort, OpenPullRequestInput, PutFileInput } from "./ports";
import { provenancePathFor } from "./descriptor";

/** The subset of an issues-list item the adapter reads. */
export interface RawIssue {
  number: number;
  state: string;
  labels: ReadonlyArray<string | { name?: string | null }>;
  pull_request?: { merged_at?: string | null } | null;
}

export function labelNamesOf(labels: RawIssue["labels"]): string[] {
  return labels
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter((name) => name !== "");
}

export function pullStateOf(issueState: string, mergedAt: string | null | undefined): PrState {
  if (issueState === "open") return "open";
  return mergedAt != null ? "merged" : "closed_unmerged";
}

/** Map an issues-list item to a {@link PullRequest}, or null if it is a plain issue. */
export function mapIssueToPullRequest(raw: RawIssue): PullRequest | null {
  if (!raw.pull_request) return null;
  return {
    number: raw.number,
    state: pullStateOf(raw.state, raw.pull_request.merged_at),
    labels: labelNamesOf(raw.labels),
  };
}

export function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

export interface OctokitGitHubPortOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
}

export class OctokitGitHubPort implements GitHubPort {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(opts: OctokitGitHubPortOptions) {
    this.octokit = opts.octokit;
    this.owner = opts.owner;
    this.repo = opts.repo;
  }

  async listPullRequestsByLabel(label: string): Promise<PullRequest[]> {
    const items = await this.octokit.paginate(this.octokit.rest.issues.listForRepo, {
      owner: this.owner,
      repo: this.repo,
      labels: label,
      state: "all",
      per_page: 100,
    });
    return items
      .map((it) =>
        mapIssueToPullRequest({
          number: it.number,
          state: it.state,
          labels: it.labels,
          pull_request: it.pull_request,
        }),
      )
      .filter((pr): pr is PullRequest => pr !== null);
  }

  async provenanceStubExists(descriptor: Descriptor): Promise<boolean> {
    try {
      await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: provenancePathFor(descriptor),
      });
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }

  async latestComment(prNumber: number): Promise<string | null> {
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      per_page: 100,
    });
    return comments.at(-1)?.body ?? null;
  }

  async defaultBranch(): Promise<string> {
    const { data } = await this.octokit.rest.repos.get({ owner: this.owner, repo: this.repo });
    return data.default_branch;
  }

  async branchHeadSha(branch: string): Promise<string> {
    const { data } = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
    });
    return data.object.sha;
  }

  async createBranch(branch: string, fromSha: string): Promise<void> {
    await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branch}`,
      sha: fromSha,
    });
  }

  async putFile(input: PutFileInput): Promise<void> {
    // Updating an existing file requires its blob sha; without it the API
    // 422s (e.g. re-recording a decline for the same descriptor).
    let sha: string | undefined;
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: input.path,
        ref: input.branch,
      });
      if (!Array.isArray(data) && data.type === "file") sha = data.sha;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: input.path,
      message: input.message,
      content: Buffer.from(input.content, "utf8").toString("base64"),
      branch: input.branch,
      ...(sha === undefined ? {} : { sha }),
    });
  }

  async openPullRequest(input: OpenPullRequestInput): Promise<number> {
    const { data } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      head: input.head,
      base: input.base,
      title: input.title,
      body: input.body,
    });
    return data.number;
  }

  async addLabels(prNumber: number, labels: string[]): Promise<void> {
    await this.octokit.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      labels,
    });
  }
}
