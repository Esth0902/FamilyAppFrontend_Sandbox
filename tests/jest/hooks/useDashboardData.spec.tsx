/* eslint-env jest */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useDashboardData } from "@/src/hooks/useDashboardData";
import * as dashboardService from "@/src/services/dashboardService";
import { createQueryClientWrapper } from "@/tests/jest/utils/query-client";

jest.mock("@/src/services/dashboardService", () => ({
  currentMonthRange: jest.fn(() => ({ from: "2026-03-01", to: "2026-03-31" })),
  fetchDashboardSummary: jest.fn(),
  fetchDashboardBudgetBoard: jest.fn(),
  fetchDashboardCalendarSummary: jest.fn(),
}));

const fetchDashboardSummaryMock =
  dashboardService.fetchDashboardSummary as jest.MockedFunction<
    typeof dashboardService.fetchDashboardSummary
  >;
const fetchDashboardBudgetBoardMock =
  dashboardService.fetchDashboardBudgetBoard as jest.MockedFunction<
    typeof dashboardService.fetchDashboardBudgetBoard
  >;
const fetchDashboardCalendarSummaryMock =
  dashboardService.fetchDashboardCalendarSummary as jest.MockedFunction<
    typeof dashboardService.fetchDashboardCalendarSummary
  >;

describe("useDashboardData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("aggregates data and refreshes with bypass cache", async () => {
    fetchDashboardSummaryMock.mockResolvedValue({
      polls_open_count: 2,
      tasks_todo_count: 5,
    });
    fetchDashboardBudgetBoardMock.mockResolvedValue({
      budget_enabled: true,
    } as never);
    fetchDashboardCalendarSummaryMock.mockResolvedValue({
      calendar_enabled: true,
      events: [],
    });

    const { Wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useDashboardData({ householdId: 4 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });

    expect(result.current.dashboard?.polls_open_count).toBe(2);
    expect(result.current.dashboard?.tasks_todo_count).toBe(5);
    expect(result.current.budgetBoard?.budget_enabled).toBe(true);
    expect(result.current.calendarSummary?.calendar_enabled).toBe(true);

    await act(async () => {
      await result.current.refreshDashboard({ bypassCache: true });
    });

    expect(fetchDashboardSummaryMock).toHaveBeenLastCalledWith({ bypassCache: true });
    expect(fetchDashboardBudgetBoardMock).toHaveBeenLastCalledWith({
      bypassCache: true,
    });
    expect(fetchDashboardCalendarSummaryMock).toHaveBeenLastCalledWith(
      { from: "2026-03-01", to: "2026-03-31" },
      { bypassCache: true }
    );
  });
});
