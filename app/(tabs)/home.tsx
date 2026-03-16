import React, { useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    useColorScheme,
    Image,
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

export default function ConnectedHome() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const { user } = useStoredUserState();

    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const fetchUserData = async () => {
                setLoading(true);
                try {
                    const token = await SecureStore.getItemAsync("authToken");

                    if (!token) {
                        await refreshStoredUserFromStorage();
                        return;
                    }

                    try {
                        const data = await apiFetch("/me");
                        if (data?.user) {
                            const userToSave = {
                                ...data.user,
                                household_id: user?.household_id
                                    ?? (Array.isArray(data.user.households) && data.user.households.length > 0
                                        ? data.user.households[0].id
                                        : null),
                            };
                            await persistStoredUser(userToSave);
                            return;
                        }
                    } catch (error) {
                        console.error("Erreur chargement user (/me):", error);
                    }

                    await refreshStoredUserFromStorage();
                } catch (e) {
                    console.error("Erreur chargement user:", e);
                } finally {
                    setLoading(false);
                }
            };

            void fetchUserData();
        }, [user?.household_id])
    );

    const onSetupHouse = () => {
        router.push("/householdSetup");
    };

    const onEditHouseholdConfig = () => {
        router.push("/householdSetup?mode=edit");
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
                                Ton espace est configuré. Accède au planning, aux repas et au budget.
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
        marginBottom: 20,
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
    logoutWrap: {
        marginTop: 32,
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
