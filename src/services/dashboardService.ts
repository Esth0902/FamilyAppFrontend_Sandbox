import { apiFetch } from "@/src/api/client";
import type { BudgetBoardPayload } from "@/src/budget/common";
import { toIsoDate } from "@/src/utils/date";

export type DashboardVoterSummary = {
  user_id: number;
  votes_count: number;
};

export type DashboardPollOption = {
  id: number;
  recipe_id: number;
  title: string;
  votes_count: number;
};

export type DashboardPollVoterSummary = {
  user_id: number;
  name: string;
  votes_count: number;
};

export type DashboardPoll = {
  id: number;
  status: "open" | "closed" | "validated";
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  planning_start_date?: string | null;
  planning_end_date?: string | null;
  max_votes_per_user: number;
  total_votes: number;
  options: DashboardPollOption[];
  voters_summary: DashboardPollVoterSummary[];
};

export type DashboardFavoriteRecipe = {
  recipe_id: number;
  title: string;
  votes_count: number;
  polls_count: number;
};

export type DashboardPollHistoryPage = {
  data: DashboardPoll[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    has_more: boolean;
  };
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

type DashboardPollHistoryFetchOptions = DashboardFetchOptions & {
  page?: number;
  limit?: number;
};

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === "object" && value !== null;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const toPositiveInt = (value: unknown): number | null => {
  const num = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(num)) {
    return null;
  }
  const intValue = Math.trunc(num);
  return intValue > 0 ? intValue : null;
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toPollStatus = (value: unknown): DashboardPoll["status"] | null => {
  if (value === "open" || value === "closed" || value === "validated") {
    return value;
  }
  return null;
};

const toPollOption = (value: unknown): DashboardPollOption | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = toPositiveInt(value.id);
  const recipeId = toPositiveInt(value.recipe_id);
  if (id === null || recipeId === null) {
    return null;
  }

  const votesCount = toOptionalNumber(value.votes_count) ?? 0;
  const recipeTitleFromObject = isRecord(value.recipe) ? toOptionalString(value.recipe.title) : null;
  const explicitTitle = toOptionalString(value.title);
  const title = explicitTitle ?? recipeTitleFromObject ?? `Recette #${recipeId}`;

  return {
    id,
    recipe_id: recipeId,
    title,
    votes_count: votesCount,
  };
};

const toPollVoterSummary = (value: unknown): DashboardPollVoterSummary | null => {
  if (!isRecord(value)) {
    return null;
  }

  const userId = toPositiveInt(value.user_id);
  if (userId === null) {
    return null;
  }

  return {
    user_id: userId,
    name: toOptionalString(value.name) ?? "Membre",
    votes_count: toOptionalNumber(value.votes_count) ?? 0,
  };
};

const toDashboardPoll = (value: unknown): DashboardPoll | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = toPositiveInt(value.id);
  const status = toPollStatus(value.status);
  if (id === null || status === null) {
    return null;
  }

  const options = Array.isArray(value.options)
    ? value.options
      .map((option) => toPollOption(option))
      .filter((option): option is DashboardPollOption => option !== null)
    : [];
  const votersSummary = Array.isArray(value.voters_summary)
    ? value.voters_summary
      .map((voter) => toPollVoterSummary(voter))
      .filter((voter): voter is DashboardPollVoterSummary => voter !== null)
    : [];

  return {
    id,
    status,
    title: toOptionalString(value.title),
    starts_at: toOptionalString(value.starts_at),
    ends_at: toOptionalString(value.ends_at),
    planning_start_date: toOptionalString(value.planning_start_date),
    planning_end_date: toOptionalString(value.planning_end_date),
    max_votes_per_user: toOptionalNumber(value.max_votes_per_user) ?? 0,
    total_votes: toOptionalNumber(value.total_votes) ?? 0,
    options,
    voters_summary: votersSummary,
  };
};

const toDashboardPollHistoryPage = (value: unknown): DashboardPollHistoryPage => {
  if (Array.isArray(value)) {
    const data = value
      .map((poll) => toDashboardPoll(poll))
      .filter((poll): poll is DashboardPoll => poll !== null);
    return {
      data,
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: data.length,
        total: data.length,
        has_more: false,
      },
    };
  }

  if (!isRecord(value)) {
    return {
      data: [],
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: 0,
        total: 0,
        has_more: false,
      },
    };
  }

  const rawData = Array.isArray(value.data) ? value.data : [];
  const data = rawData
    .map((poll) => toDashboardPoll(poll))
    .filter((poll): poll is DashboardPoll => poll !== null);

  const metaRecord = isRecord(value.meta) ? value.meta : {};
  const currentPage = toOptionalNumber(metaRecord.current_page) ?? 1;
  const lastPage = toOptionalNumber(metaRecord.last_page) ?? 1;
  const perPage = toOptionalNumber(metaRecord.per_page) ?? data.length;
  const total = toOptionalNumber(metaRecord.total) ?? data.length;
  const hasMore = typeof metaRecord.has_more === "boolean"
    ? metaRecord.has_more
    : currentPage < lastPage;

  return {
    data,
    meta: {
      current_page: currentPage,
      last_page: lastPage,
      per_page: perPage,
      total,
      has_more: hasMore,
    },
  };
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

export const fetchDashboardSummary = async (
  options: DashboardFetchOptions = {}
): Promise<DashboardResponse | null> => {
  const payload = await apiFetch("/dashboard", {
    cacheTtlMs: 20_000,
    bypassCache: Boolean(options.bypassCache),
  });
  return toDashboardResponse(payload);
};

export const fetchActiveMealPoll = async (
  options: DashboardFetchOptions = {}
): Promise<DashboardPoll | null> => {
  const payload = await apiFetch("/meal-polls/active", {
    cacheTtlMs: 12_000,
    bypassCache: Boolean(options.bypassCache),
  });

  const candidate = isRecord(payload) ? payload.poll : payload;
  return toDashboardPoll(candidate);
};

export const fetchMealPollHistoryPage = async (
  options: DashboardPollHistoryFetchOptions = {}
): Promise<DashboardPollHistoryPage> => {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20)));

  const payload = await apiFetch(`/meal-polls/history?limit=${limit}&page=${page}`, {
    cacheTtlMs: 20_000,
    bypassCache: Boolean(options.bypassCache),
  });

  return toDashboardPollHistoryPage(payload);
};

export const buildFavoriteRecipesFromPolls = (
  polls: DashboardPoll[],
  limit = 10
): DashboardFavoriteRecipe[] => {
  if (!Array.isArray(polls) || polls.length === 0) {
    return [];
  }

  const stats = new Map<number, DashboardFavoriteRecipe>();

  polls.forEach((poll) => {
    const countedForPoll = new Set<number>();

    poll.options.forEach((option) => {
      if (option.votes_count <= 0) {
        return;
      }

      const existing = stats.get(option.recipe_id) ?? {
        recipe_id: option.recipe_id,
        title: option.title,
        votes_count: 0,
        polls_count: 0,
      };

      existing.votes_count += option.votes_count;
      if (!countedForPoll.has(option.recipe_id)) {
        existing.polls_count += 1;
        countedForPoll.add(option.recipe_id);
      }
      if (!existing.title || existing.title.trim().length === 0) {
        existing.title = option.title;
      }

      stats.set(option.recipe_id, existing);
    });
  });

  const clampedLimit = Math.max(1, Math.trunc(limit));
  return Array.from(stats.values())
    .sort((left, right) => {
      if (right.votes_count !== left.votes_count) {
        return right.votes_count - left.votes_count;
      }
      if (right.polls_count !== left.polls_count) {
        return right.polls_count - left.polls_count;
      }
      return left.title.localeCompare(right.title, "fr-BE", { sensitivity: "base" });
    })
    .slice(0, clampedLimit);
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
