#!/usr/bin/env node
/**
 * continuous-research — CLI + runtime engine entrypoint.
 *
 * Thin I/O shell: it constructs the real dependencies (config from disk, the
 * child-process sensor runner, the Octokit port from env, fs artifact reads) and
 * hands them to the injectable command logic in `commands.ts`.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { parseConfig } from "./config";
import { helpText } from "./help";
import { runSense, runRecordDecline, runInit, runImpact, runSite, escalateDrift } from "./commands";
import { NEXT_STEPS } from "./scaffold";
import { DRIFT_REPORT_PATH } from "./drift";
import { execSensor, readArtifact, createGitHubPortFromEnv } from "./io";
import { extractDeclineFromEvent } from "./event";

async function writeIfAbsent(path: string, content: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return true;
  }
}

async function cmdInit(): Promise<number> {
  const results = await runInit({ writeIfAbsent });
  for (const r of results) {
    console.log(`[init] ${r.created ? "created" : "exists "} ${r.path}`);
  }
  console.log(NEXT_STEPS);
  return 0;
}

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

function parseImpactArgs(argv: string[]): { descriptor: string; against?: string } {
  const descriptor = argv[3];
  if (!descriptor || descriptor.startsWith("-"))
    throw new Error("usage: impact <descriptor> [--against <prior>]");
  const i = argv.indexOf("--against");
  const against = i !== -1 ? argv[i + 1] : undefined;
  if (i !== -1 && !against) throw new Error("--against requires a prior descriptor");
  return { descriptor, against };
}

async function cmdImpact(): Promise<number> {
  const { descriptor, against } = parseImpactArgs(process.argv);
  const config = parseConfig(await readFile(".research/config.json", "utf8"));
  const port = createGitHubPortFromEnv(process.env);
  const artifact = await runImpact({
    config,
    port,
    readWorkingFile: (path) => readFile(path, "utf8"),
    descriptor,
    against,
  });
  const outPath = `.research/impact/${descriptor}.impact.json`;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `[impact] ${descriptor} baseline=${artifact.baseline ?? "none"} changed=${artifact.changed.length} affected=${artifact.affected.length} lint=${artifact.lint.length} → ${outPath}`,
  );
  return 0;
}

async function cmdSite(): Promise<number> {
  const config = parseConfig(await readFile(".research/config.json", "utf8"));
  const port = createGitHubPortFromEnv(process.env);
  const files = await runSite({
    config,
    port,
    generatedAt: new Date().toISOString(),
    fallbackTitle: process.env.GITHUB_REPOSITORY ?? "research",
    repoSlug: process.env.GITHUB_REPOSITORY ?? null,
  });
  if (files === null) {
    console.log("[site] disabled — nothing to do");
    return 0;
  }
  for (const file of files) {
    const path = `_site/${file.path}`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
  console.log(`[site] wrote ${files.length} files to _site/`);
  return 0;
}

async function cmdEscalateDrift(): Promise<number> {
  const github = createGitHubPortFromEnv(process.env);
  await escalateDrift({
    github,
    readReport: async () => {
      try {
        return await readFile(DRIFT_REPORT_PATH, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    log: (message) => console.log(message),
  });
  return 0;
}

const COMMANDS: Record<string, () => Promise<number>> = {
  init: cmdInit,
  sense: cmdSense,
  "record-decline": cmdRecordDecline,
  impact: cmdImpact,
  site: cmdSite,
  "escalate-drift": cmdEscalateDrift,
};

/** Works from both src/ (tsx dev) and dist/ (built): ../package.json is the repo root. */
function packageVersion(): string {
  const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
  return pkg.version;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command === "--version" || command === "-v") {
    console.log(packageVersion());
    return 0;
  }
  if (!command || command === "--help" || command === "-h") {
    console.log(helpText(packageVersion()));
    return 0;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(`commands: ${Object.keys(COMMANDS).join(", ")} (see --help)`);
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
