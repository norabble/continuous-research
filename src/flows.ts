/**
 * Write orchestration — the multi-call sequences the `sense` / decline commands
 * invoke. They route every write through {@link GitHubPort}, so the sequence
 * logic is unit-testable with a fake port (Phase-1 plan, design rule 1).
 *
 * The pure content (PR title/body) is extracted into {@link buildProposalContent}.
 */

import type { Descriptor } from "./types";
import type { GitHubPort } from "./ports";
import type { ProvenanceStub } from "./provenance";
import { provenanceFile } from "./provenance";
import type { DeclineInput } from "./decline";
import { declineFile } from "./decline";
import { branchFor, labelFor } from "./descriptor";

export interface ProposeInput {
  descriptor: Descriptor;
  provenance: ProvenanceStub;
  /** Extra files to commit on the branch (e.g. a placeholder artifact). */
  artifacts?: ReadonlyArray<{ path: string; content: string }>;
}

export interface ProposeResult {
  prNumber: number;
  branch: string;
}

/** Phase-1 PR content: a templated impact-declaration stub (prose is a later phase). */
export function buildProposalContent(input: ProposeInput): { title: string; body: string } {
  const { descriptor, provenance } = input;
  const title = `data: ${descriptor}`;
  const body = [
    `## New data: ${descriptor}`,
    "",
    `- **Source:** ${provenance.source}`,
    `- **Retrieved:** ${provenance.retrievedAt}`,
    `- **Hash:** \`${provenance.hash}\``,
    "",
    "_Impact declaration: prose interpretation is a later phase; this is a templated stub._",
    "",
  ].join("\n");
  return { title, body };
}

export async function proposeDataPR(port: GitHubPort, input: ProposeInput): Promise<ProposeResult> {
  const { descriptor } = input;
  const base = await port.defaultBranch();
  const fromSha = await port.branchHeadSha(base);
  const branch = branchFor(descriptor);
  await port.createBranch(branch, fromSha);

  const files = [provenanceFile(input.provenance), ...(input.artifacts ?? [])];
  for (const file of files) {
    await port.putFile({
      branch,
      path: file.path,
      content: file.content,
      message: `data(${descriptor}): add ${file.path}`,
    });
  }

  const { title, body } = buildProposalContent(input);
  const prNumber = await port.openPullRequest({ head: branch, base, title, body });
  await port.addLabels(prNumber, [labelFor(descriptor)]);
  return { prNumber, branch };
}

export async function recordDecline(port: GitHubPort, input: DeclineInput): Promise<void> {
  const base = await port.defaultBranch();
  const file = declineFile(input);
  await port.putFile({
    branch: base,
    path: file.path,
    content: file.content,
    message: `decline(${input.descriptor}): record reason`,
  });
}
