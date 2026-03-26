import { useCallback } from "react";
import { Alert } from "react-native";

import {
  TASK_STATUS_DONE,
  TASK_STATUS_TODO,
} from "@/src/features/calendar/calendar-tab.helpers";
import type {
  CalendarTaskInstance,
  EventParticipationStatus,
  MealPresenceStatus,
} from "@/src/features/calendar/calendar-tab.types";
import { isTaskStatus } from "@/src/features/calendar/calendar-utils";
import { submitCalendarEventParticipation, submitMealPlanAttendance } from "@/src/services/calendarService";
import { updateTaskInstance, validateTaskInstance as validateTaskInstanceService } from "@/src/services/tasksService";

type UseCalendarDayInteractionsParams = {
  absenceTrackingEnabled: boolean;
  setSaving: (value: boolean) => void;
  loadBoard: (options?: { silent?: boolean }) => Promise<void>;
  invalidateTaskAndDashboardQueries: () => Promise<void>;
};

export function useCalendarDayInteractions({
  absenceTrackingEnabled,
  setSaving,
  loadBoard,
  invalidateTaskAndDashboardQueries,
}: UseCalendarDayInteractionsParams) {
  const submitMealPresence = useCallback(async (
    mealPlanId: number,
    status: MealPresenceStatus,
    reason?: string | null
  ): Promise<boolean> => {
    if (!absenceTrackingEnabled) {
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
      await invalidateTaskAndDashboardQueries();
      return true;
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'enregistrer la présence au repas.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [absenceTrackingEnabled, invalidateTaskAndDashboardQueries, loadBoard, setSaving]);

  const submitEventParticipation = useCallback(async (
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
      await invalidateTaskAndDashboardQueries();
      return true;
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible d'enregistrer la participation à l'événement.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [invalidateTaskAndDashboardQueries, loadBoard, setSaving]);

  const toggleTaskInstance = useCallback(async (task: CalendarTaskInstance) => {
    if (!task.permissions.can_toggle) {
      return;
    }

    const nextStatus = isTaskStatus(task.status, TASK_STATUS_DONE) ? TASK_STATUS_TODO : TASK_STATUS_DONE;

    setSaving(true);
    try {
      await updateTaskInstance(task.id, { status: nextStatus });
      await loadBoard({ silent: true });
      await invalidateTaskAndDashboardQueries();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de mettre à jour cette tâche.");
    } finally {
      setSaving(false);
    }
  }, [invalidateTaskAndDashboardQueries, loadBoard, setSaving]);

  const validateTaskInstance = useCallback(async (task: CalendarTaskInstance) => {
    if (!task.permissions.can_validate || task.validated_by_parent) {
      return;
    }

    setSaving(true);
    try {
      await validateTaskInstanceService(task.id);
      await loadBoard({ silent: true });
      await invalidateTaskAndDashboardQueries();
    } catch (error: any) {
      Alert.alert("Calendrier", error?.message || "Impossible de valider cette tâche.");
    } finally {
      setSaving(false);
    }
  }, [invalidateTaskAndDashboardQueries, loadBoard, setSaving]);

  return {
    submitMealPresence,
    submitEventParticipation,
    toggleTaskInstance,
    validateTaskInstance,
  };
}
