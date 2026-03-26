import { useMemo } from "react";

import { MEAL_TYPE_SORT } from "@/src/features/calendar/calendar-types";
import {
  isCalendarTaskAssignedToUser,
  isoDateFromDateTime,
  taskAssigneeNames,
} from "@/src/features/calendar/calendar-tab.helpers";
import type {
  CalendarEvent,
  CalendarTaskInstance,
  MealPlanEntry,
  RecipeOption,
  TaskBoardPayload,
} from "@/src/features/calendar/calendar-tab.types";
import { addDays, parseOptionalIsoDate, toIsoDate } from "@/src/utils/date";

type UseCalendarDerivedDataArgs = {
  events: CalendarEvent[];
  mealPlan: MealPlanEntry[];
  taskInstances: CalendarTaskInstance[];
  taskCurrentUserId: number | null;
  taskCurrentUserRole: "parent" | "enfant";
  selectedDate: string;
  mealPlanSearch: string;
  mealPlanRecipeResults: RecipeOption[];
  recipes: RecipeOption[];
  mealPlanRecipeId: number | null;
  taskMembers: TaskBoardPayload["members"];
};

export const useCalendarDerivedData = ({
  events,
  mealPlan,
  taskInstances,
  taskCurrentUserId,
  taskCurrentUserRole,
  selectedDate,
  mealPlanSearch,
  mealPlanRecipeResults,
  recipes,
  mealPlanRecipeId,
  taskMembers,
}: UseCalendarDerivedDataArgs) => {
  const stats = useMemo(() => {
    const sharedEvents = events.filter((event) => event.is_shared_with_other_household).length;
    return {
      events: events.length,
      shared: sharedEvents,
      meals: mealPlan.length,
    };
  }, [events, mealPlan]);

  const recipeOptions = useMemo(() => {
    if (mealPlanSearch.trim().length === 0) {
      return [] as RecipeOption[];
    }

    return [...mealPlanRecipeResults].sort((left, right) => left.title.localeCompare(right.title, "fr-BE"));
  }, [mealPlanRecipeResults, mealPlanSearch]);

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
    return mealPlan
      .filter((entry) => entry.date === selectedDate)
      .sort((left, right) => (MEAL_TYPE_SORT[left.meal_type] ?? 99) - (MEAL_TYPE_SORT[right.meal_type] ?? 99));
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

  return {
    stats,
    recipeOptions,
    filteredRecipeOptions,
    eventCountByDay,
    mealCountByDay,
    visibleTaskInstances,
    taskCountByDay,
    selectedDayEvents,
    selectedDayMeals,
    selectedDayTasks,
    selectedMealRecipe,
    assignableTaskMembers,
  };
};
