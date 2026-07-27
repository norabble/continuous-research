/**
 * The inline claim annotation (Phase 2, Q-B): structure holds only the linkage,
 * never the claim. Pure parser → the derived claim index (a cache, never a
 * source of truth). Tolerant by design (graceful degradation).
 */

export interface Annotation {
  claimId: string;
  backs: string[];
  status: string;
  /**
   * Descriptors of the editions that revised this claim, oldest→newest and
   * append-only (Q-F, *capture at the moment of knowledge*). Always present —
   * `[]` when the optional field is absent, which most claims will be.
   */
  editions: string[];
  line: number;
}

export interface ClaimIndex {
  byId: Map<string, Annotation>;
  duplicates: string[];
  malformed: { line: number; text: string }[];
}

// <!-- claim: <id> | backs: <keys> | status: <status> [| editions: <descriptors>] -->
//
// Every group excludes `|` on purpose. The earlier form ended `status:\s*(.+?)
// \s*-->$`, which anchored on the comment close rather than the field
// separator — so a four-field annotation did not fail, it *silently* parsed
// with status = "supported | editions: …". That poisoned `claim_status` and,
// worse, made an overturned claim fall through okfStatusFor's default and
// export as OKF `status: stable`. Bar-excluding groups are the fix.
//
// An unrecognised trailing field is therefore malformed rather than absorbed.
// That is deliberate: the linter is advisory and never a merge gate, so a loud
// advisory is the right failure mode here, and a silent one is the bug above.
const RE =
  /^<!--\s*claim:\s*([^|]+?)\s*\|\s*backs:\s*([^|]+?)\s*\|\s*status:\s*([^|]+?)\s*(?:\|\s*editions:\s*([^|]*?)\s*)?-->$/;
const looksLikeAnnotation = (t: string) => /^<!--\s*claim:/.test(t);

/** Comma-separated field → trimmed, non-empty values, deduped, order preserved. */
function splitList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const out: string[] = [];
  for (const value of raw.split(",")) {
    const v = value.trim();
    // Append-only means the agent re-appends on every revision; deduping here
    // keeps that idempotent instead of growing the list on each run.
    if (v !== "" && !out.includes(v)) out.push(v);
  }
  return out;
}

export function parseAnnotations(findingsMd: string): ClaimIndex {
  const byId = new Map<string, Annotation>();
  const duplicates: string[] = [];
  const malformed: { line: number; text: string }[] = [];
  findingsMd.split("\n").forEach((raw, i) => {
    const text = raw.trim();
    const m = RE.exec(text);
    if (!m) {
      if (looksLikeAnnotation(text)) malformed.push({ line: i + 1, text });
      return;
    }
    const claimId = m[1] as string;
    const annotation: Annotation = {
      claimId,
      backs: splitList(m[2]),
      status: m[3] as string,
      editions: splitList(m[4]),
      line: i + 1,
    };
    if (byId.has(claimId)) {
      if (!duplicates.includes(claimId)) duplicates.push(claimId);
      return; // first wins
    }
    byId.set(claimId, annotation);
  });
  return { byId, duplicates, malformed };
}
