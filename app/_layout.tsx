import { Slot } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { isApiClientError } from "@/src/api/client";
import { useAppRealtime } from "@/src/hooks/useAppRealtime";
import { useAuthBootstrap } from "@/src/hooks/useAuthBootstrap";
import { useNotificationSetup } from "@/src/hooks/useNotificationSetup";
import { AppAlertHost } from "@/src/components/app-alert-host";
import { AppErrorBoundary } from "@/src/components/app-error-boundary";
import { queryKeys } from "@/src/query/query-keys";
import { setGlobalQueryClient } from "@/src/query/query-client";
import { installUnauthorizedSessionHandler } from "@/src/session/session-expiration";
import { fetchPendingNotifications } from "@/src/services/homeService";
import { useAuthStore } from "@/src/store/useAuthStore";
import { installAppAlertInterceptor } from "@/src/utils/app-alert";
import { installIosTextScale } from "@/src/ui/ios-text-scale";

const createRootQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (isApiClientError(error)) {
            if (error.status === 401 || error.status === 403 || error.status === 404) {
              return false;
            }
            if (!error.retryable) {
              return false;
            }
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4000),
        refetchOnReconnect: true,
      },
      mutations: {
        retry: (failureCount, error) => {
          if (isApiClientError(error) && !error.retryable) {
            return false;
          }
          return failureCount < 1;
        },
      },
    },
  });
};

if (__DEV__) {
  LogBox.ignoreLogs([
    "Uncaught (in promise, id: 0) Error: Unable to activate keep awake",
    "Unable to activate keep awake",
  ]);
}

installAppAlertInterceptor();
installIosTextScale();

export default function RootLayout() {
  const [queryClient] = useState(createRootQueryClient);
  const { isBootstrapping, mustChangePassword, user } = useAuthBootstrap();
  const token = useAuthStore((state) => state.token);
  const authReady = !isBootstrapping;
  const userId = Number(user?.id ?? 0);
  const notificationsEnabled = authReady && !!token && !mustChangePassword;
  const { scheduleLocalNotification } = useNotificationSetup({
    enabled: notificationsEnabled,
    token,
    queryClient,
  });
  const pullPendingNotifications = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      await queryClient.fetchQuery({
        queryKey: queryKeys.home.pendingNotifications(token),
        queryFn: fetchPendingNotifications,
        staleTime: 10_000,
        gcTime: 5 * 60_000,
      });
    } catch (error: any) {
      if (Number(error?.status) !== 429) {
        console.error("Erreur pull notifications:", error);
      }
    }
  }, [queryClient, token]);

  useAppRealtime({
    enabled: notificationsEnabled,
    userId,
    scheduleLocalNotification,
    onIncompleteNotificationPayload: pullPendingNotifications,
  });

  useEffect(() => {
    setGlobalQueryClient(queryClient);
    return () => {
      setGlobalQueryClient(null);
    };
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = installUnauthorizedSessionHandler();
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!notificationsEnabled) {
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    void pullPendingNotifications();
    timer = setInterval(() => {
      void pullPendingNotifications();
    }, 30000);

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [notificationsEnabled, pullPendingNotifications]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          {!authReady ? (
            <View style={{ flex: 1, backgroundColor: Colors.light.background }} />
          ) : (
            <Slot />
          )}
          <AppAlertHost />
        </AppErrorBoundary>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
