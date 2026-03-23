import { useCallback, useMemo, useRef } from "react";
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

type RefreshOptions = {
  bypassCache?: boolean;
};

export const useDashboardData = ({ householdId }: UseDashboardDataArgs) => {
  const queryClient = useQueryClient();
  const bypassCacheRef = useRef(false);
  const range = useMemo(() => currentMonthRange(), []);

  const [dashboardQuery, budgetBoardQuery, calendarQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.dashboard.summary(householdId),
        enabled: householdId !== null,
        staleTime: 20_000,
        queryFn: () => fetchDashboardSummary({ bypassCache: bypassCacheRef.current }),
      },
      {
        queryKey: queryKeys.dashboard.budgetBoard(householdId),
        enabled: householdId !== null,
        staleTime: 20_000,
        queryFn: () => fetchDashboardBudgetBoard({ bypassCache: bypassCacheRef.current }),
      },
      {
        queryKey: queryKeys.dashboard.calendarBoard(householdId, range.from, range.to),
        enabled: householdId !== null,
        staleTime: 15_000,
        queryFn: () => fetchDashboardCalendarSummary(range, { bypassCache: bypassCacheRef.current }),
      },
    ],
  });

  const refreshDashboard = useCallback(async (options?: RefreshOptions) => {
    bypassCacheRef.current = options?.bypassCache === true;
    try {
      await Promise.all([
        dashboardQuery.refetch(),
        budgetBoardQuery.refetch(),
        calendarQuery.refetch(),
      ]);
    } finally {
      bypassCacheRef.current = false;
    }
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
