import { useEffect } from "react";

import { subscribeToHouseholdRealtime, subscribeToUserRealtime } from "@/src/realtime/client";

type UseCalendarRealtimeRefreshArgs = {
  householdId: number | null;
  taskCurrentUserId: number | null;
  refreshBoard: () => void;
};

export const useCalendarRealtimeRefresh = ({
  householdId,
  taskCurrentUserId,
  refreshBoard,
}: UseCalendarRealtimeRefreshArgs) => {
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
        refreshBoard();
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

        refreshBoard();
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
  }, [refreshBoard, taskCurrentUserId]);
};
