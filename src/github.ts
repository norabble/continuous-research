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
import type { GitHubPort, OpenPullRequest, OpenPullRequestInput, PutFileInput } from "./ports";
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

/** The subset of a pulls-list item the adapter reads. */
export interface RawPullRequest {
  number: number;
  title: string;
  labels: RawIssue["labels"];
  user?: { login?: string | null } | null;
  created_at: string;
  head: { ref: string };
  html_url: string;
}

/** Map a pulls-list item to the site layer's {@link OpenPullRequest} shape. */
export function mapPullRequestToOpenPullRequest(raw: RawPullRequest): OpenPullRequest {
  return {
    number: raw.number,
    title: raw.title,
    labels: labelNamesOf(raw.labels),
    authorLogin: raw.user?.login ?? "",
    createdAt: raw.created_at,
    headRef: raw.head.ref,
    htmlUrl: raw.html_url,
  };
}

/** True when a listForRepo item is a plain issue — drift issues are never PRs. */
export function isPlainIssue(raw: RawIssue): boolean {
  return !raw.pull_request;
}

export function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

/** Author associations whose comments may become decline records on main. */
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export interface RawComment {
  body?: string | null;
  author_association?: string | null;
}

/**
 * The most recent non-empty comment body from a trusted author, or null.
 * On public instances anyone can comment on a PR; only trusted authors'
 * text may be committed to `main` as a decline reason (security review M1).
 */
export function latestTrustedCommentBody(comments: readonly RawComment[]): string | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c?.body && TRUSTED_ASSOCIATIONS.has(c.author_association ?? "")) return c.body;
  }
  return null;
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

  async listOpenPullRequests(): Promise<OpenPullRequest[]> {
    const { data } = await this.octokit.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: "open",
      per_page: 100,
    });
    return data.map(mapPullRequestToOpenPullRequest);
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

  async latestTrustedComment(prNumber: number): Promise<string | null> {
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      per_page: 100,
    });
    return latestTrustedCommentBody(comments);
  }

  async readFileFromRef(ref: string, path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });
      if (Array.isArray(data) || data.type !== "file") return null;
      return Buffer.from(data.content, data.encoding as BufferEncoding).toString("utf8");
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
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

  async listOpenIssueNumbersByLabel(label: string): Promise<number[]> {
    const { data } = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      labels: label,
      state: "open",
    });
    // listForRepo returns PRs too; drift issues are plain issues.
    return data.filter(isPlainIssue).map((i) => i.number);
  }

  async ensureLabel(name: string, description: string, color: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name,
        description,
        color,
      });
    } catch (err) {
      if ((err as { status?: number }).status !== 422) throw err; // 422 = exists
    }
  }

  async createIssue(title: string, body: string, labels: string[]): Promise<number> {
    const { data } = await this.octokit.rest.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
    });
    return data.number;
  }

  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
  }

  async lockIssue(issueNumber: number): Promise<void> {
    await this.octokit.rest.issues.lock({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
  }
}
