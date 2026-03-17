import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { View, ActivityIndicator, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import Constants from "expo-constants";

import { Colors } from "@/constants/theme";
import { apiFetch } from "@/src/api/client";
import { AppErrorBoundary } from "@/src/components/app-error-boundary";
import { AppAlertHost } from "@/src/components/app-alert-host";
import { subscribeToUserRealtime } from "@/src/realtime/client";
import { clearStoredUser, getStoredUser, persistStoredUser, setStoredUserCache } from "@/src/session/user-cache";
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
    const [isMounted, setIsMounted] = useState(false);
    const notifiedNotificationIdsRef = useRef<Set<number>>(new Set());
    const router = useRouter();
    const segments = useSegments() as string[];
    const currentSegment = segments[0] ?? "";

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted) {
            return;
        }

        let isCancelled = false;
        let timer: ReturnType<typeof setInterval> | null = null;
        let unsubscribeUserRealtime: (() => void) | null = null;

        const bootstrapNotifications = async () => {
            try {
                const token = await SecureStore.getItemAsync("authToken");
                if (!token) {
                    return;
                }

                const user = await getStoredUser();
                if (user?.must_change_password) {
                    return;
                }

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
                    if (notifiedNotificationIdsRef.current.has(notificationId)) {
                        return;
                    }

                    await Notifications.scheduleNotificationAsync({
                        content: {
                            title,
                            body,
                            data,
                        },
                        trigger: null,
                    });
                    notifiedNotificationIdsRef.current.add(notificationId);
                };

                const pullPendingNotifications = async () => {
                    if (isCancelled) {
                        return;
                    }

                    try {
                        const response = await apiFetch("/notifications/pending?all_households=1");
                        const notifications = Array.isArray(response?.notifications) ? response.notifications : [];

                        for (const notification of notifications) {
                            const notificationId = Number(notification?.id ?? 0);
                            if (!Number.isFinite(notificationId) || notificationId <= 0) {
                                continue;
                            }

                            const notificationType = String(notification?.type ?? "");
                            const data = (notification?.data ?? {}) as Record<string, unknown>;
                            const inviterName = String(data.inviter_name ?? "").trim() || "Un parent";
                            const householdName = String(data.household_name ?? "").trim() || "ce foyer";
                            const requesterName = String(data.requester_name ?? data.requester_household_name ?? "").trim() || "Un foyer";
                            const taskName = String(data.task_name ?? "").trim() || "une tâche";
                            const body = notificationType === "household_invite"
                                ? `${inviterName} vous invite à rejoindre le foyer ${householdName}.`
                                : notificationType === "household_link_request"
                                    ? `${requesterName} souhaite connecter son foyer à ${householdName}.`
                                : notificationType === "task_reassignment_invite"
                                    ? `${requesterName} vous demande de reprendre ${taskName} (foyer : ${householdName}).`
                                    : String(notification?.body ?? "");

                            await scheduleLocalNotification(
                                notificationId,
                                String(notification?.title ?? "FamilyFlow"),
                                body,
                                (notification?.data ?? {}) as Record<string, unknown>,
                            );
                        }
                    } catch (error: any) {
                        if (Number(error?.status) !== 429) {
                            console.error("Erreur pull notifications:", error);
                        }
                    }
                };

                const parsedUserId = Number(user?.id ?? 0);
                if (Number.isFinite(parsedUserId) && parsedUserId > 0) {
                    const unsubscribe = await subscribeToUserRealtime(parsedUserId, (message) => {
                        const module = String(message?.module ?? "");
                        if (module !== "notifications") {
                            return;
                        }

                        const payload = (message?.payload ?? {}) as Record<string, unknown>;
                        const notificationId = Number(payload.notification_id ?? 0);
                        const title = String(payload.title ?? "").trim();
                        const body = String(payload.body ?? "").trim();

                        if (notificationId > 0 && title.length > 0 && body.length > 0) {
                            void scheduleLocalNotification(notificationId, title, body, payload);
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
        };
    }, [isMounted]);

    useEffect(() => {
        if (!isMounted) return;

        const checkAuth = async () => {
            try {
                const token = await SecureStore.getItemAsync("authToken");
                let user = token ? await getStoredUser() : null;

                if (token && !user) {
                    try {
                        const meResponse = await apiFetch("/me");
                        if (meResponse?.user) {
                            user = meResponse.user;
                            await persistStoredUser(meResponse.user);
                        }
                    } catch {
                        // Token invalid or backend unavailable: handled below.
                    }
                }

                if (token && !user) {
                    await SecureStore.deleteItemAsync("authToken");
                    await clearStoredUser();
                } else if (!token) {
                    setStoredUserCache(null, true);
                }

                const refreshedToken = await SecureStore.getItemAsync("authToken");
                const hasToken = !!refreshedToken;

                const isPublicRoute = currentSegment === ""
                    || currentSegment === "login"
                    || currentSegment === "register"
                    || currentSegment === "forgot-password"
                    || currentSegment === "password-reset";
                const isChangeCredentialsRoute = currentSegment === "change-credentials";

                console.log("Check Auth -> Token:", hasToken, "| Segment:", currentSegment);

                if (hasToken) {
                    const mustChangePassword = !!user?.must_change_password;
                    if (mustChangePassword) {
                        if (!isChangeCredentialsRoute) {
                            router.replace("/change-credentials");
                        }
                        return;
                    }

                    if (isChangeCredentialsRoute) {
                        router.replace("/(tabs)/home");
                        return;
                    }

                    const hasHousehold = user?.household_id || (user?.households && user.households.length > 0);

                    if (!hasHousehold && currentSegment !== "householdSetup") {
                        router.replace("/householdSetup");
                    } else if (hasHousehold && isPublicRoute) {
                        router.replace("/(tabs)/home");
                    }
                } else if (!isPublicRoute) {
                    router.replace("/");
                }
            } catch (err) {
                console.error("Erreur auth: ", err);
            }
        };

        checkAuth().catch((err) => {
            console.error("Erreur inattendue dans checkAuth:", err);
        });

    }, [currentSegment, isMounted, router]);

    if (!isMounted) {
        return (
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <ActivityIndicator size="large" color={Colors.light.tint} />
                </View>
            </GestureHandlerRootView>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <AppErrorBoundary>
                <Slot />
                <AppAlertHost />
            </AppErrorBoundary>
        </GestureHandlerRootView>
    );
}
