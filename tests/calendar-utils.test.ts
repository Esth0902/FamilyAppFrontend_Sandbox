import test from "node:test";
import assert from "node:assert/strict";

import {
  filterRecipesByQuery,
  isTaskStatus,
  isValidIsoDate,
  isValidTime,
  parseEventDateTimeRange,
} from "../src/features/calendar/calendar-utils";

test("isValidIsoDate validates strict YYYY-MM-DD values", () => {
  assert.equal(isValidIsoDate("2026-03-05"), true);
  assert.equal(isValidIsoDate("2026-2-5"), false);
  assert.equal(isValidIsoDate("2026-02-30"), false);
});

test("isValidTime validates HH:MM 24h values", () => {
  assert.equal(isValidTime("00:00"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("08:7"), false);
});

test("parseEventDateTimeRange rejects invalid and reversed ranges", () => {
  assert.equal(parseEventDateTimeRange("2026-03-05", "14:00", "2026-03-05", "13:00"), null);
  assert.equal(parseEventDateTimeRange("2026-03-05", "14:00", "2026-03-05", "14:00"), null);
  assert.equal(parseEventDateTimeRange("2026-03-40", "14:00", "2026-03-05", "15:00"), null);
});

test("parseEventDateTimeRange supports multi-day events", () => {
  const range = parseEventDateTimeRange("2026-03-05", "22:00", "2026-03-06", "01:00");
  assert.notEqual(range, null);
  assert.equal(range?.startAt.getFullYear(), 2026);
  assert.equal(range?.startAt.getMonth(), 2);
  assert.equal(range?.startAt.getDate(), 5);
  assert.equal(range?.endAt.getDate(), 6);
  assert.equal(range?.endAt.getTime() - range?.startAt.getTime(), 3 * 60 * 60 * 1000);
});

test("filterRecipesByQuery filters by recipe title", () => {
  const recipes = [
    { id: 1, title: "Pâtes bolo" },
    { id: 2, title: "Soupe tomates" },
    { id: 3, title: "Riz cantonais" },
    { id: 4, title: "Crème brûlée" },
  ];

  assert.deepEqual(
    filterRecipesByQuery(recipes, "soupe").map((recipe) => recipe.id),
    [2]
  );
  assert.deepEqual(
    filterRecipesByQuery(recipes, "  RIZ ").map((recipe) => recipe.id),
    [3]
  );
  assert.deepEqual(
    filterRecipesByQuery(recipes, "creme").map((recipe) => recipe.id),
    [4]
  );
  assert.equal(filterRecipesByQuery(recipes, "").length, 4);
});

test("isTaskStatus accepts accents and ASCII fallback", () => {
  assert.equal(isTaskStatus("réalisée", "realisee"), true);
  assert.equal(isTaskStatus("a faire", "à faire"), true);
  assert.equal(isTaskStatus("annulee", "annulée"), true);
  assert.equal(isTaskStatus("en pause", "à faire"), false);
});
