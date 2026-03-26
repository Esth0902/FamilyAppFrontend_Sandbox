import { useCallback, useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/query/query-keys";
import {
  currentMonthRange,
  fetchDashboardBudgetBoard,
  fetchDashboardCalendarSummary,
  fetchDashboardSummary,
  type CalendarSummaryResponse,
  type DashboardResponse,
} from "@/src/services/dashboardService";
import type { BudgetBoardPayload } from "@/src/budget/common";

type UseDashboardDataArgs = {
  householdId: number | null;
};

export const useDashboardData = ({ householdId }: UseDashboardDataArgs) => {
  const queryClient = useQueryClient();
  const range = useMemo(() => currentMonthRange(), []);

  const [dashboardQuery, budgetBoardQuery, calendarQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.dashboard.summary(householdId),
        enabled: householdId !== null,
        staleTime: 20_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: fetchDashboardSummary,
      },
      {
        queryKey: queryKeys.dashboard.budgetBoard(householdId),
        enabled: householdId !== null,
        staleTime: 20_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: fetchDashboardBudgetBoard,
      },
      {
        queryKey: queryKeys.dashboard.calendarBoard(householdId, range.from, range.to),
        enabled: householdId !== null,
        staleTime: 15_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: () => fetchDashboardCalendarSummary(range),
      },
    ],
  });

  const refreshDashboard = useCallback(async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      budgetBoardQuery.refetch(),
      calendarQuery.refetch(),
    ]);
  }, [budgetBoardQuery, calendarQuery, dashboardQuery]);

  const invalidateDashboard = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.root(householdId),
    });
  }, [householdId, queryClient]);

  const firstError = dashboardQuery.error || budgetBoardQuery.error || calendarQuery.error;

  return {
    dashboard: (dashboardQuery.data ?? null) as DashboardResponse | null,
    budgetBoard: (budgetBoardQuery.data ?? null) as BudgetBoardPayload | null,
    calendarSummary: (calendarQuery.data ?? null) as CalendarSummaryResponse | null,
    isInitialLoading: dashboardQuery.isPending || budgetBoardQuery.isPending || calendarQuery.isPending,
    isRefreshing: dashboardQuery.isRefetching || budgetBoardQuery.isRefetching || calendarQuery.isRefetching,
    error: (firstError as Error | null) ?? null,
    refreshDashboard,
    invalidateDashboard,
  };
};
