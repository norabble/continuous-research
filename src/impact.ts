/**
 * Affected-claim selection (Phase 2, Q-B): given the results diff and the
 * derived claim index, the claims whose backing changed — the exact passages the
 * agent re-examines. Pure. Segment-boundary matching so `close` does not match
 * `close_vs_ma7_pct`.
 */

import type { ChangedKey } from "./results";
import type { Annotation, ClaimIndex } from "./annotations";

const backed = (backsKey: string, changed: ChangedKey[]): boolean =>
  backsKey !== "(prose)" &&
  changed.some((c) => c.key === backsKey || c.key.startsWith(`${backsKey}.`));

export function affectedClaims(changed: ChangedKey[], index: ClaimIndex): Annotation[] {
  return [...index.byId.values()].filter((a) => a.backs.some((b) => backed(b, changed)));
}
