import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";

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
  recurrence_days?: number[];
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
  template: {
    id: number;
    recurrence: string;
    start_date?: string | null;
    recurrence_days?: number[];
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

const pad = (value: number) => String(value).padStart(2, "0");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wheelIndexFromOffset = (offsetY: number, size: number) =>
  clamp(Math.round(offsetY / WHEEL_ITEM_HEIGHT), 0, Math.max(0, size - 1));

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

const weekLabelFromStart = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const start = weekStart.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  const end = weekEnd.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `Semaine du ${start} au ${end}`;
};

const weekStartIsoFromIsoDate = (isoDate: string) => {
  if (!isValidIsoDate(isoDate)) {
    return toIsoDate(weekStartFromDate(new Date()));
  }
  return toIsoDate(weekStartFromDate(parseIsoDate(isoDate)));
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

const isTaskModuleKey = (value: unknown): value is TaskModuleKey =>
  value === "planned" || value === "schedule" || value === "routines";

export default function TasksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ module?: string | string[] }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const initialWeekStart = useMemo(() => weekStartFromDate(new Date()), []);
  const initialTemplateDay = useMemo(() => isoWeekDayFromDate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasksEnabled, setTasksEnabled] = useState(false);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const rangeFrom = useMemo(() => toIsoDate(weekStart), [weekStart]);
  const rangeTo = useMemo(() => toIsoDate(addDays(weekStart, 6)), [weekStart]);
  const [canManageTemplates, setCanManageTemplates] = useState(false);
  const [canManageInstances, setCanManageInstances] = useState(false);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [instances, setInstances] = useState<TaskInstance[]>([]);

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateRecurrence, setTemplateRecurrence] = useState<"daily" | "weekly" | "monthly" | "once">("weekly");
  const [templateStartDate, setTemplateStartDate] = useState(todayIso);
  const [templateRecurrenceDays, setTemplateRecurrenceDays] = useState<number[]>([initialTemplateDay]);
  const [templateRotation, setTemplateRotation] = useState(false);
  const [templateRotationCycleWeeks, setTemplateRotationCycleWeeks] = useState<1 | 2>(1);
  const [templateFixedUserId, setTemplateFixedUserId] = useState<number | null>(null);
  const [templateRotationStartUserId, setTemplateRotationStartUserId] = useState<number | null>(null);
  const [templateInterHouseholdAlternating, setTemplateInterHouseholdAlternating] = useState(false);
  const [templateInterHouseholdWeekStart, setTemplateInterHouseholdWeekStart] = useState<string>(
    () => toIsoDate(initialWeekStart)
  );
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<"parent" | "enfant">("enfant");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null);
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
  const activeModule = useMemo<TaskModuleKey>(() => {
    const raw = Array.isArray(params.module) ? params.module[0] : params.module;
    return isTaskModuleKey(raw) ? raw : "planned";
  }, [params.module]);
  const isPlannedModule = activeModule === "planned";
  const isScheduleModule = activeModule === "schedule";
  const isRoutinesModule = activeModule === "routines";
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
  const activeWeekLabel = useMemo(() => weekLabelFromStart(weekStart), [weekStart]);
  const isCurrentWeek = useMemo(
    () => toIsoDate(weekStart) === toIsoDate(weekStartFromDate(new Date())),
    [weekStart]
  );

  const goToPreviousWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, -7));
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, 7));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setWeekStart(weekStartFromDate(new Date()));
  }, []);
  const interHouseholdWeekStartIso = useMemo(
    () => weekStartIsoFromIsoDate(templateInterHouseholdWeekStart),
    [templateInterHouseholdWeekStart]
  );
  const interHouseholdWeekLabel = useMemo(
    () => weekLabelFromStart(parseIsoDate(interHouseholdWeekStartIso)),
    [interHouseholdWeekStartIso]
  );
  const goToPreviousInterHouseholdWeek = useCallback(() => {
    setTemplateInterHouseholdWeekStart((prev) => {
      const weekStart = parseIsoDate(weekStartIsoFromIsoDate(prev));
      return toIsoDate(addDays(weekStart, -7));
    });
  }, []);
  const goToNextInterHouseholdWeek = useCallback(() => {
    setTemplateInterHouseholdWeekStart((prev) => {
      const weekStart = parseIsoDate(weekStartIsoFromIsoDate(prev));
      return toIsoDate(addDays(weekStart, 7));
    });
  }, []);
  const goToCurrentInterHouseholdWeek = useCallback(() => {
    setTemplateInterHouseholdWeekStart(toIsoDate(weekStartFromDate(new Date())));
  }, []);
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
  const assignableMembers = useMemo(() => {
    if (currentUserRole === "parent") {
      return members;
    }
    if (currentUserId === null) {
      return [];
    }
    return members.filter((member) => member.id === currentUserId);
  }, [currentUserId, currentUserRole, members]);

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }

    try {
      const payload = await apiFetch(`/tasks/board?from=${rangeFrom}&to=${rangeTo}`) as BoardPayload;
      setTasksEnabled(Boolean(payload?.tasks_enabled));
      setCanManageTemplates(Boolean(payload?.can_manage_templates));
      setCanManageInstances(Boolean(payload?.can_manage_instances));
      const payloadCurrentUserId = Number.isInteger(payload?.current_user?.id)
        ? Number(payload.current_user?.id)
        : null;
      const payloadCurrentRole = payload?.current_user?.role === "parent" ? "parent" : "enfant";
      setCurrentUserId(payloadCurrentUserId);
      setCurrentUserRole(payloadCurrentRole);
      setMembers(Array.isArray(payload?.members) ? payload.members : []);
      setTemplates(Array.isArray(payload?.templates) ? payload.templates : []);
      setInstances(Array.isArray(payload?.instances) ? payload.instances : []);
    } catch (error: any) {
      Alert.alert("Tâches", error?.message || "Impossible de charger les tâches.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [rangeFrom, rangeTo]);

  useFocusEffect(
    useCallback(() => {
      void loadBoard();
    }, [loadBoard])
  );

  useEffect(() => {
    if (!isScheduleModule) {
      return;
    }

    if (currentUserRole === "parent") {
      return;
    }

    if (currentUserId !== null) {
      setSelectedAssigneeId(currentUserId);
    }
  }, [currentUserId, currentUserRole, isScheduleModule]);

  useEffect(() => {
    if (!isScheduleModule || currentUserRole !== "parent") {
      return;
    }

    if (selectedAssigneeId === null && members.length > 0) {
      setSelectedAssigneeId(members[0].id);
    }
  }, [isScheduleModule, currentUserRole, selectedAssigneeId, members]);

  useEffect(() => {
    if (!isScheduleModule || currentUserRole === "parent") {
      return;
    }

    if (selectedAssigneeId !== currentUserId) {
      setSelectedAssigneeId(currentUserId);
    }
  }, [currentUserId, currentUserRole, isScheduleModule, selectedAssigneeId]);

  useEffect(() => {
    const maxDay = manualDayOptions.length;
    setManualDateWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [manualDayOptions.length]);

  useEffect(() => {
    const maxDay = templateStartDayOptions.length;
    setTemplateStartDateWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [templateStartDayOptions.length]);

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

    setTemplateStartDate(`${templateStartDateWheelYear}-${pad(templateStartDateWheelMonth)}-${pad(normalizedDay)}`);
  }, [templateStartDateWheelDay, templateStartDateWheelMonth, templateStartDateWheelVisible, templateStartDateWheelYear]);

  const groupedInstances = useMemo(() => {
    const buckets: Record<string, TaskInstance[]> = {};
    const sorted = [...instances].sort((left, right) => {
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
  }, [instances]);

  const applyTemplateRecurrence = (recurrence: "daily" | "weekly" | "monthly" | "once") => {
    setTemplateRecurrence(recurrence);
    if (recurrence !== "monthly") {
      setTemplateStartDateWheelVisible(false);
    }
    if (recurrence === "monthly" && !isValidIsoDate(templateStartDate)) {
      setTemplateStartDate(todayIso);
    }
    if (recurrence === "daily" && templateRecurrenceDays.length === 0) {
      setTemplateRecurrenceDays([1, 2, 3, 4, 5, 6, 7]);
      return;
    }
    if (recurrence === "weekly" && templateRecurrenceDays.length === 0) {
      setTemplateRecurrenceDays([initialTemplateDay]);
      return;
    }
    if (recurrence === "monthly" || recurrence === "once") {
      setTemplateRecurrenceDays([]);
    }
  };

  const toggleTemplateRecurrenceDay = (dayValue: number) => {
    setTemplateRecurrenceDays((prev) => {
      if (prev.includes(dayValue)) {
        return prev.filter((day) => day !== dayValue);
      }
      return [...prev, dayValue].sort((a, b) => a - b);
    });
  };

  const toggleTemplateInterHouseholdAlternation = () => {
    setTemplateInterHouseholdAlternating((prev) => {
      const next = !prev;
      if (next) {
        setTemplateInterHouseholdWeekStart((current) => weekStartIsoFromIsoDate(current));
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
    setTemplateRecurrenceDays([initialTemplateDay]);
    setTemplateRotation(false);
    setTemplateRotationCycleWeeks(1);
    setTemplateFixedUserId(null);
    setTemplateRotationStartUserId(null);
    setTemplateInterHouseholdAlternating(false);
    setTemplateInterHouseholdWeekStart(toIsoDate(weekStartFromDate(new Date())));
    setTemplateStartDateWheelVisible(false);
  };

  const startEditTemplate = (template: TaskTemplate) => {
    const normalizedDays = normalizeRecurrenceDays(template.recurrence_days);
    let nextDays = normalizedDays;
    if ((template.recurrence === "daily" || template.recurrence === "weekly") && normalizedDays.length === 0) {
      nextDays = template.recurrence === "daily" ? [1, 2, 3, 4, 5, 6, 7] : [initialTemplateDay];
    }

    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description ?? "");
    setTemplateRecurrence(template.recurrence);
    setTemplateStartDate(isValidIsoDate(template.start_date ?? "") ? String(template.start_date) : todayIso);
    setTemplateRecurrenceDays(nextDays);
    setTemplateRotation(Boolean(template.is_rotation));
    setTemplateRotationCycleWeeks(template.rotation_cycle_weeks === 2 ? 2 : 1);
    setTemplateFixedUserId(template.is_rotation ? null : (template.fixed_user_id ?? null));
    setTemplateRotationStartUserId(template.is_rotation ? (template.fixed_user_id ?? null) : null);
    setTemplateInterHouseholdAlternating(Boolean(template.is_inter_household_alternating));
    setTemplateInterHouseholdWeekStart(
      weekStartIsoFromIsoDate(
        typeof template.inter_household_week_start === "string" && template.inter_household_week_start.length > 0
          ? template.inter_household_week_start
          : toIsoDate(weekStartFromDate(new Date()))
      )
    );
  };

  const saveTemplate = async () => {
    const cleanName = templateName.trim();
    if (cleanName.length < 2) {
      Alert.alert("Tâches", "Le nom de la routine est obligatoire.");
      return;
    }

    const normalizedDays = normalizeRecurrenceDays(templateRecurrenceDays);
    if ((templateRecurrence === "daily" || templateRecurrence === "weekly") && normalizedDays.length === 0) {
      Alert.alert("Tâches", "Choisis au moins un jour pour cette récurrence.");
      return;
    }
    if (templateRecurrence === "monthly" && !isValidIsoDate(templateStartDate)) {
      Alert.alert("Tâches", "La date de début mensuelle est invalide (YYYY-MM-DD).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: cleanName,
        description: templateDescription.trim() || null,
        recurrence: templateRecurrence,
        start_date: templateRecurrence === "monthly" ? templateStartDate : null,
        recurrence_days: templateRecurrence === "daily" || templateRecurrence === "weekly" ? normalizedDays : [],
        is_rotation: templateRotation,
        rotation_cycle_weeks: templateRotation ? templateRotationCycleWeeks : 1,
        is_inter_household_alternating: templateInterHouseholdAlternating,
        inter_household_week_start: templateInterHouseholdAlternating ? interHouseholdWeekStartIso : null,
        fixed_user_id: templateRotation ? templateRotationStartUserId : templateFixedUserId,
      };

      if (editingTemplateId) {
        await apiFetch(`/tasks/templates/${editingTemplateId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/tasks/templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetTemplateForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Tâches", error?.message || "Impossible de sauvegarder cette routine.");
    } finally {
      setSaving(false);
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
            setSaving(true);
            try {
              await apiFetch(`/tasks/templates/${template.id}`, { method: "DELETE" });
              if (editingTemplateId === template.id) {
                resetTemplateForm();
              }
              await loadBoard({ silent: true });
            } catch (error: any) {
              Alert.alert("Tâches", error?.message || "Impossible de supprimer cette routine.");
            } finally {
              setSaving(false);
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
    if (currentUserRole === "parent" && selectedAssigneeId === null) {
      Alert.alert("Tâches", "Choisis un membre du foyer.");
      return;
    }

    setSaving(true);
    try {
      const assigneeId = currentUserRole === "parent"
        ? selectedAssigneeId
        : currentUserId;
      await apiFetch("/tasks/instances", {
        method: "POST",
        body: JSON.stringify({
          name: cleanTitle,
          description: manualDescription.trim() || null,
          due_date: manualDate,
          end_date: manualEndDate,
          user_id: assigneeId ?? undefined,
        }),
      });
      setManualTitle("");
      setManualDescription("");
      setManualDate(todayIso);
      setManualEndDate(todayIso);
      setManualDateWheelVisible(false);
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Tâches", error?.message || "Impossible de créer cette tâche.");
    } finally {
      setSaving(false);
    }
  };
  const toggleInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_toggle) {
      return;
    }

    const nextStatus = instance.status === STATUS_DONE ? STATUS_TODO : STATUS_DONE;

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${instance.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Tâches", error?.message || "Impossible de mettre à jour le statut.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCancelled = async (instance: TaskInstance) => {
    if (!instance.permissions.can_cancel) {
      return;
    }

    const nextStatus = instance.status === STATUS_CANCELLED ? STATUS_TODO : STATUS_CANCELLED;

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${instance.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Tâches", error?.message || "Impossible de modifier cette tâche.");
    } finally {
      setSaving(false);
    }
  };

  const validateInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_validate || instance.validated_by_parent) {
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${instance.id}/validate`, {
        method: "POST",
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Tâches", error?.message || "Impossible de valider cette tâche.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
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
                  <Text style={[styles.weekRange, { color: theme.textSecondary }]}>
                    {rangeFrom} → {rangeTo}
                  </Text>
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
                  Cette semaine
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

              {templates.length > 0 ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {templates.map((template) => (
                    <View key={`template-${template.id}`} style={[styles.templateRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: "700" }}>{template.name}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {recurrenceLabel(template.recurrence)}
                          {template.is_rotation
                            ? ` - Rotation ${template.rotation_cycle_weeks === 2 ? "bihebdo" : "hebdo"}`
                            : ""}
                          {template.fixed_user_name ? ` - ${template.fixed_user_name}` : ""}
                        </Text>
                        {recurrenceDaysLabel(template.recurrence, template.recurrence_days) ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {recurrenceDaysLabel(template.recurrence, template.recurrence_days)}
                          </Text>
                        ) : null}
                        {template.recurrence === "monthly" && isValidIsoDate(template.start_date ?? "") ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {`Début mensuel: ${template.start_date}`}
                          </Text>
                        ) : null}
                        {template.is_inter_household_alternating ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {`Alternance inter-foyer: ${weekLabelFromStart(parseIsoDate(weekStartIsoFromIsoDate(template.inter_household_week_start ?? "")))}`}
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
                    {(["once", "daily", "weekly", "monthly"] as const).map((recurrence) => (
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
                        {templateRecurrence === "daily" ? (
                          <TouchableOpacity
                            onPress={() => setTemplateRecurrenceDays([1, 2, 3, 4, 5, 6, 7])}
                            style={[styles.recurrenceChip, { borderColor: theme.icon, backgroundColor: theme.background }]}
                          >
                            <Text style={{ color: theme.text, fontSize: 12 }}>Tous</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </>
                  ) : null}

                  {templateRecurrence === "monthly" ? (
                    <>
                      <Text style={[styles.label, { color: theme.text }]}>Date de début mensuelle</Text>
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
                              <ScrollView
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
                              <ScrollView
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
                              <ScrollView
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

                  <Text style={[styles.label, { color: theme.text }]}>Commencer par (optionnel)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                    <TouchableOpacity
                      onPress={() => setTemplateRotationStartUserId(null)}
                      style={[
                        styles.memberChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        templateRotationStartUserId === null && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                      ]}
                    >
                      <Text style={{ color: theme.text }}>Auto</Text>
                    </TouchableOpacity>
                    {members.map((member) => (
                      <TouchableOpacity
                        key={`rotation-start-${member.id}`}
                        onPress={() => setTemplateRotationStartUserId(member.id)}
                        style={[
                          styles.memberChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateRotationStartUserId === member.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                        ]}
                      >
                        <Text style={{ color: theme.text }}>{member.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
                  ) : (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>Membre fixe (optionnel)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                    <TouchableOpacity
                      onPress={() => setTemplateFixedUserId(null)}
                      style={[
                        styles.memberChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        templateFixedUserId === null && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                      ]}
                    >
                      <Text style={{ color: theme.text }}>Auto</Text>
                    </TouchableOpacity>
                    {members.map((member) => (
                      <TouchableOpacity
                        key={`fixed-${member.id}`}
                        onPress={() => setTemplateFixedUserId(member.id)}
                        style={[
                          styles.memberChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          templateFixedUserId === member.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
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
                        <Text style={[styles.weekCurrentBtnText, { color: theme.tint }]}>Cette semaine</Text>
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
                      <ScrollView
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
                      <ScrollView
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
                      <ScrollView
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
                  {assignableMembers.map((member) => (
                    <TouchableOpacity
                      key={`manual-assign-${member.id}`}
                      onPress={() => setSelectedAssigneeId(member.id)}
                      style={[
                        styles.memberChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        selectedAssigneeId === member.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
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
            {groupedInstances.length > 0 ? (
              groupedInstances.map(([date, dayInstances]) => (
                <View key={`date-${date}`} style={{ marginBottom: 12 }}>
                  <Text style={[styles.dateTitle, { color: theme.textSecondary }]}>{formatDateLabel(date)}</Text>
                  {dayInstances.map((instance) => (
                    <View
                      key={`instance-${instance.id}`}
                      style={[styles.instanceCard, { borderColor: theme.icon, backgroundColor: theme.background }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: "700" }}>{instance.title}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {instance.assignee.name}
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
                  ))}
                </View>
              ))
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
    paddingTop: 56,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTitle: {
    fontSize: 26,
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
