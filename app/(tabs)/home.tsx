import React, { useCallback, useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    useColorScheme,
    Image,
    Alert,
} from "react-native";

import { useRouter, useFocusEffect } from "expo-router";
import { apiFetch } from "@/src/api/client";
import * as SecureStore from "expo-secure-store";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
    clearStoredUser,
    persistStoredUser,
    refreshStoredUserFromStorage,
    useStoredUserState,
} from "@/src/session/user-cache";
import { subscribeToUserRealtime } from "@/src/realtime/client";

type PendingNotification = {
    id: number;
    type: string;
    householdId: number | null;
    title: string;
    body: string;
    data: Record<string, unknown>;
    createdAt: string | null;
};

type NotificationNavigationTarget =
    | string
    | {
        pathname: "/tasks/manage";
        params: { module: "planned" };
    };

const toPositiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const normalized = Math.trunc(parsed);
    return normalized > 0 ? normalized : null;
};

const normalizePendingNotifications = (
    rawNotifications: unknown[],
    activeHouseholdId: number | null
): PendingNotification[] => {
    return rawNotifications
        .map((rawNotification): PendingNotification | null => {
            const notification = (rawNotification ?? {}) as Record<string, unknown>;
            const parsedId = toPositiveInt(notification.id);
            if (!parsedId) {
                return null;
            }

            const type = String(notification.type ?? "").trim();
            const data = (notification.data ?? {}) as Record<string, unknown>;
            const status = String(data.status ?? "pending").trim();
            const householdId =
                toPositiveInt(notification.household_id) ??
                toPositiveInt(data.household_id) ??
                null;

            const isCrossHouseholdInvite = type === "household_invite";
            if (!isCrossHouseholdInvite && activeHouseholdId && householdId && householdId !== activeHouseholdId) {
                return null;
            }

            if ((type === "household_invite" || type === "task_reassignment_invite") && status !== "pending") {
                return null;
            }

            const inviterName = String(data.inviter_name ?? "").trim() || "Un parent";
            const householdName = String(data.household_name ?? "").trim() || "ce foyer";
            const requesterName = String(data.requester_name ?? "").trim() || "Un membre";
            const taskName = String(data.task_name ?? "").trim() || "cette tâche";

            const fallbackBody = type === "household_invite"
                ? `${inviterName} vous invite à rejoindre le foyer ${householdName}.`
                : type === "task_reassignment_invite"
                    ? `${requesterName} vous demande de reprendre ${taskName}.`
                    : "Nouvelle notification.";

            return {
                id: parsedId,
                type,
                householdId,
                title: String(notification.title ?? "FamilyFlow").trim() || "FamilyFlow",
                body: String(notification.body ?? "").trim() || fallbackBody,
                data,
                createdAt: typeof notification.created_at === "string" ? notification.created_at : null,
            };
        })
        .filter((notification): notification is PendingNotification => notification !== null)
        .sort((left, right) => {
            const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
            const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
            return rightDate - leftDate;
        });
};

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
    return parsed.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const TASK_NOTIFICATION_TYPES = new Set([
    "task_assigned",
    "task_done_validation_needed",
    "task_validated",
    "task_cancelled",
    "task_reassigned",
    "task_reassignment_invite",
    "task_reassignment_invite_responded",
]);

const BUDGET_NOTIFICATION_TYPES = new Set([
    "budget_payment_validated",
    "budget_advance_requested",
    "budget_advance_reviewed",
]);

const POLL_NOTIFICATION_TYPES = new Set([
    "poll_opened",
    "poll_reminder",
    "poll_closing_soon",
    "poll_closed_too_late",
    "poll_needs_validation",
    "poll_validated",
    "poll_open_prompt",
]);

const getNotificationNavigationTarget = (
    notification: PendingNotification
): NotificationNavigationTarget | null => {
    const type = notification.type;

    if (TASK_NOTIFICATION_TYPES.has(type)) {
        return { pathname: "/tasks/manage", params: { module: "planned" } };
    }

    if (BUDGET_NOTIFICATION_TYPES.has(type)) {
        return "/(tabs)/budget";
    }

    if (POLL_NOTIFICATION_TYPES.has(type)) {
        return "/meal/poll";
    }

    if (type === "household_invite" || type === "household_invite_responded") {
        return "/settings";
    }

    return null;
};

export default function ConnectedHome() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const { user } = useStoredUserState();

    const [loading, setLoading] = useState(true);
    const [pendingNotifications, setPendingNotifications] = useState<PendingNotification[]>([]);
    const [processingNotificationId, setProcessingNotificationId] = useState<number | null>(null);
    const firstHouseholdId = toPositiveInt(user?.households?.[0]?.id);

    const activeHouseholdId = useMemo((): number | null => {
        const householdId = toPositiveInt(user?.household_id);
        if (householdId) return householdId;

        return firstHouseholdId;
    }, [firstHouseholdId, user?.household_id]);

    const refreshPendingNotifications = useCallback(async () => {
        try {
            const token = await SecureStore.getItemAsync("authToken");
            if (!token) {
                setPendingNotifications([]);
                return;
            }

            const response = await apiFetch("/notifications/pending");
            const rawNotifications: unknown[] = Array.isArray(response?.notifications) ? response.notifications : [];
            setPendingNotifications(normalizePendingNotifications(rawNotifications, activeHouseholdId));
        } catch (error) {
            console.error("Erreur chargement notifications en attente:", error);
        }
    }, [activeHouseholdId]);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;
            let notificationsTimer: ReturnType<typeof setInterval> | null = null;
            let unsubscribeRealtime: (() => void) | null = null;

            const fetchUserData = async () => {
                setLoading(true);
                try {
                    const token = await SecureStore.getItemAsync("authToken");

                    if (!token) {
                        if (isActive) {
                            await refreshStoredUserFromStorage();
                            setPendingNotifications([]);
                        }
                        return;
                    }

                    try {
                        const data = await apiFetch("/me");
                        if (isActive && data?.user) {
                            const userToSave = {
                                ...data.user,
                                household_id: user?.household_id
                                    ?? (Array.isArray(data.user.households) && data.user.households.length > 0
                                        ? data.user.households[0].id
                                        : null),
                            };
                            await persistStoredUser(userToSave);
                        } else if (isActive) {
                            await refreshStoredUserFromStorage();
                        }
                    } catch (error) {
                        console.error("Erreur chargement user (/me):", error);
                        if (isActive) {
                            await refreshStoredUserFromStorage();
                        }
                    }

                    if (isActive) {
                        await refreshPendingNotifications();
                    }
                } catch (e) {
                    console.error("Erreur chargement user:", e);
                } finally {
                    if (isActive) {
                        setLoading(false);
                    }
                }
            };

            void fetchUserData();

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
                    void refreshPendingNotifications();
                });

                if (!isActive) {
                    unsubscribe();
                    return;
                }

                unsubscribeRealtime = unsubscribe;
            };
            void subscribeRealtime();

            notificationsTimer = setInterval(() => {
                if (!isActive) {
                    return;
                }
                void refreshPendingNotifications();
            }, 60000);

            return () => {
                isActive = false;
                if (notificationsTimer) {
                    clearInterval(notificationsTimer);
                }
                if (unsubscribeRealtime) {
                    unsubscribeRealtime();
                }
            };
        }, [refreshPendingNotifications, user?.household_id, user?.id])
    );

    const onSetupHouse = () => {
        router.push("/householdSetup");
    };

    const onEditHouseholdConfig = () => {
        router.push("/householdSetup?mode=edit");
    };

    const onRespondToNotification = async (
        notification: PendingNotification,
        action: "accept" | "refuse"
    ) => {
        setProcessingNotificationId(notification.id);
        try {
            let response: any = null;
            if (notification.type === "household_invite") {
                response = await apiFetch(`/notifications/${notification.id}/household-invite-response`, {
                    method: "POST",
                    body: JSON.stringify({ action }),
                });
            } else if (notification.type === "task_reassignment_invite") {
                response = await apiFetch(`/notifications/${notification.id}/task-reassignment-response`, {
                    method: "POST",
                    body: JSON.stringify({ action }),
                });
            } else {
                await apiFetch(`/notifications/${notification.id}/read`, { method: "POST" });
            }

            if (notification.type === "household_invite" && action === "accept" && response?.user) {
                await persistStoredUser(response.user);
            }

            await refreshPendingNotifications();
        } catch (error: any) {
            Alert.alert("Notification", error?.message || "Impossible de traiter cette notification.");
        } finally {
            setProcessingNotificationId(null);
        }
    };

    const onMarkNotificationRead = async (notification: PendingNotification) => {
        setProcessingNotificationId(notification.id);
        try {
            await apiFetch(`/notifications/${notification.id}/read`, { method: "POST" });
            await refreshPendingNotifications();
        } catch (error: any) {
            Alert.alert("Notification", error?.message || "Impossible de marquer la notification comme lue.");
        } finally {
            setProcessingNotificationId(null);
        }
    };

    const onOpenNotification = useCallback(
        (notification: PendingNotification) => {
            const target = getNotificationNavigationTarget(notification);
            if (!target) return;
            router.push(target);
        },
        [router]
    );

    const onLogout = async () => {
        try {
            const token = await SecureStore.getItemAsync("authToken");
            if (token) {
                apiFetch("/logout", {
                    method: "POST",
                }).catch((e) => console.log("Logout backend error:", e));
            }
        } catch (e) {
            console.error("Erreur logout:", e);
        } finally {
            await SecureStore.deleteItemAsync("authToken");
            await clearStoredUser();
            router.replace("/");
        }
    };

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.accentCool} size="large" />
            </View>
        );
    }

    const activeHouseholds = Array.isArray(user?.households) ? user.households : [];
    const activeHousehold = activeHouseholds.find((household) => household.id === user?.household_id)
        ?? activeHouseholds[0]
        ?? null;
    const activeHouseholdRole = activeHousehold?.pivot?.role ?? activeHousehold?.role ?? user?.role ?? "enfant";
    const canManageHouseholdConfig = activeHouseholdRole === "parent";

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTextWrap}>
                        <Text style={[styles.title, { color: theme.text }]}>
                            Bonjour{user?.name ? `, ${user.name}` : ""}
                        </Text>
                        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                            {activeHousehold
                                ? `Heureux de te retrouver dans ${activeHousehold.name}.`
                                : "Bienvenue dans ton espace familial."}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push("/settings")}
                        style={[styles.userSettingsButton, { borderColor: theme.icon }]}
                        accessibilityLabel="Ouvrir les paramètres utilisateur"
                    >
                        <MaterialCommunityIcons name="account-cog-outline" size={20} color={theme.tint} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <View style={[styles.accentStrip, { backgroundColor: activeHousehold ? theme.tint : theme.accentCool }]} />

                <View style={styles.cardContent}>
                    {activeHousehold ? (
                        <>
                            <View style={styles.cardHeaderRow}>
                                <Text style={[styles.cardTitle, { color: theme.text }]}>
                                    {activeHousehold.name}
                                </Text>
                                <View style={styles.cardActionRow}>
                                    {canManageHouseholdConfig ? (
                                        <TouchableOpacity
                                            onPress={onEditHouseholdConfig}
                                            style={[styles.householdSettingsButton, { borderColor: theme.icon }]}
                                        >
                                            <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
                                        </TouchableOpacity>
                                    ) : null}
                                    <Image
                                        source={require("../../assets/images/logo.png")}
                                        style={styles.householdLogo}
                                        resizeMode="contain"
                                    />
                                </View>
                            </View>

                            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                                Ton espace est configuré. Accède au planning, aux repas, au budget et au calendrier.
                            </Text>

                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: theme.tint }]}
                                onPress={() => {
                                    router.push("/dashboard");
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.primaryButtonText}>Voir mon tableau de bord</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
                </View>
            </View>

            {pendingNotifications.length > 0 && (
                <View style={[styles.inviteCard, { backgroundColor: theme.card, borderColor: `${theme.tint}44` }]}>
                    <Text style={[styles.inviteTitle, { color: theme.text }]}>Notifications en attente</Text>

                    {pendingNotifications.map((notification) => {
                        const isProcessing = processingNotificationId === notification.id;
                        const type = notification.type;
                        const data = notification.data;
                        const createdLabel = formatNotificationDate(notification.createdAt);

                        const inviterName = String(data.inviter_name ?? "").trim() || "Un parent";
                        const householdName = String(data.household_name ?? "").trim() || "ce foyer";
                        const invitedRole = String(data.invited_role ?? "") === "parent" ? "parent" : "enfant";
                        const requesterName = String(data.requester_name ?? "").trim() || "Un membre";
                        const taskName = String(data.task_name ?? "").trim() || "cette tâche";
                        const dueDate = formatDueDate(data.due_date);

                        const canOpenNotification = getNotificationNavigationTarget(notification) !== null;

                        return (
                            <TouchableOpacity
                                key={`notif-${notification.id}`}
                                style={[styles.inviteItem, { backgroundColor: `${theme.tint}12`, borderColor: `${theme.tint}2e` }]}
                                activeOpacity={canOpenNotification ? 0.86 : 1}
                                disabled={!canOpenNotification}
                                onPress={() => {
                                    onOpenNotification(notification);
                                }}
                            >
                                {type === "household_invite" ? (
                                    <>
                                        <Text style={[styles.inviteText, { color: theme.text }]}>
                                            Invitation à rejoindre <Text style={styles.inviteStrong}>{householdName}</Text> de la part de{" "}
                                            <Text style={styles.inviteStrong}>{inviterName}</Text>.
                                        </Text>
                                        <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>
                                            Rôle proposé: {invitedRole === "parent" ? "Parent" : "Enfant"}
                                        </Text>
                                        {createdLabel ? (
                                            <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                        ) : null}
                                        <View style={styles.inviteActions}>
                                            <TouchableOpacity
                                                style={[styles.inviteActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                                onPress={() => {
                                                    void onRespondToNotification(notification, "refuse");
                                                }}
                                                disabled={isProcessing}
                                            >
                                                <Text style={[styles.inviteActionText, { color: theme.text }]}>
                                                    {isProcessing ? "..." : "Refuser"}
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.inviteActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                onPress={() => {
                                                    void onRespondToNotification(notification, "accept");
                                                }}
                                                disabled={isProcessing}
                                            >
                                                {isProcessing ? (
                                                    <ActivityIndicator size="small" color={theme.tint} />
                                                ) : (
                                                    <Text style={[styles.inviteActionText, { color: theme.tint }]}>Accepter</Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                ) : type === "task_reassignment_invite" ? (
                                    <>
                                        <Text style={[styles.inviteText, { color: theme.text }]}>
                                            <Text style={styles.inviteStrong}>{requesterName}</Text> vous demande de reprendre{" "}
                                            <Text style={styles.inviteStrong}>{taskName}</Text>.
                                        </Text>
                                        {dueDate ? (
                                            <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>Échéance: {dueDate}</Text>
                                        ) : null}
                                        {createdLabel ? (
                                            <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                        ) : null}
                                        <View style={styles.inviteActions}>
                                            <TouchableOpacity
                                                style={[styles.inviteActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                                onPress={() => {
                                                    void onRespondToNotification(notification, "refuse");
                                                }}
                                                disabled={isProcessing}
                                            >
                                                <Text style={[styles.inviteActionText, { color: theme.text }]}>
                                                    {isProcessing ? "..." : "Refuser"}
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.inviteActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                onPress={() => {
                                                    void onRespondToNotification(notification, "accept");
                                                }}
                                                disabled={isProcessing}
                                            >
                                                {isProcessing ? (
                                                    <ActivityIndicator size="small" color={theme.tint} />
                                                ) : (
                                                    <Text style={[styles.inviteActionText, { color: theme.tint }]}>Accepter</Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <Text style={[styles.inviteText, { color: theme.text }]}>
                                            <Text style={styles.inviteStrong}>{notification.title}</Text>
                                        </Text>
                                        <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>{notification.body}</Text>
                                        {createdLabel ? (
                                            <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>Reçue le {createdLabel}</Text>
                                        ) : null}
                                        <View style={styles.inviteActions}>
                                            <TouchableOpacity
                                                style={[styles.inviteActionBtn, { borderColor: theme.tint, backgroundColor: `${theme.tint}18` }]}
                                                onPress={() => {
                                                    void onMarkNotificationRead(notification);
                                                }}
                                                disabled={isProcessing}
                                            >
                                                {isProcessing ? (
                                                    <ActivityIndicator size="small" color={theme.tint} />
                                                ) : (
                                                    <Text style={[styles.inviteActionText, { color: theme.tint }]}>Marquer comme lu</Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            <View style={styles.logoutWrap}>
                <TouchableOpacity onPress={onLogout} style={styles.ghostButton}>
                    <Text style={[styles.ghostButtonText, { color: theme.accentWarm }]}>Se déconnecter</Text>
                </TouchableOpacity>
            </View>
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
        padding: 24,
        paddingTop: 60,
    },
    header: {
        marginBottom: 30,
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
    userSettingsButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
    },
    card: {
        borderRadius: 20,
        flexDirection: "row",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
        marginBottom: 16,
    },
    accentStrip: {
        width: 8,
        height: "100%",
    },
    cardContent: {
        flex: 1,
        padding: 20,
    },
    cardHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    cardActionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    householdSettingsButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    householdLogo: {
        width: 24,
        height: 24,
        borderRadius: 6,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 8,
    },
    cardText: {
        fontSize: 14,
        marginBottom: 20,
        lineHeight: 20,
    },
    primaryButton: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryButtonText: {
        color: "#FFFFFF",
        fontWeight: "600",
        fontSize: 16,
    },
    inviteCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        gap: 10,
    },
    inviteTitle: {
        fontSize: 15,
        fontWeight: "700",
    },
    inviteItem: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        gap: 8,
    },
    inviteText: {
        fontSize: 13,
        lineHeight: 18,
    },
    inviteStrong: {
        fontWeight: "700",
    },
    inviteMeta: {
        fontSize: 12,
    },
    inviteActions: {
        flexDirection: "row",
        gap: 8,
    },
    inviteActionBtn: {
        flex: 1,
        minHeight: 36,
        borderWidth: 1,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 8,
    },
    inviteActionText: {
        fontSize: 13,
        fontWeight: "700",
    },
    logoutWrap: {
        marginTop: 24,
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
