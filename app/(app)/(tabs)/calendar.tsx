import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { WheelDatePicker, WheelTimePicker } from "@/src/components/ui/WheelDatePicker";
import { MEAL_TYPES, mealTypeColor, mealTypeLabel, type MealType } from "@/src/features/calendar/calendar-types";
import { calendarStyles as styles } from "@/src/features/calendar/calendar-screen.styles";
import { useDebounce } from "@/src/hooks/useDebounce";
import { mergeUniqueRecipes } from "@/src/features/recipes/recipe-utils";
import { useRecipeSearch } from "@/src/hooks/useRecipeSearch";
import { subscribeToHouseholdRealtime, subscribeToUserRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  createMealPlanEntry,
  deleteCalendarEvent,
  deleteMealPlanEntry,
  fetchCalendarBoardForRange,
  saveCalendarEvent,
  submitCalendarEventParticipation,
  submitMealPlanAttendance,
  updateMealPlanEntry,
} from "@/src/services/calendarService";
import {
  createTaskInstance,
  fetchTasksBoardForRange,
  updateTaskInstance,
  validateTaskInstance as validateTaskInstanceService,
} from "@/src/services/tasksService";
import {
  addDays,
  endOfMonth,
  isSameMonth,
  parseOptionalIsoDate,
  startOfMonth,
  startOfWeekMonday,
  toIsoDate,
  todayIso,
} from "@/src/utils/date";
import {
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
  my_participation?: {
    status: "participate" | "not_participate";
    reason?: string | null;
    responded_at?: string | null;
  } | null;
  participation_overview?: {
    participate?: { id: number; name: string; reason?: string | null }[];
    not_participate?: { id: number; name: string; reason?: string | null }[];
    unanswered?: { id: number; name: string }[];
  } | null;
  permissions?: {
    can_update: boolean;
    can_delete: boolean;
    can_confirm_participation?: boolean;
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
  meal_type: MealType;
  custom_title?: string | null;
  note?: string | null;
  my_presence?: {
    status: "present" | "not_home" | "later";
    reason?: string | null;
    responded_at?: string | null;
  } | null;
  presence_overview?: {
    present?: { id: number; name: string; reason?: string | null }[];
    not_home?: { id: number; name: string; reason?: string | null }[];
    later?: { id: number; name: string; reason?: string | null }[];
    unanswered?: { id: number; name: string }[];
  } | null;
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
  assignees?: {
    id: number;
    name: string;
  }[];
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
    can_confirm_meal_presence?: boolean;
    can_confirm_event_participation?: boolean;
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
type DateWheelTarget = "event_start" | "event_end" | "task_start" | "task_end" | "meal_date";
type MealPresenceStatus = "present" | "not_home" | "later";
type EventParticipationStatus = "participate" | "not_participate";
type ReasonAction =
  | { kind: "meal"; mealPlanId: number; status: Extract<MealPresenceStatus, "not_home" | "later"> }
  | { kind: "event"; eventId: number; status: "not_participate" };

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const TASK_STATUS_TODO = "à faire";
const TASK_STATUS_DONE = "réalisée";
const TASK_STATUS_CANCELLED = "annulée";

const pad = (value: number) => String(value).padStart(2, "0");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);
  return next;
};

const endOfWeekSunday = (date: Date) => addDays(startOfWeekMonday(date), 6);

const mealPresenceLabel = (value: MealPresenceStatus) => {
  if (value === "present") return "Je participe";
  if (value === "not_home") return "Pas à la maison";
  return "Je mangerai plus tard";
};

const eventParticipationLabel = (value: EventParticipationStatus) => {
  if (value === "participate") return "Je participe";
  return "Je ne participe pas";
};

const formatMemberList = (members?: { name: string; reason?: string | null }[] | null) => {
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

const taskAssigneeNames = (task: CalendarTaskInstance) => {
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

const isCalendarTaskAssignedToUser = (task: CalendarTaskInstance, userId: number) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    return false;
  }

  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    return task.assignees.some((assignee) => assignee.id === userId);
  }

  return Number(task.assignee?.id ?? 0) === userId;
};

const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString("fr-BE", {
    month: "long",
    year: "numeric",
  });

const formatFullDateLabel = (isoDate: string) => {
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
  const { householdId, role } = useStoredUserState();
  const canManageHouseholdConfig = role === "parent";

  const todayIsoValue = useMemo(() => todayIso(), []);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIsoValue);

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

  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState(todayIsoValue);
  const [eventEndDate, setEventEndDate] = useState(todayIsoValue);
  const [eventStartTime, setEventStartTime] = useState("18:00");
  const [eventEndTime, setEventEndTime] = useState("19:00");
  const [shareWithOtherHousehold, setShareWithOtherHousehold] = useState(false);
  const [createEntryType, setCreateEntryType] = useState<CreateEntryType>("event");
  const [dateWheelVisible, setDateWheelVisible] = useState(false);
  const [dateWheelTarget, setDateWheelTarget] = useState<DateWheelTarget>("event_start");
  const [timeWheelVisible, setTimeWheelVisible] = useState(false);
  const [timeWheelTarget, setTimeWheelTarget] = useState<"start" | "end">("start");

  const [editingMealPlanId, setEditingMealPlanId] = useState<number | null>(null);
  const [mealPlanDate, setMealPlanDate] = useState(todayIsoValue);
  const [mealPlanType, setMealPlanType] = useState<MealType>("soir");
  const [mealPlanRecipeId, setMealPlanRecipeId] = useState<number | null>(null);
  const [mealPlanSearch, setMealPlanSearch] = useState("");
  const debouncedMealPlanSearch = useDebounce(mealPlanSearch, 400);
  const [mealPlanCustomTitle, setMealPlanCustomTitle] = useState("");
  const [mealPlanServings, setMealPlanServings] = useState("4");
  const [mealPlanNote, setMealPlanNote] = useState("");
  const [dayProgramModalVisible, setDayProgramModalVisible] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [mealPlanModalVisible, setMealPlanModalVisible] = useState(false);
  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [pendingReasonAction, setPendingReasonAction] = useState<ReasonAction | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [restoreDayProgramAfterReasonModal, setRestoreDayProgramAfterReasonModal] = useState(false);
  const [shoppingPickerVisible, setShoppingPickerVisible] = useState(false);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListSummary[]>([]);
  const [selectedShoppingListId, setSelectedShoppingListId] = useState<number | null>(null);
  const [useNewShoppingList, setUseNewShoppingList] = useState(false);
  const [newShoppingListTitle, setNewShoppingListTitle] = useState(defaultShoppingListTitle());
  const [pendingMealPlanForShopping, setPendingMealPlanForShopping] = useState<MealPlanEntry | null>(null);
  const [restoreDayProgramAfterShoppingPicker, setRestoreDayProgramAfterShoppingPicker] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(todayIsoValue);
  const [taskEndDate, setTaskEndDate] = useState(todayIsoValue);

  const mealPlanRecipeSearch = useRecipeSearch({
    householdId,
    query: debouncedMealPlanSearch,
    scope: "all",
    limit: 10,
  });

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

  const openDateWheel = (target: DateWheelTarget) => {
    if (dateWheelVisible && dateWheelTarget === target) {
      setDateWheelVisible(false);
      return;
    }

    setDateWheelTarget(target);
    setTimeWheelVisible(false);
    setDateWheelVisible(true);
  };

  const openTimeWheel = (target: "start" | "end") => {
    if (timeWheelVisible && timeWheelTarget === target) {
      setTimeWheelVisible(false);
      return;
    }

    setTimeWheelTarget(target);
    setDateWheelVisible(false);
    setTimeWheelVisible(true);
  };

  const handleDateWheelChange = useCallback((nextIsoDate: string) => {
    if (dateWheelTarget === "event_start") {
      const nextEventEndDate = eventEndDate < nextIsoDate ? nextIsoDate : eventEndDate;
      if (eventDate !== nextIsoDate) {
        setEventDate(nextIsoDate);
      }
      if (eventEndDate !== nextEventEndDate) {
        setEventEndDate(nextEventEndDate);
      }
      return;
    }
    if (dateWheelTarget === "event_end") {
      const nextEventDate = eventDate > nextIsoDate ? nextIsoDate : eventDate;
      if (eventEndDate !== nextIsoDate) {
        setEventEndDate(nextIsoDate);
      }
      if (eventDate !== nextEventDate) {
        setEventDate(nextEventDate);
      }
      return;
    }
    if (dateWheelTarget === "task_start") {
      const nextTaskEndDate = taskEndDate < nextIsoDate ? nextIsoDate : taskEndDate;
      if (taskDueDate !== nextIsoDate) {
        setTaskDueDate(nextIsoDate);
      }
      if (taskEndDate !== nextTaskEndDate) {
        setTaskEndDate(nextTaskEndDate);
      }
      return;
    }
    if (dateWheelTarget === "task_end") {
      const normalizedTaskEndDate = nextIsoDate < taskDueDate ? taskDueDate : nextIsoDate;
      if (taskEndDate !== normalizedTaskEndDate) {
        setTaskEndDate(normalizedTaskEndDate);
      }
      return;
    }

    if (mealPlanDate !== nextIsoDate) {
      setMealPlanDate(nextIsoDate);
    }
  }, [dateWheelTarget, eventDate, eventEndDate, mealPlanDate, taskDueDate, taskEndDate]);

  const handleTimeWheelChange = useCallback((nextTime: string) => {
    if (timeWheelTarget === "start") {
      if (eventStartTime !== nextTime) {
        setEventStartTime(nextTime);
      }
      return;
    }

    if (eventEndTime !== nextTime) {
      setEventEndTime(nextTime);
    }
  }, [eventEndTime, eventStartTime, timeWheelTarget]);

  const dateWheelValue = useMemo(() => {
    if (dateWheelTarget === "event_start") return eventDate;
    if (dateWheelTarget === "event_end") return eventEndDate;
    if (dateWheelTarget === "task_start") return taskDueDate;
    if (dateWheelTarget === "task_end") return taskEndDate;
    return mealPlanDate;
  }, [dateWheelTarget, eventDate, eventEndDate, mealPlanDate, taskDueDate, taskEndDate]);

  const timeWheelValue = useMemo(
    () => (timeWheelTarget === "start" ? eventStartTime : eventEndTime),
    [eventEndTime, eventStartTime, timeWheelTarget]
  );


  const loadBoard = useCallback(async (options?: { silent?: boolean; bypassCache?: boolean }) => {
    const silent = options?.silent ?? hasLoadedOnceRef.current;
    const bypassCache = options?.bypassCache === true;
    if (!silent) {
      setLoading(true);
    }

    try {
      const [calendarResult, tasksResult] = await Promise.allSettled([
        fetchCalendarBoardForRange<CalendarBoardPayload>(calendarRange.from, calendarRange.to, {
          cacheTtlMs: 12_000,
          bypassCache,
        }),
        fetchTasksBoardForRange<TaskBoardPayload>(calendarRange.from, calendarRange.to, {
          cacheTtlMs: 12_000,
          bypassCache,
        }),
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

      const recipesFromMealPlan = (Array.isArray(payload?.meal_plan) ? payload.meal_plan : [])
        .flatMap((entry) => (Array.isArray(entry?.recipes) ? entry.recipes : []))
        .map((recipe) => ({
          id: Number(recipe?.id ?? 0),
          title: String(recipe?.title ?? "").trim(),
          type: recipe?.type ? String(recipe.type) : null,
        }))
        .filter((recipe) => Number.isInteger(recipe.id) && recipe.id > 0 && recipe.title.length > 0);

      setRecipes((previousRecipes) => mergeUniqueRecipes(previousRecipes, recipesFromMealPlan));

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
    if (!householdId) {
      return () => {};
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const setupRealtime = async () => {
      const unsubscribe = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        const module = String(message?.module ?? "");
        if (module !== "calendar" && module !== "tasks") {
          return;
        }
        void loadBoard({ silent: true, bypassCache: true });
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
  }, [householdId, loadBoard]);

  useEffect(() => {
    const parsedUserId = Number(taskCurrentUserId ?? 0);
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

        void loadBoard({ silent: true, bypassCache: true });
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
  }, [loadBoard, taskCurrentUserId]);

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
    const selected = parseOptionalIsoDate(selectedDate);
    if (!selected || Number.isNaN(selected.getTime())) {
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

  useEffect(() => {
    if (!Array.isArray(mealPlanRecipeSearch.results) || mealPlanRecipeSearch.results.length === 0) {
      return;
    }

    setRecipes((previousRecipes) => mergeUniqueRecipes(previousRecipes, mealPlanRecipeSearch.results));
  }, [mealPlanRecipeSearch.results]);

  const recipeOptions = useMemo(() => {
    const trimmedSearch = mealPlanSearch.trim();
    if (trimmedSearch.length === 0) {
      return [] as RecipeOption[];
    }

    return [...mealPlanRecipeSearch.results].sort((left, right) => left.title.localeCompare(right.title, "fr-BE"));
  }, [mealPlanRecipeSearch.results, mealPlanSearch]);
  const filteredRecipeOptions = recipeOptions;

  const eventCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};

    events.forEach((event) => {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
      }

      let cursor = parseOptionalIsoDate(toIsoDate(start));
      if (!cursor) {
        return;
      }
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

  const visibleTaskInstances = useMemo(() => {
    if (taskCurrentUserRole === "parent") {
      return taskInstances;
    }

    if (taskCurrentUserId === null) {
      return [];
    }

    return taskInstances.filter((task) => isCalendarTaskAssignedToUser(task, taskCurrentUserId));
  }, [taskCurrentUserId, taskCurrentUserRole, taskInstances]);

  const taskCountByDay = useMemo(() => {
    return visibleTaskInstances.reduce<Record<string, number>>((acc, task) => {
      if (!task.due_date) {
        return acc;
      }
      acc[task.due_date] = (acc[task.due_date] ?? 0) + 1;
      return acc;
    }, {});
  }, [visibleTaskInstances]);

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
    return visibleTaskInstances
      .filter((task) => task.due_date === selectedDate)
      .sort((left, right) => {
        const assigneeCompare = taskAssigneeNames(left).localeCompare(taskAssigneeNames(right));
        if (assigneeCompare !== 0) {
          return assigneeCompare;
        }
        return left.title.localeCompare(right.title);
      });
  }, [selectedDate, visibleTaskInstances]);

  const renderSelectedDayMealItem = useCallback(
    ({ item: entry }: { item: MealPlanEntry }) => (
      <View
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
        {settings.absence_tracking_enabled ? (
          <>
            <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
              {entry.my_presence
                ? `Votre présence: ${mealPresenceLabel(entry.my_presence.status)}`
                : "Votre présence n'est pas encore confirmée."}
            </Text>
            {entry.my_presence?.reason ? (
              <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                Justification: {entry.my_presence.reason}
              </Text>
            ) : null}
            <View style={styles.itemActionsRow}>
              <TouchableOpacity
                style={[
                  styles.inlineActionBtn,
                  { borderColor: theme.icon },
                  entry.my_presence?.status === "present" && {
                    borderColor: theme.tint,
                    backgroundColor: `${theme.tint}16`,
                  },
                ]}
                onPress={() => void submitMealPresence(entry.id, "present", null)}
                disabled={saving}
              >
                <Text style={[styles.inlineActionText, { color: theme.text }]}>Je participe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.inlineActionBtn,
                  { borderColor: theme.icon },
                  entry.my_presence?.status === "not_home" && {
                    borderColor: theme.tint,
                    backgroundColor: `${theme.tint}16`,
                  },
                ]}
                onPress={() => openMealReasonModal(entry, "not_home")}
                disabled={saving}
              >
                <Text style={[styles.inlineActionText, { color: theme.text }]}>Pas à la maison</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.inlineActionBtn,
                  { borderColor: theme.icon },
                  entry.my_presence?.status === "later" && {
                    borderColor: theme.tint,
                    backgroundColor: `${theme.tint}16`,
                  },
                ]}
                onPress={() => openMealReasonModal(entry, "later")}
                disabled={saving}
              >
                <Text style={[styles.inlineActionText, { color: theme.text }]}>Je mangerai plus tard</Text>
              </TouchableOpacity>
            </View>
            {entry.presence_overview ? (
              <View style={styles.inlineSummaryBlock}>
                <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                  Présents: {formatMemberList(entry.presence_overview.present)}
                </Text>
                <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                  Pas à la maison: {formatMemberList(entry.presence_overview.not_home)}
                </Text>
                <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                  Plus tard: {formatMemberList(entry.presence_overview.later)}
                </Text>
                <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                  Sans réponse: {formatMemberList(entry.presence_overview.unanswered)}
                </Text>
              </View>
            ) : null}
          </>
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
    ),
    [permissions.can_manage_meal_plan, saving, settings.absence_tracking_enabled, theme.background, theme.icon, theme.text, theme.textSecondary, theme.tint]
  );

  const renderSelectedDayTaskItem = useCallback(
    ({ item: task }: { item: CalendarTaskInstance }) => (
      <View
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
        <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>Assigné à: {taskAssigneeNames(task)}</Text>
        {task.description ? (
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{task.description}</Text>
        ) : null}
        {task.validated_by_parent ? (
          <Text style={[styles.itemMetaText, { color: "#2E8B78" }]}>Validée</Text>
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
                  {isTaskStatus(task.status, TASK_STATUS_DONE) ? "Remettre à faire" : "Marquer faite"}
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
    ),
    [saving, theme.background, theme.icon, theme.text, theme.textSecondary, theme.tint]
  );

  const renderSelectedDayEventItem = useCallback(
    ({ item: event }: { item: CalendarEvent }) => (
      <View
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
        {event.permissions?.can_confirm_participation !== false ? (
          <>
            <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
              {event.my_participation
                ? `Votre réponse: ${eventParticipationLabel(event.my_participation.status)}`
                : "Votre participation n'est pas encore confirmée."}
            </Text>
            {event.my_participation?.reason ? (
              <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                Justification: {event.my_participation.reason}
              </Text>
            ) : null}
            <View style={styles.itemActionsRow}>
              <TouchableOpacity
                style={[
                  styles.inlineActionBtn,
                  { borderColor: theme.icon },
                  event.my_participation?.status === "participate" && {
                    borderColor: theme.tint,
                    backgroundColor: `${theme.tint}16`,
                  },
                ]}
                onPress={() => void submitEventParticipation(event.id, "participate", null)}
                disabled={saving}
              >
                <Text style={[styles.inlineActionText, { color: theme.text }]}>Je participe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.inlineActionBtn,
                  { borderColor: theme.icon },
                  event.my_participation?.status === "not_participate" && {
                    borderColor: theme.tint,
                    backgroundColor: `${theme.tint}16`,
                  },
                ]}
                onPress={() => openEventReasonModal(event)}
                disabled={saving}
              >
                <Text style={[styles.inlineActionText, { color: theme.text }]}>Je ne participe pas</Text>
              </TouchableOpacity>
            </View>
            {event.participation_overview ? (
              <View style={styles.inlineSummaryBlock}>
                <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                  Participe: {formatMemberList(event.participation_overview.participate)}
                </Text>
                <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                  Ne participe pas: {formatMemberList(event.participation_overview.not_participate)}
                </Text>
                <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>
                  Sans réponse: {formatMemberList(event.participation_overview.unanswered)}
                </Text>
              </View>
            ) : null}
          </>
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
    ),
    [saving, theme.background, theme.icon, theme.text, theme.textSecondary, theme.tint]
  );

  const selectedMealRecipe = useMemo(() => {
    return recipes.find((recipe) => recipe.id === mealPlanRecipeId) ?? null;
  }, [mealPlanRecipeId, recipes]);
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
  const dateWheelTitle = useMemo(() => {
    if (dateWheelTarget === "event_start" || dateWheelTarget === "task_start") {
      return "Choisir la date de début";
    }
    if (dateWheelTarget === "event_end" || dateWheelTarget === "task_end") {
      return "Choisir la date de fin";
    }
    return "Choisir la date";
  }, [dateWheelTarget]);
  const renderDateWheelPanel = () => (
    <WheelDatePicker
      visible={dateWheelVisible}
      title={dateWheelTitle}
      value={dateWheelValue}
      onChange={handleDateWheelChange}
      theme={theme}
    />
  );

  const renderTimeWheelPanel = () => (
    <WheelTimePicker
      visible={timeWheelVisible}
      title={timeWheelTarget === "start" ? "Choisir l'heure de début" : "Choisir l'heure de fin"}
      value={timeWheelValue}
      onChange={handleTimeWheelChange}
      theme={theme}
    />
  );

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
    setTaskEndDate(eventTargetDate);
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
      setTaskEndDate((prev) => (prev < eventDate ? eventDate : prev));
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
      await saveCalendarEvent(
        {
          title: cleanTitle,
          description: eventDescription.trim() || null,
          start_at: eventRange.startAt.toISOString(),
          end_at: eventRange.endAt.toISOString(),
          is_shared_with_other_household: shareWithOtherHousehold,
        },
        editingEventId
      );

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
      Alert.alert("Calendrier", "Seul un parent peut planifier les repas.");
      return;
    }

    if (!isValidIsoDate(mealPlanDate)) {
      Alert.alert("Calendrier", "La date de planification du repas doit être au format YYYY-MM-DD.");
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
      await createMealPlanEntry({
        date: mealPlanDate,
        meal_type: mealPlanType,
        recipe_id: customTitle.length === 0 ? mealPlanRecipeId : null,
        custom_title: customTitle.length > 0 ? customTitle : null,
        servings,
        note: mealPlanNote.trim() || null,
      });

      setSelectedDate(mealPlanDate);
      setEventModalVisible(false);
      setCreateEntryType("event");
      resetEventForm();
      resetMealPlanForm();
      resetTaskForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de planifier ce repas.");
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
      await createTaskInstance({
        name: cleanTitle,
        description: taskDescription.trim() || null,
        due_date: taskDueDate,
        end_date: taskEndDate,
        user_id: assigneeId ?? undefined,
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
      await deleteCalendarEvent(eventId);
      if (editingEventId === eventId) {
        setEventModalVisible(false);
        resetEventForm();
      }
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de supprimer l' événement.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMealPlan = async () => {
    if (!editingMealPlanId) {
      return;
    }

    if (!isValidIsoDate(mealPlanDate)) {
      Alert.alert("Calendrier", "La date de planification du repas doit être au format YYYY-MM-DD.");
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
      await updateMealPlanEntry(editingMealPlanId, {
        date: mealPlanDate,
        meal_type: mealPlanType,
        recipe_id: customTitle.length === 0 ? mealPlanRecipeId : null,
        custom_title: customTitle.length > 0 ? customTitle : null,
        servings,
        note: mealPlanNote.trim() || null,
      });

      setSelectedDate(mealPlanDate);
      setMealPlanModalVisible(false);
      resetMealPlanForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de modifier ce repas.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteMealPlan = (entry: MealPlanEntry) => {
    Alert.alert("Supprimer le repas", `Supprimer le repas du ${mealTypeLabel(entry.meal_type).toLowerCase()} ?`, [
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
      await deleteMealPlanEntry(mealPlanId);
      if (editingMealPlanId === mealPlanId) {
        setMealPlanModalVisible(false);
        resetMealPlanForm();
      }
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de supprimer ce repas.");
    } finally {
      setSaving(false);
    }
  };

  const submitMealPresence = async (
    mealPlanId: number,
    status: MealPresenceStatus,
    reason?: string | null
  ): Promise<boolean> => {
    if (!settings.absence_tracking_enabled) {
      Alert.alert("Calendrier", "Le suivi des absences est désactivé pour ce foyer.");
      return false;
    }

    setSaving(true);
    try {
      await submitMealPlanAttendance(mealPlanId, {
        status,
        reason: reason?.trim() ? reason.trim() : null,
      });
      await loadBoard({ silent: true });
      return true;
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'enregistrer la présence au repas.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitEventParticipation = async (
    eventId: number,
    status: EventParticipationStatus,
    reason?: string | null
  ): Promise<boolean> => {
    setSaving(true);
    try {
      await submitCalendarEventParticipation(eventId, {
        status,
        reason: reason?.trim() ? reason.trim() : null,
      });
      await loadBoard({ silent: true });
      return true;
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'enregistrer la participation à l'événement.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const closeReasonModal = () => {
    if (saving) {
      return;
    }

    setReasonModalVisible(false);
    setPendingReasonAction(null);
    setReasonInput("");
    if (restoreDayProgramAfterReasonModal) {
      setDayProgramModalVisible(true);
      setRestoreDayProgramAfterReasonModal(false);
    }
  };

  const openMealReasonModal = (entry: MealPlanEntry, status: Extract<MealPresenceStatus, "not_home" | "later">) => {
    const existingReason = entry.my_presence?.status === status ? String(entry.my_presence?.reason ?? "") : "";
    setPendingReasonAction({ kind: "meal", mealPlanId: entry.id, status });
    setReasonInput(existingReason);
    if (dayProgramModalVisible) {
      setRestoreDayProgramAfterReasonModal(true);
      setDayProgramModalVisible(false);
      InteractionManager.runAfterInteractions(() => {
        setReasonModalVisible(true);
      });
      return;
    }
    setRestoreDayProgramAfterReasonModal(false);
    setReasonModalVisible(true);
  };

  const openEventReasonModal = (event: CalendarEvent) => {
    const existingReason = event.my_participation?.status === "not_participate"
      ? String(event.my_participation?.reason ?? "")
      : "";
    setPendingReasonAction({ kind: "event", eventId: event.id, status: "not_participate" });
    setReasonInput(existingReason);
    if (dayProgramModalVisible) {
      setRestoreDayProgramAfterReasonModal(true);
      setDayProgramModalVisible(false);
      InteractionManager.runAfterInteractions(() => {
        setReasonModalVisible(true);
      });
      return;
    }
    setRestoreDayProgramAfterReasonModal(false);
    setReasonModalVisible(true);
  };

  const confirmReasonAction = async () => {
    if (!pendingReasonAction) {
      return;
    }

    const trimmedReason = reasonInput.trim();
    let success = false;

    if (pendingReasonAction.kind === "meal") {
      success = await submitMealPresence(
        pendingReasonAction.mealPlanId,
        pendingReasonAction.status,
        trimmedReason.length > 0 ? trimmedReason : null
      );
    } else {
      success = await submitEventParticipation(
        pendingReasonAction.eventId,
        pendingReasonAction.status,
        trimmedReason.length > 0 ? trimmedReason : null
      );
    }

    if (success) {
      setReasonModalVisible(false);
      setPendingReasonAction(null);
      setReasonInput("");
      if (restoreDayProgramAfterReasonModal) {
        setDayProgramModalVisible(true);
        setRestoreDayProgramAfterReasonModal(false);
      }
    }
  };

  const openMealPlanShoppingListPicker = async (entry: MealPlanEntry) => {
    if (!permissions.can_manage_meal_plan) {
      Alert.alert("Calendrier", "Seul un parent peut ajouter un repas à la liste de courses.");
      return;
    }
    if (saving) {
      Alert.alert("Calendrier", "Une action est déjà en cours. Réessaie dans un instant.");
      return;
    }

    const plannedRecipes = entry.recipes.filter((recipe) => Number.isInteger(recipe.id) && recipe.id > 0);
    if (plannedRecipes.length === 0) {
      Alert.alert("Calendrier", "Cette planification de repas ne contient pas de recette exploitable pour la liste de courses.");
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
      Alert.alert("Calendrier", "Aucune recette exploitable dans cette planification de repas.");
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
        `${addedCount} ingrédient(s) ajouté(s) à "${targetListTitle}".`,
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
      await updateTaskInstance(task.id, { status: nextStatus });
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
      await validateTaskInstanceService(task.id);
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
    <ScrollView keyboardShouldPersistTaps="handled"
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
                const isToday = iso === todayIsoValue;

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
                <View style={styles.dayProgramHeaderRow}>
                  <Text
                    style={[
                      styles.cardTitle,
                      styles.dayProgramHeaderTitle,
                      { color: theme.text, marginBottom: 0 },
                    ]}
                  >
                    Programme du {formatFullDateLabel(selectedDate)}
                  </Text>
                  <View style={styles.dayProgramHeaderActions}>
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

                <ScrollView keyboardShouldPersistTaps="handled"
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={Platform.OS === "ios" ? !dateWheelVisible && !timeWheelVisible : true}
                >
                  <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={18} color="#F5A623" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Repas</Text>
              </View>
              {selectedDayMeals.length > 0 ? (
                <FlatList
                  data={selectedDayMeals}
                  keyExtractor={(entry) => `meal-${entry.id}`}
                  renderItem={renderSelectedDayMealItem}
                  scrollEnabled={false}
                  removeClippedSubviews
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                />
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
                <FlatList
                  data={selectedDayTasks}
                  keyExtractor={(task) => `task-${task.id}`}
                  renderItem={renderSelectedDayTaskItem}
                  scrollEnabled={false}
                  removeClippedSubviews
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                />
              ) : (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Aucune tâche prévue pour cette journée.
                </Text>
              )}
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={theme.tint} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Événements</Text>
              </View>
              {selectedDayEvents.length > 0 ? (
                <FlatList
                  data={selectedDayEvents}
                  keyExtractor={(event) => `event-${event.id}`}
                  renderItem={renderSelectedDayEventItem}
                  scrollEnabled={false}
                  removeClippedSubviews
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                />
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
          <Modal visible={reasonModalVisible} transparent animationType="fade" onRequestClose={closeReasonModal}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                    Justification optionnelle
                  </Text>
                  <TouchableOpacity onPress={closeReasonModal} disabled={saving}>
                    <MaterialCommunityIcons name="close" size={22} color={theme.tint} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.bodyText, { color: theme.textSecondary, marginBottom: 8 }]}>
                  {pendingReasonAction?.kind === "meal"
                    ? "Ajoutez un motif si vous ne participez pas au repas à la maison."
                    : "Ajoutez un motif si vous ne participez pas à l'événement."}
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    styles.inputMultiline,
                    { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon },
                  ]}
                  value={reasonInput}
                  onChangeText={setReasonInput}
                  placeholder="Ex: activité extérieure, retour tardif..."
                  placeholderTextColor={theme.textSecondary}
                  multiline
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={closeReasonModal}
                    style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                    disabled={saving}
                  >
                    <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void confirmReasonAction()}
                    style={[styles.primaryBtn, styles.modalPrimaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Confirmer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
          <Modal visible={mealPlanModalVisible} transparent animationType="slide" onRequestClose={closeMealPlanModal}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Modifier le repas</Text>
                  <TouchableOpacity onPress={closeMealPlanModal} disabled={saving}>
                    <MaterialCommunityIcons name="close" size={22} color={theme.tint} />
                  </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={mealPlanDate}
                    onChangeText={setMealPlanDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <Text style={[styles.label, { color: theme.text }]}>Moment du repas</Text>
                  <View style={styles.visibilityRow}>
                    {MEAL_TYPES.map((mealType) => (
                      <TouchableOpacity
                        key={mealType.value}
                        onPress={() => setMealPlanType(mealType.value)}
                        style={[
                          styles.visibilityChip,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          mealPlanType === mealType.value && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                        ]}
                      >
                        <Text style={{ color: theme.text }}>{mealType.label}</Text>
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
                  {mealPlanRecipeSearch.isFetching ? <ActivityIndicator size="small" color={theme.tint} /> : null}
                  {recipeOptions.length > 0 ? (
                    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
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
                        : "Aucune recette disponible pour modifier ce repas."}
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
            title={pendingMealPlanForShopping ? "Ajouter ce repas à la liste de courses" : "Ajouter à la liste de courses"}
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
                    {editingEventId ? "Modifier l'événement" : createEntryType === "meal_plan" ? "Nouveau repas" : createEntryType === "task" ? "Nouvelle tâche" : "Nouvel événement"}
                  </Text>
                  <TouchableOpacity onPress={closeEventModal} disabled={saving}>
                    <MaterialCommunityIcons name="close" size={22} color={theme.tint} />
                  </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
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
                          <Text style={{ color: theme.text }}>Événement</Text>
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
                          <Text style={{ color: theme.text }}>Repas</Text>
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
                          La planification de repas est réservée à un parent.
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
                      onPress={() => openDateWheel("event_start")}
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
                      onPress={() => openDateWheel("event_end")}
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

                  {dateWheelVisible ? renderDateWheelPanel() : null}

                  {timeWheelVisible ? renderTimeWheelPanel() : null}

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
                      <Text style={[styles.label, { color: theme.text }]}>Date</Text>
                      <TouchableOpacity
                        onPress={() => openDateWheel("meal_date")}
                        style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                        <Text style={[styles.pickerFieldText, { color: theme.text }]}>{mealPlanDate}</Text>
                      </TouchableOpacity>
                      {dateWheelVisible && dateWheelTarget === "meal_date" ? renderDateWheelPanel() : null}

                      <Text style={[styles.label, { color: theme.text }]}>Moment du repas</Text>
                      <View style={styles.visibilityRow}>
                        {MEAL_TYPES.map((mealType) => (
                          <TouchableOpacity
                            key={`new-meal-type-${mealType.value}`}
                            onPress={() => setMealPlanType(mealType.value)}
                            style={[
                              styles.visibilityChip,
                              { borderColor: theme.icon, backgroundColor: theme.background },
                              mealPlanType === mealType.value && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                            ]}
                          >
                            <Text style={{ color: theme.text }}>{mealType.label}</Text>
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
                      {mealPlanRecipeSearch.isFetching ? <ActivityIndicator size="small" color={theme.tint} /> : null}
                      {recipeOptions.length > 0 ? (
                        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
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
                      <Text style={[styles.label, { color: theme.text }]}>Date de début</Text>
                      <TouchableOpacity
                        onPress={() => openDateWheel("task_start")}
                        style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                        <Text style={[styles.pickerFieldText, { color: theme.text }]}>{taskDueDate}</Text>
                      </TouchableOpacity>
                      {dateWheelVisible && dateWheelTarget === "task_start" ? renderDateWheelPanel() : null}
                      <Text style={[styles.label, { color: theme.text }]}>Date de fin</Text>
                      <TouchableOpacity
                        onPress={() => openDateWheel("task_end")}
                        style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                        disabled={saving}
                      >
                        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
                        <Text style={[styles.pickerFieldText, { color: theme.text }]}>{taskEndDate}</Text>
                      </TouchableOpacity>
                      {dateWheelVisible && dateWheelTarget === "task_end" ? renderDateWheelPanel() : null}
                      <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                        La date de fin est automatiquement ajustée si elle est avant la date de début.
                      </Text>
                      <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
                      {assignableTaskMembers.length > 0 ? (
                        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
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

