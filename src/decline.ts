/**
 * Decline record (CONCEPT.md → "The decline record").
 *
 * When the author closes a data-PR unmerged, an authorized workflow commits this
 * record to `main`. Deterministic templating — NEVER an agent call. It feeds the
 * evolution narrative and is *not* the dedup signal (the closed data-PR is).
 *
 * Pure renderer only; committing the file is adapter work (later step).
 */

import type { Descriptor } from "./types";
import { assertDescriptor, declinePathFor } from "./descriptor";

export interface DeclineInput {
  descriptor: Descriptor;
  /** The author's closing comment — the reason the data-PR was declined. */
  reason: string;
  /** ISO-8601 timestamp of the decline. */
  declinedAt: string;
  /** The data-PR number that was closed unmerged. */
  prNumber?: number;
  /** The login of whoever closed it. */
  declinedBy?: string;
}

function requireIsoDate(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`Decline declinedAt must be an ISO-8601 date, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Render the decline record as Markdown with a small YAML frontmatter block
 * (structured metadata for the deferred evolution-narrative generator) followed
 * by a human-readable body. Free-text `reason` lives in the body, never the
 * frontmatter, so no YAML escaping is required.
 */
export function renderDeclineRecord(input: DeclineInput): string {
  const descriptor = assertDescriptor(input.descriptor);
  const declinedAt = requireIsoDate(input.declinedAt);
  const reason = input.reason.trim();

  const lines: string[] = [];
  lines.push("---");
  lines.push(`descriptor: "${descriptor}"`);
  lines.push(`declined_at: "${declinedAt}"`);
  if (input.prNumber !== undefined) lines.push(`data_pr: ${input.prNumber}`);
  if (input.declinedBy !== undefined) lines.push(`declined_by: "${input.declinedBy}"`);
  lines.push("---");
  lines.push("");
  lines.push(`# Declined: ${descriptor}`);
  lines.push("");
  lines.push("## Reason");
  lines.push("");
  lines.push(reason === "" ? "_No reason was given when the data-PR was closed._" : reason);
  lines.push("");

  return lines.join("\n");
}

/** Convenience: the committed file's path + rendered content. */
export function declineFile(input: DeclineInput): { path: string; content: string } {
  return { path: declinePathFor(input.descriptor), content: renderDeclineRecord(input) };
}
