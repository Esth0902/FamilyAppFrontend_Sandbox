/* eslint-env jest */

import {
  filterRecipesByQuery,
  isTaskStatus,
  isValidIsoDate,
  isValidTime,
  parseEventDateTimeRange,
} from "../src/features/calendar/calendar-utils";

test("isValidIsoDate validates strict YYYY-MM-DD values", () => {
  expect(isValidIsoDate("2026-03-05")).toBe(true);
  expect(isValidIsoDate("2026-2-5")).toBe(false);
  expect(isValidIsoDate("2026-02-30")).toBe(false);
});

test("isValidTime validates HH:MM 24h values", () => {
  expect(isValidTime("00:00")).toBe(true);
  expect(isValidTime("23:59")).toBe(true);
  expect(isValidTime("24:00")).toBe(false);
  expect(isValidTime("08:7")).toBe(false);
});

test("parseEventDateTimeRange rejects invalid and reversed ranges", () => {
  expect(parseEventDateTimeRange("2026-03-05", "14:00", "2026-03-05", "13:00")).toBeNull();
  expect(parseEventDateTimeRange("2026-03-05", "14:00", "2026-03-05", "14:00")).toBeNull();
  expect(parseEventDateTimeRange("2026-03-40", "14:00", "2026-03-05", "15:00")).toBeNull();
});

test("parseEventDateTimeRange supports multi-day events", () => {
  const range = parseEventDateTimeRange("2026-03-05", "22:00", "2026-03-06", "01:00");
  expect(range).not.toBeNull();
  expect(range?.startAt.getFullYear()).toBe(2026);
  expect(range?.startAt.getMonth()).toBe(2);
  expect(range?.startAt.getDate()).toBe(5);
  expect(range?.endAt.getDate()).toBe(6);
  expect(range?.endAt.getTime() - range?.startAt.getTime()).toBe(3 * 60 * 60 * 1000);
});

test("filterRecipesByQuery filters by recipe title", () => {
  const recipes = [
    { id: 1, title: "Pates bolo" },
    { id: 2, title: "Soupe tomates" },
    { id: 3, title: "Riz cantonais" },
    { id: 4, title: "Creme brulee" },
  ];

  expect(filterRecipesByQuery(recipes, "soupe").map((recipe) => recipe.id)).toEqual([2]);
  expect(filterRecipesByQuery(recipes, "  RIZ ").map((recipe) => recipe.id)).toEqual([3]);
  expect(filterRecipesByQuery(recipes, "creme").map((recipe) => recipe.id)).toEqual([4]);
  expect(filterRecipesByQuery(recipes, "").length).toBe(4);
});

test("isTaskStatus accepts accents and ASCII fallback", () => {
  expect(isTaskStatus("realisee", "realisee")).toBe(true);
  expect(isTaskStatus("a faire", "a faire")).toBe(true);
  expect(isTaskStatus("annulee", "annulee")).toBe(true);
  expect(isTaskStatus("en pause", "a faire")).toBe(false);
});
