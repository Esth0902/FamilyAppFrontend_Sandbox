import { addDays, isValidIsoDate, parseIsoDate, toIsoDate } from "@/src/utils/date";
import { isInstanceAssignedToUser, weekStartFromDateWithIsoDay } from "@/src/services/tasksService";

import type { TaskInstance } from "@/src/features/tasks/hooks/useTasksBoard";

export { weekStartFromDateWithIsoDay };

export const STATUS_TODO = "à faire";
export const STATUS_DONE = "réalisée";
export const STATUS_CANCELLED = "annulée";

export const WEEK_DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" },
] as const;

const pad = (value: number) => String(value).padStart(2, "0");

export const recurrenceLabel = (value: string) => {
  if (value === "daily") return "Quotidienne";
  if (value === "weekly") return "Hebdomadaire";
  if (value === "monthly") return "Mensuelle";
  if (value === "once") return "Ponctuelle";
  return value;
};

export const normalizeRecurrenceDays = (days: number[] | undefined) => {
  if (!Array.isArray(days)) return [];
  return Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))).sort((a, b) => a - b);
};

export const recurrenceDaysLabel = (recurrence: string, recurrenceDays?: number[]) => {
  if (recurrence !== "daily" && recurrence !== "weekly") {
    return null;
  }

  const days = normalizeRecurrenceDays(recurrenceDays);
  if (days.length === 0) {
    return "Jours: non définis";
  }

  if (days.length === 7) {
    return "Jours: tous les jours";
  }

  const labels = days
    .map((day) => WEEK_DAYS.find((item) => item.value === day)?.label ?? "")
    .filter((label) => label.length > 0)
    .join(", ");
  return `Jours: ${labels}`;
};

export const weekLabelFromStart = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const start = weekStart.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  const end = weekEnd.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `Semaine du ${start} au ${end}`;
};

export const weekStartIsoFromIsoDate = (isoDate: string, startDayIso: number = 1) => {
  const safeStartDay = Number.isInteger(startDayIso) && startDayIso >= 1 && startDayIso <= 7 ? startDayIso : 1;
  if (!isValidIsoDate(isoDate)) {
    return toIsoDate(weekStartFromDateWithIsoDay(new Date(), safeStartDay));
  }
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    return toIsoDate(weekStartFromDateWithIsoDay(new Date(), safeStartDay));
  }
  return toIsoDate(weekStartFromDateWithIsoDay(parsed, safeStartDay));
};

export const formatDateLabel = (isoDate: string) => {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    return isoDate;
  }
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
};

export const isTaskInstanceAssignedToUser = (instance: TaskInstance, userId: number) => {
  return isInstanceAssignedToUser(instance, userId);
};

export const parseDateFallback = (value: string): string => {
  if (!isValidIsoDate(value)) {
    return toIsoDate(new Date());
  }
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return toIsoDate(new Date());
  }
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};
