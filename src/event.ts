/**
 * Pure parsing of the `pull_request: closed` event payload into the inputs the
 * `record-decline` / `record-verification` commands need (Phase-1 plan → Step 5,
 * decision 3). Each returns null when the event should *not* produce its record
 * — the two are exact complements on `merged` — so either command can no-op
 * safely even if the workflow `if:` lets it through.
 *
 * The payload is GitHub's, so its keys are snake_case (`merged_by`,
 * `closed_at`); the inputs these produce are ours and are camelCase
 * (`mergedBy`, `declinedAt`). Translating at this boundary is the point of the
 * module — nothing downstream should have to know the payload's shape.
 */

import type { Descriptor } from "./types";
import { descriptorFromLabel } from "./descriptor";
import { actorForUser } from "./provenance";

export interface DeclineEventInputs {
  descriptor: Descriptor;
  prNumber: number;
  declinedAt: string;
  declinedBy?: string;
}

function labelName(label: unknown): string | null {
  if (typeof label === "string") return label;
  if (typeof label === "object" && label !== null && "name" in label) {
    return typeof label.name === "string" ? label.name : null;
  }
  return null;
}

function firstDataDescriptor(labels: unknown): Descriptor | null {
  if (!Array.isArray(labels)) return null;
  for (const label of labels) {
    const name = labelName(label);
    const descriptor = name === null ? null : descriptorFromLabel(name);
    if (descriptor !== null) return descriptor;
  }
  return null;
}

function senderLogin(sender: unknown): string | undefined {
  if (typeof sender === "object" && sender !== null && "login" in sender) {
    return typeof sender.login === "string" ? sender.login : undefined;
  }
  return undefined;
}

/**
 * An event's user object (`{login, type}`) as an OKF actor, or undefined when
 * the payload names nobody. `type` is GitHub's own answer to "is this a bot",
 * which is why it is read here rather than guessed from the login downstream.
 */
function userActor(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.login !== "string") return undefined;
  return actorForUser(o.login, o.type === "Bot");
}

export interface VerificationEventInputs {
  descriptor: Descriptor;
  prNumber: number;
  /** ISO-8601 merge timestamp. */
  mergedAt: string;
  /** Whoever merged it, already in the OKF actor grammar. */
  mergedBy: string;
}

/**
 * The merge half of the same event. Complement of
 * {@link extractDeclineFromEvent}: null unless the PR both **merged** and
 * carried a `data:` label.
 *
 * Throws when a merged data-PR names no one who merged it. That payload is
 * unhandleable, and OKF's whole trust model turns on *who* attested — failing
 * the workflow is better than a record that quietly attributes the merge to
 * nobody.
 */
export function extractVerificationFromEvent(event: unknown): VerificationEventInputs | null {
  if (typeof event !== "object" || event === null) return null;
  const pr: unknown = (event as Record<string, unknown>).pull_request;
  if (typeof pr !== "object" || pr === null) return null;

  const p = pr as Record<string, unknown>;
  if (p.merged !== true) return null; // unmerged ⇒ a decline, not a verification
  if (typeof p.number !== "number") return null;

  const descriptor = firstDataDescriptor(p.labels);
  if (descriptor === null) return null; // not a data-PR

  // `merged_by` is the merge's own actor; `sender` is the fallback for a payload
  // that omits it (both are GitHub-authored, neither is PR-author controlled).
  const mergedBy = userActor(p.merged_by) ?? userActor((event as Record<string, unknown>).sender);
  if (mergedBy === undefined) {
    throw new Error(`Merged data-PR #${p.number} names no merging actor; refusing to attest it`);
  }

  return {
    descriptor,
    prNumber: p.number,
    mergedAt: typeof p.merged_at === "string" ? p.merged_at : new Date().toISOString(),
    mergedBy,
  };
}

export function extractDeclineFromEvent(event: unknown): DeclineEventInputs | null {
  if (typeof event !== "object" || event === null) return null;
  const pr: unknown = (event as Record<string, unknown>).pull_request;
  if (typeof pr !== "object" || pr === null) return null;

  const p = pr as Record<string, unknown>;
  if (p.merged === true) return null; // merged ⇒ no decline record
  if (typeof p.number !== "number") return null;

  const descriptor = firstDataDescriptor(p.labels);
  if (descriptor === null) return null; // not a data-PR

  const declinedAt = typeof p.closed_at === "string" ? p.closed_at : new Date().toISOString();
  return {
    descriptor,
    prNumber: p.number,
    declinedAt,
    declinedBy: senderLogin((event as Record<string, unknown>).sender),
  };
}
