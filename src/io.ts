/**
 * I/O shell — the real adapters that back the injected dependencies in
 * `commands.ts`. Thin by design (integration-exercised by the step-5 skeleton);
 * the one bit of logic, `parseRepository`, is pure and unit-tested.
 */

import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Octokit } from "octokit";
import type { SensorRunner } from "./sensor";
import { OctokitGitHubPort } from "./github";

const execAsync = promisify(exec);

/** Runs the declared sensor command and returns its stdout. */
export const execSensor: SensorRunner = async (command) => {
  const { stdout } = await execAsync(command, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

/** Reads an artifact the sensor wrote into the working tree. */
export const readArtifact = (path: string): Promise<string> => readFile(path, "utf8");

export function parseRepository(slug: string): { owner: string; repo: string } {
  const parts = slug.split("/");
  const [owner, repo] = parts;
  if (parts.length !== 2 || !owner || !repo) {
    throw new Error(`GITHUB_REPOSITORY must be "owner/repo", got ${JSON.stringify(slug)}`);
  }
  return { owner, repo };
}

/** Builds the GitHub port from environment (Actions provides these). */
export function createGitHubPortFromEnv(env: NodeJS.ProcessEnv): OctokitGitHubPort {
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN (or GH_TOKEN) is required");
  if (!env.GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY is required");
  const { owner, repo } = parseRepository(env.GITHUB_REPOSITORY);
  return new OctokitGitHubPort({ octokit: new Octokit({ auth: token }), owner, repo });
}
