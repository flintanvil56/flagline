import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface FlagRule {
  allow?: string[];
  deny?: string[];
}

export interface Flag {
  key: string;
  description?: string;
  enabled: boolean;
  /** percent of subjects, 0-100, that should see this flag as on once enabled. undefined means 100. */
  rollout?: number;
  rules?: FlagRule;
  createdAt: string;
  updatedAt: string;
}

export interface FlagStore {
  version: 1;
  flags: Record<string, Flag>;
}

export function createEmptyStore(): FlagStore {
  return { version: 1, flags: {} };
}

export function loadStore(path: string): FlagStore {
  if (!existsSync(path)) {
    return createEmptyStore();
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as FlagStore;
  if (parsed.version !== 1) {
    throw new Error(`unsupported store version: ${String(parsed.version)}`);
  }
  return parsed;
}

export function saveStore(path: string, store: FlagStore): void {
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n", "utf8");
}

// FNV-1a. Only needs to be stable across runs, not cryptographically strong -
// the same (key, subject) pair must always land in the same bucket.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** deterministic bucket in [0, 100) for a flag key + subject pair */
export function bucket(key: string, subject: string): number {
  return fnv1a(`${key}:${subject}`) % 100;
}

/**
 * evaluate whether a flag is on. allow/deny rules are checked before rollout,
 * so they can pull a specific subject out of (or into) a percentage rollout.
 * a rollout under 100 with no subject falls closed, since there is nothing
 * stable to bucket against.
 */
export function evaluate(flag: Flag, subject?: string): boolean {
  if (!flag.enabled) return false;

  if (subject !== undefined && flag.rules?.deny?.includes(subject)) return false;
  if (subject !== undefined && flag.rules?.allow?.includes(subject)) return true;

  if (flag.rollout === undefined || flag.rollout >= 100) return true;
  if (flag.rollout <= 0) return false;
  if (subject === undefined) return false;

  return bucket(flag.key, subject) < flag.rollout;
}
