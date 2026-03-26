import { Redirect, Slot, useRouter, useSegments, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Constants from "expo-constants";

import { Colors } from "@/constants/theme";
import { isApiClientError } from "@/src/api/client";
import { AppErrorBoundary } from "@/src/components/app-error-boundary";
import { AppAlertHost } from "@/src/components/app-alert-host";
import { resolveNotificationNavigationTarget, toPositiveInt } from "@/src/notifications/navigation";
import { queryKeys } from "@/src/query/query-keys";
import { setGlobalQueryClient } from "@/src/query/query-client";
import { subscribeToUserRealtime } from "@/src/realtime/client";
import { installUnauthorizedSessionHandler } from "@/src/session/session-expiration";
import { persistStoredUser, switchStoredHousehold } from "@/src/session/user-cache";
import { fetchMe } from "@/src/services/authService";
import { fetchPendingNotifications } from "@/src/services/homeService";
import { hydrateAuthState, logoutAuth, useAuthStore } from "@/src/store/useAuthStore";
import { installAppAlertInterceptor } from "@/src/utils/app-alert";
import { installIosTextScale } from "@/src/ui/ios-text-scale";

type NotificationsModule = typeof import("expo-notifications");

const isExpoGo = Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";

let notificationsModulePromise: Promise<NotificationsModule> | null = null;
const loadNotificationsModule = async (): Promise<NotificationsModule> => {
    if (!notificationsModulePromise) {
        notificationsModulePromise = import("expo-notifications");
    }
    return notificationsModulePromise;
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
    const [queryClient] = useState(() => new QueryClient({
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
    }));
    const [authBootstrapped, setAuthBootstrapped] = useState(false);
    const notifiedNotificationIdsRef = useRef<Set<number>>(new Set());
    const handledNotificationPressIdsRef = useRef<Set<number>>(new Set());
    const router = useRouter();
    const segments = useSegments() as string[];
    const token = useAuthStore((state) => state.token);
    const user = useAuthStore((state) => state.user);
    const authHydrated = useAuthStore((state) => state.hydrated);
    const authReady = authHydrated && authBootstrapped;
    const userId = Number(user?.id ?? 0);
    const hasUserId = Number.isFinite(userId) && userId > 0;
    const userMustChangePassword = !!user?.must_change_password;

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
        if (!authReady || !token || userMustChangePassword) {
            return;
        }

        let isCancelled = false;
        let timer: ReturnType<typeof setInterval> | null = null;
        let unsubscribeUserRealtime: (() => void) | null = null;
        let notificationResponseSubscription: { remove: () => void } | null = null;

        const bootstrapNotifications = async () => {
            try {
                let Notifications: NotificationsModule | null = null;
                if (!isExpoGo) {
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

                    const { status } = await Notifications.requestPermissionsAsync();
                    if (status === "granted") {
                        await Notifications.setNotificationChannelAsync("default", {
                            name: "default",
                            importance: Notifications.AndroidImportance.DEFAULT,
                        });
                    } else {
                        Notifications = null;
                    }
                }

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
                                        matchedNotification?.household_id
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

                if (Notifications) {
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
                }

                const scheduleLocalNotification = async (
                    notificationId: number,
                    title: string,
                    body: string,
                    data: Record<string, unknown> = {},
                ): Promise<void> => {
                    if (!Notifications) {
                        return;
                    }
                if (!Number.isFinite(notificationId) || notificationId <= 0) {
                    return;
                }
                if (notifiedNotificationIdsRef.current.has(notificationId) === false) {
                        notifiedNotificationIdsRef.current.add(notificationId);
                }

                await Notifications.scheduleNotificationAsync({
                    content: {
                    title,
                    body,
                    data,
                    },
                    trigger: null,
                });
            };

                const pullPendingNotifications = async () => {
                    if (isCancelled) {return;}
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
                };

                if (hasUserId) {
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
                            if (notifiedNotificationIdsRef.current.has(notificationId)) {
                            return;
                            }

                        notifiedNotificationIdsRef.current.add(notificationId);

                        void scheduleLocalNotification(notificationId, title, body, {
                            ...payload,
                            notification_id: notificationId,
                            notification_type: notificationType,
                            ...(householdId ? { household_id: householdId } : {}),
                        });
                        return;
                    }

                        void pullPendingNotifications();
                    });

                    if (isCancelled) {
                        unsubscribe();
                        return;
                    }

                    unsubscribeUserRealtime = unsubscribe;
                }

                await pullPendingNotifications();
                timer = setInterval(() => {
                    void pullPendingNotifications();
                }, 30000);
            } catch (error) {
                console.error("Erreur initialisation notifications:", error);
            }
        };

        void bootstrapNotifications();

        return () => {
            isCancelled = true;
            if (timer) {
                clearInterval(timer);
            }
            if (unsubscribeUserRealtime) {
                unsubscribeUserRealtime();
            }
            if (notificationResponseSubscription) {
                notificationResponseSubscription.remove();
            }
        };
    }, [authReady, hasUserId, router, token, userId, userMustChangePassword]);

    useEffect(() => {
        let isCancelled = false;

        const bootstrapAuth = async () => {
            try {
                const snapshot = await hydrateAuthState();
                let resolvedToken = snapshot.token;
                let resolvedUser = snapshot.user;

                if (resolvedToken && !resolvedUser) {
                    try {
                        const meUser = await fetchMe();
                        if (meUser) {
                            resolvedUser = meUser;
                            await persistStoredUser(meUser);
                        }
                    } catch {
                        // Token invalid or backend unavailable: handled below.
                    }
                }

                if ((!resolvedToken && resolvedUser) || (resolvedToken && !resolvedUser)) {
                    await logoutAuth();
                }
            } catch (error) {
                console.error("Erreur bootstrap auth:", error);
            } finally {
                if (!isCancelled) {
                    setAuthBootstrapped(true);
                }
            }
        };

        void bootstrapAuth();

        return () => {
            isCancelled = true;
        };
    }, []);

    const rootSegment = segments[0] ?? "";
    const nestedSegment = segments[1] ?? "";
    const currentSegment = rootSegment === "(auth)" || rootSegment === "(app)"
        ? nestedSegment
        : rootSegment;
    const hasToken = !!token;
    const mustChangePassword = userMustChangePassword;
    const hasHousehold = !!(user?.household_id || (Array.isArray(user?.households) && user.households.length > 0));
    const isPublicRoute = rootSegment === "(auth)"
        || currentSegment === ""
        || currentSegment === "login"
        || currentSegment === "register"
        || currentSegment === "forgot-password"
        || currentSegment === "password-reset";
    const isChangeCredentialsRoute = currentSegment === "change-credentials";
    const isHouseholdSetupRoute = currentSegment === "householdSetup";

    let redirectHref: Href | null = null;
    if (authReady) {
        if (!hasToken && !isPublicRoute) {
            redirectHref = "/";
        } else if (hasToken) {
            if (mustChangePassword) {
                if (!isChangeCredentialsRoute) {
                    redirectHref = "/change-credentials";
                }
            } else if (isChangeCredentialsRoute) {
                redirectHref = hasHousehold ? "/home" : "/householdSetup";
            } else if (!hasHousehold && !isHouseholdSetupRoute) {
                redirectHref = "/householdSetup";
            } else if (hasHousehold && isPublicRoute) {
                redirectHref = "/home";
            }
        }
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <QueryClientProvider client={queryClient}>
                <AppErrorBoundary>
                    {!authReady ? (
                        <View style={{ flex: 1, backgroundColor: Colors.light.background }} />
                    ) : redirectHref ? (
                        <Redirect href={redirectHref} />
                    ) : (
                        <Slot />
                    )}
                    <AppAlertHost />
                </AppErrorBoundary>
            </QueryClientProvider>
        </GestureHandlerRootView>
    );
}
