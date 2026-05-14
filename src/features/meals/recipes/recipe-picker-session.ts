type RecipePickerRecipeSummary = {
  id: number;
  title: string;
  type?: string;
};

type MealPollPickerLaunchState = {
  selectedRecipeIds: number[];
};

type MealPollPickerSelectionState = {
  selectedRecipeIds: number[];
  selectedRecipes: RecipePickerRecipeSummary[];
};

const normalizeRecipeIds = (ids: number[]) =>
  Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));

let mealPollPickerLaunchState: MealPollPickerLaunchState | null = null;
let mealPollPickerSelectionState: MealPollPickerSelectionState | null = null;

export const setMealPollRecipePickerLaunchState = (selectedRecipeIds: number[]) => {
  mealPollPickerLaunchState = {
    selectedRecipeIds: normalizeRecipeIds(selectedRecipeIds),
  };
};

export const getMealPollRecipePickerLaunchState = () => mealPollPickerLaunchState;

export const clearMealPollRecipePickerLaunchState = () => {
  mealPollPickerLaunchState = null;
};

export const setMealPollRecipePickerSelectionState = (payload: MealPollPickerSelectionState) => {
  const normalizedIds = normalizeRecipeIds(payload.selectedRecipeIds);
  mealPollPickerSelectionState = {
    selectedRecipeIds: normalizedIds,
    selectedRecipes: payload.selectedRecipes.filter(
      (recipe) => Number.isInteger(recipe.id) && recipe.id > 0 && normalizedIds.includes(recipe.id)
    ),
  };
};

export const consumeMealPollRecipePickerSelectionState = () => {
  const payload = mealPollPickerSelectionState;
  mealPollPickerSelectionState = null;
  return payload;
};
