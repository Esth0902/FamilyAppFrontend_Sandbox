/* eslint-env jest */
import { apiFetch } from "@/src/api/client";
import {
  createTaskInstance,
  createTaskTemplate,
  deleteTaskTemplate,
  fetchTasksBoardForCurrentWeek,
  isDoneStatus,
  normalizeIsoWeekDay,
  requestTaskInstanceReassignment,
  resolveIsoWeekDayFromIsoDate,
  toPositiveInt,
  updateTaskInstance,
  updateTaskTemplate,
  validateTaskInstance,
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

  it("routes task mutation helpers to expected endpoints", async () => {
    mockApiFetch.mockResolvedValue(undefined as never);

    await createTaskInstance({
      name: "Aspirateur",
      description: null,
      due_date: "2026-03-30",
      end_date: "2026-03-30",
      user_ids: [2, 3],
    });
    await updateTaskInstance(11, { status: "réalisée" });
    await validateTaskInstance(11);
    await requestTaskInstanceReassignment({ instanceId: 11, invitedUserId: 4 });
    await createTaskTemplate({ name: "Routine test" });
    await updateTaskTemplate(7, { name: "Routine edit" });
    await deleteTaskTemplate(7);

    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      "/tasks/instances",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      "/tasks/instances/11",
      expect.objectContaining({
        method: "PATCH",
      })
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      3,
      "/tasks/instances/11/validate",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      4,
      "/tasks/instances/11/reassignment-request",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      5,
      "/tasks/templates",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      6,
      "/tasks/templates/7",
      expect.objectContaining({
        method: "PATCH",
      })
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      7,
      "/tasks/templates/7",
      expect.objectContaining({
        method: "DELETE",
      })
    );
  });
});
