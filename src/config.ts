/**
 * `.research/config` — the instance's declaration of its hooks (design rule 2:
 * hooks are declared, not discovered) plus the optional Phase-2 `impact` toggle
 * block (every disableable Phase-2 feature hangs here — CONCEPT Phasing).
 */

export type AgentEngine = "gh-aw" | "claude-code";

export interface ImpactConfig {
  /** Master toggle for the mechanical impact layer + linter. Default off. */
  enabled: boolean;
  /** Where the edition's results.json lives; `${descriptor}` is substituted. */
  resultsPath?: string;
  /** Prose file the claim index is parsed from. Default "findings.md". */
  findings?: string;
  /** Consistency-linter on/off. Default true when enabled. */
  linter?: boolean;
  /** Which substrate `init` scaffolds the agent body for (engine unaffected). */
  agentEngine?: AgentEngine;
}

export interface SiteConfig {
  /** Master toggle for the site generation layer. */
  enabled: boolean;
  /** Optional title for the generated site. */
  title?: string;
  /** Optional description for the generated site. */
  description?: string;
}

export interface ResearchConfig {
  /** Shell command the engine runs to detect new data (writes JSON to stdout). */
  sensor: string;
  /** Optional Phase-2 impact layer config; absent ⇒ layer off. */
  impact?: ImpactConfig;
  /** Optional site generation config; absent ⇒ layer off. */
  site?: SiteConfig;
}

function parseImpact(raw: unknown): ImpactConfig {
  if (typeof raw !== "object" || raw === null) throw new Error('config "impact" must be an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") throw new Error('config "impact.enabled" must be a boolean');
  const out: ImpactConfig = { enabled: o.enabled };
  if (o.resultsPath !== undefined) {
    if (typeof o.resultsPath !== "string")
      throw new Error('config "impact.resultsPath" must be a string');
    out.resultsPath = o.resultsPath;
  }
  if (o.findings !== undefined) {
    if (typeof o.findings !== "string")
      throw new Error('config "impact.findings" must be a string');
    out.findings = o.findings;
  }
  if (o.linter !== undefined) {
    if (typeof o.linter !== "boolean") throw new Error('config "impact.linter" must be a boolean');
    out.linter = o.linter;
  }
  if (o.agentEngine !== undefined) {
    if (o.agentEngine !== "gh-aw" && o.agentEngine !== "claude-code") {
      throw new Error('config "impact.agentEngine" must be "gh-aw" or "claude-code"');
    }
    out.agentEngine = o.agentEngine;
  }
  return out;
}

function parseSite(raw: unknown): SiteConfig {
  if (typeof raw !== "object" || raw === null) throw new Error('config "site" must be an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") throw new Error('config "site.enabled" must be a boolean');
  const out: SiteConfig = { enabled: o.enabled };
  if (o.title !== undefined) {
    if (typeof o.title !== "string") throw new Error('config "site.title" must be a string');
    out.title = o.title;
  }
  if (o.description !== undefined) {
    if (typeof o.description !== "string")
      throw new Error('config "site.description" must be a string');
    out.description = o.description;
  }
  return out;
}

export function parseConfig(json: string): ResearchConfig {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null) throw new Error("config must be a JSON object");
  const obj = data as Record<string, unknown>;
  const sensor = obj.sensor;
  if (typeof sensor !== "string" || sensor.trim() === "") {
    throw new Error('config "sensor" must be a non-empty string command');
  }
  const config: ResearchConfig = { sensor };
  if (obj.impact !== undefined) config.impact = parseImpact(obj.impact);
  if (obj.site !== undefined) config.site = parseSite(obj.site);
  return config;
}
