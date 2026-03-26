import { addDays, parseOptionalIsoDate, startOfWeekMonday, toIsoDate } from "@/src/utils/date";
import { isTaskStatus } from "@/src/features/calendar/calendar-utils";

type MemberWithOptionalReason = {
  name: string;
  reason?: string | null;
};

type TaskWithAssignees = {
  assignee?: {
    id: number;
    name: string;
  };
  assignees?: {
    id: number;
    name: string;
  }[];
};

export const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const TASK_STATUS_TODO = "à faire";
export const TASK_STATUS_DONE = "réalisée";
export const TASK_STATUS_CANCELLED = "annulée";

export const pad = (value: number) => String(value).padStart(2, "0");
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);
  return next;
};

export const endOfWeekSunday = (date: Date) => addDays(startOfWeekMonday(date), 6);

export const mealPresenceLabel = (value: "present" | "not_home" | "later") => {
  if (value === "present") return "Je participe";
  if (value === "not_home") return "Pas à la maison";
  return "Je mangerai plus tard";
};

export const eventParticipationLabel = (value: "participate" | "not_participate") => {
  if (value === "participate") return "Je participe";
  return "Je ne participe pas";
};

export const formatMemberList = (members?: MemberWithOptionalReason[] | null) => {
  if (!Array.isArray(members) || members.length === 0) {
    return "Aucun";
  }

  return members
    .map((member) => {
      const name = String(member?.name ?? "").trim() || "Membre";
      const reason = String(member?.reason ?? "").trim();
      return reason.length > 0 ? `${name} (${reason})` : name;
    })
    .join(", ");
};

export const taskStatusLabel = (value: string) => {
  if (isTaskStatus(value, TASK_STATUS_TODO)) return "à faire";
  if (isTaskStatus(value, TASK_STATUS_DONE)) return "Réalisée";
  if (isTaskStatus(value, TASK_STATUS_CANCELLED)) return "Annulée";
  return value;
};

export const taskStatusColor = (value: string) => {
  if (isTaskStatus(value, TASK_STATUS_DONE)) return "#50BFA5";
  if (isTaskStatus(value, TASK_STATUS_CANCELLED)) return "#D96C6C";
  return "#7C5CFA";
};

export const taskAssigneeNames = (task: TaskWithAssignees) => {
  const names = Array.isArray(task.assignees)
    ? task.assignees
      .map((assignee) => String(assignee?.name ?? "").trim())
      .filter((name) => name.length > 0)
    : [];

  if (names.length > 0) {
    return names.join(", ");
  }

  return String(task.assignee?.name ?? "").trim();
};

export const isCalendarTaskAssignedToUser = (task: TaskWithAssignees, userId: number) => {
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees.some((assignee) => Number(assignee.id) === userId);
  }
  return Number(task.assignee?.id) === userId;
};

export const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString("fr-BE", { month: "long", year: "numeric" });

export const formatFullDateLabel = (isoDate: string) => {
  const parsed = parseOptionalIsoDate(isoDate);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return parsed.toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export const formatTimeRange = (startAt: string, endAt: string) => {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Horaire indisponible";
  }

  const sameDay = toIsoDate(start) === toIsoDate(end);
  const startLabel = start.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });

  if (sameDay) {
    return `${startLabel} - ${endLabel}`;
  }

  return `${start.toLocaleDateString("fr-BE")} ${startLabel} -> ${end.toLocaleDateString("fr-BE")} ${endLabel}`;
};

export const isoDateFromDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

export const timeInputFromDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "18:00";
  }
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};
