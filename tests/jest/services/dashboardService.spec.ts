/* eslint-env jest */
import { apiFetch } from "@/src/api/client";
import {
  fetchDashboardBudgetBoard,
  fetchDashboardCalendarSummary,
} from "@/src/services/dashboardService";

jest.mock("@/src/api/client", () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe("dashboardService", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("returns null when budget board is forbidden", async () => {
    mockApiFetch.mockRejectedValueOnce({ status: 403 });

    await expect(fetchDashboardBudgetBoard()).resolves.toBeNull();
    expect(mockApiFetch).toHaveBeenCalledWith("/budget/board", {
      cacheTtlMs: 20_000,
      bypassCache: false,
    });
  });

  it("rethrows budget board errors that are not 403/404", async () => {
    const networkError = { status: 500, message: "server down" };
    mockApiFetch.mockRejectedValueOnce(networkError);

    await expect(fetchDashboardBudgetBoard()).rejects.toBe(networkError);
  });

  it("builds calendar board query and returns payload", async () => {
    const payload = { calendar_enabled: true, events: [] };
    mockApiFetch.mockResolvedValueOnce(payload);

    await expect(
      fetchDashboardCalendarSummary({ from: "2026-03-01", to: "2026-03-31" })
    ).resolves.toEqual(payload);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/calendar/board?from=2026-03-01&to=2026-03-31",
      {
        cacheTtlMs: 15_000,
        bypassCache: false,
      }
    );
  });
});
