/* eslint-env jest */
import { apiFetch } from "@/src/api/client";
import {
  buildFavoriteRecipesFromPolls,
  fetchActiveMealPoll,
  fetchDashboardBudgetBoard,
  fetchDashboardCalendarSummary,
  fetchMealPollHistoryPage,
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

  it("fetches active meal poll and maps option recipe title", async () => {
    mockApiFetch.mockResolvedValueOnce({
      poll: {
        id: 15,
        status: "open",
        max_votes_per_user: 2,
        total_votes: 4,
        options: [
          {
            id: 90,
            recipe_id: 301,
            votes_count: 4,
            recipe: { title: "Lasagnes" },
          },
        ],
        voters_summary: [{ user_id: 9, name: "Alex", votes_count: 2 }],
      },
    });

    await expect(fetchActiveMealPoll()).resolves.toEqual({
      id: 15,
      status: "open",
      title: null,
      starts_at: null,
      ends_at: null,
      planning_start_date: null,
      planning_end_date: null,
      max_votes_per_user: 2,
      total_votes: 4,
      options: [{ id: 90, recipe_id: 301, title: "Lasagnes", votes_count: 4 }],
      voters_summary: [{ user_id: 9, name: "Alex", votes_count: 2 }],
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/meal-polls/active", {
      cacheTtlMs: 12_000,
      bypassCache: false,
    });
  });

  it("fetches paginated meal poll history", async () => {
    mockApiFetch.mockResolvedValueOnce({
      data: [
        {
          id: 20,
          status: "validated",
          max_votes_per_user: 3,
          total_votes: 8,
          options: [],
          voters_summary: [],
        },
      ],
      meta: {
        current_page: 1,
        last_page: 2,
        per_page: 1,
        total: 2,
      },
    });

    await expect(fetchMealPollHistoryPage({ page: 1, limit: 1 })).resolves.toEqual({
      data: [
        {
          id: 20,
          status: "validated",
          title: null,
          starts_at: null,
          ends_at: null,
          planning_start_date: null,
          planning_end_date: null,
          max_votes_per_user: 3,
          total_votes: 8,
          options: [],
          voters_summary: [],
        },
      ],
      meta: {
        current_page: 1,
        last_page: 2,
        per_page: 1,
        total: 2,
        has_more: true,
      },
    });
  });

  it("aggregates favorite recipes from polls", () => {
    const favorites = buildFavoriteRecipesFromPolls([
      {
        id: 1,
        status: "validated",
        max_votes_per_user: 2,
        total_votes: 5,
        options: [
          { id: 11, recipe_id: 90, title: "Pâtes", votes_count: 3 },
          { id: 12, recipe_id: 91, title: "Curry", votes_count: 2 },
        ],
        voters_summary: [],
      },
      {
        id: 2,
        status: "validated",
        max_votes_per_user: 2,
        total_votes: 3,
        options: [
          { id: 13, recipe_id: 90, title: "Pâtes", votes_count: 1 },
          { id: 14, recipe_id: 92, title: "Pizza", votes_count: 2 },
        ],
        voters_summary: [],
      },
    ]);

    expect(favorites).toEqual([
      { recipe_id: 90, title: "Pâtes", votes_count: 4, polls_count: 2 },
      { recipe_id: 91, title: "Curry", votes_count: 2, polls_count: 1 },
      { recipe_id: 92, title: "Pizza", votes_count: 2, polls_count: 1 },
    ]);
  });
});
