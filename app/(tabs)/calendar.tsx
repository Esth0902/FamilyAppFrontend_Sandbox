import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  instances: CalendarTaskInstance[];
};

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const TASK_STATUS_TODO = "\u00e0 faire";
const TASK_STATUS_DONE = "r\u00e9alis\u00e9e";
const TASK_STATUS_CANCELLED = "annul\u00e9e";

const pad = (value: number) => String(value).padStart(2, "0");

const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseIsoDate = (value: string) => new Date(`${value}T00:00:00`);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = parseIsoDate(value);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
};

const isValidTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

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

const isTaskStatus = (value: string, expected: string) => {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const target = expected.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized === target || normalized.includes(target);
};

const taskStatusLabel = (value: string) => {
  if (isTaskStatus(value, TASK_STATUS_TODO)) return "A faire";
  if (isTaskStatus(value, TASK_STATUS_DONE)) return "Realisee";
  if (isTaskStatus(value, TASK_STATUS_CANCELLED)) return "Annulee";
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
  const [permissions, setPermissions] = useState({
    can_create_events: false,
    can_share_with_other_household: false,
    can_manage_meal_plan: false,
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlanEntry[]>([]);
  const [taskInstances, setTaskInstances] = useState<CalendarTaskInstance[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);

  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState(todayIso);
  const [eventEndDate, setEventEndDate] = useState(todayIso);
  const [eventStartTime, setEventStartTime] = useState("18:00");
  const [eventEndTime, setEventEndTime] = useState("19:00");
  const [shareWithOtherHousehold, setShareWithOtherHousehold] = useState(false);

  const [editingMealPlanId, setEditingMealPlanId] = useState<number | null>(null);
  const [mealPlanDate, setMealPlanDate] = useState(todayIso);
  const [mealPlanType, setMealPlanType] = useState<"matin" | "midi" | "soir">("soir");
  const [mealPlanRecipeId, setMealPlanRecipeId] = useState<number | null>(null);
  const [mealPlanSearch, setMealPlanSearch] = useState("");
  const [mealPlanCustomTitle, setMealPlanCustomTitle] = useState("");
  const [mealPlanServings, setMealPlanServings] = useState("4");
  const [mealPlanNote, setMealPlanNote] = useState("");
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [mealPlanModalVisible, setMealPlanModalVisible] = useState(false);
  const [eventComposerExpanded, setEventComposerExpanded] = useState(false);

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

  const resetEventForm = useCallback(() => {
    setEditingEventId(null);
    setEventTitle("");
    setEventDescription("");
    setEventDate(selectedDate);
    setEventEndDate(selectedDate);
    setEventStartTime("18:00");
    setEventEndTime("19:00");
    setShareWithOtherHousehold(false);
  }, [selectedDate]);

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

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }

    try {
      const [calendarResult, tasksResult, recipesResult] = await Promise.allSettled([
        apiFetch(`/calendar/board?from=${calendarRange.from}&to=${calendarRange.to}`) as Promise<CalendarBoardPayload>,
        apiFetch(`/tasks/board?from=${calendarRange.from}&to=${calendarRange.to}`) as Promise<TaskBoardPayload>,
        apiFetch("/recipes") as Promise<RecipeOption[]>,
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
        setTaskInstances(Array.isArray(tasksResult.value?.instances) ? tasksResult.value.instances : []);
      } else {
        setTasksEnabled(false);
        setTaskInstances([]);
      }

      if (recipesResult.status === "fulfilled" && Array.isArray(recipesResult.value)) {
        setRecipes(recipesResult.value);
      } else {
        setRecipes([]);
      }
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de charger le calendrier.");
    } finally {
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
    if (!isSameMonth(selected, monthCursor)) {
      setMonthCursor(startOfMonth(selected));
    }
  }, [monthCursor, selectedDate]);

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
    const query = mealPlanSearch.trim().toLowerCase();
    if (query.length === 0) {
      return recipeOptions;
    }

    return recipeOptions.filter((recipe) => recipe.title.toLowerCase().includes(query));
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

  const openNewEventModal = () => {
    resetEventForm();
    setEventModalVisible(true);
  };

  const closeEventModal = () => {
    setEventModalVisible(false);
    resetEventForm();
  };

  const closeMealPlanModal = () => {
    setMealPlanModalVisible(false);
    resetMealPlanForm();
  };

  const openEventEditor = (event: CalendarEvent) => {
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
      Alert.alert("Calendrier", "Le titre de l evenement est obligatoire.");
      return;
    }

    if (!isValidIsoDate(eventDate) || !isValidIsoDate(eventEndDate)) {
      Alert.alert("Calendrier", "Les dates doivent etre au format YYYY-MM-DD.");
      return;
    }

    if (!isValidTime(eventStartTime) || !isValidTime(eventEndTime)) {
      Alert.alert("Calendrier", "Les heures doivent etre au format HH:MM.");
      return;
    }

    const startAt = new Date(`${eventDate}T${eventStartTime}:00`);
    const endAt = new Date(`${eventEndDate}T${eventEndTime}:00`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      Alert.alert("Calendrier", "L heure de fin doit etre apres l heure de debut.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(editingEventId ? `/calendar/events/${editingEventId}` : "/calendar/events", {
        method: editingEventId ? "PATCH" : "POST",
        body: JSON.stringify({
          title: cleanTitle,
          description: eventDescription.trim() || null,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          is_shared_with_other_household: shareWithOtherHousehold,
        }),
      });

      setSelectedDate(eventDate);
      setEventModalVisible(false);
      resetEventForm();
      await loadBoard({ silent: true });
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d enregistrer l evenement.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteEvent = (event: CalendarEvent) => {
    Alert.alert("Supprimer l evenement", `Supprimer "${event.title}" ?`, [
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
      Alert.alert("Calendrier", error?.message || "Impossible de supprimer l evenement.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMealPlan = async () => {
    if (!editingMealPlanId) {
      return;
    }

    if (!isValidIsoDate(mealPlanDate)) {
      Alert.alert("Calendrier", "La date du meal plan doit etre au format YYYY-MM-DD.");
      return;
    }

    const customTitle = mealPlanCustomTitle.trim();

    if (!mealPlanRecipeId && customTitle.length === 0) {
      Alert.alert("Calendrier", "Choisis une recette ou saisis un repas libre.");
      return;
    }

    const servings = Number.parseInt(mealPlanServings, 10);
    if (!Number.isFinite(servings) || servings < 1 || servings > 30) {
      Alert.alert("Calendrier", "Le nombre de portions doit etre compris entre 1 et 30.");
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
      Alert.alert("Calendrier", error?.message || "Impossible de mettre a jour cette tache.");
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
      Alert.alert("Calendrier", error?.message || "Impossible de valider cette tache.");
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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Calendrier familial</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Evenements du foyer, partage inter-foyers controle et menu valide de la semaine.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/householdSetup?mode=edit&scope=calendar")}
            style={[styles.settingsBtn, { borderColor: theme.icon }]}
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {!calendarEnabled ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Module desactive</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
            Active le module calendrier dans la configuration du foyer pour afficher l agenda partage.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/householdSetup?mode=edit&scope=calendar")}
            style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
          >
            <Text style={styles.primaryBtnText}>Configurer le foyer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.events}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Evenements</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.shared}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Partages</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.meals}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Repas planifies</Text>
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
                      onPress={() => setSelectedDate(iso)}
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

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Programme du {formatFullDateLabel(selectedDate)}</Text>

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
                  Aucun repas valide pour cette journee.
                </Text>
              )}
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={18} color="#7C5CFA" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Taches</Text>
              </View>
              {!tasksEnabled ? (
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  Le module taches est desactive pour ce foyer.
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
                    <Text style={[styles.itemMetaText, { color: theme.textSecondary }]}>Assignee: {task.assignee.name}</Text>
                    {task.description ? (
                      <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{task.description}</Text>
                    ) : null}
                    {task.validated_by_parent ? (
                      <Text style={[styles.itemMetaText, { color: "#2E8B78" }]}>Validee par un parent</Text>
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
                              {isTaskStatus(task.status, TASK_STATUS_DONE) ? "Remettre a faire" : "Marquer faite"}
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
                  Aucune tache prevue pour cette journee.
                </Text>
              )}
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={theme.tint} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Evenements</Text>
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
                          {event.is_shared_with_other_household ? "Partage" : "Prive"}
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
                        Cree par {event.created_by.name}
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
                  Aucun evenement sur cette journee.
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <TouchableOpacity
              style={styles.composerHeader}
              onPress={() => setEventComposerExpanded((prev) => !prev)}
              activeOpacity={0.85}
            >
              <View style={styles.cardTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Nouvel evenement</Text>
                  <Text style={[styles.helperText, { color: theme.textSecondary, marginBottom: 0 }]}>
                    Ajoute rapidement un rendez-vous ou une activite au calendrier.
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={eventComposerExpanded ? "chevron-down" : "chevron-right"}
                  size={24}
                  color={theme.tint}
                />
              </View>
            </TouchableOpacity>

            {eventComposerExpanded ? (
              <View style={styles.composerBody}>
                <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                  Le formulaire s ouvre dans une fenetre modale pour garder la vue calendrier lisible.
                </Text>
                <TouchableOpacity
                  onPress={openNewEventModal}
                  style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                  disabled={saving || !permissions.can_create_events}
                >
                  <Text style={styles.primaryBtnText}>Ouvrir le formulaire</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

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
                        ? "Aucune recette ne correspond a cette recherche."
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

          <Modal visible={eventModalVisible} transparent animationType="slide" onRequestClose={closeEventModal}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                    {editingEventId ? "Modifier l evenement" : "Nouvel evenement"}
                  </Text>
                  <TouchableOpacity onPress={closeEventModal} disabled={saving}>
                    <MaterialCommunityIcons name="close" size={22} color={theme.tint} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
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
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={eventDate}
                    onChangeText={setEventDate}
                    placeholder="Date debut YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
                    value={eventEndDate}
                    onChangeText={setEventEndDate}
                    placeholder="Date fin YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <View style={styles.timeRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.timeInput,
                        { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon },
                      ]}
                      value={eventStartTime}
                      onChangeText={setEventStartTime}
                      placeholder="18:00"
                      placeholderTextColor={theme.textSecondary}
                    />
                    <TextInput
                      style={[
                        styles.input,
                        styles.timeInput,
                        { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon },
                      ]}
                      value={eventEndTime}
                      onChangeText={setEventEndTime}
                      placeholder="19:00"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  <Text style={[styles.label, { color: theme.text }]}>Visibilite inter-foyers</Text>
                  <View style={styles.visibilityRow}>
                    <TouchableOpacity
                      onPress={() => setShareWithOtherHousehold(false)}
                      style={[
                        styles.visibilityChip,
                        { borderColor: theme.icon, backgroundColor: theme.background },
                        !shareWithOtherHousehold && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                      ]}
                    >
                      <Text style={{ color: theme.text }}>Prive au foyer</Text>
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
                      Le partage inter-foyers est desactive dans la configuration du foyer.
                    </Text>
                  ) : !permissions.can_share_with_other_household ? (
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      Le partage d un evenement vers un autre foyer est reserve a un parent.
                    </Text>
                  ) : (
                    <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                      Choisis si cet evenement doit rester interne au foyer ou etre visible dans l autre foyer.
                    </Text>
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
                    onPress={() => void handleSaveEvent()}
                    style={[styles.primaryBtn, styles.modalPrimaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                    disabled={saving || !permissions.can_create_events}
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
  linkText: {
    fontSize: 13,
    fontWeight: "700",
  },
  composerHeader: {
    width: "100%",
  },
  composerBody: {
    marginTop: 6,
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
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
  },
  calendarDayInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  calendarDayNumberBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "700",
  },
  dayBadgesRow: {
    flexDirection: "row",
    gap: 4,
    minHeight: 8,
  },
  dayDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
  timeInput: {
    flex: 1,
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
