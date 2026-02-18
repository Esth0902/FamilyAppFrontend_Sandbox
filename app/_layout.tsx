import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '@/constants/theme';
import { apiFetch } from "@/src/api/client";
import Constants from "expo-constants";

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

export default function RootLayout() {
    const [isMounted, setIsMounted] = useState(false);
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

        const bootstrapNotifications = async () => {
            try {
                if (isExpoGo) {
                    return;
                }

                const token = await SecureStore.getItemAsync('authToken');
                if (!token) {
                    return;
                }

                const userStr = await SecureStore.getItemAsync("user");
                if (userStr) {
                    try {
                        const user = JSON.parse(userStr);
                        if (user?.must_change_password) {
                            return;
                        }
                    } catch {
                        // Ignore malformed user cache.
                    }
                }

                const Notifications = await loadNotificationsModule();
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
                if (status !== 'granted') {
                    return;
                }

                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance.DEFAULT,
                });

                const pullPendingNotifications = async () => {
                    if (isCancelled) {
                        return;
                    }

                    try {
                        const response = await apiFetch('/notifications/pending');
                        const notifications = Array.isArray(response?.notifications) ? response.notifications : [];

                        for (const notification of notifications) {
                            await Notifications.scheduleNotificationAsync({
                                content: {
                                    title: String(notification?.title ?? 'FamilyApp'),
                                    body: String(notification?.body ?? ''),
                                    data: notification?.data ?? {},
                                },
                                trigger: null,
                            });
                        }
                    } catch (error: any) {
                        if (Number(error?.status) !== 429) {
                            console.error('Erreur pull notifications:', error);
                        }
                    }
                };

                await pullPendingNotifications();
                timer = setInterval(() => {
                    void pullPendingNotifications();
                }, 30000);
            } catch (error) {
                console.error('Erreur initialisation notifications:', error);
            }
        };

        void bootstrapNotifications();

        return () => {
            isCancelled = true;
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [isMounted]);

    useEffect(() => {
        if (!isMounted) return;

        const checkAuth = async () => {
            try {
                const token = await SecureStore.getItemAsync('authToken');
                const userStr = await SecureStore.getItemAsync('user');
                let user = null;
                if (userStr) {
                    try {
                        user = JSON.parse(userStr);
                    } catch {
                        await SecureStore.deleteItemAsync("user");
                    }
                }

                if (token && !user) {
                    try {
                        const meResponse = await apiFetch("/me");
                        if (meResponse?.user) {
                            user = meResponse.user;
                            await SecureStore.setItemAsync("user", JSON.stringify(meResponse.user));
                        }
                    } catch {
                        // Token invalid or backend unavailable: handled below.
                    }
                }

                const isPublicRoute = segments.length === 0
                    || segments[0] === 'login'
                    || segments[0] === 'register'
                    || segments[0] === 'forgot-password'
                    || segments[0] === 'password-reset';
                const isChangeCredentialsRoute = segments[0] === 'change-credentials';

                console.log("🔍 Check Auth -> Token:", !!token, "| Segment:", segments[0]);

                if (token) {
                    const mustChangePassword = !!user?.must_change_password;
                    if (mustChangePassword) {
                        if (!isChangeCredentialsRoute) {
                            router.replace('/change-credentials');
                        }
                        return;
                    }

                    if (isChangeCredentialsRoute) {
                        router.replace('/(tabs)/home');
                        return;
                    }

                    const hasHousehold = user?.household_id || (user?.households && user.households.length > 0);

                    if (!hasHousehold && segments[0] !== 'householdSetup') {
                        router.replace('/householdSetup');
                    } else if (hasHousehold && isPublicRoute) {
                        router.replace('/(tabs)/home');
                    }
                } else if (!isPublicRoute) {
                    router.replace('/');
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
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={Colors.light.tint} />
                </View>
            </GestureHandlerRootView>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Slot />
        </GestureHandlerRootView>
    );
}
