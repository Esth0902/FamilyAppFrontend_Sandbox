import { apiFetch } from "@/src/api/client";
import { addDays, toIsoDate } from "@/src/utils/date";

export type TaskStatus = "à faire" | "réalisée" | "annulée";

export type TasksBoardPayload = {
  tasks_enabled: boolean;
  can_manage_templates: boolean;
  can_manage_instances: boolean;
  settings?: {
    alternating_custody_enabled?: boolean;
    custody_change_day?: number;
    custody_home_week_start?: string | null;
  };
  current_user?: {
    id: number;
    role: "parent" | "enfant";
  };
  instances: {
    due_date?: string;
    status: TaskStatus;
    validated_by_parent: boolean;
    assignee?: {
      id: number;
      name?: string;
    };
    assignees?: {
      id: number;
      name?: string;
    }[];
  }[];
};

type FetchTasksBoardResult = {
  payload: TasksBoardPayload;
  resolvedWeekStartDay: number;
};

type FetchTasksBoardOptions = {
  bypassCache?: boolean;
};

const isoWeekDayFromDate = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

export const weekStartFromDateWithIsoDay = (date: Date, startDayIso: number) => {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const safeStartDay = Number.isInteger(startDayIso) && startDayIso >= 1 && startDayIso <= 7 ? startDayIso : 1;
  return addDays(normalized, -((isoWeekDayFromDate(normalized) - safeStartDay + 7) % 7));
};

export const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
};

export const normalizeIsoWeekDay = (value: unknown, fallback = 1): number => {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed;
  }
  return fallback;
};

export const resolveIsoWeekDayFromIsoDate = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return isoWeekDayFromDate(parsed);
};

export const isTodoStatus = (status: unknown): boolean => String(status ?? "").toLowerCase().includes("faire");

export const isDoneStatus = (status: unknown): boolean => {
  const normalized = String(status ?? "").toLowerCase();
  return normalized.includes("réalis") || normalized.includes("realis");
};

export const isInstanceAssignedToUser = (
  instance: TasksBoardPayload["instances"][number],
  userId: number
) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    return false;
  }

  if (Array.isArray(instance.assignees) && instance.assignees.length > 0) {
    return instance.assignees.some((assignee) => Number(assignee?.id ?? 0) === userId);
  }

  return Number(instance.assignee?.id ?? 0) === userId;
};

export const fetchTasksBoardForCurrentWeek = async (
  plannedWeekStartDay: number,
  options?: FetchTasksBoardOptions
): Promise<FetchTasksBoardResult> => {
  const weekStart = weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay);
  const rangeFrom = toIsoDate(weekStart);
  const rangeTo = toIsoDate(addDays(weekStart, 6));
  let payload = await apiFetch(`/tasks/board?from=${rangeFrom}&to=${rangeTo}`, {
    cacheTtlMs: 12_000,
    bypassCache: options?.bypassCache === true,
  }) as TasksBoardPayload;

  const isAlternatingCustodyEnabled = Boolean(payload?.settings?.alternating_custody_enabled);
  const homeWeekStartDay = resolveIsoWeekDayFromIsoDate(payload?.settings?.custody_home_week_start);
  const resolvedWeekStartDay = isAlternatingCustodyEnabled
    ? (homeWeekStartDay ?? normalizeIsoWeekDay(payload?.settings?.custody_change_day, 1))
    : 1;

  if (resolvedWeekStartDay !== plannedWeekStartDay) {
    const correctedWeekStart = weekStartFromDateWithIsoDay(new Date(), resolvedWeekStartDay);
    const correctedFrom = toIsoDate(correctedWeekStart);
    const correctedTo = toIsoDate(addDays(correctedWeekStart, 6));

    if (correctedFrom !== rangeFrom || correctedTo !== rangeTo) {
      payload = await apiFetch(`/tasks/board?from=${correctedFrom}&to=${correctedTo}`, {
        cacheTtlMs: 12_000,
        bypassCache: true,
      }) as TasksBoardPayload;
    }
  }

  return {
    payload,
    resolvedWeekStartDay,
  };
};
