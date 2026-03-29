import { QueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/src/api/client";
import type { BudgetBoardPayload } from "@/src/budget/common";
import { queryKeys } from "@/src/query/query-keys";

export const fetchBudgetBoard = async (): Promise<BudgetBoardPayload> => {
  return (await apiFetch("/budget/board")) as BudgetBoardPayload;
};

export const invalidateBudgetAndDashboard = async (
  queryClient: QueryClient,
  householdId: number | null
) => {
  if (!householdId) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.budget.board(householdId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.root(householdId) }),
  ]);
};
