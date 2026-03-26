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
  polls_total_count?: number;
  polls_open_count?: number;
  polls_closed_count?: number;
  tasks_todo_count?: number;
  tasks_done_count?: number;
  tasks_validated_count?: number;
  budget_pending_requests?: number;
};

export type CalendarSummaryResponse = {
  calendar_enabled?: boolean;
  events?: unknown[];
  meal_plan?: unknown[];
};

type ApiError = {
  status?: number;
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

export const fetchDashboardSummary = async (): Promise<DashboardResponse | null> => {
  return (await apiFetch("/dashboard")) as DashboardResponse | null;
};

export const fetchDashboardBudgetBoard = async (): Promise<BudgetBoardPayload | null> => {
  try {
    return (await apiFetch("/budget/board")) as BudgetBoardPayload | null;
  } catch (error: any) {
    const typedError = error as ApiError;
    if (typedError?.status === 403 || typedError?.status === 404) {
      return null;
    }
    throw error;
  }
};

export const fetchDashboardCalendarSummary = async (
  range: { from: string; to: string }
): Promise<CalendarSummaryResponse | null> => {
  try {
    return (await apiFetch(`/calendar/board?from=${range.from}&to=${range.to}`)) as CalendarSummaryResponse | null;
  } catch (error: any) {
    const typedError = error as ApiError;
    if (typedError?.status === 403 || typedError?.status === 404) {
      return null;
    }
    throw error;
  }
};
