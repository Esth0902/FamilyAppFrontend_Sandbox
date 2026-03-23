import { apiFetch } from "@/src/api/client";

export type ShoppingListSummary = {
  id: number;
  title: string;
  status: "active" | "inactive";
};

export type ShoppingListHomePayload = {
  can_manage: boolean;
  lists: ShoppingListSummary[];
};

type RecipeIngredientDetail = {
  id?: number;
  name?: string;
  scaled_quantity?: number;
  base_quantity?: number;
  pivot?: {
    quantity?: number;
    unit?: string | null;
  };
};

type RecipeDetailPayload = {
  id: number;
  title: string;
  ingredients: RecipeIngredientDetail[];
};

export type RecipeSelection = {
  recipeId: number;
  servings: number;
};

export type ShoppingListIngredientPayload = {
  ingredient_id: number | null;
  name: string;
  unit: string | null;
  quantity: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeIngredientKey = (ingredientId?: number | null, name?: string, unit?: string | null) => {
  if (ingredientId && Number.isInteger(ingredientId)) {
    return `id:${ingredientId}`;
  }
  return `name:${(name || "").trim().toLowerCase()}|unit:${(unit || "").trim().toLowerCase()}`;
};

export const defaultShoppingListTitle = () => `Liste du ${new Date().toLocaleDateString("fr-BE")}`;

export const loadShoppingLists = async (): Promise<ShoppingListHomePayload> => {
  const response = (await apiFetch("/shopping-lists")) as ShoppingListHomePayload;
  return {
    can_manage: Boolean(response?.can_manage),
    lists: Array.isArray(response?.lists) ? response.lists : [],
  };
};

export const resolvePreferredShoppingListId = (lists: ShoppingListSummary[]): number | null => {
  const activeList = lists.find((list) => list.status === "active");
  if (activeList?.id) {
    return activeList.id;
  }
  return lists[0]?.id ?? null;
};

export const createShoppingList = async (title: string): Promise<ShoppingListSummary | null> => {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    throw new Error("Le nom de la nouvelle liste est obligatoire.");
  }

  const response = await apiFetch("/shopping-lists", {
    method: "POST",
    body: JSON.stringify({ title: cleanTitle }),
  });

  const list = response?.list;
  if (!list?.id) {
    return null;
  }
  return list as ShoppingListSummary;
};

export const buildShoppingIngredientsFromRecipeSelections = async (
  selections: RecipeSelection[]
): Promise<ShoppingListIngredientPayload[]> => {
  const validSelections = selections.filter(
    (selection) => Number.isInteger(selection.recipeId) && selection.recipeId > 0
  );

  if (validSelections.length === 0) {
    return [];
  }

  const recipeDetails = await Promise.all(
    validSelections.map(
      (selection) =>
        apiFetch(`/recipes/${selection.recipeId}?servings=${clamp(Number(selection.servings) || 1, 1, 30)}`) as Promise<RecipeDetailPayload>
    )
  );

  const dedupedIngredients = new Map<string, ShoppingListIngredientPayload>();

  for (const recipeDetail of recipeDetails) {
    for (const ingredient of recipeDetail?.ingredients ?? []) {
      const name = String(ingredient?.name ?? "").trim();
      if (!name) {
        continue;
      }

      const ingredientId = Number.isInteger(ingredient?.id) ? Number(ingredient.id) : null;
      const unit = String(ingredient?.pivot?.unit ?? "").trim();
      const quantityValue = Number(ingredient?.scaled_quantity ?? ingredient?.pivot?.quantity ?? ingredient?.base_quantity ?? 0);
      const quantity = Number.isFinite(quantityValue) && quantityValue >= 0 ? quantityValue : 0;
      const key = normalizeIngredientKey(ingredientId, name, unit);

      const existing = dedupedIngredients.get(key);
      if (existing) {
        existing.quantity += quantity;
        continue;
      }

      dedupedIngredients.set(key, {
        ingredient_id: ingredientId,
        name,
        unit: unit || null,
        quantity,
      });
    }
  }

  return Array.from(dedupedIngredients.values());
};

export const addIngredientsToShoppingList = async (
  listId: number,
  ingredients: ShoppingListIngredientPayload[]
): Promise<number> => {
  if (!Number.isInteger(listId) || listId <= 0) {
    throw new Error("Liste de courses invalide.");
  }

  let addedCount = 0;
  for (const ingredient of ingredients) {
    await apiFetch(`/shopping-lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify({
        ...ingredient,
        is_manual_addition: false,
      }),
    });
    addedCount += 1;
  }

  return addedCount;
};
