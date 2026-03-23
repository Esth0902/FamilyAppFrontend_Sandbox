/* eslint-env jest */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useRecipes } from "@/src/hooks/useRecipes";
import type { Recipe } from "@/src/services/recipeService";
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

describe("useRecipes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads recipes and updates cache on toggle save", async () => {
    const initialRecipes: Recipe[] = [
      {
        id: 10,
        title: "Quiche",
        description: null,
        type: "plat",
        is_in_my_recipes: false,
      },
    ];

    fetchRecipesMock.mockResolvedValue(initialRecipes);
    fetchHouseholdDietaryTagsMock.mockResolvedValue(["Sans lactose"]);
    toggleRecipeSaveMock.mockResolvedValue({
      ...initialRecipes[0],
      is_in_my_recipes: true,
    });

    const { Wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useRecipes({ householdId: 12 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });

    expect(result.current.recipes[0]?.is_in_my_recipes).toBe(false);
    expect(result.current.householdDietaryTags).toEqual(["Sans lactose"]);

    await act(async () => {
      await result.current.toggleGlobalRecipeInMine(initialRecipes[0]);
    });

    await waitFor(() => {
      expect(result.current.recipes[0]?.is_in_my_recipes).toBe(true);
    });
  });
});
