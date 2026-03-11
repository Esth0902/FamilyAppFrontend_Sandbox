import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  addDaysFromIso,
  addDaysIso,
  isValidIsoDate,
  parseIsoDate,
  parseOptionalIsoDate,
  toIsoDate,
} from "../src/utils/date";

test("isValidIsoDate validates strict dates", () => {
  assert.equal(isValidIsoDate("2026-03-10"), true);
  assert.equal(isValidIsoDate("2026-3-10"), false);
  assert.equal(isValidIsoDate("2026-02-30"), false);
});

test("parseIsoDate parses valid values and rejects invalid ones", () => {
  const parsed = parseIsoDate("2026-03-10");
  assert.notEqual(parsed, null);
  assert.equal(parsed?.getFullYear(), 2026);
  assert.equal(parsed?.getMonth(), 2);
  assert.equal(parsed?.getDate(), 10);

  assert.equal(parseIsoDate("2026-13-01"), null);
});

test("parseOptionalIsoDate supports nullish values", () => {
  assert.equal(parseOptionalIsoDate(undefined), null);
  assert.equal(parseOptionalIsoDate(null), null);
  assert.notEqual(parseOptionalIsoDate("2026-03-10"), null);
});

test("toIsoDate and addDays keep stable ISO format", () => {
  const base = new Date(2026, 2, 10);
  assert.equal(toIsoDate(base), "2026-03-10");
  assert.equal(toIsoDate(addDays(base, 2)), "2026-03-12");
});

test("addDaysIso and addDaysFromIso create expected offsets", () => {
  const anchor = new Date(2026, 2, 10);
  assert.equal(addDaysIso(0, anchor), "2026-03-10");
  assert.equal(addDaysIso(3, anchor), "2026-03-13");
  assert.equal(addDaysFromIso("2026-03-10", 5), "2026-03-15");
});
