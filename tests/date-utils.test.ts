/* eslint-env jest */

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
  expect(isValidIsoDate("2026-03-10")).toBe(true);
  expect(isValidIsoDate("2026-3-10")).toBe(false);
  expect(isValidIsoDate("2026-02-30")).toBe(false);
});

test("parseIsoDate parses valid values and rejects invalid ones", () => {
  const parsed = parseIsoDate("2026-03-10");
  expect(parsed).not.toBeNull();
  expect(parsed?.getFullYear()).toBe(2026);
  expect(parsed?.getMonth()).toBe(2);
  expect(parsed?.getDate()).toBe(10);

  expect(parseIsoDate("2026-13-01")).toBeNull();
});

test("parseOptionalIsoDate supports nullish values", () => {
  expect(parseOptionalIsoDate(undefined)).toBeNull();
  expect(parseOptionalIsoDate(null)).toBeNull();
  expect(parseOptionalIsoDate("2026-03-10")).not.toBeNull();
});

test("toIsoDate and addDays keep stable ISO format", () => {
  const base = new Date(2026, 2, 10);
  expect(toIsoDate(base)).toBe("2026-03-10");
  expect(toIsoDate(addDays(base, 2))).toBe("2026-03-12");
});

test("addDaysIso and addDaysFromIso create expected offsets", () => {
  const anchor = new Date(2026, 2, 10);
  expect(addDaysIso(0, anchor)).toBe("2026-03-10");
  expect(addDaysIso(3, anchor)).toBe("2026-03-13");
  expect(addDaysFromIso("2026-03-10", 5)).toBe("2026-03-15");
});
