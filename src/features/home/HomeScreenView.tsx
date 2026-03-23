import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    ScrollView,
    useColorScheme,
    Alert,
} from "react-native";

import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useHomeData } from "@/src/hooks/useHomeData";
import {
    resolveNotificationNavigationTarget,
    toPositiveInt,
    type NotificationNavigationTarget,
} from "@/src/notifications/navigation";
import { subscribeToUserRealtime } from "@/src/realtime/client";
import {
    persistStoredUser,
    switchStoredHousehold,
    useStoredUserState,
} from "@/src/session/user-cache";
import {
    leaveActiveHousehold,
    markNotificationRead,
    normalizeHouseholds,
    respondToNotification,
    type HomePendingNotification,
} from "@/src/services/homeService";
import { logoutAuthenticatedUser } from "@/src/services/authService";
import { useAuthStore } from "@/src/store/useAuthStore";

type PendingNotification = HomePendingNotification;

const ACTION_REQUIRED_NOTIFICATION_TYPES = new Set([
    "household_invite",
    "household_link_request",
    "task_reassignment_invite",
    "household_deletion_approval_request",
    "household_deletion_cancel_window",
]);

const formatNotificationDate = (isoDate: string | null): string => {
    if (!isoDate) return "";

    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return "";

    return parsed.toLocaleString("fr-BE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const formatDueDate = (rawIsoDate: unknown): string => {
    if (typeof rawIsoDate !== "string" || rawIsoDate.trim() === "") return "";

    const parsed = new Date(`${rawIsoDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "";

    return parsed.toLocaleDateString("fr-BE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
};

const resolveNotificationJustification = (data: Record<string, unknown>): string => {
    const value = typeof data.justification === "string"
        ? data.justification
        : typeof data.comment === "string"
            ? data.comment
            : "";

    return value.trim();
};

const getNotificationNavigationTarget = (
    notification: PendingNotification
): NotificationNavigationTarget | null => {
    return resolveNotificationNavigationTarget(notification.type);
};

export default function ConnectedHome() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const { user } = useStoredUserState();
    const token = useAuthStore((state) => state.token);
    const logout = useAuthStore((state) => state.logout);

    const {
        pendingNotifications,
        isInitialLoading,
        profileError,
        notificationsError,
        refreshAll,
        refreshNotifications,
        invalidateNotifications,
    } = useHomeData({ token, user });

    const [processingNotificationId, setProcessingNotificationId] = useState<number | null>(null);
    const [processingBulkRead, setProcessingBulkRead] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [switchingHouseholdId, setSwitchingHouseholdId] = useState<number | null>(null);

    const households = useMemo(() => normalizeHouseholds(user?.households), [user?.households]);
    const firstHouseholdId = households[0]?.id ?? null;

    const activeHouseholdId = useMemo((): number | null => {
        const householdId = toPositiveInt(user?.household_id);
        if (householdId) return householdId;
        return firstHouseholdId;
    }, [firstHouseholdId, user?.household_id]);

    useEffect(() => {
        if (!profileError && !notificationsError) {
            return;
        }

        console.error("Erreur chargement home:", {
            profile: profileError?.message,
            notifications: notificationsError?.message,
        });
    }, [notificationsError, profileError]);

    useEffect(() => {
        if (!token) {
            return;
        }

        let isActive = true;
        let unsubscribeRealtime: (() => void) | null = null;

        const subscribeRealtime = async () => {
            const parsedUserId = Number(user?.id ?? 0);
            if (!Number.isFinite(parsedUserId) || parsedUserId <= 0) {
                return;
            }

            const unsubscribe = await subscribeToUserRealtime(parsedUserId, (message) => {
                const module = String(message?.module ?? "");
                if (module !== "notifications") {
                    return;
                }
                void invalidateNotifications();
            });

            if (!isActive) {
                unsubscribe();
                return;
            }

            unsubscribeRealtime = unsubscribe;
        };

        void subscribeRealtime();

        return () => {
            isActive = false;
            if (unsubscribeRealtime) {
                unsubscribeRealtime();
            }
        };
    }, [invalidateNotifications, token, user?.id]);
    const onSetupHouse = () => {
        router.push("/householdSetup");
    };

    const onSwitchHousehold = useCallback(
        async (householdId: number): Promise<boolean> => {
            setSwitchingHouseholdId(householdId);
            try {
                await switchStoredHousehold(householdId);
                await refreshAll();
                return true;
            } catch (error: any) {
                Alert.alert("Foyer", error?.message || "Impossible de sélectionner ce foyer.");
                return false;
            } finally {
                setSwitchingHouseholdId(null);
            }
        },
        [refreshAll]
    );

    const onOpenHouseholdDashboard = useCallback(
        async (householdId: number) => {
            if (householdId !== activeHouseholdId) {
                const switched = await onSwitchHousehold(householdId);
                if (!switched) {
                    return;
                }
            }
            router.push("/dashboard");
        },
        [activeHouseholdId, onSwitchHousehold, router]
    );

    const onEditHouseholdConfig = useCallback(
        async (householdId: number) => {
            const switched = householdId === activeHouseholdId
                ? true
                : await onSwitchHousehold(householdId);

            if (!switched) {
                return;
            }

            router.push("/householdSetup?mode=edit");
        },
        [activeHouseholdId, onSwitchHousehold, router]
    );

    const onRespondToNotification = async (
        notification: PendingNotification,
        action: "accept" | "refuse" | "cancel"
    ) => {
        setProcessingNotificationId(notification.id);
        try {
            const response = await respondToNotification(notification.id, notification.type, action);
            const typedResponse = response as { user?: unknown } | null;
            if (notification.type === "household_invite" && action === "accept" && typedResponse?.user) {
                await persistStoredUser(typedResponse.user as Record<string, unknown>);
            }

            await refreshNotifications();
        } catch (error: any) {
            Alert.alert("Notification", error?.message || "Impossible de traiter cette notification.");
        } finally {
            setProcessingNotificationId(null);
        }
    };

    const onLeaveHouseholdFromNotification = useCallback(
        async (notification: PendingNotification) => {
            setProcessingNotificationId(notification.id);
            try {
                if (notification.householdId && notification.householdId !== activeHouseholdId) {
                    const switched = await onSwitchHousehold(notification.householdId);
                    if (!switched) {
                        return;
                    }
                }

                const response = await leaveActiveHousehold();
                if (response?.user) {
                    await persistStoredUser(response.user as Record<string, unknown>);
                }

                await refreshNotifications();
                Alert.alert("Foyer", "Vous avez quitté ce foyer.");
            } catch (error: any) {
                Alert.alert("Foyer", error?.message || "Impossible de quitter ce foyer.");
            } finally {
                setProcessingNotificationId(null);
            }
        },
        [activeHouseholdId, onSwitchHousehold, refreshNotifications]
    );

    const onMarkNotificationRead = async (notification: PendingNotification) => {
        setProcessingNotificationId(notification.id);
        try {
            await markNotificationRead(notification.id);
            await refreshNotifications();
        } catch (error: any) {
            Alert.alert("Notification", error?.message || "Impossible de marquer la notification comme lue.");
        } finally {
            setProcessingNotificationId(null);
        }
    };

    const readableNotifications = useMemo(
        () => pendingNotifications.filter((notification) => !ACTION_REQUIRED_NOTIFICATION_TYPES.has(notification.type)),
        [pendingNotifications]
    );

    const onMarkAllNotificationsRead = async () => {
        if (readableNotifications.length <= 1) {
            return;
        }

        setProcessingBulkRead(true);
        try {
            for (const notification of readableNotifications) {
                await markNotificationRead(notification.id);
            }
            await refreshNotifications();
        } catch (error: any) {
            Alert.alert("Notification", error?.message || "Impossible de tout marquer comme lu.");
        } finally {
            setProcessingBulkRead(false);
        }
    };

    const onOpenNotification = useCallback(
        async (notification: PendingNotification) => {
            if (
                notification.householdId &&
                notification.householdId !== activeHouseholdId
            ) {
                const switched = await onSwitchHousehold(notification.householdId);
                if (!switched) {
                    return;
                }
            }

            const target = getNotificationNavigationTarget(notification);
            if (!target) return;
            router.push(target);
        },
        [activeHouseholdId, onSwitchHousehold, router]
    );

    const onLogout = async () => {
        try {
            if (token) {
                logoutAuthenticatedUser().catch((e) => console.log("Logout backend error:", e));
            }
        } catch (e) {
            console.error("Erreur logout:", e);
        } finally {
            await logout();
        }
    };

    if (isInitialLoading && !user) {
        return (
            <View style={[styles.center, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.accentCool} size="large" />
            </View>
        );
    }

    const hasPendingNotifications = pendingNotifications.length > 0;
    const activeHousehold = households.find((household) => household.id === activeHouseholdId) ?? null;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <View style={styles.headerTopRow}>
                        <View style={styles.headerTextWrap}>
                            <Text style={[styles.title, { color: theme.text }]}>
                                Bonjour{user?.name ? `, ${user.name}` : ""}
                            </Text>
                            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                                {activeHousehold ? '' : "Bienvenue dans ton espace familial."}
                            </Text>
                        </View>

                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                onPress={() => setNotificationsOpen((value) => !value)}
                                style={[
                                    styles.notificationBellButton,
                                    {
                                        borderColor: hasPendingNotifications ? theme.accentWarm : theme.icon,
                                        backgroundColor: hasPendingNotifications ? `${theme.accentWarm}18` : theme.card,
                                    },
                                ]}
                                accessibilityLabel="Ouvrir les notifications"
                            >
                                <MaterialCommunityIcons
                                    name={hasPendingNotifications ? "bell-ring-outline" : "bell-outline"}
                                    size={20}
                                    color={hasPendingNotifications ? theme.accentWarm : theme.tint}
                                />
                                {hasPendingNotifications ? (
                                    <View style={[styles.notificationBellBadge, { backgroundColor: theme.accentWarm }]}> 
                                        <Text style={styles.notificationBellBadgeText}>
                                            {pendingNotifications.length > 9 ? "9+" : pendingNotifications.length}
                                        </Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => router.push("/settings")}
                                style={[styles.userSettingsButton, { borderColor: theme.icon }]}
                                accessibilityLabel="Ouvrir les paramètres utilisateur"
                            >
                                <MaterialCommunityIcons name="account-cog-outline" size={20} color={theme.tint} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {notificationsOpen ? (
                    <View style={[styles.notificationCard, { backgroundColor: theme.card, borderColor: `${theme.tint}44` }]}> 
                        <View style={styles.notificationHeaderRow}>
                            <Text style={[styles.notificationTitle, { color: theme.text }]}>Notifications en attente</Text>
                            {readableNotifications.length > 1 ? (
                                <TouchableOpacity
                                    style={[styles.markAllReadButton, { borderColor: theme.icon }]}
                                    onPress={() => {
                                        void onMarkAllNotificationsRead();
                                    }}
                                    disabled={processingBulkRead || processingNotificationId !== null}
                                >
                                    {processingBulkRead ? (
                                        <ActivityIndicator size="small" color={theme.tint} />
                                    ) : (
                                        <Text style={[styles.markAllReadButtonText, { color: theme.tint }]}> 
                                            Tout marquer comme lu
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {pendingNotifications.length === 0 ? (
                            <Text style={[styles.emptyNotificationsText, { color: theme.textSecondary }]}>
                                {"Aucune notification pour l'instant."}
                            </Text>
                        ) : (
                            pendingNotifications.map((notification) => {
                                const isProcessing = processingNotificationId === notification.id;
                                const type = notification.type;
                                const data = notification.data;
                                const createdLabel = formatNotificationDate(notification.createdAt);
                                const inviterName = String(data.inviter_name ?? data.initiator_name ?? "").trim() || "Un parent";
                                const householdName = String(data.household_name ?? "").trim() || "ce foyer";
                                const invitedRole = String(data.invited_role ?? "") === "parent" ? "parent" : "enfant";
                                const requesterName = String(data.requester_name ?? data.requester_household_name ?? "").trim() || "Un foyer";
                                const taskName = String(data.task_name ?? "").trim() || "cette tâche";
                                const dueDate = formatDueDate(data.due_date);
                                const justification = resolveNotificationJustification(data);
                                const scheduledForLabel = formatNotificationDate(
                                    typeof data.scheduled_for === "string" ? data.scheduled_for : null
                                );
                                const canOpenNotification = getNotificationNavigationTarget(notification) !== null;

                                return (
                                    <TouchableOpacity
                                        key={`notif-${notification.id}`}
                                        style={[styles.notificationItem, { backgroundColor: `${theme.tint}12`, borderColor: `${theme.tint}2e` }]}
                                        activeOpacity={canOpenNotification ? 0.86 : 1}
                                        disabled={!canOpenNotification}
                                        onPress={() => {
                                            onOpenNotification(notification);
                                        }}
                                    >
                                        {type === "household_invite" ? (
                                            <>
                                                <Text style={[styles.notificationText, { color: theme.text }]}>
                                                    Invitation à rejoindre <Text style={styles.notificationStrong}>{householdName}</Text> de la part de{" "}
                                                    <Text style={styles.notificationStrong}>{inviterName}</Text>.
                                                </Text>
                                                <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}> 
                                                    Rôle proposé: {invitedRole === "parent" ? "Parent" : "Enfant"}
                                                </Text>
                                                {createdLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                                ) : null}
                                                <View style={styles.notificationActions}>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "refuse");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        <Text style={[styles.notificationActionText, { color: theme.text }]}>
                                                            {isProcessing ? "..." : "Refuser"}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "accept");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        {isProcessing ? (
                                                            <ActivityIndicator size="small" color={theme.tint} />
                                                        ) : (
                                                            <Text style={[styles.notificationActionText, { color: theme.tint }]}>Accepter</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        ) : type === "household_link_request" ? (
                                            <>
                                                <Text style={[styles.notificationText, { color: theme.text }]}>
                                                    Le foyer <Text style={styles.notificationStrong}>{requesterName}</Text> souhaite se connecter à{" "}
                                                    <Text style={styles.notificationStrong}>{householdName}</Text>.
                                                </Text>
                                                {createdLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                                ) : null}
                                                <View style={styles.notificationActions}>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "refuse");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        <Text style={[styles.notificationActionText, { color: theme.text }]}>
                                                            {isProcessing ? "..." : "Refuser"}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "accept");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        {isProcessing ? (
                                                            <ActivityIndicator size="small" color={theme.tint} />
                                                        ) : (
                                                            <Text style={[styles.notificationActionText, { color: theme.tint }]}>Accepter</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        ) : type === "task_reassignment_invite" ? (
                                            <>
                                        <Text style={[styles.notificationText, { color: theme.text }]}> 
                                            <Text style={styles.notificationStrong}>{requesterName}</Text> vous demande de reprendre{" "}
                                            <Text style={styles.notificationStrong}>{taskName}</Text>.
                                        </Text>
                                        <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>
                                            Foyer: {householdName}
                                        </Text>
                                        {dueDate ? (
                                            <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Échéance: {dueDate}</Text>
                                        ) : null}
                                                {createdLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                                ) : null}
                                                <View style={styles.notificationActions}>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "refuse");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        <Text style={[styles.notificationActionText, { color: theme.text }]}>
                                                            {isProcessing ? "..." : "Refuser"}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "accept");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        {isProcessing ? (
                                                            <ActivityIndicator size="small" color={theme.tint} />
                                                        ) : (
                                                            <Text style={[styles.notificationActionText, { color: theme.tint }]}>Accepter</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        ) : type === "household_deletion_approval_request" ? (
                                            <>
                                                <Text style={[styles.notificationText, { color: theme.text }]}>
                                                    <Text style={styles.notificationStrong}>{inviterName}</Text> demande la suppression du foyer{" "}
                                                    <Text style={styles.notificationStrong}>{householdName}</Text>.
                                                </Text>
                                                {createdLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                                ) : null}
                                                <View style={styles.notificationActions}>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "refuse");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        <Text style={[styles.notificationActionText, { color: theme.text }]}>
                                                            {isProcessing ? "..." : "Refuser"}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "accept");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        {isProcessing ? (
                                                            <ActivityIndicator size="small" color={theme.tint} />
                                                        ) : (
                                                            <Text style={[styles.notificationActionText, { color: theme.tint }]}>Accepter</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        ) : type === "household_deletion_cancel_window" ? (
                                            <>
                                                <Text style={[styles.notificationText, { color: theme.text }]}>
                                                    Le foyer <Text style={styles.notificationStrong}>{householdName}</Text> sera supprimé dans 24h.
                                                </Text>
                                                {scheduledForLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>
                                                        Suppression prévue le {scheduledForLabel}
                                                    </Text>
                                                ) : null}
                                                {createdLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                                ) : null}
                                                <View style={styles.notificationActions}>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.accentWarm, backgroundColor: `${theme.accentWarm}18` }]}
                                                        onPress={() => {
                                                            void onRespondToNotification(notification, "cancel");
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        {isProcessing ? (
                                                            <ActivityIndicator size="small" color={theme.accentWarm} />
                                                        ) : (
                                                            <Text style={[styles.notificationActionText, { color: theme.accentWarm }]}>
                                                                Annuler la suppression
                                                            </Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        ) : type === "household_deletion_request_refused" ? (
                                            <>
                                                <Text style={[styles.notificationText, { color: theme.text }]}>
                                                    {notification.body}
                                                </Text>
                                                {createdLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                                ) : null}
                                                <View style={styles.notificationActions}>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                                        onPress={() => {
                                                            void onMarkNotificationRead(notification);
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        <Text style={[styles.notificationActionText, { color: theme.text }]}>
                                                            {isProcessing ? "..." : "Marquer comme lu"}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                        onPress={() => {
                                                            void onLeaveHouseholdFromNotification(notification);
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        {isProcessing ? (
                                                            <ActivityIndicator size="small" color={theme.tint} />
                                                        ) : (
                                                            <Text style={[styles.notificationActionText, { color: theme.tint }]}>Quitter le foyer</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        ) : (
                                            <>
                                                <Text style={[styles.notificationText, { color: theme.text }]}>
                                                    <Text style={styles.notificationStrong}>{notification.title}</Text>
                                                </Text>
                                                <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>{notification.body}</Text>
                                                {justification ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>
                                                        Justification: {justification}
                                                    </Text>
                                                ) : null}
                                                {createdLabel ? (
                                                    <Text style={[styles.notificationMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                                ) : null}
                                                <View style={styles.notificationActions}>
                                                    <TouchableOpacity
                                                        style={[styles.notificationActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                        onPress={() => {
                                                            void onMarkNotificationRead(notification);
                                                        }}
                                                        disabled={isProcessing || processingBulkRead}
                                                    >
                                                        {isProcessing ? (
                                                            <ActivityIndicator size="small" color={theme.tint} />
                                                        ) : (
                                                            <Text style={[styles.notificationActionText, { color: theme.tint }]}>Marquer comme lu</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>
                ) : null}

                {households.length > 0 ? (
                    <View style={styles.householdList}>
                        {households.map((household) => {
                            const isActive = household.id === activeHouseholdId;
                            const isParent = household.role === "parent";
                            const isSwitching = switchingHouseholdId === household.id;

                            return (
                                <View
                                    key={`household-${household.id}`}
                                    style={[styles.householdCard, { backgroundColor: theme.card, borderColor: `${theme.icon}33` }]}
                                >
                                    <View style={[styles.accentStrip, { backgroundColor: isActive ? theme.tint : theme.accentCool }]} />
                                    <View style={styles.cardContent}>
                                        <View style={styles.cardHeaderRow}>
                                            <Text style={[styles.cardTitle, { color: theme.text }]}>{household.name}</Text>
                                            <View style={styles.cardActionRow}>
                                                <View style={[styles.rolePill, { backgroundColor: isParent ? `${theme.tint}18` : `${theme.icon}18` }]}> 
                                                    <Text style={[styles.rolePillText, { color: theme.textSecondary }]}> 
                                                        {isParent ? "Parent" : "Enfant"}
                                                    </Text>
                                                </View>
                                                {isParent ? (
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            void onEditHouseholdConfig(household.id);
                                                        }}
                                                        style={[styles.householdSettingsButton, { borderColor: theme.icon }]}
                                                        disabled={isSwitching}
                                                    >
                                                        <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        </View>

                                        <View style={styles.householdActionsRow}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.primaryButton,
                                                    {
                                                        backgroundColor: isActive ? `${theme.tint}18` : theme.tint,
                                                        borderColor: theme.tint,
                                                        borderWidth: 1,
                                                    },
                                                ]}
                                                onPress={() => {
                                                    if (!isActive) {
                                                        void onSwitchHousehold(household.id);
                                                    }
                                                }}
                                                disabled={isActive || isSwitching}
                                            >
                                                {isSwitching ? (
                                                    <ActivityIndicator size="small" color={isActive ? theme.tint : "#FFFFFF"} />
                                                ) : (
                                                    <Text style={[styles.primaryButtonText, { color: isActive ? theme.tint : "#FFFFFF" }]}> 
                                                        {isActive ? "Foyer actif" : "Activer ce foyer"}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.secondaryButton, { borderColor: theme.icon }]}
                                                onPress={() => {
                                                    void onOpenHouseholdDashboard(household.id);
                                                }}
                                                disabled={isSwitching}
                                            >
                                                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Tableau de bord</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <View style={[styles.householdCard, { backgroundColor: theme.card, borderColor: `${theme.icon}33` }]}> 
                        <View style={[styles.accentStrip, { backgroundColor: theme.accentCool }]} />
                        <View style={styles.cardContent}>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>Créons ton cocon</Text>
                            <Text style={[styles.cardText, { color: theme.textSecondary }]}> 
                                Ajoute les membres de ton foyer, définis les rôles et prépare ton calendrier partagé.
                            </Text>
                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: theme.accentCool }]}
                                onPress={onSetupHouse}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.primaryButtonText}>Configurer mon foyer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View style={styles.logoutWrap}>
                    <TouchableOpacity onPress={onLogout} style={styles.ghostButton}>
                        <Text style={[styles.ghostButtonText, { color: theme.accentWarm }]}>Se déconnecter</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 30,
        gap: 14,
    },
    header: {
        marginBottom: 8,
    },
    headerTopRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
    },
    headerTextWrap: {
        flex: 1,
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        lineHeight: 24,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    notificationBellButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    notificationBellBadge: {
        position: "absolute",
        top: -5,
        right: -5,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 3,
    },
    notificationBellBadgeText: {
        fontSize: 10,
        color: "#FFFFFF",
        fontWeight: "700",
    },
    userSettingsButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    notificationCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        gap: 10,
    },
    notificationHeaderRow: {
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-start",
        gap: 8,
    },
    notificationTitle: {
        fontSize: 15,
        fontWeight: "700",
    },
    markAllReadButton: {
        borderWidth: 1,
        borderRadius: 10,
        minHeight: 36,
        paddingHorizontal: 10,
        paddingVertical: 6,
        alignSelf: "stretch",
        alignItems: "center",
        justifyContent: "center",
    },
    markAllReadButtonText: {
        fontSize: 12,
        fontWeight: "700",
        textAlign: "center",
        lineHeight: 16,
    },
    emptyNotificationsText: {
        fontSize: 13,
    },
    notificationItem: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        gap: 8,
    },
    notificationText: {
        fontSize: 13,
        lineHeight: 18,
    },
    notificationStrong: {
        fontWeight: "700",
    },
    notificationMeta: {
        fontSize: 12,
    },
    notificationActions: {
        flexDirection: "row",
        gap: 8,
    },
    notificationActionBtn: {
        flex: 1,
        minHeight: 36,
        borderWidth: 1,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 8,
    },
    notificationActionText: {
        fontSize: 13,
        fontWeight: "700",
    },
    householdList: {
        gap: 12,
    },
    householdCard: {
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: "row",
        overflow: "hidden",
    },
    accentStrip: {
        width: 8,
        height: "100%",
    },
    cardContent: {
        flex: 1,
        padding: 16,
        gap: 12,
    },
    cardHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
    },
    cardActionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: "700",
        flex: 1,
    },
    cardText: {
        fontSize: 14,
        lineHeight: 20,
    },
    rolePill: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    rolePillText: {
        fontSize: 11,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    householdSettingsButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    householdActionsRow: {
        flexDirection: "row",
        gap: 8,
    },
    primaryButton: {
        flex: 1,
        minHeight: 40,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    primaryButtonText: {
        color: "#FFFFFF",
        fontWeight: "700",
        fontSize: 14,
    },
    secondaryButton: {
        flex: 1,
        minHeight: 40,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    secondaryButtonText: {
        fontSize: 14,
        fontWeight: "700",
    },
    logoutWrap: {
        marginTop: 8,
        alignItems: "center",
    },
    ghostButton: {
        padding: 10,
    },
    ghostButtonText: {
        fontSize: 15,
        fontWeight: "500",
    },
});




