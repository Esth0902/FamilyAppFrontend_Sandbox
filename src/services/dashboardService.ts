import { apiFetch } from "@/src/api/client";
import type { BudgetBoardPayload } from "@/src/budget/common";
import { toIsoDate } from "@/src/utils/date";

export type DashboardVoterSummary = {
  user_id: number;
  votes_count: number;
};

export type DashboardPoll = {
  id: number;
  status: "open" | "closed" | "validated";
  max_votes_per_user: number;
  total_votes: number;
  voters_summary?: DashboardVoterSummary[];
};

export type DashboardTaskSummary = {
  enabled: boolean;
  todo_count?: number;
  done_count?: number;
  validated_count?: number;
};

export type DashboardResponse = {
  polls_open?: DashboardPoll[];
  polls_closed?: DashboardPoll[];
  polls?: DashboardPoll[];
  active_poll?: DashboardPoll | null;
  tasks_summary?: DashboardTaskSummary;
  members?: { id: number }[];
};

export type CalendarSummaryResponse = {
  calendar_enabled?: boolean;
  events?: unknown[];
  meal_plan?: unknown[];
};

type ApiError = {
  status?: number;
};

type FetchOptions = {
  bypassCache?: boolean;
};

export const currentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toIsoDate(start),
    to: toIsoDate(end),
  };
};

export const fetchDashboardSummary = async (
  options?: FetchOptions
): Promise<DashboardResponse | null> => {
  return (await apiFetch("/dashboard", {
    cacheTtlMs: 20_000,
    bypassCache: options?.bypassCache === true,
  })) as DashboardResponse | null;
};

export const fetchDashboardBudgetBoard = async (
  options?: FetchOptions
): Promise<BudgetBoardPayload | null> => {
  try {
    return (await apiFetch("/budget/board", {
      cacheTtlMs: 20_000,
      bypassCache: options?.bypassCache === true,
    })) as BudgetBoardPayload | null;
  } catch (error: any) {
    const typedError = error as ApiError;
    if (typedError?.status === 403 || typedError?.status === 404) {
      return null;
    }
    throw error;
  }
};

export const fetchDashboardCalendarSummary = async (
  range: { from: string; to: string },
  options?: FetchOptions
): Promise<CalendarSummaryResponse | null> => {
  try {
    return (await apiFetch(`/calendar/board?from=${range.from}&to=${range.to}`, {
      cacheTtlMs: 15_000,
      bypassCache: options?.bypassCache === true,
    })) as CalendarSummaryResponse | null;
  } catch (error: any) {
    const typedError = error as ApiError;
    if (typedError?.status === 403 || typedError?.status === 404) {
      return null;
    }
    throw error;
  }
};
