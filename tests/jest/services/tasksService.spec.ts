/* eslint-env jest */
import { apiFetch } from "@/src/api/client";
import {
  fetchTasksBoardForCurrentWeek,
  isDoneStatus,
  normalizeIsoWeekDay,
  resolveIsoWeekDayFromIsoDate,
  toPositiveInt,
} from "@/src/services/tasksService";

jest.mock("@/src/api/client", () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe("tasksService", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("normalizes helper values safely", () => {
    expect(normalizeIsoWeekDay(4)).toBe(4);
    expect(normalizeIsoWeekDay(99, 2)).toBe(2);
    expect(resolveIsoWeekDayFromIsoDate("2026-03-16")).toBe(1);
    expect(resolveIsoWeekDayFromIsoDate("2026-13-01")).toBeNull();
    expect(toPositiveInt("42")).toBe(42);
    expect(toPositiveInt(-10)).toBeNull();
    expect(isDoneStatus("realisee")).toBe(true);
    expect(isDoneStatus("a faire")).toBe(false);
  });

  it("refetches with corrected custody week start when needed", async () => {
    const firstPayload = {
      tasks_enabled: true,
      can_manage_templates: false,
      can_manage_instances: true,
      settings: {
        alternating_custody_enabled: true,
        custody_change_day: 3,
      },
      instances: [],
    };

    const correctedPayload = {
      ...firstPayload,
      instances: [{ status: "a faire", validated_by_parent: false }],
    };

    mockApiFetch.mockResolvedValueOnce(firstPayload as never);
    mockApiFetch.mockResolvedValueOnce(correctedPayload as never);

    const result = await fetchTasksBoardForCurrentWeek(1);

    expect(result.resolvedWeekStartDay).toBe(3);
    expect(result.payload).toEqual(correctedPayload);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch.mock.calls[1][1]).toMatchObject({
      cacheTtlMs: 12_000,
      bypassCache: true,
    });
    expect(String(mockApiFetch.mock.calls[1][0])).toContain("/tasks/board?from=");
  });
});
