import { useCallback, useMemo } from "react";
import {
    keepPreviousData,
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
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
    type RecipeScope,
} from "@/src/services/recipeService";
import { queryKeys } from "@/src/query/query-keys";
import { normalizeRecipeTypeValue } from "@/src/features/recipes/recipe-types";

type UseRecipesArgs = {
    householdId: number | null;
    scope?: RecipeScope;
    searchQuery?: string;
    typeFilter?: string;
    limit?: number;
};

type UpsertRecipeMutationInput = {
    payload: Record<string, unknown>;
    recipeId?: number;
};

export const useRecipes = ({
    householdId,
    scope = "all",
    searchQuery = "",
    typeFilter = "all",
    limit = 20,
}: UseRecipesArgs) => {
    const queryClient = useQueryClient();

    const normalizedSearchQuery = searchQuery.trim();
    const normalizedTypeFilter = normalizeRecipeTypeValue(typeFilter);

    const recipesKey = queryKeys.recipes.list(householdId, {
        scope,
        q: normalizedSearchQuery,
        type: normalizedTypeFilter,
        limit,
    });
    const recipesRootKey = queryKeys.recipes.root(householdId);
    const dietaryTagsKey = queryKeys.recipes.dietaryTags(householdId);

    const recipesQuery = useInfiniteQuery({
        queryKey: recipesKey,
        enabled: householdId !== null,
        staleTime: 30_000,
        placeholderData: keepPreviousData,
        initialPageParam: 1,
        queryFn: ({ pageParam }) => fetchRecipes({
            scope,
            q: normalizedSearchQuery.length > 0 ? normalizedSearchQuery : undefined,
            type: normalizedTypeFilter !== "all" ? normalizedTypeFilter : undefined,
            limit,
            page: Number(pageParam),
        }),
        getNextPageParam: (lastPage) => {
            return lastPage.meta.has_more
                ? lastPage.meta.current_page + 1
                : undefined;
        },
    });

    const recipes = useMemo(
        () => recipesQuery.data?.pages.flatMap((page) => page.data) ?? [],
        [recipesQuery.data]
    );

    const dietaryTagsQuery = useQuery({
        queryKey: dietaryTagsKey,
        enabled: householdId !== null,
        staleTime: 60_000,
        queryFn: fetchHouseholdDietaryTags,
    });

    const invalidateRecipes = useCallback(async () => {
        await queryClient.invalidateQueries({
            queryKey: recipesRootKey,
        });
    }, [queryClient, recipesRootKey]);

    const toggleSavedMutation = useMutation({
        mutationFn: async (recipe: Recipe) => {
            const currentlyInMine = recipe.is_in_my_recipes === true;
            return await toggleRecipeSave(recipe.id, currentlyInMine);
        },
        onSuccess: () => {
            void invalidateRecipes();
        },
    });

    const upsertRecipeMutation = useMutation({
        mutationFn: async ({ payload, recipeId }: UpsertRecipeMutationInput) => {
            return await upsertRecipe(payload, recipeId);
        },
        onSuccess: () => {
            void invalidateRecipes();
        },
    });

    const deleteRecipeMutation = useMutation({
        mutationFn: async (recipeId: number) => {
            await deleteRecipe(recipeId);
            return recipeId;
        },
        onSuccess: () => {
            void invalidateRecipes();
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
        onSuccess: () => {
            void invalidateRecipes();
        },
    });

    const refreshRecipes = useCallback(async () => {
        await recipesQuery.refetch();
        await dietaryTagsQuery.refetch();
    }, [dietaryTagsQuery, recipesQuery]);

    return {
        recipes,
        householdDietaryTags: (dietaryTagsQuery.data ?? []) as string[],
        isInitialLoading: recipesQuery.isPending,
        isRefreshing: recipesQuery.isRefetching && !recipesQuery.isFetchingNextPage,
        isFetchingNextPage: recipesQuery.isFetchingNextPage,
        hasNextPage: recipesQuery.hasNextPage,
        fetchNextPage: recipesQuery.fetchNextPage,
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
