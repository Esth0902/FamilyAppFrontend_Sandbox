import { apiFetch } from "@/src/api/client";
import type { MealType } from "@/src/features/calendar/calendar-types";

type FetchCalendarBoardOptions = {
  cacheTtlMs?: number;
  bypassCache?: boolean;
};

export const fetchCalendarBoardForRange = async <T = unknown>(
  from: string,
  to: string,
  options?: FetchCalendarBoardOptions
): Promise<T> => {
  return await apiFetch(`/calendar/board?from=${from}&to=${to}`, {
    cacheTtlMs: options?.cacheTtlMs ?? 12_000,
    bypassCache: options?.bypassCache === true,
  }) as T;
};

export const saveCalendarEvent = async (
  payload: {
    title: string;
    description?: string | null;
    start_at: string;
    end_at: string;
    is_shared_with_other_household: boolean;
  },
  eventId?: number | null
): Promise<void> => {
  const isEdit = Number.isInteger(eventId) && Number(eventId) > 0;
  await apiFetch(isEdit ? `/calendar/events/${eventId}` : "/calendar/events", {
    method: isEdit ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });
};

export const deleteCalendarEvent = async (eventId: number): Promise<void> => {
  await apiFetch(`/calendar/events/${eventId}`, { method: "DELETE" });
};

type MealPlanPayload = {
  date: string;
  meal_type: MealType;
  recipe_id?: number | null;
  custom_title?: string | null;
  servings: number;
  note?: string | null;
};

export const createMealPlanEntry = async (payload: MealPlanPayload): Promise<void> => {
  await apiFetch("/calendar/meal-plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const updateMealPlanEntry = async (
  mealPlanId: number,
  payload: MealPlanPayload
): Promise<void> => {
  await apiFetch(`/calendar/meal-plan/${mealPlanId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
};

export const deleteMealPlanEntry = async (mealPlanId: number): Promise<void> => {
  await apiFetch(`/calendar/meal-plan/${mealPlanId}`, { method: "DELETE" });
};

export const submitMealPlanAttendance = async (
  mealPlanId: number,
  payload: {
    status: "present" | "not_home" | "later";
    reason?: string | null;
  }
): Promise<void> => {
  await apiFetch(`/calendar/meal-plan/${mealPlanId}/attendance`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const submitCalendarEventParticipation = async (
  eventId: number,
  payload: {
    status: "participate" | "not_participate";
    reason?: string | null;
  }
): Promise<void> => {
  await apiFetch(`/calendar/events/${eventId}/participation`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};
