import { useCallback } from "react";
import {
    useMutation,
    useQuery,
    useQueryClient,
    keepPreviousData,
} from "@tanstack/react-query";
import {
    deleteRecipe,
    fetchHouseholdDietaryTags,
    fetchRecipes,
    previewAiRecipe,
    storeAiRecipe,
    suggestRecipes,
    toggleRecipeSave,
    upsertRecipe,
    type Recipe,
} from "@/src/services/recipeService";
import { queryKeys } from "@/src/query/query-keys";

type UseRecipesArgs = {
    householdId: number | null;
};

type UpsertRecipeMutationInput = {
    payload: Record<string, unknown>;
    recipeId?: number;
};

export const useRecipes = ({ householdId }: UseRecipesArgs) => {
    const queryClient = useQueryClient();
    const recipesKey = queryKeys.recipes.all(householdId);
    const dietaryTagsKey = queryKeys.recipes.dietaryTags(householdId);

    const recipesQuery = useQuery({
        queryKey: recipesKey,
        queryFn: fetchRecipes,
        staleTime: 30_000,
        placeholderData: keepPreviousData,
    });

    const dietaryTagsQuery = useQuery({
        queryKey: dietaryTagsKey,
        enabled: householdId !== null,
        staleTime: 60_000,
        queryFn: fetchHouseholdDietaryTags,
    });

    const toggleSavedMutation = useMutation({
        mutationFn: async (recipe: Recipe) => {
            const currentlyInMine = recipe.is_in_my_recipes === true;
            return await toggleRecipeSave(recipe.id, currentlyInMine);
        },
        onSuccess: (updatedRecipe, recipe) => {
            if (!updatedRecipe) {
                void queryClient.invalidateQueries({ queryKey: recipesKey });
                return;
            }

            queryClient.setQueryData(recipesKey, (previous: Recipe[] | undefined) => {
                if (!previous) {
                    return previous;
                }
                return previous.map((item) => (item.id === recipe.id ? { ...item, ...updatedRecipe } : item));
            });
        },
    });

    const upsertRecipeMutation = useMutation({
        mutationFn: async ({ payload, recipeId }: UpsertRecipeMutationInput) => {
            return await upsertRecipe(payload, recipeId);
        },
        onSuccess: (updatedRecipe, variables) => {
            queryClient.setQueryData(recipesKey, (previous: Recipe[] | undefined) => {
                if (!previous) {
                    return previous;
                }

                const normalizedRecipe = {
                    ...updatedRecipe,
                    is_global: false,
                    is_owned_by_household: true,
                    is_in_my_recipes: true,
                } as Recipe;

                if (variables.recipeId) {
                    return previous.map((item) => (item.id === updatedRecipe.id ? { ...item, ...normalizedRecipe } : item));
                }

                return [normalizedRecipe, ...previous];
            });
        },
    });

    const deleteRecipeMutation = useMutation({
        mutationFn: async (recipeId: number) => {
            await deleteRecipe(recipeId);
            return recipeId;
        },
        onSuccess: (deletedRecipeId) => {
            queryClient.setQueryData(recipesKey, (previous: Recipe[] | undefined) => {
                if (!previous) {
                    return previous;
                }
                return previous.filter((recipe) => recipe.id !== deletedRecipeId);
            });
        },
    });

    const suggestRecipesMutation = useMutation({
        mutationFn: suggestRecipes,
    });

    const previewAiRecipeMutation = useMutation({
        mutationFn: previewAiRecipe,
    });

    const storeAiRecipeMutation = useMutation({
        mutationFn: storeAiRecipe,
        onSuccess: (storedRecipe) => {
            queryClient.setQueryData(recipesKey, (previous: Recipe[] | undefined) => {
                if (!previous) {
                    return previous;
                }
                return [
                    {
                        ...storedRecipe,
                        is_global: false,
                        is_owned_by_household: true,
                        is_in_my_recipes: true,
                    },
                    ...previous,
                ];
            });
        },
    });

    const refreshRecipes = useCallback(async () => {
        await recipesQuery.refetch();
        await dietaryTagsQuery.refetch();
    }, [dietaryTagsQuery, recipesQuery]);

    return {
        recipes: (recipesQuery.data ?? []) as Recipe[],
        householdDietaryTags: (dietaryTagsQuery.data ?? []) as string[],
        isInitialLoading: recipesQuery.isPending,
        isRefreshing: recipesQuery.isRefetching,
        recipesError: recipesQuery.error as Error | null,
        refreshRecipes,
        toggleGlobalRecipeInMine: toggleSavedMutation.mutateAsync,
        upsertRecipe: upsertRecipeMutation.mutateAsync,
        deleteRecipe: deleteRecipeMutation.mutateAsync,
        suggestRecipes: suggestRecipesMutation.mutateAsync,
        previewAiRecipe: previewAiRecipeMutation.mutateAsync,
        storeAiRecipe: storeAiRecipeMutation.mutateAsync,
        isMutationPending:
            toggleSavedMutation.isPending
            || upsertRecipeMutation.isPending
            || deleteRecipeMutation.isPending
            || suggestRecipesMutation.isPending
            || previewAiRecipeMutation.isPending
            || storeAiRecipeMutation.isPending,
    };
};
