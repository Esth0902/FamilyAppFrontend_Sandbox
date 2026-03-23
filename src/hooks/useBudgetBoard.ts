import { useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BudgetBoardPayload } from "@/src/budget/common";
import { queryKeys } from "@/src/query/query-keys";
import { fetchBudgetBoard } from "@/src/services/budgetService";

type UseBudgetBoardArgs = {
  householdId: number | null;
};

type RefreshOptions = {
  bypassCache?: boolean;
};

export const useBudgetBoard = ({ householdId }: UseBudgetBoardArgs) => {
  const bypassCacheRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.budget.board(householdId),
    enabled: householdId !== null,
    staleTime: 20_000,
    queryFn: () => fetchBudgetBoard({ bypassCache: bypassCacheRef.current }),
  });

  const refreshBoard = useCallback(async (options?: RefreshOptions) => {
    bypassCacheRef.current = options?.bypassCache === true;
    try {
      await query.refetch();
    } finally {
      bypassCacheRef.current = false;
    }
  }, [query]);

  return {
    board: (query.data ?? null) as BudgetBoardPayload | null,
    isInitialLoading: query.isPending,
    isRefreshing: query.isRefetching,
    error: (query.error as Error | null) ?? null,
    refreshBoard,
  };
};
