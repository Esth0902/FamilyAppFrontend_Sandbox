import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/src/query/query-keys";
import { subscribeToHouseholdRealtime, subscribeToUserRealtime } from "@/src/realtime/client";
import {
  fetchTasksBoardForRange,
  normalizeIsoWeekDay,
  toPositiveInt,
  weekStartFromDateWithIsoDay,
} from "@/src/services/tasksService";
import { addDays, isValidIsoDate, parseIsoDate, startOfWeekMonday, toIsoDate } from "@/src/utils/date";

export type IsoWeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TaskMember = {
  id: number;
  name: string;
  role: "parent" | "enfant";
};

export type TaskTemplate = {
  id: number;
  name: string;
  description?: string | null;
  recurrence: "daily" | "weekly" | "monthly" | "once";
  start_date?: string | null;
  end_date?: string | null;
  recurrence_days?: number[];
  assignee_user_ids?: number[];
  rotation_user_ids?: number[];
  is_rotation: boolean;
  rotation_cycle_weeks?: number;
  is_inter_household_alternating?: boolean;
  inter_household_week_start?: string | null;
  fixed_user_id?: number | null;
  fixed_user_name?: string | null;
};

export type TaskInstance = {
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
  assignees: {
    id: number;
    name: string;
  }[];
  template: {
    id: number;
    recurrence: string;
    start_date?: string | null;
    end_date?: string | null;
    recurrence_days?: number[];
    assignee_user_ids?: number[];
    rotation_user_ids?: number[];
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

export type TasksBoardPayload = {
  tasks_enabled: boolean;
  range: {
    from: string;
    to: string;
  };
  settings?: {
    alternating_custody_enabled?: boolean;
    custody_change_day?: number;
    custody_home_week_start?: string | null;
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

type UseTasksBoardArgs = {
  householdId: number | null;
  weekAnchor: Date;
  rangeMode: "planned" | "standard";
};

const isoWeekDayFromDate = (date: Date): IsoWeekDay => {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as IsoWeekDay;
};

const resolvePlannedWeekStartDay = (payload: TasksBoardPayload): IsoWeekDay => {
  if (!payload.settings?.alternating_custody_enabled) {
    return 1;
  }

  const homeWeekStartIso = typeof payload.settings.custody_home_week_start === "string"
    ? payload.settings.custody_home_week_start
    : "";

  if (isValidIsoDate(homeWeekStartIso)) {
    const parsed = parseIsoDate(homeWeekStartIso);
    if (parsed) {
      return isoWeekDayFromDate(parsed);
    }
  }

  return normalizeIsoWeekDay(payload.settings.custody_change_day, 1) as IsoWeekDay;
};

export const useTasksBoard = ({
  householdId,
  weekAnchor,
  rangeMode,
}: UseTasksBoardArgs) => {
  const queryClient = useQueryClient();
  const [plannedWeekStartDay, setPlannedWeekStartDay] = useState<IsoWeekDay>(1);
  const plannedWeekStartDayRef = useRef<IsoWeekDay>(1);

  const normalizedWeekAnchor = useMemo(
    () => new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate()),
    [weekAnchor]
  );

  const plannedWeekStart = useMemo(
    () => weekStartFromDateWithIsoDay(normalizedWeekAnchor, plannedWeekStartDay),
    [normalizedWeekAnchor, plannedWeekStartDay]
  );
  const standardWeekStart = useMemo(() => startOfWeekMonday(normalizedWeekAnchor), [normalizedWeekAnchor]);
  const boardWeekStart = useMemo(
    () => (rangeMode === "planned" ? plannedWeekStart : standardWeekStart),
    [plannedWeekStart, rangeMode, standardWeekStart]
  );
  const boardRangeFromIso = useMemo(() => toIsoDate(boardWeekStart), [boardWeekStart]);
  const boardRangeToIso = useMemo(() => toIsoDate(addDays(boardWeekStart, 6)), [boardWeekStart]);

  const tasksBoardQueryKey = useMemo(
    () => queryKeys.tasks.board(householdId, boardRangeFromIso, boardRangeToIso),
    [boardRangeFromIso, boardRangeToIso, householdId]
  );

  const refreshBoard = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: tasksBoardQueryKey });
  }, [queryClient, tasksBoardQueryKey]);

  const tasksBoardQuery = useQuery({
    queryKey: tasksBoardQueryKey,
    enabled: householdId !== null,
    queryFn: async () => {
      return await fetchTasksBoardForRange<TasksBoardPayload>(boardRangeFromIso, boardRangeToIso);
    },
  });

  const payload = (tasksBoardQuery.data ?? null) as TasksBoardPayload | null;
  const currentUserId = toPositiveInt(payload?.current_user?.id);
  const currentUserRole: "parent" | "enfant" = payload?.current_user?.role === "parent" ? "parent" : "enfant";
  const tasksEnabled = Boolean(payload?.tasks_enabled);
  const canManageTemplates = Boolean(payload?.can_manage_templates);
  const canManageInstances = Boolean(payload?.can_manage_instances);
  const members = Array.isArray(payload?.members) ? payload.members : [];
  const templates = Array.isArray(payload?.templates) ? payload.templates : [];
  const instances = Array.isArray(payload?.instances) ? payload.instances : [];

  useEffect(() => {
    if (!payload) {
      return;
    }

    const nextPlannedWeekStartDay = resolvePlannedWeekStartDay(payload);
    if (plannedWeekStartDayRef.current !== nextPlannedWeekStartDay) {
      plannedWeekStartDayRef.current = nextPlannedWeekStartDay;
      setPlannedWeekStartDay(nextPlannedWeekStartDay);
    }
  }, [payload]);

  useEffect(() => {
    if (!householdId) {
      return () => {};
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const setupRealtime = async () => {
      const unsubscribe = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "tasks") return;
        void refreshBoard();
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
  }, [householdId, refreshBoard]);

  useEffect(() => {
    const parsedUserId = Number(currentUserId ?? 0);
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

        void refreshBoard();
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
  }, [currentUserId, refreshBoard]);

  const invalidateTaskCaches = useCallback(() => {
    if (householdId === null) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overviewRoot(householdId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.boardRoot(householdId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.root(householdId) });
  }, [householdId, queryClient]);

  return {
    loading: tasksBoardQuery.isLoading,
    error: tasksBoardQuery.error,
    refreshBoard,
    invalidateTaskCaches,
    tasksEnabled,
    canManageTemplates,
    canManageInstances,
    members,
    templates,
    instances,
    currentUserId,
    currentUserRole,
    plannedWeekStartDay,
    boardWeekStart,
  };
};
