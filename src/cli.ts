#!/usr/bin/env node
import { existsSync } from "node:fs";
import {
  createEmptyStore,
  evaluate,
  loadStore,
  saveStore,
  type Flag,
} from "./flags.js";

const DEFAULT_FILE = process.env.FLAGLINE_FILE ?? "flags.json";

interface ParsedArgs {
  positional: string[];
  opts: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        opts[name] = next;
        i++;
      } else {
        opts[name] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, opts };
}

function fail(message: string): never {
  process.stderr.write(`flagline: ${message}\n`);
  process.exit(1);
}

function output(asJson: boolean, human: string, data: unknown): void {
  if (asJson) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(human + "\n");
  }
}

function printUsage(): void {
  process.stdout.write(`flagline - local feature flag store

usage:
  flagline init
  flagline add <key> [--description text] [--enabled] [--rollout N]
  flagline rm <key>
  flagline enable <key>
  flagline disable <key>
  flagline set-rollout <key> <percent>
  flagline allow <key> <subject>
  flagline deny <key> <subject>
  flagline list [--json]
  flagline eval <key> [--subject id] [--json]

options:
  --file path   use a store file other than ./flags.json
  --json        machine readable output
`);
}

function main(): void {
  const [, , command, ...rest] = process.argv;
  const { positional, opts } = parseArgs(rest);
  const file = typeof opts.file === "string" ? opts.file : DEFAULT_FILE;
  const asJson = opts.json === true;

  switch (command) {
    case "init": {
      if (existsSync(file)) fail(`${file} already exists`);
      saveStore(file, createEmptyStore());
      output(asJson, `created ${file}`, { file, created: true });
      break;
    }

    case "add": {
      const key = positional[0];
      if (!key) {
        fail("usage: flagline add <key> [--description text] [--enabled] [--rollout N]");
      }
      const store = loadStore(file);
      if (store.flags[key]) fail(`flag "${key}" already exists`);

      let rollout: number | undefined;
      if (typeof opts.rollout === "string") {
        rollout = Number(opts.rollout);
        if (Number.isNaN(rollout) || rollout < 0 || rollout > 100) {
          fail("--rollout must be a number between 0 and 100");
        }
      }

      const now = new Date().toISOString();
      const flag: Flag = {
        key,
        description: typeof opts.description === "string" ? opts.description : undefined,
        enabled: opts.enabled === true,
        rollout,
        createdAt: now,
        updatedAt: now,
      };
      store.flags[key] = flag;
      saveStore(file, store);
      output(asJson, `added ${key}`, flag);
      break;
    }

    case "rm": {
      const key = positional[0];
      if (!key) fail("usage: flagline rm <key>");
      const store = loadStore(file);
      if (!store.flags[key]) fail(`flag "${key}" not found`);
      delete store.flags[key];
      saveStore(file, store);
      output(asJson, `removed ${key}`, { key, removed: true });
      break;
    }

    case "enable":
    case "disable": {
      const key = positional[0];
      if (!key) fail(`usage: flagline ${command} <key>`);
      const store = loadStore(file);
      const flag = store.flags[key];
      if (!flag) fail(`flag "${key}" not found`);
      flag.enabled = command === "enable";
      flag.updatedAt = new Date().toISOString();
      saveStore(file, store);
      output(asJson, `${command}d ${key}`, flag);
      break;
    }

    case "set-rollout": {
      const key = positional[0];
      const percent = positional[1];
      if (!key || percent === undefined) {
        fail("usage: flagline set-rollout <key> <percent>");
      }
      const value = Number(percent);
      if (Number.isNaN(value) || value < 0 || value > 100) {
        fail("percent must be a number between 0 and 100");
      }
      const store = loadStore(file);
      const flag = store.flags[key];
      if (!flag) fail(`flag "${key}" not found`);
      flag.rollout = value;
      flag.updatedAt = new Date().toISOString();
      saveStore(file, store);
      output(asJson, `set rollout for ${key} to ${value}%`, flag);
      break;
    }

    case "allow":
    case "deny": {
      const key = positional[0];
      const subject = positional[1];
      if (!key || !subject) fail(`usage: flagline ${command} <key> <subject>`);
      const store = loadStore(file);
      const flag = store.flags[key];
      if (!flag) fail(`flag "${key}" not found`);
      flag.rules ??= {};
      const list = command === "allow" ? (flag.rules.allow ??= []) : (flag.rules.deny ??= []);
      if (!list.includes(subject)) list.push(subject);
      flag.updatedAt = new Date().toISOString();
      saveStore(file, store);
      output(asJson, `${command}ed ${subject} on ${key}`, flag);
      break;
    }

    case "list": {
      const store = loadStore(file);
      const flags = Object.values(store.flags);
      if (asJson) {
        output(true, "", flags);
      } else if (flags.length === 0) {
        process.stdout.write("no flags defined\n");
      } else {
        for (const flag of flags) {
          const status = flag.enabled ? "on" : "off";
          const rollout = flag.rollout !== undefined ? ` @${flag.rollout}%` : "";
          process.stdout.write(`${flag.key}\t${status}${rollout}\t${flag.description ?? ""}\n`);
        }
      }
      break;
    }

    case "eval": {
      const key = positional[0];
      if (!key) fail("usage: flagline eval <key> [--subject id]");
      const store = loadStore(file);
      const flag = store.flags[key];
      if (!flag) fail(`flag "${key}" not found`);
      const subject = typeof opts.subject === "string" ? opts.subject : undefined;
      const result = evaluate(flag, subject);
      output(asJson, String(result), { key, subject: subject ?? null, result });
      break;
    }

    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

main();
