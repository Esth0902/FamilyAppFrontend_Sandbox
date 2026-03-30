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

type DashboardRefreshOptions = {
  bypassCache?: boolean;
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
        queryFn: () => fetchDashboardSummary(),
      },
      {
        queryKey: queryKeys.dashboard.budgetBoard(householdId),
        enabled: householdId !== null,
        staleTime: 20_000,
        gcTime: 10 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: () => fetchDashboardBudgetBoard(),
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

  const refreshDashboard = useCallback(async (options: DashboardRefreshOptions = {}) => {
    if (householdId === null) {
      return;
    }

    const bypassCache = Boolean(options.bypassCache);

    await Promise.all([
      queryClient.fetchQuery({
        queryKey: queryKeys.dashboard.summary(householdId),
        queryFn: () => fetchDashboardSummary({ bypassCache }),
        staleTime: bypassCache ? 0 : 20_000,
        gcTime: 10 * 60_000,
      }),
      queryClient.fetchQuery({
        queryKey: queryKeys.dashboard.budgetBoard(householdId),
        queryFn: () => fetchDashboardBudgetBoard({ bypassCache }),
        staleTime: bypassCache ? 0 : 20_000,
        gcTime: 10 * 60_000,
      }),
      queryClient.fetchQuery({
        queryKey: queryKeys.dashboard.calendarBoard(householdId, range.from, range.to),
        queryFn: () => fetchDashboardCalendarSummary(range, { bypassCache }),
        staleTime: bypassCache ? 0 : 15_000,
        gcTime: 10 * 60_000,
      }),
    ]);
  }, [householdId, queryClient, range]);

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
