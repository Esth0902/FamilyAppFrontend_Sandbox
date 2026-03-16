import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  filterRecipesByQuery,
  isTaskStatus,
  isValidIsoDate,
  isValidTime,
  parseEventDateTimeRange,
} from "@/src/features/calendar/calendar-utils";
import {
  addIngredientsToShoppingList,
  buildShoppingIngredientsFromRecipeSelections,
  createShoppingList,
  defaultShoppingListTitle,
  loadShoppingLists,
  resolvePreferredShoppingListId,
  type ShoppingListSummary,
} from "@/src/features/shopping-list/list-utils";
import { ShoppingListPickerModal } from "@/src/features/shopping-list/shopping-list-picker-modal";

type CalendarEvent = {
  id: number;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  is_shared_with_other_household: boolean;
  created_by?: {
    id?: number | null;
    name?: string | null;
  } | null;
  permissions?: {
    can_update: boolean;
    can_delete: boolean;
  };
};

type MealPlanRecipe = {
  id: number;
  title: string;
  type?: string | null;
  servings: number;
  position: number;
};

type MealPlanEntry = {
  id: number;
  date: string;
  meal_type: "matin" | "midi" | "soir";
  custom_title?: string | null;
  note?: string | null;
  recipes: MealPlanRecipe[];
};

type CalendarTaskInstance = {
  id: number;
  title: string;
  description?: string | null;
  due_date: string;
  status: string;
  validated_by_parent: boolean;
  assignee: {
    id: number;
    name: string;
  };
  permissions: {
    can_toggle: boolean;
    can_validate: boolean;
    can_cancel: boolean;
  };
};

type RecipeOption = {
  id: number;
  title: string;
  type?: string | null;
};

type CalendarBoardPayload = {
  calendar_enabled: boolean;
  range: {
    from: string;
    to: string;
  };
  settings: {
    shared_view_enabled: boolean;
    absence_tracking_enabled: boolean;
  };
  permissions: {
    can_create_events: boolean;
    can_share_with_other_household: boolean;
    can_manage_meal_plan: boolean;
  };
  events: CalendarEvent[];
  meal_plan: MealPlanEntry[];
};

type TaskBoardPayload = {
  tasks_enabled: boolean;
  can_manage_instances?: boolean;
  current_user?: {
    id: number;
    role: "parent" | "enfant";
  };
  members?: {
    id: number;
    name: string;
    role: "parent" | "enfant";
  }[];
  instances: CalendarTaskInstance[];
};

type CreateEntryType = "event" | "meal_plan" | "task";

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const WEEK_DAY_SHORT = ["di", "lu", "ma", "me", "je", "ve", "sa"] as const;
const TASK_STATUS_TODO = "à faire";
const TASK_STATUS_DONE = "réalisée";
const TASK_STATUS_CANCELLED = "annulée";
const WHEEL_ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_ROWS = 5;
const WHEEL_CONTAINER_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
const WHEEL_VERTICAL_PADDING = (WHEEL_CONTAINER_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;
const TIME_WHEEL_REPEAT = 8;
const TIME_WHEEL_MIDDLE_CYCLE = Math.floor(TIME_WHEEL_REPEAT / 2);
const MONTH_LABELS = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "dec"];

const pad = (value: number) => String(value).padStart(2, "0");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const positiveModulo = (value: number, mod: number) => ((value % mod) + mod) % mod;
const wheelIndexFromOffset = (offsetY: number, size: number) =>
  clamp(Math.round(offsetY / WHEEL_ITEM_HEIGHT), 0, Math.max(0, size - 1));
const parseTimeValue = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 18,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  };
};

const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseIsoDate = (value: string) => new Date(`${value}T00:00:00`);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const weekDayShortLabel = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day);
  return WEEK_DAY_SHORT[date.getDay()] ?? "";
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);
  return next;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const startOfWeekMonday = (date: Date) => {
  const next = new Date(date);
  const diff = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
};

const endOfWeekSunday = (date: Date) => addDays(startOfWeekMonday(date), 6);

const isSameMonth = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const mealTypeLabel = (value: string) => {
  if (value === "matin") return "Matin";
  if (value === "midi") return "Midi";
  if (value === "soir") return "Soir";
  return value;
};

const mealTypeColor = (value: string) => {
  if (value === "matin") return "#F5A623";
  if (value === "midi") return "#4A90E2";
  if (value === "soir") return "#50BFA5";
  return "#7B8794";
};

const taskStatusLabel = (value: string) => {
  if (isTaskStatus(value, TASK_STATUS_TODO)) return "à faire";
  if (isTaskStatus(value, TASK_STATUS_DONE)) return "Réalisée";
  if (isTaskStatus(value, TASK_STATUS_CANCELLED)) return "Annulée";
  return value;
};

const taskStatusColor = (value: string) => {
  if (isTaskStatus(value, TASK_STATUS_DONE)) return "#50BFA5";
  if (isTaskStatus(value, TASK_STATUS_CANCELLED)) return "#D96C6C";
  return "#7C5CFA";
};

const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString("fr-BE", {
    month: "long",
    year: "numeric",
  });

const formatFullDateLabel = (isoDate: string) => {
  const parsed = parseIsoDate(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return parsed.toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatTimeRange = (startAt: string, endAt: string) => {
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

const isoDateFromDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return toIsoDate(parsed);
};

const timeInputFromDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "18:00";
  }

  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

export default function CalendarScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { role } = useStoredUserState();
  const canManageHouseholdConfig = role === "parent";

  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [settings, setSettings] = useState({
    shared_view_enabled: true,
    absence_tracking_enabled: true,
  });
  const [tasksEnabled, setTasksEnabled] = useState(false);
  const [canManageTaskInstances, setCanManageTaskInstances] = useState(false);
  const [taskMembers, setTaskMembers] = useState<TaskBoardPayload["members"]>([]);
  const [taskCurrentUserId, setTaskCurrentUserId] = useState<number | null>(null);
  const [taskCurrentUserRole, setTaskCurrentUserRole] = useState<"parent" | "enfant">("enfant");
  const [taskAssigneeId, setTaskAssigneeId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState({
    can_create_events: false,
    can_share_with_other_household: false,
    can_manage_meal_plan: false,
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlanEntry[]>([]);
  const [taskInstances, setTaskInstances] = useState<CalendarTaskInstance[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const hasLoadedOnceRef = useRef(false);
  const recipesLoadedRef = useRef(false);

  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState(todayIso);
  const [eventEndDate, setEventEndDate] = useState(todayIso);
  const [eventStartTime, setEventStartTime] = useState("18:00");
  const [eventEndTime, setEventEndTime] = useState("19:00");
  const [shareWithOtherHousehold, setShareWithOtherHousehold] = useState(false);
  const [createEntryType, setCreateEntryType] = useState<CreateEntryType>("event");
  const [dateWheelVisible, setDateWheelVisible] = useState(false);
  const [dateWheelTarget, setDateWheelTarget] = useState<"start" | "end">("start");
  const [dateWheelYear, setDateWheelYear] = useState(new Date().getFullYear());
  const [dateWheelMonth, setDateWheelMonth] = useState(new Date().getMonth() + 1);
  const [dateWheelDay, setDateWheelDay] = useState(new Date().getDate());
  const [timeWheelVisible, setTimeWheelVisible] = useState(false);
  const [timeWheelTarget, setTimeWheelTarget] = useState<"start" | "end">("start");
  const [timeWheelHour, setTimeWheelHour] = useState(18);
  const [timeWheelMinute, setTimeWheelMinute] = useState(0);
  const [timeWheelHourIndex, setTimeWheelHourIndex] = useState(TIME_WHEEL_MIDDLE_CYCLE * 24 + 18);
  const [timeWheelMinuteIndex, setTimeWheelMinuteIndex] = useState(TIME_WHEEL_MIDDLE_CYCLE * 60);
  const yearWheelRef = useRef<ScrollView | null>(null);
  const monthWheelRef = useRef<ScrollView | null>(null);
  const dayWheelRef = useRef<ScrollView | null>(null);
  const hourWheelRef = useRef<ScrollView | null>(null);
  const minuteWheelRef = useRef<ScrollView | null>(null);
  const dateWheelDayIndexRef = useRef(Math.max(0, dateWheelDay - 1));
  const dateWheelMonthIndexRef = useRef(Math.max(0, dateWheelMonth - 1));
  const dateWheelYearIndexRef = useRef(0);
  const timeWheelHourIndexRef = useRef(timeWheelHourIndex);
  const timeWheelMinuteIndexRef = useRef(timeWheelMinuteIndex);

  const [editingMealPlanId, setEditingMealPlanId] = useState<number | null>(null);
  const [mealPlanDate, setMealPlanDate] = useState(todayIso);
  const [mealPlanType, setMealPlanType] = useState<"matin" | "midi" | "soir">("soir");
  const [mealPlanRecipeId, setMealPlanRecipeId] = useState<number | null>(null);
  const [mealPlanSearch, setMealPlanSearch] = useState("");
  const [mealPlanCustomTitle, setMealPlanCustomTitle] = useState("");
  const [mealPlanServings, setMealPlanServings] = useState("4");
  const [mealPlanNote, setMealPlanNote] = useState("");
  const [dayProgramModalVisible, setDayProgramModalVisible] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [mealPlanModalVisible, setMealPlanModalVisible] = useState(false);
  const [shoppingPickerVisible, setShoppingPickerVisible] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListSummary[]>([]);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState<number | null>(null);
  const [useNewShoppingList, setUseNewShoppingList] = useState(false);
  const [newShoppingListTitle, setNewShoppingListTitle] = useState(defaultShoppingListTitle());
  const [pendingMealPlanForShopping, setPendingMealPlanForShopping] = useState<MealPlanEntry | null>(null);
  const [restoreDayProgramAfterShoppingPicker, setRestoreDayProgramAfterShoppingPicker] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(todayIso);
  const [taskEndDate, setTaskEndDate] = useState(todayIso);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);
  }, []);

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);

  const dayOptions = useMemo(() => {
    const maxDay = new Date(dateWheelYear, dateWheelMonth, 0).getDate();
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [dateWheelMonth, dateWheelYear]);

  const hourOptions = useMemo(
    () => Array.from({ length: 24 * TIME_WHEEL_REPEAT }, (_, index) => positiveModulo(index, 24)),
    []
  );
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 * TIME_WHEEL_REPEAT }, (_, index) => positiveModulo(index, 60)),
    []
  );

  const calendarRange = useMemo(() => {
    const monthStart = startOfMonth(monthCursor);
    const monthEnd = endOfMonth(monthCursor);
    const gridStart = startOfWeekMonday(monthStart);
    const gridEnd = endOfWeekSunday(monthEnd);

    return {
      from: toIsoDate(gridStart),
      to: toIsoDate(gridEnd),
      gridStart,
      gridEnd,
    };
  }, [monthCursor]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let current = new Date(calendarRange.gridStart);

    while (current <= calendarRange.gridEnd) {
      days.push(new Date(current));
      current = addDays(current, 1);
    }

    return days;
  }, [calendarRange.gridEnd, calendarRange.gridStart]);

  const prepareNewEventForm = useCallback((targetDate: string) => {
    setEditingEventId(null);
    setEventTitle("");
    setEventDescription("");
    setEventDate(targetDate);
    setEventEndDate(targetDate);
    setEventStartTime("18:00");
    setEventEndTime("19:00");
    setShareWithOtherHousehold(false);
  }, []);

  const resetEventForm = useCallback(() => {
    prepareNewEventForm(selectedDate);
  }, [prepareNewEventForm, selectedDate]);

  const resetMealPlanForm = useCallback(() => {
    setEditingMealPlanId(null);
    setMealPlanDate(selectedDate);
    setMealPlanType("soir");
    setMealPlanRecipeId(null);
    setMealPlanSearch("");
    setMealPlanCustomTitle("");
    setMealPlanServings("4");
    setMealPlanNote("");
  }, [selectedDate]);

  const resetTaskForm = useCallback(() => {
    setTaskTitle("");
    setTaskDescription("");
    setTaskDueDate(selectedDate);
    setTaskEndDate(selectedDate);
    if (taskCurrentUserRole === "parent") {
      setTaskAssigneeId(taskMembers?.[0]?.id ?? null);
      return;
    }
    setTaskAssigneeId(taskCurrentUserId);
  }, [selectedDate, taskCurrentUserId, taskCurrentUserRole, taskMembers]);

  useEffect(() => {
    const maxDay = dayOptions.length;
    setDateWheelDay((prev) => clamp(prev, 1, maxDay));
  }, [dayOptions.length]);

  const openDateWheel = (target: "start" | "end") => {
    if (dateWheelVisible && dateWheelTarget === target) {
      setDateWheelVisible(false);
      return;
    }

    const sourceIsoDate = target === "start" ? eventDate : eventEndDate;
    const sourceDate = parseIsoDate(sourceIsoDate);
    const safeDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
    const year = safeDate.getFullYear();
    const month = safeDate.getMonth() + 1;
    const day = safeDate.getDate();
    const yearIndex = Math.max(0, yearOptions.indexOf(year));
    const monthIndex = Math.max(0, monthOptions.indexOf(month));
    const dayIndex = Math.max(0, day - 1);

    setDateWheelTarget(target);
    setDateWheelYear(year);
    setDateWheelMonth(month);
    setDateWheelDay(day);
    dateWheelYearIndexRef.current = yearIndex;
    dateWheelMonthIndexRef.current = monthIndex;
    dateWheelDayIndexRef.current = dayIndex;
    setTimeWheelVisible(false);
    setDateWheelVisible(true);

    requestAnimationFrame(() => {
      yearWheelRef.current?.scrollTo({ y: yearIndex * WHEEL_ITEM_HEIGHT, animated: false });
      monthWheelRef.current?.scrollTo({ y: monthIndex * WHEEL_ITEM_HEIGHT, animated: false });
      dayWheelRef.current?.scrollTo({ y: dayIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  };

  const openTimeWheel = (target: "start" | "end") => {
    if (timeWheelVisible && timeWheelTarget === target) {
      setTimeWheelVisible(false);
      return;
    }

    const sourceTime = target === "start" ? eventStartTime : eventEndTime;
    const parsed = parseTimeValue(sourceTime);
    const hour = parsed.hour;
    const minute = parsed.minute;

    setTimeWheelTarget(target);
    setTimeWheelHour(hour);
    setTimeWheelMinute(minute);
    const hourIndex = TIME_WHEEL_MIDDLE_CYCLE * 24 + hour;
    const minuteIndex = TIME_WHEEL_MIDDLE_CYCLE * 60 + minute;
    timeWheelHourIndexRef.current = hourIndex;
    timeWheelMinuteIndexRef.current = minuteIndex;
    setTimeWheelHourIndex(hourIndex);
    setTimeWheelMinuteIndex(minuteIndex);
    setDateWheelVisible(false);
    setTimeWheelVisible(true);

    requestAnimationFrame(() => {
      hourWheelRef.current?.scrollTo({ y: hourIndex * WHEEL_ITEM_HEIGHT, animated: false });
      minuteWheelRef.current?.scrollTo({ y: minuteIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  };

  useEffect(() => {
    if (!dateWheelVisible) {
      return;
    }

    const maxDay = new Date(dateWheelYear, dateWheelMonth, 0).getDate();
    const normalizedDay = clamp(dateWheelDay, 1, maxDay);
    if (normalizedDay !== dateWheelDay) {
      setDateWheelDay(normalizedDay);
      return;
    }

    const nextIsoDate = `${dateWheelYear}-${pad(dateWheelMonth)}-${pad(normalizedDay)}`;
    if (dateWheelTarget === "start") {
      setEventDate(nextIsoDate);
      setEventEndDate((prev) => (prev < nextIsoDate ? nextIsoDate : prev));
      return;
    }

    setEventEndDate(nextIsoDate);
    setEventDate((prev) => (prev > nextIsoDate ? nextIsoDate : prev));
  }, [dateWheelDay, dateWheelMonth, dateWheelTarget, dateWheelVisible, dateWheelYear]);

  useEffect(() => {
    if (!timeWheelVisible) {
      return;
    }

    const nextTime = `${pad(timeWheelHour)}:${pad(timeWheelMinute)}`;
    if (timeWheelTarget === "start") {
      setEventStartTime(nextTime);
      return;
    }

    setEventEndTime(nextTime);
  }, [timeWheelHour, timeWheelMinute, timeWheelTarget, timeWheelVisible]);


  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (!silent) {
      setLoading(true);
    }

    try {
      const recipesRequest = recipesLoadedRef.current
        ? Promise.resolve<RecipeOption[] | null>(null)
        : (apiFetch("/recipes") as Promise<RecipeOption[]>);

      const [calendarResult, tasksResult, recipesResult] = await Promise.allSettled([
        apiFetch(`/calendar/board?from=${calendarRange.from}&to=${calendarRange.to}`) as Promise<CalendarBoardPayload>,
        apiFetch(`/tasks/board?from=${calendarRange.from}&to=${calendarRange.to}`) as Promise<TaskBoardPayload>,
        recipesRequest,
      ]);

      if (calendarResult.status !== "fulfilled") {
        throw calendarResult.reason;
      }

      const payload = calendarResult.value;

      setCalendarEnabled(Boolean(payload?.calendar_enabled));
      setSettings({
        shared_view_enabled: payload?.settings?.shared_view_enabled !== false,
        absence_tracking_enabled: payload?.settings?.absence_tracking_enabled !== false,
      });
      setPermissions({
        can_create_events: Boolean(payload?.permissions?.can_create_events),
        can_share_with_other_household: Boolean(payload?.permissions?.can_share_with_other_household),
        can_manage_meal_plan: Boolean(payload?.permissions?.can_manage_meal_plan),
      });
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
      setMealPlan(Array.isArray(payload?.meal_plan) ? payload.meal_plan : []);

      if (tasksResult.status === "fulfilled") {
        setTasksEnabled(Boolean(tasksResult.value?.tasks_enabled));
        setCanManageTaskInstances(Boolean(tasksResult.value?.can_manage_instances));
        setTaskMembers(Array.isArray(tasksResult.value?.members) ? tasksResult.value.members : []);
        setTaskCurrentUserId(Number.isInteger(tasksResult.value?.current_user?.id) ? Number(tasksResult.value?.current_user?.id) : null);
        setTaskCurrentUserRole(tasksResult.value?.current_user?.role === "parent" ? "parent" : "enfant");
        setTaskInstances(Array.isArray(tasksResult.value?.instances) ? tasksResult.value.instances : []);
      } else {
        setTasksEnabled(false);
        setCanManageTaskInstances(false);
        setTaskMembers([]);
        setTaskCurrentUserId(null);
        setTaskCurrentUserRole("enfant");
        setTaskAssigneeId(null);
        setTaskInstances([]);
      }

      if (recipesResult.status === "fulfilled" && Array.isArray(recipesResult.value)) {
        setRecipes(recipesResult.value);
        recipesLoadedRef.current = true;
      } else if (!recipesLoadedRef.current) {
        setRecipes([]);
      }
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de charger le calendrier.");
    } finally {
      hasLoadedOnceRef.current = true;
      if (!silent) {
        setLoading(false);
      }
    }
  }, [calendarRange.from, calendarRange.to]);

  useFocusEffect(
    useCallback(() => {
      void loadBoard();
    }, [loadBoard])
  );

  useEffect(() => {
    if (editingEventId === null) {
      setEventDate(selectedDate);
      setEventEndDate(selectedDate);
    }
    if (editingMealPlanId === null) {
      setMealPlanDate(selectedDate);
    }
  }, [editingEventId, editingMealPlanId, selectedDate]);

  useEffect(() => {
    if (!permissions.can_share_with_other_household) {
      setShareWithOtherHousehold(false);
    }
  }, [permissions.can_share_with_other_household]);

  useEffect(() => {
    const selected = parseIsoDate(selectedDate);
    if (Number.isNaN(selected.getTime())) {
      return;
    }

    setMonthCursor((prev) => (isSameMonth(selected, prev) ? prev : startOfMonth(selected)));
  }, [selectedDate]);

  const stats = useMemo(() => {
    const sharedEvents = events.filter((event) => event.is_shared_with_other_household).length;
    return {
      events: events.length,
      shared: sharedEvents,
      meals: mealPlan.length,
    };
  }, [events, mealPlan]);

  const recipeOptions = useMemo(() => {
    return [...recipes].sort((left, right) => left.title.localeCompare(right.title, "fr-BE"));
  }, [recipes]);

  const filteredRecipeOptions = useMemo(() => {
    return filterRecipesByQuery(recipeOptions, mealPlanSearch);
  }, [mealPlanSearch, recipeOptions]);

  const eventCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};

    events.forEach((event) => {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
      }

      let cursor = parseIsoDate(toIsoDate(start));
      const endDay = toIsoDate(end);
      while (toIsoDate(cursor) <= endDay) {
        const iso = toIsoDate(cursor);
        counts[iso] = (counts[iso] ?? 0) + 1;
        cursor = addDays(cursor, 1);
      }
    });

    return counts;
  }, [events]);

  const mealCountByDay = useMemo(() => {
    return mealPlan.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.date] = (acc[entry.date] ?? 0) + 1;
      return acc;
    }, {});
  }, [mealPlan]);

  const taskCountByDay = useMemo(() => {
    return taskInstances.reduce<Record<string, number>>((acc, task) => {
      if (!task.due_date) {
        return acc;
      }
      acc[task.due_date] = (acc[task.due_date] ?? 0) + 1;
      return acc;
    }, {});
  }, [taskInstances]);

  const selectedDayEvents = useMemo(() => {
    return events
      .filter((event) => {
        const startDay = isoDateFromDateTime(event.start_at);
        const endDay = isoDateFromDateTime(event.end_at);
        return startDay !== "" && endDay !== "" && selectedDate >= startDay && selectedDate <= endDay;
      })
      .sort((left, right) => left.start_at.localeCompare(right.start_at));
  }, [events, selectedDate]);

  const selectedDayMeals = useMemo(() => {
    const order = { matin: 1, midi: 2, soir: 3 };
    return mealPlan
      .filter((entry) => entry.date === selectedDate)
      .sort((left, right) => (order[left.meal_type] ?? 9) - (order[right.meal_type] ?? 9));
  }, [mealPlan, selectedDate]);

  const selectedDayTasks = useMemo(() => {
    return taskInstances
      .filter((task) => task.due_date === selectedDate)
      .sort((left, right) => {
        const assigneeCompare = left.assignee.name.localeCompare(right.assignee.name);
        if (assigneeCompare !== 0) {
          return assigneeCompare;
        }
        return left.title.localeCompare(right.title);
      });
  }, [selectedDate, taskInstances]);

  const selectedMealRecipe = useMemo(() => {
    return recipeOptions.find((recipe) => recipe.id === mealPlanRecipeId) ?? null;
  }, [mealPlanRecipeId, recipeOptions]);
  const assignableTaskMembers = useMemo(() => {
    if (!Array.isArray(taskMembers) || taskMembers.length === 0) {
      return [];
    }
    if (taskCurrentUserRole === "parent") {
      return taskMembers;
    }
    if (taskCurrentUserId === null) {
      return [];
    }
    return taskMembers.filter((member) => member.id === taskCurrentUserId);
  }, [taskCurrentUserId, taskCurrentUserRole, taskMembers]);

  useEffect(() => {
    if (taskCurrentUserRole === "parent") {
      if (taskAssigneeId === null && Array.isArray(taskMembers) && taskMembers.length > 0) {
        setTaskAssigneeId(taskMembers[0].id);
      }
      return;
    }
    if (taskCurrentUserId !== null && taskAssigneeId !== taskCurrentUserId) {
      setTaskAssigneeId(taskCurrentUserId);
    }
  }, [taskAssigneeId, taskCurrentUserId, taskCurrentUserRole, taskMembers]);

  const isEventFormMode = editingEventId !== null || createEntryType === "event";
  const canSubmitCreateModal = editingEventId !== null
    ? permissions.can_create_events
    : createEntryType === "event"
      ? permissions.can_create_events
      : createEntryType === "meal_plan"
        ? permissions.can_manage_meal_plan
        : tasksEnabled
          && canManageTaskInstances
          && (taskCurrentUserRole !== "parent" || taskAssigneeId !== null);

  const openNewEventModal = (targetDate?: string) => {
    const eventTargetDate = targetDate ?? selectedDate;
    prepareNewEventForm(eventTargetDate);
    setCreateEntryType("event");
    setEditingMealPlanId(null);
    setMealPlanDate(eventTargetDate);
    setMealPlanType("soir");
    setMealPlanRecipeId(null);
    setMealPlanSearch("");
    setMealPlanCustomTitle("");
    setMealPlanServings("4");
    setMealPlanNote("");
    setTaskTitle("");
    setTaskDescription("");
    setTaskDueDate(eventTargetDate);
    setSelectedDate(eventTargetDate);
    setDayProgramModalVisible(false);
    setEventModalVisible(true);
  };

  const closeEventModal = () => {
    setDateWheelVisible(false);
    setTimeWheelVisible(false);
    setEventModalVisible(false);
    setCreateEntryType("event");
    resetEventForm();
    resetMealPlanForm();
    resetTaskForm();
  };

  const closeMealPlanModal = () => {
    setMealPlanModalVisible(false);
    resetMealPlanForm();
  };

  const selectCreateEntryType = (value: CreateEntryType) => {
    setCreateEntryType(value);
    setDateWheelVisible(false);
    setTimeWheelVisible(false);

    if (value === "meal_plan") {
      setMealPlanDate(eventDate);
    }

    if (value === "task") {
      setTaskDueDate(eventDate);
    }
  };

  const openEventEditor = (event: CalendarEvent) => {
    setDayProgramModalVisible(false);
    setCreateEntryType("event");
    setEditingEventId(event.id);
    setEventTitle(event.title);
    setEventDescription(event.description ?? "");
    setEventDate(isoDateFromDateTime(event.start_at) || selectedDate);
    setEventEndDate(isoDateFromDateTime(event.end_at) || isoDateFromDateTime(event.start_at) || selectedDate);
    setEventStartTime(timeInputFromDateTime(event.start_at));
    setEventEndTime(timeInputFromDateTime(event.end_at));
    setShareWithOtherHousehold(Boolean(event.is_shared_with_other_household));
    setEventModalVisible(true);
  };

  const openMealPlanEditor = (entry: MealPlanEntry) => {
    setDayProgramModalVisible(false);
    setEditingMealPlanId(entry.id);
    setMealPlanDate(entry.date);
    setMealPlanType(entry.meal_type);
    const recipeId = entry.recipes[0]?.id ?? null;
    setMealPlanRecipeId(recipeId && recipeId > 0 ? recipeId : null);
    setMealPlanSearch("");
    setMealPlanCustomTitle(entry.custom_title ?? "");
    setMealPlanServings(String(entry.recipes[0]?.servings ?? 4));
    setMealPlanNote(entry.note ?? "");
    setMealPlanModalVisible(true);
  };

  const handleSaveEvent = async () => {
    const cleanTitle = eventTitle.trim();
    if (cleanTitle.length < 2) {
      Alert.alert("Calendrier", "Le titre de l'événement est obligatoire.");
      return;
    }

    if (!isValidIsoDate(eventDate) || !isValidIsoDate(eventEndDate)) {
      Alert.alert("Calendrier", "Les dates doivent être au format YYYY-MM-DD.");
      return;
    }

    if (!isValidTime(eventStartTime) || !isValidTime(eventEndTime)) {
      Alert.alert("Calendrier", "Les heures doivent être au format HH:MM.");
      return;
    }

    const eventRange = parseEventDateTimeRange(eventDate, eventStartTime, eventEndDate, eventEndTime);
    if (!eventRange) {
      Alert.alert("Calendrier", "L'heure de fin doit être après l'heure de début.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(editingEventId ? `/calendar/events/${editingEventId}` : "/calendar/events", {
        method: editingEventId ? "PATCH" : "POST",
        body: JSON.stringify({
          title: cleanTitle,
          description: eventDescription.trim() || null,
          start_at: eventRange.startAt.toISOString(),
          end_at: eventRange.endAt.toISOString(),
          is_shared_with_other_household: shareWithOtherHousehold,
        }),
      });

      setSelectedDate(eventDate);
      setEventModalVisible(false);
      setCreateEntryType("event");
      resetEventForm();
      resetMealPlanForm();
      resetTaskForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'enregistrer l'événement.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateMealPlan = async () => {
    if (!permissions.can_manage_meal_plan) {
      Alert.alert("Calendrier", "Seul un parent peut créer un meal plan.");
      return;
    }

    if (!isValidIsoDate(mealPlanDate)) {
      Alert.alert("Calendrier", "La date du meal plan doit être au format YYYY-MM-DD.");
      return;
    }

    const customTitle = mealPlanCustomTitle.trim();
    if (!mealPlanRecipeId && customTitle.length === 0) {
      Alert.alert("Calendrier", "Choisis une recette ou saisis un repas libre.");
      return;
    }

    const servings = Number.parseInt(mealPlanServings, 10);
    if (!Number.isFinite(servings) || servings < 1 || servings > 30) {
      Alert.alert("Calendrier", "Le nombre de portions doit être compris entre 1 et 30.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/calendar/meal-plan", {
        method: "POST",
        body: JSON.stringify({
          date: mealPlanDate,
          meal_type: mealPlanType,
          recipe_id: customTitle.length === 0 ? mealPlanRecipeId : null,
          custom_title: customTitle.length > 0 ? customTitle : null,
          servings,
          note: mealPlanNote.trim() || null,
        }),
      });

      setSelectedDate(mealPlanDate);
      setEventModalVisible(false);
      setCreateEntryType("event");
      resetEventForm();
      resetMealPlanForm();
      resetTaskForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de créer ce meal plan.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!tasksEnabled) {
      Alert.alert("Calendrier", "Le module tâches est désactivé pour ce foyer.");
      return;
    }

    if (!canManageTaskInstances) {
      Alert.alert("Calendrier", "Vous ne pouvez pas créer une tâche.");
      return;
    }

    const cleanTitle = taskTitle.trim();
    if (cleanTitle.length < 2) {
      Alert.alert("Calendrier", "Le titre de la tâche est obligatoire.");
      return;
    }

    if (!isValidIsoDate(taskDueDate)) {
      Alert.alert("Calendrier", "La date de la tâche doit être au format YYYY-MM-DD.");
      return;
    }
    if (!isValidIsoDate(taskEndDate)) {
      Alert.alert("Calendrier", "La date de fin doit être au format YYYY-MM-DD.");
      return;
    }
    if (taskEndDate < taskDueDate) {
      Alert.alert("Calendrier", "La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }
    if (taskCurrentUserRole === "parent" && taskAssigneeId === null) {
      Alert.alert("Calendrier", "Choisis un membre pour cette tâche.");
      return;
    }

    setSaving(true);
    try {
      const assigneeId = taskCurrentUserRole === "parent" ? taskAssigneeId : taskCurrentUserId;
      await apiFetch("/tasks/instances", {
        method: "POST",
        body: JSON.stringify({
          name: cleanTitle,
          description: taskDescription.trim() || null,
          due_date: taskDueDate,
          end_date: taskEndDate,
          user_id: assigneeId ?? undefined,
        }),
      });

      setSelectedDate(taskDueDate);
      setEventModalVisible(false);
      setCreateEntryType("event");
      resetEventForm();
      resetMealPlanForm();
      resetTaskForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de créer cette tâche.");
    } finally {
      setSaving(false);
    }
  };
  const handleSaveFromModal = async () => {
    if (editingEventId !== null || createEntryType === "event") {
      await handleSaveEvent();
      return;
    }

    if (createEntryType === "meal_plan") {
      await handleCreateMealPlan();
      return;
    }

    await handleCreateTask();
  };

  const confirmDeleteEvent = (event: CalendarEvent) => {
    Alert.alert("Supprimer l'événement", `Supprimer "${event.title}" ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => void handleDeleteEvent(event.id),
      },
    ]);
  };

  const handleDeleteEvent = async (eventId: number) => {
    setSaving(true);
    try {
      await apiFetch(`/calendar/events/${eventId}`, { method: "DELETE" });
      if (editingEventId === eventId) {
        setEventModalVisible(false);
        resetEventForm();
      }
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de supprimer l'événement.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMealPlan = async () => {
    if (!editingMealPlanId) {
      return;
    }

    if (!isValidIsoDate(mealPlanDate)) {
      Alert.alert("Calendrier", "La date du meal plan doit être au format YYYY-MM-DD.");
      return;
    }

    const customTitle = mealPlanCustomTitle.trim();

    if (!mealPlanRecipeId && customTitle.length === 0) {
      Alert.alert("Calendrier", "Choisis une recette ou saisis un repas libre.");
      return;
    }

    const servings = Number.parseInt(mealPlanServings, 10);
    if (!Number.isFinite(servings) || servings < 1 || servings > 30) {
      Alert.alert("Calendrier", "Le nombre de portions doit être compris entre 1 et 30.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/calendar/meal-plan/${editingMealPlanId}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: mealPlanDate,
          meal_type: mealPlanType,
          recipe_id: customTitle.length === 0 ? mealPlanRecipeId : null,
          custom_title: customTitle.length > 0 ? customTitle : null,
          servings,
          note: mealPlanNote.trim() || null,
        }),
      });

      setSelectedDate(mealPlanDate);
      setMealPlanModalVisible(false);
      resetMealPlanForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de modifier ce meal plan.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteMealPlan = (entry: MealPlanEntry) => {
    Alert.alert("Supprimer le meal plan", `Supprimer le repas ${mealTypeLabel(entry.meal_type).toLowerCase()} ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => void handleDeleteMealPlan(entry.id),
      },
    ]);
  };

  const handleDeleteMealPlan = async (mealPlanId: number) => {
    setSaving(true);
    try {
      await apiFetch(`/calendar/meal-plan/${mealPlanId}`, { method: "DELETE" });
      if (editingMealPlanId === mealPlanId) {
        setMealPlanModalVisible(false);
        resetMealPlanForm();
      }
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de supprimer ce meal plan.");
    } finally {
      setSaving(false);
    }
  };

  const openMealPlanShoppingListPicker = async (entry: MealPlanEntry) => {
    if (!permissions.can_manage_meal_plan) {
      Alert.alert("Calendrier", "Seul un parent peut ajouter un meal plan à la liste de courses.");
      return;
    }
    if (saving) {
      Alert.alert("Calendrier", "Une action est déjà en cours. Réessaie dans un instant.");
      return;
    }

    const plannedRecipes = entry.recipes.filter((recipe) => Number.isInteger(recipe.id) && recipe.id > 0);
    if (plannedRecipes.length === 0) {
      Alert.alert("Calendrier", "Ce meal plan ne contient pas de recette exploitable pour la liste de courses.");
      return;
    }

    setSaving(true);
    try {
      const payload = await loadShoppingLists();
      if (!payload.can_manage) {
        Alert.alert("Calendrier", "Seul un parent peut modifier la liste de courses.");
        return;
      }

      setShoppingLists(payload.lists);
      setSelectedShoppingListId(resolvePreferredShoppingListId(payload.lists));
      setUseNewShoppingList(payload.lists.length === 0);
      setNewShoppingListTitle(defaultShoppingListTitle());
      setPendingMealPlanForShopping(entry);
      const openedFromDayProgram = dayProgramModalVisible;
      setRestoreDayProgramAfterShoppingPicker(openedFromDayProgram);
      if (openedFromDayProgram) {
        setDayProgramModalVisible(false);
        InteractionManager.runAfterInteractions(() => {
          setShoppingPickerVisible(true);
        });
      } else {
        setShoppingPickerVisible(true);
      }
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de charger les listes de courses.");
    } finally {
      setSaving(false);
    }
  };

  const closeMealPlanShoppingListPicker = () => {
    if (saving) return;
    setShoppingPickerVisible(false);
    setPendingMealPlanForShopping(null);
    if (restoreDayProgramAfterShoppingPicker) {
      setDayProgramModalVisible(true);
      setRestoreDayProgramAfterShoppingPicker(false);
    }
  };

  const confirmMealPlanShoppingListSelection = async () => {
    if (!pendingMealPlanForShopping) {
      return;
    }

    const plannedRecipes = pendingMealPlanForShopping.recipes
      .filter((recipe) => Number.isInteger(recipe.id) && recipe.id > 0)
      .map((recipe) => ({ recipeId: recipe.id, servings: clamp(Number(recipe.servings) || 1, 1, 30) }));

    if (plannedRecipes.length === 0) {
      Alert.alert("Calendrier", "Aucune recette exploitable dans ce meal plan.");
      return;
    }

    setSaving(true);
    try {
      let targetListId = selectedShoppingListId;
      let targetListTitle = shoppingLists.find((list) => list.id === selectedShoppingListId)?.title ?? "";

      if (useNewShoppingList) {
        const created = await createShoppingList(newShoppingListTitle);
        if (!created?.id) {
          Alert.alert("Calendrier", "Impossible de créer la nouvelle liste.");
          return;
        }
        targetListId = created.id;
        targetListTitle = created.title;
      }

      if (!targetListId) {
        Alert.alert("Calendrier", "Choisis une liste existante ou crée-en une nouvelle.");
        return;
      }

      const ingredients = await buildShoppingIngredientsFromRecipeSelections(plannedRecipes);
      if (ingredients.length === 0) {
        Alert.alert("Calendrier", "Aucun ingrédient exploitable à ajouter.");
        return;
      }

      const addedCount = await addIngredientsToShoppingList(targetListId, ingredients);
      setShoppingPickerVisible(false);
      setPendingMealPlanForShopping(null);
      if (restoreDayProgramAfterShoppingPicker) {
        setDayProgramModalVisible(true);
        setRestoreDayProgramAfterShoppingPicker(false);
      }

      Alert.alert(
        "Calendrier",
        `${addedCount} ingrédient(s) ajouté(s) ? "${targetListTitle}".`,
        [
          { text: "Fermer", style: "cancel" },
          { text: "Voir la liste", onPress: () => router.push(`/meal/shopping-list/${targetListId}`) },
        ]
      );
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'ajouter les ingrédients à la liste de courses.");
    } finally {
      setSaving(false);
    }
  };

  const toggleTaskInstance = async (task: CalendarTaskInstance) => {
    if (!task.permissions.can_toggle) {
      return;
    }

    const nextStatus = isTaskStatus(task.status, TASK_STATUS_DONE) ? TASK_STATUS_TODO : TASK_STATUS_DONE;

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de mettre à jour cette tâche.");
    } finally {
      setSaving(false);
    }
  };

  const validateTaskInstance = async (task: CalendarTaskInstance) => {
    if (!task.permissions.can_validate || task.validated_by_parent) {
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/tasks/instances/${task.id}/validate`, {
        method: "POST",
      });
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de valider cette tâche.");
    } finally {
      setSaving(false);
    }
  };

  const handleDayPress = (isoDate: string) => {
    setSelectedDate(isoDate);

    const hasEntries =
      (eventCountByDay[isoDate] ?? 0) > 0
      || (mealCountByDay[isoDate] ?? 0) > 0
      || (taskCountByDay[isoDate] ?? 0) > 0;

    if (hasEntries) {
      setDayProgramModalVisible(true);
      return;
    }

    openNewEventModal(isoDate);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Calendrier familial</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Événements du foyer, tâches à effectuer, repas validés et partage inter-foyers.
            </Text>
          </View>
          {canManageHouseholdConfig ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=calendar")}
              style={[styles.settingsBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {!calendarEnabled ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Module désactivé</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
            Active le module calendrier dans la configuration du foyer pour afficher l&apos;agenda partagé.
          </Text>
          {canManageHouseholdConfig ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=calendar")}
              style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
            >
              <Text style={styles.primaryBtnText}>Configurer le foyer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.events}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Événements</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.shared}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Partages</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.meals}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Repas planifiés</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                style={[styles.calendarNavBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                onPress={() => setMonthCursor((prev) => startOfMonth(addMonths(prev, -1)))}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color={theme.tint} />
              </TouchableOpacity>
              <Text style={[styles.calendarMonthText, { color: theme.text }]}>{formatMonthLabel(monthCursor)}</Text>
              <TouchableOpacity
                style={[styles.calendarNavBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                onPress={() => setMonthCursor((prev) => startOfMonth(addMonths(prev, 1)))}
              >
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.tint} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {WEEK_DAYS.map((weekday) => (
                <Text key={weekday} style={[styles.calendarWeekdayText, { color: theme.textSecondary }]}>
                  {weekday}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day) => {
                const iso = toIsoDate(day);
                const isSelected = iso === selectedDate;
                const inCurrentMonth = isSameMonth(day, monthCursor);
                const eventCount = eventCountByDay[iso] ?? 0;
                const mealCount = mealCountByDay[iso] ?? 0;
                const taskCount = taskCountByDay[iso] ?? 0;
                const isToday = iso === todayIso;

                return (
                  <View key={iso} style={styles.calendarCell}>
                    <TouchableOpacity
                      style={[
                        styles.calendarDayBtn,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        !inCurrentMonth && { opacity: 0.45 },
                        isSelected && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                      ]}
                      onPress={() => handleDayPress(iso)}
                    >
                      <View style={styles.calendarDayInner}>
                        <View
                          style={[
                            styles.calendarDayNumberBadge,
                            isToday && { backgroundColor: isSelected ? `${theme.tint}22` : `${theme.accentWarm}28` },
                          ]}
                        >
                          <Text style={[styles.calendarDayText, { color: isSelected ? theme.tint : theme.text }]}>
                            {day.getDate()}
                          </Text>
                        </View>
                        <View style={styles.dayBadgesRow}>
                          {mealCount > 0 ? <View style={[styles.dayDot, { backgroundColor: "#F5A623" }]} /> : null}
                          {taskCount > 0 ? <View style={[styles.dayDot, { backgroundColor: "#7C5CFA" }]} /> : null}
                          {eventCount > 0 ? <View style={[styles.dayDot, { backgroundColor: "#4A90E2" }]} /> : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>

          <Modal visible={dayProgramModalVisible} transparent animationType="slide" onRequestClose={() => setDayProgramModalVisible(false)}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                    Programme du {formatFullDateLabel(selectedDate)}
                  </Text>
                  <View style={styles.modalHeaderActions}>
                    <TouchableOpacity
                      onPress={() => openNewEventModal(selectedDate)}
                      style={[
                        styles.modalIconBtn,
                        { borderColor: theme.icon, backgroundColor: theme.background, opacity: permissions.can_create_events ? 1 : 0.45 },
                      ]}
                      disabled={saving || !permissions.can_create_events}
                    >
                      <MaterialCommunityIcons name="plus" size={18} color={theme.tint} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDayProgramModalVisible(false)}
                      style={[styles.modalIconBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                    >
                      <MaterialCommunityIcons name="close" size={18} color={theme.tint} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={Platform.OS === "ios" ? !dateWheelVisible && !timeWheelVisible : true}
                >
                  <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={18} color="#F5A623" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Meal plan</Text>
              </View>
              {selectedDayMeals.length > 0 ? (
                selectedDayMeals.map((entry) => (
                  <View
                    key={`meal-${entry.id}`}
                    style={[styles.itemCard, { borderColor: theme.icon, backgroundColor: theme.background }]}
                  >
                    <View style={styles.itemHeaderRow}>
                      <View style={[styles.badge, { backgroundColor: `${mealTypeColor(entry.meal_type)}22` }]}>
                        <Text style={[styles.badgeText, { color: mealTypeColor(entry.meal_type) }]}>{mealTypeLabel(entry.meal_type)}</Text>
                      </View>
                      <Text style={[styles.itemMetaText, { color: theme.textSecondary, flex: 1, textAlign: "right" }]}>
                        {entry.custom_title?.trim()
                          ? "Repas libre"
                          : `${entry.recipes.length} recette${entry.recipes.length > 1 ? "s" : ""}`}
                      </Text>
                    </View>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>
                      {entry.custom_title?.trim() || entry.recipes.map((recipe) => recipe.title).join(", ")}
                    </Text>
                    {entry.note ? (
                      <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{entry.note}</Text>
                    ) : null}
                    {permissions.can_manage_meal_plan ? (
                      <View style={styles.itemActionsRow}>
                        <TouchableOpacity
                          style={[
                            styles.inlineActionBtn,
                            { borderColor: theme.icon, opacity: saving ? 0.45 : 1 },
                          ]}
                          onPress={() => void openMealPlanShoppingListPicker(entry)}
                          disabled={saving}
                        >
                          <MaterialCommunityIcons name="cart-plus" size={16} color={theme.tint} />
                          <Text style={[styles.inlineActionText, { color: theme.text }]}>Courses</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inlineActionBtn, { borderColor: theme.icon }]}
                          onPress={() => openMealPlanEditor(entry)}
                          disabled={saving}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.tint} />
                          <Text style={[styles.inlineActionText, { color: theme.text }]}>Modifier</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inlineActionBtn, { borderColor: theme.icon }]}
                          onPress={() => confirmDeleteMealPlan(entry)}
                          disabled={saving}
                        >
                          <MaterialCommunityIcons name="delete-outline" size={16} color="#D96C6C" />
                          <Text style={[styles.inlineActionText, { color: theme.text }]}>Supprimer</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Aucun repas validé pour cette journée.
                </Text>
              )}
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={18} color="#7C5CFA" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Tâches</Text>
              </View>
              {!tasksEnabled ? (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Le module tâches est désactivé pour ce foyer.
                </Text>
              ) : selectedDayTasks.length > 0 ? (
                selectedDayTasks.map((task) => (
                  <View
                    key={`task-${task.id}`}
                    style={[styles.itemCard, { borderColor: theme.icon, backgroundColor: theme.background }]}
                  >
                    <View style={styles.itemHeaderRow}>
                      <Text style={[styles.itemTitle, { color: theme.text, flex: 1 }]}>{task.title}</Text>
                      <View style={[styles.badge, { backgroundColor: `${taskStatusColor(task.status)}22` }]}>
                        <Text style={[styles.badgeText, { color: taskStatusColor(task.status) }]}>
                          {taskStatusLabel(task.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>Assigné ?: {task.assignee.name}</Text>
                    {task.description ? (
                      <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{task.description}</Text>
                    ) : null}
                    {task.validated_by_parent ? (
                      <Text style={[styles.itemMetaText, { color: "#2E8B78" }]}>Validée par un parent</Text>
                    ) : null}
                    {task.permissions.can_toggle || (task.permissions.can_validate && !task.validated_by_parent) ? (
                      <View style={styles.itemActionsRow}>
                        {task.permissions.can_toggle ? (
                          <TouchableOpacity
                            style={[styles.inlineActionBtn, { borderColor: theme.icon }]}
                            onPress={() => void toggleTaskInstance(task)}
                            disabled={saving}
                          >
                            <MaterialCommunityIcons
                              name={isTaskStatus(task.status, TASK_STATUS_DONE) ? "backup-restore" : "check-bold"}
                              size={16}
                              color={theme.tint}
                            />
                            <Text style={[styles.inlineActionText, { color: theme.text }]}>
                              {isTaskStatus(task.status, TASK_STATUS_DONE) ? "Remettre   faire" : "Marquer faite"}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {task.permissions.can_validate && !task.validated_by_parent ? (
                          <TouchableOpacity
                            style={[styles.inlineActionBtn, { borderColor: theme.icon }]}
                            onPress={() => void validateTaskInstance(task)}
                            disabled={saving}
                          >
                            <MaterialCommunityIcons name="check-decagram-outline" size={16} color="#2E8B78" />
                            <Text style={[styles.inlineActionText, { color: theme.text }]}>Valider</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Aucune tâche prévue pour cette journée.
                </Text>
              )}
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={theme.tint} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>événements</Text>
              </View>
              {selectedDayEvents.length > 0 ? (
                selectedDayEvents.map((event) => (
                  <View
                    key={`event-${event.id}`}
                    style={[styles.itemCard, { borderColor: theme.icon, backgroundColor: theme.background }]}
                  >
                    <View style={styles.itemHeaderRow}>
                      <Text style={[styles.itemTitle, { color: theme.text, flex: 1 }]}>{event.title}</Text>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: event.is_shared_with_other_household ? "#50BFA522" : `${theme.icon}20` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: event.is_shared_with_other_household ? "#2E8B78" : theme.textSecondary },
                          ]}
                        >
                          {event.is_shared_with_other_household ? "Partagé" : "Privé"}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                      {formatTimeRange(event.start_at, event.end_at)}
                    </Text>
                    {event.description ? (
                      <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{event.description}</Text>
                    ) : null}
                    {event.created_by?.name ? (
                      <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                        Créé par {event.created_by.name}
                      </Text>
                    ) : null}
                    {event.permissions?.can_update || event.permissions?.can_delete ? (
                      <View style={styles.itemActionsRow}>
                        {event.permissions?.can_update ? (
                          <TouchableOpacity
                            style={[styles.inlineActionBtn, { borderColor: theme.icon }]}
                            onPress={() => openEventEditor(event)}
                            disabled={saving}
                          >
                            <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.tint} />
                            <Text style={[styles.inlineActionText, { color: theme.text }]}>Modifier</Text>
                          </TouchableOpacity>
                        ) : null}
                        {event.permissions?.can_delete ? (
                          <TouchableOpacity
                            style={[styles.inlineActionBtn, { borderColor: theme.icon }]}
                            onPress={() => confirmDeleteEvent(event)}
                            disabled={saving}
                          >
                            <MaterialCommunityIcons name="delete-outline" size={16} color="#D96C6C" />
                            <Text style={[styles.inlineActionText, { color: theme.text }]}>Supprimer</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Aucun événement sur cette journée.
                </Text>
              )}
            </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
          <Modal visible={mealPlanModalVisible} transparent animationType="slide" onRequestClose={closeMealPlanModal}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Modifier le meal plan</Text>
                  <TouchableOpacity onPress={closeMealPlanModal} disabled={saving}>
                    <MaterialCommunityIcons name="close" size={22} color={theme.tint} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={mealPlanDate}
                    onChangeText={setMealPlanDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <Text style={[styles.label, { color: theme.text }]}>Moment du repas</Text>
                  <View style={styles.visibilityRow}>
                    {(["matin", "midi", "soir"] as const).map((value) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setMealPlanType(value)}
                        style={[
                          styles.visibilityChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          mealPlanType === value && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                        ]}
                      >
                        <Text style={{ color: theme.text }}>{mealTypeLabel(value)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { color: theme.text }]}>Recette</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={mealPlanSearch}
                    onChangeText={setMealPlanSearch}
                    placeholder="Rechercher une recette"
                    placeholderTextColor={theme.textSecondary}
                  />
                  {recipeOptions.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
                      {filteredRecipeOptions.map((recipe) => (
                        <TouchableOpacity
                          key={`recipe-${recipe.id}`}
                          onPress={() => {
                            setMealPlanRecipeId(recipe.id);
                            setMealPlanCustomTitle("");
                          }}
                          style={[
                            styles.recipeChip,
                            { borderColor: theme.icon, backgroundColor: theme.background },
                            mealPlanRecipeId === recipe.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                          ]}
                        >
                          <Text style={[styles.recipeChipText, { color: theme.text }]}>{recipe.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      {mealPlanSearch.trim().length > 0
                        ? "Aucune recette ne correspond à cette recherche."
                        : "Aucune recette disponible pour modifier ce meal plan."}
                    </Text>
                  )}

                  {selectedMealRecipe ? (
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>Recette choisie: {selectedMealRecipe.title}</Text>
                  ) : null}

                  <Text style={[styles.label, { color: theme.text }]}>Ou repas libre</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={mealPlanCustomTitle}
                    onChangeText={(value) => {
                      setMealPlanCustomTitle(value);
                      if (value.trim().length > 0) {
                        setMealPlanRecipeId(null);
                      }
                    }}
                    placeholder="Ex: Resto, Sandwichs, Pique-nique"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={mealPlanServings}
                    onChangeText={setMealPlanServings}
                    placeholder="Portions"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                  />

                  <TextInput
                    style={[
                      styles.input,
                      styles.inputMultiline,
                      { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon },
                    ]}
                    value={mealPlanNote}
                    onChangeText={setMealPlanNote}
                    placeholder="Note (optionnel)"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                  />
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={closeMealPlanModal}
                    style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                    disabled={saving}
                  >
                    <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleSaveMealPlan()}
                    style={[styles.primaryBtn, styles.modalPrimaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Enregistrer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <ShoppingListPickerModal
            visible={shoppingPickerVisible}
            title={pendingMealPlanForShopping ? "Ajouter ce meal plan à la liste de courses" : "Ajouter à la liste de courses"}
            confirmLabel="Ajouter les ingrédients"
            theme={theme}
            saving={saving}
            lists={shoppingLists}
            selectedListId={selectedShoppingListId}
            useNewList={useNewShoppingList}
            newListTitle={newShoppingListTitle}
            onClose={closeMealPlanShoppingListPicker}
            onSelectList={setSelectedShoppingListId}
            onToggleUseNewList={setUseNewShoppingList}
            onChangeNewListTitle={setNewShoppingListTitle}
            onConfirm={() => void confirmMealPlanShoppingListSelection()}
          />

          <Modal visible={eventModalVisible} transparent animationType="slide" onRequestClose={closeEventModal}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                    {editingEventId ? "Modifier l'événement" : createEntryType === "meal_plan" ? "Nouveau meal plan" : createEntryType === "task" ? "Nouvelle tâche" : "Nouvel événement"}
                  </Text>
                  <TouchableOpacity onPress={closeEventModal} disabled={saving}>
                    <MaterialCommunityIcons name="close" size={22} color={theme.tint} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
                  {editingEventId === null ? (
                    <>
                      <View style={styles.visibilityRow}>
                        <TouchableOpacity
                          onPress={() => selectCreateEntryType("event")}
                          style={[
                            styles.visibilityChip,
                            { borderColor: theme.icon, backgroundColor: theme.background },
                            createEntryType === "event" && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                          ]}
                        >
                          <Text style={{ color: theme.text }}>événement</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => selectCreateEntryType("meal_plan")}
                          style={[
                            styles.visibilityChip,
                            { borderColor: theme.icon, backgroundColor: theme.background },
                            createEntryType === "meal_plan" && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                            !permissions.can_manage_meal_plan && { opacity: 0.45 },
                          ]}
                          disabled={!permissions.can_manage_meal_plan}
                        >
                          <Text style={{ color: theme.text }}>Meal plan</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => selectCreateEntryType("task")}
                          style={[
                            styles.visibilityChip,
                            { borderColor: theme.icon, backgroundColor: theme.background },
                            createEntryType === "task" && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                            (!tasksEnabled || !canManageTaskInstances) && { opacity: 0.45 },
                          ]}
                          disabled={!tasksEnabled || !canManageTaskInstances}
                        >
                          <Text style={{ color: theme.text }}>Tâche</Text>
                        </TouchableOpacity>
                      </View>
                      {!permissions.can_manage_meal_plan ? (
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                          La création de meal plan est réservée à un parent.
                        </Text>
                      ) : null}
                      {!tasksEnabled ? (
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                          Le module tâches est désactivé pour ce foyer.
                        </Text>
                      ) : !canManageTaskInstances ? (
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                          La création de tâches est réservée à un parent.
                        </Text>
                      ) : null}
                    </>
                  ) : null}

                  {isEventFormMode ? (
                    <>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={eventTitle}
                    onChangeText={setEventTitle}
                    placeholder="Titre"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputMultiline,
                      { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon },
                    ]}
                    value={eventDescription}
                    onChangeText={setEventDescription}
                    placeholder="Description (optionnel)"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                  />
                  <View style={styles.timeRow}>
                    <TouchableOpacity
                      onPress={() => openDateWheel("start")}
                      style={[styles.pickerFieldBtn, styles.dateInput, { borderColor: theme.icon, backgroundColor: theme.background }]}
                      disabled={saving}
                    >
                      <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                      <Text style={[styles.pickerFieldText, { color: theme.text }]}>{eventDate}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openTimeWheel("start")}
                      style={[styles.pickerFieldBtn, styles.timeInput, { borderColor: theme.icon, backgroundColor: theme.background }]}
                      disabled={saving}
                    >
                      <MaterialCommunityIcons name="clock-time-four-outline" size={16} color={theme.textSecondary} />
                      <Text style={[styles.pickerFieldText, { color: theme.text }]}>{eventStartTime}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.timeRow}>
                    <TouchableOpacity
                      onPress={() => openDateWheel("end")}
                      style={[styles.pickerFieldBtn, styles.dateInput, { borderColor: theme.icon, backgroundColor: theme.background }]}
                      disabled={saving}
                    >
                      <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                      <Text style={[styles.pickerFieldText, { color: theme.text }]}>{eventEndDate}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openTimeWheel("end")}
                      style={[styles.pickerFieldBtn, styles.timeInput, { borderColor: theme.icon, backgroundColor: theme.background }]}
                      disabled={saving}
                    >
                      <MaterialCommunityIcons name="clock-time-four-outline" size={16} color={theme.textSecondary} />
                      <Text style={[styles.pickerFieldText, { color: theme.text }]}>{eventEndTime}</Text>
                    </TouchableOpacity>
                  </View>

                  {dateWheelVisible ? (
                    <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                      <Text style={[styles.label, { color: theme.text }]}>
                        {dateWheelTarget === "start" ? "Choisir la date de début" : "Choisir la date de fin"}
                      </Text>

                      <View style={styles.wheelRow}>
                        <View style={styles.wheelColumn}>
                          <ScrollView
                            ref={dayWheelRef}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                            snapToInterval={WHEEL_ITEM_HEIGHT}
                            decelerationRate="fast"
                            scrollEventThrottle={32}
                            contentContainerStyle={styles.wheelContentContainer}
                            onScroll={(event) => {
                              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, dayOptions.length);
                              if (index === dateWheelDayIndexRef.current) {
                                return;
                              }
                              dateWheelDayIndexRef.current = index;
                              setDateWheelDay(dayOptions[index]);
                            }}
                          >
                            {dayOptions.map((value) => (
                              <View key={`wheel-day-${value}`} style={styles.wheelItem}>
                                <Text
                                  style={[
                                    styles.wheelItemText,
                                    { color: dateWheelDay === value ? theme.text : theme.textSecondary },
                                    dateWheelDay === value && styles.wheelItemTextSelected,
                                  ]}
                                >
                                  {`${weekDayShortLabel(dateWheelYear, dateWheelMonth, value)} ${pad(value)}`}
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
                            ref={monthWheelRef}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                            snapToInterval={WHEEL_ITEM_HEIGHT}
                            decelerationRate="fast"
                            scrollEventThrottle={32}
                            contentContainerStyle={styles.wheelContentContainer}
                            onScroll={(event) => {
                              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, monthOptions.length);
                              if (index === dateWheelMonthIndexRef.current) {
                                return;
                              }
                              dateWheelMonthIndexRef.current = index;
                              setDateWheelMonth(monthOptions[index]);
                            }}
                          >
                            {monthOptions.map((value) => (
                              <View key={`wheel-month-${value}`} style={styles.wheelItem}>
                                <Text
                                  style={[
                                    styles.wheelItemText,
                                    { color: dateWheelMonth === value ? theme.text : theme.textSecondary },
                                    dateWheelMonth === value && styles.wheelItemTextSelected,
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
                            ref={yearWheelRef}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                            snapToInterval={WHEEL_ITEM_HEIGHT}
                            decelerationRate="fast"
                            scrollEventThrottle={32}
                            contentContainerStyle={styles.wheelContentContainer}
                            onScroll={(event) => {
                              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, yearOptions.length);
                              if (index === dateWheelYearIndexRef.current) {
                                return;
                              }
                              dateWheelYearIndexRef.current = index;
                              setDateWheelYear(yearOptions[index]);
                            }}
                          >
                            {yearOptions.map((value) => (
                              <View key={`wheel-year-${value}`} style={styles.wheelItem}>
                                <Text
                                  style={[
                                    styles.wheelItemText,
                                    { color: dateWheelYear === value ? theme.text : theme.textSecondary },
                                    dateWheelYear === value && styles.wheelItemTextSelected,
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

                  {timeWheelVisible ? (
                    <View style={[styles.inlineWheelPanel, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                      <Text style={[styles.label, { color: theme.text }]}>
                        {timeWheelTarget === "start" ? "Choisir l'heure de début" : "Choisir l'heure de fin"}
                      </Text>

                      <View style={styles.wheelRow}>
                        <View style={styles.wheelColumn}>
                          <ScrollView
                            ref={hourWheelRef}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                            snapToInterval={WHEEL_ITEM_HEIGHT}
                            decelerationRate="fast"
                            scrollEventThrottle={32}
                            contentContainerStyle={styles.wheelContentContainer}
                            onScroll={(event) => {
                              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, hourOptions.length);
                              if (index === timeWheelHourIndexRef.current) {
                                return;
                              }
                              timeWheelHourIndexRef.current = index;
                              setTimeWheelHourIndex(index);
                              setTimeWheelHour(hourOptions[index]);
                            }}
                            onMomentumScrollEnd={(event) => {
                              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, hourOptions.length);
                              const value = hourOptions[index];
                              const middleIndex = TIME_WHEEL_MIDDLE_CYCLE * 24 + value;
                              if (Math.abs(index - middleIndex) > 48) {
                                hourWheelRef.current?.scrollTo({ y: middleIndex * WHEEL_ITEM_HEIGHT, animated: false });
                                timeWheelHourIndexRef.current = middleIndex;
                                setTimeWheelHourIndex(middleIndex);
                              }
                            }}
                          >
                            {hourOptions.map((value, index) => (
                              <View key={`wheel-hour-${index}`} style={styles.wheelItem}>
                                <Text
                                  style={[
                                    styles.wheelItemText,
                                    { color: timeWheelHourIndex === index ? theme.text : theme.textSecondary },
                                    timeWheelHourIndex === index && styles.wheelItemTextSelected,
                                  ]}
                                >
                                  {pad(value)}
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
                            ref={minuteWheelRef}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={false}
                            snapToInterval={WHEEL_ITEM_HEIGHT}
                            decelerationRate="fast"
                            scrollEventThrottle={32}
                            contentContainerStyle={styles.wheelContentContainer}
                            onScroll={(event) => {
                              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, minuteOptions.length);
                              if (index === timeWheelMinuteIndexRef.current) {
                                return;
                              }
                              timeWheelMinuteIndexRef.current = index;
                              setTimeWheelMinuteIndex(index);
                              setTimeWheelMinute(minuteOptions[index]);
                            }}
                            onMomentumScrollEnd={(event) => {
                              const index = wheelIndexFromOffset(event.nativeEvent.contentOffset.y, minuteOptions.length);
                              const value = minuteOptions[index];
                              const middleIndex = TIME_WHEEL_MIDDLE_CYCLE * 60 + value;
                              if (Math.abs(index - middleIndex) > 120) {
                                minuteWheelRef.current?.scrollTo({ y: middleIndex * WHEEL_ITEM_HEIGHT, animated: false });
                                timeWheelMinuteIndexRef.current = middleIndex;
                                setTimeWheelMinuteIndex(middleIndex);
                              }
                            }}
                          >
                            {minuteOptions.map((value, index) => (
                              <View key={`wheel-minute-${index}`} style={styles.wheelItem}>
                                <Text
                                  style={[
                                    styles.wheelItemText,
                                    { color: timeWheelMinuteIndex === index ? theme.text : theme.textSecondary },
                                    timeWheelMinuteIndex === index && styles.wheelItemTextSelected,
                                  ]}
                                >
                                  {pad(value)}
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

                  <Text style={[styles.label, { color: theme.text }]}>Visibilité inter-foyers</Text>
                  <View style={styles.visibilityRow}>
                    <TouchableOpacity
                      onPress={() => setShareWithOtherHousehold(false)}
                      style={[
                        styles.visibilityChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        !shareWithOtherHousehold && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                      ]}
                    >
                      <Text style={{ color: theme.text }}>Privé au foyer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (permissions.can_share_with_other_household) {
                          setShareWithOtherHousehold(true);
                        }
                      }}
                      style={[
                        styles.visibilityChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        shareWithOtherHousehold && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                        !permissions.can_share_with_other_household && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={{ color: theme.text }}>Partager</Text>
                    </TouchableOpacity>
                  </View>

                  {!settings.shared_view_enabled ? (
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      Le partage inter-foyers est désactivé dans la configuration du foyer.
                    </Text>
                  ) : !permissions.can_share_with_other_household ? (
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      Le partage d&apos;un événement vers un autre foyer est réservé à un parent.
                    </Text>
                  ) : (
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      Choisis si cet événement doit rester interne au foyer ou être visible dans l&apos;autre foyer.
                    </Text>
                  )}
                    </>
                  ) : createEntryType === "meal_plan" ? (
                    <>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        value={mealPlanDate}
                        onChangeText={setMealPlanDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={theme.textSecondary}
                      />

                      <Text style={[styles.label, { color: theme.text }]}>Moment du repas</Text>
                      <View style={styles.visibilityRow}>
                        {(["matin", "midi", "soir"] as const).map((value) => (
                          <TouchableOpacity
                            key={`new-meal-type-${value}`}
                            onPress={() => setMealPlanType(value)}
                            style={[
                              styles.visibilityChip,
                              { borderColor: theme.icon, backgroundColor: theme.background },
                              mealPlanType === value && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                            ]}
                          >
                            <Text style={{ color: theme.text }}>{mealTypeLabel(value)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={[styles.label, { color: theme.text }]}>Recette</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        value={mealPlanSearch}
                        onChangeText={setMealPlanSearch}
                        placeholder="Rechercher une recette"
                        placeholderTextColor={theme.textSecondary}
                      />
                      {recipeOptions.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
                          {filteredRecipeOptions.map((recipe) => (
                            <TouchableOpacity
                              key={`new-recipe-${recipe.id}`}
                              onPress={() => {
                                setMealPlanRecipeId(recipe.id);
                                setMealPlanCustomTitle("");
                              }}
                              style={[
                                styles.recipeChip,
                                { borderColor: theme.icon, backgroundColor: theme.background },
                                mealPlanRecipeId === recipe.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                              ]}
                            >
                              <Text style={[styles.recipeChipText, { color: theme.text }]}>{recipe.title}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                          {mealPlanSearch.trim().length > 0
                            ? "Aucune recette ne correspond à cette recherche."
                            : "Aucune recette disponible."}
                        </Text>
                      )}

                      {selectedMealRecipe ? (
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>Recette choisie: {selectedMealRecipe.title}</Text>
                      ) : null}

                      <Text style={[styles.label, { color: theme.text }]}>Ou repas libre</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        value={mealPlanCustomTitle}
                        onChangeText={(value) => {
                          setMealPlanCustomTitle(value);
                          if (value.trim().length > 0) {
                            setMealPlanRecipeId(null);
                          }
                        }}
                        placeholder="Ex: Resto, Sandwichs, Pique-nique"
                        placeholderTextColor={theme.textSecondary}
                      />

                      <TextInput
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        value={mealPlanServings}
                        onChangeText={setMealPlanServings}
                        placeholder="Portions"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="numeric"
                      />

                      <TextInput
                        style={[
                          styles.input,
                          styles.inputMultiline,
                          { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon },
                        ]}
                        value={mealPlanNote}
                        onChangeText={setMealPlanNote}
                        placeholder="Note (optionnel)"
                        placeholderTextColor={theme.textSecondary}
                        multiline
                      />
                    </>
                  ) : (
                    <>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        value={taskTitle}
                        onChangeText={setTaskTitle}
                        placeholder="Titre de la tâche"
                        placeholderTextColor={theme.textSecondary}
                      />
                      <TextInput
                        style={[
                          styles.input,
                          styles.inputMultiline,
                          { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon },
                        ]}
                        value={taskDescription}
                        onChangeText={setTaskDescription}
                        placeholder="Description (optionnel)"
                        placeholderTextColor={theme.textSecondary}
                        multiline
                      />
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        value={taskDueDate}
                        onChangeText={setTaskDueDate}
                        placeholder="Date d'échéance (YYYY-MM-DD)"
                        placeholderTextColor={theme.textSecondary}
                      />
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                        value={taskEndDate}
                        onChangeText={setTaskEndDate}
                        placeholder="Date de fin (YYYY-MM-DD)"
                        placeholderTextColor={theme.textSecondary}
                      />
                      <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
                      {assignableTaskMembers.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
                          {assignableTaskMembers.map((member) => (
                            <TouchableOpacity
                              key={`task-assignee-${member.id}`}
                              onPress={() => setTaskAssigneeId(member.id)}
                              style={[
                                styles.recipeChip,
                                { borderColor: theme.icon, backgroundColor: theme.background },
                                taskAssigneeId === member.id && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                              ]}
                            >
                              <Text style={[styles.recipeChipText, { color: theme.text }]}>{member.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                          Aucun membre disponible pour l&apos;attribution.
                        </Text>
                      )}
                    </>
                  )}
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={closeEventModal}
                    style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                    disabled={saving}
                  >
                    <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleSaveFromModal()}
                    style={[styles.primaryBtn, styles.modalPrimaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                    disabled={saving || !canSubmitCreateModal}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {editingEventId ? "Enregistrer" : "Ajouter"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
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
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  modalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontSize: 13,
    fontWeight: "700",
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  calendarNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthText: {
    fontSize: 17,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  calendarWeekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -3,
  },
  calendarCell: {
    width: "14.2857%",
    padding: 3,
  },
  calendarDayBtn: {
    width: "100%",
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 5,
  },
  calendarDayInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  calendarDayNumberBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "700",
  },
  dayBadgesRow: {
    flexDirection: "row",
    gap: 3,
    minHeight: 6,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionBlock: {
    marginTop: 8,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemMetaText: {
    fontSize: 12,
    lineHeight: 18,
  },
  itemActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  inlineActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
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
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  inputMultiline: {
    minHeight: 84,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  timeRow: {
    flexDirection: "row",
    gap: 8,
  },
  dateInput: {
    flex: 1,
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
  timeInput: {
    width: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  visibilityChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  recipePickerRow: {
    gap: 8,
    paddingBottom: 10,
  },
  recipeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  recipeChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    borderRadius: 16,
    maxHeight: "85%",
    padding: 14,
  },
  wheelModalCard: {
    borderRadius: 16,
    padding: 14,
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
  modalScroll: {
    maxHeight: 480,
  },
  modalContent: {
    paddingBottom: 4,
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalPrimaryBtn: {
    flex: 1,
    marginTop: 0,
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
});









