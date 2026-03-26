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

type UnknownRecord = Record<string, unknown>;
type DashboardFetchOptions = {
  bypassCache?: boolean;
};

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === "object" && value !== null;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const toDashboardResponse = (value: unknown): DashboardResponse | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    polls_total_count: toOptionalNumber(value.polls_total_count),
    polls_open_count: toOptionalNumber(value.polls_open_count),
    polls_closed_count: toOptionalNumber(value.polls_closed_count),
    tasks_todo_count: toOptionalNumber(value.tasks_todo_count),
    tasks_done_count: toOptionalNumber(value.tasks_done_count),
    tasks_validated_count: toOptionalNumber(value.tasks_validated_count),
    budget_pending_requests: toOptionalNumber(value.budget_pending_requests),
  };
};

const toCalendarSummaryResponse = (value: unknown): CalendarSummaryResponse | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    calendar_enabled: typeof value.calendar_enabled === "boolean" ? value.calendar_enabled : undefined,
    events: Array.isArray(value.events) ? value.events : undefined,
    meal_plan: Array.isArray(value.meal_plan) ? value.meal_plan : undefined,
  };
};

const isBudgetBoardPayload = (value: unknown): value is BudgetBoardPayload => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.children)
    && typeof value.currency === "string"
    && isRecord(value.current_user)
  );
};

const toBudgetBoardPayload = (value: unknown): BudgetBoardPayload | null => {
  if (!isBudgetBoardPayload(value)) {
    return null;
  }
  return value;
};

const toStatusCode = (value: unknown): number | null => {
  if (!isRecord(value)) {
    return null;
  }

  const status = value.status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
};

const isForbiddenOrNotFoundError = (error: unknown): boolean => {
  const status = toStatusCode(error);
  return status === 403 || status === 404;
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
  const payload = await apiFetch("/dashboard");
  return toDashboardResponse(payload);
};

export const fetchDashboardBudgetBoard = async (
  options: DashboardFetchOptions = {}
): Promise<BudgetBoardPayload | null> => {
  try {
    const payload = await apiFetch("/budget/board", {
      cacheTtlMs: 20_000,
      bypassCache: Boolean(options.bypassCache),
    });
    return toBudgetBoardPayload(payload);
  } catch (error: unknown) {
    if (isForbiddenOrNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};

export const fetchDashboardCalendarSummary = async (
  range: { from: string; to: string },
  options: DashboardFetchOptions = {}
): Promise<CalendarSummaryResponse | null> => {
  try {
    const payload = await apiFetch(`/calendar/board?from=${range.from}&to=${range.to}`, {
      cacheTtlMs: 15_000,
      bypassCache: Boolean(options.bypassCache),
    });
    return toCalendarSummaryResponse(payload);
  } catch (error: unknown) {
    if (isForbiddenOrNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};
