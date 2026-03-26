import { useCallback } from "react";

import type { MealType } from "@/src/features/calendar/calendar-types";
import type {
  CalendarEvent,
  CreateEntryType,
  MealPlanEntry,
} from "@/src/features/calendar/calendar-tab.types";
import {
  isoDateFromDateTime,
  timeInputFromDateTime,
} from "@/src/features/calendar/calendar-tab.helpers";

type UseCalendarEntryModalControlsParams = {
  selectedDate: string;
  eventDate: string;
  prepareNewEventForm: (targetDate: string) => void;
  resetEventForm: () => void;
  resetMealPlanForm: () => void;
  resetTaskForm: () => void;
  setCreateEntryType: (value: CreateEntryType) => void;
  setEditingMealPlanId: (value: number | null) => void;
  setMealPlanDate: (value: string) => void;
  setMealPlanType: (value: MealType) => void;
  setMealPlanRecipeId: (value: number | null) => void;
  setMealPlanSearch: (value: string) => void;
  setMealPlanCustomTitle: (value: string) => void;
  setMealPlanServings: (value: string) => void;
  setMealPlanNote: (value: string) => void;
  setTaskTitle: (value: string) => void;
  setTaskDescription: (value: string) => void;
  setTaskDueDate: (value: string) => void;
  setTaskEndDate: (value: string | ((prev: string) => string)) => void;
  setSelectedDate: (value: string) => void;
  setDayProgramModalVisible: (value: boolean) => void;
  setEventModalVisible: (value: boolean) => void;
  setDateWheelVisible: (value: boolean) => void;
  setTimeWheelVisible: (value: boolean) => void;
  setEditingEventId: (value: number | null) => void;
  setEventTitle: (value: string) => void;
  setEventDescription: (value: string) => void;
  setEventDate: (value: string) => void;
  setEventEndDate: (value: string) => void;
  setEventStartTime: (value: string) => void;
  setEventEndTime: (value: string) => void;
  setShareWithOtherHousehold: (value: boolean) => void;
  setMealPlanModalVisible: (value: boolean) => void;
};

export function useCalendarEntryModalControls({
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
}: UseCalendarEntryModalControlsParams) {
  const openNewEventModal = useCallback((targetDate?: string) => {
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
  }, [
    prepareNewEventForm,
    selectedDate,
    setCreateEntryType,
    setDayProgramModalVisible,
    setEditingMealPlanId,
    setEventModalVisible,
    setMealPlanCustomTitle,
    setMealPlanDate,
    setMealPlanNote,
    setMealPlanRecipeId,
    setMealPlanSearch,
    setMealPlanServings,
    setMealPlanType,
    setSelectedDate,
    setTaskDescription,
    setTaskDueDate,
    setTaskEndDate,
    setTaskTitle,
  ]);

  const closeEventModal = useCallback(() => {
    setDateWheelVisible(false);
    setTimeWheelVisible(false);
    setEventModalVisible(false);
    setCreateEntryType("event");
    resetEventForm();
    resetMealPlanForm();
    resetTaskForm();
  }, [
    resetEventForm,
    resetMealPlanForm,
    resetTaskForm,
    setCreateEntryType,
    setDateWheelVisible,
    setEventModalVisible,
    setTimeWheelVisible,
  ]);

  const closeMealPlanModal = useCallback(() => {
    setMealPlanModalVisible(false);
    resetMealPlanForm();
  }, [resetMealPlanForm, setMealPlanModalVisible]);

  const selectCreateEntryType = useCallback((value: CreateEntryType) => {
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
  }, [
    eventDate,
    setCreateEntryType,
    setDateWheelVisible,
    setMealPlanDate,
    setTaskDueDate,
    setTaskEndDate,
    setTimeWheelVisible,
  ]);

  const openEventEditor = useCallback((event: CalendarEvent) => {
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
  }, [
    selectedDate,
    setCreateEntryType,
    setDayProgramModalVisible,
    setEditingEventId,
    setEventDate,
    setEventDescription,
    setEventEndDate,
    setEventEndTime,
    setEventModalVisible,
    setEventStartTime,
    setEventTitle,
    setShareWithOtherHousehold,
  ]);

  const openMealPlanEditor = useCallback((entry: MealPlanEntry) => {
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
  }, [
    setDayProgramModalVisible,
    setEditingMealPlanId,
    setMealPlanCustomTitle,
    setMealPlanDate,
    setMealPlanModalVisible,
    setMealPlanNote,
    setMealPlanRecipeId,
    setMealPlanSearch,
    setMealPlanServings,
    setMealPlanType,
  ]);

  return {
    openNewEventModal,
    closeEventModal,
    closeMealPlanModal,
    selectCreateEntryType,
    openEventEditor,
    openMealPlanEditor,
  };
}
