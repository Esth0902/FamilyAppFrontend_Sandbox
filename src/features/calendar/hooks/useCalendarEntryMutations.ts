import { useCallback } from "react";
import { Alert } from "react-native";

import type { MealType } from "@/src/features/calendar/calendar-types";
import type {
  CreateEntryType,
} from "@/src/features/calendar/calendar-tab.types";
import {
  createMealPlanEntry,
  deleteCalendarEvent,
  deleteMealPlanEntry,
  saveCalendarEvent,
  updateMealPlanEntry,
} from "@/src/services/calendarService";
import { createTaskInstance } from "@/src/services/tasksService";
import {
  isValidIsoDate,
  isValidTime,
  parseEventDateTimeRange,
} from "@/src/features/calendar/calendar-utils";

type UseCalendarEntryMutationsParams = {
  eventForm: {
    editingEventId: number | null;
    eventTitle: string;
    eventDescription: string;
    eventDate: string;
    eventEndDate: string;
    eventStartTime: string;
    eventEndTime: string;
    shareWithOtherHousehold: boolean;
  };
  mealForm: {
    editingMealPlanId: number | null;
    mealPlanDate: string;
    mealPlanType: MealType;
    mealPlanRecipeId: number | null;
    mealPlanCustomTitle: string;
    mealPlanServings: string;
    mealPlanNote: string;
  };
  taskForm: {
    taskTitle: string;
    taskDescription: string;
    taskDueDate: string;
    taskEndDate: string;
  };
  createEntryType: CreateEntryType;
  tasksEnabled: boolean;
  canManageTaskInstances: boolean;
  taskCurrentUserId: number | null;
  taskCurrentUserRole: "parent" | "enfant";
  taskAssigneeId: number | null;
  canCreateEvents: boolean;
  closeCreateModalAndReset: () => void;
  closeMealPlanModalAndReset: () => void;
  setSelectedDate: (isoDate: string) => void;
  setSaving: (value: boolean) => void;
  onAfterMutation: () => Promise<void>;
};

export function useCalendarEntryMutations({
  eventForm,
  mealForm,
  taskForm,
  createEntryType,
  tasksEnabled,
  canManageTaskInstances,
  taskCurrentUserId,
  taskCurrentUserRole,
  taskAssigneeId,
  canCreateEvents,
  closeCreateModalAndReset,
  closeMealPlanModalAndReset,
  setSelectedDate,
  setSaving,
  onAfterMutation,
}: UseCalendarEntryMutationsParams) {
  const handleSaveEvent = useCallback(async () => {
    const cleanTitle = eventForm.eventTitle.trim();
    if (cleanTitle.length < 2) {
      Alert.alert("Calendrier", "Le titre de l'événement est obligatoire.");
      return;
    }

    if (!isValidIsoDate(eventForm.eventDate) || !isValidIsoDate(eventForm.eventEndDate)) {
      Alert.alert("Calendrier", "Les dates doivent être au format YYYY-MM-DD.");
      return;
    }

    if (!isValidTime(eventForm.eventStartTime) || !isValidTime(eventForm.eventEndTime)) {
      Alert.alert("Calendrier", "Les heures doivent être au format HH:MM.");
      return;
    }

    const eventRange = parseEventDateTimeRange(
      eventForm.eventDate,
      eventForm.eventStartTime,
      eventForm.eventEndDate,
      eventForm.eventEndTime
    );
    if (!eventRange) {
      Alert.alert("Calendrier", "L'heure de fin doit être après l'heure de début.");
      return;
    }

    setSaving(true);
    try {
      await saveCalendarEvent(
        {
          title: cleanTitle,
          description: eventForm.eventDescription.trim() || null,
          start_at: eventRange.startAt.toISOString(),
          end_at: eventRange.endAt.toISOString(),
          is_shared_with_other_household: eventForm.shareWithOtherHousehold,
        },
        eventForm.editingEventId
      );

      setSelectedDate(eventForm.eventDate);
      closeCreateModalAndReset();
      await onAfterMutation();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'enregistrer cet événement.");
    } finally {
      setSaving(false);
    }
  }, [closeCreateModalAndReset, eventForm, onAfterMutation, setSaving, setSelectedDate]);

  const handleCreateMealPlan = useCallback(async () => {
    if (!isValidIsoDate(mealForm.mealPlanDate)) {
      Alert.alert("Calendrier", "La date du repas doit être au format YYYY-MM-DD.");
      return;
    }

    const customTitle = mealForm.mealPlanCustomTitle.trim();
    if (!mealForm.mealPlanRecipeId && customTitle.length === 0) {
      Alert.alert("Calendrier", "Choisis une recette ou saisis un repas libre.");
      return;
    }

    const servings = Number.parseInt(mealForm.mealPlanServings, 10);
    if (!Number.isFinite(servings) || servings < 1 || servings > 30) {
      Alert.alert("Calendrier", "Le nombre de portions doit être compris entre 1 et 30.");
      return;
    }

    setSaving(true);
    try {
      await createMealPlanEntry({
        date: mealForm.mealPlanDate,
        meal_type: mealForm.mealPlanType,
        recipe_id: customTitle.length === 0 ? mealForm.mealPlanRecipeId : null,
        custom_title: customTitle.length > 0 ? customTitle : null,
        servings,
        note: mealForm.mealPlanNote.trim() || null,
      });

      setSelectedDate(mealForm.mealPlanDate);
      closeCreateModalAndReset();
      await onAfterMutation();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'enregistrer ce repas.");
    } finally {
      setSaving(false);
    }
  }, [closeCreateModalAndReset, mealForm, onAfterMutation, setSaving, setSelectedDate]);

  const handleCreateTask = useCallback(async () => {
    if (!tasksEnabled) {
      Alert.alert("Calendrier", "Le module tâches est désactivé pour ce foyer.");
      return;
    }

    if (!canManageTaskInstances) {
      Alert.alert("Calendrier", "Seul un parent peut créer une tâche.");
      return;
    }

    const cleanTitle = taskForm.taskTitle.trim();
    if (cleanTitle.length < 2) {
      Alert.alert("Calendrier", "Le titre de la tâche est obligatoire.");
      return;
    }

    if (!isValidIsoDate(taskForm.taskDueDate) || !isValidIsoDate(taskForm.taskEndDate)) {
      Alert.alert("Calendrier", "Les dates de tâche doivent être au format YYYY-MM-DD.");
      return;
    }

    if (taskForm.taskEndDate < taskForm.taskDueDate) {
      Alert.alert("Calendrier", "La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }

    const fallbackAssigneeId = taskCurrentUserRole === "parent"
      ? taskAssigneeId
      : taskCurrentUserId;
    const selectedAssigneeId = Number.isInteger(fallbackAssigneeId)
      ? Number(fallbackAssigneeId)
      : null;

    if (!selectedAssigneeId) {
      Alert.alert("Calendrier", "Sélectionne un membre à qui assigner la tâche.");
      return;
    }

    setSaving(true);
    try {
      await createTaskInstance({
        name: cleanTitle,
        description: taskForm.taskDescription.trim() || null,
        due_date: taskForm.taskDueDate,
        end_date: taskForm.taskEndDate,
        user_id: selectedAssigneeId,
      });

      setSelectedDate(taskForm.taskDueDate);
      closeCreateModalAndReset();
      await onAfterMutation();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de créer cette tâche.");
    } finally {
      setSaving(false);
    }
  }, [
    canManageTaskInstances,
    closeCreateModalAndReset,
    onAfterMutation,
    setSaving,
    setSelectedDate,
    taskAssigneeId,
    taskCurrentUserId,
    taskCurrentUserRole,
    taskForm,
    tasksEnabled,
  ]);

  const handleSaveFromModal = useCallback(async () => {
    if (eventForm.editingEventId !== null || createEntryType === "event") {
      if (!canCreateEvents) {
        Alert.alert("Calendrier", "Tu n'as pas l'autorisation de créer ou modifier un événement.");
        return;
      }
      await handleSaveEvent();
      return;
    }

    if (createEntryType === "meal_plan") {
      await handleCreateMealPlan();
      return;
    }

    await handleCreateTask();
  }, [
    canCreateEvents,
    createEntryType,
    eventForm.editingEventId,
    handleCreateMealPlan,
    handleCreateTask,
    handleSaveEvent,
  ]);

  const handleDeleteEvent = useCallback(async (eventId: number) => {
    setSaving(true);
    try {
      await deleteCalendarEvent(eventId);
      if (eventForm.editingEventId === eventId) {
        closeCreateModalAndReset();
      }
      await onAfterMutation();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de supprimer cet événement.");
    } finally {
      setSaving(false);
    }
  }, [closeCreateModalAndReset, eventForm.editingEventId, onAfterMutation, setSaving]);

  const handleSaveMealPlan = useCallback(async () => {
    if (!mealForm.editingMealPlanId) {
      return;
    }

    if (!isValidIsoDate(mealForm.mealPlanDate)) {
      Alert.alert("Calendrier", "La date du repas doit être au format YYYY-MM-DD.");
      return;
    }

    const customTitle = mealForm.mealPlanCustomTitle.trim();
    if (!mealForm.mealPlanRecipeId && customTitle.length === 0) {
      Alert.alert("Calendrier", "Choisis une recette ou saisis un repas libre.");
      return;
    }

    const servings = Number.parseInt(mealForm.mealPlanServings, 10);
    if (!Number.isFinite(servings) || servings < 1 || servings > 30) {
      Alert.alert("Calendrier", "Le nombre de portions doit être compris entre 1 et 30.");
      return;
    }

    setSaving(true);
    try {
      await updateMealPlanEntry(mealForm.editingMealPlanId, {
        date: mealForm.mealPlanDate,
        meal_type: mealForm.mealPlanType,
        recipe_id: customTitle.length === 0 ? mealForm.mealPlanRecipeId : null,
        custom_title: customTitle.length > 0 ? customTitle : null,
        servings,
        note: mealForm.mealPlanNote.trim() || null,
      });

      setSelectedDate(mealForm.mealPlanDate);
      closeMealPlanModalAndReset();
      await onAfterMutation();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de modifier ce repas.");
    } finally {
      setSaving(false);
    }
  }, [closeMealPlanModalAndReset, mealForm, onAfterMutation, setSaving, setSelectedDate]);

  const handleDeleteMealPlan = useCallback(async (mealPlanId: number) => {
    setSaving(true);
    try {
      await deleteMealPlanEntry(mealPlanId);
      if (mealForm.editingMealPlanId === mealPlanId) {
        closeMealPlanModalAndReset();
      }
      await onAfterMutation();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de supprimer ce repas.");
    } finally {
      setSaving(false);
    }
  }, [closeMealPlanModalAndReset, mealForm.editingMealPlanId, onAfterMutation, setSaving]);

  return {
    handleSaveEvent,
    handleCreateMealPlan,
    handleCreateTask,
    handleSaveFromModal,
    handleDeleteEvent,
    handleSaveMealPlan,
    handleDeleteMealPlan,
  };
}
