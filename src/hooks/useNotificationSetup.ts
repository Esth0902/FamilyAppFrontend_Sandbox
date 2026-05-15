import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { QueryClient } from "@tanstack/react-query";

import { resolveNotificationNavigationTarget, toPositiveInt } from "@/src/notifications/navigation";
import { queryKeys } from "@/src/query/query-keys";
import { switchStoredHousehold } from "@/src/session/user-cache";
import { fetchPendingNotifications } from "@/src/services/homeService";
import { syncPushTokenWithSystemPermissions } from "@/src/services/pushNotificationsService";

type NotificationsModule = typeof import("expo-notifications");

type UseNotificationSetupArgs = {
  enabled: boolean;
  token: string | null;
  queryClient: QueryClient;
};

type ScheduleLocalNotificationArgs = {
  notificationId: number;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type UseNotificationSetupResult = {
  scheduleLocalNotification: (args: ScheduleLocalNotificationArgs) => Promise<void>;
};

let notificationsModulePromise: Promise<NotificationsModule> | null = null;
const loadNotificationsModule = async (): Promise<NotificationsModule> => {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications");
  }
  return notificationsModulePromise;
};

export const useNotificationSetup = ({
  enabled,
  token,
  queryClient,
}: UseNotificationSetupArgs): UseNotificationSetupResult => {
  const router = useRouter();
  const notificationsModuleRef = useRef<NotificationsModule | null>(null);
  const notifiedNotificationIdsRef = useRef<Set<number>>(new Set());
  const handledNotificationPressIdsRef = useRef<Set<number>>(new Set());
  const canUseRemotePushRef = useRef(false);

  const scheduleLocalNotification = useCallback(
    async ({ notificationId, title, body, data = {} }: ScheduleLocalNotificationArgs) => {
      const Notifications = notificationsModuleRef.current;
      if (!Notifications) {
        return;
      }

      // Si le push distant est actif, on évite les doublons via push local.
      if (canUseRemotePushRef.current) {
        return;
      }

      if (!Number.isFinite(notificationId) || notificationId <= 0) {
        return;
      }

      if (notifiedNotificationIdsRef.current.has(notificationId)) {
        return;
      }

      notifiedNotificationIdsRef.current.add(notificationId);

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
        },
        trigger: null,
      });
    },
    []
  );

  useEffect(() => {
    if (!enabled || !token) {
      notificationsModuleRef.current = null;
      canUseRemotePushRef.current = false;
      return;
    }

    let isCancelled = false;
    let notificationResponseSubscription: { remove: () => void } | null = null;

    const openNotificationFromData = async (rawData: Record<string, unknown>) => {
      const notificationId = toPositiveInt(rawData.notification_id ?? rawData.id);
      if (notificationId && handledNotificationPressIdsRef.current.has(notificationId)) {
        return;
      }

      if (notificationId) {
        handledNotificationPressIdsRef.current.add(notificationId);
      }

      let resolvedHouseholdId = toPositiveInt(rawData.household_id ?? rawData.householdId);
      let notificationType = String(rawData.notification_type ?? rawData.type ?? "").trim();
      const pendingNotificationsQueryKey = queryKeys.home.pendingNotifications(token);
      const fetchPendingNotificationsQuery = async () => {
        return await queryClient.fetchQuery({
          queryKey: pendingNotificationsQueryKey,
          queryFn: fetchPendingNotifications,
          staleTime: 10_000,
          gcTime: 5 * 60_000,
        });
      };

      if (notificationId && notificationType.length === 0) {
        try {
          const notifications = await fetchPendingNotificationsQuery();
          const matchedNotification = notifications.find(
            (notification: any) => Number(notification?.id ?? 0) === notificationId
          );

          if (matchedNotification) {
            notificationType = String(matchedNotification?.type ?? "").trim();
            if (!resolvedHouseholdId) {
              resolvedHouseholdId = toPositiveInt(
                matchedNotification?.householdId
                ?? (matchedNotification?.data as Record<string, unknown> | null)?.household_id
              );
            }
          }
        } catch (error) {
          console.error("Erreur récupération type notification:", error);
        }
      }

      if (resolvedHouseholdId) {
        try {
          await switchStoredHousehold(resolvedHouseholdId);
        } catch (error) {
          console.error("Erreur switch foyer depuis notification:", error);
        }
      }

      const target = resolveNotificationNavigationTarget(notificationType);
      router.push(target);
    };

    const bootstrapNotifications = async () => {
      try {
        let Notifications: NotificationsModule | null = null;
        canUseRemotePushRef.current = false;
        Notifications = await loadNotificationsModule();
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        const syncResult = await syncPushTokenWithSystemPermissions({ requestPermission: true });
        canUseRemotePushRef.current = syncResult.canUseRemotePush;

        if (syncResult.permissionStatus !== "granted") {
          Notifications = null;
        }

        if (isCancelled) {
          return;
        }

        notificationsModuleRef.current = Notifications;

        if (!Notifications) {
          return;
        }

        const onNotificationResponse = (
          response: { notification?: { request?: { content?: { data?: unknown } } } } | null
        ) => {
          const rawData = (
            response?.notification?.request?.content?.data ?? {}
          ) as Record<string, unknown>;

          if (!rawData || typeof rawData !== "object") {
            return;
          }

          void openNotificationFromData(rawData);
        };

        notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(
          onNotificationResponse
        );

        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          onNotificationResponse(lastResponse as { notification?: { request?: { content?: { data?: unknown } } } });
        }

        let currentAppState = AppState.currentState;
        const appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
          const wasBackgrounded = currentAppState === "inactive" || currentAppState === "background";
          currentAppState = nextAppState;

          if (!wasBackgrounded || nextAppState !== "active") {
            return;
          }

          void (async () => {
            try {
              const resumeSyncResult = await syncPushTokenWithSystemPermissions({ requestPermission: false });
              canUseRemotePushRef.current = resumeSyncResult.canUseRemotePush;
            } catch (error) {
              console.error("Erreur sync notifications au retour app:", error);
            }
          })();
        });

        const previousCleanup = notificationResponseSubscription;
        notificationResponseSubscription = {
          remove: () => {
            previousCleanup?.remove();
            appStateSubscription.remove();
          },
        };
      } catch (error) {
        console.error("Erreur initialisation notifications:", error);
      }
    };

    void bootstrapNotifications();

    return () => {
      isCancelled = true;
      notificationsModuleRef.current = null;
      if (notificationResponseSubscription) {
        notificationResponseSubscription.remove();
      }
    };
  }, [enabled, queryClient, router, token]);

  return {
    scheduleLocalNotification,
  };
};
