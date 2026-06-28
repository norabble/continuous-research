#!/usr/bin/env node
/**
 * continuous-research — CLI + runtime engine entrypoint.
 *
 * Thin I/O shell: it constructs the real dependencies (config from disk, the
 * child-process sensor runner, the Octokit port from env, fs artifact reads) and
 * hands them to the injectable command logic in `commands.ts`.
 */

import { readFile } from "node:fs/promises";
import { parseConfig } from "./config";
import { runSense, runRecordDecline } from "./commands";
import { execSensor, readArtifact, createGitHubPortFromEnv } from "./io";
import { extractDeclineFromEvent } from "./event";

async function cmdSense(): Promise<number> {
  const config = parseConfig(await readFile(".research/config.json", "utf8"));
  const port = createGitHubPortFromEnv(process.env);
  const outcome = await runSense({ config, runSensor: execSensor, port, readArtifact });
  console.log(`[sense] ${JSON.stringify(outcome)}`);
  return 0;
}

async function cmdRecordDecline(): Promise<number> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");
  const event: unknown = JSON.parse(await readFile(eventPath, "utf8"));
  const inputs = extractDeclineFromEvent(event);
  if (!inputs) {
    console.log("[record-decline] skipped (merged, or not a data-PR)");
    return 0;
  }
  const port = createGitHubPortFromEnv(process.env);
  await runRecordDecline({ port, ...inputs });
  console.log(`[record-decline] recorded decline for ${inputs.descriptor}`);
  return 0;
}

const COMMANDS: Record<string, () => Promise<number>> = {
  sense: cmdSense,
  "record-decline": cmdRecordDecline,
};

async function main(): Promise<number> {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    console.log("continuous-research <command>");
    console.log(`commands: ${Object.keys(COMMANDS).join(", ")} (init, propose: not yet)`);
    return 0;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    return 1;
  }
  return handler();
}

void main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
