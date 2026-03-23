/* eslint-env jest */

import { filterRecipesByTitleQuery } from "../src/features/recipes/recipe-search";

test("filterRecipesByTitleQuery matches case-insensitively", () => {
  const recipes = [
    { id: 1, title: "Pates bolo" },
    { id: 2, title: "Soupe tomates" },
    { id: 3, title: "Riz cantonnais" },
  ];

  expect(filterRecipesByTitleQuery(recipes, "RIZ").map((item) => item.id)).toEqual([3]);
});

test("filterRecipesByTitleQuery ignores accents and trims input", () => {
  const recipes = [
    { id: 1, title: "Creme brulee" },
    { id: 2, title: "Creme citron" },
  ];

  expect(filterRecipesByTitleQuery(recipes, "  creme ").map((item) => item.id)).toEqual([1, 2]);
});

test("filterRecipesByTitleQuery returns all when query is empty", () => {
  const recipes = [
    { id: 1, title: "A" },
    { id: 2, title: "B" },
  ];

  expect(filterRecipesByTitleQuery(recipes, "").length).toBe(2);
});
