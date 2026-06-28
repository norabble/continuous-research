/**
 * Pure parsing of the `pull_request: closed` event payload into the inputs the
 * `record-decline` command needs (Phase-1 plan → Step 5, decision 3). Returns
 * null when the event should *not* produce a decline record — merged, or not a
 * data-PR — so the command can no-op safely even if the workflow `if:` lets it
 * through.
 */

import type { Descriptor } from "./types";
import { descriptorFromLabel } from "./descriptor";

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
