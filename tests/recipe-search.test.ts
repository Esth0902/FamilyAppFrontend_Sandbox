import test from "node:test";
import assert from "node:assert/strict";

import { filterRecipesByTitleQuery } from "../src/features/recipes/recipe-search";

test("filterRecipesByTitleQuery matches case-insensitively", () => {
  const recipes = [
    { id: 1, title: "Pâtes bolo" },
    { id: 2, title: "Soupe tomates" },
    { id: 3, title: "Riz cantonnais" },
  ];

  assert.deepEqual(
    filterRecipesByTitleQuery(recipes, "RIZ").map((item) => item.id),
    [3]
  );
});

test("filterRecipesByTitleQuery ignores accents and trims input", () => {
  const recipes = [
    { id: 1, title: "Crème brûlée" },
    { id: 2, title: "Crème citron" },
  ];

  assert.deepEqual(
    filterRecipesByTitleQuery(recipes, "  creme ").map((item) => item.id),
    [1, 2]
  );
});

test("filterRecipesByTitleQuery returns all when query is empty", () => {
  const recipes = [
    { id: 1, title: "A" },
    { id: 2, title: "B" },
  ];

  assert.equal(filterRecipesByTitleQuery(recipes, "").length, 2);
});
