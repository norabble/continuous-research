/**
 * The inline claim annotation (Phase 2, Q-B): structure holds only the linkage,
 * never the claim. Pure parser → the derived claim index (a cache, never a
 * source of truth). Tolerant by design (graceful degradation).
 */

export interface Annotation {
  claimId: string;
  backs: string[];
  status: string;
  line: number;
}

export interface ClaimIndex {
  byId: Map<string, Annotation>;
  duplicates: string[];
  malformed: { line: number; text: string }[];
}

// <!-- claim: <id> | backs: <keys> | status: <status> -->
const RE = /^<!--\s*claim:\s*(.+?)\s*\|\s*backs:\s*(.+?)\s*\|\s*status:\s*(.+?)\s*-->$/;
const looksLikeAnnotation = (t: string) => /^<!--\s*claim:/.test(t);

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
    const backs = (m[2] as string)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    const annotation: Annotation = {
      claimId,
      backs,
      status: m[3] as string,
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
