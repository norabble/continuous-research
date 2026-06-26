/**
 * Descriptor mechanism (CONCEPT.md → "Descriptor key — framework provides the
 * mechanism, project provides the scheme").
 *
 * Pure string helpers only: tag/parse a descriptor as a PR label, and derive
 * the canonical repo locations it owns. The framework's *only* constraint on
 * the project-defined scheme is that a descriptor be safe in labels, branch
 * names, and paths.
 */

import type { Descriptor } from "./types";

/** Label prefix that tags a PR with its data descriptor. */
export const LABEL_PREFIX = "data:";

// Safe in GitHub labels, branch names, and paths: lowercase alphanumerics with
// internal dots/hyphens/underscores; must start and end alphanumeric.
const DESCRIPTOR_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export function isValidDescriptor(d: string): d is Descriptor {
  return DESCRIPTOR_RE.test(d);
}

export function assertDescriptor(d: string): Descriptor {
  if (!isValidDescriptor(d)) {
    throw new Error(
      `Invalid descriptor ${JSON.stringify(d)} — expected /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/`,
    );
  }
  return d;
}

/** `oews-2026` → `data:oews-2026`. */
export function labelFor(d: Descriptor): string {
  return `${LABEL_PREFIX}${assertDescriptor(d)}`;
}

/** Inverse of {@link labelFor}; `null` if the label is not a valid data label. */
export function descriptorFromLabel(label: string): Descriptor | null {
  if (!label.startsWith(LABEL_PREFIX)) return null;
  const d = label.slice(LABEL_PREFIX.length);
  return isValidDescriptor(d) ? d : null;
}

/** Branch a data-PR for this descriptor lives on. */
export function branchFor(d: Descriptor): string {
  return `data/${assertDescriptor(d)}`;
}

/** Always-committed provenance stub; also the durable "merged" marker. */
export function provenancePathFor(d: Descriptor): string {
  return `.research/provenance/${assertDescriptor(d)}.json`;
}

/** Decline record committed on close-unmerged. */
export function declinePathFor(d: Descriptor): string {
  return `.research/decisions/${assertDescriptor(d)}.md`;
}
