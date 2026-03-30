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
    id?: number;
    title?: string;
    description?: string | null;
    due_date?: string;
    status: TaskStatus | string;
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

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === "object" && value !== null;
};

const isTasksBoardPayload = (value: unknown): value is TasksBoardPayload => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.tasks_enabled === "boolean"
    && typeof value.can_manage_templates === "boolean"
    && typeof value.can_manage_instances === "boolean"
    && Array.isArray(value.instances)
  );
};

const parseTasksBoardPayload = (value: unknown, endpoint: string): TasksBoardPayload => {
  if (!isTasksBoardPayload(value)) {
    throw new Error(`Réponse invalide pour ${endpoint}.`);
  }

  return value;
};

const fetchTasksBoardPayload = async (
  from: string,
  to: string,
  options: { bypassCache?: boolean } = {}
): Promise<TasksBoardPayload> => {
  const endpoint = `/tasks/board?from=${from}&to=${to}`;
  const payload = await apiFetch(endpoint, {
    cacheTtlMs: 12_000,
    bypassCache: Boolean(options.bypassCache),
  });
  return parseTasksBoardPayload(payload, endpoint);
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
  plannedWeekStartDay: number
): Promise<FetchTasksBoardResult> => {
  const weekStart = weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay);
  const rangeFrom = toIsoDate(weekStart);
  const rangeTo = toIsoDate(addDays(weekStart, 6));
  let payload = await fetchTasksBoardPayload(rangeFrom, rangeTo);

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
      payload = await fetchTasksBoardPayload(correctedFrom, correctedTo, {
        bypassCache: true,
      });
    }
  }

  return {
    payload,
    resolvedWeekStartDay,
  };
};

export const fetchTasksBoardForRange = async <T = unknown>(
  from: string,
  to: string
): Promise<T> => {
  return await apiFetch(`/tasks/board?from=${from}&to=${to}`) as T;
};

export const createTaskInstance = async (payload: {
  name: string;
  description?: string | null;
  due_date: string;
  end_date: string;
  user_id?: number;
  user_ids?: number[];
}): Promise<void> => {
  await apiFetch("/tasks/instances", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const updateTaskInstance = async (
  instanceId: number,
  payload: {
    status: string;
  }
): Promise<void> => {
  await apiFetch(`/tasks/instances/${instanceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
};

export const validateTaskInstance = async (instanceId: number): Promise<void> => {
  await apiFetch(`/tasks/instances/${instanceId}/validate`, {
    method: "POST",
  });
};

export const requestTaskInstanceReassignment = async (payload: {
  instanceId: number;
  invitedUserId: number;
}): Promise<void> => {
  await apiFetch(`/tasks/instances/${payload.instanceId}/reassignment-request`, {
    method: "POST",
    body: JSON.stringify({ invited_user_id: payload.invitedUserId }),
  });
};

export const createTaskTemplate = async (payload: Record<string, unknown>): Promise<void> => {
  await apiFetch("/tasks/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const updateTaskTemplate = async (
  templateId: number,
  payload: Record<string, unknown>
): Promise<void> => {
  await apiFetch(`/tasks/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
};

export const deleteTaskTemplate = async (templateId: number): Promise<void> => {
  await apiFetch(`/tasks/templates/${templateId}`, {
    method: "DELETE",
  });
};
