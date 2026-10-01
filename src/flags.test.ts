import { test } from "node:test";
import assert from "node:assert/strict";
import { bucket, evaluate, type Flag } from "./flags.js";

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    key: "checkout-v2",
    enabled: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function subjects(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `user-${i}`);
}

test("bucket is stable for the same key and subject", () => {
  assert.equal(bucket("checkout-v2", "user-1"), bucket("checkout-v2", "user-1"));
});

test("bucket stays within [0, 100)", () => {
  for (const s of subjects(2000)) {
    const b = bucket("checkout-v2", s);
    assert.ok(Number.isInteger(b) && b >= 0 && b < 100, `bucket out of range: ${b}`);
  }
});

test("bucket handles empty and non-ascii subjects", () => {
  for (const s of ["", "ünïcödé", "日本語", "a:b:c"]) {
    const b = bucket("k", s);
    assert.ok(b >= 0 && b < 100);
  }
});

test("different flag keys bucket the same subject independently", () => {
  const differing = subjects(200).filter((s) => bucket("flag-a", s) !== bucket("flag-b", s));
  assert.ok(differing.length > 100, "keys should not share a bucketing");
});

test("disabled flag is off regardless of rules and rollout", () => {
  const flag = makeFlag({ enabled: false, rollout: 100, rules: { allow: ["alice"] } });
  assert.equal(evaluate(flag, "alice"), false);
  assert.equal(evaluate(flag), false);
});

test("enabled flag with no rollout is on for everyone, with or without a subject", () => {
  const flag = makeFlag();
  assert.equal(evaluate(flag), true);
  assert.equal(evaluate(flag, "alice"), true);
});

test("rollout of 100 or more is on for everyone", () => {
  for (const rollout of [100, 150]) {
    const flag = makeFlag({ rollout });
    assert.equal(evaluate(flag), true);
    assert.ok(subjects(200).every((s) => evaluate(flag, s)));
  }
});

test("rollout of 0 or less is off for everyone", () => {
  for (const rollout of [0, -5]) {
    const flag = makeFlag({ rollout });
    assert.equal(evaluate(flag), false);
    assert.ok(subjects(200).every((s) => !evaluate(flag, s)));
  }
});

test("partial rollout without a subject falls closed", () => {
  assert.equal(evaluate(makeFlag({ rollout: 50 })), false);
});

test("partial rollout matches the bucket threshold exactly", () => {
  const flag = makeFlag({ rollout: 37 });
  for (const s of subjects(500)) {
    assert.equal(evaluate(flag, s), bucket(flag.key, s) < 37);
  }
});

test("rollout is monotonic: raising the percentage never turns anyone off", () => {
  const low = makeFlag({ rollout: 10 });
  const high = makeFlag({ rollout: 30 });
  for (const s of subjects(1000)) {
    if (evaluate(low, s)) assert.ok(evaluate(high, s), `${s} dropped out`);
  }
});

test("rollout percentage roughly matches the share of subjects enabled", () => {
  const flag = makeFlag({ rollout: 50 });
  const total = 10000;
  const on = subjects(total).filter((s) => evaluate(flag, s)).length;
  const share = on / total;
  assert.ok(share > 0.45 && share < 0.55, `share was ${share}`);
});

test("deny wins over allow and over a full rollout", () => {
  const flag = makeFlag({ rollout: 100, rules: { allow: ["bob"], deny: ["bob"] } });
  assert.equal(evaluate(flag, "bob"), false);
});

test("allow pulls a subject into a zero rollout", () => {
  const flag = makeFlag({ rollout: 0, rules: { allow: ["alice"] } });
  assert.equal(evaluate(flag, "alice"), true);
  assert.equal(evaluate(flag, "carol"), false);
});

test("deny pulls a subject out of a full rollout", () => {
  const flag = makeFlag({ rules: { deny: ["mallory"] } });
  assert.equal(evaluate(flag, "mallory"), false);
  assert.equal(evaluate(flag, "alice"), true);
});

test("rules without a subject do not affect evaluation", () => {
  const flag = makeFlag({ rules: { deny: ["mallory"], allow: ["alice"] } });
  assert.equal(evaluate(flag), true);
});
