import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BudgetBoardPayload } from "@/src/budget/common";
import { queryKeys } from "@/src/query/query-keys";
import { fetchBudgetBoard } from "@/src/services/budgetService";

type UseBudgetBoardArgs = {
  householdId: number | null;
};

export const useBudgetBoard = ({ householdId }: UseBudgetBoardArgs) => {
  const query = useQuery({
    queryKey: queryKeys.budget.board(householdId),
    enabled: householdId !== null,
    staleTime: 20_000,
    queryFn: fetchBudgetBoard,
  });

  const refreshBoard = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    board: (query.data ?? null) as BudgetBoardPayload | null,
    isInitialLoading: query.isPending,
    isRefreshing: query.isRefetching,
    error: (query.error as Error | null) ?? null,
    refreshBoard,
  };
};
