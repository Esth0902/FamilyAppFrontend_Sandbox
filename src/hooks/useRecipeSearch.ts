import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/src/query/query-keys";
import { fetchRecipes, type Recipe, type RecipeScope } from "@/src/services/recipeService";

type UseRecipeSearchArgs = {
  householdId: number | null;
  query: string;
  scope?: RecipeScope;
  limit?: number;
  type?: string;
};

export const useRecipeSearch = ({
  householdId,
  query,
  scope = "mine",
  limit = 10,
  type = "",
}: UseRecipeSearchArgs) => {
  const normalizedQuery = query.trim();
  const normalizedType = type.trim();

  const searchQuery = useQuery({
    queryKey: queryKeys.recipes.search(householdId, {
      scope,
      q: normalizedQuery,
      type: normalizedType,
      limit,
    }),
    enabled: householdId !== null && normalizedQuery.length > 0,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const page = await fetchRecipes({
        scope,
        q: normalizedQuery,
        type: normalizedType.length > 0 ? normalizedType : undefined,
        limit,
        page: 1,
      });

      return page.data;
    },
  });

  return {
    results: (searchQuery.data ?? []) as Recipe[],
    isLoading: searchQuery.isPending,
    isFetching: searchQuery.isFetching,
    error: (searchQuery.error as Error | null) ?? null,
  };
};
