#!/usr/bin/env node
/**
 * continuous-research — CLI + runtime engine entrypoint (Phase-1 scaffold).
 *
 * Subcommands (sense / propose / record-decline / init) are wired in later
 * work-breakdown steps; this just establishes the entrypoint. Run in dev with
 * `npm run cli -- <command>`.
 */

const COMMANDS = ["sense", "propose", "record-decline", "init"] as const;

function usage(): void {
  console.log("continuous-research <command>");
  console.log(`commands (not yet implemented): ${COMMANDS.join(", ")}`);
}

const command = process.argv[2];

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

if (!(COMMANDS as readonly string[]).includes(command)) {
  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

console.error(`Command "${command}" is not implemented yet (Phase-1 scaffold).`);
process.exit(2);
