/* eslint-env jest */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useRecipes } from "@/src/hooks/useRecipes";
import type { Recipe, RecipesPage } from "@/src/services/recipeService";
import * as recipeService from "@/src/services/recipeService";
import { createQueryClientWrapper } from "@/tests/jest/utils/query-client";

jest.mock("@/src/services/recipeService", () => ({
  fetchRecipes: jest.fn(),
  fetchHouseholdDietaryTags: jest.fn(),
  deleteRecipe: jest.fn(),
  previewAiRecipe: jest.fn(),
  storeAiRecipe: jest.fn(),
  suggestRecipes: jest.fn(),
  toggleRecipeSave: jest.fn(),
  upsertRecipe: jest.fn(),
}));

const fetchRecipesMock = recipeService.fetchRecipes as jest.MockedFunction<
  typeof recipeService.fetchRecipes
>;
const fetchHouseholdDietaryTagsMock =
  recipeService.fetchHouseholdDietaryTags as jest.MockedFunction<
    typeof recipeService.fetchHouseholdDietaryTags
  >;
const toggleRecipeSaveMock = recipeService.toggleRecipeSave as jest.MockedFunction<
  typeof recipeService.toggleRecipeSave
>;

const toPage = (recipes: Recipe[]): RecipesPage => ({
  data: recipes,
  meta: {
    current_page: 1,
    last_page: 1,
    per_page: recipes.length,
    total: recipes.length,
    has_more: false,
  },
});

describe("useRecipes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads recipes and refetches after toggle save mutation", async () => {
    const initialRecipe: Recipe = {
      id: 10,
      title: "Quiche",
      description: null,
      type: "plat",
      is_in_my_recipes: false,
    };

    fetchRecipesMock
      .mockResolvedValueOnce(toPage([initialRecipe]))
      .mockResolvedValue(toPage([{ ...initialRecipe, is_in_my_recipes: true }]));
    fetchHouseholdDietaryTagsMock.mockResolvedValue(["Sans lactose"]);
    toggleRecipeSaveMock.mockResolvedValue({
      ...initialRecipe,
      is_in_my_recipes: true,
    });

    const { Wrapper } = createQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useRecipes({
          householdId: 12,
          scope: "mine",
          searchQuery: "",
          typeFilter: "all",
          limit: 20,
        }),
      {
        wrapper: Wrapper,
      }
    );

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });

    expect(result.current.recipes[0]?.is_in_my_recipes).toBe(false);
    expect(result.current.householdDietaryTags).toEqual(["Sans lactose"]);

    await act(async () => {
      await result.current.toggleGlobalRecipeInMine(initialRecipe);
    });

    await waitFor(() => {
      expect(result.current.recipes[0]?.is_in_my_recipes).toBe(true);
    });
  });
});
