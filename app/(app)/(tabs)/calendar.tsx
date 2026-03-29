import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { WheelDatePicker, WheelTimePicker } from "@/src/components/ui/WheelDatePicker";
import { MEAL_TYPES, mealTypeLabel, type MealType } from "@/src/features/calendar/calendar-types";
import { calendarStyles as styles } from "@/src/features/calendar/calendar-screen.styles";
import { CalendarCreateEntryModal } from "@/src/features/calendar/components/CalendarCreateEntryModal";
import { CalendarDayProgramModal } from "@/src/features/calendar/components/CalendarDayProgramModal";
import { CalendarMealPlanEditorModal } from "@/src/features/calendar/components/CalendarMealPlanEditorModal";
import { CalendarOverviewSection } from "@/src/features/calendar/components/CalendarOverviewSection";
import { CalendarReasonModal } from "@/src/features/calendar/components/CalendarReasonModal";
import {
  WEEK_DAYS,
  addMonths,
  endOfWeekSunday,
  formatMonthLabel,
} from "@/src/features/calendar/calendar-tab.helpers";
import type {
  CalendarBoardPayload,
  CalendarEvent,
  CalendarTaskInstance,
  CreateEntryType,
  DateWheelTarget,
  MealPlanEntry,
  RecipeOption,
  TaskBoardPayload,
} from "@/src/features/calendar/calendar-tab.types";
import { useDebounce } from "@/src/hooks/useDebounce";
import { mergeUniqueRecipes } from "@/src/features/recipes/recipe-utils";
import { useRecipeSearch } from "@/src/hooks/useRecipeSearch";
import { queryKeys } from "@/src/query/query-keys";
import { useStoredUserState } from "@/src/session/user-cache";
import { useCalendarDayInteractions } from "@/src/features/calendar/hooks/useCalendarDayInteractions";
import { useCalendarEntryModalControls } from "@/src/features/calendar/hooks/useCalendarEntryModalControls";
import { useCalendarEntryMutations } from "@/src/features/calendar/hooks/useCalendarEntryMutations";
import { useCalendarRealtimeRefresh } from "@/src/features/calendar/hooks/useCalendarRealtimeRefresh";
import { useCalendarDerivedData } from "@/src/features/calendar/hooks/useCalendarDerivedData";
import { useCalendarReasonActions } from "@/src/features/calendar/hooks/useCalendarReasonActions";
import { useCalendarShoppingListActions } from "@/src/features/calendar/hooks/useCalendarShoppingListActions";
import {
  fetchCalendarBoardForRange,
} from "@/src/services/calendarService";
import {
  fetchTasksBoardForRange,
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
import { ShoppingListPickerModal } from "@/src/features/shopping-list/shopping-list-picker-modal";

export default function CalendarScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
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
      if (eventDate !== nextIsoDate) {
        setEventDate(nextIsoDate);
      }
      if (eventEndDate !== nextIsoDate) {
        setEventEndDate(nextIsoDate);
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
      if (taskDueDate !== nextIsoDate) {
        setTaskDueDate(nextIsoDate);
      }
      if (taskEndDate !== nextIsoDate) {
        setTaskEndDate(nextIsoDate);
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

  const invalidateTaskAndDashboardQueries = useCallback(async () => {
    if (!householdId) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overviewRoot(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.boardRoot(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.root(householdId) }),
    ]);
  }, [householdId, queryClient]);


  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (!silent) {
      setLoading(true);
    }

    try {
      const [calendarResult, tasksResult] = await Promise.allSettled([
        fetchCalendarBoardForRange<CalendarBoardPayload>(calendarRange.from, calendarRange.to),
        fetchTasksBoardForRange<TaskBoardPayload>(calendarRange.from, calendarRange.to),
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

  const refreshBoardFromRealtime = useCallback(() => {
    void loadBoard({ silent: true });
  }, [loadBoard]);

  useCalendarRealtimeRefresh({
    householdId,
    taskCurrentUserId,
    refreshBoard: refreshBoardFromRealtime,
  });

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

  useEffect(() => {
    if (!Array.isArray(mealPlanRecipeSearch.results) || mealPlanRecipeSearch.results.length === 0) {
      return;
    }

    setRecipes((previousRecipes) => mergeUniqueRecipes(previousRecipes, mealPlanRecipeSearch.results));
  }, [mealPlanRecipeSearch.results]);

  const {
    stats,
    recipeOptions,
    filteredRecipeOptions,
    eventCountByDay,
    mealCountByDay,
    taskCountByDay,
    selectedDayEvents,
    selectedDayMeals,
    selectedDayTasks,
    selectedMealRecipe,
    assignableTaskMembers,
  } = useCalendarDerivedData({
    events,
    mealPlan,
    taskInstances,
    taskCurrentUserId,
    taskCurrentUserRole,
    selectedDate,
    mealPlanSearch,
    mealPlanRecipeResults: mealPlanRecipeSearch.results,
    recipes,
    mealPlanRecipeId,
    taskMembers,
  });

  const {
    shoppingPickerVisible,
    shoppingLists,
    selectedShoppingListId,
    useNewShoppingList,
    newShoppingListTitle,
    pendingMealPlanForShopping,
    setSelectedShoppingListId,
    setUseNewShoppingList,
    setNewShoppingListTitle,
    openMealPlanShoppingListPicker,
    closeMealPlanShoppingListPicker,
    confirmMealPlanShoppingListSelection,
  } = useCalendarShoppingListActions({
    canManageMealPlan: permissions.can_manage_meal_plan,
    dayProgramModalVisible,
    setDayProgramModalVisible,
    saving,
    setSaving,
    onNavigateToShoppingList: (shoppingListId) => router.push(`/meal/shopping-list/${shoppingListId}`),
  });

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
      minValue={
        dateWheelTarget === "event_end"
          ? eventDate
          : dateWheelTarget === "task_end"
            ? taskDueDate
            : undefined
      }
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

  const {
    openNewEventModal,
    closeEventModal,
    closeMealPlanModal,
    selectCreateEntryType,
    openEventEditor,
    openMealPlanEditor,
  } = useCalendarEntryModalControls({
    selectedDate,
    eventDate,
    prepareNewEventForm,
    resetEventForm,
    resetMealPlanForm,
    resetTaskForm,
    setCreateEntryType,
    setEditingMealPlanId,
    setMealPlanDate,
    setMealPlanType,
    setMealPlanRecipeId,
    setMealPlanSearch,
    setMealPlanCustomTitle,
    setMealPlanServings,
    setMealPlanNote,
    setTaskTitle,
    setTaskDescription,
    setTaskDueDate,
    setTaskEndDate,
    setSelectedDate,
    setDayProgramModalVisible,
    setEventModalVisible,
    setDateWheelVisible,
    setTimeWheelVisible,
    setEditingEventId,
    setEventTitle,
    setEventDescription,
    setEventDate,
    setEventEndDate,
    setEventStartTime,
    setEventEndTime,
    setShareWithOtherHousehold,
    setMealPlanModalVisible,
  });

  const closeCreateModalAndReset = useCallback(() => {
    setEventModalVisible(false);
    setCreateEntryType("event");
    resetEventForm();
    resetMealPlanForm();
    resetTaskForm();
  }, [resetEventForm, resetMealPlanForm, resetTaskForm]);

  const closeMealPlanModalAndReset = useCallback(() => {
    setMealPlanModalVisible(false);
    resetMealPlanForm();
  }, [resetMealPlanForm]);

  const {
    handleSaveFromModal,
    handleDeleteEvent,
    handleSaveMealPlan,
    handleDeleteMealPlan,
  } = useCalendarEntryMutations({
    eventForm: {
      editingEventId,
      eventTitle,
      eventDescription,
      eventDate,
      eventEndDate,
      eventStartTime,
      eventEndTime,
      shareWithOtherHousehold,
    },
    mealForm: {
      editingMealPlanId,
      mealPlanDate,
      mealPlanType,
      mealPlanRecipeId,
      mealPlanCustomTitle,
      mealPlanServings,
      mealPlanNote,
    },
    taskForm: {
      taskTitle,
      taskDescription,
      taskDueDate,
      taskEndDate,
    },
    createEntryType,
    tasksEnabled,
    canManageTaskInstances,
    taskCurrentUserId,
    taskCurrentUserRole,
    taskAssigneeId,
    canCreateEvents: permissions.can_create_events,
    closeCreateModalAndReset,
    closeMealPlanModalAndReset,
    setSelectedDate,
    setSaving,
    onAfterMutation: async () => {
      await loadBoard({ silent: true });
      await invalidateTaskAndDashboardQueries();
    },
  });

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

  const {
    submitMealPresence,
    submitEventParticipation,
    toggleTaskInstance,
    validateTaskInstance,
  } = useCalendarDayInteractions({
    absenceTrackingEnabled: settings.absence_tracking_enabled,
    setSaving,
    loadBoard,
    invalidateTaskAndDashboardQueries,
  });

  const {
    reasonModalVisible,
    pendingReasonAction,
    reasonInput,
    setReasonInput,
    openMealReasonModal,
    openEventReasonModal,
    closeReasonModal,
    confirmReasonAction,
  } = useCalendarReasonActions({
    dayProgramModalVisible,
    setDayProgramModalVisible,
    saving,
    submitMealPresence,
    submitEventParticipation,
  });

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
          <CalendarOverviewSection
            styles={styles}
            colors={{
              card: theme.card,
              icon: theme.icon,
              background: theme.background,
              tint: theme.tint,
              text: theme.text,
              textSecondary: theme.textSecondary,
              accentWarm: theme.accentWarm,
            }}
            stats={stats}
            monthLabel={formatMonthLabel(monthCursor)}
            weekDays={WEEK_DAYS}
            calendarDays={calendarDays}
            monthCursor={monthCursor}
            selectedDate={selectedDate}
            todayIsoValue={todayIsoValue}
            eventCountByDay={eventCountByDay}
            mealCountByDay={mealCountByDay}
            taskCountByDay={taskCountByDay}
            onPreviousMonth={() => setMonthCursor((prev) => startOfMonth(addMonths(prev, -1)))}
            onNextMonth={() => setMonthCursor((prev) => startOfMonth(addMonths(prev, 1)))}
            onDayPress={handleDayPress}
          />


          <CalendarDayProgramModal
            visible={dayProgramModalVisible}
            onClose={() => setDayProgramModalVisible(false)}
            onOpenCreateEntry={() => openNewEventModal(selectedDate)}
            selectedDate={selectedDate}
            styles={styles}
            colors={{
              icon: theme.icon,
              background: theme.background,
              card: theme.card,
              text: theme.text,
              textSecondary: theme.textSecondary,
              tint: theme.tint,
            }}
            saving={saving}
            canCreateEvents={permissions.can_create_events}
            absenceTrackingEnabled={settings.absence_tracking_enabled}
            canManageMealPlan={permissions.can_manage_meal_plan}
            tasksEnabled={tasksEnabled}
            dateWheelVisible={dateWheelVisible}
            timeWheelVisible={timeWheelVisible}
            selectedDayMeals={selectedDayMeals}
            selectedDayTasks={selectedDayTasks}
            selectedDayEvents={selectedDayEvents}
            onSubmitMealPresence={(mealPlanId, status, reason) => void submitMealPresence(mealPlanId, status, reason)}
            onOpenMealReasonModal={openMealReasonModal}
            onOpenMealShoppingListPicker={(meal) => void openMealPlanShoppingListPicker(meal)}
            onOpenMealEditor={openMealPlanEditor}
            onConfirmDeleteMeal={confirmDeleteMealPlan}
            onToggleTask={(selectedTask) => void toggleTaskInstance(selectedTask)}
            onValidateTask={(selectedTask) => void validateTaskInstance(selectedTask)}
            onSubmitEventParticipation={(eventId, status, reason) => void submitEventParticipation(eventId, status, reason)}
            onOpenEventReasonModal={openEventReasonModal}
            onOpenEventEditor={openEventEditor}
            onConfirmDeleteEvent={confirmDeleteEvent}
          />

          <CalendarReasonModal
            visible={reasonModalVisible}
            onClose={closeReasonModal}
            saving={saving}
            styles={styles}
            colors={{
              icon: theme.icon,
              background: theme.background,
              card: theme.card,
              text: theme.text,
              textSecondary: theme.textSecondary,
              tint: theme.tint,
            }}
            reasonContext={pendingReasonAction?.kind ?? null}
            reasonInput={reasonInput}
            onChangeReasonInput={setReasonInput}
            onConfirm={() => void confirmReasonAction()}
          />
          <CalendarMealPlanEditorModal
            visible={mealPlanModalVisible}
            onClose={closeMealPlanModal}
            saving={saving}
            styles={styles}
            colors={{
              icon: theme.icon,
              background: theme.background,
              card: theme.card,
              text: theme.text,
              textSecondary: theme.textSecondary,
              tint: theme.tint,
            }}
            mealTypes={MEAL_TYPES}
            mealPlanDate={mealPlanDate}
            onChangeMealPlanDate={setMealPlanDate}
            mealPlanType={mealPlanType}
            onSelectMealType={setMealPlanType}
            mealPlanSearch={mealPlanSearch}
            onChangeMealPlanSearch={setMealPlanSearch}
            mealPlanRecipeSearchFetching={mealPlanRecipeSearch.isFetching}
            recipeOptions={recipeOptions}
            filteredRecipeOptions={filteredRecipeOptions}
            mealPlanRecipeId={mealPlanRecipeId}
            onSelectRecipe={(recipeId) => {
              setMealPlanRecipeId(recipeId);
              setMealPlanCustomTitle("");
            }}
            selectedMealRecipeTitle={selectedMealRecipe?.title ?? null}
            mealPlanCustomTitle={mealPlanCustomTitle}
            onChangeMealPlanCustomTitle={(value) => {
              setMealPlanCustomTitle(value);
              if (value.trim().length > 0) {
                setMealPlanRecipeId(null);
              }
            }}
            mealPlanServings={mealPlanServings}
            onChangeMealPlanServings={setMealPlanServings}
            mealPlanNote={mealPlanNote}
            onChangeMealPlanNote={setMealPlanNote}
            onSave={() => void handleSaveMealPlan()}
          />

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

          <CalendarCreateEntryModal
            visible={eventModalVisible}
            onClose={closeEventModal}
            saving={saving}
            styles={styles}
            colors={{
              icon: theme.icon,
              background: theme.background,
              card: theme.card,
              text: theme.text,
              textSecondary: theme.textSecondary,
              tint: theme.tint,
            }}
            editingEventId={editingEventId}
            createEntryType={createEntryType}
            onSelectCreateEntryType={selectCreateEntryType}
            canManageMealPlan={permissions.can_manage_meal_plan}
            tasksEnabled={tasksEnabled}
            canManageTaskInstances={canManageTaskInstances}
            isEventFormMode={isEventFormMode}
            eventTitle={eventTitle}
            eventDescription={eventDescription}
            eventDate={eventDate}
            eventStartTime={eventStartTime}
            eventEndDate={eventEndDate}
            eventEndTime={eventEndTime}
            dateWheelVisible={dateWheelVisible}
            dateWheelTarget={dateWheelTarget}
            timeWheelVisible={timeWheelVisible}
            onChangeEventTitle={setEventTitle}
            onChangeEventDescription={setEventDescription}
            onOpenDateWheel={openDateWheel}
            onOpenTimeWheel={openTimeWheel}
            renderDateWheelPanel={renderDateWheelPanel}
            renderTimeWheelPanel={renderTimeWheelPanel}
            shareWithOtherHousehold={shareWithOtherHousehold}
            onChangeShareWithOtherHousehold={setShareWithOtherHousehold}
            sharedViewEnabled={settings.shared_view_enabled}
            canShareWithOtherHousehold={permissions.can_share_with_other_household}
            mealPlanDate={mealPlanDate}
            mealTypes={MEAL_TYPES}
            mealPlanType={mealPlanType}
            onSelectMealType={setMealPlanType}
            mealPlanSearch={mealPlanSearch}
            onChangeMealPlanSearch={setMealPlanSearch}
            mealPlanRecipeSearchFetching={mealPlanRecipeSearch.isFetching}
            recipeOptions={recipeOptions}
            filteredRecipeOptions={filteredRecipeOptions}
            mealPlanRecipeId={mealPlanRecipeId}
            onSelectRecipe={(recipeId) => {
              setMealPlanRecipeId(recipeId);
              setMealPlanCustomTitle("");
            }}
            selectedMealRecipeTitle={selectedMealRecipe?.title ?? null}
            mealPlanCustomTitle={mealPlanCustomTitle}
            onChangeMealPlanCustomTitle={(value) => {
              setMealPlanCustomTitle(value);
              if (value.trim().length > 0) {
                setMealPlanRecipeId(null);
              }
            }}
            mealPlanServings={mealPlanServings}
            onChangeMealPlanServings={setMealPlanServings}
            mealPlanNote={mealPlanNote}
            onChangeMealPlanNote={setMealPlanNote}
            taskTitle={taskTitle}
            taskDescription={taskDescription}
            taskDueDate={taskDueDate}
            taskEndDate={taskEndDate}
            assignableTaskMembers={assignableTaskMembers}
            taskAssigneeId={taskAssigneeId}
            onChangeTaskTitle={setTaskTitle}
            onChangeTaskDescription={setTaskDescription}
            onSelectTaskAssignee={setTaskAssigneeId}
            canSubmitCreateModal={canSubmitCreateModal}
            onSave={() => void handleSaveFromModal()}
          />
        </>
      )}
    </ScrollView>
  );
}







