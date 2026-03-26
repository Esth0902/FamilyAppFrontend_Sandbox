import { useEffect } from "react";

import { toPositiveInt } from "@/src/notifications/navigation";
import { subscribeToUserRealtime } from "@/src/realtime/client";

type ScheduleLocalNotificationInput = {
  notificationId: number;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type UseAppRealtimeArgs = {
  enabled: boolean;
  userId: number;
  scheduleLocalNotification: (input: ScheduleLocalNotificationInput) => Promise<void>;
  onNotificationEvent?: (payload: Record<string, unknown>) => void | Promise<void>;
  onIncompleteNotificationPayload: () => void | Promise<void>;
};

export const useAppRealtime = ({
  enabled,
  userId,
  scheduleLocalNotification,
  onNotificationEvent,
  onIncompleteNotificationPayload,
}: UseAppRealtimeArgs): void => {
  useEffect(() => {
    if (!enabled || !Number.isFinite(userId) || userId <= 0) {
      return;
    }

    let isCancelled = false;
    let unsubscribeUserRealtime: (() => void) | null = null;

    const bindRealtime = async () => {
      const unsubscribe = await subscribeToUserRealtime(userId, (message) => {
        const module = String(message?.module ?? "");
        if (module !== "notifications") {
          return;
        }

        const payload = (message?.payload ?? {}) as Record<string, unknown>;
        const notificationId = Number(payload.notification_id ?? 0);
        const title = String(payload.title ?? "").trim();
        const body = String(payload.body ?? "").trim();
        const householdId = toPositiveInt(payload.household_id ?? payload.householdId);
        const notificationType = String(payload.notification_type ?? payload.type ?? "").trim();

        if (notificationId > 0 && title.length > 0 && body.length > 0) {
          void onNotificationEvent?.(payload);
          void scheduleLocalNotification({
            notificationId,
            title,
            body,
            data: {
              ...payload,
              notification_id: notificationId,
              notification_type: notificationType,
              ...(householdId ? { household_id: householdId } : {}),
            },
          });
          return;
        }

        void onIncompleteNotificationPayload();
      });

      if (isCancelled) {
        unsubscribe();
        return;
      }

      unsubscribeUserRealtime = unsubscribe;
    };

    void bindRealtime();

    return () => {
      isCancelled = true;
      if (unsubscribeUserRealtime) {
        unsubscribeUserRealtime();
      }
    };
  }, [enabled, onIncompleteNotificationPayload, onNotificationEvent, scheduleLocalNotification, userId]);
};
