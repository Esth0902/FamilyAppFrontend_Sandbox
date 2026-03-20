import { apiFetch } from "@/src/api/client";

export type Recipe = {
    id: number;
    title: string;
    description: string | null;
    type: string;
    base_servings?: number;
    display_servings?: number;
    is_global?: boolean;
    is_ai_generated?: boolean;
    is_owned_by_household?: boolean;
    is_in_my_recipes?: boolean;
};

export type AiSuggestion = { title: string; description: string };
export type AiPreviewIngredient = { name: string; quantity: number; unit: string; category: string };
export type AiPreviewRecipe = {
    title: string;
    description: string;
    instructions: string;
    type: string;
    ingredients: AiPreviewIngredient[];
};

const extractRecipesPayload = (payload: unknown): Recipe[] => {
    if (Array.isArray(payload)) {
        return payload as Recipe[];
    }

    if (payload && typeof payload === "object") {
        const maybeData = (payload as { data?: unknown }).data;
        if (Array.isArray(maybeData)) {
            return maybeData as Recipe[];
        }

        const maybeRecipes = (payload as { recipes?: unknown }).recipes;
        if (Array.isArray(maybeRecipes)) {
            return maybeRecipes as Recipe[];
        }
    }

    return [];
};

export const normalizeAiSuggestion = (value: any): AiSuggestion | null => {
    const title = String(value?.title ?? "").trim();
    if (!title) {
        return null;
    }

    return {
        title,
        description: String(value?.description ?? ""),
    };
};

export const normalizeAiPreviewRecipe = (value: any): AiPreviewRecipe | null => {
    const title = String(value?.title ?? "").trim();
    if (!title) {
        return null;
    }

    const ingredientsSource = Array.isArray(value?.ingredients) ? value.ingredients : [];
    const ingredients = ingredientsSource.map((ingredient: any) => {
        const quantityRaw = Number(ingredient?.quantity);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

        return {
            name: String(ingredient?.name ?? "ingredient").trim() || "ingredient",
            quantity,
            unit: String(ingredient?.unit ?? "unite").trim() || "unite",
            category: String(ingredient?.category ?? "autre").trim() || "autre",
        };
    });

    return {
        title,
        description: String(value?.description ?? ""),
        instructions: String(value?.instructions ?? ""),
        type: String(value?.type ?? "plat principal"),
        ingredients,
    };
};

export const fetchRecipes = async (): Promise<Recipe[]> => {
    const data = await apiFetch("/recipes?scope=all");
    return extractRecipesPayload(data);
};

export const fetchHouseholdDietaryTags = async (): Promise<string[]> => {
    const configResponse = await apiFetch("/households/config");
    const mealsSettings = configResponse?.config?.modules?.meals?.settings ?? {};

    const detailsTags = Array.isArray(mealsSettings?.dietary_tag_details)
        ? mealsSettings.dietary_tag_details
            .map((tag: any) => String(tag?.label ?? "").trim())
            .filter((tag: string) => tag.length > 0)
        : [];

    const fallbackTags = Array.isArray(mealsSettings?.dietary_tags)
        ? mealsSettings.dietary_tags
            .map((tag: any) => String(tag ?? "").trim())
            .filter((tag: string) => tag.length > 0)
        : [];

    const sourceTags = detailsTags.length > 0 ? detailsTags : fallbackTags;
    return sourceTags.filter(
        (tag: string, index: number, all: string[]) =>
            all.findIndex((value) => value.toLowerCase() === tag.toLowerCase()) === index
    );
};

export const toggleRecipeSave = async (
    recipeId: number,
    currentlyInMine: boolean,
): Promise<Recipe | null> => {
    const response = await apiFetch(`/recipes/${recipeId}/save`, {
        method: currentlyInMine ? "DELETE" : "POST",
    });

    const updatedRecipe = response?.recipe;
    if (!updatedRecipe?.id) {
        return null;
    }

    return updatedRecipe as Recipe;
};

export const upsertRecipe = async (
    payload: Record<string, unknown>,
    recipeId?: number,
): Promise<Recipe> => {
    const isEdit = Number.isFinite(recipeId) && Number(recipeId) > 0;
    const response = await apiFetch(isEdit ? `/recipes/${recipeId}` : "/recipes", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(payload),
    });

    return response as Recipe;
};

export const deleteRecipe = async (recipeId: number): Promise<void> => {
    await apiFetch(`/recipes/${recipeId}`, { method: "DELETE" });
};

export const suggestRecipes = async (payload: {
    preferences: string;
    dietary_preferences?: string;
    count: number;
    intent: "specific" | "ideas";
}): Promise<unknown> => {
    return await apiFetch("/recipes/suggest", {
        method: "POST",
        body: JSON.stringify(payload),
    });
};

export const previewAiRecipe = async (payload: {
    title: string;
    dietary_preferences?: string;
}): Promise<unknown> => {
    return await apiFetch("/recipes/preview-ai", {
        method: "POST",
        body: JSON.stringify(payload),
    });
};

export const storeAiRecipe = async (payload: Record<string, unknown>): Promise<Recipe> => {
    const response = await apiFetch("/recipes/ai-store", {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return response as Recipe;
};

