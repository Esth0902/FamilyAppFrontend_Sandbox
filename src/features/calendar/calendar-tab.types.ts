import type { MealType } from "@/src/features/calendar/calendar-types";

export type CalendarEvent = {
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

export type MealPlanRecipe = {
  id: number;
  title: string;
  type?: string | null;
  servings: number;
  position: number;
};

export type MealPlanEntry = {
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

export type CalendarTaskInstance = {
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

export type RecipeOption = {
  id: number;
  title: string;
  type?: string | null;
};

export type CalendarBoardPayload = {
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

export type TaskBoardPayload = {
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

export type CreateEntryType = "event" | "meal_plan" | "task";
export type DateWheelTarget = "event_start" | "event_end" | "task_start" | "task_end" | "meal_date";
export type MealPresenceStatus = "present" | "not_home" | "later";
export type EventParticipationStatus = "participate" | "not_participate";
export type ReasonAction =
  | { kind: "meal"; mealPlanId: number; status: Extract<MealPresenceStatus, "not_home" | "later"> }
  | { kind: "event"; eventId: number; status: "not_participate" };
