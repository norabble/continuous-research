/**
 * Core types shared across the engine.
 *
 * Vocabulary follows CONCEPT.md → "Canonical terms". The framework treats a
 * descriptor as an opaque string; the *scheme* (what string identifies a unit
 * of data) is project-defined.
 */

/** A project-assigned identity for one unit of data, e.g. `oews-2026`. */
export type Descriptor = string;

/** The lifecycle state of a data-PR, as far as dedup cares. */
export type PrState = "open" | "merged" | "closed_unmerged";

/** Minimal PR shape the dedup classifier needs. Facts are *injected*, not
 *  fetched here, so the classifier stays pure (Phase-1 plan, design rule 1). */
export interface PullRequest {
  number: number;
  state: PrState;
  labels: string[];
}

/** The three dedup states (CONCEPT.md → Data sensing), plus `new`. */
export type DedupState = "merged" | "pending" | "declined" | "new";

/**
 * What the *deterministic* core recommends. The judgment layer (later phase)
 * may re-propose a `declined` descriptor when its recorded reason no longer
 * holds; the deterministic core never does — declined ⇒ `skip`.
 */
export type DedupAction = "skip" | "propose";

export interface DedupResult {
  descriptor: Descriptor;
  state: DedupState;
  action: DedupAction;
}
