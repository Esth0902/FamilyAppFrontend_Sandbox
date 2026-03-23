import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/src/query/query-keys";
import {
  fetchTasksBoardForCurrentWeek,
  isDoneStatus,
  isInstanceAssignedToUser,
  isTodoStatus,
  toPositiveInt,
  type TasksBoardPayload,
} from "@/src/services/tasksService";

type UseTasksOverviewArgs = {
  householdId: number | null;
};

type RefreshOptions = {
  bypassCache?: boolean;
};

export const useTasksOverview = ({ householdId }: UseTasksOverviewArgs) => {
  const [plannedWeekStartDay, setPlannedWeekStartDay] = useState<number>(1);
  const bypassCacheRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.tasks.overview(householdId, plannedWeekStartDay),
    enabled: householdId !== null,
    staleTime: 12_000,
    queryFn: () => fetchTasksBoardForCurrentWeek(plannedWeekStartDay, {
      bypassCache: bypassCacheRef.current,
    }),
  });

  useEffect(() => {
    const nextWeekStart = query.data?.resolvedWeekStartDay ?? plannedWeekStartDay;
    if (nextWeekStart !== plannedWeekStartDay) {
      setPlannedWeekStartDay(nextWeekStart);
    }
  }, [plannedWeekStartDay, query.data?.resolvedWeekStartDay]);

  const refreshBoard = useCallback(async (options?: RefreshOptions) => {
    bypassCacheRef.current = options?.bypassCache === true;
    try {
      await query.refetch();
    } finally {
      bypassCacheRef.current = false;
    }
  }, [query]);

  const payload = useMemo(() => (query.data?.payload ?? null) as TasksBoardPayload | null, [query.data?.payload]);

  const currentUserRole = payload?.current_user?.role === "parent" ? "parent" : "enfant";
  const currentUserId = toPositiveInt(payload?.current_user?.id);
  const visibleInstances = useMemo(() => {
    const instances = Array.isArray(payload?.instances) ? payload.instances : [];
    if (currentUserRole === "parent") {
      return instances;
    }
    if (currentUserId === null) {
      return [];
    }
    return instances.filter((instance) => isInstanceAssignedToUser(instance, currentUserId));
  }, [currentUserId, currentUserRole, payload?.instances]);

  const stats = useMemo(() => ({
    todo: visibleInstances.filter((instance) => isTodoStatus(instance.status)).length,
    done: visibleInstances.filter((instance) => isDoneStatus(instance.status)).length,
    validated: visibleInstances.filter((instance) => instance.validated_by_parent).length,
  }), [visibleInstances]);

  return {
    payload,
    tasksEnabled: Boolean(payload?.tasks_enabled),
    canManageTemplates: Boolean(payload?.can_manage_templates),
    canManageInstances: Boolean(payload?.can_manage_instances),
    currentUserRole,
    stats,
    isInitialLoading: query.isPending,
    isRefreshing: query.isRefetching,
    error: (query.error as Error | null) ?? null,
    refreshBoard,
  };
};
