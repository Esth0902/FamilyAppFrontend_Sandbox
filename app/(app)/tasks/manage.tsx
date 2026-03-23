import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch, getApiErrorMessage } from "@/src/api/client";
import { queryKeys } from "@/src/query/query-keys";
import { subscribeToHouseholdRealtime, subscribeToUserRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";

const STATUS_TODO = "à faire";
const STATUS_DONE = "réalisée";
const STATUS_CANCELLED = "annulée";
const WEEK_DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" },
] as const;
const WEEK_DAY_SHORT = ["di", "lu", "ma", "me", "je", "ve", "sa"] as const;
const MONTH_LABELS = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "dec"];
const WHEEL_ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_ROWS = 5;
const WHEEL_CONTAINER_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
const WHEEL_VERTICAL_PADDING = (WHEEL_CONTAINER_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;

type TaskMember = {
  id: number;
  name: string;
  role: "parent" | "enfant";
};

type TaskTemplate = {
  id: number;
  name: string;
  description?: string | null;
  recurrence: "daily" | "weekly" | "monthly" | "once";
  start_date?: string | null;
  end_date?: string | null;
  recurrence_days?: number[];
  assignee_user_ids?: number[];
  rotation_user_ids?: number[];
  is_rotation: boolean;
  rotation_cycle_weeks?: number;
  is_inter_household_alternating?: boolean;
  inter_household_week_start?: string | null;
  fixed_user_id?: number | null;
  fixed_user_name?: string | null;
};

type TaskInstance = {
  id: number;
  task_template_id: number;
  title: string;
  description?: string | null;
  due_date: string;
  status: string;
  completed_at?: string | null;
  validated_by_parent: boolean;
  assignee: {
    id: number;
    name: string;
  };
  assignees: {
    id: number;
    name: string;
  }[];
  template: {
    id: number;
    recurrence: string;
    start_date?: string | null;
    end_date?: string | null;
    recurrence_days?: number[];
    assignee_user_ids?: number[];
    rotation_user_ids?: number[];
    is_rotation: boolean;
    rotation_cycle_weeks?: number;
    is_inter_household_alternating?: boolean;
    inter_household_week_start?: string | null;
  };
  permissions: {
    can_toggle: boolean;
    can_validate: boolean;
    can_cancel: boolean;
  };
};

type BoardPayload = {
  tasks_enabled: boolean;
  range: {
    from: string;
    to: string;
  };
  settings?: {
    alternating_custody_enabled?: boolean;
    custody_change_day?: number;
    custody_home_week_start?: string | null;
  };
  can_manage_templates: boolean;
  can_manage_instances: boolean;
  current_user?: {
    id: number;
    role: "parent" | "enfant";
  };
  members: TaskMember[];
  templates: TaskTemplate[];
  instances: TaskInstance[];
};

type TaskModuleKey = "planned" | "schedule" | "routines";
type IsoWeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const pad = (value: number) => String(value).padStart(2, "0");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wheelIndexFromOffset = (offsetY: number, size: number) =>
  clamp(Math.round(offsetY / WHEEL_ITEM_HEIGHT), 0, Math.max(0, size - 1));
const normalizeIsoWeekDay = (value: unknown, fallback: IsoWeekDay = 1): IsoWeekDay => {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed as IsoWeekDay;
  }
  return fallback;
};

const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseIsoDate = (value: string) => new Date(`${value}T00:00:00`);

const addDays = (baseDate: Date, days: number) => {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
};

const weekDayShortLabel = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day);
  return WEEK_DAY_SHORT[date.getDay()] ?? "";
};

const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const recurrenceLabel = (value: string) => {
  if (value === "daily") return "Quotidienne";
  if (value === "weekly") return "Hebdomadaire";
  if (value === "monthly") return "Mensuelle";
  if (value === "once") return "Ponctuelle";
  return value;
};

const isoWeekDayFromDate = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

const weekStartFromDate = (date: Date) => {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(normalized, 1 - isoWeekDayFromDate(normalized));
};
const weekStartFromDateWithIsoDay = (date: Date, startDayIso: number) => {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const safeStartDay = Number.isInteger(startDayIso) && startDayIso >= 1 && startDayIso <= 7 ? startDayIso : 1;
  return addDays(normalized, -((isoWeekDayFromDate(normalized) - safeStartDay + 7) % 7));
};

const weekLabelFromStart = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const start = weekStart.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  const end = weekEnd.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `Semaine du ${start} au ${end}`;
};

const weekStartIsoFromIsoDate = (isoDate: string, startDayIso: number = 1) => {
  const safeStartDay = Number.isInteger(startDayIso) && startDayIso >= 1 && startDayIso <= 7 ? startDayIso : 1;
  if (!isValidIsoDate(isoDate)) {
    return toIsoDate(weekStartFromDateWithIsoDay(new Date(), safeStartDay));
  }
  return toIsoDate(weekStartFromDateWithIsoDay(parseIsoDate(isoDate), safeStartDay));
};

const normalizeRecurrenceDays = (days: number[] | undefined) => {
  if (!Array.isArray(days)) return [];
  return Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))).sort((a, b) => a - b);
};

const recurrenceDaysLabel = (recurrence: string, recurrenceDays?: number[]) => {
  if (recurrence !== "daily" && recurrence !== "weekly") {
    return null;
  }

  const days = normalizeRecurrenceDays(recurrenceDays);
  if (days.length === 0) {
    return recurrence === "daily" ? "Tous les jours" : "Jour de création";
  }
  if (recurrence === "daily" && days.length === 7) {
    return "Tous les jours";
  }

  const labels = days
    .map((day) => WEEK_DAYS.find((item) => item.value === day)?.label ?? "")
    .filter((label) => label.length > 0)
    .join(", ");
  return `Jours: ${labels}`;
};

const formatDateLabel = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const isTaskInstanceAssignedToUser = (instance: TaskInstance, userId: number) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    return false;
  }

  if (Array.isArray(instance.assignees) && instance.assignees.length > 0) {
    return instance.assignees.some((assignee) => Number(assignee.id) === userId);
  }

  return Number(instance.assignee.id) === userId;
};

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
};

const isTaskModuleKey = (value: unknown): value is TaskModuleKey =>
  value === "planned" || value === "schedule" || value === "routines";

export default function TasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ module?: string | string[] }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();

  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const initialWeekStart = useMemo(() => weekStartFromDate(new Date()), []);
  const initialTemplateDay = useMemo(() => isoWeekDayFromDate(new Date()), []);

  const [tasksEnabled, setTasksEnabled] = useState(false);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [plannedWeekStartDay, setPlannedWeekStartDay] = useState<IsoWeekDay>(1);
  const plannedWeekStartDayRef = useRef<IsoWeekDay>(1);
  const [canManageTemplates, setCanManageTemplates] = useState(false);
  const [canManageInstances, setCanManageInstances] = useState(false);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [instances, setInstances] = useState<TaskInstance[]>([]);

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateRecurrence, setTemplateRecurrence] = useState<"daily" | "weekly" | "monthly" | "once">("weekly");
  const [templateStartDate, setTemplateStartDate] = useState(todayIso);
  const [templateHasEndDate, setTemplateHasEndDate] = useState(false);
  const [templateEndDate, setTemplateEndDate] = useState(todayIso);
  const [templateRecurrenceDays, setTemplateRecurrenceDays] = useState<number[]>([initialTemplateDay]);
  const [templateRotation, setTemplateRotation] = useState(false);
  const [templateRotationCycleWeeks, setTemplateRotationCycleWeeks] = useState<1 | 2>(1);
  const [templateAssigneeUserIds, setTemplateAssigneeUserIds] = useState<number[]>([]);
  const [templateRotationUserIds, setTemplateRotationUserIds] = useState<number[]>([]);
  const [templateInterHouseholdAlternating, setTemplateInterHouseholdAlternating] = useState(false);
  const [templateInterHouseholdWeekStart, setTemplateInterHouseholdWeekStart] = useState<string>(
    () => toIsoDate(initialWeekStart)
  );
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<"parent" | "enfant">("enfant");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<number[]>([]);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualDate, setManualDate] = useState(todayIso);
  const [manualEndDate, setManualEndDate] = useState(todayIso);
  const [manualDateWheelVisible, setManualDateWheelVisible] = useState(false);
  const [manualDateWheelTarget, setManualDateWheelTarget] = useState<"start" | "end">("start");
  const [manualDateWheelYear, setManualDateWheelYear] = useState(new Date().getFullYear());
  const [manualDateWheelMonth, setManualDateWheelMonth] = useState(new Date().getMonth() + 1);
  const [manualDateWheelDay, setManualDateWheelDay] = useState(new Date().getDate());
  const manualDayWheelRef = useRef<ScrollView | null>(null);
  const manualMonthWheelRef = useRef<ScrollView | null>(null);
  const manualYearWheelRef = useRef<ScrollView | null>(null);
  const manualDateDayIndexRef = useRef(Math.max(0, manualDateWheelDay - 1));
  const manualDateMonthIndexRef = useRef(Math.max(0, manualDateWheelMonth - 1));
  const manualDateYearIndexRef = useRef(0);
  const [templateStartDateWheelVisible, setTemplateStartDateWheelVisible] = useState(false);
  const [templateStartDateWheelYear, setTemplateStartDateWheelYear] = useState(new Date().getFullYear());
  const [templateStartDateWheelMonth, setTemplateStartDateWheelMonth] = useState(new Date().getMonth() + 1);
  const [templateStartDateWheelDay, setTemplateStartDateWheelDay] = useState(new Date().getDate());
  const templateStartDayWheelRef = useRef<ScrollView | null>(null);
  const templateStartMonthWheelRef = useRef<ScrollView | null>(null);
  const templateStartYearWheelRef = useRef<ScrollView | null>(null);
  const templateStartDateDayIndexRef = useRef(Math.max(0, templateStartDateWheelDay - 1));
  const templateStartDateMonthIndexRef = useRef(Math.max(0, templateStartDateWheelMonth - 1));
  const templateStartDateYearIndexRef = useRef(0);
  const [templateEndDateWheelVisible, setTemplateEndDateWheelVisible] = useState(false);
  const [templateEndDateWheelYear, setTemplateEndDateWheelYear] = useState(new Date().getFullYear());
  const [templateEndDateWheelMonth, setTemplateEndDateWheelMonth] = useState(new Date().getMonth() + 1);
  const [templateEndDateWheelDay, setTemplateEndDateWheelDay] = useState(new Date().getDate());
  const templateEndDayWheelRef = useRef<ScrollView | null>(null);
  const templateEndMonthWheelRef = useRef<ScrollView | null>(null);
  const templateEndYearWheelRef = useRef<ScrollView | null>(null);
  const templateEndDateDayIndexRef = useRef(Math.max(0, templateEndDateWheelDay - 1));
  const templateEndDateMonthIndexRef = useRef(Math.max(0, templateEndDateWheelMonth - 1));
  const templateEndDateYearIndexRef = useRef(0);
  const activeModule = useMemo<TaskModuleKey>(() => {
    const raw = Array.isArray(params.module) ? params.module[0] : params.module;
    return isTaskModuleKey(raw) ? raw : "planned";
  }, [params.module]);
  const isPlannedModule = activeModule === "planned";
  const isScheduleModule = activeModule === "schedule";
  const isRoutinesModule = activeModule === "routines";
  const plannedWeekStart = useMemo(
    () => weekStartFromDateWithIsoDay(weekStart, plannedWeekStartDay),
    [plannedWeekStartDay, weekStart]
  );
  const standardWeekStart = useMemo(
    () => weekStartFromDate(weekStart),
    [weekStart]
  );
  const boardWeekStart = useMemo(
    () => (isPlannedModule ? plannedWeekStart : standardWeekStart),
    [isPlannedModule, plannedWeekStart, standardWeekStart]
  );
  const boardWeekStartIso = useMemo(
    () => toIsoDate(boardWeekStart),
    [boardWeekStart]
  );
  useEffect(() => {
    plannedWeekStartDayRef.current = plannedWeekStartDay;
  }, [plannedWeekStartDay]);
  const moduleTitle = useMemo(() => {
    if (isScheduleModule) return "Planifier une tâche ponctuelle";
    if (isRoutinesModule) return "Gérer les routines";
    return "Tâches planifiées";
  }, [isRoutinesModule, isScheduleModule]);
  const moduleSubtitle = useMemo(() => {
    if (isScheduleModule) return "Crée une tâche ponctuelle et attribue-la à un membre du foyer.";
    if (isRoutinesModule) return "Crée et modifie les routines réutilisables du foyer.";
    return "Suivi des tâches prévues et de leurs statuts.";
  }, [isRoutinesModule, isScheduleModule]);
  const activeWeekLabel = useMemo(() => weekLabelFromStart(plannedWeekStart), [plannedWeekStart]);
  const isCurrentWeek = useMemo(
    () => toIsoDate(plannedWeekStart) === toIsoDate(weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay)),
    [plannedWeekStart, plannedWeekStartDay]
  );

  const goToPreviousWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, -7));
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, 7));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setWeekStart(weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay));
  }, [plannedWeekStartDay]);
  const interHouseholdWeekStartIso = useMemo(
    () => weekStartIsoFromIsoDate(templateInterHouseholdWeekStart, plannedWeekStartDay),
    [plannedWeekStartDay, templateInterHouseholdWeekStart]
  );
  const interHouseholdWeekLabel = useMemo(
    () => weekLabelFromStart(parseIsoDate(interHouseholdWeekStartIso)),
    [interHouseholdWeekStartIso]
  );
  const goToPreviousInterHouseholdWeek = useCallback(() => {
    setTemplateInterHouseholdWeekStart((prev) => {
      const weekStart = parseIsoDate(weekStartIsoFromIsoDate(prev, plannedWeekStartDay));
      return toIsoDate(addDays(weekStart, -7));
    });
  }, [plannedWeekStartDay]);
  const goToNextInterHouseholdWeek = useCallback(() => {
    setTemplateInterHouseholdWeekStart((prev) => {
      const weekStart = parseIsoDate(weekStartIsoFromIsoDate(prev, plannedWeekStartDay));
      return toIsoDate(addDays(weekStart, 7));
    });
  }, [plannedWeekStartDay]);
  const goToCurrentInterHouseholdWeek = useCallback(() => {
    setTemplateInterHouseholdWeekStart(toIsoDate(weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay)));
  }, [plannedWeekStartDay]);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);
  }, []);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);
  const manualDayOptions = useMemo(() => {
    const maxDay = new Date(manualDateWheelYear, manualDateWheelMonth, 0).getDate();
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [manualDateWheelMonth, manualDateWheelYear]);
  const templateStartDayOptions = useMemo(() => {
    const maxDay = new Date(templateStartDateWheelYear, templateStartDateWheelMonth, 0).getDate();
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [templateStartDateWheelMonth, templateStartDateWheelYear]);
  const templateEndDayOptions = useMemo(() => {
    const maxDay = new Date(templateEndDateWheelYear, templateEndDateWheelMonth, 0).getDate();
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [templateEndDateWheelMonth, templateEndDateWheelYear]);
  const assignableMembers = useMemo(() => {
    if (currentUserRole === "parent") {
      return members;
    }
    if (currentUserId === null) {
      return [];
    }
    return members.filter((member) => member.id === currentUserId);
  }, [currentUserId, currentUserRole, members]);
  const memberNameById = useMemo(
    () => new Map(members.map((member) => [member.id, member.name])),
    [members],
  );
  const routinesTemplates = useMemo(
    () => templates.filter((template) => template.recurrence !== "once"),
    [templates]
  );
  const invalidateTaskCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    if (householdId !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.root(householdId) });
    }
  }, [householdId, queryClient]);
  const withOptimisticInstanceUpdate = useCallback(
    (instanceId: number, updater: (instance: TaskInstance) => TaskInstance) => {
      let rollbackSnapshot: TaskInstance[] | null = null;
      setInstances((prev) => {
        rollbackSnapshot = prev;
        return prev.map((instance) => (
          instance.id === instanceId ? updater(instance) : instance
        ));
      });

      return () => {
        if (rollbackSnapshot) {
          setInstances(rollbackSnapshot);
          return;
        }
        invalidateTaskCaches();
      };
    },
    [invalidateTaskCaches]
  );

  const toggleManualAssignee = useCallback((memberId: number) => {
    setSelectedAssigneeIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }, []);

  const toggleTemplateAssignee = useCallback((memberId: number) => {
    setTemplateAssigneeUserIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }, []);

  const toggleTemplateRotationMember = useCallback((memberId: number) => {
    setTemplateRotationUserIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }, []);

  const moveTemplateRotationMember = useCallback((memberId: number, direction: -1 | 1) => {
    setTemplateRotationUserIds((prev) => {
      const index = prev.indexOf(memberId);
      if (index < 0) {
        return prev;
      }
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const boardRangeToIso = useMemo(
    () => toIsoDate(addDays(boardWeekStart, 6)),
    [boardWeekStart]
  );
  const tasksBoardQueryKey = useMemo(
    () => ["tasks", "board", householdId ?? 0, boardWeekStartIso, boardRangeToIso] as const,
    [boardRangeToIso, boardWeekStartIso, householdId]
  );
  const refreshBoard = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: tasksBoardQueryKey });
  }, [queryClient, tasksBoardQueryKey]);

  const tasksBoardQuery = useQuery({
    queryKey: tasksBoardQueryKey,
    enabled: householdId !== null,
    queryFn: async () => {
      return (await apiFetch(`/tasks/board?from=${boardWeekStartIso}&to=${boardRangeToIso}`)) as BoardPayload;
    },
  });
  const loading = tasksBoardQuery.isLoading;

  useEffect(() => {
    const payload = tasksBoardQuery.data;
    if (!payload) {
      return;
    }

    setTasksEnabled(Boolean(payload?.tasks_enabled));
    const isAlternatingCustodyEnabled = Boolean(payload?.settings?.alternating_custody_enabled);
    const homeWeekStartIso = typeof payload?.settings?.custody_home_week_start === "string"
      ? payload.settings.custody_home_week_start
      : "";
    const homeWeekStartDay = isValidIsoDate(homeWeekStartIso)
      ? normalizeIsoWeekDay(isoWeekDayFromDate(parseIsoDate(homeWeekStartIso)), 1)
      : null;
    const nextPlannedWeekStartDay = isAlternatingCustodyEnabled
      ? (homeWeekStartDay ?? normalizeIsoWeekDay(payload?.settings?.custody_change_day, 1))
      : 1;
    if (plannedWeekStartDayRef.current !== nextPlannedWeekStartDay) {
      plannedWeekStartDayRef.current = nextPlannedWeekStartDay;
      setPlannedWeekStartDay(nextPlannedWeekStartDay);
    }
    setCanManageTemplates(Boolean(payload?.can_manage_templates));
    setCanManageInstances(Boolean(payload?.can_manage_instances));
    const payloadCurrentUserId = toPositiveInt(payload?.current_user?.id);
    const payloadCurrentRole = payload?.current_user?.role === "parent" ? "parent" : "enfant";
    setCurrentUserId(payloadCurrentUserId);
    setCurrentUserRole(payloadCurrentRole);
    setMembers(Array.isArray(payload?.members) ? payload.members : []);
    setTemplates(Array.isArray(payload?.templates) ? payload.templates : []);
    setInstances(Array.isArray(payload?.instances) ? payload.instances : []);
  }, [tasksBoardQuery.data]);

  useEffect(() => {
    if (!tasksBoardQuery.error) {
      return;
    }
    Alert.alert("Tâches", getApiErrorMessage(tasksBoardQuery.error, "Impossible de charger les tâches."));
  }, [tasksBoardQuery.error]);

  useFocusEffect(
    useCallback(() => {
      void refreshBoard();
    }, [refreshBoard])
  );

  useEffect(() => {
    if (!householdId) {
      return () => {};
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const setupRealtime = async () => {
      const unsubscribe = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "tasks") return;
        void refreshBoard();
      });

      if (!active) {
        unsubscribe();
        return;
      }

      unsubscribeRealtime = unsubscribe;
    };

    void setupRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [householdId, refreshBoard]);

  useEffect(() => {
    const parsedUserId = Number(currentUserId ?? 0);
    if (!Number.isFinite(parsedUserId) || parsedUserId <= 0) {
      return () => {};
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const setupRealtime = async () => {
      const unsubscribe = await subscribeToUserRealtime(parsedUserId, (message) => {
        if (!active) {
          return;
        }

        const module = String(message?.module ?? "");
        const type = String(message?.type ?? "");
        if (module !== "notifications" || type !== "task_reassignment_invite_responded") {
          return;
        }

        void refreshBoard();
      });

      if (!active) {
        unsubscribe();
        return;
      }

      unsubscribeRealtime = unsubscribe;
    };

    void setupRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [currentUserId, refreshBoard]);

  useEffect(() => {
    if (!isScheduleModule) {
      return;
    }

    if (currentUserRole !== "parent") {
      if (currentUserId !== null) {
        setSelectedAssigneeIds([currentUserId]);
      }
      return;
    }

    setSelectedAssigneeIds((prev) => prev.filter((id) => members.some((member) => member.id === id)));
  }, [currentUserId, currentUserRole, isScheduleModule, members]);

  useEffect(() => {
    const maxDay = manualDayOptions.length;
    setManualDateWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [manualDayOptions.length]);

  useEffect(() => {
    const maxDay = templateStartDayOptions.length;
    setTemplateStartDateWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [templateStartDayOptions.length]);

  useEffect(() => {
    const maxDay = templateEndDayOptions.length;
    setTemplateEndDateWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [templateEndDayOptions.length]);

  const openManualDateWheel = (target: "start" | "end") => {
    if (manualDateWheelVisible && manualDateWheelTarget === target) {
      setManualDateWheelVisible(false);
      return;
    }

    const sourceDate = parseIsoDate(target === "start" ? manualDate : manualEndDate);
    const safeDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
    const year = safeDate.getFullYear();
    const month = safeDate.getMonth() + 1;
    const day = safeDate.getDate();
    const yearIndex = Math.max(0, yearOptions.indexOf(year));
    const monthIndex = Math.max(0, monthOptions.indexOf(month));
    const dayIndex = Math.max(0, day - 1);

    setManualDateWheelYear(year);
    setManualDateWheelMonth(month);
    setManualDateWheelDay(day);
    setManualDateWheelTarget(target);
    manualDateYearIndexRef.current = yearIndex;
    manualDateMonthIndexRef.current = monthIndex;
    manualDateDayIndexRef.current = dayIndex;
    setTemplateStartDateWheelVisible(false);
    setTemplateEndDateWheelVisible(false);
    setManualDateWheelVisible(true);

    requestAnimationFrame(() => {
      manualYearWheelRef.current?.scrollTo({ y: yearIndex * WHEEL_ITEM_HEIGHT, animated: false });
      manualMonthWheelRef.current?.scrollTo({ y: monthIndex * WHEEL_ITEM_HEIGHT, animated: false });
      manualDayWheelRef.current?.scrollTo({ y: dayIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  };

  useEffect(() => {
    if (!manualDateWheelVisible) {
      return;
    }

    const maxDay = new Date(manualDateWheelYear, manualDateWheelMonth, 0).getDate();
    const normalizedDay = clamp(manualDateWheelDay, 1, maxDay);
    if (normalizedDay !== manualDateWheelDay) {
      setManualDateWheelDay(normalizedDay);
      return;
    }

    const nextIsoDate = `${manualDateWheelYear}-${pad(manualDateWheelMonth)}-${pad(normalizedDay)}`;
    if (manualDateWheelTarget === "start") {
      setManualDate(nextIsoDate);
      setManualEndDate((prev) => (prev < nextIsoDate ? nextIsoDate : prev));
      return;
    }

    setManualEndDate(nextIsoDate);
    setManualDate((prev) => (prev > nextIsoDate ? nextIsoDate : prev));
  }, [manualDateWheelDay, manualDateWheelMonth, manualDateWheelTarget, manualDateWheelVisible, manualDateWheelYear]);

  const openTemplateStartDateWheel = () => {
    if (templateStartDateWheelVisible) {
      setTemplateStartDateWheelVisible(false);
      return;
    }

    const sourceDate = parseIsoDate(templateStartDate);
    const safeDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
    const year = safeDate.getFullYear();
    const month = safeDate.getMonth() + 1;
    const day = safeDate.getDate();
    const yearIndex = Math.max(0, yearOptions.indexOf(year));
    const monthIndex = Math.max(0, monthOptions.indexOf(month));
    const dayIndex = Math.max(0, day - 1);

    setTemplateStartDateWheelYear(year);
    setTemplateStartDateWheelMonth(month);
    setTemplateStartDateWheelDay(day);
    templateStartDateYearIndexRef.current = yearIndex;
    templateStartDateMonthIndexRef.current = monthIndex;
    templateStartDateDayIndexRef.current = dayIndex;
    setManualDateWheelVisible(false);
    setTemplateEndDateWheelVisible(false);
    setTemplateStartDateWheelVisible(true);

    requestAnimationFrame(() => {
      templateStartYearWheelRef.current?.scrollTo({ y: yearIndex * WHEEL_ITEM_HEIGHT, animated: false });
      templateStartMonthWheelRef.current?.scrollTo({ y: monthIndex * WHEEL_ITEM_HEIGHT, animated: false });
      templateStartDayWheelRef.current?.scrollTo({ y: dayIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  };

  useEffect(() => {
    if (!templateStartDateWheelVisible) {
      return;
    }

    const maxDay = new Date(templateStartDateWheelYear, templateStartDateWheelMonth, 0).getDate();
    const normalizedDay = clamp(templateStartDateWheelDay, 1, maxDay);
    if (normalizedDay !== templateStartDateWheelDay) {
      setTemplateStartDateWheelDay(normalizedDay);
      return;
    }

    const nextIsoDate = `${templateStartDateWheelYear}-${pad(templateStartDateWheelMonth)}-${pad(normalizedDay)}`;
    setTemplateStartDate(nextIsoDate);
    if (templateHasEndDate) {
      setTemplateEndDate((prev) => (prev < nextIsoDate ? nextIsoDate : prev));
    }
  }, [templateHasEndDate, templateStartDateWheelDay, templateStartDateWheelMonth, templateStartDateWheelVisible, templateStartDateWheelYear]);

  const openTemplateEndDateWheel = () => {
    if (templateEndDateWheelVisible) {
      setTemplateEndDateWheelVisible(false);
      return;
    }

    const sourceDate = parseIsoDate(templateEndDate);
    const safeDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
    const year = safeDate.getFullYear();
    const month = safeDate.getMonth() + 1;
    const day = safeDate.getDate();
    const yearIndex = Math.max(0, yearOptions.indexOf(year));
    const monthIndex = Math.max(0, monthOptions.indexOf(month));
    const dayIndex = Math.max(0, day - 1);

    setTemplateEndDateWheelYear(year);
    setTemplateEndDateWheelMonth(month);
    setTemplateEndDateWheelDay(day);
    templateEndDateYearIndexRef.current = yearIndex;
    templateEndDateMonthIndexRef.current = monthIndex;
    templateEndDateDayIndexRef.current = dayIndex;
    setManualDateWheelVisible(false);
    setTemplateStartDateWheelVisible(false);
    setTemplateEndDateWheelVisible(true);

    requestAnimationFrame(() => {
      templateEndYearWheelRef.current?.scrollTo({ y: yearIndex * WHEEL_ITEM_HEIGHT, animated: false });
      templateEndMonthWheelRef.current?.scrollTo({ y: monthIndex * WHEEL_ITEM_HEIGHT, animated: false });
      templateEndDayWheelRef.current?.scrollTo({ y: dayIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  };

  useEffect(() => {
    if (!templateEndDateWheelVisible) {
      return;
    }

    const maxDay = new Date(templateEndDateWheelYear, templateEndDateWheelMonth, 0).getDate();
    const normalizedDay = clamp(templateEndDateWheelDay, 1, maxDay);
    if (normalizedDay !== templateEndDateWheelDay) {
      setTemplateEndDateWheelDay(normalizedDay);
      return;
    }

    const nextIsoDate = `${templateEndDateWheelYear}-${pad(templateEndDateWheelMonth)}-${pad(normalizedDay)}`;
    setTemplateEndDate(nextIsoDate < templateStartDate ? templateStartDate : nextIsoDate);
  }, [templateEndDateWheelDay, templateEndDateWheelMonth, templateEndDateWheelVisible, templateEndDateWheelYear, templateStartDate]);

  useEffect(() => {
    if (!templateHasEndDate) {
      return;
    }

    if (!isValidIsoDate(templateStartDate) || !isValidIsoDate(templateEndDate)) {
      return;
    }

    if (templateEndDate < templateStartDate) {
      setTemplateEndDate(templateStartDate);
    }
  }, [templateEndDate, templateHasEndDate, templateStartDate]);

  const visibleInstances = useMemo(() => {
    if (currentUserRole === "parent") {
      return instances;
    }

    if (currentUserId === null) {
      return [];
    }

    return instances.filter((instance) => isTaskInstanceAssignedToUser(instance, currentUserId));
  }, [currentUserId, currentUserRole, instances]);

  const groupedInstances = useMemo(() => {
    const buckets: Record<string, TaskInstance[]> = {};
    const sorted = [...visibleInstances].sort((left, right) => {
      if (left.due_date !== right.due_date) {
        return left.due_date.localeCompare(right.due_date);
      }
      if (left.status !== right.status) {
        const order = [STATUS_TODO, STATUS_DONE, STATUS_CANCELLED];
        return order.indexOf(left.status) - order.indexOf(right.status);
      }
      return left.title.localeCompare(right.title);
    });

    sorted.forEach((instance) => {
      if (!buckets[instance.due_date]) {
        buckets[instance.due_date] = [];
      }
      buckets[instance.due_date].push(instance);
    });

    return Object.entries(buckets);
  }, [visibleInstances]);

  const groupedInstanceSections = useMemo(
    () =>
      groupedInstances.map(([date, dayInstances]) => ({
        title: date,
        data: dayInstances,
      })),
    [groupedInstances]
  );

  const renderGroupedInstanceItem = useCallback(
    ({ item: instance }: { item: TaskInstance }) => (
      <View
        style={[styles.instanceCard, { borderColor: theme.icon, backgroundColor: theme.background }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: "700" }}>{instance.title}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            {(Array.isArray(instance.assignees) && instance.assignees.length > 0
              ? instance.assignees.map((assignee) => assignee.name).join(", ")
              : instance.assignee.name)}
            {instance.template.recurrence !== "once" ? ` - ${recurrenceLabel(instance.template.recurrence)}` : ""}
          </Text>
          {instance.description ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>{instance.description}</Text>
          ) : null}
        </View>

        <View style={styles.instanceActions}>
          <View style={[
            styles.statusBadge,
            instance.status === STATUS_TODO && { backgroundColor: "#F5A62322" },
            instance.status === STATUS_DONE && { backgroundColor: "#2ECC7126" },
            instance.status === STATUS_CANCELLED && { backgroundColor: "#CC4B4B22" },
          ]}>
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{instance.status}</Text>
          </View>

          <TouchableOpacity
            onPress={() => void toggleInstance(instance)}
            disabled={!instance.permissions.can_toggle || saving}
            style={[styles.iconBtn, { borderColor: theme.icon, opacity: instance.permissions.can_toggle ? 1 : 0.4 }]}
          >
            <MaterialCommunityIcons
              name={instance.status === STATUS_DONE ? "checkbox-marked-outline" : "checkbox-blank-outline"}
              size={20}
              color={theme.tint}
            />
          </TouchableOpacity>

          {(currentUserId !== null
            && (
              (Array.isArray(instance.assignees) && instance.assignees.some((assignee) => Number(assignee.id) === currentUserId))
              || (!Array.isArray(instance.assignees) && Number(instance.assignee.id) === currentUserId)
            )
            && members.some((member) => {
              if (Array.isArray(instance.assignees) && instance.assignees.length > 0) {
                return !instance.assignees.some((assignee) => Number(assignee.id) === Number(member.id));
              }
              return Number(member.id) !== Number(instance.assignee.id);
            })) ? (
            <TouchableOpacity
              onPress={() => requestInstanceReassignment(instance)}
              disabled={saving}
              style={[styles.iconBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="account-switch-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}

          {instance.permissions.can_validate ? (
            <TouchableOpacity
              onPress={() => void validateInstance(instance)}
              disabled={instance.validated_by_parent || saving}
              style={[styles.iconBtn, { borderColor: theme.icon, opacity: instance.validated_by_parent ? 0.4 : 1 }]}
            >
              <MaterialCommunityIcons
                name={instance.validated_by_parent ? "check-decagram" : "check-decagram-outline"}
                size={20}
                color={instance.validated_by_parent ? "#2ECC71" : theme.tint}
              />
            </TouchableOpacity>
          ) : null}

          {instance.permissions.can_cancel ? (
            <TouchableOpacity
              onPress={() => void toggleCancelled(instance)}
              disabled={saving}
              style={[styles.iconBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons
                name={instance.status === STATUS_CANCELLED ? "restore" : "cancel"}
                size={20}
                color={instance.status === STATUS_CANCELLED ? theme.tint : "#CC4B4B"}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    ),
    [currentUserId, members, theme.background, theme.icon, theme.text, theme.textSecondary, theme.tint]
  );

  const renderGroupedInstanceHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <Text style={[styles.dateTitle, { color: theme.textSecondary }]}>{formatDateLabel(section.title)}</Text>
    ),
    [theme.textSecondary]
  );

  const applyTemplateRecurrence = (recurrence: "daily" | "weekly" | "monthly" | "once") => {
    setTemplateRecurrence(recurrence);
    if (recurrence === "once") {
      setTemplateHasEndDate(false);
      setTemplateRecurrenceDays([]);
      setTemplateStartDateWheelVisible(false);
      setTemplateEndDateWheelVisible(false);
      return;
    }

    if (!isValidIsoDate(templateStartDate)) {
      setTemplateStartDate(todayIso);
    }
    if (recurrence === "daily") {
      setTemplateRecurrenceDays([1, 2, 3, 4, 5, 6, 7]);
      return;
    }
    if (recurrence === "weekly") {
      const normalized = normalizeRecurrenceDays(templateRecurrenceDays);
      const weeklyDays = normalized.length === 0 || normalized.length === 7
        ? [initialTemplateDay]
        : normalized;
      setTemplateRecurrenceDays(weeklyDays);
      return;
    }
    if (recurrence === "monthly") {
      setTemplateRecurrenceDays([]);
    }
  };

  const toggleTemplateRecurrenceDay = (dayValue: number) => {
    setTemplateRecurrenceDays((prev) => {
      const nextDays = prev.includes(dayValue)
        ? prev.filter((day) => day !== dayValue)
        : [...prev, dayValue].sort((a, b) => a - b);

      if (templateRecurrence === "daily" && nextDays.length < 7) {
        setTemplateRecurrence("weekly");
      }
      if (templateRecurrence === "weekly" && nextDays.length === 7) {
        setTemplateRecurrence("daily");
      }

      return nextDays;
    });
  };

  const toggleTemplateInterHouseholdAlternation = () => {
    setTemplateInterHouseholdAlternating((prev) => {
      const next = !prev;
      if (next) {
        setTemplateInterHouseholdWeekStart((current) => weekStartIsoFromIsoDate(current, plannedWeekStartDay));
      }
      return next;
    });
  };

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateRecurrence("weekly");
    setTemplateStartDate(todayIso);
    setTemplateHasEndDate(false);
    setTemplateEndDate(todayIso);
    setTemplateRecurrenceDays([initialTemplateDay]);
    setTemplateRotation(false);
    setTemplateRotationCycleWeeks(1);
    setTemplateAssigneeUserIds([]);
    setTemplateRotationUserIds([]);
    setTemplateInterHouseholdAlternating(false);
    setTemplateInterHouseholdWeekStart(toIsoDate(weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay)));
    setTemplateStartDateWheelVisible(false);
    setTemplateEndDateWheelVisible(false);
  };

  const startEditTemplate = (template: TaskTemplate) => {
    const normalizedDays = normalizeRecurrenceDays(template.recurrence_days);
    let nextDays = normalizedDays;
    if ((template.recurrence === "daily" || template.recurrence === "weekly") && normalizedDays.length === 0) {
      nextDays = template.recurrence === "daily" ? [1, 2, 3, 4, 5, 6, 7] : [initialTemplateDay];
    }
    const normalizedAssigneeIds = Array.isArray(template.assignee_user_ids)
      ? Array.from(new Set(template.assignee_user_ids.filter((id) => Number.isInteger(id) && id > 0)))
      : [];
    const normalizedRotationIds = Array.isArray(template.rotation_user_ids)
      ? Array.from(new Set(template.rotation_user_ids.filter((id) => Number.isInteger(id) && id > 0)))
      : [];
    const fallbackMemberIds = Number.isInteger(template.fixed_user_id ?? null) && Number(template.fixed_user_id) > 0
      ? [Number(template.fixed_user_id)]
      : [];
    const resolvedHasEndDate = isValidIsoDate(template.end_date ?? "");

    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description ?? "");
    setTemplateRecurrence(template.recurrence);
    setTemplateStartDate(isValidIsoDate(template.start_date ?? "") ? String(template.start_date) : todayIso);
    setTemplateHasEndDate(resolvedHasEndDate);
    setTemplateEndDate(resolvedHasEndDate ? String(template.end_date) : todayIso);
    setTemplateRecurrenceDays(nextDays);
    setTemplateRotation(Boolean(template.is_rotation));
    setTemplateRotationCycleWeeks(template.rotation_cycle_weeks === 2 ? 2 : 1);
    setTemplateAssigneeUserIds(template.is_rotation
      ? []
      : (normalizedAssigneeIds.length > 0 ? normalizedAssigneeIds : fallbackMemberIds));
    setTemplateRotationUserIds(template.is_rotation
      ? (normalizedRotationIds.length > 0 ? normalizedRotationIds : fallbackMemberIds)
      : []);
    setTemplateInterHouseholdAlternating(Boolean(template.is_inter_household_alternating));
    setTemplateInterHouseholdWeekStart(
      weekStartIsoFromIsoDate(
        typeof template.inter_household_week_start === "string" && template.inter_household_week_start.length > 0
          ? template.inter_household_week_start
          : toIsoDate(weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay)),
        plannedWeekStartDay
      ),
    );
    setTemplateStartDateWheelVisible(false);
    setTemplateEndDateWheelVisible(false);
  };

  const upsertTemplateMutation = useMutation({
    mutationFn: async (input: { templateId: number | null; payload: Record<string, unknown> }) => {
      if (input.templateId) {
        await apiFetch(`/tasks/templates/${input.templateId}`, {
          method: "PATCH",
          body: JSON.stringify(input.payload),
        });
        return;
      }
      await apiFetch("/tasks/templates", {
        method: "POST",
        body: JSON.stringify(input.payload),
      });
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      await apiFetch(`/tasks/templates/${templateId}`, { method: "DELETE" });
      return templateId;
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const createManualTaskMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string | null; due_date: string; end_date: string; user_ids: number[] }) => {
      await apiFetch("/tasks/instances", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const updateInstanceStatusMutation = useMutation({
    mutationFn: async (payload: { instanceId: number; status: string }) => {
      await apiFetch(`/tasks/instances/${payload.instanceId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: payload.status }),
      });
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const validateInstanceMutation = useMutation({
    mutationFn: async (instanceId: number) => {
      await apiFetch(`/tasks/instances/${instanceId}/validate`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const reassignmentRequestMutation = useMutation({
    mutationFn: async (payload: { instanceId: number; invitedUserId: number }) => {
      await apiFetch(`/tasks/instances/${payload.instanceId}/reassignment-request`, {
        method: "POST",
        body: JSON.stringify({ invited_user_id: payload.invitedUserId }),
      });
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const saving = upsertTemplateMutation.isPending
    || deleteTemplateMutation.isPending
    || createManualTaskMutation.isPending
    || updateInstanceStatusMutation.isPending
    || validateInstanceMutation.isPending
    || reassignmentRequestMutation.isPending;

  const saveTemplate = async () => {
    const cleanName = templateName.trim();
    if (cleanName.length < 2) {
      Alert.alert("Tâches", "Le nom de la routine est obligatoire.");
      return;
    }

    let recurrenceForPayload: "daily" | "weekly" | "monthly" | "once" = templateRecurrence;
    let normalizedDays = normalizeRecurrenceDays(templateRecurrenceDays);
    if (recurrenceForPayload === "daily") {
      normalizedDays = [1, 2, 3, 4, 5, 6, 7];
    }
    if (recurrenceForPayload === "weekly") {
      if (normalizedDays.length === 0) {
        Alert.alert("Tâches", "Choisis au moins un jour pour cette récurrence.");
        return;
      }
      if (normalizedDays.length === 7) {
        recurrenceForPayload = "daily";
        normalizedDays = [1, 2, 3, 4, 5, 6, 7];
      }
    }

    if (recurrenceForPayload !== "once" && !isValidIsoDate(templateStartDate)) {
      Alert.alert("Tâches", "La date de début est invalide (YYYY-MM-DD).");
      return;
    }

    let endDatePayload: string | null = null;
    if (recurrenceForPayload !== "once" && templateHasEndDate) {
      if (!isValidIsoDate(templateEndDate)) {
        Alert.alert("Tâches", "La date de fin est invalide (YYYY-MM-DD).");
        return;
      }
      if (templateEndDate < templateStartDate) {
        Alert.alert("Tâches", "La date de fin doit être postérieure ou égale à la date de début.");
        return;
      }
      endDatePayload = templateEndDate;
    }

    const normalizedAssigneeIds = Array.from(new Set(templateAssigneeUserIds.filter((id) => Number.isInteger(id) && id > 0)));
    const normalizedRotationIds = Array.from(new Set(templateRotationUserIds.filter((id) => Number.isInteger(id) && id > 0)));

    if (templateRotation) {
      if (normalizedRotationIds.length === 0) {
        Alert.alert("Tâches", "Choisis les membres concernés par la rotation.");
        return;
      }
    } else if (normalizedAssigneeIds.length === 0) {
      Alert.alert("Tâches", "Choisis au moins un membre pour l'attribution.");
      return;
    }

    try {
      const payload = {
        name: cleanName,
        description: templateDescription.trim() || null,
        recurrence: recurrenceForPayload,
        start_date: recurrenceForPayload === "once" ? null : templateStartDate,
        end_date: recurrenceForPayload === "once" ? null : endDatePayload,
        recurrence_days: recurrenceForPayload === "daily" || recurrenceForPayload === "weekly" ? normalizedDays : [],
        assignee_user_ids: templateRotation ? [] : normalizedAssigneeIds,
        rotation_user_ids: templateRotation ? normalizedRotationIds : [],
        is_rotation: templateRotation,
        rotation_cycle_weeks: templateRotation ? templateRotationCycleWeeks : 1,
        is_inter_household_alternating: templateInterHouseholdAlternating,
        inter_household_week_start: templateInterHouseholdAlternating ? interHouseholdWeekStartIso : null,
        fixed_user_id: null,
      };

      await upsertTemplateMutation.mutateAsync({
        templateId: editingTemplateId,
        payload,
      });

      resetTemplateForm();
      await refreshBoard();
    } catch (error: any) {
      Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de sauvegarder cette routine."));
    }
  };
  const deleteTemplate = async (template: TaskTemplate) => {
    Alert.alert(
      "Supprimer la routine",
      `Supprimer "${template.name}" ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTemplateMutation.mutateAsync(template.id);
              if (editingTemplateId === template.id) {
                resetTemplateForm();
              }
              await refreshBoard();
            } catch (error: any) {
              Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de supprimer cette routine."));
            }
          },
        },
      ]
    );
  };

  const createManualTask = async () => {
    const cleanTitle = manualTitle.trim();
    if (cleanTitle.length < 2) {
      Alert.alert("Tâches", "Le nom de la tâche est obligatoire.");
      return;
    }
    if (!isValidIsoDate(manualDate)) {
      Alert.alert("Tâches", "La date de la tâche est invalide (YYYY-MM-DD).");
      return;
    }
    if (!isValidIsoDate(manualEndDate)) {
      Alert.alert("Tâches", "La date de fin est invalide (YYYY-MM-DD).");
      return;
    }
    if (manualEndDate < manualDate) {
      Alert.alert("Tâches", "La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }

    const assigneeIds = currentUserRole === "parent"
      ? Array.from(new Set(selectedAssigneeIds.filter((id) => Number.isInteger(id) && id > 0)))
      : (currentUserId !== null ? [currentUserId] : []);
    if (assigneeIds.length === 0) {
      Alert.alert("Tâches", "Choisis au moins un membre du foyer.");
      return;
    }

    try {
      await createManualTaskMutation.mutateAsync({
        name: cleanTitle,
        description: manualDescription.trim() || null,
        due_date: manualDate,
        end_date: manualEndDate,
        user_ids: assigneeIds,
      });
      setManualTitle("");
      setManualDescription("");
      setManualDate(todayIso);
      setManualEndDate(todayIso);
      setManualDateWheelVisible(false);
      if (currentUserRole === "parent") {
        setSelectedAssigneeIds([]);
      } else if (currentUserId !== null) {
        setSelectedAssigneeIds([currentUserId]);
      }
      await refreshBoard();
    } catch (error: any) {
      Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de créer cette tâche."));
    }
  };
  const toggleInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_toggle) {
      return;
    }

    const nextStatus = instance.status === STATUS_DONE ? STATUS_TODO : STATUS_DONE;
    const rollback = withOptimisticInstanceUpdate(instance.id, (current) => ({
      ...current,
      status: nextStatus,
      completed_at: nextStatus === STATUS_DONE ? new Date().toISOString() : null,
      validated_by_parent: nextStatus === STATUS_TODO ? false : current.validated_by_parent,
    }));

    try {
      await updateInstanceStatusMutation.mutateAsync({
        instanceId: instance.id,
        status: nextStatus,
      });
    } catch (error: any) {
      rollback();
      Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de mettre à jour le statut."));
    }
  };

  const toggleCancelled = async (instance: TaskInstance) => {
    if (!instance.permissions.can_cancel) {
      return;
    }

    const nextStatus = instance.status === STATUS_CANCELLED ? STATUS_TODO : STATUS_CANCELLED;
    const rollback = withOptimisticInstanceUpdate(instance.id, (current) => ({
      ...current,
      status: nextStatus,
      completed_at: nextStatus === STATUS_CANCELLED ? null : current.completed_at,
      validated_by_parent: nextStatus === STATUS_CANCELLED ? false : current.validated_by_parent,
    }));

    try {
      await updateInstanceStatusMutation.mutateAsync({
        instanceId: instance.id,
        status: nextStatus,
      });
    } catch (error: any) {
      rollback();
      Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de modifier cette tâche."));
    }
  };

  const validateInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_validate || instance.validated_by_parent) {
      return;
    }
    const rollback = withOptimisticInstanceUpdate(instance.id, (current) => ({
      ...current,
      validated_by_parent: true,
    }));

    try {
      await validateInstanceMutation.mutateAsync(instance.id);
    } catch (error: any) {
      rollback();
      Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de valider cette tâche."));
    }
  };

  const sendReassignmentRequest = async (instance: TaskInstance, invitedUserId: number) => {
    try {
      await reassignmentRequestMutation.mutateAsync({
        instanceId: instance.id,
        invitedUserId,
      });
      Alert.alert("Tâches", "Demande envoyée.");
      await refreshBoard();
    } catch (error: any) {
      Alert.alert("Tâches", getApiErrorMessage(error, "Impossible d'envoyer la demande."));
    }
  };
  const requestInstanceReassignment = (instance: TaskInstance) => {
    if (currentUserId === null) {
      return;
    }

    const assigneeIds = Array.isArray(instance.assignees) && instance.assignees.length > 0
      ? instance.assignees.map((assignee) => Number(assignee.id))
      : [Number(instance.assignee.id)];
    if (!assigneeIds.includes(currentUserId)) {
      return;
    }

    const availableMembers = members.filter((member) => !assigneeIds.includes(member.id));
    if (availableMembers.length === 0) {
      Alert.alert("Tâches", "Aucun autre membre disponible pour une reprise.");
      return;
    }

    const options = availableMembers.slice(0, 6).map((member) => ({
      text: member.name,
      onPress: () => {
        void sendReassignmentRequest(instance, member.id);
      },
    }));

    Alert.alert(
      "Demander une reprise",
      "Qui peut reprendre cette tâche ?",
      [
        ...options,
        { text: "Annuler", style: "cancel" },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]} style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.header, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12), backgroundColor: theme.background }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/tasks")}
            style={[styles.settingsBtn, { borderColor: theme.icon }]}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{moduleTitle}</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {moduleSubtitle}
            </Text>
          </View>
          {currentUserRole === "parent" ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
              style={[styles.settingsBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {!tasksEnabled ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Module désactivé</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
            Active le module tâches dans la configuration du foyer pour commencer.
          </Text>
          {currentUserRole === "parent" ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
              style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
            >
              <Text style={styles.primaryBtnText}>Configurer le foyer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          {isPlannedModule ? (
            <View style={[styles.weekCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
              <View style={styles.weekRow}>
                <TouchableOpacity
                  onPress={goToPreviousWeek}
                  style={[styles.weekArrowBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color={theme.tint} />
                </TouchableOpacity>

                <View style={styles.weekCenter}>
                  <Text style={[styles.weekTitle, { color: theme.text }]}>{activeWeekLabel}</Text>
                </View>

                <TouchableOpacity
                  onPress={goToNextWeek}
                  style={[styles.weekArrowBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                >
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.tint} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={goToCurrentWeek}
                disabled={isCurrentWeek}
                style={[
                  styles.weekCurrentBtn,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  isCurrentWeek && { opacity: 0.55 },
                ]}
              >
                <Text style={[styles.weekCurrentBtnText, { color: isCurrentWeek ? theme.textSecondary : theme.tint }]}>
                  Revenir à cette semaine
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {isRoutinesModule && !canManageTemplates ? (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Gérer les routines</Text>
              <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
                Cette section est réservée aux parents du foyer.
              </Text>
            </View>
          ) : null}

          {isRoutinesModule && canManageTemplates ? (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Gérer les routines</Text>

              {routinesTemplates.length > 0 ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {routinesTemplates.map((template) => (
                    <View key={`template-${template.id}`} style={[styles.templateRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: "700" }}>{template.name}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {recurrenceLabel(template.recurrence)}
                          {template.is_rotation
                            ? ` - Rotation ${template.rotation_cycle_weeks === 2 ? "bihebdo" : "hebdo"}`
                            : ""}
                        </Text>
                        {recurrenceDaysLabel(template.recurrence, template.recurrence_days) ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {recurrenceDaysLabel(template.recurrence, template.recurrence_days)}
                          </Text>
                        ) : null}
                        {template.is_rotation && Array.isArray(template.rotation_user_ids) && template.rotation_user_ids.length > 0 ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {`Ordre: ${template.rotation_user_ids
                              .map((id) => memberNameById.get(id) ?? `#${id}`)
                              .join("  ->  ")}`}
                          </Text>
                        ) : null}
                        {!template.is_rotation && Array.isArray(template.assignee_user_ids) && template.assignee_user_ids.length > 0 ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {`Attribué à: ${template.assignee_user_ids
                              .map((id) => memberNameById.get(id) ?? `#${id}`)
                              .join(", ")}`}
                          </Text>
                        ) : null}
                        {template.recurrence !== "once" && isValidIsoDate(template.start_date ?? "") ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {`Début: ${template.start_date}`}
                          </Text>
                        ) : null}
                        {template.recurrence !== "once" && isValidIsoDate(template.end_date ?? "") ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {`Fin: ${template.end_date}`}
                          </Text>
                        ) : null}
                        {template.is_inter_household_alternating ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {`Alternance inter-foyer: ${weekLabelFromStart(parseIsoDate(weekStartIsoFromIsoDate(template.inter_household_week_start ?? "", plannedWeekStartDay)))}`}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => startEditTemplate(template)}
                        style={[styles.iconBtn, { borderColor: theme.icon }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.tint} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void deleteTemplate(template)}
                        style={[styles.iconBtn, { borderColor: theme.icon }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={20} color="#CC4B4B" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Aucune routine pour le moment.</Text>
              )}

              {isRoutinesModule ? (
                <>
                  <Text style={[styles.cardSubtitle, { color: theme.text, marginTop: 14 }]}>
                    {editingTemplateId ? "Modifier la routine" : "Nouvelle routine"}
                  </Text>

                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={templateName}
                    onChangeText={setTemplateName}
                    placeholder="Nom de la routine"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={templateDescription}
                    onChangeText={setTemplateDescription}
                    placeholder="Description (optionnel)"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <View style={styles.recurrenceRow}>
                    {(["daily", "weekly", "monthly"] as const).map((recurrence) => (
                      <TouchableOpacity
                        key={recurrence}
                        onPress={() => applyTemplateRecurrence(recurrence)}
                        style={[
                          styles.recurrenceChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateRecurrence === recurrence && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                        ]}
                      >
                        <Text style={{ color: theme.text, fontSize: 12 }}>{recurrenceLabel(recurrence)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {(templateRecurrence === "daily" || templateRecurrence === "weekly") ? (
                    <>
                      <Text style={[styles.label, { color: theme.text }]}>Jours d&apos;exécution</Text>
                      <View style={styles.recurrenceRow}>
                        {WEEK_DAYS.map((day) => {
                          const selected = templateRecurrenceDays.includes(day.value);
                          return (
                            <TouchableOpacity
                              key={`day-${day.value}`}
                              onPress={() => toggleTemplateRecurrenceDay(day.value)}
                              style={[
                                styles.recurrenceChip,
                                { borderColor: theme.icon, backgroundColor: theme.background },
                                selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                              ]}
                            >
                              <Text style={{ color: theme.text, fontSize: 12 }}>{day.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  ) : null}

                  {templateRecurrence !== "once" ? (
                    <>
                      <Text style={[styles.label, { color: theme.text }]}>Date de début</Text>
                      <TouchableOpacity
                        onPress={openTemplateStartDateWheel}
                        style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                        <Text style={[styles.pickerFieldText, { color: theme.text }]}>{templateStartDate}</Text>
                      </TouchableOpacity>

                      {templateStartDateWheelVisible ? (
                        <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                          <Text style={[styles.label, { color: theme.text }]}>Choisir la date de début</Text>

                          <View style={styles.wheelRow}>
                            <View style={styles.wheelColumn}>
                              <ScrollView keyboardShouldPersistTaps="handled"
                                ref={templateStartDayWheelRef}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                                snapToInterval={WHEEL_ITEM_HEIGHT}
                                decelerationRate="fast"
                                scrollEventThrottle={32}
                                contentContainerStyle={styles.wheelContentContainer}
                                onScroll={(event) => {
                                  const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, templateStartDayOptions.length);
                                  if (index === templateStartDateDayIndexRef.current) {
                                    return;
                                  }
                                  templateStartDateDayIndexRef.current = index;
                                  setTemplateStartDateWheelDay(templateStartDayOptions[index]);
                                }}
                              >
                                {templateStartDayOptions.map((value) => (
                                  <View key={`template-start-wheel-day-${value}`} style={styles.wheelItem}>
                                    <Text
                                      style={[
                                        styles.wheelItemText,
                                        { color: templateStartDateWheelDay === value ? theme.text : theme.textSecondary },
                                        templateStartDateWheelDay === value && styles.wheelItemTextSelected,
                                      ]}
                                    >
                                      {`${weekDayShortLabel(templateStartDateWheelYear, templateStartDateWheelMonth, value)} ${pad(value)}`}
                                    </Text>
                                  </View>
                                ))}
                              </ScrollView>
                              <View
                                pointerEvents="none"
                                style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                              />
                            </View>

                            <View style={styles.wheelColumn}>
                              <ScrollView keyboardShouldPersistTaps="handled"
                                ref={templateStartMonthWheelRef}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                                snapToInterval={WHEEL_ITEM_HEIGHT}
                                decelerationRate="fast"
                                scrollEventThrottle={32}
                                contentContainerStyle={styles.wheelContentContainer}
                                onScroll={(event) => {
                                  const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, monthOptions.length);
                                  if (index === templateStartDateMonthIndexRef.current) {
                                    return;
                                  }
                                  templateStartDateMonthIndexRef.current = index;
                                  setTemplateStartDateWheelMonth(monthOptions[index]);
                                }}
                              >
                                {monthOptions.map((value) => (
                                  <View key={`template-start-wheel-month-${value}`} style={styles.wheelItem}>
                                    <Text
                                      style={[
                                        styles.wheelItemText,
                                        { color: templateStartDateWheelMonth === value ? theme.text : theme.textSecondary },
                                        templateStartDateWheelMonth === value && styles.wheelItemTextSelected,
                                      ]}
                                    >
                                      {MONTH_LABELS[value - 1]}
                                    </Text>
                                  </View>
                                ))}
                              </ScrollView>
                              <View
                                pointerEvents="none"
                                style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                              />
                            </View>

                            <View style={styles.wheelColumn}>
                              <ScrollView keyboardShouldPersistTaps="handled"
                                ref={templateStartYearWheelRef}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                                snapToInterval={WHEEL_ITEM_HEIGHT}
                                decelerationRate="fast"
                                scrollEventThrottle={32}
                                contentContainerStyle={styles.wheelContentContainer}
                                onScroll={(event) => {
                                  const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, yearOptions.length);
                                  if (index === templateStartDateYearIndexRef.current) {
                                    return;
                                  }
                                  templateStartDateYearIndexRef.current = index;
                                  setTemplateStartDateWheelYear(yearOptions[index]);
                                }}
                              >
                                {yearOptions.map((value) => (
                                  <View key={`template-start-wheel-year-${value}`} style={styles.wheelItem}>
                                    <Text
                                      style={[
                                        styles.wheelItemText,
                                        { color: templateStartDateWheelYear === value ? theme.text : theme.textSecondary },
                                        templateStartDateWheelYear === value && styles.wheelItemTextSelected,
                                      ]}
                                    >
                                      {value}
                                    </Text>
                                  </View>
                                ))}
                              </ScrollView>
                              <View
                                pointerEvents="none"
                                style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                              />
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {templateRecurrence !== "once" ? (
                    <>
                      <View style={styles.toggleRow}>
                        <Text style={{ color: theme.text, fontWeight: "600" }}>Date de fin</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setTemplateHasEndDate((prev) => {
                              const next = !prev;
                              if (!next) {
                                setTemplateEndDateWheelVisible(false);
                              } else {
                                const fallbackStartDate = isValidIsoDate(templateStartDate) ? templateStartDate : todayIso;
                                setTemplateEndDate((current) => {
                                  if (!isValidIsoDate(current) || current < fallbackStartDate) {
                                    return fallbackStartDate;
                                  }
                                  return current;
                                });
                              }
                              return next;
                            });
                          }}
                          style={[
                            styles.switchPill,
                            { borderColor: theme.icon, backgroundColor: templateHasEndDate ? `${theme.tint}30` : theme.background },
                          ]}
                        >
                          <Text style={{ color: templateHasEndDate ? theme.tint : theme.textSecondary }}>
                            {templateHasEndDate ? "Définie" : "Aucune"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {templateHasEndDate ? (
                        <>
                          <TouchableOpacity
                            onPress={openTemplateEndDateWheel}
                            style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                            disabled={saving}
                          >
                            <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                            <Text style={[styles.pickerFieldText, { color: theme.text }]}>{templateEndDate}</Text>
                          </TouchableOpacity>

                          {templateEndDateWheelVisible ? (
                            <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                              <Text style={[styles.label, { color: theme.text }]}>Choisir la date de fin</Text>

                              <View style={styles.wheelRow}>
                                <View style={styles.wheelColumn}>
                                  <ScrollView keyboardShouldPersistTaps="handled"
                                    ref={templateEndDayWheelRef}
                                    nestedScrollEnabled
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={WHEEL_ITEM_HEIGHT}
                                    decelerationRate="fast"
                                    scrollEventThrottle={32}
                                    contentContainerStyle={styles.wheelContentContainer}
                                    onScroll={(event) => {
                                      const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, templateEndDayOptions.length);
                                      if (index === templateEndDateDayIndexRef.current) {
                                        return;
                                      }
                                      templateEndDateDayIndexRef.current = index;
                                      setTemplateEndDateWheelDay(templateEndDayOptions[index]);
                                    }}
                                  >
                                    {templateEndDayOptions.map((value) => (
                                      <View key={`template-end-wheel-day-${value}`} style={styles.wheelItem}>
                                        <Text
                                          style={[
                                            styles.wheelItemText,
                                            { color: templateEndDateWheelDay === value ? theme.text : theme.textSecondary },
                                            templateEndDateWheelDay === value && styles.wheelItemTextSelected,
                                          ]}
                                        >
                                          {`${weekDayShortLabel(templateEndDateWheelYear, templateEndDateWheelMonth, value)} ${pad(value)}`}
                                        </Text>
                                      </View>
                                    ))}
                                  </ScrollView>
                                  <View
                                    pointerEvents="none"
                                    style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                                  />
                                </View>

                                <View style={styles.wheelColumn}>
                                  <ScrollView keyboardShouldPersistTaps="handled"
                                    ref={templateEndMonthWheelRef}
                                    nestedScrollEnabled
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={WHEEL_ITEM_HEIGHT}
                                    decelerationRate="fast"
                                    scrollEventThrottle={32}
                                    contentContainerStyle={styles.wheelContentContainer}
                                    onScroll={(event) => {
                                      const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, monthOptions.length);
                                      if (index === templateEndDateMonthIndexRef.current) {
                                        return;
                                      }
                                      templateEndDateMonthIndexRef.current = index;
                                      setTemplateEndDateWheelMonth(monthOptions[index]);
                                    }}
                                  >
                                    {monthOptions.map((value) => (
                                      <View key={`template-end-wheel-month-${value}`} style={styles.wheelItem}>
                                        <Text
                                          style={[
                                            styles.wheelItemText,
                                            { color: templateEndDateWheelMonth === value ? theme.text : theme.textSecondary },
                                            templateEndDateWheelMonth === value && styles.wheelItemTextSelected,
                                          ]}
                                        >
                                          {MONTH_LABELS[value - 1]}
                                        </Text>
                                      </View>
                                    ))}
                                  </ScrollView>
                                  <View
                                    pointerEvents="none"
                                    style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                                  />
                                </View>

                                <View style={styles.wheelColumn}>
                                  <ScrollView keyboardShouldPersistTaps="handled"
                                    ref={templateEndYearWheelRef}
                                    nestedScrollEnabled
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={WHEEL_ITEM_HEIGHT}
                                    decelerationRate="fast"
                                    scrollEventThrottle={32}
                                    contentContainerStyle={styles.wheelContentContainer}
                                    onScroll={(event) => {
                                      const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, yearOptions.length);
                                      if (index === templateEndDateYearIndexRef.current) {
                                        return;
                                      }
                                      templateEndDateYearIndexRef.current = index;
                                      setTemplateEndDateWheelYear(yearOptions[index]);
                                    }}
                                  >
                                    {yearOptions.map((value) => (
                                      <View key={`template-end-wheel-year-${value}`} style={styles.wheelItem}>
                                        <Text
                                          style={[
                                            styles.wheelItemText,
                                            { color: templateEndDateWheelYear === value ? theme.text : theme.textSecondary },
                                            templateEndDateWheelYear === value && styles.wheelItemTextSelected,
                                          ]}
                                        >
                                          {value}
                                        </Text>
                                      </View>
                                    ))}
                                  </ScrollView>
                                  <View
                                    pointerEvents="none"
                                    style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                                  />
                                </View>
                              </View>
                            </View>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}

                  <View style={styles.toggleRow}>
                    <Text style={{ color: theme.text, fontWeight: "600" }}>Rotation</Text>
                    <TouchableOpacity
                      onPress={() => setTemplateRotation((prev) => !prev)}
                      style={[
                        styles.switchPill,
                        { borderColor: theme.icon, backgroundColor: templateRotation ? `${theme.tint}30` : theme.background },
                      ]}
                    >
                      <Text style={{ color: templateRotation ? theme.tint : theme.textSecondary }}>
                        {templateRotation ? "Active" : "Inactive"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {templateRotation ? (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Cadence de rotation</Text>
                  <View style={styles.recurrenceRow}>
                    {[1, 2].map((cycleWeeks) => (
                      <TouchableOpacity
                        key={`cycle-${cycleWeeks}`}
                        onPress={() => setTemplateRotationCycleWeeks(cycleWeeks as 1 | 2)}
                        style={[
                          styles.recurrenceChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateRotationCycleWeeks === cycleWeeks && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                        ]}
                      >
                        <Text style={{ color: theme.text, fontSize: 12 }}>
                          {cycleWeeks === 1 ? "Chaque semaine" : "Toutes les 2 semaines"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { color: theme.text }]}>Membres concernés</Text>
                  <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                    {members.map((member) => {
                      const selected = templateRotationUserIds.includes(member.id);
                      return (
                        <TouchableOpacity
                          key={`rotation-member-${member.id}`}
                          onPress={() => toggleTemplateRotationMember(member.id)}
                          style={[
                            styles.memberChip,
                            { borderColor: theme.icon, backgroundColor: theme.background },
                            selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                          ]}
                        >
                          <Text style={{ color: theme.text }}>{member.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {templateRotationUserIds.length > 0 ? (
                    <View style={styles.rotationOrderList}>
                      <Text style={[styles.label, { color: theme.text }]}>Ordre de rotation</Text>
                      {templateRotationUserIds.map((memberId, index) => {
                        const member = members.find((candidate) => candidate.id === memberId);
                        if (!member) {
                          return null;
                        }

                        return (
                          <View
                            key={`rotation-order-${memberId}`}
                            style={[styles.rotationOrderItem, { borderColor: theme.icon, backgroundColor: theme.background }]}
                          >
                            <Text style={[styles.rotationOrderName, { color: theme.text }]}>{`${index + 1}. ${member.name}`}</Text>
                            <View style={styles.rotationOrderActions}>
                              <TouchableOpacity
                                onPress={() => moveTemplateRotationMember(memberId, -1)}
                                style={[styles.iconBtn, { borderColor: theme.icon, opacity: index === 0 ? 0.35 : 1 }]}
                                disabled={index === 0}
                              >
                                <MaterialCommunityIcons name="arrow-up" size={18} color={theme.tint} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => moveTemplateRotationMember(memberId, 1)}
                                style={[styles.iconBtn, { borderColor: theme.icon, opacity: index === templateRotationUserIds.length - 1 ? 0.35 : 1 }]}
                                disabled={index === templateRotationUserIds.length - 1}
                              >
                                <MaterialCommunityIcons name="arrow-down" size={18} color={theme.tint} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </>
                  ) : (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
                  <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                    {members.map((member) => (
                      <TouchableOpacity
                        key={`fixed-${member.id}`}
                        onPress={() => toggleTemplateAssignee(member.id)}
                        style={[
                          styles.memberChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateAssigneeUserIds.includes(member.id) && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                        ]}
                      >
                        <Text style={{ color: theme.text }}>{member.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
                  )}

                  <View style={styles.toggleRow}>
                    <Text style={{ color: theme.text, fontWeight: "600" }}>Alternance inter-foyer</Text>
                    <TouchableOpacity
                      onPress={toggleTemplateInterHouseholdAlternation}
                      style={[
                        styles.switchPill,
                        {
                          borderColor: theme.icon,
                          backgroundColor: templateInterHouseholdAlternating ? `${theme.tint}30` : theme.background,
                        },
                      ]}
                    >
                      <Text style={{ color: templateInterHouseholdAlternating ? theme.tint : theme.textSecondary }}>
                        {templateInterHouseholdAlternating ? "Active" : "Inactive"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {templateInterHouseholdAlternating ? (
                    <View style={[styles.weekCard, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                      <Text style={[styles.label, { color: theme.text }]}>Début de semaine à la maison</Text>
                      <View style={styles.weekRow}>
                        <TouchableOpacity
                          onPress={goToPreviousInterHouseholdWeek}
                          style={[styles.weekArrowBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                          disabled={saving}
                        >
                          <MaterialCommunityIcons name="chevron-left" size={20} color={theme.tint} />
                        </TouchableOpacity>

                        <View style={styles.weekCenter}>
                          <Text style={[styles.weekTitle, { color: theme.text }]}>{interHouseholdWeekLabel}</Text>
                          <Text style={[styles.weekRange, { color: theme.textSecondary }]}>
                            {`Référence: ${interHouseholdWeekStartIso}`}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={goToNextInterHouseholdWeek}
                          style={[styles.weekArrowBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                          disabled={saving}
                        >
                          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.tint} />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        onPress={goToCurrentInterHouseholdWeek}
                        style={[styles.weekCurrentBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                        disabled={saving}
                      >
                        <Text style={[styles.weekCurrentBtnText, { color: theme.tint }]}>Revenir à cette semaine</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {editingTemplateId ? (
                    <TouchableOpacity
                      onPress={resetTemplateForm}
                      style={[styles.iconBtn, { borderColor: theme.icon, alignSelf: "flex-end", marginBottom: 6 }]}
                      disabled={saving}
                    >
                      <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => void saveTemplate()}
                    style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {editingTemplateId ? "Enregistrer la routine" : "Ajouter la routine"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          ) : null}

          {isScheduleModule && canManageInstances ? (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Planifier une tâche ponctuelle</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={manualTitle}
                onChangeText={setManualTitle}
                placeholder="Nom de la tâche"
                placeholderTextColor={theme.textSecondary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                value={manualDescription}
                onChangeText={setManualDescription}
                placeholder="Description (optionnel)"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.label, { color: theme.text }]}>Date de début</Text>
              <TouchableOpacity
                onPress={() => openManualDateWheel("start")}
                style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                disabled={saving}
              >
                <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.pickerFieldText, { color: theme.text }]}>{manualDate}</Text>
              </TouchableOpacity>

              <Text style={[styles.label, { color: theme.text }]}>Date de fin</Text>
              <TouchableOpacity
                onPress={() => openManualDateWheel("end")}
                style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                disabled={saving}
              >
                <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.pickerFieldText, { color: theme.text }]}>{manualEndDate}</Text>
              </TouchableOpacity>

              {manualDateWheelVisible ? (
                <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    {manualDateWheelTarget === "start" ? "Choisir la date de début" : "Choisir la date de fin"}
                  </Text>

                  <View style={styles.wheelRow}>
                    <View style={styles.wheelColumn}>
                      <ScrollView keyboardShouldPersistTaps="handled"
                        ref={manualDayWheelRef}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        snapToInterval={WHEEL_ITEM_HEIGHT}
                        decelerationRate="fast"
                        scrollEventThrottle={32}
                        contentContainerStyle={styles.wheelContentContainer}
                        onScroll={(event) => {
                          const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, manualDayOptions.length);
                          if (index === manualDateDayIndexRef.current) {
                            return;
                          }
                          manualDateDayIndexRef.current = index;
                          setManualDateWheelDay(manualDayOptions[index]);
                        }}
                      >
                        {manualDayOptions.map((value) => (
                          <View key={`manual-wheel-day-${value}`} style={styles.wheelItem}>
                            <Text
                              style={[
                                styles.wheelItemText,
                                { color: manualDateWheelDay === value ? theme.text : theme.textSecondary },
                                manualDateWheelDay === value && styles.wheelItemTextSelected,
                              ]}
                            >
                              {`${weekDayShortLabel(manualDateWheelYear, manualDateWheelMonth, value)} ${pad(value)}`}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                      <View
                        pointerEvents="none"
                        style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                      />
                    </View>

                    <View style={styles.wheelColumn}>
                      <ScrollView keyboardShouldPersistTaps="handled"
                        ref={manualMonthWheelRef}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        snapToInterval={WHEEL_ITEM_HEIGHT}
                        decelerationRate="fast"
                        scrollEventThrottle={32}
                        contentContainerStyle={styles.wheelContentContainer}
                        onScroll={(event) => {
                          const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, monthOptions.length);
                          if (index === manualDateMonthIndexRef.current) {
                            return;
                          }
                          manualDateMonthIndexRef.current = index;
                          setManualDateWheelMonth(monthOptions[index]);
                        }}
                      >
                        {monthOptions.map((value) => (
                          <View key={`manual-wheel-month-${value}`} style={styles.wheelItem}>
                            <Text
                              style={[
                                styles.wheelItemText,
                                { color: manualDateWheelMonth === value ? theme.text : theme.textSecondary },
                                manualDateWheelMonth === value && styles.wheelItemTextSelected,
                              ]}
                            >
                              {MONTH_LABELS[value - 1]}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                      <View
                        pointerEvents="none"
                        style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                      />
                    </View>

                    <View style={styles.wheelColumn}>
                      <ScrollView keyboardShouldPersistTaps="handled"
                        ref={manualYearWheelRef}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        snapToInterval={WHEEL_ITEM_HEIGHT}
                        decelerationRate="fast"
                        scrollEventThrottle={32}
                        contentContainerStyle={styles.wheelContentContainer}
                        onScroll={(event) => {
                          const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, yearOptions.length);
                          if (index === manualDateYearIndexRef.current) {
                            return;
                          }
                          manualDateYearIndexRef.current = index;
                          setManualDateWheelYear(yearOptions[index]);
                        }}
                      >
                        {yearOptions.map((value) => (
                          <View key={`manual-wheel-year-${value}`} style={styles.wheelItem}>
                            <Text
                              style={[
                                styles.wheelItemText,
                                { color: manualDateWheelYear === value ? theme.text : theme.textSecondary },
                                manualDateWheelYear === value && styles.wheelItemTextSelected,
                              ]}
                            >
                              {value}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                      <View
                        pointerEvents="none"
                        style={[styles.wheelSelectionOverlay, { borderColor: theme.icon, backgroundColor: `${theme.tint}14` }]}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
              {assignableMembers.length > 0 ? (
                <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                  {assignableMembers.map((member) => (
                    <TouchableOpacity
                      key={`manual-assign-${member.id}`}
                      onPress={() => toggleManualAssignee(member.id)}
                      style={[
                        styles.memberChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        selectedAssigneeIds.includes(member.id) && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                      ]}
                      disabled={saving}
                    >
                      <Text style={{ color: theme.text }}>{member.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={{ color: theme.textSecondary, marginBottom: 8 }}>
                  Aucun membre disponible pour l&apos;attribution.
                </Text>
              )}

              <TouchableOpacity
                onPress={() => void createManualTask()}
                style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryBtnText}>Ajouter la tâche</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {isPlannedModule ? (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Tâches planifiées</Text>
            {groupedInstanceSections.length > 0 ? (
              <SectionList
                sections={groupedInstanceSections}
                keyExtractor={(instance) => `instance-${instance.id}`}
                renderSectionHeader={renderGroupedInstanceHeader}
                renderItem={renderGroupedInstanceItem}
                scrollEnabled={false}
                stickySectionHeadersEnabled={false}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                SectionSeparatorComponent={() => <View style={{ height: 12 }} />}
              />
            ) : (
              <Text style={{ color: theme.textSecondary }}>Aucune tâche sur cette semaine.</Text>
            )}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  card: {
    borderRadius: 14,
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  weekCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  weekArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekCenter: {
    flex: 1,
    alignItems: "center",
  },
  weekTitle: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  weekRange: {
    marginTop: 2,
    fontSize: 12,
  },
  weekCurrentBtn: {
    marginTop: 8,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  weekCurrentBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  pickerFieldBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerFieldText: {
    fontSize: 14,
    fontWeight: "600",
  },
  inlineWheelPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  wheelRow: {
    flexDirection: "row",
    gap: 8,
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_CONTAINER_HEIGHT,
    position: "relative",
  },
  wheelContentContainer: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  wheelItemTextSelected: {
    fontWeight: "700",
  },
  wheelSelectionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: WHEEL_VERTICAL_PADDING,
    height: WHEEL_ITEM_HEIGHT,
    borderWidth: 1,
    borderRadius: 10,
  },
  memberRow: {
    gap: 8,
    paddingBottom: 4,
  },
  memberChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rotationOrderList: {
    marginBottom: 8,
    gap: 6,
  },
  rotationOrderItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rotationOrderName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  rotationOrderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  templateRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  recurrenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  recurrenceChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  toggleRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  primaryBtn: {
    marginTop: 6,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
  dateTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "capitalize",
  },
  instanceCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  instanceActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-end",
  },
});



