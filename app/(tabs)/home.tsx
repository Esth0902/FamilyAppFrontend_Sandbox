import React, { useState, useCallback } from "react";
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

type PendingHouseholdInvite = {
    id: number;
    householdName: string;
    inviterName: string;
    invitedRole: "parent" | "enfant";
};

type PendingTaskReassignmentInvite = {
    id: number;
    taskName: string;
    requesterName: string;
    dueDate: string | null;
};

const normalizePendingInvites = (
    rawNotifications: unknown[],
): {
    householdInvites: PendingHouseholdInvite[];
    taskInvites: PendingTaskReassignmentInvite[];
} => {
    const householdInvites: PendingHouseholdInvite[] = [];
    const taskInvites: PendingTaskReassignmentInvite[] = [];

    rawNotifications.forEach((rawNotification) => {
            const notification = (rawNotification ?? {}) as Record<string, unknown>;
            const parsedId = Number(notification.id ?? 0);
            if (!Number.isFinite(parsedId) || parsedId <= 0) {
                return;
            }

            const type = String(notification.type ?? "");
            const data = (notification.data ?? {}) as Record<string, unknown>;
            const status = String(data.status ?? "pending");
            if (status !== "pending") {
                return;
            }

            if (type === "household_invite") {
                householdInvites.push({
                    id: Math.trunc(parsedId),
                    householdName: String(data.household_name ?? "").trim() || "ce foyer",
                    inviterName: String(data.inviter_name ?? "").trim() || "Un parent",
                    invitedRole: String(data.invited_role ?? "") === "parent" ? "parent" : "enfant",
                });
                return;
            }

            if (type === "task_reassignment_invite") {
                taskInvites.push({
                    id: Math.trunc(parsedId),
                    taskName: String(data.task_name ?? "").trim() || "une tâche",
                    requesterName: String(data.requester_name ?? "").trim() || "Un membre",
                    dueDate: typeof data.due_date === "string" && data.due_date.trim().length > 0
                        ? data.due_date.trim()
                        : null,
                });
            }
        });

    return {
        householdInvites,
        taskInvites,
    };
};

export default function ConnectedHome() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const { user } = useStoredUserState();

    const [loading, setLoading] = useState(true);
    const [pendingInvitations, setPendingInvitations] = useState<PendingHouseholdInvite[]>([]);
    const [pendingTaskInvitations, setPendingTaskInvitations] = useState<PendingTaskReassignmentInvite[]>([]);
    const [processingInvitationId, setProcessingInvitationId] = useState<number | null>(null);
    const [processingTaskInvitationId, setProcessingTaskInvitationId] = useState<number | null>(null);

    const refreshPendingInvitations = useCallback(async () => {
        try {
            const token = await SecureStore.getItemAsync("authToken");
            if (!token) {
                setPendingInvitations([]);
                setPendingTaskInvitations([]);
                return;
            }

            const response = await apiFetch("/notifications/pending");
            const rawNotifications: unknown[] = Array.isArray(response?.notifications) ? response.notifications : [];
            const normalized = normalizePendingInvites(rawNotifications);
            setPendingInvitations(normalized.householdInvites);
            setPendingTaskInvitations(normalized.taskInvites);
        } catch (error) {
            console.error("Erreur chargement invitations en attente:", error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;
            let invitationsTimer: ReturnType<typeof setInterval> | null = null;
            let unsubscribeRealtime: (() => void) | null = null;

            const fetchUserData = async () => {
                setLoading(true);
                try {
                    const token = await SecureStore.getItemAsync("authToken");

                    if (!token) {
                        if (isActive) {
                            await refreshStoredUserFromStorage();
                            setPendingInvitations([]);
                            setPendingTaskInvitations([]);
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
                        await refreshPendingInvitations();
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

                unsubscribeRealtime = await subscribeToUserRealtime(parsedUserId, (message) => {
                    const module = String(message?.module ?? "");
                    const type = String(message?.type ?? "");
                    if (
                        module === "notifications"
                        && (type === "household_invite_created" || type === "task_reassignment_invite_created")
                    ) {
                        void refreshPendingInvitations();
                    }
                });
            };
            void subscribeRealtime();

            invitationsTimer = setInterval(() => {
                if (!isActive) {
                    return;
                }
                void refreshPendingInvitations();
            }, 60000);

            return () => {
                isActive = false;
                if (invitationsTimer) {
                    clearInterval(invitationsTimer);
                }
                if (unsubscribeRealtime) {
                    unsubscribeRealtime();
                }
            };
        }, [refreshPendingInvitations, user?.household_id, user?.id])
    );

    const onSetupHouse = () => {
        router.push("/householdSetup");
    };

    const onEditHouseholdConfig = () => {
        router.push("/householdSetup?mode=edit");
    };

    const onRespondToInvitation = async (invite: PendingHouseholdInvite, action: "accept" | "refuse") => {
        setProcessingInvitationId(invite.id);
        try {
            const response = await apiFetch(`/notifications/${invite.id}/household-invite-response`, {
                method: "POST",
                body: JSON.stringify({ action }),
            });

            if (action === "accept" && response?.user) {
                await persistStoredUser(response.user);
            }

            await refreshPendingInvitations();
        } catch (error: any) {
            Alert.alert("Invitation", error?.message || "Impossible de traiter cette invitation.");
        } finally {
            setProcessingInvitationId(null);
        }
    };

    const onRespondToTaskInvitation = async (
        invite: PendingTaskReassignmentInvite,
        action: "accept" | "refuse",
    ) => {
        setProcessingTaskInvitationId(invite.id);
        try {
            await apiFetch(`/notifications/${invite.id}/task-reassignment-response`, {
                method: "POST",
                body: JSON.stringify({ action }),
            });
            await refreshPendingInvitations();
        } catch (error: any) {
            Alert.alert("Tâches", error?.message || "Impossible de traiter cette demande.");
        } finally {
            setProcessingTaskInvitationId(null);
        }
    };

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

            {pendingInvitations.length > 0 && (
                <View style={[styles.inviteCard, { backgroundColor: theme.card, borderColor: `${theme.tint}44` }]}>
                    <Text style={[styles.inviteTitle, { color: theme.text }]}>Nouvelle invitation reçue</Text>

                    {pendingInvitations.map((invite) => {
                        const isProcessing = processingInvitationId === invite.id;

                        return (
                            <View
                                key={`invite-${invite.id}`}
                                style={[styles.inviteItem, { backgroundColor: `${theme.tint}12`, borderColor: `${theme.tint}2e` }]}
                            >
                                <Text style={[styles.inviteText, { color: theme.text }]}>
                                    Invitation à rejoindre <Text style={styles.inviteStrong}>{invite.householdName}</Text> de la part de{" "}
                                    <Text style={styles.inviteStrong}>{invite.inviterName}</Text>.
                                </Text>
                                <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>
                                    Rôle proposé: {invite.invitedRole === "parent" ? "Parent" : "Enfant"}
                                </Text>

                                <View style={styles.inviteActions}>
                                    <TouchableOpacity
                                        style={[styles.inviteActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                        onPress={() => {
                                            void onRespondToInvitation(invite, "refuse");
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
                                            void onRespondToInvitation(invite, "accept");
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
                            </View>
                        );
                    })}
                </View>
            )}

            {pendingTaskInvitations.length > 0 && (
                <View style={[styles.inviteCard, { backgroundColor: theme.card, borderColor: `${theme.accentCool}55` }]}>
                    <Text style={[styles.inviteTitle, { color: theme.text }]}>Demandes de reprise de tâche</Text>

                    {pendingTaskInvitations.map((invite) => {
                        const isProcessing = processingTaskInvitationId === invite.id;

                        return (
                            <View
                                key={`task-invite-${invite.id}`}
                                style={[styles.inviteItem, { backgroundColor: `${theme.accentCool}12`, borderColor: `${theme.accentCool}2e` }]}
                            >
                                <Text style={[styles.inviteText, { color: theme.text }]}>
                                    <Text style={styles.inviteStrong}>{invite.requesterName}</Text> vous propose de reprendre{" "}
                                    <Text style={styles.inviteStrong}>{invite.taskName}</Text>.
                                </Text>
                                {invite.dueDate ? (
                                    <Text style={[styles.inviteMeta, { color: theme.textSecondary }]}>Prévue le {invite.dueDate}</Text>
                                ) : null}

                                <View style={styles.inviteActions}>
                                    <TouchableOpacity
                                        style={[styles.inviteActionBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                                        onPress={() => {
                                            void onRespondToTaskInvitation(invite, "refuse");
                                        }}
                                        disabled={isProcessing}
                                    >
                                        <Text style={[styles.inviteActionText, { color: theme.text }]}>
                                            {isProcessing ? "..." : "Refuser"}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.inviteActionBtn, { borderColor: theme.accentCool, backgroundColor: `${theme.accentCool}18` }]}
                                        onPress={() => {
                                            void onRespondToTaskInvitation(invite, "accept");
                                        }}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? (
                                            <ActivityIndicator size="small" color={theme.accentCool} />
                                        ) : (
                                            <Text style={[styles.inviteActionText, { color: theme.accentCool }]}>Accepter</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
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
