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

export type RecipeScope = "mine" | "all";

export type RecipesPageMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    has_more: boolean;
};

export type RecipesPage = {
    data: Recipe[];
    meta: RecipesPageMeta;
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

type RecipeListQueryParams = {
    q?: string;
    page?: number;
    limit?: number;
    type?: string;
    scope?: RecipeScope;
};

const extractRecipesPayload = (payload: unknown): RecipesPage => {
    const empty: RecipesPage = {
        data: [],
        meta: {
            current_page: 1,
            last_page: 1,
            per_page: 0,
            total: 0,
            has_more: false,
        },
    };

    if (Array.isArray(payload)) {
        return {
            data: payload as Recipe[],
            meta: {
                current_page: 1,
                last_page: 1,
                per_page: payload.length,
                total: payload.length,
                has_more: false,
            },
        };
    }

    if (!payload || typeof payload !== "object") {
        return empty;
    }

    const payloadObject = payload as {
        data?: unknown;
        recipes?: unknown;
        meta?: {
            current_page?: number;
            last_page?: number;
            per_page?: number;
            total?: number;
            has_more?: boolean;
        };
    };

    const data = Array.isArray(payloadObject.data)
        ? (payloadObject.data as Recipe[])
        : Array.isArray(payloadObject.recipes)
            ? (payloadObject.recipes as Recipe[])
            : [];

    const currentPage = Number(payloadObject.meta?.current_page ?? 1);
    const lastPage = Number(payloadObject.meta?.last_page ?? 1);
    const perPage = Number(payloadObject.meta?.per_page ?? data.length);
    const total = Number(payloadObject.meta?.total ?? data.length);
    const fallbackHasMore = Number.isFinite(currentPage)
        && Number.isFinite(lastPage)
        && currentPage < lastPage;
    const hasMore = typeof payloadObject.meta?.has_more === "boolean"
        ? payloadObject.meta.has_more
        : fallbackHasMore;

    return {
        data,
        meta: {
            current_page: Number.isFinite(currentPage) ? currentPage : 1,
            last_page: Number.isFinite(lastPage) ? lastPage : 1,
            per_page: Number.isFinite(perPage) ? perPage : data.length,
            total: Number.isFinite(total) ? total : data.length,
            has_more: hasMore,
        },
    };
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

export const fetchRecipes = async ({
    q,
    page = 1,
    limit = 20,
    type,
    scope = "all",
}: RecipeListQueryParams = {}): Promise<RecipesPage> => {
    const params = new URLSearchParams();
    params.set("scope", scope);
    params.set("page", String(page));
    params.set("limit", String(limit));

    const search = String(q ?? "").trim();
    if (search.length > 0) {
        params.set("q", search);
    }

    const typeFilter = String(type ?? "").trim();
    if (typeFilter.length > 0 && typeFilter !== "all") {
        params.set("type", typeFilter);
    }

    const data = await apiFetch(`/recipes?${params.toString()}`);
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
