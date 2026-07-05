/**
 * The mechanical results diff (Phase 2, Q-B). Pure: flatten each results.json
 * to dotted leaf paths, then compare. The diffable unit is the committed
 * results.json (CONCEPT canonical term).
 */

export interface ChangedKey {
  key: string;
  from: unknown;
  to: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Dotted leaf paths → values. Recurses plain objects only; arrays are leaves. */
export function flattenResults(obj: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!isPlainObject(obj)) {
    if (prefix !== "") out.set(prefix, obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix === "" ? k : `${prefix}.${k}`;
    if (isPlainObject(v)) for (const [ik, iv] of flattenResults(v, key)) out.set(ik, iv);
    else out.set(key, v);
  }
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function diffResults(prev: unknown, next: unknown): ChangedKey[] {
  const p = flattenResults(prev);
  const n = flattenResults(next);
  const changed: ChangedKey[] = [];
  const removed: ChangedKey[] = [];
  const added: ChangedKey[] = [];

  // Collect all unique keys in order
  const allKeys = new Set([...p.keys(), ...n.keys()]);

  for (const key of allKeys) {
    const from = p.get(key);
    const to = n.get(key);

    if (!p.has(key)) {
      // Added
      added.push({ key, from: undefined, to });
    } else if (!n.has(key)) {
      // Removed
      removed.push({ key, from, to: undefined });
    } else if (!same(from, to)) {
      // Changed
      changed.push({ key, from, to });
    }
  }

  return [...changed, ...removed, ...added];
}

export function resolveResultsPath(template: string, descriptor: string): string {
  return template.replaceAll("${descriptor}", descriptor);
}
