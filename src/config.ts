/**
 * `.research/config` — the instance's declaration of its hooks (design rule 2:
 * hooks are declared, not discovered). The Phase-1 skeleton needs only `sensor`;
 * `pipeline` / `interpretation` are added in later steps.
 */

export interface ResearchConfig {
  /** Shell command the engine runs to detect new data (writes JSON to stdout). */
  sensor: string;
}

export function parseConfig(json: string): ResearchConfig {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null) {
    throw new Error("config must be a JSON object");
  }
  const sensor = (data as Record<string, unknown>).sensor;
  if (typeof sensor !== "string" || sensor.trim() === "") {
    throw new Error('config "sensor" must be a non-empty string command');
  }
  return { sensor };
}
