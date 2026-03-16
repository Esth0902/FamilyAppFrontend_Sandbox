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

export default function RootLayout() {
    const [isMounted, setIsMounted] = useState(false);
    const notifiedNotificationIdsRef = useRef<Set<number>>(new Set());
    const router = useRouter();
    const segments = useSegments() as string[];

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
                        const response = await apiFetch("/notifications/pending");
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
                            const requesterName = String(data.requester_name ?? "").trim() || "Un membre";
                            const taskName = String(data.task_name ?? "").trim() || "une tache";
                            const body = notificationType === "household_invite"
                                ? `${inviterName} vous invite a rejoindre le foyer ${householdName}.`
                                : notificationType === "task_reassignment_invite"
                                    ? `${requesterName} vous demande de reprendre ${taskName}.`
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
                    unsubscribeUserRealtime = await subscribeToUserRealtime(parsedUserId, (message) => {
                        const module = String(message?.module ?? "");
                        const type = String(message?.type ?? "");
                        if (module !== "notifications") {
                            return;
                        }

                        const payload = (message?.payload ?? {}) as Record<string, unknown>;
                        const notificationId = Number(payload.notification_id ?? 0);
                        if (type === "household_invite_created") {
                            const inviterName = String(payload.inviter_name ?? "").trim() || "Un parent";
                            const householdName = String(payload.household_name ?? "").trim() || "ce foyer";
                            void scheduleLocalNotification(
                                notificationId,
                                "Invitation de foyer",
                                `${inviterName} vous invite a rejoindre le foyer ${householdName}.`,
                                payload,
                            );
                            return;
                        }

                        if (type === "task_reassignment_invite_created") {
                            const requesterName = String(payload.requester_name ?? "").trim() || "Un membre";
                            const taskName = String(payload.task_name ?? "").trim() || "une tache";
                            void scheduleLocalNotification(
                                notificationId,
                                "Demande de reprise",
                                `${requesterName} vous demande de reprendre ${taskName}.`,
                                payload,
                            );
                            return;
                        }

                        if (type === "task_reassignment_invite_responded") {
                            const responderName = String(payload.responder_name ?? "").trim() || "Un membre";
                            const taskName = String(payload.task_name ?? "").trim() || "la tache";
                            const status = String(payload.status ?? "").trim();
                            const body = status === "accepted"
                                ? `${responderName} a accepte de reprendre ${taskName}.`
                                : `${responderName} a refuse de reprendre ${taskName}.`;
                            void scheduleLocalNotification(
                                notificationId,
                                "Reponse demande de reprise",
                                body,
                                payload,
                            );
                        }
                    });
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

                const isPublicRoute = segments.length === 0
                    || segments[0] === "login"
                    || segments[0] === "register"
                    || segments[0] === "forgot-password"
                    || segments[0] === "password-reset";
                const isChangeCredentialsRoute = segments[0] === "change-credentials";

                console.log("Check Auth -> Token:", hasToken, "| Segment:", segments[0]);

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

                    if (!hasHousehold && segments[0] !== "householdSetup") {
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

    }, [isMounted, segments, router]);

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
